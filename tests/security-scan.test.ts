import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

test('history security scan finds deleted secrets and private paths without printing the secret',()=>{
  const repository=mkdtempSync(join(tmpdir(),'fcu-security-history-'));
  const checker=fileURLToPath(new URL('../scripts/security-check.mjs',import.meta.url));
  const git=(...args:string[])=>execFileSync('git',args,{cwd:repository,encoding:'utf8',stdio:'pipe'});
  try{
    git('init','--quiet');git('config','user.email','security-test@example.invalid');git('config','user.name','Security Scan Test');
    const syntheticCredential=`sk-${'a'.repeat(24)}`;
    writeFileSync(join(repository,'safe.txt'),'safe current content');
    writeFileSync(join(repository,'.env.local'),`API_KEY=${syntheticCredential}\n`);
    writeFileSync(join(repository,'removed-secret.txt'),syntheticCredential);
    git('add','--all');git('commit','--quiet','-m','add historical test data');
    rmSync(join(repository,'.env.local'));rmSync(join(repository,'removed-secret.txt'));
    git('add','--all');git('commit','--quiet','-m','remove historical test data');

    const current=spawnSync(process.execPath,[checker],{cwd:repository,encoding:'utf8'});
    assert.equal(current.status,0,current.stderr);
    assert.match(current.stdout,/worktree files/);

    const history=spawnSync(process.execPath,[checker,'--history'],{cwd:repository,encoding:'utf8'});
    const output=history.stdout+history.stderr;
    assert.equal(history.status,1,output);
    assert.match(output,/Private file tracked in history: \.env\.local/);
    assert.match(output,/Potential credential detected in history blob/);
    assert.doesNotMatch(output,new RegExp(syntheticCredential));
  }finally{rmSync(repository,{recursive:true,force:true});}
});
