export type Vault = { profile: Record<string,string>; files: Record<string,string> };
function sensitiveQueryParameter(value:string){
  let name=value;try{name=decodeURIComponent(value.replaceAll('+',' '));}catch{}
  const normalized=name.toLowerCase().replace(/[^a-z0-9]/g,'');
  return /(?:token|secret|password|passwd|pwd|authorization|auth|session|sessionid|cookie|signature|sig|credential)$/.test(normalized)||
    /^(?:key|apikey|accesskey|clientkey|privatekey|subscriptionkey|signingkey|code|oauthcode|authorizationcode|codeverifier)$/.test(normalized);
}
export class VariableResolver {
  constructor(public vault:Vault={profile:{},files:{}}) {}
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
    const secrets=Object.entries(this.vault).flatMap(([group,dictionary])=>Object.entries(dictionary).map(([name,secret])=>({alias:`{{${group}.${name}}}`,secret}))).sort((a,b)=>b.secret.length-a.secret.length);
    for(const {alias,secret} of secrets) if(secret.length>1){
      result=result.split(secret).join(alias);
      // Traces/prompts are often JSON-serialized: redact escaped values too.
      const escaped=JSON.stringify(secret).slice(1,-1);
      if(escaped!==secret)result=result.split(escaped).join(JSON.stringify(alias).slice(1,-1));
    }
    return result
      .replace(/([?&])([^=?&#\s"'<>()[\]]+)=([^&#\s"'<>),}\]]*)/g,(match,separator:string,name:string)=>sensitiveQueryParameter(name)?`${separator}${name}=REDACTED`:match)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/gi,'Bearer [redacted]')
      .replace(/sk-[a-zA-Z0-9_-]{16,}/g,'[redacted key]');
  }
}
