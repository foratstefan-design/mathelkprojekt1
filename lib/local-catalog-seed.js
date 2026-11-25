/** Node-only bootstrap. Schema migrations and factual catalog data stay separate. */
import {createReadStream} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import {applyCatalogBatch} from './catalog-import.js';

export async function loadLocalCatalog(sqlite) {
  const report=JSON.parse(await readFile(new URL('../content/catalog-report.json',import.meta.url),'utf8'));
  if(sqlite.prepare("SELECT value FROM question_catalog_meta WHERE key='version'").get()?.value===report.version)return {skipped:true,batches:0};
  const db={
    async batch(statements){
      sqlite.exec('BEGIN IMMEDIATE');
      try{
        const results=statements.map(({sql,params})=>sqlite.prepare(sql).run(...params));
        sqlite.exec('COMMIT');return results;
      }catch(error){sqlite.exec('ROLLBACK');throw error;}
    }
  };
  let batches=0;
  for await(const line of createInterface({input:createReadStream(new URL('../content/catalog-import.jsonl',import.meta.url)),crlfDelay:Infinity})){
    if(!line.trim())continue;
    await applyCatalogBatch(db,JSON.parse(line));batches++;
  }
  return {skipped:false,batches};
}
