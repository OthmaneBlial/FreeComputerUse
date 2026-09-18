import { createHash } from 'node:crypto';
import { PlanSchema,type Action,type Condition,type Plan } from '../actions/schema.js';
import type { PageState } from '../browser/types.js';
import type { TraceStore,Trace } from '../history/TraceStore.js';
export const normalizeIntent=(goal:string)=>goal.toLowerCase().replace(/\s+/g,' ').trim();
export const structureHash=(state:PageState)=>createHash('sha256').update(JSON.stringify(state.elements.map(e=>[e.role,e.name,e.type,e.required]))).digest('hex').slice(0,20);
export interface Workflow {id:string;origin:string;path:string;intent:string;structure:string;plan:Plan;learnedFrom:string;createdAt:number}
export class WorkflowEngine {
  constructor(readonly store:TraceStore){}
  match(goal:string,state:PageState):Workflow|undefined{
    const url=new URL(state.url);const intent=normalizeIntent(goal),structure=structureHash(state);
    const rows=this.store.db.prepare('SELECT workflow FROM workflows WHERE domain=? AND intent=? AND structure=?').all(url.origin,intent,structure);
    for(const row of rows){const workflow=JSON.parse(row.workflow as string) as Workflow;if(workflow.path===url.pathname){
      PlanSchema.parse(workflow.plan);this.store.db.prepare('UPDATE workflows SET hits=hits+1 WHERE id=?').run(workflow.id);return workflow;
    }}return;
  }
  learn(trace:Trace,initial:PageState){
    if(trace.status!=='completed'||!trace.actions.length)return;
    const actions=trace.actions.filter(result=>result.success).map(result=>result.action);
    const completion=[...new Map(trace.completion.map(c=>[JSON.stringify(c),c])).values()];
    if(actions.length>80||completion.length>12)return;
    if(actions.some(action=>containsRef(action)))return; // Only portable semantic workflows.
    const url=new URL(initial.url),intent=normalizeIntent(trace.goal),structure=structureHash(initial);
    const id=createHash('sha256').update([url.origin,url.pathname,intent,structure].join('\n')).digest('hex').slice(0,16);
    const plan=PlanSchema.parse({goal:trace.goal,steps:trace.plans.flatMap(p=>p.steps).slice(0,12),actions,completion,continue:false});
    const workflow:Workflow={id,origin:url.origin,path:url.pathname,intent,structure,plan,learnedFrom:trace.id,createdAt:Date.now()};
    this.store.db.prepare('INSERT OR REPLACE INTO workflows(id,domain,intent,structure,workflow,hits) VALUES(?,?,?,?,?,COALESCE((SELECT hits FROM workflows WHERE id=?),0))').run(id,url.origin,intent,structure,JSON.stringify(workflow),id);
    return workflow;
  }
  list(){return this.store.db.prepare('SELECT id,domain,intent,hits FROM workflows ORDER BY hits DESC').all();}
  get(id:string){const row=this.store.db.prepare('SELECT workflow FROM workflows WHERE id=?').get(id);return row?JSON.parse(row.workflow as string) as Workflow:undefined;}
}
function containsRef(action:Action|Condition){
  if('target'in action&&typeof action.target==='string')return true;
  if('condition'in action&&containsRef(action.condition))return true;
  if('verify'in action&&action.verify?.some(containsRef))return true;
  return false;
}
