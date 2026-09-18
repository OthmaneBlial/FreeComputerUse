// A scripted fixture planner. This is NOT an LLM and reports no token usage.
import { PlanSchema,RepairSchema,type Plan,type Repair } from '../src/actions/schema.js';
import type { LLMProvider,PlanningContext,RepairContext } from '../src/llm/LLMProvider.js';
export class FixtureProvider implements LLMProvider {
  readonly name='scripted-fixture';planCalls=0;repairCalls=0;
  async plan(context:PlanningContext):Promise<Plan>{
    this.planCalls++;
    // Read the current document URL, not URLs of navigation links in its data.
    const currentURL=context.page.match(/(?:^URL |"url":")([^"\n]+)/m)?.[1];
    const pathname=currentURL?new URL(currentURL).pathname:'';
    let actions:unknown[],completion:unknown[];let continuing=false;
    if(pathname==='/review'){
      actions=[{type:'check',target:{label:'I confirm my application is accurate'}},{type:'click',target:{role:'button',name:'Submit application'}}];completion=[{type:'text_exists',value:'Application received'}];
    }else if(pathname==='/jobs'||pathname==='/apply'){
      actions=[...(pathname==='/apply'?[]:[{type:'click',target:{role:'link',name:'Apply now'}}]),
        ...[['First name','firstName'],['Last name','lastName'],['Email','email'],['Phone','phone'],['Years of experience','experience']].map(([label,key])=>({type:'fill',target:{label},value:`{{profile.${key}}}`})),
        {type:'select',target:{label:'Country'},value:'{{profile.country}}'},
        {type:'upload',target:{label:'Resume'},file:'{{files.resume}}'},
        {type:'click',target:{role:'button',name:'Continue'}}];completion=[{type:'url_contains',value:'/review'}];continuing=true;
    }else if(pathname==='/demo'||context.page.includes('Contact our team')){
      actions=[...['firstName','lastName','email','message'].map(key=>({type:'fill',target:{label:({firstName:'First name',lastName:'Last name',email:'Email',message:'Message'} as Record<string,string>)[key]},value:`{{profile.${key}}}`})),
        {type:'select',target:{label:'Country'},value:'{{profile.country}}'},
        {type:'check',target:{label:'I agree to the privacy policy'}},{type:'click',target:{role:'button',name:'Send message'}}];completion=[{type:'text_exists',value:'Message received'}];
    }else if(pathname==='/search'){
      actions=[{type:'fill',target:{label:'Search'},value:'DOM browser automation'},{type:'click',target:{role:'button',name:'Search'}},{type:'extract',target:{css:'main'},format:'links',key:'results'}];completion=[{type:'url_contains',value:'/results'}];
    }else if(pathname.startsWith('/wizard')){
      actions=[{type:'select',target:{label:'Destination'},value:'Paris'},{type:'click',target:{role:'button',name:'Continue'}},{type:'fill',target:{label:'Date'},value:'2026-10-01'},{type:'click',target:{role:'button',name:'Find tickets'}},{type:'extract',target:{css:'table'},format:'table',key:'tickets'}];completion=[{type:'text_exists',value:'Cheapest ticket'}];
    }else if(pathname==='/catalogue'){
      actions=[{type:'fill',target:{label:'Search products'},value:'keyboard'},{type:'extract',target:{css:'table'},format:'table',key:'products'}];completion=[{type:'input_value_equals',target:{label:'Search products'},value:'keyboard'}];
    }else if(pathname==='/changed'){
      actions=[{type:'click',target:{role:'button',name:'Missing old button'},timeoutMs:150}];completion=[{type:'text_exists',value:'Recovery complete'}];
    }else throw new Error('The scripted fixture planner only supports the documented local scenarios');
    return PlanSchema.parse({goal:context.goal,steps:['Execute the local fixture scenario'],actions,completion,continue:continuing});
  }
  async repair(_context:RepairContext):Promise<Repair>{
    this.repairCalls++;return RepairSchema.parse({actions:[{type:'click',target:{testId:'advance'}}],replace:1});
  }
}
