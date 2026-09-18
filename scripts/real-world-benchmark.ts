import {mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {Agent} from '../src/agent/Agent.js';
import {Browser} from '../src/browser/Browser.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {loadEnvironment,runtimeConfig} from '../src/config.js';
import type {Condition} from '../src/actions/schema.js';
interface Task {id:string;url:string;goal:string}
const tasks=(await import(new URL('../lab/examples.js',import.meta.url).href)).realTasks as Task[];
const selection=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7);
const chosen=tasks.filter(t=>['github','statistics'].includes(t.id)&&(!selection||selection.split(',').includes(t.id)));
if(!chosen.length)throw new Error('Choose github or statistics');
loadEnvironment();const dir=await mkdtemp(resolve('.fcu/real-world-')),results=[];
const clean=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]/g,'');
const textOf=(agent:Agent)=>JSON.stringify(agent.browser.extractions.map(e=>e.value));
const visited=(agent:Agent,part:string)=>agent.browser.responses.some(r=>r.resource==='document'&&r.status<400&&r.url.includes(part));
for(const task of chosen){
 const config=runtimeConfig();if(!config.provider)throw new Error('Real-world trials need the ignored local LLM_API_KEY');
 const baseline=new Browser();let evidence:Record<string,unknown>,oracle:(agent:Agent)=>Promise<boolean>,criteria:Condition[];
 try{
  await baseline.launch();
  if(task.id==='github'){
   await baseline.navigate('https://github.com/microsoft/playwright/releases/latest');
   const releaseURL=baseline.page.url(),version=new URL(releaseURL).pathname.split('/').at(-1)!;
   const headings=await baseline.page.locator('.markdown-body h2').allTextContents();if(headings.length<3)throw new Error('Independent release oracle is unavailable');
   const date=await baseline.page.locator('relative-time').first().getAttribute('datetime');
   evidence={releaseURL,version,releaseDate:date,firstThreeHeadings:headings.slice(0,3)};
   criteria=[{type:'extraction_created'},{type:'extraction_contains',value:version}];
   oracle=async agent=>{
    const extracted=clean(textOf(agent));
    return extracted.includes(clean(version))&&headings.slice(0,3).every(h=>extracted.includes(clean(h)))&&extracted.includes('apache')&&extracted.includes('20')&&(extracted.includes('msrc')||extracted.includes('microsoftsecurityresponsecenter'))&&['/releases/tag/','/LICENSE','/security/policy'].every(part=>visited(agent,part))&&agent.browser.downloads.length===0;
   };
  }else{
   await baseline.navigate(task.url);
   const pdf=await baseline.page.locator('a[href*="NTS_Factsheet_2024.pdf"]').first().getAttribute('href');if(!pdf)throw new Error('Independent factsheet PDF oracle is unavailable');
   const pdfURL=new URL(pdf,task.url).href;
   await baseline.navigate('https://www.gov.uk/government/statistics/national-travel-survey-2024/nts-2024-factsheet');
   const body=await baseline.page.locator('main').innerText();if(!body.includes('6,082')||!body.includes('922')||!body.includes('362')||!body.includes('78%'))throw new Error('Statistics changed; refresh the oracle');
   evidence={year:2024,published:'27 August 2025',geography:'England',annualTrips:922,annualMiles:6082,annualHours:362,cyclingTrips:15,carOwningHouseholdsPercent:78,pdfURL};
   criteria=[{type:'extraction_created'},{type:'extraction_contains',value:'922'},{type:'extraction_contains',value:'362'}];
   oracle=async agent=>{
    const extracted=textOf(agent),normalized=clean(extracted);
    return ['922','6082','362','15','78','england','2024','2025'].every(v=>normalized.includes(v))&&extracted.includes(pdfURL)&&visited(agent,'/nts-2024-factsheet')&&agent.browser.page.url()===task.url&&agent.browser.downloads.length===0;
   };
  }
 }finally{await baseline.close();}
 const store=new TraceStore(join(dir,task.id+'.sqlite')),origin=new URL(task.url).origin;
 const options={store,browser:{allowedOrigins:[origin],profileDir:join(dir,task.id)},completionCriteria:criteria};
 const agent=new Agent({...options,provider:config.provider,budget:config.budget});
 let siteApprovals=0;
 const permit=(current:Agent)=>current.control.on('approval',pending=>{const action=typeof pending.action==='string'?JSON.parse(pending.action):pending.action;if(action?.type==='siteAccess'&&action.origin===origin){siteApprovals++;current.control.approve();}else current.control.reject();});
 permit(agent);console.log('Running real-world '+task.id+'…');
 try{
  const trace=await agent.run(task.goal,task.url),correct=trace.status==='completed'&&await oracle(agent);
  const documents=[...new Set(agent.browser.responses.filter(r=>r.resource==='document').map(r=>r.url))];
  await agent.close();let learnedRepeat;
  if(correct){const repeat=new Agent(options);permit(repeat);try{const trace=await repeat.run(task.goal,task.url),correct=trace.status==='completed'&&await oracle(repeat);learnedRepeat={status:trace.status,correct,...trace.metrics,error:trace.error};if(!correct||trace.metrics.llmCalls!==0)process.exitCode=1;}finally{await repeat.close();}}
  else process.exitCode=1;
  results.push({scenario:task.id,url:task.url,status:trace.status,correct,...trace.metrics,siteApprovals,documentURLs:documents,evidence,error:trace.error,learnedRepeat});
  console.log(`${trace.status}; correct ${correct}; ${trace.metrics.browserActions} actions, ${trace.metrics.llmCalls} model calls; repeat ${learnedRepeat?.status??'not run'}`);
 }finally{await agent.close();store.close();}
}
await mkdir('artifacts',{recursive:true});const path=`artifacts/benchmark-real-world${selection?'-'+selection.replace(/[^a-z0-9,-]/g,''):''}.json`;
await writeFile(path,JSON.stringify({measuredAt:new Date().toISOString(),mode:'real-deepseek-flash-public-primary-websites',safety:'Read-only public GitHub/GOV.UK pages. Harness approves only each selected origin; all sensitive external actions and other origins are rejected. No messages, purchases, logins, downloads or changes.',method:'No supplied action plans. Independent browser reads obtain release and PDF evidence before trials. User-owned completion criteria plus independent oracles check extracted facts and actual document visits. Successful tasks repeat without a provider installed.',limitations:'Single trials; changing sources, network failures and automation restrictions can break tasks. Passing is not general support for the entire site. Costs are estimates, not billing receipts.',results},null,2)+'\n');console.log('Report: '+path);
