import type { Locator } from 'playwright';
import { ActionSchema,type Action } from './schema.js';
export class ActionCompiler {
  async normalize(action:Action,locator?:Locator):Promise<Action>{
    // The DOM, not a model's guessed control kind, determines the operation.
    if(action.type==='fill'&&locator&&await locator.evaluate(el=>el.tagName==='SELECT')){
      return ActionSchema.parse({...action,type:'select'});
    }
    return action;
  }
}
