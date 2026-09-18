import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {startFixtures} from '../fixtures/server.js';
import {FixtureProvider} from '../fixtures/FixtureProvider.js';
import {PlanSchema} from '../src/actions/schema.js';

test('the real cursor is visible before the first model reply and survives document navigation',{timeout:20000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-cursor-wait-')),old=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const fixture=await startFixtures();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),planning=new Promise<void>(resolve=>{entered=resolve;});
  const dashboard=await startServer({port:0,quiet:true,provider:{name:'delayed-ui-fixture',plan:async context=>{entered();await gate;return PlanSchema.parse({goal:context.goal,steps:['Open the revenue page','Read the table'],actions:[{type:'navigate',url:fixture.url+'/reports'},{type:'extract',target:{role:'table',name:'Revenue'},format:'table',key:'revenue'}],completion:[{type:'extraction_contains',key:'revenue',value:'March'}]});},repair:async()=>{throw new Error('No repair expected');}}});
  const browser=await new Browser().launch(),errors:string[]=[];browser.page.on('pageerror',error=>errors.push(error.message));
  try{
    await browser.navigate(dashboard.url);await browser.page.locator('#start-url').fill(fixture.url+'/demo');await browser.page.locator('#goal').fill('Open the revenue page and read its monthly figures. Do not submit the contact form.');
    await browser.page.getByRole('button',{name:'Run task',exact:true}).click();await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();await planning;
    await browser.page.locator('#agent-cursor').waitFor({state:'visible'});
    assert.equal(dashboard.getAgent()?.trace?.actions.length,0,'Cursor is visible with no planned actions executed');
    const parked=dashboard.getAgent()!.browser.interaction.snapshot()!;assert(parked.visible);assert.equal(parked.kind,'idle');
    assert.match(await browser.page.locator('#interaction-label').innerText(),/Preparing the next actions/);
    await browser.page.waitForTimeout(1200);assert.match(await browser.page.locator('#interaction-label').innerText(),/Preparing the next actions · [1-9]\d*s/);
    assert.match(await browser.page.locator('#control-state').innerText(),/Waiting for the model reply/);
    assert.equal(dashboard.getAgent()?.trace?.actions.length,0,'Waiting indicator does not fabricate activity');
    release();await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED');
    await browser.page.waitForFunction(pageId=>Number(document.querySelector('#agent-cursor')?.getAttribute('data-page-id'))===pageId,dashboard.getAgent()!.browser.interaction.snapshot()!.pageId);
    const after=dashboard.getAgent()!.browser.interaction.snapshot()!;assert(after.pageId!==parked.pageId);assert(after.visible);assert.equal(after.x,parked.x);assert.equal(after.y,parked.y);
    assert(await browser.page.locator('#agent-cursor').isVisible(),'Navigation did not hide the parked mouse');assert.deepEqual(errors,[]);
  }finally{release();await browser.close();await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});if(old===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=old;}
});

test('local dashboard saves a profile, executes a form, gates approval, shows metrics and replays',{timeout:90000},async()=>{
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
    for(const [width,height] of [[1440,900],[1280,720],[1024,768],[390,844]] as const){
      await browser.page.setViewportSize({width,height});
      assert(await browser.page.locator('#approve').evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight&&rect.left>=0&&rect.right<=innerWidth;}),'Approval stays in view');
      assert(await browser.page.evaluate(()=>document.documentElement.scrollHeight<=innerHeight&&document.documentElement.scrollWidth<=innerWidth),'No page scroll');
    }
    await browser.page.setViewportSize({width:1440,height:900});
    await browser.page.getByRole('button',{name:'Full screen browser',exact:true}).click();
    await browser.page.waitForFunction(()=>document.fullscreenElement?.id==='browser-panel'||document.querySelector('#browser-panel')?.classList.contains('expanded'));
    assert(await browser.page.locator('#approve').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight));
    await browser.page.getByRole('button',{name:'Exit full screen browser',exact:true}).click();
    await browser.page.waitForFunction(()=>!document.fullscreenElement&&!document.querySelector('#browser-panel')?.classList.contains('expanded'));
    assert.equal(dashboard.getAgent()?.browser.page.url(),'about:blank');
    assert.match(await browser.page.locator('#approval-reason').innerText(),/Allow browser access/);
    await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>!document.querySelector('#approval-reason')?.textContent?.includes('Allow browser access'),undefined,{timeout:15000});
    try{await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});}catch(error){
      console.log('Dashboard diagnostic',JSON.stringify({notice:await browser.page.locator('#notice').innerText(),agent:dashboard.getAgent()?.trace,events:dashboard.getAgent()?.events,errors}));throw error;
    }
    assert.equal(dashboard.getAgent()?.trace?.status,'running');
    await browser.page.locator('#agent-cursor').waitFor({state:'visible',timeout:8000});
    assert((await browser.page.locator('#agent-cursor').getAttribute('data-sequence'))!==null);
    assert.match(await browser.page.locator('#interaction-label').innerText(),/Waiting for your approval/);
    const screenshot=await browser.page.evaluate(async()=>{const response=await fetch('/api/preview');return {status:response.status,pageId:response.headers.get('X-FCU-Page-ID')};});
    assert.equal(screenshot.status,200);assert.equal(Number(screenshot.pageId),dashboard.getAgent()?.browser.interaction.snapshot()?.pageId);
    await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:25000});
    assert.equal(await browser.page.locator('#actions').innerText(),'7');
    assert.equal(await browser.page.locator('#calls').innerText(),'0'); // Scripted fixture is not a model.
    await browser.page.waitForFunction(()=>(document.querySelector('#preview') as HTMLImageElement)?.naturalWidth>0,undefined,{timeout:8000});
    await browser.page.getByRole('button',{name:'Execution log',exact:true}).click();await browser.page.locator('#stream-dialog').waitFor({state:'visible'});assert(await browser.page.locator('#events li').count()>0);await browser.page.getByRole('button',{name:'Close execution log'}).click();
    await browser.page.getByRole('button',{name:'Recent runs',exact:false}).click();
    await browser.page.getByRole('button',{name:/Fill the contact form and send/}).click();
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>!document.querySelector('#approval-reason')?.textContent?.includes('Allow browser access'),undefined,{timeout:15000});
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:25000});
    assert.equal(dashboard.getAgent()?.trace?.metrics.llmCalls,0);
    for(const width of [1440,390]){
      await browser.page.setViewportSize({width,height:900});assert(await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await browser.page.waitForFunction(point=>{
        const image=document.querySelector('#preview') as HTMLImageElement,cursor=document.querySelector('#agent-cursor') as HTMLElement,layer=document.querySelector('#pointer-layer') as HTMLElement;
        const rect=image.getBoundingClientRect(),origin=layer.getBoundingClientRect(),scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight);
        const width=image.naturalWidth*scale,height=image.naturalHeight*scale;
        const expectedX=rect.left-origin.left+(rect.width-width)/2+point.x/point.width*width,expectedY=rect.top-origin.top+(rect.height-height)/2+point.y/point.height*height;
        const matrix=new DOMMatrix(getComputedStyle(cursor).transform);
        return !cursor.hidden&&Math.abs(matrix.m41-expectedX)<1&&Math.abs(matrix.m42-expectedY)<1;
      },dashboard.getAgent()!.browser.interaction.snapshot()!,{timeout:8000});
    }
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);
    const unauthenticated=await fetch(dashboard.url+'/api/state');assert.equal(unauthenticated.status,401);
    const crossOrigin=await browser.page.evaluate(async()=>{const response=await fetch('/api/control/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return response.status;});assert.equal(crossOrigin,403);
  }finally{await browser.close();await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;}
});
