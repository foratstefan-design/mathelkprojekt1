/** SQL-backed immutable questions and permanent exposure ledgers.
 * Family ids are the semantic unit: inverse prompts can never bypass a claim.
 * Catalog imports assign every underlying fact to exactly one stable family.
 */
export class CatalogPoolExhaustedError extends Error {
  constructor(message='Für diesen Kurs sind zurzeit keine neuen Fragen mehr verfügbar.') {
    super(message);this.status=409;this.code='QUESTION_POOL_EXHAUSTED';this.poolExhausted=true;
  }
}
const DAY_COUNT=10;
function hash(text){let value=2166136261;for(const char of String(text)){value^=char.charCodeAt(0);value=Math.imul(value,16777619);}return value>>>0;}

export function createCatalog(db) {
  const all=(sql,...params)=>db.all(sql,params);
  const one=async(sql,...params)=>(await all(sql,...params))[0];
  const write=(sql,...params)=>db.run(sql,params);
  const parse=row=>row?JSON.parse(row.content_json):null;
  const familyExpression="COALESCE(json_extract(a.result, '$.familyId'), a.question_id)";

  async function backfillDevice(device) {
    const version=(await one("SELECT value FROM question_catalog_meta WHERE key='version'"))?.value||'initial';
    if((await one('SELECT catalog_version FROM seen_question_backfills WHERE device=?',device))?.catalog_version===version)return;
    // The entire older answer history participates. This is not a rolling
    // window; the per-device marker avoids reading it again on every question.
    await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
      SELECT r.device, ${familyExpression}, a.question_id, a.received_at, a.run_id, a.position
      FROM answers a JOIN runs r ON r.id=a.run_id
      WHERE r.device=? AND COALESCE(json_extract(a.result,'$.status'),'complete')<>'checking'
      ORDER BY a.received_at ASC, a.rowid ASC`,device);
    await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
      SELECT r.device, COALESCE(json_extract(r.question_json,'$.familyId'),json_extract(r.question_json,'$.id')),
        json_extract(r.question_json,'$.id'), r.started_at, r.id, r.question_index
      FROM runs r
      WHERE r.device=? AND r.status='flying' AND r.question_json IS NOT NULL`,device);
    // Preserve original historical ids. A comparison can map to several new
    // families, and anti-joins below expand all of those aliases permanently.
    await write('INSERT INTO seen_question_backfills(device,completed_at,catalog_version) VALUES(?,?,?) ON CONFLICT(device) DO UPDATE SET completed_at=excluded.completed_at,catalog_version=excluded.catalog_version',device,Date.now(),version);
  }

  async function backfillDays() {
    const version=(await one("SELECT value FROM question_catalog_meta WHERE key='version'"))?.value||'initial';
    if((await one("SELECT value FROM question_catalog_meta WHERE key='dailyBackfillVersion'"))?.value===version)return;
    await write(`INSERT OR IGNORE INTO daily_question_slots(day,position,family_id,question_id,content_json)
      SELECT d.day,CAST(j.key AS INTEGER),COALESCE(json_extract(j.value,'$.familyId'),json_extract(j.value,'$.id')),
        json_extract(j.value,'$.id'),j.value
      FROM daily_challenges d, json_each(d.questions_json) j
      WHERE CAST(j.key AS INTEGER) BETWEEN 0 AND 9 ORDER BY d.created_at ASC, CAST(j.key AS INTEGER) ASC`);
    await write("INSERT INTO question_catalog_meta(key,value) VALUES('dailyBackfillVersion',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",version);
  }

  async function existingClaim(row) {
    return parse(await one('SELECT c.content_json FROM seen_questions s JOIN question_catalog c ON c.id=s.question_id WHERE s.run_id=? AND s.position=?',row.id,row.question_index));
  }

  async function claimFree(row,preferredDifficulty=1) {
    await backfillDevice(row.device);
    const pending=await existingClaim(row);if(pending)return pending;
    const recent=await all('SELECT c.category FROM seen_questions s JOIN question_catalog c ON c.id=s.question_id WHERE s.device=? ORDER BY s.first_seen_at DESC LIMIT 3',row.device);
    const recentCategories=[...new Set(recent.map(item=>item.category))];
    const levels=[1,2,3].sort((a,b)=>Math.abs(a-preferredDifficulty)-Math.abs(b-preferredDifficulty));
    const pivot=hash(row.seed+':'+row.question_index);
    for(let attempt=0;attempt<64;attempt++){
      const winner=await existingClaim(row);if(winner)return winner;
      let candidate=null;
      for(const level of levels){
        for(const cooldown of [true,false]){
          const categoryClause=cooldown&&recentCategories.length?' AND c.category NOT IN ('+recentCategories.map(()=>'?').join(',')+')':'';
          const typeClause=row.mode==='mix'?'':' AND c.type=?';
          const params=[level,...(row.mode==='mix'?[]:[row.mode]),row.device,row.device,...(cooldown?recentCategories:[])];
          const base=`SELECT c.id,c.family_id,c.content_json FROM question_catalog c
            WHERE c.pool='free' AND c.enabled=1 AND c.difficulty=?${typeClause}
            AND NOT EXISTS(SELECT 1 FROM seen_questions s WHERE s.device=? AND s.family_id=c.family_id)
            AND NOT EXISTS(SELECT 1 FROM seen_questions s JOIN question_family_aliases alias ON alias.alias_family_id=s.family_id WHERE s.device=? AND alias.family_id=c.family_id)
            ${categoryClause}`;
          // Two index-friendly ranges replace ORDER BY random() over a large bank.
          for(const [comparison,at] of [['>=',pivot],['<',pivot]]){
            candidate=await one(base+' AND c.selection_key '+comparison+' ? ORDER BY c.selection_key,c.id LIMIT 1',...params,at);
            if(candidate)break;
          }
          if(candidate)break;
        }
        if(candidate)break;
      }
      if(!candidate)return null;
      // Both unique constraints are important. Different runs cannot claim a
      // family twice; parallel /next calls cannot burn two families at one slot.
      await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
        SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM runs WHERE id=? AND device=? AND question_index=? AND status='ready')`,
        row.device,candidate.family_id,candidate.id,Date.now(),row.id,row.question_index,row.id,row.device,row.question_index);
      const claimed=await existingClaim(row);if(claimed)return claimed;
      const current=await one('SELECT status,question_index FROM runs WHERE id=?',row.id);
      if(current?.status!=='ready'||current.question_index!==row.question_index)return null;
    }
    throw new Error('Die Frage wurde parallel reserviert. Bitte den gespeicherten Flug erneut laden.');
  }

  async function reserveDaily(date,mode) {
    await backfillDays();
    const reserved=await all('SELECT content_json FROM daily_question_slots WHERE day=? ORDER BY position',date);
    if(reserved.length===DAY_COUNT)return reserved.map(parse);
    const pivot=hash('daily-catalog:'+date);
    // Prefer eight introductory questions, then intermediate questions. If a
    // band is short, use the other gentle band; never introduce expert facts.
    // The whole ten-question day is still reserved atomically or not at all.
    await write(`WITH variants AS (
      SELECT c.*,ROW_NUMBER() OVER(PARTITION BY c.family_id ORDER BY c.difficulty,c.selection_key,c.id) AS variant
      FROM question_catalog c WHERE c.pool='daily' AND c.enabled=1 AND c.type=? AND c.difficulty IN (1,2)
      AND NOT EXISTS(SELECT 1 FROM daily_question_slots used WHERE used.family_id=c.family_id)
      AND NOT EXISTS(SELECT 1 FROM daily_question_slots used JOIN question_family_aliases alias ON alias.alias_family_id=used.family_id WHERE alias.family_id=c.family_id)
    ), ranked AS (
      SELECT *,ROW_NUMBER() OVER(PARTITION BY difficulty ORDER BY CASE WHEN selection_key>=? THEN 0 ELSE 1 END,selection_key,id) AS seq
      FROM variants WHERE variant=1
    ), ordered AS (
      SELECT *,ROW_NUMBER() OVER(ORDER BY CASE WHEN difficulty=1 AND seq<=8 THEN 0 WHEN difficulty=2 THEN 1 ELSE 2 END,seq,id)-1 AS position
      FROM ranked
    ), chosen AS (
      SELECT * FROM ordered WHERE position<10
    ) INSERT OR IGNORE INTO daily_question_slots(day,position,family_id,question_id,content_json)
      SELECT ?,position,family_id,id,content_json FROM chosen WHERE (SELECT COUNT(*) FROM chosen)=10`,mode,pivot,date);
    const slots=await all('SELECT content_json FROM daily_question_slots WHERE day=? ORDER BY position',date);
    if(slots.length!==DAY_COUNT)throw new CatalogPoolExhaustedError('Für einen neuen Tagesflug sind zurzeit nicht genug neue Fragen verfügbar.');
    return slots.map(parse);
  }

  async function dailyAvailable(date,mode) {
    if(await one('SELECT day FROM daily_challenges WHERE day=?',date))return true;
    await backfillDays();
    if((await one('SELECT COUNT(*) AS n FROM daily_question_slots WHERE day=?',date))?.n===DAY_COUNT)return true;
    const counts=await one(`SELECT COUNT(DISTINCT c.family_id) AS n FROM question_catalog c
      WHERE c.pool='daily' AND c.enabled=1 AND c.type=? AND c.difficulty IN (1,2)
      AND NOT EXISTS(SELECT 1 FROM daily_question_slots used WHERE used.family_id=c.family_id)
      AND NOT EXISTS(SELECT 1 FROM daily_question_slots used JOIN question_family_aliases alias ON alias.alias_family_id=used.family_id WHERE alias.family_id=c.family_id)
      `,mode);
    return (counts?.n||0)>=DAY_COUNT;
  }

  async function hasExposure(device,family) {
    return Boolean(await one(`SELECT 1 FROM seen_questions s WHERE s.device=? AND (
      s.family_id=? OR
      EXISTS(SELECT 1 FROM question_family_aliases a WHERE a.alias_family_id=s.family_id AND a.family_id=?) OR
      EXISTS(SELECT 1 FROM question_family_aliases a WHERE a.alias_family_id=? AND a.family_id=s.family_id) OR
      EXISTS(SELECT 1 FROM question_family_aliases a JOIN question_family_aliases b ON b.family_id=a.family_id WHERE a.alias_family_id=s.family_id AND b.alias_family_id=?)
    ) LIMIT 1`,device,family,family,family,family));
  }

  async function markDailySeen(row,question) {
    await backfillDevice(row.device);
    const family=question.familyId||question.id;
    const prior=await one('SELECT family_id FROM seen_questions WHERE run_id=? AND position=?',row.id,row.question_index);
    if(prior)return prior.family_id===family;
    if(await hasExposure(row.device,family))return false;
    await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
      SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM runs WHERE id=? AND device=? AND question_index=? AND status='ready')`,
      row.device,family,question.id,Date.now(),row.id,row.question_index,row.id,row.device,row.question_index);
    const claim=await one('SELECT family_id FROM seen_questions WHERE run_id=? AND position=?',row.id,row.question_index);
    return claim?.family_id===family;
  }

  async function rememberSnapshot(row,question) {
    if(!question)return;
    const family=question.familyId||question.id;
    await write('INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position) VALUES(?,?,?,?,?,?)',row.device,family,question.id,Date.now(),row.id,row.question_index);
  }

  async function stats(device) {
    if(device)await backfillDevice(device);
    const counts=await one(`SELECT COUNT(*) AS questions,COUNT(DISTINCT family_id) AS families,
      COUNT(DISTINCT CASE WHEN pool='free' THEN family_id END) AS freeFamilies,
      COUNT(DISTINCT CASE WHEN pool='daily' THEN family_id END) AS dailyFamilies FROM question_catalog WHERE enabled=1`);
    const meta=await all("SELECT key,value FROM question_catalog_meta WHERE key IN ('updatedAt','sourceFactCount','version','source')");
    const values=Object.fromEntries(meta.map(item=>[item.key,item.value]));
    const remaining=device?(await one("SELECT COUNT(DISTINCT c.family_id) AS n FROM question_catalog c WHERE c.enabled=1 AND c.pool='free' AND NOT EXISTS(SELECT 1 FROM seen_questions s WHERE s.device=? AND s.family_id=c.family_id) AND NOT EXISTS(SELECT 1 FROM seen_questions s JOIN question_family_aliases a ON a.alias_family_id=s.family_id WHERE s.device=? AND a.family_id=c.family_id)",device,device))?.n:undefined;
    return {...counts,source:values.source||'Wikidata + kuratiert',updatedAt:values.updatedAt||null,sourceFactCount:Number(values.sourceFactCount)||null,remainingFreeFamilies:remaining};
  }
  return {backfillDevice,backfillDays,claimFree,reserveDaily,dailyAvailable,markDailySeen,rememberSnapshot,stats};
}
