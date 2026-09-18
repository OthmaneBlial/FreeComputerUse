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

test('closing a page cancels its pending frame grant and cannot make a later request',async()=>{
  let visits=0;
  const child=createServer((_req,res)=>{visits++;res.end('<h1>Child</h1>');});
  await new Promise<void>(resolve=>child.listen(0,'127.0.0.1',resolve));const childURL=`http://127.0.0.1:${(child.address() as {port:number}).port}`;
  const parent=createServer((_req,res)=>res.end(`<h1>Parent</h1><iframe src="${childURL}"></iframe>`));
  await new Promise<void>(resolve=>parent.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${(parent.address() as {port:number}).port}`;
  const store=new TraceStore(':memory:'),agent=new Agent({store,browser:{allowedOrigins:[url]}});let childPrompt=false;let signalChild!:()=>void;const pendingChild=new Promise<void>(resolve=>{signalChild=resolve;});
  agent.control.on('approval',pending=>{if((pending.action as {origin:string}).origin===url)agent.control.approve();else{childPrompt=true;signalChild();}});
  try{
    const running=agent.run('Read the parent page',url);
    await pendingChild;await agent.browser.page.close();const trace=await running;
    assert(childPrompt);assert.equal(trace.status,'failed');assert.equal(agent.control.pending,undefined);assert.equal(visits,0);
    assert.throws(()=>agent.control.approve(),/No action/);
  }finally{await agent.close();store.close();await Promise.all([new Promise<void>(resolve=>parent.close(()=>resolve())),new Promise<void>(resolve=>child.close(()=>resolve()))]);}
});
