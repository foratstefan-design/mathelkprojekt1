import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {questionLayout,fitQuestion} from '../public/viewport.js';
const elements=new Map(),scenes=[],calls=[];
function classes(){const list=new Set();return {toggle(name,on){if(on===undefined)on=!list.has(name);on?list.add(name):list.delete(name);return on;},contains:name=>list.has(name),add:name=>list.add(name),remove:name=>list.delete(name)};}
class Element {
  constructor(id=''){this.id=id;this.dataset={};this.style={};this.classList=classes();this.attributes={};this.isConnected=true;this.disabled=false;this._html='';}
  set innerHTML(html){this._html=html;for(const match of html.matchAll(/id="([^"]+)"/g))elements.set(match[1],new Element(match[1]));}
  get innerHTML(){return this._html;}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key]??'false';}
  querySelector(selector){if(selector==='h1,h2')return new Element();if(selector==='button')return new Element();return query(selector);}
  querySelectorAll(){return [];}
  focus(){} addEventListener(){} append(){} showModal(){this.open=true;} close(value){this.open=false;this.returnValue=value;this.onclose?.();}
}
function query(selector){const id=selector.replace(/^#/,'');if(!elements.has(id))elements.set(id,new Element(id));return elements.get(id);}
const body=new Element('body'),storage=new Map();
class Scene {
  constructor(){this.calls=[];scenes.push(this);}
  setMode(mode){this.calls.push(['mode',mode]);}
  setFlightView(view){this.calls.push(['flightView',view]);return Promise.resolve();}
  ascend(){this.calls.push(['ascend']);return Promise.resolve();}
  setAltitude(height){this.calls.push(['height',height]);}
  setDanger(){}setSpeed(){}reset(){}
  setQuestionLayout(layout){this.calls.push(['questionLayout',layout]);}
  takeoff(){this.calls.push(['takeoff']);return Promise.resolve();}
  recover(){this.calls.push(['recover']);return Promise.resolve();}
  stall(){this.calls.push(['stall']);return Promise.resolve();}
  boost(){this.calls.push(['boost']);}
  crash(){this.calls.push(['crash']);return Promise.resolve();}
}
let handler=()=>({}),frame=0;
const location={hash:'#anleitung',origin:'https://flight.test',pathname:'/mathelkprojekt1/'};
const context=vm.createContext({
  console,crypto,URL,Response,Intl,Date,Math,Promise,performance,setTimeout,clearTimeout,
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},
  matchMedia:()=>({matches:true}),requestAnimationFrame:()=>++frame,cancelAnimationFrame(){},
  questionLayout,fitQuestion,FlightScene:Scene,plane:()=>'<svg></svg>',hero:'<svg></svg>',location,API_ORIGIN:'',
  window:{scrollTo(){},addEventListener(){},history:{replaceState(a,b,value){location.hash=value;}}},
  document:{body,querySelector:query,querySelectorAll:()=>[],addEventListener(){},createElement:()=>new Element()},
  navigator:{},fetch:async(path,init)=>{calls.push({path,body:init?.body?JSON.parse(init.body):null});const result=await handler(path,init);const status=result.__httpStatus||200;const body={...result};delete body.__httpStatus;return new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});}
});
let source=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
source=source.replace(/^import .*;\n/gm,'');
vm.runInContext(source,context);
const execute=text=>vm.runInContext(text,context);
const result={correct:true,questionId:'q1',questionIndex:0,prompt:'Warum schwimmt Eis?',correctLabel:'Es hat eine geringere Dichte',explanation:'Wasser bildet beim Gefrieren ein offenes Kristallgitter.',source:{title:'USGS',url:'https://www.usgs.gov/'},options:[{id:'a',label:'Dichte',displayValue:'Richtig'}],points:25,altitudeGain:350,altitudeLoss:0};
const q={id:'q1',type:'general',category:'Physik',difficulty:1,prompt:result.prompt,basisLabel:'Wissen',options:[{id:'a',label:'Dichte'},{id:'b',label:'Masse'},{id:'c',label:'Temperatur'},{id:'d',label:'Farbe'}]};
function setRun(overrides={}){
  context.fixture={id:'run1',mode:'mix',kind:'free',status:'flying',index:0,streak:0,correctTotal:0,score:0,altitude:0,peakAltitude:0,danger:0,recovering:false,timeLimitMs:18000,deadline:Date.now()+18000,question:q,...overrides};
  execute('run=fixture;currentQuestion=run.question;busy=false;question();');
}
function response(overrides={}){
  return {...context.fixture,status:'ready',index:1,correctTotal:1,streak:1,score:25,altitude:350,peakAltitude:350,question:null,deadline:null,result,latestResult:result,...overrides};
}
setRun();calls.length=0;handler=()=>response();
await execute("submitChoice('a')");
assert.equal(execute('screen'),'feedback');
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,0,'learning does not start a new timer');
assert.match(query('#main').innerHTML,/Kristallgitter/);
assert.match(query('#main').innerHTML,/WEITERFLIEGEN/);
handler=()=>({...context.fixture,index:1,question:{...q,id:'q2'}});
await execute('advanceFlight()');
assert.equal(execute('screen'),'question');
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,1,'explicit next starts question');
setRun({kind:'daily',mode:'daily',dailyMode:'mix',competitionVersion:3,questionCount:10,dailyDate:'2026-11-20',index:9,altitude:350,peakAltitude:900});
scenes[0].calls.length=0;calls.length=0;
handler=path=>path.includes('leaderboard')?{own:{rank:2},totalFinished:3}:response({kind:'daily',mode:'daily',dailyMode:'mix',competitionVersion:3,questionCount:10,dailyDate:'2026-11-20',status:'finished',index:10,altitude:700,peakAltitude:900,pilotName:'Pilot'});
await execute("submitChoice('a')");
assert.equal(execute('screen'),'feedback');
assert.match(query('#main').innerHTML,/TAGESERGEBNIS ANSEHEN/);
await execute('advanceFlight()');
assert.equal(execute('screen'),'results');
assert.equal(scenes[0].calls.filter(x=>x[0]==='crash').length,0,'finished daily never crashes');
assert.ok(scenes[0].calls.some(x=>x[0]==='recover'),'positive finish animation');
assert.equal(execute('run.altitude'),700);
assert.match(query('#main').innerHTML,/700 <small>Meter/);
assert.match(query('#main').innerHTML,/BUNTER MIX/);
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,0,'no eleventh question');
setRun({danger:2,altitude:400,peakAltitude:900});
handler=()=>response({status:'crashed',danger:3,index:0,altitude:0,peakAltitude:900,result:{...result,correct:false},latestResult:{...result,correct:false}});
await execute("submitChoice('b')");
assert.equal(execute('screen'),'results');
assert.equal(scenes[0].calls.filter(x=>x[0]==='crash').length,1,'practice still crashes');
execute("store.set('active',{id:'saved-free'});screen='home';busy=false;");
handler=path=>path.includes('leaderboard')?{own:{rank:1},totalFinished:1}:response({status:'finished',kind:'daily',mode:'daily',dailyMode:'common',competitionVersion:3,questionCount:10,index:10,dailyDate:'2026-11-20',altitude:700,peakAltitude:900});
await execute("startFlight('daily')");
assert.equal(execute("store.get('active',null).id"),'saved-free','viewing finished daily preserves saved free flight');
calls.length=0;
execute("store.set('active',{id:'run1'});busy=false;");
handler=()=>response();
await execute('resumeFlight()');
assert.equal(execute('screen'),'feedback');
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,0,'resume shows last fact before arming next');
setRun();calls.length=0;let attempts=0;
handler=()=>{if(!attempts++)throw Error('offline');return response();};
await execute("submitChoice('a')");
assert.equal(execute('screen'),'question');
await execute('submitChoice(null,false,pendingChoice)');
assert.equal(execute('screen'),'feedback');
assert.deepEqual(calls.map(x=>x.body.choiceId),['a','a'],'retry preserves first submitted choice');
assert.equal(execute("sourceList({source:{url:'javascript:alert(1)'}})"),'');
assert.ok(execute("pilotForm('<script>')").includes('&lt;script&gt;'));
calls.length=0;handler=path=>path.includes('profile')?{name:'<script>'}:{date:'2026-11-20',mode:'common',entries:[{rank:1,name:'<script>alert(1)</script>',altitude:3000,score:100,answerElapsedMs:10000,isYou:true}],own:{rank:1},totalFinished:1};
await execute("leaderboard('2026-11-20')");
assert.equal(execute('screen'),'bestenliste');
assert.ok(query('#leaderboard-content').innerHTML.includes('&lt;script&gt;'));
assert.ok(!query('#leaderboard-content').innerHTML.includes('<script>'));

// New days are explicitly mixed; saved historical courses retain their label.
execute("screen='home';version++;busy=false;");
handler=()=>({date:'2026-11-25',mode:'mix',dailyMode:'mix',questionCount:10,available:true,attempt:null});
await execute('loadDaily(version)');
assert.equal(query('#daily-start').disabled,false);
assert.equal(query('#daily-state').textContent,'HEUTIGEN VERSUCH STARTEN');
assert.match(query('#daily-mode-note').textContent,/BUNTER MIX/);
assert.match(query('#daily-mode-note').textContent,/Zehn gleiche Fragen aus verschiedenen Bereichen/);
assert.equal(query('#daily-plan').textContent,'3 LEICHT · 4 MITTEL · 3 SCHWER');
assert.match(query('#daily-mode-note').textContent,/Zuerst 3 leichte, dann 4 mittlere und 3 schwere Fragen/);
setRun({kind:'daily',mode:'daily',dailyMode:'mix',competitionVersion:3,questionCount:10,index:2});
assert.equal(query('#hud-mode').textContent,'TAGESFLUG · BUNTER MIX');
assert.match(query('#main').innerHTML,/FRAGE 3 \/ 10 · BUNTER MIX/);
execute("screen='home';version++;busy=false;");
handler=()=>({date:'2026-11-24',mode:'common',dailyMode:'common',questionCount:10,attempt:{status:'ready',competitionVersion:3}});
await execute('loadDaily(version)');
assert.equal(query('#daily-state').textContent,'TAGESFLUG FORTSETZEN');
assert.match(query('#daily-mode-note').textContent,/BEREITS FESTGELEGT: MEHR/);
assert.match(query('#daily-mode-note').textContent,/Diese Runde bleibt für alle gleich/);
assert.match(query('#daily-mode-note').textContent,/Neue Tagesrunden werden gemischt/);
execute('instructions()');
assert.match(query('#main').innerHTML,/bunter Mix aus Allgemeinwissen, Mengenvergleichen und Zeitfragen/);
assert.ok(!query('#main').innerHTML.includes('Der Modus wechselt täglich'));
assert.equal(execute("modeInfo('mix').label"),'Mix','free course labels are unchanged');
assert.match(query('#main').innerHTML,/genau 3 leichte, 4 mittelschwere und 3 schwere Fragen in dieser Reihenfolge/);
assert.match(query('#main').innerHTML,/eigenständig formulierten Schul- und Wissensfragen/);
for(const topic of ['Literatur','Musik','Religionen und Weltanschauungen','Kunst','Sport','Alltagswissenschaft'])assert.ok(query('#main').innerHTML.includes(topic));
assert.ok(!query('#main').innerHTML.includes('acht Einstiegsfragen'));

// Stored days report their own plan; new daily badges show each actual tier.
execute("screen='home';version++;busy=false;");
handler=()=>({dailyMode:'mix',progressiveDaily:false,difficultyPlan:[1,1,1,1,1,1,1,1,2,2],attempt:null});
await execute('loadDaily(version)');
assert.equal(query('#daily-plan').textContent,'8 LEICHT · 2 MITTEL · 0 SCHWER');
// The previously published 3/2/5 lesson keeps its actual saved plan, including
// when an older server still marks that former progression as current.
handler=()=>({dailyMode:'mix',progressiveDaily:true,difficultyPlan:[1,1,1,2,2,3,3,3,3,3],attempt:{status:'ready',competitionVersion:3}});
await execute('loadDaily(version)');
assert.equal(query('#daily-plan').textContent,'3 LEICHT · 2 MITTEL · 5 SCHWER');
assert.ok(!query('#daily-mode-note').textContent.includes('4 mittlere'));
assert.equal(query('#daily-state').textContent,'TAGESFLUG FORTSETZEN');
for(const [difficulty,label,index] of [[1,'LEICHT',0],[2,'MITTEL',3],[3,'SCHWER',7]]){
  setRun({kind:'daily',mode:'daily',dailyMode:'mix',competitionVersion:3,questionCount:10,index,question:{...q,category:'Mathematik',difficulty,basis:'school',basisLabel:'Schulwissen · Mathematik'}});
  assert.match(query('#main').innerHTML,new RegExp('data-level="'+difficulty+'">'+label+'</span>'));
  assert.match(query('#main').innerHTML,/Schulwissen · Mathematik/);
  assert.ok(!query('#main').innerHTML.includes(result.explanation),'future explanations stay hidden');
}
setRun({kind:'daily',mode:'daily',dailyMode:'mix',competitionVersion:3,questionCount:10,index:4,question:{...q,category:'Musik',difficulty:2,basis:'curated',basisLabel:'Wissen · Musik'}});
assert.match(query('#main').innerHTML,/Wissen · Musik/);
assert.ok(!query('#main').innerHTML.includes('Schulwissen · Musik'));
setRun({question:{...q,difficulty:2}});
assert.match(query('#main').innerHTML,/data-level="2">VERTIEFUNG<\/span>/,'free-flight labels stay intact');

// Reaching a finite catalog is a successful saved end, never a crash or retry loop.
setRun({altitude:700,peakAltitude:900,score:55,correctTotal:2});
handler=()=>response({status:'ready',altitude:700,peakAltitude:900,score:55});
await execute("submitChoice('a')");
scenes[0].calls.length=0;calls.length=0;
handler=()=>response({status:'exhausted',poolExhausted:true,altitude:700,peakAltitude:900,score:55});
await execute('advanceFlight()');
assert.equal(execute('screen'),'results');
assert.match(query('#main').innerHTML,/Alles entdeckt/);
assert.match(query('#main').innerHTML,/900 <small>Meter/);
assert.ok(!query('#main').innerHTML.includes('NOCH EIN FLUG'));
assert.ok(!query('#main').innerHTML.includes('ABSTURZ'));
assert.equal(scenes[0].calls.filter(x=>x[0]==='crash').length,0);
assert.equal(execute('run.altitude'),700);
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,1);

// A resumed depleted run shows the same calm end and does not request another question.
execute("store.set('active',{id:'run1'});busy=false;");calls.length=0;
handler=()=>response({status:'exhausted',poolExhausted:true,altitude:700,peakAltitude:900,score:55});
await execute('resumeFlight()');
assert.equal(execute('screen'),'results');
assert.match(query('#main').innerHTML,/Alles entdeckt/);
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,0);
assert.equal(execute("store.get('active',null)"),null);

// Daily exhaustion is not a consumed attempt and must preserve another saved free flight.
execute("store.set('active',{id:'saved-free'});screen='home';busy=false;");
scenes[0].calls.length=0;calls.length=0;
handler=path=>path.includes('/api/start')?{__httpStatus:409,error:'Keine zehn neuen Fragen',code:'QUESTION_POOL_EXHAUSTED',poolExhausted:true}:{};
await execute('startDaily()');
assert.equal(execute('screen'),'catalog');
assert.match(query('#main').innerHTML,/Neue Tagesfragen fehlen/);
assert.equal(execute("store.get('active',null).id"),'saved-free');
assert.equal(scenes[0].calls.filter(x=>x[0]==='crash').length,0);
assert.equal(calls.filter(x=>x.path.includes('/api/next')).length,0);

// On the station an unavailable day is disabled without inventing an attempt.
execute("screen='home';version++;busy=false;");
handler=()=>({date:'2026-11-24',dailyMode:'common',questionCount:10,available:false,poolExhausted:true,attempt:null});
await execute('loadDaily(version)');
assert.equal(query('#daily-start').disabled,true);
assert.equal(query('#daily-state').textContent,'TAGESVORRAT AUSGESCHÖPFT');
assert.match(query('#daily-mode-note').textContent,/Tagesversuch bleibt unberührt/);

// The explicitly replaced day offers one fresh attempt, then resumes that attempt.
handler=()=>({date:'2026-11-25',dailyMode:'mix',dailyRevision:1,refreshed:true,questionCount:10,attempt:null});
await execute('loadDaily(version)');
assert.equal(query('#daily-state').textContent,'HEUTIGEN MIX NEU STARTEN');
assert.match(query('#daily-mode-note').textContent,/bisherige Runde wurde ersetzt/);
assert.match(query('#daily-mode-note').textContent,/einen neuen Tagesversuch/);
handler=()=>({date:'2026-11-25',dailyMode:'mix',dailyRevision:1,refreshed:true,questionCount:10,attempt:{status:'ready',dailyRevision:1,competitionVersion:3}});
await execute('loadDaily(version)');
assert.equal(query('#daily-state').textContent,'TAGESFLUG FORTSETZEN');
assert.ok(!query('#daily-mode-note').textContent.includes('einen neuen Tagesversuch'));

// An old saved round never opens as the current result or requests its ranking.
const oldDaily={...context.fixture,id:'old-daily',kind:'daily',mode:'daily',dailyMode:'rare',dailyRevision:0,dailySuperseded:true,competitionVersion:3,questionCount:10,dailyDate:'2026-11-25',status:'finished',index:10,altitude:700,peakAltitude:900,question:null,deadline:null};
execute("store.set('active',{id:'old-daily',mode:'daily'});busy=false;");
handler=()=>oldDaily;calls.length=0;
await execute('resumeFlight()');
assert.equal(execute('screen'),'daily-refresh');
assert.match(query('#main').innerHTML,/Tagesflug neu gemischt/);
assert.match(query('#main').innerHTML,/bisheriger Flug bleibt im Flugbuch erhalten/);
assert.match(query('#main').innerHTML,/NEUEN TAGESMIX STARTEN/);
assert.equal(execute("store.get('active',null)"),null);
assert.equal(calls.filter(c=>c.path.includes('/api/next')||c.path.includes('leaderboard')).length,0);

// The same guard covers a superseded start response and direct flight-state display.
execute("store.set('active',{id:'saved-free'});busy=false;");calls.length=0;
await execute("startFlight('daily')");
assert.equal(execute('screen'),'daily-refresh');
assert.equal(execute("store.get('active',null).id"),'saved-free');
context.oldDailyFixture={...oldDaily,status:'flying',index:2,question:q};
execute('run=oldDailyFixture;showFlightState()');
assert.equal(execute('screen'),'daily-refresh');
assert.equal(execute('currentQuestion'),null);

// An already open old tab is redirected when its answer returns the new flag.
setRun({id:'old-daily',kind:'daily',mode:'daily',dailyMode:'rare',dailyRevision:0,dailyDate:'2026-11-25',competitionVersion:3,questionCount:10});
handler=()=>({...oldDaily,status:'ready',index:1});calls.length=0;
await execute("submitChoice('a')");
assert.equal(execute('screen'),'daily-refresh');
assert.equal(calls.filter(c=>c.path.includes('leaderboard')||c.path.includes('/api/next')).length,0);

// Its action starts the new revision through the normal daily endpoint.
const freshDaily={...oldDaily,id:'new-daily',dailyMode:'mix',dailyRevision:1,dailySuperseded:false,status:'ready',index:0,altitude:1500,peakAltitude:1500,latestResult:null};
handler=path=>path.includes('/api/start')?freshDaily:{...freshDaily,status:'flying',question:q,deadline:Date.now()+25000,timeLimitMs:25000};calls.length=0;
await query('#start-refreshed-daily').onclick();
assert.equal(execute('screen'),'question');
assert.equal(execute('run.id'),'new-daily');
assert.equal(execute('run.dailyRevision'),1);
assert.equal(calls.filter(c=>c.path.includes('/api/start')).length,1);
assert.equal(calls.find(c=>c.path.includes('/api/start')).body.mode,'daily');
assert.equal(execute("store.get('active',null).id"),'new-daily');
handler=()=>({flights:[{...oldDaily,status:'flying',finishedAt:null,startedAt:Date.UTC(2026,10,25,12)}]});
await execute('flightbook()');
assert.match(query('#history-content').innerHTML,/FRÜHERE TAGESRUNDE/);
assert.match(query('#history-content').innerHTML,/25\.11\.2026/);
assert.ok(!query('#history-content').innerHTML.includes('1.1.1970'),'archived partial flights use their actual start date');

// Catalog counts are supplied by the API, including the individual remaining free stock.
execute("screen='home';version++;");
handler=()=>({questions:3210,families:2345,remainingFreeFamilies:1234});
await execute('loadCatalog(version)');
assert.match(query('#catalog-note').innerHTML,/2\.345 verschiedene Fragen/);
assert.match(query('#catalog-note').innerHTML,/3\.210 Aufgabenvarianten/);
assert.match(query('#catalog-note').innerHTML,/1\.234 ungesehene Fragenfamilien/);

// Real action promises, rather than a guessed timeout, gate the learning card
// and crash results. No future question is armed during a visible maneuver.
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
const savedAscend=Scene.prototype.ascend,savedCrash=Scene.prototype.crash,savedStall=Scene.prototype.stall;
try{
  let begun=deferred(),finished=deferred();
  Scene.prototype.ascend=function(){this.calls.push(['ascend']);begun.resolve();return finished.promise;};
  setRun();calls.length=0;handler=()=>response();
  let pending=execute("submitChoice('a')");await begun.promise;
  assert.equal(execute('screen'),'maneuver');
  assert.match(query('#main').innerHTML,/Dein Flugzeug steigt sichtbar/);
  assert.equal(query('#main').innerHTML.includes('learning-card'),false,'the card cannot cover the climb');
  assert.equal(calls.filter(c=>c.path.includes('/api/next')).length,0);
  finished.resolve();await pending;assert.equal(execute('screen'),'feedback');

  begun=deferred();finished=deferred();
  Scene.prototype.crash=function(){this.calls.push(['crash']);begun.resolve();return finished.promise;};
  setRun({danger:2,altitude:400,peakAltitude:900});
  handler=()=>response({status:'crashed',danger:3,index:0,altitude:0,peakAltitude:900,result:{...result,correct:false},latestResult:{...result,correct:false}});
  pending=execute("submitChoice('b')");await begun.promise;
  assert.equal(execute('screen'),'crashing');assert.match(query('#main').innerHTML,/Dein Flugzeug stürzt ab/);
  assert.equal(query('#main').innerHTML.includes('question-panel'),false,'the dive and ground impact stay unobstructed');
  assert.equal(query('#main').innerHTML.includes('flight-results'),false,'results wait for impact and dust');
  finished.resolve();await pending;assert.equal(execute('screen'),'results');

  begun=deferred();finished=deferred();
  Scene.prototype.stall=function(){this.calls.push(['stall']);begun.resolve();return finished.promise;};
  setRun({altitude:400,peakAltitude:400});
  handler=()=>response({correctTotal:0,streak:0,danger:1,recovering:true,altitude:150,result:{...result,correct:false,altitudeGain:0,altitudeLoss:250}});
  pending=execute("submitChoice('b')");await begun.promise;
  assert.equal(execute('screen'),'maneuver');assert.match(query('#main').innerHTML,/stabilisiert dein Flugzeug/);
  finished.resolve();await pending;assert.equal(execute('screen'),'feedback');assert.equal(execute('run.danger'),1);

  begun=deferred();finished=deferred();
  setRun();handler=()=>response();pending=execute("submitChoice('a')");await begun.promise;
  execute('home()');finished.resolve();await pending;
  assert.equal(execute('screen'),'home','leaving a maneuver never resurrects its learning screen');
}finally{Scene.prototype.ascend=savedAscend;Scene.prototype.crash=savedCrash;Scene.prototype.stall=savedStall;}
// Pages must send every request to the shared API and retain its project path
// when a friend receives an emoji result through the platform share sheet.
context.API_ORIGIN='https://hoehenflug.courteousclay.chatgpt.site';
calls.length=0;handler=()=>({ok:true});
await execute("api('daily')");await execute("api('start',{mode:'mix'})");
assert.ok(calls.every(call=>call.path.startsWith(context.API_ORIGIN+'/api/')));
assert.equal(calls[1].body.mode,'mix');assert.ok(calls[1].body.device);
context.API_ORIGIN='';
let shared;
context.navigator.share=async value=>{shared=value;};
await execute('share()');
assert.ok(shared.text.endsWith('https://flight.test/mathelkprojekt1/'));
console.log('Frontend flow checks passed, including shared API requests and GitHub Pages share links.');

// A viewport refit only changes geometry; it never starts a question/timer again.
setRun();
const cockpit=query('.active-question'),cockpitContent=query('.question-content');
cockpit.style.setProperty=(key,value)=>cockpit.style[key]=value;
Object.defineProperty(cockpitContent,'offsetHeight',{get:()=>cockpit.dataset.density==='0'?900:700});
context.window.innerWidth=1024;context.window.innerHeight=768;
calls.length=0;const savedDeadline=execute('run.deadline');
execute('fitCockpit()');
assert.equal(cockpit.dataset.density,'1');
assert.equal(cockpit.style['--play-height'],'768px');
assert.equal(cockpit.style['--cockpit-top'],'146px');
assert.equal(execute('run.deadline'),savedDeadline);
assert.equal(calls.length,0,'rotating/resizing never arms another question');
context.window.visualViewport={width:390,height:620};
execute('fitCockpit()');
assert.equal(cockpit.style['--play-height'],'620px','browser chrome uses visual viewport');
assert.equal(execute('run.deadline'),savedDeadline);
assert.ok(scenes[0].calls.some(([name,layout])=>name==='questionLayout'&&layout.centerY===96));
execute("lockChoices('a')");
assert.equal(query('#feedback').className,'feedback-banner pending');
assert.match(query('#feedback').textContent,/Antwort gewählt/);
