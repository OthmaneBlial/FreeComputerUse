import { z } from 'zod';

export function providerOutputSchema(schema:z.ZodTypeAny){
  const visit=(value:unknown,parentKey?:string):unknown=>{
    if(Array.isArray(value))return value.map(item=>visit(item));
    if(!value||typeof value!=='object')return value;
    const source=value as Record<string,unknown>;
    if(parentKey==='fields'&&source.type==='object'&&source.additionalProperties&&typeof source.additionalProperties==='object'){
      const item=visit(source.additionalProperties) as Record<string,unknown>;
      const properties={key:{type:'string',minLength:1,maxLength:2000},...item.properties as Record<string,unknown>};
      return {type:'array',minItems:1,maxItems:20,items:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}};
    }
    const required=new Set(Array.isArray(source.required)?source.required.filter((key):key is string=>typeof key==='string'):[]);
    const output=Object.fromEntries(Object.entries(source).filter(([key])=>key!=='default').map(([key,nested])=>[key==='oneOf'?'anyOf':key,visit(nested,key)]));
    if(source.properties&&typeof source.properties==='object'&&!Array.isArray(source.properties)){
      const properties=Object.fromEntries(Object.entries(source.properties).map(([key,nested])=>[
        key,required.has(key)?visit(nested,key):{anyOf:[visit(nested,key),{type:'null'}]},
      ]));
      output.properties=properties;
      output.required=Object.keys(properties);
    }
    return output;
  };
  return visit(z.toJSONSchema(schema,{unrepresentable:'any',reused:'ref'}));
}

export function normalizeProviderOutput(value:unknown):unknown{
  if(Array.isArray(value))return value.map(normalizeProviderOutput);
  if(!value||typeof value!=='object')return value;
  const source=value as Record<string,unknown>,isRecordsAction=source.type==='extract'&&source.format==='records';
  const outputEntries:Array<[string,unknown]>=[];
  for(const [key,nested] of Object.entries(source)){
    if(nested===null)continue;
    if(key==='fields'&&isRecordsAction&&Array.isArray(nested)){
      const fieldEntries:Array<[string,unknown]>=[],names=new Set<string>();
      for(const field of nested){
        if(!field||typeof field!=='object'||Array.isArray(field))break;
        const {key:fieldName,...selection}=field as Record<string,unknown>;
        if(typeof fieldName!=='string'||names.has(fieldName))break;
        names.add(fieldName);fieldEntries.push([fieldName,normalizeProviderOutput(selection)]);
      }
      if(nested.length&&fieldEntries.length===nested.length){outputEntries.push([key,Object.fromEntries(fieldEntries)]);continue;}
    }
    outputEntries.push([key,normalizeProviderOutput(nested)]);
  }
  // ponytail: null means omitted for current action schemas; use schema-aware normalization if explicit nullable fields are added.
  return Object.fromEntries(outputEntries);
}
