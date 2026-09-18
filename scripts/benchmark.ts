import {mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {loadEnvironment,runtimeConfig} from '../src/config.js';
import {FixtureProvider} from '../fixtures/FixtureProvider.js';
import {startFixtures} from '../fixtures/server.js';

loadEnvironment();const live=process.argv.includes('--live'),fixture=await startFixtures();
const folder=resolve('.fcu/benchmark');await mkdir(folder,{recursive:true,mode:0o700});
const resume=join(folder,'synthetic-resume.txt');await writeFile(resume,'Synthetic Northstar benchmark resume\n',{mode:0o600});
const vault={profile:{firstName:'Alex',lastName:'Example',email:'alex@example.test',phone:'+33123456789',country:'France',experience:'6',message:'Please contact me about your developer tools.'},files:{resume}};
const scenarios=[
  {name:'Search engine',path:'/search',goal:'Search for DOM browser automation and extract the search result links.',expectText:'Search results'},
  {name:'Multi-field contact form',path:'/demo',goal:'Fill the contact form using my profile and send my message, then verify it was received.',expectText:'Message received'},
  {name:'Multi-step navigation',path:'/wizard',goal:'Find the cheapest ticket to Paris for October 1, 2026. Navigate through the form and extract the ticket table.',expectText:'Available tickets'},
  {name:'Product catalogue',path:'/catalogue',goal:'Search the product catalogue for keyboard and extract the matching product table.',expectText:'Product catalogue'},
  {name:'Job application',path:'/jobs',goal:'Apply to this software engineer job using my profile. Upload the resume, fill all fields, review and submit only after human confirmation.',expectText:'Application received'},
  {name:'Changed DOM recovery',path:'/changed',goal:'Click Continue to advance and verify Recovery complete. If the control changes, recover without restarting.',expectText:'Recovery complete'},
];
const extracted=(agent:Agent)=>JSON.stringify(agent.browser.extractions.map(e=>e.value));
async function correct(scenario:typeof scenarios[number],agent:Agent){
  if(scenario.path==='/search'){const query=new URL(agent.browser.page.url()).searchParams.get('q')??'';return /dom/i.test(query)&&/browser/i.test(query)&&/automation/i.test(query)&&extracted(agent).includes('DOM-first browser automation');}
  if(scenario.path==='/demo')return await agent.browser.page.getByLabel('First name').inputValue()===vault.profile.firstName&&await agent.browser.page.getByLabel('Last name').inputValue()===vault.profile.lastName&&await agent.browser.page.getByLabel('Email',{exact:true}).inputValue()===vault.profile.email&&await agent.browser.page.getByLabel('Country').inputValue()===vault.profile.country&&await agent.browser.page.getByLabel('Message',{exact:true}).inputValue()===vault.profile.message&&await agent.browser.page.getByLabel('I agree to the privacy policy').isChecked();
  if(scenario.path==='/wizard')return new URL(agent.browser.page.url()).searchParams.get('date')==='2026-10-01'&&agent.browser.responses.some(r=>new URL(r.url).pathname==='/wizard/date'&&new URL(r.url).searchParams.get('destination')==='Paris')&&['Morning train','32','Evening train','25'].every(v=>extracted(agent).includes(v));
  if(scenario.path==='/catalogue')return await agent.browser.page.getByLabel('Search products').inputValue()==='keyboard'&&['Trail keyboard','39','Summit keyboard','89'].every(v=>extracted(agent).includes(v))&&!extracted(agent).includes('Cloud mouse');
  if(scenario.path==='/jobs'){const details=await agent.browser.page.evaluate(()=>JSON.parse(sessionStorage.getItem('application')??'{}'));return agent.browser.page.url().endsWith('/confirmation')&&details.firstName===vault.profile.firstName&&details.lastName===vault.profile.lastName&&details.email===vault.profile.email&&agent.trace?.actions.some(a=>a.success&&a.action.type==='upload'&&a.action.file==='{{files.resume}}')===true;}
  return agent.browser.page.url().endsWith('/recovered');
}
const results=[];
try{
  for(const scenario of scenarios){
    const config=runtimeConfig(),provider=live?config.provider:new FixtureProvider();if(live&&!provider)throw new Error('--live requires LLM_API_KEY');
    const store=new TraceStore(':memory:');const browser={allowedOrigins:[fixture.url]};
    const agent=new Agent({store,provider,budget:config.budget,vault,browser,useWorkflows:false,completionCriteria:[{type:'text_exists',value:scenario.expectText}]});
    let approvals=0,injected=false;
    agent.control.on('approval',()=>{approvals++;agent.control.approve();}); // Synthetic local operations only.
    if(scenario.path==='/changed'&&live)agent.on('event',event=>{
      if(event.phase==='PLAN'&&event.message==='Validated plan'&&!injected){injected=true;void agent.browser.page.locator('#changing').evaluate(el=>{el.outerHTML='<button onclick="location.href=\'/recovered\'">Next step</button>';});}
    });
    console.log(`Running ${scenario.name} (${provider?.name})…`);
    try{
      const trace=await agent.run(scenario.goal,fixture.url+scenario.path);
      const taskCorrect=trace.status==='completed'&&await correct(scenario,agent);
      let replay:Record<string,unknown>|undefined;
      if(taskCorrect){
        const cached=new Agent({store,vault,browser,completionCriteria:[{type:'text_exists',value:scenario.expectText}]});cached.control.on('approval',()=>cached.control.approve());
        try{const repeated=await cached.run(scenario.goal,fixture.url+scenario.path);const repeatCorrect=repeated.status==='completed'&&await correct(scenario,cached);replay={status:repeated.status,correct:repeatCorrect,...repeated.metrics,error:repeated.error};if(!repeatCorrect||repeated.metrics.llmCalls!==0)process.exitCode=1;}
        finally{await cached.close();}
      }else process.exitCode=1;
      results.push({scenario:scenario.name,status:trace.status,correct:taskCorrect,...trace.metrics,approvalRequests:approvals,scriptedPlanCalls:!live?(provider as FixtureProvider).planCalls:undefined,scriptedRepairCalls:!live?(provider as FixtureProvider).repairCalls:undefined,error:trace.error,learnedRepeat:replay});
      console.log(`${trace.status}; correctness ${taskCorrect}: ${trace.metrics.browserActions} actions / ${trace.metrics.llmCalls} real model calls`);
    }finally{await agent.close();store.close();}
  }
  const report={version:1,measuredAt:new Date().toISOString(),mode:live?'real-deepseek-api':'scripted-runtime-fixtures',node:process.version,playwright:'1.63.0',fixture:'Northstar local browser lab',limitations:'One run per scenario. Local synthetic data and pre-authorized local confirmation gates. Large decorative CSS intentionally exercises compression; percentages do not establish real-site savings. No screenshot-agent baseline. Costs use configured prices, not billing receipts. Learned repeats require a compatible page and the same goal; domain-wide transfer is not claimed.',results};
  await mkdir('artifacts',{recursive:true});const path=`artifacts/benchmark-${live?'live':'runtime'}.json`;await writeFile(path,JSON.stringify(report,null,2)+'\n');console.log(`Measured report: ${path}`);
}finally{await fixture.close();}
