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
// These are different source properties, but all ask about geography. Treat
// them as one area so a country/area/elevation/river sequence is not a "mix".
const geographyCategories=['Geografie','Flächen','Meereshöhen','Längen','Bauwerkshöhen'];
const mixArea=category=>geographyCategories.includes(category)?'__geography__':category;
const mixAreaExpression="CASE WHEN c.category IN ('Geografie','Flächen','Meereshöhen','Längen','Bauwerkshöhen') THEN '__geography__' ELSE c.category END";
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
    const version=((await one("SELECT value FROM question_catalog_meta WHERE key='version'"))?.value||'initial')+':daily-revisions-v1';
    if((await one("SELECT value FROM question_catalog_meta WHERE key='dailyBackfillVersion'"))?.value===version)return;
    await write(`INSERT OR IGNORE INTO daily_question_slots(day,position,family_id,question_id,content_json)
      SELECT d.day,CAST(j.key AS INTEGER),COALESCE(json_extract(j.value,'$.familyId'),json_extract(j.value,'$.id')),
        json_extract(j.value,'$.id'),j.value
      FROM (SELECT day,questions_json,created_at FROM daily_challenges
        UNION ALL SELECT day||':revision:'||revision,questions_json,created_at FROM daily_challenge_revisions) d, json_each(d.questions_json) j
      WHERE CAST(j.key AS INTEGER) BETWEEN 0 AND 9 ORDER BY d.created_at ASC, CAST(j.key AS INTEGER) ASC`);
    await write("INSERT INTO question_catalog_meta(key,value) VALUES('dailyBackfillVersion',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",version);
  }

  async function existingClaim(row) {
    return parse(await one('SELECT c.content_json FROM seen_questions s JOIN question_catalog c ON c.id=s.question_id WHERE s.run_id=? AND s.position=?',row.id,row.question_index));
  }

  async function claimFree(row,preferredDifficulty=1) {
    await backfillDevice(row.device);
    await backfillDays();
    const pending=await existingClaim(row);if(pending)return pending;
    const mixed=row.mode==='mix';
    const recent=await all('SELECT c.category FROM seen_questions s JOIN question_catalog c ON c.id=s.question_id WHERE s.device=? ORDER BY s.first_seen_at DESC,s.rowid DESC LIMIT 3',row.device);
    const recentCategories=[...new Set(recent.map(item=>mixed?mixArea(item.category):item.category))];
    const levels=[1,2,3].sort((a,b)=>Math.abs(a-preferredDifficulty)-Math.abs(b-preferredDifficulty));
    // For Mix, a fresh area at the other gentle level beats repeating easy
    // geography. Hard questions remain the final fallback until unlocked.
    const preferredLevels=mixed&&preferredDifficulty<3?levels.filter(level=>level<3):levels;
    const choices=mixed?
      [true,false].flatMap(cooldown=>preferredLevels.map(level=>({level,cooldown}))).concat(preferredDifficulty<3?[{level:3,cooldown:true},{level:3,cooldown:false}]:[]):
      levels.flatMap(level=>[true,false].map(cooldown=>({level,cooldown})));
    const pivot=hash(row.seed+':'+row.question_index);
    for(let attempt=0;attempt<64;attempt++){
      const winner=await existingClaim(row);if(winner)return winner;
      let candidate=null;
      for(const {level,cooldown} of choices){
        const categoryClause=cooldown&&recentCategories.length?' AND '+(mixed?mixAreaExpression:'c.category')+' NOT IN ('+recentCategories.map(()=>'?').join(',')+')':'';
        const typeClause=row.mode==='mix'?'':' AND c.type=?';
        const params=[level,...(row.mode==='mix'?[]:[row.mode]),row.device,row.device,...(cooldown?recentCategories:[])];
        const base=`SELECT c.id,c.family_id,c.content_json FROM question_catalog c
          WHERE c.pool='free' AND c.enabled=1 AND c.difficulty=?${typeClause}
          AND NOT EXISTS(SELECT 1 FROM seen_questions s WHERE s.device=? AND s.family_id=c.family_id)
          AND NOT EXISTS(SELECT 1 FROM seen_questions s JOIN question_family_aliases alias ON alias.alias_family_id=s.family_id WHERE s.device=? AND alias.family_id=c.family_id)
          AND NOT EXISTS(SELECT 1 FROM daily_question_slots used WHERE used.family_id=c.family_id)
          AND NOT EXISTS(SELECT 1 FROM daily_question_slots used JOIN question_family_aliases alias ON alias.alias_family_id=used.family_id WHERE alias.family_id=c.family_id)
          ${categoryClause}`;
        // Two index-friendly ranges replace ORDER BY random() over a large bank.
        for(const [comparison,at] of [['>=',pivot],['<',pivot]]){
          candidate=await one(base+' AND c.selection_key '+comparison+' ? ORDER BY c.selection_key,c.id LIMIT 1',...params,at);
          if(candidate)break;
        }
        if(candidate)break;
      }
      if(!candidate)return null;
      // Both unique constraints are important. Different runs cannot claim a
      // family twice; parallel /next calls cannot burn two families at one slot.
      await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
        SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM runs WHERE id=? AND device=? AND question_index=? AND status='ready')
        AND NOT EXISTS(SELECT 1 FROM daily_question_slots WHERE family_id=?)
        AND NOT EXISTS(SELECT 1 FROM daily_question_slots used JOIN question_family_aliases alias ON alias.alias_family_id=used.family_id WHERE alias.family_id=?)`,
        row.device,candidate.family_id,candidate.id,Date.now(),row.id,row.question_index,row.id,row.device,row.question_index,candidate.family_id,candidate.family_id);
      const claimed=await existingClaim(row);if(claimed)return claimed;
      const current=await one('SELECT status,question_index FROM runs WHERE id=?',row.id);
      if(current?.status!=='ready'||current.question_index!==row.question_index)return null;
    }
    throw new Error('Die Frage wurde parallel reserviert. Bitte den gespeicherten Flug erneut laden.');
  }

  // Mixed days may reserve an untouched knowledge family from the original
  // free bank. Its global day reservation then excludes it from every free
  // flight. Backfill all historical exposure before making that reservation.
  async function backfillMixedExposure() {
    const version=(await one("SELECT value FROM question_catalog_meta WHERE key='version'"))?.value||'initial';
    if((await one("SELECT value FROM question_catalog_meta WHERE key='mixedExposureVersion'"))?.value===version)return;
    await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
      SELECT r.device,${familyExpression},a.question_id,a.received_at,a.run_id,a.position
      FROM answers a JOIN runs r ON r.id=a.run_id
      WHERE COALESCE(json_extract(a.result,'$.status'),'complete')<>'checking'
      ORDER BY a.received_at,a.rowid`);
    await write(`INSERT OR IGNORE INTO seen_questions(device,family_id,question_id,first_seen_at,run_id,position)
      SELECT device,COALESCE(json_extract(question_json,'$.familyId'),json_extract(question_json,'$.id')),
      json_extract(question_json,'$.id'),started_at,id,question_index FROM runs
      WHERE status='flying' AND question_json IS NOT NULL ORDER BY started_at`);
    await write("INSERT INTO question_catalog_meta(key,value) VALUES('mixedExposureVersion',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",version);
  }
  const mixedEligibility=`c.enabled=1 AND c.difficulty IN (1,2)
    AND (c.pool='daily' OR (c.pool='free' AND c.type='general'))
    AND NOT EXISTS(SELECT 1 FROM daily_question_slots used WHERE used.family_id=c.family_id)
    AND NOT EXISTS(SELECT 1 FROM daily_question_slots used JOIN question_family_aliases alias ON alias.alias_family_id=used.family_id WHERE alias.family_id=c.family_id)
    AND NOT EXISTS(SELECT 1 FROM seen_questions seen WHERE seen.family_id=c.family_id)
    AND NOT EXISTS(SELECT 1 FROM seen_questions seen JOIN question_family_aliases alias ON alias.alias_family_id=seen.family_id WHERE alias.family_id=c.family_id)`;

  async function reserveMixed(date) {
    await backfillMixedExposure();
    for(let attempt=0;attempt<8;attempt++){
      const existing=await all('SELECT content_json FROM daily_question_slots WHERE day=? ORDER BY position',date);
      if(existing.length===DAY_COUNT)return existing.map(parse);
      // Bounded lightweight candidates: no multi-megabyte question JSON scan.
      const pivot=hash('mixed:'+date+':'+attempt);
      const candidates=await all(`WITH ranked AS (
        SELECT c.id,c.family_id,c.type,c.category,c.difficulty,c.selection_key,
          ROW_NUMBER() OVER(PARTITION BY c.type,c.category,c.difficulty
          ORDER BY CASE WHEN c.selection_key>=? THEN 0 ELSE 1 END,c.selection_key,c.id) AS position
        FROM question_catalog c WHERE ${mixedEligibility}
      ) SELECT * FROM ranked WHERE position<=16`,pivot);
      const styles=new Set(candidates.map(q=>q.type==='general'?'knowledge':['common','rare'].includes(q.type)?'number':'time'));
      if(styles.size<3||new Set(candidates.map(q=>q.category)).size<3)throw new CatalogPoolExhaustedError('Für einen abwechslungsreichen Tagesmix fehlen noch neue Themen.');
      const selected=[],families=new Set(),categories=new Map(),typeCounts=new Map();
      const numeric=hash(date)%2?'common':'rare',temporal=hash(date+':time')%2?'earlier':'later';
      const plan=['general','common','earlier','general','rare','later','general',numeric,temporal,'general'];
      const group=type=>type==='general'?'knowledge':['common','rare'].includes(type)?'number':'time';
      for(let position=0;position<DAY_COUNT;position++){
        const desired=plan[position],level=position<8?1:2;
        let chosen;
        for(const cap of [2,3,DAY_COUNT]){
          const scopes=[type=>type===desired,type=>group(type)===group(desired)];
          // The opening selections guarantee all three styles. Only later
          // quota slots may borrow another style when their own stock is low.
          if(position>=3)scopes.push(()=>true);
          for(const scope of scopes){
            const available=candidates.filter(q=>!families.has(q.family_id)&&(categories.get(q.category)||0)<cap&&scope(q.type));
            available.sort((a,b)=>Math.abs(a.difficulty-level)-Math.abs(b.difficulty-level)
              ||(categories.get(a.category)||0)-(categories.get(b.category)||0)
              ||(typeCounts.get(a.type)||0)-(typeCounts.get(b.type)||0)
              ||hash(date+':pick:'+a.id)-hash(date+':pick:'+b.id)||a.id.localeCompare(b.id));
            if(available.length){chosen=available[0];break;}
          }
          if(chosen)break;
        }
        if(!chosen)break;
        selected.push(chosen);families.add(chosen.family_id);
        categories.set(chosen.category,(categories.get(chosen.category)||0)+1);
        typeCounts.set(chosen.type,(typeCounts.get(chosen.type)||0)+1);
      }
      if(selected.length!==DAY_COUNT||new Set(selected.map(q=>group(q.type))).size<3||new Set(selected.map(q=>q.category)).size<3)throw new CatalogPoolExhaustedError('Für den bunten Tagesmix fehlen noch neue Fragen.');
      // Shuffle the lesson order without placing matching topics next to each
      // other where an alternative exists. Everyone receives this same order.
      const arranged=[];
      while(selected.length){
        const last=arranged.at(-1);
        selected.sort((a,b)=>Number(a.category===last?.category)-Number(b.category===last?.category)
          ||Number(a.type===last?.type)-Number(b.type===last?.type)
          ||hash(date+':order:'+a.id)-hash(date+':order:'+b.id)||a.id.localeCompare(b.id));
        arranged.push(selected.shift());
      }
      const contents=await all('SELECT id,content_json FROM question_catalog WHERE id IN ('+arranged.map(()=>'?').join(',')+')',...arranged.map(q=>q.id));
      const json=new Map(contents.map(q=>[q.id,q.content_json]));
      const values=arranged.flatMap((q,i)=>[i,q.family_id,q.id,json.get(q.id)]);
      // Recheck the ENTIRE plan inside the atomic insert: a parallel free
      // claim/day reservation wins safely, never leaving a partial ten-set.
      await write(`WITH chosen(position,family_id,question_id,content_json) AS (VALUES ${arranged.map(()=>'(?,?,?,?)').join(',')})
        INSERT OR IGNORE INTO daily_question_slots(day,position,family_id,question_id,content_json)
        SELECT ?,chosen.position,chosen.family_id,chosen.question_id,chosen.content_json FROM chosen
        WHERE NOT EXISTS(SELECT 1 FROM chosen checkq LEFT JOIN question_catalog c ON c.id=checkq.question_id
          WHERE c.id IS NULL OR NOT (${mixedEligibility}))`,...values,date);
      const saved=await all('SELECT content_json FROM daily_question_slots WHERE day=? ORDER BY position',date);
      if(saved.length===DAY_COUNT)return saved.map(parse);
    }
    throw new Error('Der Tagesmix wurde parallel reserviert. Bitte erneut laden.');
  }

  async function reserveDaily(date,mode) {
    await backfillDays();
    const reserved=await all('SELECT content_json FROM daily_question_slots WHERE day=? ORDER BY position',date);
    if(reserved.length===DAY_COUNT)return reserved.map(parse);
    if(mode==='mix')return reserveMixed(date);
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
    if(mode==='mix'){
      await backfillMixedExposure();
      const counts=await one(`SELECT COUNT(DISTINCT c.family_id) AS n,COUNT(DISTINCT c.category) AS topics,
        MAX(CASE WHEN c.type='general' THEN 1 ELSE 0 END) AS knowledge,
        MAX(CASE WHEN c.type IN ('common','rare') THEN 1 ELSE 0 END) AS numbers,
        MAX(CASE WHEN c.type IN ('earlier','later') THEN 1 ELSE 0 END) AS times
        FROM question_catalog c WHERE ${mixedEligibility}`);
      return (counts?.n||0)>=DAY_COUNT&&counts.topics>=3&&Boolean(counts.knowledge&&counts.numbers&&counts.times);
    }
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
    const counts=await one(`SELECT COUNT(*) AS questions,COUNT(DISTINCT c.family_id) AS families,
      COUNT(DISTINCT CASE WHEN c.pool='free' AND NOT EXISTS(SELECT 1 FROM daily_question_slots d WHERE d.family_id=c.family_id) THEN c.family_id END) AS freeFamilies,
      COUNT(DISTINCT CASE WHEN c.pool='daily' OR EXISTS(SELECT 1 FROM daily_question_slots d WHERE d.family_id=c.family_id) THEN c.family_id END) AS dailyFamilies FROM question_catalog c WHERE c.enabled=1`);
    const meta=await all("SELECT key,value FROM question_catalog_meta WHERE key IN ('updatedAt','sourceFactCount','version','source')");
    const values=Object.fromEntries(meta.map(item=>[item.key,item.value]));
    const remaining=device?(await one("SELECT COUNT(DISTINCT c.family_id) AS n FROM question_catalog c WHERE c.enabled=1 AND c.pool='free' AND NOT EXISTS(SELECT 1 FROM seen_questions s WHERE s.device=? AND s.family_id=c.family_id) AND NOT EXISTS(SELECT 1 FROM seen_questions s JOIN question_family_aliases a ON a.alias_family_id=s.family_id WHERE s.device=? AND a.family_id=c.family_id) AND NOT EXISTS(SELECT 1 FROM daily_question_slots used WHERE used.family_id=c.family_id) AND NOT EXISTS(SELECT 1 FROM daily_question_slots used JOIN question_family_aliases a ON a.alias_family_id=used.family_id WHERE a.family_id=c.family_id)",device,device))?.n:undefined;
    return {...counts,source:values.source||'Wikidata + kuratiert',updatedAt:values.updatedAt||null,sourceFactCount:Number(values.sourceFactCount)||null,remainingFreeFamilies:remaining};
  }
  return {backfillDevice,backfillDays,claimFree,reserveDaily,dailyAvailable,markDailySeen,rememberSnapshot,stats};
}
