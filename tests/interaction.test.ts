import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Browser} from '../src/browser/Browser.js';
import {Observer} from '../src/browser/Observer.js';
import {Executor} from '../src/actions/executor.js';
import {Control} from '../src/agent/Control.js';
import {VariableResolver} from '../src/profile/VariableResolver.js';
import type {PointerState} from '../src/browser/Interaction.js';

test('visible interaction moves the real pointer, types progressively, clicks and supports frames',async()=>{
  const browser=await new Browser({visualInteraction:true}).launch();
  const events:PointerState[]=[];browser.interaction.on('pointer',event=>events.push(event));
  try{
    await browser.page.setContent(`<input aria-label="Search" oninput="(window.inputs??=[]).push(this.value)"><input aria-label="Budget" type="number" oninput="(window.budgets??=[]).push(this.value)"><button onclick="document.body.dataset.clicked='yes'">Find</button><iframe srcdoc="<button onclick=&quot;document.body.dataset.clicked='yes'&quot;>Frame action</button>"></iframe><script>window.moves=[];addEventListener('mousemove',event=>moves.push([event.clientX,event.clientY]));</script>`);
    const control=new Control(),executor=new Executor(browser,new Observer(),new VariableResolver(),control);
    assert((await executor.run({type:'fill',target:{label:'Search'},value:'keyboard'})).success);
    const inputs=await browser.page.evaluate(()=>(window as unknown as {inputs:string[]}).inputs);
    assert.deepEqual(inputs,['k','ke','key','keyb','keybo','keyboa','keyboar','keyboard']);
    const numeric=await executor.run({type:'fill',target:{label:'Budget'},value:'120'});assert(numeric.success);assert(numeric.durationMs>=800,'Visible motion and entry keep a readable pace');
    assert.deepEqual(await browser.page.evaluate(()=>(window as unknown as {budgets:string[]}).budgets),['1','12','120']);
    assert((await executor.run({type:'click',target:{role:'button',name:'Find'}})).success);
    assert.equal(await browser.page.locator('body').getAttribute('data-clicked'),'yes');
    const moves=await browser.page.evaluate(()=>(window as unknown as {moves:number[][]}).moves);
    assert(moves.length>=32,'Real mousemove events reached the page');
    assert(events.some(event=>event.kind==='fill'));assert(events.filter(event=>event.kind==='moving').length>=32);
    assert(!JSON.stringify(events).includes('keyboard'),'Cursor telemetry contains no typed values');
    assert((await executor.run({type:'click',target:{role:'button',name:'Frame action',frame:1}})).success);
    assert.equal(await browser.page.frames()[1]!.locator('body').getAttribute('data-clicked'),'yes');
    const frameBox=await browser.page.locator('iframe').boundingBox(),pointer=browser.interaction.snapshot()!;
    assert(pointer.x>=frameBox!.x&&pointer.y>=frameBox!.y,'Frame coordinates use the main viewport');
  }finally{await browser.close();}
});

test('visible actions bring clipped controls fully into view, including nested scrollers',async()=>{
  const browser=await new Browser({visualInteraction:true}).launch();
  try{
    await browser.page.setViewportSize({width:1000,height:600});
    await browser.page.setContent(`<style>body{margin:0}.space{height:580px}button{height:48px}.tail{height:500px}#nested{height:180px;overflow:auto}</style><div class="space"></div><button onclick="window.clicked=this.getBoundingClientRect().toJSON()">Download itinerary</button><div class="tail"></div><div id="nested"><div style="height:165px"></div><button onclick="window.nested=this.getBoundingClientRect().toJSON()">Nested action</button><div class="tail"></div></div><div class="tail"></div>`);
    assert((await browser.page.getByRole('button',{name:'Download itinerary'}).boundingBox())!.y>550);
    const executor=new Executor(browser,new Observer(),new VariableResolver(),new Control());
    assert((await executor.run({type:'click',target:{role:'button',name:'Download itinerary'}})).success);
    const clicked=await browser.page.evaluate(()=>(window as unknown as {clicked:{top:number;bottom:number}}).clicked);
    assert(clicked.top>=48&&clicked.bottom<=552,'The whole button, with surrounding space, was visible at the actual click');
    assert((await executor.run({type:'click',target:{role:'button',name:'Nested action'}})).success);
    const nested=await browser.page.getByRole('button',{name:'Nested action'}).boundingBox(),parent=await browser.page.locator('#nested').boundingBox();
    assert(nested!.y>=parent!.y&&nested!.y+nested!.height<=parent!.y+parent!.height,'Nested scrolling also reveals the complete control');
  }finally{await browser.close();}
});

test('reject and stop prevent actual clicks during visible interaction',async()=>{
  const browser=await new Browser({visualInteraction:true}).launch();
  try{
    await browser.page.setContent('<button onclick="document.body.dataset.clicked=\'yes\'">Delete record</button>');
    const control=new Control(),executor=new Executor(browser,new Observer(),new VariableResolver(),control);
    const approval=new Promise<void>(resolve=>control.once('approval',()=>resolve()));
    const execution=executor.run({type:'click',target:{role:'button',name:'Delete record'}});await approval;
    assert.equal(browser.interaction.snapshot()?.visible,false);control.reject();assert(!(await execution).success);
    assert.equal(await browser.page.locator('body').getAttribute('data-clicked'),null);
    const secondControl=new Control(),second=new Executor(browser,new Observer(),new VariableResolver(),secondControl,{confirmation:'never'});
    browser.interaction.once('pointer',()=>secondControl.stop());
    assert(!(await second.run({type:'click',target:{role:'button',name:'Delete record'}})).success);
    assert.equal(await browser.page.locator('body').getAttribute('data-clicked'),null);
  }finally{await browser.close();}
});

test('pause interrupts pointer movement and approval guards survive animation',async()=>{
  const browser=await new Browser({visualInteraction:true}).launch();
  try{
    await browser.page.setContent('<button onclick="document.body.dataset.clicked=\'yes\'">Delete record</button>');
    const control=new Control(),executor=new Executor(browser,new Observer(),new VariableResolver(),control);
    control.once('approval',()=>control.approve());
    let resume!:()=>void;
    const paused=new Promise<void>(resolve=>{resume=resolve;});
    browser.interaction.once('pointer',()=>{control.pause();resume();});
    const execution=executor.run({type:'click',target:{css:'button'}});await paused;
    const sequence=browser.interaction.snapshot()!.sequence;await browser.page.waitForTimeout(100);
    assert.equal(browser.interaction.snapshot()!.sequence,sequence);assert.equal(await browser.page.locator('body').getAttribute('data-clicked'),null);
    await browser.page.locator('button').evaluate(el=>el.textContent='Delete everything');control.resume();
    const result=await execution;assert(!result.success);assert.match(result.error??'',/Approved target changed/);
    assert.equal(await browser.page.locator('body').getAttribute('data-clicked'),null);
  }finally{await browser.close();}
});
