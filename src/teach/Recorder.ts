import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { BrowserContext,Frame,Page } from 'playwright';
import { ActionSchema,SemanticTargetSchema,type Action,type SemanticTarget } from '../actions/schema.js';
import type { Parameter } from '../workflows/WorkflowEngine.js';

const RecordedSchema=z.object({
  token:z.string(),kind:z.enum(['click','check','uncheck','select','fill','press','upload']),target:SemanticTargetSchema,
  value:z.string().max(10000).optional(),sensitive:z.boolean().optional(),
}).strict();
export interface RecordedStep {action:Action;at:number}
export interface Recording {actions:Action[];parameters:Parameter[]}

/** Runs in each page: reports trusted user gestures as semantic targets. Values of password, one-time-code and card fields are never sent. */
const pageScript=(token:string)=>`(()=>{
  if(window.__fcuRecorderToken===${JSON.stringify(token)})return;window.__fcuRecorderToken=${JSON.stringify(token)};
  const send=window.__fcuRecord,clean=v=>(v??'').replace(/\\s+/g,' ').trim().slice(0,180);
  const fields=['input','textarea','select'];
  const sensitive=el=>{const type=(el.type||'').toLowerCase(),auto=(el.autocomplete||'').toLowerCase(),hint=[el.name,el.id,el.getAttribute('aria-label'),el.placeholder].join(' ').toLowerCase();
    return type==='password'||/one-time-code|cc-|password/.test(auto)||/\\b(otp|2fa|totp|mfa|cvv|cvc|card ?number|password|passcode|pin)\\b/.test(hint);};
  const labelOf=el=>clean(el.getAttribute('aria-label'))||clean((el.getAttribute('aria-labelledby')||'').split(/\\s+/).map(id=>document.getElementById(id)?.innerText||'').join(' '))
    ||clean(el.labels&&el.labels[0]?el.labels[0].innerText:'')||'';
  const roleOf=el=>{const tag=el.tagName.toLowerCase(),type=(el.getAttribute('type')||'').toLowerCase();
    return el.getAttribute('role')||(tag==='button'||tag==='summary'||['submit','button','reset','image'].includes(type)?'button':tag==='a'?'link':tag==='select'?'combobox':tag==='textarea'?'textbox':type==='checkbox'?'checkbox':type==='radio'?'radio':type==='file'?'upload':type==='number'?'spinbutton':tag==='input'?'textbox':undefined);};
  const describe=el=>{
    const tag=el.tagName.toLowerCase(),field=fields.includes(tag),label=labelOf(el),role=roleOf(el),t={};
    const name=label||(field?clean(el.placeholder)||clean(el.getAttribute('name'))||(['submit','button'].includes(el.type)?clean(el.value):''):clean(el.innerText||el.textContent))||clean(el.getAttribute('title'));
    if(role&&role!=='upload')t.role=role;if(name)t.name=name;if(label&&field)t.label=label;
    if(el.dataset.testid)t.testId=el.dataset.testid;
    if(el.id&&!/\\d{3,}|^:|[a-f0-9]{12,}/i.test(el.id))t.id=el.id;
    if(field&&el.getAttribute('name'))t.attributeName=el.getAttribute('name');
    if(!Object.keys(t).length)t.css=tag;
    return t;};
  const control=node=>node instanceof Element?node.closest('button,a[href],input,select,textarea,summary,label,[role=button],[role=link],[role=menuitem],[role=tab],[role=option],[role=checkbox],[role=radio],[role=switch],[role=treeitem]')||node:null;
  const emit=(kind,el,value)=>{try{send({token:${JSON.stringify(token)},kind,target:describe(el),...(value===undefined?{}:{value}),...(sensitive(el)?{sensitive:true}:{})});}catch{}};
  addEventListener('click',e=>{const el=control(e.target);if(!e.isTrusted||!el)return;const tag=el.tagName.toLowerCase(),type=(el.type||'').toLowerCase();
    if(tag==='label'&&el.control)return;
    if(tag==='input'&&(type==='checkbox'||type==='radio')){emit(el.checked||type==='radio'?'check':'uncheck',el);return;}
    if(fields.includes(tag)&&!['submit','button','reset','image'].includes(type))return;
    emit('click',el);},true);
  addEventListener('change',e=>{const el=e.target;if(!e.isTrusted||!(el instanceof Element))return;const tag=el.tagName.toLowerCase(),type=(el.type||'').toLowerCase();
    if(tag==='select'){emit('select',el,el.selectedOptions[0]?.label??el.value);return;}
    if(type==='file'){emit('upload',el);return;}
    if((tag==='input'&&!['checkbox','radio','submit','button','reset','image'].includes(type))||tag==='textarea')emit('fill',el,sensitive(el)?undefined:el.value);},true);
  addEventListener('keydown',e=>{const el=e.target;if(!e.isTrusted||e.key!=='Enter'||!(el instanceof HTMLInputElement))return;
    emit('fill',el,sensitive(el)?undefined:el.value);emit('press',el,'Enter');},true);
})()`;

const slug=(value:string,fallback:string)=>{const words=value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().match(/[a-z0-9]+/g)?.slice(0,4)??[];const name=words.join('_');return /^[a-z]/.test(name)?name.slice(0,40):fallback;};

/** Records what a person does in the browser, for a whole procedure or for one step the agent could not do. */
export class Recorder {
  private steps:RecordedStep[]=[];private recording=false;private token=randomBytes(16).toString('hex');
  private installed=new WeakSet<BrowserContext>();private lastGesture=0;
  startUrl='';
  private listeners=new Set<(step:RecordedStep)=>void>();
  get active(){return this.recording;}
  get count(){return this.steps.length;}
  onStep(listener:(step:RecordedStep)=>void){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  async start(context:BrowserContext,page:Page){
    if(!this.installed.has(context)){
      this.installed.add(context);
      await context.exposeBinding('__fcuRecord',(source,data:unknown)=>this.receive(source.frame,data));
      await context.addInitScript(pageScript(this.token));
      context.on('page',item=>this.watch(item));for(const item of context.pages())this.watch(item);
    }
    for(const item of context.pages())for(const frame of item.frames())await frame.evaluate(pageScript(this.token)).catch(()=>{});
    this.steps=[];this.recording=true;this.startUrl=page.url();
  }
  private watch(page:Page){
    // An address-bar navigation is not a DOM event; a navigation right after a click is that click's effect.
    page.on('framenavigated',frame=>{if(this.recording&&frame===page.mainFrame()&&Date.now()-this.lastGesture>1500&&/^https?:/.test(frame.url()))this.push({type:'navigate',url:frame.url()});});
  }
  private receive(frame:Frame,data:unknown){
    if(!this.recording)return;
    const parsed=RecordedSchema.safeParse(data);if(!parsed.success||parsed.data.token!==this.token)return;
    const {kind,target:raw,value,sensitive}=parsed.data,index=frame.page().frames().indexOf(frame);
    const target:SemanticTarget=index>0?{...raw,frame:index}:raw;
    if(kind==='click'||kind==='check'||kind==='uncheck'){this.lastGesture=Date.now();this.push({type:kind,target});return;}
    if(kind==='press'){this.lastGesture=Date.now();this.push({type:'press',target,value:value??'Enter'});return;}
    if(kind==='select'){this.push({type:'select',target,value:value??''});return;}
    const name=slug(target.label??target.name??target.attributeName??'',kind==='upload'?'file':'value');
    if(kind==='upload'){this.push({type:'upload',target,file:`{{params.${name}}}`});return;}
    const fill:Action={type:'fill',target,value:sensitive?`{{params.${name}}}`:value??''};
    // Enter and the following change event report the same value again; keep one step.
    const same=(item?:RecordedStep)=>item?.action.type==='fill'&&JSON.stringify(item.action.target)===JSON.stringify(target);
    if(this.steps.slice(-2).some(item=>same(item)&&item.action.type==='fill'&&item.action.value===fill.value))return;
    if(same(this.steps.at(-1))){this.steps[this.steps.length-1]={action:fill,at:Date.now()};return;}
    this.push(fill);
  }
  private push(action:Action){
    const step={action:ActionSchema.parse(action),at:Date.now()};this.steps.push(step);
    for(const listener of this.listeners)try{listener(step);}catch{/* Display only. */}
  }
  /** Ends recording. Long pauses become longer waits, uploads become file parameters and hidden values become secret parameters. */
  stop():Recording{
    this.recording=false;
    // A click that only opened the file chooser is replaced by the upload itself.
    const opensChooser=/\b(upload|import|browse|choose|attach|add file|parcourir|importer|téléverser|joindre|choisir)/i;
    this.steps=this.steps.filter((step,index)=>!(step.action.type==='click'&&this.steps[index+1]?.action.type==='upload'&&opensChooser.test(describeTarget(step.action.target))));
    const actions=this.steps.map((step,index)=>{
      const gap=index?step.at-this.steps[index-1]!.at:0;
      return gap>4000&&'target'in step.action?{...step.action,timeoutMs:Math.min(30000,Math.round(gap*1.5/100)*100)}:step.action;
    });
    const parameters=new Map<string,Parameter>();
    for(const action of actions){
      if(action.type==='upload')for(const used of action.file.matchAll(/\{\{params\.([\w-]+)\}\}/g))parameters.set(used[1]!,{name:used[1]!,kind:'file',required:true,description:`File for ${describeTarget(action.target)}`});
      if(action.type==='fill')for(const used of action.value.matchAll(/\{\{params\.([\w-]+)\}\}/g))parameters.set(used[1]!,{name:used[1]!,kind:'secret',required:true,description:`Hidden value for ${describeTarget(action.target)}`});
    }
    this.steps=[];
    return{actions:actions.map(action=>ActionSchema.parse(action)),parameters:[...parameters.values()]};
  }
}
export function describeTarget(target:unknown){
  if(typeof target==='string')return target;
  const t=target as SemanticTarget;return t.name??t.label??t.text??t.placeholder??t.testId??t.id??t.css??'element';
}
