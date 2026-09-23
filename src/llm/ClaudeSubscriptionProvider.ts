import { execFile as execFileCallback,spawn } from 'node:child_process';
import { mkdtemp,rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { z } from 'zod';
import { PlanSchema,RepairSchema,type Plan,type Repair } from '../actions/schema.js';
import type { LLMProvider,PlanningContext,RepairContext,LLMCall } from './LLMProvider.js';
import { SYSTEM_POLICY,PLAN_FORMAT,REPAIR_FORMAT,untrusted } from './prompts.js';
import { TokenBudget,type Usage } from '../agent/TokenBudget.js';
import { cliVersionAtLeast,parseCliVersion,safeCliEnvironment } from './cliEnvironment.js';

const execFile=promisify(execFileCallback);
export interface ClaudeSubscriptionConfig {command?:string;model?:string;timeoutMs?:number}

function claudeEnvironment(){
  const env=safeCliEnvironment();
  for(const key of Object.keys(env))if(/^(?:ANTHROPIC_|CLAUDE_CODE_USE_|AWS_|GOOGLE_|VERTEXAI_|CLOUD_ML_|AZURE_)/i.test(key))delete env[key];
  for(const key of ['OPENAI_BASE_URL','OPENAI_ORG_ID','OPENAI_PROJECT_ID','CODEX_MODEL_PROVIDER'])delete env[key];
  env.CLAUDE_CODE_SKIP_PROMPT_HISTORY='1';
  return env;
}

export class ClaudeSubscriptionProvider implements LLMProvider {
  readonly name:string;
  readonly calls:LLMCall[]=[];
  private controllers=new Set<AbortController>();
  private cliVersion?:string;
  constructor(readonly config:ClaudeSubscriptionConfig,readonly budget:TokenBudget){this.name=config.model??'Claude subscription';}
  cancel(){for(const controller of this.controllers)controller.abort();}
  async checkLogin(){
    let version=this.cliVersion;
    if(!version){
      try{
        const {stdout}=await execFile(this.config.command??'claude',['--version'],{encoding:'utf8',timeout:15000,cwd:tmpdir(),env:claudeEnvironment(),maxBuffer:4096});
        version=parseCliVersion(String(stdout),'Claude Code');
      }catch{throw new Error('Claude Code CLI could not report its version. Install or update to 2.1.248 or newer, then verify `claude --version`.');}
      if(!cliVersionAtLeast(version,'2.1.248'))throw new Error(`Claude Code ${version} is too old. Install version 2.1.248 or newer.`);
      this.cliVersion=version;
    }
    try{
      const {stdout}=await execFile(this.config.command??'claude',['auth','status'],{encoding:'utf8',timeout:15000,cwd:tmpdir(),env:claudeEnvironment(),maxBuffer:4096});
      const auth=JSON.parse(String(stdout)) as {loggedIn?:boolean;authMethod?:string;apiProvider?:string;apiKeySource?:string|null};
      if(!auth.loggedIn||!['claude.ai','oauth_token'].includes(auth.authMethod??'')||auth.apiProvider!=='firstParty'||auth.apiKeySource&&auth.apiKeySource!=='/login managed key')throw new Error();
    }catch{throw new Error('Claude Code is not signed in with a Claude subscription. Run `claude auth login` without `--console`.');}
    return version;
  }
  plan(context:PlanningContext):Promise<Plan>{return this.request('PLAN',context,PlanSchema,PLAN_FORMAT);}
  repair(context:RepairContext):Promise<Repair>{return this.request('REPAIR',context,RepairSchema,REPAIR_FORMAT);}
  classify(goal:string){return this.request('CLASSIFY',{goal},z.object({intent:z.string().max(80)}).strict(),'Return {"intent":short lowercase intent}.');}
  private async request<T>(operation:string,context:object,schema:z.ZodType<T>,format:string,correcting=false):Promise<T>{
    const {page,...task}=context as PlanningContext;
    const suffix=correcting?'\nYour previous JSON failed strict schema validation. Follow the requested schema exactly and use only listed keys.':'';
    const systemPrompt=`${SYSTEM_POLICY}\n${format}${suffix}\nReturn only the requested JSON object.`;
    const build=(pageText:string)=>`${format}${suffix}\nReturn only the requested JSON object.\n${JSON.stringify({operation,...task})}\n${untrusted(pageText)}`;
    let pageText=page??'';
    const available=this.budget.limits.maxInputTokens===null?Infinity:this.budget.limits.maxInputTokens-this.budget.input-this.budget.pendingInput;
    while(Buffer.byteLength(systemPrompt)+Buffer.byteLength(build(pageText))>available&&pageText.length)pageText=pageText.slice(0,Math.max(0,pageText.length-Math.max(128,Buffer.byteLength(systemPrompt)+Buffer.byteLength(build(pageText))-available)));
    const prompt=build(pageText),inputBound=Buffer.byteLength(systemPrompt)+Buffer.byteLength(prompt);
    const reservation=this.budget.reserve(inputBound,operation==='CLASSIFY'?100:1800);
    const controller=new AbortController();this.controllers.add(controller);
    const started=Date.now();let usage:Usage|undefined,validationFailure=false;
    try{
      await this.checkLogin();
      const output=await this.run(prompt,systemPrompt,controller.signal);
      const outputBound=Math.ceil(Buffer.byteLength(output)/4);
      usage={input:inputBound,output:outputBound,estimated:true};this.budget.record(usage,reservation.id);
      if(outputBound>reservation.maxOutput)throw new Error('Claude response exceeded the estimated output-token budget');
      let value:unknown;try{value=JSON.parse(output);}catch{throw new Error('Claude returned invalid JSON');}
      const checked=schema.safeParse(value);
      if(!checked.success){validationFailure=true;throw new Error('Claude response failed strict action schema validation: '+checked.error.issues.map(i=>i.path.join('.')+': '+i.code).join('; '));}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:true});return checked.data;
    }catch(error){
      const safeError=error instanceof Error?error.message:'Claude subscription request failed';
      if(!usage){usage={input:inputBound,output:0,estimated:true};this.budget.record(usage,reservation.id);}
      this.calls.push({operation,model:this.name,durationMs:Date.now()-started,usage,success:false,error:safeError});
      if(validationFailure&&!correcting)return this.request(operation,context,schema,format+suffix,true);
      throw error;
    }finally{this.controllers.delete(controller);}
  }
  private async run(prompt:string,systemPrompt:string,signal:AbortSignal){
    const directory=await mkdtemp(join(tmpdir(),'fcu-claude-'));
    try{
      const args=['-p','--input-format','text','--output-format','json','--restricted','--bare','--tools','','--strict-mcp-config','--mcp-config','{"mcpServers":{}}',
        '--disallowedTools','mcp__*','--no-session-persistence','--max-turns','1','--permission-mode','dontAsk','--no-chrome','--disable-slash-commands',
        '--append-system-prompt',systemPrompt];
      if(this.config.model)args.push('--model',this.config.model);
      return await new Promise<string>((resolve,reject)=>{
        if(signal.aborted){reject(new Error('Claude request cancelled'));return;}
        const child=spawn(this.config.command??'claude',args,{cwd:directory,env:claudeEnvironment(),stdio:['pipe','pipe','ignore']});
        let output='',failure:Error|undefined,timedOut=false;
        const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},this.config.timeoutMs??60000);
        const stop=()=>child.kill('SIGTERM');
        signal.addEventListener('abort',stop,{once:true});
        if(signal.aborted)stop();
        child.stdout.setEncoding('utf8').on('data',(chunk:string)=>{output+=chunk;if(Buffer.byteLength(output)>1_000_000){failure=new Error('Claude response exceeded the output-size limit');child.kill('SIGTERM');}});
        child.on('error',()=>{failure=new Error('Claude Code CLI could not start; install Claude Code and run `claude auth login`.');});
        child.on('close',code=>{
          clearTimeout(timer);signal.removeEventListener('abort',stop);
          if(timedOut)failure=new Error('Claude Code CLI timed out');
          else if(signal.aborted)failure=new Error('Claude request cancelled');
          else if(code!==0&&!failure)failure=new Error('Claude Code CLI failed; check `claude auth status` and your subscription limits.');
          if(failure){reject(failure);return;}
          let result:{is_error?:boolean;result?:unknown;structured_output?:unknown};
          try{result=JSON.parse(output.trim()) as typeof result;}catch{reject(new Error('Claude Code returned invalid JSON output'));return;}
          if(result.is_error){reject(new Error('Claude Code returned an error'));return;}
          const text=typeof result.result==='string'?result.result:result.structured_output!==undefined?JSON.stringify(result.structured_output):undefined;
          if(!text){reject(new Error('Claude Code returned no response'));return;}
          resolve(text);
        });
        child.stdin.on('error',()=>{});child.stdin.end(prompt);
      });
    }finally{await rm(directory,{recursive:true,force:true});}
  }
}
