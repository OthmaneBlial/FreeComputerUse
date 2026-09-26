import type { PageState } from '../browser/types.js';
import { PlanSchema,type Plan } from '../actions/schema.js';
import type { VariableResolver } from '../profile/VariableResolver.js';
export interface SiteAdapter {name:string;matches(url:URL):boolean;plan(goal:string,state:PageState,variables:VariableResolver):Plan|undefined}
const fieldAliases:Record<string,string[]>={firstName:['first name','given name'],lastName:['last name','surname','family name'],email:['email','email address'],phone:['phone','phone number','telephone'],country:['country'],city:['city'],message:['message'],experience:['years of experience','experience'],name:['name','full name'],password:['password']};
export function mapForm(state:PageState,variables:VariableResolver){
  const fields=state.elements.filter(e=>['input','textarea','select'].includes(e.tag)&&e.type!=='submit'&&!e.disabled);
  return fields.flatMap(field=>{
    const label=field.name.toLowerCase().replace(/\*/g,'').trim();
    const key=Object.keys(variables.vault.profile).find(key=>key.toLowerCase()===label||(fieldAliases[key]??[]).includes(label));
    if(key)return[{field,key,variable:`{{profile.${key}}}`}];
    return[];
  });
}
export const genericAdapter:SiteAdapter={
  name:'generic-local',matches:()=>true,
  plan(goal,state,variables){
    // Deliberately narrow intent parsing: zero LLM calls for fully specified tasks.
    if(/^(?:read|extract)(?: the| this)? (?:page|document)(?: text)?\.?$/i.test(goal))return PlanSchema.parse({goal,steps:['Extract visible page text'],actions:[{type:'extract',format:'text',key:'text'}],completion:[{type:'extraction_created',key:'text'}],continue:false});
    const firstLinks=goal.match(/^(?:extract|list)(?: the)? (?:first|top) (\d+) links?\.?$/i);
    if(firstLinks){const limit=Number(firstLinks[1]);if(limit>=1&&limit<=1000)return PlanSchema.parse({goal,steps:[`Extract the first ${limit} visible links`],actions:[{type:'extract',format:'links',key:'links',limit}],completion:[{type:'extraction_created',key:'links'},{type:'extraction_count',key:'links',min:limit,max:limit}],continue:false});}
    if(/^(?:extract|list)(?: the)? links?\.?$/i.test(goal))return PlanSchema.parse({goal,steps:['Extract visible links'],actions:[{type:'extract',format:'links',key:'links'}],completion:[{type:'extraction_created',key:'links'}],continue:false});
    if(/^(extract|read)( the)? table\.?$/i.test(goal)&&state.tables.length===1)return PlanSchema.parse({goal,steps:['Extract visible table'],actions:[{type:'extract',target:{css:'table'},format:'table',key:'table'}],completion:[{type:'element_visible',target:{css:'table'}}],continue:false});
    if(/^fill( the)?( contact)? form using( my)? profile\.?$/i.test(goal)){
      const mappings=mapForm(state,variables);
      const required=state.elements.filter(e=>e.required&&!e.disabled&&!e.hasValue);
      if(!mappings.length||required.some(e=>!mappings.some(m=>m.field.ref===e.ref)))return;
      const forms=new Set(mappings.map(m=>m.field.form));if(forms.size!==1)return;
      return PlanSchema.parse({goal,steps:['Map profile aliases to form labels','Fill and verify locally'],
        actions:mappings.map(m=>({type:m.field.tag==='select'?'select':'fill',target:m.field.selectors,value:m.variable})),
        completion:mappings.map(m=>({type:'input_value_equals',target:m.field.selectors,value:m.variable})).slice(0,12),continue:false});
    }
  },
};
