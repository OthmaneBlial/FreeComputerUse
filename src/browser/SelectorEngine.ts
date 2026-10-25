import type { Locator, Page, Frame } from 'playwright';
import type { Target, SemanticTarget } from '../actions/schema.js';
import type { PageElement } from './types.js';
const attr = (value:string)=>JSON.stringify(value);
export const selectorRanks = ['role','label','placeholder','testId','id','attributeName','text','css','path'] as const;
const NAMED_ROLES=['button','link','menuitem','tab','option','checkbox','radio','switch','treeitem','textbox','combobox','spinbutton'] as const;
export class SelectorEngine {
  private registry=new Map<string,PageElement>();
  remember(elements:PageElement[]) { for(const element of elements) this.registry.set(element.ref,element);while(this.registry.size>5000)this.registry.delete(this.registry.keys().next().value!); }
  descriptor(target:Target):SemanticTarget {
    if(typeof target!=='string')return target;
    if(target.startsWith('css:'))return {css:target.slice(4)};
    const el=this.registry.get(target);
    if(!el)throw new Error(`Unknown semantic reference ${target}`);
    return {...el.selectors};
  }
  element(target:Target) { return typeof target==='string'?this.registry.get(target):undefined; }
  candidates(root:Page|Frame,t:SemanticTarget):{strategy:string;locator:Locator}[] {
    const list:{strategy:string;locator:Locator}[]=[];
    if(t.role)list.push({strategy:'role',locator:root.getByRole(t.role as Parameters<Page['getByRole']>[0],t.name?{name:t.name,exact:true}:{})});
    if(t.label)list.push({strategy:'label',locator:root.getByLabel(t.label,{exact:true})});
    else if(t.name&&['textbox','combobox','spinbutton','upload'].includes(t.role??''))list.push({strategy:'label',locator:root.getByLabel(t.name,{exact:true})});
    if(t.placeholder)list.push({strategy:'placeholder',locator:root.getByPlaceholder(t.placeholder,{exact:true})});
    if(t.testId)list.push({strategy:'testId',locator:root.getByTestId(t.testId)});
    if(t.id)list.push({strategy:'id',locator:root.locator(`[id=${attr(t.id)}]`)});
    if(t.attributeName)list.push({strategy:'attributeName',locator:root.locator(`[name=${attr(t.attributeName)}]`)});
    if(t.text)list.push({strategy:'text',locator:root.getByText(t.text,{exact:true})});
    if(t.css)list.push({strategy:'css',locator:root.locator(t.css)});
    // Native disclosure summaries are clickable controls, but Chromium does not
    // expose them through Playwright's button role. Preserve exact-name matching.
    if(t.role==='button'&&t.name)list.push({strategy:'disclosure',locator:root.locator('summary').and(root.getByText(t.name,{exact:true}))});
    if(t.role==='button'&&/^(next( step)?|continue|proceed|advance)$/i.test(t.name??''))list.push({strategy:'local-synonym',locator:root.getByRole('button',{name:/^(next( step)?|continue|proceed|advance)$/i})});
    // Taught steps may name a control without knowing its role; the name must stay unique across roles.
    if(t.name&&!t.role)list.push({strategy:'name',locator:this.anyRole(root,t.name)});
    return list;
  }
  private anyRole(root:Page|Frame,name:string|RegExp){
    return NAMED_ROLES.map(role=>root.getByRole(role,{name,exact:true})).reduce((all,next)=>all.or(next));
  }
  /** Last-resort matches for small UI changes: same words ignoring case and punctuation, or the same exact name under another role. */
  tolerant(root:Page|Frame,t:SemanticTarget):{strategy:string;locator:Locator}[] {
    const list:{strategy:string;locator:Locator}[]=[];
    const words=(t.name??t.label??'').match(/[\p{L}\p{N}]+/gu);
    if(!words?.length||words.join('').length<2)return list;
    const loose=new RegExp(`^[^\\p{L}\\p{N}]*${words.map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^\\p{L}\\p{N}]+')}[^\\p{L}\\p{N}]*$`,'iu');
    if(t.role&&t.name)list.push({strategy:'normalized',locator:root.getByRole(t.role as Parameters<Page['getByRole']>[0],{name:loose})});
    if(t.label)list.push({strategy:'normalized',locator:root.getByLabel(loose)});
    if(t.name)list.push({strategy:'normalized',locator:this.anyRole(root,loose)});
    return list;
  }
  async resolve(page:Page,target:Target,timeoutMs=4000,allowMany=false,alternatives:SemanticTarget[]=[]):Promise<{locator:Locator;strategy:string}> {
    const t=this.descriptor(target), observed=this.element(target);
    const root=page.frames()[t.frame??0];
    if(!root)throw new Error('Target frame no longer exists');
    const deadline=Date.now()+timeoutMs;
    const others=alternatives.map(alternative=>({target:alternative,root:page.frames()[alternative.frame??0]})).filter((item):item is {target:SemanticTarget;root:Frame}=>!!item.root);
    while(true) {
      for(const candidate of this.candidates(root,t)) {
        const count=await candidate.locator.count();
        if(count===1||allowMany&&count>1)return candidate;
      }
      for(const other of others)for(const candidate of this.candidates(other.root,other.target)){
        if(await candidate.locator.count()===1)return{locator:candidate.locator,strategy:'alternative-'+candidate.strategy};
      }
      if(!allowMany)for(const item of [{target:t,root},...others])for(const candidate of this.tolerant(item.root,item.target)){
        if(await candidate.locator.count()===1)return candidate;
      }
      if(observed) {
        const path=root.locator(observed.path);
        if(await path.count()===1&&await path.evaluate((el,expected)=>{
          const [clean]=[(value:string|null|undefined)=>(value??'').replace(/\s+/g,' ').trim().slice(0,180)];
          const [labelText]=[(id:string)=>{
            const root=el.getRootNode();
            const label=root instanceof Document?document.getElementById(id):(root as ShadowRoot).getElementById(id);
            return label?clean((label as HTMLElement).innerText??label.textContent):'';
          }];
          const [visibleLabel]=[(label:HTMLLabelElement)=>clean(label.innerText)];
          const described=(el.getAttribute('aria-labelledby')??'').split(/\s+/).map(labelText).join(' ');
          const control=el as HTMLInputElement,tag=el.tagName.toLowerCase(),rawType=(el.getAttribute('type')??'').toLowerCase();
          const type=tag==='input'?control.type.toLowerCase():tag==='button'?(el as HTMLButtonElement).type.toLowerCase():rawType;
          const expectedType=expected.tag==='input'?(expected.type??'text'):expected.tag==='button'?(expected.type??'submit'):(expected.type??'');
          const form=control.form,formName=form?clean(form.getAttribute('aria-label')||form.id||'form'):undefined;
          const href=tag==='a'&&el.hasAttribute('href')?(el as HTMLAnchorElement).href:undefined;
          const section=el.closest('form,dialog,[role=dialog],nav,main,section');
          const region=section?clean(section.getAttribute('aria-label')||section.id||section.tagName.toLowerCase()):undefined;
          const label=clean(el.getAttribute('aria-label'))||clean(described)||clean(control.labels?Array.from(control.labels).map(visibleLabel).join(' '):'');
          const content=['input','textarea','select'].includes(tag)?'':clean((el as HTMLElement).innerText??el.textContent);
          const name=label||(['input','textarea','select'].includes(tag)?clean(el.getAttribute('placeholder'))|| (type==='image'?clean(control.alt):'') || clean(el.getAttribute('name'))||(['submit','button'].includes(type)?clean(control.value):''):content);
          const role=el.getAttribute('role')||(tag==='button'||['submit','button','reset','image'].includes(type)?'button':tag==='a'?'link':tag==='select'?'combobox':type==='checkbox'?'checkbox':type==='radio'?'radio':type==='file'?'upload':type==='number'?'spinbutton':tag==='summary'?'button':'textbox');
          return role===expected.role&&name===expected.name&&tag===expected.tag&&type===expectedType&&formName===expected.form&&href===expected.href&&region===expected.region;
        },observed))return{locator:path,strategy:'path'};
      }
      const remaining=deadline-Date.now();
      if(remaining<=0)break;
      await page.waitForTimeout(Math.min(70,remaining));
    }
    throw new Error(`Target missing or ambiguous: ${typeof target==='string'?target:JSON.stringify(target)}`);
  }
}
