import { accessSync,constants } from 'node:fs';
import { delimiter,isAbsolute,join } from 'node:path';
import { z } from 'zod';
import type { TokenBudget } from '../agent/TokenBudget.js';
import type { SecretStore } from '../profile/SecretStore.js';
import { FlashProvider,type Effort } from './FlashProvider.js';
import { ClaudeSubscriptionProvider } from './ClaudeSubscriptionProvider.js';
import { CodexSubscriptionProvider } from './CodexSubscriptionProvider.js';
import type { LLMCall,LLMProvider,PlanningContext,RepairContext } from './LLMProvider.js';

export const PROVIDER_IDS=['anthropic','deepseek','openai','openai-compatible','claude-subscription','codex-subscription'] as const;
export type ProviderId=typeof PROVIDER_IDS[number];
export const ProviderIdSchema=z.enum(PROVIDER_IDS);
interface Preset {label:string;route:'api'|'cli';keyEnv?:string;modelEnv:string;defaultModel?:string;baseURL?:string;protocol?:'anthropic'|'openai-chat';commandEnv?:string;command?:string;vision:boolean;usage:'reported'|'estimated'}
export const PRESETS:Record<ProviderId,Preset>={
  anthropic:{label:'Claude API',route:'api',keyEnv:'ANTHROPIC_API_KEY',modelEnv:'ANTHROPIC_MODEL',defaultModel:'claude-opus-5-5',baseURL:'https://api.anthropic.com/v1',protocol:'anthropic',vision:true,usage:'reported'},
  deepseek:{label:'DeepSeek API',route:'api',keyEnv:'DEEPSEEK_API_KEY',modelEnv:'DEEPSEEK_MODEL',defaultModel:'deepseek-flash',baseURL:'https://api.deepseek.com',protocol:'openai-chat',vision:true,usage:'reported'},
  openai:{label:'OpenAI API',route:'api',keyEnv:'OPENAI_API_KEY',modelEnv:'OPENAI_MODEL',baseURL:'https://api.openai.com/v1',protocol:'openai-chat',vision:true,usage:'reported'},
  'openai-compatible':{label:'OpenAI-compatible API',route:'api',modelEnv:'LLM_MODEL',defaultModel:'deepseek-flash',baseURL:'https://api.deepseek.com',protocol:'openai-chat',vision:false,usage:'reported'},
  'claude-subscription':{label:'Claude subscription (Claude Code CLI)',route:'cli',modelEnv:'CLAUDE_MODEL',commandEnv:'CLAUDE_CLI_PATH',command:'claude',vision:false,usage:'estimated'},
  'codex-subscription':{label:'ChatGPT subscription (Codex CLI)',route:'cli',modelEnv:'CODEX_MODEL',commandEnv:'CODEX_CLI_PATH',command:'codex',vision:false,usage:'estimated'},
};
export interface ProviderStatus {id:ProviderId;label:string;route:'api'|'cli';configured:boolean;selected:boolean;model?:string;keySource?:'environment'|'keychain'|'file';detail:string;vision:boolean;usage:'reported'|'estimated'}
export interface ProviderSelection {provider?:ProviderId;model?:string}

function onPath(command:string,env:NodeJS.ProcessEnv){
  const candidates=isAbsolute(command)?[command]:(env.PATH??'').split(delimiter).filter(Boolean).map(dir=>join(dir,command));
  return candidates.some(path=>{try{accessSync(path,constants.X_OK);return true;}catch{return false;}});
}
export function defaultProviderId(env:NodeJS.ProcessEnv=process.env):ProviderId{
  const value=env.LLM_PROVIDER??'openai-compatible';
  if(!ProviderIdSchema.safeParse(value).success)throw new Error(`LLM_PROVIDER must be one of: ${PROVIDER_IDS.join(', ')}`);
  return value as ProviderId;
}
/** Settings for one provider. Generic LLM_* variables apply only to the provider chosen by LLM_PROVIDER. */
function settings(id:ProviderId,env:NodeJS.ProcessEnv,secrets?:SecretStore,model?:string){
  const preset=PRESETS[id],primary=defaultProviderId(env)===id;
  const environmentKey=preset.keyEnv&&env[preset.keyEnv]||(primary?env.LLM_API_KEY:undefined)||undefined;
  // A generic endpoint is defined by LLM_BASE_URL, so it is only configured as the LLM_PROVIDER choice.
  const storedKey=preset.route==='api'&&preset.keyEnv&&!environmentKey?secrets?.get(id):undefined;
  return{preset,primary,key:environmentKey??storedKey,keySource:environmentKey?'environment' as const:storedKey?secrets!.kind:undefined,
    model:model||(id!=='openai-compatible'||primary?env[preset.modelEnv]:undefined)||(primary?env.LLM_MODEL:undefined)||preset.defaultModel,
    baseURL:(primary?env.LLM_BASE_URL:undefined)||preset.baseURL!};
}
export function providerStatuses(env:NodeJS.ProcessEnv=process.env,secrets?:SecretStore):ProviderStatus[]{
  const selected=defaultProviderId(env);
  return PROVIDER_IDS.map(id=>{
    const value=settings(id,env,secrets),{preset}=value;
    let configured:boolean,detail:string;
    if(preset.route==='cli'){
      configured=onPath(env[preset.commandEnv!]||preset.command!,env);
      detail=configured?'CLI found; run the connection test to check sign-in':`Install ${preset.command} and sign in`;
    }else if(!value.key){configured=false;detail=preset.keyEnv?`Add an API key or set ${preset.keyEnv}`:'Set LLM_PROVIDER=openai-compatible with LLM_BASE_URL, LLM_MODEL and LLM_API_KEY';}
    else if(!value.model){configured=false;detail=`Set ${preset.modelEnv} to a model your account can use`;}
    else{configured=true;detail=`Key from ${value.keySource}; not tested in this session`;}
    return{id,label:preset.label,route:preset.route,configured,selected:id===selected,model:value.model,keySource:value.keySource,detail,vision:preset.vision,usage:preset.usage};
  });
}
const EffortSchema=z.enum(['low','medium','high','xhigh','max']);
export function createProvider(id:ProviderId,budget:TokenBudget,env:NodeJS.ProcessEnv=process.env,secrets?:SecretStore,model?:string):LLMProvider|undefined{
  const value=settings(id,env,secrets,model),{preset}=value;
  // A subscription CLI can wait minutes when the plan throttles it; FCU_CLI_TIMEOUT_MS lets that call finish.
  const timeoutMs=z.coerce.number().int().min(10000).max(600000).optional().parse(env.FCU_CLI_TIMEOUT_MS||undefined);
  if(id==='codex-subscription')return new CodexSubscriptionProvider({command:env.CODEX_CLI_PATH,model:value.model,timeoutMs},budget);
  if(id==='claude-subscription')return new ClaudeSubscriptionProvider({command:env.CLAUDE_CLI_PATH,model:value.model,timeoutMs},budget);
  if(!value.key||!value.model)return;
  const configuredTokenParam=value.primary?env.LLM_MAX_OUTPUT_TOKENS_PARAM:undefined;
  if(configuredTokenParam&&configuredTokenParam!=='max_tokens'&&configuredTokenParam!=='max_completion_tokens')throw new Error('LLM_MAX_OUTPUT_TOKENS_PARAM must be max_tokens or max_completion_tokens');
  const maxOutputTokensParam:'max_tokens'|'max_completion_tokens'|undefined=configuredTokenParam==='max_tokens'||configuredTokenParam==='max_completion_tokens'?configuredTokenParam:new URL(value.baseURL).hostname==='api.openai.com'?'max_completion_tokens':undefined;
  const effort=env.LLM_EFFORT?EffortSchema.parse(env.LLM_EFFORT) as Effort:undefined;
  const format=value.primary&&env.LLM_RESPONSE_FORMAT==='json_schema'?'json_schema':'json_object';
  return new FlashProvider({key:value.key,model:value.model,protocol:preset.protocol,baseURL:value.baseURL,format,maxOutputTokensParam,effort:preset.protocol==='anthropic'?effort:undefined,provider:id,vision:preset.vision},budget);
}

const ESCALATE_AFTER_REPAIRS=2;
const NO_FALLBACK=/cancelled|budget|not authorize|stopped by human/i;
/** Tries providers in order on failure and moves repairs to a stronger model once a task keeps failing. */
export class ProviderChain implements LLMProvider {
  readonly calls:LLMCall[]=[];
  private repairs=0;escalated=false;
  constructor(readonly primary:LLMProvider,readonly fallbacks:LLMProvider[]=[],readonly escalation?:LLMProvider){}
  get name(){return this.escalated&&this.escalation?this.escalation.name:this.primary.name;}
  get vision(){return this.all.some(provider=>provider.vision);}
  private get all(){return [this.primary,...this.fallbacks,...(this.escalation?[this.escalation]:[])];}
  reset(){this.repairs=0;this.escalated=false;for(const provider of this.all)provider.reset?.();}
  cancel(){for(const provider of this.all)provider.cancel?.();}
  plan(context:PlanningContext){return this.invoke(provider=>provider.plan(context));}
  repair(context:RepairContext){
    if(this.escalation&&++this.repairs>=ESCALATE_AFTER_REPAIRS)this.escalated=true;
    return this.invoke(provider=>provider.repair(provider.vision?context:{...context,screenshot:undefined}));
  }
  testConnection(){return (this.primary.testConnection?.()??Promise.reject(new Error('This provider has no connection test')));}
  private async invoke<T>(operation:(provider:LLMProvider)=>Promise<T>):Promise<T>{
    const order=this.escalated&&this.escalation?[this.escalation,this.primary,...this.fallbacks]:[this.primary,...this.fallbacks];
    let failure:unknown;
    for(const provider of order){
      const calls=(provider as {calls?:LLMCall[]}).calls,start=calls?.length??0;
      try{return await operation(provider);}
      catch(error){failure=error;if(error instanceof Error&&NO_FALLBACK.test(error.message))throw error;}
      finally{if(calls)this.calls.push(...calls.slice(start));}
    }
    throw failure;
  }
}

/** The provider for one task: the selection, then LLM_FALLBACK_PROVIDERS and LLM_ESCALATION_MODEL from the environment. */
export function resolveProvider(budget:TokenBudget,env:NodeJS.ProcessEnv=process.env,secrets?:SecretStore,selection:ProviderSelection={}):LLMProvider|undefined{
  const id=selection.provider??defaultProviderId(env);
  const primary=createProvider(id,budget,env,secrets,selection.model);
  if(!primary)return;
  const fallbacks=(env.LLM_FALLBACK_PROVIDERS??'').split(',').map(item=>item.trim()).filter(Boolean).map(item=>ProviderIdSchema.parse(item))
    .filter(item=>item!==id).map(item=>createProvider(item,budget,env,secrets)).filter((item):item is LLMProvider=>!!item);
  const escalationId=env.LLM_ESCALATION_PROVIDER?ProviderIdSchema.parse(env.LLM_ESCALATION_PROVIDER):id;
  const escalation=env.LLM_ESCALATION_MODEL?createProvider(escalationId,budget,env,secrets,env.LLM_ESCALATION_MODEL):undefined;
  return fallbacks.length||escalation?new ProviderChain(primary,fallbacks,escalation):primary;
}
