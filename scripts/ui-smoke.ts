import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {loadEnvironment} from '../src/config.js';
loadEnvironment();process.env.FCU_DATA_DIR=resolve('.fcu/ui-smoke');
const dashboard=await startServer({port:0,quiet:true});const browser=await new Browser().launch();
const errors:string[]=[];browser.page.on('pageerror',error=>errors.push(error.message));browser.page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await browser.page.setViewportSize({width:1600,height:1000});await browser.navigate(dashboard.url);
  await browser.page.locator('#start-url').fill('https://othmaneblial.github.io/FreeComputerUse/lab/reports.html');
  await browser.page.locator('#goal').fill('Extract the revenue dashboard table, including all three months and their revenues.');
  await browser.page.getByRole('button',{name:'Run task',exact:true}).click();
  await browser.page.locator('#approval').waitFor({state:'visible',timeout:20000});
  if(dashboard.getAgent()?.browser.page.url()!=='about:blank')throw new Error('Site visited before dashboard approval');
  await mkdir('artifacts/ui',{recursive:true});await browser.page.screenshot({path:'artifacts/ui/permission.png'});
  await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
  await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:90000});
  try{await browser.page.waitForFunction(()=>(document.querySelector('#preview') as HTMLImageElement)?.naturalWidth>0,undefined,{timeout:10000});}catch(error){console.log(JSON.stringify({errors,preview:await browser.page.locator('#preview').evaluate(el=>({src:(el as HTMLImageElement).src,width:(el as HTMLImageElement).naturalWidth,hidden:(el as HTMLImageElement).hidden})),status:dashboard.getAgent()?.trace?.status}));throw error;}
  if(!(await browser.page.locator('#result-output').innerText()).includes('March'))throw new Error('Dashboard did not show extracted results');
  for(const [name,width] of [['desktop',1600],['mobile',390]] as const){
    await browser.page.setViewportSize({width,height:1000});await browser.page.waitForTimeout(600);
    if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Responsive overflow');
    await browser.page.screenshot({path:`artifacts/ui/${name}.png`,fullPage:true});
  }
  if(errors.length)throw new Error('UI console errors: '+JSON.stringify(errors));
  console.log(JSON.stringify({status:dashboard.getAgent()?.trace?.status,model:dashboard.getAgent()?.trace?.metrics.provider,metrics:dashboard.getAgent()?.trace?.metrics,consoleErrors:errors,responsiveWidths:[1600,390],previewLoaded:true}));
}finally{await browser.close();await dashboard.close();}
