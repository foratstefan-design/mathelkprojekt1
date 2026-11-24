import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightScene } from '../public/sky.js';
import { plane, hero, PLANE_SPRITE } from '../public/art.js';
import { skyHarness } from './helpers/sky-harness.js';

test('the pixel camera moves terrain downward during ascent and remains finite at unlimited fantasy heights',()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    assert.equal(h.canvas.width,2560,'DPR capped at two');
    assert.equal(h.canvas.attrs['aria-hidden'],'true');
    assert.ok(scene.groundY<scene.h,'home runway is visible');
    const ground=scene.groundY;
    scene.setMode('flying');scene.setAltitude(1800,{duration:1000});h.advance(500);
    assert.ok(scene.altitude>0&&scene.altitude<1800,'climb has an intermediate pose');
    assert.ok(scene.groundY>ground,'cloud world and terrain move down as plane climbs');
    h.advance(500);assert.equal(scene.altitude,1800);assert.ok(scene.groundY>scene.h,'runway has left the bottom of screen');
    scene.setAltitude(1e9,{duration:0});
    assert.equal(scene.altitude,1e9,'endless flight is not capped at 7000 m');
    assert.ok(scene.g.commands.every(command=>command.points.every(point=>point.every(Number.isFinite))));
  }finally{scene.destroy();h.restore();}
});

test('takeoff moves plane from runway to cruising location and resolves after its full animation',async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    let finished=false;const takeoff=scene.takeoff().then(()=>{finished=true;});
    const initial=scene._planePosition(0),initialClearance=scene.groundY-initial.y;h.advance(700);
    const middle=scene._planePosition(.7);
    assert.ok(scene.groundY-middle.y>initialClearance,'runway drops away while camera follows the plane');
    assert.ok(initial.y<scene.h*.5,'home plane stays above the mode picker');
    assert.ok(scene.takeoffP>0&&scene.takeoffP<1);
    await Promise.resolve();assert.equal(finished,false);
    h.advance(700);await takeoff;assert.equal(scene.takeoffP,1);assert.equal(scene.mode,'flying');
    assert.ok(scene._planePosition(1.4).x<scene.w*.25,'flight leaves question center clear');
  }finally{scene.destroy();h.restore();}
});

test('boost adds a trail; crash lowers the visual camera, preserves record altitude and resolves only after impact',async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    scene.setMode('flying');scene.setAltitude(8000,{duration:0});scene.setSpeed(12);scene.boost();
    assert.ok(scene.particles.length>0);
    let complete=false;const crash=scene.crash().then(()=>{complete=true;});
    h.advance(1100);
    assert.ok(scene.crashP>0&&scene.crashP<1);
    assert.ok(scene.visualAltitude<8000,'camera follows fall toward ground');
    assert.equal(scene.altitude,8000,'HUD record can remain at peak');
    await Promise.resolve();assert.equal(complete,false);
    h.advance(1100);await crash;
    assert.equal(scene.mode,'crashed');assert.equal(scene.crashP,1);assert.equal(scene.visualAltitude,0);
    assert.ok(scene.groundY<scene.h,'runway is visible at impact');
    assert.ok(scene.g.commands.every(command=>command.points.every(point=>point.every(Number.isFinite))));
    scene.reset();assert.equal(scene.mode,'home');assert.equal(scene.altitude,0);assert.equal(scene.particles.length,0);
  }finally{scene.destroy();h.restore();}
});

test('reduced motion uses fixed takeoff/crash endpoints, no particles, and no active RAF',async()=>{
  const h=skyHarness({width:390,height:844,reduced:true}),scene=new FlightScene(h.canvas);
  try{
    assert.equal(h.frames.size,0);await scene.takeoff();assert.equal(scene.takeoffP,1);
    scene.setAltitude(3000);assert.equal(scene.altitude,3000);scene.boost();assert.equal(scene.particles.length,0);
    await scene.crash();assert.equal(scene.crashP,1);assert.equal(scene.visualAltitude,0);
    assert.equal(h.frames.size,0);
    h.changeMotion(false);assert.equal(h.frames.size,1);
    const pending=scene.takeoff();h.advance(400);h.changeMotion(true);await pending;
    assert.equal(scene.takeoffP,1);assert.equal(h.frames.size,0);
    scene.destroy();assert.equal(h.media.listeners.size,0);
  }finally{if(!scene.dead)scene.destroy();h.restore();}
});

test('destroy settles pending promises and removes animation resources',async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  const pending=scene.takeoff();scene.destroy();await pending;
  try{assert.equal(h.frames.size,0);assert.equal(h.media.listeners.size,0);assert.equal(scene.dead,true);}
  finally{h.restore();}
});

test('original plane SVG retains crisp pixels and strips unsafe class text',()=>{
  assert.match(hero,/shape-rendering="crispEdges"/);assert.ok(PLANE_SPRITE.length>15);
  const svg=plane('badge" onload="alert(1)');assert.equal(svg.includes('onload='),false);assert.match(svg,/plane-body/);
});


test('mobile plane cruises in the HUD-to-question gap while home and desktop anchors stay unchanged',()=>{
  const h=skyHarness({width:390,height:844}),scene=new FlightScene(h.canvas);
  try{
    assert.equal(scene._planePosition(0).y,scene.h*.48,'home plane stays beside the runway');
    scene.setMode('flying');
    const position=scene._planePosition(0);
    assert.ok(position.y*3>=120&&position.y*3<=132,'mobile plane center is about130 CSSpixels above the question');
    assert.ok(Math.abs(position.x-scene.w*.22)<1e-9);
    scene.mode='crashed';scene.crashP=.5;
    assert.ok(scene._planePosition(0).y>position.y,'mobile crash falls through the cleared question area');
  }finally{scene.destroy();h.restore();}
  const desktop=skyHarness({width:1440,height:960}),desktopScene=new FlightScene(desktop.canvas);
  try{desktopScene.setMode('flying');assert.ok(Math.abs(desktopScene._planePosition(0).y-desktopScene.h*.57)<1e-9);}
  finally{desktopScene.destroy();desktop.restore();}
});

test('a nonterminal stall dips and smokes while altitude loss moves the world up; recovery clears danger',async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    scene.setMode('flying');scene.setAltitude(3000,{duration:0});scene.setDanger(2);
    const initialGround=scene.groundY;
    scene.setAltitude(2400,{duration:900});
    let settled=false;const stall=scene.stall(2).then(()=>{settled=true;});
    h.advance(450);
    assert.equal(scene.mode,'flying','a recoverable error must not trigger terminal crash');
    assert.equal(scene.danger,2,'canonical danger remains until a rescue');
    assert.ok(scene.altitude>2400&&scene.altitude<3000);
    assert.ok(scene.groundY<initialGround,'losing height moves the world upward');
    assert.ok(scene._rescuePose(0).dip>5,'the nonterminal loss of lift has a visible dip');
    assert.ok(scene._rescuePose(0).tilt>.2,'the nose briefly points down');
    await Promise.resolve();assert.equal(settled,false);
    h.advance(450);await stall;
    assert.equal(scene.altitude,2400);assert.equal(scene.mode,'flying');assert.equal(scene.danger,2);
    const recover=scene.recover();assert.equal(scene.danger,0);h.advance(400);
    assert.ok(scene._rescuePose(0).dip<0,'rescue briefly pulls the plane upward');
    assert.ok(scene.particles.length>0,'rescue includes a boost trail');
    h.advance(400);await recover;assert.equal(scene.mode,'flying');assert.equal(scene.danger,0);
    assert.equal(scene._rescuePose(0).dip,0);assert.equal(scene.altitude,2400,'animations never invent score or altitude');
  }finally{scene.destroy();h.restore();}
});

test('daily-style transient stall does not persist danger; reduced motion gets a fixed warning and immediate rescue',async()=>{
  const h=skyHarness({reduced:true}),scene=new FlightScene(h.canvas);
  try{
    scene.setMode('flying');scene.setDanger(0);await scene.stall(1);
    assert.equal(scene.mode,'flying');assert.equal(scene.danger,0);assert.equal(scene.staticStall,1);
    assert.equal(h.frames.size,0);assert.ok(scene._rescuePose(0).tilt>0);
    scene.setDanger(0);assert.equal(scene.staticStall,0,'the next canonical question state clears transient warning');
    scene.setDanger(2);await scene.recover();assert.equal(scene.danger,0);assert.equal(scene.staticStall,0);
    assert.equal(h.frames.size,0);assert.equal(scene.particles.length,0);
  }finally{scene.destroy();h.restore();}
});

test('switching motion preference or destroying settles nonterminal animation promises',async()=>{
  const h=skyHarness(),scene=new FlightScene(h.canvas);
  try{
    scene.setMode('flying');scene.setDanger(1);
    const stall=scene.stall();h.advance(200);h.changeMotion(true);await stall;
    assert.equal(scene.mode,'flying');assert.equal(scene.staticStall,1);assert.equal(h.frames.size,0);
    h.changeMotion(false);const recover=scene.recover();scene.destroy();await recover;
    assert.equal(h.frames.size,0);
  }finally{if(!scene.dead)scene.destroy();h.restore();}
});
