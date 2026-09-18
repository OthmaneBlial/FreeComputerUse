import { DatabaseSync } from 'node:sqlite';
import { mkdirSync,chmodSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Plan,Condition } from '../actions/schema.js';
import type { ActionResult } from '../actions/executor.js';
import type { LLMCall } from '../llm/LLMProvider.js';
export interface Trace {
  version:1;id:string;goal:string;url:string;status:'running'|'completed'|'failed'|'stopped';
  startedAt:number;durationMs:number;plans:Plan[];actions:ActionResult[];
  completion:Condition[];calls:LLMCall[];metrics:Record<string,unknown>;error?:string;
}
export class TraceStore {
  readonly db:DatabaseSync;
  constructor(readonly path:string){
    if(path!==':memory:'){mkdirSync(dirname(path),{recursive:true,mode:0o700});chmodSync(dirname(path),0o700);}
    this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=3000; CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, started INTEGER, status TEXT, goal TEXT, url TEXT, trace TEXT); CREATE TABLE IF NOT EXISTS workflows(id TEXT PRIMARY KEY, domain TEXT, intent TEXT, structure TEXT, workflow TEXT, hits INTEGER DEFAULT 0);');
    if(path!==':memory:')chmodSync(path,0o600);
  }
  save(trace:Trace){this.db.prepare('INSERT OR REPLACE INTO runs VALUES(?,?,?,?,?,?)').run(trace.id,trace.startedAt,trace.status,trace.goal,trace.url,JSON.stringify(trace));}
  get(id:string):Trace|undefined{const row=this.db.prepare('SELECT trace FROM runs WHERE id=?').get(id);return row?JSON.parse(row.trace as string) as Trace:undefined;}
  history(limit=30){return this.db.prepare('SELECT id,started,status,goal,url FROM runs ORDER BY started DESC LIMIT ?').all(limit);}
  close(){this.db.close();}
}
