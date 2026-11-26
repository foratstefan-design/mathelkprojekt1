import {cp, mkdir, rm, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const root=resolve(import.meta.dirname,'..');
/** Build only browser assets; solutions and database files stay on the server. */
export async function buildStatic({apiOrigin=process.env.GAME_API_ORIGIN||'',output=resolve(root,'dist')}={}){
  if(apiOrigin){
    const url=new URL(apiOrigin);
    if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw new Error('GAME_API_ORIGIN must be a public HTTPS origin without a path or credentials.');
    apiOrigin=url.origin;
  }
  await rm(output,{recursive:true,force:true});
  await mkdir(output,{recursive:true});
  await cp(resolve(root,'public'),output,{recursive:true});
  await writeFile(resolve(output,'runtime-config.js'),'// Public API origin; contains no credentials.\nexport const API_ORIGIN = '+JSON.stringify(apiOrigin)+';\n');
  await writeFile(resolve(output,'.nojekyll'),'');
  console.log('Static frontend built'+(apiOrigin?' with the public game API.':'. Configure /api/* proxy before publishing.'));
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await buildStatic();
