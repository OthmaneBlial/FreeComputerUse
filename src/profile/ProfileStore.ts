import { chmod, lstat, mkdir, open, readFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Vault } from './VariableResolver.js';
const alias=z.string().regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const VaultSchema=z.object({profile:z.record(alias,z.string().max(10000)),files:z.record(alias,z.string().max(10000))}).strict();
export class ProfileStore {
  constructor(readonly path:string) {}
  async load():Promise<Vault> {
    try{
      const info=await lstat(this.path);
      if(!info.isFile()||info.isSymbolicLink())throw new Error('Local profile must be a regular file');
      return VaultSchema.parse(JSON.parse(await readFile(this.path,'utf8')));
    }
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{profile:{},files:{}};throw error;}
  }
  async save(vault:Vault) {
    const data=VaultSchema.parse(vault);
    const folder=dirname(this.path);await mkdir(folder,{recursive:true,mode:0o700});
    try{
      const info=await lstat(this.path);
      if(!info.isFile()||info.isSymbolicLink())throw new Error('Local profile must be a regular file');
    }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
    const temporary=`${this.path}.${randomUUID()}.tmp`,file=await open(temporary,'wx',0o600);
    try{
      await file.writeFile(JSON.stringify(data,null,2)+'\n');await file.sync();await file.close();
      await rename(temporary,this.path);await chmod(this.path,0o600);
    }finally{await file.close().catch(()=>{});await unlink(temporary).catch(()=>{});}
  }
}
