export type Vault = { profile: Record<string,string>; files: Record<string,string> };
export class VariableResolver {
  constructor(readonly vault:Vault={profile:{},files:{}}) {}
  resolve(value:string):string {
    return value.replace(/\{\{([^}]+)\}\}/g,(_,path:string)=>{
      const [group,key,...extra]=path.trim().split('.');
      if(extra.length||!['profile','files'].includes(group??'')||!key||['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid local variable reference');
      const dictionary=group==='profile'?this.vault.profile:this.vault.files;
      if(!Object.hasOwn(dictionary,key))throw new Error(`Missing local variable ${group}.${key}`);
      return dictionary[key]!;
    });
  }
  file(value:string) {
    if(!/^\{\{files\.[\w-]+\}\}$/.test(value))throw new Error('Uploads require an explicit {{files.alias}} from the local vault');
    return this.resolve(value);
  }
  aliases() {return {profile:Object.keys(this.vault.profile),files:Object.keys(this.vault.files)};}
  redact(value:string) {
    let result=value;
    for(const [group,dictionary] of Object.entries(this.vault)) {
      for(const [name,secret] of Object.entries(dictionary)) if(secret.length>1) result=result.split(secret).join(`{{${group}.${name}}}`);
    }
    return result.replace(/sk-[a-zA-Z0-9_-]{16,}/g,'[redacted key]');
  }
}
