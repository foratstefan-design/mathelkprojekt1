/** Administrative data import. Schema changes remain exclusively in migrations.
 * Disabled unless a deployment secret is explicitly configured. Only these four
 * catalog tables are writable; SQL and column names never come from the client.
 */
const MAX_BYTES=512*1024;
const MAX_ROWS=100;
const identifiers=value=>typeof value==='string'&&/^[A-Za-z0-9:_./-]{1,300}$/.test(value);
const text=(value,max=120)=>typeof value==='string'&&value.length>0&&value.length<=max&&!/[\u0000-\u001f]/.test(value);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const types=new Set(['common','rare','earlier','later','general']);
const metaKeys=new Set(['version','updatedAt','sourceFactCount','source']);
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
const tables={
  question_fact_families:{columns:['fact_key','family_id'],keys:['fact_key'],validate:r=>identifiers(r.fact_key)&&identifiers(r.family_id)},
  question_catalog:{columns:['id','family_id','type','difficulty','category','prompt_fingerprint','content_json','selection_key','pool','enabled'],keys:['id'],validate:r=>{
    if(!identifiers(r.id)||!identifiers(r.family_id)||!types.has(r.type)||!integer(r.difficulty,1,3)||!text(r.category)||typeof r.prompt_fingerprint!=='string'||!/^[a-f0-9]{64}$/.test(r.prompt_fingerprint)||!integer(r.selection_key,0,4294967295)||!['free','daily'].includes(r.pool)||!integer(r.enabled,0,1)||typeof r.content_json!=='string'||r.content_json.length>65536)return false;
    let q;try{q=JSON.parse(r.content_json);}catch{return false;}
    return q&&q.id===r.id&&q.familyId===r.family_id&&q.type===r.type&&q.difficulty===r.difficulty&&text(q.prompt,1600)&&Array.isArray(q.factKeys)&&q.factKeys.length>=1&&q.factKeys.length<=16&&q.factKeys.every(identifiers)&&new Set(q.factKeys).size===q.factKeys.length&&Array.isArray(q.options)&&q.options.length===4&&q.options.every(o=>o&&identifiers(o.id)&&text(o.label,300))&&new Set(q.options.map(o=>o.id)).size===4&&new Set(q.options.map(o=>o.label)).size===4&&q.options.some(o=>o.id===q.correctId);
  }},
  question_family_aliases:{columns:['alias_family_id','family_id'],keys:['alias_family_id','family_id'],validate:r=>identifiers(r.alias_family_id)&&identifiers(r.family_id)},
  question_catalog_meta:{columns:['key','value'],keys:['key'],validate:r=>metaKeys.has(r.key)&&text(r.value,300)&&(
    r.key==='version'?/^[a-f0-9]{64}$/.test(r.value):r.key==='sourceFactCount'?/^\d{1,9}$/.test(r.value):r.key==='updatedAt'?Number.isFinite(Date.parse(r.value)):true
  )}
};

/** Validate the complete batch before issuing a single atomic adapter call. */
export async function applyCatalogBatch(db,payload){
  if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!['table','rows'].includes(k))||!Object.hasOwn(tables,payload.table))throw failure('Ungültige Importtabelle.');
  const spec=tables[payload.table],rows=payload.rows;
  if(!Array.isArray(rows)||rows.length<1||rows.length>MAX_ROWS)throw failure('Ein Importpaket muss 1 bis 100 Zeilen enthalten.');
  if(new TextEncoder().encode(JSON.stringify(payload)).byteLength>MAX_BYTES)throw failure('Importpaket zu groß.',413);
  for(const row of rows){
    if(!row||typeof row!=='object'||Array.isArray(row)||Object.keys(row).length!==spec.columns.length||spec.columns.some(column=>!Object.hasOwn(row,column))||!spec.validate(row))throw failure('Ungültige Importzeile.');
  }
  if(typeof db.batch!=='function')throw failure('Atomarer Import ist nicht eingerichtet.',503);
  const columns=spec.columns,updates=columns.filter(column=>!spec.keys.includes(column));
  const conflict=updates.length?'DO UPDATE SET '+updates.map(column=>column+'=excluded.'+column).join(','):'DO NOTHING';
  const sql='INSERT INTO '+payload.table+' ('+columns.join(',')+') VALUES ('+columns.map(()=>'?').join(',')+') ON CONFLICT('+spec.keys.join(',')+') '+conflict;
  await db.batch(rows.map(row=>({sql,params:columns.map(column=>row[column])})));
  return {table:payload.table,written:rows.length};
}

async function authorized(actual,expected){
  if(typeof actual!=='string'||actual.length>600)return false;
  const provided=actual.startsWith('Bearer ')?actual.slice(7):'';
  // Fixed-length digest comparison avoids a prefix-sensitive secret comparison.
  const encode=new TextEncoder();
  const [a,b]=await Promise.all([crypto.subtle.digest('SHA-256',encode.encode(provided)),crypto.subtle.digest('SHA-256',encode.encode(expected))]);
  const left=new Uint8Array(a),right=new Uint8Array(b);let difference=0;
  for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
  return difference===0;
}
async function readBounded(request){
  if(Number(request.headers.get('Content-Length'))>MAX_BYTES)throw failure('Importpaket zu groß.',413);
  const reader=request.body?.getReader();if(!reader)throw failure('Importdaten fehlen.');
  const chunks=[];let length=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>MAX_BYTES){await reader.cancel();throw failure('Importpaket zu groß.',413);}chunks.push(value);}}finally{reader.releaseLock();}
  const bytes=new Uint8Array(length);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.byteLength;}
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw failure('Ungültige JSON-Importdaten.');}
}

export function createCatalogImport(db,{token}={}){
  const enabled=typeof token==='string'&&token.length>=32&&token.length<=512;
  const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  return async request=>{
    if(!enabled)return response({error:'Not found'},404);
    if(!await authorized(request.headers.get('Authorization'),token))return response({error:'Nicht autorisiert.'},401);
    if(request.method!=='POST')return response({error:'POST erforderlich.'},405);
    if(!request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase().endsWith('/json'))return response({error:'JSON erforderlich.'},415);
    try{return response(await applyCatalogBatch(db,await readBounded(request)));}
    catch(error){return response({error:error.status?error.message:'Das Importpaket verletzt die Katalogregeln.'},error.status||409);}
  };
}
