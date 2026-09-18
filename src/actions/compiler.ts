import type { Locator } from 'playwright';
import { ActionSchema,type Action } from './schema.js';
export class ActionCompiler {
  async normalize(action:Action,locator?:Locator):Promise<Action>{
    if(action.type==='click'&&locator){
      const download=await locator.evaluate(el=>el.matches('a[download]')?el.getAttribute('download'):null);
      if(download!==null)return ActionSchema.parse({...action,type:'download',filename:download||undefined});
    }
    // The DOM, not a model's guessed control kind, determines the operation.
    if(action.type==='fill'&&locator&&await locator.evaluate(el=>el.tagName==='SELECT')){
      return ActionSchema.parse({...action,type:'select'});
    }
    return action;
  }
}
