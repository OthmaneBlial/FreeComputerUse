import { ActionSchema,PlanSchema,type Action,type Condition,type Plan,type SemanticTarget } from '../actions/schema.js';
import type { Parameter } from '../workflows/WorkflowEngine.js';

/*
Explicit steps, one per line, in English or French. Quoted names; "|" separates alternative names.
  open https://play.google.com/console              ouvre https://…
  click "View app" | "Voir l'application"          clique sur bouton "Créer une release"
  upload {{params.bundle}} to "App bundles"        téléverse {{params.bundle}} dans "App bundles"
  type "{{params.notes}}" into field "Release notes"   saisis "…" dans "Notes de version"
  select "France" in "Country"                     choisis "France" dans "Pays"
  check "I agree"  /  uncheck "Newsletter"         coche "J'accepte"  /  décoche "Newsletter"
  press Enter in "Search"                          appuie sur Entrée dans "Recherche"
  wait for "Processing complete" (timeout 30s)     attends "Traitement terminé"
  expect "Release sent for review"                 vérifie "Version envoyée pour examen"
  click "Save and publish" (sensitive)             clique sur "Publier" (sensible)
*/
const verbs:[RegExp,Action['type']|'expect'|'require'][]=[
  [/^(?:open|go to|navigate to|visit|ouvre|ouvrir|va sur|aller sur|aller a|aller à|navigue vers)\s+/i,'navigate'],
  [/^(?:upload|attach|televerse|téléverse|televerser|téléverser|importe|importer|joins|joindre)\s+/i,'upload'],
  [/^(?:type|fill|enter|write|tape|taper|saisis|saisir|ecris|écris|écrire|remplis|remplir)\s+/i,'fill'],
  [/^(?:select|choose|pick|choisis|choisir|selectionne|sélectionne|sélectionner)\s+/i,'select'],
  [/^(?:uncheck|untick|decoche|décoche|décocher)\s+/i,'uncheck'],
  [/^(?:check|tick|coche|cocher)\s+/i,'check'],
  [/^(?:press|appuie sur la touche|appuie sur|appuyer sur)\s+(?=(?:enter|entrée|entree|tab|escape|échap|echap|space|espace|arrow\w+)\b)/i,'press'],
  [/^(?:wait for|wait until|attends que|attendre que|attends|attendre|patiente jusqu'à)\s+/i,'wait'],
  // A required text must be on the starting page, e.g. a page only signed-in users see; otherwise the run pauses.
  [/^(?:require|requires|needs|exige|nécessite|necessite)\s+/i,'require'],
  [/^(?:expect|verify|confirm|vérifie|verifie|vérifier|verifier|s'assurer que|assure-toi que)\s+(?:that\s+|que\s+)?/i,'expect'],
  [/^(?:click on|click|tap on|tap|clique sur|cliquer sur|clique|cliquer|appuie sur|appuyer sur)\s+/i,'click'],
];
const ROLES:Record<string,string>={button:'button',bouton:'button',link:'link',lien:'link',tab:'tab',onglet:'tab',menu:'menuitem',field:'textbox',champ:'textbox',checkbox:'checkbox',case:'checkbox',option:'option',radio:'radio'};
const KEYS:Record<string,string>={enter:'Enter',entrée:'Enter',entree:'Enter',tab:'Tab',escape:'Escape',échap:'Escape',echap:'Escape',space:'Space',espace:'Space'};
const quoted=/^\s*["“«]([^"”»]+)["”»]\s*/;
function takeValue(text:string){
  const found=quoted.exec(text)??/^\s*(\{\{\s*params\.[\w-]+\s*\}\}|\S+)\s*/.exec(text);
  if(!found)throw new Error('Expected a value');
  return{value:found[1]!.trim(),rest:text.slice(found[0].length)};
}
function takeTarget(text:string):{target:SemanticTarget;alternatives:SemanticTarget[]}{
  const options=text.split(/\s+\|\s+|\s+ou\s+(?=["“«])/).map(part=>part.trim()).filter(Boolean);
  if(!options.length)throw new Error('Expected a target in quotes');
  const targets=options.map(part=>{
    if(part.startsWith('css:'))return{css:part.slice(4).trim()};
    if(/^testid:/i.test(part))return{testId:part.slice(7).trim()};
    if(/^#[\w-]+$/.test(part))return{id:part.slice(1)};
    const role=/^(\p{L}+)\s+(?=["“«])/u.exec(part),name=quoted.exec(role?part.slice(role[0].length):part);
    if(!name)throw new Error(`Put the element name in quotes: ${part}`);
    const kind=role?ROLES[role[1]!.toLowerCase()]:undefined;
    if(role&&!kind)throw new Error(`Unknown element kind "${role[1]}"`);
    return kind==='textbox'?{label:name[1]!.trim()}:kind?{role:kind,name:name[1]!.trim()}:{name:name[1]!.trim()};
  });
  return{target:targets[0]!,alternatives:targets.slice(1)};
}
const separator=/^\s*(?:into|in|to|from|on|dans|sur|vers|depuis|du champ|au champ)\s+/i;
export interface ParsedSteps {plan:Plan;parameters:Parameter[];preconditions:Condition[];startUrl?:string}
export function parseSteps(source:string,goal='Taught procedure'):ParsedSteps{
  const actions:Action[]=[],completion:Condition[]=[],preconditions:Condition[]=[],errors:string[]=[];
  source.split(/\r?\n/).forEach((raw,index)=>{
    let line=raw.trim();if(!line||line.startsWith('#'))return;
    line=line.replace(/^\d+[.)]\s*|^[-*]\s+/,'');
    try{
      const flags:{sensitive?:boolean;timeoutMs?:number}={};
      line=line.replace(/\s*\((sensitive|sensible|confirm|confirmer)\)\s*$/i,()=>{flags.sensitive=true;return '';});
      line=line.replace(/\s*\((?:timeout|délai|delai)\s+(\d+)\s*(s|ms)?\)\s*$/i,(_match,amount:string,unit?:string)=>{flags.timeoutMs=Math.min(30000,Number(amount)*(unit==='ms'?1:1000));return '';});
      const verb=verbs.find(([pattern])=>pattern.test(line));if(!verb)throw new Error('Unknown step; start with open, click, type, select, upload, check, press, wait for, expect or require');
      const rest=line.replace(verb[0],''),type=verb[1];
      if(type==='navigate'){actions.push(ActionSchema.parse({type,url:takeValue(rest).value}));return;}
      if(type==='wait'||type==='expect'||type==='require'){
        const [value,...alternatives]=rest.split(/\s+\|\s+|\s+ou\s+(?=["“«])/).map(part=>takeValue(part).value);
        const condition:Condition={type:'text_exists',value:value!,...(alternatives.length?{alternatives}:{})};if(type==='expect')completion.push(condition);else if(type==='require')preconditions.push(condition);else actions.push(ActionSchema.parse({type:'wait',condition,...flags}));return;}
      if(type==='press'){
        const key=/^(\S+)/.exec(rest)![1]!,after=rest.slice(key.length),target=separator.test(after)?takeTarget(after.replace(separator,'')):undefined;
        if(!target)throw new Error('Say where to press the key, e.g. press Enter in "Search"');
        actions.push(ActionSchema.parse({type,value:KEYS[key.toLowerCase()]??key,target:target.target,...(target.alternatives.length?{alternatives:target.alternatives}:{}),...flags}));return;
      }
      if(type==='fill'||type==='select'||type==='upload'){
        const {value,rest:after}=takeValue(rest);if(!separator.test(after))throw new Error('Say where, e.g. … into "Field name"');
        const {target,alternatives}=takeTarget(after.replace(separator,''));
        actions.push(ActionSchema.parse({type,target,...(type==='upload'?{file:value}:{value}),...(alternatives.length?{alternatives}:{}),...flags}));return;
      }
      const {target,alternatives}=takeTarget(rest);
      actions.push(ActionSchema.parse({type,target,...(alternatives.length?{alternatives}:{}),...flags}));
    }catch(error){errors.push(`Line ${index+1}: ${error instanceof Error?error.message.split('\n')[0]:'invalid step'}`);}
  });
  if(errors.length)throw new Error(errors.join('\n'));
  if(!actions.length)throw new Error('No steps found');
  const parameters=new Map<string,Parameter>();
  for(const action of actions)for(const used of JSON.stringify(action).matchAll(/\{\{\s*params\.([\w-]+)\s*\}\}/g)){
    const kind=action.type==='upload'&&action.file.includes(used[0])?'file':'text';
    if(!parameters.has(used[1]!)||kind==='file')parameters.set(used[1]!,{name:used[1]!,kind,required:true});
  }
  const first=actions[0]!;
  return{plan:PlanSchema.parse({goal,steps:['Follow the taught steps'],actions,completion,continue:false}),parameters:[...parameters.values()],preconditions,startUrl:first.type==='navigate'?first.url:undefined};
}
