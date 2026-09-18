import { EventEmitter } from 'node:events';
import { PlanSchema, type Plan } from '../actions/schema.js';
export class Control extends EventEmitter {
  paused=false;stopped=false;revision=0;
  pending?:{reason:string;action:unknown};
  replacement?:Plan;
  private decide?: (approved:boolean)=>void;
  private approvalTail:Promise<void>=Promise.resolve();
  pause(){this.paused=true;this.emit('change');}
  resume(){this.paused=false;this.revision++;this.emit('change');}
  stop(){this.stopped=true;this.paused=false;this.decide?.(false);this.emit('change');}
  approve(){if(!this.decide)throw new Error('No action is awaiting approval');this.decide(true);}
  reject(){if(!this.decide)throw new Error('No action is awaiting approval');this.decide(false);}
  edit(value:unknown){if(!this.paused)throw new Error('Pause before editing the plan');this.replacement=PlanSchema.parse(value);}
  async checkpoint(){
    while(this.paused&&!this.stopped) await new Promise<void>(resolve=>this.once('change',resolve));
    if(this.stopped)throw new Error('Task stopped by human');
  }
  async confirm(reason:string,action:unknown){
    // Frames/popups can request permissions concurrently. Never overwrite the
    // decision callback for an approval already visible to the human.
    const predecessor=this.approvalTail;
    let release!:()=>void;
    this.approvalTail=new Promise<void>(resolve=>{release=resolve;});
    await predecessor;
    try{
    if(this.stopped)throw new Error('Task stopped by human');
    this.pending={reason,action};
    const approved=await new Promise<boolean>(resolve=>{this.decide=resolve;this.emit('approval',this.pending);});
    this.pending=undefined;this.decide=undefined;this.emit('change');
    if(!approved)throw new Error('Sensitive action rejected by human');
    }finally{release();}
  }
}
