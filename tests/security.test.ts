import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {PlanSchema} from '../src/actions/schema.js';
import {TokenBudget} from '../src/agent/TokenBudget.js';
import {goalCriteria} from '../src/agent/goalCriteria.js';

test('normal mode rejects website access before any site request; Ultra mode bypasses the gate',async()=>{
  let visits=0;const server=createServer((_req,res)=>{visits++;res.end('<h1>Free test site</h1><p>Ready</p>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}`;
  const store=new TraceStore(':memory:'),plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'text_exists',value:'Ready'}],continue:false});
  const normal=new Agent({store,browser:{allowedOrigins:[url]}});normal.control.on('approval',()=>normal.control.reject());
  const ultra=new Agent({store,mode:'ultra'});let gates=0;ultra.control.on('approval',()=>{gates++;});
  try{
    const rejected=await normal.run('Read the page',url,plan);assert.equal(rejected.status,'failed');assert.equal(visits,0);
    const accepted=await ultra.run('Read the page',url,plan);assert.equal(accepted.status,'completed',accepted.error??'Task failed');assert(visits>0);assert.equal(gates,0);
  }finally{await normal.close();await ultra.close();store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('concurrent token reservations cannot oversubscribe the input/output budget',()=>{
  const budget=new TokenBudget({maxLLMCalls:3,maxInputTokens:100,maxOutputTokens:300});
  const first=budget.reserve(60,200);assert.throws(()=>budget.reserve(50,100),/input budget/);
  const second=budget.reserve(20,200);assert.equal(second.maxOutput,100);assert.throws(()=>budget.reserve(1,100),/output budget/);
  budget.record({input:15,output:80},second.id);assert.equal(budget.pendingInput,60);
  budget.record({input:50,output:180},first.id);assert.equal(budget.pendingInput,0);
  assert.throws(()=>budget.record({input:-1,output:0}),/Invalid/);
});
test('trusted extraction criteria derive from the original goal',()=>{
  assert.deepEqual(goalCriteria('Extract the first five stories'),[{type:'extraction_created'},{type:'extraction_count',min:5,max:5}]);
  assert.deepEqual(goalCriteria('Fill the form using my profile'),[]);
});

import {once} from 'node:events';
import {Control} from '../src/agent/Control.js';
import {Browser} from '../src/browser/Browser.js';
import {Observer} from '../src/browser/Observer.js';
import {Executor} from '../src/actions/executor.js';
import {VariableResolver} from '../src/profile/VariableResolver.js';

test('credentialed initial URLs are rejected before agent traces persist them',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,mode:'ultra'});
  try{
    await assert.rejects(agent.run('Open this page','https://user:private-token@example.test/'),/without embedded credentials/);
    assert.equal(agent.active,false);assert.equal(store.history().length,0);
  }finally{await agent.close();store.close();}
});

test('concurrent permissions remain distinct and stopping rejects queued approvals',async()=>{
  const control=new Control(),seen:unknown[]=[];control.on('approval',p=>seen.push(p.action));
  const firstVisible=once(control,'approval');
  const first=control.confirm('First',{origin:'https://one.test'}),second=control.confirm('Second',{origin:'https://two.test'});
  await firstVisible;assert.deepEqual(seen,[{origin:'https://one.test'}]);
  const secondVisible=once(control,'approval');control.approve();await first;await secondVisible;
  assert.deepEqual(seen,[{origin:'https://one.test'},{origin:'https://two.test'}]);
  const denied=assert.rejects(second,/rejected/);control.reject();await denied;
  const third=control.confirm('Third',{}),fourth=control.confirm('Fourth',{});
  const settled=Promise.allSettled([third,fourth]);await Promise.resolve();control.stop();
  assert((await settled).every(result=>result.status==='rejected'));
});

test('replaced sensitive target cannot inherit an earlier human approval',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button id="delete" onclick="document.body.dataset.deleted=\'yes\'">Delete record</button>');
    const control=new Control(),executor=new Executor(browser,new Observer(),new VariableResolver(),control);
    const visible=once(control,'approval'),execution=executor.run({type:'click',target:{id:'delete'}});
    await visible;
    await browser.page.locator('#delete').evaluate(el=>{el.outerHTML='<button id="delete" onclick="document.body.dataset.deleted=\'yes\'">Delete record</button>';});
    control.approve();const result=await execution;
    assert.equal(result.success,false);assert.match(result.error??'',/target changed/);assert.equal(result.uncertain,false);
    assert.equal(await browser.page.locator('body').getAttribute('data-deleted'),null);
  }finally{await browser.close();}
});

test('unapproved cross-origin fetches are blocked before receiving a request',async()=>{
  let leaked=0;
  const receiver=createServer((_req,res)=>{leaked++;res.end('Forbidden');});
  await new Promise<void>(resolve=>receiver.listen(0,'127.0.0.1',resolve));
  const receiverURL=`http://127.0.0.1:${(receiver.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>res.end(`<h1>Safe sandbox</h1><script>fetch('${receiverURL}/collect').catch(()=>{});</script>`));
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(source.address() as {port:number}).port}`,store=new TraceStore(':memory:');
  const agent=new Agent({store,browser:{allowedOrigins:[url]}});agent.control.on('approval',()=>agent.control.approve());
  try{
    const plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'extraction_created'}],continue:false});
    assert.equal((await agent.run('Read this sandbox',url,plan)).status,'completed');assert.equal(leaked,0);
  }finally{await agent.close();store.close();await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>receiver.close(()=>resolve()))]);}
});

test('unapproved WebSocket origins are blocked before receiving an upgrade',{timeout:15000},async()=>{
  let upgrades=0;
  const target=createServer();target.on('upgrade',(_request,socket)=>{upgrades++;socket.destroy();});
  const source=createServer((_req,res)=>res.end('<h1>Approved origin</h1>'));
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));const targetURL=`ws://127.0.0.1:${(target.address() as {port:number}).port}`;
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`;
  const browser=await new Browser({allowedOrigins:[sourceURL]}).launch();
  try{
    await browser.navigate(sourceURL);
    await browser.page.evaluate(url=>{const socket=new WebSocket(url);socket.onerror=()=>{};},`${targetURL}/blocked`);
    await browser.page.waitForTimeout(100);assert.equal(upgrades,0);
  }finally{
    await browser.close();await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a bare Browser denies navigation and page requests without an explicit origin policy',async()=>{
  let visits=0;
  const server=createServer((_req,res)=>{visits++;res.end('Unexpected request');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=`http://127.0.0.1:${(server.address() as {port:number}).port}`,browser=await new Browser().launch();
  try{
    await assert.rejects(browser.navigate(url),/outside the local origin policy/);
    const blocked=browser.page.waitForEvent('requestfailed');
    await browser.page.setContent(`<img src="${url}/pixel">`);
    assert.equal((await blocked).url(),`${url}/pixel`);assert.equal(visits,0);
  }finally{await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});

test('origin matching canonicalizes IPv6 literals but keeps port and origin boundaries exact',()=>{
  const browser=new Browser({allowedOrigins:['http://[0:0:0:0:0:0:0:1]:8123']});
  assert.equal(browser.permits('http://[::1]:8123/path'),true);
  assert.equal(browser.permits('http://[::1]:8124/path'),false);
  assert.equal(new Browser({allowedOrigins:['http://[::1]:8123/private']}).permits('http://[::1]:8123/public'),false);
});

test('a redirected navigation is stopped before an unapproved origin receives it',async()=>{
  let sourceVisits=0,targetVisits=0,targetPrompted=false;
  const target=createServer((_req,res)=>{targetVisits++;res.end('<h1>Unapproved target</h1>');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://127.0.0.1:${(target.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>{sourceVisits++;res.writeHead(302,{Location:targetURL+'/private'});res.end();});
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`,store=new TraceStore(':memory:');
  const agent=new Agent({store,browser:{allowedOrigins:[sourceURL]}});
  agent.control.on('approval',pending=>{
    if((pending.action as {origin?:string}).origin===sourceURL)agent.control.approve();
    else{targetPrompted=true;agent.control.reject();}
  });
  const plan=PlanSchema.parse({goal:'Read the page',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'extraction_created'}],continue:false});
  try{
    const trace=await agent.run('Read the page',sourceURL,plan);
    assert.equal(trace.status,'failed');assert.equal(sourceVisits,1);assert.equal(targetPrompted,true);assert.equal(targetVisits,0);
  }finally{
    await agent.close();store.close();
    await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a redirected navigation reaches a second origin after explicit approval',async()=>{
  let targetVisits=0,targetApprovals=0;
  const target=createServer((_req,res)=>{targetVisits++;res.end('<h1>Approved target</h1>');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://127.0.0.1:${(target.address() as {port:number}).port}`;
  const source=createServer((_req,res)=>{res.writeHead(302,{Location:targetURL+'/private'});res.end();});
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`,store=new TraceStore(':memory:');
  const agent=new Agent({store,browser:{allowedOrigins:[sourceURL]}});
  agent.control.on('approval',pending=>{
    if((pending.action as {origin?:string}).origin===targetURL)targetApprovals++;
    agent.control.approve();
  });
  const plan=PlanSchema.parse({goal:'Read the approved page',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'extraction_created'}],continue:false});
  try{
    const trace=await agent.run('Read the approved page',sourceURL,plan);
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(targetApprovals,1);assert.equal(targetVisits,1);
  }finally{
    await agent.close();store.close();
    await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a fast popup redirect is blocked before an unapproved target receives it',async()=>{
  let targetVisits=0,targetApprovals=0,approved=false;
  const target=createServer((_req,res)=>{targetVisits++;res.end('<h1>Popup target</h1>');});
  await new Promise<void>(resolve=>target.listen(0,'127.0.0.1',resolve));
  const targetURL=`http://127.0.0.1:${(target.address() as {port:number}).port}`;
  const source=createServer((req,res)=>{
    if(req.url==='/jump'){res.writeHead(302,{Location:targetURL+'/private'});res.end();return;}
    res.end('<a href="/jump" target="_blank">Open popup</a>');
  });
  await new Promise<void>(resolve=>source.listen(0,'127.0.0.1',resolve));
  const sourceURL=`http://127.0.0.1:${(source.address() as {port:number}).port}`;
  const browser=new Browser({allowedOrigins:[sourceURL],beforeNavigate:async value=>{
    if(new URL(value).origin!==targetURL)return;
    targetApprovals++;
    if(!approved)throw new Error('Origin denied');
    browser.options.allowedOrigins?.push(targetURL);
  }});
  try{
    await browser.launch();await browser.navigate(sourceURL);
    const deniedEvent=browser.context.waitForEvent('page');
    await browser.page.getByRole('link',{name:'Open popup'}).click();
    const deniedPopup=await deniedEvent;await deniedPopup.waitForTimeout(100);
    assert.equal(targetApprovals,1);assert.equal(targetVisits,0);

    approved=true;
    const approvedEvent=browser.context.waitForEvent('page');
    await browser.context.pages()[0]!.getByRole('link',{name:'Open popup'}).click();
    const approvedPopup=await approvedEvent;
    await approvedPopup.waitForURL(`${targetURL}/private`);
    assert.equal(targetApprovals,2);assert.equal(targetVisits,1);
  }finally{
    await browser.close();
    await Promise.all([new Promise<void>(resolve=>source.close(()=>resolve())),new Promise<void>(resolve=>target.close(()=>resolve()))]);
  }
});

test('a prior download cannot satisfy a new task and a repair cannot weaken trusted criteria',async()=>{
  const store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',completionCriteria:[{type:'download_created',value:'old.txt'}],provider:{name:'fixture',plan:async()=>{throw new Error('unexpected');},repair:async()=>({actions:[],replace:0,completion:[{type:'extraction_created'}]})}});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<h1>Read only</h1>');agent.browser.downloads.push({filename:'old.txt',path:'/not-used'});
    const plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'extraction_created'}],continue:false});
    const trace=await agent.run('Read this page',undefined,plan);
    assert.equal(trace.status,'failed');assert.equal(agent.browser.downloads.length,0);assert.match(trace.error??'',/completion could not be verified/);
  }finally{await agent.close();store.close();}
});

test('closing a page cancels its pending frame grant and cannot make a later request',{timeout:15000},async()=>{
  let visits=0;
  const child=createServer((_req,res)=>{visits++;res.end('<h1>Child</h1>');});
  await new Promise<void>(resolve=>child.listen(0,'127.0.0.1',resolve));const childURL=`http://127.0.0.1:${(child.address() as {port:number}).port}`;
  const parent=createServer((_req,res)=>res.end(`<h1>Parent</h1><iframe src="${childURL}"></iframe>`));
  await new Promise<void>(resolve=>parent.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(parent.address() as {port:number}).port}`;
  const store=new TraceStore(':memory:'),agent=new Agent({store,browser:{allowedOrigins:[url]}});let childPrompt=false;let signalChild!:()=>void;const pendingChild=new Promise<void>(resolve=>{signalChild=resolve;});
  agent.control.on('approval',pending=>{if((pending.action as {origin:string}).origin===url)agent.control.approve();else{childPrompt=true;signalChild();}});
  try{
    // Keep the task alive until the child permission arrives. With no provider
    // or plan, a fast main-frame observation could fail before that request.
    const plan=PlanSchema.parse({goal:'Read the parent page',steps:['Wait for the child frame'],actions:[{type:'wait',condition:{type:'text_exists',value:'Child'},timeoutMs:30000}],completion:[{type:'text_exists',value:'Parent'}]});
    const running=agent.run('Read the parent page',url,plan);
    let timer:NodeJS.Timeout|undefined;
    try{await Promise.race([pendingChild,running.then(()=>{throw new Error('Task ended before requesting the child permission');}),new Promise<void>((_,reject)=>{timer=setTimeout(()=>reject(new Error('Timed out waiting for the child-origin permission')),5000);})]);}
    finally{if(timer)clearTimeout(timer);}
    await agent.browser.page.close();const trace=await running;
    assert(childPrompt);assert.equal(trace.status,'stopped');assert.equal(agent.control.pending,undefined);assert.equal(visits,0);
    assert.throws(()=>agent.control.approve(),/No action/);
  }finally{await agent.close();store.close();await Promise.all([new Promise<void>(resolve=>parent.close(()=>resolve())),new Promise<void>(resolve=>child.close(()=>resolve()))]);}
});

test('failed tasks reject website requests arriving after completion',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,browser:{allowedOrigins:['http://127.0.0.1:1']}});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<h1>No local strategy</h1>');
    const trace=await agent.run('Do an unsupported task');assert.equal(trace.status,'failed');assert.equal(agent.control.stopped,true);
    await assert.rejects(agent.browser.navigate('https://example.test'),/stopped/);
    assert.equal(agent.control.pending,undefined);
  }finally{await agent.close();store.close();}
});
