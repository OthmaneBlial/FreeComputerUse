const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name=csrf-token]').content;
let state={},busy=false,lastEventCount=0,previewPending=false;
const text=(id,value)=>{$(id).textContent=value;};
function notice(message,error=false){text('notice',message);$('notice').classList.toggle('error',error);}
async function api(path,data){const response=await fetch('/api/'+path,{method:data===undefined?'GET':'POST',headers:data===undefined?{}:{'Content-Type':'application/json','X-FCU-Token':token},body:data===undefined?undefined:JSON.stringify(data)});const body=await response.json();if(!response.ok)throw new Error(body.error||'Request failed');return body;}
function protect(fn){return async event=>{event?.preventDefault();try{await fn(event);}catch(error){notice(error.message,true);}};}
function fmt(value){return Number(value||0).toLocaleString('en-US');}
function render(snapshot){
  state=snapshot;const trace=state.trace,metrics=trace?.metrics||{},active=state.active,paused=state.paused;
  text('model',state.model);text('model-note',state.configured?'Batch planning. Local execution.':'Set LLM_API_KEY to plan new tasks.');
  const status=state.pending?'APPROVAL':paused?'PAUSED':active?'RUNNING':trace?.status?.toUpperCase()||'IDLE';text('status',status);$('status').classList.toggle('active',active);
  $('run').disabled=active||busy;$('run').firstChild.textContent=active?'Task running ':'Run task ';
  $('pause').disabled=!active||paused;$('resume').disabled=!paused||!active;$('stop').disabled=!active;$('edit-open').disabled=!active||!paused;
  text('page-url',state.state?.url||'No page open');text('control-state',paused?'Manual control · browser clicks enabled':active?'Agent is executing locally':trace?.status==='completed'?'Task verified and completed':'Ready when you are');
  $('manual-tools').hidden=!paused;$('preview').classList.toggle('manual',paused);
  $('approval').hidden=!state.pending;if(state.pending){text('approval-reason',state.pending.reason);text('approval-action',typeof state.pending.action==='string'?state.pending.action:JSON.stringify(state.pending.action,null,2));}
  const calls=metrics.llmCalls??trace?.calls?.length??0,actions=metrics.browserActions??trace?.actions?.filter(a=>a.success).length??0;
  const input=metrics.inputTokens??trace?.calls?.reduce((n,c)=>n+c.usage.input,0)??0,output=metrics.outputTokens??trace?.calls?.reduce((n,c)=>n+c.usage.output,0)??0;
  text('calls',fmt(calls));text('actions',fmt(actions));text('ratio',calls?(actions/calls).toFixed(1):actions?'∞':'—');text('tokens',fmt(input+output));text('cost',metrics.estimatedCostUSD==null?'—':'$'+Number(metrics.estimatedCostUSD).toFixed(5));
  const fraction=Math.min(1,Math.max(input/(state.limits?.maxInputTokens||20000),output/(state.limits?.maxOutputTokens||5000),calls/(state.limits?.maxLLMCalls||10)));text('budget-value',Math.round(fraction*100)+'%');$('budget-meter').style.width=fraction*100+'%';text('budget-limit',`${fmt(state.limits?.maxInputTokens)} input / ${fmt(state.limits?.maxOutputTokens)} output`);
  const plan=trace?.plans?.at(-1);$('plan').replaceChildren();for(const step of plan?.steps||['Waiting for a task.']){const li=document.createElement('li');li.textContent=step;$('plan').append(li);}
  const observe=state.events?.filter(e=>e.phase==='OBSERVE').at(-1);text('compression',observe?.data?.reduction!=null?(observe.data.reduction*100).toFixed(1)+'% smaller':'—');
  text('warnings',state.state?.warnings?.join('\n')||'');
  const phase=state.events?.at(-1)?.phase;for(const span of $('loop').children)span.classList.toggle('current',span.textContent.toUpperCase()===phase);
  if(lastEventCount!==state.events?.length){lastEventCount=state.events?.length||0;$('events').replaceChildren();for(const event of state.events?.slice(-60)||[]){const li=document.createElement('li'),badge=document.createElement('span'),message=document.createElement('span'),time=document.createElement('span');badge.className='phase '+event.phase;badge.textContent=event.phase;message.textContent=event.message;time.className='time';time.textContent=new Date(event.time).toLocaleTimeString('en-GB');li.append(badge,message,time);$('events').append(li);}$('events').scrollTop=$('events').scrollHeight;}
  text('history-count',state.history?.length||0);$('history').replaceChildren();for(const run of state.history||[]){const button=document.createElement('button'),title=document.createElement('strong'),meta=document.createElement('small');button.className='history-item';title.textContent=run.goal;meta.textContent=run.status.toUpperCase()+' · '+new Date(Number(run.started)).toLocaleDateString();button.append(title,meta);button.title=run.status==='completed'?'Replay this run with no model':'Use this task again';button.disabled=active;button.onclick=protect(async()=>{if(run.status==='completed'){await api('replay',{id:run.id});notice('Replaying successful semantic actions.');}else{$('goal').value=run.goal;$('start-url').value=run.url;notice('Task loaded. Edit it before running.');}await refresh();});$('history').append(button);}if(!state.history?.length)text('history','Your first run starts here.');
  text('workflow-count',state.workflows?.length||0);
  if(trace?.error)notice(trace.error,true);
}
async function refresh(){try{render(await api('state'));}catch(error){notice('Connection lost: '+error.message,true);}}
async function preview(){if(previewPending)return;previewPending=true;try{const response=await fetch('/api/preview');if(response.status===204)return;if(!response.ok)return;const blob=await response.blob(),url=URL.createObjectURL(blob),old=$('preview').src;$('preview').onload=()=>{if(old.startsWith('blob:'))URL.revokeObjectURL(old);};$('preview').src=url;$('preview').hidden=false;$('browser-empty').hidden=true;}catch{}finally{previewPending=false;}}
$('task-form').onsubmit=protect(async()=>{busy=true;try{await api('run',{goal:$('goal').value,url:$('start-url').value,confirmation:$('confirmation').value,allowedOrigins:$('origins').value.split(',').map(s=>s.trim()).filter(Boolean),expectText:$('expected').value||undefined,useWorkflows:$('use-workflows').checked,mode:$('ultra').checked?'ultra':'normal'});notice('Task started. Follow its execution below.');lastEventCount=-1;await refresh();}finally{busy=false;}});
for(const command of ['pause','resume','stop','approve','reject'])$(command).onclick=protect(async()=>{await api('control/'+command,{});await refresh();});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
$('profile-open').onclick=protect(async()=>{const profile=await api('profile');$('profile-json').value=JSON.stringify(Object.keys(profile.profile).length?profile:{profile:{firstName:'',lastName:'',email:'',phone:'',country:'',city:''},files:{}},null,2);$('profile-dialog').showModal();});
$('profile-form').onsubmit=protect(async()=>{await api('profile',JSON.parse($('profile-json').value));$('profile-dialog').close();notice('Profile saved locally.');});
$('workflows-open').onclick=()=>{$('workflow-list').replaceChildren();for(const flow of state.workflows||[]){const row=document.createElement('div'),small=document.createElement('small');row.className='workflow-row';row.textContent=flow.intent;small.textContent=flow.domain+' · '+flow.hits+' reuses';row.append(small);$('workflow-list').append(row);}if(!state.workflows?.length)text('workflow-list','Complete a task to learn its first workflow.');$('workflows-dialog').showModal();};
$('edit-open').onclick=()=>{$('plan-json').value=JSON.stringify(state.trace?.plans?.at(-1),null,2);$('edit-dialog').showModal();};
$('edit-form').onsubmit=protect(async()=>{await api('control/edit',JSON.parse($('plan-json').value));$('edit-dialog').close();notice('Edited plan validated. Resume when ready.');});
$('preview').onclick=protect(async event=>{if(!state.paused)return;const img=$('preview'),rect=img.getBoundingClientRect();await api('control/manual',{type:'click',x:(event.clientX-rect.left)*img.naturalWidth/rect.width,y:(event.clientY-rect.top)*img.naturalHeight/rect.height});await preview();});
$('manual-type').onclick=protect(async()=>{await api('control/manual',{type:'type',value:$('manual-value').value});await preview();});
$('manual-enter').onclick=protect(async()=>{await api('control/manual',{type:'press',value:'Enter'});await preview();});
$('manual-scroll').onclick=protect(async()=>{await api('control/manual',{type:'scroll',y:500});await preview();});
const stream=new EventSource('/api/events');stream.onmessage=()=>refresh();
await refresh();setInterval(refresh,1500);setInterval(preview,1800);
