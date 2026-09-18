import {mkdir} from 'node:fs/promises';
import {Browser} from '../src/browser/Browser.js';
import {startLab} from './lab-server.js';
import {startServer} from '../src/server/index.js';
const lab=await startLab(),browser=await new Browser().launch();const errors:string[]=[];
const dashboard=await startServer({port:0,quiet:true});
browser.page.on('pageerror',error=>errors.push(error.message));browser.page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
 await mkdir('artifacts/lab',{recursive:true});
 await browser.navigate(lab.url);
 await browser.page.evaluate(()=>{
  sessionStorage.setItem('northstar-v2-product-flow',JSON.stringify({compared:['trail','summit']}));
  sessionStorage.setItem('northstar-v2-travel-flow',JSON.stringify({request:{from:'Paris',to:'Lyon',date:'2026-10-15',passengers:'2 adults',stepfree:true,refund:true,changes:1,budget:120}}));
  localStorage.setItem('northstar-v2-itinerary',JSON.stringify({from:'Paris',to:'Lyon',date:'2026-10-15',passengers:'2 adults',service:'Flex Regional',totalEUR:90}));
 });
 for(const [name,path] of [['home',''],['products','workspace.html?view=products'],['travel','workspace.html?view=travel'],['billing','workspace.html?view=billing'],['analytics','workspace.html?view=analytics'],['settings','workspace.html?view=settings'],['documents','workspace.html?view=documents'],['product-details','product-details.html?id=trail'],['product-comparison','product-comparison.html'],['journey-results','journey-results.html'],['itinerary','itinerary.html'],['invoice-details','invoice-details.html?id=INV-2609-04']] as const){
  await browser.page.setViewportSize({width:1440,height:1050});await browser.navigate(lab.url+path);
  await browser.page.screenshot({path:`artifacts/lab/${name}.png`,fullPage:true});
  await browser.page.setViewportSize({width:390,height:900});
  if(!await browser.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))throw new Error('Responsive overflow: '+name);
  await browser.page.screenshot({path:`artifacts/lab/${name}-mobile.png`,fullPage:true});
 }
 await browser.page.setViewportSize({width:1600,height:1000});await browser.navigate(dashboard.url);
 await browser.page.locator('.brandmark').evaluate(el=>{if(!(el instanceof HTMLImageElement)||!el.complete||el.naturalWidth===0)throw new Error('Brand SVG did not load');});
 await browser.page.locator('header').screenshot({path:'artifacts/ui/brand.png'});
 await browser.page.screenshot({path:'artifacts/ui/workspace.png'});
 if(errors.length)throw new Error('Lab console errors: '+JSON.stringify(errors));console.log(JSON.stringify({pages:12,widths:[1440,390],brandLoaded:true,consoleErrors:errors}));
}finally{await browser.close();await lab.close();await dashboard.close();}
