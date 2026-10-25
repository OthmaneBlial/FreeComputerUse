#!/usr/bin/env node
import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { join,resolve } from 'node:path';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { Agent } from '../agent/Agent.js';
import { TraceStore } from '../history/TraceStore.js';
import { ProfileStore } from '../profile/ProfileStore.js';
import { VariableResolver } from '../profile/VariableResolver.js';
import { WorkflowEngine,type Parameter } from '../workflows/WorkflowEngine.js';
import { parseSteps } from '../teach/steps.js';
import { Browser } from '../browser/Browser.js';
import { Observer } from '../browser/Observer.js';
import { PRESETS,PROVIDER_IDS,ProviderIdSchema,providerStatuses } from '../llm/providers.js';
import { secretStore } from '../profile/SecretStore.js';
import { ensureDataDirectory,loadEnvironment,runtimeConfig } from '../config.js';
import type { ConfirmationPolicy } from '../actions/policy.js';
import { z } from 'zod';

const packageManifest=JSON.parse(await readFile(new URL('../../package.json',import.meta.url),'utf8')) as {version:string};
loadEnvironment();const program=new Command().name('agent').description('DOM-first browser automation: plan once, execute locally.').version(packageManifest.version);
const policySchema=z.enum(['sensitive','always','never']);
interface RunOptions {provider?:string;model?:string;headed?:boolean;debug?:boolean;profile?:string;allowOrigin?:string[];allowExternal?:boolean;confirmation?:string;workflows?:boolean;maxSteps?:string;maxRepairs?:string;ephemeral?:boolean;expectText?:string;expectUrl?:string;ultra?:boolean}
function runFlags(command:Command){return command.option('--headed','Show Chromium').option('--debug','Log all observe/plan/execute/verify/repair events').option('--profile <file>','Use a local profile JSON file').option('--allow-origin <url>','Allow another exact origin',(value:string,old:string[])=>[...old,new URL(value).origin],[]).option('--allow-external','Allow browser requests outside the origin allowlist').option('--confirmation <policy>','sensitive | always | never','sensitive').option('--no-workflows','Skip learned workflow lookup').option('--max-steps <n>','Maximum browser actions','120').option('--max-repairs <n>','Maximum model repairs','3').option('--ephemeral','Do not reuse saved browser cookies/session').option('--expect-text <text>','Trusted final text criterion the model cannot weaken').option('--expect-url <part>','Trusted final URL substring the model cannot weaken').option('--ultra','Explicit Ultra mode: skip website and sensitive-action approvals').option('--provider <id>','Model provider for this task: '+PROVIDER_IDS.join(', ')).option('--model <model>','Model for this task');}
async function makeAgent(url:string,options:RunOptions){
  const config=runtimeConfig({provider:options.provider?ProviderIdSchema.parse(options.provider):undefined,model:options.model});ensureDataDirectory(config.dataDir);const store=new TraceStore(join(config.dataDir,'history.sqlite'));
  try{
    const vault=await new ProfileStore(options.profile?resolve(options.profile):join(config.dataDir,'profile.json')).load();
    const agent=new Agent({store,provider:config.provider,budget:config.budget,vault,useWorkflows:options.workflows,
      mode:options.ultra?'ultra':'normal',
      confirmation:policySchema.parse(options.confirmation??'sensitive'),downloadDir:join(config.dataDir,'downloads'),
      completionCriteria:[...(options.expectText?[{type:'text_exists' as const,value:options.expectText}]:[]),...(options.expectUrl?[{type:'url_contains' as const,value:options.expectUrl}]:[])],
      maxSteps:z.coerce.number().int().positive().parse(options.maxSteps??120),maxDurationMs:config.maxDurationMs??undefined,vision:config.vision,maxRepairs:z.coerce.number().int().nonnegative().parse(options.maxRepairs??8),
      browser:{headless:!options.headed,profileDir:options.ephemeral?undefined:join(config.dataDir,'browser'),allowedOrigins:[new URL(url).origin,...options.allowOrigin??[]],allowExternal:options.allowExternal}});
    return{agent,store};
  }catch(error){store.close();throw error;}
}
function showTrace(trace:Awaited<ReturnType<Agent['run']>>){
  console.log(`\n${trace.status.toUpperCase()} ${trace.id}`);
  for(const result of trace.actions)if(result.success&&result.data)console.log(JSON.stringify(result.data,null,2));
  console.log(JSON.stringify(trace.metrics,null,2));if(trace.error)console.error(trace.error);
  if(trace.status!=='completed')process.exitCode=1;
}
function connectEvents(agent:Agent,debug:boolean,rl?:ReturnType<typeof createInterface>){
  agent.on('event',event=>{if(debug||['PLAN','REPAIR','HUMAN','ERROR','DONE','CACHE','LOCAL'].includes(event.phase))console.log(`[${event.phase}] ${event.message}`);});
  agent.control.on('approval',async pending=>{
    if(!stdin.isTTY){console.error('Human approval needs a terminal or the local UI; action rejected.');agent.control.reject();return;}
    const reader=rl??createInterface({input:stdin,output:stdout}),cancellation=new AbortController();
    const onChange=()=>{if(agent.control.stopped||agent.control.pending!==pending)cancellation.abort();};agent.control.on('change',onChange);
    try{
      while(agent.control.pending===pending&&!agent.control.stopped){
        const answer=(await reader.question(`${pending.reason}\n${JSON.stringify(pending.action)}\nApprove? [y/N] `,{signal:cancellation.signal})).trim();
        if(answer===':stop'){agent.control.stop();break;}
        if(answer===':pause'){agent.control.pause();continue;}
        if(answer===':resume'){agent.control.resume();continue;}
        if(agent.control.pending!==pending||agent.control.stopped)break;
        if(/^(y|yes|:approve)$/i.test(answer))agent.control.approve();else agent.control.reject();
        break;
      }
    }catch{if(agent.control.pending===pending&&!agent.control.stopped)agent.control.reject();}
    finally{agent.control.off('change',onChange);if(!rl)reader.close();}
  });
}
async function interactive(url?:string,options:RunOptions={}){
  if(!stdin.isTTY)throw new Error('Interactive mode requires a terminal. Use agent run or agent ui.');
  const reader=createInterface({input:stdin,output:stdout});
  const start=url??await reader.question('Starting URL: ');
  const {agent,store}=await makeAgent(start,{...options,headed:true}).catch(error=>{reader.close();throw error;});connectEvents(agent,!!options.debug,reader);
  try{
    await agent.open(start);console.log(`FreeComputerUse · ${agent.options.provider?.name??'local workflows only'}\nCommands: :pause :resume :approve :reject :stop :inspect :quit`);
    while(true){const goal=(await reader.question('> ')).trim();if(!goal)continue;if(goal===':quit')break;
      if(goal===':inspect'){console.log(agent.variables.redact(agent.observer.compressor.compress(await agent.observe()).text));continue;}
      if(goal.startsWith(':')){console.log('Control commands are available while a task runs, or in the local UI.');continue;}
      // Read input while the run is active so humans can take/return control.
      const handler=(line:string)=>{if(agent.control.pending)return;const control=line.trim();if(control===':pause')agent.control.pause();if(control===':resume')agent.control.resume();if(control===':stop')agent.control.stop();};
      reader.on('line',handler);
      try{showTrace(await agent.run(goal));}finally{reader.off('line',handler);}
      if(agent.control.stopped)break;
    }
  }finally{reader.close();await agent.close();store.close();}
}

runFlags(program.command('run <goal> <url>').description('Run a natural language browser task')).action(async(goal:string,url:string,options:RunOptions)=>{
  const {agent,store}=await makeAgent(url,options);connectEvents(agent,!!options.debug);
  const interrupt=()=>agent.control.stop();process.once('SIGINT',interrupt);
  try{showTrace(await agent.run(goal,url));}finally{process.off('SIGINT',interrupt);await agent.close();store.close();}
});
runFlags(program.command('open <url>').description('Open a persistent browser and enter tasks')).action(interactive);
program.command('inspect <url>').option('--region <region>','Form id, tag or accessible region name').option('--level <n>','1 overview, 2 controls, 3 component','2').option('--screenshot <file>','Explicit local screenshot fallback').option('--accessibility','Show accessibility snapshot').option('--ultra','Skip the website access prompt').action(async(url:string,options:{region?:string;level:string;screenshot?:string;accessibility?:boolean;ultra?:boolean})=>{
  const store=new TraceStore(':memory:'),agent=new Agent({store,mode:options.ultra?'ultra':'normal',browser:{allowedOrigins:[new URL(url).origin]}});
  connectEvents(agent,false);
  try{const state=await agent.open(url);const scoped=options.region?await agent.observer.inspect(agent.browser.page,options.region):state;
    console.log(agent.variables.redact(options.accessibility?await agent.observer.accessibility(agent.browser.page):agent.observer.compressor.compress(scoped,{level:z.coerce.number().int().min(1).max(3).parse(options.level) as 1|2|3}).text));
    if(options.screenshot){const file=resolve(options.screenshot);await mkdir(join(file,'..'),{recursive:true});await agent.browser.page.screenshot({path:file});console.log(`Saved local screenshot: ${file}`);}}
  finally{await agent.close();store.close();}
});
runFlags(program.command('replay <id>').option('--url <url>','Override starting URL')).action(async(id:string,options:RunOptions&{url?:string})=>{
  const config=runtimeConfig();ensureDataDirectory(config.dataDir);const lookup=new TraceStore(join(config.dataDir,'history.sqlite'));const trace=lookup.get(id);lookup.close();if(!trace)throw new Error('Run not found');
  const {agent,store}=await makeAgent(options.url??trace.url,options);connectEvents(agent,!!options.debug);
  try{showTrace(await agent.replay(trace,options.url));}finally{await agent.close();store.close();}
});
program.command('history').option('--limit <n>','Maximum rows','30').action(options=>{const config=runtimeConfig();ensureDataDirectory(config.dataDir);const store=new TraceStore(join(config.dataDir,'history.sqlite'));try{console.log(new VariableResolver().redact(JSON.stringify(store.history(z.coerce.number().int().min(1).max(1000).parse(options.limit)),null,2)));}finally{store.close();}});
const collect=(value:string,old:string[])=>[...old,value];
const pairs=(items:string[])=>Object.fromEntries(items.map(item=>{const at=item.indexOf('=');if(at<1)throw new Error(`Use name=value, not ${item}`);return[item.slice(0,at),item.slice(at+1)];}));
function withProcedures<T>(work:(engine:WorkflowEngine)=>T):T{const config=runtimeConfig();ensureDataDirectory(config.dataDir);const store=new TraceStore(join(config.dataDir,'history.sqlite'));try{return work(new WorkflowEngine(store));}finally{store.close();}}
const procedures=program.command('procedures').description('Saved procedures: list, find, run, teach, write, edit, export and import');
procedures.action(()=>withProcedures(engine=>{
  const list=engine.list();if(!list.length)console.log('No procedures yet. Teach one with `agent procedures teach <url> --name "…"`.');
  for(const item of list)console.log(`${item.id}  ${item.name}\n    ${item.domain} · ${item.source} · v${item.version} · ${item.steps} steps · ${item.runs?`${item.completed}/${item.runs} runs succeeded`:'not run yet'}${item.parameters.length?' · asks for '+item.parameters.map(param=>param.name).join(', '):''}`);
}));
procedures.command('show <id>').description('Show steps, parameters, versions and recent runs').action((id:string)=>withProcedures(engine=>{const workflow=engine.get(id);if(!workflow)throw new Error('Procedure not found');console.log(JSON.stringify({...workflow,summary:engine.summary(id),runs:engine.runs(id)},null,2));}));
procedures.command('find <request>').description('Find the procedure for a request and the values it can read from it').option('--url <url>','Only procedures for this site').action((request:string,options:{url?:string})=>withProcedures(engine=>{
  const matches=engine.find(request,options.url);if(!matches.length){console.log('No saved procedure matches this request.');process.exitCode=1;}
  for(const match of matches.slice(0,5))console.log(`${match.workflow.id}  ${engine.label(match.workflow)}  (match ${Math.round(match.score*100)}%)\n    values: ${JSON.stringify(match.values)}${match.missing.length?`\n    missing: ${match.missing.map(param=>param.name).join(', ')}`:''}`);
}));
runFlags(procedures.command('run <procedure>').description('Run a procedure by id, or by a request such as "Deploy version 1.4 of app X with ./app.aab"')
  .option('--param <name=value>','Parameter value (repeatable)',collect,[]).option('--url <url>','Start on another page of the same site')).action(async(target:string,options:RunOptions&{param:string[];url?:string})=>{
  const found=withProcedures(engine=>{const workflow=engine.get(target);if(workflow)return{workflow,values:{} as Record<string,string>};const match=engine.find(target,options.url)[0];if(!match)throw new Error('No saved procedure matches this request; see `agent procedures`');return match;});
  const values={...found.values,...pairs(options.param)},params=found.workflow.parameters??[];
  const missing=params.filter(param=>param.required&&!values[param.name]);
  if(missing.length){
    if(!stdin.isTTY)throw new Error(`Missing parameter(s): ${missing.map(param=>param.name).join(', ')}. Pass them with --param name=value`);
    const reader=createInterface({input:stdin,output:stdout});
    try{for(const param of missing)values[param.name]=(await reader.question(`${param.name}${param.kind==='file'?' (file path)':''}${param.description?` — ${param.description}`:''}: `)).trim();}finally{reader.close();}
  }
  const {agent,store}=await makeAgent(options.url??found.workflow.startUrl??found.workflow.origin+found.workflow.path,options);connectEvents(agent,!!options.debug);
  const interrupt=()=>agent.control.stop();process.once('SIGINT',interrupt);
  console.log(`Procedure: ${found.workflow.name??found.workflow.plan.goal} (v${found.workflow.version??1}). The model is only called if a step must be repaired.`);
  try{showTrace(await agent.runProcedure(found.workflow.id,values,options.url));}finally{process.off('SIGINT',interrupt);await agent.close();store.close();}
});
runFlags(procedures.command('teach <url>').description('Record what you do in a browser window and save it as a procedure').requiredOption('--name <name>','Procedure name')
  .option('--description <text>','What it does, to find it later').option('--param <name=value>','A value you type that should change between runs (repeatable)',collect,[])).action(async(url:string,options:RunOptions&{name:string;description?:string;param:string[]})=>{
  if(!stdin.isTTY)throw new Error('Teaching needs a terminal; use `agent ui` for the dashboard');
  const reader=createInterface({input:stdin,output:stdout});
  const {agent,store}=await makeAgent(url,{...options,headed:true}).catch(error=>{reader.close();throw error;});connectEvents(agent,!!options.debug,reader);
  agent.on('event',event=>{if(event.phase==='TEACH')console.log(`[TEACH] ${event.message}`);});
  try{
    await agent.startTeaching(url);await reader.question('Do the task in the browser window, then press Enter here to save it. ');
    const recording=agent.finishTeaching(),declared:(Parameter&{value?:string})[]=Object.entries(pairs(options.param)).map(([name,value])=>({name,value,kind:'text',required:true}));
    const saved=new WorkflowEngine(store).saveSteps({name:options.name,description:options.description,startUrl:recording.startUrl,actions:recording.actions,parameters:[...declared,...recording.parameters],expectText:options.expectText},'taught',{structure:recording.structure});
    console.log(`Saved ${saved.id} “${saved.name}” with ${saved.plan.actions.length} steps${saved.parameters?.length?`; asks for ${saved.parameters.map(param=>param.name).join(', ')}`:''}.`);
  }finally{reader.close();await agent.close();store.close();}
});
procedures.command('create').description('Save a procedure written as steps in a text file').requiredOption('--name <name>','Procedure name').requiredOption('--steps <file>','Steps file, one step per line')
  .option('--description <text>','What it does').option('--param <name=value>','Replace a literal value with a parameter (repeatable)',collect,[]).action(async(options:{name:string;steps:string;description?:string;param:string[]})=>{
  const parsed=parseSteps(await readFile(resolve(options.steps),'utf8'),options.name);if(!parsed.startUrl)throw new Error('Start the steps with: open <url>');
  const declared=Object.entries(pairs(options.param)).map(([name,value])=>({name,value,kind:'text' as const,required:true}));
  const saved=withProcedures(engine=>engine.saveSteps({name:options.name,description:options.description,startUrl:parsed.startUrl!,actions:parsed.plan.actions,completion:parsed.plan.completion,parameters:[...declared,...parsed.parameters]},'taught'));
  console.log(`Saved ${saved.id} “${saved.name}”${saved.parameters?.length?`; asks for ${saved.parameters.map(param=>param.name).join(', ')}`:''}.`);
});
procedures.command('rename <id> <name>').action((id:string,name:string)=>withProcedures(engine=>console.log(`Renamed to “${engine.rename(id,name).name}”.`)));
procedures.command('duplicate <id>').action((id:string)=>withProcedures(engine=>console.log(`Copied to ${engine.duplicate(id).id}.`)));
procedures.command('delete <id>').action((id:string)=>withProcedures(engine=>{if(!engine.remove(id))throw new Error('Procedure not found');console.log('Deleted the procedure and its run history.');}));
procedures.command('restore <id> <version>').description('Bring back the steps of an earlier version as a new version').action((id:string,version:string)=>withProcedures(engine=>console.log(`Now at version ${engine.restore(id,z.coerce.number().int().min(1).parse(version)).version}.`)));
procedures.command('export <id>').description('Write a portable copy without run history or values').option('--out <file>','Output file').action(async(id:string,options:{out?:string})=>{
  const data=JSON.stringify(withProcedures(engine=>engine.export(id)),null,2);if(options.out){await writeFile(resolve(options.out),data+'\n');console.log(`Exported to ${resolve(options.out)}.`);}else console.log(data);
});
procedures.command('import <file>').action(async(file:string)=>{const data=JSON.parse(await readFile(resolve(file),'utf8'));const saved=withProcedures(engine=>engine.import(data));console.log(`Imported ${saved.id} “${saved.name}”.`);});
program.command('workflows').option('--show <id>','Show a learned semantic workflow').action(options=>{const config=runtimeConfig();ensureDataDirectory(config.dataDir);const store=new TraceStore(join(config.dataDir,'history.sqlite'));try{const workflows=new WorkflowEngine(store);console.log(JSON.stringify(options.show?workflows.get(options.show)??'Not found':workflows.list(),null,2));}finally{store.close();}});
program.command('config').option('--profile <file>','Import a profile/files JSON into the local vault').action(async(options:{profile?:string})=>{
  const config=runtimeConfig();ensureDataDirectory(config.dataDir);const profile=new ProfileStore(join(config.dataDir,'profile.json'));
  if(options.profile){await profile.save(JSON.parse(await readFile(resolve(options.profile),'utf8')));console.log('Local profile imported (mode 0600).');}
  const vault=await profile.load();console.log(JSON.stringify({dataDir:config.dataDir,model:config.provider?.name??'not configured',providers:Object.fromEntries(providerStatuses(process.env,config.secrets).map(status=>[status.id,status.configured])),budget:config.budget.limits,profileAliases:Object.keys(vault.profile),fileAliases:Object.keys(vault.files)},null,2));
});
program.command('doctor').option('--api','Validate provider credentials or subscription login').action(async(options:{api?:boolean})=>{
  const config=runtimeConfig();console.log(`Node ${process.version}; model ${config.provider?.name??'not configured'}; data ${config.dataDir}`);
  const browser=new Browser();try{await browser.launch();console.log('Browser launch: passed');}finally{await browser.close();}
  if(options.api){
    if(!config.provider)throw new Error('No model provider configured; set LLM_API_KEY or sign in with a supported CLI subscription');
    const result=await config.provider.testConnection!();
    console.log(`Provider ${result.provider}: passed one real request with ${result.model} in ${result.latencyMs} ms. ${result.detail}`);
  }
});
const providers=program.command('providers').description('List model providers and their configuration status');
providers.action(()=>{const config=runtimeConfig();for(const status of providerStatuses(process.env,config.secrets))console.log(`${status.selected?'*':' '} ${status.id.padEnd(20)} ${status.configured?'ready  ':'missing'} ${status.model??''}\n    ${status.label}: ${status.detail}`);});
providers.command('test <provider>').description('Send one minimal real request to a provider').option('--model <model>','Model to test').action(async(id:string,options:{model?:string})=>{
  const config=runtimeConfig({provider:ProviderIdSchema.parse(id),model:options.model});
  if(!config.provider)throw new Error(`${id} is not configured; run \`agent providers\` for the missing setting`);
  const result=await config.provider.testConnection!();
  console.log(`${result.provider}: passed one real request with ${result.model} in ${result.latencyMs} ms. ${result.detail}`);
});
providers.command('set-key <provider>').description('Store an API key from stdin in the local secret store').action(async(id:string)=>{
  const provider=ProviderIdSchema.parse(id);if(PRESETS[provider].route!=='api'||!PRESETS[provider].keyEnv)throw new Error(`${id} does not use a stored API key`);
  const config=runtimeConfig();ensureDataDirectory(config.dataDir);
  // Read the key from stdin so it never appears in shell history or the process list.
  let key='';if(stdin.isTTY){const reader=createInterface({input:stdin,output:stdout});key=await reader.question(`${PRESETS[provider].label} key: `);reader.close();}else for await(const chunk of stdin)key+=chunk;
  secretStore(config.dataDir).set(provider,key.trim());console.log(`Stored the ${PRESETS[provider].label} key in the local ${secretStore(config.dataDir).kind} store.`);
});
providers.command('delete-key <provider>').action((id:string)=>{const config=runtimeConfig();secretStore(config.dataDir).delete(ProviderIdSchema.parse(id));console.log('Deleted the stored key, if any.');});
program.command('ui').option('--port <n>','Loopback web UI port','4318').option('--headed','Show Chromium alongside preview').action(async options=>{
  const {startServer}=await import('../server/index.js');await startServer({port:z.coerce.number().int().min(0).max(65535).parse(options.port),headed:!!options.headed});
});
program.command('mcp').description('Start the local MCP server over stdio').action(async()=>{
  const {serveStdio}=await import('@modelcontextprotocol/server/stdio');
  const {createMcpRuntime}=await import('../mcp/index.js');
  const runtime=createMcpRuntime(),handle=serveStdio(runtime.createServer);
  let closing=false;
  const shutdown=()=>{if(closing)return;closing=true;void handle.close().finally(()=>runtime.close());};
  process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);stdin.once('end',shutdown);
});
program.action(()=>interactive());
try{await program.parseAsync();}catch(error){const message=error instanceof Error?error.message:'Command failed';console.error(message.replace(/sk-[a-zA-Z0-9_-]{16,}/g,'[redacted key]'));process.exitCode=1;}
