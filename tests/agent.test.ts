import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent/Agent.js';
import { TraceStore } from '../src/history/TraceStore.js';
import { TokenBudget } from '../src/agent/TokenBudget.js';
import { PlanSchema } from '../src/actions/schema.js';
import { FixtureProvider } from '../fixtures/FixtureProvider.js';
import { startFixtures } from '../fixtures/server.js';
import type { LLMProvider } from '../src/llm/LLMProvider.js';

test('bounded token budget reserves calls/output and tracks cache-aware configured cost',()=>{
  const budget=new TokenBudget({maxLLMCalls:2,maxInputTokens:100,maxOutputTokens:1000},{input:1,output:2,cachedInput:.1});
  assert.equal(budget.reserve(30,500).maxOutput,500);budget.record({input:30,output:500,cacheHit:10});
  assert.equal(budget.cost,.001021);
  assert.equal(budget.reserve(40,700).maxOutput,500);budget.record({input:40,output:500});
  assert.throws(()=>budget.reserve(1),/call budget/);
  const small=new TokenBudget({maxLLMCalls:5,maxInputTokens:10,maxOutputTokens:300});
  assert.throws(()=>small.reserve(11),/input budget/);assert.equal(small.calls,0);
});

test('default model budget allows long tasks while explicit caps still work',()=>{
  const budget=new TokenBudget();
  for(let i=0;i<20;i++){const reservation=budget.reserve(4000,1200);budget.record({input:4000,output:1200},reservation.id);}
  assert.equal(budget.calls,20);assert.equal(budget.input,80000);assert.equal(budget.output,24000);
  assert.equal(budget.limits.maxInputTokens,null);
});

test('observe/plan/execute/verify learns semantic workflow and replays without a provider',async()=>{
  const fixture=await startFixtures();const store=new TraceStore(':memory:');const provider=new FixtureProvider();
  const vault={profile:{firstName:'Alex',lastName:'Example',email:'private@example.test',country:'France',message:'Synthetic message'},files:{}};
  const options={store,vault,browser:{allowedOrigins:[fixture.url]}};
  const agent=new Agent({...options,provider});agent.control.on('approval',()=>agent.control.approve());
  try{
    const goal='Fill the contact form and send my message using my profile.';
    const trace=await agent.run(goal,fixture.url+'/demo');
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(provider.planCalls,1);
    assert.equal(trace.actions.length,7);assert(!JSON.stringify(trace).includes('private@example.test'));
    assert.equal(store.get(trace.id)?.status,'completed');assert.equal(agent.workflows.list().length,1);
    const second=new Agent(options);second.control.on('approval',()=>second.control.approve());
    try{
      const cached=await second.run(goal,fixture.url+'/demo');assert.equal(cached.status,'completed',cached.error??'Task failed');
      assert.equal(cached.metrics.workflowCacheHits,1);assert.equal(cached.metrics.llmCalls,0);
      const replay=await second.replay(trace);assert.equal(replay.status,'completed',replay.error??'Task failed');assert.equal(replay.metrics.llmCalls,0);
    }finally{await second.close();}
  }finally{await agent.close();store.close();await fixture.close();}
});

test('provider errors containing profile values are redacted from events and saved traces',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:'),secret='profile-secret-that-must-not-persist';
  const provider:LLMProvider={name:'fixture',plan:async()=>{throw new Error(secret);},repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,vault:{profile:{password:secret},files:{}},mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Read the page',fixture.url);
    assert.equal(trace.status,'failed');assert.equal(trace.error,'{{profile.password}}');
    assert(!JSON.stringify(agent.events).includes(secret));assert(!JSON.stringify(store.get(trace.id)).includes(secret));
  }finally{await agent.close();store.close();await fixture.close();}
});

test('credential query values are redacted before the first trace save and provider prompt',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');let firstSaved='',prompt='';
  const save=store.save.bind(store);store.save=trace=>{if(!firstSaved)firstSaved=JSON.stringify(trace);save(trace);};
  const provider:LLMProvider={name:'fixture',plan:async context=>{prompt=JSON.stringify(context);throw new Error('Synthetic provider failure');},repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  const accessToken='access-query-secret-that-must-not-persist',apiKey='query-api-secret-that-must-not-persist';
  try{
    const trace=await agent.run('Summarize the page',`${fixture.url}/demo?access_token=${accessToken}&api_key=${apiKey}&search=Paris`);
    assert.equal(trace.status,'failed');assert(!firstSaved.includes(accessToken));assert(!firstSaved.includes(apiKey));
    assert.equal((JSON.parse(firstSaved) as {url:string}).url,`${fixture.url}/demo?access_token=REDACTED&api_key=REDACTED&search=Paris`);
    assert(!prompt.includes(accessToken));assert(!prompt.includes(apiKey));assert(!JSON.stringify(agent.events).includes(accessToken));
    assert.equal(trace.url,`${fixture.url}/demo?access_token=REDACTED&api_key=REDACTED&search=Paris`);
  }finally{await agent.close();store.close();await fixture.close();}
});

test('minimal repair changes only the failed action and preserves successful prefix',async()=>{
  const fixture=await startFixtures();const store=new TraceStore(':memory:');const provider=new FixtureProvider();
  const agent=new Agent({store,provider,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Recover from changed DOM',fixture.url+'/changed');
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(provider.repairCalls,1);
    assert.equal(trace.metrics.repairs,1);assert.equal(trace.actions.length,2);
    assert(!trace.actions[0]?.success);assert(trace.actions[1]?.success);
  }finally{await agent.close();store.close();await fixture.close();}
});

test('max steps terminates repeated batches',async()=>{
  const fixture=await startFixtures();const store=new TraceStore(':memory:');
  const provider:LLMProvider={name:'test',plan:async context=>PlanSchema.parse({goal:context.goal,steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'element_visible',target:{css:'main'}}],continue:true}),repair:async()=>{throw new Error('unexpected repair');}};
  const agent=new Agent({store,provider,maxSteps:2,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Never-ending provider',fixture.url);assert.equal(trace.status,'failed');assert.match(trace.error??'',/limit/);assert.equal(trace.actions.length,2);
  }finally{await agent.close();store.close();await fixture.close();}
});

test('generic adapter extracts tables without invoking a provider',async()=>{
  const fixture=await startFixtures();const store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{const trace=await agent.run('Extract the table',fixture.url+'/wizard/results');assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(trace.metrics.llmCalls,0);assert.equal(trace.metrics.planBatches,0);}
  finally{await agent.close();store.close();await fixture.close();}
});

test('completion-only repair preserves successful actions; failed replay never invokes a provider',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');let repairs=0;
  const provider:LLMProvider={name:'fixture',plan:async()=>{throw new Error('Unexpected plan');},repair:async()=>{repairs++;return{actions:[],replace:0,completion:[{type:'text_exists',value:'Northstar'}]};}};
  const agent=new Agent({store,provider,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'text_exists',value:'Missing original criterion'}],continue:false});
    const trace=await agent.run('Read this page',fixture.url,plan);assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(trace.actions.length,1);assert.equal(repairs,1);
    const incompatible={...trace,actions:[{...trace.actions[0]!,action:{type:'click' as const,target:{role:'button',name:'Missing control'},timeoutMs:100}}]};
    const replay=await agent.replay(incompatible);assert.equal(replay.status,'failed');assert.equal(repairs,1);assert.equal(replay.metrics.llmCalls,0);
  }finally{await agent.close();store.close();await fixture.close();}
});
