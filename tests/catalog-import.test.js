import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createCatalogImport,applyCatalogBatch} from '../lib/catalog-import.js';
import {applyTestSchema} from './helpers/catalog-fixture.js';

const TOKEN='test-only-catalog-import-token-0123456789';
const mapping=(id='Q1',family='wd:'+id+':P17:staat')=>({fact_key:'wd:'+id+':P17:staat',family_id:family});
function fixture(){
  const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');applyTestSchema(sqlite);
  const db={batch:async entries=>{
    sqlite.exec('BEGIN IMMEDIATE');
    try{const results=entries.map(({sql,params})=>sqlite.prepare(sql).run(...params));sqlite.exec('COMMIT');return results;}
    catch(error){sqlite.exec('ROLLBACK');throw error;}
  }};
  const importer=createCatalogImport(db,{token:TOKEN});
  return {sqlite,db,importer,async call(payload,{token=TOKEN,method='POST',headers={},raw}={}){
    const response=await importer(new Request('https://game.test/api/admin/catalog/import',{method,headers:{Authorization:'Bearer '+token,'Content-Type':'application/json',...headers},...(!['GET','HEAD'].includes(method)?{body:raw??JSON.stringify(payload)}:{})}));
    return {status:response.status,body:await response.json(),headers:response.headers};
  }};
}
function catalogRow(){
  const q={id:'wd-test-general',familyId:'wd:Q1:P17:staat',type:'general',difficulty:1,prompt:'In welchem Land liegt der Testort?',factKeys:['wd:Q1:P17:staat'],options:[1,2,3,4].map(i=>({id:'choice-Q'+i,label:'Land '+i})),correctId:'choice-Q1'};
  return {id:q.id,family_id:q.familyId,type:q.type,difficulty:q.difficulty,category:'Geografie',prompt_fingerprint:'a'.repeat(64),content_json:JSON.stringify(q),selection_key:123,pool:'free',enabled:1};
}
test('the administrative importer is disabled by default and authenticates before parsing',async()=>{
  const disabled=await createCatalogImport({})(new Request('https://game.test/api/admin/catalog/import',{method:'POST',body:'not json'}));
  assert.equal(disabled.status,404);
  const f=fixture();try{
    assert.equal((await f.call(null,{token:'wrong',raw:'not json'})).status,401);
    assert.equal((await f.call(null,{method:'GET'})).status,405);
    assert.equal((await f.call(null,{headers:{'Content-Type':'text/plain'},raw:'{}'})).status,415);
    assert.equal((await f.call(null,{raw:'invalid json'})).status,400);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM question_fact_families').get().n,0);
  }finally{f.sqlite.close();}
});
test('all rows and table names are validated before any write, including extra columns',async()=>{
  const f=fixture();try{
    for(const payload of [{table:'runs',rows:[mapping()]},{table:'question_fact_families;DROP TABLE runs',rows:[mapping()]},{table:'question_fact_families',rows:[mapping(),{...mapping('Q2'),extra:'not allowed'}]},{table:'question_fact_families',rows:[]},{table:'question_fact_families',rows:Array.from({length:101},(_,i)=>mapping('Q'+i))},{table:'question_catalog_meta',rows:[{key:'dailyBackfillVersion',value:'not importer-owned'}]}])assert.equal((await f.call(payload)).status,400);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM question_fact_families').get().n,0);
    assert.ok(f.sqlite.prepare('SELECT name FROM sqlite_master WHERE name=\'runs\'').get());
    await assert.rejects(()=>applyCatalogBatch({}, {table:'question_fact_families',rows:[mapping()]}),error=>error.status===503);
  }finally{f.sqlite.close();}
});
test('bound structured values import solutions without accepting SQL, and retries are idempotent',async()=>{
  const f=fixture();try{
    assert.equal((await f.call({table:'question_fact_families',rows:[mapping()]})).status,200);
    const row=catalogRow();row.category="x'); DROP TABLE runs; --";
    const payload={table:'question_catalog',rows:[row]};
    assert.deepEqual((await f.call(payload)).body,{table:'question_catalog',written:1});
    const retried=await f.call(payload);assert.equal(retried.status,200);assert.equal(retried.headers.get('Cache-Control'),'no-store');
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM question_catalog').get().n,1);
    assert.equal(f.sqlite.prepare('SELECT category FROM question_catalog').get().category,row.category);
    assert.ok(f.sqlite.prepare('SELECT name FROM sqlite_master WHERE name=\'runs\'').get());
    const q=JSON.parse(row.content_json);q.correctId='choice-missing';
    assert.equal((await f.call({...payload,rows:[{...row,content_json:JSON.stringify(q)}]})).status,400);
    assert.equal((await f.call({table:'question_family_aliases',rows:[{alias_family_id:'old-fact',family_id:row.family_id}]})).status,200);
    assert.equal((await f.call({table:'question_catalog_meta',rows:[{key:'version',value:'b'.repeat(64)},{key:'source',value:'Wikidata (CC0)'}]})).status,200);
  }finally{f.sqlite.close();}
});
test('constraint failure rolls back the complete batch and family identities cannot be changed',async()=>{
  const f=fixture();try{
    await f.call({table:'question_fact_families',rows:[mapping()]});
    const failed=await f.call({table:'question_fact_families',rows:[mapping('Q2'),mapping('Q1','regrouped')]});
    assert.equal(failed.status,409);assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM question_fact_families').get().n,1);
    assert.doesNotMatch(JSON.stringify(failed.body),/INSERT|SQL|trigger|immutable/);
    const row=catalogRow();await f.call({table:'question_catalog',rows:[row]});
    assert.equal((await f.call({table:'question_catalog',rows:[{...row,pool:'daily'}]})).status,409);
    assert.equal(f.sqlite.prepare('SELECT pool FROM question_catalog').get().pool,'free');
  }finally{f.sqlite.close();}
});
test('actual request bytes are bounded even without Content-Length',async()=>{
  const f=fixture();try{
    const large=' '.repeat(512*1024+1);
    assert.equal((await f.call(null,{raw:large})).status,413);
    assert.equal(f.sqlite.prepare('SELECT COUNT(*) AS n FROM question_fact_families').get().n,0);
  }finally{f.sqlite.close();}
});
