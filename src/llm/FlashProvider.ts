import { z } from 'zod';
import { PlanSchema,RepairSchema,type Plan,type Repair } from '../actions/schema.js';
import type { LLMProvider,PlanningContext,RepairContext,LLMCall } from './LLMProvider.js';
import { SYSTEM_POLICY,PLAN_FORMAT,REPAIR_FORMAT,untrusted } from './prompts.js';
import { TokenBudget,type Usage } from '../agent/TokenBudget.js';
import { normalizeProviderOutput,providerOutputSchema } from './structuredOutput.js';
export interface ProviderConfig {key:string;model:string;baseURL:string;protocol?:'openai-chat'|'anthropic';format?:'json_schema'|'json_object';maxOutputTokensParam?:'max_tokens'|'max_completion_tokens';timeoutMs?:number}
export class FlashProvider implements LLMProvider {
  readonly name:string;
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
  plan(context:PlanningContext):Promise<Plan>{return this.request('PLAN',context,PlanSchema,PLAN_FORMAT);}
  repair(context:RepairContext):Promise<Repair>{return this.request('REPAIR',context,RepairSchema,REPAIR_FORMAT);}
  classify(goal:string){return this.request('CLASSIFY',{goal},z.object({intent:z.string().max(80)}).strict(),'Return {"intent":short lowercase intent}.');}
  private async request<T>(operation:string,context:object,schema:z.ZodType<T>,format:string,correcting=false):Promise<T>{
    const {page,...task}=context as PlanningContext;
    const system=SYSTEM_POLICY+'\n'+format+(this.config.format==='json_schema'?'\nJSON schema output requires every property. Use null for unused optional values. Encode records fields as [{key,css,attribute}].':'');
    const messages=[{role:'system',content:system},
      {role:'user',content:JSON.stringify({operation,...task})+'\n'+untrusted(page??'')}];
    const response_format=this.config.format==='json_schema'?{type:'json_schema',json_schema:{name:operation.toLowerCase(),schema:providerOutputSchema(schema),strict:false}}:{type:'json_object'};
    const makeBody=(max_tokens:number):Record<string,unknown>=>this.config.protocol==='anthropic'?{
      model:this.config.model,system,messages:[{role:'user',content:messages[1]!.content}],max_tokens,
    }:{model:this.config.model,messages,response_format,[this.config.maxOutputTokensParam??'max_tokens']:max_tokens,...(new URL(this.config.baseURL).hostname==='api.deepseek.com'?{temperature:0,thinking:{type:'disabled'}}:{})};
    // UTF-8 byte count is a deliberately conservative token admission bound.
    const bound=()=>Buffer.byteLength(JSON.stringify(makeBody(1800)))+256;
    const available=this.budget.limits.maxInputTokens===null?Infinity:this.budget.limits.maxInputTokens-this.budget.input-this.budget.pendingInput;
    // Preserve the goal, policy, repair contract and user criteria. Reduce only
    // optional webpage data when the next conservative reservation will not fit.
    let pageText=page??'';
    while(bound()>available&&pageText.length){
      pageText=pageText.slice(0,Math.max(0,pageText.length-Math.max(128,bound()-available)));
      messages[1]!.content=JSON.stringify({operation,...task})+'\n'+untrusted(pageText+'\n[PAGE CONTEXT TRUNCATED TO FIT REMAINING INPUT BUDGET]');
    }
    const inputBound=bound();
    const reservation=this.budget.reserve(inputBound,operation==='CLASSIFY'?100:1800),max_tokens=reservation.maxOutput;
    const controller=new AbortController();this.controllers.add(controller);
    const started=Date.now();let usage:Usage|undefined,validationFailure=false;
    try{
      const anthropic=this.config.protocol==='anthropic';
      const response=await fetch(this.config.baseURL.replace(/\/$/,'')+(anthropic?'/messages':'/chat/completions'),{
        method:'POST',headers:anthropic?{'x-api-key':this.config.key,'anthropic-version':'2023-06-01','Content-Type':'application/json'}:{Authorization:`Bearer ${this.config.key}`,'Content-Type':'application/json'},
        body:JSON.stringify(makeBody(max_tokens)),signal:AbortSignal.any([controller.signal,AbortSignal.timeout(this.config.timeoutMs??60000)]),redirect:'error',
      });
      if(!response.ok)throw new Error(`LLM request failed with HTTP ${response.status}`);
      const data=await response.json() as {usage?:{prompt_tokens?:number;completion_tokens?:number;prompt_cache_hit_tokens?:number;prompt_cache_miss_tokens?:number;input_tokens?:number;output_tokens?:number;cache_read_input_tokens?:number;cache_creation_input_tokens?:number};choices?:{finish_reason:string;message:{content:string|null}}[];stop_reason?:string;content?:{type:string;text?:string}[]};
      const reported=data.usage?anthropic?{input:(data.usage.input_tokens??0)+(data.usage.cache_read_input_tokens??0)+(data.usage.cache_creation_input_tokens??0),output:data.usage.output_tokens??0,cacheHit:data.usage.cache_read_input_tokens,cacheMiss:(data.usage.input_tokens??0)+(data.usage.cache_creation_input_tokens??0)}:{input:data.usage.prompt_tokens??0,output:data.usage.completion_tokens??0,cacheHit:data.usage.prompt_cache_hit_tokens,cacheMiss:data.usage.prompt_cache_miss_tokens}:{input:inputBound,output:max_tokens,estimated:true};
      this.budget.record(reported,reservation.id);usage=reported;
      const choice=data.choices?.[0],content=anthropic?data.content?.filter(block=>block.type==='text').map(block=>block.text??'').join(''):choice?.message.content;
      if(choice?.finish_reason==='length'||data.stop_reason==='max_tokens')throw new Error('LLM JSON was truncated by the output limit');
      if(!content)throw new Error('LLM returned empty JSON');
      let value:unknown;try{value=JSON.parse(content);}catch{throw new Error('LLM returned invalid JSON');}
      const checked=schema.safeParse(this.config.format==='json_schema'?normalizeProviderOutput(value):value);
      if(!checked.success){validationFailure=true;throw new Error('LLM response failed strict action schema validation: '+checked.error.issues.map(i=>i.path.join('.')+': '+i.code).join('; '));}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:true});
      return checked.data;
    }catch(error){
      const safeError=(error instanceof Error?error.message:'LLM request failed').split(this.config.key).join('[redacted key]');
      if(!usage){usage={input:inputBound,output:max_tokens,estimated:true};this.budget.record(usage,reservation.id);}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:false,error:safeError});
      if(validationFailure&&!correcting)return await this.request(operation,context,schema,format+'\nYour previous JSON failed strict schema validation. Use only the listed keys. steps has at most 12 entries. An observed ref is a target STRING, never an object {ref:...}. Semantic target objects allow role,name,label,placeholder,testId,id,attributeName,text,css,frame only. download has type,target,filename? (not value,format,key or url). extract has type,target?,format,key,fields?,match?,limit? (not filename). closeTab/back/forward/reload have type only (optional sensitive/verify/timeoutMs); no index or target. REPAIR has actions,replace,completion?,continue? only; never goal,steps,reason or explanations.',true);
      throw new Error(safeError);
    }finally{this.controllers.delete(controller);}
  }
}
