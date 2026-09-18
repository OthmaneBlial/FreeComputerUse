import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {loadEnvironment,runtimeConfig} from '../src/config.js';
import {startLab} from './lab-server.js';
import {complexScenarios,planFor} from './complex-scenarios.js';
const live=process.argv.includes('--live'),selection=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
const chosen=complexScenarios.filter(s=>!selection||selection.split(',').includes(s.id));if(!chosen.length)throw new Error('No selected complex scenario');
const tasks=(await import(new URL('../lab/examples.js',import.meta.url).href)).practiceTasks as {id:string;goal:string}[];
loadEnvironment();const lab=await startLab(),dir=await mkdtemp(resolve('.fcu/complex-'));
const results=[];
try{
 for(const scenario of chosen){
  const config=runtimeConfig();if(live&&!config.provider)throw new Error('Live mode needs the ignored local LLM_API_KEY');
  const store=new TraceStore(join(dir,scenario.id+'.sqlite')),goal=tasks.find(task=>task.id===scenario.id)!.goal,url=lab.url+'workspace.html?view='+scenario.view;
  const options={store,browser:{allowedOrigins:[new URL(url).origin],profileDir:join(dir,scenario.id)},downloadDir:join(dir,'downloads'),completionCriteria:scenario.criteria};
  const agent=new Agent({...options,provider:live?config.provider:undefined,budget:config.budget});
  const permit=(current:Agent)=>current.control.on('approval',pending=>{const action=typeof pending.action==='string'?JSON.parse(pending.action):pending.action;if(action?.type==='siteAccess'&&action.origin!==new URL(url).origin)current.control.reject();else current.control.approve();});
  permit(agent);console.log(`Running ${scenario.id} (${live?'real Flash':'authored plan'})…`);
  try{
   const trace=await agent.run(goal,url,live?undefined:planFor(scenario,goal));const correct=trace.status==='completed'&&await scenario.oracle(agent);
   const documents=[...new Set(agent.browser.responses.filter(r=>r.resource==='document').map(r=>new URL(r.url).pathname))];
   await agent.close();let learnedRepeat;
   if(correct){const repeat=new Agent(options);permit(repeat);try{const repeated=await repeat.run(goal,url);const correct=repeated.status==='completed'&&await scenario.oracle(repeat);learnedRepeat={status:repeated.status,correct,...repeated.metrics,error:repeated.error};if(!correct||repeated.metrics.llmCalls!==0)process.exitCode=1;}finally{await repeat.close();}}
   else process.exitCode=1;
   results.push({scenario:scenario.id,status:trace.status,correct,...trace.metrics,documentPages:documents,error:trace.error,learnedRepeat});
   console.log(`${trace.status}; correct ${correct}; ${trace.metrics.browserActions} actions, ${trace.metrics.llmCalls} model calls; repeat ${learnedRepeat?.status??'not run'}`);
  }finally{await agent.close();store.close();}
 }
}finally{await lab.close();}
await mkdir('artifacts',{recursive:true});const path=`artifacts/benchmark-complex-${live?'live':'authored'}${selection?'-'+selection.replace(/[^a-z0-9,-]/g,''):''}.json`;
await writeFile(path,JSON.stringify({measuredAt:new Date().toISOString(),mode:live?'real-deepseek-flash-local-styled-lab':'authored-action-plans-no-model',safety:'Project-owned synthetic pages on loopback. Harness explicitly approves this local origin and simulated browser-only actions. Product normal mode waits for human approval. No real bookings, messages, purchases or account changes.',method:'Six complex goals, independent state/content/file oracles; three flows use distinct HTML documents. Each successful run repeats with no provider installed. Authored mode validates execution only; it is not model-planning evidence.',limitations:'Single trials on controlled pages, not general website success rates. Costs are estimates, not billing receipts.',results},null,2)+'\n');console.log('Report: '+path);
