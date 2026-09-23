import {test} from 'node:test';
import assert from 'node:assert/strict';
import {access,chmod,mkdtemp,readdir,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProfileStore} from '../src/profile/ProfileStore.js';
import {TraceStore,type Trace} from '../src/history/TraceStore.js';
import {startServer} from '../src/server/index.js';

test('profile imports accept only vault fields and invalid imports preserve stored data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-profile-')),store=new ProfileStore(join(dir,'profile.json'));
  const valid={profile:{displayName:'Zoë'},files:{resume:'/users/me/resume.pdf'}};
  try{
    await store.save(valid);
    await assert.rejects(store.save({...valid,provider:{apiKey:'must-not-be-stored'}} as never));
    assert.deepEqual(await store.load(),valid);
    assert.deepEqual(JSON.parse(await readFile(store.path,'utf8')),valid);
    if(process.platform!=='win32')assert.equal((await stat(store.path)).mode&0o777,0o600);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('a failed profile replacement preserves the previous saved vault',async t=>{
  if(process.platform==='win32'||process.getuid?.()===0){t.skip('The filesystem permission failure cannot be simulated on this platform or as root');return;}
  const dir=await mkdtemp(join(tmpdir(),'fcu-profile-failed-write-')),store=new ProfileStore(join(dir,'profile.json'));
  const valid={profile:{displayName:'Existing'},files:{}},replacement={profile:{displayName:'Uncommitted'},files:{}};
  try{
    await store.save(valid);const previous=await readFile(store.path);
    await chmod(dir,0o500);
    await assert.rejects(store.save(replacement),(error:NodeJS.ErrnoException)=>error.code==='EACCES'||error.code==='EPERM');
    assert.deepEqual(await store.load(),valid);assert.deepEqual(await readFile(store.path),previous);assert.deepEqual(await readdir(dir),['profile.json']);
  }finally{await chmod(dir,0o700).catch(()=>{});await rm(dir,{recursive:true,force:true});}
});

test('profile reads and writes reject symbolic links without changing their targets',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-profile-link-')),outside=await mkdtemp(join(tmpdir(),'fcu-profile-outside-'));
  const path=join(dir,'profile.json'),target=join(outside,'private.json'),value={profile:{displayName:'Existing'},files:{}};
  const store=new ProfileStore(path);
  try{
    await writeFile(target,JSON.stringify(value));await symlink(target,path);
    await assert.rejects(store.load(),/regular file/);
    await assert.rejects(store.save({profile:{displayName:'Changed'},files:{}}),/regular file/);
    assert.deepEqual(JSON.parse(await readFile(target,'utf8')),value);
  }finally{await rm(dir,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test('stopped local data can be deleted and recreated without restoring old runs',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'fcu-data-lifecycle-')),history=join(dir,'history.sqlite'),previous=process.env.FCU_DATA_DIR;
  let dashboard:Awaited<ReturnType<typeof startServer>>|undefined;
  try{
    await chmod(dir,0o755);
    process.env.FCU_DATA_DIR=dir;dashboard=await startServer({port:0,quiet:true});await dashboard.close();dashboard=undefined;
    if(process.platform!=='win32'){assert.equal((await stat(dir)).mode&0o777,0o700);assert.equal((await stat(history)).mode&0o777,0o600);}
    const stored=new TraceStore(history),trace:Trace={version:1,id:'before-delete',goal:'Private run',url:'http://example.test/',status:'completed',startedAt:1,durationMs:0,plans:[],actions:[],completion:[],calls:[],metrics:{}};
    try{for(let index=0;index<40;index++)stored.save({...trace,id:`before-delete-${index}`,startedAt:index});assert.equal(stored.history(1000).length,40);assert.equal(stored.history(12).length,12);}finally{stored.close();}
    await access(history);await rm(dir,{recursive:true,force:true});await assert.rejects(access(history));
    dashboard=await startServer({port:0,quiet:true});await dashboard.close();dashboard=undefined;
    await access(history);const store=new TraceStore(history);try{assert.deepEqual(store.history(),[]);}finally{store.close();}
  }finally{
    await dashboard?.close();await rm(dir,{recursive:true,force:true});
    if(previous===undefined)delete process.env.FCU_DATA_DIR;else process.env.FCU_DATA_DIR=previous;
  }
});
