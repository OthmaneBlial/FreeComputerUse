import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,readdir,rm,stat,symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
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
    const downloadClick=await executor.run({type:'click',target:{role:'link',name:'Download invoice'}});
    assert(downloadClick.success);assert.equal(downloadClick.action.type,'download');assert.equal(browser.downloads.length,2);
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

test('element-not-visible verification distinguishes hidden, missing, ambiguous and invalid targets',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button>Visible match</button><button style="display:none">Hidden match</button><aside style="display:none">Hidden only</aside>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    assert.equal(await executor.verifier.one({type:'element_exists',target:{css:'button'}}),true);
    assert.equal(await executor.verifier.one({type:'element_visible',target:{css:'button'}}),true);
    assert.equal(await executor.verifier.one({type:'element_exists',target:{css:'aside'}}),true);
    assert.equal(await executor.verifier.one({type:'element_visible',target:{css:'aside'}}),false);
    assert.equal(await executor.verifier.one({type:'element_not_visible',target:{css:'button'}}),false);
    assert.equal(await executor.verifier.one({type:'element_not_visible',target:{css:'aside'}}),true);
    assert.equal(await executor.verifier.one({type:'element_not_visible',target:{css:'#missing'}}),true);
    assert.equal(await executor.verifier.one({type:'element_not_visible',target:{css:'['}}),false);
  }finally{await browser.close();}
});

test('tab changes report uncertain failures only when they may have happened',async()=>{
  const fixture=await startFixtures(),browser=await new Browser({allowedOrigins:[fixture.url]}).launch();
  try{
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const last=await executor.run({type:'closeTab'});
    assert.equal(last.success,false);assert.equal(last.uncertain,false);
    const createTab=browser.openTab.bind(browser);
    browser.openTab=async url=>{await createTab(url);throw new Error('Browser reply lost');};
    const result=await executor.run({type:'openTab',url:fixture.url+'/invoices'});
    assert.equal(result.success,false);assert.equal(result.uncertain,true);assert.equal(browser.context.pages().length,2);
  }finally{await browser.close();await fixture.close();}
});

test('type reports unchanged fields as uncertain failures',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<input aria-label="Locked field" value="unchanged" readonly>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'type',target:{label:'Locked field'},value:'new text'});
    assert.equal(result.success,false);assert.equal(result.uncertain,true);
  }finally{await browser.close();}
});

test('type rejects noneditable targets',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<button aria-label="Run action">Run</button>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'type',target:{label:'Run action'},value:'unexpected'});
    assert.equal(await browser.page.getByLabel('Run action').innerText(),'Run');
    assert.equal(result.success,false);
  }finally{await browser.close();}
});

test('type reports partially accepted text as an uncertain failure',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<input aria-label="Locks after first key" oninput="if(this.value.length===1)this.readOnly=true">');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'type',target:{label:'Locks after first key'},value:'complete text'});
    assert.equal(await browser.page.getByLabel('Locks after first key').inputValue(),'c');
    assert.equal(result.success,false);assert.equal(result.uncertain,true);
  }finally{await browser.close();}
});

test('type detects partial input when the field has no selection API',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<input type="number" aria-label="Amount" oninput="if(this.value.length===1)this.readOnly=true">');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'type',target:{label:'Amount'},value:'123'});
    assert.equal(await browser.page.getByLabel('Amount').inputValue(),'1');
    assert.equal(result.success,false);assert.equal(result.uncertain,true);
  }finally{await browser.close();}
});

test('type verifies insertion at the focused input selection',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<input aria-label="Editable field" value="hello world">');
    const field=browser.page.getByLabel('Editable field');await field.focus();await field.evaluate(el=>(el as HTMLInputElement).setSelectionRange(6,11));
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'type',target:{label:'Editable field'},value:'there'});
    assert.equal(await field.inputValue(),'hello there');assert.equal(result.success,true);
  }finally{await browser.close();}
});

test('fill verifies contenteditable text controls',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<div contenteditable="true" aria-label="Message"></div>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'fill',target:{css:'[contenteditable="true"]'},value:'Updated message'});
    assert.equal(await browser.page.locator('[contenteditable="true"]').innerText(),'Updated message');
    assert.equal(result.success,true);
  }finally{await browser.close();}
});

test('download names stay inside the selected folder and support Unicode across platforms',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-download-path-')),downloadDir=join(dir,'downloads');await mkdir(downloadDir,{mode:0o755});
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<a href="data:text/plain,receipt" download="receipt.txt">Download</a>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control(),{downloadDir});
    const result=await executor.run({type:'download',target:{role:'link',name:'Download'},filename:'..\\..\\résumé 🧾.txt'});
    assert.equal(result.success,true,result.error??'Download failed');
    const saved=result.data as {path:string;filename:string};
    assert.equal(saved.filename,'résumé 🧾.txt');assert.equal(dirname(saved.path),downloadDir);
    assert.equal(await readFile(saved.path,'utf8'),'receipt');
    if(process.platform!=='win32'){assert.equal((await stat(downloadDir)).mode&0o777,0o700);assert.equal((await stat(saved.path)).mode&0o777,0o600);}
  }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
});

test('downloads refuse a symlinked destination folder',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-download-link-')),outside=join(dir,'outside'),downloads=join(dir,'downloads');
  await mkdir(outside);await symlink(outside,downloads);
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<a href="data:text/plain,receipt" download="receipt.txt">Download</a>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control(),{downloadDir:downloads});
    const result=await executor.run({type:'download',target:{role:'link',name:'Download'}});
    assert.equal(result.success,false);assert.match(result.error??'',/real local directory/);
    assert.deepEqual(await readdir(outside),[]);
  }finally{await browser.close();await rm(dir,{recursive:true,force:true});}
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

test('record extraction expands table rows and maps actual headers over guessed indices',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<table><thead><tr><th>Month</th><th>Revenue</th></tr></thead><tbody><tr><td><button>View</button></td><td>January</td><td>1200</td></tr><tr><td><button>View</button></td><td>February</td><td>1800</td></tr><tr><td><button>View</button></td><td>March</td><td>1500</td></tr></tbody></table>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const fields={month:{css:'td:nth-child(1)',attribute:'text' as const},revenue:{css:'td:nth-child(2)',attribute:'text' as const}};
    const result=await executor.run({type:'extract',target:{css:'table'},format:'records',key:'revenue',fields});
    assert.equal(result.success,true,result.error??'Extraction failed');assert.deepEqual(browser.extractions[0]?.value,[{month:'January',revenue:'1200'},{month:'February',revenue:'1800'},{month:'March',revenue:'1500'}]);
    assert(await executor.verifier.one({type:'extraction_contains',value:'1800'}));
    const nested=await executor.run({type:'extract',target:{css:'table, tbody'},format:'records',key:'nested',fields});
    assert.equal(nested.success,true,nested.error??'Extraction failed');assert.deepEqual(browser.extractions[1]?.value,[{month:'January',revenue:'1200'},{month:'February',revenue:'1800'},{month:'March',revenue:'1500'}]);
  }finally{await browser.close();}
});

test('record extraction omits hidden, password, payment and one-time-code input values',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<form><input type="HIDDEN" name="csrf" value="csrf-secret"><input type="password" value="password-secret"><input autocomplete="cc-number" value="4111111111111111"><input autocomplete="cc-exp" value="12/35"><input autocomplete="current-password" value="saved-secret"><input autocomplete="one-time-code" value="123456"><input aria-label="Public value" value="visible-data"></form>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'extract',target:{css:'form'},format:'records',key:'fields',fields:{hidden:{css:'input[name=csrf]',attribute:'value'},password:{css:'input[type=password]',attribute:'value'},card:{css:'input[autocomplete=cc-number]',attribute:'value'},expiry:{css:'input[autocomplete=cc-exp]',attribute:'value'},savedPassword:{css:'input[autocomplete=current-password]',attribute:'value'},code:{css:'input[autocomplete=one-time-code]',attribute:'value'},publicValue:{css:'input[aria-label="Public value"]',attribute:'value'}}});
    assert.equal(result.success,true,result.error??'Extraction failed');
    assert.deepEqual(browser.extractions[0]?.value,[{hidden:'[sensitive value omitted]',password:'[sensitive value omitted]',card:'[sensitive value omitted]',expiry:'[sensitive value omitted]',savedPassword:'[sensitive value omitted]',code:'[sensitive value omitted]',publicValue:'visible-data'}]);
  }finally{await browser.close();}
});

test('record extraction omits hidden field text and link attributes',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<!doctype html><html><head><base href="https://example.test/"></head><body><article class="card"><span class="hidden" style="opacity:0">Hidden instruction</span><span aria-hidden="true"><a class="hidden-link" href="/private">Private destination</a></span><span class="visible">Visible fact</span></article></body></html>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'extract',target:{css:'.card'},format:'records',key:'facts',fields:{hiddenText:{css:'.hidden',attribute:'text'},hiddenLink:{css:'.hidden-link',attribute:'href'},visibleText:{css:'.visible',attribute:'text'}}});
    assert.equal(result.success,true,result.error??'Extraction failed');
    assert.deepEqual(browser.extractions[0]?.value,[{hiddenText:'',hiddenLink:'',visibleText:'Visible fact'}]);
  }finally{await browser.close();}
});

test('table and link extraction excludes hidden cells, text and links',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<!doctype html><html><head><base href="https://example.test/"></head><body><table><tr><td>Public cell<span style="display:none">hidden-table-secret</span></td><td style="display:none">hidden-cell-secret</td></tr></table><a href="/safe"><span style="display:none">hidden-link-injection</span>Public link</a><a href="/invisible" style="visibility:hidden">Invisible</a><a href="/transparent" style="opacity:0">Transparent</a><a href="/aria-hidden" aria-hidden="true">Aria hidden</a><a href="/inert" inert>Inert</a></body></html>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    assert((await executor.run({type:'extract',target:{css:'table'},format:'table',key:'table'})).success);
    assert.deepEqual(browser.extractions[0]?.value,[['Public cell','']]);
    assert((await executor.run({type:'extract',target:{css:'table tr'},format:'table',key:'row'})).success);
    assert.deepEqual(browser.extractions[1]?.value,[['Public cell','']]);
    assert((await executor.run({type:'extract',format:'links',key:'links'})).success);
    assert.deepEqual(browser.extractions[2]?.value,[{text:'Public link',url:'https://example.test/safe'}]);
    const overlap=await executor.run({type:'extract',target:{css:'body, a[href]'},format:'links',key:'overlap'});
    assert.equal(overlap.success,true,overlap.error??'Extraction failed');assert.deepEqual(browser.extractions[3]?.value,[{text:'Public link',url:'https://example.test/safe'}]);
  }finally{await browser.close();}
});

test('text extraction applies substring and line limits',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<main><p>Overview</p><p>Price: 90</p><p>Price: 45</p><p>Stock: 4</p></main>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'extract',target:{css:'main'},format:'text',key:'price',match:'PRICE',limit:1});
    assert.equal(result.success,true,result.error??'Extraction failed');assert.equal(browser.extractions[0]?.value,'Price: 90');
    await browser.page.setContent(`<main>${'x'.repeat(100001)}</main>`);
    const bounded=await executor.run({type:'extract',target:{css:'main'},format:'text',key:'bounded'});
    assert.equal(bounded.success,true,bounded.error??'Extraction failed');assert.equal((browser.extractions[1]?.value as string).length,100000);
  }finally{await browser.close();}
});

test('array extraction limits avoid reading later rows in the browser',async()=>{
  const browser=await new Browser().launch();
  try{
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    await browser.page.setContent('<table><tbody><tr><td>one</td></tr><tr><td>two</td></tr><tr><td>three</td></tr></tbody></table>');
    await browser.page.locator('tr').nth(2).locator('td').evaluate(cell=>Object.defineProperty(cell,'innerText',{get(){throw new Error('read past limit');}}));
    const table=await executor.run({type:'extract',target:{css:'table'},format:'table',key:'table',limit:2});
    assert.equal(table.success,true,table.error??'Table extraction failed');
    assert.deepEqual(browser.extractions.at(-1)?.value,[['one'],['two']]);
    await browser.page.setContent('<table><tbody><tr><td>one</td></tr><tr><td>two</td></tr><tr><td>three</td></tr></tbody></table>');
    const matchedTable=await executor.run({type:'extract',target:{css:'table'},format:'table',key:'matched-table',match:'THREE',limit:1});
    assert.equal(matchedTable.success,true,matchedTable.error??'Matched table extraction failed');
    assert.deepEqual(browser.extractions.at(-1)?.value,[['three']]);

    await browser.page.setContent('<div class="links"><a href="/one">one</a><a href="/two">two</a><a href="/three">three</a></div>');
    await browser.page.locator('a').nth(2).evaluate(link=>Object.defineProperty(link,'innerText',{get(){throw new Error('read past limit');}}));
    const links=await executor.run({type:'extract',target:{css:'.links'},format:'links',key:'links',limit:2});
    assert.equal(links.success,true,links.error??'Link extraction failed');
    assert.equal((browser.extractions.at(-1)?.value as unknown[]).length,2);
    await browser.page.setContent('<div class="links"><a href="https://example.test/one">one</a><a href="https://example.test/two">two</a><a href="https://example.test/three">three</a></div>');
    const matchedLinks=await executor.run({type:'extract',target:{css:'.links'},format:'links',key:'matched-links',match:'THREE',limit:1});
    assert.equal(matchedLinks.success,true,matchedLinks.error??'Matched link extraction failed');
    assert.equal((browser.extractions.at(-1)?.value as {text:string}[])[0]?.text,'three');

    await browser.page.setContent('<table><thead><tr><th>Item</th></tr></thead><tbody><tr><td>one</td></tr><tr><td>two</td></tr><tr><td>three</td></tr></tbody></table>');
    await browser.page.locator('tbody tr').nth(2).locator('td').evaluate(cell=>Object.defineProperty(cell,'innerText',{get(){throw new Error('read past limit');}}));
    const records=await executor.run({type:'extract',target:{css:'table'},format:'records',key:'records',limit:2,fields:{item:{css:'td',attribute:'text'}}});
    assert.equal(records.success,true,records.error??'Record extraction failed');
    assert.deepEqual(browser.extractions.at(-1)?.value,[{item:'one'},{item:'two'}]);
    await browser.page.setContent('<table><thead><tr><th>Item</th></tr></thead><tbody><tr><td>one</td></tr><tr><td>two</td></tr><tr><td>three</td></tr></tbody></table>');
    const matchedRecords=await executor.run({type:'extract',target:{css:'table'},format:'records',key:'matched-records',match:'THREE',limit:1,fields:{item:{css:'td',attribute:'text'}}});
    assert.equal(matchedRecords.success,true,matchedRecords.error??'Matched record extraction failed');
    assert.deepEqual(browser.extractions.at(-1)?.value,[{item:'three'}]);
  }finally{await browser.close();}
});

test('text extraction excludes hidden descendants and blocked modal backgrounds',async()=>{
  const browser=await new Browser().launch();
  try{
    await browser.page.setContent('<main><p>First public <span style="opacity:0">Hidden opacity</span></p><p>Second public <span aria-hidden="true">Hidden aria</span></p><p>Third public <span inert>Hidden inert</span></p></main>');
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    const result=await executor.run({type:'extract',target:{css:'main'},format:'text',key:'visible'});
    assert.equal(result.success,true,result.error??'Extraction failed');
    assert.equal(browser.extractions[0]?.value,'First public\nSecond public\nThird public');
    await browser.page.setContent('<main><p>Blocked background</p><dialog><p>Dialog content</p></dialog></main>');
    await browser.page.locator('dialog').evaluate(el=>(el as HTMLDialogElement).showModal());
    const modal=await executor.run({type:'extract',format:'text',key:'dialog'});
    assert.equal(modal.success,true,modal.error??'Extraction failed');
    assert.equal(browser.extractions[1]?.value,'Dialog content');
  }finally{await browser.close();}
});

test('popup navigation waits for the new document before extraction and closing',async()=>{
  const fixture=await startFixtures(),browser=await new Browser({allowedOrigins:[fixture.url]}).launch();
  try{
    await browser.navigate(fixture.url+'/tabs');const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    assert((await executor.run({type:'click',target:{role:'link',name:'Open automation reference'}})).success);
    assert.equal(browser.context.pages().length,2);
    assert((await executor.run({type:'switchTab',index:1})).success);
    assert((await executor.run({type:'extract',format:'text',key:'principle'})).success);
    assert(await executor.verifier.one({type:'extraction_contains',value:'Plan once. Execute many actions.'}));
    assert((await executor.run({type:'closeTab'})).success);assert(browser.page.url().endsWith('/tabs'));
    assert(await executor.verifier.one({type:'tab_count',count:1}));
  }finally{await browser.close();await fixture.close();}
});

test('redaction handles overlapping and JSON-escaped profile values',()=>{
  const resolver=new VariableResolver({profile:{firstName:'Alex',message:'Alex said "private"\nsecond line'},files:{}});
  const text=JSON.stringify({message:resolver.vault.profile.message,name:'Alex'});
  const result=JSON.parse(resolver.redact(text));assert.deepEqual(result,{message:'{{profile.message}}',name:'{{profile.firstName}}'});
});

test('redaction masks credential query values and bearer tokens but keeps ordinary query values',()=>{
  const resolver=new VariableResolver(),input=JSON.stringify({url:'https://example.test/?access_token=access-secret&api_key=provider-secret&search=Paris#access_token=fragment-secret&code=oauth-secret&state=keep',authorization:'Bearer abcdefghijklmnop'});
  const result=resolver.redact(input);
  assert(!result.includes('access-secret'));assert(!result.includes('provider-secret'));assert(!result.includes('fragment-secret'));assert(!result.includes('oauth-secret'));assert(!result.includes('abcdefghijklmnop'));
  assert.deepEqual(JSON.parse(result),{url:'https://example.test/?access_token=REDACTED&api_key=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep',authorization:'Bearer [redacted]'});
});

test('redaction masks common GitHub, GitLab and Slack token prefixes',()=>{
  const resolver=new VariableResolver(),tokens=[
    `ghp_${'a'.repeat(24)}`,`github_pat_${'b'.repeat(24)}`,
    `ghs_APPID_${'c'.repeat(32)}.${'d'.repeat(32)}`,
    `glpat-${'e'.repeat(24)}`,`glrtr-${'f'.repeat(24)}`,`xoxb-${'g'.repeat(24)}`,
  ];
  assert.equal(resolver.redact(tokens.join('|')),tokens.map(()=> '[redacted key]').join('|'));
  assert.equal(resolver.redact('ghp_short glpat-short xoxb-short'),'ghp_short glpat-short xoxb-short');
});
