import {mkdtemp, mkdir, readFile, writeFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {chromium} from 'playwright';
import {loadEnvironment} from '../src/config.js';
import {startServer} from '../src/server/index.js';

// Record one uncut, live Flash-planned run in an isolated local profile.
// The capture only grants access to Northstar's synthetic practice site.
const site='https://othmaneblial.github.io';
const start=`${site}/FreeComputerUse/lab/workspace.html?view=incident`;
const goal='Investigate synthetic incident INC-204. Filter the alert queue to API Gateway, High severity, and Last 24 hours. Open the incident, inspect its timeline, request metrics, deployment comparison, and runbook. Use the evidence you find to complete the incident brief: affected endpoint, before/after 429 rates, relevant deployment, configuration change, and the appropriate review decision. Save the brief locally and download it. Do not roll back a service, contact customers, or claim the cause is proven.';
const root=resolve('.fcu');
await mkdir(root,{recursive:true});
const folder=await mkdtemp(join(root,'incident-film-'));
loadEnvironment();
process.env.FCU_DATA_DIR=folder;
const dashboard=await startServer({port:0,quiet:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1600,height:900},screen:{width:1600,height:900},recordVideo:{dir:folder,size:{width:1600,height:900}}});
const page=await context.newPage();
const video=page.video();
let cursorFrames=0;
const approved:string[]=[];
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(dashboard.url);
  await page.locator('#start-url').fill(start);
  await page.locator('#goal').fill(goal);
  await page.getByRole('button',{name:'Run options'}).click();
  await page.locator('#use-workflows').uncheck();
  await page.getByRole('button',{name:'Close run options'}).click();
  await page.waitForTimeout(1800);
  await page.getByRole('button',{name:'Run task',exact:true}).click();
  const until=Date.now()+5*60_000;
  let fullscreen=false;
  while(Date.now()<until){
    const agent=dashboard.getAgent();
    const pending=agent?.control.pending;
    if(pending){
      const action=pending.action as {type?:string;origin?:string}|string;
      const allowed=(typeof action==='object'&&action.type==='siteAccess'&&action.origin===site)
        ||(typeof action==='string'&&action.includes('Save incident brief locally')&&agent?.browser.page.url().startsWith(`${site}/FreeComputerUse/lab/incident-brief.html`));
      if(!allowed)throw new Error(`Unexpected approval request: ${pending.reason}`);
      await page.locator('#approval').waitFor({state:'visible',timeout:5000});
      await page.waitForTimeout(1300);
      await page.getByRole('button',{name:'Approve action',exact:true}).click();
      approved.push(pending.reason);
      if(!fullscreen){
        await page.waitForTimeout(1700);
        // Use the dashboard's full-viewport fallback. Native headless fullscreen
        // paints only an 800x600 surface into a larger Playwright recording.
        await page.locator('#browser-panel').evaluate(element=>Object.defineProperty(element,'requestFullscreen',{value:undefined,configurable:true}));
        await page.locator('#fullscreen').click();
        if(!await page.locator('#browser-panel').evaluate(element=>element.classList.contains('expanded')&&element.getBoundingClientRect().width>=1400))throw new Error('The browser film is not truly full width');
        fullscreen=true;
      }
    }
    if(await page.locator('#agent-cursor').isVisible())cursorFrames++;
    if(agent?.trace?.status&&agent.trace.status!=='running')break;
    await page.waitForTimeout(250);
  }
  const agent=dashboard.getAgent();
  if(!agent?.trace)throw new Error('The task never started');
  if(agent.trace.status!=='completed')throw new Error(`Task ${agent.trace.status}: ${agent.trace.error??'no error'}`);
  if(agent.trace.metrics.provider!=='deepseek-flash'||Number(agent.trace.metrics.llmCalls)<1)throw new Error('The film did not use live DeepSeek Flash planning');
  if(approved.length!==2)throw new Error('The site and synthetic save approvals were not both shown');
  if(fullscreen){await page.locator('#fullscreen').click();await page.waitForTimeout(900);}
  await page.getByRole('button',{name:'View result'}).click();
  await page.waitForTimeout(2500);
  const results=await page.locator('#result-output').innerText();
  const download=agent.browser.downloads.find(item=>/incident-brief\.txt$/i.test(item.filename));
  if(!download)throw new Error('The requested brief was not downloaded');
  if(!results.includes(download.filename))throw new Error('The dashboard omitted the downloaded brief');
  const brief=await readFile(download.path,'utf8');
  for(const required of ['Incident: INC-204','Endpoint: /v1/search','429 baseline: 0.4%','429 during incident: 12.4%','Triggering deployment: dep-7c3','100 → 20','Needs engineer review','No rollback']){
    if(!brief.includes(required))throw new Error(`Downloaded brief lacks ${required}`);
  }
  const documents=new Set(agent.browser.responses.filter(r=>r.resource==='document').map(r=>new URL(r.url).pathname));
  for(const path of ['/FreeComputerUse/lab/workspace.html','/FreeComputerUse/lab/incident-detail.html','/FreeComputerUse/lab/incident-metrics.html','/FreeComputerUse/lab/incident-deployments.html','/FreeComputerUse/lab/incident-runbook.html','/FreeComputerUse/lab/incident-brief.html']){
    if(!documents.has(path))throw new Error(`Missing page visit: ${path}`);
  }
  if(cursorFrames<12)throw new Error(`Visible pointer only sampled ${cursorFrames} times`);
  if(errors.length)throw new Error(`Dashboard errors: ${JSON.stringify(errors)}`);
  const evidence={task:'INC-204 synthetic incident investigation',recording:'one continuous, unsped dashboard run',start,goal,status:agent.trace.status,provider:agent.trace.metrics.provider,metrics:agent.trace.metrics,visibleCursorSamples:cursorFrames,approved:approved.map(reason=>reason.startsWith('Allow browser access')?'Practice site access':'Synthetic brief save'),pages:[...documents].filter(path=>path.includes('/lab/')),downloadedBrief:download.filename,checks:['brief content','six distinct page visits','visible agent cursor','normal-mode site approval'],disclaimer:'Synthetic practice workspace. No production rollback or customer message.'};
  await writeFile(join(folder,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({folder,evidence}));
}finally{
  await context.close();
  await browser.close();
  await dashboard.close();
  if(video)console.log(JSON.stringify({rawVideo:await video.path().catch(()=>undefined)}));
}
