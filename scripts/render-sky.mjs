/** Offline QA uses the actual Canvas2D draw commands; it never opens a browser. */
import { mkdir, writeFile } from 'node:fs/promises';
import { FlightScene } from '../public/sky.js';
import { skyHarness } from '../tests/helpers/sky-harness.js';
const folder=new URL('../qa/',import.meta.url);await mkdir(folder,{recursive:true});
const frames=[];
for(const [name,width,height,altitude,crashP,maneuver,course,transition] of [
  ['desktop-runway',1440,960,0,null],['desktop-climb',1440,960,2200,null],
  ['desktop-stratosphere',1440,960,22000,null],['mobile-runway',390,844,0,null],['mobile-flight',390,844,1800,null],['mobile-crash-fall',390,844,7000,.52],
  ['stall-dip',1440,960,3800,null,'stall'],['rescue-climb',1440,960,3800,null,'recover'],['mobile-stall',390,844,3800,null,'stall'],
  ['mix-easy-2999',960,720,2999,null,null,'mix'],['mix-medium-3000',960,720,3000,null,null,'mix'],
  ['mix-medium-5999',960,720,5999,null,null,'mix'],['mix-hard-6000',960,720,6000,null,null,'mix'],
  ['mix-transition-3000',960,720,2999,null,null,'mix',true],
  ['crash-smoke',1440,960,7000,.12],['crash-fall',1440,960,7000,.52],['crash-impact',1440,960,7000,1]
]){
  const h=skyHarness({width,height}),scene=new FlightScene(h.canvas);
  try{
    if(course)scene.setCourse(course);
    if(altitude){scene.setMode('flying');scene.setAltitude(altitude,{duration:0});}
    if(transition){scene.setAltitude(3000,{duration:100});h.advance(100);h.advance(350);}
    if(crashP!==null){scene.mode='crashed';scene.crashFrom=altitude+350;scene.crashP=crashP;}
    if(maneuver==='stall'){scene.setDanger(2);scene.stall(2);h.advance(450);}
    if(maneuver==='recover'){scene.setDanger(2);scene.recover();h.advance(400);}
    scene.g.commands.length=0;scene._render(0,0);const svg=h.svg(scene);await writeFile(new URL(name+'.svg',folder),svg);frames.push({name,width,height});
  }finally{scene.destroy();h.restore();}
}
await writeFile(new URL('contact-sheet.html',folder),`<!doctype html><html lang="en"><meta charset="utf-8"><title>Flight animation frames</title><style>body{background:#10243a;color:#d7e8e9;font:16px monospace;margin:28px}main{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:22px}figure{margin:0}img{width:100%;max-height:470px;object-fit:contain;background:#16304b;image-rendering:pixelated}figcaption{padding:10px}</style><h1>Höhenflug · offline motion frames</h1><p>Recorded from the real canvas renderer; these are animation checkpoints, not browser screenshots.</p><main>${frames.map(frame=>`<figure><img src="${frame.name}.svg" alt="${frame.name}"><figcaption>${frame.name} · ${frame.width}×${frame.height}</figcaption></figure>`).join('')}</main></html>`);
console.log('Recorded '+frames.length+' scene checkpoints in qa/.');
