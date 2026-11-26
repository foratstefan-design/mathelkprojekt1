/** Compile original school and culture questions into the immutable catalog.
 * Kept on the server/tooling side: answer keys never enter the Pages artifact.
 */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['school-stem.json','school-nature.json','school-humanities.json','school-extra.json','culture-literature-music.json','culture-beliefs.json','culture-everyday.json'];
const digest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const normalized=value=>String(value).normalize('NFKC').toLocaleLowerCase('de-DE').replace(/ß/g,'ss').replace(/[^\p{L}\p{N}]+/gu,' ').trim();

export async function loadSchoolCatalog(){
  const input=(await Promise.all(files.map(file=>readFile(new URL('../content/'+file,import.meta.url),'utf8').then(JSON.parse)))).flat();
  const ids=new Set(),prompts=new Set();
  return input.map(item=>{
    if(!/^[a-z0-9-]+$/.test(item.id)||ids.has(item.id))throw Error('School question IDs must be unique and stable: '+item.id);
    ids.add(item.id);
    const answerKey=value=>String(value).normalize('NFKC').replace(/\s+/g,' ').trim();
    if(![1,2,3].includes(item.difficulty)||!item.category||!item.prompt||item.prompt.length>500||!Array.isArray(item.answers)||item.answers.length!==4||item.answers.some(a=>typeof a!=='string'||!a.trim()||a.length>240)||new Set(item.answers.map(answerKey)).size!==4)throw Error('Invalid school question: '+item.id);
    if(!item.explanation||item.explanation.length<40||!item.source?.title||!item.source.url?.startsWith('https://'))throw Error('A learning explanation and source are required: '+item.id);
    const promptFingerprint=digest(normalized(item.prompt));
    if(prompts.has(promptFingerprint))throw Error('Duplicate school prompt: '+item.prompt);
    prompts.add(promptFingerprint);
    const basis=item.basis||'school';
    if(!['school','curated'].includes(basis))throw Error('Unknown editorial source: '+item.id);
    const prefix=basis==='school'?'school':'curated';
    const familyId=prefix+':'+item.id,id=prefix+'-'+item.id;
    const choices=item.answers.map((label,index)=>({id:'choice-'+digest(id+':'+label).slice(0,16),label,value:index,displayValue:index===0?'Richtige Antwort':'Andere Auswahl'}));
    const correctId=choices[0].id;
    choices.sort((a,b)=>digest(id+':'+a.id).localeCompare(digest(id+':'+b.id)));
    const levels=basis==='school'?['Klassen 7–9: Grundlagen','Klassen 9–11: Zusammenhänge','Oberstufe: Anwendung und Transfer']:['Vertraute Grundlagen','Wissen und Zusammenhänge','Vertiefung und Anwendung'];
    const question={id,familyId,factKeys:[familyId],type:'general',category:item.category,difficulty:item.difficulty,prompt:item.prompt,options:choices,correctId,explanation:item.explanation,source:item.source,relatedSources:item.relatedSources||[],basis,basisLabel:(basis==='school'?'Schulwissen':'Wissen')+' · '+item.category,provenance:{kind:basis==='school'?'original-school-question':'original-curated-question',reviewedAt:'2026-11-26',sources:[item.source],difficultyBasis:levels[item.difficulty-1]}};
    // A stable hash assigns the pool once; adding other questions cannot move
    // existing facts between pools and bypass their permanent exposure ledger.
    return {question,pool:parseInt(digest(familyId).slice(0,2),16)%2?'daily':'free',promptFingerprint,selectionKey:parseInt(digest(id).slice(0,8),16)};
  });
}
