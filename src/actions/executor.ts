import { chmod, lstat, mkdir, stat } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, resolve } from 'node:path';
import type { Download, Locator } from 'playwright';
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
  private readTextValue(locator:Locator){
    return locator.evaluate(el=>'value'in el?String((el as HTMLInputElement).value):el instanceof HTMLElement&&el.isContentEditable?el.innerText:undefined);
  }
  private async storeDownload(download:Download,requestedName?:string){
    const folder=resolve(this.options.downloadDir??'.fcu/downloads');
    await mkdir(folder,{recursive:true,mode:0o700});
    const info=await lstat(folder);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('Download folder must be a real local directory');
    await chmod(folder,0o700);
    const filename=[...basename((requestedName??download.suggestedFilename()).replaceAll('\\','/')).normalize('NFC')
      .replace(/[\u0000-\u001f\u007f<>:"|?*]/g,'_').replace(/[. ]+$/g,'')].slice(0,180).join('');
    if(!filename||filename==='.'||filename==='..')throw new Error('Invalid download filename');
    const path=resolve(folder,`${randomUUID()}-${filename}`);
    await download.saveAs(path);
    if(await download.failure())throw new Error('Browser download failed');
    await chmod(path,0o600);
    this.browser.downloads.push({path,filename});
    return {path,filename};
  }
  async run(input:Action):Promise<ActionResult> {
    let action=ActionSchema.parse(input);const startedAt=Date.now();
    let strategy:string|undefined,executed=false,receiptAction=action;
    let assertApproved:(()=>Promise<void>)|undefined,disposeApproved:(()=>Promise<void>)|undefined;
    try {
      await this.control.checkpoint();
      let locator:Locator|undefined;
      if('target'in action&&action.target){const selected=await this.observer.selectors.resolve(this.browser.page,action.target,action.timeoutMs,action.type==='extract');locator=selected.locator;strategy=selected.strategy;}
      action=await this.compiler.normalize(action,locator);
      receiptAction=this.semantic(action);
      const reason=await sensitiveReason(action,locator);
      const policy=this.options.confirmation??'sensitive';
      if(policy==='always'||policy==='sensitive'&&reason){
        const approvedPage=this.browser.page,approvedURL=approvedPage.url();
        const approvedElement=await locator?.elementHandle();
        disposeApproved=async()=>{await approvedElement?.dispose();};
        const fingerprint=locator?await locator.evaluate(el=>JSON.stringify({tag:el.tagName,text:el.textContent,aria:el.getAttribute('aria-label'),type:el.getAttribute('type'),href:el.getAttribute('href'),form:(el as HTMLInputElement).form?.action,method:(el as HTMLInputElement).form?.method})):undefined;
        assertApproved=async()=>{
          if(this.browser.page!==approvedPage||approvedPage.url()!==approvedURL)throw new Error('Browser page changed while awaiting approval; review a new plan');
          if(locator&&approvedElement){
            const same=await locator.evaluate((el,approved)=>el===approved&&el.isConnected,approvedElement);
            const current=await locator.evaluate(el=>JSON.stringify({tag:el.tagName,text:el.textContent,aria:el.getAttribute('aria-label'),type:el.getAttribute('type'),href:el.getAttribute('href'),form:(el as HTMLInputElement).form?.action,method:(el as HTMLInputElement).form?.method}));
            if(!same||current!==fingerprint)throw new Error('Approved target changed while awaiting approval; review a new action');
          }
        };
        await this.control.confirm(reason??'All-actions confirmation policy',this.variables.redact(JSON.stringify(receiptAction)));
        await assertApproved();
      }
      await this.control.checkpoint();
      const page=this.browser.page;const timeout=action.timeoutMs??4000;let data:unknown;
      const interaction=this.browser.interaction,interactionOptions={timeout,checkpoint:()=>this.control.checkpoint(),beforeEffect:assertApproved};
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
        case 'switchTab':await this.browser.switchTab(action.index,timeout);break;
        case 'back':await page.goBack({waitUntil:'domcontentloaded'});break;
        case 'forward':await page.goForward({waitUntil:'domcontentloaded'});break;
        case 'reload':await page.reload({waitUntil:'domcontentloaded'});break;
        case 'click':{
          const downloadIntent=await locator!.evaluate(el=>/^\s*(download|export)\b/i.test(el.getAttribute('aria-label')||el.textContent||el.getAttribute('value')||''));
          const downloadEvent=downloadIntent?page.waitForEvent('download',{timeout}).catch(()=>undefined):Promise.resolve(undefined);
          await interaction.perform(locator!,'click',async()=>{
          const newTab=await locator!.evaluate(el=>el.matches('a[target="_blank"]'));
          if(newTab){
            const both=await Promise.allSettled([page.waitForEvent('popup',{timeout}),locator!.click({timeout})]);
            if(both[0].status==='rejected')throw both[0].reason;
            if(both[1].status==='rejected')throw both[1].reason;
            await both[0].value.waitForLoadState('domcontentloaded',{timeout});this.browser.page=both[0].value;
          }else await locator!.click({timeout});
          },interactionOptions);
          const observed=await downloadEvent;
          if(observed){data=await this.storeDownload(observed);receiptAction=this.semantic(ActionSchema.parse({...action,type:'download'}));}
          break;
        }
        case 'doubleClick':await interaction.perform(locator!,'doubleClick',()=>locator!.dblclick({timeout}),interactionOptions);break;
        case 'hover':await interaction.perform(locator!,'hover',()=>locator!.hover({timeout}),interactionOptions);break;
        case 'fill':await interaction.enter(locator!,value,true,interactionOptions);if(await this.readTextValue(locator!)!==value)throw new Error('Fill postcondition failed');break;
        case 'type':{
          if(!await locator!.isEditable())throw new Error('Type target is not editable');
          const {before,after,expected}=await interaction.enter(locator!,value,false,interactionOptions);
          if(value&&(expected!==undefined?after!==expected:before!==undefined&&(after??await this.readTextValue(locator!))===before))throw new Error('Type postcondition failed');
          break;
        }
        case 'select':{
          const options=await locator!.evaluate(el=>[...(el as HTMLSelectElement).options].map(o=>({label:o.label,value:o.value})));
          const option=options.find(o=>o.value===value)||options.find(o=>o.label===value);
          if(!option)throw new Error('Select option not found');
          await interaction.perform(locator!,'select',()=>locator!.selectOption(option.value,{timeout}),interactionOptions);break;
        }
        case 'check':await interaction.perform(locator!,'check',()=>locator!.check({timeout}),interactionOptions);if(!await locator!.isChecked())throw new Error('Check postcondition failed');break;
        case 'uncheck':await interaction.perform(locator!,'uncheck',()=>locator!.uncheck({timeout}),interactionOptions);if(await locator!.isChecked())throw new Error('Uncheck postcondition failed');break;
        case 'press':await interaction.perform(locator!,'press',()=>locator!.press(value,{timeout}),interactionOptions);break;
        case 'scroll':if(locator)await interaction.perform(locator,'scroll',()=>locator!.scrollIntoViewIfNeeded({timeout}),interactionOptions);else await interaction.scroll(action.pixels*(action.direction==='up'?-1:1),interactionOptions);break;
        case 'upload':{
          const file=this.variables.file(action.file);
          if(!(await stat(file)).isFile())throw new Error('Upload alias is not a regular file');
          // Hidden native file controls have no pointer target.
          if(await locator!.isVisible())await interaction.perform(locator!,'upload',()=>locator!.setInputFiles(file,{timeout}),interactionOptions);
          else {await assertApproved?.();await locator!.setInputFiles(file,{timeout});}break;
        }
        case 'download':{
          const both=await interaction.perform(locator!,'click',()=>Promise.allSettled([page.waitForEvent('download',{timeout}),locator!.click({timeout})]),interactionOptions);
          if(both[0].status==='rejected')throw both[0].reason;
          if(both[1].status==='rejected')throw both[1].reason;
          data=await this.storeDownload(both[0].value,action.filename);break;
        }
        case 'wait':{
          const verification=await this.verifier.check([action.condition],timeout,startedAt);
          if(!verification.success)throw new Error('Wait condition failed');break;
        }
        case 'submit':{
          const form=locator!;
          await interaction.perform(form,'submit',()=>form.evaluate(el=>{
            const f=el instanceof HTMLFormElement?el:(el as HTMLInputElement).form;
            if(!f)throw new Error('Target is not a form or form control');
            if(!f.reportValidity())throw new Error('Form validation failed');
            f.addEventListener('submit',()=>f.setAttribute('data-fcu-submitted','true'),{once:true});f.requestSubmit();
          }),interactionOptions);break;
        }
        case 'extract':{
          interaction.cue('extract');
          const root=locator??page.locator('body');
          if(action.format==='table')data=await root.evaluateAll(els=>[...new Set(els.flatMap(el=>el.matches('tr')?[el]:[...el.querySelectorAll('tr')]))].filter(row=>{const box=row.getBoundingClientRect();return box.width>0&&box.height>0&&getComputedStyle(row).visibility==='visible';}).map(row=>[...row.querySelectorAll('th,td')].map(cell=>{
            for(let parent:Element|null=cell;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return '';}
            return cell.closest('[hidden],[inert],[aria-hidden="true"]')?'':(cell as HTMLElement).innerText?.trim()??'';
          })));
          else if(action.format==='links')data=await root.evaluateAll(els=>els.flatMap(el=>[...(el.matches('a[href]')?[el]:el.querySelectorAll('a[href]'))].filter(a=>{
            if(!a.getClientRects().length||a.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
            for(let parent:Element|null=a;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.visibility!=='visible'||style.opacity==='0')return false;}
            return true;
          }).map(a=>({text:(a as HTMLElement).innerText?.trim(),url:(a as HTMLAnchorElement).href}))));
          else if(action.format==='records'){
            if(!action.fields||!Object.keys(action.fields).length||Object.keys(action.fields).length>20)throw new Error('Records extraction requires 1..20 controlled CSS fields');
            data=await root.filter({visible:true}).evaluateAll((els,fields)=>els.flatMap(el=>el.matches('table,tbody')?[...el.querySelectorAll('tr')].filter(row=>row.querySelector('td')):[el]).map(el=>Object.fromEntries(Object.entries(fields).map(([key,field])=>{
              let node=el.querySelector(field.css);let value='';
              // Resolve tabular fields from actual headers, rather than guessed cell indices.
              if(el.tagName==='TR'&&field.attribute==='text'){
                const headers=[...(el.closest('table')?.querySelectorAll('thead th,tr:first-child th')??[])];
                const [normalize]=[(s:string)=>(s??'').toLowerCase().replace(/[^a-z]/g,'')];
                const wanted=normalize(key),indices=headers.map((h,i)=>normalize(h.textContent??'')===wanted?i:-1).filter(i=>i>=0);
                const cells=[...el.querySelectorAll(':scope > td')];
                if(indices.length===1&&cells.length>=headers.length)node=cells[indices[0]!+cells.length-headers.length]??node;
              }
              if(node){
                let hidden=!!node.closest('[hidden],[inert],[aria-hidden="true"]');
                for(let parent:Element|null=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility!=='visible'||style.opacity==='0')hidden=true;}
                const autocomplete=(node.getAttribute('autocomplete')??'').toLowerCase().split(/\s+/);
                const sensitiveInput=field.attribute==='value'&&node instanceof HTMLInputElement&&(node.type==='hidden'||node.type==='password'||autocomplete.some(token=>token.startsWith('cc-')||['current-password','new-password','one-time-code'].includes(token)));
                if(hidden&&!sensitiveInput)value='';
                else if(field.attribute==='text')value=(node as HTMLElement).innerText?.trim()??node.textContent?.trim()??'';
                else if(field.attribute==='href')value=(node as HTMLAnchorElement).href??'';
                else if(field.attribute==='src')value=(node as HTMLImageElement).src??'';
                else if(field.attribute==='value')value=sensitiveInput?'[sensitive value omitted]':(node as HTMLInputElement).value??'';
                else value=node.getAttribute(field.attribute)??'';}
              return[key,value];
            }))),action.fields);
          }
          else data=(await root.filter({visible:true}).allInnerTexts()).join('\n').slice(0,100000);
          const {match,limit}=action;
          if(Array.isArray(data)){
            if(match)data=data.filter(item=>JSON.stringify(item).toLowerCase().includes(match.toLowerCase()));
            if(limit)data=(data as unknown[]).slice(0,limit);
          }else if(typeof data==='string'&&(match||limit)){
            let lines=data.split(/\r?\n/);
            if(match)lines=lines.filter(line=>line.toLowerCase().includes(match.toLowerCase()));
            if(limit)lines=lines.slice(0,limit);
            data=lines.join('\n');
          }
          this.browser.extractions.push({key:action.key,value:data});
          data={[action.key]:data};break;
        }
      }
      if(action.verify?.length){const checked=await this.verifier.check(action.verify,timeout,startedAt);if(!checked.success)throw new Error(`Action verification failed: ${JSON.stringify(checked.failed)}`);}
      return {action:receiptAction,startedAt,durationMs:Date.now()-startedAt,success:true,strategy,data};
    }catch(error){
      return {action:receiptAction,startedAt,durationMs:Date.now()-startedAt,success:false,strategy,error:this.variables.redact(error instanceof Error?error.message:'Browser action failed'),uncertain:executed&&['click','doubleClick','press','submit','download','type'].includes(action.type)};
    }finally{await disposeApproved?.();}
  }
}
