import { z } from 'zod';
import { PlanSchema,RepairSchema,type Plan,type Repair } from '../actions/schema.js';
import type { LLMProvider,PlanningContext,RepairContext,LLMCall } from './LLMProvider.js';
import { SYSTEM_POLICY,PLAN_FORMAT,REPAIR_FORMAT,untrusted } from './prompts.js';
import { TokenBudget,type Usage } from '../agent/TokenBudget.js';
export interface ProviderConfig {key:string;model:string;baseURL:string;format?:'json_schema'|'json_object';timeoutMs?:number}
export class FlashProvider implements LLMProvider {
  readonly name:string;
  readonly calls:LLMCall[]=[];
  constructor(readonly config:ProviderConfig,readonly budget:TokenBudget) {
    if(!config.key||!config.model)throw new Error('Set LLM_API_KEY and LLM_MODEL in your local environment');
    const url=new URL(config.baseURL);
    if(url.protocol!=='https:'&&!['127.0.0.1','localhost'].includes(url.hostname))throw new Error('LLM endpoint requires HTTPS');
    this.name=config.model;
  }
  plan(context:PlanningContext):Promise<Plan>{return this.request('PLAN',context,PlanSchema,PLAN_FORMAT);}
  repair(context:RepairContext):Promise<Repair>{return this.request('REPAIR',context,RepairSchema,REPAIR_FORMAT);}
  classify(goal:string){return this.request('CLASSIFY',{goal},z.object({intent:z.string().max(80)}).strict(),'Return {"intent":short lowercase intent}.');}
  private async request<T>(operation:string,context:object,schema:z.ZodType<T>,format:string):Promise<T>{
    const {page,...task}=context as PlanningContext;
    const messages=[{role:'system',content:SYSTEM_POLICY+'\n'+format},
      {role:'user',content:JSON.stringify({operation,...task})+'\n'+untrusted(page??'')}];
    const response_format=this.config.format==='json_schema'?{type:'json_schema',json_schema:{name:operation.toLowerCase(),schema:z.toJSONSchema(schema,{unrepresentable:'any'}),strict:false}}:{type:'json_object'};
    // UTF-8 byte count is a deliberately conservative token admission bound.
    const inputBound=Buffer.byteLength(JSON.stringify({messages,response_format}))+256;
    const max_tokens=this.budget.reserve(inputBound,operation==='CLASSIFY'?100:1800);
    const started=Date.now();let usage:Usage|undefined;
    try{
      const body:Record<string,unknown>={model:this.config.model,messages,response_format,max_tokens,temperature:0};
      if(new URL(this.config.baseURL).hostname==='api.deepseek.com')body.thinking={type:'disabled'};
      const response=await fetch(this.config.baseURL.replace(/\/$/,'')+'/chat/completions',{
        method:'POST',headers:{Authorization:`Bearer ${this.config.key}`,'Content-Type':'application/json'},
        body:JSON.stringify(body),signal:AbortSignal.timeout(this.config.timeoutMs??60000),redirect:'error',
      });
      if(!response.ok)throw new Error(`LLM request failed with HTTP ${response.status}`);
      const data=await response.json() as {usage?:{prompt_tokens:number;completion_tokens:number;prompt_cache_hit_tokens?:number;prompt_cache_miss_tokens?:number};choices?:{finish_reason:string;message:{content:string|null}}[]};
      usage=data.usage?{input:data.usage.prompt_tokens,output:data.usage.completion_tokens,cacheHit:data.usage.prompt_cache_hit_tokens,cacheMiss:data.usage.prompt_cache_miss_tokens}:{input:inputBound,output:max_tokens,estimated:true};
      this.budget.record(usage);
      const choice=data.choices?.[0];
      if(choice?.finish_reason==='length')throw new Error('LLM JSON was truncated by the output limit');
      if(!choice?.message.content)throw new Error('LLM returned empty JSON');
      let value:unknown;try{value=JSON.parse(choice.message.content);}catch{throw new Error('LLM returned invalid JSON');}
      const checked=schema.safeParse(value);
      if(!checked.success)throw new Error('LLM response failed strict action schema validation: '+checked.error.issues.map(i=>i.path.join('.')+': '+i.code).join('; '));
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:true});
      return checked.data;
    }catch(error){
      const safeError=error instanceof Error?error.message:'LLM request failed';
      if(!usage){usage={input:inputBound,output:max_tokens,estimated:true};this.budget.record(usage);}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:false,error:safeError});
      throw new Error(safeError);
    }
  }
}
