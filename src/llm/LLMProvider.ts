import type { Plan,Repair } from '../actions/schema.js';
import type { Usage } from '../agent/TokenBudget.js';
export interface PlanningContext {
  goal:string;page:string;aliases:{profile:string[];files:string[];params?:string[]};
  completed:string[];allowedOrigins:string[];phase?:string;
  /** A procedure's remaining saved steps, as guidance when they no longer match the page (labels may be translated). */
  savedSteps?:unknown[];
  /** A procedure's success checks; a plan returns their equivalent on this page. */
  savedChecks?:unknown[];
  trustedCompletionCriteria?:unknown[];
}
export interface RepairContext extends PlanningContext {
  failedAction:unknown;error:string;remaining:unknown[];failedConditions?:unknown[];
  /** Base64 JPEG of the viewport, only with FCU_VISION=1 and a provider that accepts images. */
  screenshot?:string;
}
export interface ConnectionTest {ok:true;provider:string;model:string;latencyMs:number;usage:Usage;detail:string}
export interface LLMProvider {
  readonly name:string;
  /** Accepts a screenshot in repair requests. */
  readonly vision?:boolean;
  cancel?():void;
  /** Called by the agent at the start of each task. */
  reset?():void;
  plan(context:PlanningContext):Promise<Plan>;
  repair(context:RepairContext):Promise<Repair>;
  classify?(goal:string):Promise<{intent:string}>;
  testConnection?():Promise<ConnectionTest>;
}
export interface LLMCall {operation:string;model:string;provider?:string;durationMs:number;usage:Usage;success:boolean;error?:string}
