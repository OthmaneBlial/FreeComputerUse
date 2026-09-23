import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,mkdir,writeFile,symlink} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {TraceStore,type Trace} from '../src/history/TraceStore.js';
import {ActionSchema} from '../src/actions/schema.js';

test('results present facts and tables, preserve partial status, export a safe report and restrict saved downloads',{timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-results-')),old=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const downloads=join(dir,'downloads');await mkdir(downloads);
  const file=join(downloads,'itinerary.txt'),outside=join(dir,'private.txt');await writeFile(file,'Paris → Lyon\nEUR 90');await writeFile(outside,'Private content');await symlink(outside,join(downloads,'escape.txt'));
  const summary='Northstar\nWorkspace navigation\nYour shortlisted itinerary\nRoute\nParis → Lyon\nDate\n2026-10-15\nPassengers\n2 adults\nService\nFlex Regional\nTotal price\nEUR 90\nDuration\n175 minutes\nAccess\nStep-free\nFare\nRefundable';
  const trace:Trace={version:1,id:'results-test',goal:'Find an accessible itinerary',url:'https://example.test',status:'failed',error:'The requested download was not created',startedAt:Date.now(),durationMs:0,plans:[],completion:[],calls:[],metrics:{},actions:[]};
  const add=(action:unknown,data:unknown)=>trace.actions.push({action:ActionSchema.parse(action),startedAt:Date.now(),durationMs:0,success:true,data});
  add({type:'extract',format:'text',key:'itinerarySummary'},{itinerarySummary:summary});add({type:'extract',format:'text',key:'duplicate'},{duplicate:summary});
  add({type:'extract',format:'table',key:'comparison'},{comparison:[['Service','Price'],['Flex Regional','EUR 90']]});
  add({type:'extract',format:'links',key:'sources'},{sources:[{text:'<img src=x onerror=alert(1)>',url:'javascript:alert(1)'},{text:'Public source',url:'https://example.test/evidence'}]});
  add({type:'download',target:{css:'a'},filename:'itinerary.txt'},{filename:'itinerary.txt',path:file});
  const store=new TraceStore(join(dir,'history.sqlite'));store.save(trace);store.close();
  const dashboard=await startServer({port:0,quiet:true}),browser=await new Browser({allowedOrigins:[dashboard.url]}).launch(),errors:string[]=[];browser.page.on('pageerror',error=>errors.push(error.message));
  try{
    await browser.navigate(dashboard.url);await browser.page.getByRole('button',{name:'View result'}).click();
    assert.equal(await browser.page.locator('.result-status').textContent(),'Partial result');
    assert.match(await browser.page.locator('.result-error').innerText(),/download was not created/);
    assert.equal(await browser.page.locator('.result-card').count(),4,'Repeated extraction content is deduplicated');
    assert.equal(await browser.page.locator('.result-facts dd').first().innerText(),'Paris → Lyon');
    assert.equal(await browser.page.locator('.result-table tbody tr').count(),1);
    assert.equal(await browser.page.locator('#result-output pre').count(),0);assert.equal(await browser.page.locator('#result-output img').count(),0);
    assert.equal(await browser.page.locator('#result-output a[href^="javascript:"]').count(),0);
    assert(!(await browser.page.locator('#result-output').innerText()).includes(dir),'Local storage paths stay out of the report');
    await browser.context.grantPermissions(['clipboard-read','clipboard-write']);await browser.page.getByRole('button',{name:'Copy summary'}).click();assert((await browser.page.evaluate(()=>navigator.clipboard.readText())).includes('EUR 90'));
    await browser.page.getByText('View source text',{exact:true}).click();await browser.page.waitForTimeout(1700);assert(await browser.page.locator('.result-source').evaluate(el=>el.hasAttribute('open')),'Polling does not collapse the source while reading');
    const exportPromise=browser.page.waitForEvent('download');await browser.page.getByRole('button',{name:'Save report'}).click();const report=await exportPromise;
    assert.equal(report.suggestedFilename(),'task-report.html');
    const {readFile}=await import('node:fs/promises'),html=await readFile((await report.path())!,'utf8');assert(html.includes('Paris → Lyon'));assert(html.includes('Partial result'));assert(!html.includes('javascript:'));assert(!html.includes('<img src=x'));
    const saved=await browser.page.evaluate(async()=>{const r=await fetch('/api/download?id=results-test&index=4');return {status:r.status,text:await r.text()};});assert.equal(saved.status,200);assert(saved.text.includes('EUR 90'));
    // An authenticated caller cannot turn a trace download into an arbitrary file read.
    trace.actions[4]!.data={filename:'private.txt',path:outside};const changed=new TraceStore(join(dir,'history.sqlite'));changed.save(trace);changed.close();
    assert.equal(await browser.page.evaluate(async()=>(await fetch('/api/download?id=results-test&index=4')).status),400);
    trace.actions[4]!.data={filename:'escape.txt',path:join(downloads,'escape.txt')};const linked=new TraceStore(join(dir,'history.sqlite'));linked.save(trace);linked.close();
    assert.equal(await browser.page.evaluate(async()=>(await fetch('/api/download?id=results-test&index=4')).status),400);
    assert.equal((await fetch(dashboard.url+'/api/download?id=results-test&index=4')).status,401);
    for(const [width,height] of [[1440,900],[1280,720],[390,844]] as const){await browser.page.setViewportSize({width,height});assert(await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight));assert(await browser.page.locator('#result-dialog').evaluate(el=>{const r=el.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}));}
    assert.deepEqual(errors,[]);
  }finally{await browser.close();await dashboard.close();await rm(dir,{recursive:true,force:true});if(old===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=old;}
});
