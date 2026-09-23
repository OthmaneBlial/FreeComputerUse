import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {chmod,mkdtemp,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {TraceStore,type Trace} from '../src/history/TraceStore.js';

test('environment loading restricts local credentials and rejects symbolic links',{timeout:20000},async t=>{
  if(process.platform==='win32'){t.skip('POSIX .env file modes do not apply on Windows');return;}
  const directory=await mkdtemp(join(tmpdir(),'fcu-env-security-')),path=join(directory,'.env'),secret='fcu-env-file-test-key';
  const runLoader=()=>new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
    const entry=pathToFileURL(join(process.cwd(),'src/config.ts')).href;
    const code=`import {loadEnvironment} from ${JSON.stringify(entry)};loadEnvironment();console.log(process.env.LLM_API_KEY?'configured':'missing')`;
    const env={...process.env};delete env.LLM_API_KEY;
    const loader=join(process.cwd(),'node_modules/tsx/dist/loader.mjs');
    const child=spawn(process.execPath,['--import',loader,'--input-type=module','-e',code],{cwd:directory,env,stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',chunk=>stdout+=chunk);child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
    child.once('error',reject);child.once('close',code=>resolve({code,stdout,stderr}));
  });
  try{
    await writeFile(path,`LLM_API_KEY=${secret}\n`);await chmod(path,0o644);
    const loaded=await runLoader();assert.equal(loaded.code,0,loaded.stderr);assert.equal(loaded.stdout.trim(),'configured');
    assert.equal((await stat(path)).mode&0o777,0o600);assert(!loaded.stdout.includes(secret));assert(!loaded.stderr.includes(secret));
    const shared=join(directory,'shared.env');await writeFile(shared,`LLM_API_KEY=${secret}\n`);await chmod(shared,0o644);
    await rm(path);await symlink(shared,path);
    const linked=await runLoader();assert.notEqual(linked.code,0);assert.match(linked.stderr,/regular file/);
    assert.equal((await stat(shared)).mode&0o777,0o644);assert(!linked.stdout.includes(secret));assert(!linked.stderr.includes(secret));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('history CLI redacts credential query and fragment values from saved traces',{timeout:15000},async()=>{
  const directory=await mkdtemp(join(tmpdir(),'fcu-history-redaction-')),store=new TraceStore(join(directory,'history.sqlite'));
  const secret='legacy-history-access-secret',fragmentToken='legacy-history-fragment-token',oauthCode='legacy-history-oauth-code';
  const trace:Trace={version:1,id:'history-redaction',goal:'Inspect a saved route',url:`https://example.test/?access_token=${secret}&search=Paris#access_token=${fragmentToken}&code=${oauthCode}&state=keep`,status:'completed',startedAt:1,durationMs:0,plans:[],actions:[],completion:[],calls:[],metrics:{}};
  store.save(trace);store.close();
  try{
    const child=spawn(process.execPath,['--import','tsx','src/cli/index.ts','history'],{cwd:process.cwd(),env:{...process.env,FCU_DATA_DIR:directory},stdio:['ignore','pipe','pipe']});
    let stdout='',stderr='';child.stdout.setEncoding('utf8').on('data',chunk=>stdout+=chunk);child.stderr.setEncoding('utf8').on('data',chunk=>stderr+=chunk);
    const code=await new Promise<number|null>((resolve,reject)=>{child.once('error',reject);child.once('close',resolve);});
    assert.equal(code,0,stderr);for(const value of [secret,fragmentToken,oauthCode])assert(!stdout.includes(value));
    const rows=JSON.parse(stdout) as {url:string}[];assert.equal(rows[0]?.url,'https://example.test/?access_token=REDACTED&search=Paris#access_token=REDACTED&code=REDACTED&state=keep');
  }finally{await rm(directory,{recursive:true,force:true});}
});

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
