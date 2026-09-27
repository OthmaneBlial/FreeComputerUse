import type { Page } from 'playwright';
import { DomExtractor } from './DomExtractor.js';
import { SelectorEngine } from './SelectorEngine.js';
import { PageCompressor } from './PageCompressor.js';
export class Observer {
  readonly extractor=new DomExtractor();
  readonly selectors=new SelectorEngine();
  readonly compressor=new PageCompressor();
  async inspect(page:Page,region?:string) {
    const state=await this.extractor.extract(page,region);
    this.selectors.remember(state.elements);
    return state;
  }
  async accessibility(page:Page,region?:string) {
    return (await (region?page.locator(region):page.locator('body')).ariaSnapshot()).split('\n').map(line=>{
      if(/^\s*-\s*option\b/.test(line))return line.replace(/^(\s*-\s*option\s+)"(?:\\.|[^"])*"(\s+\[selected\].*)$/,'$1"[selected value omitted]"$2');
      if(!/^\s*-\s*(textbox|searchbox|combobox|spinbutton|slider)\b/.test(line))return line;
      let quoted=false,escaped=false;
      for(let index=0;index<line.length;index++){
        const char=line[index]!;
        if(escaped){escaped=false;continue;}
        if(char==='\\'&&quoted){escaped=true;continue;}
        if(char==='"'){quoted=!quoted;continue;}
        if(char===':'&&!quoted)return `${line.slice(0,index+1)} [current value omitted]`;
      }
      return line.replace(/\[value=[^\]]*\]/g,'[value omitted]');
    }).join('\n').slice(0,10000);
  }
  async fragment(page:Page,selector:string) {
    return page.locator(selector).evaluate(el=>{
      const sources=[el,...el.querySelectorAll('*')],clone=el.cloneNode(true) as Element,copies=[clone,...clone.querySelectorAll('*')];
      const modal=document.querySelector('dialog:modal,[role=dialog][aria-modal=true]'),modalVisible=!!modal&&modal.getClientRects().length>0;
      const [visible]=[(node:Element)=>{
        if(node.closest('[hidden],[inert],[aria-hidden="true"]'))return false;
        if(modalVisible&&modal&&!modal.contains(node)&&modal!==node&&!node.contains(modal))return false;
        for(let parent:Element|null=node;parent;parent=parent.parentElement){const style=getComputedStyle(parent);if(style.display==='none'||style.visibility==='hidden'||style.opacity==='0')return false;}
        return node.getClientRects().length>0;
      }];
      if(!visible(el))return '';
      for(let index=sources.length-1;index>0;index--)if(!visible(sources[index]!))copies[index]!.remove();
      clone.querySelectorAll('script,style,svg').forEach(node=>node.remove());
      for(const node of [clone,...clone.querySelectorAll('*')]) {
        for(const a of [...node.attributes]) if(!['id','role','name','type','aria-label','aria-labelledby','placeholder','required','disabled','checked','data-testid'].includes(a.name)) node.removeAttribute(a.name);
        if(node.matches('textarea'))node.textContent='[local value omitted]';
      }
      return clone.outerHTML.slice(0,8000);
    });
  }
}
