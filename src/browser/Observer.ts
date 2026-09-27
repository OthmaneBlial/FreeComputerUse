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
      const sources=[el,...el.querySelectorAll('*')],clone=el.cloneNode(true) as Element,copies=[clone,...clone.querySelectorAll('*')],shadowCopies=new Map<Element,Element>();
      for(let index=0;index<sources.length;index++){
        const root=sources[index]!.shadowRoot;if(!root)continue;
        const wrapper=document.createElement('div');wrapper.setAttribute('data-shadow-root','open');copies[index]!.append(wrapper);
        for(const child of root.childNodes)wrapper.append(child.cloneNode(true));
        shadowCopies.set(sources[index]!,wrapper);
        const originals=[...root.querySelectorAll('*')],clones=[...wrapper.querySelectorAll('*')];
        for(let child=0;child<originals.length;child++){sources.push(originals[child]!);copies.push(clones[child]!);}
      }
      const roots:(Document|ShadowRoot)[]=[document];
      for(let index=0;index<roots.length;index++)for(const host of roots[index]!.querySelectorAll('*'))if(host.shadowRoot)roots.push(host.shadowRoot);
      const modal=roots.flatMap(root=>[...root.querySelectorAll('dialog:modal,[role=dialog][aria-modal=true]')]).find(node=>node.getClientRects().length>0),modalVisible=!!modal;
      const [composedParent]=[(node:Element):Element|null=>{const root=node.getRootNode();return node.assignedSlot??node.parentElement??(root instanceof ShadowRoot?root.host:null);}];
      const [composedContains]=[(ancestor:Element,node:Element)=>{for(let parent:Element|null=node;parent;parent=composedParent(parent))if(parent===ancestor)return true;return false;}];
      const [visible]=[(node:Element)=>{
        if(modalVisible&&modal&&!composedContains(modal,node)&&!composedContains(node,modal))return false;
        for(let parent:Element|null=node;parent;parent=composedParent(parent)){if(parent.matches('[hidden],[inert],[aria-hidden="true"]'))return false;const style=getComputedStyle(parent);if(style.display==='none'||style.opacity==='0'||parent===node&&style.visibility!=='visible')return false;}
        return node.getClientRects().length>0;
      }];
      const [structuralOnly]=[(node:Element)=>modalVisible&&!!modal&&!composedContains(modal,node)&&composedContains(node,modal)];
      const visibleSources=sources.map(visible),retained=new Set<Element>();
      for(let index=sources.length-1;index>=0;index--){const node=sources[index]!;if(visibleSources[index]||[...node.children,...(node.shadowRoot?[...node.shadowRoot.children]:[])].some(child=>retained.has(child)))retained.add(node);}
      if(!retained.has(el))return '';
      for(let index=sources.length-1;index>=0;index--){const node=sources[index]!;if(!retained.has(node))copies[index]!.remove();else if(!visibleSources[index]||structuralOnly(node)){for(const child of [...copies[index]!.childNodes])if(child.nodeType===Node.TEXT_NODE)child.remove();const shadowCopy=shadowCopies.get(node);if(shadowCopy)for(const child of [...shadowCopy.childNodes])if(child.nodeType===Node.TEXT_NODE)child.remove();}}
      clone.querySelectorAll('script,style,svg').forEach(node=>node.remove());
      for(const node of [clone,...clone.querySelectorAll('*')]) {
        for(const a of [...node.attributes]) if(!['id','role','name','type','aria-label','aria-labelledby','placeholder','required','disabled','checked','data-testid','data-shadow-root'].includes(a.name)) node.removeAttribute(a.name);
        if(node.matches('textarea'))node.textContent='[local value omitted]';
      }
      return clone.outerHTML.slice(0,8000);
    });
  }
}
