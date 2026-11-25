import {readFileSync,readdirSync} from 'node:fs';

export function applyTestSchema(sqlite){
  for(const name of readdirSync(new URL('../../migrations/',import.meta.url)).filter(name=>name.endsWith('.sql')&&!/seed/i.test(name)).sort()){
    sqlite.exec(readFileSync(new URL('../../migrations/'+name,import.meta.url),'utf8'));
  }
}
const hash=value=>{let n=2166136261;for(const c of value){n^=c.charCodeAt(0);n=Math.imul(n,16777619);}return n>>>0;};

/** Synthetic facts only test the catalog mechanics; they are never shipped as
 * playable data or counted as imported Wikidata records. */
export function seedTestCatalog(sqlite,{freeFamilies=96,dailyFamilies=80}={}){
  const fact=sqlite.prepare('INSERT OR IGNORE INTO question_fact_families(fact_key,family_id) VALUES(?,?)');
  const insert=sqlite.prepare('INSERT INTO question_catalog(id,family_id,type,difficulty,category,prompt_fingerprint,content_json,selection_key,pool) VALUES(?,?,?,?,?,?,?,?,?)');
  for(const pool of ['free','daily']){
    for(const group of pool==='daily'?['quantity','time']:['quantity','time','general']){
      const size=pool==='free'?freeFamilies:dailyFamilies;
      for(let i=0;i<size;i++){
        const family='fixture:'+pool+':'+group+':'+i;
        const difficulty=pool==='daily'?(i<Math.ceil(size*.75)?1:2):(i<Math.ceil(size*.75)?1:i<Math.ceil(size*.9375)?2:3);
        const keys=['test-fact:'+family];fact.run(keys[0],family);
        for(const type of group==='quantity'?['common','rare']:group==='time'?['earlier','later']:['general']){
          const id=family+':'+type;
          const options=[1,2,3,4].map(value=>({id:id+':'+value,label:'Testantwort '+value,value,displayValue:String(value)}));
          const correctId=options[type==='rare'||type==='earlier'?0:type==='general'?1:3].id;
          const q={id,familyId:family,type,difficulty,category:'Testthema '+i%8,prompt:'Synthetischer Vergleich '+family+' ('+type+')?',options,correctId,factKeys:keys,
            explanation:'Diese synthetische Erklärung gehört ausschließlich zu den automatischen Tests der Auswahl und ist kein Wissensinhalt des veröffentlichten Spiels.',source:{title:'Testdaten',url:'https://example.test/catalog'},basis:'curated',basisLabel:'Synthetischer Testvergleich'};
          insert.run(id,family,type,difficulty,q.category,'fingerprint:'+id,JSON.stringify(q),hash(id),pool);
        }
      }
    }
  }
  sqlite.prepare('INSERT OR REPLACE INTO question_catalog_meta(key,value) VALUES(?,?)').run('version','test-fixture-v1');
  sqlite.prepare('INSERT OR REPLACE INTO question_catalog_meta(key,value) VALUES(?,?)').run('updatedAt','2026-11-24T00:00:00Z');
  sqlite.prepare('INSERT OR REPLACE INTO question_catalog_meta(key,value) VALUES(?,?)').run('sourceFactCount','0');
}
