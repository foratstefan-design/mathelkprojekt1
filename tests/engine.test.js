import test from 'node:test';
import assert from 'node:assert/strict';
import {questions} from '../lib/questions.js';
import {modes,questionFor,publicQuestion,gradeChoice,timeLimitMs,flightReward,difficultyFor,dailyModeFor,dailyQuestionFor,QuestionPoolExhaustedError} from '../lib/engine.js';

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
    assert.deepEqual(plan.map(q=>q.difficulty),[1,1,1,2,2,2,2,3,3,3]);
    assert.deepEqual(plan,Array.from({length:10},(_,i)=>dailyQuestionFor(date,i)));
  }
  assert.notDeepEqual(Array.from({length:10},(_,i)=>dailyQuestionFor('2026-11-19',i).id),Array.from({length:10},(_,i)=>dailyQuestionFor('2026-11-23',i).id));
  for(const index of [-1,.5,10,NaN])assert.throws(()=>dailyQuestionFor('2026-11-19',index));
});
test('free difficulty rises gently and an exhausted entry pool never becomes expert trivia',()=>{
  assert.equal(difficultyFor(20000,0,15),1);
  assert.equal(difficultyFor(5999,0,16),1);assert.equal(difficultyFor(6000,0,16),2);
  assert.equal(difficultyFor(20000,0,31),2);assert.equal(difficultyFor(14000,0,32),3);
  const seen=questions.filter(q=>q.type==='common'&&q.difficulty===1);
  assert.throws(()=>questionFor('facts-first',20,'common',{altitude:0,seenFamilies:seen.map(q=>q.familyId)}),QuestionPoolExhaustedError);
});
test('all modes exhaust finite factual families without recycling or generated number clones',()=>{
  for(const mode of modes.map(m=>m.id)){
    const context={altitude:20000,startAltitude:0,seenIds:[],seenFamilies:[]};
    const eligible=questions.filter(q=>['mix','daily'].includes(mode)||q.type===mode);
    const expected=new Set(eligible.map(q=>q.familyId)).size;
    for(let position=0;position<expected;position++){
      const q=questionFor('finite',32+position,mode,context);
      assert.ok(questions.some(item=>item.id===q.id));
      assert.equal(context.seenFamilies.includes(q.familyId),false);
      assert.equal(gradeChoice(q,q.correctId).correct,true);
      context.seenIds.push(q.id);context.seenFamilies.push(q.familyId);
    }
    assert.equal(context.seenFamilies.length,expected);
    assert.throws(()=>questionFor('finite',32+expected,mode,context),QuestionPoolExhaustedError);
  }
});
test('past flights and reversed comparisons remain excluded rather than reusing the oldest fact',()=>{
  const first=questionFor('first',0,'common',{seenIds:[],seenFamilies:[]});
  const next=questionFor('first',0,'common',{seenIds:[],seenFamilies:[],recentSeenFamilies:[first.familyId]});
  assert.notEqual(first.familyId,next.familyId);
  const inverse=questionFor('inverse',0,'rare',{recentSeenFamilies:[first.familyId]});
  assert.notEqual(first.familyId,inverse.familyId);
  const allEntries=questions.filter(q=>q.type==='common'&&q.difficulty===1).map(q=>q.familyId);
  assert.throws(()=>questionFor('all-seen',0,'common',{recentSeenFamilies:allEntries}),QuestionPoolExhaustedError);
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
