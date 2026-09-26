import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser/Browser.js';
import { Observer } from '../src/browser/Observer.js';
import { diffPages, PageCompressor, similarity } from '../src/browser/PageCompressor.js';
import { stateHash } from '../src/browser/DomExtractor.js';
import { ActionSchema, PlanSchema } from '../src/actions/schema.js';

test('rejects unsupported system browser channels before launch',async()=>{
  const previous=process.env.FCU_BROWSER_CHANNEL;process.env.FCU_BROWSER_CHANNEL='not-a-browser';
  try{await assert.rejects(new Browser().launch(),/FCU_BROWSER_CHANNEL must be one of/);}
  finally{if(previous===undefined)delete process.env.FCU_BROWSER_CHANNEL;else process.env.FCU_BROWSER_CHANNEL=previous;}
});

test('real Chromium extracts visible controls, frames, shadow DOM and stable refs', async () => {
  const browser=await new Browser().launch();
  try {
    await browser.page.setContent(`<h1>Application</h1><style>${'/* decoration */'.repeat(2000)}</style><form id="application"><label for="email">Email</label><input id="email" name="email" required><label for="country">Country</label><select id="country"><option>France</option><option>Germany</option></select><button>Continue</button></form><button hidden>Hidden</button><div aria-hidden="true"><button>Tracking</button></div><iframe srcdoc='<button>Frame action</button>'></iframe><div id="shadow"></div><table><tr><th>Price</th></tr><tr><td>12</td></tr></table>`);
    await browser.page.locator('#shadow').evaluate(el=>{el.attachShadow({mode:'open'}).innerHTML='<button>Shadow action</button>';});
    const observer=new Observer();const first=await observer.inspect(browser.page);
    assert.deepEqual(first.headings,['Application']);
    assert(first.elements.some(e=>e.name==='Shadow action'));
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
    assert.equal((await observer.selectors.resolve(browser.page,duplicate.ref)).strategy,'reference');
  }finally{await browser.close();}
});

test('page compression ranks relevant controls first and preserves tie order',()=>{
  const elements=['General action','Other action','Travel reservation'].map((name,index)=>({ref:`e${index}`,tag:'button',role:'button',name,frame:0,selectors:{role:'button',name},path:'body'}));
  const state={url:'https://example.test/',title:'Results',headings:[],text:'',elements,tables:[],dialogs:[],htmlBytes:0,hash:'state',warnings:[],frames:[],truncated:false};
  const text=new PageCompressor().compress(state,{goal:'travel reservation',maxChars:2000}).text;
  assert(text.indexOf('[e2]')<text.indexOf('[e0]'));assert(text.indexOf('[e0]')<text.indexOf('[e1]'));
});

test('strict action DSL rejects code, unknown keys and unbounded plans',()=>{
  assert(ActionSchema.safeParse({type:'fill',target:'f0e1',value:'{{profile.email}}'}).success);
  assert(!ActionSchema.safeParse({type:'evaluate',code:'process.exit()'}).success);
  assert(!ActionSchema.safeParse({type:'click',target:'e1',code:'evil'}).success);
  assert(!ActionSchema.safeParse({type:'wait',condition:{type:'custom',value:'evil'}}).success);
  assert(!PlanSchema.safeParse({goal:'task',steps:['Fill'],actions:[],completion:[]}).success);
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
