import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm,stat,symlink,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProfileStore} from '../src/profile/ProfileStore.js';

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
