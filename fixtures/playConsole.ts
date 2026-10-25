// A local imitation of a Play Console production release, for tests and benchmarks. It is not Google software and talks to no Google service.
import type { IncomingMessage,ServerResponse } from 'node:http';

export interface PlayRelease {versionCode:number;versionName:string;notes:string;status:'available'|'draft'|'in_review'}
export interface PlayApp {pkg:string;name:string;releases:PlayRelease[]}
const text={
  en:{allApps:'All apps',viewApp:'View app',dashboard:'Dashboard',testRelease:'Test and release',production:'Production',testing:'Internal testing',create:'Create new release',
    bundles:'App bundles',upload:'Upload',uploadLabel:'Upload app bundle',processing:'Processing the app bundle…',ready:'Ready',releaseName:'Release name',notes:'Release notes',next:'Next',
    preview:'Preview and confirm',save:'Save',publish:'Save and publish',confirmTitle:'Send changes to Google for review?',confirm:'Send changes for review',cancel:'Cancel',
    inReview:'In review',sent:'Changes sent for review',available:'Available on Google Play',draft:'Draft',warnings:'1 warning',
    warning:'This App Bundle contains Java/Kotlin code, which might be obfuscated. We recommend you upload a deobfuscation file.',
    badType:'Upload an Android App Bundle (.aab) file.',unreadable:'This file could not be read as an app bundle.',used:(code:number)=>`Version code ${code} has already been used. Try another version code.`,
    noBundle:'Add an app bundle before continuing.',wait:'Wait until the app bundle has been processed.',track:'Track',releases:'Releases',status:'Status',version:'Version',signedIn:'Signed in as release-manager@example.test',banner:'New: policy status now appears on your app dashboard.',dismiss:'Dismiss'},
  fr:{allApps:'Toutes les applications',viewApp:"Afficher l'application",dashboard:'Tableau de bord',testRelease:'Tester et publier',production:'Production',testing:'Tests internes',create:'Créer une release',
    bundles:'App bundles',upload:'Importer',uploadLabel:'Importer un app bundle',processing:"Traitement de l'app bundle…",ready:'Prêt',releaseName:'Nom de la release',notes:'Notes de version',next:'Suivant',
    preview:'Prévisualiser et confirmer',save:'Enregistrer',publish:'Enregistrer et publier',confirmTitle:"Envoyer les modifications à Google pour examen ?",confirm:'Envoyer les modifications pour examen',cancel:'Annuler',
    inReview:"En cours d'examen",sent:'Modifications envoyées pour examen',available:'Disponible sur Google Play',draft:'Brouillon',warnings:'1 avertissement',
    warning:"Cet app bundle contient du code Java/Kotlin susceptible d'être obscurci. Nous vous recommandons d'importer un fichier de désobscurcissement.",
    badType:'Importez un fichier Android App Bundle (.aab).',unreadable:"Impossible de lire ce fichier comme un app bundle.",used:(code:number)=>`Le code de version ${code} a déjà été utilisé. Essayez-en un autre.`,
    noBundle:'Ajoutez un app bundle avant de continuer.',wait:"Attendez la fin du traitement de l'app bundle.",track:'Canal',releases:'Releases',status:'État',version:'Version',signedIn:'Connecté en tant que release-manager@example.test',banner:"Nouveau : l'état des règles s'affiche sur le tableau de bord.",dismiss:'Ignorer'},
};
type Lang=keyof typeof text;
/** Variant 2 keeps the flow but changes letter case, punctuation and ids, adds a banner, and renames "Next". */
function words(lang:Lang,variant:number){
  const t={...text[lang]};
  if(variant===2){t.create=lang==='en'?'Create New Release':'Créer une Release';t.notes=t.notes+' :'.slice(lang==='en'?1:0);t.next=lang==='en'?'Review release':'Vérifier la release';t.viewApp=t.viewApp.toUpperCase();}
  return t;
}
const esc=(value:string)=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]!);
const style=`body{font:15px system-ui;margin:0;background:#f6f8fc;color:#202124}header{display:flex;justify-content:space-between;align-items:center;padding:12px 24px;background:#fff;border-bottom:1px solid #dadce0}
.layout{display:flex}nav{width:240px;padding:16px;background:#fff;min-height:calc(100vh - 60px)}nav button,nav a{display:block;width:100%;text-align:left;padding:8px;margin:2px 0;border:0;background:none;font:inherit;color:#1a73e8;cursor:pointer;text-decoration:none}
main{flex:1;padding:24px 32px}table{border-collapse:collapse;width:100%;background:#fff}td,th{padding:12px;border-bottom:1px solid #e0e0e0;text-align:left}.primary{background:#1a73e8;color:#fff;border:0;padding:10px 18px;border-radius:4px;font:inherit;cursor:pointer}
.card{background:#fff;padding:20px;border-radius:8px;margin:16px 0}.error{color:#c5221f}.banner{background:#e8f0fe;padding:10px 24px}textarea{width:100%;min-height:90px}dialog{border:0;border-radius:8px;padding:24px}`;
export function playConsole(){
  const apps:PlayApp[]=[
    {pkg:'com.example.snake',name:'Snake Arena',releases:[{versionCode:13,versionName:'1.3',notes:'Bug fixes',status:'available'}]},
    {pkg:'com.example.budget',name:'Budget Buddy',releases:[{versionCode:7,versionName:'2.1',notes:'Faster sync',status:'available'}]},
  ];
  const bundles=new Map<string,{pkg:string;versionCode:number;versionName:string}>();let next=1;
  const page=(lang:Lang,variant:number,title:string,nav:string,body:string)=>{
    const t=words(lang,variant);
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><title>${esc(title)} · Play Console (simulator)</title><link rel="icon" href="data:,"><style>${style}</style></head><body>
<header><strong>Play Console <small>(local simulator)</small></strong><span>${esc(t.signedIn)}</span></header>${variant===2?`<div class="banner" id="banner-v2">${esc(t.banner)} <button onclick="this.parentElement.remove()">${esc(t.dismiss)}</button></div>`:''}
<div class="layout">${nav}<main>${body}</main></div></body></html>`;
  };
  const appNav=(lang:Lang,variant:number,app:PlayApp,query:string)=>{
    const t=words(lang,variant);
    return `<nav aria-label="App menu"><a href="/play/console${query}">${esc(t.allApps)}</a><a href="/play/console/app/${app.pkg}/dashboard${query}">${esc(t.dashboard)}</a>
<button aria-expanded="false" aria-controls="release-menu" id="${variant===2?'grp-rel-2':'release-group'}" onclick="const open=this.getAttribute('aria-expanded')==='true';this.setAttribute('aria-expanded',String(!open));document.getElementById('release-menu').hidden=open">${esc(t.testRelease)}</button>
<div id="release-menu" hidden><a href="/play/console/app/${app.pkg}/tracks/production${query}">${esc(t.production)}</a><a href="/play/console/app/${app.pkg}/tracks/internal${query}">${esc(t.testing)}</a></div></nav>`;
  };
  const statusText=(t:ReturnType<typeof words>,status:PlayRelease['status'])=>status==='available'?t.available:status==='draft'?t.draft:t.inReview;
  async function handle(req:IncomingMessage,res:ServerResponse,url:URL):Promise<boolean>{
    if(!url.pathname.startsWith('/play/'))return false;
    const lang:Lang=url.searchParams.get('lang')==='fr'?'fr':'en',variant=url.searchParams.get('variant')==='2'?2:1,t=words(lang,variant);
    const query=url.search,html=(status:number,value:string)=>{res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(value);};
    const json=(status:number,value:unknown)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(value));};
    const route=url.pathname.match(/^\/play\/(?:api\/)?(?:console\/)?app\/([\w.]+)\/(.+)$/),app=route?apps.find(item=>item.pkg===route[1]):undefined;
    if(req.method==='POST'&&url.pathname.startsWith('/play/api/')){
      const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=(chunk as Buffer).length;if(size>5_000_000){json(413,{error:'Too large'});return true;}chunks.push(chunk as Buffer);}
      const body=Buffer.concat(chunks);
      if(!app){json(404,{error:'Unknown app'});return true;}
      if(route![2]==='bundles'){
        const name=String(req.headers['x-file-name']??'');
        if(!/\.aab$/i.test(name)){json(400,{error:t.badType});return true;}
        const manifest=body.toString('latin1'),code=/versionCode=(\d{1,9})/.exec(manifest)?.[1],version=/versionName=([\w.-]{1,40})/.exec(manifest)?.[1];
        if(!code||!version){json(400,{error:t.unreadable});return true;}
        const used=apps.flatMap(item=>item.pkg===app.pkg?item.releases:[]).map(item=>item.versionCode);
        if(used.includes(Number(code))||Number(code)<=Math.max(...used)){json(400,{error:t.used(Number(code))});return true;}
        // Processing takes a moment, as in the real console.
        await new Promise(resolve=>setTimeout(resolve,1200));
        const id=String(next++);bundles.set(id,{pkg:app.pkg,versionCode:Number(code),versionName:version});json(201,{id,versionCode:Number(code),versionName:version});return true;
      }
      if(route![2]==='releases'){
        let input:{bundle?:string;notes?:string;submit?:boolean};try{input=JSON.parse(body.toString('utf8'));}catch{json(400,{error:'Invalid request'});return true;}
        const bundle=bundles.get(input.bundle??'');if(!bundle||bundle.pkg!==app.pkg){json(400,{error:t.noBundle});return true;}
        const existing=app.releases.find(item=>item.versionCode===bundle.versionCode&&item.status!=='available');
        const release:PlayRelease=existing??{versionCode:bundle.versionCode,versionName:bundle.versionName,notes:'',status:'draft'};
        release.notes=String(input.notes??'').slice(0,500);release.status=input.submit?'in_review':'draft';if(!existing)app.releases.push(release);
        json(200,release);return true;
      }
      json(404,{error:'Not found'});return true;
    }
    if(url.pathname==='/play/console'){
      return html(200,page(lang,variant,t.allApps,'<nav aria-label="Account"><a href="/play/console'+esc(query)+'">'+esc(t.allApps)+'</a></nav>',`<h1>${esc(t.allApps)}</h1><table><thead><tr><th>App</th><th>${esc(t.status)}</th><th></th></tr></thead><tbody>${apps.map(item=>`<tr><td>${esc(item.name)}<br><small>${item.pkg}</small></td><td>${esc(statusText(t,item.releases.at(-1)!.status))}</td><td><a aria-label="${esc(t.viewApp)}: ${esc(item.name)}" href="/play/console/app/${item.pkg}/dashboard${esc(query)}">${esc(t.viewApp)}</a></td></tr>`).join('')}</tbody></table>`)),true;
    }
    if(!app){html(404,'<h1>Not found</h1>');return true;}
    const nav=appNav(lang,variant,app,esc(query)),section=route![2];
    if(section==='dashboard')return html(200,page(lang,variant,app.name,nav,`<h1>${esc(app.name)}</h1><p>${app.pkg}</p><div class="card">${esc(t.dashboard)}</div>`)),true;
    if(section==='tracks/production'||section==='tracks/internal'){
      const production=section==='tracks/production';
      return html(200,page(lang,variant,t.production,nav,`<h1>${esc(production?t.production:t.testing)}</h1>${production?`<a class="primary" role="button" href="/play/console/app/${app.pkg}/tracks/production/releases/new${esc(query)}">${esc(t.create)}</a>`:''}
<h2>${esc(t.releases)}</h2><table><thead><tr><th>${esc(t.version)}</th><th>${esc(t.status)}</th></tr></thead><tbody>${(production?app.releases:[]).map(item=>`<tr><td>${item.versionCode} (${esc(item.versionName)})</td><td>${esc(statusText(t,item.status))}</td></tr>`).join('')}</tbody></table>`)),true;
    }
    if(section==='tracks/production/releases/new'){
      const strings=JSON.stringify({processing:t.processing,ready:t.ready,noBundle:t.noBundle,wait:t.wait,preview:t.preview,publish:t.publish,save:t.save,warnings:t.warnings,warning:t.warning,sent:t.sent,inReview:t.inReview,draft:t.draft,releaseName:t.releaseName,notes:t.notes,confirmTitle:t.confirmTitle,confirm:t.confirm,cancel:t.cancel}).replace(/</g,'\\u003c');
      return html(200,page(lang,variant,t.create,nav,`<h1 id="title">${esc(t.create)}</h1><div id="step-edit">
<section class="card"><h2>${esc(t.bundles)}</h2><input type="file" id="${variant===2?'file-v2':'bundle-file'}" accept=".aab" aria-label="${esc(t.uploadLabel)}" hidden><button type="button" class="primary" onclick="this.previousElementSibling.click()">${esc(t.upload)}</button>
<p id="bundle-status" role="status"></p><p id="bundle-error" class="error" role="alert"></p></section>
<section class="card"><label for="${variant===2?'name-v2':'release-name'}">${esc(t.releaseName)}</label><br><input id="${variant===2?'name-v2':'release-name'}" size="40"><br><br><label for="${variant===2?'notes-v2':'release-notes'}">${esc(t.notes)}</label><textarea id="${variant===2?'notes-v2':'release-notes'}"></textarea></section>
<p id="form-error" class="error" role="alert"></p><button type="button" class="primary" id="${variant===2?'review-v2':'next'}">${esc(t.next)}</button></div>
<div id="step-review" hidden></div><dialog id="confirm-dialog" aria-labelledby="confirm-title"><h2 id="confirm-title"></h2><button type="button" id="confirm-cancel"></button> <button type="button" class="primary" id="confirm-send"></button></dialog>
<script>(()=>{const nextId='${variant===2?'review-v2':'next'}',s=${strings},api='/play/api/app/${app.pkg}/';let bundle,busy=false;const $=id=>document.getElementById(id);const input=document.querySelector('input[type=file]'),notes=document.querySelector('textarea'),name=document.querySelector('#step-edit input:not([type])');
input.addEventListener('change',async()=>{const file=input.files[0];if(!file)return;bundle=undefined;busy=true;$(nextId).disabled=true;$('bundle-error').textContent='';$('bundle-status').textContent=s.processing;
const response=await fetch(api+'bundles',{method:'POST',headers:{'x-file-name':file.name},body:file});const data=await response.json();busy=false;$(nextId).disabled=false;
if(!response.ok){$('bundle-status').textContent='';$('bundle-error').textContent=data.error;input.value='';return;}bundle=data;$('bundle-status').textContent=data.versionCode+' ('+data.versionName+') · '+s.ready;if(!name.value)name.value=data.versionCode+' ('+data.versionName+')';});
const send=async submit=>{const response=await fetch(api+'releases',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({bundle:bundle.id,notes:notes.value,submit})});return response.json();};
$(nextId).onclick=()=>{$('form-error').textContent='';if(busy){$('form-error').textContent=s.wait;return;}if(!bundle){$('form-error').textContent=s.noBundle;return;}
$('step-edit').hidden=true;const review=$('step-review');review.hidden=false;document.getElementById('title').textContent=s.preview;
review.innerHTML='<section class="card" aria-label="Release summary"><p><strong></strong></p><p></p><p></p></section><details class="card"><summary></summary><p></p></details><button type="button" id="save"></button> <button type="button" class="primary" id="publish"></button><p id="result" role="status"></p>';
const [title,code,text]=review.querySelectorAll('section p');title.firstChild.textContent=s.releaseName+': '+name.value;code.textContent='Version code: '+bundle.versionCode+' · '+bundle.versionName;text.textContent=s.notes+': '+notes.value;
review.querySelector('summary').textContent=s.warnings;review.querySelector('details p').textContent=s.warning;$('save').textContent=s.save;$('publish').textContent=s.publish;
$('save').onclick=async()=>{const release=await send(false);$('result').textContent=s.draft+': '+release.versionCode+' ('+release.versionName+')';};
$('publish').onclick=()=>{$('confirm-title').textContent=s.confirmTitle;$('confirm-cancel').textContent=s.cancel;$('confirm-send').textContent=s.confirm;$('confirm-dialog').showModal();};};
$('confirm-cancel').onclick=()=>$('confirm-dialog').close();
$('confirm-send').onclick=async()=>{const release=await send(true);$('confirm-dialog').close();$('result').textContent=s.sent+'. '+release.versionCode+' ('+release.versionName+') · '+s.inReview;};})();</script>`)),true;
    }
    html(404,'<h1>Not found</h1>');return true;
  }
  return{apps,handle};
}
