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

test('verification failure repairs completion; max steps terminates repeated batches',async()=>{
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
