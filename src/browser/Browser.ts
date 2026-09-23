import { chromium, type BrowserContext, type LaunchOptions, type Page } from 'playwright';
import { mkdir, chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type {SemanticTarget} from '../actions/schema.js';
import { Interaction } from './Interaction.js';

export interface BrowserOptions {
  headless?: boolean; profileDir?: string; timeoutMs?: number;
  allowedOrigins?: string[]; allowExternal?: boolean;
  beforeNavigate?:(url:string)=>Promise<void>;
  visualInteraction?:boolean;
}
type CDPMessage={id?:number;method?:string;sessionId?:string;params?:Record<string,unknown>;result?:unknown;error?:{message?:string}};
type CDPPending={resolve:(value:unknown)=>void;reject:(error:Error)=>void;timer:NodeJS.Timeout};
const browserChannels=['chrome','chrome-beta','chrome-dev','chrome-canary','msedge','msedge-beta','msedge-dev','msedge-canary'];
const pageTargetFilter:{type?:string;exclude:boolean}[]=[{type:'page',exclude:false},{exclude:true}];
const nestedTargetFilter:{type?:string;exclude:boolean}[]=[...['iframe','worker','shared_worker','service_worker'].map(type=>({type,exclude:false})),{exclude:true}];
function launchOptions(headless:boolean):LaunchOptions{
  const channel=process.env.FCU_BROWSER_CHANNEL;
  if(channel&&!browserChannels.includes(channel))throw new Error(`FCU_BROWSER_CHANNEL must be one of: ${browserChannels.join(', ')}`);
  return{headless,...(channel?{channel}:{})};
}
export class Browser {
  context!: BrowserContext;
  page!: Page;
  readonly downloads: { path: string; filename: string }[] = [];
  readonly extractions:{key:string;value:unknown}[]=[];
  readonly responses: { url: string; status: number; time: number;method:string;resource:string }[] = [];
  readonly formReceipts:{target:SemanticTarget;actionURL:string;method:string;id:string;label:string;unique:boolean;time:number}[]=[];
  private wired = new WeakSet<Page>();
  private cdpSocket?:WebSocket;
  private cdpSequence=0;
  private cdpPending=new Map<number,CDPPending>();
  private initialPageGuard?:{promise:Promise<void>;resolve:()=>void;reject:(error:Error)=>void};
  private temporaryProfileDir?:string;
  private closing=false;
  private closePromise?:Promise<void>;
  readonly interaction:Interaction;
  constructor(readonly options: BrowserOptions = {}) {this.interaction=new Interaction(()=>this.page,options.visualInteraction);}
  async launch() {
    const folder=this.options.profileDir?resolve(this.options.profileDir):await mkdtemp(join(tmpdir(),'free-computer-use-'));
    if(this.options.profileDir){await mkdir(folder,{recursive:true,mode:0o700});await chmod(folder,0o700);}
    else this.temporaryProfileDir=folder;
    try{
      this.context=await chromium.launchPersistentContext(folder,{...launchOptions(this.options.headless??true),acceptDownloads:true,serviceWorkers:'block',args:['--remote-debugging-port=0','--remote-debugging-address=127.0.0.1']});
    }catch(error){await this.cleanupTemporaryProfile();throw error;}
    this.context.setDefaultTimeout(this.options.timeoutMs ?? 4000);
    this.context.setDefaultNavigationTimeout(20000);
    this.context.on('page', page => {this.wire(page);this.page=page;void this.interaction.initialize(page).catch(()=>{});});
    this.page = this.context.pages()[0] ?? await this.context.newPage();
    this.wire(this.page);
    await this.interaction.initialize(this.page);
    await this.context.routeWebSocket('**/*',socket=>{
      const url=socket.url().replace(/^ws:/,'http:').replace(/^wss:/,'https:');
      if(this.permits(url))socket.connectToServer();else socket.close({code:1008,reason:'Origin blocked by local browser policy'});
    });
    await this.context.route('**/*', async route => {
      const url = route.request().url();
      if(route.request().isNavigationRequest()){
        if(this.options.beforeNavigate){
          try{await this.options.beforeNavigate(url);}catch{await route.abort('blockedbyclient');return;}
        }
      }
      // All initial browser HTTP requests, frames, fetches and form posts.
      if (!this.permits(url)) await route.abort('blockedbyclient');
      else await route.continue();
    });
    try{await this.startRedirectGuard(folder);}catch(error){await this.context.close().catch(()=>{});await this.cleanupTemporaryProfile();throw error;}
    return this;
  }
  private wire(page: Page) {
    if (this.wired.has(page)) return;
    this.wired.add(page);
    this.interaction.wire(page);
    page.on('dialog', dialog => void dialog.dismiss());
    page.on('response', response => {
      this.responses.push({ url: response.url(), status: response.status(), time: Date.now(),method:response.request().method(),resource:response.request().resourceType() });
      if (this.responses.length > 300) this.responses.shift();
    });
  }
  private async startRedirectGuard(profileDir:string) {
    let endpoint:string|undefined;
    for(let attempt=0;attempt<20&&!endpoint;attempt++){
      try{
        const[port,path]=(await readFile(join(profileDir,'DevToolsActivePort'),'utf8')).trim().split('\n');
        if(/^\d+$/.test(port??'')&&path?.startsWith('/devtools/browser/'))endpoint=`ws://127.0.0.1:${port}${path}`;
      }catch{}
      if(!endpoint)await new Promise(resolve=>setTimeout(resolve,50));
    }
    if(!endpoint)throw new Error('The local browser request guard could not start');
    const socket=new WebSocket(endpoint);this.cdpSocket=socket;
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('The local browser request guard did not connect')),5000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('The local browser request guard could not connect'));},{once:true});
    });
    socket.addEventListener('message',event=>this.receiveCDP(String(event.data)));
    socket.addEventListener('error',()=>this.failCDP(new Error('The local browser request guard disconnected')));
    socket.addEventListener('close',()=>{
      this.failCDP(new Error('The local browser request guard disconnected'));
      if(!this.closing)void this.context.close().catch(()=>{}).then(()=>this.cleanupTemporaryProfile());
    });
    let resolvePage!:()=>void,rejectPage!:(error:Error)=>void;
    const promise=new Promise<void>((resolve,reject)=>{resolvePage=resolve;rejectPage=reject;});
    this.initialPageGuard={promise,resolve:resolvePage,reject:rejectPage};
    await this.sendCDP('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:pageTargetFilter});
    let timer:NodeJS.Timeout|undefined;
    try{
      await Promise.race([promise,new Promise<void>((_,reject)=>{timer=setTimeout(()=>reject(new Error('The initial browser page was not guarded')),5000);})]);
    }finally{if(timer)clearTimeout(timer);}
  }
  private receiveCDP(value:string) {
    let message:CDPMessage;
    try{message=JSON.parse(value) as CDPMessage;}catch{return;}
    if(message.id!==undefined){
      const pending=this.cdpPending.get(message.id);
      if(!pending)return;
      this.cdpPending.delete(message.id);clearTimeout(pending.timer);
      if(message.error)pending.reject(new Error(message.error.message??'Chromium DevTools command failed'));
      else pending.resolve(message.result);
      return;
    }
    if(message.method==='Target.attachedToTarget'){
      const params=message.params as {sessionId:string;waitingForDebugger:boolean;targetInfo:{targetId:string;type:string}}|undefined;
      if(!params)return;
      void this.guardTarget(params.sessionId,params.targetInfo,params.waitingForDebugger).then(()=>{
        if(params.targetInfo.type==='page')this.initialPageGuard?.resolve();
      }).catch(async error=>{
        if(params.targetInfo.type==='page')this.initialPageGuard?.reject(error instanceof Error?error:new Error('The local browser request guard failed'));
        await this.sendCDP('Target.closeTarget',{targetId:params.targetInfo.targetId}).catch(()=>{});
      });
    }else if(message.method==='Fetch.requestPaused')void this.guardPausedRequest(message);
  }
  private async guardTarget(sessionId:string,target:{targetId:string;type:string},waiting:boolean) {
    await this.sendCDP('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]},sessionId);
    if(target.type==='page'||target.type==='iframe'){
      await this.sendCDP('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:nestedTargetFilter},sessionId);
    }
    if(waiting)await this.sendCDP('Runtime.runIfWaitingForDebugger',{},sessionId);
  }
  private async guardPausedRequest(message:CDPMessage) {
    const params=message.params as {requestId:string;request:{url:string};redirectedRequestId?:string;resourceType:string}|undefined;
    const sessionId=message.sessionId;
    if(!params||!sessionId)return;
    const fail=()=>this.sendCDP('Fetch.failRequest',{requestId:params.requestId,errorReason:'BlockedByClient'},sessionId);
    try{
      if(params.redirectedRequestId){
        if(params.resourceType==='Document'&&this.options.beforeNavigate){
          try{await this.options.beforeNavigate(params.request.url);}catch{await fail();return;}
        }
        if(!this.permits(params.request.url)){await fail();return;}
      }
      await this.sendCDP('Fetch.continueRequest',{requestId:params.requestId},sessionId);
    }catch{await fail().catch(()=>{});}
  }
  private sendCDP(method:string,params:Record<string,unknown>={},sessionId?:string) {
    const socket=this.cdpSocket;
    if(!socket||socket.readyState!==1)return Promise.reject(new Error('The local browser request guard is unavailable'));
    const id=++this.cdpSequence;
    return new Promise<unknown>((resolve,reject)=>{
      const timer=setTimeout(()=>{this.cdpPending.delete(id);reject(new Error(`Chromium DevTools command timed out: ${method}`));},5000);
      this.cdpPending.set(id,{resolve,reject,timer});
      try{socket.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}));}
      catch(error){this.cdpPending.delete(id);clearTimeout(timer);reject(error instanceof Error?error:new Error('Chromium DevTools command failed'));}
    });
  }
  private failCDP(error:Error) {
    for(const pending of this.cdpPending.values()){clearTimeout(pending.timer);pending.reject(error);}
    this.cdpPending.clear();
  }
  private async cleanupTemporaryProfile() {
    const folder=this.temporaryProfileDir;this.temporaryProfileDir=undefined;
    if(folder)await rm(folder,{recursive:true,force:true}).catch(()=>{});
  }
  permits(value: string) {
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      if (url.username || url.password) return false;
      return this.options.allowExternal===true || !!this.options.allowedOrigins?.includes(url.origin);
    } catch { return false; }
  }
  async navigate(value: string) {
    const url = new URL(value, this.page.url());
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password)throw new Error('Only HTTP(S) destinations without embedded credentials are supported');
    await this.options.beforeNavigate?.(url.href);
    if (!this.permits(url.href)) throw new Error('Navigation destination is outside the local origin policy');
    await this.page.goto(url.href, { waitUntil: 'domcontentloaded' });
  }
  async openTab(url: string) {
    await this.options.beforeNavigate?.(new URL(url,this.page.url()).href);
    if (!this.permits(new URL(url, this.page.url()).href)) throw new Error('Tab destination is outside the origin policy');
    this.page = await this.context.newPage();
    await this.navigate(url);
  }
  async switchTab(index: number,timeoutMs=4000) {
    const deadline=Date.now()+timeoutMs;
    while(!this.context.pages()[index]&&Date.now()<deadline){
      await this.context.waitForEvent('page',{timeout:Math.max(1,deadline-Date.now())}).catch(()=>{});
    }
    const page = this.context.pages()[index];
    if (!page) throw new Error('Tab index does not exist');
    await page.waitForLoadState('domcontentloaded',{timeout:timeoutMs});
    this.page = page;
    await this.interaction.initialize(page);
  }
  async closeTab() {
    if (this.context.pages().length === 1) throw new Error('Cannot close the last tab');
    const closing=this.page;this.page=this.context.pages().filter(page=>page!==closing).at(-1)!;
    await closing.close();
  }
  async close() {
    if(this.closePromise)return this.closePromise;
    this.closing=true;this.cdpSocket?.close();this.failCDP(new Error('Browser closed'));
    this.closePromise=(async()=>{try{await this.context?.close();}finally{await this.cleanupTemporaryProfile();}})();
    return this.closePromise;
  }
}
