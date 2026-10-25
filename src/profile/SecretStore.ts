import { execFileSync,spawnSync } from 'node:child_process';
import { chmodSync,lstatSync,readFileSync,renameSync,writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/** API keys entered in the dashboard. Values are write-only for the UI and never leave this machine. */
export interface SecretStore {readonly kind:'keychain'|'file';get(name:string):string|undefined;set(name:string,value:string):void;delete(name:string):void}
const NAME=/^[a-z][a-z0-9-]{0,40}$/;
// Keys are passed to `security -i` on stdin; restricting the alphabet removes every quoting concern.
export const SECRET_VALUE=/^[A-Za-z0-9._~+/=:-]{8,512}$/;
const SERVICE='free-computer-use';
function checkName(name:string){if(!NAME.test(name))throw new Error('Invalid secret name');}
function checkValue(value:string){if(!SECRET_VALUE.test(value))throw new Error('API key must be 8-512 printable characters without spaces or quotes');}

export class KeychainSecretStore implements SecretStore {
  readonly kind='keychain';
  get(name:string){
    checkName(name);
    try{return execFileSync('security',['find-generic-password','-s',SERVICE,'-a',name,'-w'],{encoding:'utf8',stdio:['ignore','pipe','ignore'],timeout:5000}).trim()||undefined;}
    catch{return undefined;}
  }
  set(name:string,value:string){
    checkName(name);checkValue(value);
    const result=spawnSync('security',['-i'],{input:`add-generic-password -U -s ${SERVICE} -a ${name} -w ${value}\n`,stdio:['pipe','ignore','ignore'],timeout:5000});
    if(result.status!==0||this.get(name)!==value)throw new Error('macOS Keychain did not store the API key');
  }
  delete(name:string){checkName(name);try{execFileSync('security',['delete-generic-password','-s',SERVICE,'-a',name],{stdio:'ignore',timeout:5000});}catch{/* already absent */}}
}

export class FileSecretStore implements SecretStore {
  readonly kind='file';
  readonly path:string;
  constructor(dataDir:string){this.path=join(dataDir,'secrets.json');}
  private load():Record<string,string>{
    try{
      const info=lstatSync(this.path);
      if(!info.isFile()||info.isSymbolicLink())throw new Error('Local secret file must be a regular file');
      const value=JSON.parse(readFileSync(this.path,'utf8')) as unknown;
      return value&&typeof value==='object'&&!Array.isArray(value)?Object.fromEntries(Object.entries(value).filter((entry):entry is [string,string]=>NAME.test(entry[0])&&typeof entry[1]==='string')):{};
    }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{};throw error;}
  }
  private save(values:Record<string,string>){
    const temporary=`${this.path}.${randomUUID()}.tmp`;
    writeFileSync(temporary,JSON.stringify(values,null,2)+'\n',{mode:0o600,flag:'wx'});
    renameSync(temporary,this.path);chmodSync(this.path,0o600);
  }
  get(name:string){checkName(name);return this.load()[name];}
  set(name:string,value:string){checkName(name);checkValue(value);this.save({...this.load(),[name]:value});}
  delete(name:string){checkName(name);const values=this.load();if(!(name in values))return;delete values[name];this.save(values);}
}

export function secretStore(dataDir:string,env:NodeJS.ProcessEnv=process.env):SecretStore{
  const kind=env.FCU_SECRET_STORE??(process.platform==='darwin'?'keychain':'file');
  if(kind!=='keychain'&&kind!=='file')throw new Error('FCU_SECRET_STORE must be keychain or file');
  if(kind==='keychain'&&process.platform!=='darwin')throw new Error('FCU_SECRET_STORE=keychain is only available on macOS');
  return kind==='keychain'?new KeychainSecretStore():new FileSecretStore(dataDir);
}
