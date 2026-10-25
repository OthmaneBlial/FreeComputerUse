import {renderResults,reportHtml} from './results.js';
const $=id=>document.getElementById(id);
const token=document.querySelector('meta[name=csrf-token]').content;
let state={},busy=false,lastEventCount=0,previewPending=false,refreshPending=false,resultKey='',resultCount=0,approvedSitesKey='';
let filesLoaded=false,currentRunId='',previewPageId=0,pointer,lastPointerSequence=-1,lastClickSequence=-1,approvalKey='';
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
  text('interaction-label',state.pending?'Waiting for your approval':state.paused?'You have control':preparing?preparing.label:state.active?(interactionNames[pointer?.kind]||'Planning the next browser actions'):state.trace?.failureKind==='security'?'Blocked by local browser policy':state.trace?.status==='completed'?'Task complete':state.trace?.status==='stopped'?'Task stopped':'Watch the browser work here');
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
  const limits=state.taskLimits||{};text('model',state.model);text('model-note',(state.configured?'Batch planning. Local execution.':'Add a provider key or sign in to a CLI to plan new tasks.')+` Limits: ${limits.maxSteps??120} actions${limits.maxDurationMs?` · ${Math.round(limits.maxDurationMs/60000)} min`:''}${state.limits?.maxLLMCalls?` · ${state.limits.maxLLMCalls} model calls`:''}.`);
  const teaching=!!state.teaching;$('teach-save').hidden=!teaching;$('teach-start').disabled=active||teaching;$('result-procedure').disabled=active||trace?.status!=='completed';
  const approvedSites=state.approvedSites||[],sitesKey=JSON.stringify(approvedSites);
  if(sitesKey!==approvedSitesKey){approvedSitesKey=sitesKey;const list=$('approved-sites');list.replaceChildren();if(!approvedSites.length){const empty=document.createElement('li');empty.className='empty';empty.textContent='No sites approved in this session.';list.append(empty);}for(const origin of approvedSites){const item=document.createElement('li'),site=document.createElement('span'),button=document.createElement('button');site.textContent=origin;button.type='button';button.textContent='Revoke';button.setAttribute('aria-label',`Revoke access to ${origin}`);button.onclick=protect(async()=>{await api('control/revoke-site',{origin});notice(`Access revoked for ${origin}.`);await refresh();});item.append(site,button);list.append(item);}}
  const blocked=trace?.failureKind==='security',status=state.pending?'APPROVAL':paused?'PAUSED':active?'RUNNING':blocked?'BLOCKED':trace?.status?.toUpperCase()||'IDLE';text('status',status);$('status').classList.toggle('active',active);$('status').classList.toggle('blocked',blocked);
  $('run').disabled=active||busy;$('run').firstChild.textContent=active?'Task running ':'Run task ';
  $('pause').disabled=!active||paused;$('resume').disabled=!paused||!active;$('stop').disabled=!active;$('edit-open').disabled=!active||!paused;
  text('page-url',state.browserUrl||state.state?.url||'No page open');text('control-state',teaching?`Recording your steps · ${state.recorded} so far`:paused?'Manual control · browser clicks enabled':active?'Agent is controlling the browser':blocked?'Blocked by local browser security policy':trace?.status==='completed'?'Task verified and completed':'Ready when you are');
  $('manual-tools').hidden=!paused&&!teaching;$('preview').classList.toggle('manual',paused||teaching);if((paused||teaching)&&$('manual-file').options.length<2&&!filesLoaded){filesLoaded=true;loadFiles().catch(()=>{});}
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
const settings=()=>({confirmation:$('confirmation').value,allowedOrigins:$('origins').value.split(',').map(s=>s.trim()).filter(Boolean),mode:$('ultra').checked?'ultra':'normal',teachOnFailure:$('teach-on-failure').checked,...($('provider').value?{provider:$('provider').value}:{}),...($('model-name').value.trim()?{model:$('model-name').value.trim()}:{})});
async function startRun(){if(!$('start-url').value)throw new Error('Add the starting page for a new task');await api('run',{goal:$('goal').value,url:$('start-url').value,expectText:$('expected').value||undefined,useWorkflows:$('use-workflows').checked,...settings()});mobileView('browser');notice('Task started. Watch the live browser.');lastEventCount=-1;await refresh();}
$('task-form').onsubmit=protect(async()=>{busy=true;try{
  // A saved procedure that covers the request runs locally; only the values it cannot read from the request are asked for.
  const match=$('use-workflows').checked?(await api('procedures/find',{goal:$('goal').value,...($('start-url').value?{url:$('start-url').value}:{})})).matches[0]:undefined;
  if(match){openRun(match);return;}
  await startRun();}finally{busy=false;}});
let runTarget,saveContext,editing;
function openRun(item){
  runTarget=item;text('run-title',item.name);
  text('run-note',item.missing?.length?`A saved procedure matches your request. Fill in: ${item.missing.join(', ')}.`:item.values?'A saved procedure matches your request. Check the values, then run it.':'Fill in the values for this run.');
  const box=$('run-params');box.replaceChildren();
  for(const param of item.parameters){const label=document.createElement('label'),input=document.createElement('input');input.id='param-'+param.name;label.htmlFor=input.id;label.textContent=`${param.name}${param.required===false?' (optional)':''}${param.kind==='file'?' · path to the file':param.kind==='secret'?' · hidden value':''}${param.description?' — '+param.description:''}`;input.name=param.name;input.value=item.values?.[param.name]??'';input.type=param.kind==='secret'?'password':'text';input.autocomplete='off';input.required=param.required!==false;box.append(label,input);}
  if(!item.parameters.length)text('run-params','This procedure needs no values.');
  $('run-with-ai').hidden=!item.values;openDialog('run-dialog');
}
$('run-form').onsubmit=protect(async()=>{const values={};for(const input of $('run-params').querySelectorAll('input'))if(input.value)values[input.name]=input.value;await api('procedures/run',{id:runTarget.id,values,...settings()});$('run-dialog').close();$('workflows-dialog').close();mobileView('browser');notice('Procedure started. The model is only used if a step must be repaired.');lastEventCount=-1;await refresh();});
$('run-with-ai').onclick=protect(async()=>{$('run-dialog').close();await startRun();});
let providers=[];
async function loadProviders(){
  ({providers}=await api('providers'));
  const select=$('provider'),current=select.value;select.replaceChildren(new Option('Default from configuration',''));
  for(const item of providers.filter(item=>item.configured))select.append(new Option(`${item.label}${item.model?' · '+item.model:''}`,item.id));
  select.value=providers.some(item=>item.id===current&&item.configured)?current:'';
  const list=$('provider-list');list.replaceChildren();
  for(const item of providers){
    const row=document.createElement('section'),title=document.createElement('h3'),detail=document.createElement('p'),result=document.createElement('p'),tools=document.createElement('div');
    row.className='provider-row';title.textContent=item.label+(item.selected?' · default':'');result.setAttribute('role','status');
    detail.textContent=`${item.configured?'Configured':'Not configured'}${item.model?' · '+item.model:''} · ${item.detail}${item.usage==='estimated'?' · token usage is estimated':''}`;
    const test=document.createElement('button');test.type='button';test.textContent='Test connection';test.disabled=!item.configured;
    test.onclick=protect(async()=>{result.textContent='Sending one minimal request…';try{const answer=await api('providers/test',{provider:item.id});result.textContent=`Passed in ${answer.latencyMs} ms with ${answer.model}. ${answer.detail}`;}catch(error){result.textContent='Failed: '+error.message;}});
    tools.append(test);
    if(item.route==='api'&&item.id!=='openai-compatible'){
      const key=document.createElement('input'),save=document.createElement('button'),remove=document.createElement('button');
      key.type='password';key.autocomplete='off';key.placeholder='Paste an API key';key.setAttribute('aria-label',`${item.label} API key`);
      save.type='button';save.textContent='Save key';save.onclick=protect(async()=>{if(!key.value.trim())throw new Error('Paste a key first');await api('providers/key',{provider:item.id,key:key.value});key.value='';notice(`${item.label} key saved locally.`);await loadProviders();});
      remove.type='button';remove.textContent='Remove stored key';remove.disabled=!['keychain','file'].includes(item.keySource);remove.onclick=protect(async()=>{await api('providers/key',{provider:item.id,remove:true});notice(`${item.label} key removed.`);await loadProviders();});
      tools.append(key,save,remove);
    }
    row.append(title,detail,tools,result);list.append(row);
  }
}
$('providers-open').onclick=protect(async()=>{await loadProviders();openDialog('providers-dialog');});
async function loadFiles(){const profile=await api('profile'),select=$('manual-file');select.replaceChildren(new Option('Next click: normal click',''));for(const alias of Object.keys(profile.files||{}))select.append(new Option(`Next click attaches {{files.${alias}}}`,`{{files.${alias}}}`));}
$('teach-start').onclick=protect(async()=>{const url=$('start-url').value;if(!url)throw new Error('Add the starting page to teach from');await api('teach/start',{url,...settings()});await loadFiles();mobileView('browser');notice('Recording. Click and type in the live browser. To upload, choose a file in the file menu, then click the upload control. Press Save as procedure when done.');await refresh();});
$('teach-save').onclick=protect(async()=>{const recording=await api('teach/stop',{});openSave({mode:'recording',actions:recording.actions,parameters:recording.parameters});await refresh();});
$('steps-open').onclick=()=>openSave({mode:'steps',actions:[],parameters:[]});
$('result-procedure').onclick=()=>openSave({mode:'run',runId:state.trace.id,goal:state.trace.goal,actions:state.trace.actions.filter(result=>result.success).map(result=>result.action),parameters:[]});
const describeAction=action=>{const target=action.target&&typeof action.target==='object'?action.target.name||action.target.label||action.target.text||action.target.id||action.target.css:action.target;return [action.type,target?`“${target}”`:'',action.value?`= ${action.value}`:'',action.file?`← ${action.file}`:'',action.url||''].filter(Boolean).join(' ');};
function paramRow(param={}){
  const row=document.createElement('div'),name=document.createElement('input'),kind=document.createElement('select'),value=document.createElement('input'),aliases=document.createElement('input'),remove=document.createElement('button');row.className='param-row';
  name.placeholder='name, e.g. version';name.value=param.name||'';name.setAttribute('aria-label','Parameter name');
  for(const option of ['text','file','secret'])kind.append(new Option(option,option));kind.value=param.kind||'text';kind.setAttribute('aria-label','Parameter kind');
  value.placeholder='value to replace (optional)';value.value=param.value||'';value.setAttribute('aria-label','Value used while teaching');
  aliases.placeholder='request words, e.g. version, v';aliases.value=(param.aliases||[]).join(', ');aliases.setAttribute('aria-label','Words that introduce it in a request');
  remove.type='button';remove.textContent='Remove';remove.onclick=()=>row.remove();row.append(name,kind,value,aliases,remove);$('param-rows').append(row);
}
function openSave(context){
  saveContext=context;$('save-form').reset();$('param-rows').replaceChildren();
  text('save-title',context.mode==='steps'?'Write a procedure':context.mode==='run'?'Save this run as a procedure':'Save what you showed');
  $('save-steps-block').hidden=context.mode!=='steps';$('save-steps').required=context.mode==='steps';$('save-recorded-block').hidden=context.mode==='steps';
  const list=$('save-recorded');list.replaceChildren();for(const action of context.actions){const item=document.createElement('li');item.textContent=describeAction(action);list.append(item);}
  for(const param of context.parameters)paramRow(param);
  // Typed values are offered as parameters; naming one makes it change between runs.
  for(const value of new Set(context.actions.filter(action=>['fill','select'].includes(action.type)&&action.value&&!action.value.includes('{{')).map(action=>action.value)))paramRow({value});
  if(context.goal)$('save-name').value=context.goal;
  openDialog('save-dialog');
}
$('param-add').onclick=()=>paramRow();
$('save-form').onsubmit=protect(async()=>{
  const parameters=[...$('param-rows').children].map(row=>{const [name,kind,value,aliases]=row.querySelectorAll('input,select');return{name:name.value.trim(),kind:kind.value,...(value.value?{value:value.value}:{}),...(aliases.value.trim()?{aliases:aliases.value.split(',').map(item=>item.trim()).filter(Boolean)}:{})};}).filter(param=>param.name);
  const {procedure}=await api('procedures/create',{name:$('save-name').value,description:$('save-description').value,parameters,...($('save-expect').value?{expectText:$('save-expect').value}:{}),...(saveContext.mode==='steps'?{steps:$('save-steps').value}:saveContext.mode==='run'?{runId:saveContext.runId}:{})});
  $('save-dialog').close();notice(`Saved “${procedure.name}”. Find it under Procedures.`);await refresh();
});
function renderProcedures(){
  const list=$('workflow-list');list.replaceChildren();
  for(const flow of state.workflows||[]){
    const row=document.createElement('div'),title=document.createElement('strong'),meta=document.createElement('small'),tools=document.createElement('div');row.className='workflow-row';tools.className='row-tools';
    title.textContent=flow.name;meta.textContent=`${flow.domain} · ${flow.source} · v${flow.version} · ${flow.steps} steps · ${flow.runs?`${flow.completed}/${flow.runs} runs succeeded`:'not run yet'}${flow.lastValidatedAt?' · verified '+new Date(flow.lastValidatedAt).toLocaleDateString():''}${flow.parameters.length?' · asks for '+flow.parameters.map(param=>param.name).join(', '):''}`;
    const button=(label,fn)=>{const element=document.createElement('button');element.type='button';element.textContent=label;element.onclick=protect(fn);tools.append(element);return element;};
    button('Run',async()=>openRun({id:flow.id,name:flow.name,parameters:flow.parameters}));
    button('View / edit',async()=>openProcedure(flow.id));
    button('Duplicate',async()=>{await api('procedures/duplicate',{id:flow.id});await refresh();renderProcedures();});
    const exported=document.createElement('a');exported.href='/api/procedure/export?id='+encodeURIComponent(flow.id);exported.textContent='Export';exported.className='button-link';tools.append(exported);
    const remove=button('Delete',async()=>{if(remove.dataset.armed!=='1'){remove.dataset.armed='1';remove.textContent='Confirm delete';return;}await api('procedures/delete',{id:flow.id});await refresh();renderProcedures();});
    row.append(title,meta,tools);list.append(row);
  }
  if(!state.workflows?.length)text('workflow-list','Teach a procedure or complete a task to save the first one.');
}
async function openProcedure(id){
  const {procedure,runs,summary}=await api('procedure?id='+encodeURIComponent(id));editing=procedure;
  text('procedure-title',procedure.name??procedure.plan.goal);text('procedure-meta',`Version ${procedure.version??1} · ${procedure.source??'learned'} · ${summary.runs?Math.round(summary.successRate*100)+'% of '+summary.runs+' runs succeeded':'not run yet'}`);
  $('procedure-json').value=JSON.stringify({name:procedure.name??procedure.plan.goal,description:procedure.description??'',startUrl:procedure.startUrl??procedure.origin+procedure.path,keywords:procedure.keywords??[],parameters:procedure.parameters??[],preconditions:procedure.preconditions??[],plan:procedure.plan},null,2);
  const versions=$('procedure-versions');versions.replaceChildren();
  for(const version of [...(procedure.versions||[])].reverse()){const item=document.createElement('li'),restore=document.createElement('button');item.textContent=`v${version.version} · ${version.reason} · ${new Date(version.savedAt).toLocaleString()} `;restore.type='button';restore.textContent='Restore';restore.onclick=protect(async()=>{await api('procedures/restore',{id,version:version.version});await openProcedure(id);await refresh();});item.append(restore);versions.append(item);}
  if(!procedure.versions?.length)versions.textContent='Only this version.';
  const history=$('procedure-runs');history.replaceChildren();for(const run of runs){const item=document.createElement('li');item.textContent=`${new Date(run.started).toLocaleString()} · v${run.version} · ${run.status}${run.repaired?' · repaired':''} · ${run.llmCalls} model calls`;history.append(item);}
  if(!runs.length)history.textContent='No runs yet.';
  if(!$('procedure-dialog').open)openDialog('procedure-dialog');
}
$('procedure-form').onsubmit=protect(async()=>{await api('procedures/update',{id:editing.id,...JSON.parse($('procedure-json').value)});notice('Saved as a new version.');await openProcedure(editing.id);await refresh();});
$('procedure-import-open').onclick=()=>$('procedure-import').click();
$('procedure-import').onchange=protect(async()=>{const file=$('procedure-import').files[0];if(!file)return;const {procedure}=await api('procedures/import',JSON.parse(await file.text()));$('procedure-import').value='';notice(`Imported “${procedure.name}”.`);await refresh();renderProcedures();});
for(const command of ['pause','resume','stop','approve','reject'])$(command).onclick=protect(async()=>{await api('control/'+command,{});await refresh();});
for(const button of document.querySelectorAll('[data-close]'))button.onclick=()=>$(button.dataset.close).close();
$('profile-open').onclick=protect(async()=>{const profile=await api('profile');$('profile-json').value=JSON.stringify(Object.keys(profile.profile).length?profile:{profile:{firstName:'',lastName:'',email:'',phone:'',country:'',city:''},files:{}},null,2);$('profile-dialog').showModal();});
$('profile-form').onsubmit=protect(async()=>{await api('profile',JSON.parse($('profile-json').value));$('profile-dialog').close();notice('Profile saved locally.');});
$('workflows-open').onclick=()=>{renderProcedures();$('workflows-dialog').showModal();};
$('edit-open').onclick=()=>{$('plan-json').value=JSON.stringify(state.trace?.plans?.at(-1),null,2);$('edit-dialog').showModal();};
$('edit-form').onsubmit=protect(async()=>{await api('control/edit',JSON.parse($('plan-json').value));$('edit-dialog').close();notice('Edited plan validated. Resume when ready.');});
$('preview').onclick=protect(async event=>{if(!state.paused&&!state.teaching)return;const img=$('preview'),rect=contentRect();if(!rect||event.clientX<rect.left||event.clientY<rect.top||event.clientX>=rect.left+rect.width||event.clientY>=rect.top+rect.height)return;const point={x:(event.clientX-rect.left)*img.naturalWidth/rect.width,y:(event.clientY-rect.top)*img.naturalHeight/rect.height},file=$('manual-file').value;await api('control/manual',file?{type:'upload',...point,file}:{type:'click',...point});$('manual-file').value='';await preview();});
$('manual-type').onclick=protect(async()=>{await api('control/manual',{type:'type',value:$('manual-value').value});await preview();});
$('manual-enter').onclick=protect(async()=>{await api('control/manual',{type:'press',value:'Enter'});await preview();});
$('manual-scroll').onclick=protect(async()=>{await api('control/manual',{type:'scroll',y:500});await preview();});
for(const [id,y] of [['page-up',-400],['page-down',400]])$(id).onclick=protect(async()=>{await api('control/manual',{type:'scroll',y});await preview();});
$('result-copy').onclick=protect(async()=>{await navigator.clipboard.writeText($('result-output').innerText);text('result-copy','Copied');setTimeout(()=>text('result-copy','Copy summary'),1500);});
$('result-save').onclick=()=>{const blob=new Blob([reportHtml($('result-output'),state.trace?.goal)],{type:'text/html;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='task-report.html';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
const stream=new EventSource('/api/events');stream.onmessage=()=>refresh();
stream.addEventListener('pointer',event=>{try{const next=JSON.parse(event.data);acceptPointer(next.pointer,next.runId);}catch{}});
new ResizeObserver(paintPointer).observe($('browser-stage'));
await refresh();loadProviders().catch(()=>{});setInterval(refresh,1500);setInterval(paintPointer,1000);previewLoop();
