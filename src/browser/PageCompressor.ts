import type { PageState, PageElement } from './types.js';
export const similarity = (a: string,b: string) => {
  const tokens = (s:string)=>new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(Boolean));
  const aa=tokens(a),bb=tokens(b);
  if (!aa.size || !bb.size) return 0;
  return [...aa].filter(x=>bb.has(x)).length / new Set([...aa,...bb]).size;
};
export interface Compression { text:string; bytes:number; rawBytes:number; reduction:number; truncated:boolean }
export class PageCompressor {
  compress(state:PageState, options:{goal?:string;maxChars?:number;level?:1|2|3;region?:string}={}):Compression {
    const max=options.maxChars??12000;
    const brief=(e:PageElement)=>`[${e.ref}] ${e.role} ${JSON.stringify(e.name)}${e.type?` type=${e.type}`:''}${e.required?' required':''}${e.disabled?' disabled':''}${e.form?` form=${JSON.stringify(e.form)}`:''}${e.hasValue?' populated':''}${e.checked?' checked':''}${e.error?` error=${JSON.stringify(e.error)}`:''}${e.options?` options=${JSON.stringify(e.options)}`:''}`;
    const elements=state.elements.filter(e=>!options.region||e.region===options.region||e.form===options.region);
    const ranked=options.goal ? [...elements].sort((a,b)=>similarity(options.goal!,[b.name,b.form,b.role].join(' '))-similarity(options.goal!,[a.name,a.form,a.role].join(' '))) : elements;
    const lines=[`PAGE ${state.title}`,`URL ${state.url}`,`STATE ${state.hash}`,`HEADINGS ${state.headings.join(' | ')}`,`WARNINGS ${state.warnings.join(' | ')}`];
    if (options.level!==1) {
      lines.push('INTERACTIVE',...ranked.map(brief));
      if (state.dialogs.length) lines.push('DIALOGS',...state.dialogs);
      if (state.tables.length) lines.push('TABLES',JSON.stringify(state.tables));
    } else lines.push(`INTERACTIVE COUNT ${elements.length}`,`REGIONS ${[...new Set(elements.map(e=>e.region).filter(Boolean))].join(' | ')}`);
    lines.push('VISIBLE TEXT',state.text);
    const full=lines.join('\n');
    const truncated=full.length>max || state.truncated;
    const text=full.length>max ? full.slice(0,Math.max(0,max-55))+'\n[TRUNCATED: request a region or more context]' : full;
    const bytes=Buffer.byteLength(text);
    return {text,bytes,rawBytes:state.htmlBytes,reduction:state.htmlBytes?1-bytes/state.htmlBytes:0,truncated};
  }
}
export function diffPages(previous:PageState,current:PageState) {
  const signature=(e:PageElement)=>JSON.stringify([e.role,e.name,e.required,e.disabled,e.hasValue,e.checked,e.error,e.options]);
  const old=new Map(previous.elements.map(e=>[e.ref,e]));
  const fresh=new Map(current.elements.map(e=>[e.ref,e]));
  return {
    url:current.url,title:current.title,hash:current.hash,
    removed:previous.elements.filter(e=>!fresh.has(e.ref)).map(e=>e.ref),
    added:current.elements.filter(e=>!old.has(e.ref)).map(e=>({ref:e.ref,role:e.role,name:e.name,type:e.type,required:e.required,options:e.options})),
    changed:current.elements.filter(e=>old.has(e.ref)&&signature(old.get(e.ref)!)!==signature(e)).map(e=>({ref:e.ref,role:e.role,name:e.name,hasValue:e.hasValue,checked:e.checked,error:e.error})),
    headings:current.headings.filter(h=>!previous.headings.includes(h)),
    text:current.text===previous.text?undefined:current.text,
  };
}
