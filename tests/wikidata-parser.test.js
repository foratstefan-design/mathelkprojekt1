import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const parserPath=fileURLToPath(new URL('../scripts/extract-wikidata-dump.py',import.meta.url));
const pythonCommand=process.env.WIKIDATA_PYTHON||'python3';
const prelude=`
import bz2,io,json,runpy,sys
from collections import Counter
from datetime import date
m=runpy.run_path(sys.argv[1])
payload=json.loads(sys.argv[2])
def statement(prop,value,rank='normal',qualifiers=None):
    return {'id':'Q100$'+prop+'-'+str(value),'rank':rank,
        'mainsnak':{'property':prop,'snaktype':'value','datavalue':{'value':value}},
        'qualifiers':qualifiers or {}}
def entity(claims):
    return {'id':'Q100','type':'item','lastrevid':1234,
        'labels':{'de':{'value':'Beispielstadt'}},
        'descriptions':{'de':{'value':'Stadt in Deutschland'}},
        'sitelinks':{'dewiki':{'title':'Beispielstadt'}},'claims':claims}
def extract(claims):
    return m['extract_entity_facts'](entity(claims),'2026-11-24T12:00:00Z',date(2026,11,24),Counter())
def moment(year,precision=9,calendar='Q1985727'):
    return {'time':'+'+str(year).zfill(4)+'-01-01T00:00:00Z','precision':precision,
        'calendarmodel':'http://www.wikidata.org/entity/'+calendar}
def stats():
    return {'compressedBytesRead':0,'oversizeEntityLines':0,'partialTailBytes':0,'bzipComplete':False}
`;
function python(body,payload={}){
  const result=spawnSync(pythonCommand,['-c',prelude+'\n'+body,parserPath,JSON.stringify(payload)],{
    encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024
  });
  assert.equal(result.status,0,result.stderr||result.error?.message);
  return JSON.parse(result.stdout);
}
test('the real extractor normalizes equivalent measurement units and ignores partial/deprecated amounts',()=>{
  const result=python(String.raw`
def quantity(amount,unit):return {'amount':str(amount),'unit':'http://www.wikidata.org/entity/'+unit}
claims={
 'P2048':[statement('P2048',quantity(5,'Q11573')),statement('P2048',quantity(500,'Q174728')),
          statement('P2048',quantity(99,'Q11573'),'deprecated'),
          statement('P2048',quantity(25,'Q11573'),qualifiers={'P518':[]})],
 'P2046':[statement('P2046',quantity(1,'Q712226')),statement('P2046',quantity(1000000,'Q25343'))],
 'P2043':[statement('P2043',quantity(5,'Q828224')),statement('P2043',quantity(5000,'Q11573'))],
 'P2044':[statement('P2044',quantity('3.048','Q11573')),statement('P2044',quantity(10,'Q3710'))]
}
facts=extract(claims)
print(json.dumps({f['propertyId']:{'value':f['value'],'unit':f['unit'],'key':f['key']} for f in facts}))
`);
  assert.deepEqual(Object.fromEntries(Object.entries(result).map(([k,v])=>[k,[v.value,v.unit]])),{
    P2044:[3.048,'m'],P2048:[5,'m'],P2046:[1,'km²'],P2043:[5000,'m']
  });
  assert.equal(result.P2046.key,'wd:Q100:P2046:flaeche');
});
test('multiple current capitals remain ambiguous even when one has preferred rank',()=>{
  const result=python(String.raw`
def obj(q):return {'entity-type':'item','id':q}
preferred=statement('P36',obj('Q90'),'preferred')
other=statement('P36',obj('Q64'))
ambiguous=extract({'P36':[preferred,other]})
same=extract({'P36':[preferred,statement('P36',obj('Q90'))]})
ended=extract({'P36':[preferred,statement('P36',obj('Q64'),qualifiers={'P582':[]})]})
print(json.dumps({'ambiguous':ambiguous,'same':[f['objectId'] for f in same],'ended':[f['objectId'] for f in ended]}))
`);
  assert.deepEqual(result.ambiguous,[]);
  assert.deepEqual(result.same,['Q90']);
  assert.deepEqual(result.ended,['Q90']);
});
test('earliest publication includes a normal earlier edition and rejects invalid date evidence',()=>{
  const result=python(String.raw`
claims={'P577':[
 statement('P577',moment(1984)),
 statement('P577',moment(2008,11),'preferred'),
 statement('P577',moment(1800,8)),
 statement('P577',moment(1500,9,'Q1985786')),
 statement('P577',moment(2030)),
 statement('P577',moment(1900),'deprecated'),
 statement('P577',moment(1901),qualifiers={'P582':[]}),
 statement('P577',moment(1902),qualifiers={'P518':[]})
]}
facts=extract(claims)
one_year=extract({'P571':[statement('P571',moment(2010,9)),statement('P571',moment(2010,11))]})
two_years=extract({'P571':[statement('P571',moment(2010)),statement('P571',moment(2011))]})
invalid=extract({'P577':[statement('P577',moment(1800,8)),statement('P577',moment(1500,9,'Q1985786')),statement('P577',moment(2030))]})
print(json.dumps({'publication':facts,'oneYear':one_year,'twoYears':two_years,'invalid':invalid}))
`);
  assert.equal(result.publication.length,1);
  assert.equal(result.publication[0].value,1984,'a later preferred revision must not redefine first publication');
  assert.equal(result.publication[0].scope,'frueheste-veroeffentlichung');
  assert.equal(result.publication[0].datePrecision,9);
  assert.equal(result.publication[0].revisionId,1234);
  assert.equal(result.oneYear[0].value,2010);
  assert.deepEqual(result.twoYears,[]);
  assert.deepEqual(result.invalid,[]);
});
test('partial BZip2 tails consume only full JSON lines; concatenated members also work',()=>{
  const result=python(String.raw`
prefix=b'[\n'+json.dumps({'id':'Q1','type':'item'}).encode()+b',\n'+b'{"id":"Q2"'
partial=bz2.compress(prefix)[:-8]
partial_stats=stats()
partial_rows=list(m['complete_entities'](io.BytesIO(partial),partial_stats))
first=bz2.compress(b'[\n{"id":"Q1","type":"item"},\n')
second=bz2.compress(b'{"id":"Q2","type":"item"}\n]\n')
complete_stats=stats()
complete_rows=list(m['complete_entities'](io.BytesIO(first+second),complete_stats))
print(json.dumps({'partialIds':[x['id'] for x in partial_rows],'partial':partial_stats,
                  'completeIds':[x['id'] for x in complete_rows],'complete':complete_stats}))
`);
  assert.deepEqual(result.partialIds,['Q1']);
  assert.equal(result.partial.bzipComplete,false);
  assert.ok(result.partial.partialTailBytes>0);
  assert.deepEqual(result.completeIds,['Q1','Q2']);
  assert.equal(result.complete.bzipComplete,true);
});
test('CLI applies German-article and sitelink gates, then resolves labels seen later in the stream',()=>{
  const directory=mkdtempSync(join(tmpdir(),'wikidata-parser-'));
  try{
    const fixture=python(String.raw`
base=entity({'P50':[statement('P50',{'entity-type':'item','id':'Q200'})]})
base['sitelinks'].update({'x'+str(i):{'title':'x'} for i in range(7)})
target={'id':'Q200','type':'item','labels':{'de':{'value':'Autorenbeispiel'}},'sitelinks':{},'claims':{}}
too_small=json.loads(json.dumps(base));too_small['id']='Q101';too_small['sitelinks'].pop('x6')
english=json.loads(json.dumps(base));english['id']='Q102';english['sitelinks'].pop('dewiki')
records=[base,target,too_small,english]
raw=b'[\n'+b',\n'.join(json.dumps(x).encode() for x in records)+b'\n]\n'
import base64
print(json.dumps({'compressed':base64.b64encode(bz2.compress(raw)).decode()}))
`);
    const inputPath=join(directory,'prefix.bz2'),outputPath=join(directory,'nested','result.json');
    writeFileSync(inputPath,Buffer.from(fixture.compressed,'base64'));
    const run=spawnSync(pythonCommand,[parserPath,'--input',inputPath,'--output',outputPath,'--retrieved-at','2026-11-24T12:00:00Z','--as-of-date','2026-11-24'],{encoding:'utf8',timeout:10000});
    assert.equal(run.status,0,run.stderr);
    const data=JSON.parse(readFileSync(outputPath,'utf8'));
    assert.equal(data.entitiesRead,4);
    assert.equal(data.germanEntities,2);
    assert.equal(data.eligibleGermanEntities,1);
    assert.equal(data.facts.length,1);
    assert.equal(data.facts[0].objectId,'Q200');
    assert.equal(data.facts[0].objectLabel,'Autorenbeispiel');
    assert.equal(data.labels.Q102,'Beispielstadt','all labels are retained even for excluded primary subjects');
    assert.deepEqual(data.missingObjectIds,[]);
  }finally{rmSync(directory,{recursive:true,force:true});}
});
test('a malformed complete entity aborts extraction without overwriting a previous snapshot',()=>{
  const directory=mkdtempSync(join(tmpdir(),'wikidata-parser-invalid-'));
  try{
    const fixture=python(String.raw`
import base64
print(json.dumps({'compressed':base64.b64encode(bz2.compress(b'[\n{"id":broken}\n]\n')).decode()}))
`);
    const inputPath=join(directory,'invalid.bz2'),outputPath=join(directory,'result.json');
    writeFileSync(inputPath,Buffer.from(fixture.compressed,'base64'));
    writeFileSync(outputPath,'{"previous":"valid"}\n');
    const run=spawnSync(pythonCommand,[parserPath,'--input',inputPath,'--output',outputPath],{encoding:'utf8',timeout:10000});
    assert.notEqual(run.status,0);
    assert.match(run.stderr,/Malformed complete JSON entity line/);
    assert.deepEqual(JSON.parse(readFileSync(outputPath,'utf8')),{previous:'valid'});
  }finally{rmSync(directory,{recursive:true,force:true});}
});
