import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Browser } from '../src/browser/Browser.js';
import { Observer } from '../src/browser/Observer.js';
import { Executor } from '../src/actions/executor.js';
import { Control } from '../src/agent/Control.js';
import { VariableResolver } from '../src/profile/VariableResolver.js';
import { startFixtures } from '../fixtures/server.js';

test('local variables never expose values in aliases and deny arbitrary uploads',()=>{
  const resolver=new VariableResolver({profile:{email:'secret@example.com'},files:{resume:'/private/resume.pdf'}});
  assert.equal(resolver.resolve('Hello {{profile.email}}'),'Hello secret@example.com');
  assert.deepEqual(resolver.aliases(),{profile:['email'],files:['resume']});
  assert.equal(resolver.redact('secret@example.com'), '{{profile.email}}');
  assert.throws(()=>resolver.resolve('{{profile.__proto__}}'),/Invalid/);
  assert.throws(()=>resolver.resolve('{{profile.unknown}}'),/Missing/);
  assert.throws(()=>resolver.file('/etc/passwd'),/explicit/);
});

test('executor fills, selects, verifies, uploads, downloads, navigates and controls tabs',async()=>{
  const fixture=await startFixtures();const dir=await mkdtemp(join(tmpdir(),'fcu-actions-'));
  const browser=await new Browser({allowedOrigins:[fixture.url]}).launch();
  try{
    const resume=join(dir,'resume.txt');await writeFile(resume,'Synthetic resume');
    const observer=new Observer(),control=new Control();
    const executor=new Executor(browser,observer,new VariableResolver({profile:{firstName:'Test',email:'test@example.com'},files:{resume}}),control,{downloadDir:dir});
    await browser.navigate(fixture.url+'/apply');await observer.inspect(browser.page);
    for(const action of [
      {type:'fill',target:{label:'First name'},value:'{{profile.firstName}}'},
      {type:'type',target:{label:'Last name'},value:'User'},
      {type:'fill',target:{label:'Email'},value:'{{profile.email}}'},
      {type:'select',target:{label:'Country'},value:'Germany'},
      {type:'upload',target:{label:'Resume'},file:'{{files.resume}}'},
      {type:'scroll',direction:'down',pixels:200},
    ])assert.equal((await executor.run(action as never)).success,true,JSON.stringify(action));
    assert(await executor.verifier.one({type:'input_value_equals',target:{label:'Country'},value:'Germany'}));
    assert.equal(await browser.page.getByLabel('Resume').evaluate(el=>(el as HTMLInputElement).files?.length),1);
    assert((await executor.run({type:'openTab',url:fixture.url+'/invoices'})).success);
    assert((await executor.run({type:'download',target:{role:'link',name:'Download invoice'}})).success);
    assert(await executor.verifier.one({type:'download_created',value:'invoice.txt'}));
    assert((await readFile(browser.downloads[0]!.path,'utf8')).includes('INV-001'));
    assert((await executor.run({type:'closeTab'})).success);assert(browser.page.url().endsWith('/apply'));
    assert(!(await executor.run({type:'navigate',url:'file:///etc/passwd'})).success);
    assert(!(await executor.run({type:'navigate',url:'https://example.invalid/collect'})).success);
    await browser.navigate(fixture.url+'/dynamic');
    assert((await executor.run({type:'click',target:{role:'button',name:'Open modal'}})).success);
    assert(await executor.verifier.one({type:'element_visible',target:{label:'Preferences'}}));
    assert((await executor.run({type:'click',target:{role:'button',name:'Close modal'}})).success);
    assert((await executor.run({type:'wait',condition:{type:'element_visible',target:{role:'button',name:'Delayed action'}}})).success);
    assert((await executor.run({type:'click',target:{role:'button',name:'Delayed action'}})).success);
  }finally{await browser.close();await fixture.close();await rm(dir,{recursive:true,force:true});}
});

test('sensitive action waits for a human and rejection never clicks',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button onclick="document.body.dataset.deleted=\'yes\'">Delete record</button>');
    const observer=new Observer(),control=new Control();
    const executor=new Executor(browser,observer,new VariableResolver(),control);
    const pending=new Promise<void>(resolve=>control.once('approval',()=>resolve()));
    const execution=executor.run({type:'click',target:{role:'button',name:'Delete record'}});
    await pending;
    assert.equal(await browser.page.locator('body').getAttribute('data-deleted'),null);
    control.reject();const result=await execution;
    assert(!result.success);assert(!result.uncertain);
    assert.equal(await browser.page.locator('body').getAttribute('data-deleted'),null);
  }finally{await browser.close();}
});
