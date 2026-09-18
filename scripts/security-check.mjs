import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const forbidden=/(^|\/)(?:\.env(?!\.example$)[^/]*|\.fcu|node_modules|browser-profile)(?:\/|$)/;
const secret=/(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})/;
let failures=0,checked=0;
function inspect(path,content,label){
  checked++;
  if(forbidden.test(path)){console.error(`Private file tracked: ${label}:${path}`);failures++;}
  if(secret.test(content)){console.error(`Potential credential detected in ${label}:${path} (value suppressed)`);failures++;}
}
for(const path of git('ls-files','-z').split('\0').filter(Boolean))inspect(path,readFileSync(path,'utf8'),'worktree');
if(process.argv.includes('--history'))for(const revision of git('rev-list','--all').trim().split('\n').filter(Boolean)){
  for(const path of git('ls-tree','-r','--name-only','-z',revision).split('\0').filter(Boolean))inspect(path,git('show',`${revision}:${path}`),revision.slice(0,8));
}
if(failures){console.error(`${failures} security scan finding(s).`);process.exitCode=1;}else console.log(`Security scan passed: ${checked} tracked file versions; no recognized credentials or private state paths. This pattern check is not a complete security audit.`);
