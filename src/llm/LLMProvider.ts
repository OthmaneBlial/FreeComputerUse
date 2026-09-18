import type { Plan,Repair } from '../actions/schema.js';
import type { Usage } from '../agent/TokenBudget.js';
export interface PlanningContext {
  goal:string;page:string;aliases:{profile:string[];files:string[]};
  completed:string[];allowedOrigins:string[];phase?:string;
  trustedCompletionCriteria?:unknown[];
}
export interface RepairContext extends PlanningContext {
  failedAction:unknown;error:string;remaining:unknown[];failedConditions?:unknown[];
}
export interface LLMProvider {
  readonly name:string;
  cancel?():void;
  plan(context:PlanningContext):Promise<Plan>;
  repair(context:RepairContext):Promise<Repair>;
  classify?(goal:string):Promise<{intent:string}>;
}
export interface LLMCall {operation:string;model:string;durationMs:number;usage:Usage;success:boolean;error?:string}
