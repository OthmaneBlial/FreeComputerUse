export function safeCliEnvironment(){
  const env={...process.env};
  for(const key of Object.keys(env))if(/(?:API[_-]?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH)/i.test(key)||key==='NODE_OPTIONS')delete env[key];
  return env;
}
export function parseCliVersion(output:string,label:string){
  const version=output.match(/\b(\d+\.\d+\.\d+)\b/)?.[1];
  if(!version)throw new Error(`${label} did not report a semantic version`);
  return version;
}
export function cliVersionAtLeast(version:string,minimum:string){
  const actual=version.split('.').map(Number),required=minimum.split('.').map(Number);
  for(let index=0;index<3;index++)if((actual[index]??0)!==(required[index]??0))return (actual[index]??0)>(required[index]??0);
  return true;
}
