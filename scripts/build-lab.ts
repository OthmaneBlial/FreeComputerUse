import {mkdir,writeFile,copyFile,readFile} from 'node:fs/promises';
import {pages,shell} from '../fixtures/server.js';
const routes=Object.keys(pages).sort((a,b)=>b.length-a.length);
const filename=(route:string)=>route==='/'?'index.html':route.slice(1).replaceAll('/','-')+'.html';
await mkdir('docs/lab',{recursive:true});
for(const [route,[title,body]] of Object.entries(pages)){
  if(route==='/injection')continue; // Keep intentionally malicious material in local security fixtures only.
  let html=shell(title,body).replace(/<style>[\s\S]*?<\/style>/,'<link rel="stylesheet" href="lab.css">');
  html=html.replace(/<nav>[\s\S]*?<\/nav>/,'<header class="masthead"><a class="logo" href="index.html"><span class="logo-mark">✳</span><span>Northstar<small>FOCUSED BROWSER CHECK</small></span></a><nav><a href="index.html">Task library</a><a href="workspace.html?view=products">Practice workspace</a></nav><span class="sandbox-tag">SYNTHETIC DATA</span></header>');
  html=html.replace("await fetch('/api/contact',{method:'POST',body:new FormData(e.target)})","await Promise.resolve()");
  for(const target of routes)html=html.replaceAll(`"${target}"`,`"${filename(target)}"`).replaceAll(`'${target}'`,`'${filename(target)}'`).replaceAll(`&#34;${target}&#34;`,`&#34;${filename(target)}&#34;`);
  html=html.replaceAll('/download/invoice.txt','invoice.txt');
  html=html.replace('<main>','<main class="legacy-page"><p>PUBLIC BROWSER TEST LAB · Synthetic data · Forms are simulations. No messages, purchases or real account changes occur.</p>');
  await writeFile('docs/lab/'+filename(route),html+'\n');
}
await writeFile('docs/lab/invoice.txt','NORTHSTAR DEMO INVOICE\nINV-001\nAmount: EUR 42\nSynthetic public browser benchmark fixture\n');
await writeFile('docs/.nojekyll','');
for(const asset of ['index.html','workspace.html','lab.css','home.js','workspace.js','flows.js','cases.js','examples.js'])await copyFile('lab/'+asset,'docs/lab/'+asset);
const workspace=await readFile('lab/workspace.html','utf8');
for(const screen of ['product-details','product-comparison','journey-results','itinerary','invoice-details','close-revenue','close-ledger','close-adjustment','close-policy','close-review','incident-detail','incident-metrics','incident-deployments','incident-runbook','incident-brief'])await writeFile(`docs/lab/${screen}.html`,workspace.replace('<body>',`<body data-screen="${screen}">`));
await writeFile('docs/index.html',(await readFile('lab/index.html','utf8')).replace('<head>','<head><base href="lab/">'));
console.log('Built static public lab at docs/lab (no submission backend).');
