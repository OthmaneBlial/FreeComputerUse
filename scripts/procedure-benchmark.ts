// Real model measurements for the Play Console simulator: one exploration, then replays with new values,
// a minor UI change and a French UI. Every number printed comes from the run's own trace.
import {mkdir,readFile,rm,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore,type Trace} from '../src/history/TraceStore.js';
import {WorkflowEngine} from '../src/workflows/WorkflowEngine.js';
import {loadEnvironment,runtimeConfig} from '../src/config.js';
import {startFixtures} from '../fixtures/server.js';

loadEnvironment();
if(!runtimeConfig().provider)throw new Error('This benchmark makes real model calls: configure LLM_PROVIDER and its key first');
const fixture=await startFixtures(),folder=resolve('.fcu/benchmark/procedures');
await rm(folder,{recursive:true,force:true});await mkdir(folder,{recursive:true,mode:0o700});
const store=new TraceStore(join(folder,'history.sqlite')),engine=new WorkflowEngine(store),start=`${fixture.url}/play/console`;
const bundle=async(code:number,version:string)=>{const path=join(folder,`snake-${version}.aab`);await writeFile(path,`PK simulator bundle\nversionCode=${code}\nversionName=${version}\n`,{mode:0o600});return path;};
interface Row {run:string;ui:string;status:string;verified:boolean;llmCalls:number;inputTokens:number;outputTokens:number;estimatedCostUSD:number|null;usageEstimated:boolean;durationMs:number;approvals:number;repairs:number;procedureVersion?:number;error?:string}
const rows:Row[]=[];
async function measure(run:string,ui:string,code:number,work:(agent:Agent)=>Promise<Trace>,files:Record<string,string>={}){
  const config=runtimeConfig();let approvals=0;
  const agent=new Agent({store,provider:config.provider,budget:config.budget,vault:{profile:{},files},confirmation:'sensitive',maxRepairs:12,maxDurationMs:config.maxDurationMs??300000,browser:{headless:true,allowedOrigins:[fixture.url]}});
  // The simulator is local and harmless, so the benchmark approves; it still counts every approval the agent asked for.
  agent.control.on('approval',pending=>{if(typeof pending.action==='string')approvals++;agent.control.approve();});
  try{
    const trace=await work(agent),metrics=trace.metrics as Record<string,number|null|boolean>;
    const verified=fixture.play.apps[0]!.releases.some(release=>release.versionCode===code&&release.status==='in_review');
    rows.push({run,ui,status:trace.status,verified,llmCalls:Number(metrics.llmCalls),inputTokens:Number(metrics.inputTokens),outputTokens:Number(metrics.outputTokens),estimatedCostUSD:metrics.estimatedCostUSD as number|null,usageEstimated:!!metrics.usageEstimated,
      durationMs:trace.durationMs,approvals,repairs:Number(metrics.repairs),error:trace.error});
    console.log(`${run} · ${ui}: ${trace.status}${verified?' (verified in review)':''} · ${metrics.llmCalls} model calls · ${metrics.inputTokens}/${metrics.outputTokens} tokens`);
    return trace;
  }finally{await agent.close();}
}
try{
  const first=await measure('1. Exploration with the model','English',14,async agent=>agent.run(
    'Publish version 1.4 of the app "Snake Arena" to the production track with the local file {{files.bundle}} as the app bundle and the release notes "Bug fixes". Open the app, Test and release, Production, create a new release, upload the bundle, wait until it is processed, add the notes, go to the review, save and publish, then send the changes for review.',
    start),{bundle:await bundle(14,'1.4')});
  if(first.status!=='completed')throw new Error('The exploration did not complete, so there is nothing to replay');
  first.completion=[{type:'text_exists',value:'In review'}];
  const saved=engine.saveSteps({name:'Publish a Play production release',description:'Upload an app bundle and send a production release for review',startUrl:start,
    actions:first.actions.filter(result=>result.success).map(result=>result.action),completion:first.completion,
    parameters:[{name:'app',value:'Snake Arena',kind:'text',required:true,aliases:['app','application',"l'app"]},{name:'bundle',value:'{{files.bundle}}',kind:'file',required:true,aliases:['aab','bundle','file','fichier']},
      {name:'notes',value:'Bug fixes',kind:'text',required:true},{name:'version',value:'1.4',kind:'text',required:true,pattern:'^\\d+(\\.\\d+){0,3}$'},{name:'code',value:'14',kind:'text',required:true,pattern:'^\\d+$'}]},'learned',{learnedFrom:first.id});
  await writeFile(join(folder,'procedure-v1.json'),JSON.stringify(engine.export(saved.id),null,2));
  const replay=async(run:string,ui:string,code:number,version:string,query='')=>{
    const path=await bundle(code,version),values:Record<string,string>={app:'Snake Arena',bundle:path,notes:`Release ${version}`,version,code:String(code)};
    // saveSteps keeps only parameters whose value appears in the learned steps.
    const declared=new Set((engine.get(saved.id)?.parameters??[]).map(param=>param.name));
    await measure(run,ui,code,agent=>agent.runProcedure(saved.id,Object.fromEntries(Object.entries(values).filter(([name])=>declared.has(name))),query?`${start}?${query}`:undefined));
    rows.at(-1)!.procedureVersion=engine.get(saved.id)?.version;
  };
  await replay('2. Replay, new values','English',15,'1.5');
  await replay('3. Replay after a minor UI change','English, variant 2',16,'1.6','variant=2');
  await replay('4. Replay again','English, variant 2',17,'1.7','variant=2');
  await replay('5. Replay on a French UI','French',18,'1.8','lang=fr');
  await replay('6. Replay again','French',19,'1.9','lang=fr');
  await replay('7. Back to the original UI','English',20,'2.0');
  await replay('8. French again','French',21,'2.1','lang=fr');
  await replay('9. English again','English',22,'2.2');
  await writeFile(join(folder,'procedure-final.json'),JSON.stringify(engine.export(saved.id),null,2));
}finally{
  const config=runtimeConfig(),report={date:new Date().toISOString(),provider:config.provider?.name,simulator:'fixtures/playConsole.ts (local, not Google software)',rows};
  // One file per model; each run adds a trial, so the spread across trials stays visible.
  const path=`artifacts/benchmark-procedures-${(config.provider?.name??'none').replace(/[^\w.-]/g,'-')}.json`;
  const trials=await readFile(path,'utf8').then(text=>(JSON.parse(text) as {trials:unknown[]}).trials,()=>[]);
  await mkdir('artifacts',{recursive:true});await writeFile(path,JSON.stringify({trials:[...trials,report]},null,2)+'\n');
  console.table(rows.map(({error:_error,...row})=>row));console.log(`Saved ${path}`);
  store.close();await fixture.close();
}
