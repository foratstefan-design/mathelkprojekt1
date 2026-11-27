import {FlightScene} from './sky.js?v=altitude-1';
import {plane,hero} from './art.js?v=flight-4';
import {API_ORIGIN} from './runtime-config.js?v=pages-1';
import {questionLayout,fitQuestion} from './viewport.js?v=fit-2';
const $=selector=>document.querySelector(selector),main=$('#main');
const MODES=[{id:'mix',label:'Mix',detail:'Drei Höhenstufen',icon:'✦'},{id:'common',label:'Mehr',detail:'Größer, höher oder länger?',icon:'+'},{id:'rare',label:'Weniger',detail:'Kleiner, niedriger oder kürzer?',icon:'◇'},{id:'earlier',label:'Früher',detail:'Was war zuerst da?',icon:'Ⅰ'},{id:'later',label:'Später',detail:'Was kam zuletzt?',icon:'Ⅳ'}];
const modeInfo=id=>id==='daily'?{id:'daily',label:'Tagesflug',detail:'Ein Versuch pro Tag'}:id==='general'?{id:'general',label:'Wissen',detail:'Allgemeines Wissen'}:MODES.find(mode=>mode.id===id)||MODES[0];
const dailyLabel=mode=>!mode||mode==='mix'?'Bunter Mix':modeInfo(mode).label;
const DAILY_PLAN=[1,1,1,2,2,2,2,3,3,3];
const dailyPlanLabel='3 LEICHT · 4 MITTEL · 3 SCHWER';
function progressiveDay(data){if(Array.isArray(data.difficultyPlan))return data.difficultyPlan.length===10&&data.difficultyPlan.every((level,index)=>level===DAILY_PLAN[index]);if(typeof data.progressiveDaily==='boolean')return data.progressiveDaily;return (data.dailyMode||data.mode||'mix')==='mix';}
function dailyPlanText(data){const plan=data.difficultyPlan;if(Array.isArray(plan)&&plan.length===10&&plan.every(level=>[1,2,3].includes(level)))return [1,2,3].map((level,index)=>plan.filter(value=>value===level).length+' '+['LEICHT','MITTEL','SCHWER'][index]).join(' · ');return progressiveDay(data)?dailyPlanLabel:'GESPEICHERTE TAGESRUNDE · UNVERÄNDERTE FRAGEN';}
function difficultyLabel(level){const plain=isDaily()||mixFlight();return (plain?['LEICHT','MITTEL','SCHWER']:['EINSTIEG','VERTIEFUNG','CHALLENGE'])[level-1]||(plain?'LEICHT':'EINSTIEG');}
const store={get(key,fallback){try{return JSON.parse(localStorage.getItem('hoehenflug-'+key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('hoehenflug-'+key,JSON.stringify(value));}catch{/* Play continues without persistent browser storage. */}}};
let device=store.get('device',null)||crypto.randomUUID();store.set('device',device);
let selectedMode=store.get('mode','mix'),dailyFlight=null,run=null,currentQuestion=null,screen='home',busy=false,clockFrame=0,heightFrame=0,displayHeight=0,version=0,pendingChoice=null,localHistory=store.get('history',[]);
if(!MODES.some(mode=>mode.id===selectedMode))selectedMode='mix';
const reduced=matchMedia('(prefers-reduced-motion: reduce)'),scene=new FlightScene($('#sky-canvas'));
const esc=(text='')=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const meters=value=>Math.round(value||0).toLocaleString('de-DE');
const seconds=value=>(Math.max(0,value||0)/1000).toLocaleString('de-DE',{minimumFractionDigits:1,maximumFractionDigits:1})+' s';
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function api(path,body){const response=await fetch(API_ORIGIN+'/api/'+path+(body?'':(path.includes('?')?'&':'?')+'device='+encodeURIComponent(device)),{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify({device,...body}):undefined});const data=await response.json();if(!response.ok)throw Object.assign(new Error(data.error||'Die Verbindung ist gerade unterbrochen.'),{code:data.code,poolExhausted:data.poolExhausted===true});return data;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toast.timeout);toast.timeout=setTimeout(()=>$('#toast').classList.remove('show'),4000);}
function closeMenu(){document.body.classList.remove('menu-open');$('#game-menu').inert=true;$('#menu-toggle').setAttribute('aria-expanded','false');$('#menu-scrim').hidden=true;}
function openMenu(){document.body.classList.add('menu-open');$('#game-menu').inert=false;$('#menu-toggle').setAttribute('aria-expanded','true');$('#menu-scrim').hidden=false;$('#menu-close').focus();}
function view(html,name){cancelAnimationFrame(clockFrame);version++;screen=name;main.innerHTML=html;const flying=['takeoff','question','maneuver','feedback','finishing','saving','crashing','results'].includes(name);document.body.classList.toggle('in-dive',flying);document.body.classList.toggle('in-flight',flying);document.body.dataset.screen=name;$('#flight-hud').hidden=!flying;$('#alt-rail').hidden=!flying;document.querySelectorAll('[data-nav]').forEach(link=>link.classList.toggle('active',link.dataset.nav===(flying||name==='home'?'start':name)));closeMenu();if(flying)hud();window.scrollTo({top:0,behavior:'instant'});}
function focusTitle(){const title=main.querySelector('h1,h2');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}}
function isDaily(state=run){return state?.kind==='daily'||state?.flightKind==='daily'||state?.mode==='daily';}
const mixFlight=(state=run)=>!isDaily(state)&&state?.mode==='mix';
const mixLevel=altitude=>altitude>=6000?3:altitude>=3000?2:1;
const supersededDaily=(state=run)=>isDaily(state)&&state?.dailySuperseded===true;
const terminal=state=>['finished','crashed','exhausted'].includes(state?.status);
const catalogEmpty=state=>state?.status==='exhausted'||state?.poolExhausted===true;
const competitive=state=>isDaily(state)&&!supersededDaily(state)&&(state?.competitionVersion||0)>=3;
function hud(){
  if(!run)return;
  $('#hud-streak').textContent=(run.correctTotal??run.streak)+' RICHTIG';
  $('#hud-mode').textContent=isDaily()?'TAGESFLUG · '+dailyLabel(run.dailyMode).toUpperCase():modeInfo(run.mode).label.toUpperCase();
  $('#hud-score').textContent=run.score;$('#hud-time').textContent=seconds(run.timeLimitMs);
  const condition=$('#hud-condition');
  condition.textContent=catalogEmpty(run)?'FRAGENVORRAT GESEHEN':competitive(run)?Math.min(10,run.index)+' / 10 ERLEDIGT':isDaily()?'HÖHENRESERVE':run.danger>=2?'LETZTE CHANCE':run.danger?'RETTUNGSFENSTER':'STABIL';
  condition.dataset.danger=run.danger||0;
}
function replaceHash(hash){window.history.replaceState(null,'',hash);}
function setAltitude(target,animate=true,durationMs=1400){scene.setCourse?.(mixFlight()?'mix':'');cancelAnimationFrame(heightFrame);const from=displayHeight,start=performance.now(),duration=animate&&!reduced.matches?durationMs:0;scene.setAltitude(target,{duration});const update=value=>{displayHeight=value;$('#hud-height').textContent=meters(value);$('#rail-height').textContent=meters(value);const band=Math.floor(value/2000);$('#flight-level').textContent=mixFlight()?['LEICHTER KURS','MITTLERER KURS','SCHWERER KURS'][mixLevel(value)-1]:value<100?'STARTBAHN':value<2000?'WOLKENKURS':value<6000?'ÜBER DEN WOLKEN':value<12000?'DÜNNE LUFT':'GRENZENLOSER HIMMEL';$('#alt-marker').style.bottom=Math.min(100,(value-band*2000)/2000*100)+'%';};if(!duration){update(target);return;}function frame(now){const p=Math.min(1,(now-start)/duration),ease=p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;update(from+(target-from)*ease);if(p<1)heightFrame=requestAnimationFrame(frame);}heightFrame=requestAnimationFrame(frame);}
function errorView(error,retry){view(`<section class="error-panel"><div class="error-plane">${plane()}</div><h1>Kurze Funkstörung.</h1><p>${esc(error.message)}</p><button class="button" id="retry">Erneut versuchen</button></section>`,'error');$('#retry').onclick=retry;}
function home(){
  scene.reset();scene.setMode('home');const active=store.get('active',null);
  view(`<section class="landing flight-home updated-home"><div class="home-heading"><p class="eyebrow edition">WISSEN, DAS HÄNGEN BLEIBT.</p><h1>HÖHEN<br>FLUG<span class="title-period">.</span></h1><p class="tagline">Überraschende Fakten. Zehn Fragen am Tag. Wie hoch bringt dich dein Wissen?</p></div><div class="home-bottom"><button class="daily-launch" id="daily-start" disabled><span class="daily-title">TAGESFLUG</span><span class="daily-description">10 Fragen · Bunter Mix · Ein Versuch</span><span class="daily-plan" id="daily-plan">${dailyPlanLabel}</span><strong class="daily-state" id="daily-state">Tagesflug wird geladen …</strong><span class="daily-mode-note" id="daily-mode-note">Schule, Kultur und Alltagswissen · leicht anfangen, anspruchsvoll enden.</span></button><p class="mode-section-label">FREIE FLÜGE · DEIN PERSÖNLICHER REKORD</p><div class="mode-picker" role="group" aria-label="Freien Flugmodus wählen">${MODES.map(mode=>`<button class="mode-option" data-mode="${mode.id}" aria-label="${esc(mode.label+': '+mode.detail)}" aria-pressed="${selectedMode===mode.id}"><span class="mode-name"><span aria-hidden="true">${mode.icon}</span> ${mode.label}</span><small class="mode-detail">${mode.detail}</small></button>`).join('')}</div><p class="catalog-note" id="catalog-note" aria-live="polite">Fragen mit Quellen · bereits gezeigte Fakten bleiben ausgelassen.</p><button class="button primary" id="start">FREIEN FLUG STARTEN</button><div class="home-meta"><span>NEUE FRAGEN · START BEI 0 m</span><a href="#bestenliste">TAGESBESTENLISTE</a><a href="#anleitung">FLUGSCHULE</a></div>${active?.id?'<button class="resume-link text-button" id="resume">Gespeicherten Flug aufrufen</button>':''}</div></section>`,'home');
  document.querySelectorAll('[data-mode]').forEach(button=>button.onclick=()=>{
    selectedMode=button.dataset.mode;store.set('mode',selectedMode);
    document.querySelectorAll('[data-mode]').forEach(item=>item.setAttribute('aria-pressed',String(item===button)));
  });
  $('#start').onclick=()=>startFlight();if($('#resume'))$('#resume').onclick=resumeFlight;
  $('#daily-start').onclick=startDaily;loadDaily(version);loadCatalog(version);
}
async function loadCatalog(expectedVersion){
  try{
    const data=await api('catalog');
    if(version!==expectedVersion)return;
    const target=$('#catalog-note');if(!target)return;
    if(Number.isFinite(data.families)&&Number.isFinite(data.questions)){
      target.innerHTML=`<strong>${meters(data.families)} verschiedene Fragen</strong><span>${meters(data.questions)} Aufgabenvarianten im Bestand · Quelle: ${esc(data.source||'Wikidata + kuratierte Wissensfragen')}.</span>`;
      if(Number.isFinite(data.remainingFreeFamilies))target.innerHTML+=`<span>Für dich noch ${meters(data.remainingFreeFamilies)} ungesehene Fragenfamilien im freien Vorrat.</span>`;
      target.classList.add('catalog-stats');
    }
  }catch{/* The source note remains useful while the counter is unreachable. */}
}
async function loadDaily(expectedVersion){
  try{
    const data=await api('daily');dailyFlight=data;
    if(screen!=='home'||version!==expectedVersion)return;
    const button=$('#daily-start'),attempt=data.attempt,ended=terminal(attempt),unavailable=data.poolExhausted===true&&!attempt;
    button.disabled=unavailable;button.classList.toggle('active',Boolean(attempt&&!ended));button.classList.toggle('finished',ended);
    $('#daily-state').textContent=unavailable?'TAGESVORRAT AUSGESCHÖPFT':ended?'HEUTIGES ERGEBNIS ANSEHEN':attempt?'TAGESFLUG FORTSETZEN':data.refreshed?'HEUTIGEN MIX NEU STARTEN':'HEUTIGEN VERSUCH STARTEN';
    const dailyMode=data.dailyMode||data.mode||'mix',progressive=progressiveDay(data);
    $('#daily-plan').textContent=dailyPlanText(data);
    $('#daily-mode-note').textContent=unavailable?'Für den Tagesmix sind noch keine zehn neuen Fragen verfügbar. Dein Tagesversuch bleibt unberührt.':dailyMode==='mix'?'HEUTE: BUNTER MIX · Zehn gleiche Fragen aus verschiedenen Bereichen für alle.'+(progressive?' Zuerst 3 leichte, dann 4 mittlere und 3 schwere Fragen.':''):'HEUTE BEREITS FESTGELEGT: '+dailyLabel(dailyMode).toUpperCase()+' · Diese Runde bleibt für alle gleich. Neue Tagesrunden werden gemischt.';
    if(data.refreshed&&!attempt&&!unavailable)$('#daily-mode-note').textContent='HEUTE NEU GESTARTET · Die bisherige Runde wurde ersetzt und bleibt im Flugbuch. Du hast einen neuen Tagesversuch'+(progressive?' mit 3 leichten, 4 mittleren und 3 schweren Fragen.':' im bunten Mix.');
    if(attempt&&(attempt.competitionVersion||0)<3)$('#daily-mode-note').textContent='Dein heutiger Versuch läuft noch nach den bisherigen Regeln. Der neue Wettbewerb wartet beim nächsten Tagesflug.';
  }catch{
    if(screen==='home'&&version===expectedVersion){$('#daily-start').disabled=false;$('#daily-state').textContent='TAGESFLUG ÖFFNEN';}
  }
}
function startDaily(){return startFlight('daily');}
function showDailyRefresh(){
  cancelAnimationFrame(clockFrame);currentQuestion=null;pendingChoice=null;
  if(store.get('active',null)?.id===run?.id)store.set('active',null);
  scene.reset();scene.setMode('home');scene.setDanger?.(0);
  view(`<section class="page"><header class="page-header"><p class="eyebrow">NEUER TAGESMIX</p><h1>Tagesflug neu gemischt.</h1><p>Der heutige Tagesflug wurde durch einen neuen Mix mit 3 leichten, 4 mittelschweren und 3 schweren Fragen ersetzt. Dein bisheriger Flug bleibt im Flugbuch erhalten. Der neue Mix hat einen eigenen Tagesversuch.</p></header><div class="actions"><button class="button" id="start-refreshed-daily">NEUEN TAGESMIX STARTEN</button><button class="button secondary" id="refresh-home">ZUR FLUGSTATION</button></div></section>`,'daily-refresh');
  $('#start-refreshed-daily').onclick=()=>startFlight('daily');
  $('#refresh-home').onclick=()=>{replaceHash('#start');home();};focusTitle();
}
async function takeoff(){
  view(`<section class="flight-maneuver takeoff-stage"><div class="maneuver-copy"><p class="eyebrow">TRIEBWERKE BEREIT</p><h1>Freigabe zum Abheben.</h1><strong class="maneuver-count" id="countdown" aria-live="polite">3</strong><p>Die erste Frage startet nach dem Countdown.</p></div></section>`,'takeoff');
  const expected=version;scene.reset();setAltitude(0,false);
  await scene.setFlightView('showcase');if(version!==expected||screen!=='takeoff')return;
  setAltitude(run.altitude,true,1400);
  const count=async()=>{if(reduced.matches)return;for(const number of [3,2,1]){if(version!==expected||screen!=='takeoff')return;$('#countdown').textContent=number;await pause(700);}};
  await Promise.all([scene.takeoff(),count()]);if(version!==expected||screen!=='takeoff')return;
  await scene.setFlightView('question');if(version!==expected||screen!=='takeoff')return;
  run=await api('next',{runId:run.id});if(version===expected&&screen==='takeoff')showFlightState();
}
async function startFlight(mode=selectedMode){
  if(busy)return;busy=true;
  try{
    run=await api('start',{mode});if(supersededDaily()){showDailyRefresh();return;}if(!terminal(run))store.set('active',{id:run.id,mode:run.mode});replaceHash('#start');
    scene.setMode('flying');setAltitude(run.altitude,false);scene.setDanger?.(run.danger||0);
    if(terminal(run)){results(run.latestResult);return;}
    if(run.status==='flying'){showFlightState();return;}
    if(run.index>0&&run.latestResult){showLearning(run.latestResult);return;}
    await takeoff();
  }catch(error){if(error.poolExhausted||error.code==='QUESTION_POOL_EXHAUSTED')catalogExhausted(null,null,mode==='daily');else errorView(error,()=>startFlight(mode));}
  finally{busy=false;}
}
async function resumeFlight(){
  if(busy)return;const active=store.get('active',null);if(!active?.id){home();return;}busy=true;
  try{
    run=await api('run?id='+encodeURIComponent(active.id));
    if(supersededDaily()){showDailyRefresh();return;}
    if(!isDaily()&&MODES.some(mode=>mode.id===run.mode))selectedMode=run.mode;
    scene.setMode('flying');setAltitude(run.altitude,false);scene.setSpeed(run.correctTotal??run.streak);scene.setDanger?.(run.danger||0);replaceHash('#start');
    if(terminal(run)){results(run.latestResult);return;}
    if(run.status==='ready'&&run.latestResult){showLearning(run.latestResult);return;}
    if(run.status==='ready')run=await api('next',{runId:run.id});
    showFlightState();
  }catch(error){if(error.poolExhausted||error.code==='QUESTION_POOL_EXHAUSTED')catalogExhausted(null,null,isDaily());else errorView(error,resumeFlight);}
  finally{busy=false;}
}
function showFlightState(){
  if(supersededDaily()){showDailyRefresh();return;}
  if(terminal(run)){results(run.latestResult);return;}
  if(run.status==='ready'&&run.latestResult){showLearning(run.latestResult);return;}
  if(!run.question)throw new Error('Die nächste Frage ist noch nicht freigegeben.');
  currentQuestion=run.question;question();
}
function flightCounter(){
  return 'FRAGE '+(run.index+1)+(run.questionCount?' / '+run.questionCount:'')+' · '+(isDaily()?dailyLabel(run.dailyMode):modeInfo(run.mode).label).toUpperCase();
}
// Only measure when content/viewport changes, never during the animation loop.
let fitFrame=0;
function fitCockpit(){
  if(screen!=='question')return;
  const game=main.querySelector('.active-question'),content=game?.querySelector('.question-content');
  if(!Number.isFinite(content?.offsetHeight)||!game.style.setProperty)return;
  const width=window.visualViewport?.width||window.innerWidth,height=window.visualViewport?.height||window.innerHeight;
  if(!width||!height)return;
  game.style.setProperty('--play-height',height+'px');
  fitQuestion(()=>content.offsetHeight-height,density=>{
    const layout=questionLayout(width,height,density);
    game.dataset.density=String(density);game.style.setProperty('--cockpit-top',layout.top+'px');
    scene.setQuestionLayout({centerY:layout.centerY,size:layout.size});
  },height<650?1:0);
}
function scheduleCockpit(){cancelAnimationFrame(fitFrame);fitFrame=requestAnimationFrame(fitCockpit);}
window.addEventListener('resize',scheduleCockpit);
window.visualViewport?.addEventListener('resize',scheduleCockpit);
document.fonts?.ready.then(scheduleCockpit);
function question(){const q=currentQuestion;pendingChoice=null;view(`<section class="game flight-game active-question ${run.recovering?'recovering':''} ${q.prompt.length>130?'long-question':''}"><div class="question-content"><div class="game-top"><button class="text-button" id="surface">FLUGSTATION</button><span class="question-counter">${flightCounter()}</span></div><div class="question-panel"><span class="category-tag">${modeInfo(q.type).label.toUpperCase()} · ${esc(q.category.toUpperCase())}</span><span class="difficulty-badge" data-level="${q.difficulty||run.difficulty||1}">${difficultyLabel(q.difficulty||run.difficulty||1)}</span><h1 class="question-title">${esc(q.prompt)}</h1><p class="question-note">${esc(q.basisLabel)}</p></div>${run.recovering?`<div class="recovery-banner" data-level="${run.danger||1}" role="status">${run.danger>=2?'LETZTE CHANCE: Die nächste Antwort muss stimmen.':'STABILISIEREN: Richtig antworten und das Flugzeug abfangen.'}</div>`:''}<div class="choice-grid" role="group" aria-label="Eine Antwort wählen">${q.options.map((option,index)=>`<button class="choice" data-choice="${esc(option.id)}"><span class="choice-number" aria-hidden="true">${index+1}</span><strong class="choice-label">${esc(option.label)}</strong></button>`).join('')}</div><div id="question-timer"><div class="timer-info"><span>ANTWORTE, BEVOR DER AUFTRIEB FEHLT.</span><span id="timer-count" role="timer" aria-label="Verbleibende Antwortzeit">${seconds(run.timeLimitMs)}</span></div><div class="timer-track" aria-hidden="true"><div id="timer-bar" class="timer-bar"></div></div><span class="sr-only" id="timer-live" aria-live="polite"></span></div><p class="game-hint">Eine Antwort wählen · Tastatur: 1, 2, 3 oder 4</p><div class="feedback-banner" id="feedback" role="status" aria-live="polite"></div></div></section>`,'question');$('#surface').onclick=()=>leaveFlight();document.querySelectorAll('[data-choice]').forEach(button=>button.onclick=()=>submitChoice(button.dataset.choice));scene.setCourse?.(mixFlight()?'mix':'');scene.setMode('flying');scene.setFlightView('question');scene.setDanger?.(run.danger||0);scene.setSpeed(run.correctTotal??run.streak);hud();fitCockpit();scheduleCockpit();startClock();focusTitle();}
function startClock(){
  let announced=false,lastPaint=-Infinity;
  function tick(now=performance.now()){
    if(screen!=='question')return;
    const remaining=Math.max(0,run.deadline-Date.now());
    // Ten DOM updates per second are enough for a tenth-second countdown.
    if(now-lastPaint>=100||remaining===0){
      lastPaint=now;const label=seconds(remaining);
      $('#timer-count').textContent=label;$('#hud-time').textContent=label;
      $('#timer-bar').style.transform=`scaleX(${Math.min(1,remaining/run.timeLimitMs)})`;
      $('#timer-bar').classList.toggle('urgent',remaining<=Math.min(5000,run.timeLimitMs*.4));
    }
    if(!announced&&remaining<=3000){$('#timer-live').textContent='Noch höchstens drei Sekunden.';announced=true;}
    if(remaining<=0&&!busy){submitChoice(null,true);return;}
    clockFrame=requestAnimationFrame(tick);
  }
  tick();
}
function lockChoices(choiceId){
  document.querySelectorAll('[data-choice]').forEach(button=>{button.disabled=true;button.classList.toggle('selected',button.dataset.choice===choiceId);});
  $('#timer-count').textContent='GESENDET';$('#feedback').className='feedback-banner pending';
  $('#feedback').textContent='Antwort gewählt · wird übertragen …';
}
async function submitChoice(choiceId,expired=false,retry){
  if(busy||(!retry&&screen!=='question'))return;
  if($('#leave-dialog').open)$('#leave-dialog').close('stay');
  const submission=retry||{runId:run.id,questionId:currentQuestion.id,questionIndex:run.index,choiceId,expired};
  busy=true;cancelAnimationFrame(clockFrame);pendingChoice=submission;
  if(screen==='question')lockChoices(submission.choiceId);
  try{
    const response=await api('answer',submission);run={...run,...response};pendingChoice=null;
    if(supersededDaily()){showDailyRefresh();return;}
    const result=response.result||run.latestResult;
    if(catalogEmpty(run)&&!result){catalogExhausted();return;}
    if(run.status==='crashed'){await endFlight(result);return;}
    await answerManeuver(result);
  }catch(error){
    if(screen==='question'){
      $('#feedback').className='feedback-banner danger';
      $('#feedback').innerHTML=`<strong>Funkstörung</strong><span>${esc(error.message)}</span><button class="button small" id="retry-answer">Gleiche Antwort erneut senden</button>`;
      $('#retry-answer').onclick=()=>submitChoice(null,false,submission);
    }else if(error.poolExhausted||error.code==='QUESTION_POOL_EXHAUSTED')catalogExhausted(null,null,isDaily());else errorView(error,resumeFlight);
  }finally{busy=false;}
}
/** Show the aircraft unobstructed before the untimed learning card appears. */
async function answerManeuver(result){
  const good=result.correct,rescue=good&&result.rescued;
  const kind=good?(rescue?'recover':'climb'):'stall';
  const title=good?(rescue?'Wieder abgefangen!':'Du gewinnst Höhe!'):(run.danger>=2?'Halte die Maschine in der Luft!':'Auftrieb verloren.');
  const detail=good?(rescue?'Das Flugzeug richtet sich auf und steigt weiter.':'Richtige Antwort. Dein Flugzeug steigt sichtbar nach oben.'):run.recovering?'Die nächste richtige Antwort stabilisiert dein Flugzeug.':'Der Flug geht weiter. Bei der nächsten Frage holst du wieder Höhe.';
  const gain=good?'+'+meters(result.altitudeGain)+' m':'−'+meters(result.altitudeLoss||0)+' m';
  view(`<section class="flight-maneuver maneuver-${kind}" role="status" aria-live="polite"><div class="maneuver-copy"><p class="eyebrow">${rescue?'STABILISIERT':good?'RICHTIG':result.timedOut?'ZEIT ABGELAUFEN':'SINKFLUG'}</p><h1>${title}</h1><strong class="maneuver-gain">${gain}</strong><p>${detail}</p></div></section>`,'maneuver');
  const expected=version;scene.setMode('flying');scene.setSpeed(run.correctTotal??run.streak);if(!rescue)scene.setDanger(run.danger||0);$('#hud-time').textContent=good?'STEIGFLUG':'RETTEN';
  await scene.setFlightView('showcase');if(version!==expected||screen!=='maneuver')return;
  setAltitude(run.altitude,true,good?1400:1100);
  if(good){playChime();await (rescue?scene.recover():scene.ascend());}
  else await scene.stall(Math.max(1,run.danger||0));
  if(version!==expected||screen!=='maneuver')return;
  await scene.setFlightView('question');if(version===expected&&screen==='maneuver')showLearning(result);
}
function sourceList(result){
  const sources=[result.source,...(result.relatedSources||[])],seen=new Set();
  return sources.filter(source=>{if(!source?.url||seen.has(source.url))return false;seen.add(source.url);return true;}).map(sourceLink).filter(Boolean).join(' · ');
}
function showLearning(result,animating=false){
  scene.setFlightView('question');
  const good=result.correct,finished=run.status==='finished',exhausted=catalogEmpty(run),label=good?(result.rescued?'ABGEFANGEN':'RICHTIG'):(result.timedOut?'ZEIT ABGELAUFEN':'DIESMAL DANEBEN');
  const gain=good?'+'+meters(result.altitudeGain)+' m':'−'+meters(result.altitudeLoss||0)+' m';
  view(`<section class="game flight-game learning-flight"><div class="game-top"><button class="text-button" id="surface">FLUGSTATION</button><span class="question-progress">${Math.min(run.index,run.questionCount||run.index)}${run.questionCount?' / '+run.questionCount:''} ERLEDIGT</span></div><div class="question-content"><article class="learning-card ${good?'correct':'warning'}"><p class="learning-kicker">${label} · ${gain}</p><p class="learning-question">${esc(result.prompt)}</p><h1>${esc(result.correctLabel)}</h1><p class="learning-explanation">${esc(result.explanation)}</p>${sourceList(result)?`<p class="fact-source">Weiterlesen: ${sourceList(result)}</p>`:''}<details class="learning-values"><summary>Alle Antworten im Vergleich</summary><ul>${(result.options||[]).map(option=>`<li><span>${esc(option.label)}</span><strong>${esc(option.displayValue)}</strong></li>`).join('')}</ul></details><p class="pilot-hint">${exhausted?(mixFlight()?'Du hast alle aktuell verfügbaren Fragen dieser Höhenstufe gesehen. Deine erreichte Höhe bleibt gespeichert.':'Du hast alle aktuell verfügbaren Fragen dieses Kurses gesehen. Deine erreichte Höhe bleibt gespeichert.'):finished?'Alle zehn Fragen sind beantwortet. Deine Endhöhe steht fest.':run.recovering?'Deine nächste richtige Antwort fängt das Flugzeug ab.':'Lies in Ruhe weiter. Der nächste Timer startet erst mit der nächsten Frage.'}</p><button class="button next-question-button" id="next-question" ${animating?'disabled':''}>${exhausted?'FRAGENBESTAND ANSEHEN':finished?'TAGESERGEBNIS ANSEHEN':'WEITERFLIEGEN'}</button></article></div></section>`,'feedback');
  $('#surface').onclick=()=>leaveFlight();$('#next-question').onclick=advanceFlight;
  $('#hud-time').textContent='PAUSE';focusTitle();
}
async function advanceFlight(){
  if(busy)return;busy=true;
  const nextButton=$('#next-question');if(nextButton){nextButton.disabled=true;nextButton.textContent='NÄCHSTE FRAGE WIRD GELADEN …';}
  try{
    if(supersededDaily()){showDailyRefresh();return;}
    if(catalogEmpty(run)){catalogExhausted();return;}
    if(run.status==='finished'){await finishDaily();return;}
    run=await api('next',{runId:run.id});showFlightState();
  }catch(error){
    if(error.poolExhausted||error.code==='QUESTION_POOL_EXHAUSTED'){catalogExhausted(null,null,isDaily());return;}
    if(screen==='feedback'){toast(error.message);$('#next-question').disabled=false;$('#next-question').textContent='Erneut weiterfliegen';}
    else errorView(error,resumeFlight);
  }finally{busy=false;}
}
async function finishDaily(){
  view(`<section class="flight-maneuver maneuver-finish"><div class="maneuver-copy"><p class="eyebrow">10 / 10 FRAGEN</p><h1>Tagesflug geschafft.</h1><strong class="maneuver-gain">${meters(run.altitude)} m</strong><p>Dein Wissen hat dich so weit getragen.</p></div></section>`,'finishing');
  const expected=version;scene.setMode('flying');scene.setDanger(0);setAltitude(run.altitude,false);
  await scene.setFlightView('showcase');if(version!==expected||screen!=='finishing')return;
  await scene.recover();if(version===expected&&screen==='finishing')results(run.latestResult);
}
async function endFlight(result){
  if(catalogEmpty(run)){catalogExhausted(result);return;}
  cancelAnimationFrame(clockFrame);
  const reason=isDaily()?'Deine Höhenreserve ist aufgebraucht.':(run.danger||0)>=3?'Nach drei Fehlern hintereinander fehlt der Auftrieb.':run.crashReason==='timeout'?'Die Zeit ist abgelaufen.':'Der Flug ist beendet.';
  view(`<section class="flight-maneuver maneuver-crash" role="status" aria-live="polite"><div class="maneuver-copy"><p class="eyebrow">KEIN AUFTRIEB MEHR</p><h1>Dein Flugzeug stürzt ab.</h1><p>${esc(reason)}</p></div></section>`,'crashing');
  const expected=version;$('#hud-time').textContent='ABSTURZ';
  await scene.setFlightView('showcase');if(version!==expected||screen!=='crashing')return;
  setAltitude(run.altitude,true,2200);playCrash();await scene.crash();
  if(version===expected&&screen==='crashing')results(result);
}
function sourceLink(source){try{const url=new URL(source?.url);if(!['https:','http:'].includes(url.protocol)||url.username||url.password)return '';}catch{return '';}return `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.title||new URL(source.url).hostname)}</a>`;}
function remember(){if(!run||!terminal(run))return;const entry={id:run.id,mode:run.mode,altitude:run.altitude,peakAltitude:run.peakAltitude??run.altitude,score:run.score,streak:run.streak,correctTotal:run.correctTotal??run.streak,finishedAt:run.finishedAt||Date.now()};if(!localHistory.some(item=>item.id===run.id)){localHistory=[entry,...localHistory].slice(0,100);store.set('history',localHistory);}if(store.get('active',null)?.id===run.id)store.set('active',null);}
function results(result=run.latestResult){
  if(supersededDaily()){showDailyRefresh();return;}
  if(catalogEmpty(run)){catalogExhausted(result);return;}
  const completed=run.status==='finished',daily=isDaily(),count=run.correctTotal??run.streak,peak=run.peakAltitude??run.altitude;
  scene.setMode(completed?'flying':'crashed');scene.setDanger(0);setAltitude(run.altitude,false);remember();
  const rank=completed?'Dein Tageshöhenflug.':count>=30?'Legende der Lüfte':count>=20?'Himmelsstürmer:in':count>=10?'Wolken-Profi':count>=5?'Pilot:in mit Weitblick':'Bereit für den nächsten Start';
  view(`<section class="results flight-results ${daily?'daily-result':'free-result'} ${completed?'daily-complete':''}"><div class="result-plane">${plane('result-sprite')}</div><p class="eyebrow">${completed?'10 / 10 · TAGESFLUG GESCHAFFT':daily?'BISHERIGER TAGESVERSUCH BEENDET':'PERSÖNLICHER FLUGREKORD'} · ${(daily?dailyLabel(run.dailyMode):modeInfo(run.mode).label).toUpperCase()}</p><h1>${rank}</h1><div class="result-depth">${meters(completed?run.altitude:peak)} <small>Meter</small></div><p class="peak-caption">${completed?'Endhöhe · Tageswertung':'Höchster Punkt'}</p><div class="run-metrics"><div><strong>${count}${completed?' / 10':''}</strong><span>richtige Antworten</span></div><div><strong>${run.score}</strong><span>Punkte</span></div><div><strong>${completed?meters(peak)+' m':seconds(run.timeLimitMs)}</strong><span>${completed?'höchster Punkt':'letztes Zeitfenster'}</span></div></div>${completed?`<div class="result-ranking" id="result-ranking"><p>Dein Platz wird geladen …</p></div>`:`<p class="crash-explanation">${daily?'Dieser bereits gestartete Versuch gehörte zu den bisherigen Regeln. Beim nächsten Tagesflug warten zehn feste Fragen und die Bestenliste.':'Die nächste richtige Antwort kann deinen Sinkflug retten. Ein neuer freier Flug ist jederzeit möglich.'}</p>`}${result?`<details class="last-answer"><summary>Die letzte Frage noch einmal ansehen</summary><p>${esc(result.prompt)}</p><strong class="correct-answer">Richtig: ${esc(result.correctLabel)}</strong><p>${esc(result.explanation)}</p><p class="fact-source">${sourceList(result)}</p></details>`:''}<div class="actions"><button class="button coral" id="retry-flight">${daily?'FREIEN FLUG STARTEN':'NOCH EIN FLUG'}</button><button class="button secondary" id="share">ERGEBNIS TEILEN</button></div>${completed?'<a class="button secondary" id="result-board" href="#bestenliste">TAGESBESTENLISTE</a>':''}<button class="text-button" id="choose-mode">ZUR FLUGSTATION</button></section>`,'results');
  $('#retry-flight').onclick=()=>{selectedMode=daily?'mix':run.mode;startFlight(selectedMode);};
  $('#share').onclick=share;$('#choose-mode').onclick=()=>{replaceHash('#start');home();};
  if(completed){$('#result-board').onclick=()=>{leaderboardDate=run.dailyDate;};loadResultRanking(version,run.id);}focusTitle();
}
function catalogExhausted(result=run?.latestResult,state=run,daily=isDaily(state)){
  cancelAnimationFrame(clockFrame);
  const peak=state?.peakAltitude??state?.altitude??0,count=state?.correctTotal??state?.streak??0;
  scene.setMode(state?'flying':'home');scene.setDanger(0);setAltitude(state?.altitude||0,false);
  if(state&&state===run&&terminal(state))remember();
  view(`<section class="results flight-results catalog-exhausted"><div class="result-plane">${plane('result-sprite')}</div><p class="eyebrow">${daily?'TAGESFRAGENBESTAND':'FRAGENBESTAND'} ENTDECKT</p><h1>${daily?'Neue Tagesfragen fehlen.':'Alles entdeckt.'}</h1><p class="catalog-exhausted-message">${daily?'Für den Tagesmix sind zurzeit keine zehn neuen Fragen verfügbar.':mixFlight(state)?'Du hast alle aktuell verfügbaren Fragen deiner Höhenstufe gesehen.':'Du hast alle aktuell verfügbaren Fragen dieses Kurses gesehen.'}</p><p>${daily?'Für einen neuen Tagesflug werden zehn bisher unbenutzte Tagesfragen benötigt. Ein unvollständiger Tagesflug wird nicht in die Bestenliste eingetragen.':'Bereits gezeigte Fakten und umgedrehte Varianten werden weiterhin ausgelassen. Auf der Flugstation kannst du einen anderen Kurs wählen.'}</p>${state?`<div class="result-depth">${meters(peak)} <small>Meter</small></div><p class="peak-caption">Höchster Punkt dieses Flugs</p><div class="run-metrics"><div><strong>${count}</strong><span>richtige Antworten</span></div><div><strong>${state.score||0}</strong><span>Punkte</span></div></div>`:''}<p class="catalog-note" id="catalog-note">Der Bestand wird aus nachvollziehbaren Quellen aufgebaut.</p>${result?`<details class="last-answer"><summary>Die letzte Frage noch einmal ansehen</summary><p>${esc(result.prompt)}</p><strong class="correct-answer">Richtig: ${esc(result.correctLabel)}</strong><p>${esc(result.explanation)}</p><p class="fact-source">${sourceList(result)}</p></details>`:''}<div class="actions"><button class="button" id="catalog-home">KURS WÄHLEN</button><a class="button secondary" href="#anleitung">ÜBER DIE FRAGEN</a></div></section>`,state?'results':'catalog');
  $('#catalog-home').onclick=()=>{replaceHash('#start');home();};
  if(state)$('#hud-time').textContent='PAUSE';
  loadCatalog(version);focusTitle();
}
function pilotForm(name){
  return `<form class="pilot-form" id="pilot-form"><label for="pilot-name">Dein Rufname auf der Bestenliste</label><input id="pilot-name" name="name" value="${esc(name)}" minlength="2" maxlength="20" autocomplete="off" spellcheck="false" required aria-describedby="pilot-hint"><button class="button small" type="submit">RUFNAMEN SPEICHERN</button><p class="pilot-hint" id="pilot-hint">Optionaler Spitzname, keine echten Namen nötig. Sichtbar für Besucher dieser Website.</p><p id="pilot-status" role="status"></p></form>`;
}
function wireProfile(afterSave){
  const form=$('#pilot-form');if(!form)return;
  form.onsubmit=async event=>{
    event.preventDefault();const button=form.querySelector('button');button.disabled=true;
    try{
      const profile=await api('profile',{name:$('#pilot-name').value});
      if(!form.isConnected)return;
      $('#pilot-status').textContent='Rufname gespeichert.';
      if(run)run.pilotName=profile.name;
      if(afterSave)await afterSave(profile);
    }catch(error){if(form.isConnected&&$('#pilot-status'))$('#pilot-status').textContent=error.message;}
    finally{if(button.isConnected)button.disabled=false;}
  };
}
async function loadResultRanking(expectedVersion,runId){
  try{
    const data=await api('leaderboard?date='+encodeURIComponent(run.dailyDate));
    if(screen!=='results'||version!==expectedVersion||run.id!==runId)return;
    $('#result-ranking').innerHTML=`<p class="own-rank">${data.own?'PLATZ '+data.own.rank+' VON '+data.totalFinished:'Deine Tageswertung wird vorbereitet.'}</p>${pilotForm(run.pilotName||data.own?.name||'Pilot')}`;
    wireProfile();
  }catch(error){if(screen==='results'&&version===expectedVersion)$('#result-ranking').innerHTML=`<p>${esc(error.message)}</p><a href="#bestenliste">Bestenliste öffnen</a>`;}
}
let leaderboardDate='';
async function leaderboard(date=leaderboardDate){
  scene.setMode('home');
  view(`<section class="page leaderboard-page"><header class="page-header"><p class="eyebrow">DAS TAGESRANKING</p><h1>Zehn Fragen. Ein gemeinsamer Kurs.</h1><p>Alle starten mit denselben Fragen. Die Endhöhe entscheidet.</p></header><div id="leaderboard-content"><p class="loading">Bestenliste wird geladen …</p></div></section>`,'bestenliste');
  const expectedVersion=version;
  try{
    const [data,profile]=await Promise.all([api('leaderboard'+(date?'?date='+encodeURIComponent(date):'')),api('profile')]);
    if(screen!=='bestenliste'||version!==expectedVersion)return;
    leaderboardDate=data.date;
    const row=entry=>`<li class="leaderboard-row ${entry.isYou?'is-you':''}"><span class="leaderboard-rank">${entry.rank}</span><span class="leaderboard-pilot">${esc(entry.name)}${entry.isYou?' · DU':''}<small class="leaderboard-meta">${entry.score} Punkte · ${seconds(entry.answerElapsedMs)} Antwortzeit</small></span><strong class="leaderboard-height">${meters(entry.altitude)} m</strong></li>`;
    $('#leaderboard-content').innerHTML=`<div class="leaderboard-date-nav"><label for="board-date">Flugtag</label><input type="date" id="board-date" value="${esc(data.date)}" max="${new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date())}"><button class="button small" id="board-today">HEUTE</button></div><p class="daily-mode-note">KURS: ${dailyLabel(data.dailyMode||data.mode).toUpperCase()} · 10 FRAGEN · ${data.totalFinished} ABGESCHLOSSENE FLÜGE</p>${data.entries.length?`<ol class="leaderboard-list" aria-label="Tagesbestenliste">${data.entries.map(row).join('')}</ol>`:'<p class="leaderboard-empty">Hier ist noch Platz für den ersten abgeschlossenen Tagesflug.</p>'}${data.own&&!data.entries.some(entry=>entry.isYou)?`<p class="own-rank">DEIN PLATZ</p><ol class="leaderboard-list">${row(data.own)}</ol>`:''}<p class="pilot-hint">Gewertet wird die Endhöhe nach allen zehn Fragen. Bei gleicher Höhe zählen Punkte, danach die kürzere gesamte Antwortzeit. Die Liste zeigt die ersten 20 Plätze und deinen eigenen Platz.</p>${pilotForm(profile.name)}<div class="center"><a class="button" href="#start">ZUR STARTBAHN</a></div>`;
    $('#board-date').onchange=event=>{if(event.target.value)leaderboard(event.target.value);};
    $('#board-today').onclick=()=>{leaderboardDate='';leaderboard('');};
    wireProfile(()=>leaderboard(data.date));focusTitle();
  }catch(error){
    if(screen==='bestenliste'&&version===expectedVersion){$('#leaderboard-content').innerHTML=`<p class="leaderboard-empty">${esc(error.message)}</p><button class="button" id="board-retry">Erneut versuchen</button>`;$('#board-retry').onclick=()=>leaderboard(date);}
  }
}
async function share(){
  const daily=competitive(run),height=daily?run.altitude:run.peakAltitude??run.altitude;
  const text=`HÖHENFLUG · ${daily?'Tagesflug '+run.dailyDate+' · '+dailyLabel(run.dailyMode):modeInfo(run.mode).label}\n✈️ ${meters(height)} m${daily?' Endhöhe':''}\n${run.correctTotal??run.streak}${daily?' / 10':''} richtige Antworten · ${run.score} Punkte\n${location.origin}${location.pathname}`;
  try{if(navigator.share)await navigator.share({title:'Höhenflug',text});else{await navigator.clipboard.writeText(text);toast('Dein Flugergebnis wurde kopiert.');}}
  catch(error){if(error.name!=='AbortError')toast('Teilen ist in diesem Browser gerade nicht verfügbar.');}
}
function leaveFlight(target='start'){if(screen==='feedback'&&!busy){screen='home';replaceHash('#'+target);route();return;}if(busy||screen==='crashing'||screen==='finishing'){toast('Dein Flugmanöver wird gerade abgeschlossen. Einen Moment bitte.');return;}const dialog=$('#leave-dialog');dialog.returnValue='stay';dialog.showModal();dialog.onclose=()=>{if(dialog.returnValue==='leave'){cancelAnimationFrame(clockFrame);screen='home';replaceHash('#'+target);route();}};}
function instructions(){
  scene.setMode('home');
  view(`<section class="page"><header class="page-header"><p class="eyebrow">DIE FLUGSCHULE</p><h1>Wissen mit Auftrieb.</h1><p>Von Schulgrundlagen bis zur Oberstufe: Naturwissenschaften, Mathematik, Sprachen, Geschichte und Politik. Dazu kommen Literatur, Musik, Religionen und Weltanschauungen, Kunst, Sport sowie Alltagswissenschaft. Jede Antwort liefert eine kurze Erklärung mit Quellen.</p></header><div class="info-grid"><article class="info-card"><h2>Der Tagesflug.</h2><p>Zehn Fragen, ein Versuch pro Gerät und Berliner Kalendertag. Alle spielen dieselbe Auswahl in derselben Reihenfolge. Jeder neue Tagesflug ist ein bunter Mix aus Allgemeinwissen, Mengenvergleichen und Zeitfragen zu verschiedenen Bereichen und Schulfächern. Die Reihenfolge ist fest: zuerst 3 leichte, dann 4 mittelschwere und zum Schluss 3 schwere Fragen. Ein bereits festgelegter Tagesflug behält seine Fragen für alle. Du startest bei 1.500 m; Fehler kosten 350 m, mindestens bleibt 0 m. Alle zehn Fragen werden gespielt.</p></article><article class="info-card"><h2>Die Bestenliste.</h2><p>Deine Endhöhe nach Frage zehn zählt. Bei Gleichstand entscheiden Punkte und dann die gesamte Antwortzeit. Nur abgeschlossene Tagesflüge werden eingetragen. Dein Rufname lässt sich auf der Bestenliste ändern. Um Mitternacht in Berlin beginnt der nächste Flugtag.</p></article><article class="info-card"><h2>Dein freier Rekord.</h2><p>Wähle einen Kurs oder den Mix und starte bei 0 m. Zwei Fehler hintereinander lassen sich noch retten: Die nächste richtige Antwort stabilisiert den Flug. Der dritte Fehler in Folge beendet ihn. Im Mix bestimmt deine aktuelle Höhe die Fragen: unter 3.000 m leicht, ab 3.000 m mittel und ab 6.000 m schwer. An jeder Grenze verändert sich auch der Himmel. Sinkst du zurück, gilt für die nächste Frage wieder die niedrigere Stufe. Freie Rekorde stehen in deiner Statistik, getrennt vom Tageswettbewerb.</p></article></div><div class="mode-guide">${MODES.slice(1).map(mode=>`<article class="info-card"><h2>${mode.label}</h2><p>${mode.id==='common'?'Vergleiche die angegebene Größe: Welcher Eintrag ist zum Beispiel höher, größer oder länger? Die Einheit und der Quellenbezug stehen bei der Frage.':mode.id==='rare'?'Vergleiche die angegebene Größe und wähle den kleinsten Wert. Achte auf Einheit, Bezugsgruppe und gegebenenfalls Jahr.':mode.id==='earlier'?'Welcher der genau bezeichneten Meilensteine geschah zuerst? Es zählt das in der Aufgabe genannte Ereignis.':'Welcher Meilenstein geschah zuletzt? Gemeint sind belegte Ereignisse der Vergangenheit.'}</p></article>`).join('')}</div><p class="callout">Vier Möglichkeiten, eine richtige Antwort: antippen, klicken oder die Tasten 1 bis 4 drücken. Schnelligkeit bringt mehr Auftrieb. Nach jeder Antwort kannst du die Erklärung ohne Zeitdruck lesen. Erst „Weiterfliegen“ startet die nächste Frage.</p><p class="callout">Neue Tagesrunden geben dir für jede der zehn Fragen 25 Sekunden. Bereits begonnene Tageswettbewerbe behalten ihre gespeicherten Fragen und Zeitfenster. Freie Flüge starten mit 22 Sekunden; jede richtige Antwort verkürzt die Zeit um 0,2 Sekunden, bis auf 8 Sekunden. Im Rettungsfenster bleiben 65 % der Zeit, mindestens 6 Sekunden.</p><p class="callout">Neue Tagesrunden haben genau 3 leichte, 4 mittelschwere und 3 schwere Fragen in dieser Reihenfolge. Die Schulfragen beginnen mit vertrauten Grundlagen. Im schweren Abschnitt geht es stärker um Verstehen und Anwenden, nicht um möglichst unbekannte Namen. Schulfächer und weitere Themen wie Literatur, Musik sowie Religionen und Weltanschauungen wechseln sich ab. Fehlen neue Fragen einer benötigten Stufe, startet kein unvollständiger Tagesflug. Im freien Mix wechseln sich zum Beispiel Geografie, Film, Literatur und Kultur ab. Dabei bleibt jede neue Mix-Frage in der Höhenstufe: unter 3.000 m leicht, von 3.000 bis unter 6.000 m mittel und ab 6.000 m schwer. Es gibt keine vorzeitigen schweren Ausweichfragen. Bereits gestartete Fragen behalten ihre Aufgabe und Frist. Die einzelnen Kurse werden mit der Höhe und der Fragenzahl kniffliger. Bereits gezeigte Fakten und ihre umgekehrten Varianten werden ausgelassen.</p><p class="callout">Der Server merkt sich jede neu gezeigte Fragefamilie dauerhaft für die Gerätekennung dieses Browsers – auch wenn du eine Frage unbeantwortet verlässt. Das gilt über freie Flüge und Modi hinweg; ein umgekehrter Vergleich gilt als dieselbe Fragefamilie. Für einen Tagesmix reservierte Fragen bleiben im freien Flug gesperrt. Zusätzliche Wissensfragen werden nur ausgewählt, wenn sie zuvor noch niemandem gezeigt wurden. Neue Tagesfragen werden auch an späteren Tagen nicht wiederverwendet. Eine bereits laufende Frist läuft außerhalb des Tabs weiter. Eine begonnene Frage kannst du mit derselben laufenden Frist wieder öffnen; sie wird dabei nicht als neue Frage ausgewählt.</p><p class="callout">Ist der verfügbare Bestand eines Kurses oder der aktuellen Mix-Höhenstufe vollständig gesehen, endet der Flug ruhig mit „Alles entdeckt“. Das Spiel recycelt dafür keine alten Fragen. Ein anderer Browser hat eine eigene Gerätekennung. Das Löschen deiner Spieldaten oder der Browserkennung setzt auch die zugehörige Wiederholungshistorie zurück.</p><p class="callout">Der aktive Fragenkatalog verbindet einen gespeicherten Wikidata-Datenstand mit eigenständig formulierten Schul- und Wissensfragen. Die zusätzlichen Fragen decken unter anderem Englisch, Literatur, Musik, Religionen und Weltanschauungen, Kunst, Sport und Alltagswissenschaft ab. Sie nennen ihre fachlichen Quellen. Religionen werden vergleichend und sachlich behandelt; Glaubensaussagen werden der jeweiligen Tradition zugeordnet. Bereits begonnene ältere Runden behalten ihre gespeicherten Fragen. Wikidata stellt seine strukturierten Daten unter <a href="https://www.wikidata.org/wiki/Wikidata:Licensing" target="_blank" rel="noopener noreferrer">CC0</a> bereit. Die jeweilige Auflösung zeigt Quellen und Bezugsbedingungen.</p><p class="callout">Motor- und Signaltöne sind standardmäßig aus. Bewegungsreduktion folgt deiner Systemeinstellung.</p><div class="center"><button class="button" id="help-home">ZUR STARTBAHN</button></div></section>`,'anleitung');
  $('#help-home').onclick=()=>{replaceHash('#start');home();};
}
async function statistics(){scene.setMode('home');view('<section class="page"><header class="page-header"><p class="eyebrow">DEINE FLUGREKORDE</p><h1>Wie hoch war dein Höhenflug?</h1></header><div id="stats-content"><p class="loading">Flugbuch wird geöffnet …</p></div></section>','statistik');try{const stats=await api('stats');if(screen!=='statistik')return;$('#stats-content').innerHTML=`<div class="stat-boxes"><div class="stat-box"><strong>${meters(stats.bestAltitude)} m</strong><span>Höchster Flug</span></div><div class="stat-box"><strong>${stats.bestStreak||0}</strong><span>Beste Antwortserie</span></div><div class="stat-box"><strong>${stats.flights||0}</strong><span>Gestartete Flüge</span></div></div><div class="distribution"><h2>Deine Kurse</h2>${[modeInfo('daily'),...MODES].map(mode=>{const item=stats.byMode?.[mode.id]||{};return `<div class="flight-stat-row"><strong>${mode.label}</strong><span>${meters(item.bestAltitude)} m</span><small>${item.flights||0} Flüge</small></div>`;}).join('')}</div><p class="empty-note">${stats.totalCorrect||0} richtige Antworten insgesamt · ${(stats.crashes||0)+(stats.completed||0)+(stats.exhausted||0)} beendete Flüge</p>`;}catch(error){if(screen==='statistik')$('#stats-content').innerHTML=`<p class="empty-note">${esc(error.message)}</p><button class="button" id="stats-retry">Erneut versuchen</button>`;if($('#stats-retry'))$('#stats-retry').onclick=statistics;}}
async function flightbook(){scene.setMode('home');view('<section class="page"><header class="page-header"><p class="eyebrow">DEIN FLUGBUCH</p><h1>Jeder Start eine neue Chance.</h1><p>Deine letzten 20 Flüge auf diesem Gerät.</p></header><div class="archive-list" id="history-content"><p class="loading">Flugbuch wird geöffnet …</p></div></section>','flugbuch');try{const data=await api('history');if(screen!=='flugbuch')return;const flights=data.flights||[];$('#history-content').innerHTML=flights.length?flights.map(flight=>`<article class="archive-row"><span class="flight-log-icon" aria-hidden="true">✈</span><div><h2>${meters(flight.status==='finished'?flight.altitude:flight.peakAltitude??flight.altitude)} m · ${modeInfo(flight.mode).label}</h2><p>${flight.correctTotal??flight.streak} richtig · ${flight.score} Punkte · ${new Date(flight.finishedAt||flight.startedAt).toLocaleDateString('de-DE')}</p></div><span class="flight-end-label">${flight.dailySuperseded?'FRÜHERE TAGESRUNDE':flight.status==='exhausted'?'ALLES ENTDECKT':flight.status==='finished'?'10 / 10':isDaily(flight)?'RESERVE LEER':'RETTUNG VERPASST'}</span></article>`).join(''):'<p class="empty-note">Noch kein Flug eingetragen. Die Startbahn wartet auf dich.</p>';}catch(error){if(screen==='flugbuch'){$('#history-content').innerHTML=`<p>${esc(error.message)}</p><button class="button" id="history-retry">Erneut versuchen</button>`;$('#history-retry').onclick=flightbook;}}}
function legal(privacy){scene.setMode('home');view(`<section class="page text-page"><p class="eyebrow">HÖHENFLUG</p><h1>${privacy?'Datenschutz':'Impressum'}</h1>${privacy?`<p>Dieses Pixel-Flugquiz verwendet keine Werbung oder Analyse-Tracker. Der Browser speichert eine zufällige Gerätekennung, Einstellungen und Spielstände. Das Backend speichert dazugehörige Flüge, gewählte Antwort-IDs, Zeitstempel, Rekorde und bereits gezeigte Fragefamilien in einer SQLite-kompatiblen Datenbank. Es gibt keine KI-Abfragen. Für die Tagesbestenliste kannst du einen freiwilligen Rufnamen speichern. Dieser Rufname sowie Endhöhe, Punkte und Antwortzeit abgeschlossener Tagesflüge sind für Besucher dieser Website sichtbar. Deine Gerätekennung wird dabei nicht angezeigt.</p><h2>Hosting und Schriftarten</h2><p>Die Spieloberfläche wird über GitHub Pages beziehungsweise Sites bereitgestellt; Sites betreibt den gemeinsamen Spielserver. Technisch notwendige Verbindungsdaten werden durch die jeweiligen Hostinganbieter verarbeitet. Die Schriften VT323 und IBM Plex Mono kommen von Google Fonts; Google erhält beim Laden Verbindungsdaten wie die IP-Adresse.</p><h2>Spieldaten löschen</h2><p>Die zu deiner Gerätekennung gespeicherten Flüge, Wiederholungshistorie und lokalen Spieldaten können gelöscht werden. Danach können früher gesehene Fragen erneut erscheinen. Der Vorgang lässt sich nicht rückgängig machen.</p><button class="button secondary" id="prepare-delete">Löschung vorbereiten</button><div id="delete-confirm"></div>`:`<p>Höhenflug ist ein eigenständiges Wissensspiel mit eigener Pixel-Flugwelt und eigenem Programmcode.</p><h2>Betreiberangaben</h2><p>Die verbindlichen Betreiberangaben nach § 5 DDG sind noch nicht hinterlegt. Vor einer öffentlichen Veröffentlichung müssen Name oder Firma, ladungsfähige Anschrift und Kontakt-E-Mail ergänzt werden.</p><h2>Fakten und Daten</h2><p>Die Fragen vergleichen nachvollziehbare Mengen, Wahrscheinlichkeiten, belegte Ereignisse und Allgemeinwissen. Der Wikidata-Bestand beruht auf einem gespeicherten Datenstand; Wikidata stellt diese strukturierten Daten unter CC0 bereit. Anspruchsvolle Häufigkeitsfragen nennen ihre datierten Datensätze. Die Aufgaben nennen ihre Datengrundlage. Nach jeder Antwort werden ein kurzer Lernfakt und Quellenlinks eingeblendet. Rechen- und Transferaufgaben kennzeichnen ihre Annahmen. Fehlende Betreiber- und Datenschutzangaben sind vor öffentlichem Betrieb zu vervollständigen.</p><a class="text-button" href="#datenschutz">Datenschutzhinweise lesen</a>`}</section>`,privacy?'datenschutz':'impressum');if(privacy)$('#prepare-delete').onclick=()=>{$('#delete-confirm').innerHTML='<p>Wirklich alle deine Flüge und Rekorde löschen?</p><button class="button" id="delete-yes">Ja, meine Flugdaten löschen</button>';$('#delete-yes').onclick=async()=>{try{await api('delete',{});try{for(const key of Object.keys(localStorage))if(key.startsWith('hoehenflug-'))localStorage.removeItem(key);}catch{}device=crypto.randomUUID();store.set('device',device);run=null;localHistory=[];replaceHash('#start');home();toast('Deine Flugdaten wurden gelöscht.');}catch(error){toast(error.message);}};};}
function route(){const name=location.hash.slice(1);if(['takeoff','question','feedback','finishing','saving','crashing'].includes(screen)){replaceHash('#start');leaveFlight(name||'start');return;}switch(name){case'anleitung':instructions();break;case'statistik':statistics();break;case'flugbuch':flightbook();break;case'bestenliste':leaderboard();break;case'impressum':legal(false);break;case'datenschutz':legal(true);break;default:home();}}
window.addEventListener('hashchange',route);$('.skip').onclick=event=>{event.preventDefault();main.focus();};document.querySelectorAll('.brand,[data-nav]').forEach(link=>link.addEventListener('click',event=>{if(link.hash===location.hash){event.preventDefault();if(['takeoff','question','feedback','finishing','saving','crashing'].includes(screen))leaveFlight(link.hash.slice(1));else route();}}));
$('#menu-toggle').onclick=()=>document.body.classList.contains('menu-open')?closeMenu():openMenu();$('#menu-close').onclick=()=>{closeMenu();$('#menu-toggle').focus();};$('#menu-scrim').onclick=closeMenu;$('#game-menu').addEventListener('click',event=>{if(event.target.closest('a'))closeMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('menu-open')){closeMenu();$('#menu-toggle').focus();}if(event.key==='Tab'&&document.body.classList.contains('menu-open')){const items=[...$('#game-menu').querySelectorAll('button,a')],first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}if(screen==='question'&&!busy&&!document.body.classList.contains('menu-open')&&!$('#leave-dialog').open&&!event.repeat&&/^[1-4]$/.test(event.key)){event.preventDefault();const option=currentQuestion?.options[Number(event.key)-1];if(option)submitChoice(option.id);}});
const dark=store.get('theme','light')==='dark';document.body.classList.toggle('dark',dark);function themeLabel(){const on=document.body.classList.contains('dark');$('#theme').setAttribute('aria-pressed',String(on));$('#theme').setAttribute('aria-label',on?'Tagmodus einschalten':'Nachtmodus einschalten');}themeLabel();$('#theme').onclick=()=>{document.body.classList.toggle('dark');store.set('theme',document.body.classList.contains('dark')?'dark':'light');themeLabel();};
let audio=null,audioGain=null;$('#sound').onclick=async()=>{try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;audio=new Audio();const tone=audio.createOscillator(),filter=audio.createBiquadFilter();audioGain=audio.createGain();tone.type='sawtooth';tone.frequency.value=65;filter.type='lowpass';filter.frequency.value=160;audioGain.gain.value=.025;tone.connect(filter).connect(audioGain).connect(audio.destination);tone.start();}if($('#sound').getAttribute('aria-pressed')==='true')await audio.suspend();else await audio.resume();const on=audio.state==='running';$('#sound').setAttribute('aria-pressed',String(on));$('#sound').setAttribute('aria-label',on?'Flug-Sound ausschalten':'Flug-Sound einschalten');toast(on?'Flug-Sound an':'Flug-Sound aus');}catch{toast('Flug-Sound ist in diesem Browser nicht verfügbar.');}};
function playChime(){if(audio?.state!=='running')return;const tone=audio.createOscillator(),gain=audio.createGain();tone.frequency.setValueAtTime(440,audio.currentTime);tone.frequency.exponentialRampToValueAtTime(660,audio.currentTime+.14);gain.gain.setValueAtTime(.035,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.25);tone.connect(gain).connect(audio.destination);tone.start();tone.stop(audio.currentTime+.25);}
function playCrash(){if(audio?.state!=='running')return;const tone=audio.createOscillator(),gain=audio.createGain();tone.type='triangle';tone.frequency.setValueAtTime(180,audio.currentTime);tone.frequency.exponentialRampToValueAtTime(40,audio.currentTime+.6);gain.gain.setValueAtTime(.04,audio.currentTime);gain.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.7);tone.connect(gain).connect(audio.destination);tone.start();tone.stop(audio.currentTime+.7);}
route();
