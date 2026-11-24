import { questions } from './questions.js';

export const modes = [
  {id:'mix',label:'Gemischt',description:'Wissenschaft, Kultur und überraschende Fakten.'},
  {id:'common',label:'Am häufigsten',description:'Den größten Anteil erkennen.'},
  {id:'rare',label:'Am seltensten',description:'Den kleinsten Anteil erkennen.'},
  {id:'earlier',label:'Was war früher?',description:'Erfindungen und Entdeckungen einordnen.'},
  {id:'later',label:'Was kam später?',description:'Den jüngsten Meilenstein erkennen.'},
  {id:'daily',label:'Tagesflug',description:'Zehn gleiche Fragen für alle, ein Tagesmodus.'}
];
const rotation=['rare','common','earlier','later'];
export const DAILY_QUESTION_COUNT=10;
const dailyLevels=[1,1,1,1,1,1,1,1,2,2];
const anchor=Date.UTC(2026,10,19);
function validDate(date) {
  if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('Ungültiges Tagesdatum.');
  const instant=Date.parse(date+'T00:00:00Z');
  if(!Number.isFinite(instant)||new Date(instant).toISOString().slice(0,10)!==date)throw new Error('Ungültiges Tagesdatum.');
  return instant;
}
export function dailyModeFor(date) {
  const offset=Math.round((validDate(date)-anchor)/86400000);
  return rotation[((offset%4)+4)%4];
}
function hash(seed) {
  let value=2166136261;
  for(const character of String(seed)){value^=character.charCodeAt(0);value=Math.imul(value,16777619);}
  return value>>>0;
}
function randomFor(seed) {
  let state=hash(seed);
  return ()=>{state+=0x6D2B79F5;let value=state;value=Math.imul(value^value>>>15,value|1);value^=value+Math.imul(value^value>>>7,value|61);return((value^value>>>14)>>>0)/4294967296;};
}
function shuffled(items,random) {
  const copy=[...items];
  for(let index=copy.length-1;index>0;index--){const other=Math.floor(random()*(index+1));[copy[index],copy[other]]=[copy[other],copy[index]];}
  return copy;
}
function distinctFamilies(items) {
  const seen=new Set();
  return items.filter(q=>{if(seen.has(q.familyId))return false;seen.add(q.familyId);return true;});
}
function orderedPool(seed,mode,difficulty) {
  const pool=shuffled(questions.filter(q=>mode==='mix'||q.type===mode),randomFor(seed+':'+mode));
  // A short easier interlude is preferable to replacing facts with toy puzzles
  // when the current altitude band has exhausted its questions.
  return distinctFamilies(pool.sort((a,b)=>Math.abs(a.difficulty-difficulty)-Math.abs(b.difficulty-difficulty)));
}
/** Daily selection never depends on a player's height, score, answers or id. */
export function dailyQuestionFor(date,index) {
  const mode=dailyModeFor(date);
  if(!Number.isSafeInteger(index)||index<0||index>=DAILY_QUESTION_COUNT)throw new Error('Ungültige Tagesfragenposition.');
  const seen=new Set();let selected;
  for(let position=0;position<=index;position++){
    selected=orderedPool('daily-v3:'+date,mode,dailyLevels[position]).find(q=>!seen.has(q.familyId));
    if(!selected)throw new Error('Der Tagesfragenpool ist nicht vollständig.');
    seen.add(selected.familyId);
  }
  return selected;
}
const finite=value=>Number.isFinite(value)?value:0;
export function difficultyFor(altitude=0,startAltitude=0,index=0) {
  const climb=Math.max(0,finite(altitude)-finite(startAltitude));
  if(index<16||climb<6000)return 1;
  return index<32||climb<14000?2:3;
}
function choose(n,k){let value=1;for(let i=1;i<=k;i++)value=value*(n-i+1)/i;return Math.round(value);}

/** Endless extensions remain educational: factual timelines or probability,
 * half-life, compound interest and signal physics. No fruit/counting drills. */
function generatedQuestion(seed,index,type,difficulty,nonce=0) {
  const id='mss-extra-'+hash(seed).toString(36)+'-'+type+'-'+index+'-'+nonce;
  const random=randomFor(id),source={title:'Mathematische Herleitung aus den Angaben',url:null};
  const base={id,type,difficulty,familyId:id,basis:'curated',source};
  if(type==='earlier'||type==='later'){
    // Retain the original comparison scope as well as its year. For example,
    // a Nobel prize year is not necessarily the year of the award ceremony.
    const events=[...new Map(questions.filter(q=>q.type==='earlier'&&q.difficulty<=difficulty).flatMap(q=>q.options.map(o=>[o.label,{...o,scope:q.prompt.replace(/: Was geschah (zuerst|zuletzt)\?$/,''),theme:q.category,source:q.source}]))).values()];
    const picked=shuffled(events,random).filter((item,position,all)=>all.findIndex(o=>o.value===item.value)===position).slice(0,4);
    if(picked.length<4)throw new Error('Zu wenige historische Meilensteine.');
    const options=picked.map((o,i)=>({id:id+'-'+i,label:o.label+' · '+o.scope,value:o.value,displayValue:o.displayValue}));
    const sorted=[...options].sort((a,b)=>a.value-b.value),correct=type==='earlier'?sorted[0]:sorted.at(-1);
    const familyId='timeline-set:'+picked.map(o=>o.label).sort().join('|');
    const themes=[...new Set(picked.map(o=>o.theme))].sort();
    return {...base,familyId,category:themes.join(' & '),prompt:'Welche Entwicklung aus '+themes.join(', ')+' geschah '+(type==='earlier'?'zuerst':'zuletzt')+'?',
      options,correctId:correct.id,basisLabel:'Historische Meilensteine · Bezug steht bei jeder Option',
      explanation:sorted.map(o=>o.label+': '+o.displayValue).join(' · ')+'. Die Reihenfolge verbindet verschiedene historische Entwicklungen.',
      source:picked[0].source,relatedSources:picked.map(o=>o.source)};
  }
  // Lower stages use short conceptual science comparisons. Binomial and
  // compound-interest drills are reserved for later, more advanced flights.
  const templates=difficulty===1?[1,3,4,5,6]:difficulty===2?[0,1,3,4,5,6,7]:[0,1,2,3,4,5,6,7];
  const template=templates[(index+hash(seed)+nonce)%templates.length];
  let rows,prompt,explanation,category,familyId;
  if(template===0){
    const n=8+Math.floor(random()*(difficulty===2?5:57)),ks=shuffled(Array.from({length:Math.ceil(n/2)},(_,i)=>i),random).slice(0,4);
    rows=ks.map(k=>{const percent=choose(n,k)/Math.pow(2,n)*100;return {label:'Genau '+k+'-mal Kopf',value:percent/100,displayValue:(percent<.001?percent.toExponential(2).replace('.',','):percent.toLocaleString('de-DE',{maximumFractionDigits:3}))+' %'};});
    prompt=n+' unabhängige Würfe einer fairen Münze: Welches dieser Ereignisse ist '+(type==='rare'?'am seltensten':'am wahrscheinlichsten')+'?';
    explanation='Für genau k Treffer gibt es „n über k“ Anordnungen. Jede konkrete Folge hat die Wahrscheinlichkeit 1/2ⁿ; ein Ereignis umfasst oft mehrere solcher Folgen.';
    category='Wahrscheinlichkeit';
    familyId='transfer-binomial:'+n+':'+[...ks].sort((a,b)=>a-b).join(',');
  }else if(template===1){
    const periods=shuffled(Array.from({length:difficulty===1?5:10},(_,i)=>i+1),random).slice(0,4),years=3+Math.floor(random()*240);
    rows=periods.map(p=>({label:(p*years)+' Jahre',value:Math.pow(.5,p),displayValue:(Math.pow(.5,p)*100).toLocaleString('de-DE')+' % verbleiben'}));
    prompt='Ein Isotop hat '+years+' Jahre Halbwertszeit. Nach welcher Zeit ist vom ursprünglichen radioaktiven Isotop '+(type==='rare'?'am wenigsten':'am meisten')+' noch vorhanden?';
    explanation='Bei jeder Halbwertszeit halbiert sich die noch vorhandene Menge erneut. Der Zerfall ist exponentiell: Nach vier Halbwertszeiten bleiben 6,25 % statt null.';
    category='Radioaktiver Zerfall';
    familyId='transfer-decay:'+years+':'+[...periods].sort((a,b)=>a-b).join(',');
  }else if(template===2){
    const periods=shuffled([2,3,4,5,6,8,10,12],random).slice(0,4);
    const rates=shuffled([2,3,4,5,6,8,10,12],random).slice(0,4);
    rows=rates.map((rate,i)=>({label:rate+' % pro Jahr, '+periods[i]+' Jahre',value:Math.pow(1+rate/100,periods[i]),displayValue:((Math.pow(1+rate/100,periods[i])-1)*100).toLocaleString('de-DE',{maximumFractionDigits:2})+' % Zuwachs'}));
    prompt='Gleiches Startkapital, keine Kosten, jährlicher Zinseszins: Welcher Sparplan erzielt bis zu seinem jeweiligen Laufzeitende den '+(type==='rare'?'kleinsten':'größten')+' prozentualen Zuwachs?';
    explanation='Zinsen werden jedes Jahr mitverzinst. Deshalb beträgt der Wachstumsfaktor (1 + Zinssatz) hoch Laufzeit; lineares Addieren unterschätzt den Zuwachs.';
    category='Wirtschaft & Wachstum';
    familyId='transfer-interest:'+rows.map(o=>o.label).sort().join('|');
  }else if(template===3){
    const baseHz=100+Math.floor(random()*1000)*10,multiples=shuffled(Array.from({length:20},(_,i)=>i+1),random).slice(0,4);
    rows=multiples.map(mult=>({label:(baseHz*mult).toLocaleString('de-DE')+' Hz',value:baseHz*mult,displayValue:(baseHz*mult).toLocaleString('de-DE')+' Schwingungen/s'}));
    prompt='Vier Schallwellen haben die gleiche Ausbreitungsgeschwindigkeit. Welche Frequenz hat die '+(type==='rare'?'längste':'kürzeste')+' Wellenlänge?';
    explanation='Im selben Medium gilt Wellenlänge = Ausbreitungsgeschwindigkeit / Frequenz. Eine höhere Frequenz bedeutet daher eine kürzere Wellenlänge.';
    category='Schall & Wellen';
    familyId='transfer-waves:'+rows.map(o=>o.value).sort((a,b)=>a-b).join(',');
  }else if(template===4){
    const speeds=shuffled(Array.from({length:20},(_,i)=>(i+1)*5),random).slice(0,4);
    rows=speeds.map(v=>({label:v+' km/h',value:v*v,displayValue:'Energie proportional zu '+(v*v)}));
    prompt='Dasselbe Auto fährt mit vier verschiedenen Geschwindigkeiten. Wann besitzt es die '+(type==='rare'?'kleinste':'größte')+' Bewegungsenergie?';
    explanation='Bei gleicher Masse wächst die Bewegungsenergie mit dem Quadrat der Geschwindigkeit. Doppelte Geschwindigkeit bedeutet deshalb vierfache Energie und bei gleicher Bremskraft einen etwa viermal so langen Bremsweg.';
    category='Verkehr & Energie';
    familyId='transfer-kinetic:'+speeds.sort((a,b)=>a-b).join(',');
  }else if(template===5){
    const wavelengths=shuffled(Array.from({length:80},(_,i)=>(i+10)*10),random).slice(0,4);
    rows=wavelengths.map(v=>({label:v+' nm Wellenlänge',value:1/v,displayValue:'Photonenenergie proportional zu 1/'+v}));
    prompt='Vier Lichtsorten unterscheiden sich in ihrer Wellenlänge. Welche einzelnen Photonen haben die '+(type==='rare'?'geringste':'höchste')+' Energie?';
    explanation='Ein einzelnes Photon trägt umso mehr Energie, je kürzer seine Wellenlänge ist: E = h·c/λ. Deshalb ist ein UV-Photon energiereicher als ein Photon von langwelligem rotem Licht.';
    category='Licht & Photonen';
    familyId='transfer-photon:'+wavelengths.sort((a,b)=>a-b).join(',');
  }else if(template===6){
    const volumes=shuffled(Array.from({length:20},(_,i)=>i+1),random).slice(0,4);
    rows=volumes.map(v=>({label:v+' Liter Volumen',value:1/v,displayValue:'Druck proportional zu 1/'+v}));
    prompt='Gleiche Menge eines idealen Gases, gleiche Temperatur: In welchem Volumen herrscht der '+(type==='rare'?'kleinste':'größte')+' Druck?';
    explanation='Bei gleicher Stoffmenge und Temperatur sind Druck und Volumen umgekehrt proportional. Wird ein Gas auf das halbe Volumen zusammengedrückt, verdoppelt sich im idealisierten Modell sein Druck.';
    category='Gase & Druck';
    familyId='transfer-gas:'+volumes.sort((a,b)=>a-b).join(',');
  }else{
    const efficiencies=shuffled([20,30,40,50,60,70,80,90],random).slice(0,4),inputs=shuffled([100,200,300,400,500,600],random).slice(0,4);
    rows=efficiencies.map((v,i)=>({label:inputs[i]*v/100+' J nutzbar aus '+inputs[i]+' J Zufuhr',value:v/100,displayValue:v+' % Wirkungsgrad'}));
    prompt='Vier Geräte wandeln zugeführte Energie in Nutzenergie um. Welches hat den '+(type==='rare'?'kleinsten':'größten')+' Wirkungsgrad?';
    explanation='Der Wirkungsgrad ist der Anteil der zugeführten Energie, der als gewünschte Nutzenergie verfügbar wird. Entscheidend ist das Verhältnis, nicht die größte absolute Zahl an Joule.';
    category='Technik & Wirkungsgrad';
    familyId='transfer-efficiency:'+rows.map(o=>o.label).sort().join('|');
  }
  const options=shuffled(rows,random).map((o,i)=>({...o,id:id+'-'+i}));
  const sorted=[...options].sort((a,b)=>a.value-b.value),correct=type==='rare'?sorted[0]:sorted.at(-1);
  return {...base,familyId,category,prompt,options,correctId:correct.id,explanation,basisLabel:'Transferaufgabe · aus den Angaben herleitbar'};
}
export function questionFor(seed,index,mode='mix',context={}) {
  if(!modes.some(m=>m.id===mode))throw new Error('Unbekannter Flugmodus.');
  if(!Number.isSafeInteger(index)||index<0)throw new Error('Ungültiger Fragenindex.');
  const selectedMode=mode==='daily'?'mix':mode,difficulty=difficultyFor(context.altitude,context.startAltitude,index);
  const seenIds=new Set(context.seenIds||[]),seenFamilies=new Set(context.seenFamilies||[]);
  for(const q of questions)if(seenIds.has(q.id))seenFamilies.add(q.familyId);
  const ordered=orderedPool(String(seed),selectedMode,difficulty).filter(q=>q.difficulty<=difficulty);
  const hasHistory=Array.isArray(context.seenIds)||Array.isArray(context.seenFamilies);
  const recentFamilies=Array.isArray(context.recentSeenFamilies)?context.recentSeenFamilies:[];
  const recency=new Map();
  recentFamilies.forEach((family,position)=>{if(!recency.has(family))recency.set(family,position);});
  const recentCategories=(context.recentCategories||[]).slice(0,3);
  const recentPrompts=(context.recentPrompts||[]).slice(0,3);
  const available=ordered.filter(q=>!seenIds.has(q.id)&&!seenFamilies.has(q.familyId));
  let selected;
  if(hasHistory){
    const fresh=available.filter(q=>!recency.has(q.familyId));
    selected=fresh.find(q=>!recentCategories.includes(q.category)&&!recentPrompts.includes(q.prompt))||fresh[0];
    if(!selected&&available.length){
      // History is newest-first. Reuse the oldest entry-level fact rather than
      // suddenly serving an unseen expert question to a beginner.
      selected=[...available].sort((a,b)=>(recency.get(b.familyId)??Infinity)-(recency.get(a.familyId)??Infinity))[0];
    }
  }else selected=ordered[index];
  if(selected)return selected;
  const type=selectedMode==='mix'?['general','common','rare','earlier','later'][hash(seed+':'+index)%5]:selectedMode;
  let fallback;
  for(let nonce=0;nonce<512;nonce++){
    const fresh=generatedQuestion(String(seed),index,type,difficulty,nonce);
    if(seenIds.has(fresh.id)||seenFamilies.has(fresh.familyId))continue;
    fallback||=fresh;
    if(!recentCategories.includes(fresh.category)&&!recentPrompts.includes(fresh.prompt))return fresh;
  }
  if(fallback)return fallback;
  throw new Error('Für diesen Kurs konnte keine neue Frage zusammengestellt werden.');
}
export function publicQuestion(question,seed,index) {
  return {id:question.id,type:question.type,category:question.category,prompt:question.prompt,difficulty:question.difficulty,familyId:question.familyId,
    options:shuffled(question.options,randomFor(seed+':'+index+':'+question.id)).map(({id,label})=>({id,label})),
    basis:question.basis,basisLabel:question.basisLabel};
}
export function gradeChoice(question,choiceId) {
  const selected=choiceId==null?null:question.options.find(o=>o.id===choiceId);
  if(choiceId!=null&&!selected)throw new Error('Diese Antwort gehört nicht zu dieser Frage.');
  const correct=question.options.find(o=>o.id===question.correctId);
  return {correct:selected?.id===correct.id,selectedId:selected?.id??null,correctId:correct.id,correctLabel:correct.label,selectedLabel:selected?.label??'Keine Antwort',
    explanation:question.explanation,source:{...question.source},relatedSources:question.relatedSources||[],
    options:question.options.map(({id,label,displayValue})=>({id,label,displayValue})),basis:question.basis,basisLabel:question.basisLabel,
    difficulty:question.difficulty,familyId:question.familyId};
}
export function timeLimitMs(streak,{daily=false,recovering=false}={}) {
  if(daily)return 25000;
  const count=Number.isFinite(streak)?Math.max(0,Math.floor(streak)):0;
  const base=Math.max(8000,22000-count*200);
  return recovering?Math.max(6000,Math.round(base*.65)):base;
}
export function flightReward(streak,remainingMs,limitMs) {
  const count=Number.isFinite(streak)?Math.max(0,Math.floor(streak)):0;
  const speed=Number.isFinite(remainingMs)&&Number.isFinite(limitMs)&&limitMs>0?Math.min(1,Math.max(0,remainingMs/limitMs)):0;
  return {points:10+Math.round(20*speed),altitudeGain:Math.min(500,150+Math.round(250*speed)+Math.min(100,count*10))};
}
