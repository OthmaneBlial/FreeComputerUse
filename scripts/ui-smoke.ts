import {mkdir,mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Browser} from '../src/browser/Browser.js';
import {startServer} from '../src/server/index.js';
import {loadEnvironment} from '../src/config.js';
const interaction=process.argv.includes('--interaction');
if(!interaction){process.env.LLM_PROVIDER='openai-compatible';process.env.LLM_API_KEY='';}
loadEnvironment();process.env.FCU_DATA_DIR=await mkdtemp(join(tmpdir(),'free-computer-use-ui-smoke-'));
const dashboard=await startServer({port:0,quiet:true});const browser=await new Browser({allowedOrigins:[dashboard.url]}).launch();
const errors:string[]=[];browser.page.on('pageerror',error=>errors.push(error.message));browser.page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await browser.page.setViewportSize({width:1600,height:1000});await browser.navigate(dashboard.url);
  await browser.page.locator('#start-url').fill(`https://othmaneblial.github.io/FreeComputerUse/lab/${interaction?'catalogue':'reports'}.html`);
  await browser.page.locator('#goal').fill(interaction?'Type keyboard into Search products, open Trail keyboard, then extract the product name, price and stock availability.':'Extract the table');
  if(interaction){await browser.page.getByRole('button',{name:'Run options'}).click();await browser.page.locator('#use-workflows').uncheck();await browser.page.getByRole('button',{name:'Close run options'}).click();}
  await browser.page.getByRole('button',{name:'Run task',exact:true}).click();
  await browser.page.locator('#approval').waitFor({state:'visible',timeout:20000});
  if(dashboard.getAgent()?.browser.page.url()!=='about:blank')throw new Error('Site visited before dashboard approval');
  await mkdir('artifacts/ui',{recursive:true});await browser.page.screenshot({path:'artifacts/ui/permission.png'});
  const cursorCapture=interaction?(async()=>{
    await browser.page.waitForFunction(()=>['fill','type'].includes(document.querySelector('#agent-cursor')?.getAttribute('data-kind')??''),undefined,{timeout:90000});
    await browser.page.screenshot({path:'artifacts/ui/interaction.png'});
  })().then(()=>({captured:true as const}),error=>({captured:false as const,error:String(error)})):undefined;
  await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
  await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:90000});
  try{await browser.page.waitForFunction(()=>(document.querySelector('#preview') as HTMLImageElement)?.naturalWidth>0,undefined,{timeout:10000});}catch(error){console.log(JSON.stringify({errors,preview:await browser.page.locator('#preview').evaluate(el=>({src:(el as HTMLImageElement).src,width:(el as HTMLImageElement).naturalWidth,hidden:(el as HTMLImageElement).hidden})),status:dashboard.getAgent()?.trace?.status}));throw error;}
  await browser.page.getByRole('button',{name:'View result'}).click();
  const output=await browser.page.locator('#result-output').innerText();
  if(!output.includes(interaction?'Trail keyboard':'March'))throw new Error('Dashboard did not show extracted results');
  if(interaction&&(!output.includes('$39')||!output.includes('Available in stock')||!dashboard.getAgent()?.browser.page.url().endsWith('/product.html')))throw new Error('Product details or destination failed the independent oracle');
  const capture=await cursorCapture;if(capture&&!capture.captured)throw new Error('Visible typing cursor was not captured: '+capture.error);
  await browser.page.getByRole('button',{name:'Close task result'}).click();
  for(const [name,width] of [['desktop',1600],['mobile',390]] as const){
    await browser.page.setViewportSize({width,height:1000});await browser.page.waitForTimeout(600);
    if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Responsive overflow');
    await browser.page.screenshot({path:`artifacts/ui/${name}.png`,fullPage:true});
  }
  if(errors.length)throw new Error('UI console errors: '+JSON.stringify(errors));
  console.log(JSON.stringify({status:dashboard.getAgent()?.trace?.status,model:dashboard.getAgent()?.trace?.metrics.provider,metrics:dashboard.getAgent()?.trace?.metrics,consoleErrors:errors,responsiveWidths:[1600,390],previewLoaded:true,visibleTypingCaptured:capture?.captured}));
}finally{await browser.close();await dashboard.close();await rm(process.env.FCU_DATA_DIR,{recursive:true,force:true});}
