import { PLANE_SPRITE, PLANE_PALETTE } from './art.js';

const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const ACTION_MS={takeoff:1400,ascend:1400,recover:1400,stall:1100,crash:2600};
const CRASH_IMPACT=.83;
const MIX_SKIES=[{top:[115,183,201],horizon:[192,220,213]},{top:[76,100,158],horizon:[218,150,164]},{top:[15,28,64],horizon:[36,58,102]}];
const mixZone=altitude=>altitude>=6000?2:altitude>=3000?1:0;
const SKY_ZONE_MS=700;
const SKY_STOPS=[[0,[115,183,201]],[2500,[86,146,181]],[7000,[58,104,151]],[14000,[36,62,109]],[26000,[19,33,71]],[50000,[10,20,47]]];
// Compile the fixed sprite once instead of scanning its transparent pixels on
// every frame. Canvas drawing stays identical to the original pixel artwork.
const PLANE_RUNS=[];
for(let y=0;y<PLANE_SPRITE.length;y++)for(let x=0;x<48;){
  const color=PLANE_PALETTE[PLANE_SPRITE[y][x]];
  if(!color){x++;continue;}
  let end=x+1;while(end<48&&PLANE_SPRITE[y][end]===PLANE_SPRITE[y][x])end++;
  PLANE_RUNS.push({x:x-24,y:y-11,width:end-x,color});x=end;
}
/** A procedural pixel world: ascent moves clouds and landscape down the screen. */
export class FlightScene {
  constructor(canvas) {
    if(!canvas?.getContext)throw new TypeError('FlightScene needs a canvas.');
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.buffer=document.createElement('canvas');this.g=this.buffer.getContext('2d',{alpha:false});
    if(!this.ctx||!this.g)throw new Error('Canvas 2D is unavailable.');
    canvas.setAttribute('aria-hidden','true');canvas.style.imageRendering='pixelated';
    this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');this.reduced=this.motion.matches;
    this.course='';this.skyZone=0;this.skyWeights=[1,0,0];this.skyZoneTween=null;this.skyStyleVersion=0;
    this.mode='home';this.altitude=0;this.targetAltitude=0;this.visualAltitude=0;
    this.speed=0;this.targetSpeed=0;this.climb=0;this.takeoffP=0;this.crashP=0;
    this.altitudeTween=null;this.action=null;this.viewTween=null;this.flightView='home';this.questionLayout=null;this.maneuverLift=0;this.ascendP=1;this.particles=[];this.boostUntil=0;
    this.danger=0;this.stallP=1;this.recoverP=1;this.stallLevel=0;this.staticStall=0;
    this.frame=0;this.lastTime=0;this.dead=false;this.time=0;
    this._onResize=()=>this.resize();
    this._onMotion=()=>{
      if(this.dead)return;
      this.reduced=this.motion.matches;cancelAnimationFrame(this.frame);
      if(this.reduced){this.altitude=this.targetAltitude;this.altitudeTween=null;this.particles.length=0;this.climb=0;
        if(this.action)this._completeAction();this._settleView();
        this._render(0,0);
      }else{this.staticStall=0;this.lastTime=0;this.frame=requestAnimationFrame(this._tick);}
    };
    this._tick=now=>{
      if(this.dead||this.reduced)return;
      const dt=this.lastTime?Math.min(.05,Math.max(0,(now-this.lastTime)/1000)):0;this.lastTime=now;
      const previous=this.altitude;this._animate(now);
      const velocity=dt?Math.max(0,this.altitude-previous)/dt:0;
      this.climb+=(Math.min(1,velocity/1000)-this.climb)*Math.min(1,dt*6);
      this.speed+=(this.targetSpeed-this.speed)*Math.min(1,dt*3);
      this.time+=dt;this._render(this.time,dt);if(!this.dead&&!this.reduced)this.frame=requestAnimationFrame(this._tick);
    };
    window.addEventListener('resize',this._onResize,{passive:true});this.motion.addEventListener?.('change',this._onMotion);
    if(window.ResizeObserver){this.observer=new ResizeObserver(this._onResize);this.observer.observe(canvas);}
    this.resize();if(!this.reduced)this.frame=requestAnimationFrame(this._tick);
  }
  resize(){
    if(this.dead)return;const b=this.canvas.getBoundingClientRect(),width=Math.max(1,b.width||window.innerWidth),height=Math.max(1,b.height||window.innerHeight);
    // The pixel world is already drawn at one third CSS resolution. A 1.5x
    // presentation surface avoids the much larger 2x Retina blit on iPads.
    const pixelRatio=Math.min(1.5,Math.max(1,Number(window.devicePixelRatio)||1));
    if(width===this.cssWidth&&height===this.cssHeight&&pixelRatio===this.pixelRatio)return;
    this.pixelRatio=pixelRatio;
    this.cssWidth=width;this.cssHeight=height;this.w=Math.max(100,Math.ceil(width/3));this.h=Math.max(120,Math.ceil(height/3));
    this.buffer.width=this.w;this.buffer.height=this.h;this.canvas.width=Math.round(width*pixelRatio);this.canvas.height=Math.round(height*pixelRatio);
    this.ctx.imageSmoothingEnabled=this.g.imageSmoothingEnabled=false;this._render(this.reduced?0:this.time,0);
  }
  /** Match the answering plane to the responsive panel's free sky band.
   * centerY and full sprite width are CSS pixels, independent of canvas DPR.
   * This does not restart focus transitions or any in-flight action promise.
   */
  setQuestionLayout(layout){
    if(this.dead)return;
    if(!layout)this.questionLayout=null;
    else{
      const previous=this.questionLayout||{centerY:Math.min(180,this.cssHeight*.3),size:this.cssWidth<550?112:130};
      const centerY=Number(layout.centerY),size=Number(layout.size);
      this.questionLayout={centerY:Number.isFinite(centerY)?clamp(centerY,24,Math.max(24,this.cssHeight-24)):previous.centerY,size:Number.isFinite(size)?clamp(size,64,240):previous.size};
    }
    if(this.reduced)this._render(0,0);
  }
  /** The free Mix course has exact score-height zones. Home/other courses
   * retain their original sky; resets keep the selected course for takeoff.
   */
  setCourse(course=''){
    if(this.dead)return;const next=course==='mix'?'mix':'';if(next===this.course)return;
    this.course=next;this.skyZoneTween=null;this.skyZone=mixZone(this.altitude);
    this.skyWeights=[0,0,0];this.skyWeights[this.skyZone]=1;this.skyStyleVersion++;
    this._render(this.reduced?0:this.time,0);
  }
  _mixSkyEnabled(){return this.course==='mix'&&this.mode!=='home';}
  _syncSkyZone(now,snap=false){
    if(!this._mixSkyEnabled())return;
    // The 350m camera lift is decorative and must not advance difficulty skies.
    const height=this.mode==='crashed'?this.altitude*(1-ease(Math.min(1,this.crashP/.74))):this.altitude;
    const zone=mixZone(height);
    if(snap||this.reduced){
      if(zone===this.skyZone&&!this.skyZoneTween&&this.skyWeights[zone]===1)return;
      this.skyZone=zone;this.skyZoneTween=null;
      for(let i=0;i<3;i++)this.skyWeights[i]=i===zone?1:0;
      this.skyStyleVersion++;return;
    }
    if(zone!==this.skyZone){
      this.skyZone=zone;this.skyZoneTween={from:[...this.skyWeights],started:now,progress:-1};
    }
    const tween=this.skyZoneTween;if(!tween)return;
    const progress=clamp((now-tween.started)/SKY_ZONE_MS,0,1);
    if(progress!==tween.progress){
      tween.progress=progress;const amount=ease(progress);
      for(let i=0;i<3;i++)this.skyWeights[i]=tween.from[i]+((i===zone?1:0)-tween.from[i])*amount;
      this.skyStyleVersion++;
    }
    if(progress===1)this.skyZoneTween=null;
  }
  setMode(mode){
    if(this.dead||!['home','flying','crashed'].includes(mode))return;
    if(mode==='home'){this.reset();return;}
    this.mode=mode;
    if(mode==='crashed'){this.crashP=1;this._settleAction();this._settleView();}
    else{if(this.flightView==='home')this.flightView='question';if(!this.action)this.takeoffP=1;}
    if(this.reduced)this._render(0,0);
  }
  /** Reserve the top flight band while answering; show maneuvers unobstructed. */
  setFlightView(view){
    if(this.dead||!['question','showcase','home'].includes(view))return Promise.resolve();
    if(view==='home'){this.reset();return Promise.resolve();}
    if(view===this.flightView)return this.viewTween?.promise||Promise.resolve();
    const from=this._flightAnchor();this._settleView();this.flightView=view;this.maneuverLift=0;
    if(this.reduced){this._render(0,0);return Promise.resolve();}
    let resolve;const promise=new Promise(done=>{resolve=done;});
    this.viewTween={from:{x:from.x/this.w,y:from.y/this.h,scale:from.scale},progress:0,started:performance.now(),duration:320,resolve,promise};
    return promise;
  }
  setAltitude(meters,{duration=1600}={}){
    if(this.dead)return;const n=Number(meters),target=Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,n)):0;this.targetAltitude=target;
    if(this.reduced||duration<=0){this.altitude=target;this.altitudeTween=null;this._syncSkyZone(performance.now(),true);this._render(this.reduced?0:this.time,0);return;}
    this.altitudeTween={from:this.altitude,to:target,started:performance.now(),duration:clamp(Number(duration)||1600,1,20000)};
  }
  setSpeed(streak=0){this.targetSpeed=clamp(Number(streak)||0,0,30)/30;if(this.reduced)this.speed=this.targetSpeed;}
  takeoff(){
    if(this.dead)return Promise.resolve();this.takeoffOrigin=this.lastPlanePose||this._planePose(this.time);this.takeoffWorldFrom=this.visualAltitude;this._settleAction();this.mode='flying';if(this.flightView==='home')this.flightView='question';
    this.takeoffP=0;this.crashP=0;this.maneuverLift=0;this.danger=this.staticStall=0;
    if(this.reduced){this.takeoffP=1;this.maneuverLift=40;this._render(0,0);return Promise.resolve();}
    return this._beginAction('takeoff');
  }
  boost(){
    if(this.dead||this.reduced||this.mode!=='flying')return;this.boostUntil=this.time+1.6;
    const position=this._planePosition(this.time),scale=this._flightAnchor().scale;
    for(let i=0;i<32;i++)this.particles.push({x:position.x-17*scale,y:position.y+this._random(i+40)*9-4,vx:-35-this._random(i+20)*45,vy:this._random(i+30)*14-7,life:0,max:.8+this._random(i+50)*.9,color:i%3?'#f7dc9d':'#c1f2ec',size:i%4?1:2});
  }
  setDanger(level=0){
    if(this.dead)return;this.danger=clamp(Math.floor(Number(level)||0),0,2);this.staticStall=0;
    if(this.reduced)this._render(0,0);
  }
  /** A sustained, visible climb; the canonical score/altitude stay untouched. */
  ascend(){return this._maneuver('ascend');}
  stall(level=1){return this._maneuver('stall',level);}
  recover(){return this._maneuver('recover');}
  _maneuver(type,level=1){
    if(this.dead||this.mode!=='flying')return Promise.resolve();
    const origin=this.lastPlanePose||this._planePose(this.time);this._settleAction();this.maneuverLift=0;
    if(type==='stall'){this.stallLevel=clamp(Number(level)||1,1,2);this.stallP=0;this.recoverP=this.ascendP=1;this.boostUntil=0;}
    else{this.danger=this.staticStall=this.stallLevel=0;this.stallP=1;if(type==='recover')this.recoverP=0;else this.ascendP=0;this.boost();}
    if(this.reduced){
      if(type==='stall'){this.stallP=1;this.staticStall=this.stallLevel;}
      else{this.recoverP=this.ascendP=1;this.maneuverLift=type==='ascend'?90:65;}
      this._render(0,0);return Promise.resolve();
    }
    return this._beginAction(type,origin);
  }
  crash(){
    if(this.dead)return Promise.resolve();
    this.crashOrigin=this.lastPlanePose||this._planePose(this.time);this._settleAction();this._settleView();
    // Aim the foremost rotated pixel at the ground, rather than letting half
    // the aircraft pass through the runway before the impact effect begins.
    const tilt=1.42,cs=Math.cos(tilt),sn=Math.sin(tilt);let nose={x:0,y:0};
    for(let y=0;y<PLANE_SPRITE.length;y++)for(let x=0;x<48;x++)if(PLANE_PALETTE[PLANE_SPRITE[y][x]])for(const [dx,dy] of [[0,0],[1,0],[0,1],[1,1]]){
      const px=x-24+dx,py=y-11+dy,point={x:(px*cs-py*sn)*this.crashOrigin.scale,y:(px*sn+py*cs)*this.crashOrigin.scale};
      if(point.y>nose.y)nose=point;
    }
    this.crashNose=nose;
    this.altitudeTween=null;this.targetAltitude=this.altitude;this.mode='crashed';this.danger=this.staticStall=0;this.crashP=0;
    this.crashFrom=Math.max(this.altitude,this.visualAltitude||0);this.maneuverLift=0;this.particles.length=0;
    if(this.reduced){this.crashP=1;this._render(0,0);return Promise.resolve();}
    return this._beginAction('crash');
  }
  reset(){
    if(this.dead)return;this._settleAction();this._settleView();this.mode='home';this.flightView='home';this.maneuverLift=0;
    this.altitude=this.targetAltitude=0;this.altitudeTween=null;this.skyZone=0;this.skyWeights[0]=1;this.skyWeights[1]=this.skyWeights[2]=0;this.skyZoneTween=null;this.skyStyleVersion++;this.takeoffP=this.crashP=this.climb=0;
    this.danger=this.staticStall=this.stallLevel=0;this.stallP=this.recoverP=this.ascendP=1;this.speed=this.targetSpeed=0;
    this.boostUntil=0;this.lastPlanePose=this.crashOrigin=this.takeoffOrigin=null;this.particles.length=0;this._render(this.reduced?0:this.time,0);
  }
  destroy(){
    if(this.dead)return;this.dead=true;cancelAnimationFrame(this.frame);this._settleAction();this._settleView();window.removeEventListener('resize',this._onResize);this.motion.removeEventListener?.('change',this._onMotion);this.observer?.disconnect();this.particles.length=0;this.buffer.width=this.buffer.height=1;
  }
  _beginAction(type,origin){
    const anchor=this._flightAnchor(),bob=this.reduced?0:this._cssY(Math.sin(this.time*1.9)*3);
    return new Promise(resolve=>{this.action={type,started:performance.now(),duration:ACTION_MS[type],resolve,from:origin?{dip:origin.y-anchor.y-bob,wobble:origin.x-anchor.x,tilt:origin.tilt-this._baseTilt(this.time)}:null};});
  }
  _settleAction(){if(this.action){const {resolve}=this.action;this.action=null;resolve();}}
  _settleView(){if(this.viewTween){const {resolve}=this.viewTween;this.viewTween=null;resolve();}}
  _completeAction(){
    const type=this.action?.type;
    if(type==='takeoff'){this.takeoffP=1;this.maneuverLift=40;}
    else if(type==='crash')this.crashP=1;
    else if(type==='stall'){this.stallP=1;if(this.reduced)this.staticStall=this.stallLevel;}
    else if(type==='ascend'){this.ascendP=1;this.maneuverLift=90;}
    else if(type==='recover'){this.recoverP=1;this.maneuverLift=65;}
    this._settleAction();
  }
  _animate(now){
    if(this.altitudeTween){const a=this.altitudeTween,p=clamp((now-a.started)/a.duration,0,1);this.altitude=a.from+(a.to-a.from)*ease(p);if(p===1)this.altitudeTween=null;}
    if(this.viewTween){const a=this.viewTween;a.progress=clamp((now-a.started)/a.duration,0,1);if(a.progress===1)this._settleView();}
    if(this.action){const a=this.action,p=clamp((now-a.started)/a.duration,0,1);
      if(a.type==='takeoff')this.takeoffP=ease(p);else if(a.type==='crash')this.crashP=p;else if(a.type==='stall')this.stallP=p;else if(a.type==='recover')this.recoverP=p;else if(a.type==='ascend')this.ascendP=p;
      if(p===1)this._completeAction();
    }
  }
  _random(seed){let n=Math.imul((seed|0)^0x9e3779b9,1597334677);n=Math.imul(n^n>>>16,2246822507);return((n^n>>>13)>>>0)/4294967296;}
  _rect(x,y,w,h,color){if(w<=0||h<=0)return;this.g.fillStyle=color;this.g.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
  _poly(points,color){const g=this.g;g.fillStyle=color;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(Math.round(x),Math.round(y)):g.moveTo(Math.round(x),Math.round(y)));g.closePath();g.fill();}
  _mix(a,b,p){return a.map((n,i)=>Math.round(n+(b[i]-n)*clamp(p,0,1)));}
  _skyColor(altitude,y){
    if(this._mixSkyEnabled()){
      const rgb=[0,0,0];
      for(let zone=0;zone<3;zone++)for(let channel=0;channel<3;channel++){
        const sky=MIX_SKIES[zone];rgb[channel]+=(sky.top[channel]+(sky.horizon[channel]-sky.top[channel])*y*.65)*this.skyWeights[zone];
      }
      return 'rgb('+rgb.map(Math.round).join(',')+')';
    }
    let a=SKY_STOPS[0],b=SKY_STOPS.at(-1);for(let i=1;i<SKY_STOPS.length;i++){b=SKY_STOPS[i];if(altitude<=b[0])break;a=b;}
    const base=this._mix(a[1],b[1],(altitude-a[0])/Math.max(1,b[0]-a[0]));return 'rgb('+this._mix(base,[192,220,213],Math.max(0,1-altitude/11000)*y*.5).join(',')+')';
  }
  _render(time,dt){
    if(this.dead||!this.w)return;const g=this.g,w=this.w,h=this.h;g.globalAlpha=1;
    const crash=this.mode==='crashed';
    const takingOff=this.action?.type==='takeoff',flightHeight=this.altitude+(this.mode==='flying'?350*this.takeoffP:0);
    this.visualAltitude=crash?Math.max(0,(this.crashFrom||this.altitude)*(1-ease(Math.min(1,this.crashP/.74)))):takingOff?this.takeoffWorldFrom+(this.altitude+350-this.takeoffWorldFrom)*this.takeoffP:flightHeight;
    this.camera=this.visualAltitude*h/2200;
    // Start controls begin below 56%; keep the runway and parked plane above them.
    const groundBase=this.mode==='home'?.52:this.mode==='flying'?.52+.25*this.takeoffP:.77;
    this.groundY=h*groundBase+this.camera;
    this._syncSkyZone(performance.now());
    const skyAltitude=Math.round(this.visualAltitude),styleKey=this._mixSkyEnabled()?this.skyStyleVersion:-1;
    if(this.skyAltitude!==skyAltitude||this.skyHeight!==h||this.skyStyleKey!==styleKey){
      this.skyAltitude=skyAltitude;this.skyHeight=h;this.skyStyleKey=styleKey;this.skyBands=[];
      for(let y=0;y<h;y+=8)this.skyBands.push({y,color:this._skyColor(skyAltitude,y/h)});
    }
    for(const band of this.skyBands)this._rect(0,band.y,w,9,band.color);
    this._stars(time);this._sun(time);this._clouds(time);
    if(this.groundY<h+70)this._landscape(time);
    const pose=this._planePose(time);
    this._trails(time,pose);this._plane(time,pose);this._effects(dt,time,pose);
    if(crash&&this.crashP>=CRASH_IMPACT)this._impact(time);
    this.ctx.imageSmoothingEnabled=false;this.ctx.drawImage(this.buffer,0,0,w,h,0,0,this.canvas.width,this.canvas.height);
  }
  _stars(time){
    const strength=this._mixSkyEnabled()?this.skyWeights[1]*.08+this.skyWeights[2]*.92:clamp((this.visualAltitude-5500)/11000,0,1);if(!strength)return;this.g.globalAlpha=strength;
    for(let i=0;i<65;i++){const x=this._random(i+313)*this.w,y=((this._random(i+417)*this.h+this.visualAltitude*.002*(.4+this._random(i+215)))%this.h+this.h)%this.h;this._rect(x,y,i%13===0?2:1,1,i%4?'#b4cddd':'#f5e6bd');if(i%13===0)this._rect(x+1,y-1,1,3,'#d7e3dc');}
    if(this.visualAltitude>21000){this.g.globalAlpha=strength*.16;this._poly([[0,this.h*.26],[this.w*.42,this.h*.1],[this.w,this.h*.25],[this.w,this.h*.3],[this.w*.4,this.h*.18],[0,this.h*.33]],'#a99aca');}
    this.g.globalAlpha=1;
  }
  _sun(time){
    const alpha=this._mixSkyEnabled()?this.skyWeights[0]+this.skyWeights[1]*.7+this.skyWeights[2]*.08:clamp(1-this.visualAltitude/14000,0,1);if(!alpha)return;this.g.globalAlpha=alpha;const x=this.w*.81,y=this.h*.19+this.camera*.05;
    this._rect(x-12,y-7,24,14,'#f4d9aa');this._rect(x-8,y-11,16,22,'#f4d9aa');this._rect(x-4,y-13,8,26,'#f4d9aa');this._rect(x-7,y-6,14,11,'#fbeac2');this.g.globalAlpha=1;
  }
  _cloud(x,y,size,color='#d4e9df',shadow='#9fc8cf'){
    this._rect(x,y,size,5,shadow);this._rect(x+size*.08,y-4,size*.82,7,color);this._rect(x+size*.2,y-8,size*.56,7,color);this._rect(x+size*.39,y-11,size*.25,6,color);this._rect(x+size*.64,y-5,size*.24,5,'#e3eee2');
  }
  _clouds(time){
    const altitude=this.visualAltitude,w=this.w,h=this.h;
    for(let layer=0;layer<3;layer++){
      const spacing=500+layer*180,base=Math.floor(altitude/spacing),parallax=.55+layer*.23;
      for(let level=base-3;level<=base+4;level++){
        const seed=level*19+layer*131,worldAltitude=(level+.35+this._random(seed+104)*.4)*spacing;
        const y=h*.67+(altitude-worldAltitude)*h/2200*parallax;
        if(y<-25||y>h+25)continue;
        const width=20+this._random(seed+208)*32,x=((this._random(seed+317)*(w+80)-time*(1.8+layer*2.5+this.speed*8))%(w+80)+(w+80))%(w+80)-40;
        this.g.globalAlpha=(this._mixSkyEnabled()?this.skyWeights[0]+this.skyWeights[1]*.7+this.skyWeights[2]*.25:clamp(1-altitude/19000,.09,1))*(layer===0?.4:layer===1?.6:.85);
        this._cloud(x,y,width,layer===0?'#b7d6d5':'#d4e9df',layer===0?'#91b9c8':'#a2c7cc');
      }
    }
    this.g.globalAlpha=1;
  }
  _landscape(time){
    const w=this.w,h=this.h,ground=this.groundY;
    this._poly([[0,ground-13],[0,ground-45],[w*.12,ground-69],[w*.23,ground-44],[w*.35,ground-91],[w*.48,ground-43],[w*.61,ground-70],[w*.74,ground-35],[w*.9,ground-61],[w,ground-30],[w,ground]],'#779ca8');
    this._poly([[w*.26,ground-72],[w*.35,ground-91],[w*.42,ground-69],[w*.35,ground-74],[w*.32,ground-68]],'#c8d8d0');
    for(let i=0;i<16;i++){const x=i*w/16,building=8+this._random(i+99)*19;this._rect(x,ground-building,w/18,building,'#608b9d');if(i%2===0)this._rect(x+2,ground-building+4,2,2,'#c5d9ca');}
    this._rect(0,ground,w,h-ground,'#637e85');this._rect(0,ground+4,w,11,'#b6b7a0');this._rect(0,ground+16,w,20,'#455d70');this._rect(0,ground+17,w,1,'#d0dac4');this._rect(0,ground+34,w,1,'#96b0b2');
    const shift=this.mode==='home'?time*2:time*(6+this.speed*12);
    for(let i=-1;i<w/25+1;i++)this._rect(i*25-((shift%25)+25)%25,ground+25,12,2,'#d9d7b4');
    this._rect(0,ground+37,w,h-ground,'#628f82');
    for(let i=0;i<18;i++){const x=this._random(i+731)*w,y=ground+40+this._random(i+881)*60;this._rect(x,y,3,1,i%2?'#82a191':'#527b78');}
    // A tiny windsock supplies scale and a direction for the takeoff.
    const sx=w*.13,sy=ground+2;this._rect(sx,sy-24,1,24,'#315d71');this._rect(sx+1,sy-24,8,3,'#f09c9d');this._rect(sx+9,sy-23,5,3,'#efcead');this._rect(sx+14,sy-22,4,2,'#f09c9d');
  }
  _cssY(pixels){return pixels*this.h/this.cssHeight;}
  _cssX(pixels){return pixels*this.w/this.cssWidth;}
  _viewAnchor(view){
    if(view==='home')return{x:this.w*.5,y:this.h*.48,scale:this.cssWidth<550?.75:1};
    if(view==='showcase')return{x:this.w*.5,y:this.h*.38,scale:this.cssWidth<550?1.3:1.65};
    if(this.questionLayout)return{x:this.w*.5,y:this._cssY(clamp(this.questionLayout.centerY,24,Math.max(24,this.cssHeight-24))),scale:this._cssX(this.questionLayout.size)/48};
    return{x:this.w*.5,y:this._cssY(Math.min(180,this.cssHeight*.3)),scale:this.cssWidth<550?.78:.9};
  }
  _flightAnchor(){
    const target=this._viewAnchor(this.flightView);
    if(this.viewTween){const a=this.viewTween,p=ease(a.progress);return{x:a.from.x*this.w+(target.x-a.from.x*this.w)*p,y:a.from.y*this.h+(target.y-a.from.y*this.h)*p,scale:a.from.scale+(target.scale-a.from.scale)*p};}
    return{...target,y:target.y-this._cssY(this.maneuverLift)};
  }
  _baseTilt(time){return-.075*this.takeoffP-this.climb*.12-(this.boostUntil>time?.06:0);}
  _rescuePose(time){
    const warning=Math.max(this.danger,this.staticStall);
    const oscillation=this.reduced?0:Math.sin(time*(warning===2?8:6.5));
    const pose={dip:this._cssY(warning*4+oscillation*(warning===2?11:warning?7:0)),tilt:warning*.04+(this.reduced?0:Math.sin(time*7.3)*(warning===2?.17:warning?.1:0)),wobble:this.reduced?0:this._cssX(Math.sin(time*9)*(warning===2?5:warning?3:0))};
    const a=this.action;if(!a||!['stall','recover','ascend'].includes(a.type))return pose;
    const p=a.type==='stall'?this.stallP:a.type==='recover'?this.recoverP:this.ascendP,blend=ease(clamp(p/.28,0,1));
    if(a.from)for(const key of ['dip','tilt','wobble'])pose[key]=a.from[key]+(pose[key]-a.from[key])*blend;
    if(a.type==='stall'){
      const pulse=Math.sin(Math.PI*p);pose.dip+=this._cssY(pulse*(this.stallLevel===2?85:60));pose.tilt+=pulse*(this.stallLevel===2?.62:.45);pose.wobble+=this._cssX(Math.sin(time*15)*pulse*4);
    }else{
      const target=a.type==='ascend'?90:65,lift=target*(1-Math.pow(1-p,3))+Math.sin(Math.PI*p)*25;
      pose.dip-=this._cssY(lift);pose.tilt-=Math.sin(Math.PI*p)*.32;
    }
    return pose;
  }
  _flightY(){return this._flightAnchor().y;}
  _impactPosition(){return{x:this.w*.62,y:this.groundY};}
  _planePose(time){
    if(this.mode==='home')return{...this._viewAnchor('home'),tilt:0};
    if(this.mode==='crashed'){
      const origin=this.crashOrigin||{...this._viewAnchor('question'),tilt:0},p=this.crashP,fall=clamp((p-.1)/(CRASH_IMPACT-.1),0,1);
      if(p>=CRASH_IMPACT)return{...this._impactPosition(),tilt:1.42,scale:origin.scale};
      const spiral=Math.sin(fall*Math.PI*2)*Math.sin(fall*Math.PI),destination={x:this.w*.62-(this.crashNose?.x||0),y:this.h*.77-(this.crashNose?.y||0)};
      return{x:origin.x+(destination.x-origin.x)*fall+this._cssX(32*spiral),y:origin.y+(destination.y-origin.y)*Math.pow(fall,1.65),tilt:origin.tilt+(1.42-origin.tilt)*ease(fall)+Math.sin(fall*Math.PI*4)*.2*Math.sin(fall*Math.PI),scale:origin.scale};
    }
    const anchor=this._flightAnchor(),home=this._viewAnchor('home'),rescue=this._rescuePose(time),bob=this.reduced?0:this._cssY(Math.sin(time*1.9)*3);
    if(this.action?.type==='takeoff'){const source=this.takeoffOrigin||{...home,tilt:0},targetY=anchor.y-this._cssY(40),p=this.takeoffP;return{x:source.x+(anchor.x-source.x)*p,y:source.y+(targetY-source.y)*p+bob*p,tilt:source.tilt+(this._baseTilt(time)-source.tilt)*p,scale:source.scale+(anchor.scale-source.scale)*p};}
    return{x:home.x+(anchor.x-home.x)*this.takeoffP+rescue.wobble,y:home.y+(anchor.y-home.y)*this.takeoffP+bob+rescue.dip,tilt:this._baseTilt(time)+rescue.tilt,scale:home.scale+(anchor.scale-home.scale)*this.takeoffP};
  }
  _planePosition(time){const{x,y}=this._planePose(time);return{x,y};}
  _plane(time,p=this._planePose(time)){
    this.lastPlanePose=p;
    if(this.mode==='crashed'&&this.crashP>=CRASH_IMPACT)return;
    const g=this.g,shake=this.mode==='crashed'&&this.crashP<.13&&!this.reduced?this._cssX(Math.sin(time*24)*3):0;
    g.save();g.translate(Math.round(p.x+shake),Math.round(p.y));g.rotate(p.tilt);g.scale(p.scale,p.scale);
    for(const run of PLANE_RUNS)this._rect(run.x,run.y,run.width,1,run.color);
    if(this.mode!=='crashed'&&!this.reduced){g.globalAlpha=.65;this._rect(14,Math.floor(time*14)%2?-5:-8,1,12,'#e4efdf');g.globalAlpha=1;}
    g.restore();
  }
  _trails(time,p=this._planePose(time)){
    if(this.mode!=='flying'||this.reduced)return;this.g.globalAlpha=.18;
    const boost=this.boostUntil>time;
    for(let i=0;i<(boost?9:5);i++){const length=(boost?24:12)+i*4,wind=((time*(boost?65:12+this.speed*25)+i*21)%100);this._rect(p.x-25-wind,p.y+(i-(boost?4:2))*4,length,1,boost?'#f8e3ac':i%2?'#e0eee0':'#aacbd4');}
    this.g.globalAlpha=1;
  }
  _effects(dt,time,plane=this._planePose(time)){
    let alive=0;
    for(const p of this.particles){p.life+=dt;if(p.life>=p.max)continue;this.particles[alive++]=p;p.x+=p.vx*dt;p.y+=p.vy*dt;this.g.globalAlpha=Math.max(0,1-p.life/p.max);this._rect(p.x,p.y,p.size,p.size,p.color);}
    this.particles.length=alive;this.g.globalAlpha=1;
    if(this.mode==='flying'&&(this.danger||this.staticStall||this.action?.type==='stall')){
      const strength=Math.max(this.danger,this.staticStall,this.action?.type==='stall'?this.stallLevel:0);
      const count=2+Math.ceil(strength);
      for(let i=0;i<count;i++){
        const age=this.reduced?(i+.5)/count:((time*.75+i/count)%1);
        this.g.globalAlpha=(1-age)*(.3+strength*.08);
        this._rect(plane.x-16-age*20,plane.y-2-age*7,2+age*3,2+age*3,i%2?'#8a91a0':'#bac2c1');
      }
      this.g.globalAlpha=1;
    }
    if(this.mode==='crashed'&&this.crashP<CRASH_IMPACT){for(let i=0;i<7;i++){const age=((this.crashP*2.5+i*.12)%1),x=plane.x-9-age*24,y=plane.y-5-age*14;this.g.globalAlpha=(1-age)*.7;this._rect(x,y,3+age*5,3+age*4,i%2?'#758392':'#b2a5a5');}this.g.globalAlpha=1;}
  }
  _impact(time){
    const{x,y}=this._impactPosition(),p=clamp((this.crashP-CRASH_IMPACT)/(1-CRASH_IMPACT),0,1),radius=this._cssX(8+ease(p)*54);
    this.g.globalAlpha=this.reduced?.75:1-p*.4;
    for(let i=0;i<16;i++){const angle=i/16*Math.PI*2;this._rect(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius*.42-2,4+i%3,3+i%2,i%3?'#b7b0a0':'#e5c9aa');}
    // The wreck and dust share the exact ground contact used by the dive.
    this.g.globalAlpha=1;this._rect(x-7,y-2,11,3,'#c57b90');this._rect(x+2,y-3,6,2,'#ffe1bc');this._rect(x-2,y+1,3,2,'#294b60');
    for(let i=0;i<5;i++){const age=this.reduced?(i+.5)/5:((time*.3+i/5)%1);this.g.globalAlpha=(1-age)*.55;this._rect(x-3-age*8,y-5-age*18,3+age*5,3+age*4,i%2?'#64717f':'#a6a4a2');}this.g.globalAlpha=1;
  }
}
