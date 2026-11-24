import { legacyQuestions } from './legacy-questions.js';

const modes = [
  { id: 'mix', label: 'Gemischt', description: 'Alle vier Fragetypen im Wechsel.' },
  { id: 'common', label: 'Am häufigsten', description: 'Die häufigste Option in belegten Datensätzen finden.' },
  { id: 'rare', label: 'Am seltensten', description: 'Die seltenste Option in belegten Datensätzen finden.' },
  { id: 'earlier', label: 'Was war früher?', description: 'Das früheste genau benannte Ereignis wählen.' },
  { id: 'later', label: 'Was kam später?', description: 'Das späteste genau benannte Ereignis wählen.' }
];
function seedText(seed) { return seed instanceof Date ? seed.toISOString().slice(0,10) : String(seed); }
function randomFor(seed) {
  let state = 2166136261;
  for (const character of String(seed)) { state ^= character.charCodeAt(0); state = Math.imul(state,16777619); }
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ value >>> 15,value | 1);
    value ^= value + Math.imul(value ^ value >>> 7,value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}
function shuffled(items,random) {
  const copy = [...items];
  for (let index=copy.length-1;index>0;index--) {
    const other=Math.floor(random()*(index+1));
    [copy[index],copy[other]]=[copy[other],copy[index]];
  }
  return copy;
}
function validMode(mode) {
  if (!modes.some(candidate => candidate.id === mode)) throw new Error('Unbekannter Flugmodus.');
  return mode;
}

/** Unlimited seeded cycles; every question appears once per complete pool cycle. */
export function legacyQuestionFor(seed,index,mode='mix') {
  validMode(mode);
  if (!Number.isSafeInteger(index) || index<0) throw new Error('Ungültiger Fragenindex.');
  const pool=mode==='mix' ? legacyQuestions : legacyQuestions.filter(question => question.type===mode);
  const cycle=Math.floor(index/pool.length);
  const offset=index%pool.length;
  const base=seedText(seed)+':'+mode+':';
  const sequence=shuffled(pool,randomFor(base+cycle));
  // Avoid an immediate repeat at the boundary without changing cycle membership.
  if (cycle>0) {
    const previous=shuffled(pool,randomFor(base+(cycle-1)));
    if (sequence[0].id===previous.at(-1).id) [sequence[0],sequence[1]]=[sequence[1],sequence[0]];
  }
  return sequence[offset];
}

/** Values, solution, explanation and source are revealed only after submission. */
function publicQuestion(question,seed,index) {
  return { id:question.id,type:question.type,category:question.category,prompt:question.prompt,
    options:shuffled(question.options,randomFor(seedText(seed)+':'+index+':'+question.id)).map(({id,label})=>({id,label})),
    basis:question.basis,basisLabel:question.basisLabel };
}
function gradeChoice(question,choiceId) {
  const selected=choiceId == null ? null : question.options.find(option=>option.id===choiceId);
  if (choiceId != null && !selected) throw new Error('Diese Antwort gehört nicht zu dieser Frage.');
  const correct=question.options.find(option=>option.id===question.correctId);
  return { correct:selected?.id===correct.id,selectedId:selected?.id??null,
    correctId:correct.id,correctLabel:correct.label,selectedLabel:selected?.label??'Keine Antwort',
    explanation:question.explanation,source:{...question.source},
    options:question.options.map(({id,label,displayValue})=>({id,label,displayValue})),
    basis:question.basis,basisLabel:question.basisLabel };
}

/** One continuous challenge: 14 seconds initially, then 450 ms less per success. */
function timeLimitMs(streak) {
  const count=Number.isFinite(streak)?Math.max(0,Math.floor(streak)):0;
  return Math.max(2500,14000-count*450);
}
/** Correct answers always gain height; speed and up to ten successes add a bonus. */
function flightReward(streak,remainingMs,limitMs) {
  const count=Number.isFinite(streak)?Math.max(0,Math.floor(streak)):0;
  const speed=Number.isFinite(remainingMs)&&Number.isFinite(limitMs)&&limitMs>0 ? Math.min(1,Math.max(0,remainingMs/limitMs)):0;
  return { points:10+Math.round(20*speed), altitudeGain:Math.min(500,150+Math.round(250*speed)+Math.min(100,count*10)) };
}
