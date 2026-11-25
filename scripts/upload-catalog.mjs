/** Owner-only data upload. Read a short-lived catalog import token from hidden
 * stdin; never put credentials in a URL, process arguments or repository file. */
import {createReadStream} from 'node:fs';
import {createInterface} from 'node:readline';
import {resolve} from 'node:path';
const base=process.argv[2];
if(!base||new URL(base).protocol!=='https:')throw Error('Usage: node --use-env-proxy scripts/upload-catalog.mjs https://YOUR-GAME');
console.log('Ready for catalog import token on stdin (input hidden).');
const input=createInterface({input:process.stdin});
const token=await new Promise(resolve=>input.once('line',line=>{input.close();resolve(line.trim());}));
if(token.length<32)throw Error('A configured catalog import token is required.');
let batches=0,rows=0;
const inputArg=process.argv.indexOf('--input');
const inputPath=inputArg<0?new URL('../content/catalog-import.jsonl',import.meta.url):resolve(process.argv[inputArg+1]);
for await(const line of createInterface({input:createReadStream(inputPath),crlfDelay:Infinity})){
  if(!line.trim())continue;
  const payload=JSON.parse(line);
  let success=false;
  for(let attempt=0;attempt<3;attempt++){
    const response=await fetch(new URL('/api/admin/catalog/import',base),{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:line,signal:AbortSignal.timeout(30000)});
    if(response.ok){await response.json();success=true;break;}
    if(response.status<500)throw Error('Catalog batch '+(batches+1)+' rejected: HTTP '+response.status);
  }
  if(!success)throw Error('Catalog batch '+(batches+1)+' failed; safe to rerun the idempotent upload.');
  batches++;rows+=payload.rows.length;
  if(batches%25===0)console.log(JSON.stringify({batches,rows}));
}
console.log(JSON.stringify({uploaded:true,batches,rows}));
