import {mkdir,writeFile} from 'node:fs/promises';
import {pages,shell} from '../fixtures/server.js';
const routes=Object.keys(pages).sort((a,b)=>b.length-a.length);
const filename=(route:string)=>route==='/'?'index.html':route.slice(1).replaceAll('/','-')+'.html';
await mkdir('docs/lab',{recursive:true});
for(const [route,[title,body]] of Object.entries(pages)){
  if(route==='/injection')continue; // Keep intentionally malicious material in local security fixtures only.
  let html=shell(title,body);
  html=html.replace("await fetch('/api/contact',{method:'POST',body:new FormData(e.target)})","await Promise.resolve()");
  for(const target of routes)html=html.replaceAll(`"${target}"`,`"${filename(target)}"`).replaceAll(`'${target}'`,`'${filename(target)}'`).replaceAll(`&#34;${target}&#34;`,`&#34;${filename(target)}&#34;`);
  html=html.replaceAll('/download/invoice.txt','invoice.txt');
  html=html.replace('<main>','<main><p style="font-size:12px;color:#77836f">PUBLIC BROWSER TEST LAB · Synthetic data · Forms are simulations. No messages, purchases or real account changes occur.</p>');
  await writeFile('docs/lab/'+filename(route),html+'\n');
}
await writeFile('docs/lab/invoice.txt','NORTHSTAR DEMO INVOICE\nINV-001\nAmount: EUR 42\nSynthetic public browser benchmark fixture\n');
await writeFile('docs/.nojekyll','');
await writeFile('docs/index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>FreeComputerUse · Browser Test Lab</title><style>body{max-width:750px;margin:10vh auto;padding:28px;background:#f5f6ee;color:#294132;font:18px/1.7 Georgia,serif}h1{font-size:52px;line-height:1.1}a{color:#34591d}small{font:12px monospace;color:#7a8c6f}ul{padding-left:22px}</style></head><body><small>FREECOMPUTERUSE / PUBLIC TEST LAB</small><h1>Plan once.<br>Execute many.</h1><p>A free, repeatable website for testing DOM-first browser automation. All data is synthetic. Forms, authentication and settings are browser simulations; they do not send messages or create real accounts.</p><ul><li><a href="lab/index.html">Open the browser test lab</a></li><li><a href="lab/catalogue.html">Compare products</a></li><li><a href="lab/wizard.html">Find a travel ticket</a></li><li><a href="lab/reports.html">Extract a dashboard</a></li><li><a href="lab/invoices.html">Download a synthetic invoice</a></li><li><a href="lab/settings.html">Change local preferences</a></li><li><a href="lab/session-login.html">Test browser session reuse</a></li><li><a href="lab/dynamic.html">Navigate dynamic controls</a></li></ul><p><a href="https://github.com/OthmaneBlial/FreeComputerUse">Source, installation and measured benchmarks ↗</a></p></body></html>\n`);
console.log('Built static public lab at docs/lab (no submission backend).');
