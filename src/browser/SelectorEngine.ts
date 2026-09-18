import type { Locator, Page, Frame } from 'playwright';
import type { Target, SemanticTarget } from '../actions/schema.js';
import type { PageElement } from './types.js';
const attr = (value:string)=>JSON.stringify(value);
export const selectorRanks = ['role','label','placeholder','testId','id','attributeName','text','css','path'] as const;
export class SelectorEngine {
  private registry=new Map<string,PageElement>();
  remember(elements:PageElement[]) { for(const element of elements) this.registry.set(element.ref,element); }
  descriptor(target:Target):SemanticTarget {
    if(typeof target!=='string')return target;
    const el=this.registry.get(target);
    if(!el)throw new Error(`Unknown semantic reference ${target}`);
    return {...el.selectors};
  }
  element(target:Target) { return typeof target==='string'?this.registry.get(target):undefined; }
  candidates(root:Page|Frame,t:SemanticTarget):{strategy:string;locator:Locator}[] {
    const list:{strategy:string;locator:Locator}[]=[];
    if(t.role&&t.name)list.push({strategy:'role',locator:root.getByRole(t.role as Parameters<Page['getByRole']>[0],{name:t.name,exact:true})});
    if(t.label)list.push({strategy:'label',locator:root.getByLabel(t.label,{exact:true})});
    if(t.placeholder)list.push({strategy:'placeholder',locator:root.getByPlaceholder(t.placeholder,{exact:true})});
    if(t.testId)list.push({strategy:'testId',locator:root.getByTestId(t.testId)});
    if(t.id)list.push({strategy:'id',locator:root.locator(`[id=${attr(t.id)}]`)});
    if(t.attributeName)list.push({strategy:'attributeName',locator:root.locator(`[name=${attr(t.attributeName)}]`)});
    if(t.text)list.push({strategy:'text',locator:root.getByText(t.text,{exact:true})});
    if(t.css)list.push({strategy:'css',locator:root.locator(t.css)});
    return list;
  }
  async resolve(page:Page,target:Target,timeoutMs=4000):Promise<{locator:Locator;strategy:string}> {
    const t=this.descriptor(target), observed=this.element(target);
    const root=page.frames()[t.frame??0];
    if(!root)throw new Error('Target frame no longer exists');
    const deadline=Date.now()+timeoutMs;
    do {
      for(const candidate of this.candidates(root,t)) {
        if(await candidate.locator.count()===1)return candidate;
      }
      if(observed) {
        const ref=root.locator(`[data-fcu-ref=${attr(observed.ref)}]`);
        if(await ref.count()===1)return {locator:ref,strategy:'reference'};
        const path=root.locator(observed.path);
        if(await path.count()===1 && await path.evaluate((el,name)=>(el.getAttribute('aria-label')||el.textContent||'').replace(/\s+/g,' ').trim()===name,observed.name))return{locator:path,strategy:'path'};
      }
      await page.waitForTimeout(70);
    }while(Date.now()<deadline);
    throw new Error(`Target missing or ambiguous: ${typeof target==='string'?target:JSON.stringify(target)}`);
  }
}
