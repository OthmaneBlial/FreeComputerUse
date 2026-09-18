import type { Action } from './schema.js';
import type { Locator } from 'playwright';
export type ConfirmationPolicy='sensitive'|'always'|'never';
export async function sensitiveReason(action:Action,locator?:Locator):Promise<string|undefined> {
  if(action.sensitive||action.type==='submit')return 'Explicit submission or sensitive action';
  if(!['click','doubleClick','press','check','uncheck'].includes(action.type)||!locator)return;
  const facts=await locator.evaluate(el=>({
    text:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('value')||'').trim(),
    type:el.getAttribute('type'),tag:el.tagName.toLowerCase(),
    submit:!!(el as HTMLInputElement).form && (el.tagName==='BUTTON' ? el.getAttribute('type')!=='button' : el.getAttribute('type')==='submit'),
  }));
  if(/\b(submit|purchase|buy|pay|checkout|delete|remove|send|confirm|transfer|publish|unsubscribe|register|create account|accept terms)\b/i.test(facts.text))return `Potentially irreversible control: ${facts.text.slice(0,80)}`;
  if(action.type==='press'&&action.value==='Enter'&&facts.type!=='search')return 'Enter may submit a form';
  if(facts.submit&&!/\b(search|find flights|find tickets|filter|continue|next|review|apply|sign in|log in)\b/i.test(facts.text))return 'Form submission';
}
