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
const assertContrast=async(selector:string)=>{
  const samples=await browser.page.locator(selector).evaluate(root=>{
    const samples:{text:string;color:string;background:string[];opacity:number;fontSize:number;fontWeight:number}[]=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode,text=node.nodeValue?.trim(),element=node.parentElement;if(!text||!element||element.closest('[hidden],[aria-hidden="true"],button:disabled'))continue;
      const style=getComputedStyle(element),bounds=element.getBoundingClientRect();if(!bounds.width||!bounds.height||style.visibility==='hidden')continue;
      const background:string[]=[];let opacity=1;for(let parent:Element|null=element;parent;parent=parent.parentElement){background.unshift(getComputedStyle(parent).backgroundColor);opacity*=Number(getComputedStyle(parent).opacity||1);}
      samples.push({text,color:style.color,background,opacity,fontSize:parseFloat(style.fontSize),fontWeight:parseInt(style.fontWeight)||400});
    }
    return samples;
  });
  type RGB=[number,number,number];type RGBA=[number,number,number,number];
  const parseColor=(value:string):RGBA|null=>{const match=value.match(/^rgba?\(([^)]+)\)$/);if(!match)return null;const parts=(match[1]??'').split(/[ ,/]+/).filter(Boolean).map(Number);return[Number(parts[0]),Number(parts[1]),Number(parts[2]),parts[3]??1];};
  const blend=(front:RGBA,back:RGB):RGB=>[front[0]*front[3]+back[0]*(1-front[3]),front[1]*front[3]+back[1]*(1-front[3]),front[2]*front[3]+back[2]*(1-front[3])];
  const luminance=(value:RGB)=>{const linear=(channel:number)=>{const normalized=channel/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4;};return .2126*linear(value[0])+.7152*linear(value[1])+.0722*linear(value[2]);};
  const failures:string[]=[];
  for(const sample of samples){
    const foreground=parseColor(sample.color);if(!foreground)continue;let background:RGB=[255,255,255];for(const value of sample.background){const parsed=parseColor(value);if(parsed&&parsed[3]>0)background=blend(parsed,background);}foreground[3]*=sample.opacity;
    const rendered=blend(foreground,background),ratio=(Math.max(luminance(rendered),luminance(background))+.05)/(Math.min(luminance(rendered),luminance(background))+.05),large=sample.fontSize>=24||(sample.fontSize>=18.67&&sample.fontWeight>=700);
    if(ratio<(large?3:4.5))failures.push(`${sample.text.slice(0,40)} (${ratio.toFixed(2)}:1)`);
  }
  if(failures.length)throw new Error(`Text contrast below WCAG AA in ${selector}: ${failures.join(', ')}`);
};
try{
  await browser.page.setViewportSize({width:1600,height:1000});await browser.navigate(dashboard.url);
  const unnamedControls=await browser.page.locator('body').evaluate(root=>{
    const issues:string[]=[];
    for(const element of root.querySelectorAll('button,input,textarea,select,a')){
      if(element.closest('[hidden],[aria-hidden="true"],dialog:not([open])')||!element.getClientRects().length||element.matches('input[type="hidden"]'))continue;
      const labelled=element.hasAttribute('aria-label')||element.hasAttribute('aria-labelledby')||element.matches('input,textarea,select')&&(element as HTMLInputElement).labels?.length||element.matches('a,button')&&(element.textContent?.trim()||element.hasAttribute('title'));
      if(!labelled)issues.push(`${element.tagName.toLowerCase()}#${element.id}`);
    }
    return issues;
  });
  if(unnamedControls.length)throw new Error(`Visible controls lack accessible names: ${unnamedControls.join(', ')}`);
  const startURL=`https://othmaneblial.github.io/FreeComputerUse/lab/${interaction?'catalogue':'reports'}.html`,goal=interaction?'Type keyboard into Search products, open Trail keyboard, then extract the product name, price and stock availability.':'Extract the table';
  if(interaction){await browser.page.locator('#start-url').fill(startURL);await browser.page.locator('#goal').fill(goal);}
  else{
    const focusId=()=>browser.page.evaluate(()=>{const element=document.activeElement;return element?.id||(element?.getAttribute('aria-label')==='FreeComputerUse home'?'home':'');});
    const focusWithTab=async(id:string)=>{for(let i=0;i<24&&await focusId()!==id;i++)await browser.page.keyboard.press('Tab');if(await focusId()!==id)throw new Error(`Keyboard focus did not reach ${id}`);};
    await focusWithTab('home');await focusWithTab('profile-open');await focusWithTab('start-url');await browser.page.keyboard.type(startURL);
    await focusWithTab('goal');await browser.page.keyboard.type(goal);await focusWithTab('options-open');await focusWithTab('run');await browser.page.keyboard.press('Enter');
  }
  if(interaction){await browser.page.getByRole('button',{name:'Run options'}).click();await browser.page.locator('#use-workflows').uncheck();await browser.page.getByRole('button',{name:'Close run options'}).click();}
  if(interaction)await browser.page.getByRole('button',{name:'Run task',exact:true}).click();
  await browser.page.locator('#approval').waitFor({state:'visible',timeout:20000});
  if(dashboard.getAgent()?.browser.page.url()!=='about:blank')throw new Error('Site visited before dashboard approval');
  await mkdir('artifacts/ui',{recursive:true});await browser.page.screenshot({path:'artifacts/ui/permission.png'});
  const cursorCapture=interaction?(async()=>{
    await browser.page.waitForFunction(()=>['fill','type'].includes(document.querySelector('#agent-cursor')?.getAttribute('data-kind')??''),undefined,{timeout:90000});
    await browser.page.screenshot({path:'artifacts/ui/interaction.png'});
  })().then(()=>({captured:true as const}),error=>({captured:false as const,error:String(error)})):undefined;
  if(interaction)await browser.page.getByRole('button',{name:'Approve action',exact:true}).click();
  else{const focusId=()=>browser.page.evaluate(()=>document.activeElement instanceof HTMLElement?document.activeElement.id:'');for(let i=0;i<24&&await focusId()!=='approve';i++)await browser.page.keyboard.press('Tab');if(await focusId()!=='approve')throw new Error('Keyboard focus did not reach site approval');await browser.page.keyboard.press('Enter');}
  await browser.page.waitForFunction(()=>document.querySelector('#status')?.textContent==='COMPLETED',undefined,{timeout:90000});
  try{await browser.page.waitForFunction(()=>(document.querySelector('#preview') as HTMLImageElement)?.naturalWidth>0,undefined,{timeout:10000});}catch(error){console.log(JSON.stringify({errors,preview:await browser.page.locator('#preview').evaluate(el=>({src:(el as HTMLImageElement).src,width:(el as HTMLImageElement).naturalWidth,hidden:(el as HTMLImageElement).hidden})),status:dashboard.getAgent()?.trace?.status}));throw error;}
  await assertContrast('body');
  if(interaction)await browser.page.getByRole('button',{name:'View result'}).click();
  else{const focusId=()=>browser.page.evaluate(()=>document.activeElement instanceof HTMLElement?document.activeElement.id:'');for(let i=0;i<24&&await focusId()!=='result-open';i++)await browser.page.keyboard.press('Tab');if(await focusId()!=='result-open')throw new Error('Keyboard focus did not reach task result');await browser.page.keyboard.press('Enter');}
  const output=await browser.page.locator('#result-output').innerText();
  if(!output.includes(interaction?'Trail keyboard':'March'))throw new Error('Dashboard did not show extracted results');
  await assertContrast('#result-dialog');
  if(interaction&&(!output.includes('$39')||!output.includes('Available in stock')||!dashboard.getAgent()?.browser.page.url().endsWith('/product.html')))throw new Error('Product details or destination failed the independent oracle');
  const capture=await cursorCapture;if(capture&&!capture.captured)throw new Error('Visible typing cursor was not captured: '+capture.error);
  if(interaction)await browser.page.getByRole('button',{name:'Close task result'}).click();else await browser.page.keyboard.press('Escape');
  for(const [name,width] of [['desktop',1600],['narrow',320],['mobile',390],['tablet',768]] as const){
    await browser.page.setViewportSize({width,height:1000});await browser.page.waitForTimeout(600);
    if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Responsive overflow');
    await browser.page.screenshot({path:`artifacts/ui/${name}.png`,fullPage:true});
  }
  if(errors.length)throw new Error('UI console errors: '+JSON.stringify(errors));
  console.log(JSON.stringify({status:dashboard.getAgent()?.trace?.status,model:dashboard.getAgent()?.trace?.metrics.provider,metrics:dashboard.getAgent()?.trace?.metrics,consoleErrors:errors,responsiveWidths:[1600,320,390,768],previewLoaded:true,visibleTypingCaptured:capture?.captured}));
}finally{await browser.close();await dashboard.close();await rm(process.env.FCU_DATA_DIR,{recursive:true,force:true});}
