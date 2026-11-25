import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(import.meta.dirname,'..');
const output=resolve(root,'content/wikidata');
export const WIKIDATA_ENDPOINT='https://query.wikidata.org/sparql';
const userAgent='HoehenflugQuestionImporter/1.0 (https://github.com/foratstefan-design/mathelkprojekt1)';
const qid=value=>value?.match(/\/(Q\d+)$/)?.[1];
const validLabel=value=>typeof value==='string'&&value.trim().length>1&&!/^Q\d+$/.test(value)&&value.length<180;

/** Queries use best-rank truthy claims and reject ambiguous relation values.
 * Dates are explicitly the earliest best-rank date with at least year precision.
 * Sitelinks select recognisable entities; they are never quiz answer values. */
export function buildWikidataQuery(def,limit=6000,options={}){
  if(!Number.isSafeInteger(limit)||limit<1||limit>50000)throw Error('Wikidata limit must be 1–50000');
  const p=def.property;
  if(!/^P\d+$/.test(p))throw Error('Invalid Wikidata property');
  const classClause=def.classId?' ?item wdt:P31 wd:'+def.classId+' .':def.classIds?' VALUES ?class { '+def.classIds.map(id=>'wd:'+id).join(' ')+' } ?item wdt:P31 ?class .':'';
  const coordinates=def.coordinates?' ?item wdt:P625 ?coordinates .':'';
  const germanArticle=' ?article schema:about ?item ; schema:isPartOf <https://de.wikipedia.org/> .';
  // Set WIKIDATA_ORDERING=none to avoid an expensive global popularity sort.
  // The minimum sitelink filter and German Wikipedia requirement still apply.
  const order=options.orderBy==='none'?'':' ORDER BY DESC(?links) ?item';
  const tail=order+' LIMIT '+limit;
  const labelService=' SERVICE wikibase:label { bd:serviceParam wikibase:language "de,en". } ';
  if(def.kind==='relation'){
    const inner='SELECT DISTINCT ?item ?value ?links WHERE { ?item wdt:'+p+' ?value ; wikibase:sitelinks ?links . FILTER(?links >= '+def.minimumLinks+') FILTER(isIRI(?value)) FILTER(?item != ?value) FILTER NOT EXISTS { ?item wdt:'+p+' ?other . FILTER(?other != ?value) } '+classClause+coordinates+germanArticle+' }'+tail;
    return 'SELECT ?item ?itemLabel ?value ?valueLabel ?links WHERE { { '+inner+' } '+labelService+' }'+order;
  }
  if(def.kind==='date'){
    const asOf=options.asOf?new Date(options.asOf):new Date();
    if(!Number.isFinite(asOf.getTime()))throw Error('Invalid import reference date');
    const yearCeiling=asOf.getUTCFullYear()+1;
    const inner='SELECT ?item (MIN(?date) AS ?value) (MAX(?sitelinks) AS ?links) WHERE { ?item p:'+p+' ?statement ; wikibase:sitelinks ?sitelinks . ?statement a wikibase:BestRank ; psv:'+p+' ?node . ?node wikibase:timeValue ?date ; wikibase:timePrecision ?precision . FILTER(?precision >= 9) FILTER(?sitelinks >= '+def.minimumLinks+') '+classClause+germanArticle+' FILTER(?date >= "1000-01-01T00:00:00Z"^^xsd:dateTime && ?date < "'+yearCeiling+'-01-01T00:00:00Z"^^xsd:dateTime && ?date <= NOW()) } GROUP BY ?item'+tail;
    return 'SELECT ?item ?itemLabel ?value ?links WHERE { { '+inner+' } '+labelService+' }'+order;
  }
  const inner='SELECT DISTINCT ?item ?value ?unit ?statement ?links WHERE { ?item p:'+p+' ?statement ; wikibase:sitelinks ?links . ?statement a wikibase:BestRank ; ps:'+p+' ?value ; psv:'+p+' ?node . ?node wikibase:quantityUnit ?unit . FILTER(?links >= '+def.minimumLinks+') FILTER(?value > 0) FILTER NOT EXISTS { ?item wdt:'+p+' ?other . FILTER(?other != ?value) } '+classClause+coordinates+germanArticle+' }'+tail;
  return 'SELECT ?item ?itemLabel ?value ?unit ?statement ?links WHERE { { '+inner+' } '+labelService+' }'+order;
}

/** Converts a WDQS binding to the compiler contract. No guessed labels/values. */
export function normalizeWikidataRow(row,def,retrievedAt){
  const subjectId=qid(row.item?.value),subjectLabel=row.itemLabel?.value?.trim();
  if(!subjectId||!validLabel(subjectLabel))return null;
  const fact={key:'wd:'+subjectId+':'+def.property+':'+def.scope,subjectId,subjectLabel,propertyId:def.property,kind:def.kind,category:def.category,scope:def.scope,sitelinks:Number(row.links?.value||0),sourceUrl:'https://www.wikidata.org/wiki/'+subjectId,statementId:row.statement?.value||null,sourceQuery:def.id,retrievedAt};
  if(def.kind==='relation'){
    const objectId=qid(row.value?.value),objectLabel=row.valueLabel?.value?.trim();
    if(!objectId||!validLabel(objectLabel)||subjectLabel===objectLabel)return null;
    return {...fact,objectId,objectLabel};
  }
  if(def.kind==='date'){
    const match=row.value?.value?.match(/^(\d{4})-/);
    if(!match)return null;
    return {...fact,value:Number(match[1]),unit:'year',dateValue:row.value.value};
  }
  const unitId=qid(row.unit?.value),amount=Number(row.value?.value);
  // metres and square kilometres are the only canonical quantity dimensions.
  const conversion={Q11573:['m',1],Q828224:['m',1000],Q174728:['m',.01],Q174789:['m',.001],Q3710:['m',.3048],Q25343:['km²',.000001],Q712226:['km²',1],Q35852:['km²',.01]};
  const convert=conversion[unitId];
  if(!convert||!Number.isFinite(amount)||amount<=0)return null;
  const [unit,factor]=convert;
  return {...fact,value:amount*factor,unit,originalAmount:amount,originalUnit:unitId};
}

export function parseWikidataBindings(data,def,retrievedAt){
  if(!Array.isArray(data.results?.bindings))throw Error('Wikidata response has no bindings');
  const candidates=new Map(),conflicts=new Set();
  const signature=f=>JSON.stringify([f.objectId??null,f.value??null,f.unit??null]);
  for(const row of data.results.bindings){
    const fact=normalizeWikidataRow(row,def,retrievedAt);if(!fact)continue;
    const prior=candidates.get(fact.key);
    if(prior&&signature(prior)!==signature(fact))conflicts.add(fact.key);else candidates.set(fact.key,fact);
  }
  return [...candidates.values()].filter(f=>!conflicts.has(f.key));
}

async function atomicWrite(path,value){
  const temporary=path+'.tmp-'+process.pid;
  await writeFile(temporary,value);
  await rename(temporary,path);
}
const sha256=value=>createHash('sha256').update(value).digest('hex');

export async function importWikidata(args=process.argv.slice(2)){
  const retrievedAt=new Date().toISOString();
  const limit=Number(process.env.WIKIDATA_QUERY_LIMIT||6000);
  const orderBy=process.env.WIKIDATA_ORDERING==='none'?'none':'sitelinks';
  const definitions=JSON.parse(await readFile(resolve(output,'queries.json'),'utf8'));
  const selected=args.filter(a=>!a.startsWith('--'));
  const force=args.includes('--refresh'),offline=args.includes('--offline');
  await mkdir(resolve(output,'raw'),{recursive:true});
  let prior={queries:[],facts:[]};
  try{prior=JSON.parse(await readFile(resolve(output,'facts.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
  const facts=new Map(prior.facts.map(f=>[f.key,f]));
  const queries=new Map(prior.queries.map(q=>[q.key,q]));
  async function save(){
    const payload={version:1,retrievedAt,license:'CC0-1.0',endpoint:WIKIDATA_ENDPOINT,queries:[...queries.values()],facts:[...facts.values()]};
    await atomicWrite(resolve(output,'facts.json'),JSON.stringify(payload,null,2)+'\n');
  }
  for(const def of definitions.filter(d=>!selected.length||selected.includes(d.id))){
    const query=buildWikidataQuery(def,limit,{orderBy});
    const querySha256=sha256(query);
    const rawPath=resolve(output,'raw',def.id+'.json');
    const metaPath=resolve(output,'raw',def.id+'.meta.json');
    let raw,downloaded=false,cachedRaw,cachedMeta;
    try{cachedRaw=await readFile(rawPath,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    try{cachedMeta=JSON.parse(await readFile(metaPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
    // The first importer version put cache metadata in facts.json. Accept that
    // format only when its query AND raw-body hash exactly match this request.
    cachedMeta||=queries.get(def.id);
    if(!force&&cachedRaw&&cachedMeta?.query===query&&cachedMeta.sha256===sha256(cachedRaw))raw=cachedRaw;
    else if(cachedRaw)console.log('Cache query/body mismatch for '+def.id+'; old raw data retained until a fresh response succeeds.');
    if(!raw&&!offline){
      console.log('Fetching '+def.id+' ...');
      for(let attempt=0;attempt<2;attempt++){
        try{
          const response=await fetch(WIKIDATA_ENDPOINT+'?format=json&query='+encodeURIComponent(query),{headers:{'User-Agent':userAgent,Accept:'application/sparql-results+json'},signal:AbortSignal.timeout(30000)});
          if(!response.ok)throw Error('HTTP '+response.status);
          const candidate=await response.text();
          const parsed=JSON.parse(candidate);
          if(!Array.isArray(parsed.results?.bindings))throw Error('Response has no bindings');
          // Invalid/truncated responses never overwrite a prior usable cache.
          raw=candidate;downloaded=true;break;
        }catch(error){console.log(def.id+' attempt '+(attempt+1)+': '+error.message);if(attempt===0)await new Promise(r=>setTimeout(r,2000));}
      }
    }
    if(!raw){console.log('Skipped unavailable or stale query '+def.id);continue;}
    const responseRetrievedAt=downloaded?new Date().toISOString():cachedMeta.retrievedAt;
    const parsed=JSON.parse(raw),accepted=parseWikidataBindings(parsed,def,responseRetrievedAt);
    const rawSha256=sha256(raw);
    if(downloaded){
      // Preserve previous query evidence instead of silently relabelling it.
      if(cachedRaw&&sha256(cachedRaw)!==rawSha256){
        const historical=def.id+'-previous-'+sha256(cachedRaw).slice(0,12);
        await atomicWrite(resolve(output,'raw',historical+'.json'),cachedRaw);
        if(cachedMeta)await atomicWrite(resolve(output,'raw',historical+'.meta.json'),JSON.stringify(cachedMeta,null,2)+'\n');
      }
      await atomicWrite(rawPath,raw);
    }
    const metadata={key:def.id,query,querySha256,count:parsed.results.bindings.length,accepted:accepted.length,sha256:rawSha256,retrievedAt:responseRetrievedAt,rawFile:'raw/'+def.id+'.json',downloaded,license:'CC0-1.0'};
    await atomicWrite(metaPath,JSON.stringify(metadata,null,2)+'\n');
    // Refresh a completed dataset as a unit. Do not retain stale items that no
    // longer pass new class/German-article/ambiguity filters.
    const oldKeys=new Set(cachedRaw?parseWikidataBindings(JSON.parse(cachedRaw),def,responseRetrievedAt).map(f=>f.key):[]);
    for(const [key,fact] of facts)if(fact.sourceQuery===def.id||(!fact.sourceQuery&&oldKeys.has(key)))facts.delete(key);
    for(const fact of accepted)facts.set(fact.key,fact);
    queries.set(def.id,metadata);
    await save();
    console.log(JSON.stringify({query:def.id,rows:parsed.results.bindings.length,accepted:accepted.length,totalFacts:facts.size,downloaded}));
    if(downloaded)await new Promise(r=>setTimeout(r,350));
  }
  await save();
  console.log(JSON.stringify({facts:facts.size,queries:queries.size,output:'content/wikidata/facts.json'}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await importWikidata();
