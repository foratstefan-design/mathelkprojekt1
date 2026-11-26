import { questions } from './questions.js';

export const modes = [
  {id:'mix',label:'Gemischt',description:'Wissenschaft, Kultur und überraschende Fakten.'},
  {id:'common',label:'Am meisten',description:'Größere Anteile und Werte erkennen.'},
  {id:'rare',label:'Am wenigsten',description:'Kleinere Anteile und Werte erkennen.'},
  {id:'earlier',label:'Was war früher?',description:'Erfindungen und Entdeckungen einordnen.'},
  {id:'later',label:'Was kam später?',description:'Den jüngsten Meilenstein erkennen.'},
  {id:'daily',label:'Tagesflug',description:'Zehn gemischte Fragen aus verschiedenen Bereichen für alle.'}
];
const rotation=['rare','common','earlier','later'];
export const DAILY_QUESTION_COUNT=10;
const dailyLevels=[1,1,1,2,2,3,3,3,3,3];
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
// Finite legacy selector retained for old snapshots and pure tests. Production
// games draw from the indexed SQL catalog; no numeric-clone fallback is used.
export class QuestionPoolExhaustedError extends Error {
  constructor(){super('Alle aktuell verfügbaren Fragen dieses Kurses wurden bereits gezeigt.');this.name='QuestionPoolExhaustedError';this.code='QUESTION_POOL_EXHAUSTED';}
}
export function questionFor(seed,index,mode='mix',context={}) {
  if(!modes.some(m=>m.id===mode))throw new Error('Unbekannter Flugmodus.');
  if(!Number.isSafeInteger(index)||index<0)throw new Error('Ungültiger Fragenindex.');
  const selectedMode=mode==='daily'?'mix':mode,difficulty=difficultyFor(context.altitude,context.startAltitude,index);
  const seenIds=new Set(context.seenIds||[]),seenFamilies=new Set([...(context.seenFamilies||[]),...(context.recentSeenFamilies||[])]);
  for(const q of questions)if(seenIds.has(q.id))seenFamilies.add(q.familyId);
  const ordered=orderedPool(String(seed),selectedMode,difficulty).filter(q=>q.difficulty<=difficulty);
  const hasHistory=Array.isArray(context.seenIds)||Array.isArray(context.seenFamilies)||Array.isArray(context.recentSeenFamilies);
  const fresh=ordered.filter(q=>!seenIds.has(q.id)&&!seenFamilies.has(q.familyId));
  const categories=(context.recentCategories||[]).slice(0,3);
  const selected=hasHistory?(fresh.find(q=>!categories.includes(q.category))||fresh[0]):fresh[index];
  if(!selected)throw new QuestionPoolExhaustedError();
  return selected;
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
