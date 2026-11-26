import {applyCatalogBatch} from './catalog-import.js';

/** Install only trusted school data embedded by the build, never request data.
 * Existing Wikidata rows, daily snapshots, player answers and ledgers survive.
 * The marker is written last, so a partial import can safely be retried.
 */
export async function installCatalogRelease(db,release){
  const installed=(await db.all("SELECT value FROM question_catalog_meta WHERE key='schoolRelease'",[]))[0]?.value;
  if(installed===release.id)return {skipped:true,batches:0};
  for(const batch of release.batches)await applyCatalogBatch(db,batch);
  await db.run("INSERT INTO question_catalog_meta(key,value) VALUES('schoolRelease',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[release.id]);
  return {skipped:false,batches:release.batches.length};
}
