import { mkdir, stat } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import type { Locator } from 'playwright';
import { ActionSchema, type Action, type Condition } from './schema.js';
import { sensitiveReason, type ConfirmationPolicy } from './policy.js';
import type { Browser } from '../browser/Browser.js';
import type { Observer } from '../browser/Observer.js';
import type { VariableResolver } from '../profile/VariableResolver.js';
import type { Control } from '../agent/Control.js';
import { Verifier } from '../verification/Verifier.js';
import { ActionCompiler } from './compiler.js';

export interface ActionResult {
  action:Action;startedAt:number;durationMs:number;success:boolean;
  strategy?:string;data?:unknown;error?:string;uncertain?:boolean;
}
export class Executor {
  readonly compiler=new ActionCompiler();
  readonly verifier:Verifier;
  constructor(readonly browser:Browser,readonly observer:Observer,readonly variables:VariableResolver,
    readonly control:Control,readonly options:{confirmation?:ConfirmationPolicy;downloadDir?:string}={}) {
    this.verifier=new Verifier(browser,observer,variables);
  }
  semantic(action:Action):Action {
    const result={...action};
    if('target'in result&&typeof result.target==='string')result.target=this.observer.selectors.descriptor(result.target);
    if(result.verify)result.verify=result.verify.map(c=>this.semanticCondition(c));
    if(result.type==='wait')result.condition=this.semanticCondition(result.condition);
    return result;
  }
  semanticCondition(condition:Condition):Condition {
    return 'target'in condition&&typeof condition.target==='string'?{...condition,target:this.observer.selectors.descriptor(condition.target)}:condition;
  }
  async run(input:Action):Promise<ActionResult> {
    let action=ActionSchema.parse(input);const startedAt=Date.now();
    let strategy:string|undefined,executed=false,receiptAction=action;
    try {
      await this.control.checkpoint();
      let locator:Locator|undefined;
      if('target'in action&&action.target){const selected=await this.observer.selectors.resolve(this.browser.page,action.target,action.timeoutMs,action.type==='extract');locator=selected.locator;strategy=selected.strategy;}
      action=await this.compiler.normalize(action,locator);
      receiptAction=this.semantic(action);
      const reason=await sensitiveReason(action,locator);
      const policy=this.options.confirmation??'sensitive';
      if(policy==='always'||policy==='sensitive'&&reason)await this.control.confirm(reason??'All-actions confirmation policy',this.variables.redact(JSON.stringify(receiptAction)));
      await this.control.checkpoint();
      const page=this.browser.page;const timeout=action.timeoutMs??4000;let data:unknown;
      const value='value'in action?this.variables.resolve(action.value):'';
      if(locator&&['click','press','submit'].includes(action.type)){
        const info=await locator.evaluate((el,type)=>{
          const f=el instanceof HTMLFormElement?el:(el as HTMLInputElement).form;
          const submitting=type==='submit'||type==='press'||el.matches('button:not([type=button]):not([type=reset]),input[type=submit]');
          return f&&submitting&&f.checkValidity()?{actionURL:f.action,method:f.method.toUpperCase(),id:f.id,label:f.getAttribute('aria-label')??'',unique:document.forms.length===1}:null;
        },action.type);
        if(info&&('target'in receiptAction)&&receiptAction.target)this.browser.formReceipts.push({...info,target:this.observer.selectors.descriptor(receiptAction.target),time:Date.now()});
      }
      executed=true;
      switch(action.type){
        case 'navigate':if(action.url.includes('{{profile.')||action.url.includes('{{files.'))throw new Error('Local vault values cannot be embedded in navigation URLs');await this.browser.navigate(action.url);break;
        case 'openTab':if(action.url.includes('{{profile.')||action.url.includes('{{files.'))throw new Error('Local vault values cannot be embedded in navigation URLs');await this.browser.openTab(action.url);break;
        case 'closeTab':await this.browser.closeTab();break;
        case 'switchTab':this.browser.switchTab(action.index);break;
        case 'back':await page.goBack({waitUntil:'domcontentloaded'});break;
        case 'forward':await page.goForward({waitUntil:'domcontentloaded'});break;
        case 'reload':await page.reload({waitUntil:'domcontentloaded'});break;
        case 'click':await locator!.click({timeout});break;
        case 'doubleClick':await locator!.dblclick({timeout});break;
        case 'hover':await locator!.hover({timeout});break;
        case 'fill':await locator!.fill(value,{timeout});if(await locator!.inputValue()!==value)throw new Error('Fill postcondition failed');break;
        case 'type':await locator!.pressSequentially(value,{timeout});break;
        case 'select':{
          const options=await locator!.evaluate(el=>[...(el as HTMLSelectElement).options].map(o=>({label:o.label,value:o.value})));
          const option=options.find(o=>o.value===value)||options.find(o=>o.label===value);
          if(!option)throw new Error('Select option not found');
          await locator!.selectOption(option.value,{timeout});break;
        }
        case 'check':await locator!.check({timeout});if(!await locator!.isChecked())throw new Error('Check postcondition failed');break;
        case 'uncheck':await locator!.uncheck({timeout});if(await locator!.isChecked())throw new Error('Uncheck postcondition failed');break;
        case 'press':await locator!.press(value,{timeout});break;
        case 'scroll':if(locator)await locator.scrollIntoViewIfNeeded({timeout});else await page.mouse.wheel(0,action.pixels*(action.direction==='up'?-1:1));break;
        case 'upload':{
          const file=this.variables.file(action.file);
          if(!(await stat(file)).isFile())throw new Error('Upload alias is not a regular file');
          await locator!.setInputFiles(file,{timeout});break;
        }
        case 'download':{
          const waiting=page.waitForEvent('download',{timeout});
          const both=await Promise.allSettled([waiting,locator!.click({timeout})]);
          if(both[0].status==='rejected')throw both[0].reason;
          if(both[1].status==='rejected')throw both[1].reason;
          const download=both[0].value;const folder=resolve(this.options.downloadDir??'.fcu/downloads');
          await mkdir(folder,{recursive:true,mode:0o700});
          const filename=basename(action.filename??download.suggestedFilename());
          if(!filename||filename==='.'||filename==='..')throw new Error('Invalid download filename');
          const path=resolve(folder,`${Date.now()}-${Math.random().toString(36).slice(2,8)}-${filename}`);await download.saveAs(path);
          if(await download.failure())throw new Error('Browser download failed');
          this.browser.downloads.push({path,filename});data={path,filename};break;
        }
        case 'wait':{
          const verification=await this.verifier.check([action.condition],timeout,startedAt);
          if(!verification.success)throw new Error('Wait condition failed');break;
        }
        case 'submit':{
          const form=locator!;
          await form.evaluate(el=>{
            const f=el instanceof HTMLFormElement?el:(el as HTMLInputElement).form;
            if(!f)throw new Error('Target is not a form or form control');
            if(!f.reportValidity())throw new Error('Form validation failed');
            f.addEventListener('submit',()=>f.setAttribute('data-fcu-submitted','true'),{once:true});f.requestSubmit();
          });break;
        }
        case 'extract':{
          const root=locator??page.locator('body');
          if(action.format==='table')data=await root.locator('tr').filter({visible:true}).evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('th,td')].map(cell=>cell.textContent?.trim()??'')));
          else if(action.format==='links')data=await root.evaluateAll(els=>els.flatMap(el=>[...(el.matches('a[href]')?[el]:el.querySelectorAll('a[href]'))].filter(a=>a.getClientRects().length>0).map(a=>({text:a.textContent?.trim(),url:(a as HTMLAnchorElement).href}))));
          else data=(await root.filter({visible:true}).allInnerTexts()).join('\n').slice(0,100000);
          if(Array.isArray(data)){
            const match=action.match;
            if(match)data=data.filter(item=>JSON.stringify(item).toLowerCase().includes(match.toLowerCase()));
            if(action.limit)data=(data as unknown[]).slice(0,action.limit);
          }
          this.browser.extractions.push({key:action.key,value:data});
          data={[action.key]:data};break;
        }
      }
      if(action.verify?.length){const checked=await this.verifier.check(action.verify,timeout,startedAt);if(!checked.success)throw new Error(`Action verification failed: ${JSON.stringify(checked.failed)}`);}
      return {action:receiptAction,startedAt,durationMs:Date.now()-startedAt,success:true,strategy,data};
    }catch(error){
      return {action:receiptAction,startedAt,durationMs:Date.now()-startedAt,success:false,strategy,error:this.variables.redact(error instanceof Error?error.message:'Browser action failed'),uncertain:executed&&['click','doubleClick','press','submit','download'].includes(action.type)};
    }
  }
}
