import test,{after} from 'node:test';
import {loadLocalCatalog} from '../lib/local-catalog-seed.js';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createCatalog} from '../lib/catalog.js';
import {gradeChoice,publicQuestion} from '../lib/engine.js';
import {loadSchoolCatalog} from '../scripts/school-catalog.mjs';
const snapshotText=await readFile(new URL('../content/wikidata/facts.json',import.meta.url),'utf8');
const snapshot=JSON.parse(snapshotText),facts=new Map(snapshot.facts.map(f=>[f.key,f]));
const report=JSON.parse(await readFile(new URL('../content/catalog-report.json',import.meta.url),'utf8'));
const school=new Map((await loadSchoolCatalog()).map(({question})=>[question.id,question]));
const db=new DatabaseSync(':memory:');db.exec('PRAGMA foreign_keys=ON');
for(const name of (await readdir(new URL('../migrations/',import.meta.url))).filter(n=>n.endsWith('.sql')).sort())db.exec(await readFile(new URL('../migrations/'+name,import.meta.url),'utf8'));
await loadLocalCatalog(db);
after(()=>db.close());
const adapter={all:async(sql,args)=>db.prepare(sql).all(...args),run:async(sql,args)=>db.prepare(sql).run(...args)};
const catalog=createCatalog(adapter);

test('the installed large catalog is backed by the recorded official Wikidata snapshot',()=>{
  assert.equal(snapshot.license,'CC0-1.0');assert.match(snapshot.dump.url,/^https:\/\/dumps\.wikimedia\.org\/wikidatawiki\/entities\//);
  assert.match(snapshot.dump.sha256,/^[a-f0-9]{64}$/);assert.ok(snapshot.dump.bytes>=128*1024*1024);
  assert.ok(snapshot.facts.length>=10000);assert.equal(facts.size,snapshot.facts.length);
  assert.equal(createHash('sha256').update(snapshotText).digest('hex'),report.sourceSnapshotSha256);
  const installed=db.prepare('SELECT COUNT(*) AS questions,COUNT(DISTINCT family_id) AS families FROM question_catalog WHERE enabled=1').get();
  assert.equal(installed.questions,report.questions);assert.equal(installed.families,report.families);
  assert.ok(installed.families>=8000,'independent factual questions, not a combinatorial claim');
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM question_catalog WHERE type='general' AND pool='daily' AND json_extract(content_json,'$.basis')='wikidata'").get().n,0,'Wikidata relation questions start in the free pool');
  assert.equal(school.size,585);assert.equal(report.authoredQuestions,585);assert.equal(report.schoolQuestions,360);assert.equal(report.curatedQuestions,225);assert.equal(report.schoolSubjects.length,10);assert.equal(report.curatedSubjects.length,6);
});
test('every imported solution and comparison value traces to its canonical source fact',()=>{
  const mapped=new Map(db.prepare('SELECT fact_key,family_id FROM question_fact_families').all().map(r=>[r.fact_key,r.family_id]));
  const prompts=new Set();
  for(const row of db.prepare('SELECT id,family_id,content_json FROM question_catalog WHERE enabled=1').iterate()){
    const q=JSON.parse(row.content_json);assert.equal(q.id,row.id);assert.equal(q.familyId,row.family_id);
    assert.ok(q.factKeys.length===1||q.factKeys.length===4);
    assert.equal(prompts.has(q.prompt),false);prompts.add(q.prompt);
    for(const key of q.factKeys){assert.ok(['school','curated'].includes(q.basis)?school.has(q.id):facts.has(key),key);assert.equal(mapped.get(key),q.familyId);}
    assert.equal(new Set(q.options.map(o=>o.id)).size,4);assert.equal(new Set(q.options.map(o=>o.label)).size,4);
    const result=gradeChoice(q,q.correctId);assert.equal(result.correct,true);assert.equal(result.options.filter(o=>o.id===q.correctId).length,1);
    if(['school','curated'].includes(q.basis)){
      const authored=school.get(q.id);assert.deepEqual(q,authored);
      assert.equal(q.provenance.kind,q.basis==='school'?'original-school-question':'original-curated-question');assert.ok(q.source.url.startsWith('https://'));assert.ok(q.explanation.length>=40);
    }else if(q.type==='general'){
      const f=facts.get(q.factKeys[0]);assert.equal(q.correctId,'choice-'+f.objectId);assert.equal(result.correctLabel,f.objectLabel);
    }else{
      assert.equal(new Set(q.options.map(o=>o.value)).size,4);
      for(const key of q.factKeys){const f=facts.get(key),option=q.options.find(o=>o.id==='choice-'+f.subjectId);assert.equal(option?.value,f.value);}
      const values=[...q.options].sort((a,b)=>a.value-b.value);
      assert.equal(q.correctId,(['common','later'].includes(q.type)?values.at(-1):values[0]).id);
    }
    const safe=publicQuestion(q,'safe',0);for(const key of ['correctId','provenance','factKeys','source','explanation'])assert.equal(key in safe,false);
    assert.ok(safe.options.every(o=>Object.keys(o).sort().join(',')==='id,label'));
  }
  const activeKeys=new Set(db.prepare('SELECT content_json FROM question_catalog WHERE enabled=1').all().flatMap(r=>JSON.parse(r.content_json).factKeys));assert.equal(activeKeys.size,report.sourceFactsUsed);
  const retired=db.prepare('SELECT COUNT(*) AS n FROM question_catalog WHERE enabled=0').get().n;assert.equal(retired,report.retiredQuestions||0);
});
test('one thousand real imported questions across flights never repeat an exposed fact family',async()=>{
  const device='real-catalog-repeat-test',seen=new Set();
  for(let flight=0;flight<10;flight++){
    const id='real-flight-'+flight;
    db.prepare('INSERT INTO runs(id,device,mode,seed,status,started_at,content_version) VALUES(?,?,?,?,?,?,2)').run(id,device,'mix',id,'ready',Date.now());
    for(let position=0;position<100;position++){
      const level=(flight*100+position)%3+1,altitude=[0,3000,6000][level-1];
      db.prepare('UPDATE runs SET question_index=?,altitude=? WHERE id=?').run(position,altitude,id);
      const row=db.prepare('SELECT * FROM runs WHERE id=?').get(id),q=await catalog.claimFree(row,3);
      assert.ok(q);assert.equal(q.difficulty,level,'real Mix remains within the current height band');assert.equal(seen.has(q.familyId),false);seen.add(q.familyId);
      assert.equal((await catalog.claimFree(row,3)).id,q.id,'retry resumes the same reserved question');
    }
  }
  assert.equal(seen.size,1000);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM seen_questions WHERE device=?').get(device).n,1000);
});
test('a fresh real Mix spans broad areas instead of disguising twenty geography questions as different properties',async()=>{
  const geography=new Set(['Geografie','Erdkunde','Flächen','Meereshöhen','Längen','Bauwerkshöhen']);
  const device='real-mix-topic-balance-123',id='real-mix-topic-flight';
  db.prepare('INSERT INTO runs(id,device,mode,seed,status,started_at,content_version) VALUES(?,?,?,?,?,?,2)').run(id,device,'mix','real-mix-area-seed','ready',Date.now());
  const topics=[],families=new Set();
  for(let position=0;position<20;position++){
    db.prepare('UPDATE runs SET question_index=? WHERE id=?').run(position,id);
    const q=await catalog.claimFree(db.prepare('SELECT * FROM runs WHERE id=?').get(id),1);
    assert.ok(q);assert.equal(families.has(q.familyId),false);families.add(q.familyId);
    assert.equal(q.difficulty,1,'topic variety stays within the easy altitude band');
    topics.push(geography.has(q.category)?'geography':q.category);
  }
  assert.equal(families.size,20);assert.ok(new Set(topics).size>=4);
  assert.ok(topics.filter(topic=>topic==='geography').length<=5,'geography includes country, area, elevation, river and building comparisons together');
  for(let i=1;i<topics.length;i++)assert.ok(!topics.slice(Math.max(0,i-3),i).includes(topics[i]));
});
test('real daily selections stay new across days and remain disjoint from every free question',async()=>{
  const seen=new Set();
  for(let i=0;i<8;i++){
    const date=new Date(Date.UTC(2027,0,1+i)).toISOString().slice(0,10),mode='mix';
    const questions=await catalog.reserveDaily(date,mode);assert.equal(questions.length,10);
    assert.deepEqual(questions.map(q=>q.difficulty),[1,1,1,2,2,2,2,3,3,3],'daily difficulty advances in the fixed three/four/three order');
    assert.ok(new Set(questions.map(q=>q.type)).size>=1,'subject variety does not require every comparison style');
    const categoryCounts=new Map();for(const q of questions)categoryCounts.set(q.category,(categoryCounts.get(q.category)||0)+1);assert.ok(categoryCounts.size>=5);assert.ok([...categoryCounts.values()].every(n=>n<=2));
    for(const q of questions){assert.equal(seen.has(q.familyId),false);seen.add(q.familyId);assert.equal(db.prepare("SELECT COUNT(*) AS n FROM seen_questions WHERE family_id=?").get(q.familyId).n,0,'mixed days never borrow an already exposed free fact');}
    assert.deepEqual(await catalog.reserveDaily(date,mode),questions);
  }
  assert.equal(seen.size,80);
});
test('catalog data batches are bounded and schema blocks regrouped facts and split pools',async()=>{
  const data=await readFile(new URL('../content/catalog-import.jsonl',import.meta.url),'utf8');
  const chunks=data.trim().split('\n');assert.ok(chunks.every(s=>Buffer.byteLength(s)<400000&&JSON.parse(s).rows.length<=50));
  const row=db.prepare('SELECT * FROM question_catalog LIMIT 1').get();
  assert.throws(()=>db.prepare('UPDATE question_fact_families SET family_id=? WHERE family_id=?').run('regrouped',row.family_id));
  assert.throws(()=>db.prepare('UPDATE question_catalog SET pool=? WHERE id=?').run(row.pool==='free'?'daily':'free',row.id));
});
