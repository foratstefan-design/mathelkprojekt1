import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {buildStatic} from '../scripts/build-static.mjs';

test('Pages build loads assets below the repository path and keeps game answers server-side',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'flight-pages-'));
  try{
    await buildStatic({apiOrigin:'https://hoehenflug.courteousclay.chatgpt.site/',output:directory});
    const html=await readFile(join(directory,'index.html'),'utf8');
    const page=new URL('https://foratstefan-design.github.io/mathelkprojekt1/');
    const paths=[...html.matchAll(/(?:src|href)="(\.\/[^\"]+)"/g)].map(match=>match[1]);
    assert.ok(paths.length>=3,'stylesheet and entry module links exist');
    for(const path of paths){
      const asset=new URL(path,page);
      assert.ok(asset.pathname.startsWith('/mathelkprojekt1/'),'asset stays below project path');
      assert.ok((await readFile(join(directory,asset.pathname.slice('/mathelkprojekt1/'.length)))).length>0);
    }
    assert.equal(await readFile(join(directory,'runtime-config.js'),'utf8'),'// Public API origin; contains no credentials.\nexport const API_ORIGIN = "https://hoehenflug.courteousclay.chatgpt.site";\n');
    assert.equal(await readFile(join(directory,'.nojekyll'),'utf8'),'');
    const files=await readdir(directory);
    for(const privateFile of ['content','lib','server','catalog-import.jsonl','hoehenflug.sqlite','.env','.openai'])assert.ok(!files.includes(privateFile));
    await buildStatic({apiOrigin:'',output:directory});
    assert.match(await readFile(join(directory,'runtime-config.js'),'utf8'),/API_ORIGIN = ""/);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Pages API configuration rejects credentials, paths and non-HTTPS destinations',async()=>{
  for(const apiOrigin of ['http://flight.test','https://user:password@flight.test','https://flight.test/api','https://flight.test/?key=secret','javascript:alert(1)']){
    await assert.rejects(buildStatic({apiOrigin}));
  }
});
