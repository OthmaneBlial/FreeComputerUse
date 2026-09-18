#!/usr/bin/env node
import { Command } from 'commander';
import { createInterface } from 'node:readline/promises';
import { stdin,stdout } from 'node:process';
import { join,resolve } from 'node:path';
import { readFile,mkdir,writeFile } from 'node:fs/promises';
import { Agent } from '../agent/Agent.js';
import { TraceStore } from '../history/TraceStore.js';
import { ProfileStore } from '../profile/ProfileStore.js';
import { WorkflowEngine } from '../workflows/WorkflowEngine.js';
import { Browser } from '../browser/Browser.js';
import { Observer } from '../browser/Observer.js';
import { loadEnvironment,runtimeConfig } from '../config.js';
import type { ConfirmationPolicy } from '../actions/policy.js';
import { z } from 'zod';

loadEnvironment();const program=new Command().name('agent').description('DOM-first browser automation: plan once, execute locally.').version('0.1.0');
const policySchema=z.enum(['sensitive','always','never']);
interface RunOptions {headed?:boolean;debug?:boolean;profile?:string;allowOrigin?:string[];allowExternal?:boolean;confirmation?:string;workflows?:boolean;maxSteps?:string;maxRepairs?:string;ephemeral?:boolean;expectText?:string;expectUrl?:string;ultra?:boolean}
function runFlags(command:Command){return command.option('--headed','Show Chromium').option('--debug','Log all observe/plan/execute/verify/repair events').option('--profile <file>','Use a local profile JSON file').option('--allow-origin <url>','Allow another exact origin',(value:string,old:string[])=>[...old,new URL(value).origin],[]).option('--allow-external','Allow browser requests outside the origin allowlist').option('--confirmation <policy>','sensitive | always | never','sensitive').option('--no-workflows','Skip learned workflow lookup').option('--max-steps <n>','Maximum browser actions','120').option('--max-repairs <n>','Maximum model repairs','3').option('--ephemeral','Do not reuse saved browser cookies/session').option('--expect-text <text>','Trusted final text criterion the model cannot weaken').option('--expect-url <part>','Trusted final URL substring the model cannot weaken').option('--ultra','Explicit Ultra mode: skip website and sensitive-action approvals');}
async function makeAgent(url:string,options:RunOptions){
  const config=runtimeConfig();const store=new TraceStore(join(config.dataDir,'history.sqlite'));
  try{
    const vault=await new ProfileStore(options.profile?resolve(options.profile):join(config.dataDir,'profile.json')).load();
    const agent=new Agent({store,provider:config.provider,budget:config.budget,vault,useWorkflows:options.workflows,
      mode:options.ultra?'ultra':'normal',
      confirmation:policySchema.parse(options.confirmation??'sensitive'),downloadDir:join(config.dataDir,'downloads'),
      completionCriteria:[...(options.expectText?[{type:'text_exists' as const,value:options.expectText}]:[]),...(options.expectUrl?[{type:'url_contains' as const,value:options.expectUrl}]:[])],
      maxSteps:z.coerce.number().int().positive().parse(options.maxSteps??120),maxRepairs:z.coerce.number().int().nonnegative().parse(options.maxRepairs??3),
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
      if(goal===':inspect'){console.log(agent.observer.compressor.compress(await agent.observe()).text);continue;}
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
  const config=runtimeConfig(),lookup=new TraceStore(join(config.dataDir,'history.sqlite'));const trace=lookup.get(id);lookup.close();if(!trace)throw new Error('Run not found');
  const {agent,store}=await makeAgent(options.url??trace.url,options);connectEvents(agent,!!options.debug);
  try{showTrace(await agent.replay(trace,options.url));}finally{await agent.close();store.close();}
});
program.command('history').option('--limit <n>','Maximum rows','30').action(options=>{const config=runtimeConfig(),store=new TraceStore(join(config.dataDir,'history.sqlite'));try{console.log(JSON.stringify(store.history(z.coerce.number().int().min(1).max(1000).parse(options.limit)),null,2));}finally{store.close();}});
program.command('workflows').option('--show <id>','Show a learned semantic workflow').action(options=>{const config=runtimeConfig(),store=new TraceStore(join(config.dataDir,'history.sqlite'));try{const workflows=new WorkflowEngine(store);console.log(JSON.stringify(options.show?workflows.get(options.show)??'Not found':workflows.list(),null,2));}finally{store.close();}});
program.command('config').option('--profile <file>','Import a profile/files JSON into the local vault').action(async(options:{profile?:string})=>{
  const config=runtimeConfig();const profile=new ProfileStore(join(config.dataDir,'profile.json'));
  if(options.profile){await profile.save(JSON.parse(await readFile(resolve(options.profile),'utf8')));console.log('Local profile imported (mode 0600).');}
  const vault=await profile.load();console.log(JSON.stringify({dataDir:config.dataDir,model:config.provider?.name??'not configured',apiKeyConfigured:!!process.env.LLM_API_KEY,budget:config.budget.limits,profileAliases:Object.keys(vault.profile),fileAliases:Object.keys(vault.files)},null,2));
});
program.command('doctor').option('--api','Validate model credentials through the models endpoint').action(async(options:{api?:boolean})=>{
  const config=runtimeConfig();console.log(`Node ${process.version}; model ${config.provider?.name??'not configured'}; data ${config.dataDir}`);
  const browser=new Browser();try{await browser.launch();console.log('Chromium launch: passed');}finally{await browser.close();}
  if(options.api){if(!config.provider)throw new Error('LLM_API_KEY not configured');const response=await fetch(config.provider.config.baseURL.replace(/\/$/,'')+'/models',{headers:{Authorization:`Bearer ${config.provider.config.key}`},signal:AbortSignal.timeout(15000),redirect:'error'});if(!response.ok)throw new Error(`Provider models HTTP ${response.status}`);const data=await response.json() as {data?:{id:string}[]};console.log('Provider models:',data.data?.map(m=>m.id).join(', '));if(!data.data?.some(m=>m.id===config.provider!.name))throw new Error('Configured model is not advertised by this provider');}
});
program.command('ui').option('--port <n>','Loopback web UI port','4318').option('--headed','Show Chromium alongside preview').action(async options=>{
  const {startServer}=await import('../server/index.js');await startServer({port:z.coerce.number().int().min(0).max(65535).parse(options.port),headed:!!options.headed});
});
program.action(()=>interactive());
try{await program.parseAsync();}catch(error){const message=error instanceof Error?error.message:'Command failed';console.error(message.replace(/sk-[a-zA-Z0-9_-]{16,}/g,'[redacted key]'));process.exitCode=1;}
