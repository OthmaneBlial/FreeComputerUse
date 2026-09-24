import {mkdir} from 'node:fs/promises';
import {Browser} from '../src/browser/Browser.js';
import {startLab} from './lab-server.js';
import {startServer} from '../src/server/index.js';
import {assertTextContrast} from './text-contrast.js';
const lab=await startLab(),dashboard=await startServer({port:0,quiet:true});
const browser=await new Browser({allowedOrigins:[new URL(lab.url).origin,new URL(dashboard.url).origin]}).launch();const errors:string[]=[];
browser.page.on('pageerror',error=>errors.push(error.message));browser.page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const accessibility=await browser.context.newCDPSession(browser.page);let accessibleControls=0;
async function checkAccessibleNames(){
 const {nodes}=await accessibility.send('Accessibility.getFullAXTree'),roles=new Set(['button','link','textbox','combobox','checkbox','radio','tab','slider','switch']);
 const controls=nodes.filter(node=>roles.has(node.role?.value??'')),unnamed=controls.filter(node=>!String(node.name?.value??'').trim());
 if(unnamed.length)throw new Error(`Accessible controls have no name at ${new URL(browser.page.url()).pathname}: ${unnamed.map(node=>node.role?.value).join(', ')}`);
 accessibleControls+=controls.length;
}
try{
 await mkdir('artifacts/lab',{recursive:true});
 await browser.navigate(lab.url);
 await browser.page.locator('#watch video').evaluate(async element=>{
  if(!(element instanceof HTMLVideoElement))throw new Error('Incident film is missing');
  const poster=await fetch(element.poster);
  if(!poster.ok||!poster.headers.get('content-type')?.startsWith('image/jpeg'))throw new Error('Incident poster did not load');
  element.muted=true;
  await element.play();
  await new Promise(resolve=>setTimeout(resolve,500));
  if(element.videoWidth!==1600||element.videoHeight!==900||element.currentTime<=0)throw new Error('Incident film did not play');
  element.pause();
 });
 await browser.page.evaluate(()=>{
  sessionStorage.setItem('northstar-v2-product-flow',JSON.stringify({compared:['trail','summit']}));
  sessionStorage.setItem('northstar-v2-travel-flow',JSON.stringify({request:{from:'Paris',to:'Lyon',date:'2026-10-15',passengers:'2 adults',stepfree:true,refund:true,changes:1,budget:120}}));
  localStorage.setItem('northstar-v2-itinerary',JSON.stringify({from:'Paris',to:'Lyon',date:'2026-10-15',passengers:'2 adults',service:'Flex Regional',totalEUR:90}));
 });
 for(const [name,path] of [['home',''],['products','workspace.html?view=products'],['travel','workspace.html?view=travel'],['billing','workspace.html?view=billing'],['analytics','workspace.html?view=analytics'],['settings','workspace.html?view=settings'],['documents','workspace.html?view=documents'],['quarter-close','workspace.html?view=close'],['close-revenue','close-revenue.html'],['close-ledger','close-ledger.html'],['close-adjustment','close-adjustment.html'],['close-policy','close-policy.html'],['close-review','close-review.html'],['incident-desk','workspace.html?view=incident'],['incident-detail','incident-detail.html?id=INC-204'],['incident-metrics','incident-metrics.html'],['incident-deployments','incident-deployments.html'],['incident-runbook','incident-runbook.html'],['incident-brief','incident-brief.html'],['product-details','product-details.html?id=trail'],['product-comparison','product-comparison.html'],['journey-results','journey-results.html'],['itinerary','itinerary.html'],['invoice-details','invoice-details.html?id=INV-2609-04']] as const){
 await browser.page.setViewportSize({width:1440,height:1050});await browser.navigate(lab.url+path);
 await checkAccessibleNames();await assertTextContrast(browser.page,'body');
 await browser.page.screenshot({path:`artifacts/lab/${name}.png`,fullPage:true});
  for(const width of [320,390,768]){
   await browser.page.setViewportSize({width,height:900});
   if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error(`Responsive overflow: ${name} at ${width}px`);
   if(width===390)await browser.page.screenshot({path:`artifacts/lab/${name}-mobile.png`,fullPage:true});
  }
 }
 await browser.navigate(lab.url);await browser.page.locator('#real-tab').focus();
 for(const key of ['ArrowRight','ArrowRight','ArrowLeft','Home','End'])await browser.page.keyboard.press(key);
 const practiceTab=await browser.page.evaluate(()=>{const tab=document.querySelector('#practice-tab')!,other=document.querySelector('#real-tab')!,panel=document.querySelector('#task-list')!;return{selected:tab.getAttribute('aria-selected'),tabIndex:(tab as HTMLButtonElement).tabIndex,otherTabIndex:(other as HTMLButtonElement).tabIndex,active:document.activeElement?.id,labelledBy:panel.getAttribute('aria-labelledby'),focusVisible:getComputedStyle(tab).outlineStyle==='solid'&&getComputedStyle(tab).outlineWidth==='2px'};});
 if(practiceTab.selected!=='true'||practiceTab.tabIndex!==0||practiceTab.otherTabIndex!==-1||practiceTab.active!=='practice-tab'||practiceTab.labelledBy!=='practice-tab'||!practiceTab.focusVisible)throw new Error('Keyboard tabs do not preserve selection, focus and panel labels: '+JSON.stringify(practiceTab));
 await checkAccessibleNames();
 await browser.page.keyboard.press('Tab');if(!await browser.page.locator('[data-category="all"]').evaluate(element=>element===document.activeElement))throw new Error('Tab should leave the widget at the next control');
 if(await browser.page.locator('.task-card').count()!==8)throw new Error('Practice workflow cards missing');
 for(const width of [1440,320,390,768]){
  await browser.page.setViewportSize({width,height:900});
  if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error(`Practice workflow library overflow at ${width}px`);
  if(width===1440||width===390)await browser.page.screenshot({path:`artifacts/lab/practice-workflows${width===390?'-mobile':''}.png`,fullPage:true});
 }
 for(const path of ['catalogue.html','wizard.html','invoices.html','reports.html','settings.html','dynamic.html','frame.html','session-login.html','tabs.html']){await browser.navigate(lab.url+path);await checkAccessibleNames();await assertTextContrast(browser.page,'body');}
 await browser.navigate(new URL('/',lab.url).href);
 for(const width of [1440,320,390,768]){await browser.page.setViewportSize({width,height:900});if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error(`Public site overflow at ${width}px`);await checkAccessibleNames();await assertTextContrast(browser.page,'body');}
 await browser.page.setViewportSize({width:1440,height:900});
 await browser.page.locator('#real-tab').focus();for(const key of ['ArrowRight','Home','End'])await browser.page.keyboard.press(key);
 const publicTabs=await browser.page.evaluate(()=>{const selected=document.querySelector('#practice-tab')!,other=document.querySelector('#real-tab')!,panel=document.querySelector('#task-list')!;return{selected:selected.getAttribute('aria-selected'),tabIndex:(selected as HTMLButtonElement).tabIndex,otherTabIndex:(other as HTMLButtonElement).tabIndex,active:document.activeElement?.id,labelledBy:panel.getAttribute('aria-labelledby'),focusVisible:getComputedStyle(selected).outlineStyle==='solid'&&getComputedStyle(selected).outlineWidth==='3px'};});
 if(publicTabs.selected!=='true'||publicTabs.tabIndex!==0||publicTabs.otherTabIndex!==-1||publicTabs.active!=='practice-tab'||publicTabs.labelledBy!=='practice-tab'||!publicTabs.focusVisible)throw new Error('Public site tabs do not preserve keyboard selection, focus and panel labels: '+JSON.stringify(publicTabs));
 await browser.page.keyboard.press('Tab');if(!await browser.page.locator('[data-category="all"]').evaluate(element=>element===document.activeElement))throw new Error('Public site Tab should leave the widget at the next control');
 await browser.page.keyboard.press('Shift+Tab');await browser.page.keyboard.press('Home');if(await browser.page.locator('#real-tab').getAttribute('aria-selected')!=='true')throw new Error('Public site Home should select real website tasks');
 await browser.page.keyboard.press('Tab');if(!await browser.page.locator('[data-category="all"]').evaluate(element=>element===document.activeElement))throw new Error('Public site Tab should leave the real-task tab at the next control');
 for(const [category,count] of [['developer',4],['research',4],['everyday',2]] as const){await browser.page.keyboard.press('Tab');const filter=browser.page.locator(`[data-category="${category}"]`);if(!await filter.evaluate(element=>element===document.activeElement))throw new Error(`Keyboard focus skipped the ${category} filter`);await browser.page.keyboard.press('Enter');if(await filter.getAttribute('aria-pressed')!=='true'||await browser.page.locator('#task-list .task-card').count()!==count)throw new Error(`Keyboard filter failed for ${category}`);}
 for(let i=0;i<3;i++)await browser.page.keyboard.press('Shift+Tab');const allTasks=browser.page.locator('[data-category="all"]');if(!await allTasks.evaluate(element=>element===document.activeElement))throw new Error('Keyboard focus did not return to the all-tasks filter');await browser.page.keyboard.press('Enter');for(let i=0;i<3;i++)await browser.page.keyboard.press('Tab');
 const taskCards=browser.page.locator('#task-list .task-card');if(await taskCards.count()!==10)throw new Error('All real task cards did not return');
 for(let i=0;i<10;i++){const card=taskCards.nth(i),summary=card.locator('summary'),copy=card.getByRole('button',{name:'Copy goal'}),start=card.getByRole('link',{name:/Open starting page/});await browser.page.keyboard.press('Tab');if(!await summary.evaluate(element=>element===document.activeElement&&getComputedStyle(element).outlineStyle==='solid'&&getComputedStyle(element).outlineWidth==='3px'))throw new Error(`Keyboard focus did not visibly reach task ${i+1} details`);if(i===0){await browser.page.keyboard.press('Enter');if(await summary.locator('xpath=..').getAttribute('open')===null)throw new Error('Keyboard could not expand task details');await browser.page.keyboard.press('Enter');}
  await browser.page.keyboard.press('Tab');if(!await copy.evaluate(element=>element===document.activeElement&&getComputedStyle(element).outlineStyle==='solid'))throw new Error(`Keyboard focus did not reach task ${i+1} copy action`);
  await browser.page.keyboard.press('Tab');if(!await start.evaluate(element=>element===document.activeElement&&getComputedStyle(element).outlineStyle==='solid'))throw new Error(`Keyboard focus did not reach task ${i+1} starting-page link`);}
 await browser.page.setViewportSize({width:1600,height:1000});await browser.navigate(dashboard.url);
 await browser.page.locator('.brandmark').evaluate(el=>{if(!(el instanceof HTMLImageElement)||!el.complete||el.naturalWidth===0)throw new Error('Brand SVG did not load');});
 await browser.page.locator('header').screenshot({path:'artifacts/ui/brand.png'});
 await browser.page.screenshot({path:'artifacts/ui/workspace.png'});
 if(errors.length)throw new Error('Lab console errors: '+JSON.stringify(errors));console.log(JSON.stringify({pages:34,accessibleControls,practiceCards:8,labResponsiveWidths:[320,390,768,1440],keyboardTabs:true,brandLoaded:true,consoleErrors:errors}));
}finally{await accessibility.detach().catch(()=>{});await browser.close();await lab.close();await dashboard.close();}
