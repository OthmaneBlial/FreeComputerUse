import { loadEnvFile } from 'node:process';
import { resolve } from 'node:path';
import { z } from 'zod';
import { TokenBudget } from './agent/TokenBudget.js';
import { FlashProvider } from './llm/FlashProvider.js';
import { CodexSubscriptionProvider } from './llm/CodexSubscriptionProvider.js';
import { ClaudeSubscriptionProvider } from './llm/ClaudeSubscriptionProvider.js';
export function loadEnvironment(){try{loadEnvFile(resolve('.env'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
const positive=z.coerce.number().int().positive();
const optionalCap=(name:string)=>process.env[name]?positive.parse(process.env[name]):null;
export function runtimeConfig(){
  const dataDir=resolve(process.env.FCU_DATA_DIR??'.fcu');
  const providerKind=process.env.LLM_PROVIDER??'openai-compatible';
  if(!['openai-compatible','anthropic','codex-subscription','claude-subscription'].includes(providerKind))throw new Error('LLM_PROVIDER must be openai-compatible, anthropic, codex-subscription or claude-subscription');
  const subscription=providerKind==='codex-subscription'||providerKind==='claude-subscription';
  const prices=process.env.LLM_INPUT_PRICE&&process.env.LLM_OUTPUT_PRICE?{
    input:z.coerce.number().nonnegative().parse(process.env.LLM_INPUT_PRICE),output:z.coerce.number().nonnegative().parse(process.env.LLM_OUTPUT_PRICE),
    cachedInput:process.env.LLM_CACHED_INPUT_PRICE?z.coerce.number().nonnegative().parse(process.env.LLM_CACHED_INPUT_PRICE):undefined,
  }:undefined;
  const budget=new TokenBudget({maxLLMCalls:optionalCap('FCU_MAX_LLM_CALLS'),maxInputTokens:optionalCap('FCU_MAX_INPUT_TOKENS'),maxOutputTokens:optionalCap('FCU_MAX_OUTPUT_TOKENS')},subscription?undefined:prices);
  const model=process.env.LLM_MODEL||(providerKind==='anthropic'||subscription?undefined:'deepseek-flash');
  const provider=providerKind==='codex-subscription'?new CodexSubscriptionProvider({command:process.env.CODEX_CLI_PATH,model},budget):providerKind==='claude-subscription'?new ClaudeSubscriptionProvider({command:process.env.CLAUDE_CLI_PATH,model},budget):process.env.LLM_API_KEY?new FlashProvider({key:process.env.LLM_API_KEY,model:model??'',protocol:providerKind==='anthropic'?'anthropic':'openai-chat',baseURL:process.env.LLM_BASE_URL??(providerKind==='anthropic'?'https://api.anthropic.com/v1':'https://api.deepseek.com'),format:process.env.LLM_RESPONSE_FORMAT==='json_schema'?'json_schema':'json_object'},budget):undefined;
  return{dataDir,budget,provider};
}
