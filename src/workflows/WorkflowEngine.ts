import { createHash,randomBytes } from 'node:crypto';
import { z } from 'zod';
import { ConditionSchema,PlanSchema,type Action,type Condition,type Plan } from '../actions/schema.js';
import type { PageState } from '../browser/types.js';
import type { TraceStore,Trace } from '../history/TraceStore.js';
export const normalizeIntent=(goal:string)=>goal.toLowerCase().replace(/\s+/g,' ').trim();
export const structureHash=(state:PageState)=>createHash('sha256').update(JSON.stringify(state.elements.map(e=>[e.role,e.name,e.tag,e.type,e.required,e.form,e.region,e.href,e.options,e.optionValues]))).digest('hex').slice(0,20);

const name=z.string().regex(/^[A-Za-z][\w-]{0,39}$/,'Parameter names use letters, digits, - and _');
export const ParameterSchema=z.object({
  name,kind:z.enum(['text','file','secret']).default('text'),description:z.string().max(300).optional(),
  // Words that introduce the value in a request, e.g. "version" in "deploy version 1.4".
  aliases:z.array(z.string().min(1).max(40)).max(8).optional(),pattern:z.string().max(200).optional(),required:z.boolean().default(true),
}).strict().refine(param=>{if(!param.pattern)return true;try{new RegExp(param.pattern,'u');return true;}catch{return false;}},'Invalid parameter pattern');
export type Parameter=z.infer<typeof ParameterSchema>;
export type Source='learned'|'taught'|'imported'|'repaired'|'edited';
export interface Version {version:number;plan:Plan;savedAt:number;reason:string}
export interface Workflow {
  id:string;origin:string;path:string;intent:string;structure:string;plan:Plan;learnedFrom:string;createdAt:number;
  // Procedure fields; learned workflows saved before procedures existed have none of them.
  name?:string;description?:string;source?:Source;startUrl?:string;parameters?:Parameter[];preconditions?:Condition[];keywords?:string[];
  version?:number;versions?:Version[];updatedAt?:number;lastValidatedAt?:number;
}
export const ProcedureSchema=z.object({
  name:z.string().min(1).max(120),description:z.string().max(1000).default(''),startUrl:z.url(),intent:z.string().min(1).max(4000).optional(),
  keywords:z.array(z.string().min(1).max(40)).max(30).default([]),parameters:z.array(ParameterSchema).max(20).default([]),
  preconditions:z.array(ConditionSchema).max(12).default([]),plan:PlanSchema,
}).strict().superRefine((procedure,context)=>{
  const declared=new Set(procedure.parameters.map(param=>param.name));
  if(declared.size!==procedure.parameters.length)context.addIssue({code:'custom',path:['parameters'],message:'Parameter names must be unique'});
  for(const used of JSON.stringify(procedure.plan).matchAll(/\{\{\s*params\.([\w-]+)\s*\}\}/g))if(!declared.has(used[1]!))context.addIssue({code:'custom',path:['plan'],message:`Undeclared parameter ${used[1]}`});
  if(procedure.plan.actions.some(containsRef))context.addIssue({code:'custom',path:['plan'],message:'Procedures need semantic targets, not page references'});
});
export type ProcedureInput=z.input<typeof ProcedureSchema>;
export const ProcedureFileSchema=z.object({format:z.literal('fcu-procedure'),version:z.literal(1),procedure:ProcedureSchema}).strict();
export interface RunSummary {runs:number;completed:number;successRate:number|null;lastRunAt?:number}
export interface Match {workflow:Workflow;score:number;values:Record<string,string>;missing:Parameter[]}
const MAX_VERSIONS=10;

// Request words in English and French reduced to one concept, so "Déploie la version" finds "Publish a release".
const GROUPS=[
  ['release','deploy','deploie','deployer','deployez','deployment','deploiement','publish','publie','publier','publiez','publication','ship','livrer','livre','rollout','sortir'],
  ['production','prod'],['create','creer','cree','creez','new','nouveau','nouvelle','add','ajouter','ajoute'],
  ['upload','uploader','televerser','televerse','importer','importe','envoyer'],['app','application','appli','apps'],
  ['version','build','versioncode'],['delete','supprimer','supprime','remove','effacer','retirer'],
  ['download','telecharger','telecharge','export','exporter','exporte'],['invoice','facture','bill'],['send','envoie','envoyer'],
  ['update','modifier','modifie','edit','change','changer','mettre'],['view','voir','open','ouvrir','ouvre','afficher','show'],
  ['note','notes','changelog','nouveautes'],['file','fichier','bundle','aab'],['test','tester','testing'],['fill','remplir','remplis','complete'],
];
const CANONICAL=new Map(GROUPS.flatMap(group=>group.map(word=>[word,group[0]!] as const)));
const STOP=new Set('a an the of to for with in on at by and or my me please this that these those from into via using use it its is be then ce cet cette ces le la les l un une des de du d avec pour sur dans et ou mon ma mes moi stp svp sil plait vous tu je j m en au aux par puis qui que'.split(' '));
const fold=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase();
export function intentTokens(value:string){
  return new Set((fold(value).match(/[\p{L}\p{N}]+/gu)??[]).filter(word=>!STOP.has(word)&&!/^\d+$/.test(word)).map(word=>CANONICAL.get(word)??CANONICAL.get(word.replace(/s$/,''))??word.replace(/(?<=\w{3})s$/,'')));
}
const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const pathLike=(value:string)=>/^(~|\.{1,2}[\\/]|[\\/]|[A-Za-z]:\\)/.test(value)||/\.[A-Za-z0-9]{2,5}$/.test(value);
/** Reads a parameter from a request without a model call: "<alias> <value>", a quoted value, or the only token matching its pattern. */
export function extractParameter(goal:string,param:Parameter):string|undefined{
  const pattern=param.pattern?new RegExp(param.pattern,'u'):undefined,fits=(value:string)=>(!pattern||pattern.test(value))&&(param.kind!=='file'||pathLike(value));
  const words=[param.name,param.name.replace(/[_-]+/g,' '),...(param.aliases??[])].map(word=>escape(word).replace(/ /g,'\\s+'));
  const introduced=new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:${words.join('|')})(?:\\s*[:=]\\s*|\\s+(?:(?:named|called|nomm[ée]e?|appel[ée]e?)\\s+)?)(?:["«“]([^"»”]{1,300})["»”]|([^\\s,;"«“]+))`,'giu');
  for(const found of goal.matchAll(introduced)){const value=(found[1]??found[2]!).replace(/[.!?]+$/,'');if(value&&fits(value))return value;}
  if(!pattern&&param.kind!=='file')return;
  const candidates=[...new Set(goal.split(/[\s,;]+/).map(token=>token.replace(/^["'«“(]+|["'»”),.!?]+$/g,'')).filter(token=>token&&fits(token)))];
  return candidates.length===1?candidates[0]:undefined;
}
export function procedureTokens(workflow:Workflow){
  return intentTokens([workflow.name??'',workflow.intent,workflow.description??'',...(workflow.keywords??[]),...(workflow.parameters??[]).flatMap(param=>[param.name,...(param.aliases??[])])].join(' '));
}
/** Replaces literal values with {{params.name}} so a run with other values can reuse the steps. Values shorter than three characters only replace whole fields. */
export function parameterize<T>(value:T,values:Record<string,string>):T{
  const entries=Object.entries(values).filter(([,literal])=>literal.length>0).sort((a,b)=>b[1].length-a[1].length);
  const walk=(item:unknown,key?:string):unknown=>{
    if(typeof item==='string'){
      if(key==='type')return item;
      for(const [param,literal] of entries)if(item===literal)return `{{params.${param}}}`;
      let result=item;for(const [param,literal] of entries)if(literal.length>=3)result=result.split(literal).join(`{{params.${param}}}`);return result;
    }
    if(Array.isArray(item))return item.map(entry=>walk(entry));
    if(item&&typeof item==='object')return Object.fromEntries(Object.entries(item).map(([field,entry])=>[field,walk(entry,field)]));
    return item;
  };
  return walk(value) as T;
}
export class WorkflowEngine {
  constructor(readonly store:TraceStore){
    store.db.exec('CREATE TABLE IF NOT EXISTS workflow_runs(id TEXT PRIMARY KEY, workflow TEXT, version INTEGER, started INTEGER, status TEXT, duration INTEGER, llm_calls INTEGER, repaired INTEGER, error TEXT); CREATE INDEX IF NOT EXISTS workflow_runs_by_workflow ON workflow_runs(workflow,started DESC);');
  }
  private rows(sql:string,...values:(string|number)[]){
    return this.store.db.prepare(sql).all(...values).flatMap(row=>{try{const workflow=JSON.parse(row.workflow as string) as Workflow;if(workflow.id!==row.id)return[];PlanSchema.parse(workflow.plan);return[workflow];}catch{return[];}});
  }
  private write(workflow:Workflow){
    this.store.db.prepare('INSERT OR REPLACE INTO workflows(id,domain,intent,structure,workflow,hits) VALUES(?,?,?,?,?,COALESCE((SELECT hits FROM workflows WHERE id=?),0))').run(workflow.id,workflow.origin,workflow.intent,workflow.structure,JSON.stringify(workflow),workflow.id);
    return workflow;
  }
  match(goal:string,state:PageState):Workflow|undefined{
    const url=new URL(state.url);const intent=normalizeIntent(goal),structure=structureHash(state);
    // A procedure with parameters needs values, so it is only run through runProcedure.
    const workflow=this.rows('SELECT id,workflow FROM workflows WHERE domain=? AND intent=? AND structure=?',url.origin,intent,structure)
      .find(item=>item.origin===url.origin&&item.path===url.pathname&&item.intent===intent&&item.structure===structure&&!item.parameters?.length);
    if(workflow)this.store.db.prepare('UPDATE workflows SET hits=hits+1 WHERE id=?').run(workflow.id);
    return workflow;
  }
  hasHydrationCandidate(goal:string,state:PageState){
    const url=new URL(state.url),intent=normalizeIntent(goal),structure=structureHash(state);
    return this.rows('SELECT id,workflow FROM workflows WHERE domain=? AND intent=?',url.origin,intent).some(item=>item.origin===url.origin&&item.path===url.pathname&&item.intent===intent&&item.structure!==structure&&!item.parameters?.length);
  }
  /** Procedures whose name, description or keywords cover the request, best first, with parameter values read from the request. */
  find(goal:string,url?:string):Match[]{
    const origin=url?new URL(url).origin:undefined,requested=intentTokens(goal);
    return this.rows('SELECT id,workflow FROM workflows').filter(item=>!origin||item.origin===origin).flatMap(workflow=>{
      const params=workflow.parameters??[],values:Record<string,string>={};
      for(const param of params){const value=extractParameter(goal,param);if(value!==undefined)values[param.name]=value;}
      const valueTokens=new Set(Object.values(values).flatMap(value=>[...intentTokens(value)]));
      const words=new Set([...requested].filter(word=>!valueTokens.has(word))),known=procedureTokens(workflow);
      const overlap=[...words].filter(word=>known.has(word)).length,score=words.size?overlap/words.size:0;
      // A learned workflow repeats fixed values, so only the same request may reuse it.
      if(!params.length&&!(overlap===words.size&&[...intentTokens(workflow.intent)].every(word=>words.has(word))))return[];
      if(params.length&&(score<.6||overlap<Math.min(2,words.size)))return[];
      return[{workflow,score,values,missing:params.filter(param=>param.required&&values[param.name]===undefined)}];
    }).sort((a,b)=>b.score-a.score||(b.workflow.lastValidatedAt??0)-(a.workflow.lastValidatedAt??0));
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
    const existing=this.get(id),now=Date.now();
    // Relearning keeps a name or description the user gave this workflow.
    const workflow:Workflow={...existing,id,origin:url.origin,path:url.pathname,intent,structure,plan,learnedFrom:trace.id,createdAt:existing?.createdAt??now,source:existing?.source??'learned',
      version:(existing?.version??1)+(existing&&JSON.stringify(existing.plan.actions)!==JSON.stringify(plan.actions)?1:0),updatedAt:now,lastValidatedAt:now,
      versions:existing&&JSON.stringify(existing.plan.actions)!==JSON.stringify(plan.actions)?[...existing.versions??[],{version:existing.version??1,plan:existing.plan,savedAt:existing.updatedAt??existing.createdAt,reason:'Relearned'}].slice(-MAX_VERSIONS):existing?.versions};
    return this.write(workflow);
  }
  /** Saves a taught, imported or written procedure. */
  create(input:ProcedureInput,source:Source,options:{structure?:string;learnedFrom?:string}={}){
    const procedure=ProcedureSchema.parse(input),url=new URL(procedure.startUrl),now=Date.now();
    return this.write({id:randomBytes(8).toString('hex'),origin:url.origin,path:url.pathname,startUrl:procedure.startUrl,intent:normalizeIntent(procedure.intent??procedure.name),structure:options.structure??'',
      plan:procedure.plan,learnedFrom:options.learnedFrom??source,createdAt:now,updatedAt:now,name:procedure.name,description:procedure.description,source,
      parameters:procedure.parameters,preconditions:procedure.preconditions,keywords:procedure.keywords,version:1,versions:[]});
  }
  /** Saves recorded, written or completed-run steps. A parameter given with a value replaces that literal value in the steps. */
  saveSteps(input:{name:string;description?:string;keywords?:string[];startUrl:string;actions:Action[];completion?:Condition[];parameters?:(Parameter&{value?:string})[];expectText?:string},source:Source,options:{structure?:string;learnedFrom?:string}={}){
    const declared=input.parameters??[],literals=Object.fromEntries(declared.filter(param=>param.value).map(param=>[param.name,param.value!]));
    const completion:Condition[]=[...input.completion??[],...(input.expectText?[{type:'text_exists' as const,value:input.expectText}]:[])];
    const plan=parameterize({goal:input.name,steps:[input.description||input.name],actions:input.actions,completion,continue:false},literals),used=JSON.stringify(plan);
    const parameters=declared.map(({value:_value,...param})=>param).filter(param=>used.includes(`{{params.${param.name}}}`));
    return this.create({name:input.name,description:input.description??'',keywords:input.keywords??[],startUrl:input.startUrl,parameters,plan},source,options);
  }
  /** Stores a changed procedure as a new version; the previous steps stay restorable. */
  update(id:string,patch:Partial<ProcedureInput>,reason:string,source:Source='edited'){
    const current=this.get(id);if(!current)throw new Error('Procedure not found');
    const procedure=ProcedureSchema.parse({...this.input(current),...patch}),url=new URL(procedure.startUrl),now=Date.now(),version=current.version??1;
    return this.write({...current,origin:url.origin,path:url.pathname,startUrl:procedure.startUrl,intent:normalizeIntent(procedure.intent??current.intent),plan:procedure.plan,name:procedure.name,description:procedure.description,
      parameters:procedure.parameters,preconditions:procedure.preconditions,keywords:procedure.keywords,source,updatedAt:now,version:version+1,
      versions:[...current.versions??[],{version,plan:current.plan,savedAt:current.updatedAt??current.createdAt,reason}].slice(-MAX_VERSIONS)});
  }
  rename(id:string,name:string){return this.update(id,{name},'Renamed',this.get(id)?.source);}
  duplicate(id:string,name?:string){const current=this.get(id);if(!current)throw new Error('Procedure not found');return this.create({...this.input(current),name:name??`${this.label(current)} (copy)`},'edited',{structure:current.structure});}
  restore(id:string,version:number){const old=this.get(id)?.versions?.find(item=>item.version===version);if(!old)throw new Error('Version not found');return this.update(id,{plan:old.plan},`Restored version ${version}`);}
  remove(id:string){this.store.db.prepare('DELETE FROM workflow_runs WHERE workflow=?').run(id);return this.store.db.prepare('DELETE FROM workflows WHERE id=?').run(id).changes>0;}
  /** A portable copy: steps, parameter names and checks only. Run history and parameter values are never exported. */
  export(id:string){const current=this.get(id);if(!current)throw new Error('Procedure not found');return ProcedureFileSchema.parse({format:'fcu-procedure',version:1,procedure:this.input(current)});}
  import(data:unknown){return this.create(ProcedureFileSchema.parse(data).procedure,'imported');}
  recordRun(id:string,trace:Trace,repaired:boolean){
    const workflow=this.get(id);if(!workflow)return;
    this.store.db.prepare('INSERT OR REPLACE INTO workflow_runs VALUES(?,?,?,?,?,?,?,?,?)').run(trace.id,id,workflow.version??1,trace.startedAt,trace.status,trace.durationMs,Number(trace.metrics.llmCalls??0),repaired?1:0,trace.error??null);
    if(trace.status==='completed'){this.write({...workflow,lastValidatedAt:Date.now()});this.store.db.prepare('UPDATE workflows SET hits=hits+1 WHERE id=?').run(id);}
  }
  runs(id:string,limit=20){return this.store.db.prepare('SELECT id,version,started,status,duration,llm_calls AS llmCalls,repaired,error FROM workflow_runs WHERE workflow=? ORDER BY started DESC LIMIT ?').all(id,limit);}
  summary(id:string):RunSummary{
    const row=this.store.db.prepare("SELECT COUNT(*) AS runs,SUM(status='completed') AS completed,MAX(started) AS last FROM workflow_runs WHERE workflow=?").get(id) as {runs:number;completed:number|null;last:number|null};
    return{runs:row.runs,completed:row.completed??0,successRate:row.runs?(row.completed??0)/row.runs:null,lastRunAt:row.last??undefined};
  }
  list(){
    const hits=new Map(this.store.db.prepare('SELECT id,hits FROM workflows').all().map(row=>[row.id as string,row.hits as number]));
    return this.rows('SELECT id,workflow FROM workflows').map(workflow=>({id:workflow.id,name:this.label(workflow),domain:workflow.origin,intent:workflow.intent,hits:hits.get(workflow.id)??0,source:workflow.source??'learned',version:workflow.version??1,
      parameters:(workflow.parameters??[]).map(({name,kind,required,description})=>({name,kind,required,description})),steps:workflow.plan.actions.length,lastValidatedAt:workflow.lastValidatedAt,...this.summary(workflow.id)}))
      .sort((a,b)=>b.hits-a.hits||(b.lastValidatedAt??0)-(a.lastValidatedAt??0));
  }
  get(id:string){return this.rows('SELECT id,workflow FROM workflows WHERE id=?',id)[0];}
  label(workflow:Workflow){return workflow.name??workflow.plan.goal;}
  startUrl(workflow:Workflow){return workflow.startUrl??workflow.origin+workflow.path;}
  private input(workflow:Workflow):ProcedureInput{
    return{name:this.label(workflow),description:workflow.description??'',startUrl:this.startUrl(workflow),intent:workflow.intent,keywords:workflow.keywords??[],parameters:workflow.parameters??[],preconditions:workflow.preconditions??[],plan:workflow.plan};
  }
}
export function containsRef(action:Action|Condition){
  if('target'in action&&typeof action.target==='string')return true;
  if('condition'in action&&containsRef(action.condition))return true;
  if('verify'in action&&action.verify?.some(containsRef))return true;
  return false;
}
