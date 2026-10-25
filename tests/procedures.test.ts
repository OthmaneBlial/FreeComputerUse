import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm,writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Agent } from '../src/agent/Agent.js';
import { TraceStore } from '../src/history/TraceStore.js';
import { RepairSchema,type Plan } from '../src/actions/schema.js';
import { WorkflowEngine,extractParameter,intentTokens,parameterize,type ProcedureInput } from '../src/workflows/WorkflowEngine.js';
import { parseSteps } from '../src/teach/steps.js';
import { VariableResolver } from '../src/profile/VariableResolver.js';
import { startFixtures } from '../fixtures/server.js';
import type { LLMProvider,RepairContext } from '../src/llm/LLMProvider.js';

const plan=(actions:unknown[]):Plan=>({goal:'Publish',steps:['Follow the procedure'],actions:actions as Plan['actions'],completion:[{type:'text_exists',value:'In review'}],continue:false});
const release:ProcedureInput={name:'Publish a Play production release',description:'Upload an app bundle and send a production release for review',startUrl:'https://console.example.test/play/console',
  keywords:['google play','android'],parameters:[{name:'app',aliases:['app','application',"l'app"]},{name:'version',pattern:'^\\d+(\\.\\d+){0,3}$'},{name:'bundle',kind:'file',aliases:['bundle','aab','fichier','file'],pattern:'\\.aab$'}],
  plan:plan([{type:'click',target:{role:'link',name:'View app: {{params.app}}'}},{type:'upload',target:{label:'Upload app bundle'},file:'{{params.bundle}}'}])};

test('procedures are found from differently worded English and French requests, with parameters read locally',()=>{
  const store=new TraceStore(':memory:'),engine=new WorkflowEngine(store);
  try{
    const saved=engine.create(release,'taught');
    const fr=engine.find("Déploie la version 1.4 de l'app \"Snake Arena\" avec ce fichier AAB");
    assert.equal(fr[0]?.workflow.id,saved.id);assert.deepEqual(fr[0]?.values,{app:'Snake Arena',version:'1.4'});assert.deepEqual(fr[0]?.missing.map(param=>param.name),['bundle'],'Only the file must be asked for');
    const en=engine.find('Please ship version 2.0.1 of application Budget using ./builds/budget-2.0.1.aab');
    assert.deepEqual(en[0]?.values,{app:'Budget',version:'2.0.1',bundle:'./builds/budget-2.0.1.aab'});assert.equal(en[0]?.missing.length,0);
    assert.equal(engine.find('Delete my invoices').length,0,'Unrelated requests do not match');
    assert.equal(engine.find('Publish a Play production release',"https://other.example.test/").length,0,'Another site never matches');
    assert.equal(extractParameter('version v1',{name:'version',pattern:'^\\d+$',required:true,kind:'text'}),undefined,'Values must match their pattern');
    assert(intentTokens('Déployer les applications').has('release'));assert(intentTokens('Déployer les applications').has('app'));
  }finally{store.close();}
});

test('learned workflows with fixed values are only reused for the same request',()=>{
  const store=new TraceStore(':memory:'),engine=new WorkflowEngine(store);
  try{
    const saved=engine.create({...release,name:'Send message to Bob',parameters:[],plan:plan([{type:'click',target:{role:'button',name:'Send'}}])},'learned');
    assert.equal(engine.find('send message to bob')[0]?.workflow.id,saved.id);
    assert.equal(engine.find('send message to Alice').length,0);
  }finally{store.close();}
});

test('procedures can be renamed, edited, duplicated, restored, exported without values, imported and deleted',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'fcu-procedures-'));
  try{
    let store=new TraceStore(join(directory,'history.sqlite')),engine=new WorkflowEngine(store);
    const saved=engine.create(release,'taught');
    engine.rename(saved.id,'Play release');
    const edited=engine.update(saved.id,{plan:plan([{type:'click',target:{role:'link',name:'View app: {{params.app}}'},alternatives:[{name:"Afficher l'application: {{params.app}}"}]},{type:'upload',target:{label:'Upload app bundle'},file:'{{params.bundle}}'}])},'Added the French name');
    assert.equal(edited.version,3);assert.equal(edited.versions?.length,2);assert.equal(edited.name,'Play release');
    assert.throws(()=>engine.update(saved.id,{plan:plan([{type:'fill',target:{label:'Notes'},value:'{{params.notes}}'}])},'x'),/Undeclared parameter notes/);
    const copy=engine.duplicate(saved.id);assert.notEqual(copy.id,saved.id);assert.equal(copy.name,'Play release (copy)');
    const exported=engine.export(saved.id);
    assert.equal(exported.format,'fcu-procedure');assert(!JSON.stringify(exported).includes(directory));
    const imported=engine.import(JSON.parse(JSON.stringify(exported)));assert.equal(imported.source,'imported');assert.equal(imported.parameters?.length,3);
    assert.throws(()=>engine.import({...exported,procedure:{...exported.procedure,plan:plan([{type:'click',target:'e12'}])}}),/semantic targets/);
    // The store survives a restart.
    store.close();store=new TraceStore(join(directory,'history.sqlite'));engine=new WorkflowEngine(store);
    const restored=engine.restore(saved.id,1);assert.equal(restored.version,4);assert.equal(restored.plan.actions[0]?.alternatives,undefined);
    assert.equal(engine.list().length,3);
    assert(engine.remove(copy.id));assert.equal(engine.get(copy.id),undefined);
    store.close();
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('literal values become parameters and file or secret parameters are redacted',()=>{
  const value=parameterize({type:'fill',target:{label:'Release notes'},value:'Fixes for Snake Arena',verify:[{type:'text_exists',value:'(1.4)'}]},{app:'Snake Arena',version:'1.4',short:'Fi'});
  assert.deepEqual(value,{type:'fill',target:{label:'Release notes'},value:'Fixes for {{params.app}}',verify:[{type:'text_exists',value:'({{params.version}})'}]});
  const resolver=new VariableResolver();resolver.params={bundle:{value:'/Users/me/app.aab',kind:'file'},token:{value:'abcd-1234-secret',kind:'secret'},app:{value:'Snake Arena',kind:'text'}};
  assert.equal(resolver.redact('uploaded /Users/me/app.aab with abcd-1234-secret for Snake Arena'),'uploaded {{params.bundle}} with {{params.token}} for Snake Arena');
  assert.equal(resolver.file('{{params.bundle}}'),'/Users/me/app.aab');assert.throws(()=>resolver.file('{{params.app}}'),/file parameter/);
  assert.equal(resolver.target('View app: {{params.app}}'),'View app: Snake Arena');assert.throws(()=>resolver.target('{{profile.email}}'),/only reference/);
});

test('explicit steps in English and French become a validated plan with parameters',()=>{
  const parsed=parseSteps(`# Play release
1. open https://console.example.test/play/console
2. click "View app: {{params.app}}" | "Afficher l'application: {{params.app}}"
3. clique sur bouton "Tester et publier"
4. téléverse {{params.bundle}} dans "Upload app bundle" (timeout 20s)
5. type "{{params.notes}}" into field "Release notes"
6. press Enter in "Release name"
7. attends "Prêt"
8. click "Save and publish" (sensitive)
9. vérifie "In review"`);
  assert.equal(parsed.startUrl,'https://console.example.test/play/console');
  assert.deepEqual(parsed.plan.actions.map(action=>action.type),['navigate','click','click','upload','fill','press','wait','click']);
  assert.deepEqual(parsed.plan.actions[1],{type:'click',target:{name:'View app: {{params.app}}'},alternatives:[{name:"Afficher l'application: {{params.app}}"}]});
  assert.deepEqual(parsed.plan.actions[2],{type:'click',target:{role:'button',name:'Tester et publier'}});
  assert.equal(parsed.plan.actions[3]?.timeoutMs,20000);assert.equal(parsed.plan.actions[7]?.sensitive,true);
  assert.deepEqual(parsed.plan.completion,[{type:'text_exists',value:'In review'}]);
  assert.deepEqual(parsed.parameters.map(param=>[param.name,param.kind]),[['app','text'],['bundle','file'],['notes','text']]);
  assert.throws(()=>parseSteps('click View app\nfrobnicate "x"'),/Line 1: Put the element name in quotes[\s\S]*Line 2: Unknown step/);
});

class NoModel implements LLMProvider {name='must-not-be-called';async plan():Promise<never>{throw new Error('The model must not be called');}async repair():Promise<never>{throw new Error('The model must not be called');}}
class ScriptedRepair implements LLMProvider {
  name='scripted-repair';repairs:RepairContext[]=[];
  async plan():Promise<never>{throw new Error('No planning expected');}
  async repair(context:RepairContext){this.repairs.push(context);return RepairSchema.parse({actions:[{type:'click',target:{role:'button',name:'Review release'}}],replace:1});}
}
const bundle=async(directory:string,code:number,version:string)=>{const path=join(directory,`app-${version}.aab`);await writeFile(path,`PK fixture manifest\nversionCode=${code}\nversionName=${version}\n`);return path;};

test('a taught Play release survives restart, replays with new parameters, stops at confirmation and repairs one changed step',{timeout:240000},async()=>{
  const fixture=await startFixtures(),directory=await mkdtemp(join(tmpdir(),'fcu-play-')),database=join(directory,'history.sqlite');
  const start=`${fixture.url}/play/console`,browser={headless:true,allowedOrigins:[fixture.url]};
  try{
    // 1. A person shows the release once.
    let store=new TraceStore(database),agent=new Agent({store,browser,mode:'ultra'});
    let id='';
    try{
      await agent.startTeaching(start);const page=agent.browser.page;
      await page.getByRole('link',{name:'View app: Snake Arena'}).click();
      await page.getByRole('button',{name:'Test and release'}).click();
      await page.getByRole('link',{name:'Production'}).click();
      await page.getByRole('button',{name:'Create new release'}).click();
      await page.getByRole('button',{name:'Upload'}).waitFor();
      await page.getByLabel('Upload app bundle').setInputFiles(await bundle(directory,14,'1.4'));
      await page.getByText('Ready').waitFor();
      await page.getByLabel('Release notes').fill('Faster start for Snake Arena');await page.getByLabel('Release notes').blur();
      await page.getByRole('button',{name:'Next'}).click();
      await page.getByRole('button',{name:'Save and publish'}).click();
      await page.getByRole('button',{name:'Send changes for review'}).click();
      await page.getByText('In review').waitFor();
      const recording=agent.finishTeaching();
      assert.deepEqual(recording.actions.map(action=>action.type),['click','click','click','click','upload','fill','click','click','click']);
      assert.deepEqual(recording.parameters.map(param=>[param.name,param.kind]),[['upload_app_bundle','file']]);
      const values={app:'Snake Arena',notes:'Faster start for Snake Arena'};
      // The person adds one check while saving: the processed bundle must have the requested version, before anything is published.
      const actions=parameterize(recording.actions,values).flatMap((action):Plan['actions']=>action.type==='upload'?[{...action,file:'{{params.bundle}}'},{type:'wait' as const,condition:{type:'text_exists' as const,value:'({{params.version}}) · Ready'},timeoutMs:15000}]:[action]);
      const saved=agent.workflows.create({name:'Publish a Play production release',startUrl:recording.startUrl,keywords:['google play'],
        parameters:[{name:'app',aliases:['app','application',"l'app"]},{name:'version',pattern:'^\\d+(\\.\\d+){0,3}$'},{name:'bundle',kind:'file',aliases:['aab','bundle','fichier','file'],pattern:'\\.aab$'},{name:'notes',aliases:['notes']}],
        plan:{goal:'Publish a Play production release',steps:['Taught by demonstration'],actions,completion:[{type:'text_exists',value:'({{params.version}}) · In review'}],continue:false}},'taught',{structure:recording.structure});
      id=saved.id;
      assert.deepEqual(saved.plan.actions[0],{type:'click',target:{role:'link',name:'View app: {{params.app}}'}});
      assert(fixture.play.apps[0]!.releases.some(item=>item.versionCode===14&&item.status==='in_review'));
    }finally{await agent.close();store.close();}

    // 2. After a restart, a French request finds it; only the missing file is asked for; it stops when the human rejects publishing.
    store=new TraceStore(database);
    const match=new WorkflowEngine(store).find("Déploie la version 1.5 de l'app \"Snake Arena\" avec ce fichier AAB")[0]!;
    assert.equal(match.workflow.id,id);assert.deepEqual(match.missing.map(param=>param.name),['bundle','notes'],'Only what the request did not say is asked for');
    const values:Record<string,string>={...match.values,bundle:await bundle(directory,15,'1.5'),notes:'Bug fixes'};
    agent=new Agent({store,browser,provider:new NoModel(),confirmation:'sensitive'});
    try{
      const approvals:string[]=[];agent.control.on('approval',pending=>{if(typeof pending.action==='object'){agent.control.approve();return;}approvals.push(String(pending.action));agent.control.reject();});
      const rejected=await agent.runProcedure(id,values);
      assert.equal(rejected.status,'failed');assert.match(rejected.error??'',/rejected by human/);
      assert.equal(approvals.length,1);assert.match(approvals[0]!,/Save and publish/);assert.match(approvals[0]!,/Version code: 15/,'The approval shows the release summary');
      assert(!fixture.play.apps[0]!.releases.some(item=>item.versionCode===15),'Nothing was submitted');
    }finally{await agent.close();}

    // 3. Approved, it finishes without any model call and reports "In review", never "published".
    agent=new Agent({store,browser,provider:new NoModel(),confirmation:'sensitive'});
    try{
      let approvals=0;agent.control.on('approval',pending=>{if(typeof pending.action!=='object')approvals++;agent.control.approve();});
      const done=await agent.runProcedure(id,{...values,bundle:await bundle(directory,16,'1.6'),version:'1.6'});
      assert.equal(done.status,'completed',done.error??'');assert.equal(approvals,2,'Both publishing controls needed approval');
      assert.equal(done.metrics.llmCalls,0);assert(!JSON.stringify(done).includes(directory),'The bundle path is redacted');
      assert(fixture.play.apps[0]!.releases.some(item=>item.versionCode===16&&item.status==='in_review'));
      const wrong=await (async()=>{await agent.prepareForNextRun();return agent.runProcedure(id,{...values,bundle:await bundle(directory,17,'1.7'),version:'9.9'});})().catch(error=>error as Error);
      assert.equal((wrong as {status?:string}).status,'failed','A bundle with another version fails verification');
      assert(!fixture.play.apps[0]!.releases.some(item=>item.versionCode===17&&item.status==='in_review'),'It fails before publishing');
    }finally{await agent.close();}

    // 4. On a slightly changed console, case and punctuation changes need no model; one renamed button is repaired once, then saved.
    const repairer=new ScriptedRepair();
    agent=new Agent({store,browser,provider:repairer,confirmation:'never'});
    try{
      agent.control.on('approval',()=>agent.control.approve());
      const changed=await agent.runProcedure(id,{...values,bundle:await bundle(directory,18,'1.8'),version:'1.8'},`${start}?variant=2`);
      assert.equal(changed.status,'completed',changed.error??'');assert.equal(repairer.repairs.length,1,'Only the renamed button needs the model');
      assert(changed.actions.some(result=>result.strategy==='normalized'));
      const updated=new WorkflowEngine(store).get(id)!;
      assert.equal(updated.version,2);assert.equal(updated.source,'repaired');
      const next=updated.plan.actions.find(action=>action.type==='click'&&typeof action.target==='object'&&action.target.name==='Review release');
      assert.deepEqual(next?.alternatives?.[0]&&{name:next.alternatives[0].name},{name:'Next'},'The old name stays as an alternative');
      await agent.prepareForNextRun({provider:new NoModel()});
      const again=await agent.runProcedure(id,{...values,bundle:await bundle(directory,19,'1.9'),version:'1.9'},`${start}?variant=2`);
      assert.equal(again.status,'completed',again.error??'');assert.equal(again.metrics.llmCalls,0);
      await agent.prepareForNextRun({provider:new NoModel()});
      const original=await agent.runProcedure(id,{...values,bundle:await bundle(directory,20,'2.0'),version:'2.0'});
      assert.equal(original.status,'completed','The original console still works through the alternative');
      const summary=new WorkflowEngine(store).summary(id);
      assert.equal(summary.runs,6);assert.equal(summary.completed,4);
    }finally{await agent.close();store.close();}
  }finally{await fixture.close();await rm(directory,{recursive:true,force:true});}
});

test('a replay whose steps mostly broke re-plans once, keeps the procedure checks, and saves a version that runs on both interfaces',async()=>{
  const labels={en:['One','Two','Three'],fr:['Un','Deux','Trois']};
  const server=createServer((req,res)=>{const lang=new URL(req.url??'/','http://x').searchParams.get('lang')==='fr'?'fr':'en';res.writeHead(200,{'content-type':'text/html'});
    res.end(`<p id="log"></p>${labels[lang].map((label,i)=>`<button onclick="log.textContent+='${i+1}';if(log.textContent==='123')document.body.insertAdjacentHTML('beforeend','<p>All done</p>')">${label}</button>`).join('')}`);});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
  const store=new TraceStore(':memory:'),engine=new WorkflowEngine(store);let plans=0,repairs=0;
  const saved=engine.create({name:'Count to three',startUrl:origin+'/',plan:{goal:'Count',steps:['Count'],actions:labels.en.map(name=>({type:'click' as const,target:{role:'button',name}})),completion:[{type:'text_exists',value:'All done'}],continue:false}},'taught');
  const provider:LLMProvider={name:'fixture',
    repair:async context=>{repairs++;const failed=(context.failedAction as {target:{name:string}}).target.name;return RepairSchema.parse({actions:[{type:'click',target:{role:'button',name:labels.fr[labels.en.indexOf(failed)]}}],replace:1});},
    plan:async context=>{plans++;assert.match(context.completed.join(' '),/Deux/);return {goal:context.goal,steps:['Finish'],actions:[{type:'click',target:{role:'button',name:'Trois'}}],completion:[{type:'text_exists',value:'3'}],continue:false};}};
  const agent=new Agent({store,provider,mode:'ultra'});
  try{
    const french=await agent.runProcedure(saved.id,{},origin+'/?lang=fr');
    assert.equal(french.status,'completed',french.error??'Task failed');assert.deepEqual([repairs,plans],[2,1],'Two repairs, then one plan for the rest');
    assert(french.completion.some(condition=>condition.type==='text_exists'&&condition.value==='All done'),'The procedure check was still required');
    const version=engine.get(saved.id)!;assert.equal(version.version,2);
    assert.deepEqual(version.plan.actions.map(action=>'alternatives'in action?action.alternatives:undefined),labels.en.map(name=>[{role:'button',name}]),'Each French step keeps its English target');
    const english=await agent.runProcedure(saved.id,{},origin+'/');
    assert.equal(english.status,'completed',english.error??'Task failed');assert.equal(english.metrics.llmCalls,0);assert.deepEqual([repairs,plans],[2,1]);
  }finally{await agent.close();store.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
