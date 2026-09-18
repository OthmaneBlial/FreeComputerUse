import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Agent} from '../src/agent/Agent.js';
import {Browser} from '../src/browser/Browser.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {startLab} from '../scripts/lab-server.js';
import {complexScenarios,planFor} from '../scripts/complex-scenarios.js';

test('styled lab contains sourced real tasks and six complex browser-only workflows',{timeout:90000},async()=>{
  const lab=await startLab(),dir=await mkdtemp(join(tmpdir(),'fcu-lab-'));
  const tasks=(await import(new URL('../lab/examples.js',import.meta.url).href)).practiceTasks as {id:string;goal:string}[];
  const browser=await new Browser().launch(),errors:string[]=[];
  browser.page.on('pageerror',error=>errors.push(error.message));
  browser.page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try{
    await browser.navigate(lab.url);assert.equal(await browser.page.locator('.task-card').count(),10);
    await browser.page.getByRole('tab',{name:'Practice workflows'}).click();assert.equal(await browser.page.locator('.task-card').count(),6);
    await browser.page.getByRole('button',{name:'Research & documents'}).click();assert.equal(await browser.page.locator('.task-card').count(),2);
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
