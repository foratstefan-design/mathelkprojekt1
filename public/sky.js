import { PLANE_SPRITE, PLANE_PALETTE } from './art.js';

const ease=p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
/** A procedural pixel world: ascent moves clouds and landscape down the screen. */
export class FlightScene {
  constructor(canvas) {
    if(!canvas?.getContext)throw new TypeError('FlightScene needs a canvas.');
    this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});
    this.buffer=document.createElement('canvas');this.g=this.buffer.getContext('2d',{alpha:false});
    if(!this.ctx||!this.g)throw new Error('Canvas 2D is unavailable.');
    canvas.setAttribute('aria-hidden','true');canvas.style.imageRendering='pixelated';
    this.motion=window.matchMedia('(prefers-reduced-motion: reduce)');this.reduced=this.motion.matches;
    this.mode='home';this.altitude=0;this.targetAltitude=0;this.visualAltitude=0;
    this.speed=0;this.targetSpeed=0;this.climb=0;this.takeoffP=0;this.crashP=0;
    this.altitudeTween=null;this.action=null;this.particles=[];this.boostUntil=0;
    this.danger=0;this.stallP=1;this.recoverP=1;this.stallLevel=0;this.staticStall=0;
    this.frame=0;this.lastTime=0;this.dead=false;this.time=0;
    this._onResize=()=>this.resize();
    this._onMotion=()=>{
      this.reduced=this.motion.matches;cancelAnimationFrame(this.frame);
      if(this.reduced){this.altitude=this.targetAltitude;this.altitudeTween=null;this.particles.length=0;this.climb=0;
        if(this.action){if(this.action.type==='crash'){this.crashP=1;this.mode='crashed';}else if(this.action.type==='takeoff')this.takeoffP=1;else if(this.action.type==='stall'){this.stallP=1;this.staticStall=this.stallLevel;}else this.recoverP=1;this._settleAction();}
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
      this.time+=dt;this._render(this.time,dt);this.frame=requestAnimationFrame(this._tick);
    };
    window.addEventListener('resize',this._onResize,{passive:true});this.motion.addEventListener?.('change',this._onMotion);
    if(window.ResizeObserver){this.observer=new ResizeObserver(this._onResize);this.observer.observe(canvas);}
    this.resize();if(!this.reduced)this.frame=requestAnimationFrame(this._tick);
  }
  resize(){
    if(this.dead)return;const b=this.canvas.getBoundingClientRect(),width=Math.max(1,b.width||window.innerWidth),height=Math.max(1,b.height||window.innerHeight);
    this.cssWidth=width;this.w=Math.max(100,Math.ceil(width/3));this.h=Math.max(120,Math.ceil(height/3));
    this.buffer.width=this.w;this.buffer.height=this.h;this.canvas.width=Math.round(width*Math.min(2,window.devicePixelRatio||1));this.canvas.height=Math.round(height*Math.min(2,window.devicePixelRatio||1));
    this.ctx.imageSmoothingEnabled=this.g.imageSmoothingEnabled=false;this._render(this.reduced?0:this.time,0);
  }
  setMode(mode){
    if(this.dead||!['home','flying','crashed'].includes(mode))return;
    if(mode==='home'){this.reset();return;}
    this.mode=mode;if(mode==='crashed'){this.crashP=1;this._settleAction();}else if(!this.action)this.takeoffP=1;
    if(this.reduced)this._render(0,0);
  }
  setAltitude(meters,{duration=1600}={}){
    if(this.dead)return;const n=Number(meters),target=Number.isFinite(n)?Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,n)):0;this.targetAltitude=target;
    if(this.reduced||duration<=0){this.altitude=target;this.altitudeTween=null;this._render(this.reduced?0:this.time,0);return;}
    this.altitudeTween={from:this.altitude,to:target,started:performance.now(),duration:clamp(Number(duration)||1600,1,20000)};
  }
  setSpeed(streak=0){this.targetSpeed=clamp(Number(streak)||0,0,30)/30;if(this.reduced)this.speed=this.targetSpeed;}
  takeoff(){
    if(this.dead)return Promise.resolve();this._settleAction();this.mode='flying';this.takeoffP=0;this.crashP=0;this.danger=this.staticStall=0;
    if(this.reduced){this.takeoffP=1;this._render(0,0);return Promise.resolve();}
    return new Promise(resolve=>{this.action={type:'takeoff',started:performance.now(),duration:1400,resolve};});
  }
  boost(){
    if(this.dead||this.reduced||this.mode!=='flying')return;this.boostUntil=this.time+1.3;
    const position=this._planePosition(this.time);
    for(let i=0;i<22;i++)this.particles.push({x:position.x-17,y:position.y+this._random(i+40)*7-3,vx:-25-this._random(i+20)*30,vy:this._random(i+30)*12-6,life:0,max:.6+this._random(i+50)*.8,color:i%3?'#f7dc9d':'#c1f2ec',size:i%4?1:2});
  }
  /** Canonical run state owns persistent danger; daily mistakes can remain transient. */
  setDanger(level=0){
    if(this.dead)return;this.danger=clamp(Math.floor(Number(level)||0),0,2);this.staticStall=0;
    if(this.reduced)this._render(0,0);
  }
  /** Brief nonterminal loss of lift. It never changes score, altitude, or flight mode. */
  stall(level=1){
    if(this.dead||this.mode!=='flying')return Promise.resolve();this._settleAction();
    this.stallLevel=clamp(Number(level)||1,1,2);this.stallP=0;this.recoverP=1;this.boostUntil=0;
    if(this.reduced){this.stallP=1;this.staticStall=this.stallLevel;this._render(0,0);return Promise.resolve();}
    return new Promise(resolve=>{this.action={type:'stall',started:performance.now(),duration:900,resolve};});
  }
  /** A correct rescue clears warning smoke and gently pulls the nose up again. */
  recover(){
    if(this.dead||this.mode!=='flying')return Promise.resolve();this._settleAction();
    this.danger=this.staticStall=this.stallLevel=0;this.stallP=1;this.recoverP=0;
    if(this.reduced){this.recoverP=1;this._render(0,0);return Promise.resolve();}
    const pending=new Promise(resolve=>{this.action={type:'recover',started:performance.now(),duration:800,resolve};});
    this.boost();return pending;
  }
  crash(){
    if(this.dead)return Promise.resolve();this._settleAction();this.altitudeTween=null;this.targetAltitude=this.altitude;this.mode='crashed';this.danger=this.staticStall=0;this.crashP=0;this.crashFrom=this.altitude+(this.takeoffP||1)*350;this.particles.length=0;
    if(this.reduced){this.crashP=1;this._render(0,0);return Promise.resolve();}
    return new Promise(resolve=>{this.action={type:'crash',started:performance.now(),duration:2200,resolve};});
  }
  reset(){
    if(this.dead)return;this._settleAction();this.mode='home';this.altitude=this.targetAltitude=0;this.altitudeTween=null;this.takeoffP=this.crashP=this.climb=0;this.danger=this.staticStall=this.stallLevel=0;this.stallP=this.recoverP=1;this.speed=this.targetSpeed=0;this.particles.length=0;this._render(this.reduced?0:this.time,0);
  }
  destroy(){
    if(this.dead)return;this.dead=true;cancelAnimationFrame(this.frame);this._settleAction();window.removeEventListener('resize',this._onResize);this.motion.removeEventListener?.('change',this._onMotion);this.observer?.disconnect();this.particles.length=0;this.buffer.width=this.buffer.height=1;
  }
  _settleAction(){if(this.action){const {resolve}=this.action;this.action=null;resolve();}}
  _animate(now){
    if(this.altitudeTween){const a=this.altitudeTween,p=clamp((now-a.started)/a.duration,0,1);this.altitude=a.from+(a.to-a.from)*ease(p);if(p===1)this.altitudeTween=null;}
    if(this.action){const a=this.action,p=clamp((now-a.started)/a.duration,0,1);if(a.type==='takeoff')this.takeoffP=ease(p);else if(a.type==='crash')this.crashP=p;else if(a.type==='stall')this.stallP=p;else if(a.type==='recover')this.recoverP=p;if(p===1)this._settleAction();}
  }
  _random(seed){let n=Math.imul((seed|0)^0x9e3779b9,1597334677);n=Math.imul(n^n>>>16,2246822507);return((n^n>>>13)>>>0)/4294967296;}
  _rect(x,y,w,h,color){if(w<=0||h<=0)return;this.g.fillStyle=color;this.g.fillRect(Math.round(x),Math.round(y),Math.ceil(w),Math.ceil(h));}
  _poly(points,color){const g=this.g;g.fillStyle=color;g.beginPath();points.forEach(([x,y],i)=>i?g.lineTo(Math.round(x),Math.round(y)):g.moveTo(Math.round(x),Math.round(y)));g.closePath();g.fill();}
  _mix(a,b,p){return a.map((n,i)=>Math.round(n+(b[i]-n)*clamp(p,0,1)));}
  _skyColor(altitude,y){
    const stops=[[0,[115,183,201]],[2500,[86,146,181]],[7000,[58,104,151]],[14000,[36,62,109]],[26000,[19,33,71]],[50000,[10,20,47]]];
    let a=stops[0],b=stops.at(-1);for(let i=1;i<stops.length;i++){b=stops[i];if(altitude<=b[0])break;a=b;}
    const base=this._mix(a[1],b[1],(altitude-a[0])/Math.max(1,b[0]-a[0]));return 'rgb('+this._mix(base,[192,220,213],Math.max(0,1-altitude/11000)*y*.5).join(',')+')';
  }
  _render(time,dt){
    if(this.dead||!this.w)return;const g=this.g,w=this.w,h=this.h;g.globalAlpha=1;
    const crash=this.mode==='crashed';
    this.visualAltitude=crash?Math.max(0,(this.crashFrom||this.altitude)*(1-ease(Math.min(1,this.crashP/.83)))):this.altitude+(this.mode==='flying'?350*this.takeoffP:0);
    this.camera=this.visualAltitude*h/2200;
    // Start controls begin below 56%; keep the runway and parked plane above them.
    const groundBase=this.mode==='home'?.52:this.mode==='flying'?.52+.25*this.takeoffP:.77;
    this.groundY=h*groundBase+this.camera;
    for(let y=0;y<h;y+=8)this._rect(0,y,w,9,this._skyColor(this.visualAltitude,y/h));
    this._stars(time);this._sun(time);this._clouds(time);
    if(this.groundY<h+70)this._landscape(time);
    this._trails(time);this._plane(time);this._effects(dt,time);
    if(crash&&this.crashP>=.78)this._impact(time);
    this.ctx.imageSmoothingEnabled=false;this.ctx.drawImage(this.buffer,0,0,w,h,0,0,this.canvas.width,this.canvas.height);
  }
  _stars(time){
    const strength=clamp((this.visualAltitude-5500)/11000,0,1);if(!strength)return;this.g.globalAlpha=strength;
    for(let i=0;i<65;i++){const x=this._random(i+313)*this.w,y=((this._random(i+417)*this.h+this.visualAltitude*.002*(.4+this._random(i+215)))%this.h+this.h)%this.h;this._rect(x,y,i%13===0?2:1,1,i%4?'#b4cddd':'#f5e6bd');if(i%13===0)this._rect(x+1,y-1,1,3,'#d7e3dc');}
    if(this.visualAltitude>21000){this.g.globalAlpha=strength*.16;this._poly([[0,this.h*.26],[this.w*.42,this.h*.1],[this.w,this.h*.25],[this.w,this.h*.3],[this.w*.4,this.h*.18],[0,this.h*.33]],'#a99aca');}
    this.g.globalAlpha=1;
  }
  _sun(time){
    const alpha=clamp(1-this.visualAltitude/14000,0,1);if(!alpha)return;this.g.globalAlpha=alpha;const x=this.w*.81,y=this.h*.19+this.camera*.05;
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
        this.g.globalAlpha=clamp(1-altitude/19000,.09,1)*(layer===0?.4:layer===1?.6:.85);
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
  _rescuePose(time){
    const stall=this.action?.type==='stall'?Math.sin(Math.PI*this.stallP):0;
    const recovery=this.action?.type==='recover'?Math.sin(Math.PI*this.recoverP):0;
    const warning=this.danger;
    return {
      dip:warning*.9+stall*(5+this.stallLevel*2)-recovery*5+this.staticStall*2,
      tilt:warning*.045+stall*(.25+this.stallLevel*.1)-recovery*.16+this.staticStall*.12,
      wobble:this.reduced?0:Math.sin(time*6.2)*(warning*.35+stall*1.6)
    };
  }
  _flightY(){return this.cssWidth<550?Math.min(130/3,this.h*.22):this.h*.57;}
  _planePosition(time){
    const cruiseY=this._flightY();
    const home=this.mode==='home',flying=this.mode==='flying';let x=this.w*(home?.5:.22),y=home?this.h*.48:cruiseY;
    if(flying){const rescue=this._rescuePose(time);y=this.h*.48+(cruiseY-this.h*.48)*this.takeoffP+(this.reduced?0:Math.sin(time*1.9)*1.3)+rescue.dip;x=this.w*(.5-.28*this.takeoffP)+rescue.wobble;}
    if(this.mode==='crashed'){const p=this.crashP;const fall=clamp((p-.16)/.66,0,1);x=this.w*.22+Math.sin(Math.min(1,fall)*Math.PI*.5)*this.w*.13;y=cruiseY+Math.pow(fall,1.5)*(this.h*.84-cruiseY);}
    return{x,y};
  }
  _plane(time){
    if(this.mode==='crashed'&&this.crashP>=.8)return;const g=this.g,p=this._planePosition(time),scale=this.w<210?.75:1;let tilt=0;
    if(this.mode==='flying'){const rescue=this._rescuePose(time);tilt=-.09*this.takeoffP-this.climb*.18-(this.boostUntil>time?.08:0)+rescue.tilt+(this.reduced?0:Math.sin(time*7)*this.danger*.018);}
    if(this.mode==='crashed'){const fall=clamp((this.crashP-.13)/.67,0,1);tilt=fall*1.48;}
    const shake=this.mode==='crashed'&&this.crashP<.22&&!this.reduced?Math.sin(time*24)*1.2:0;
    g.save();g.translate(Math.round(p.x+shake),Math.round(p.y));g.rotate(tilt);g.scale(scale,scale);
    for(let y=0;y<PLANE_SPRITE.length;y++)for(let x=0;x<48;){const c=PLANE_SPRITE[y][x];if(!PLANE_PALETTE[c]){x++;continue;}let end=x+1;while(end<48&&PLANE_SPRITE[y][end]===c)end++;this._rect(x-24,y-11,end-x,1,PLANE_PALETTE[c]);x=end;}
    if(this.mode!=='crashed'&&!this.reduced){g.globalAlpha=.5;this._rect(14,Math.floor(time*14)%2?-5:-8,1,12,'#e4efdf');g.globalAlpha=1;}
    g.restore();
  }
  _trails(time){
    if(this.mode!=='flying'||this.reduced)return;const p=this._planePosition(time);this.g.globalAlpha=.18;
    for(let i=0;i<5;i++){const length=12+i*4,wind=((time*(12+this.speed*25)+i*21)%100);this._rect(p.x-25-wind,p.y+(i-2)*4,length,1,i%2?'#e0eee0':'#aacbd4');}
    this.g.globalAlpha=1;
  }
  _effects(dt,time){
    for(const p of this.particles){p.life+=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;this.g.globalAlpha=Math.max(0,1-p.life/p.max);this._rect(p.x,p.y,p.size,p.size,p.color);}
    this.particles=this.particles.filter(p=>p.life<p.max);this.g.globalAlpha=1;
    if(this.mode==='flying'&&(this.danger||this.staticStall||this.action?.type==='stall')){
      const plane=this._planePosition(time),strength=Math.max(this.danger,this.staticStall,this.action?.type==='stall'?this.stallLevel:0);
      const count=2+Math.ceil(strength);
      for(let i=0;i<count;i++){
        const age=this.reduced?(i+.5)/count:((time*.75+i/count)%1);
        this.g.globalAlpha=(1-age)*(.3+strength*.08);
        this._rect(plane.x-16-age*20,plane.y-2-age*7,2+age*3,2+age*3,i%2?'#8a91a0':'#bac2c1');
      }
      this.g.globalAlpha=1;
    }
    if(this.mode==='crashed'&&this.crashP<.8){const plane=this._planePosition(time);for(let i=0;i<7;i++){const age=((this.crashP*2.5+i*.12)%1),x=plane.x-9-age*24,y=plane.y-5-age*14;this.g.globalAlpha=(1-age)*.7;this._rect(x,y,3+age*5,3+age*4,i%2?'#758392':'#b2a5a5');}this.g.globalAlpha=1;}
  }
  _impact(time){
    const x=this.w*.35,y=this.h*.84,p=clamp((this.crashP-.78)/.22,0,1),radius=4+ease(p)*14;
    this.g.globalAlpha=this.reduced?.75:1-p*.45;
    for(let i=0;i<10;i++){const angle=i/10*Math.PI*2;this._rect(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius*.5,4+i%3,3+i%2,i%3?'#b7b0a0':'#e5c9aa');}
    this.g.globalAlpha=1;this._rect(x-7,y+2,11,3,'#c57b90');this._rect(x+2,y,6,2,'#ffe1bc');this._rect(x-2,y+6,3,2,'#294b60');
  }
}
