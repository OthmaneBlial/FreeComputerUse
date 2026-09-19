import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { z } from 'zod';
import { TokenBudget } from './agent/TokenBudget.js';
import { FlashProvider } from './llm/FlashProvider.js';
export function loadEnvironment(){try{loadEnvFile(resolve('.env'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
const positive=z.coerce.number().int().positive();
const optionalCap=(name:string)=>process.env[name]?positive.parse(process.env[name]):null;
export function runtimeConfig(){
  const dataDir=resolve(process.env.FCU_DATA_DIR??'.fcu');
  const prices=process.env.LLM_INPUT_PRICE&&process.env.LLM_OUTPUT_PRICE?{
    input:z.coerce.number().nonnegative().parse(process.env.LLM_INPUT_PRICE),output:z.coerce.number().nonnegative().parse(process.env.LLM_OUTPUT_PRICE),
    cachedInput:process.env.LLM_CACHED_INPUT_PRICE?z.coerce.number().nonnegative().parse(process.env.LLM_CACHED_INPUT_PRICE):undefined,
  }:undefined;
  const budget=new TokenBudget({maxLLMCalls:optionalCap('FCU_MAX_LLM_CALLS'),maxInputTokens:optionalCap('FCU_MAX_INPUT_TOKENS'),maxOutputTokens:optionalCap('FCU_MAX_OUTPUT_TOKENS')},prices);
  const provider=process.env.LLM_API_KEY?new FlashProvider({key:process.env.LLM_API_KEY,model:process.env.LLM_MODEL??'deepseek-flash',baseURL:process.env.LLM_BASE_URL??'https://api.deepseek.com',format:process.env.LLM_RESPONSE_FORMAT==='json_schema'?'json_schema':'json_object'},budget):undefined;
  return{dataDir,budget,provider};
}
