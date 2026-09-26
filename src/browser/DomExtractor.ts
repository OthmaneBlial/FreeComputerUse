import type { Page } from 'playwright';
import { createHash,randomUUID } from 'node:crypto';
import type { PageState } from './types.js';

export const stateHash = (state: PageState) => createHash('sha256')
  .update(JSON.stringify([state.url,state.title,state.headings,state.text,state.tables,state.dialogs,state.warnings,state.frames,state.truncated,state.elements])).digest('hex').slice(0,20);

async function evaluateWhilePageOpen<T>(page:Page,evaluation:Promise<T>):Promise<T>{
  if(page.isClosed())throw new Error('Browser page closed during DOM inspection');
  let rejectClosed!:(error:Error)=>void;
  const closed=new Promise<never>((_,reject)=>{rejectClosed=reject;});
  const onClose=()=>rejectClosed(new Error('Browser page closed during DOM inspection'));
  page.once('close',onClose);
  try{return await Promise.race([evaluation,closed]);}
  finally{page.off('close',onClose);}
}

export class DomExtractor {
  async extract(page: Page, region?: string): Promise<PageState> {
    const pieces = [];
    const frames = page.frames();
    for (let index = 0; index < frames.length; index++) {
      const frame = frames[index]!;
      try {
        const data = await evaluateWhilePageOpen(page,frame.evaluate(({ index, region,documentId }) => {
          // Array destructuring avoids tsx's named-function helper in browser serialization.
          const [clean] = [(s: string | null | undefined, max = 180) => (s ?? '').replace(/\s+/g,' ').trim().slice(0,max)];
          const modal=document.querySelector('dialog:modal,[role=dialog][aria-modal=true]'),modalVisible=!!modal&&modal.getClientRects().length>0;
          const [visible] = [(el: Element) => {
            if (el.closest('[hidden],[inert],[aria-hidden="true"]')) return false;
            if(modalVisible&&modal&&!modal.contains(el)&&modal!==el)return false;
            let parent:Element|null=el;
            while(parent){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;parent=parent.parentElement;}
            return el.getClientRects().length>0;
          }];
          const [visibleText] = [(el:Element,max=180)=>{
            if(!visible(el))return '';
            const source=[...el.querySelectorAll('*')],hidden=source.map(node=>!visible(node));
            if(!hidden.some(Boolean))return clean((el as HTMLElement).innerText??el.textContent,max);
            const clone=el.cloneNode(true) as Element,copies=[...clone.querySelectorAll('*')];
            for(let index=source.length-1;index>=0;index--)if(hidden[index])copies[index]!.remove();
            return clean(clone.textContent,max);
          }];
          const roots: (Document|ShadowRoot)[] = [document];
          const all: Element[] = [];
          for (let rootIndex = 0; rootIndex < roots.length; rootIndex++) {
            for (const el of roots[rootIndex]!.querySelectorAll('*')) {
              all.push(el);
              if (el.shadowRoot) roots.push(el.shadowRoot);
            }
          }
          const scope = region ? all.find(el => el.id === region || el.getAttribute('aria-label') === region || el.tagName.toLowerCase() === region || el.getAttribute('role') === region) : undefined;
          if (region && !scope) return { elements: [], headings: [], text: '', tables: [], dialogs: [], htmlBytes: 0, truncated: false };
          const [included] = [(el: Element) => !scope || scope === el || scope.contains(el)];
          const global = window as unknown as { __fcuRegistry?: { refs: WeakMap<Element,string>; next: number;documentId:string } };
          const registry = global.__fcuRegistry ??= { refs: new WeakMap(), next: 1,documentId };
          const htmlBytes = new TextEncoder().encode(document.documentElement.outerHTML).length;
          const candidates = all.filter(el => included(el) && visible(el) && el.matches('button,a[href],input:not([type=hidden]),textarea,select,summary,[contenteditable=true],[role=button],[role=link],[role=textbox],[role=checkbox],[role=radio],[role=combobox],[role=menuitem],[role=tab],[role=switch],[role=slider]'));
          const elements = candidates.slice(0,500).map(el => {
            const tag = el.tagName.toLowerCase();
            const input = el as HTMLInputElement;
            const type = el.getAttribute('type') ?? '';
            const implicit = tag === 'button' || ['submit','button','reset'].includes(type) ? 'button'
              : tag === 'a' ? 'link' : tag === 'select' ? 'combobox'
              : type === 'checkbox' ? 'checkbox' : type === 'radio' ? 'radio'
              : type === 'file' ? 'upload' : type === 'number' ? 'spinbutton' : tag === 'summary' ? 'button' : 'textbox';
            const role = el.getAttribute('role') ?? implicit;
            const root=el.getRootNode();
            const labelled=(el.getAttribute('aria-labelledby')??'').split(/\s+/).map(id=>{const label=root instanceof Document?document.getElementById(id):(root as ShadowRoot).getElementById(id);return label?visibleText(label):'';}).join(' ');
            const label = clean(el.getAttribute('aria-label') || labelled || (input.labels ? [...input.labels].map(l=>visibleText(l)).join(' ') : ''));
            const content=['input','textarea','select'].includes(tag)?'':visibleText(el);
            const name = label || clean(['input','textarea','select'].includes(tag) ? el.getAttribute('placeholder') || el.getAttribute('name') || (['submit','button'].includes(type) ? input.value : '') : content);
            let ref = registry.refs.get(el);
            if (!ref) { ref = `f${index}d${registry.documentId}e${registry.next++}`; registry.refs.set(el,ref); }
            el.setAttribute('data-fcu-ref',ref);
            const parts: string[] = [];
            let parent: Element | null = el;
            while (parent && parts.length < 9) {
              const siblings: Element[] = parent.parentElement ? [...parent.parentElement.children].filter(s => s.tagName === parent!.tagName) : [];
              parts.unshift(`${parent.tagName.toLowerCase()}${siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(parent)+1})` : ''}`);
              parent = parent.parentElement;
            }
            const errors = (el.getAttribute('aria-errormessage') || el.getAttribute('aria-describedby') || '').split(/\s+/).map(id=>{const error=document.getElementById(id);return error?visibleText(error):'';}).join(' ');
            const form = input.form;
            const section = el.closest('form,dialog,[role=dialog],nav,main,section');
            return {
              ref,tag,role,name,label: label || undefined,type: type || undefined,
              required: input.required || el.getAttribute('aria-required') === 'true',
              disabled: input.disabled || el.getAttribute('aria-disabled') === 'true',
              hasValue: ['input','textarea','select'].includes(tag) ? !!input.value : undefined,
              checked: ['checkbox','radio'].includes(type) ? input.checked : undefined,
              options: tag === 'select' ? [...(el as HTMLSelectElement).options].slice(0,40).map(o=>clean(o.text)) : undefined,
              error: clean(errors || (input.validity && !input.validity.valid && input.value ? input.validationMessage : '')) || undefined,
              form: form ? clean(form.getAttribute('aria-label') || form.id || 'form') : undefined,
              frame:index, region:section ? clean(section.getAttribute('aria-label') || section.id || section.tagName.toLowerCase()) : undefined,
              href: tag === 'a' ? (el as HTMLAnchorElement).href : undefined,
              path:parts.join(' > '), selectors: {
                role: role === 'upload' ? undefined : role, name: name || undefined,
                label:label || undefined, placeholder:el.getAttribute('placeholder') || undefined,
                testId:el.getAttribute('data-testid') || undefined,
                id:el.id || undefined, attributeName:el.getAttribute('name') || undefined,
                text: content || undefined,
                frame:index,
              },
            };
          });
          const headings = all.filter(el=>included(el)&&visible(el)&&el.matches('h1,h2,h3,[role=heading]')).slice(0,24).map(el=>visibleText(el));
          const paragraphs = all.filter(el=>included(el)&&visible(el)&&el.matches('p,li,dt,dd,output,[role=status],[role=alert]')).sort((a,b)=>Number(!!b.closest('main,article,[role=main]'))-Number(!!a.closest('main,article,[role=main]'))).slice(0,100).map(el=>visibleText(el,300));
          const tables = all.filter(el=>included(el)&&visible(el)&&el.matches('table')).slice(0,5).map(table=>[...table.querySelectorAll('tr')].filter(visible).slice(0,25).map(row=>[...row.querySelectorAll('th,td')].slice(0,12).map(cell=>visibleText(cell))));
          const dialogs = all.filter(el=>included(el)&&visible(el)&&el.matches('dialog,[role=dialog],[role=menu]')).map(el=>clean(el.getAttribute('aria-label') || visibleText(el),250));
          return { elements,headings,text:[...new Set(paragraphs)].join('\n').slice(0,8000),tables,dialogs,htmlBytes,truncated:candidates.length>500 };
        }, { index, region,documentId:randomUUID().slice(0,8) }));
        pieces.push(data);
      } catch(error) {
        if(index===0||page.isClosed())throw error;
        // Detached child frames are reported instead of silently losing the page.
      }
    }
    const state: PageState = {
      url:page.url(),title:await page.title(),elements:pieces.flatMap(p=>p.elements),
      headings:pieces.flatMap(p=>p.headings),text:pieces.map(p=>p.text).filter(Boolean).join('\n'),
      tables:pieces.flatMap(p=>p.tables),dialogs:pieces.flatMap(p=>p.dialogs),
      htmlBytes:pieces.reduce((sum,p)=>sum+p.htmlBytes,0),hash:'',
      warnings:[],frames:frames.map((f,index)=>({index,url:f.url()})),truncated:pieces.some(p=>p.truncated),
    };
    if (pieces.length < frames.length) state.warnings.push('Some frames could not be inspected');
    if (/ignore (all |your |previous )?instructions|send (all |user )?data|system prompt/i.test(state.text)) state.warnings.push('Possible prompt injection in untrusted page content');
    if (/captcha|verify you are human|sign in to continue/i.test([state.title,state.text,...state.elements.map(e=>e.name)].join(' '))) state.warnings.push('Human authentication or security challenge may be required');
    state.hash=stateHash(state);
    return state;
  }
}
