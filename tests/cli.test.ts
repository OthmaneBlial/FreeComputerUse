import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

test('doctor keeps network checks opt-in and reports safe API failures',{timeout:45000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'fcu-doctor-'));
  let fail=false;
  const requests:{path:string;authorization:string|undefined}[]=[];
  const server=createServer((req,res)=>{
    requests.push({path:req.url??'',authorization:req.headers.authorization});
    if(fail){res.writeHead(503,{'Content-Type':'application/json'});res.end('{"error":"synthetic private provider response"}');return;}
    res.writeHead(200,{'Content-Type':'application/json'});res.end('{"data":[{"id":"fixture-model"}]}');
  });
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  const address=server.address() as {port:number};
  const runDoctor=(api=false,overrides:NodeJS.ProcessEnv={})=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    const child=spawn(process.execPath,['--import','tsx','src/cli/index.ts','doctor',...(api?['--api']:[])],{
      cwd:process.cwd(),
      env:{...process.env,FCU_DATA_DIR:directory,LLM_PROVIDER:'openai-compatible',LLM_API_KEY:'test-only-key',LLM_MODEL:'fixture-model',LLM_BASE_URL:`http://127.0.0.1:${address.port}/v1`,...overrides},
      stdio:['ignore','pipe','pipe'],
    });
    let stdout='',stderr='';
    child.stdout.setEncoding('utf8').on('data',chunk=>stdout+=chunk);
    child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
    child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));
  });
  try{
    const offline=await runDoctor();
    assert.equal(offline.code,0,offline.stderr);assert.match(offline.stdout,/Browser launch: passed/);assert.equal(requests.length,0);
    const online=await runDoctor(true);
    assert.equal(online.code,0,online.stderr);assert.match(online.stdout,/Provider models: fixture-model/);
    assert.deepEqual(requests,[{path:'/v1/models',authorization:'Bearer test-only-key'}]);
    fail=true;
    const failed=await runDoctor(true);
    assert.equal(failed.code,1);assert.match(failed.stderr,/Provider models HTTP 503/);
    assert(!failed.stdout.includes('test-only-key'));assert(!failed.stderr.includes('test-only-key'));
    assert(!failed.stdout.includes('synthetic private provider response'));assert(!failed.stderr.includes('synthetic private provider response'));
    const missing=await runDoctor(true,{LLM_API_KEY:''});
    assert.equal(missing.code,1);assert.match(missing.stderr,/No model provider configured; set LLM_API_KEY or sign in with a supported CLI subscription/);
    assert.equal(requests.length,2);
  }finally{
    await new Promise<void>(resolve=>server.close(()=>resolve()));
    await rm(directory,{recursive:true,force:true});
  }
});
