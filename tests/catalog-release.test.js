import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {applyTestSchema,seedTestCatalog} from './helpers/catalog-fixture.js';
import {installCatalogRelease} from '../lib/catalog-release.js';
import {loadSchoolCatalog} from '../scripts/school-catalog.mjs';

const data=(await readFile(new URL('../content/catalog-import.jsonl',import.meta.url),'utf8')).trim().split('\n').map(JSON.parse);
const batches=data.map(batch=>({...batch,rows:batch.rows.filter(row=>batch.table==='question_fact_families'?(row.fact_key.startsWith('school:')||row.fact_key.startsWith('curated:')):batch.table==='question_catalog'?(row.id.startsWith('school-')||row.id.startsWith('curated-')):batch.table==='question_family_aliases'?(row.family_id.startsWith('school:')||row.family_id.startsWith('curated:')):batch.table==='question_catalog_meta')})).filter(batch=>batch.rows.length);
const release={id:batches.find(b=>b.table==='question_catalog_meta').rows.find(r=>r.key==='version').value,batches};
function fixture(){
  const sqlite=new DatabaseSync(':memory:');applyTestSchema(sqlite);seedTestCatalog(sqlite,{freeFamilies:4,dailyFamilies:10});
  const db={all:async(sql,args)=>sqlite.prepare(sql).all(...args),run:async(sql,args)=>sqlite.prepare(sql).run(...args),batch:async statements=>{
    sqlite.exec('BEGIN');
    try{const results=statements.map(({sql,params})=>sqlite.prepare(sql).run(...params));sqlite.exec('COMMIT');return results;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  return {sqlite,db};
}

test('editorial release installs 585 real school and culture questions without rewriting player state or old daily sets',async()=>{
  const {sqlite,db}=fixture();
  try{
    sqlite.prepare('INSERT INTO runs(id,device,mode,seed,status,started_at) VALUES(?,?,?,?,?,?)').run('old-flight','old-player-123456789','mix','old','ready',1);
    sqlite.prepare('INSERT INTO daily_challenges(day,mode,questions_json,created_at) VALUES(?,?,?,?)').run('2026-11-20','earlier','[]',1);
    sqlite.prepare('INSERT INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position) VALUES(?,?,?,?,?,?)').run('old-player-123456789','mss-general-inflation','mss-general-inflation',1,'old-flight',0);
    const before=sqlite.prepare('SELECT * FROM runs').all(),count=sqlite.prepare('SELECT COUNT(*) AS n FROM question_catalog').get().n;
    assert.equal((await installCatalogRelease(db,release)).skipped,false);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM question_catalog').get().n,count+585);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_catalog WHERE json_extract(content_json,'$.basis')='school'").get().n,360);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_catalog WHERE id LIKE 'curated-%'").get().n,225);
    assert.deepEqual(sqlite.prepare('SELECT * FROM runs').all(),before);
    assert.equal(sqlite.prepare('SELECT questions_json FROM daily_challenges').get().questions_json,'[]');
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM seen_questions').get().n,1);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_family_aliases WHERE alias_family_id='mss-general-inflation' AND family_id='school:wirtschaft-inflation-grundidee'").get().n,1);
    assert.equal(sqlite.prepare("SELECT value FROM question_catalog_meta WHERE key='schoolRelease'").get().value,release.id);
    assert.equal((await installCatalogRelease({...db,batch:()=>{throw Error('an installed release must not import twice');}},release)).skipped,true);
  }finally{sqlite.close();}
});

test('a failed school data batch leaves the completion marker absent and retries idempotently',async()=>{
  const {sqlite,db}=fixture();let number=0;
  try{
    await assert.rejects(installCatalogRelease({...db,batch:statements=>{if(++number===3)throw Error('simulated interruption');return db.batch(statements);}},release),/simulated interruption/);
    assert.equal(sqlite.prepare("SELECT value FROM question_catalog_meta WHERE key='schoolRelease'").get(),undefined);
    await installCatalogRelease(db,release);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_catalog WHERE id LIKE 'school-%'").get().n,360);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_fact_families WHERE fact_key LIKE 'school:%'").get().n,360);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_catalog WHERE id LIKE 'curated-%'").get().n,225);
  }finally{sqlite.close();}
});

test('expanding the published school bank preserves old questions, pool identities and exposure claims',async()=>{
  const {sqlite,db}=fixture();
  try{
    const oldIds=new Set((await Promise.all(['school-stem.json','school-nature.json','school-humanities.json'].map(file=>readFile(new URL('../content/'+file,import.meta.url),'utf8').then(JSON.parse)))).flat().map(q=>'school-'+q.id));
    const oldFamilies=new Set([...oldIds].map(id=>'school:'+id.slice('school-'.length)));
    const oldBatches=batches.map(batch=>({...batch,rows:batch.rows.filter(row=>batch.table==='question_catalog'?oldIds.has(row.id):batch.table==='question_fact_families'||batch.table==='question_family_aliases'?oldFamilies.has(row.family_id):false)})).filter(batch=>batch.rows.length);
    await installCatalogRelease(db,{id:'previous-published-school-bank',batches:oldBatches});
    const before=sqlite.prepare("SELECT id,family_id,pool,content_json FROM question_catalog WHERE id LIKE 'school-%' ORDER BY id").all();
    assert.equal(before.length,270);
    const first=before[0];
    sqlite.prepare('INSERT INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position) VALUES(?,?,?,?,?,?)').run('returning-player-1234567',first.family_id,first.id,1,'old-lesson',0);
    await installCatalogRelease(db,release);
    for(const row of before)assert.deepEqual(sqlite.prepare('SELECT id,family_id,pool,content_json FROM question_catalog WHERE id=?').get(row.id),row);
    assert.equal(sqlite.prepare('SELECT family_id FROM seen_questions WHERE device=?').get('returning-player-1234567').family_id,first.family_id);
    assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM question_catalog WHERE id LIKE 'school-%' OR id LIKE 'curated-%'").get().n,585);
  }finally{sqlite.close();}
});

test('school and culture curriculum has balanced difficulty bands and stable identities with exactly one authored solution',async()=>{
  const entries=await loadSchoolCatalog(),subjects=new Map(),positions=new Set();
  assert.equal(entries.length,585);assert.equal(new Set(entries.map(q=>q.question.familyId)).size,585);assert.equal(entries.filter(e=>e.question.basis==='school').length,360);assert.equal(entries.filter(e=>e.question.basis==='curated').length,225);
  for(const {question:q,pool} of entries){
    if(!subjects.has(q.category))subjects.set(q.category,[0,0,0]);subjects.get(q.category)[q.difficulty-1]++;
    assert.ok(['free','daily'].includes(pool));assert.equal(q.options.filter(o=>o.id===q.correctId).length,1);
    assert.equal(q.options.find(o=>o.id===q.correctId).value,0);positions.add(q.options.findIndex(o=>o.id===q.correctId));
  }
  assert.equal(subjects.size,16);assert.deepEqual(entries.reduce((counts,{question:q})=>{counts[q.difficulty-1]++;return counts;},[0,0,0]),[195,195,195]);for(const counts of subjects.values())assert.ok(counts.every(n=>n>=10));
  assert.equal(positions.size,4,'correct answers are not always in the same position');
});
