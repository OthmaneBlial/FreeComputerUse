import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {startFixtures} from '../fixtures/server.js';
import {FixtureProvider} from '../fixtures/FixtureProvider.js';

test('local dashboard saves a profile, executes a form, gates approval, shows metrics and replays',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-ui-'));const oldDir=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const dashboard=await startServer({port:0,quiet:true,provider:new FixtureProvider()}),fixture=await startFixtures();
  const browser=await new Browser().launch();const errors:string[]=[],consoleErrors:string[]=[];browser.page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});browser.page.on('pageerror',error=>errors.push(error.message));
  try{
    await browser.navigate(dashboard.url);await browser.page.getByRole('button',{name:'Local profile'}).click();
    await browser.page.locator('#profile-json').fill(JSON.stringify({profile:{firstName:'Alex',lastName:'Example',email:'alex@example.test',message:'Synthetic message',country:'France'},files:{}}));
    await browser.page.getByRole('button',{name:'Save locally'}).click();
    await browser.page.locator('#profile-dialog').waitFor({state:'hidden'});
    await browser.page.locator('#start-url').fill(fixture.url+'/demo');await browser.page.locator('#goal').fill('Fill the contact form and send the message using my profile.');
    await browser.page.getByRole('button',{name:'Run task',exact:true}).click();
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});
    assert.equal(dashboard.getAgent()?.browser.page.url(),'about:blank');
    assert.match(await browser.page.locator('#approval-reason').innerText(),/Allow browser access/);
    await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>!document.querySelector('#approval-reason')?.textContent?.includes('Allow browser access'),undefined,{timeout:15000});
    try{await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});}catch(error){
      console.log('Dashboard diagnostic',JSON.stringify({notice:await browser.page.locator('#notice').innerText(),agent:dashboard.getAgent()?.trace,events:dashboard.getAgent()?.events,errors}));throw error;
    }
    assert.equal(dashboard.getAgent()?.trace?.status,'running');
    await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:15000});
    assert.equal(await browser.page.locator('#actions').innerText(),'7');
    assert.equal(await browser.page.locator('#calls').innerText(),'0'); // Scripted fixture is not a model.
    await browser.page.waitForFunction(()=>(document.querySelector('#preview') as HTMLImageElement)?.naturalWidth>0,undefined,{timeout:8000});
    await browser.page.getByRole('button',{name:/Fill the contact form and send/}).click();
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>!document.querySelector('#approval-reason')?.textContent?.includes('Allow browser access'),undefined,{timeout:15000});
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:15000});
    assert.equal(dashboard.getAgent()?.trace?.metrics.llmCalls,0);
    for(const width of [1440,390]){await browser.page.setViewportSize({width,height:900});assert(await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
    const unauthenticated=await fetch(dashboard.url+'/api/state');assert.equal(unauthenticated.status,401);
    const crossOrigin=await browser.page.evaluate(async()=>{const response=await fetch('/api/control/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return response.status;});assert.equal(crossOrigin,403);
  }finally{await browser.close();await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;}
});
