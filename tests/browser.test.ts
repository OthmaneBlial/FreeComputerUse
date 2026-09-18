import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Browser } from '../src/browser/Browser.js';
import { Observer } from '../src/browser/Observer.js';
import { diffPages, similarity } from '../src/browser/PageCompressor.js';
import { stateHash } from '../src/browser/DomExtractor.js';
import { ActionSchema, PlanSchema } from '../src/actions/schema.js';

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

test('strict action DSL rejects code, unknown keys and unbounded plans',()=>{
  assert(ActionSchema.safeParse({type:'fill',target:'f0e1',value:'{{profile.email}}'}).success);
  assert(!ActionSchema.safeParse({type:'evaluate',code:'process.exit()'}).success);
  assert(!ActionSchema.safeParse({type:'click',target:'e1',code:'evil'}).success);
  assert(!ActionSchema.safeParse({type:'wait',condition:{type:'custom',value:'evil'}}).success);
  assert(!PlanSchema.safeParse({goal:'task',steps:['Fill'],actions:[],completion:[]}).success);
  assert(similarity('apply to job','Apply job')>.5);
});
