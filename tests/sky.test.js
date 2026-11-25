import test from 'node:test';
import assert from 'node:assert/strict';
import {FlightScene} from '../public/sky.js';
import {plane,hero,PLANE_SPRITE,PLANE_PALETTE} from '../public/art.js';
import {skyHarness} from './helpers/sky-harness.js';
const close=(a,b,tolerance=.001)=>assert.ok(Math.abs(a-b)<=tolerance,`${a} ≈ ${b}`);
const cssY=(scene,y)=>y*scene.cssHeight/scene.h;
const options={timeout:2000};
function ready(scene,altitude=3000){scene.setMode('flying');scene.setAltitude(altitude,{duration:0});}

 test('the pixel camera moves terrain downward during ascent and remains finite at fantasy heights',()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    assert.equal(h.canvas.width,2560);assert.equal(h.canvas.attrs['aria-hidden'],'true');
    assert.ok(scene.groundY<scene.h);const ground=scene.groundY;
    scene.setMode('flying');scene.setAltitude(1800,{duration:1000});h.advance(500);
    assert.ok(scene.altitude>0&&scene.altitude<1800);assert.ok(scene.groundY>ground);
    h.advance(500);assert.equal(scene.altitude,1800);assert.ok(scene.groundY>scene.h);
    scene.setAltitude(1e9,{duration:0});assert.equal(scene.altitude,1e9);
    assert.ok(scene.g.commands.every(command=>command.points.every(point=>point.every(Number.isFinite))));
  }finally{scene.destroy();h.restore();}
});

test('phone and desktop answer anchors keep a visible centered plane above the question cards',()=>{
  for(const [width,height] of [[390,844],[768,1024],[1440,960]]){
    const h=skyHarness({width,height}),scene=new FlightScene(h.canvas);
    try{
      close(scene._planePosition(0).y,scene.h*.48);ready(scene);
      const p=scene._planePose(0);close(p.x,scene.w*.5);close(cssY(scene,p.y),180);
      assert.ok(p.scale*48*scene.cssWidth/scene.w>=110,'sprite is visibly large in the protected band');
      for(const danger of [1,2]){
        scene.setDanger(danger);
        for(let t=0;t<8;t+=.08){
          const pose=scene._planePose(t),verticalRadius=(Math.abs(Math.sin(pose.tilt))*24+Math.abs(Math.cos(pose.tilt))*11)*pose.scale;
          assert.ok(cssY(scene,pose.y+verticalRadius)<244,'warning wobble stays above the controls and cards');
          assert.ok(cssY(scene,pose.y-verticalRadius)>130,'plane stays below the score row');
        }
      }
    }finally{scene.destroy();h.restore();}
  }
});

test('viewport focus interpolates to a larger showcase and settles before subsequent maneuvers',options,async()=>{
  const h=skyHarness({width:390,height:844}),scene=new FlightScene(h.canvas);
  try{
    ready(scene);const source=scene._flightAnchor();let completed=false;
    const focus=scene.setFlightView('showcase');focus.then(()=>{completed=true;});
    assert.equal(scene.setFlightView('showcase'),focus,'same focus request shares its completion');
    h.advance(160);const middle=scene._flightAnchor();
    assert.ok(middle.y>source.y&&middle.y<scene.h*.38);assert.ok(middle.scale>source.scale);
    await Promise.resolve();assert.equal(completed,false);
    h.advance(160);await focus;close(scene._flightAnchor().y,scene.h*.38);
    assert.ok(scene._flightAnchor().scale*48*scene.cssWidth/scene.w>180);
    const back=scene.setFlightView('question');h.advance(320);await back;close(cssY(scene,scene._flightAnchor().y),180);
  }finally{scene.destroy();h.restore();}
});

test('takeoff visibly leaves the runway and resolves only at its full flight endpoint',options,async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    const focus=scene.setFlightView('showcase');h.advance(320);await focus;
    let finished=false;const takeoff=scene.takeoff().then(()=>{finished=true;});
    const initial=scene._planePosition(0);h.advance(700);
    assert.ok(scene._planePosition(scene.time).y<initial.y);assert.ok(scene.takeoffP>0&&scene.takeoffP<1);
    await Promise.resolve();assert.equal(finished,false);
    h.advance(700);await takeoff;assert.equal(scene.mode,'flying');assert.equal(scene.takeoffP,1);
    close(scene._flightAnchor().y,scene.h*.38-scene._cssY(40));
    const band=scene.setFlightView('question');h.advance(320);await band;close(cssY(scene,scene._flightAnchor().y),180);
  }finally{scene.destroy();h.restore();}
});

test('a correct answer lifts the visible plane by more than eighty CSS pixels and holds its raised endpoint',options,async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    ready(scene);const focus=scene.setFlightView('showcase');h.advance(320);await focus;
    const initial=scene._planePosition(scene.time);let finished=false;
    scene.setAltitude(3400,{duration:1400});const ascent=scene.ascend().then(()=>{finished=true;});
    h.advance(700);const middle=scene._planePose(scene.time);
    assert.ok(cssY(scene,initial.y-middle.y)>80,'ascent is visible rather than just a HUD counter');
    assert.ok(middle.tilt<-.2,'climb visibly raises the nose');assert.ok(scene.particles.length>0);
    assert.ok(scene.altitude>3000&&scene.altitude<3400);
    await Promise.resolve();assert.equal(finished,false);
    h.advance(700);await ascent;const end=scene._planePosition(scene.time);
    assert.ok(cssY(scene,initial.y-end.y)>80,'plane stays raised rather than bouncing back down');
    assert.equal(scene.altitude,3400,'only setAltitude changes the canonical height');
    const band=scene.setFlightView('question');h.advance(160);assert.ok(scene._flightAnchor().y<end.y);h.advance(160);await band;
    close(cssY(scene,scene._flightAnchor().y),180);
  }finally{scene.destroy();h.restore();}
});

test('a recoverable stall dips first and then keeps a noticeable stronger wobble at danger two',options,async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    ready(scene);const focus=scene.setFlightView('showcase');h.advance(320);await focus;
    const initial=scene._planePosition(scene.time);scene.setDanger(2);scene.setAltitude(2400,{duration:1100});
    let complete=false;const stalled=scene.stall(2).then(()=>{complete=true;});h.advance(550);
    assert.equal(scene.mode,'flying');assert.equal(scene.danger,2);
    assert.ok(cssY(scene,scene._planePosition(scene.time).y-initial.y)>65);assert.ok(scene._planePose(scene.time).tilt>.35);
    await Promise.resolve();assert.equal(complete,false);h.advance(550);await stalled;
    assert.equal(scene.altitude,2400);assert.equal(scene.mode,'flying');assert.equal(scene.danger,2);
    const range=level=>{scene.setDanger(level);const poses=Array.from({length:100},(_,i)=>scene._rescuePose(i/10));return{y:cssY(scene,Math.max(...poses.map(p=>p.dip))-Math.min(...poses.map(p=>p.dip))),roll:Math.max(...poses.map(p=>p.tilt))-Math.min(...poses.map(p=>p.tilt))};};
    const mild=range(1),strong=range(2);assert.ok(mild.y>=13);assert.ok(mild.roll>=.19);assert.ok(strong.y>mild.y+6);assert.ok(strong.roll>mild.roll+.1);
    scene.setDanger(2);scene._render(scene.time,0);const old=scene.lastPlanePose;
    const rescue=scene.recover();h.advance(700);assert.ok(scene._planePose(scene.time).y<old.y);assert.equal(scene.danger,0);
    h.advance(700);await rescue;assert.ok(scene.maneuverLift>=60);assert.equal(scene.altitude,2400);
    close(scene._rescuePose(0).dip,0);close(scene._rescuePose(0).tilt,0);
  }finally{scene.destroy();h.restore();}
});

test('crash spirals from the visible source into the actual ground, then resolves after impact dust',options,async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    ready(scene,8000);const focus=scene.setFlightView('showcase');h.advance(320);await focus;
    const source={...scene.lastPlanePose};let complete=false;
    const crash=scene.crash().then(()=>{complete=true;});const initial=scene._planePose(scene.time);
    close(initial.x,source.x);close(initial.y,source.y);close(initial.tilt,source.tilt);
    h.advance(1300);const middle=scene._planePose(scene.time);
    assert.ok(middle.y>source.y);assert.ok(middle.tilt>.5);assert.ok(scene.visualAltitude<8000);
    assert.equal(scene.altitude,8000,'animation does not rewrite score or record height');
    assert.ok(scene.g.commands.some(c=>c.color==='#f38fa8'),'plane remains visibly drawn during the dive');
    await Promise.resolve();assert.equal(complete,false);
    h.advance(854);assert.ok(scene.crashP<.83);
    const spriteColors=new Set(Object.values(PLANE_PALETTE).filter(Boolean));
    const nose=Math.max(...scene.g.commands.filter(c=>spriteColors.has(c.color)).flatMap(c=>c.points.map(point=>point[1])));
    assert.ok(cssY(scene,nose-scene.groundY)<3,'nose reaches the runway before any large part passes below it');
    h.advance(26);assert.ok(scene.crashP>.83);assert.equal(scene.visualAltitude,0);
    close(scene._planePosition(scene.time).y,scene.groundY);close(scene._planePosition(scene.time).x,scene._impactPosition().x);
    assert.ok(scene.groundY<scene.h);assert.ok(scene.g.commands.some(c=>c.color==='#e5c9aa'),'impact dust is drawn at ground contact');
    assert.ok(!scene.g.commands.some(c=>c.color==='#f38fa8'),'intact plane disappears on impact');
    await Promise.resolve();assert.equal(complete,false,'impact is visible before completion');
    h.advance(420);await crash;assert.equal(complete,true);assert.equal(scene.crashP,1);assert.equal(scene.mode,'crashed');
    assert.ok(scene.g.commands.every(command=>command.points.every(point=>point.every(Number.isFinite))));
    scene.reset();assert.equal(scene.flightView,'home');assert.equal(scene.altitude,0);assert.equal(scene.particles.length,0);
  }finally{scene.destroy();h.restore();}
});

test('reduced motion uses immediate fixed poses, no particles and no RAF for every action',options,async()=>{
  const h=skyHarness({width:390,height:844,reduced:true}),scene=new FlightScene(h.canvas);
  try{
    assert.equal(h.frames.size,0);await scene.setFlightView('showcase');await scene.takeoff();scene.setAltitude(3000);
    await scene.ascend();assert.equal(scene.maneuverLift,90);assert.equal(scene.altitude,3000);
    scene.setDanger(2);await scene.stall(2);assert.equal(scene.staticStall,2);assert.equal(scene.danger,2);
    const fixed=scene._planePose(0);close(scene._planePose(100).y,fixed.y);close(scene._planePose(100).tilt,fixed.tilt);
    await scene.recover();assert.equal(scene.danger,0);assert.equal(scene.staticStall,0);
    await scene.setFlightView('question');close(cssY(scene,scene._flightAnchor().y),180);
    await scene.crash();assert.equal(scene.crashP,1);assert.equal(scene.visualAltitude,0);
    assert.equal(scene.particles.length,0);assert.equal(h.frames.size,0);
    scene.reset();assert.equal(scene.mode,'home');assert.equal(scene.flightView,'home');
  }finally{scene.destroy();h.restore();}
});

test('interrupted actions, focus changes, reset and destroy settle their promises without hanging',options,async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    ready(scene);const firstFocus=scene.setFlightView('showcase');h.advance(100);const secondFocus=scene.setFlightView('question');await firstFocus;h.advance(320);await secondFocus;
    const ascent=scene.ascend();h.advance(300);const stall=scene.stall(1);await ascent;h.advance(1100);await stall;
    const recovery=scene.recover(),focus=scene.setFlightView('showcase');h.advance(200);h.changeMotion(true);await Promise.all([recovery,focus]);
    assert.equal(scene.recoverP,1);assert.equal(h.frames.size,0);
    h.changeMotion(false);const fall=scene.crash();h.advance(200);scene.reset();await fall;assert.equal(scene.mode,'home');
    const pending=scene.takeoff(),view=scene.setFlightView('showcase');scene.destroy();await Promise.all([pending,view]);
    assert.equal(h.frames.size,0);assert.equal(h.media.listeners.size,0);
  }finally{if(!scene.dead)scene.destroy();h.restore();}
});

test('the original plane retains crisp pixels and strips unsafe SVG class text',()=>{
  assert.match(hero,/shape-rendering="crispEdges"/);assert.ok(PLANE_SPRITE.length>15);
  const svg=plane('badge" onload="alert(1)');assert.equal(svg.includes('onload='),false);assert.match(svg,/plane-body/);
});
