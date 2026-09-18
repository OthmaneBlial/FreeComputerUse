import { mkdir,writeFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { Agent } from '../src/agent/Agent.js';
import { TraceStore } from '../src/history/TraceStore.js';
import { loadEnvironment,runtimeConfig } from '../src/config.js';
import { startFixtures } from '../fixtures/server.js';
import { FixtureProvider } from '../fixtures/FixtureProvider.js';

loadEnvironment();
const live=process.argv.includes('--live');const contact=process.argv.includes('--contact');
const fixture=await startFixtures();const config=runtimeConfig();
const folder=resolve('.fcu/demo');await mkdir(folder,{recursive:true,mode:0o700});
const resume=join(folder,'synthetic-resume.txt');await writeFile(resume,'Alex Example\nSynthetic demo resume, not a real candidate.\nTypeScript / Playwright\n',{mode:0o600});
const store=new TraceStore(join(folder,'history.sqlite'));
const provider=live?config.provider:new FixtureProvider();
if(live&&!provider)throw new Error('A real API key is required for --live');
const agent=new Agent({store,provider,budget:config.budget,useWorkflows:false,
  completionCriteria:[{type:'text_exists',value:contact?'Message received':'Application received'}],
  browser:{allowedOrigins:[fixture.url],headless:!process.argv.includes('--headed')},
  vault:{profile:{firstName:'Alex',lastName:'Example',email:'alex@example.test',phone:'+33123456789',country:'France',experience:'6',message:'Please contact me about your developer tools.'},files:{resume}}});
agent.on('event',event=>console.log(`[${event.phase}] ${event.message}`));
// Only this isolated local synthetic demo is pre-authorized. General CLI runs prompt.
agent.control.on('approval',()=>{console.log('[HUMAN] Approved for the local synthetic demo only.');agent.control.approve();});
try{
  console.log(`Provider: ${provider?.name} (${live?'REAL API':'SCRIPTED FIXTURE, NO LLM'})`);
  const goal=contact?'Fill the contact form using my profile and send the message, then verify it was received.':'Apply to this software engineer job using my profile. Upload my resume, complete the required information, review, and submit only after human confirmation.';
  const trace=await agent.run(goal,fixture.url+(contact?'/demo':'/jobs'));
  console.log(JSON.stringify({id:trace.id,status:trace.status,metrics:trace.metrics,error:trace.error},null,2));
  await writeFile(join(folder,'latest.json'),JSON.stringify(trace,null,2)+'\n',{mode:0o600});
  if(trace.status!=='completed')process.exitCode=1;
}finally{await agent.close();store.close();await fixture.close();}
