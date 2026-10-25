import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer,type IncomingMessage,type ServerResponse} from 'node:http';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {FlashProvider,retryDelay} from '../src/llm/FlashProvider.js';
import {CodexSubscriptionProvider} from '../src/llm/CodexSubscriptionProvider.js';
import {ProviderChain,createProvider,providerStatuses,resolveProvider} from '../src/llm/providers.js';
import {FileSecretStore} from '../src/profile/SecretStore.js';
import {TokenBudget} from '../src/agent/TokenBudget.js';
import {PlanSchema} from '../src/actions/schema.js';
import type {LLMProvider,PlanningContext,RepairContext} from '../src/llm/LLMProvider.js';

const context:PlanningContext={goal:'Read',page:'Fixture',aliases:{profile:[],files:[]},completed:[],allowedOrigins:[]};
const plan={steps:['Extract'],actions:[{type:'extract',format:'text',key:'result'}],completion:[{type:'extraction_created'}],continue:false};
const ok=(res:ServerResponse,content:unknown=plan)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({usage:{prompt_tokens:50,completion_tokens:10},choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}));};
async function serve(handler:(req:IncomingMessage,res:ServerResponse,body:string)=>void){
  const server=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;handler(req,res,body);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  return{url:`http://127.0.0.1:${(server.address() as {port:number}).port}`,close:()=>new Promise<void>(resolve=>server.close(()=>resolve()))};
}

test('rate-limited and overloaded requests are retried within one reservation, honoring retry-after',async()=>{
  let attempts=0;
  const server=await serve((_req,res)=>{attempts++;if(attempts===1){res.writeHead(429,{'retry-after':'0','Content-Type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'rate_limit_error',message:'slow down'}}));return;}if(attempts===2){res.writeHead(529);res.end('{}');return;}ok(res);});
  try{
    const budget=new TokenBudget(),provider=new FlashProvider({key:'test-only-key',model:'fixture',baseURL:server.url},budget);
    const result=await provider.plan(context);
    assert.equal(result.actions.length,1);assert.equal(attempts,3);
    assert.equal(budget.calls,1,'Retries must not reserve another call');assert.equal(budget.input,50);assert.equal(budget.pendingInput,0);
    assert.deepEqual(provider.calls.map(call=>call.success),[true]);
  }finally{await server.close();}
});

test('non-retryable provider errors fail at once with a recovery hint and no response body',async()=>{
  let attempts=0;
  const server=await serve((_req,res)=>{attempts++;res.writeHead(401,{'Content-Type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'authentication_error',message:'key test-only-key is invalid; echoed prompt text'}}));});
  try{
    const provider=new FlashProvider({key:'test-only-key',model:'fixture',baseURL:server.url},new TokenBudget());
    await assert.rejects(provider.plan(context),/HTTP 401 \(authentication_error\): authentication failed; check the API key/);
    assert.equal(attempts,1);
    assert(!JSON.stringify(provider.calls).includes('echoed prompt'));assert(!JSON.stringify(provider.calls).includes('test-only-key'));
  }finally{await server.close();}
});

test('persistent overload stops after the bounded retries',async()=>{
  let attempts=0;
  const server=await serve((_req,res)=>{attempts++;res.writeHead(529,{'retry-after':'0','Content-Type':'application/json'});res.end(JSON.stringify({type:'error',error:{type:'overloaded_error'}}));});
  try{
    const provider=new FlashProvider({key:'test-only',model:'fixture',baseURL:server.url,maxRetries:2},new TokenBudget());
    await assert.rejects(provider.plan(context),/HTTP 529 \(overloaded_error\): provider overloaded/);
    assert.equal(attempts,3);
  }finally{await server.close();}
  assert.equal(retryDelay(new Headers({'retry-after':'2'}),0),2000);
  assert.equal(retryDelay(new Headers({'retry-after':'9999'}),0),30000);
  assert(retryDelay(new Headers(),3)>=4000);
});

test('Claude refusals are reported instead of being parsed as plans',async()=>{
  const server=await serve((_req,res)=>{res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({stop_reason:'refusal',stop_details:{type:'refusal',category:'cyber'},usage:{input_tokens:30,output_tokens:0},content:[]}));});
  try{
    const provider=new FlashProvider({key:'test-only',model:'claude-fixture',baseURL:server.url+'/v1',protocol:'anthropic',format:'json_object'},new TokenBudget());
    await assert.rejects(provider.plan(context),/Claude declined this request \(cyber\)/);
  }finally{await server.close();}
});

test('connection test makes one minimal real request and reports usage',async()=>{
  let request:Record<string,unknown>|undefined;
  const server=await serve((_req,res,body)=>{request=JSON.parse(body);ok(res,{ok:true});});
  try{
    const budget=new TokenBudget(),provider=new FlashProvider({key:'test-only',model:'fixture-model',baseURL:server.url,provider:'deepseek'},budget);
    const result=await provider.testConnection();
    assert.equal(result.ok,true);assert.equal(result.provider,'deepseek');assert.equal(result.model,'fixture-model');assert.match(result.detail,/Reported usage: 50 input/);
    assert.equal(request?.max_tokens,100);assert(!JSON.stringify(request).includes('DOM-first'),'The connection test must not send the full planner policy');
    assert.equal(budget.calls,1);
  }finally{await server.close();}
});

test('provider registry keeps generic settings on the selected provider and reads stored keys',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'fcu-secrets-'));
  try{
    const secrets=new FileSecretStore(directory);
    const env={LLM_PROVIDER:'deepseek',LLM_API_KEY:'generic-key-1234',PATH:''} as NodeJS.ProcessEnv;
    let statuses=providerStatuses(env,secrets);
    const byId=(id:string)=>statuses.find(status=>status.id===id)!;
    assert.equal(byId('deepseek').configured,true);assert.equal(byId('deepseek').selected,true);assert.equal(byId('deepseek').model,'deepseek-flash');assert.equal(byId('deepseek').keySource,'environment');
    assert.equal(byId('anthropic').configured,false,'LLM_API_KEY belongs only to LLM_PROVIDER');assert.equal(byId('anthropic').model,'claude-opus-5-5');
    assert.equal(byId('openai').configured,false);assert.equal(byId('openai-compatible').configured,false);
    assert.equal(byId('claude-subscription').configured,false,'No CLI on an empty PATH');
    secrets.set('anthropic','stored-claude-key-123');
    assert.equal((await stat(secrets.path)).mode&0o777,0o600);
    statuses=providerStatuses(env,secrets);assert.equal(byId('anthropic').configured,true);assert.equal(byId('anthropic').keySource,'file');
    assert(!JSON.stringify(statuses).includes('stored-claude-key-123'),'Statuses never carry key values');
    const claude=createProvider('anthropic',new TokenBudget(),env,secrets) as FlashProvider;
    assert.equal(claude.config.key,'stored-claude-key-123');assert.equal(claude.config.protocol,'anthropic');assert.equal(claude.config.baseURL,'https://api.anthropic.com/v1');
    assert.equal(createProvider('openai',new TokenBudget(),{...env,OPENAI_API_KEY:'openai-key-1234'},secrets),undefined,'OpenAI needs an explicit model');
    const openai=createProvider('openai',new TokenBudget(),{...env,OPENAI_API_KEY:'openai-key-1234',OPENAI_MODEL:'fixture-gpt'},secrets) as FlashProvider;
    assert.equal(openai.config.maxOutputTokensParam,'max_completion_tokens');
    assert.equal((createProvider('codex-subscription',new TokenBudget(),{...env,FCU_CLI_TIMEOUT_MS:'300000'},secrets) as CodexSubscriptionProvider).config.timeoutMs,300000);
    assert.throws(()=>createProvider('codex-subscription',new TokenBudget(),{...env,FCU_CLI_TIMEOUT_MS:'5'},secrets),/10000/,'A CLI timeout below 10 s is refused');
    assert.throws(()=>secrets.set('anthropic','has spaces in it'),/printable/);
    secrets.delete('anthropic');assert.equal(secrets.get('anthropic'),undefined);
    assert.throws(()=>providerStatuses({LLM_PROVIDER:'unknown'}),/LLM_PROVIDER must be one of/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

class Scripted implements LLMProvider {
  calls:{operation:string;model:string;durationMs:number;usage:{input:number;output:number};success:boolean}[]=[];
  constructor(readonly name:string,private failures=0){}
  private record(operation:string,success:boolean){this.calls.push({operation,model:this.name,durationMs:1,usage:{input:1,output:1},success});}
  async plan(_context:PlanningContext){if(this.failures-->0){this.record('PLAN',false);throw new Error('LLM request failed with HTTP 503: provider unavailable');}this.record('PLAN',true);return PlanSchema.parse({goal:'Read',...plan});}
  async repair(_context:RepairContext){this.record('REPAIR',true);return{actions:[{type:'extract' as const,format:'text' as const,key:'result'}],replace:1};}
}
test('provider chain falls back on provider failures and escalates repeated repairs',async()=>{
  const primary=new Scripted('small',1),fallback=new Scripted('backup'),strong=new Scripted('strong');
  const chain=new ProviderChain(primary,[fallback],strong);
  await chain.plan(context);
  assert.deepEqual(chain.calls.map(call=>[call.model,call.success]),[['small',false],['backup',true]]);
  const repair={...context,failedAction:{},error:'missing',remaining:[]};
  await chain.repair(repair);assert.equal(chain.calls.at(-1)?.model,'small');assert.equal(chain.escalated,false);
  await chain.repair(repair);assert.equal(chain.calls.at(-1)?.model,'strong');assert.equal(chain.name,'strong');
  await chain.plan(context);assert.equal(chain.calls.at(-1)?.model,'strong','An escalated task keeps the strong model');
  chain.reset();assert.equal(chain.escalated,false);assert.equal(chain.name,'small');
  const cancelled=new ProviderChain({name:'x',plan:async()=>{throw new Error('LLM request cancelled');},repair:async()=>{throw new Error('unused');}},[fallback]);
  const before=fallback.calls.length;await assert.rejects(cancelled.plan(context),/cancelled/);assert.equal(fallback.calls.length,before,'Cancellation never falls through');
  const env={LLM_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'deepseek-key-1234',LLM_ESCALATION_MODEL:'deepseek-v4-pro',ANTHROPIC_API_KEY:'claude-key-12345',LLM_FALLBACK_PROVIDERS:'anthropic'} as NodeJS.ProcessEnv;
  const resolved=resolveProvider(new TokenBudget(),env) as ProviderChain;
  assert(resolved instanceof ProviderChain);assert.equal(resolved.primary.name,'deepseek-flash');assert.equal(resolved.escalation?.name,'deepseek-v4-pro');assert.equal(resolved.fallbacks[0]?.name,'claude-opus-5-5');
  assert.equal(resolveProvider(new TokenBudget(),{LLM_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'deepseek-key-1234'})?.name,'deepseek-flash');
  assert.equal(resolveProvider(new TokenBudget(),{LLM_PROVIDER:'deepseek',DEEPSEEK_API_KEY:'deepseek-key-1234'},undefined,{provider:'anthropic'}),undefined);
});

test('a repair screenshot goes as an image block in both API formats and is budgeted as an image, not as text',async()=>{
  const bodies:Record<string,unknown>[]=[],repair={actions:[{type:'click',target:{x:150,y:40}}],replace:1};
  const server=await serve((req,res,body)=>{bodies.push(JSON.parse(body));if(req.url?.endsWith('/messages')){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({stop_reason:'end_turn',usage:{input_tokens:1500,output_tokens:20},content:[{type:'text',text:JSON.stringify(repair)}]}));}else ok(res,repair);});
  const screenshot=Buffer.alloc(150_000,7).toString('base64'),failing:RepairContext={...context,failedAction:{type:'click',target:{role:'button',name:'Go'}},error:'Target missing',remaining:[],screenshot};
  // 200 KB of base64 would not fit a 20,000-token limit if it were counted as text.
  const limits={maxLLMCalls:null,maxInputTokens:20_000,maxOutputTokens:null};
  try{
    const chat=new FlashProvider({key:'test-only',model:'fixture',baseURL:server.url,vision:true},new TokenBudget(limits));
    assert.deepEqual((await chat.repair(failing)).actions[0],{type:'click',target:{x:150,y:40}});
    const claude=new FlashProvider({key:'test-only',model:'claude-fixture',baseURL:server.url+'/v1',protocol:'anthropic',format:'json_object',vision:true},new TokenBudget(limits));
    await claude.repair(failing);
    const [openai,anthropic]=bodies as {messages:{content:unknown}[]}[];
    const chatContent=openai!.messages[1]!.content as {type:string;image_url?:{url:string};text?:string}[];
    assert.equal(chatContent[1]?.image_url?.url,`data:image/jpeg;base64,${screenshot}`);assert(!chatContent[0]?.text?.includes(screenshot),'The image is not repeated in the text');
    const claudeContent=anthropic!.messages[0]!.content as {type:string;source?:{type:string;media_type:string;data:string}}[];
    assert.deepEqual(claudeContent[0],{type:'image',source:{type:'base64',media_type:'image/jpeg',data:screenshot}});
    const plain=new FlashProvider({key:'test-only',model:'fixture',baseURL:server.url},new TokenBudget());
    assert.equal(plain.vision,false);assert.equal(new ProviderChain(plain).vision,false);
  }finally{await server.close();}
});
