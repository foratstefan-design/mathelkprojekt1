import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {questions as legacyQuestions} from '../lib/questions.js';

const root=resolve(import.meta.dirname,'..');
const args=process.argv.slice(2);
const option=(name,fallback)=>{const at=args.indexOf(name);return at<0?fallback:args[at+1];};
const snapshotPath=resolve(root,option('--input','content/wikidata/facts.json'));
const source=JSON.parse(await readFile(snapshotPath,'utf8'));
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const norm=value=>String(value||'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').replace(/[^\p{L}\p{N}]+/gu,' ').trim();
const byKey=(a,b)=>a.key.localeCompare(b.key,'en');
const day=source.retrievedAt||new Date().toISOString();
const currentYear=new Date(day).getUTCFullYear();
if(source.license!=='CC0-1.0'||!Array.isArray(source.facts))throw Error('A documented CC0 Wikidata snapshot is required.');
const relationTemplates={
  P36:{prompt:label=>'Welche Stadt ist Hauptstadt oder Verwaltungssitz von '+label+'?',detail:'Hauptstadt oder Verwaltungssitz',note:'Bei Regionen und Gemeinden ist der Verwaltungssitz gemeint; er muss nicht die größte Stadt sein.'},
  P17:{prompt:label=>'In welchem Land liegt '+label+'?',detail:'Staat',note:'Die Zuordnung bezieht sich auf den Staat, in dem sich der genannte Ort befindet.'},
  P50:{prompt:label=>'Wer schrieb das Werk „'+label+'“?',detail:'Autor',note:'Gefragt ist nach der Urheberschaft des Werkes, nicht nach Übersetzung oder Verlag.'},
  P57:{prompt:label=>'Wer führte beim Film „'+label+'“ Regie?',detail:'Regie',note:'Regie bezeichnet die künstlerische Leitung der filmischen Umsetzung.'},
  P364:{prompt:label=>'Welche Originalsprache hat „'+label+'“?',detail:'Originalsprache',note:'Die Originalsprache kann sich von der Sprache einer Synchronfassung oder Übersetzung unterscheiden.'},
  P495:{prompt:label=>'Welches Ursprungsland ist für „'+label+'“ verzeichnet?',detail:'Ursprungsland',note:'Die Frage verwendet nur Werke mit einer eindeutigen Zuordnung in den übernommenen Angaben.'},
  P30:{prompt:label=>'Auf welchem Kontinent liegt '+label+'?',detail:'Kontinent',note:'Berücksichtigt werden nur Orte mit einer eindeutigen Kontinent-Zuordnung.'}
};
function goodLabel(label){return typeof label==='string'&&label.length>=2&&label.length<=100&&!/^Q\d+$/.test(label)&&!/[\n\r<>]/.test(label);}
// A matching property/unit alone does not make two subjects comparable. Keep
// rivers with rivers, buildings with buildings, and release dates with works.
function domainFor(f){
  const d=(f.subjectDescription||'').toLowerCase();
  if(f.propertyId==='P50'){
    // P50 also contains traditional attribution of sermons and sacred texts.
    // A written-work question needs an identifiable literary work/author.
    if(/gott|allah|jesus christus|fu xi/i.test(f.objectLabel||''))return null;
    return /roman|buch\b|novelle|gedicht|erzählung|drama|schauspiel|komödie|tragödie|epos|fabel|literarisch|literatur|enzyklopädie/.test(d)?'Literarische Werke':null;
  }
  if(['P17','P36'].includes(f.propertyId)){
    if(/sprache|dialekt|sprachig|sprachfamilie|film\b|roman\b/.test(d))return null;
    if(/bundesstaat|provinz|region|kreis|bezirk|grafschaft|departement|county|distrikt|oblast/.test(d))return 'Regionen';
    if(/staat\b|königreich|republik|country/.test(d))return 'Staaten';
    if(/stadt|dorf|gemeinde|siedlung|ort\b|city|village|town/.test(d))return 'Orte';
    if(f.propertyId==='P36')return null;
    if(/insel|island|gebirge|berg\b|gipfel|vulkan|meer|ozean|bucht|see\b|fluss|strom\b|nationalpark|schutzgebiet|bauwerk|kirche|turm|palast|schloss|burg\b|museum|brücke/.test(d))return 'Geografische Orte';
    return null;
  }
  if(f.propertyId==='P571'){
    if(/stadt|dorf|gemeinde|siedlung|city|village|town|hauptstadt/.test(d))return null; // incorporation is not necessarily first settlement
    if(/band|orchester|musikgruppe/.test(d))return 'Musikgruppen';
    if(/universität|hochschule|schule|institut|university/.test(d))return 'Bildungseinrichtungen';
    if(/unternehmen|firma|verlag|company/.test(d))return 'Unternehmen';
    if(/verein|verband|club|partei|organisation|stiftung/.test(d))return 'Organisationen';
    if(/museum|theater|bibliothek|oper|zeitung|zeitschrift|sender/.test(d))return 'Kultureinrichtungen';
    return null;
  }
  if(f.propertyId==='P577'){
    if(/lizenz|license/.test(d))return null; // version release is not original creation
    const statedYear=d.match(/(?:aus dem jahr|\()\s*((?:18|19|20)\d{2})\b/);
    if(statedYear&&Number(statedYear[1])!==f.value)return null;
    if(f.category==='Film')return 'Filme';
    if(f.category==='Literatur'||/roman|buch|gedicht|novelle|enzyklopädie|comic|manga/.test(d))return 'Literarische Werke';
    if(/album|single|lied|song|musikstück|oper\b|sinfonie/.test(d))return 'Musikwerke';
    if(/computerspiel|videospiel/.test(d))return 'Videospiele';
    if(/software|programmiersprache|auszeichnungssprache|betriebssystem|webbrowser/.test(d))return 'Software';
    return null;
  }
  if(f.propertyId==='P2048')return /turm|hochhaus|bauwerk|gebäude|denkmal|brücke|pyramide|kirche|kathedrale|basilika|moschee|statue|mauer|schloss|palast|festung|burg\b|stadion|bau in|dom\b/.test(d)?'Bauwerke':null;
  if(f.propertyId==='P2043'){
    if(/fluss|strom\b|river/.test(d))return 'Flüsse';
    if(/kanal|canal/.test(d))return 'Kanäle';
    if(/straße|strasse|autobahn|road/.test(d))return 'Straßen';
    if(/brücke|bridge/.test(d))return 'Brücken';
    if(/insel|island/.test(d))return 'Inseln';
    return null;
  }
  if(['P2044','P2046'].includes(f.propertyId)){
    if(/stadt|dorf|gemeinde|siedlung|city|village|town/.test(d))return 'Orte';
    if(/bundesstaat|provinz|region|kreis|bezirk|grafschaft|departement|county|distrikt|oblast/.test(d))return 'Regionen';
    if(/staat\b|königreich|republik|country/.test(d))return 'Staaten';
    if(/insel|island/.test(d))return 'Inseln';
    if(/gebirge|berg\b|gipfel|vulkan|mountain/.test(d))return 'Berge';
    if(/meer|ozean|bucht|ocean/.test(d))return 'Meere';
    if(/see\b|lake/.test(d))return 'Seen';
    if(/nationalpark|schutzgebiet|naturpark/.test(d))return 'Schutzgebiete';
    return null;
  }
  return f.category;
}
const historical=/deutsches reich|deutsches kaiserreich|römisches reich|weimarer republik|deutsche demokratische republik|byzantinisches reich|sowjetunion|kolonialreich|kaiserreich|dritte französische republik|ns.staat|nationalsozialistisch|großarmenien|rzeczpospolita|rum.seldschuken/i;
const rejected={invalid:0,multipleValues:0,ambiguousPrompt:0,notEnoughDistractors:0,leftoverComparisonFacts:0};
const groupsByFact=new Map();
for(const fact of source.facts){
  if(!/^Q\d+$/.test(fact.subjectId||'')||!/^P\d+$/.test(fact.propertyId||'')||!goodLabel(fact.subjectLabel)||!['relation','date','quantity'].includes(fact.kind)||!fact.sourceUrl?.startsWith('https://www.wikidata.org/wiki/')){rejected.invalid++;continue;}
  if(fact.kind==='relation'&&(!relationTemplates[fact.propertyId]||!goodLabel(fact.objectLabel)||!/^Q\d+$/.test(fact.objectId||''))){rejected.invalid++;continue;}
  if(fact.kind!=='relation'&&(!Number.isFinite(fact.value)||(fact.kind==='date'&&(!Number.isInteger(fact.value)||fact.value<1||fact.value>currentYear))||(fact.kind==='quantity'&&fact.value<=0))){rejected.invalid++;continue;}
  if((fact.propertyId==='P2046'&&fact.unit!=='km²')||(['P2044','P2048','P2043'].includes(fact.propertyId)&&fact.unit!=='m')){rejected.invalid++;continue;}
  if((fact.kind==='quantity'||['P17','P36'].includes(fact.propertyId))&&/fiktiv|fiktional|fictional/i.test(fact.subjectDescription||'')){rejected.invalid++;continue;}
  if(['P17','P36'].includes(fact.propertyId)&&(historical.test(fact.objectLabel)||/ehemalig|historisch|antike |abgegangen|aufgelöst/i.test(fact.subjectDescription||''))){rejected.invalid++;continue;}
  const domain=domainFor(fact);
  if(!domain){rejected.invalid++;continue;}
  const key=fact.key||'wd:'+fact.subjectId+':'+fact.propertyId+':'+(fact.scope||'value');
  if(!key.startsWith('wd:')){rejected.invalid++;continue;}
  const item={...fact,key,domain,category:fact.category||'Weltwissen',scope:fact.scope||'value',sitelinks:Number(fact.sitelinks)||0};
  if(!groupsByFact.has(key))groupsByFact.set(key,[]);groupsByFact.get(key).push(item);
}
const facts=[];
for(const rows of groupsByFact.values()){
  const values=new Set(rows.map(f=>f.kind==='relation'?f.objectId:String(f.value)+'|'+f.unit));
  if(values.size!==1){rejected.multipleValues+=rows.length;continue;}
  facts.push(rows.sort((a,b)=>b.sitelinks-a.sitelinks)[0]);
}
facts.sort(byKey);
const byFact=new Map(facts.map(f=>[f.key,f]));
let registry={version:1,groups:[]};
try{registry=JSON.parse(await readFile(resolve(root,'content/question-groups.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const usedFacts=new Set(registry.groups.flatMap(g=>g.factKeys));
if(usedFacts.size!==registry.groups.reduce((n,g)=>n+g.factKeys.length,0))throw Error('Existing grouping assigns a fact to more than one family.');
const newGroup=(kind,rows)=>{
  const keys=rows.map(f=>f.key).sort();
  const id=kind==='relation'?keys[0]:'wdg:'+digest(keys).slice(0,24);
  registry.groups.push({familyId:id,kind,factKeys:keys,pool:kind==='relation'?'free':(parseInt(digest(id).slice(0,8),16)%2===0?'daily':'free')});
  keys.forEach(key=>usedFacts.add(key));
};
const relations=facts.filter(f=>f.kind==='relation');
const promptTargets=new Map();
for(const f of relations){const prompt=norm(relationTemplates[f.propertyId].prompt(f.subjectLabel));if(!promptTargets.has(prompt))promptTargets.set(prompt,[]);promptTargets.get(prompt).push(f);}
const acceptedRelationKeys=new Set();
for(const rows of promptTargets.values()){
  // Different books/films sharing a title are ambiguous without a disambiguator.
  if(new Set(rows.map(f=>f.objectId)).size>1){rejected.ambiguousPrompt+=rows.length;continue;}
  acceptedRelationKeys.add(rows.sort((a,b)=>b.sitelinks-a.sitelinks||byKey(a,b))[0].key);
}
for(const fact of relations.filter(f=>acceptedRelationKeys.has(f.key)&&!usedFacts.has(f.key)))newGroup('relation',[fact]);
const comparisonBuckets=new Map();
for(const fact of facts.filter(f=>f.kind!=='relation'&&!usedFacts.has(f.key))){
  const bucket=[fact.kind,fact.propertyId,fact.category,fact.domain,fact.unit||'',fact.scope].join('|');
  if(!comparisonBuckets.has(bucket))comparisonBuckets.set(bucket,[]);comparisonBuckets.get(bucket).push(fact);
}
for(const bucket of [...comparisonBuckets.keys()].sort()){
  const remaining=comparisonBuckets.get(bucket).sort((a,b)=>b.sitelinks-a.sitelinks||byKey(a,b));
  while(remaining.length>=4){
    const selected=[remaining.shift()];
    for(let i=0;i<remaining.length&&selected.length<4;){
      const candidate=remaining[i];
      if(selected.every(f=>f.value!==candidate.value&&norm(f.subjectLabel)!==norm(candidate.subjectLabel))){selected.push(candidate);remaining.splice(i,1);}else i++;
    }
    if(selected.length===4)newGroup(selected[0].kind,selected);
    else{rejected.leftoverComparisonFacts+=selected.length+remaining.length;remaining.length=0;}
  }
  rejected.leftoverComparisonFacts+=remaining.length;
}
const provenance=f=>({subjectId:f.subjectId,propertyId:f.propertyId,statementId:f.statementId||null,scope:f.scope,revisionId:f.revisionId||null,retrievedAt:f.retrievedAt||day,url:f.sourceUrl,claimVersionKey:digest({key:f.key,value:f.objectId||f.value,unit:f.unit,scope:f.scope})});
const sourceFor=f=>({title:'Wikidata · '+f.subjectLabel,url:f.revisionId?'https://www.wikidata.org/w/index.php?title='+f.subjectId+'&oldid='+f.revisionId:f.sourceUrl});
const scopeLabel=f=>({P577:'Veröffentlichungsjahr',P571:'Entstehungsjahr',P2044:'Meereshöhe',P2048:'Bauwerkshöhe',P2046:'Fläche',P2043:'Länge',P1082:'Einwohnerzahl'}[f.propertyId]||f.category);

const relationObjects=new Map();
for(const f of relations.filter(f=>acceptedRelationKeys.has(f.key))){
  const key=f.propertyId+'|'+f.category+(f.propertyId==='P36'?'|'+f.domain:'');
  if(!relationObjects.has(key))relationObjects.set(key,new Map());
  relationObjects.get(key).set(f.objectId,{id:f.objectId,label:f.objectLabel});
}
function optionsFor(f,family){
  const candidates=[...(relationObjects.get(f.propertyId+'|'+f.category+(f.propertyId==='P36'?'|'+f.domain:''))?.values()||[])].filter(o=>o.id!==f.objectId&&norm(o.label)!==norm(f.objectLabel));
  let cursor=parseInt(digest(family).slice(0,8),16)>>>0;
  const sampled=[];
  for(let i=0;i<Math.min(24,candidates.length*2);i++){cursor=(Math.imul(cursor,1664525)+1013904223)>>>0;sampled.push(candidates[cursor%candidates.length]);}
  const labels=new Set([norm(f.objectLabel)]),wrong=[];
  for(const item of [...sampled,...candidates]){if(!item||labels.has(norm(item.label)))continue;labels.add(norm(item.label));wrong.push(item);if(wrong.length===3)break;}
  if(wrong.length<3)return null;
  const items=[{id:f.objectId,label:f.objectLabel},...wrong].sort((a,b)=>digest(family+a.id+':order').localeCompare(digest(family+b.id+':order')));
  return items.map((o,i)=>({id:'choice-'+o.id,label:o.label,value:i,displayValue:o.id===f.objectId?'Richtige Zuordnung':'Andere Auswahl'}));
}
const legacyByFamily=new Map();
for(const q of legacyQuestions){if(!legacyByFamily.has(q.familyId))legacyByFamily.set(q.familyId,new Set());const names=legacyByFamily.get(q.familyId);for(const o of q.options){const n=norm(o.label);if(n.length>=5)names.add(n);}names.add(norm(q.prompt));}
const legacyAliases=new Map();
for(const group of registry.groups){
  const names=group.factKeys.map(k=>byFact.get(k)?.subjectLabel).filter(Boolean).map(label=>norm(label.replace(/\([^)]*\)/g,''))).filter(n=>n.length>=5);
  for(const [oldFamily,oldLabels] of legacyByFamily){
    if(names.some(name=>[...oldLabels].some(old=>old.includes(name)||name.includes(old)&&old.length>=8))){
      if(!legacyAliases.has(oldFamily))legacyAliases.set(oldFamily,new Set());legacyAliases.get(oldFamily).add(group.familyId);group.pool='free';
    }
  }
}
const catalog=[],promptFingerprints=new Set();
for(const group of registry.groups){
  const members=group.factKeys.map(key=>byFact.get(key));
  if(members.some(f=>!f))continue;
  const first=members[0],factsMeta=members.map(provenance),links=Math.min(...members.map(f=>f.sitelinks));
  let difficulty=links>=60?1:links>=25?2:3;
  if(first.kind==='quantity'){
    const entryThreshold=first.domain==='Orte'?150:100;
    difficulty=links>=entryThreshold?1:links>=25?2:3;
  }
  if(group.kind==='relation'){
    difficulty=links>=80?1:links>=30?2:3;
    if(['P57','P364','P495'].includes(first.propertyId))difficulty=Math.max(2,difficulty);
    if(first.propertyId==='P36'&&!/staat\b|königreich|republik|country/i.test(first.subjectDescription||''))difficulty=3;
  }
  if(first.propertyId==='P571')difficulty=Math.max(2,difficulty);
  const base={familyId:group.familyId,factKeys:group.factKeys,category:first.category,difficulty,source:sourceFor(first),relatedSources:members.slice(1).map(sourceFor),basis:'wikidata',basisLabel:'Wikidata · '+first.category+(first.kind==='quantity'?' · '+first.unit:''),provenance:{license:'CC0-1.0',retrievedAt:day,facts:factsMeta}};
  const variants=[];
  if(group.kind==='relation'){
    const options=optionsFor(first,group.familyId);
    if(!options){rejected.notEnoughDistractors++;continue;}
    const template=relationTemplates[first.propertyId];
    variants.push({...base,type:'general',prompt:template.prompt(first.subjectLabel),options,correctId:'choice-'+first.objectId,explanation:first.subjectLabel+' → '+template.detail+': '+first.objectLabel+'. '+template.note});
  }else{
    const number=value=>value.toLocaleString('de-DE',{maximumFractionDigits:3});
    const options=members.map(f=>({id:'choice-'+f.subjectId,label:f.subjectLabel,value:f.value,displayValue:group.kind==='date'?String(f.value):number(f.value)+' '+f.unit}));
    const sorted=[...options].sort((a,b)=>a.value-b.value),names=options.map(o=>o.label).join(' · ');
    for(const type of group.kind==='date'?['earlier','later']:['common','rare']){
      const smallest=type==='earlier'||type==='rare',correct=smallest?sorted[0]:sorted.at(-1);
      const predicate=group.kind==='date'?(first.propertyId==='P577'?(smallest?'Welches dieser Werke wurde zuerst veröffentlicht?':'Welches dieser Werke wurde zuletzt veröffentlicht?'):(smallest?'Welche dieser Einrichtungen wurde zuerst gegründet?':'Welche dieser Einrichtungen wurde zuletzt gegründet?')):(smallest?'Wo ist die angegebene '+scopeLabel(first)+' am kleinsten?':'Wo ist die angegebene '+scopeLabel(first)+' am größten?');
      variants.push({...base,type,prompt:names+': '+predicate,options,correctId:correct.id,
        basisLabel:'Wikidata · '+scopeLabel(first)+(first.propertyId==='P577'?' (früheste erfasste Angabe)':'')+(group.kind==='quantity'?' · '+first.unit:''),
        explanation:sorted.map(o=>o.label+': '+o.displayValue).join(' · ')+'. '+(group.kind==='date'?'Verglichen werden die in den Quellen bezeichneten Ereignisjahre.':'Alle vier Werte beziehen sich auf dieselbe Eigenschaft und sind in derselben Einheit angegeben.')});
    }
  }
  for(const question of variants){
    const promptFingerprint=digest(norm(question.prompt));
    if(promptFingerprints.has(promptFingerprint))throw Error('Duplicate visible question: '+question.prompt);
    promptFingerprints.add(promptFingerprint);
    question.id='wd-'+digest(group.familyId).slice(0,24)+'-'+question.type;
    catalog.push({question,pool:group.pool,promptFingerprint,selectionKey:parseInt(digest(question.id).slice(0,8),16)});
  }
}
if(catalog.length<1000&&!args.includes('--allow-small'))throw Error('Refusing a tiny production catalog: '+catalog.length+' questions.');
// Data is deliberately separate from schema migrations. Each JSONL batch is
// validated and imported through bound statements by the local loader or the
// authenticated hosting importer; it is never exposed as a browser asset.
const batches=[];
function batchesFor(table,columns,rows){
  let batch=[];
  const flush=()=>{if(batch.length){batches.push({table,rows:batch});batch=[];}};
  for(const row of rows){
    const value=Object.fromEntries(columns.map((column,i)=>[column,row[i]]));
    if(batch.length>=50||Buffer.byteLength(JSON.stringify({table,rows:[...batch,value]}))>400000)flush();
    batch.push(value);
  }
  flush();
}
const activeFamilies=new Set(catalog.map(row=>row.question.familyId));
// A refresh must also retire previously published rows rejected by new quality
// filters. Keep them disabled for old snapshots/history and cold-start imports.
let previousRows=[];
try{previousRows=(await readFile(resolve(root,'content/catalog-import.jsonl'),'utf8')).trim().split('\n').filter(Boolean).map(line=>JSON.parse(line)).filter(b=>b.table==='question_catalog').flatMap(b=>b.rows);}catch(error){if(error.code!=='ENOENT')throw error;}
const activeRows=catalog.map(({question:q,pool,promptFingerprint,selectionKey})=>({id:q.id,family_id:q.familyId,type:q.type,difficulty:q.difficulty,category:q.category,prompt_fingerprint:promptFingerprint,content_json:JSON.stringify(q),selection_key:selectionKey,pool,enabled:1}));
const activeIds=new Set(activeRows.map(row=>row.id));
const retiredRows=previousRows.filter(row=>!activeIds.has(row.id)).map(row=>({...row,enabled:0}));
const activeMappings=registry.groups.filter(g=>activeFamilies.has(g.familyId)).flatMap(g=>g.factKeys.map(key=>[key,g.familyId]));
const mappings=[...new Map([...activeMappings,...retiredRows.flatMap(row=>JSON.parse(row.content_json).factKeys.map(key=>[key,row.family_id]))].map(pair=>[pair[0],pair])).values()];
batchesFor('question_fact_families',['fact_key','family_id'],mappings);
const aliases=[...legacyAliases].flatMap(([old,targets])=>[...targets].filter(f=>activeFamilies.has(f)).map(f=>[old,f]));
batchesFor('question_family_aliases',['alias_family_id','family_id'],aliases);
const catalogColumns=['id','family_id','type','difficulty','category','prompt_fingerprint','content_json','selection_key','pool','enabled'];
batchesFor('question_catalog',catalogColumns,[...retiredRows,...activeRows].map(row=>catalogColumns.map(column=>row[column])));
const version=digest(catalog.map(row=>row.question));
batchesFor('question_catalog_meta',['key','value'],[['updatedAt',day],['sourceFactCount',String(facts.length)],['source','Wikidata (CC0)'],['version',version]]);
await mkdir(resolve(root,'content'),{recursive:true});
await writeFile(resolve(root,'content/catalog-import.jsonl'),batches.map(b=>JSON.stringify(b)).join('\n')+'\n');
const countBy=fn=>Object.fromEntries([...new Set(catalog.map(fn))].sort().map(key=>[key,catalog.filter(row=>fn(row)===key).length]));
const report={version,source:'Wikidata (CC0)',updatedAt:day,downloadedFacts:source.facts.length,acceptedFacts:facts.length,sourceFactsUsed:new Set(activeMappings.map(row=>row[0])).size,questions:catalog.length,families:activeFamilies.size,retiredQuestions:retiredRows.length,freeFamilies:new Set(catalog.filter(r=>r.pool==='free').map(r=>r.question.familyId)).size,dailyFamilies:new Set(catalog.filter(r=>r.pool==='daily').map(r=>r.question.familyId)).size,types:countBy(r=>r.question.type),difficulties:countBy(r=>r.question.difficulty),categories:countBy(r=>r.question.category),pools:countBy(r=>r.pool),legacyAliases:aliases.length,rejected,importBatches:batches.length,largestBatchBytes:Math.max(...batches.map(b=>Buffer.byteLength(JSON.stringify(b)))),sourceSnapshotSha256:digest(await readFile(snapshotPath,'utf8'))};
await writeFile(resolve(root,'content/question-groups.json'),JSON.stringify(registry,null,2)+'\n');
await writeFile(resolve(root,'content/catalog-report.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
