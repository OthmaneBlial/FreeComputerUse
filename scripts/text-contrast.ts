import type {Page} from 'playwright';

export async function assertTextContrast(page:Page,selector:string){
  const samples=await page.locator(selector).evaluate(root=>{
    const samples:{text:string;target:string;color:string;background:string[];opacity:number;fontSize:number;fontWeight:number}[]=[],walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    while(walker.nextNode()){
      const node=walker.currentNode,text=node.nodeValue?.trim(),element=node.parentElement;if(!text||!element||element.closest('[hidden],[aria-hidden="true"],button:disabled'))continue;
      const style=getComputedStyle(element),bounds=element.getBoundingClientRect();if(!bounds.width||!bounds.height||style.visibility==='hidden')continue;
      const background:string[]=[];let opacity=1;for(let parent:Element|null=element;parent;parent=parent.parentElement){background.unshift(getComputedStyle(parent).backgroundColor);opacity*=Number(getComputedStyle(parent).opacity||1);}
      samples.push({text,target:`${element.tagName.toLowerCase()}${[...element.classList].map(name=>`.${name}`).join('')}`,color:style.color,background,opacity,fontSize:parseFloat(style.fontSize),fontWeight:parseInt(style.fontWeight)||400});
    }
    return samples;
  });
  type RGB=[number,number,number];type RGBA=[number,number,number,number];
  const parseColor=(value:string):RGBA|null=>{const match=value.match(/^rgba?\(([^)]+)\)$/);if(!match)return null;const parts=(match[1]??'').split(/[ ,/]+/).filter(Boolean).map(Number);return[Number(parts[0]),Number(parts[1]),Number(parts[2]),parts[3]??1];};
  const blend=(front:RGBA,back:RGB):RGB=>[front[0]*front[3]+back[0]*(1-front[3]),front[1]*front[3]+back[1]*(1-front[3]),front[2]*front[3]+back[2]*(1-front[3])];
  const luminance=(value:RGB)=>{const linear=(channel:number)=>{const normalized=channel/255;return normalized<=.04045?normalized/12.92:((normalized+.055)/1.055)**2.4;};return .2126*linear(value[0])+.7152*linear(value[1])+.0722*linear(value[2]);};
  const failures:{text:string;target:string;color:string;background:string;ratio:number}[]=[];
  for(const sample of samples){
    const foreground=parseColor(sample.color);if(!foreground)continue;let background:RGB=[255,255,255];for(const value of sample.background){const parsed=parseColor(value);if(parsed&&parsed[3]>0)background=blend(parsed,background);}foreground[3]*=sample.opacity;
    const rendered=blend(foreground,background),ratio=(Math.max(luminance(rendered),luminance(background))+.05)/(Math.min(luminance(rendered),luminance(background))+.05),large=sample.fontSize>=24||(sample.fontSize>=18.67&&sample.fontWeight>=700);
    if(ratio<(large?3:4.5))failures.push({text:sample.text.slice(0,40),target:sample.target,color:sample.color,background:`rgb(${background.map(Math.round).join(', ')})`,ratio});
  }
  if(failures.length){
    const groups=new Map<string,{target:string;color:string;background:string;ratio:number;count:number;example:string}>();
    for(const failure of failures){const key=`${failure.target}|${failure.color}|${failure.background}`,group=groups.get(key);if(group)group.count++;else groups.set(key,{...failure,count:1,example:failure.text});}
    throw new Error(`Text contrast below WCAG AA in ${selector}: ${JSON.stringify([...groups.values()])}`);
  }
}
