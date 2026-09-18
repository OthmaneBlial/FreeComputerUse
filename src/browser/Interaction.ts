import { EventEmitter } from 'node:events';
import type { ElementHandle, Locator, Page } from 'playwright';

export type InteractionKind='moving'|'click'|'doubleClick'|'hover'|'fill'|'type'|'select'|'check'|'uncheck'|'press'|'scroll'|'upload'|'submit'|'extract'|'idle';
export interface PointerState {
  sequence:number;pageId:number;x:number;y:number;width:number;height:number;
  visible:boolean;kind:InteractionKind;time:number;
}
export interface InteractionOptions {timeout:number;checkpoint:()=>Promise<void>;beforeEffect?:()=>Promise<void>}
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

// Only trusted browser operations publish telemetry. No scripts, styles or
// event bindings are injected into websites, and typed values never enter it.
export class Interaction extends EventEmitter {
  private pages=new WeakMap<Page,number>();
  private positions=new WeakMap<Page,{x:number;y:number}>();
  private nextPage=0;private sequence=0;private latest?:PointerState;
  constructor(private currentPage:()=>Page,readonly enabled=false){super();}
  pageId(page=this.currentPage()) {
    if(!this.pages.has(page))this.pages.set(page,++this.nextPage);
    return this.pages.get(page)!;
  }
  wire(page:Page){
    this.pageId(page);
    page.on('framenavigated',frame=>{
      if(frame===page.mainFrame()){
        this.pages.set(page,++this.nextPage);
        if(page===this.currentPage())this.cue('idle',page,false);
      }
    });
    page.on('close',()=>{if(page===this.currentPage())this.cue('idle',page,false);});
  }
  snapshot():PointerState|undefined {
    if(!this.enabled||!this.currentPage())return;
    const page=this.currentPage();
    return this.latest?.pageId===this.pageId(page)?this.latest:this.state('idle',page,false);
  }
  private state(kind:InteractionKind,page:Page,visible:boolean):PointerState {
    const viewport=page.viewportSize()??{width:1280,height:720};
    const point=this.positions.get(page)??{x:viewport.width/2,y:viewport.height/2};
    return {sequence:this.sequence,pageId:this.pageId(page),...point,...viewport,visible,kind,time:Date.now()};
  }
  cue(kind:InteractionKind,page=this.currentPage(),visible=this.positions.has(page)) {
    if(!this.enabled)return;
    this.sequence++;this.latest=this.state(kind,page,visible);this.emit('pointer',this.latest);
  }
  async move(x:number,y:number,options:InteractionOptions,page=this.currentPage()) {
    const viewport=page.viewportSize()??{width:1280,height:720};
    if(x<0||y<0||x>=viewport.width||y>=viewport.height)throw new Error('Pointer destination is outside the browser viewport');
    const start=this.positions.get(page)??{x:viewport.width/2,y:viewport.height/2};
    const pageId=this.pageId(page),steps=this.enabled?16:1;
    for(let step=1;step<=steps;step++){
      await options.checkpoint();
      if(this.currentPage()!==page||this.pageId(page)!==pageId)throw new Error('Browser page changed during pointer movement; review a new action');
      const fraction=step/steps,eased=fraction*fraction*(3-2*fraction);
      const point={x:start.x+(x-start.x)*eased,y:start.y+(y-start.y)*eased};
      await page.mouse.move(point.x,point.y);this.positions.set(page,point);this.cue('moving',page);
      if(this.enabled)await delay(25);
    }
  }
  private async prepare(locator:Locator,kind:InteractionKind,options:InteractionOptions) {
    if(!this.enabled)return;
    await options.checkpoint();
    await locator.scrollIntoViewIfNeeded({timeout:options.timeout});
    const box=await locator.boundingBox({timeout:options.timeout});
    if(!box)throw new Error('Interaction target has no visible bounds');
    const page=this.currentPage(),viewport=page.viewportSize()??{width:1280,height:720};
    const left=Math.max(0,box.x),top=Math.max(0,box.y),right=Math.min(viewport.width,box.x+box.width),bottom=Math.min(viewport.height,box.y+box.height);
    if(right<=left||bottom<=top)throw new Error('Interaction target is outside the browser viewport');
    await this.move((left+right)/2,(top+bottom)/2,options,page);
    this.cue(kind,page);
  }
  private async assertTarget(locator:Locator,target:ElementHandle<HTMLElement|SVGElement>|null,page:Page,pageId:number) {
    if(!this.enabled)return;
    if(page!==this.currentPage()||pageId!==this.pageId(page))throw new Error('Browser page changed during interaction; review a new action');
    if(!target||!await target.evaluate(el=>el.isConnected)||!await locator.evaluate((el,original)=>el===original,target))throw new Error('Interaction target changed; review a new action');
  }
  async perform<T>(locator:Locator,kind:InteractionKind,operation:()=>Promise<T>,options:InteractionOptions):Promise<T> {
    const page=this.currentPage(),pageId=this.pageId(page);
    const target=this.enabled?await locator.elementHandle({timeout:options.timeout}):null;
    try{
    await this.prepare(locator,'moving',options);await options.checkpoint();
    await this.assertTarget(locator,target,page,pageId);await options.beforeEffect?.();
    const result=await operation();
    if(page===this.currentPage()&&pageId===this.pageId(page))this.cue(kind,page);
    if(this.enabled){await delay(180);await options.checkpoint();}
    return result;
    }finally{await target?.dispose();}
  }
  async enter(locator:Locator,value:string,replace:boolean,options:InteractionOptions) {
    if(!this.enabled){
      if(replace)await locator.fill(value,{timeout:options.timeout});
      else await locator.pressSequentially(value,{timeout:options.timeout});
      return;
    }
    const page=this.currentPage(),pageId=this.pageId(page),target=await locator.elementHandle({timeout:options.timeout});
    try{
    await this.prepare(locator,'moving',options);await options.checkpoint();
    await this.assertTarget(locator,target,page,pageId);await options.beforeEffect?.();
    const canType=await locator.evaluate(el=>el.matches('textarea,input:not([type]),input[type=text],input[type=search],input[type=email],input[type=url],input[type=tel]')||(el as HTMLElement).isContentEditable);
    await locator.click({timeout:options.timeout});this.cue('click');
    await options.checkpoint();await this.assertTarget(locator,target,page,pageId);await options.beforeEffect?.();this.cue(replace?'fill':'type');
    // Native date/select/file inputs keep their native semantics. Passwords and
    // long text are entered in one operation, never exposed in cursor events.
    if(!canType||value.length>160){
      if(replace)await locator.fill(value,{timeout:options.timeout});
      else await locator.pressSequentially(value,{timeout:options.timeout});
    }else{
      if(replace)await locator.press('ControlOrMeta+A',{timeout:options.timeout});
      if(replace&&!value)await locator.press('Backspace',{timeout:options.timeout});
      for(const character of value){
        await options.checkpoint();await this.assertTarget(locator,target,page,pageId);await locator.pressSequentially(character,{timeout:options.timeout});
        await delay(30);
      }
    }
    await delay(180);await options.checkpoint();
    }finally{await target?.dispose();}
  }
  async scroll(pixels:number,options:InteractionOptions) {
    const page=this.currentPage(),steps=this.enabled?8:1;
    if(this.enabled&&!this.positions.has(page)){
      const viewport=page.viewportSize()??{width:1280,height:720};
      await this.move(viewport.width*.75,viewport.height*.65,options,page);
    }
    this.cue('scroll',page);
    for(let step=0;step<steps;step++){
      await options.checkpoint();if(page!==this.currentPage())throw new Error('Browser page changed during scrolling');await page.mouse.wheel(0,pixels/steps);
      if(this.enabled)await delay(40);
    }
  }
  async manualClick(x:number,y:number,options:InteractionOptions) {
    const page=this.currentPage();await this.move(x,y,options,page);await options.checkpoint();
    await page.mouse.click(x,y);this.cue('click',page);
  }
}
