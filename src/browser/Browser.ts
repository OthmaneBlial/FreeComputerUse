import { chromium, type BrowserContext, type LaunchOptions, type Page } from 'playwright';
import { mkdir, chmod } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {SemanticTarget} from '../actions/schema.js';
import { Interaction } from './Interaction.js';

export interface BrowserOptions {
  headless?: boolean; profileDir?: string; timeoutMs?: number;
  allowedOrigins?: string[]; allowExternal?: boolean;
  beforeNavigate?:(url:string)=>Promise<void>;
  visualInteraction?:boolean;
}
const browserChannels=['chrome','chrome-beta','chrome-dev','chrome-canary','msedge','msedge-beta','msedge-dev','msedge-canary'];
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
  private redirectGuards = new WeakMap<Page,Promise<void>>();
  readonly interaction:Interaction;
  constructor(readonly options: BrowserOptions = {}) {this.interaction=new Interaction(()=>this.page,options.visualInteraction);}
  async launch() {
    if (this.options.profileDir) {
      const folder = resolve(this.options.profileDir);
      await mkdir(folder, { recursive: true, mode: 0o700 });
      await chmod(folder, 0o700);
      this.context = await chromium.launchPersistentContext(folder, { ...launchOptions(this.options.headless ?? true), acceptDownloads: true,serviceWorkers:'block' });
    } else {
      const engine = await chromium.launch(launchOptions(this.options.headless ?? true));
      this.context = await engine.newContext({ acceptDownloads: true,serviceWorkers:'block' });
      this.context.on('close', () => void engine.close());
    }
    this.context.setDefaultTimeout(this.options.timeoutMs ?? 4000);
    this.context.setDefaultNavigationTimeout(20000);
    this.context.on('page', page => {this.wire(page);this.page=page;void this.guardRedirects(page).catch(()=>void page.close().catch(()=>{}));void this.interaction.initialize(page).catch(()=>{});});
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
    await this.guardRedirects(this.page);
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
  private guardRedirects(page:Page) {
    let guard=this.redirectGuards.get(page);
    if(guard)return guard;
    guard=(async()=>{
      const session=await this.context.newCDPSession(page);
      session.on('Fetch.requestPaused',async event=>{
        const fail=()=>session.send('Fetch.failRequest',{requestId:event.requestId,errorReason:'BlockedByClient'});
        try{
          if(event.redirectedRequestId){
            if(event.resourceType==='Document'&&this.options.beforeNavigate){
              try{await this.options.beforeNavigate(event.request.url);}catch{await fail();return;}
            }
            if(!this.permits(event.request.url)){await fail();return;}
          }
          await session.send('Fetch.continueRequest',{requestId:event.requestId});
        }catch{await fail().catch(()=>{});}
      });
      await session.send('Fetch.enable',{patterns:[{urlPattern:'*',requestStage:'Request'}]});
    })();
    this.redirectGuards.set(page,guard);
    return guard;
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
    await this.guardRedirects(this.page);
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
    await this.page.close();
    this.page = this.context.pages().at(-1)!;
  }
  async close() { await this.context?.close(); }
}
