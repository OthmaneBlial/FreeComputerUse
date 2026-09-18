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
    return (await (region?page.locator(region):page.locator('body')).ariaSnapshot()).slice(0,10000);
  }
  async fragment(page:Page,selector:string) {
    return page.locator(selector).evaluate(el=>{
      const clone=el.cloneNode(true) as Element;
      clone.querySelectorAll('script,style,svg').forEach(node=>node.remove());
      for(const node of [clone,...clone.querySelectorAll('*')]) {
        for(const a of [...node.attributes]) if(a.name.startsWith('on')||a.name==='style'||a.name==='value') node.removeAttribute(a.name);
        if(node.matches('textarea'))node.textContent='[local value omitted]';
      }
      return clone.outerHTML.slice(0,8000);
    });
  }
}
