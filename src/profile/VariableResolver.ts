export type Vault = { profile: Record<string,string>; files: Record<string,string> };
function sensitiveQueryParameter(value:string){
  let name=value;try{name=decodeURIComponent(value.replaceAll('+',' '));}catch{}
  const normalized=name.toLowerCase().replace(/[^a-z0-9]/g,'');
  return /(?:token|secret|password|passwd|passcode|pwd|pin|authorization|auth|session|sessionid|cookie|signature|sig|credential|otp|cvv|cvc|csc|cardnumber|cardholder|securitycode|verificationcode|onetimecode|2facode|expiration|expiry|accountnumber|routingnumber|iban|swift|sortcode)$/.test(normalized)||
    /^(?:key|apikey|accesskey|clientkey|privatekey|subscriptionkey|signingkey|code|oauthcode|authorizationcode|authenticationcode|authcode|codeverifier|passwordconfirmation|ccnumber|ccnum|creditcard|debitcard|state|nonce|csrf|xsrf|sid)$/.test(normalized);
}
function encodedPattern(value:string){
  const hex=(digit:string)=>digit.toLowerCase()===digit.toUpperCase()?digit:`[${digit.toLowerCase()}${digit.toUpperCase()}]`;
  return value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/%([0-9a-f])([0-9a-f])/gi,(_match,high:string,low:string)=>`%${hex(high)}${hex(low)}`);
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
    const secrets=Object.entries(this.vault).flatMap(([group,dictionary])=>Object.entries(dictionary).flatMap(([name,secret])=>{
      if(secret.length<=1)return[];
      const alias=`{{${group}.${name}}}`,escaped=JSON.stringify(secret).slice(1,-1),formEncoded=new URLSearchParams([['value',secret]]).toString().slice('value='.length);
      return [...new Set([secret,escaped])].map(value=>({alias,value,encoded:false})).concat([...new Set([encodeURIComponent(secret),formEncoded])].map(value=>({alias,value,encoded:true})));
    })).sort((a,b)=>b.value.length-a.value.length);
    for(const {alias,value,encoded} of secrets){
      result=result.split(value).join(alias);
      if(encoded)result=result.replace(new RegExp(encodedPattern(value),'g'),alias);
    }
    return result
      .replace(/([?&#])([^=?&#\s"'<>()[\]]+)=([^&#\s"'<>),}\]]*)/g,(match,separator:string,name:string)=>sensitiveQueryParameter(name)?`${separator}${name}=REDACTED`:match)
      .replace(/\bBearer\s+[A-Za-z0-9._~+/-]{12,}={0,2}/gi,'Bearer [redacted]')
      .replace(/(?:github_pat_[a-zA-Z0-9_-]{20,}|gh[pour]_[a-zA-Z0-9_-]{20,}|ghs_[a-zA-Z0-9_.-]{20,}|gl(?:pat|oas|dt|rtr|rt|cbt|ptt|ft|imt|agent|wt|soat|ffct)-[a-zA-Z0-9_-]{16,}|xox[a-z]-[a-zA-Z0-9_-]{10,}|x(?:app|wfp)-[a-zA-Z0-9_-]{10,})/g,'[redacted key]')
      .replace(/sk-[a-zA-Z0-9_-]{16,}/g,'[redacted key]');
  }
}
