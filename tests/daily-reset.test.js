import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createAPI} from '../lib/api.js';
import {createCatalog} from '../lib/catalog.js';
import {applyTestSchema,seedTestCatalog} from './helpers/catalog-fixture.js';

test('the authorized replacement gives everyone one fresh mixed attempt today while retaining old flights',async()=>{
  const realNow=Date.now;Date.now=()=>Date.parse('2026-11-25T12:00:00Z');
  const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');applyTestSchema(db);seedTestCatalog(db);
  const adapter={all:async(sql,params)=>db.prepare(sql).all(...params),run:async(sql,params)=>db.prepare(sql).run(...params)};
  let api=createAPI(adapter);const catalog=createCatalog(adapter),date='2026-11-25',device='replacement-completed-player-123',peer='replacement-active-player-123';
  async function call(path,body,who=device){
    const response=await api(new Request('https://game.test/api/'+path+(!body?(path.includes('?')?'&':'?')+'device='+who:''),body?{method:'POST',body:JSON.stringify({device:who,...body})}:{}));
    const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));return data;
  }
  try{
    const old=(await catalog.reserveDaily(date,'earlier')).map(q=>({...q,_limitMs:25000})),oldJson=JSON.stringify(old);
    db.prepare('INSERT INTO daily_challenges(day,mode,questions_json,created_at) VALUES(?,?,?,?)').run(date,'earlier',oldJson,1);
    db.prepare(`INSERT INTO runs(id,device,mode,seed,status,question_index,score,altitude,started_at,finished_at,flight_kind,day,start_altitude,peak_altitude,correct_total,content_version,competition_version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('original-completed',device,'earlier',date,'finished',10,9999,99999,1,2,'daily',date,1500,99999,10,2,3);
    for(let i=0;i<10;i++)db.prepare('INSERT INTO answers(run_id,position,question_id,result,received_at) VALUES(?,?,?,?,?)').run('original-completed',i,old[i].id,JSON.stringify({familyId:old[i].familyId,questionId:old[i].id,correct:true,streak:i+1,timeLimitMs:25000}),2+i);
    db.prepare(`INSERT INTO runs(id,device,mode,seed,status,deadline,question_json,score,altitude,started_at,flight_kind,day,start_altitude,peak_altitude,content_version,competition_version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('original-active',peer,'earlier',date,'flying',Date.now()+25000,JSON.stringify(old[0]),17,1800,1,'daily',date,1500,1800,2,3);
    const frozen=db.prepare("SELECT * FROM runs WHERE id='original-active'").get();
    const info=await call('daily');assert.equal(info.refreshed,true);assert.equal(info.dailyRevision,1);assert.equal(info.mode,'mix');assert.equal(info.available,true);assert.equal(info.attempt,null);
    assert.equal((await call('leaderboard')).totalFinished,0,'old scores never compete against different questions');
    const [a,retry]=await Promise.all([call('start',{mode:'daily'}),call('start',{mode:'daily'})]);
    assert.equal(a.id,retry.id);assert.notEqual(a.id,'original-completed');assert.equal(a.dailyRevision,1);assert.equal(a.score,0);assert.equal(a.altitude,1500);
    const b=await call('start',{mode:'daily'},peer);assert.notEqual(b.id,'original-active');
    const archived=await call('run?id=original-active',undefined,peer);assert.equal(archived.dailySuperseded,true);assert.equal(archived.question,null);assert.equal(archived.deadline,null);
    assert.equal((await call('next',{runId:'original-active'},peer)).dailySuperseded,true);
    const late=await call('answer',{runId:'original-active',questionIndex:0,questionId:old[0].id,choiceId:old[0].correctId},peer);
    assert.equal(late.dailySuperseded,true);assert.equal('result'in late,false);
    assert.deepEqual(db.prepare("SELECT * FROM runs WHERE id='original-active'").get(),frozen);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM answers WHERE run_id='original-active'").get().n,0);
    const families=new Set(),types=new Set(),topics=new Set();let own,other;
    for(let i=0;i<10;i++){
      const x=await call('next',{runId:a.id}),y=await call('next',{runId:b.id},peer);assert.deepEqual(x.question,y.question);
      const q=JSON.parse(db.prepare('SELECT question_json FROM runs WHERE id=?').get(a.id).question_json);
      assert.equal(old.some(o=>o.familyId===q.familyId),false);assert.equal(families.has(q.familyId),false);families.add(q.familyId);types.add(q.type);topics.add(q.category);
      own=await call('answer',{runId:a.id,questionIndex:i,questionId:q.id,choiceId:q.correctId});
      other=await call('answer',{runId:b.id,questionIndex:i,questionId:q.id,choiceId:q.options.find(o=>o.id!==q.correctId).id},peer);
    }
    assert.equal(own.status,'finished');assert.equal(other.status,'finished');assert.equal(own.index,10);
    assert.deepEqual([...types].sort(),['common','earlier','general','later','rare']);assert.ok(topics.size>=5);
    const board=await call('leaderboard');assert.equal(board.totalFinished,2);assert.equal(board.own.rank,1);assert.ok(board.entries.every(e=>e.altitude<99999));
    api=createAPI(adapter);assert.equal((await call('start',{mode:'daily'})).id,a.id,'a reload or deployment never resets the replacement again');
    const history=await call('history');assert.ok(history.flights.some(f=>f.id==='original-completed'&&f.dailySuperseded&&f.altitude===99999&&f.dailyDate===date));
    const peerHistory=await call('history',undefined,peer);assert.ok(peerHistory.flights.some(f=>f.id==='original-active'&&f.dailySuperseded&&f.score===17));
    assert.equal(db.prepare('SELECT questions_json FROM daily_challenges WHERE day=?').get(date).questions_json,oldJson);
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM daily_challenge_revisions WHERE day=?').get(date).n,1);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM answers WHERE run_id='original-completed'").get().n,10);
    Date.now=()=>Date.parse('2026-11-26T12:00:00Z');const tomorrow=await call('daily');assert.equal(tomorrow.dailyRevision,0);assert.equal(tomorrow.refreshed,false);
    const normal=await call('start',{mode:'daily'});assert.notEqual(normal.id,a.id);assert.equal(normal.dailyRevision,0);assert.equal((await call('start',{mode:'daily'})).id,normal.id);
  }finally{Date.now=realNow;db.close();}
});
