import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {chromium,type Locator} from 'playwright';
import {loadEnvironment} from '../src/config.js';
import {startServer} from '../src/server/index.js';
import {startFixtures} from '../fixtures/server.js';

// Record one uncut dashboard session: write the Play release procedure, then run it from a French request.
// The replay must finish in review with zero model calls; the local simulator is not Google software.
const steps=`open http://127.0.0.1:3000/play/console
require "All apps" | "Toutes les applications"
click "View app: {{params.app}}" | "Afficher l'application: {{params.app}}"
click button "Test and release" | button "Tester et publier"
click "Production"
click button "Create new release" | button "Créer une release"
upload {{params.bundle}} to "Upload app bundle" | "Importer un app bundle"
wait for "({{params.version}})" (timeout 20s)
type "{{params.notes}}" into field "Release notes" | field "Notes de version"
click "Next" | "Suivant"
click "Save and publish" | "Enregistrer et publier" (sensitive)
click "Send changes for review" | "Envoyer les modifications pour examen"
expect "In review" | "En cours d'examen"`;
const request='Publie la version 1.5 de l\'app "Snake Arena" avec ./build/snake-1.5.aab';
const root=resolve('.fcu');
await mkdir(root,{recursive:true});
const folder=await mkdtemp(join(root,'procedure-film-'));
loadEnvironment();
process.env.FCU_DATA_DIR=join(folder,'data');
await mkdir(join(folder,'build'));
await writeFile(join(folder,'build/snake-1.5.aab'),'PK simulator bundle\nversionCode=15\nversionName=1.5\n');
// The request names ./build/snake-1.5.aab, which file parameters resolve from the working directory.
process.chdir(folder);
const fixture=await startFixtures(3000);
const dashboard=await startServer({port:0,quiet:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1600,height:900},screen:{width:1600,height:900},recordVideo:{dir:folder,size:{width:1600,height:900}}});
// The person's pointer and a step caption. Manual popovers are re-shown above each open modal, since dialogs use the top layer.
// It is a string because tsx would wrap named functions in a helper the page does not have.
await context.addInitScript(`addEventListener('DOMContentLoaded',()=>{
  const dot=document.createElement('div'),label=document.createElement('div');dot.popover=label.popover='manual';
  dot.style.cssText='margin:0;padding:0;border:0;background:none;inset:auto;position:fixed;left:0;top:0;width:28px;height:28px;pointer-events:none;overflow:visible;transform:translate(-80px,-80px)';
  dot.innerHTML='<svg width="28" height="28" viewBox="0 0 28 28"><path d="M5 3l16 9.5-7 1.6-3.6 6.6z" fill="#101712" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
  label.style.cssText='margin:0;inset:auto;position:fixed;left:50%;top:12px;transform:translateX(-50%);border:0;border-radius:999px;padding:10px 22px;background:#101712;color:#f4f1e7;font:600 17px "Avenir Next",system-ui,sans-serif;box-shadow:0 8px 28px rgba(0,0,0,.28);pointer-events:none;white-space:nowrap';
  document.body.append(label,dot);dot.showPopover();let top=null;
  const raise=()=>{for(const item of [label,dot])if(item.textContent||item===dot){item.hidePopover();item.showPopover();}};
  window.filmCaption=(step,text)=>{const number=document.createElement('b');number.textContent=step;number.style.cssText='color:#c9f169;margin-right:12px';label.replaceChildren(number,text);raise();};
  addEventListener('mousemove',event=>{const modal=document.querySelector('dialog:modal');if(modal!==top){top=modal;raise();}dot.style.transform='translate('+(event.clientX-4)+'px,'+(event.clientY-2)+'px)';},true);
});`);
const page=await context.newPage();
const video=page.video();
const errors:string[]=[];
page.on('pageerror',error=>errors.push(error.message));
const approved:string[]=[];
const pause=(ms:number)=>page.waitForTimeout(ms);
const caption=(step:string,text:string)=>page.evaluate(`window.filmCaption(${JSON.stringify(step)},${JSON.stringify(text)})`);
async function press(locator:Locator){
  await locator.scrollIntoViewIfNeeded();const box=await locator.boundingBox();if(!box)throw new Error('Nothing to click');
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:18});await pause(220);await locator.click();
}
try{
  await page.goto(dashboard.url);
  await caption('1','Write the steps once, with English and French labels');
  await pause(2200);
  await press(page.locator('#steps-open'));
  await caption('1','Write the steps once, with English and French labels');
  await pause(900);
  await page.locator('#save-steps').fill(steps);
  await pause(1600);
  await page.locator('#save-name').fill('Publish a Play production release');
  await page.locator('#save-description').fill('Upload an app bundle and send a production release for review');
  for(const [name,kind,aliases] of [['app','text',"app, application, l'app"],['bundle','file','aab, bundle, fichier'],['version','text','version'],['notes','text','notes, release notes']]){
    await press(page.locator('#param-add'));
    const row=page.locator('#param-rows .param-row').last();
    await row.getByLabel('Parameter name').fill(name!);
    await row.getByLabel('Parameter kind').selectOption(kind!);
    await row.getByLabel('Words that introduce it in a request').fill(aliases!);
    await pause(350);
  }
  await caption('1','Name what changes between runs: app, bundle, version, notes');
  await pause(2200);
  await press(page.locator('#save-submit'));
  await pause(1800);
  await caption('2','Later, ask in your own words, here in French');
  await press(page.locator('#goal'));
  await page.locator('#goal').pressSequentially(request,{delay:32});
  await pause(1000);
  await press(page.locator('#run'));
  await page.locator('#run-dialog').waitFor({state:'visible'});
  await caption('3','It finds the procedure and reads app, version and bundle');
  await pause(2800);
  for(const name of ['app','version','bundle'])if(!await page.locator(`#param-${name}`).inputValue())throw new Error(`The request did not fill ${name}`);
  await caption('3','Only the release notes are missing');
  await press(page.locator('#param-notes'));
  await page.locator('#param-notes').pressSequentially('Corrections et nouveaux niveaux',{delay:38});
  await pause(1000);
  await press(page.getByRole('button',{name:'Run procedure',exact:true}));
  const until=Date.now()+3*60_000;
  while(Date.now()<until){
    const agent=dashboard.getAgent(),pending=agent?.control.pending;
    if(pending){
      const action=pending.action as {type?:string;origin?:string}|string;
      const allowed=(typeof action==='object'&&action.type==='siteAccess'&&action.origin===fixture.url)
        ||(typeof action==='string'&&/Save and publish|Send changes for review/.test(action));
      if(!allowed)throw new Error(`Unexpected approval request: ${pending.reason}`);
      await page.locator('#approval').waitFor({state:'visible',timeout:5000});
      await caption(...(typeof action==='object'?['4','You approve the simulator site once']:['5','Sensitive steps ask you on every run']) as [string,string]);
      await pause(2400);
      await press(page.locator('#approve'));
      approved.push(pending.reason);
      if(typeof action==='object')await caption('4','The saved steps replay locally, without the model');
      await pause(400);
    }
    if(agent?.trace?.status&&agent.trace.status!=='running')break;
    await pause(200);
  }
  const agent=dashboard.getAgent();
  if(!agent?.trace)throw new Error('The procedure never started');
  if(agent.trace.status!=='completed')throw new Error(`Procedure ${agent.trace.status}: ${agent.trace.error??'no error'}`);
  if(Number(agent.trace.metrics.llmCalls)!==0)throw new Error(`The replay made ${agent.trace.metrics.llmCalls} model calls`);
  const release=fixture.play.apps[0]!.releases.find(item=>item.versionCode===15);
  if(release?.status!=='in_review')throw new Error('The simulator does not hold version code 15 in review');
  if(approved.length!==3)throw new Error(`Expected the site and two sensitive approvals, got ${approved.length}`);
  await caption('6','In review, with 0 model calls. Google still has to review it');
  await pause(4000);
  await press(page.locator('#workflows-open'));
  await caption('7','Saved with its run history, ready for version 1.6');
  await pause(4000);
  if(errors.length)throw new Error(`Dashboard errors: ${JSON.stringify(errors)}`);
  const evidence={task:'Play production release replayed from a French request',recording:'one continuous, unsped dashboard session',simulator:'fixtures/playConsole.ts (local, not Google software)',request,status:agent.trace.status,metrics:agent.trace.metrics,
    approved:approved.map(reason=>reason.startsWith('Allow browser access')?'Simulator site access':reason.slice(0,80)),release:{versionCode:release.versionCode,status:release.status}};
  await writeFile(join(folder,'evidence.json'),JSON.stringify(evidence,null,2)+'\n');
  console.log(JSON.stringify({folder,evidence}));
}finally{
  await context.close();
  await browser.close();
  await dashboard.close();
  await fixture.close();
  if(video)console.log(JSON.stringify({rawVideo:await video.path().catch(()=>undefined)}));
}
