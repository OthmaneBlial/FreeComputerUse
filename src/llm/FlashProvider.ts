import { z } from 'zod';
import { PlannerOutputSchema,RepairSchema,TaskGoalSchema,type Plan,type Repair } from '../actions/schema.js';
import type { LLMProvider,PlanningContext,RepairContext,LLMCall } from './LLMProvider.js';
import { SYSTEM_POLICY,PLAN_FORMAT,REPAIR_FORMAT,untrusted } from './prompts.js';
import { TokenBudget,type Usage } from '../agent/TokenBudget.js';
import { normalizeProviderOutput,providerOutputSchema } from './structuredOutput.js';
export type Effort='low'|'medium'|'high'|'xhigh'|'max';
export interface ProviderConfig {key:string;model:string;baseURL:string;protocol?:'openai-chat'|'anthropic';format?:'json_schema'|'json_object';maxOutputTokensParam?:'max_tokens'|'max_completion_tokens';timeoutMs?:number;maxRetries?:number;effort?:Effort;outputTokens?:number;provider?:string;vision?:boolean}
export interface ConnectionResult {ok:true;provider:string;model:string;latencyMs:number;usage:Usage;detail:string}
const RETRYABLE=new Set([408,409,429,500,502,503,504,529]);
const HINTS:Record<number,string>={400:'the provider rejected the request; check the model name and response format',401:'authentication failed; check the API key',402:'billing problem; check the account credit',403:'permission denied for this key or model',404:'model or endpoint not found; check the model name and base URL',408:'request timed out',409:'request conflict',413:'request too large',422:'the provider could not process the request',429:'rate limited; wait and try again',500:'provider error',502:'provider gateway error',503:'provider unavailable',504:'provider gateway timeout',529:'provider overloaded; try again shortly'};
// Claude models that accept server-side refusal fallbacks in their "default" form.
const FALLBACK_MODELS=/^claude-(?:opus-5(?:-5)?|sonnet-5-5|fable-5-1)$/;
export class ProviderHTTPError extends Error {
  constructor(readonly status:number,readonly errorType?:string){super(`LLM request failed with HTTP ${status}${errorType?` (${errorType})`:''}: ${HINTS[status]??(status>=500?'provider error':'request rejected')}`);}
  get retryable(){return RETRYABLE.has(this.status);}
}
async function boundedText(response:Response,limit:number):Promise<string>{
  const reader=response.body?.getReader();if(!reader)throw new Error('LLM response body is empty');
  const chunks:Uint8Array[]=[];let size=0;
  try{
    while(true){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;
      if(size>limit){await reader.cancel().catch(()=>{});throw new Error('LLM response exceeded 1 MiB');}
      chunks.push(value);
    }
  }finally{reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
  return new TextDecoder().decode(bytes);
}
// Only a short error code leaves the response body; provider messages can echo request data.
async function errorType(response:Response){
  try{
    const body=JSON.parse(await boundedText(response,65536)) as {type?:unknown;error?:{type?:unknown;code?:unknown}};
    const value=body.error?.type??body.error?.code??body.type;
    return typeof value==='string'&&/^[a-z][a-z0-9_.-]{0,47}$/i.test(value)?value:undefined;
  }catch{return undefined;}
}
export function retryDelay(headers:Headers,attempt:number){
  const value=headers.get('retry-after');
  if(value!==null){
    const seconds=Number(value);if(value.trim()&&Number.isFinite(seconds)&&seconds>=0)return Math.min(30000,seconds*1000);
    const date=Date.parse(value);if(Number.isFinite(date))return Math.min(30000,Math.max(0,date-Date.now()));
  }
  return Math.min(8000,500*2**attempt)+Math.floor(Math.random()*250);
}
function pause(ms:number,signal:AbortSignal){
  return new Promise<void>((resolve,reject)=>{
    if(signal.aborted){reject(new Error('LLM request cancelled'));return;}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},ms);
    const abort=()=>{clearTimeout(timer);reject(new Error('LLM request cancelled'));};
    signal.addEventListener('abort',abort,{once:true});
  });
}
// Claude bills about width x height / 750 tokens per image; a 1280x800 viewport is about 1,400.
const IMAGE_TOKENS=2000;
export class FlashProvider implements LLMProvider {
  readonly name:string;
  get vision(){return this.config.vision===true;}
  readonly calls:LLMCall[]=[];
  private controllers=new Set<AbortController>();
  cancel(){for(const controller of this.controllers)controller.abort();}
  constructor(readonly config:ProviderConfig,readonly budget:TokenBudget) {
    if(!config.key||!config.model)throw new Error('Set LLM_API_KEY and LLM_MODEL in your local environment');
    const url=new URL(config.baseURL);
    if(url.username||url.password||url.search||url.hash)throw new Error('LLM endpoint cannot contain credentials, query parameters or fragments');
    if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('LLM endpoint requires HTTPS');
    if(config.protocol==='anthropic'&&config.format==='json_schema')throw new Error('Anthropic mode requires LLM_RESPONSE_FORMAT=json_object because the action schema uses dynamic record keys');
    this.name=config.model;
  }
  async plan(context:PlanningContext):Promise<Plan>{const goal=TaskGoalSchema.parse(context.goal),plan=await this.request('PLAN',context,PlannerOutputSchema,PLAN_FORMAT);return{...plan,goal};}
  repair(context:RepairContext):Promise<Repair>{return this.request('REPAIR',context,RepairSchema,REPAIR_FORMAT);}
  classify(goal:string){return this.request('CLASSIFY',{goal},z.object({intent:z.string().max(80)}).strict(),'Return {"intent":short lowercase intent}.');}
  /** One minimal real completion: proves key, model, endpoint and JSON parsing end to end. */
  async testConnection():Promise<ConnectionResult>{
    const started=Date.now();
    await this.request('PING',{goal:'connection test'},z.object({ok:z.literal(true)}).strict(),'Return exactly this JSON object: {"ok":true}',false,'Reply with JSON only.');
    const call=this.calls.at(-1)!;
    return{ok:true,provider:this.config.provider??(this.config.protocol==='anthropic'?'anthropic':'openai-compatible'),model:this.config.model,latencyMs:Date.now()-started,usage:call.usage,detail:`${call.usage.estimated?'Estimated':'Reported'} usage: ${call.usage.input} input / ${call.usage.output} output tokens`};
  }
  private async request<T>(operation:string,context:object,schema:z.ZodType<T>,format:string,correcting=false,policy=SYSTEM_POLICY):Promise<T>{
    const {page,screenshot,...task}=context as RepairContext;
    const anthropic=this.config.protocol==='anthropic';
    const system=policy+'\n'+format+(this.config.format==='json_schema'?'\nJSON schema output requires every property. Use null for unused optional values. Encode records fields as [{key,css,attribute}].':'');
    const messages=[{role:'system',content:system},
      {role:'user',content:JSON.stringify({operation,...task})+'\n'+untrusted(page??'')}];
    const response_format=this.config.format==='json_schema'?{type:'json_schema',json_schema:{name:operation.toLowerCase(),schema:providerOutputSchema(schema),strict:false}}:{type:'json_object'};
    const fallbacks=anthropic&&FALLBACK_MODELS.test(this.config.model)&&new URL(this.config.baseURL).hostname==='api.anthropic.com';
    // The policy prefix is identical on every call, so Claude can serve it from the prompt cache.
    // Vision fallback: the screenshot goes beside the text in each API's image format.
    const content=(text:string,withImage:boolean,image=withImage?screenshot:undefined):unknown=>!image?text:anthropic?[{type:'image',source:{type:'base64',media_type:'image/jpeg',data:image}},{type:'text',text}]
      :[{type:'text',text},{type:'image_url',image_url:{url:`data:image/jpeg;base64,${image}`}}];
    const makeBody=(max_tokens:number,withImage=true):Record<string,unknown>=>anthropic?{
      model:this.config.model,system:[{type:'text',text:system,cache_control:{type:'ephemeral'}}],messages:[{role:'user',content:content(messages[1]!.content,withImage)}],max_tokens,
      ...(this.config.effort?{output_config:{effort:this.config.effort}}:{}),...(fallbacks?{fallbacks:'default'}:{}),
    }:{model:this.config.model,messages:[messages[0],{role:'user',content:content(messages[1]!.content,withImage)}],response_format,[this.config.maxOutputTokensParam??'max_tokens']:max_tokens,...(new URL(this.config.baseURL).hostname==='api.deepseek.com'?{temperature:0,thinking:{type:'disabled'}}:{})};
    // Current Claude models think before answering; thinking tokens count against max_tokens.
    const requestedOutput=operation==='CLASSIFY'||operation==='PING'?(anthropic?1024:100):this.config.outputTokens??(anthropic?8000:1800);
    // UTF-8 byte count is a deliberately conservative token admission bound.
    // Image bytes are not tokens: a viewport screenshot is bounded by a fixed estimate instead.
    const bound=()=>Buffer.byteLength(JSON.stringify(makeBody(requestedOutput,false)))+256+(screenshot?IMAGE_TOKENS:0);
    const available=this.budget.limits.maxInputTokens===null?Infinity:this.budget.limits.maxInputTokens-this.budget.input-this.budget.pendingInput;
    // Preserve the goal, policy, repair contract and user criteria. Reduce only
    // optional webpage data when the next conservative reservation will not fit.
    let pageText=page??'';
    while(bound()>available&&pageText.length){
      pageText=pageText.slice(0,Math.max(0,pageText.length-Math.max(128,bound()-available)));
      messages[1]!.content=JSON.stringify({operation,...task})+'\n'+untrusted(pageText+'\n[PAGE CONTEXT TRUNCATED TO FIT REMAINING INPUT BUDGET]');
    }
    const inputBound=bound();
    const reservation=this.budget.reserve(inputBound,requestedOutput),max_tokens=reservation.maxOutput;
    const controller=new AbortController();this.controllers.add(controller);
    const started=Date.now();let usage:Usage|undefined,validationFailure=false;
    try{
      const url=this.config.baseURL.replace(/\/$/,'')+(anthropic?'/messages':'/chat/completions');
      const headers:Record<string,string>=anthropic?{'x-api-key':this.config.key,'anthropic-version':'2023-06-01','Content-Type':'application/json',...(fallbacks?{'anthropic-beta':'server-side-fallback-2026-07-01'}:{})}:{Authorization:`Bearer ${this.config.key}`,'Content-Type':'application/json'};
      const body=JSON.stringify(makeBody(max_tokens)),maxRetries=this.config.maxRetries??2;
      let response:Response;
      // Rate limits and transient outages are retried inside one token reservation: rejected attempts are not billed.
      for(let attempt=0;;attempt++){
        try{response=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.any([controller.signal,AbortSignal.timeout(this.config.timeoutMs??60000)]),redirect:'error'});}
        catch(error){
          if(controller.signal.aborted)throw new Error('LLM request cancelled');
          if(error instanceof DOMException&&error.name==='TimeoutError')throw new Error('LLM request timed out');
          if(attempt>=maxRetries)throw new Error('LLM provider could not be reached; check the network and base URL');
          await pause(Math.min(8000,500*2**attempt),controller.signal);continue;
        }
        if(response.ok)break;
        const failure=new ProviderHTTPError(response.status,await errorType(response));
        if(!failure.retryable||attempt>=maxRetries)throw failure;
        await pause(retryDelay(response.headers,attempt),controller.signal);
      }
      const data=JSON.parse(await boundedText(response,1_048_576)) as {usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_cache_hit_tokens?:number;prompt_cache_miss_tokens?:number;input_tokens?:number;output_tokens?:number;cache_read_input_tokens?:number;cache_creation_input_tokens?:number};choices?:{finish_reason:string;message:{content:string|null}}[];stop_reason?:string;stop_details?:{category?:unknown}|null;content?:{type:string;text?:string}[]};
      const reported=data.usage?anthropic?{input:(data.usage.input_tokens??0)+(data.usage.cache_read_input_tokens??0)+(data.usage.cache_creation_input_tokens??0),output:data.usage.output_tokens??0,cacheHit:data.usage.cache_read_input_tokens,cacheMiss:(data.usage.input_tokens??0)+(data.usage.cache_creation_input_tokens??0)}:{input:data.usage.prompt_tokens??0,output:data.usage.completion_tokens??0,cacheHit:data.usage.prompt_cache_hit_tokens,cacheMiss:data.usage.prompt_cache_miss_tokens}:{input:inputBound,output:max_tokens,estimated:true};
      this.budget.record(reported,reservation.id);usage=reported;
      if(reported.output>reservation.maxOutput)throw new Error('LLM response exceeded the reserved output-token budget');
      if(data.stop_reason==='refusal'){const category=data.stop_details?.category;throw new Error(`Claude declined this request${typeof category==='string'&&/^[a-z_]{1,40}$/.test(category)?` (${category})`:''}`);}
      const choice=data.choices?.[0],content=anthropic?data.content?.filter(block=>block.type==='text').map(block=>block.text??'').join(''):choice?.message.content;
      if(choice?.finish_reason==='length'||data.stop_reason==='max_tokens')throw new Error('LLM JSON was truncated by the output limit');
      if(!content)throw new Error('LLM returned empty JSON');
      let value:unknown;try{value=JSON.parse(content);}catch{throw new Error('LLM returned invalid JSON');}
      const checked=schema.safeParse(this.config.format==='json_schema'?normalizeProviderOutput(value):value);
      if(!checked.success){validationFailure=true;throw new Error('LLM response failed strict action schema validation: '+checked.error.issues.map(i=>i.path.join('.')+': '+i.code).join('; '));}
      this.calls.push({operation,model:this.name,provider:this.config.provider,durationMs:Date.now()-started,usage,success:true});
      return checked.data;
    }catch(error){
      const safeError=(error instanceof Error?error.message:'LLM request failed').split(this.config.key).join('[redacted key]');
      if(!usage){usage={input:inputBound,output:max_tokens,estimated:true};this.budget.record(usage,reservation.id);}
      this.calls.push({operation,model:this.name,provider:this.config.provider,durationMs:Date.now()-started,usage,success:false,error:safeError});
      if(validationFailure&&!correcting)return await this.request(operation,context,schema,format+'\nYour previous JSON failed strict schema validation. Use only the listed keys. steps has at most 12 entries. An observed ref is a target STRING, never an object {ref:...}. Semantic target objects allow role,name,label,placeholder,testId,id,attributeName,text,css,frame only. download has type,target,filename? (not value,format,key or url). extract has type,target?,format,key,fields?,match?,limit? (not filename). closeTab/back/forward/reload have type only (optional sensitive/verify/timeoutMs); no index or target. REPAIR has actions,replace,completion?,continue? only; never goal,steps,reason or explanations.',true,policy);
      if(error instanceof ProviderHTTPError)throw error;
      throw new Error(safeError);
    }finally{this.controllers.delete(controller);}
  }
}
