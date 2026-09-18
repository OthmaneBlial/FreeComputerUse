import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {Agent} from '../src/agent/Agent.js';
import {TraceStore} from '../src/history/TraceStore.js';
import {PlanSchema} from '../src/actions/schema.js';
import {TokenBudget} from '../src/agent/TokenBudget.js';
import {goalCriteria} from '../src/agent/goalCriteria.js';

test('normal mode rejects website access before any site request; Ultra mode bypasses the gate',async()=>{
  let visits=0;const server=createServer((_req,res)=>{visits++;res.end('<h1>Free test site</h1><p>Ready</p>');});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const address=server.address() as {port:number},url=`http://127.0.0.1:${address.port}`;
  const store=new TraceStore(':memory:'),plan=PlanSchema.parse({goal:'Read',steps:['Read'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'text_exists',value:'Ready'}],continue:false});
  const normal=new Agent({store,browser:{allowedOrigins:[url]}});normal.control.on('approval',()=>normal.control.reject());
  const ultra=new Agent({store,mode:'ultra'});let gates=0;ultra.control.on('approval',()=>{gates++;});
  try{
    const rejected=await normal.run('Read the page',url,plan);assert.equal(rejected.status,'failed');assert.equal(visits,0);
    const accepted=await ultra.run('Read the page',url,plan);assert.equal(accepted.status,'completed',accepted.error??'Task failed');assert(visits>0);assert.equal(gates,0);
  }finally{await normal.close();await ultra.close();store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test('concurrent token reservations cannot oversubscribe the input/output budget',()=>{
  const budget=new TokenBudget({maxLLMCalls:3,maxInputTokens:100,maxOutputTokens:300});
  const first=budget.reserve(60,200);assert.throws(()=>budget.reserve(50,100),/input budget/);
  const second=budget.reserve(20,200);assert.equal(second.maxOutput,100);assert.throws(()=>budget.reserve(1,100),/output budget/);
  budget.record({input:15,output:80},second.id);assert.equal(budget.pendingInput,60);
  budget.record({input:50,output:180},first.id);assert.equal(budget.pendingInput,0);
  assert.throws(()=>budget.record({input:-1,output:0}),/Invalid/);
});
test('trusted extraction criteria derive from the original goal',()=>{
  assert.deepEqual(goalCriteria('Extract the first five stories'),[{type:'extraction_created'},{type:'extraction_count',min:5,max:5}]);
  assert.deepEqual(goalCriteria('Fill the form using my profile'),[]);
});
