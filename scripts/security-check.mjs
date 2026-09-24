import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:20*1024*1024});
const gitBuffer=(args,input)=>execFileSync('git',args,{input,maxBuffer:128*1024*1024});
const forbidden=/(^|\/)(?:\.env(?!\.example$)[^/]*|\.fcu|node_modules|browser-profile)(?:\/|$)/;
const secret=/(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[A-Z0-9]{16})/;
let failures=0,checked=0,historyBlobs=0,historyPaths=0;
function inspect(path,content,label){
  checked++;
  if(forbidden.test(path)){console.error(`Private file tracked: ${label}:${path}`);failures++;}
  if(secret.test(content)){console.error(`Potential credential detected in ${label}:${path} (value suppressed)`);failures++;}
}
for(const path of git('ls-files','-z').split('\0').filter(Boolean))inspect(path,readFileSync(path,'utf8'),'worktree');
if(process.argv.includes('--history')){
  for(const path of new Set(git('log','--all','--format=','--name-only','-z').split('\0').filter(Boolean))){historyPaths++;if(forbidden.test(path)){console.error(`Private file tracked in history: ${path}`);failures++;}}
  const objects=new Set(git('rev-list','--objects','--all').split('\n').filter(Boolean).map(record=>record.split(' ',1)[0]));
  const output=gitBuffer(['cat-file','--batch'],Buffer.from([...objects].join('\n')+'\n'));
  for(let offset=0;offset<output.length;){
    const headerEnd=output.indexOf(10,offset);if(headerEnd<0)throw new Error('Malformed git cat-file batch header');
    const [object,type,sizeText]=output.toString('utf8',offset,headerEnd).split(' '),size=Number(sizeText),start=headerEnd+1,end=start+size;
    if(!Number.isInteger(size)||size<0||output[end]!==10)throw new Error(`Malformed git cat-file batch object ${object}`);
    if(type==='blob'){historyBlobs++;if(secret.test(output.toString('utf8',start,end))){console.error(`Potential credential detected in history blob ${object.slice(0,8)} (value suppressed)`);failures++;}}
    offset=end+1;
  }
}
if(failures){console.error(`${failures} security scan finding(s).`);process.exitCode=1;}else console.log(`Security scan passed: ${checked} worktree files, ${historyPaths} unique historical paths and ${historyBlobs} unique historical blobs; no recognized credentials or private state paths. This pattern check is not a complete security audit.`);
