import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {TraceStore,type Trace} from '../src/history/TraceStore.js';
import {startFixtures} from '../fixtures/server.js';
import {FixtureProvider} from '../fixtures/FixtureProvider.js';
import {PlanSchema} from '../src/actions/schema.js';
import type {LLMProvider} from '../src/llm/LLMProvider.js';

async function startApprovalSession(provider:LLMProvider,goal='Read the page',hostname?:string){
  const dir=await mkdtemp(join(tmpdir(),'fcu-ui-state-')),oldDir=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const fixture=await startFixtures(),dashboard=await startServer({port:0,quiet:true,provider}),browser=await new Browser({allowedOrigins:[dashboard.url]}).launch();
  try{
    const target=new URL(fixture.url+'/demo');if(hostname)target.hostname=hostname;
    await browser.navigate(dashboard.url);await browser.page.locator('#start-url').fill(target.href);await browser.page.locator('#goal').fill(goal);
    await browser.page.getByRole('button',{name:'Run task',exact:true}).click();await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});
  }catch(error){
    await browser.close();await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});
    if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;
    throw error;
  }
  return{browser,dashboard,fixture,close:async()=>{await browser.close();await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;}};
}

test('dashboard rejects credentialed run URLs and origins before creating an agent',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-url-guard-')),oldDir=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const dashboard=await startServer({port:0,quiet:true});
  try{
    const page=await fetch(dashboard.url),html=await page.text(),token=html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1],cookie=page.headers.get('set-cookie')?.split(';')[0];
    assert(token);assert(cookie);
    const request=async(body:object)=>fetch(dashboard.url+'/api/run',{method:'POST',headers:{'Content-Type':'application/json','Origin':dashboard.url,'Cookie':cookie,'X-FCU-Token':token},body:JSON.stringify(body)});
    const badTarget=await request({goal:'Read the page',url:'https://user:private-token@example.test/'});assert.equal(badTarget.status,400);assert.match((await badTarget.json() as {error:string}).error,/without embedded credentials/);
    const localFile=await request({goal:'Read a local file',url:'file:///etc/passwd'});assert.equal(localFile.status,400);assert.match((await localFile.json() as {error:string}).error,/Only HTTP\(S\) destinations/);
    const badOrigin=await request({goal:'Read the page',url:'https://example.test/',allowedOrigins:['https://user:private-token@example.test/']});assert.equal(badOrigin.status,400);assert.match((await badOrigin.json() as {error:string}).error,/without embedded credentials/);
    assert.equal(dashboard.getAgent(),undefined);
  }finally{await dashboard.close();await rm(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;}
});

test('dashboard and provider context redact credentials in the active page URL',{timeout:30000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-url-redaction-')),oldDir=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const fixture=await startFixtures();let prompt='';
  const legacySecret='legacy-access-secret-that-must-not-be-shown',legacyFragment='legacy-fragment-token-that-must-not-be-shown',legacyCode='legacy-oauth-code-that-must-not-be-shown',legacyURL=`${fixture.url}/demo?access_token=${legacySecret}&search=Paris#access_token=${legacyFragment}&code=${legacyCode}&state=keep`;
  const oldStore=new TraceStore(join(dir,'history.sqlite'));
  const oldTrace:Trace={version:1,id:'legacy-redaction',goal:'Open the old trace',url:legacyURL,status:'completed',startedAt:1,durationMs:0,plans:[],actions:[],completion:[],calls:[],metrics:{}};
  oldStore.save(oldTrace);oldStore.close();
  const dashboard=await startServer({port:0,quiet:true,provider:{name:'redaction-fixture',plan:async context=>{prompt=JSON.stringify(context);throw new Error('Synthetic provider failure');},repair:async()=>{throw new Error('Unexpected repair');}}});
  try{
    const page=await fetch(dashboard.url),html=await page.text(),token=html.match(/<meta name="csrf-token" content="([^"]+)"/)?.[1],cookie=page.headers.get('set-cookie')?.split(';')[0];
    assert(token);assert(cookie);
    const initial=await fetch(dashboard.url+'/api/state',{headers:{Cookie:cookie}}),initialState=await initial.json() as {trace?:{url:string};history?:{id:string;url:string}[]};
    assert.equal(initialState.trace?.url,`${fixture.url}/demo?access_token=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep`);
    assert.equal(initialState.history?.find(run=>run.id==='legacy-redaction')?.url,`${fixture.url}/demo?access_token=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep`);
    for(const secret of [legacySecret,legacyFragment,legacyCode])assert(!JSON.stringify(initialState).includes(secret));
    const accessToken='dashboard-access-secret-that-must-not-persist',apiKey='dashboard-api-secret-that-must-not-persist',fragmentToken='dashboard-oauth-fragment-that-must-not-persist',oauthCode='dashboard-oauth-code-that-must-not-persist';
    const url=`${fixture.url}/demo?access_token=${accessToken}&api_key=${apiKey}&search=Paris#access_token=${fragmentToken}&code=${oauthCode}&state=keep`;
    const started=await fetch(dashboard.url+'/api/run',{method:'POST',headers:{'Content-Type':'application/json','Origin':dashboard.url,'Cookie':cookie,'X-FCU-Token':token},body:JSON.stringify({goal:'Summarize the page',url,mode:'ultra'})});
    assert.equal(started.status,202);
    let state:{active:boolean;trace?:{id:string;status:string;url:string};state?:{url:string};browserUrl?:string;history?:{id:string;url:string}[]}={active:true};
    for(let attempt=0;attempt<100&&state.active;attempt++){
      await new Promise(resolve=>setTimeout(resolve,100));
      const response=await fetch(dashboard.url+'/api/state',{headers:{Cookie:cookie}});state=await response.json() as typeof state;
      if(state.trace?.status==='failed'&&!state.active)break;
    }
    assert.equal(state.trace?.status,'failed');assert(!prompt.includes(accessToken));assert(!prompt.includes(apiKey));assert(!prompt.includes(fragmentToken));assert(!prompt.includes(oauthCode));
    assert.equal(state.trace?.url,`${fixture.url}/demo?access_token=REDACTED&api_key=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep`);
    assert.equal(state.state?.url,state.trace.url);assert.equal(state.browserUrl,state.trace.url);
    assert(!JSON.stringify(state.history).includes(fragmentToken));assert(!JSON.stringify(state.history).includes(oauthCode));
    assert.equal(state.history?.find(run=>run.id===state.trace?.id)?.url,state.trace.url);
  }finally{await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;}
});

test('the real cursor is visible before the first model reply and survives document navigation',{timeout:20000},async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-cursor-wait-')),old=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
  const fixture=await startFixtures();let release!:()=>void,entered!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;}),planning=new Promise<void>(resolve=>{entered=resolve;});
  const dashboard=await startServer({port:0,quiet:true,provider:{name:'delayed-ui-fixture',plan:async context=>{entered();await gate;return PlanSchema.parse({goal:context.goal,steps:['Open the revenue page','Read the table'],actions:[{type:'navigate',url:fixture.url+'/reports'},{type:'extract',target:{role:'table',name:'Revenue'},format:'table',key:'revenue'}],completion:[{type:'extraction_contains',key:'revenue',value:'March'}]});},repair:async()=>{throw new Error('No repair expected');}}});
  const browser=await new Browser({allowedOrigins:[dashboard.url]}).launch(),errors:string[]=[];browser.page.on('pageerror',error=>errors.push(error.message));
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
  const browser=await new Browser({allowedOrigins:[dashboard.url]}).launch();const errors:string[]=[],consoleErrors:string[]=[],httpErrors:string[]=[];browser.page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});browser.page.on('pageerror',error=>errors.push(error.message));browser.page.on('response',response=>{if(response.status()>=500)httpErrors.push(`${response.status()} ${new URL(response.url()).pathname}`);});
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
    const priorAgent=dashboard.getAgent(),priorContext=priorAgent?.browser.context;
    assert(priorAgent&&priorContext);
    assert.equal(await browser.page.locator('#calls').innerText(),'0'); // Scripted fixture is not a model.
    await browser.page.waitForFunction(()=>(document.querySelector('#preview') as HTMLImageElement)?.naturalWidth>0,undefined,{timeout:8000});
    await browser.page.getByRole('button',{name:'Execution log',exact:true}).click();await browser.page.locator('#stream-dialog').waitFor({state:'visible'});assert(await browser.page.locator('#events li').count()>0);await browser.page.getByRole('button',{name:'Close execution log'}).click();
    await browser.page.getByRole('button',{name:'Recent runs',exact:false}).click();
    await browser.page.getByRole('button',{name:/Fill the contact form and send/}).click();
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>!document.querySelector('#approval-reason')?.textContent?.includes('Allow browser access'),undefined,{timeout:15000});
    await browser.page.locator('#approval').waitFor({state:'visible',timeout:15000});await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:25000});
    assert.equal(dashboard.getAgent(),priorAgent,'The dashboard reuses its local agent between tasks');
    assert.equal(dashboard.getAgent()?.browser.context,priorContext,'The dashboard keeps one browser context between tasks');
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
    assert.deepEqual(errors,[]);assert.deepEqual(consoleErrors,[]);assert.deepEqual(httpErrors,[]);
    const unauthenticated=await fetch(dashboard.url+'/api/state');assert.equal(unauthenticated.status,401);
    const crossOrigin=await browser.page.evaluate(async()=>{const response=await fetch('/api/control/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});return response.status;});assert.equal(crossOrigin,403);
  }finally{await browser.close();await dashboard.close();await fixture.close();await rm(dir,{recursive:true,force:true});if(oldDir===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=oldDir;}
});

test('dashboard shows rejected, stopped, timed-out and unverified runs accurately',{timeout:120000},async t=>{
  await t.test('rejecting website access fails before visiting it',async()=>{
    const provider=new FixtureProvider(),session=await startApprovalSession(provider);
    try{
      await session.browser.page.getByRole('button',{name:'Reject',exact:true}).click();
      await session.browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='FAILED');
      assert.equal(session.dashboard.getAgent()?.browser.page.url(),'about:blank');assert.equal(provider.planCalls,0);
      assert.match(session.dashboard.getAgent()?.trace?.error??'',/Sensitive action rejected/);
    }finally{await session.close();}
  });
  await t.test('stopping during website approval ends as stopped',async()=>{
    const session=await startApprovalSession(new FixtureProvider());
    try{
      await session.browser.page.getByRole('button',{name:'Stop',exact:true}).click();
      await session.browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='STOPPED');
      assert.equal(session.dashboard.getAgent()?.browser.page.url(),'about:blank');assert.equal(await session.browser.page.locator('#approval').isHidden(),true);
    }finally{await session.close();}
  });
  await t.test('a simulated provider timeout is shown as a failure',async()=>{
    let calls=0;
    const provider:LLMProvider={name:'timeout-fixture',plan:async()=>{calls++;throw new Error('Synthetic provider request timed out');},repair:async()=>{throw new Error('No repair expected');}};
    const session=await startApprovalSession(provider);
    try{
      await session.browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
      await session.browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='FAILED');
      await session.browser.page.getByRole('button',{name:'Execution log',exact:true}).click();
      assert.equal(calls,1);assert.match(await session.browser.page.locator('#events').innerText(),/Synthetic provider request timed out/);
      assert.equal(session.dashboard.getAgent()?.trace?.status,'failed');assert.equal(session.dashboard.getAgent()?.trace?.actions.length,0);
    }finally{await session.close();}
  });
  await t.test('incorrect completion criteria remain a partial result',async()=>{
    const expected=[{type:'extraction_contains' as const,key:'visible',value:'UNAVAILABLE_SENTINEL'}];
    const provider:LLMProvider={
      name:'incorrect-result-fixture',
      plan:async context=>PlanSchema.parse({goal:context.goal,steps:['Read the visible page'],actions:[{type:'extract',target:{css:'body'},format:'text',key:'visible'}],completion:expected}),
      repair:async()=>({actions:[],replace:0,completion:expected}),
    };
    const session=await startApprovalSession(provider);
    try{
      await session.browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
      await session.browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='FAILED',undefined,{timeout:15000});
      await session.browser.page.waitForFunction(()=>(document.querySelector('#result-open') as HTMLButtonElement)?.disabled===false);
      assert.equal(session.dashboard.getAgent()?.trace?.status,'failed');assert.match(session.dashboard.getAgent()?.trace?.error??'',/completion could not be verified/i);
      await session.browser.page.getByRole('button',{name:'View result',exact:true}).click();
      assert.match(await session.browser.page.locator('.result-status').innerText(),/partial result/i);
      assert.match(await session.browser.page.locator('.result-error').innerText(),/completion could not be verified/i);
    }finally{await session.close();}
  });
});

test('dashboard revokes approved sites and blocks their browser requests',{timeout:30000},async()=>{
  let release!:()=>void,entered!:()=>void,plans=0;
  const gate=new Promise<void>(resolve=>{release=resolve;}),planning=new Promise<void>(resolve=>{entered=resolve;});
  const provider:LLMProvider={name:'revocation-fixture',plan:async context=>{plans++;if(plans===1){entered();await gate;}return PlanSchema.parse({goal:context.goal,steps:['Read the page'],actions:[{type:'extract',target:{css:'h1'},format:'text',key:'heading'}],completion:[{type:'extraction_created',key:'heading'}]});},repair:async()=>{throw new Error('No repair expected');}};
  const session=await startApprovalSession(provider);
  let blockedRequestHits=0;session.fixture.server.on('request',request=>{if(new URL(request.url??'/',session.fixture.url).searchParams.has('after-revoke'))blockedRequestHits++;});
  try{
    await session.browser.page.getByRole('button',{name:'Approve action',exact:true}).click();await planning;
    await session.browser.page.locator('#options-open').click();
    const revoke=session.browser.page.getByRole('button',{name:`Revoke access to ${session.fixture.url}`,exact:true});await revoke.waitFor();await revoke.click();
    await session.browser.page.waitForFunction(()=>document.querySelector('#notice')?.textContent?.startsWith('Access revoked for'));
    assert.equal(session.dashboard.getAgent()?.browser.permits(session.fixture.url),false);
    const denied=await session.dashboard.getAgent()!.browser.page.evaluate(async url=>{try{await fetch(url);return false;}catch{return true;}},session.fixture.url+'/demo?after-revoke=1');assert.equal(denied,true);assert.equal(blockedRequestHits,0);
    release();await session.browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='STOPPED');
    assert.deepEqual(session.dashboard.getAgent()?.approvedSites,[]);assert.equal(session.dashboard.getAgent()?.trace?.actions.length,0);
    assert(session.dashboard.getAgent()?.events.some(event=>event.phase==='PERMISSION'&&event.message.includes('access revoked')));
  }finally{release();await session.close();}
});

test('dashboard marks private-network navigation as a security block',{timeout:30000},async()=>{
  const provider=new FixtureProvider(),session=await startApprovalSession(provider,'Read the page','localhost');
  try{
    await session.browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    await session.browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='BLOCKED');
    assert.equal(session.dashboard.getAgent()?.trace?.status,'failed');assert.equal(session.dashboard.getAgent()?.trace?.failureKind,'security');
    assert.equal(session.dashboard.getAgent()?.browser.page.url(),'about:blank');assert.equal(provider.planCalls,0);
    assert(session.dashboard.getAgent()?.events.some(event=>event.phase==='BLOCKED'));
    assert.match(await session.browser.page.locator('#control-state').innerText(),/security policy/i);
  }finally{await session.close();}
});
