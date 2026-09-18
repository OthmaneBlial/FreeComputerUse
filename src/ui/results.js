const node=(tag,className,value)=>{const el=document.createElement(tag);if(className)el.className=className;if(value!==undefined)el.textContent=String(value);return el;};
const label=value=>String(value).replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[_-]+/g,' ').replace(/^./,s=>s.toUpperCase());
const safeLink=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password?url.href:null;}catch{return null;}};
const scalar=value=>value===null?'—':typeof value==='object'?JSON.stringify(value):String(value);
function facts(text){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),items=[];
  const field=/^(route|date|passengers|service|total price|price|duration|access|fare|product|name|battery(?: life)?|weight|availability|stock|status|owner|customer|invoice(?: number)?|total|currency|timezone|time zone|updated|author|licen[cs]e|version|language|departure|arrival|interchanges)$/i;
  for(let i=0;i<lines.length-1;i++)if(field.test(lines[i])&&!field.test(lines[i+1])){items.push([lines[i],lines[++i]]);}
  return items.length>=3?items:[];
}
function definition(items){const dl=node('dl','result-facts');for(const [key,value] of items){const item=node('div');item.append(node('dt','',label(key)),node('dd','',scalar(value)));dl.append(item);}return dl;}
function table(headers,rows){const wrap=node('div','result-table-wrap'),el=node('table','result-table'),head=node('thead'),tr=node('tr');for(const h of headers)tr.append(node('th','',label(h)));head.append(tr);el.append(head);const body=node('tbody');for(const row of rows){const line=node('tr');for(let i=0;i<headers.length;i++)line.append(node('td','',scalar(row[i]??'')));body.append(line);}el.append(body);wrap.append(el);return wrap;}
function content(value,format){
  if(typeof value==='string'){
    const extracted=facts(value),wrap=node('div');
    if(extracted.length){wrap.append(definition(extracted));const details=node('details','result-source');details.append(node('summary','','View source text'),node('div','result-prose',value));wrap.append(details);}
    else wrap.append(node('div','result-prose',value));
    return wrap;
  }
  if(Array.isArray(value)){
    if(!value.length)return node('p','result-empty','No matching items.');
    if(value.every(Array.isArray)){const [headers,...rows]=value;return table(headers,rows);}
    if(value.every(item=>item&&typeof item==='object'&&!Array.isArray(item))){
      if(format==='links'){const list=node('ul','result-links');for(const item of value){const li=node('li'),url=safeLink(item.url);if(url){const a=node('a','',item.text||url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';li.append(a,node('small','',url));}else li.append(node('span','',item.text||'Unavailable link'));list.append(li);}return list;}
      const headers=[...new Set(value.flatMap(Object.keys))];return table(headers,value.map(item=>headers.map(h=>item[h])));
    }
    const list=node('ul','result-list');for(const item of value)list.append(node('li','',scalar(item)));return list;
  }
  if(value&&typeof value==='object')return definition(Object.entries(value));
  return node('p','result-prose',scalar(value));
}
export function renderResults(container,trace){
  container.replaceChildren();const sections=new Map(),downloads=[];
  for(const [index,receipt] of (trace?.actions||[]).entries()){
    if(!receipt.success||receipt.data===undefined)continue;
    if(receipt.action.type==='download'){downloads.push({index,filename:receipt.data.filename});continue;}
    const data=receipt.data;
    for(const [key,value] of Object.entries(data&&typeof data==='object'&&!Array.isArray(data)?data:{result:data}))sections.set(key,{key,value,format:receipt.action.format});
  }
  const seen=new Set(),unique=[...sections.values()].reverse().filter(section=>{const fingerprint=JSON.stringify(section.value);if(seen.has(fingerprint))return false;seen.add(fingerprint);return true;});
  const overview=node('div','result-overview'),status=node('span','result-status '+(trace?.status==='completed'?'complete':'partial'),trace?.status==='completed'?'Completed':trace?.status==='running'?'In progress':'Partial result');
  overview.append(status,node('span','result-count',`${unique.length} result${unique.length===1?'':'s'} · ${downloads.length} saved file${downloads.length===1?'':'s'}`));container.append(overview);
  if(trace?.status!=='completed')container.append(node('p','result-caveat',trace?.status==='running'?'The task is still running. These are the results collected so far.':'The task did not finish. These are the results collected before it stopped; requested files may be missing.'));
  if(downloads.length){const card=node('section','result-card');card.append(node('h3','','Saved files'));for(const file of downloads){const row=node('div','result-file');row.append(node('span','file-icon','↧'),node('strong','',file.filename||'Downloaded file'));const a=node('a','file-save','Download file');a.href=`/api/download?id=${encodeURIComponent(trace.id)}&index=${file.index}`;a.download=file.filename||'';row.append(a);card.append(row);}container.append(card);}
  for(const [index,section] of unique.entries()){
    const card=node('section','result-card');card.append(node('h3','',label(section.key)));
    if(index>0&&typeof section.value==='string'&&!facts(section.value).length){const details=node('details','result-supporting');details.append(node('summary','','Read extracted text'),content(section.value,section.format));card.append(details);}
    else card.append(content(section.value,section.format));
    container.append(card);
  }
  if(!unique.length&&!downloads.length)container.append(node('p','result-empty','No extracted results or saved files yet.'));
  return unique.length+downloads.length;
}
export function reportHtml(container,goal){
  const title=node('h1','',goal||'Browser task result');
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Task report</title><style>body{max-width:960px;margin:48px auto;padding:0 24px;font:16px/1.6 "Avenir Next",sans-serif;color:#253c34;background:#f8f9f4}h1{font-size:26px}h3{font-size:18px}.result-card{margin:24px 0;padding:24px;background:white;border:1px solid #dce3d9;border-radius:12px}.result-overview{display:flex;justify-content:space-between;gap:20px}.result-status{font-weight:bold}.result-facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:20px}dt{font-size:12px;color:#667a70}dd{margin:4px 0;font-weight:600}.result-prose{white-space:pre-wrap;overflow-wrap:anywhere}.result-table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:12px;border-bottom:1px solid #dce3d9}.result-source{margin-top:20px}small{display:block;overflow-wrap:anywhere}.result-file{display:flex;gap:16px;align-items:center}.file-save{display:none}.result-caveat{padding:16px;background:#fff2de}@media print{body{margin:0}.result-card{break-inside:avoid}}</style></head><body>'+title.outerHTML+container.innerHTML+'</body></html>';
}
