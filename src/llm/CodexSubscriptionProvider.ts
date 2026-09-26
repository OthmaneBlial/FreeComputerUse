import { execFile as execFileCallback,spawn } from 'node:child_process';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { PlanSchema,RepairSchema,type Plan,type Repair } from '../actions/schema.js';
import type { LLMProvider,PlanningContext,RepairContext,LLMCall } from './LLMProvider.js';
import { SYSTEM_POLICY,PLAN_FORMAT,REPAIR_FORMAT,untrusted } from './prompts.js';
import { TokenBudget,type Usage } from '../agent/TokenBudget.js';
import { cliProcessTerminator,parseCliVersion,safeCliEnvironment } from './cliEnvironment.js';
import { normalizeProviderOutput,providerOutputSchema } from './structuredOutput.js';

const execFile=promisify(execFileCallback);
export interface CodexSubscriptionConfig {command?:string;model?:string;timeoutMs?:number}
const disabledFeatures=['agent_message_board','apps','artifact','auth_elicitation','browser_use','browser_use_external','browser_use_full_cdp_access',
  'code_mode','code_mode_host','code_mode_interrupt','code_mode_only','code_mode_prewarm','computer_use','codex_apps_mcp_2026_07_28',
  'enable_mcp_apps','goals','hooks','image_generation','in_app_browser','in_app_chat','in_app_local_automation','memories','mcp_2026_07_28',
  'mcp_oauth_refresh_coordination','multi_agent','multi_agent_v2','plugins','remote_plugin','request_permissions_tool','realtime_conversation',
  'shell_snapshot','shell_snapshot_v2','shell_tool','shell_zsh_fork','skill_mcp_dependency_install','skill_search','sleep_tool',
  'standalone_web_search','tool_call_mcp_elicitation','tool_suggest','unified_exec','unified_exec_tty','view_image','worktrees','workspace_dependencies'];

function codexEnvironment(){
  const env=safeCliEnvironment();
  for(const key of ['OPENAI_BASE_URL','OPENAI_ORG_ID','OPENAI_PROJECT_ID','CODEX_MODEL_PROVIDER'])delete env[key];
  return env;
}

export class CodexSubscriptionProvider implements LLMProvider {
  readonly name:string;
  readonly calls:LLMCall[]=[];
  private controllers=new Set<AbortController>();
  private cliVersion?:string;
  constructor(readonly config:CodexSubscriptionConfig,readonly budget:TokenBudget){this.name=config.model??'Codex subscription';}
  cancel(){for(const controller of this.controllers)controller.abort();}
  async checkLogin(){
    let version=this.cliVersion;
    if(!version){
      try{
        const {stdout}=await execFile(this.config.command??'codex',['--version'],{encoding:'utf8',timeout:15000,cwd:tmpdir(),env:codexEnvironment(),maxBuffer:4096});
        version=parseCliVersion(String(stdout),'Codex CLI');this.cliVersion=version;
      }catch{throw new Error('Codex CLI could not report its version. Install or update it, then verify `codex --version`.');}
    }
    try{
      const {stdout,stderr}=await execFile(this.config.command??'codex',['login','status'],{encoding:'utf8',timeout:15000,cwd:tmpdir(),env:codexEnvironment(),maxBuffer:4096});
      if(!/logged in using chatgpt/i.test(`${stdout}\n${stderr}`))throw new Error();
    }catch{throw new Error('Codex is not signed in with ChatGPT. Run `codex login` and choose ChatGPT.');}
    return version;
  }
  plan(context:PlanningContext):Promise<Plan>{return this.request('PLAN',context,PlanSchema,PLAN_FORMAT);}
  repair(context:RepairContext):Promise<Repair>{return this.request('REPAIR',context,RepairSchema,REPAIR_FORMAT);}
  classify(goal:string){return this.request('CLASSIFY',{goal},z.object({intent:z.string().max(80)}).strict(),'Return {"intent":short lowercase intent}.');}
  private async request<T>(operation:string,context:object,schema:z.ZodType<T>,format:string,correcting=false):Promise<T>{
    const {page,...task}=context as PlanningContext;
    const suffix=`\nCodex strict output requires every listed property. Use null for optional values you do not need. For records extraction, encode fields as [{key,css,attribute}].${correcting?'\nYour previous JSON failed strict schema validation. Follow the requested schema exactly and use only listed keys.':''}`;
    const build=(pageText:string)=>`${SYSTEM_POLICY}\n${format}${suffix}\nReturn only the requested JSON object.\n${JSON.stringify({operation,...task})}\n${untrusted(pageText)}`;
    let pageText=page??'';
    const available=this.budget.limits.maxInputTokens===null?Infinity:this.budget.limits.maxInputTokens-this.budget.input-this.budget.pendingInput;
    while(Buffer.byteLength(build(pageText))>available&&pageText.length)pageText=pageText.slice(0,Math.max(0,pageText.length-Math.max(128,Buffer.byteLength(build(pageText))-available)));
    const prompt=build(pageText),inputBound=Buffer.byteLength(prompt);
    const reservation=this.budget.reserve(inputBound,operation==='CLASSIFY'?100:1800);
    const controller=new AbortController();this.controllers.add(controller);
    const started=Date.now();let usage:Usage|undefined,validationFailure=false;
    try{
      await this.checkLogin();
      const output=await this.run(prompt,schema,controller.signal);
      const outputBound=Math.ceil(Buffer.byteLength(output)/4);
      usage={input:inputBound,output:outputBound,estimated:true};this.budget.record(usage,reservation.id);
      if(outputBound>reservation.maxOutput)throw new Error('Codex response exceeded the estimated output-token budget');
      let value:unknown;try{value=JSON.parse(output);}catch{throw new Error('Codex returned invalid JSON');}
      const checked=schema.safeParse(normalizeProviderOutput(value));
      if(!checked.success){validationFailure=true;throw new Error('Codex response failed strict action schema validation: '+checked.error.issues.map(i=>i.path.join('.')+': '+i.code).join('; '));}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:true});return checked.data;
    }catch(error){
      const safeError=error instanceof Error?error.message:'Codex subscription request failed';
      if(!usage){usage={input:inputBound,output:0,estimated:true};this.budget.record(usage,reservation.id);}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:false,error:safeError});
      if(validationFailure&&!correcting)return this.request(operation,context,schema,format+suffix,true);
      throw error;
    }finally{this.controllers.delete(controller);}
  }
  private async run(prompt:string,schema:z.ZodTypeAny,signal:AbortSignal){
    const directory=await mkdtemp(join(tmpdir(),'fcu-codex-'));
    try{
      const schemaPath=join(directory,'output-schema.json');
      await writeFile(schemaPath,JSON.stringify(providerOutputSchema(schema)),{mode:0o600});
      const args=['exec','--ephemeral','--skip-git-repo-check','--ignore-user-config','--ignore-rules','--strict-config','--sandbox','read-only'];
      for(const feature of disabledFeatures)args.push('--disable',feature);
      args.push('--config','web_search="disabled"','--config','mcp_servers={}');
      args.push('--output-schema',schemaPath);
      if(this.config.model)args.push('--model',this.config.model);
      args.push('-');
      return await new Promise<string>((resolve,reject)=>{
        if(signal.aborted){reject(new Error('Codex request cancelled'));return;}
        const child=spawn(this.config.command??'codex',args,{cwd:directory,env:codexEnvironment(),stdio:['pipe','pipe','ignore']});
        const terminate=cliProcessTerminator(child);
        let output='',failure:Error|undefined,timedOut=false;
        const timer=setTimeout(()=>{timedOut=true;terminate();},this.config.timeoutMs??60000);
        const stop=()=>terminate();
        signal.addEventListener('abort',stop,{once:true});
        if(signal.aborted)stop();
        child.stdout.setEncoding('utf8').on('data',(chunk:string)=>{output+=chunk;if(Buffer.byteLength(output)>1_000_000){failure=new Error('Codex response exceeded the output-size limit');terminate();}});
        child.on('error',()=>{failure=new Error('Codex CLI could not start; install Codex CLI and run `codex login`.');});
        child.on('close',code=>{
          clearTimeout(timer);signal.removeEventListener('abort',stop);
          if(timedOut)failure=new Error('Codex CLI timed out');
          else if(signal.aborted)failure=new Error('Codex request cancelled');
          else if(code!==0&&!failure)failure=new Error('Codex CLI failed; check `codex login status` and your ChatGPT plan limits.');
          if(failure)reject(failure);else resolve(output.trim());
        });
        child.stdin.on('error',()=>{});child.stdin.end(prompt);
      });
    }finally{await rm(directory,{recursive:true,force:true});}
  }
}
