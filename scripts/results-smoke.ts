import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {startLab} from './lab-server.js';
import {complexScenarios,planFor} from './complex-scenarios.js';
const dir=await mkdtemp(join(tmpdir(),'fcu-result-smoke-')),old=process.env.FCU_DATA_DIR;process.env.FCU_DATA_DIR=dir;
const scenario=complexScenarios.find(s=>s.id==='travel')!,lab=await startLab();
const dashboard=await startServer({port:0,quiet:true,provider:{name:'authored UI check · no model',plan:async context=>{await new Promise(resolve=>setTimeout(resolve,2500));return planFor(scenario,context.goal);},repair:async()=>{throw new Error('The authored UI check must not repair');}}});
const browser=await new Browser().launch(),errors:string[]=[];browser.page.on('pageerror',e=>errors.push(e.message));browser.page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await mkdir('artifacts/ui',{recursive:true});await browser.page.setViewportSize({width:1600,height:1000});await browser.navigate(dashboard.url);
  await browser.page.locator('#start-url').fill(lab.url+'workspace.html?view=travel');await browser.page.locator('#goal').fill('Plan an accessible, refundable journey from Paris to Lyon on 2026-10-15 for two adults, under EUR 120. Save and download the itinerary. This is a simulation; do not book.');
  await browser.page.getByRole('button',{name:'Run task',exact:true}).click();await browser.page.locator('#approval').waitFor({state:'visible'});
  if(dashboard.getAgent()?.browser.page.url()!=='about:blank')throw new Error('The website was accessed before approval');
  await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
  await browser.page.waitForFunction(()=>!document.querySelector<HTMLElement>('#agent-cursor')?.hidden&&document.querySelector('#interaction-label')?.textContent?.includes('Preparing the next actions'));
  if(dashboard.getAgent()?.trace?.actions.length)throw new Error('The preparation cursor was only shown after an action');
  await browser.page.screenshot({path:'artifacts/ui/cursor-preparing.png'});
  const deadline=Date.now()+90000;
  while(await browser.page.locator('#status').innerText()!=='COMPLETED'){
    if(Date.now()>deadline||await browser.page.locator('#status').innerText()==='FAILED')throw new Error('The authored journey did not complete');
    if(await browser.page.locator('#approval').isVisible()){
      const pending=dashboard.getAgent()?.control.pending,action=(typeof pending?.action==='string'?JSON.parse(pending.action):pending?.action) as {type?:string;target?:{name?:string}}|undefined;
      if(action?.type==='click'&&action.target?.name==='Find journeys')await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
    }
    await browser.page.waitForTimeout(200);
  }
  const agent=dashboard.getAgent()!;if(!await scenario.oracle(agent))throw new Error('The independent journey/file oracle failed');
  const box=await agent.browser.page.getByRole('button',{name:'Download itinerary'}).boundingBox(),viewport=agent.browser.page.viewportSize()!;
  if(!box||box.y<0||box.y+box.height>viewport.height)throw new Error('The download button is clipped in the controlled browser');
  await browser.page.waitForFunction(()=>document.querySelector('#agent-cursor')?.getAttribute('data-kind')==='click',undefined,{timeout:8000});
  await browser.page.waitForTimeout(700);await browser.page.screenshot({path:'artifacts/ui/journey-action.png'});
  await browser.page.getByRole('button',{name:'View result'}).click();
  if(!await browser.page.locator('.result-facts dd').filter({hasText:/^EUR 90$/}).count())throw new Error('The journey did not render as facts');
  await browser.page.screenshot({path:'artifacts/ui/result-cards.png'});
  await browser.page.setViewportSize({width:390,height:844});await browser.page.screenshot({path:'artifacts/ui/result-cards-mobile.png'});
  if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.documentElement.scrollHeight<=innerHeight))throw new Error('Mobile workspace overflow');
  await browser.page.getByRole('button',{name:'Close task result'}).click();await browser.page.setViewportSize({width:1600,height:1000});
  await browser.page.getByRole('button',{name:'Full screen browser',exact:true}).click();await browser.page.waitForFunction(()=>document.fullscreenElement?.id==='browser-panel'||document.querySelector('#browser-panel')?.classList.contains('expanded'));
  await browser.page.screenshot({path:'artifacts/ui/journey-fullscreen.png'});
  await browser.page.getByRole('button',{name:'Exit full screen browser',exact:true}).click();
  const before=await agent.browser.page.evaluate(()=>scrollY);await browser.page.getByRole('button',{name:'Scroll browser page up'}).click();await agent.browser.page.waitForFunction(y=>scrollY<y,before,{timeout:4000});
  if(errors.length)throw new Error('Browser errors: '+errors.join('; '));
  console.log(JSON.stringify({mode:'authored local UI execution, not model-planning evidence',status:agent.trace?.status,independentJourneyOracle:true,downloadButtonFullyVisible:true,resultsAsFacts:true,fullscreen:true,viewerScroll:true,consoleErrors:errors}));
}finally{await browser.close();await dashboard.close();await lab.close();await rm(dir,{recursive:true,force:true});if(old===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=old;}
