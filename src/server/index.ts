import { createServer,type IncomingMessage,type ServerResponse } from 'node:http';
import { randomBytes,timingSafeEqual } from 'node:crypto';
import { readFile,realpath,stat } from 'node:fs/promises';
import { join,sep } from 'node:path';
import { z } from 'zod';
import { Agent,type AgentOptions } from '../agent/Agent.js';
import { checkedHttpURL } from '../browser/Browser.js';
import { TraceStore } from '../history/TraceStore.js';
import { ProfileStore } from '../profile/ProfileStore.js';
import { VariableResolver } from '../profile/VariableResolver.js';
import { WorkflowEngine,ParameterSchema,type Parameter } from '../workflows/WorkflowEngine.js';
import { ensureDataDirectory,runtimeConfig } from '../config.js';
import { PlanSchema,TaskGoalSchema,type Action,type Condition } from '../actions/schema.js';
import type { LLMProvider } from '../llm/LLMProvider.js';
import { PROVIDER_IDS,PRESETS,ProviderIdSchema,providerStatuses } from '../llm/providers.js';
import { secretStore } from '../profile/SecretStore.js';
import { parseSteps } from '../teach/steps.js';
import type { Recording } from '../teach/Recorder.js';

const browserURL=z.url().refine(value=>{try{checkedHttpURL(value);return true;}catch{return false;}},'Only HTTP(S) destinations without embedded credentials are supported');
const SitePermission=z.object({origin:z.url().refine(value=>{const url=new URL(value);return url.origin===value&&!url.username&&!url.password;},'Expected a canonical site origin')}).strict();
const RunSettings={allowedOrigins:z.array(browserURL).max(30).default([]),confirmation:z.enum(['sensitive','always','never']).default('sensitive'),mode:z.enum(['normal','ultra']).default('normal'),
  provider:ProviderIdSchema.optional(),model:z.string().min(1).max(200).optional(),teachOnFailure:z.boolean().default(false)};
const RunRequest=z.object({goal:TaskGoalSchema,url:browserURL,expectText:z.string().max(2000).optional(),expectUrl:z.string().max(2000).optional(),useWorkflows:z.boolean().default(true),...RunSettings}).strict();
const ProcedureRun=z.object({id:z.string().min(1).max(40),values:z.record(z.string(),z.string().max(4000)).default({}),url:browserURL.optional(),...RunSettings}).strict();
const Id=z.object({id:z.string().min(1).max(40)}).strict();
// Values typed while teaching become parameters by name, e.g. {"app":"Snake Arena"}; values themselves are never stored.
const SaveTeaching=z.object({name:z.string().min(1).max(120),description:z.string().max(1000).default(''),keywords:z.array(z.string().min(1).max(40)).max(30).default([]),
  parameters:z.array(ParameterSchema.and(z.object({value:z.string().max(4000).optional()}))).max(20).default([]),runId:z.string().max(100).optional(),steps:z.string().max(20000).optional()}).strict();
const Manual=z.discriminatedUnion('type',[
  z.object({type:z.literal('click'),x:z.number().min(0).max(10000),y:z.number().min(0).max(10000)}).strict(),
  z.object({type:z.literal('type'),value:z.string().max(10000)}).strict(),
  z.object({type:z.literal('press'),value:z.string().max(50)}).strict(),
  z.object({type:z.literal('scroll'),y:z.number().min(-10000).max(10000)}).strict(),
  z.object({type:z.literal('navigate'),url:browserURL}).strict(),
  // A headless browser shows no file chooser: click the upload control and attach a file from the local vault.
  z.object({type:z.literal('upload'),x:z.number().min(0).max(10000),y:z.number().min(0).max(10000),file:z.string().regex(/^\{\{files\.[\w-]+\}\}$/)}).strict(),
]);
async function body(req:IncomingMessage):Promise<unknown>{
  const chunks:Buffer[]=[];let bytes=0;for await(const chunk of req){const part=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);bytes+=part.length;if(bytes>65536)throw new Error('Request too large');chunks.push(part);}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks,bytes)));}catch{throw new Error('Invalid JSON request');}
}
const same=(a:string,b:string)=>{const aa=Buffer.from(a),bb=Buffer.from(b);return aa.length===bb.length&&timingSafeEqual(aa,bb);};
export async function startServer(options:{port?:number;headed?:boolean;quiet?:boolean;provider?:LLMProvider}={}){
  const config=runtimeConfig();ensureDataDirectory(config.dataDir);
  const store=new TraceStore(join(config.dataDir,'history.sqlite')),profiles=new ProfileStore(join(config.dataDir,'profile.json'));
  const secret=randomBytes(32).toString('hex');let agent:Agent|undefined,pending:Promise<unknown>|undefined;
  const fallbackRedactor=new VariableResolver(),redactLocal=(value:string)=>fallbackRedactor.redact(agent?.variables.redact(value)??value);
  const redactLocalData=<T>(value:T):T=>JSON.parse(redactLocal(JSON.stringify(value))) as T;
  const previous=store.history(1)[0],savedTrace=previous?store.get(String(previous.id)):undefined;
  const restored=savedTrace?.status==='running'?undefined:savedTrace;
  const listeners=new Set<ServerResponse>();let origin='';
  const procedures=new WorkflowEngine(store);let recording:(Recording&{startUrl:string;structure:string})|undefined;
  type Settings={allowedOrigins:string[];confirmation:'sensitive'|'always'|'never';mode:'normal'|'ultra';provider?:z.infer<typeof ProviderIdSchema>;model?:string;teachOnFailure:boolean};
  const runOptions=async(settings:Settings,start:string,extra:Partial<Omit<AgentOptions,'store'>>={})=>{
    const fresh=runtimeConfig({provider:settings.provider,model:settings.model});
    if(settings.provider&&!fresh.provider&&!options.provider)throw new Error(`${PRESETS[settings.provider].label} is not configured`);
    return{provider:options.provider??fresh.provider,budget:fresh.budget,vault:await profiles.load(),confirmation:settings.confirmation,mode:settings.mode,teachOnFailure:settings.teachOnFailure,
      maxSteps:fresh.maxSteps??undefined,maxDurationMs:fresh.maxDurationMs??undefined,vision:fresh.vision,downloadDir:join(config.dataDir,'downloads'),
      browser:{visualInteraction:true,headless:!options.headed,profileDir:join(config.dataDir,'browser'),allowedOrigins:[new URL(start).origin,...settings.allowedOrigins.map(url=>new URL(url).origin)]},...extra} satisfies Omit<AgentOptions,'store'>;
  };
  const ready=async(settings:Omit<AgentOptions,'store'>)=>{
    if(agent){await agent.prepareForNextRun(settings);return agent;}
    const created=new Agent({store,...settings});agent=created;
    created.on('event',event=>{for(const listener of listeners)listener.write(`data: ${JSON.stringify(event)}\n\n`);});
    created.browser.interaction.on('pointer',pointer=>{for(const listener of listeners)listener.write(`event: pointer\ndata: ${JSON.stringify({runId:created.trace?.id,pointer})}\n\n`);});
    return created;
  };
  const begin=(running:Agent,task:Promise<unknown>)=>{pending=task.catch(error=>running.event('ERROR',error instanceof Error?error.message:'Task failed')).finally(()=>{pending=undefined;});};
  const idle=()=>{if(agent?.active||pending)throw new Error('A task is already running');if(agent?.recorder.active)throw new Error('Finish teaching first');};
  const server=createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    const send=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    try{
      if(req.headers.host!==new URL(origin).host){send(403,{error:'Unexpected Host'});return;}
      const path=new URL(req.url??'/',origin).pathname;
      if(req.method==='GET'&&path==='/'){
        res.setHeader('Set-Cookie',`fcu_session=${secret}; HttpOnly; SameSite=Strict; Path=/`);
        const html=(await readFile(new URL('../ui/index.html',import.meta.url),'utf8')).replace('__CSRF_TOKEN__',secret);
        res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(html);return;
      }
      if(req.method==='GET'&&['/app.js','/results.js','/style.css','/logo.svg'].includes(path)){
        res.writeHead(200,{'Content-Type':path.endsWith('.js')?'text/javascript':path.endsWith('.svg')?'image/svg+xml':'text/css'});res.end(await readFile(new URL('../ui'+path,import.meta.url)));return;
      }
      const cookie=req.headers.cookie?.split(';').map(s=>s.trim()).find(s=>s.startsWith('fcu_session='))?.slice(12)??'';
      if(!same(cookie,secret)){send(401,{error:'Open the local dashboard first'});return;}
      if(req.method==='POST'&&(!same(String(req.headers['x-fcu-token']??''),secret)||req.headers.origin!==origin)){
        send(403,{error:'Local origin and CSRF token required'});return;
      }
      if(req.method==='GET'&&path==='/api/state'){
        send(200,{active:agent?.active??false,paused:agent?.control.paused??false,pending:agent?.control.pending,
          teaching:agent?.recorder.active??false,recorded:agent?.recorder.count??0,taskLimits:{maxSteps:config.maxSteps,maxDurationMs:config.maxDurationMs},
          trace:agent?.trace?redactLocalData({...agent.trace,metrics:agent.active?{...agent.budget.snapshot(agent.trace.actions.filter(a=>a.success).length),browserActions:agent.trace.actions.filter(a=>a.success).length}:agent.trace.metrics}):!agent&&restored?redactLocalData(restored):undefined,approvedSites:agent?.approvedSites.map(redactLocal)??[],state:agent?.state?{url:redactLocal(agent.state.url),title:redactLocal(agent.state.title),hash:agent.state.hash,warnings:agent.state.warnings.map(redactLocal),elements:agent.state.elements.length}:undefined,
          pointer:agent?.browser.interaction.snapshot(),browserUrl:agent?.browser.page?redactLocal(agent.browser.page.url()):undefined,events:agent?.events.map(event=>redactLocalData(event))??[],model:options.provider?.name??config.provider?.name??'Local workflows only',configured:!!(options.provider??config.provider),limits:config.budget.limits,history:store.history(12).map(row=>redactLocalData(row)),workflows:procedures.list()});return;
      }
      if(req.method==='GET'&&path==='/api/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');listeners.add(res);req.on('close',()=>listeners.delete(res));return;
      }
      if(req.method==='GET'&&path==='/api/preview'){
        if(!agent?.browser.page||agent.browser.page.isClosed()){res.writeHead(204);res.end();return;}
        const running=agent,page=running.browser.page,pageId=running.browser.interaction.pageId(page);
        let screenshot:Buffer;try{screenshot=await page.screenshot({type:'jpeg',quality:70,timeout:2500});}catch{res.writeHead(204);res.end();return;}
        if(agent!==running||page!==running.browser.page||pageId!==running.browser.interaction.pageId(page)){res.writeHead(204);res.end();return;}
        res.writeHead(200,{'Content-Type':'image/jpeg','X-FCU-Page-ID':String(pageId),'X-FCU-Run-ID':running.trace?.id??''});res.end(screenshot);return;
      }
      if(req.method==='GET'&&path==='/api/profile'){send(200,await profiles.load());return;}
      if(req.method==='GET'&&path==='/api/download'){
        const query=new URL(req.url??'/',origin).searchParams,id=z.string().min(1).max(100).parse(query.get('id')),index=Number(z.string().regex(/^\d+$/).parse(query.get('index')));
        const trace=agent?.trace?.id===id?agent.trace:store.get(id),receipt=trace?.actions[index];
        if(!receipt?.success||receipt.action.type!=='download')throw new Error('Saved download not found');
        const data=receipt.data as {path?:string;filename?:string};if(!data?.path||!data.filename)throw new Error('Saved download not found');
        const root=await realpath(join(config.dataDir,'downloads')),file=await realpath(data.path);
        if(!file.startsWith(root+sep)||!(await stat(file)).isFile())throw new Error('Saved download is outside the download folder');
        res.writeHead(200,{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(data.filename).replace(/'/g,'%27')}`});res.end(await readFile(file));return;
      }
      if(req.method==='POST'&&path==='/api/profile'){
        if(agent?.active)throw new Error('Finish or stop the current task before changing profile');
        await profiles.save(await body(req));send(200,{saved:true});return;
      }
      if(req.method==='POST'&&['/api/run','/api/replay'].includes(path)){
        idle();
        const input=await body(req);
        const replay=path==='/api/replay'?store.get(z.object({id:z.string()}).strict().parse(input).id):undefined;
        if(path==='/api/replay'&&!replay)throw new Error('Run not found');
        const request=replay?RunRequest.parse({goal:replay.goal,url:replay.url}):RunRequest.parse(input);
        const running=await ready(await runOptions(request,request.url,{useWorkflows:request.useWorkflows,
          completionCriteria:[...(request.expectText?[{type:'text_exists' as const,value:request.expectText}]:[]),...(request.expectUrl?[{type:'url_contains' as const,value:request.expectUrl}]:[])]}));
        begin(running,replay?running.replay(replay):running.run(request.goal,request.url));
        send(202,{started:true});return;
      }
      if(req.method==='GET'&&path==='/api/providers'){send(200,{providers:providerStatuses(process.env,runtimeConfig().secrets)});return;}
      if(req.method==='POST'&&path==='/api/providers/test'){
        const input=z.object({provider:ProviderIdSchema,model:z.string().min(1).max(200).optional()}).strict().parse(await body(req));
        const provider=runtimeConfig(input).provider;if(!provider?.testConnection)throw new Error(`${PRESETS[input.provider].label} is not configured`);
        send(200,await provider.testConnection());return;
      }
      if(req.method==='POST'&&path==='/api/providers/key'){
        // Write-only: keys are stored, never returned.
        const input=z.object({provider:ProviderIdSchema,key:z.string().max(600).optional(),remove:z.boolean().optional()}).strict().parse(await body(req));
        if(PRESETS[input.provider].route!=='api'||!PRESETS[input.provider].keyEnv)throw new Error('This provider signs in through its own CLI');
        const secrets=secretStore(config.dataDir);
        if(input.remove)secrets.delete(input.provider);else secrets.set(input.provider,(input.key??'').trim());
        send(200,{saved:!input.remove,removed:!!input.remove,store:secrets.kind});return;
      }
      if(req.method==='GET'&&path==='/api/procedures'){send(200,{procedures:procedures.list()});return;}
      if(req.method==='GET'&&path==='/api/procedure'){
        const id=z.string().min(1).max(40).parse(new URL(req.url??'/',origin).searchParams.get('id')),workflow=procedures.get(id);if(!workflow)throw new Error('Procedure not found');
        send(200,{procedure:workflow,runs:procedures.runs(id),summary:procedures.summary(id)});return;
      }
      if(req.method==='GET'&&path==='/api/procedure/export'){
        const id=z.string().min(1).max(40).parse(new URL(req.url??'/',origin).searchParams.get('id')),exported=procedures.export(id);
        res.writeHead(200,{'Content-Type':'application/json','Content-Disposition':`attachment; filename="${exported.procedure.name.replace(/[^\w-]+/g,'-').slice(0,60)||'procedure'}.fcu.json"`});res.end(JSON.stringify(exported,null,2));return;
      }
      if(req.method==='POST'&&path==='/api/procedures/find'){
        const input=z.object({goal:TaskGoalSchema,url:browserURL.optional()}).strict().parse(await body(req));
        send(200,{matches:procedures.find(input.goal,input.url).slice(0,5).map(match=>({id:match.workflow.id,name:procedures.label(match.workflow),score:match.score,values:match.values,parameters:match.workflow.parameters??[],missing:match.missing.map(param=>param.name)}))});return;
      }
      if(req.method==='POST'&&path==='/api/procedures/run'){
        idle();
        const request=ProcedureRun.parse(await body(req)),workflow=procedures.get(request.id);if(!workflow)throw new Error('Procedure not found');
        const running=await ready(await runOptions(request,request.url??procedures.startUrl(workflow)));
        begin(running,running.runProcedure(request.id,request.values,request.url));
        send(202,{started:true});return;
      }
      if(req.method==='POST'&&path==='/api/teach/start'){
        idle();
        const input=z.object({url:browserURL,...RunSettings}).strict().parse(await body(req));
        const running=await ready(await runOptions(input,input.url));recording=undefined;
        begin(running,running.startTeaching(input.url));
        send(202,{started:true});return;
      }
      if(req.method==='POST'&&path==='/api/teach/stop'){
        if(!agent?.recorder.active)throw new Error('Nothing is being recorded');
        recording=agent.finishTeaching();send(200,{actions:recording.actions,parameters:recording.parameters,startUrl:redactLocal(recording.startUrl)});return;
      }
      if(req.method==='POST'&&path==='/api/procedures/create'){
        const input=SaveTeaching.and(z.object({expectText:z.string().max(2000).optional()})).parse(await body(req));
        let actions:Action[],startUrl:string,structure='',source:'taught'|'learned'='taught',completion:Condition[]=[],found:Parameter[]=[];
        if(input.steps){const parsed=parseSteps(input.steps,input.name);if(!parsed.startUrl)throw new Error('Start the steps with: open <url>');({actions,completion}=parsed.plan);startUrl=parsed.startUrl;found=parsed.parameters;}
        else if(input.runId){const trace=store.get(input.runId);if(trace?.status!=='completed')throw new Error('Only a completed run can become a procedure');actions=trace.actions.filter(result=>result.success).map(result=>result.action);startUrl=trace.url;source='learned';completion=trace.completion;}
        else{if(!recording)throw new Error('Teach the procedure first');({actions,startUrl,structure}=recording);found=recording.parameters;}
        const parameters=[...input.parameters,...found.filter(param=>!input.parameters.some(item=>item.name===param.name))];
        const created=procedures.saveSteps({...input,startUrl,actions,completion,parameters},source,{structure,learnedFrom:input.runId});
        if(!input.steps&&!input.runId)recording=undefined;
        send(200,{procedure:created});return;
      }
      if(req.method==='POST'&&path.startsWith('/api/procedures/')){
        const command=path.slice('/api/procedures/'.length),input=await body(req);
        if(command==='import'){send(200,{procedure:procedures.import(input)});return;}
        const {id}=z.object({id:z.string().min(1).max(40)}).loose().parse(input);
        if(command==='rename'){send(200,{procedure:procedures.rename(id,z.object({id:z.string(),name:z.string().min(1).max(120)}).strict().parse(input).name)});return;}
        // update() validates the merged procedure strictly.
        if(command==='update'){const {id:_id,...patch}=input as Record<string,unknown>;send(200,{procedure:procedures.update(id,patch,'Edited in the dashboard')});return;}
        if(command==='duplicate'){Id.parse(input);send(200,{procedure:procedures.duplicate(id)});return;}
        if(command==='delete'){Id.parse(input);send(200,{deleted:procedures.remove(id)});return;}
        if(command==='restore'){send(200,{procedure:procedures.restore(id,z.object({id:z.string(),version:z.number().int().min(1)}).strict().parse(input).version)});return;}
        throw new Error('Unknown procedure command');
      }
      if(req.method==='POST'&&path.startsWith('/api/control/')){
        if(!agent)throw new Error('No browser task yet');
        const command=path.slice('/api/control/'.length);
        if(command==='pause')agent.control.pause();else if(command==='resume')agent.control.resume();else if(command==='stop')agent.control.stop();
        else if(command==='revoke-site')agent.revokeSite(SitePermission.parse(await body(req)).origin);
        else if(command==='approve')agent.control.approve();else if(command==='reject')agent.control.reject();
        else if(command==='edit'){const plan=PlanSchema.parse(await body(req));agent.control.edit(plan);}
        else if(command==='manual'){
          if(agent.active&&!agent.control.paused)throw new Error('Pause to take manual control');
          const action=Manual.parse(await body(req));const page=agent.browser.page;
          if(!page||page.isClosed())throw new Error('No live browser');
          const manualOptions={timeout:4000,checkpoint:async()=>{if(agent?.active&&!agent.control.paused)throw new Error('Pause to take manual control');}};
          if(action.type==='click')await agent.browser.interaction.manualClick(action.x,action.y,manualOptions);
          if(action.type==='type')await page.keyboard.insertText(action.value);
          if(action.type==='press')await page.keyboard.press(action.value);
          if(action.type==='scroll')await agent.browser.interaction.scroll(action.y,manualOptions);
          if(action.type==='navigate')await agent.browser.navigate(action.url);
          if(action.type==='upload'){
            const file=agent.variables.file(action.file),chooser=page.waitForEvent('filechooser',{timeout:4000});
            await agent.browser.interaction.manualClick(action.x,action.y,manualOptions);await (await chooser).setFiles(file);
          }
          await agent.observe();
        }else throw new Error('Unknown control');send(200,{ok:true});return;
      }
      send(404,{error:'Not found'});
    }catch(error){send(400,{error:(error instanceof Error?error.message:'Request failed').replace(/sk-[a-zA-Z0-9_-]{16,}/g,'[redacted key]')});}
  });
  await new Promise<void>(resolve=>server.listen(options.port??4318,'127.0.0.1',resolve));
  const address=server.address();if(!address||typeof address==='string')throw new Error('Local server failed');origin=`http://127.0.0.1:${address.port}`;
  if(!options.quiet)console.log(`FreeComputerUse dashboard: ${origin}\nModel: ${config.provider?.name??'not configured'}. Browser state stays local.`);
  const close=async()=>{agent?.control.stop();await pending;await agent?.close();for(const response of listeners)response.end();await new Promise<void>(resolve=>server.close(()=>resolve()));store.close();};
  const shutdown=()=>void close().then(()=>process.exit());
  if(!options.quiet){process.once('SIGINT',shutdown);process.once('SIGTERM',shutdown);}
  return{server,url:origin,close,getAgent:()=>agent};
}
