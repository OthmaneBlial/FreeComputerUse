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
import { WorkflowEngine } from '../workflows/WorkflowEngine.js';
import { ensureDataDirectory,runtimeConfig } from '../config.js';
import { PlanSchema } from '../actions/schema.js';
import type { LLMProvider } from '../llm/LLMProvider.js';

const browserURL=z.url().refine(value=>{try{checkedHttpURL(value);return true;}catch{return false;}},'Only HTTP(S) destinations without embedded credentials are supported');
const SitePermission=z.object({origin:z.url().refine(value=>{const url=new URL(value);return url.origin===value&&!url.username&&!url.password;},'Expected a canonical site origin')}).strict();
const RunRequest=z.object({goal:z.string().min(1).max(4000),url:browserURL,allowedOrigins:z.array(browserURL).max(30).default([]),confirmation:z.enum(['sensitive','always','never']).default('sensitive'),expectText:z.string().max(2000).optional(),expectUrl:z.string().max(2000).optional(),useWorkflows:z.boolean().default(true),mode:z.enum(['normal','ultra']).default('normal')}).strict();
const Manual=z.discriminatedUnion('type',[
  z.object({type:z.literal('click'),x:z.number().min(0).max(10000),y:z.number().min(0).max(10000)}).strict(),
  z.object({type:z.literal('type'),value:z.string().max(10000)}).strict(),
  z.object({type:z.literal('press'),value:z.string().max(50)}).strict(),
  z.object({type:z.literal('scroll'),y:z.number().min(-10000).max(10000)}).strict(),
  z.object({type:z.literal('navigate'),url:browserURL}).strict(),
]);
async function body(req:IncomingMessage){
  let buffer='';for await(const chunk of req){buffer+=chunk;if(Buffer.byteLength(buffer)>65536)throw new Error('Request too large');}
  try{return JSON.parse(buffer);}catch{throw new Error('Invalid JSON request');}
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
          trace:agent?.trace?redactLocalData({...agent.trace,metrics:agent.active?{...agent.budget.snapshot(agent.trace.actions.filter(a=>a.success).length),browserActions:agent.trace.actions.filter(a=>a.success).length}:agent.trace.metrics}):restored?redactLocalData(restored):undefined,approvedSites:agent?.approvedSites.map(redactLocal)??[],state:agent?.state?{url:redactLocal(agent.state.url),title:redactLocal(agent.state.title),hash:agent.state.hash,warnings:agent.state.warnings.map(redactLocal),elements:agent.state.elements.length}:undefined,
          pointer:agent?.browser.interaction.snapshot(),browserUrl:agent?.browser.page?redactLocal(agent.browser.page.url()):undefined,events:agent?.events.map(event=>redactLocalData(event))??[],model:options.provider?.name??config.provider?.name??'Local workflows only',configured:!!(options.provider??config.provider),limits:config.budget.limits,history:store.history(12).map(row=>redactLocalData(row)),workflows:new WorkflowEngine(store).list()});return;
      }
      if(req.method==='GET'&&path==='/api/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream','Connection':'keep-alive'});res.write(': connected\n\n');listeners.add(res);req.on('close',()=>listeners.delete(res));return;
      }
      if(req.method==='GET'&&path==='/api/preview'){
        if(!agent?.browser.page||agent.browser.page.isClosed()){res.writeHead(204);res.end();return;}
        const running=agent,page=running.browser.page,pageId=running.browser.interaction.pageId(page);
        const screenshot=await page.screenshot({type:'jpeg',quality:70,timeout:2500});
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
        await profiles.save(await body(req) as never);send(200,{saved:true});return;
      }
      if(req.method==='POST'&&['/api/run','/api/replay'].includes(path)){
        if(agent?.active||pending)throw new Error('A task is already running');
        const input=await body(req);
        const replay=path==='/api/replay'?store.get(z.object({id:z.string()}).strict().parse(input).id):undefined;
        if(path==='/api/replay'&&!replay)throw new Error('Run not found');
        const request=replay?RunRequest.parse({goal:replay.goal,url:replay.url}):RunRequest.parse(input);
        const fresh=runtimeConfig(),runOptions={provider:options.provider??fresh.provider,budget:fresh.budget,vault:await profiles.load(),useWorkflows:request.useWorkflows,confirmation:request.confirmation,mode:request.mode,
          completionCriteria:[...(request.expectText?[{type:'text_exists' as const,value:request.expectText}]:[]),...(request.expectUrl?[{type:'url_contains' as const,value:request.expectUrl}]:[])],
          downloadDir:join(config.dataDir,'downloads'),browser:{visualInteraction:true,headless:!options.headed,profileDir:join(config.dataDir,'browser'),allowedOrigins:[new URL(request.url).origin,...request.allowedOrigins.map(url=>new URL(url).origin)]}} satisfies Omit<AgentOptions,'store'>;
        if(agent)await agent.prepareForNextRun(runOptions);
        else{
          agent=new Agent({store,...runOptions});
          agent.on('event',event=>{for(const listener of listeners)listener.write(`data: ${JSON.stringify(event)}\n\n`);});
          const running=agent;
          running.browser.interaction.on('pointer',pointer=>{for(const listener of listeners)listener.write(`event: pointer\ndata: ${JSON.stringify({runId:running.trace?.id,pointer})}\n\n`);});
        }
        const running=agent;
        pending=(replay?running.replay(replay):running.run(request.goal,request.url)).catch(error=>running.event('ERROR',error instanceof Error?error.message:'Task failed')).finally(()=>{pending=undefined;});
        send(202,{started:true});return;
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
