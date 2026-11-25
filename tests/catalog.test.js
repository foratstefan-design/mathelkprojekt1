import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCatalog,CatalogPoolExhaustedError} from '../lib/catalog.js';
import {createAPI} from '../lib/api.js';
import {applyTestSchema,seedTestCatalog} from './helpers/catalog-fixture.js';

function fixture(options={}){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');applyTestSchema(sqlite);
  if(options.seed!==false)seedTestCatalog(sqlite,options);
  const adapter={all:async(sql,params)=>sqlite.prepare(sql).all(...params),run:async(sql,params)=>sqlite.prepare(sql).run(...params)};
  const catalog=createCatalog(adapter),api=createAPI(adapter),device='catalog-device-123456789';
  return {sqlite,catalog,device,run(id,mode='common',asDevice=device){
    sqlite.prepare("INSERT INTO runs(id,device,mode,seed,status,started_at,content_version) VALUES(?,?,?,?, 'ready', ?,2)").run(id,asDevice,mode,'same-deterministic-seed',Date.now());
    return sqlite.prepare('SELECT * FROM runs WHERE id=?').get(id);
  },async call(path,body,asDevice=device){
    const response=await api(new Request('https://catalog.test/api/'+path+(!body?(path.includes('?')?'&':'?')+'device='+asDevice:''),body?{method:'POST',body:JSON.stringify({device:asDevice,...body})}:{}));
    return {httpStatus:response.status,...await response.json()};
  }};
}

function insertHistory(f,count,target){
  const run=f.run('historical-run');
  const statement=f.sqlite.prepare('INSERT INTO answers(run_id,position,question_id,result,received_at) VALUES(?,?,?,?,?)');
  for(let i=0;i<count;i++)statement.run(run.id,i,'old-question-'+i,JSON.stringify({familyId:i===0?target:'historical-unrelated-'+i}),i+1);
  f.sqlite.prepare("UPDATE runs SET status='crashed',question_index=?,finished_at=? WHERE id=?").run(count,Date.now(),run.id);
}

test('arming consumes a family permanently even when the flight is abandoned; inverse modes cannot replay it',async()=>{
  const f=fixture({freeFamilies:8});
  try{
    const a=f.run('abandoned-a'),first=await f.catalog.claimFree(a,1);
    assert.ok(first);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE device=?').get(f.device).n,1);
    assert.deepEqual(await f.catalog.claimFree(a,1),first,'retry of the same position recovers its reservation');
    const b=f.run('abandoned-b'),next=await f.catalog.claimFree(b,1);
    assert.notEqual(next.familyId,first.familyId);
    const c=f.run('inverse-c','rare'),inverse=await f.catalog.claimFree(c,1);
    assert.notEqual(inverse.familyId,first.familyId);assert.notEqual(inverse.familyId,next.familyId);
    const peer=f.run('separate-device','common','another-catalog-device-123');
    assert.equal((await f.catalog.claimFree(peer,1)).familyId,first.familyId,'separate devices retain separate histories');
  }finally{f.sqlite.close();}
});

test('parallel next requests reserve one family per position and two separate runs never consume the same family',async()=>{
  const f=fixture({freeFamilies:8});
  try{
    const a=await f.call('start',{mode:'common'});
    const [one,two]=await Promise.all([f.call('next',{runId:a.id}),f.call('next',{runId:a.id})]);
    assert.equal(one.status,'flying');assert.deepEqual(one.question,two.question);assert.equal(one.deadline,two.deadline);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE run_id=?').get(a.id).n,1);
    const b=await f.call('start',{mode:'common'}),c=await f.call('start',{mode:'common'});
    const [left,right]=await Promise.all([f.call('next',{runId:b.id}),f.call('next',{runId:c.id})]);
    assert.notEqual(left.question.familyId,right.question.familyId);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE device=?').get(f.device).n,3);
  }finally{f.sqlite.close();}
});

test('complete historical exposure beyond 200 answers excludes old facts and every mapped inverse family',async()=>{
  const f=fixture({freeFamilies:4});
  try{
    const targets=f.sqlite.prepare("SELECT DISTINCT family_id FROM question_catalog WHERE pool='free' AND type='common' ORDER BY family_id LIMIT 2").all();
    f.sqlite.prepare('INSERT INTO question_family_aliases(alias_family_id,family_id) VALUES(?,?)').run('old-comparison-with-four-facts',targets[0].family_id);
    f.sqlite.prepare('INSERT INTO question_family_aliases(alias_family_id,family_id) VALUES(?,?)').run('old-comparison-with-four-facts',targets[1].family_id);
    insertHistory(f,225,'old-comparison-with-four-facts');
    await f.catalog.backfillDevice(f.device);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE device=?').get(f.device).n,225);
    f.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE pool='free' AND family_id NOT IN (?,?)").run(targets[0].family_id,targets[1].family_id);
    assert.equal(await f.catalog.claimFree(f.run('new-after-long-history'),1),null);
    assert.equal(await f.catalog.claimFree(f.run('inverse-after-long-history','rare'),1),null);
    const other=f.run('new-device','common','different-catalog-device-123');
    assert.ok(await f.catalog.claimFree(other,1));
    assert.equal((await f.catalog.stats(f.device)).remainingFreeFamilies,0);
  }finally{f.sqlite.close();}
});

test('legacy armed snapshots are recorded before another flight can expose the same fact',async()=>{
  const f=fixture({freeFamilies:3});
  try{
    const row=f.sqlite.prepare("SELECT * FROM question_catalog WHERE pool='free' AND type='common' LIMIT 1").get();
    const question=JSON.parse(row.content_json),old=f.run('armed-before-upgrade');
    f.sqlite.prepare("UPDATE runs SET status='flying',question_json=?,deadline=? WHERE id=?").run(JSON.stringify({...question,_limitMs:22000}),Date.now()+22000,old.id);
    const resumed=await f.call('run?id='+old.id);
    assert.equal(resumed.question.id,question.id);
    f.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE pool='free' AND family_id<>?").run(question.familyId);
    const fresh=await f.call('start',{mode:'common'}),next=await f.call('next',{runId:fresh.id});
    assert.equal(next.status,'exhausted');assert.equal(next.poolExhausted,true);assert.equal(next.altitude,0);assert.equal(next.crashReason,null);
    assert.equal((await f.call('run?id='+old.id)).question.id,question.id,'resume is the same active question, not a new exposure');
  }finally{f.sqlite.close();}
});

test('exhausted free courses end visibly without a crash, known question, or generated clone',async()=>{
  const f=fixture({freeFamilies:2});
  try{
    const families=new Set();
    for(let i=0;i<2;i++){
      const run=await f.call('start',{mode:'common'}),armed=await f.call('next',{runId:run.id});
      assert.equal(armed.status,'flying');families.add(armed.question.familyId);
    }
    assert.equal(families.size,2);
    const fresh=await f.call('start',{mode:'common'}),ended=await f.call('next',{runId:fresh.id});
    assert.equal(ended.httpStatus,200);assert.equal(ended.status,'exhausted');assert.equal(ended.poolExhausted,true);assert.equal(ended.question,null);assert.equal(ended.deadline,null);
    assert.equal((await f.call('next',{runId:fresh.id})).status,'exhausted');
    const history=await f.call('history');assert.ok(history.flights.some(item=>item.id===fresh.id&&item.status==='exhausted'));
    const stats=await f.call('stats');assert.equal(stats.exhausted,1);assert.equal(stats.crashes,0);
  }finally{f.sqlite.close();}
});

test('daily reservations never repeat across days or inverse modes and exhaustion reserves no partial day',async()=>{
  const f=fixture({dailyFamilies:30});
  try{
    const first=await f.catalog.reserveDaily('2026-11-19','rare');
    const second=await f.catalog.reserveDaily('2026-11-20','common');
    assert.equal(first.length,10);assert.equal(second.length,10);
    assert.deepEqual(first.map(q=>q.difficulty),[1,1,1,1,1,1,1,1,2,2]);
    const used=new Set(first.map(q=>q.familyId));assert.ok(second.every(q=>!used.has(q.familyId)));
    const count=f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n;
    assert.equal(count,20);
    assert.equal(await f.catalog.dailyAvailable('2026-11-23','rare'),true);
    const third=await f.catalog.reserveDaily('2026-11-23','rare');
    assert.equal(third.length,10);assert.ok(third.every(q=>!used.has(q.familyId)&&!second.some(other=>other.familyId===q.familyId)));
    assert.equal(await f.catalog.dailyAvailable('2026-11-24','common'),false);
    await assert.rejects(()=>f.catalog.reserveDaily('2026-11-24','common'),CatalogPoolExhaustedError);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,count+10,'insufficient pool consumes no partial day');
  }finally{f.sqlite.close();}
});

test('a crash between daily reservation and snapshot freeze recovers the exact previously reserved set',async()=>{
  const f=fixture({dailyFamilies:14});
  try{
    const first=await f.catalog.reserveDaily('2026-11-19','rare');
    assert.equal(await f.catalog.dailyAvailable('2026-11-19','rare'),true);
    assert.deepEqual(await f.catalog.reserveDaily('2026-11-19','rare'),first);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM daily_question_slots WHERE day='2026-11-19'").get().n,10);
  }finally{f.sqlite.close();}
});

test('simultaneous daily starts freeze one shared set and its permanently reserved facts stay outside free games',async()=>{
  const f=fixture({freeFamilies:5,dailyFamilies:30});
  try{
    const peer='catalog-daily-peer-1234567';
    const [a,b]=await Promise.all([f.call('start',{mode:'daily'}),f.call('start',{mode:'daily'},peer)]);
    const [qa,qb]=await Promise.all([f.call('next',{runId:a.id}),f.call('next',{runId:b.id},peer)]);
    assert.deepEqual(qa.question,qb.question);assert.equal(qa.timeLimitMs,qb.timeLimitMs);
    const dailyFamily=qa.question.familyId;
    assert.equal(f.sqlite.prepare('SELECT (SELECT COUNT(*) FROM daily_challenges)+(SELECT COUNT(*) FROM daily_challenge_revisions) AS n').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,10);
    const free=await f.call('start',{mode:'mix'}),question=await f.call('next',{runId:free.id});
    assert.notEqual(question.question.familyId,dailyFamily);
    assert.equal(f.sqlite.prepare('SELECT pool FROM question_catalog WHERE id=?').get(question.question.id).pool,'free');
  }finally{f.sqlite.close();}
});

test('an empty daily catalog consumes no attempt and reports an explicit safe exhaustion error',async()=>{
  const f=fixture({seed:false});
  try{
    const info=await f.call('daily');assert.equal(info.available,false);assert.equal(info.poolExhausted,true);assert.equal(info.attempt,null);
    const start=await f.call('start',{mode:'daily'});assert.equal(start.httpStatus,409);assert.equal(start.code,'QUESTION_POOL_EXHAUSTED');assert.equal(start.poolExhausted,true);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM runs').get().n,0);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,0);
    const stats=await f.call('catalog');assert.equal(stats.questions,0);assert.equal(stats.families,0);
    assert.equal('content_json' in stats,false);assert.equal('question' in stats,false);
  }finally{f.sqlite.close();}
});

test('the mixed day spans topics and all question styles, and quarantines borrowed knowledge from free games',async()=>{
  const f=fixture({freeFamilies:40,dailyFamilies:40});
  try{
    const day=await f.catalog.reserveDaily('2027-02-01','mix');
    assert.equal(day.length,10);assert.equal(new Set(day.map(q=>q.familyId)).size,10);
    assert.deepEqual([...new Set(day.map(q=>q.type))].sort(),['common','earlier','general','later','rare']);
    assert.equal(day.filter(q=>q.type==='general').length,4);
    const counts=new Map();for(const q of day)counts.set(q.category,(counts.get(q.category)||0)+1);
    assert.ok(counts.size>=5);assert.ok([...counts.values()].every(n=>n<=2));
    assert.ok(day.every(q=>q.difficulty<=2));
    assert.deepEqual(await f.catalog.reserveDaily('2027-02-01','mix'),day);
    const second=await f.catalog.reserveDaily('2027-02-02','mix');
    assert.ok(second.every(q=>!day.some(old=>old.familyId===q.familyId)));
    f.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE family_id NOT IN (SELECT family_id FROM daily_question_slots)").run();
    assert.equal(await f.catalog.claimFree(f.run('free-after-mixed'),1),null,'daily knowledge stays unavailable even for another device');
  }finally{f.sqlite.close();}
});

test('mixed days exclude historical exposure from every device, including legacy aliases',async()=>{
  const f=fixture({freeFamilies:30,dailyFamilies:30});
  try{
    const family=f.sqlite.prepare("SELECT family_id FROM question_catalog WHERE pool='free' AND type='general' AND difficulty=1 LIMIT 1").get().family_id;
    f.sqlite.prepare('INSERT INTO question_family_aliases(alias_family_id,family_id) VALUES(?,?)').run('historical-author-question',family);
    insertHistory(f,225,'historical-author-question');
    const day=await f.catalog.reserveDaily('2027-03-01','mix');
    assert.equal(day.some(q=>q.familyId===family),false);
    assert.equal(f.sqlite.prepare("SELECT COUNT(*) AS n FROM seen_questions WHERE family_id='historical-author-question'").get().n,1);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,10);
  }finally{f.sqlite.close();}
});

test('an advertised mixed day requires knowledge, number and time questions from several topics',async()=>{
  for(const shortage of ['time','topics']){
    const f=fixture({freeFamilies:30,dailyFamilies:30});
    try{
      if(shortage==='time')f.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE type IN ('earlier','later')").run();
      else f.sqlite.prepare("UPDATE question_catalog SET category='Only one topic'").run();
      assert.equal(await f.catalog.dailyAvailable('2027-03-03','mix'),false);
      await assert.rejects(()=>f.catalog.reserveDaily('2027-03-03','mix'),CatalogPoolExhaustedError);
      assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,0);
    }finally{f.sqlite.close();}
  }
});

test('a free exposure racing the mixed-day insert invalidates the whole plan and safely retries',async()=>{
  const f=fixture({freeFamilies:30,dailyFamilies:30});
  try{
    const run=f.run('racing-free'),injected=[];
    const catalog=createCatalog({all:async(sql,params)=>f.sqlite.prepare(sql).all(...params),run:async(sql,params)=>{
      if(sql.includes('WITH chosen(position,family_id,question_id,content_json)')&&!injected.length){
        for(let i=0;i<params.length-1;i+=4){
          const q=JSON.parse(params[i+3]);if(q.type!=='general')continue;
          f.sqlite.prepare('INSERT INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position) VALUES(?,?,?,?,?,?)').run(f.device,q.familyId,q.id,Date.now(),run.id,0);injected.push(q.familyId);break;
        }
      }
      return f.sqlite.prepare(sql).run(...params);
    }});
    const questions=await catalog.reserveDaily('2027-03-02','mix');
    assert.equal(injected.length,1);assert.equal(questions.length,10);
    assert.ok(questions.every(q=>q.familyId!==injected[0]));
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,10);
  }finally{f.sqlite.close();}
});

test('catalog constraints reject moving a fact or family and inconsistent stored question content',()=>{
  const f=fixture({freeFamilies:1,dailyFamilies:12});
  try{
    const row=f.sqlite.prepare("SELECT * FROM question_catalog WHERE pool='free' LIMIT 1").get();
    const content=JSON.parse(row.content_json);
    assert.throws(()=>f.sqlite.prepare('UPDATE question_fact_families SET family_id=? WHERE family_id=?').run('changed',row.family_id),/immutable/);
    assert.throws(()=>f.sqlite.prepare('UPDATE question_catalog SET pool=? WHERE id=?').run('daily',row.id),/immutable/);
    assert.throws(()=>f.sqlite.prepare('UPDATE question_catalog SET content_json=? WHERE id=?').run(JSON.stringify({...content,familyId:'wrong'}),row.id),/constraint|CHECK/i);
    assert.throws(()=>f.sqlite.prepare('UPDATE question_catalog SET content_json=? WHERE id=?').run(JSON.stringify({...content,factKeys:['unregistered-fact']}),row.id),/fact.*family/i);
  }finally{f.sqlite.close();}
});

test('catalog edits after arming never change the visible question or the grading snapshot',async()=>{
  const f=fixture({freeFamilies:4});
  try{
    const started=await f.call('start',{mode:'common'}),armed=await f.call('next',{runId:started.id});
    const full=JSON.parse(f.sqlite.prepare('SELECT question_json FROM runs WHERE id=?').get(armed.id).question_json);
    const changed={...full,prompt:'Eine später redigierte Katalogfrage.',correctId:full.options.find(o=>o.id!==full.correctId).id};
    f.sqlite.prepare('UPDATE question_catalog SET content_json=? WHERE id=?').run(JSON.stringify(changed),full.id);
    const resumed=await f.call('run?id='+armed.id);assert.equal(resumed.question.prompt,full.prompt);assert.equal(resumed.deadline,armed.deadline);
    const answered=await f.call('answer',{runId:armed.id,questionId:full.id,questionIndex:armed.index,choiceId:full.correctId});
    assert.equal(answered.result.correct,true);assert.equal(answered.result.correctId,full.correctId);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE run_id=?').get(armed.id).n,1);
  }finally{f.sqlite.close();}
});

test('daily availability uses all remaining gentle questions when entry or intermediate slots are scarce',async()=>{
  const f=fixture({dailyFamilies:30});
  try{
    // Keep only three introductory families and the seven intermediate ones.
    f.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE pool='daily' AND type IN ('common','rare') AND difficulty=1 AND family_id NOT IN ('fixture:daily:quantity:0','fixture:daily:quantity:1','fixture:daily:quantity:2')").run();
    assert.equal(await f.catalog.dailyAvailable('2026-11-19','rare'),true);
    const day=await f.catalog.reserveDaily('2026-11-19','rare');
    assert.deepEqual(day.map(q=>q.difficulty),[1,1,1,2,2,2,2,2,2,2]);
    assert.equal(new Set(day.map(q=>q.familyId)).size,10);
    assert.deepEqual(await f.catalog.reserveDaily('2026-11-19','rare'),day);
  }finally{f.sqlite.close();}
  const entryOnly=fixture({dailyFamilies:14});
  try{
    entryOnly.sqlite.prepare("UPDATE question_catalog SET enabled=0 WHERE pool='daily' AND difficulty=2").run();
    assert.equal(await entryOnly.catalog.dailyAvailable('2026-11-19','rare'),true);
    assert.ok((await entryOnly.catalog.reserveDaily('2026-11-19','rare')).every(q=>q.difficulty===1));
  }finally{entryOnly.sqlite.close();}
});
test('daily shortage never falls back to expert difficulty or reserves a partial set',async()=>{
  const f=fixture({dailyFamilies:12});
  try{
    f.sqlite.prepare("UPDATE question_catalog SET difficulty=3,content_json=json_set(content_json,'$.difficulty',3) WHERE pool='daily' AND difficulty=2").run();
    assert.equal(await f.catalog.dailyAvailable('2026-11-19','rare'),false);
    await assert.rejects(()=>f.catalog.reserveDaily('2026-11-19','rare'),CatalogPoolExhaustedError);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM daily_question_slots').get().n,0);
  }finally{f.sqlite.close();}
});
