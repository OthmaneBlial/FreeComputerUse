import type { PageState, PageElement } from './types.js';
export const similarity = (a: string,b: string) => {
  const tokens = (s:string)=>new Set(s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu,' ').split(' ').filter(word=>word&&!['the','this','a','and','of','to','in','on','for','with','my','using','from','at','an','then','is','it','me'].includes(word)));
  const aa=tokens(a),bb=tokens(b);
  if (!aa.size || !bb.size) return 0;
  return [...aa].filter(x=>bb.has(x)).length / new Set([...aa,...bb]).size;
};
export interface Compression { text:string; bytes:number; rawBytes:number; reduction:number; truncated:boolean }
export class PageCompressor {
  compress(state:PageState, options:{goal?:string;maxChars?:number;level?:1|2|3;region?:string}={}):Compression {
    const requestedMax=options.maxChars??12000,max=Number.isFinite(requestedMax)?Math.max(0,Math.floor(requestedMax)):12000;
    let metadataTruncated=false;
    const bounded=(value:string,limit:number)=>{
      if(value.length<=limit)return value;
      metadataTruncated=true;return `${value.slice(0,Math.max(0,limit-1))}…`;
    };
    const brief=(e:PageElement)=>`[${e.ref}] ${e.role} ${JSON.stringify(e.name)}${e.href?` href=${JSON.stringify(e.href)}`:''}${e.selectors.id?` id=${JSON.stringify(e.selectors.id)}`:''}${e.type?` type=${e.type}`:''}${e.required?' required':''}${e.disabled?' disabled':''}${e.form?` form=${JSON.stringify(e.form)}`:''}${e.hasValue?' populated':''}${e.checked?' checked':''}${e.error?` error=${JSON.stringify(e.error)}`:''}${e.options?` options=${JSON.stringify(e.options)}`:''}`;
    const elements=state.elements.filter(e=>!options.region||e.region===options.region||e.form===options.region);
    const goal=options.goal;
    const ranked=goal ? elements.map((element,index)=>({element,index,score:similarity(goal,[element.name,element.form,element.role].join(' '))}))
      .sort((a,b)=>b.score-a.score||a.index-b.index).map(item=>item.element) : elements;
    const lines=[`PAGE ${bounded(state.title,Math.min(160,Math.floor(max*.08)))}`,`URL ${bounded(state.url,Math.min(400,Math.floor(max*.1)))}`,`STATE ${state.hash}`,`HEADINGS ${bounded(state.headings.join(' | '),Math.floor(max*.12))}`,`WARNINGS ${bounded(state.warnings.join(' | '),Math.floor(max*.05))}`];
    if(state.truncated)lines.push('[DOM control list truncated; additional controls may be missing]');
    if (options.level!==1) {
      // Reserve space for document data even when navigation contains hundreds
      // of links. Reading tasks must not lose all facts behind the nav list.
      const controlBudget=Math.max(300,Math.floor(max*.45));let used=0,retained=0;
      lines.push('INTERACTIVE');
      for(const element of ranked){const line=brief(element);if(used+line.length+1>controlBudget)continue;lines.push(line);used+=line.length+1;retained++;}
      if(retained<ranked.length)lines.push(`[${ranked.length-retained} controls omitted]`);
      if(state.dialogs.length)lines.push('DIALOGS',...state.dialogs);
      if(state.tables.length){
        const tableBudget=Math.floor(max*.2),tables=state.tables.map(table=>table.slice());let tableText=JSON.stringify(tables),partial=false;
        // ponytail: Re-serialize at most 125 extracted rows; stream rows if the extractor limit grows.
        while(tableText.length>tableBudget){const last=[...tables].reverse().find(table=>table.length>1);if(!last)break;last.pop();partial=true;tableText=JSON.stringify(tables);}
        if(tableText.length>tableBudget){tableText='[]';partial=true;}
        if(partial)metadataTruncated=true;
        lines.push(partial?'TABLES [partial; trailing rows omitted]':'TABLES',tableText);
      }
    } else lines.push(`INTERACTIVE COUNT ${elements.length}`,`REGIONS ${[...new Set(elements.map(e=>e.region).filter(Boolean))].join(' | ')}`);
    lines.push('VISIBLE TEXT',state.text);
    const full=lines.join('\n');
    const truncated=full.length>max || state.truncated || metadataTruncated;
    const marker='\n[TRUNCATED: request a region or more context]';
    const text=full.length>max ? `${full.slice(0,Math.max(0,max-marker.length))}${marker}`.slice(0,max) : full;
    const bytes=Buffer.byteLength(text);
    return {text,bytes,rawBytes:state.htmlBytes,reduction:state.htmlBytes?1-bytes/state.htmlBytes:0,truncated};
  }
}
export function diffPages(previous:PageState,current:PageState) {
  const signature=(e:PageElement)=>JSON.stringify(e);
  const withoutOptionValues=(element:PageElement)=>{const safe={...element};delete safe.optionValues;return safe;};
  const old=new Map(previous.elements.map(e=>[e.ref,e]));
  const fresh=new Map(current.elements.map(e=>[e.ref,e]));
  return {
    url:current.url,title:current.title,hash:current.hash,
    removed:previous.elements.filter(e=>!fresh.has(e.ref)).map(e=>e.ref),
    added:current.elements.filter(e=>!old.has(e.ref)).map(withoutOptionValues),
    changed:current.elements.filter(e=>old.has(e.ref)&&signature(old.get(e.ref)!)!==signature(e)).map(withoutOptionValues),
    headings:JSON.stringify(current.headings)===JSON.stringify(previous.headings)?undefined:current.headings,
    text:current.text===previous.text?undefined:current.text,
    tables:JSON.stringify(current.tables)===JSON.stringify(previous.tables)?undefined:current.tables,
    dialogs:JSON.stringify(current.dialogs)===JSON.stringify(previous.dialogs)?undefined:current.dialogs,
    warnings:current.warnings,frames:JSON.stringify(current.frames)===JSON.stringify(previous.frames)?undefined:current.frames,truncated:current.truncated,
  };
}
