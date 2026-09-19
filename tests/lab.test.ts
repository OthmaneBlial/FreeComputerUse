import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Agent} from '../src/agent/Agent.js';
import {Browser} from '../src/browser/Browser.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {PlanSchema} from '../src/actions/schema.js';
import type {LLMProvider} from '../src/llm/LLMProvider.js';
import {startLab} from '../scripts/lab-server.js';
import {complexScenarios,planFor} from '../scripts/complex-scenarios.js';

test('styled lab contains sourced real tasks and eight complex browser-only workflows',{timeout:120000},async()=>{
  const lab=await startLab(),dir=await mkdtemp(join(tmpdir(),'fcu-lab-'));
  const tasks=(await import(new URL('../lab/examples.js',import.meta.url).href)).practiceTasks as {id:string;goal:string}[];
  const browser=await new Browser().launch(),errors:string[]=[];
  browser.page.on('pageerror',error=>errors.push(error.message));
  browser.page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try{
    await browser.navigate(lab.url);assert.equal(await browser.page.locator('.task-card').count(),10);
    await browser.page.getByRole('tab',{name:'Practice workflows'}).click();assert.equal(await browser.page.locator('.task-card').count(),8);
    await browser.page.getByRole('button',{name:'Research & documents'}).click();assert.equal(await browser.page.locator('.task-card').count(),3);
    for(const width of [1440,390]){await browser.page.setViewportSize({width,height:900});assert(await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
    assert.deepEqual(errors,[]);
    for(const scenario of complexScenarios){
      const store=new TraceStore(':memory:'),goal=tasks.find(task=>task.id===scenario.id)!.goal,url=lab.url+'workspace.html?view='+scenario.view;
      const options={store,browser:{allowedOrigins:[new URL(url).origin],profileDir:join(dir,scenario.id)},downloadDir:join(dir,'downloads'),completionCriteria:scenario.criteria};
      const agent=new Agent(options);agent.control.on('approval',()=>agent.control.approve());
      agent.browser.interaction.on('pointer',()=>{throw new Error('Headless fixtures keep the fast execution path');});
      try{
        const trace=await agent.run(goal,url,planFor(scenario,goal));assert.equal(trace.status,'completed',scenario.id+': '+trace.error);assert(await scenario.oracle(agent),scenario.id+' independent result oracle');
        for(const width of [1440,390]){await agent.browser.page.setViewportSize({width,height:900});assert(await agent.browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),scenario.id+' responsive overflow');}
      }finally{await agent.close();}
      const repeated=new Agent(options);repeated.control.on('approval',()=>repeated.control.approve());
      try{const repeat=await repeated.run(goal,url);assert.equal(repeat.status,'completed',scenario.id+' learned repeat: '+repeat.error);assert.equal(repeat.metrics.llmCalls,0);assert(await scenario.oracle(repeated),scenario.id+' repeat oracle');}
      finally{await repeated.close();store.close();}
    }
  }finally{await browser.close();await lab.close();await rm(dir,{recursive:true,force:true});}
});

test('incident brief refuses to mark a synthetic rate-limit regression resolved',{timeout:20000},async()=>{
  const lab=await startLab(),browser=await new Browser().launch();
  try{
    await browser.navigate(lab.url+'workspace.html?view=incident');
    await browser.page.evaluate(()=>sessionStorage.setItem('northstar-v3-incident-filters',JSON.stringify({service:'API Gateway',severity:'High',window:'Last 24 hours'})));
    await browser.navigate(lab.url+'incident-brief.html');
    await browser.page.getByLabel('Incident ID').selectOption('INC-204');
    await browser.page.getByLabel('Affected endpoint').selectOption('/v1/search');
    await browser.page.getByLabel('Baseline 429 rate percent').fill('0.4');
    await browser.page.getByLabel('Incident 429 rate percent').fill('12.4');
    await browser.page.getByLabel('Triggering deployment').selectOption('dep-7c3');
    await browser.page.getByLabel('Configuration change').selectOption('burst_limit: 100 → 20');
    await browser.page.getByLabel('Decision').selectOption('Resolved');
    await browser.page.getByRole('button',{name:'Save incident brief locally'}).click();
    assert.match(await browser.page.getByRole('alert').innerText(),/conflicts/);
    assert.equal(await browser.page.getByRole('button',{name:'Download incident brief'}).isVisible(),false);
    assert.equal(await browser.page.evaluate(()=>localStorage.getItem('northstar-v3-incident-brief')),null);
  }finally{await browser.close();await lab.close();}
});

test('incident stage links use stable accessible names across documents',{timeout:20000},async()=>{
  const lab=await startLab(),browser=await new Browser().launch();
  try{
    await browser.navigate(lab.url+'incident-detail.html?id=INC-204');
    for(const [name,path] of [['Metrics','incident-metrics.html'],['Deployments','incident-deployments.html'],['Runbook','incident-runbook.html'],['Brief','incident-brief.html']] as const){
      await browser.page.getByRole('link',{name,exact:true}).click();
      assert(browser.page.url().endsWith(path),`Expected ${path}, got ${browser.page.url()}`);
    }
  }finally{await browser.close();await lab.close();}
});

test('saving a brief can reveal a download control for the next model batch',{timeout:20000},async()=>{
  const lab=await startLab(),dir=await mkdtemp(join(tmpdir(),'fcu-incident-download-')),store=new TraceStore(':memory:');
  const url=lab.url+'incident-brief.html',completion=[{type:'download_created' as const,value:'northstar-incident-brief.txt'}];
  const plans=[
    PlanSchema.parse({goal:'Save and download the brief',steps:['Save the verified draft'],actions:[
      {type:'select',target:{role:'combobox',name:'Incident ID'},value:'INC-204'},
      {type:'select',target:{role:'combobox',name:'Affected endpoint'},value:'/v1/search'},
      {type:'fill',target:{role:'spinbutton',name:'Baseline 429 rate percent'},value:'0.4'},
      {type:'fill',target:{role:'spinbutton',name:'Incident 429 rate percent'},value:'12.4'},
      {type:'select',target:{role:'combobox',name:'Triggering deployment'},value:'dep-7c3'},
      {type:'select',target:{role:'combobox',name:'Configuration change'},value:'burst_limit: 100 → 20'},
      {type:'select',target:{role:'combobox',name:'Decision'},value:'Needs engineer review'},
      {type:'click',target:{role:'button',name:'Save incident brief locally'}},
    ],completion,continue:false}),
    PlanSchema.parse({goal:'Save and download the brief',steps:['Download the saved draft'],actions:[{type:'download',target:{role:'button',name:'Download incident brief'},filename:'northstar-incident-brief.txt'}],completion,continue:false}),
  ];
  let calls=0;const provider:LLMProvider={name:'fixture',plan:async()=>plans[calls++]??Promise.reject(new Error('Unexpected third plan')),repair:async()=>{throw new Error('A repair should not be necessary');}};
  const agent=new Agent({store,provider,maxRepairs:0,browser:{allowedOrigins:[new URL(url).origin]},downloadDir:join(dir,'downloads'),completionCriteria:completion});
  agent.control.on('approval',()=>agent.control.approve());
  try{
    await agent.open(lab.url+'workspace.html?view=incident');
    await agent.browser.page.evaluate(()=>sessionStorage.setItem('northstar-v3-incident-filters',JSON.stringify({service:'API Gateway',severity:'High',window:'Last 24 hours'})));
    await agent.browser.navigate(url);
    const trace=await agent.run('Save and download the synthetic incident brief');
    assert.equal(trace.status,'completed',trace.error??'Task failed');assert.equal(calls,2);assert.equal(agent.browser.downloads.length,1);
  }finally{await agent.close();store.close();await lab.close();await rm(dir,{recursive:true,force:true});}
});

test('quarter-close review rejects a plausible but unposted ledger total',{timeout:20000},async()=>{
  const lab=await startLab(),browser=await new Browser().launch();
  try{
    await browser.navigate(lab.url+'workspace.html?view=close');
    await browser.page.evaluate(()=>sessionStorage.setItem('northstar-v3-close-scope',JSON.stringify({quarter:'Q3 2026',channel:'Direct'})));
    await browser.navigate(lab.url+'close-review.html');
    await browser.page.getByLabel('Revenue EUR').fill('9400');
    await browser.page.getByLabel('Booked ledger EUR').fill('9400');
    await browser.page.getByLabel('Variance EUR').fill('0');
    await browser.page.getByLabel('Open adjustment').selectOption('ADJ-042');
    await browser.page.getByLabel('Review decision').selectOption('Ready to close');
    await browser.page.getByRole('button',{name:'Save review draft'}).click();
    assert.match(await browser.page.getByRole('alert').innerText(),/do not match/);
    assert.equal(await browser.page.getByRole('button',{name:'Download close dossier'}).isVisible(),false);
    assert.equal(await browser.page.evaluate(()=>localStorage.getItem('northstar-v3-close-report')),null);
  }finally{await browser.close();await lab.close();}
});

test('a clicked export button produces a saved download receipt instead of an unverified click',{timeout:30000},async()=>{
  const lab=await startLab(),dir=await mkdtemp(join(tmpdir(),'fcu-export-')),store=new TraceStore(':memory:');
  const scenario=complexScenarios.find(item=>item.id==='close')!;
  const goal='Reconcile Q3 2026 Direct revenue and ledger, review ADJ-042, save and download the close dossier.';
  const url=lab.url+'workspace.html?view=close';
  const plan=planFor(scenario,goal);
  plan.actions[plan.actions.length-1]={type:'click',target:{role:'button',name:'Download close dossier'}};
  const agent=new Agent({store,browser:{allowedOrigins:[new URL(url).origin],profileDir:join(dir,'profile')},downloadDir:join(dir,'downloads'),completionCriteria:scenario.criteria});
  agent.control.on('approval',()=>agent.control.approve());
  try{
    const trace=await agent.run(goal,url,plan);
    assert.equal(trace.status,'completed',trace.error??'Task failed');
    assert.equal(trace.actions.at(-1)?.action.type,'download');
    assert(await scenario.oracle(agent));
  }finally{await agent.close();store.close();await lab.close();await rm(dir,{recursive:true,force:true});}
});
