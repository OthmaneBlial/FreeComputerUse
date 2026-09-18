import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Vault } from './VariableResolver.js';
const alias=z.string().regex(/^(?!__proto__$|constructor$|prototype$)[A-Za-z][A-Za-z0-9_-]{0,79}$/);
const VaultSchema=z.object({profile:z.record(alias,z.string().max(10000)),files:z.record(alias,z.string().max(10000))}).strict();
export class ProfileStore {
  constructor(readonly path:string) {}
  async load():Promise<Vault> {
    try{return VaultSchema.parse(JSON.parse(await readFile(this.path,'utf8')));}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{profile:{},files:{}};throw error;}
  }
  async save(vault:Vault) {
    const data=VaultSchema.parse(vault);
    await mkdir(dirname(this.path),{recursive:true,mode:0o700});
    await writeFile(this.path,JSON.stringify(data,null,2)+'\n',{mode:0o600});
    await chmod(this.path,0o600);
  }
}
