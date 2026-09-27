import type { Action } from './schema.js';
import type { Locator } from 'playwright';
export type ConfirmationPolicy='sensitive'|'always'|'never';
export async function sensitiveReason(action:Action,locator?:Locator):Promise<string|undefined> {
  if(action.sensitive||action.type==='submit')return 'Explicit submission or sensitive action';
  const fieldEntry=['fill','type','select'].includes(action.type);
  if((!fieldEntry&&!['click','doubleClick','press','check','uncheck'].includes(action.type))||!locator)return;
  const facts=await locator.evaluate(el=>{
    const input=el as HTMLInputElement,autocomplete=el.getAttribute('autocomplete')??'';
    const labels=[...(input.labels??[])].map(label=>label.textContent??'');
    const referenced=(el.getAttribute('aria-labelledby')??'').split(/\s+/).map(id=>document.getElementById(id)?.textContent??'');
    const hint=[autocomplete,el.getAttribute('name'),el.id,el.getAttribute('placeholder'),el.getAttribute('aria-label'),el.getAttribute('title'),...labels,...referenced]
      .join(' ').replace(/([a-z])([A-Z])/g,'$1 $2').toLowerCase().replace(/[^a-z0-9]+/g,' ');
    return {
      text:(el.getAttribute('aria-label')||el.textContent||el.getAttribute('value')||'').trim(),
      type:el.getAttribute('type'),tag:el.tagName.toLowerCase(),
      sensitiveField:el.getAttribute('type')?.toLowerCase()==='password'||autocomplete.toLowerCase().split(/\s+/).some(token=>token.startsWith('cc-')||['current-password','new-password','one-time-code'].includes(token))||
        /\b(password|passwd|passcode|pin|otp|cvv|cvc|csc|card number|credit card|debit card|cardholder|one time code|verification code|security code|auth code|expiration|expiry)\b/.test(hint),
      submit:!!input.form && (el.tagName==='BUTTON' ? el.getAttribute('type')!=='button' : el.getAttribute('type')==='submit'),
    };
  });
  if((fieldEntry||action.type==='press')&&facts.sensitiveField)return 'Sensitive field entry';
  if(/\b(submit|purchase|buy|pay|checkout|delete|remove|send|confirm|transfer|publish|unsubscribe|register|create account|accept terms)\b/i.test(facts.text))return `Potentially irreversible control: ${facts.text.slice(0,80)}`;
  if(action.type==='press'&&action.value==='Enter'&&facts.type!=='search')return 'Enter may submit a form';
  if(facts.submit&&!/\b(search|find flights|find tickets|filter|continue|next|review|apply|sign in|log in)\b/i.test(facts.text))return 'Form submission';
}
