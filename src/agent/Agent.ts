import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import type { BrowserContext, Page } from 'playwright';
import { PlanSchema,RepairSchema,type Plan,type Condition } from '../actions/schema.js';
import { Executor,type ActionResult } from '../actions/executor.js';
import { Browser,checkedHttpURL,type BrowserOptions } from '../browser/Browser.js';
import { Observer } from '../browser/Observer.js';
import { diffPages } from '../browser/PageCompressor.js';
import type { PageState } from '../browser/types.js';
import { Control } from './Control.js';
import { TokenBudget } from './TokenBudget.js';
import { VariableResolver,type Vault } from '../profile/VariableResolver.js';
import { TraceStore,type Trace } from '../history/TraceStore.js';
import { WorkflowEngine } from '../workflows/WorkflowEngine.js';
import type { LLMProvider,PlanningContext,LLMCall } from '../llm/LLMProvider.js';
import { genericAdapter,type SiteAdapter } from '../adapters/generic.js';
import type { ConfirmationPolicy } from '../actions/policy.js';
import {goalCriteria} from './goalCriteria.js';

export interface AgentOptions {
  browser?:BrowserOptions;vault?:Vault;store:TraceStore;provider?:LLMProvider;budget?:TokenBudget;
  confirmation?:ConfirmationPolicy;downloadDir?:string;maxSteps?:number;maxRepairs?:number;
  maxRepeatedStates?:number;maxNavigationLoops?:number;useWorkflows?:boolean;adapters?:SiteAdapter[];
  completionCriteria?:Condition[];
  mode?:'normal'|'ultra';
}
export interface AgentEvent {phase:string;message:string;time:number;data?:unknown}
export class Agent extends EventEmitter {
  readonly browser:Browser;readonly observer=new Observer();readonly control=new Control();
  readonly variables:VariableResolver;readonly executor:Executor;readonly workflows:WorkflowEngine;
  readonly budget:TokenBudget;state?:PageState;trace?:Trace;events:AgentEvent[]=[];
  active=false;
  private cache=new Map<string,PageState>();
  private permittedSites=new Set<string>();
  private watchedContexts=new WeakSet<BrowserContext>();
  constructor(readonly options:AgentOptions){
    super();this.variables=new VariableResolver(options.vault);
    this.browser=new Browser({...options.browser,allowExternal:options.mode==='ultra'||options.browser?.allowExternal,beforeNavigate:url=>this.authorizeSite(url)});
    this.budget=options.budget??new TokenBudget();this.workflows=new WorkflowEngine(options.store);
    this.executor=new Executor(this.browser,this.observer,this.variables,this.control,{confirmation:options.mode==='ultra'?'never':options.confirmation,downloadDir:options.downloadDir});
    this.control.on('approval',data=>this.event('HUMAN','Human confirmation required',data));
    this.control.on('change',()=>{if(this.control.stopped)this.options.provider?.cancel?.();});
  }
  private async authorizeSite(value:string){
    const origin=new URL(value).origin;
    if(this.options.mode==='ultra'||this.permittedSites.has(origin))return;
    await this.control.confirm(`Allow browser access to ${origin}?`,{type:'siteAccess',origin,scope:'This browser session: inspect pages and perform the requested task',mode:'normal'});
    this.permittedSites.add(origin);
    const origins=this.browser.options.allowedOrigins??=[];if(!origins.includes(origin))origins.push(origin);
    this.event('PERMISSION',`Website approved: ${origin}`);
  }
  private watchLastPageClose() {
    const context=this.browser.context;
    if(this.watchedContexts.has(context))return;
    this.watchedContexts.add(context);
    const watch=(page:Page)=>page.once('close',()=>{
      if(!this.active||this.control.stopped||page!==this.browser.page)return;
      this.control.stop();void this.browser.close().catch(()=>{});
    });
    context.pages().forEach(watch);context.on('page',watch);
  }
  event(phase:string,message:string,data?:unknown){
    const event:AgentEvent={phase,message:this.variables.redact(message),time:Date.now(),data:data===undefined?undefined:JSON.parse(this.variables.redact(JSON.stringify(data)))};
    this.events.push(event);if(this.events.length>500)this.events.shift();this.emit('event',event);
  }
  async open(url:string){if(!this.browser.context)await this.browser.launch();await this.browser.navigate(url);return this.observe();}
  async observe(){
    const state=await this.observer.inspect(this.browser.page);this.state=state;
    this.cache.set(state.hash,state);if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value!);
    const compressed=this.observer.compressor.compress(state);
    this.event('OBSERVE',`DOM ${state.htmlBytes} bytes → ${compressed.bytes} bytes`,{url:state.url,title:state.title,hash:state.hash,reduction:compressed.reduction});
    return state;
  }
  private context(goal:string,state:PageState,completed:string[],previous?:PageState):PlanningContext{
    const remaining=this.budget.limits.maxInputTokens===null?Infinity:this.budget.limits.maxInputTokens-this.budget.input-this.budget.pendingInput;
    const maxChars=Math.min(this.budget.tight?3000:9000,Math.max(1200,remaining-9000));
    const full=this.observer.compressor.compress(state,{goal,maxChars});
    let page=full.text;
    if(previous){const diff=JSON.stringify(diffPages(previous,state));if(diff.length<page.length)page=`PAGE DIFF\n${diff}`;}
    const structured=this.browser.extractions.filter(e=>e.value!==null&&typeof e.value==='object').slice(-16).map(e=>({key:e.key,preview:JSON.stringify(e.value).slice(0,1400)}));
    const priorText=this.browser.extractions.filter(e=>typeof e.value==='string').slice(-16).map(e=>({key:e.key,preview:(e.value as string).slice(-1800)}));
    page+='\nOPEN TABS '+JSON.stringify(this.browser.context.pages().map((p,index)=>({index,url:p.url,active:p===this.browser.page})))+'\nEXTRACTED EVIDENCE FROM PRIOR PAGES '+this.variables.redact(JSON.stringify([...structured,...priorText]));
    return {goal:this.variables.redact(goal),page:this.variables.redact(page),aliases:this.variables.aliases(),completed:completed.slice(-12),allowedOrigins:this.options.browser?.allowedOrigins??[],phase:'current batch',trustedCompletionCriteria:[...this.options.completionCriteria??[],...goalCriteria(goal)]};
  }
  async run(goal:string,url?:string,providedPlan?:Plan,allowProvider=true):Promise<Trace>{
    if(this.active)throw new Error('An agent task is already running');
    if(this.control.stopped)throw new Error('Create a new agent after stopping a task');
    if(url)checkedHttpURL(url,this.browser.page?.url());
    this.active=true;const startedAt=Date.now();const callStart=this.providerCalls().length;
    const provider=allowProvider?this.options.provider:undefined;
    const usageStart=this.budget.snapshot();let initial:PageState|undefined,repairs=0,cacheHits=0,planCalls=0;
    const trace:Trace={version:1,id:`run-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID().slice(0,6)}`,goal:this.variables.redact(goal),url:this.variables.redact(url??this.browser.page?.url()??''),status:'running',startedAt,durationMs:0,plans:[],actions:[],completion:[],calls:[],metrics:{}};
    this.trace=trace;this.options.store.save(trace);
    const repeated=new Map<string,number>(),navigations=new Map<string,number>(),completed:string[]=[];
    let revision=this.control.revision,completionReplans=0;
    try{
      if(!this.browser.context)await this.browser.launch();
      this.watchLastPageClose();
      this.browser.extractions.length=0;this.browser.downloads.length=0;this.browser.formReceipts.length=0;
      if(url)await this.browser.navigate(url);
      initial=await this.observe();trace.url=this.variables.redact(initial.url);
      if(initial.warnings.some(w=>w.includes('Human authentication'))){
        this.control.pause();this.event('HUMAN','Take control to complete authentication/security checks, then resume');
        await this.control.checkpoint();initial=await this.observe();revision=this.control.revision;
      }
      const learned=this.options.useWorkflows!==false&&!providedPlan?this.workflows.match(goal,initial):undefined;
      let plan=providedPlan??learned?.plan;
      if(learned){cacheHits++;this.event('CACHE',`Reusing learned workflow ${learned.id}`);}
      if(!plan)for(const adapter of this.options.adapters??[genericAdapter]){
        if(adapter.matches(new URL(initial.url))){plan=adapter.plan(goal,initial,this.variables);if(plan){this.event('LOCAL',`Deterministic strategy: ${adapter.name}`);break;}}
      }
      let previous:PageState|undefined;
      while(true){
        await this.control.checkpoint();
        if(!plan){
          if(!provider)throw new Error('No matching local strategy/workflow; configure an LLM provider');
          this.event('PLAN','Requesting one action batch');planCalls++;
          plan=await provider.plan(this.context(goal,this.state!,completed,previous));
        }
        const batchState=this.state!;
        plan=PlanSchema.parse(plan);trace.plans.push(plan);this.event('PLAN','Validated plan',plan);this.trace=this.safeTrace(trace);this.options.store.save(this.trace);
        let actions=[...plan.actions];let index=0;
        while(index<actions.length){
          await this.control.checkpoint();
          if(revision!==this.control.revision){await this.observe();revision=this.control.revision;}
          if(this.control.replacement){plan=this.control.replacement;this.control.replacement=undefined;actions=[...plan.actions];index=0;trace.plans.push(plan);await this.observe();this.event('HUMAN','Using edited plan',plan);}
          if(trace.actions.length>=(this.options.maxSteps??120))throw new Error('Browser action limit reached');
          const before=this.state!;const action=actions[index]!;
          if(this.options.mode!=='ultra'&&/\{\{(?:profile|files)\./.test(JSON.stringify(action))&&!/\b(profile|personal details|my details|credentials|resume|cv|local file)\b/i.test(goal))throw new Error('The user goal does not authorize access to local profile/file aliases');
          const key=before.hash+JSON.stringify(action);const count=(repeated.get(key)??0)+1;repeated.set(key,count);
          if(count>(this.options.maxRepeatedStates??3))throw new Error('Repeated state/action loop detected');
          this.event('EXECUTE',`${action.type}${'target'in action?' '+JSON.stringify(action.target):''}`,{index:index+1,total:actions.length});
          const result=await this.executor.run(action);trace.actions.push(result);this.trace=this.safeTrace(trace);this.options.store.save(this.trace);
          const after=await this.observe();
          if(before.url!==after.url){const loops=(navigations.get(after.url)??0)+1;navigations.set(after.url,loops);if(loops>(this.options.maxNavigationLoops??3))throw new Error('Navigation loop detected');}
          if(result.success){
            const descriptor='target'in result.action&&typeof result.action.target==='object'?result.action.target:undefined;
            completed.push(this.variables.redact(JSON.stringify({type:action.type,...('url'in result.action?{url:result.action.url}:{}),...(descriptor?{target:{role:descriptor.role,name:descriptor.name??descriptor.label??descriptor.id??descriptor.css}}:{}),...('key'in result.action?{key:result.action.key}:{})})));
            index++;this.event('VERIFY','Action completed locally',{action:action.type,durationMs:result.durationMs,strategy:result.strategy});continue;
          }
          if(this.control.stopped||/rejected by human|stopped by human/.test(result.error??''))throw new Error(result.error);
          if(result.uncertain){
            await this.control.confirm('The previous action may already have happened. Approve a repair only after checking the browser.',result.action);
            await this.observe();
          }
          if(!provider||repairs>=(this.options.maxRepairs??8))throw new Error(result.error??'Repair limit reached');
          repairs++;this.event('REPAIR','Repairing only the failed portion',{failedAction:result.action,error:result.error});
          const context=this.context(goal,after,completed,before);
          if(repairs>1)context.page+='\nACCESSIBILITY\n'+this.variables.redact(await this.observer.accessibility(this.browser.page));
          if(repairs>2){const scope=await this.browser.page.locator('form').count()===1?'form':await this.browser.page.locator('main').count()===1?'main':'body';context.page+='\nTARGETED HTML\n'+this.variables.redact(await this.observer.fragment(this.browser.page,scope)).slice(0,3000);}
          const repaired=RepairSchema.parse(await provider.repair({...context,failedAction:result.action,error:result.error??'Action failed',remaining:actions.slice(index,index+12)}));
          if(repaired.replace<1||!repaired.actions.length||repaired.replace>actions.length-index)throw new Error('Repair attempted to replace actions outside the pending batch');
          if(repaired.completion)plan.completion=repaired.completion;
          if(repaired.continue!==undefined)plan.continue=repaired.continue;
          actions.splice(index,repaired.replace,...repaired.actions);
        }
        const criteria=()=>[...plan!.completion,...(!plan!.continue?[...this.options.completionCriteria??[],...goalCriteria(goal)]:[])];
        let verification=await this.executor.verifier.check(criteria(),4000,startedAt);
        this.event('VERIFY',verification.success?'Batch completion verified':'Completion conditions failed',verification);
        if(!verification.success){
          if(provider&&completionReplans<3&&/\b(download|export)\b/i.test(goal)&&verification.failed.some(item=>item.type==='download_created')&&!actions.some(item=>item.type==='download')&&actions.some(item=>item.type==='click'&&typeof item.target==='object'&&/save|export/i.test(item.target.name??''))){
            completionReplans++;this.event('PLAN','Download still missing; observing controls revealed after the last action');
            previous=batchState;await this.observe();plan=undefined;continue;
          }
          if(!provider||repairs>=(this.options.maxRepairs??8))throw new Error('Task completion could not be verified');
          repairs++;const after=await this.observe();this.event('REPAIR','Repairing failed completion conditions');
          const repaired=RepairSchema.parse(await provider.repair({...this.context(goal,after,completed),failedAction:{type:'verification'},error:'Completion conditions failed; user-specified criteria cannot be weakened or removed',remaining:[],failedConditions:criteria()}));
          if(repaired.completion)plan.completion=repaired.completion;
          if(repaired.continue!==undefined)plan.continue=repaired.continue;
          if(repaired.actions.length){plan={...plan,actions:repaired.actions};continue;}
          verification=await this.executor.verifier.check(criteria(),3000,startedAt);
          if(!verification.success&&repaired.continue){previous=batchState;await this.observe();plan=undefined;continue;}
          if(!verification.success)throw new Error('Repaired task completion could not be verified');
        }
        if(plan.continue){previous=batchState;await this.observe();plan=undefined;continue;}
        trace.completion=criteria().map(c=>this.executor.semanticCondition(c));trace.status='completed';break;
      }
    }catch(error){trace.status=this.control.stopped?'stopped':'failed';trace.error=this.variables.redact(error instanceof Error?error.message:'Task failed');this.control.stop();this.event('ERROR',trace.error);}
    finally{
      trace.durationMs=Date.now()-startedAt;trace.calls=this.providerCalls().slice(callStart);
      const usage=this.budget.snapshot(trace.actions.filter(a=>a.success).length);
      const actions=trace.actions.filter(a=>a.success).length,calls=usage.llmCalls-usageStart.llmCalls;
      trace.metrics={durationMs:trace.durationMs,browserActions:actions,failedActions:trace.actions.filter(a=>!a.success).length,llmCalls:calls,inputTokens:usage.inputTokens-usageStart.inputTokens,outputTokens:usage.outputTokens-usageStart.outputTokens,
        estimatedCostUSD:usage.estimatedCostUSD===null?null:usage.estimatedCostUSD-(usageStart.estimatedCostUSD??0),actionsPerLLMCall:calls?actions/calls:null,tokensPerAction:actions?((usage.inputTokens-usageStart.inputTokens)+(usage.outputTokens-usageStart.outputTokens))/actions:null,
        repairs,workflowCacheHits:cacheHits,pageCacheEntries:this.cache.size,planBatches:planCalls,compressionReduction:initial?this.observer.compressor.compress(initial).reduction:null,selectorSuccessRate:trace.actions.filter(a=>a.strategy).length?trace.actions.filter(a=>a.strategy&&a.success).length/trace.actions.filter(a=>a.strategy).length:null,
        usageEstimated:trace.calls.some(c=>c.usage.estimated),provider:this.options.provider?.name??'none',mode:this.options.mode??'normal',approvedSites:[...this.permittedSites]};
      const safe=this.safeTrace(trace);this.trace=safe;this.options.store.save(safe);
      this.active=false;
      if(safe.status==='completed'&&initial){try{this.workflows.learn(safe,initial);}catch{this.event('CACHE','Task completed, but workflow could not be saved');}}
      this.event(safe.status==='completed'?'DONE':'STOP',`Task ${safe.status}`,safe.metrics);
    }
    return this.trace!;
  }
  private providerCalls():LLMCall[]{return (this.options.provider as LLMProvider&{calls?:LLMCall[]})?.calls??[];}
  private safeTrace(trace:Trace):Trace{return JSON.parse(this.variables.redact(JSON.stringify(trace))) as Trace;}
  async replay(trace:Trace,url?:string){
    if(trace.status!=='completed')throw new Error('Only completed traces can be replayed; failed runs may contain incomplete side effects');
    const plan=PlanSchema.parse({goal:trace.goal,steps:['Replay successful semantic actions'],actions:trace.actions.filter(a=>a.success).map(a=>a.action),completion:trace.completion,continue:false});
    return this.run(trace.goal,url??trace.url,plan,false);
  }
  async close(){this.control.stop();await this.browser.close();}
}
