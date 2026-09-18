import type { Condition } from '../actions/schema.js';
import type { Browser } from '../browser/Browser.js';
import type { Observer } from '../browser/Observer.js';
import type { VariableResolver } from '../profile/VariableResolver.js';
export class Verifier {
  constructor(readonly browser:Browser,readonly observer:Observer,readonly variables:VariableResolver) {}
  async one(condition:Condition,since=0):Promise<boolean> {
    const page=this.browser.page;
    if(condition.type==='form_submitted'){
      const target=this.observer.selectors.descriptor(condition.target);
      return this.browser.formReceipts.some(f=>{
        const matches=JSON.stringify(f.target)===JSON.stringify(target)||(f.id&&(target.id===f.id||target.css===`#${f.id}`||target.css===`form#${f.id}`))||(f.label&&(target.label===f.label||target.role==='form'&&target.name===f.label))||(f.unique&&target.css==='form');
        const action=new URL(f.actionURL);
        return matches&&f.time>=since&&this.browser.responses.some(r=>{const url=new URL(r.url);return r.time>=f.time&&r.status>=200&&r.status<400&&r.method===f.method&&r.resource==='document'&&url.origin===action.origin&&url.pathname===action.pathname;});
      });
    }
    if('target' in condition) {
      let locator;
      try{locator=(await this.observer.selectors.resolve(page,condition.target,100)).locator;}catch{
        return condition.type==='element_not_visible';
      }
      switch(condition.type){
        case 'element_exists':return await locator.count()>0;
        case 'element_visible':return locator.isVisible();
        case 'element_not_visible':return !(await locator.isVisible());
        case 'input_value_equals':return await locator.inputValue()===this.variables.resolve(condition.value);
        case 'checkbox_checked':return locator.isChecked();
      }
    }
    switch(condition.type){
      case 'extraction_created':return this.browser.extractions.some(e=>!condition.key||e.key===condition.key);
      case 'extraction_contains':return this.browser.extractions.some(e=>(!condition.key||e.key===condition.key)&&JSON.stringify(e.value).includes(this.variables.resolve(condition.value)));
      case 'tab_count':return this.browser.context.pages().length===condition.count;
      case 'extraction_count':{
        const values=this.browser.extractions.filter(e=>!condition.key||e.key===condition.key).flatMap(e=>Array.isArray(e.value)?e.value:[]);
        const size=new Set(values.map(v=>JSON.stringify(v))).size;
        return size>=condition.min&&(condition.max===undefined||size<=condition.max);
      }
      case 'url_equals':return page.url()===this.variables.resolve(condition.value);
      case 'url_contains':return page.url().includes(this.variables.resolve(condition.value));
      case 'title_changed':return await page.title()!==condition.value;
      case 'text_exists':for(const frame of page.frames())if(await frame.getByText(this.variables.resolve(condition.value),{exact:false}).filter({visible:true}).count()>0)return true;return false;
      case 'text_disappeared':for(const frame of page.frames())if(await frame.getByText(this.variables.resolve(condition.value),{exact:false}).filter({visible:true}).count()>0)return false;return true;
      case 'download_created':return this.browser.downloads.some(d=>!condition.value||d.filename===condition.value);
      case 'network_response':return this.browser.responses.some(r=>r.time>=since&&r.url.includes(condition.value)&&(!condition.status||r.status===condition.status));
      case 'page_changed':return (await this.observer.inspect(page)).hash!==condition.value;
    }
    return false;
  }
  async check(conditions:Condition[],timeoutMs=3000,since=0) {
    const deadline=Date.now()+timeoutMs;
    let failed:Condition[]=[];
    do{
      failed=[];
      for(const condition of conditions){try{if(!await this.one(condition,since))failed.push(condition);}catch{failed.push(condition);}}
      if(!failed.length)return{success:true,failed};
      await this.browser.page.waitForTimeout(60);
    }while(Date.now()<deadline);
    return{success:false,failed};
  }
}
