/** Bounded import from the official CC0 Wikidata JSON dump.
 * Uses HTTP byte ranges and Python's streaming bz2 reader, not the multi-TB
 * uncompressed dump in memory. Gameplay and CI never require a network import.
 */
import {mkdir,readFile,writeFile,rename,open,stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
const root=resolve(import.meta.dirname,'..'),cache=resolve(root,'.wikidata-cache'),out=resolve(root,'content/wikidata');
const argv=process.argv.slice(2),value=(key,fallback)=>{const i=argv.indexOf(key);return i<0?fallback:argv[i+1];};
const budget=Number(value('--bytes','134217728')),chunkSize=8388608;
if(!Number.isSafeInteger(budget)||budget<1048576||budget>1073741824)throw Error('Import byte budget must be between 1 MiB and 1 GiB.');
const url='https://dumps.wikimedia.org/wikidatawiki/entities/latest-all.json.bz2';
const userAgent='HoehenflugQuestionImporter/1.0 (https://github.com/foratstefan-design/mathelkprojekt1)';
const atomic=async(path,obj)=>{await writeFile(path+'.tmp',JSON.stringify(obj,null,2)+'\n');await rename(path+'.tmp',path);};
await mkdir(cache,{recursive:true});await mkdir(out,{recursive:true});
const dumpPath=resolve(cache,'head.json.bz2'),metaPath=resolve(cache,'dump-meta.json');
let metadata={url,license:'CC0-1.0',ranges:[]},offset=0;
try{metadata=JSON.parse(await readFile(metaPath,'utf8'));offset=(await stat(dumpPath)).size;}catch(error){if(error.code!=='ENOENT')throw error;}
if(offset&&metadata.bytes!==offset)throw Error('Cached dump length differs from metadata; use a fresh cache directory.');
if(argv.includes('--offline')&&offset<budget)throw Error('Offline cache is smaller than the requested byte budget.');
if(offset<budget){
  const file=await open(dumpPath,offset?'a':'w');
  try{while(offset<budget){
    const end=Math.min(budget-1,offset+chunkSize-1);
    const response=await fetch(url,{headers:{Range:'bytes='+offset+'-'+end,...(metadata.etag?{'If-Match':metadata.etag}:{}),'User-Agent':userAgent},signal:AbortSignal.timeout(45000)});
    if(response.status!==206)throw Error('Official dump range request failed: HTTP '+response.status);
    const etag=response.headers.get('etag');
    if(metadata.etag&&etag!==metadata.etag)throw Error('The dump changed during import; do not mix two snapshots.');
    const range=response.headers.get('content-range');
    if(!range?.startsWith('bytes '+offset+'-'+end+'/'))throw Error('Unexpected byte range.');
    const hash=createHash('sha256');let count=0;
    for await(const chunk of response.body){count+=chunk.length;if(count>end-offset+1)throw Error('Dump response exceeded the bounded range.');await file.write(chunk);hash.update(chunk);}
    if(count!==end-offset+1)throw Error('Truncated dump range.');
    metadata.ranges.push({start:offset,end,sha256:hash.digest('hex')});offset=end+1;
    metadata={...metadata,bytes:offset,etag,lastModified:response.headers.get('last-modified'),retrievedAt:new Date().toISOString()};
    await atomic(metaPath,metadata);console.log(JSON.stringify({downloadedMiB:offset/1048576,targetMiB:budget/1048576}));
  }}finally{await file.close();}
}
const hash=createHash('sha256');for await(const chunk of createReadStream(dumpPath))hash.update(chunk);metadata.sha256=hash.digest('hex');
await atomic(metaPath,metadata);
const extracted=resolve(cache,'extracted.json');
await new Promise((resolvePromise,reject)=>{const process=spawn('python3',[resolve(root,'scripts/extract-wikidata-dump.py'),'--input',dumpPath,'--output',extracted,'--retrieved-at',metadata.retrievedAt],{stdio:'inherit'});process.once('error',reject);process.once('exit',code=>code===0?resolvePromise():reject(Error('Dump extraction failed: '+code)));});
const data=JSON.parse(await readFile(extracted,'utf8'));
let labelCache={};try{labelCache=JSON.parse(await readFile(resolve(cache,'object-labels.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
const missing=[...new Set(data.facts.filter(f=>f.kind==='relation'&&!data.labels[f.objectId]&&!labelCache[f.objectId]?.label).map(f=>f.objectId))];
if(!argv.includes('--offline'))for(let i=0;i<missing.length;i+=50){
  const ids=missing.slice(i,i+50);
  const params=new URLSearchParams({action:'wbgetentities',ids:ids.join('|'),props:'labels|sitelinks',languages:'de|en',sitefilter:'dewiki',format:'json'});
  try{
    const response=await fetch('https://www.wikidata.org/w/api.php?'+params,{headers:{'User-Agent':userAgent,Accept:'application/json'},signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error('HTTP '+response.status);
    const payload=await response.json();
    if(payload.error)throw Error('Wikidata entity API error');
    for(const item of Object.values(payload.entities||{})){
      const label=item.labels?.de?.value||item.sitelinks?.dewiki?.title||item.labels?.en?.value;
      if(label&&!/^Q\d+$/.test(label))labelCache[item.id]={label,revisionId:item.lastrevid||null,retrievedAt:new Date().toISOString()};
    }
    await atomic(resolve(cache,'object-labels.json'),labelCache);
  }catch(error){console.log('Missing-label batch '+(i/50+1)+' skipped: '+error.message);}
  console.log(JSON.stringify({resolvedLabelBatches:Math.floor(i/50)+1,totalLabelBatches:Math.ceil(missing.length/50)}));
}
const facts=data.facts.map(f=>f.kind==='relation'?{...f,objectLabel:data.labels[f.objectId]||labelCache[f.objectId]?.label}:f).filter(f=>f.kind!=='relation'||f.objectLabel&&!/^Q\d+$/.test(f.objectLabel));
const snapshot={version:1,retrievedAt:metadata.retrievedAt,license:'CC0-1.0',endpoint:url,queries:[],dump:{...metadata,entitiesRead:data.entitiesRead,germanEntities:data.germanEntities},facts};
await atomic(resolve(out,'facts.json'),snapshot);
await atomic(resolve(out,'dump-manifest.json'),{...metadata,entitiesRead:data.entitiesRead,germanEntities:data.germanEntities,extractedFacts:data.facts.length,acceptedFacts:facts.length,missingLabels:data.facts.length-facts.length});
console.log(JSON.stringify({entities:data.entitiesRead,germanEntities:data.germanEntities,sourceFacts:facts.length,missingLabels:data.facts.length-facts.length,output:'content/wikidata/facts.json'}));
