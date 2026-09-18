import type { Condition } from '../actions/schema.js';
import type { Browser } from '../browser/Browser.js';
import type { Observer } from '../browser/Observer.js';
import type { VariableResolver } from '../profile/VariableResolver.js';
export class Verifier {
  constructor(readonly browser:Browser,readonly observer:Observer,readonly variables:VariableResolver) {}
  async one(condition:Condition,since=0):Promise<boolean> {
    const page=this.browser.page;
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
        case 'form_submitted':return await locator.evaluate(el=>el.getAttribute('data-fcu-submitted')==='true') && this.browser.responses.some(r=>r.time>=since&&r.status>=200&&r.status<400);
      }
    }
    switch(condition.type){
      case 'url_equals':return page.url()===this.variables.resolve(condition.value);
      case 'url_contains':return page.url().includes(this.variables.resolve(condition.value));
      case 'title_changed':return await page.title()!==condition.value;
      case 'text_exists':return await page.getByText(this.variables.resolve(condition.value),{exact:false}).filter({visible:true}).count()>0;
      case 'text_disappeared':return await page.getByText(this.variables.resolve(condition.value),{exact:false}).filter({visible:true}).count()===0;
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
