import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Agent } from '../src/agent/Agent.js';
import { TraceStore } from '../src/history/TraceStore.js';
import { TokenBudget } from '../src/agent/TokenBudget.js';
import { PlanSchema } from '../src/actions/schema.js';
import { genericAdapter } from '../src/adapters/generic.js';
import { FixtureProvider } from '../fixtures/FixtureProvider.js';
import { startFixtures } from '../fixtures/server.js';
import type { LLMProvider } from '../src/llm/LLMProvider.js';
import { normalizeIntent,structureHash } from '../src/workflows/WorkflowEngine.js';
import type { PageElement,PageState } from '../src/browser/types.js';

test('preparing another run preserves configured origins and clears run-scoped origin changes',async()=>{
  const store=new TraceStore(':memory:'),configured={allowedOrigins:['https://trusted.example'],blockedOrigins:['https://blocked.example']};
  const agent=new Agent({store,browser:{...configured,headless:true}});
  try{
    agent.browser.options.allowedOrigins?.push('https://approved-for-one-run.example');
    agent.browser.options.blockedOrigins?.push('https://revoked-for-one-run.example');
    await agent.prepareForNextRun({browser:{headless:false}});
    assert.deepEqual(agent.browser.options.allowedOrigins,configured.allowedOrigins);
    assert.deepEqual(agent.browser.options.blockedOrigins,configured.blockedOrigins);
    assert.equal(agent.browser.options.headless,false);
    agent.browser.options.allowedOrigins?.push('https://another-run.example');
    await agent.prepareForNextRun();
    assert.deepEqual(agent.browser.options.allowedOrigins,configured.allowedOrigins);
    assert.deepEqual(agent.browser.options.blockedOrigins,configured.blockedOrigins);
  }finally{await agent.close();store.close();}
});

test('workflow fingerprints track action-relevant structure but ignore transient form state',()=>{
  const elements:PageElement[]=[
    {ref:'select',tag:'select',role:'combobox',name:'Country',type:'select',options:['France','Germany'],optionValues:['fr','de'],frame:0,path:'select',selectors:{role:'combobox',name:'Country'}},
    {ref:'link',tag:'a',role:'link',name:'Profile',href:'https://example.test/profile',frame:0,path:'a',selectors:{role:'link',name:'Profile'}},
    {ref:'button',tag:'button',role:'button',name:'Continue',disabled:false,frame:0,path:'button',selectors:{role:'button',name:'Continue'}},
    {ref:'checkbox',tag:'input',role:'checkbox',name:'Updates',type:'checkbox',checked:false,frame:0,path:'input',selectors:{role:'checkbox',name:'Updates'}},
  ];
  const fingerprint=(items:PageElement[])=>structureHash({url:'https://example.test/form',title:'',headings:[],text:'',elements:items,tables:[],dialogs:[],htmlBytes:0,hash:'',warnings:[],frames:[],truncated:false} satisfies PageState);
  const baseline=fingerprint(elements);
  for(const [index,change] of [
    {optionValues:['fr','de-old']},
    {href:'https://example.test/delete-profile'},
    {form:'archive-form'},
  ].entries()){
    assert.notEqual(fingerprint(elements.map((element,position)=>position===index?{...element,...change}:element)),baseline);
  }
  assert.equal(fingerprint(elements.map((element,index)=>index===3?{...element,checked:true}:element)),baseline);
  assert.equal(fingerprint(elements.map((element,index)=>index===2?{...element,disabled:true}:element)),baseline);
});

test('workflow lookup uses an index for origin, intent and page structure',()=>{
  const store=new TraceStore(':memory:');
  try{
    const plan=store.db.prepare('EXPLAIN QUERY PLAN SELECT id,workflow FROM workflows WHERE domain=? AND intent=? AND structure=?').all('https://example.test','read','shape') as {detail:string}[];
    assert(plan.some(row=>row.detail.includes('USING INDEX workflows_match')));
  }finally{store.close();}
});

test('run history uses a descending index without a temporary sort',()=>{
  const store=new TraceStore(':memory:');
  try{
    const plan=store.db.prepare('EXPLAIN QUERY PLAN SELECT id,started,status,goal,url FROM runs ORDER BY started DESC LIMIT ?').all(30) as {detail:string}[];
    assert(plan.some(row=>row.detail.includes('USING INDEX runs_history')));
    assert(!plan.some(row=>row.detail.includes('TEMP B-TREE FOR ORDER BY')));
  }finally{store.close();}
});

test('trace persistence failures do not strand an agent as active',async()=>{
  const store=new TraceStore(':memory:'),save=store.save.bind(store);let failure:'initial'|'final'|undefined='initial';
  store.save=trace=>{
    if(failure==='initial'){failure=undefined;throw new Error('simulated initial persistence failure');}
    if(failure==='final'&&trace.status==='completed'){failure=undefined;throw new Error('simulated final persistence failure');}
    save(trace);
  };
  const provider:LLMProvider={name:'fixture',plan:async context=>PlanSchema.parse({goal:context.goal,steps:['Extract current text'],actions:[{type:'extract',key:'page'}],completion:[{type:'extraction_created',key:'page'}],continue:false}),repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra'});
  try{
    await assert.rejects(agent.run('Read the page'),/simulated initial persistence failure/);assert.equal(agent.active,false);
    assert.equal((await agent.run('Read the page')).status,'completed');
    failure='final';await assert.rejects(agent.run('Read the page'),/simulated final persistence failure/);assert.equal(agent.active,false);
    assert.equal((await agent.run('Read the page')).status,'completed');
  }finally{await agent.close();store.close();}
});

test('sync and async event listener failures do not stop tasks or other listeners',async()=>{
  const store=new TraceStore(':memory:');let observations=0;const unhandled:unknown[]=[],captureUnhandled=(reason:unknown)=>unhandled.push(reason);
  const provider:LLMProvider={name:'fixture',plan:async context=>PlanSchema.parse({goal:context.goal,steps:['Extract page text'],actions:[{type:'extract',key:'page',format:'text'}],completion:[{type:'extraction_created',key:'page'}],continue:false}),repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra',useWorkflows:false,adapters:[]});
  agent.on('event',event=>{if(event.phase==='OBSERVE')throw new Error('Synthetic subscriber failure');});
  agent.on('event',async event=>{if(event.phase==='OBSERVE')throw new Error('Synthetic async subscriber failure');});
  agent.on('event',event=>{if(event.phase==='OBSERVE')observations++;});
  process.on('unhandledRejection',captureUnhandled);
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<main>Safe local content</main>');
    const first=await agent.run('Extract page text');assert.equal(first.status,'completed',first.error??'Task failed');
    assert(observations>0,'a failing listener must not block other listeners');
    const second=await agent.run('Extract page text');assert.equal(second.status,'completed',second.error??'Task failed');
    await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(unhandled,[],'async listener rejections must be handled');
  }finally{process.off('unhandledRejection',captureUnhandled);await agent.close();store.close();}
});

test('local profile filling scopes required fields and rejects competing forms',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,mode:'ultra',vault:{profile:{firstName:'Alex',email:'synthetic@example.test',message:'Synthetic message'},files:{}}});
  try{
    await agent.browser.launch();
    await agent.browser.page.setContent('<form aria-label="Contact"><label for="firstName">First name</label><input id="firstName" required><label for="email">Email</label><input id="email" type="email" required><label for="message">Message</label><textarea id="message" required></textarea></form><form aria-label="Company details"><label for="company">Registration number</label><input id="company" required></form>');
    let state=await agent.observer.inspect(agent.browser.page);
    let plan=genericAdapter.plan('Fill the contact form using my profile.',state,agent.variables);
    assert(plan,'An unrelated required field should not block the complete contact form');
    assert.deepEqual(plan.actions.map(action=>'target'in action&&typeof action.target==='object'?action.target.id:undefined),['firstName','email','message']);

    await agent.browser.page.setContent('<form><label for="firstName">First name</label><input id="firstName" required><label for="email1">Email</label><input id="email1" type="email" required></form><form><label for="email2">Email</label><input id="email2" type="email" required></form>');
    state=await agent.observer.inspect(agent.browser.page);
    assert.equal(new Set(state.elements.map(element=>element.formRef)).size,2,'Unlabeled forms need distinct internal identities');
    plan=genericAdapter.plan('Fill the contact form using my profile.',state,agent.variables);
    assert.equal(plan,undefined,'Do not choose between multiple profile-mappable forms');

    await agent.browser.page.setContent('<form aria-label="Contact"><label for="firstName">First name</label><input id="firstName" required><label for="company">Registration number</label><input id="company" required></form><form aria-label="Newsletter"><label for="email">Email</label><input id="email" type="email" required></form>');
    state=await agent.observer.inspect(agent.browser.page);
    plan=genericAdapter.plan('Fill the contact form using my profile.',state,agent.variables);
    assert.equal(plan,undefined,'Do not fall back to a smaller but unrelated form when the requested form has an unmapped field');
  }finally{await agent.close();store.close();}
});

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

test('first-N extraction accepts empty results when no items are available',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,mode:'ultra'});
  try{
    await agent.browser.launch();
    await agent.browser.page.setContent('<main><h1>Empty page</h1></main>');
    const trace=await agent.run('Extract the first 5 links');
    assert.equal(trace.status,'completed',trace.error??'Task failed');
    assert.deepEqual(agent.browser.extractions[0]?.value,[]);
  }finally{await agent.close();store.close();}
});

test('planner schema accepts the 4000-character goals supported by dashboard and MCP',()=>{
  const goal='g'.repeat(4000);
  const plan=PlanSchema.parse({goal,steps:['Read the page'],actions:[{type:'extract',format:'text'}],completion:[{type:'extraction_created'}],continue:false});
  assert.equal(plan.goal,goal);
});

test('Agent.run rejects goals over the shared limit before launching or saving a run',async()=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store});
  try{
    await assert.rejects(agent.run('g'.repeat(4001)),/4000/);
    assert.equal(agent.browser.context,undefined);assert.equal(store.history(1).length,0);
  }finally{await agent.close();store.close();}
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

test('provider-free workflow replay resolves controls replaced by SPA hydration',async()=>{
  const store=new TraceStore(':memory:');let planCalls=0;
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    planCalls++;
    return PlanSchema.parse({goal:context.goal,steps:['Reveal and finish'],actions:[
      {type:'click',target:{role:'button',name:'Reveal'}},
      {type:'click',target:{role:'button',name:'Finish'}},
    ],completion:[{type:'text_exists',value:'Workflow finished'}],continue:false});
  },repair:async()=>{throw new Error('Unexpected repair');}};
  const installPage=async(agent:Agent)=>{
    await agent.browser.launch();
    await agent.browser.page.setContent('<main><button id="reveal">Reveal</button><button id="finish">Finish</button><p id="result"></p></main>');
    await agent.browser.page.evaluate(()=>document.querySelector('#reveal')!.addEventListener('click',()=>{
      const replacement=document.createElement('button');replacement.id='finish';replacement.textContent='Finish';
      replacement.addEventListener('click',()=>document.querySelector('#result')!.textContent='Workflow finished');
      document.querySelector('#finish')!.replaceWith(replacement);
    }));
  };
  const first=new Agent({store,provider,mode:'ultra',useWorkflows:false,adapters:[]});
  const replay=new Agent({store,mode:'ultra',adapters:[]});
  try{
    await installPage(first);
    const learned=await first.run('Complete the hydrated workflow');
    assert.equal(learned.status,'completed',learned.error??'Task failed');assert.equal(planCalls,1);
    assert.equal(learned.actions[0]?.observedStateChanged,true);assert.equal(learned.actions[1]?.strategy,'role');assert.equal(learned.actions[1]?.observedStateChanged,true);

    await installPage(replay);
    const cached=await replay.run('Complete the hydrated workflow');
    assert.equal(cached.status,'completed',cached.error??'Task failed');
    assert.equal(cached.metrics.workflowCacheHits,1);assert.equal(cached.metrics.llmCalls,0);
    assert.equal(cached.actions[0]?.observedStateChanged,true);assert.equal(cached.actions[1]?.strategy,'role');assert.equal(cached.actions[1]?.observedStateChanged,true);assert.equal(planCalls,1);
  }finally{await first.close();await replay.close();store.close();}
});

test('provider-free workflow replay waits for its cached structure to hydrate',async()=>{
  const store=new TraceStore(':memory:');let planCalls=0;
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    planCalls++;
    return PlanSchema.parse({goal:context.goal,steps:['Start the task'],actions:[{type:'click',target:{role:'button',name:'Start'}}],completion:[{type:'text_exists',value:'Hydrated task finished'}],continue:false});
  },repair:async()=>{throw new Error('Unexpected repair');}};
  const installReadyPage=async(agent:Agent)=>{
    await agent.browser.launch();
    await agent.browser.page.setContent('<main><button id="start">Start</button><p id="result"></p></main>');
    await agent.browser.page.locator('#start').evaluate(button=>button.addEventListener('click',()=>document.querySelector('#result')!.textContent='Hydrated task finished'));
  };
  const first=new Agent({store,provider,mode:'ultra',useWorkflows:false,adapters:[]});
  const replay=new Agent({store,mode:'ultra',adapters:[]});
  try{
    await installReadyPage(first);
    const learned=await first.run('Complete the hydrated task');
    assert.equal(learned.status,'completed',learned.error??'Task failed');assert.equal(planCalls,1);

    await replay.browser.launch();await replay.browser.page.setContent('<main><p>Loading</p></main>');
    await replay.browser.page.evaluate(()=>window.setTimeout(()=>{
      document.querySelector('main')!.innerHTML='<button id="start">Start</button><p id="result"></p>';
      document.querySelector('#start')!.addEventListener('click',()=>document.querySelector('#result')!.textContent='Hydrated task finished');
    },250));
    const cached=await replay.run('Complete the hydrated task');
    assert.equal(cached.status,'completed',cached.error??'Task failed');
    assert.equal(cached.metrics.workflowCacheHits,1);assert.equal(cached.metrics.llmCalls,0);assert.equal(planCalls,1);
  }finally{await first.close();await replay.close();store.close();}
});

test('workflow cache misses when a same-name link points to a different destination',async()=>{
  const store=new TraceStore(':memory:');let planCalls=0;
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    planCalls++;
    return PlanSchema.parse({goal:context.goal,steps:['Open the profile'],actions:[{type:'click',target:{role:'link',name:'Profile'}}],completion:[{type:'text_exists',value:'Profile loaded'}],continue:false});
  },repair:async()=>{throw new Error('Unexpected repair');}};
  const installPage=async(agent:Agent,destination:string)=>{
    await agent.browser.launch();
    await agent.browser.page.setContent(`<main><a href="https://example.test/${destination}">Profile</a><p></p></main>`);
    await agent.browser.page.getByRole('link',{name:'Profile'}).evaluate(link=>link.addEventListener('click',event=>{event.preventDefault();document.querySelector('p')!.textContent='Profile loaded';}));
  };
  const first=new Agent({store,provider,mode:'ultra',adapters:[]});
  const second=new Agent({store,provider,mode:'ultra',adapters:[]});
  try{
    await installPage(first,'old');
    const learned=await first.run('Open the profile');
    assert.equal(learned.status,'completed',learned.error??'Task failed');
    await installPage(second,'new');
    const current=await second.run('Open the profile');
    assert.equal(current.status,'completed',current.error??'Task failed');
    assert.equal(current.metrics.workflowCacheHits,0,'Do not replay an action against a changed destination');
    assert.equal(planCalls,2,'Replan against the current link destination');
  }finally{await first.close();await second.close();store.close();}
});

test('learned workflow does not replay a checkbox toggle after its state changes',async()=>{
  const store=new TraceStore(':memory:');let planCalls=0;
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    planCalls++;
    return PlanSchema.parse({goal:context.goal,steps:['Enable the preference'],actions:[{type:context.page.includes(' checked')?'check':'click',target:{role:'checkbox',name:'Email updates'}}],completion:[{type:'checkbox_checked',target:{role:'checkbox',name:'Email updates'}}],continue:false});
  },repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra'});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<label><input type="checkbox">Email updates</label>');
    const goal='Enable email updates';
    const first=await agent.run(goal);
    assert.equal(first.status,'completed',first.error??'Task failed');assert.equal(planCalls,1);
    const second=await agent.run(goal);
    assert.equal(second.status,'completed',second.error??'Task failed');
    assert.equal(second.metrics.workflowCacheHits,1);assert.equal(second.metrics.browserActions,0,'Do not replay the learned toggle after its completion condition is already true');
    assert.equal(planCalls,1);assert.equal(await agent.browser.page.getByRole('checkbox').isChecked(),true);
  }finally{await agent.close();store.close();}
});

test('invalid learned workflows fall back to the planner',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');let planCalls=0;
  const goal='Summarize the page',url=`${fixture.url}/demo`;
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    planCalls++;
    return PlanSchema.parse({goal:context.goal,steps:['Extract visible text'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'extraction_created',key:'text'}],continue:false});
  },repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra',adapters:[],browser:{allowedOrigins:[fixture.url]}});
  try{
    await agent.browser.launch();await agent.browser.navigate(url);
    const initial=await agent.observer.inspect(agent.browser.page),identity=[new URL(url).origin,normalizeIntent(goal),structureHash(initial)];
    const insert=store.db.prepare('INSERT INTO workflows(id,domain,intent,structure,workflow) VALUES(?,?,?,?,?)');
    insert.run('broken-json',...identity,'{invalid');
    insert.run('stale-plan',...identity,JSON.stringify({path:'/demo',plan:{}}));
    insert.run('mismatched-metadata',...identity,JSON.stringify({id:'another-row',origin:'https://other.test',path:'/demo',intent:'delete the account',structure:'stale',plan:{goal:'Delete the account',steps:['Extract visible text'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'extraction_created',key:'text'}],continue:false}}));
    const trace=await agent.run(goal,url);
    assert.equal(trace.status,'completed',trace.error??'Task failed');
    assert.equal(planCalls,1);
  }finally{await agent.close();store.close();await fixture.close();}
});

test('provider errors containing profile values are redacted from events and saved traces',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:'),secret='profile-secret-that-must-not-persist';
  const provider:LLMProvider={name:'fixture',plan:async()=>{throw new Error(secret);},repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,vault:{profile:{password:secret},files:{}},mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Summarize the page',fixture.url);
    assert.equal(trace.status,'failed');assert.equal(trace.error,'{{profile.password}}');
    assert(!JSON.stringify(agent.events).includes(secret));assert(!JSON.stringify(store.get(trace.id)).includes(secret));
  }finally{await agent.close();store.close();await fixture.close();}
});

test('credential query and fragment values are redacted before trace save and provider prompt',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');let firstSaved='',prompt='';
  const save=store.save.bind(store);store.save=trace=>{if(!firstSaved)firstSaved=JSON.stringify(trace);save(trace);};
  const provider:LLMProvider={name:'fixture',plan:async context=>{prompt=JSON.stringify(context);throw new Error('Synthetic provider failure');},repair:async()=>{throw new Error('Unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  const accessToken='access-query-secret-that-must-not-persist',apiKey='query-api-secret-that-must-not-persist',fragmentToken='oauth-fragment-token-that-must-not-persist',oauthCode='oauth-code-that-must-not-persist';
  try{
    const trace=await agent.run('Summarize the page',`${fixture.url}/demo?access_token=${accessToken}&api_key=${apiKey}&search=Paris#access_token=${fragmentToken}&code=${oauthCode}&state=keep`);
    assert.equal(trace.status,'failed');assert(!firstSaved.includes(accessToken));assert(!firstSaved.includes(apiKey));assert(!firstSaved.includes(fragmentToken));assert(!firstSaved.includes(oauthCode));
    assert.equal((JSON.parse(firstSaved) as {url:string}).url,`${fixture.url}/demo?access_token=REDACTED&api_key=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep`);
    assert(!prompt.includes(accessToken));assert(!prompt.includes(apiKey));assert(!prompt.includes(fragmentToken));assert(!prompt.includes(oauthCode));
    for(const secret of [accessToken,apiKey,fragmentToken,oauthCode])assert(!JSON.stringify(agent.events).includes(secret));
    assert.equal(trace.url,`${fixture.url}/demo?access_token=REDACTED&api_key=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep`);
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

test('uncertain-action repair uses page state refreshed after human review',async()=>{
  const store=new TraceStore(':memory:');let repairPage='';
  const provider:LLMProvider={name:'fixture',plan:async()=>{throw new Error('Unexpected plan');},repair:async context=>{repairPage=context.page;throw new Error('Stop after capturing repair context');}};
  const agent=new Agent({store,provider,mode:'ultra'});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<main><p>Before action</p></main>');
    const plan=PlanSchema.parse({goal:'Review the page',steps:['Click the control'],actions:[{type:'click',target:{role:'button',name:'Continue'}}],completion:[{type:'text_exists',value:'Reviewed state'}],continue:false});
    agent.executor.run=async action=>{
      await agent.browser.page.locator('main p').evaluate(el=>el.textContent='Action result awaiting review');
      return{action,startedAt:Date.now(),durationMs:1,success:false,error:'Synthetic uncertain click',uncertain:true};
    };
    agent.control.once('approval',()=>void agent.browser.page.locator('main p').evaluate(el=>el.textContent='Reviewed state').then(()=>agent.control.approve()));
    const trace=await agent.run('Review the page',undefined,plan);
    assert.equal(trace.status,'failed');assert.match(repairPage,/Reviewed state/);assert.doesNotMatch(repairPage,/Action result awaiting review/);
  }finally{await agent.close();store.close();}
});

test('max steps terminates repeated batches',async()=>{
  const fixture=await startFixtures();const store=new TraceStore(':memory:');
  const provider:LLMProvider={name:'test',plan:async context=>PlanSchema.parse({goal:context.goal,steps:['Read'],actions:[{type:'extract',key:'text',format:'text'}],completion:[{type:'element_visible',target:{css:'main'}}],continue:true}),repair:async()=>{throw new Error('unexpected repair');}};
  const agent=new Agent({store,provider,maxSteps:2,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Never-ending provider',fixture.url);assert.equal(trace.status,'failed');assert.match(trace.error??'',/limit/);assert.equal(trace.actions.length,2);
  }finally{await agent.close();store.close();await fixture.close();}
});

test('repeated actions get one bounded repair before the no-progress guard stops them',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');
  const extract=(key:string)=>({type:'extract' as const,format:'text' as const,key});
  const run=async(replacement:ReturnType<typeof extract>)=>{
    let repairCalls=0;
    const provider:LLMProvider={name:'fixture',plan:async()=>{throw new Error('Unexpected plan');},repair:async()=>{repairCalls++;return{actions:[replacement],replace:1};}};
    const agent=new Agent({store,provider,maxRepeatedStates:1,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
    try{
      const plan=PlanSchema.parse({goal:'Read this page',steps:['Read the page'],actions:[extract('repeated'),extract('repeated')],completion:[{type:'extraction_created',key:'summary'}],continue:false});
      const trace=await agent.run('Read this page',fixture.url+'/demo',plan);
      return{trace,repairCalls};
    }finally{await agent.close();}
  };
  try{
    const recovered=await run(extract('summary'));
    assert.equal(recovered.trace.status,'completed',recovered.trace.error??'Task failed');assert.equal(recovered.repairCalls,1);
    const stillRepeating=await run(extract('repeated'));
    assert.equal(stillRepeating.trace.status,'failed');assert.match(stillRepeating.trace.error??'',/Repeated state\/action loop detected/);assert.equal(stillRepeating.repairCalls,1);
  }finally{store.close();await fixture.close();}
});

test('planner context keeps accumulated extraction evidence within its character budget',async()=>{
  const store=new TraceStore(':memory:');let secondPage='',calls=0;
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    if(++calls===1)return PlanSchema.parse({goal:context.goal,steps:['Collect evidence'],actions:Array.from({length:8},(_,index)=>({type:'extract',key:`evidence-${index}`,format:'text'})),completion:[{type:'text_exists',value:'Budget test'}],continue:true});
    secondPage=context.page;
    return PlanSchema.parse({goal:context.goal,steps:['Finish'],actions:[{type:'extract',key:'final',format:'text'}],completion:[{type:'text_exists',value:'Budget test'}],continue:false});
  },repair:async()=>{throw new Error('unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra',useWorkflows:false,adapters:[]});
  try{
    await agent.browser.launch();await agent.browser.page.setContent(`<main><p>Budget test ${'x'.repeat(3500)}</p><p>${'y'.repeat(3500)}</p></main>`);
    const trace=await agent.run('Collect evidence',undefined);
    assert.equal(trace.status,'completed',trace.error??'Task failed');
    assert(secondPage.length>0);
    assert(secondPage.length<=9000,`planner context was ${secondPage.length} chars`);
    assert(secondPage.includes('evidence-7'));
  }finally{await agent.close();store.close();}
});

test('follow-up planner context retains unchanged controls across stateless calls',async()=>{
  const store=new TraceStore(':memory:');let plans=0,secondPage='';
  const provider:LLMProvider={name:'fixture',plan:async context=>{
    if(++plans===1)return PlanSchema.parse({goal:context.goal,steps:['Reveal notice'],actions:[{type:'click',target:{role:'button',name:'Reveal notice'}}],completion:[{type:'text_exists',value:'Notice revealed'}],continue:true});
    secondPage=context.page;
    return PlanSchema.parse({goal:context.goal,steps:['Finish workflow'],actions:[{type:'click',target:{role:'button',name:'Finish'}}],completion:[{type:'text_exists',value:'Workflow finished'}],continue:false});
  },repair:async()=>{throw new Error('unexpected repair');}};
  const agent=new Agent({store,provider,mode:'ultra',adapters:[],useWorkflows:false});
  try{
    await agent.browser.launch();await agent.browser.page.setContent('<button id="reveal">Reveal notice</button><button id="finish">Finish</button><p id="notice" hidden>Notice revealed</p><p id="result"></p>');
    await agent.browser.page.evaluate(()=>{document.querySelector('#reveal')!.addEventListener('click',()=>{document.querySelector('#notice')!.removeAttribute('hidden');});document.querySelector('#finish')!.addEventListener('click',()=>{document.querySelector('#result')!.textContent='Workflow finished';});});
    const trace=await agent.run('Finish the workflow');
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(plans,2);assert(secondPage.includes('Finish'));
  }finally{await agent.close();store.close();}
});

test('generic adapter extracts tables without invoking a provider',async()=>{
  const fixture=await startFixtures();const store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{const trace=await agent.run('Extract the table',fixture.url+'/wizard/results');assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(trace.metrics.llmCalls,0);assert.equal(trace.metrics.planBatches,0);}
  finally{await agent.close();store.close();await fixture.close();}
});

test('generic adapter reads page text without invoking a provider',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Read the page',fixture.url+'/demo');
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(trace.metrics.llmCalls,0);assert.equal(trace.metrics.planBatches,0);
    assert.equal(trace.actions[0]?.observedStateChanged,false,'A read can succeed without changing the observed page');
    assert(String(agent.browser.extractions[0]?.value).includes('Contact our team'));
  }finally{await agent.close();store.close();await fixture.close();}
});

test('generic adapter lists visible links without invoking a provider',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  try{
    const trace=await agent.run('Extract the links',fixture.url);
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(trace.metrics.llmCalls,0);assert.equal(trace.metrics.planBatches,0);
    assert((agent.browser.extractions[0]?.value as {text:string;url:string}[]).some(link=>link.text==='Contact form'&&link.url===fixture.url+'/demo'));
    const limited=await agent.run('List the first 3 links',fixture.url);
    assert.equal(limited.status,'completed',limited.error??'Task failed');assert.equal(limited.metrics.llmCalls,0);
    assert.equal((agent.browser.extractions[0]?.value as {text:string;url:string}[]).length,3);
    const shorter=await agent.run('List the first 1000 links',fixture.url);
    assert.equal(shorter.status,'completed',shorter.error??'Task failed');assert.equal(shorter.metrics.llmCalls,0);
    assert((agent.browser.extractions[0]?.value as {text:string;url:string}[]).length<1000);
  }finally{await agent.close();store.close();await fixture.close();}
});

test('download goals cannot complete without creating a browser download',async()=>{
  const fixture=await startFixtures(),store=new TraceStore(':memory:');
  const agent=new Agent({store,mode:'ultra',browser:{allowedOrigins:[fixture.url]}});
  const plan=PlanSchema.parse({goal:'Download the invoice',steps:['Open preferences'],actions:[{type:'click',target:{role:'button',name:'Open modal'}}],completion:[{type:'element_visible',target:{role:'dialog',name:'Preferences'}}],continue:false});
  try{
    const trace=await agent.run('Download the invoice',fixture.url+'/dynamic',plan,false);
    assert.equal(trace.status,'failed');assert.equal(agent.browser.downloads.length,0);
  }finally{await agent.close();store.close();await fixture.close();}
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
