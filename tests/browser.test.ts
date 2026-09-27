import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser/Browser.js';
import { Observer } from '../src/browser/Observer.js';
import { diffPages, PageCompressor, similarity } from '../src/browser/PageCompressor.js';
import { DomExtractor,stateHash } from '../src/browser/DomExtractor.js';
import { ActionSchema, ConditionSchema, PlanSchema } from '../src/actions/schema.js';

test('rejects unsupported system browser channels before launch',async()=>{
  const previous=process.env.FCU_BROWSER_CHANNEL;process.env.FCU_BROWSER_CHANNEL='not-a-browser';
  try{await assert.rejects(new Browser().launch(),/FCU_BROWSER_CHANNEL must be one of/);}
  finally{if(previous===undefined)delete process.env.FCU_BROWSER_CHANNEL;else process.env.FCU_BROWSER_CHANNEL=previous;}
});

test('real Chromium extracts visible controls, frames, shadow DOM and stable refs', async () => {
  const browser=await new Browser().launch();
  try {
    await browser.page.setContent(`<h1>Application</h1><style>${'/* decoration */'.repeat(2000)}</style><form id="application"><label for="email">Email</label><input id="email" name="email" required><label for="country">Country</label><select id="country"><option>France</option><option>Germany</option></select><button>Continue</button></form><button hidden>Hidden</button><div aria-hidden="true"><button>Tracking</button></div><iframe srcdoc='<button>Frame action</button>'></iframe><div id="shadow"></div><table><tr><th>Price</th></tr><tr><td>12</td></tr></table>`);
    await browser.page.locator('#shadow').evaluate(el=>{el.attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button><label for="postal">Postal code</label><input id="postal" aria-describedby="postal-error"><span id="postal-error">Postal code is invalid</span>';});
    const observer=new Observer();const first=await observer.inspect(browser.page);
    assert.deepEqual(first.headings,['Application']);
    assert(first.elements.some(e=>e.name==='Shadow action'));
    assert.equal(first.elements.find(e=>e.name==='Postal code')?.error,'Postal code is invalid');
    assert(first.elements.some(e=>e.name==='Frame action'&&e.frame===1));
    assert(!first.elements.some(e=>e.name==='Hidden'||e.name==='Tracking'));
    assert.equal(first.elements.find(e=>e.name==='Email')?.required,true);
    assert.deepEqual(first.elements.find(e=>e.name==='Country')?.options,['France','Germany']);
    const email=first.elements.find(e=>e.name==='Email')!;
    const selected=await observer.selectors.resolve(browser.page,email.ref);
    assert.equal(selected.strategy,'role');await selected.locator.fill('local@example.com');
    const second=await observer.inspect(browser.page);
    assert.equal(second.elements.find(e=>e.name==='Email')?.ref,email.ref);
    assert(second.elements.find(e=>e.name==='Email')?.hasValue);
    assert(!JSON.stringify(second).includes('local@example.com'));
    assert.notEqual(first.hash,second.hash);
    assert.equal(stateHash(second),second.hash);
    assert.equal(diffPages(first,second).changed.length,1);
    const compressed=observer.compressor.compress(second);
    assert(compressed.reduction>.90);
    assert(!compressed.text.includes('decoration'));
    const small=observer.compressor.compress(second,{maxChars:300});
    assert(small.text.length<=300);assert(small.truncated);
    const region=await observer.inspect(browser.page,'application');
    assert.equal(region.elements.length,3);
  }finally{await browser.close();}
});

test('DOM byte accounting includes nested open shadow roots',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<div id="host"></div>');
    const extractor=new DomExtractor(),before=await extractor.extract(browser.page);
    const outer='<section><div id="nested"></div></section>',inner='<p>Shadow content 🌐</p>';
    await browser.page.locator('#host').evaluate((host,{outer,inner})=>{
      const root=host.attachShadow({mode:'open'});root.innerHTML=outer;
      root.querySelector('#nested')!.attachShadow({mode:'open'}).innerHTML=inner;
    },{outer,inner});
    const after=await extractor.extract(browser.page);
    assert.equal(after.htmlBytes,before.htmlBytes+new TextEncoder().encode(outer).length+new TextEncoder().encode(inner).length);
  }finally{await browser.close();}
});

test('shadow DOM respects hidden hosts and visible modal ancestry',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button>Background action</button><div id="aria-hidden" aria-hidden="true"></div><div id="inert" inert></div><dialog id="light-modal"><div id="modal-content"></div></dialog><div id="shadow-modal"></div>');
    for(const [id,content] of [['aria-hidden','<button>Hidden aria action</button><p>Hidden aria secret</p>'],['inert','<button>Hidden inert action</button><p>Hidden inert secret</p>'],['modal-content','<button>Visible modal action</button>']] as const)
      await browser.page.locator(`#${id}`).evaluate((host,html)=>{host.attachShadow({mode:'open'}).innerHTML=html;},content);
    await browser.page.locator('#shadow-modal').evaluate(host=>{
      const root=host.attachShadow({mode:'open'});root.innerHTML='<dialog><div id="nested-content"></div></dialog>';
      root.querySelector('#nested-content')!.attachShadow({mode:'open'}).innerHTML='<button>Visible shadow modal action</button>';
    });
    const observer=new Observer(),hidden=await observer.inspect(browser.page),hiddenNames=hidden.elements.map(element=>element.name).join(' ');
    assert(!hiddenNames.includes('Hidden aria action'));assert(!hidden.text.includes('Hidden aria secret'));
    assert(!hiddenNames.includes('Hidden inert action'));assert(!hidden.text.includes('Hidden inert secret'));
    await browser.page.locator('#light-modal').evaluate(dialog=>(dialog as HTMLDialogElement).showModal());
    const visible=await observer.inspect(browser.page),visibleNames=visible.elements.map(element=>element.name).join(' ');
    assert(visibleNames.includes('Visible modal action'));
    await browser.page.locator('#light-modal').evaluate(dialog=>(dialog as HTMLDialogElement).close());
    await browser.page.locator('#shadow-modal').evaluate(host=>(host.shadowRoot!.querySelector('dialog') as HTMLDialogElement).showModal());
    const shadowModal=await observer.inspect(browser.page),shadowModalNames=shadowModal.elements.map(element=>element.name).join(' ');
    assert(!shadowModalNames.includes('Background action'));assert(shadowModalNames.includes('Visible shadow modal action'));
  }finally{await browser.close();}
});

test('region inspection follows composed shadow ancestry',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<main><div id="inside"></div></main><aside><div id="outside"></div></aside>');
    await browser.page.locator('#inside').evaluate(host=>{host.attachShadow({mode:'open'}).innerHTML='<button>Inside region</button>';});
    await browser.page.locator('#outside').evaluate(host=>{host.attachShadow({mode:'open'}).innerHTML='<button>Outside region</button>';});
    const state=await new Observer().inspect(browser.page,'main'),names=state.elements.map(element=>element.name);
    assert(names.includes('Inside region'));assert(!names.includes('Outside region'));
  }finally{await browser.close();}
});

test('accessibility snapshots retain labels but omit current form values',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<p>Public page context</p><label for="password">Password</label><input id="password" type="password"><label for="card">Card number</label><input id="card" autocomplete="cc-number"><label for="notes">Notes</label><textarea id="notes"></textarea><label for="country">Country</label><select id="country"><option value="secret-country">Private country</option></select>');
    await browser.page.locator('#password').fill('synthetic-password-123');
    await browser.page.locator('#card').fill('4111111111111111');
    await browser.page.locator('#notes').fill('private line one\nprivate line two');
    const snapshot=await new Observer().accessibility(browser.page);
    for(const label of ['Password','Card number','Notes','Country','Public page context'])assert(snapshot.includes(label),`Missing accessible context: ${label}`);
    for(const value of ['synthetic-password-123','4111111111111111','private line one','private line two','Private country','secret-country'])assert(!snapshot.includes(value),`Leaked form value: ${value}`);
    assert(snapshot.includes('[current value omitted]'));assert(snapshot.includes('[selected value omitted]'));
  }finally{await browser.close();}
});

test('state hash changes when observed headings, dialog labels, options or links change',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<!doctype html><html><head><base href="https://example.test/"></head><body><h1>Before</h1><select id="country"><option>France</option><option>Germany</option></select><a href="/before">Details</a><div role="dialog" aria-label="Before dialog">Dialog</div></body></html>');
    const observer=new Observer();let previous=await observer.inspect(browser.page);
    await browser.page.locator('h1').evaluate(el=>el.textContent='After');
    let current=await observer.inspect(browser.page);assert.notEqual(current.hash,previous.hash);previous=current;
    await browser.page.locator('[role=dialog]').evaluate(el=>el.setAttribute('aria-label','After dialog'));
    current=await observer.inspect(browser.page);assert.notEqual(current.hash,previous.hash);previous=current;
    await browser.page.locator('#country').evaluate(el=>el.append(new Option('Spain','es')));
    current=await observer.inspect(browser.page);assert.notEqual(current.hash,previous.hash);previous=current;
    await browser.page.locator('a').evaluate(el=>el.setAttribute('href','/after'));
    current=await observer.inspect(browser.page);assert.notEqual(current.hash,previous.hash);
    assert.equal(diffPages(previous,current).changed[0]?.href,'https://example.test/after');
  }finally{await browser.close();}
});

test('page observation excludes visually hidden descendant text',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<h1>Visible heading <span style="display:none">hidden-heading-secret</span></h1><p>Visible text <span hidden>hidden-paragraph-injection</span><span style="opacity:0"><b>hidden-opacity-secret</b></span><span aria-hidden="true">hidden-aria-secret</span><span style="visibility:collapse">hidden-collapse-secret</span></p><button data-testid="collapsed" style="visibility:collapse">Collapsed action</button><div style="visibility:hidden">inherited-hidden-secret<button style="visibility:visible">Visible override action</button><p style="visibility:visible">Visible override text</p><span>Inherited hidden descendant</span></div><table><tr><td>Public cell</td><td style="display:none">hidden-table-secret</td></tr></table><div role="dialog"><span style="display:none">hidden-dialog-secret</span>Visible dialog</div><a href="/safe"><span style="display:none">hidden-link-injection</span>Public link</a>');
    const observer=new Observer(),state=await observer.inspect(browser.page);
    const observed=JSON.stringify({headings:state.headings,text:state.text,tables:state.tables,dialogs:state.dialogs,names:state.elements.map(element=>element.name)});
    assert(!observed.includes('hidden-'));assert(!observed.includes('Inherited hidden descendant'));assert(!state.elements.some(element=>element.selectors.testId==='collapsed'));assert(observed.includes('Visible heading'));assert(observed.includes('Visible text'));assert(observed.includes('Visible override action'));assert(observed.includes('Visible override text'));assert(observed.includes('Public cell'));assert(observed.includes('Visible dialog'));assert(observed.includes('Public link'));
    const fragment=await observer.fragment(browser.page,'body');
    assert(!fragment.includes('hidden-'));assert(!fragment.includes('data-testid="collapsed"'));assert(!fragment.includes('inherited-hidden-secret'));assert(!fragment.includes('Inherited hidden descendant'));assert(fragment.includes('Visible override action'));assert(fragment.includes('Visible override text'));
  }finally{await browser.close();}
});

test('assigned slot visibility filters page state and repair fragments',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<main><div id="host"><p id="slot-secret" slot="hidden">Slotted private text</p><button slot="hidden">Slotted private action</button><p slot="visible">Slotted public text</p></div></main>');
    await browser.page.locator('#host').evaluate(host=>{host.attachShadow({mode:'open'}).innerHTML='<section aria-hidden="true"><slot name="hidden"></slot></section><slot name="visible"></slot>';});
    const observer=new Observer(),state=await observer.inspect(browser.page),observed=JSON.stringify(state);
    assert(!observed.includes('Slotted private'));assert(observed.includes('Slotted public text'));
    assert.equal(await observer.fragment(browser.page,'#slot-secret'),'');
  }finally{await browser.close();}
});

test('repair HTML fragments honor shadow visibility and modal boundaries',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('Background body text<button>Background instructions</button><div id="shell">Background wrapper text<div id="modal-host"></div></div><div id="hidden-host" aria-hidden="true"></div>');
    await browser.page.locator('#modal-host').evaluate(host=>{host.attachShadow({mode:'open'}).innerHTML='<div role="dialog" aria-modal="true"><p>Visible modal</p></div>';});
    await browser.page.locator('#hidden-host').evaluate(host=>{host.attachShadow({mode:'open'}).innerHTML='<form id="private-form"><p>Hidden repair instructions</p></form>';});
    const observer=new Observer(),background=await observer.fragment(browser.page,'body');
    assert.doesNotMatch(background,/Background instructions/);
    assert.doesNotMatch(background,/Background body text|Background wrapper text/);
    assert.equal(await observer.fragment(browser.page,'#private-form'),'');
  }finally{await browser.close();}
});

test('ranked selector survives replacement and rejects ambiguous duplicate buttons',async()=>{
  const browser=await new Browser().launch();
  try {
    await browser.page.setContent('<button data-testid="next">Continue</button><button>Duplicate</button><button>Duplicate</button>');
    const observer=new Observer();const state=await observer.inspect(browser.page);
    const next=state.elements.find(e=>e.name==='Continue')!;
    await browser.page.locator('[data-testid=next]').evaluate(el=>{el.outerHTML='<button data-testid="next">Next step</button>';});
    assert.equal((await observer.selectors.resolve(browser.page,next.ref)).strategy,'testId');
    await assert.rejects(observer.selectors.resolve(browser.page,{role:'button',name:'Duplicate'},100),/ambiguous/);
    const duplicate=state.elements.filter(e=>e.name==='Duplicate')[1]!;
    assert.equal((await observer.selectors.resolve(browser.page,duplicate.ref)).strategy,'path');
  }finally{await browser.close();}
});

test('path fallback rechecks associated labels for duplicate form controls',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<label>Email<input></label><label>Email<input></label>');
    const observer=new Observer(),state=await observer.inspect(browser.page),target=state.elements.filter(element=>element.name==='Email')[1]!;
    const resolved=await observer.selectors.resolve(browser.page,target.ref,100);
    assert.equal(resolved.strategy,'path');
    assert.equal(await resolved.locator.evaluate(element=>element===document.querySelectorAll('input')[1]),true);
  }finally{await browser.close();}
});

test('page cannot redirect a saved semantic reference by copying its DOM marker',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button>Save draft</button><button>Delete account</button>');
    const observer=new Observer(),state=await observer.inspect(browser.page),target=state.elements.find(element=>element.name==='Save draft')!;
    await browser.page.evaluate(ref=>{
      const buttons=document.querySelectorAll('button');
      buttons[0]!.textContent='Changed label';buttons[0]!.removeAttribute('data-fcu-ref');buttons[1]!.setAttribute('data-fcu-ref',ref);
    },target.ref);
    await assert.rejects(observer.selectors.resolve(browser.page,target.ref,100),/Target missing or ambiguous/);
  }finally{await browser.close();}
});

test('page-provided duplicate references stay unique in the observed state',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button>First</button><button>Second</button>');
    const observer=new Observer();await observer.inspect(browser.page);
    await browser.page.evaluate(()=>{
      const registry=(window as unknown as {__fcuRegistry:{refs:WeakMap<Element,string>}}).__fcuRegistry;
      const buttons=document.querySelectorAll('button');registry.refs.set(buttons[0]!,'f0ddeadbeefe1');registry.refs.set(buttons[1]!,'f0ddeadbeefe1');
    });
    const state=await observer.inspect(browser.page),first=state.elements.find(element=>element.name==='First')!,second=state.elements.find(element=>element.name==='Second')!;
    assert.notEqual(first.ref,second.ref);assert.equal(stateHash(state),state.hash);
    assert.equal(observer.selectors.element(first.ref)?.name,'First');assert.equal(observer.selectors.element(second.ref)?.name,'Second');
  }finally{await browser.close();}
});

test('malformed page-owned reference state cannot break observation',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button>Try again</button>');
    const observer=new Observer();await observer.inspect(browser.page);
    await browser.page.evaluate(()=>{(window as unknown as {__fcuRegistry:unknown}).__fcuRegistry={};});
    const state=await observer.inspect(browser.page);
    assert.equal(state.elements[0]?.name,'Try again');
  }finally{await browser.close();}
});

test('zero-time selector resolution does not sleep when a target is missing',async()=>{
  const browser=await new Browser().launch();
  try{
    const page=browser.page,wait=page.waitForTimeout.bind(page);let waits=0;
    page.waitForTimeout=async duration=>{waits++;await wait(duration);};
    await assert.rejects(new Observer().selectors.resolve(page,{css:'#missing'},0,true),/Target missing/);
    assert.equal(waits,0);
  }finally{await browser.close();}
});

test('page compression ranks relevant controls first and preserves tie order',()=>{
  const elements=['General action','Other action','Travel reservation'].map((name,index)=>({ref:`e${index}`,tag:'button',role:'button',name,frame:0,selectors:{role:'button',name},path:'body'}));
  const state={url:'https://example.test/',title:'Results',headings:[],text:'',elements,tables:[],dialogs:[],htmlBytes:0,hash:'state',warnings:[],frames:[],truncated:false};
  const text=new PageCompressor().compress(state,{goal:'travel reservation',maxChars:2000}).text;
  assert(text.indexOf('[e2]')<text.indexOf('[e0]'));assert(text.indexOf('[e0]')<text.indexOf('[e1]'));
  const partial=new PageCompressor().compress({...state,truncated:true});assert(partial.truncated);assert(partial.text.includes('[DOM control list truncated; additional controls may be missing]'));
});

test('page compression retains controls when page metadata is oversized',()=>{
  const state={url:'https://example.test/',title:'T'.repeat(1500),headings:[],text:'',elements:[{ref:'e0',tag:'button',role:'button',name:'Confirm reservation',frame:0,selectors:{role:'button',name:'Confirm reservation'},path:'body'}],tables:[],dialogs:[],htmlBytes:0,hash:'state',warnings:[],frames:[],truncated:false};
  const compressed=new PageCompressor().compress(state,{goal:'confirm reservation',maxChars:1200});
  assert(compressed.truncated);assert(compressed.text.length<=1200);assert(compressed.text.includes('[e0] button "Confirm reservation"'));
});

test('page compression marks partial table data and keeps it valid JSON',()=>{
  const rows=Array.from({length:10},(_,index)=>[`Metric ${index}`,`Value ${'x'.repeat(80)}`]);
  const state={url:'https://example.test/',title:'Report',headings:[],text:'Summary',elements:[],tables:[rows],dialogs:[],htmlBytes:0,hash:'state',warnings:[],frames:[],truncated:false};
  const compressed=new PageCompressor().compress(state,{maxChars:1200}),lines=compressed.text.split('\n'),tableIndex=lines.findIndex(line=>line.startsWith('TABLES'));
  assert.equal(lines[tableIndex],'TABLES [partial; trailing rows omitted]');
  const partial=JSON.parse(lines[tableIndex+1]!) as string[][][];
  assert(partial[0]!.length<rows.length);assert(compressed.truncated);
});

test('strict action DSL rejects code, unknown keys and unbounded plans',()=>{
  assert(ActionSchema.safeParse({type:'fill',target:'f0e1',value:'{{profile.email}}'}).success);
  assert(!ActionSchema.safeParse({type:'evaluate',code:'process.exit()'}).success);
  assert(!ActionSchema.safeParse({type:'click',target:'e1',code:'evil'}).success);
  assert(!ActionSchema.safeParse({type:'wait',condition:{type:'custom',value:'evil'}}).success);
  assert(!PlanSchema.safeParse({goal:'task',steps:['Fill'],actions:[],completion:[]}).success);
  assert(!ConditionSchema.safeParse({type:'extraction_count',min:3,max:2}).success);
  assert(ConditionSchema.safeParse({type:'extraction_count',min:2,max:3}).success);
  assert(ConditionSchema.safeParse({type:'extraction_count',min:0,max:3}).success);
  assert(!ConditionSchema.safeParse({type:'extraction_count',min:-1,max:3}).success);
  assert(similarity('apply to job','Apply job')>.5);
});

test('document facts survive long navigation and native disclosures resolve by exact name',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent(`<nav><ul>${Array.from({length:160},(_,i)=>`<li><a href="https://example.test/section-${i}">Documentation section ${i}</a></li>`).join('')}</ul></nav><main><h1>Travel facts</h1><p>England: 922 trips and 6082 miles in 2024.</p><details><summary>Accessibility &amp; route preferences</summary><label><input type="checkbox">Step-free routes only</label></details></main>`);
    const observer=new Observer(),state=await observer.inspect(browser.page),context=observer.compressor.compress(state,{goal:'Read the England travel facts and open Accessibility & route preferences',maxChars:3000});
    assert(context.text.includes('922 trips and 6082 miles'));assert(context.text.includes('controls omitted'));assert(context.text.length<=3000);
    const target=await observer.selectors.resolve(browser.page,{role:'button',name:'Accessibility & route preferences'},100);
    assert.equal(target.strategy,'disclosure');await target.locator.click();assert(await browser.page.getByLabel('Step-free routes only').isVisible());
  }finally{await browser.close();}
});

test('an open modal exposes its controls and excludes the blocked background',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<main><button>Background action</button><p>Background data</p></main><dialog aria-label="Journey details"><p>Regional route evidence</p><button>Close Journey details</button></dialog>');
    await browser.page.locator('dialog').evaluate(el=>(el as HTMLDialogElement).showModal());
    const state=await new Observer().inspect(browser.page);
    assert.deepEqual(state.elements.map(e=>e.name),['Close Journey details']);assert(state.text.includes('Regional route evidence'));assert(!state.text.includes('Background data'));
  }finally{await browser.close();}
});
