import { loadEnvFile } from 'node:process';
import { chmodSync,lstatSync,mkdirSync,realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir,tmpdir } from 'node:os';
import { z } from 'zod';
import { TokenBudget } from './agent/TokenBudget.js';
import { PRESETS,defaultProviderId,resolveProvider,type ProviderSelection } from './llm/providers.js';
import { secretStore } from './profile/SecretStore.js';
export function loadEnvironment(){
  const path=resolve('.env');
  try{
    const info=lstatSync(path);
    if(!info.isFile())throw new Error('Local .env must be a regular file');
    if(process.platform!=='win32'&&(info.mode&0o777)!==(info.mode&0o600))chmodSync(path,info.mode&0o600);
    loadEnvFile(path);
  }catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}
}
export function ensureDataDirectory(path:string){
  const canonical=(value:string)=>{try{return realpathSync(value);}catch{return resolve(value);}};
  const requested=canonical(path),sharedRoots=[resolve('/'),resolve(homedir()),resolve(tmpdir()),resolve('/tmp'),resolve('/var/tmp'),resolve(process.cwd())].map(canonical);
  if(sharedRoots.includes(requested))throw new Error('Choose a dedicated FCU data directory, not a shared system or workspace directory');
  try{
    const info=lstatSync(path);
    if(!info.isDirectory()||info.isSymbolicLink())throw new Error('FCU data path must be a real local directory');
  }catch(error){
    if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
    mkdirSync(path,{recursive:true,mode:0o700});
  }
  if(process.platform!=='win32')chmodSync(path,0o700);
}
const positive=z.coerce.number().int().positive();
const optionalCap=(name:string)=>process.env[name]?positive.parse(process.env[name]):null;
/** Provider, limits and data location for one task. `selection` overrides LLM_PROVIDER/LLM_MODEL for that task. */
export function runtimeConfig(selection:ProviderSelection={}){
  const dataDir=resolve(process.env.FCU_DATA_DIR??'.fcu');
  const providerId=selection.provider??defaultProviderId();
  const subscription=PRESETS[providerId].route==='cli';
  const prices=process.env.LLM_INPUT_PRICE&&process.env.LLM_OUTPUT_PRICE?{
    input:z.coerce.number().nonnegative().parse(process.env.LLM_INPUT_PRICE),output:z.coerce.number().nonnegative().parse(process.env.LLM_OUTPUT_PRICE),
    cachedInput:process.env.LLM_CACHED_INPUT_PRICE?z.coerce.number().nonnegative().parse(process.env.LLM_CACHED_INPUT_PRICE):undefined,
  }:undefined;
  // Configured prices describe the LLM_PROVIDER account; a per-task override has no known price.
  const priced=!subscription&&(!selection.provider||selection.provider===defaultProviderId())&&!selection.model;
  const budget=new TokenBudget({maxLLMCalls:optionalCap('FCU_MAX_LLM_CALLS'),maxInputTokens:optionalCap('FCU_MAX_INPUT_TOKENS'),maxOutputTokens:optionalCap('FCU_MAX_OUTPUT_TOKENS')},priced?prices:undefined);
  const secrets=secretsFor(dataDir);
  const provider=resolveProvider(budget,process.env,secrets,selection);
  return{dataDir,budget,provider,providerId,secrets,maxSteps:optionalCap('FCU_MAX_STEPS'),maxDurationMs:optionalCap('FCU_MAX_DURATION_MS')};
}
// The file store lives in the private data directory, which may not exist yet before first launch.
function secretsFor(dataDir:string){try{return secretStore(dataDir);}catch{return undefined;}}
