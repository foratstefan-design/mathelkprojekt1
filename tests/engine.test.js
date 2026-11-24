import test from 'node:test';
import assert from 'node:assert/strict';
import {questions} from '../lib/questions.js';
import {modes,questionFor,publicQuestion,gradeChoice,timeLimitMs,flightReward,difficultyFor,dailyModeFor,dailyQuestionFor} from '../lib/engine.js';

test('160 upper-secondary questions provide concrete facts, unique options and explanations',()=>{
  assert.equal(questions.length,160);
  assert.equal(new Set(questions.map(q=>q.id)).size,160);
  assert.equal(new Set(questions.map(q=>q.prompt)).size,160);
  for(const type of ['common','rare','earlier','later','general']){
    assert.equal(questions.filter(q=>q.type===type).length,32);
    for(const [level,count] of [[1,12],[2,12],[3,8]])assert.equal(questions.filter(q=>q.type===type&&q.difficulty===level).length,count);
  }
  for(const q of questions){
    assert.ok(q.id.startsWith('mss-'));assert.ok(q.familyId&&q.basisLabel);
    assert.ok(q.explanation.length>=80,q.id+' has a learning fact');
    assert.ok(q.source.title&&q.source.url.startsWith('https://'));
    assert.equal(q.options.length,4);assert.equal(new Set(q.options.map(o=>o.id)).size,4);assert.equal(new Set(q.options.map(o=>o.label)).size,4);
    assert.ok(q.options.every(o=>Number.isFinite(o.value)&&o.displayValue));
    assert.equal(q.options.filter(o=>gradeChoice(q,o.id).correct).length,1,q.id);
    if(q.type!=='general'){
      assert.equal(new Set(q.options.map(o=>o.value)).size,4);
      const sorted=[...q.options].sort((a,b)=>a.value-b.value);
      assert.equal(q.correctId,(q.type==='common'||q.type==='later'?sorted.at(-1):sorted[0]).id,q.id);
    }
  }
});
test('known facts preserve their scope and explain common misconceptions',()=>{
  const air=questions.find(q=>q.id==='mss-freq-atmosphaere-common');
  assert.equal(gradeChoice(air,air.correctId).correctLabel,'Stickstoff');
  assert.equal(air.options.find(o=>o.label==='Stickstoff').value,78.084);
  const photo=questions.find(q=>q.id==='mss-general-photosynthese-sauerstoff');
  assert.equal(gradeChoice(photo,photo.correctId).correctLabel,'Aus Wasser');
  assert.match(photo.explanation,/Photosystem II/);
  const seasons=questions.find(q=>q.id==='mss-general-jahreszeiten');
  assert.match(gradeChoice(seasons,seasons.correctId).correctLabel,/Neigung/);
});
test('daily rotation is calendar-based, validates dates, and cycles across month/year boundaries',()=>{
  assert.deepEqual(['2026-11-19','2026-11-20','2026-11-21','2026-11-22','2026-11-23'].map(dailyModeFor),['rare','common','earlier','later','rare']);
  for(const date of ['2024-02-29','2026-12-31','2027-01-01','2026-03-29','2026-10-25'])assert.ok(['rare','common','earlier','later'].includes(dailyModeFor(date)));
  for(const date of ['2026-02-29','2026-13-01','2026-1-1','bad',null])assert.throws(()=>dailyModeFor(date));
});
test('ten daily questions have one mode, no reversed families, fixed progression and deterministic selection',()=>{
  for(const date of ['2026-11-19','2026-11-20','2026-11-21','2026-11-22']){
    const plan=Array.from({length:10},(_,i)=>dailyQuestionFor(date,i));
    assert.equal(new Set(plan.map(q=>q.id)).size,10);assert.equal(new Set(plan.map(q=>q.familyId)).size,10);
    assert.ok(plan.every(q=>q.type===dailyModeFor(date)));
    assert.deepEqual(plan.map(q=>q.difficulty),[1,1,1,1,1,1,1,1,2,2]);
    assert.deepEqual(plan,Array.from({length:10},(_,i)=>dailyQuestionFor(date,i)));
  }
  assert.notDeepEqual(Array.from({length:10},(_,i)=>dailyQuestionFor('2026-11-19',i).id),Array.from({length:10},(_,i)=>dailyQuestionFor('2026-11-23',i).id));
  for(const index of [-1,.5,10,NaN])assert.throws(()=>dailyQuestionFor('2026-11-19',index));
});
test('free flights use current relative altitude; exhausted stages draw remaining facts before transfer',()=>{
  assert.equal(difficultyFor(20000,0,15),1);
  assert.equal(difficultyFor(5999,0,16),1);assert.equal(difficultyFor(6000,0,16),2);
  assert.equal(difficultyFor(20000,0,31),2);assert.equal(difficultyFor(14000,0,32),3);
  assert.equal(difficultyFor(7000,1500,50),1);assert.equal(difficultyFor(15500,1500,50),3);
  const seen=questions.filter(q=>q.type==='common'&&q.difficulty===1);
  const next=questionFor('facts-first',20,'common',{altitude:0,seenIds:seen.map(q=>q.id),seenFamilies:seen.map(q=>q.familyId)});
  assert.equal(next.difficulty,1,'running out of entry facts does not force expert questions');
  assert.ok(!questions.some(q=>q.id===next.id));
});
test('long free flights never repeat a question or inverse family and remain solvable after the bank',()=>{
  for(const mode of modes.map(m=>m.id)){
    const context={altitude:0,startAltitude:0,seenIds:[],seenFamilies:[],recentCategories:[],recentPrompts:[]};
    for(let index=0;index<150;index++){
      context.altitude=index<8?0:index<25?3000:7000;
      const q=questionFor('long-flight',index,mode,context);
      assert.equal(context.seenIds.includes(q.id),false,mode+' repeats '+q.id);
      assert.equal(context.seenFamilies.includes(q.familyId),false,mode+' repeats family');
      assert.deepEqual(q,questionFor('long-flight',index,mode,context));
      if(!['mix','daily'].includes(mode))assert.equal(q.type,mode);
      assert.equal(gradeChoice(q,q.correctId).correct,true);
      assert.equal(new Set(q.options.map(o=>o.value)).size,4,q.id);
      context.seenIds.push(q.id);context.seenFamilies.push(q.familyId);context.recentCategories.unshift(q.category);context.recentPrompts.unshift(q.prompt);
    }
  }
});
test('simple selection callers do not cycle and history suppresses the inverse comparison',()=>{
  const first=questionFor('seed',0,'common');
  const inverse=questionFor('seed',0,'rare',{seenIds:[first.id]});
  assert.notEqual(first.familyId,inverse.familyId);
  for(const mode of modes.map(m=>m.id)){
    const sequence=Array.from({length:100},(_,i)=>questionFor('simple',i,mode));
    assert.equal(new Set(sequence.map(q=>q.id)).size,100,mode);
  }
  assert.throws(()=>questionFor('seed',0,'bad'));
  for(const i of [-1,.5,NaN,Infinity])assert.throws(()=>questionFor('seed',i));
});
test('public questions keep solution/facts hidden until an answer is committed',()=>{
  for(const [i,q] of questions.entries()){
    const safe=publicQuestion(q,'visible',i);assert.deepEqual(safe,publicQuestion(q,'visible',i));
    assert.deepEqual(safe.options.map(o=>o.id).sort(),q.options.map(o=>o.id).sort());
    for(const key of ['correctId','explanation','source','relatedSources'])assert.equal(key in safe,false);
    assert.ok(safe.options.every(o=>Object.keys(o).sort().join(',')==='id,label'));
    const result=gradeChoice(q,q.correctId);assert.deepEqual(result.source,q.source);assert.ok(result.explanation);
    assert.equal(gradeChoice(q,null).correct,false);assert.throws(()=>gradeChoice(q,'other-choice'));
  }
});
test('daily reading windows stay equal while practice accelerates gently with a forgiving recovery floor',()=>{
  assert.equal(timeLimitMs(0),22000);assert.equal(timeLimitMs(1),21800);assert.equal(timeLimitMs(1000),8000);
  assert.equal(timeLimitMs(0,{daily:true}),25000);assert.equal(timeLimitMs(9,{daily:true}),25000);assert.equal(timeLimitMs(1000,{daily:true}),25000);
  assert.equal(timeLimitMs(0,{recovering:true}),14300);assert.equal(timeLimitMs(1000,{recovering:true}),6000);
  assert.equal(timeLimitMs(NaN),22000);
  assert.deepEqual(flightReward(0,0,22000),{points:10,altitudeGain:150});
  for(const count of [0,1,10,1000])for(const remaining of [-1,0,3000,22000,99999]){
    const reward=flightReward(count,remaining,22000);
    assert.ok(reward.points>=10&&reward.points<=30);assert.ok(reward.altitudeGain>=150&&reward.altitudeGain<=500);
  }
});
test('a fresh free flight uses unseen device-history families before repeating the oldest suitable fact',()=>{
  const first=questionFor('prior',0,'common',{seenIds:[],seenFamilies:[]});
  const sameSeedFresh=questionFor('prior',0,'common',{seenIds:[],seenFamilies:[],recentSeenFamilies:[first.familyId]});
  assert.notEqual(sameSeedFresh.familyId,first.familyId);
  assert.equal(sameSeedFresh.difficulty,1);
  const entries=questions.filter(q=>q.type==='common'&&q.difficulty===1);
  const recent=entries.map(q=>q.familyId);
  const oldest=questionFor('next',0,'common',{seenIds:[],seenFamilies:[],recentSeenFamilies:recent});
  assert.equal(oldest.familyId,recent.at(-1),'all entry facts seen: use oldest entry, not a new expert question');
  assert.equal(oldest.difficulty,1);
  const inverse=questionFor('next',0,'rare',{seenIds:[],seenFamilies:[],recentSeenFamilies:[first.familyId]});
  assert.notEqual(inverse.familyId,first.familyId);
});
test('entry-level transfer questions rotate topics and never use compound-interest or binomial drills',()=>{
  for(const mode of ['common','rare','mix']){
    const context={altitude:0,startAltitude:0,seenIds:questions.map(q=>q.id),seenFamilies:questions.map(q=>q.familyId),recentCategories:[],recentPrompts:[]};
    const generated=[];
    for(let index=100;index<125;index++){
      const q=questionFor('entry-transfer',index,mode,context);
      assert.equal(q.difficulty,1);
      assert.ok(!['Wirtschaft & Wachstum','Wahrscheinlichkeit'].includes(q.category));
      if(!['earlier','later'].includes(q.type))assert.equal(context.recentCategories.slice(0,3).includes(q.category),false);
      context.seenIds.push(q.id);context.seenFamilies.push(q.familyId);context.recentCategories.unshift(q.category);context.recentPrompts.unshift(q.prompt);
      generated.push(q);
    }
    assert.ok(new Set(generated.map(q=>q.category)).size>=5);
  }
});
