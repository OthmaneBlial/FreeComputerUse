import {mkdir,writeFile,mkdtemp,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import type {Condition} from '../src/actions/schema.js';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {loadEnvironment,runtimeConfig} from '../src/config.js';

loadEnvironment();
const lab='https://othmaneblial.github.io/FreeComputerUse/lab/';
interface Scenario {name:string;url:string;goal:string;criteria:Condition[];oracle:(agent:Agent)=>Promise<boolean>;seedSession?:boolean;changeDOM?:boolean}
const extracted=(agent:Agent)=>JSON.stringify(agent.browser.extractions.map(e=>e.value));
const scenarios:Scenario[]=[
  {name:'Product comparison · Books to Scrape',url:'https://books.toscrape.com/',goal:'Extract the full titles and prices of the first five books as structured records for product comparison. Do not add anything to a basket.',criteria:[{type:'extraction_count',min:5,max:5}],oracle:async agent=>{
    const expected=await agent.browser.page.locator('.product_pod').evaluateAll(els=>els.slice(0,5).map(el=>({title:el.querySelector('h3 a')?.getAttribute('title'),price:el.querySelector('.price_color')?.textContent?.trim()})));
    return expected.every(item=>!!item.title&&!!item.price&&extracted(agent).includes(item.title)&&extracted(agent).includes(item.price));}},
  {name:'Travel search · BlazeDemo',url:'https://blazedemo.com/',goal:'Find flights from Paris to London and extract the available airlines and prices for comparison. Do not choose or purchase a flight.',criteria:[{type:'url_contains',value:'reserve.php'},{type:'extraction_created'}],oracle:async agent=>{
    const expected=await agent.browser.page.locator('tbody tr').evaluateAll(rows=>rows.map(row=>{const cells=[...row.querySelectorAll('td')];return{airline:cells[2]?.textContent?.trim(),price:cells.at(-1)?.textContent?.trim()};}));
    return expected.length>0&&expected.every(item=>!!item.airline&&!!item.price&&extracted(agent).includes(item.airline)&&extracted(agent).includes(item.price))&&!agent.browser.page.url().includes('purchase');}},
  {name:'Dashboard tables · The Internet',url:'https://the-internet.herokuapp.com/tables',goal:'Extract the data from the first sortable table as structured table rows. Do not edit any records.',criteria:[{type:'extraction_created'}],oracle:async agent=>{
    const expected=await agent.browser.page.locator('#table1 tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].slice(0,5).map(c=>c.textContent?.trim()??'')));
    return expected.every(row=>row.every(value=>extracted(agent).includes(value)));}},
  {name:'Dropdown setting · The Internet',url:'https://the-internet.herokuapp.com/dropdown',goal:'Change the dropdown to Option 2 and verify the selected value. This demo changes only the current page.',criteria:[{type:'input_value_equals',target:{id:'dropdown'},value:'2'}],oracle:async agent=>await agent.browser.page.locator('#dropdown').inputValue()==='2'},
  {name:'Dynamic loading · The Internet',url:'https://the-internet.herokuapp.com/dynamic_loading/1',goal:'Start the delayed content and wait until Hello World is visible. Extract the final visible message.',criteria:[{type:'text_exists',value:'Hello World!'},{type:'extraction_created'}],oracle:async agent=>await agent.browser.page.locator('#finish').isVisible()&&extracted(agent).includes('Hello World!')},
  {name:'Structured research · Quotes to Scrape',url:'https://quotes.toscrape.com/',goal:'Extract the first three quotes and their authors as structured records.',criteria:[{type:'extraction_count',min:3,max:3}],oracle:async agent=>{
    const expected=await agent.browser.page.locator('.quote').evaluateAll(els=>els.slice(0,3).map(el=>({quote:el.querySelector('.text')?.textContent?.trim(),author:el.querySelector('.author')?.textContent?.trim()})));
    return expected.every(item=>!!item.quote&&!!item.author&&extracted(agent).includes(item.quote)&&extracted(agent).includes(item.author));}},
  {name:'Invoice download · public Northstar lab',url:lab+'invoices.html',goal:'Download the synthetic invoice and verify the download was created.',criteria:[{type:'download_created',value:'invoice.txt'}],oracle:async agent=>{
    const download=agent.browser.downloads.at(-1);return !!download&&(await readFile(download.path,'utf8')).includes('Amount: EUR 42');}},
  {name:'Revenue extraction · public Northstar lab',url:lab+'reports.html',goal:'Extract the revenue dashboard table, including all three months and their revenues.',criteria:[{type:'extraction_created'}],oracle:async agent=>['January','1200','February','1800','March','1500'].every(value=>extracted(agent).includes(value))},
  {name:'Local preferences · public Northstar lab',url:lab+'settings.html',goal:'Enable dark theme, change display currency to USD, save the local settings and verify them.',criteria:[{type:'text_exists',value:'Settings saved locally'},{type:'checkbox_checked',target:{label:'Enable dark theme'}},{type:'input_value_equals',target:{label:'Display currency'},value:'USD'}],oracle:async agent=>await agent.browser.page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('northstar-settings')??'{}');return settings.dark===true&&settings.currency==='USD';})},
  {name:'Persistent session · public Northstar lab',url:lab+'session-dashboard.html',goal:'Reuse the saved demo browser session and extract the account activity table. Do not sign in again or create an account.',criteria:[{type:'text_exists',value:'Demo session active'},{type:'extraction_created'}],seedSession:true,oracle:async agent=>(await agent.browser.context.cookies()).some(c=>c.name==='northstar_demo_session')&&await agent.browser.page.evaluate(()=>localStorage.getItem('northstar-demo-session')==='active')&&extracted(agent).includes('Browser session')},
  {name:'Dynamic modal · public Northstar lab',url:lab+'dynamic.html',goal:'Open the preferences modal, select Blue, close the modal, then click the delayed action and verify it completed.',criteria:[{type:'text_exists',value:'Delayed action complete'},{type:'input_value_equals',target:{label:'Color'},value:'Blue'},{type:'element_not_visible',target:{label:'Preferences'}}],oracle:async agent=>await agent.browser.page.getByLabel('Color').inputValue()==='Blue'&&await agent.browser.page.getByRole('button',{name:'Delayed action complete'}).count()===1},
  {name:'Embedded form · public Northstar lab',url:lab+'frame.html',goal:'Fill First name and Email in the embedded customer form using my profile and save the simulated customer details.',criteria:[{type:'text_exists',value:'Customer details saved in this frame'}],oracle:async agent=>{
    const frame=agent.browser.page.frames().find(f=>f.url().includes('frame-content.html'));return !!frame&&await frame.getByLabel('First name').inputValue()==='Alex'&&await frame.getByLabel('Email').inputValue()==='alex@example.test';}},
  {name:'Multiple tabs · public Northstar lab',url:lab+'tabs.html',goal:'Open the automation reference in its new tab, extract its key principle, close that reference tab, and return to the research workspace.',criteria:[{type:'url_contains',value:'tabs.html'},{type:'tab_count',count:1},{type:'extraction_contains',value:'Plan once. Execute many actions.'}],oracle:async agent=>agent.browser.context.pages().length===1&&extracted(agent).includes('Plan once. Execute many actions.')},
  {name:'DOM repair · public Northstar lab',url:lab+'changed.html',goal:'Click Continue to advance and verify Recovery complete. Recover if the control changes, without restarting the task.',criteria:[{type:'text_exists',value:'Recovery complete'}],changeDOM:true,oracle:async agent=>agent.browser.page.url().endsWith('recovered.html')},
];
const selection=process.argv.find(arg=>arg.startsWith('--only='))?.slice(7)?.toLowerCase();
const chosen=scenarios.filter(s=>!selection||s.name.toLowerCase().includes(selection));if(!chosen.length)throw new Error('No matching scenario');
const folder=resolve('.fcu/public-benchmark');await mkdir(folder,{recursive:true,mode:0o700});
const sessionRoot=await mkdtemp(join(folder,'sessions-'));
const results=[];
for(const [index,scenario] of chosen.entries()){
  const config=runtimeConfig();if(!config.provider)throw new Error('Real public benchmarks require LLM_API_KEY');
  const store=new TraceStore(join(sessionRoot,`${index}.sqlite`)),profileDir=join(sessionRoot,`${index}-browser`);
  const allowedOrigin=new URL(scenario.url).origin;
  const options={store,browser:{allowedOrigins:[allowedOrigin],profileDir},vault:{profile:{firstName:'Alex',email:'alex@example.test'},files:{}},completionCriteria:scenario.criteria};
  const agent=new Agent({...options,provider:config.provider,budget:config.budget,useWorkflows:false});
  let websiteApprovals=0,actionApprovals=0,injected=false;
  const permit=(current:Agent)=>current.control.on('approval',pending=>{
    const action=typeof pending.action==='string'?JSON.parse(pending.action):pending.action;
    if(action?.type==='siteAccess'){
      if(action.origin!==allowedOrigin){current.control.reject();return;}
      websiteApprovals++;current.control.approve();return;
    }
    // Public operations are explicitly limited to this project's browser-only simulations.
    if(!scenario.url.startsWith(lab)){current.control.reject();return;}
    if(/purchase|buy|delete|send|submit application|publish/i.test(JSON.stringify(action))){current.control.reject();return;}
    actionApprovals++;current.control.approve();
  });
  permit(agent);
  if(scenario.changeDOM)agent.on('event',event=>{
    if(event.phase==='PLAN'&&event.message==='Validated plan'&&!injected){injected=true;void agent.browser.page.locator('#changing').evaluate(el=>{el.outerHTML='<button onclick="location.href=\'recovered.html\'">Next step</button>';});}
  });
  console.log(`Running ${scenario.name}…`);
  let trace;
  try{
    if(scenario.seedSession){
      await agent.open(lab+'session-login.html');
      await agent.browser.page.getByLabel('Email').fill('demo@example.test');await agent.browser.page.getByLabel('Password').fill('public-synthetic-test-password');
      await agent.browser.page.getByRole('button',{name:'Sign in',exact:true}).click();await agent.browser.page.waitForURL('**/session-dashboard.html');
    }
    trace=await agent.run(scenario.goal,scenario.url);const correct=trace.status==='completed'&&await scenario.oracle(agent);
    await agent.close();
    let repeated:Record<string,unknown>|undefined;
    if(correct){
      const second=new Agent(options);permit(second);
      try{
        const repeat=await second.run(scenario.goal,scenario.url),repeatCorrect=repeat.status==='completed'&&await scenario.oracle(second);
        repeated={status:repeat.status,correct:repeatCorrect,...repeat.metrics,error:repeat.error};
        if(!repeatCorrect||repeat.metrics.llmCalls!==0)process.exitCode=1;
      }finally{await second.close();}
    }else process.exitCode=1;
    results.push({scenario:scenario.name,url:scenario.url,status:trace.status,correct,...trace.metrics,websiteApprovals,actionApprovals,sessionWasSeeded:!!scenario.seedSession,domMutationInjected:injected,error:trace.error,learnedRepeat:repeated});
    console.log(`${trace.status}; correctness ${correct}; ${trace.metrics.browserActions} actions / ${trace.metrics.llmCalls} model calls; repeat ${repeated?.status??'not run'}`);
  }catch(error){process.exitCode=1;results.push({scenario:scenario.name,url:scenario.url,status:'failed',correct:false,error:error instanceof Error?error.message:'Benchmark failed'});console.log('Failed:',error instanceof Error?error.message:'Unknown error');}
  finally{await agent.close();store.close();}
}
const report={version:1,measuredAt:new Date().toISOString(),mode:'real-api-free-public-websites',provider:'deepseek-flash',node:process.version,playwright:'1.63.0',safety:'Read-only tasks on public automation sandboxes. Settings and forms run only in the project-owned static lab and change browser state; no messages, purchases, account creation, uploads or real account changes. The harness explicitly approves each selected website; normal product mode waits for the human. Unknown origins and external sensitive actions are rejected.',method:'Each run has user-owned final criteria plus an independent scenario oracle. Successful runs are repeated with a compatible learned workflow and no provider installed. Session scenario manually seeds the synthetic public demo session, then verifies cookies/localStorage survive browser restart without logging in again.',limitations:'One run per scenario; public sites may change or be unavailable. These measurements do not establish general site success rates or savings against a screenshot-agent baseline. Costs use configured prices and are not billing receipts.',results};
await mkdir('artifacts',{recursive:true});const reportPath=selection?`artifacts/benchmark-public-${selection.replace(/[^a-z0-9]/g,'-')}.json`:'artifacts/benchmark-public.json';await writeFile(reportPath,JSON.stringify(report,null,2)+'\n');console.log(`Measured report: ${reportPath}`);
