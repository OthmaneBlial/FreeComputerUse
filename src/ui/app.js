import {renderResults,reportHtml} from './results.js';
const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name=csrf-token]').content;
let state={},busy=false,lastEventCount=0,previewPending=false,refreshPending=false,resultKey='',resultCount=0;
let currentRunId='',previewPageId=0,pointer,lastPointerSequence=-1,lastClickSequence=-1,approvalKey='';
function mobileView(view){document.body.dataset.mobileView=view;for(const button of document.querySelectorAll('[data-mobile-view]'))button.setAttribute('aria-pressed',String(button.dataset.mobileView===view));}
mobileView('task');for(const button of document.querySelectorAll('[data-mobile-view]'))button.onclick=()=>mobileView(button.dataset.mobileView);
const panel=$('browser-panel');
panel.append($('edit-dialog'));
const expanded=()=>document.fullscreenElement===panel||panel.classList.contains('expanded');
function fullscreenState(){const active=expanded();$('fullscreen').setAttribute('aria-pressed',String(active));$('fullscreen').setAttribute('aria-label',active?'Exit full screen browser':'Full screen browser');$('fullscreen').lastElementChild.textContent=active?'Exit full screen':'Full screen';paintPointer();}
$('fullscreen').onclick=protect(async()=>{if(document.fullscreenElement)await document.exitFullscreen();else if(panel.classList.contains('expanded'))panel.classList.remove('expanded');else if(document.fullscreenEnabled&&panel.requestFullscreen){try{await panel.requestFullscreen();}catch{panel.classList.add('expanded');}}else panel.classList.add('expanded');fullscreenState();});
document.addEventListener('fullscreenchange',fullscreenState);document.addEventListener('keydown',event=>{if(event.key==='Escape'&&panel.classList.contains('expanded')){panel.classList.remove('expanded');fullscreenState();}});
function openDialog(id){$(id).showModal();}
$('options-open').onclick=()=>openDialog('options-dialog');$('history-open').onclick=()=>openDialog('history-dialog');$('stream-open').onclick=()=>{openDialog('stream-dialog');$('events').scrollTop=$('events').scrollHeight;};$('result-open').onclick=()=>openDialog('result-dialog');
$('ultra').onchange=()=>{document.querySelector('.permission-note').textContent=$('ultra').checked?'Ultra mode enabled · no approval prompts.':'Website access requires your approval.';};
const interactionNames={moving:'Moving to the next control',click:'Clicking',doubleClick:'Double-clicking',hover:'Hovering',fill:'Typing into the field',type:'Typing',select:'Choosing an option',check:'Checking the box',uncheck:'Unchecking the box',press:'Pressing a key',scroll:'Scrolling the page',upload:'Attaching the local file',submit:'Submitting the approved form',extract:'Reading the page',idle:'Browser ready'};
const text=(id,value)=>{$(id).textContent=value;};
function notice(message,error=false){text('notice',message);$('notice').classList.toggle('error',error);}
async function api(path,data){const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-FCU-Token':token},body:data===undefined?undefined:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed');return body;}
function protect(fn){return async event=>{event?.preventDefault();try{await fn(event);}catch(error){notice(error.message,true);}};}
function fmt(value){return Number(value||0).toLocaleString('en-US');}
function contentRect(){
  const image=$('preview'),rect=image.getBoundingClientRect();
  if(!image.naturalWidth||!image.naturalHeight||image.hidden)return;
  const scale=Math.min(rect.width/image.naturalWidth,rect.height/image.naturalHeight),width=image.naturalWidth*scale,height=image.naturalHeight*scale;
  return {left:rect.left+(rect.width-width)/2,top:rect.top+(rect.height-height)/2,width,height};
}
function preparation(){
  const latest=state.events?.at(-1);
  if(!state.active||state.pending||state.paused||!latest||!['PLAN','REPAIR'].includes(latest.phase))return;
  if(latest.phase==='PLAN'&&latest.message==='Validated plan')return;
  const seconds=Math.max(0,Math.floor((Date.now()-latest.time)/1000));
  return {seconds,label:(latest.phase==='REPAIR'?'Preparing a correction':'Preparing the next actions')+` · ${seconds}s`,detail:seconds>=15?'Waiting for the model reply; no browser action has run during this preparation.':'Waiting for the model reply.'};
}
function paintPointer(){
  const cursor=$('agent-cursor'),ring=$('click-ring'),rect=contentRect(),stage=$('pointer-layer').getBoundingClientRect();
  const visible=pointer?.visible&&rect&&pointer.pageId===previewPageId;
  cursor.hidden=!visible;
  const preparing=preparation();cursor.classList.toggle('preparing',!!preparing);
  text('interaction-label',state.pending?'Waiting for your approval':state.paused?'You have control':preparing?preparing.label:state.active?(interactionNames[pointer?.kind]||'Planning the next browser actions'):state.trace?.status==='completed'?'Task complete':state.trace?.status==='stopped'?'Task stopped':'Watch the browser work here');
  $('interaction-label').title=preparing?.detail||'';
  if(preparing)text('control-state',preparing.detail);
  if(!visible){ring.hidden=true;return;}
  const x=rect.left-stage.left+pointer.x/pointer.width*rect.width,y=rect.top-stage.top+pointer.y/pointer.height*rect.height;
  cursor.style.transform=`translate(${x}px,${y}px)`;cursor.dataset.sequence=pointer.sequence;cursor.dataset.kind=pointer.kind;cursor.dataset.pageId=pointer.pageId;
  const typing=pointer.kind==='fill'||pointer.kind==='type';cursor.classList.toggle('typing',typing);
  if(['click','doubleClick','check','uncheck'].includes(pointer.kind)&&pointer.sequence!==lastClickSequence){
    lastClickSequence=pointer.sequence;ring.hidden=false;ring.style.left=x+'px';ring.style.top=y+'px';ring.classList.remove('pulse');void ring.offsetWidth;ring.classList.add('pulse');
  }
}
function acceptPointer(next,runId=currentRunId){
  if(!next||runId!==currentRunId||next.sequence<lastPointerSequence)return;
  pointer=next;lastPointerSequence=next.sequence;paintPointer();
}
function render(snapshot){
  state=snapshot;const trace=state.trace,metrics=trace?.metrics||{},active=state.active,paused=state.paused;
  if((trace?.id||'')!==currentRunId){
    currentRunId=trace?.id||'';previewPageId=0;pointer=undefined;lastPointerSequence=-1;lastClickSequence=-1;
    const old=$('preview').src;if(old.startsWith('blob:'))URL.revokeObjectURL(old);$('preview').removeAttribute('src');$('preview').hidden=true;$('browser-empty').hidden=false;
  }
  acceptPointer(state.pointer);paintPointer();
  text('model',state.model);text('model-note',state.configured?'Batch planning. Local execution.':'Configure a provider in .env to plan new tasks.');
  const status=state.pending?'APPROVAL':paused?'PAUSED':active?'RUNNING':trace?.status?.toUpperCase()||'IDLE';text('status',status);$('status').classList.toggle('active',active);
  $('run').disabled=active||busy;$('run').firstChild.textContent=active?'Task running ':'Run task ';
  $('pause').disabled=!active||paused;$('resume').disabled=!paused||!active;$('stop').disabled=!active;$('edit-open').disabled=!active||!paused;
  text('page-url',state.browserUrl||state.state?.url||'No page open');text('control-state',paused?'Manual control · browser clicks enabled':active?'Agent is controlling the browser':trace?.status==='completed'?'Task verified and completed':'Ready when you are');
  $('manual-tools').hidden=!paused;$('preview').classList.toggle('manual',paused);
  $('approval').hidden=!state.pending;if(state.pending){
    const nextKey=currentRunId+JSON.stringify(state.pending)+(state.events?.filter(e=>e.phase==='HUMAN').at(-1)?.time??'');
    if(nextKey!==approvalKey){mobileView('browser');for(const dialog of document.querySelectorAll('dialog[open]'))dialog.close();approvalKey=nextKey;}
    text('approval-reason',state.pending.reason);text('approval-action',typeof state.pending.action==='string'?state.pending.action:JSON.stringify(state.pending.action,null,2));
  }else approvalKey='';
  const calls=metrics.llmCalls??trace?.calls?.length??0,actions=metrics.browserActions??trace?.actions?.filter(a=>a.success).length??0;
  const input=metrics.inputTokens??trace?.calls?.reduce((n,c)=>n+c.usage.input,0)??0,output=metrics.outputTokens??trace?.calls?.reduce((n,c)=>n+c.usage.output,0)??0;
  text('calls',fmt(calls));text('actions',fmt(actions));text('ratio',calls?(actions/calls).toFixed(1):actions?'local':'—');text('tokens',fmt(input+output));text('cost',metrics.estimatedCostUSD==null?'—':'$'+Number(metrics.estimatedCostUSD).toFixed(5));
  const caps=[['input',input,state.limits?.maxInputTokens],['output',output,state.limits?.maxOutputTokens],['calls',calls,state.limits?.maxLLMCalls]].filter(([, ,limit])=>Number.isFinite(limit));
  $('budget').hidden=!caps.length;
  if(caps.length){const fraction=Math.min(1,Math.max(...caps.map(([,used,limit])=>used/limit)));text('budget-value',Math.round(fraction*100)+'%');$('budget-meter').style.width=fraction*100+'%';text('budget-limit',caps.map(([name,,limit])=>`${fmt(limit)} ${name}`).join(' / '));}
  const nextResultKey=JSON.stringify([trace?.id,trace?.status,trace?.actions?.filter(a=>a.success&&a.data!==undefined).map(a=>[a.action.type,a.action.key,a.data])]);
  if(nextResultKey!==resultKey){resultKey=nextResultKey;resultCount=renderResults($('result-output'),trace);}
  const outputs=resultCount;
  $('result-panel').hidden=!outputs;$('result-open').disabled=!outputs;
  for(const id of ['result-copy','result-save'])$(id).disabled=!outputs;
  for(const id of ['page-up','page-down'])$(id).disabled=!state.browserUrl||active&&!paused;
  const plan=trace?.plans?.at(-1);$('plan').replaceChildren();for(const step of plan?.steps||[preparation()?'Preparing the first action batch…':'Waiting for a task.']){const li=document.createElement('li');li.textContent=step;$('plan').append(li);}
  const observe=state.events?.filter(e=>e.phase==='OBSERVE').at(-1);text('compression',observe?.data?.reduction!=null?(observe.data.reduction*100).toFixed(1)+'% smaller':'—');
  text('warnings',state.state?.warnings?.join('\n')||'');
  const phase=state.events?.at(-1)?.phase;for(const span of $('loop').children)span.classList.toggle('current',span.textContent.toUpperCase()===phase);
  const newest=state.events?.at(-1),eventKey=[state.events?.length,newest?.time,newest?.phase,newest?.message].join(':');
  if(lastEventCount!==eventKey){lastEventCount=eventKey;const list=$('events'),oldTop=list.scrollTop,follow=!$('stream-dialog').open||list.scrollHeight-list.scrollTop-list.clientHeight<60;list.replaceChildren();for(const event of state.events||[]){const li=document.createElement('li'),badge=document.createElement('span'),message=document.createElement('span'),time=document.createElement('span');badge.className='phase '+event.phase;badge.textContent=event.phase;message.textContent=event.message;time.className='time';time.textContent=new Date(event.time).toLocaleTimeString('en-GB');li.append(badge,message,time);list.append(li);}list.scrollTop=follow?list.scrollHeight:oldTop;}
  text('history-count',state.history?.length||0);$('history').replaceChildren();for(const run of state.history||[]){const button=document.createElement('button'),title=document.createElement('strong'),meta=document.createElement('small');button.className='history-item';title.textContent=run.goal;meta.textContent=run.status.toUpperCase()+' · '+new Date(Number(run.started)).toLocaleDateString();button.append(title,meta);button.title=run.status==='completed'?'Replay this run with no model':'Use this task again';button.disabled=active;button.onclick=protect(async()=>{$('history-dialog').close();if(run.status==='completed'){await api('replay',{id:run.id});mobileView('browser');notice('Replaying successful semantic actions.');}else{$('goal').value=run.goal;$('start-url').value=run.url;mobileView('task');notice('Task loaded. Edit it before running.');}await refresh();});$('history').append(button);}if(!state.history?.length)text('history','Your first run starts here.');
  text('workflow-count',state.workflows?.length||0);
  if(trace?.error)notice(trace.error,true);
  paintPointer();
}
async function refresh(){if(refreshPending)return;refreshPending=true;try{render(await api('state'));}catch(error){notice('Connection lost: '+error.message,true);}finally{refreshPending=false;}}
async function preview(){
  if(previewPending||document.hidden)return;previewPending=true;
  try{
    const response=await fetch('/api/preview');if(!response.ok||response.status===204)return;
    const runId=response.headers.get('X-FCU-Run-ID'),pageId=Number(response.headers.get('X-FCU-Page-ID'));
    if(runId!==currentRunId)return;
    const blob=await response.blob(),url=URL.createObjectURL(blob),old=$('preview').src;
    await new Promise((resolve,reject)=>{
      $('preview').onload=()=>{if(old.startsWith('blob:'))URL.revokeObjectURL(old);if(runId===currentRunId){previewPageId=pageId;$('preview').hidden=false;$('browser-empty').hidden=true;paintPointer();}resolve();};
      $('preview').onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Preview image failed'));};$('preview').src=url;
    });
  }catch{}finally{previewPending=false;}
}
async function previewLoop(){await preview();setTimeout(previewLoop,state.active?100:state.trace?650:1500);}
$('task-form').onsubmit=protect(async()=>{busy=true;try{await api('run',{goal:$('goal').value,url:$('start-url').value,confirmation:$('confirmation').value,allowedOrigins:$('origins').value.split(',').map(s=>s.trim()).filter(Boolean),expectText:$('expected').value||undefined,useWorkflows:$('use-workflows').checked,mode:$('ultra').checked?'ultra':'normal'});mobileView('browser');notice('Task started. Watch the live browser.');lastEventCount=-1;await refresh();}finally{busy=false;}});
for(const command of ['pause','resume','stop','approve','reject'])$(command).onclick=protect(async()=>{await api('control/'+command,{});await refresh();});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
$('profile-open').onclick=protect(async()=>{const profile=await api('profile');$('profile-json').value=JSON.stringify(Object.keys(profile.profile).length?profile:{profile:{firstName:'',lastName:'',email:'',phone:'',country:'',city:''},files:{}},null,2);$('profile-dialog').showModal();});
$('profile-form').onsubmit=protect(async()=>{await api('profile',JSON.parse($('profile-json').value));$('profile-dialog').close();notice('Profile saved locally.');});
$('workflows-open').onclick=()=>{$('workflow-list').replaceChildren();for(const flow of state.workflows||[]){const row=document.createElement('div'),small=document.createElement('small');row.className='workflow-row';row.textContent=flow.intent;small.textContent=flow.domain+' · '+flow.hits+' reuses';row.append(small);$('workflow-list').append(row);}if(!state.workflows?.length)text('workflow-list','Complete a task to learn its first workflow.');$('workflows-dialog').showModal();};
$('edit-open').onclick=()=>{$('plan-json').value=JSON.stringify(state.trace?.plans?.at(-1),null,2);$('edit-dialog').showModal();};
$('edit-form').onsubmit=protect(async()=>{await api('control/edit',JSON.parse($('plan-json').value));$('edit-dialog').close();notice('Edited plan validated. Resume when ready.');});
$('preview').onclick=protect(async event=>{if(!state.paused)return;const img=$('preview'),rect=contentRect();if(!rect||event.clientX<rect.left||event.clientY<rect.top||event.clientX>=rect.left+rect.width||event.clientY>=rect.top+rect.height)return;await api('control/manual',{type:'click',x:(event.clientX-rect.left)*img.naturalWidth/rect.width,y:(event.clientY-rect.top)*img.naturalHeight/rect.height});await preview();});
$('manual-type').onclick=protect(async()=>{await api('control/manual',{type:'type',value:$('manual-value').value});await preview();});
$('manual-enter').onclick=protect(async()=>{await api('control/manual',{type:'press',value:'Enter'});await preview();});
$('manual-scroll').onclick=protect(async()=>{await api('control/manual',{type:'scroll',y:500});await preview();});
for(const [id,y] of [['page-up',-400],['page-down',400]])$(id).onclick=protect(async()=>{await api('control/manual',{type:'scroll',y});await preview();});
$('result-copy').onclick=protect(async()=>{await navigator.clipboard.writeText($('result-output').innerText);text('result-copy','Copied');setTimeout(()=>text('result-copy','Copy summary'),1500);});
$('result-save').onclick=()=>{const blob=new Blob([reportHtml($('result-output'),state.trace?.goal)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='task-report.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const stream=new EventSource('/api/events');stream.onmessage=()=>refresh();
stream.addEventListener('pointer',event=>{try{const next=JSON.parse(event.data);acceptPointer(next.pointer,next.runId);}catch{}});
new ResizeObserver(paintPointer).observe($('browser-stage'));
await refresh();setInterval(refresh,1500);setInterval(paintPointer,1000);previewLoop();
