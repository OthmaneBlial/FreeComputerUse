import {realTasks,practiceTasks} from './examples.js';
const $=id=>document.getElementById(id);let mode='real',category='all',timer;
function message(text){$('toast').textContent=text;$('toast').hidden=false;clearTimeout(timer);timer=setTimeout(()=>$('toast').hidden=true,4000);}
const node=(tag,text,className)=>{const element=document.createElement(tag);if(text)element.textContent=text;if(className)element.className=className;return element;};
function render(){
  $('task-list').replaceChildren();
  const ordered=mode==='real'?realTasks:[...practiceTasks].sort((a,b)=>Number(!!b.featured)-Number(!!a.featured));
  for(const task of ordered.filter(task=>category==='all'||task.category===category)){
    const card=node('article',null,'task-card'+(task.featured?' featured':'')),top=node('div',null,'card-top'),symbol=node('span',task.symbol,'site-symbol'),badge=node('span',task.trial==='passed'?'AGENT TRIAL PASSED':task.trial==='failed'?'AGENT TRIAL FAILED':mode==='real'?'SOURCES VERIFIED':task.featured?'SIX-PAGE WORKFLOW':'SYNTHETIC PRACTICE','badge '+(task.featured?'featured':mode==='practice'||task.trial==='passed'?'practice':''));top.append(symbol,badge);card.append(top,node('span',task.site,'kicker'),node('h3',task.title),node('p',task.description));
    const chips=node('div',null,'chips');for(const item of task.interactions)chips.append(node('span',item));card.append(chips,node('span',task.output,'task-output'));
    const details=node('details',null,'card-details');details.append(node('summary','Goal, starting page & sources'),node('code',task.url),node('p',task.goal),node('p',task.note));
    for(const [index,url] of task.sources.entries()){const link=node('a',`Source ${index+1} ↗`);link.href=url;link.target='_blank';link.rel='noopener noreferrer';details.append(link,document.createTextNode(' · '));}card.append(details);
    const actions=node('div',null,'card-actions'),copy=node('button','Copy goal'),start=node('a','Open starting page ↗');copy.onclick=async()=>{try{await navigator.clipboard.writeText(task.goal);message('Goal copied. Paste it into “What should happen?” in your local workspace.');}catch{details.open=true;message('Copy the goal from the expanded details.');}};start.href=task.url;start.target='_blank';start.rel='noopener noreferrer';actions.append(copy,start);card.append(actions);$('task-list').append(card);
  }
}
const tabs=[...document.querySelectorAll('[role="tab"]')];
function selectTab(tab){
  mode=tab.id==='practice-tab'?'practice':'real';
  for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;}
  $('task-list').setAttribute('aria-labelledby',tab.id);render();
}
for(const tab of tabs)tab.onclick=()=>selectTab(tab);
$('example-tabs').addEventListener('keydown',event=>{
  const current=event.target.closest('[role="tab"]');if(!current)return;
  const index=tabs.indexOf(current);let next;
  if(event.key==='ArrowRight')next=tabs[(index+1)%tabs.length];
  else if(event.key==='ArrowLeft')next=tabs[(index+tabs.length-1)%tabs.length];
  else if(event.key==='Home')next=tabs[0];
  else if(event.key==='End')next=tabs.at(-1);
  else return;
  event.preventDefault();selectTab(next);next.focus();
});
for(const button of document.querySelectorAll('[data-category]'))button.onclick=()=>{category=button.dataset.category;for(const peer of document.querySelectorAll('[data-category]'))peer.setAttribute('aria-pressed',String(peer===button));render();};
render();
