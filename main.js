
(()=>{
const w=document.getElementById('world');
const moveZone=document.getElementById('move-zone');
const jb=document.getElementById('stick-base');
const jk=document.getElementById('stick-knob');
const runBtn=document.getElementById('run-btn');
const actBtn=document.getElementById('act-btn');
const menuBtn=document.getElementById('menu-btn');
const menu=document.getElementById('menu');
const scanlineBtn=document.getElementById('scanline-btn');
const sensBtn=document.getElementById('sens-btn');
const bobBtn=document.getElementById('bob-btn');
const scanline=document.getElementById('scanline');
const lookZone=document.getElementById('look-zone');
const hint=document.getElementById('hint');
const hintText=document.getElementById('hint-text');
const held=document.getElementById('held-item');

const S={
  x:0,y:1.68,z:720,yaw:0,pitch:-0.03,run:false,bob:true,
  sensIndex:1,sens:[0.0018,0.0023,0.0029],
  joy:{id:null,vx:0,vy:0,active:false},
  look:{id:null,x:0,y:0,active:false},
  hasDrink:false,doorOpen:false,scan:false,fadeAt:performance.now()+5400
};
const INPUT={dead:0.09,max:0.30,outer:1.35,walk:130,run:198};
const COLL=[]; const INTER=[]; const uiSel='#top-ui, #menu, #right-ui, button';

function el(t,c,p=w){const n=document.createElement(t); if(c)n.className=c; p.appendChild(n); return n;}
function tr(n,x,y,z,rx=0,ry=0,rz=0){n.style.transform=`translate3d(${x}px,${-y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;}
function plane(o){
  const n=el('div','plane',o.parent||w); n.style.width=o.w+'px'; n.style.height=o.h+'px';
  n.style.background=o.background||'#fff'; if(o.opacity!=null) n.style.opacity=o.opacity;
  tr(n,o.x,o.y,o.z,o.rx||-90,o.ry||0,o.rz||0); return n;
}
function box(o){
  const n=el('div','box',o.parent||w); const hw=o.w/2, hh=o.h/2, hd=o.d/2;
  const def={front:'#d9dde4',back:'#cfd5de',left:'#b5bcc7',right:'#bcc4cf',top:'#f1f4f8',bottom:'#727987'};
  const f={...def,...(o.faces||{})}; tr(n,o.x,o.y+hh,o.z);
  [
    ['front',o.w,o.h,0,0,hd,0,0,0],['back',o.w,o.h,0,0,-hd,0,180,0],
    ['left',o.d,o.h,-hw,0,0,0,-90,0],['right',o.d,o.h,hw,0,0,0,90,0],
    ['top',o.w,o.d,0,-hh,0,90,0,0],['bottom',o.w,o.d,0,hh,0,-90,0,0]
  ].forEach(([name,fw,fh,fx,fy,fz,rx,ry,rz])=>{
    const face=el('div',`face ${name}`,n);
    face.style.width=fw+'px'; face.style.height=fh+'px'; face.style.background=f[name];
    tr(face,fx,fy,fz,rx,ry,rz);
  });
  if(o.collider!==false) COLL.push({x:o.x,z:o.z,w:o.w,d:o.d});
  return n;
}
function addInter(id,x,z,r,label,action){INTER.push({id,x,z,r,label,action});}

function makeTown(){
  plane({x:0,y:0,z:360,w:1500,h:3600,background:'linear-gradient(180deg,#3b4250 0%,#313846 35%,#2b303b 100%)'});
  plane({x:0,y:1,z:190,w:380,h:260,background:'linear-gradient(180deg,rgba(70,76,88,.98) 0%,rgba(52,58,70,.98) 100%)'});
  plane({x:-280,y:1,z:440,w:340,h:980,background:'linear-gradient(180deg,#444b56 0%,#3b414c 100%)'});
  plane({x:260,y:1,z:460,w:320,h:1040,background:'linear-gradient(180deg,#444b56 0%,#363d47 100%)'});
  plane({x:-470,y:1,z:350,w:260,h:620,background:'linear-gradient(180deg,#26311f 0%,#1f2719 100%)'});
  plane({x:470,y:1,z:380,w:260,h:700,background:'linear-gradient(180deg,#26311f 0%,#1f2719 100%)'});
  for(let i=0;i<4;i++) plane({x:-44+i*58,y:1.2,z:184,w:7,h:60,background:'rgba(245,245,246,0.92)'});
  [-128,-44,44,128].forEach(x=>plane({x,y:1.2,z:106,w:8,h:146,background:'rgba(228,234,240,0.85)'}));

  function house(x,z,wid=180,dep=150,lit=false,roof='#756a63',wall='#d2d0ca'){
    box({x,y:92,z,w:wid,h:184,d:dep,faces:{front:wall,back:'#c4c1bb',left:'#bebbb5',right:'#bebbb5',top:roof}});
    box({x,y:160,z,w:wid+20,h:18,d:dep+20,faces:{front:roof,back:'#625952',left:'#5c534d',right:'#5c534d',top:'#8a7d73'}});
    const wx=wid*0.22;
    [-wx,wx].forEach(px=>box({x:x+px,y:112,z:z+dep/2+2,w:42,h:54,d:4,faces:{front:lit?'rgba(245,224,170,.38)':'rgba(195,214,235,.12)',back:'rgba(0,0,0,.02)',left:'#748292',right:'#748292',top:'#d8e2ec'},collider:false}));
    box({x,y:78,z:z+dep/2+4,w:44,h:88,d:6,faces:{front:'#6c727b',back:'#4d535c',left:'#555d68',right:'#555d68',top:'#adb5be'},collider:false});
  }
  function apt(x,z){
    box({x,y:140,z,w:214,h:280,d:172,faces:{front:'#c8ccd1',back:'#b8bec5',left:'#b0b7bf',right:'#b0b7bf',top:'#7c7f86'}});
    box({x,y:166,z:z+89,w:182,h:182,d:8,faces:{front:'#7a818a',back:'#5b616a',left:'#666d76',right:'#666d76',top:'#e5ebf0'},collider:false});
  }
  function fence(x,z,wid){
    for(let i=0;i<Math.floor(wid/30);i++){
      box({x:x-wid/2+i*30,y:20,z,w:4,h:40,d:4,faces:{front:'#6f7781',back:'#5b636d',left:'#4a515b',right:'#4a515b',top:'#aab3bc'}});
      box({x:x-wid/2+i*30+14,y:30,z,w:28,h:4,d:4,faces:{front:'#8c949e',back:'#717882',left:'#5a616b',right:'#5a616b',top:'#cad1d9'},collider:false});
    }
  }
  function shrub(x,z,wid=70,dep=44,col='#385631'){ box({x,y:18,z,w:wid,h:36,d:dep,faces:{front:col,back:'#254220',left:'#2c4c27',right:'#2c4c27',top:'#517843'}}); }
  function pole(x,z,h=320){ box({x,y:h/2,z,w:10,h,d:10,faces:{front:'#404752',back:'#2d333d',left:'#363d48',right:'#363d48',top:'#7f8894'}}); box({x:x+26,y:h-18,z:z+4,w:54,h:8,d:8,faces:{front:'#4a525d',back:'#414853',left:'#333944',right:'#333944',top:'#79828d'}}); }
  function lamp(x,z,h=260){ pole(x,z,h); box({x:x+54,y:h-18,z:z+4,w:18,h:16,d:22,faces:{front:'#f0db9a',back:'#6d654a',left:'#b4a36f',right:'#b4a36f',top:'#fff4ca'},collider:false}); plane({x:x+54,y:h-8,z:z+4,w:110,h:110,background:'radial-gradient(circle at center, rgba(255,235,180,.28), rgba(255,235,180,.08) 55%, transparent 70%)',rx:0,opacity:.95}); }
  function vending(x,z){ box({x,y:86,z,w:66,h:174,d:50,faces:{front:'#f3f7fd',back:'#d4dae3',left:'#cad2dc',right:'#cad2dc',top:'#ffffff'}}); box({x,y:112,z:z+25,w:42,h:48,d:2,faces:{front:'rgba(212,233,255,.18)',back:'#122138',left:'#38506a',right:'#38506a',top:'#cde8ff'},collider:false}); const cols=['#ff5d5d','#4eb1ff','#65d07f','#f2d157','#c38cff']; for(let i=0;i<5;i++) box({x:x-18+i*9,y:96,z:z+26,w:6,h:18,d:2,faces:{front:cols[i],back:'#435166',left:'#7d8ba0',right:'#7d8ba0',top:'#fcfdff'},collider:false}); }

  lamp(-152,220,310); lamp(176,80,292); pole(-248,320,326); pole(270,226,330); vending(176,176);
  house(-252,-30,164,138,false,'#6e655f','#cbc9c4');
  house(-470,92,182,148,true,'#66605b','#d8d2ca');
  house(316,-88,174,146,true,'#706863','#d2d1cb');
  house(460,118,158,132,false,'#6f655d','#cfcac4');
  apt(-426,292);
  fence(-248,144,224); fence(310,164,204);
  shrub(-182,144,72,42,'#35512f'); shrub(-118,140,60,38,'#43693a'); shrub(264,162,82,42,'#35512f'); shrub(346,160,66,34,'#507847');
}
function makeStore(){
  box({x:0,y:160,z:0,w:380,h:320,d:250,faces:{front:'#e8ecef',back:'#cfd7dc',left:'#d6dee2',right:'#d6dee2',top:'#f2f5f7'}});
  box({x:0,y:238,z:120,w:370,h:20,d:22,faces:{front:'#f6f8fa',back:'#d2d9df',left:'#cbd3d9',right:'#cbd3d9',top:'#fcfdff'},collider:false});
  box({x:0,y:214,z:121,w:370,h:28,d:12,faces:{front:'linear-gradient(90deg,#cb4a47 0 18%,#49a866 18% 82%,#d3b047 82% 100%)',back:'#99a5ae',left:'#9ba8b0',right:'#9ba8b0',top:'#f1f5f8'},collider:false});
  box({x:0,y:176,z:122,w:350,h:126,d:10,faces:{front:'rgba(210,229,255,.18)',back:'rgba(210,229,255,.06)',left:'#7f90a0',right:'#7f90a0',top:'#e5edf5'},collider:false});
  [-128,128,-30,30].forEach(x=>box({x,y:176,z:126,w:8,h:122,d:12,faces:{front:'#667688',back:'#566575',left:'#4d5968',right:'#4d5968',top:'#8fa0af'},collider:false}));
  COLL.push({x:-160,z:0,w:60,d:250},{x:160,z:0,w:60,d:250},{x:0,z:-114,w:380,d:22},{x:0,z:114,w:380,d:22});

  S.doorL=box({x:-16,y:160,z:126,w:48,h:114,d:4,faces:{front:'rgba(210,228,255,.12)',back:'rgba(210,228,255,.05)',left:'#7c8b9c',right:'#7c8b9c',top:'#dce8f4'},collider:false});
  S.doorR=box({x:16,y:160,z:126,w:48,h:114,d:4,faces:{front:'rgba(210,228,255,.12)',back:'rgba(210,228,255,.05)',left:'#7c8b9c',right:'#7c8b9c',top:'#dce8f4'},collider:false});
  addInter('door',0,158,92,()=>S.doorOpen?'入口':'ドア',()=>{
    S.doorOpen=true;
    S.doorL.style.transform='translate3d(-58px,-160px,154px)';
    S.doorR.style.transform='translate3d(58px,-160px,154px)';
    hintText.textContent='ドアが開いた。中へ入れる。';
    hint.classList.remove('dim'); S.fadeAt=performance.now()+2200;
  });

  plane({x:0,y:1.2,z:0,w:344,h:226,background:'linear-gradient(180deg,#f3f4f5 0%,#eceef0 100%)'});
  plane({x:0,y:318,z:0,w:344,h:228,background:'linear-gradient(180deg,#dadfd9 0%,#d0d5cf 100%)',rx:90});
  plane({x:-170,y:160,z:0,w:226,h:320,background:'linear-gradient(180deg,#dad6cf 0%,#c8c3bb 100%)',rx:0,ry:90});
  plane({x:170,y:160,z:0,w:226,h:320,background:'linear-gradient(180deg,#dad6cf 0%,#c8c3bb 100%)',rx:0,ry:-90});
  plane({x:0,y:160,z:-114,w:344,h:320,background:'linear-gradient(180deg,#d8d7d3 0%,#c8c6c2 100%)',rx:0,ry:180});

  function rack(x,z,height=136,kind='snack'){
    const g=el('div','object'); tr(g,x,0,z);
    box({x:-54,y:height/2,z:0,w:16,h:height,d:128,faces:{front:'#99a2ad',back:'#8d949d',left:'#8d949d',right:'#8d949d',top:'#d2d8e0'},parent:g,collider:false});
    box({x:54,y:height/2,z:0,w:16,h:height,d:128,faces:{front:'#99a2ad',back:'#8d949d',left:'#8d949d',right:'#8d949d',top:'#d2d8e0'},parent:g,collider:false});
    const levels=kind==='mag'?[28,58,88]:[38,72,106,140];
    levels.forEach(py=>box({x:0,y:py,z:0,w:124,h:6,d:kind==='mag'?36:46,faces:{front:'#e3e8ed',back:'#d2d9e2',left:'#c4ccd5',right:'#c4ccd5',top:'#f5f9fd'},parent:g,collider:false}));
    const cols=kind==='daily'?['#7ec4ff','#f5a46d','#9ddf86','#d6a5ff','#ffd86d']:kind==='mag'?['#ff8d8d','#8fc3ff','#ffe089','#b9ffa8','#d6a5ff']:['#eb5a5a','#5274e8','#f0d470','#52bc7a','#ff8a48','#9f62ff'];
    const rows=kind==='mag'?3:4;
    for(let r=0;r<rows;r++){
      const py=(kind==='mag'?22:32)+r*(kind==='mag'?30:34);
      for(let i=0;i<(kind==='mag'?6:7);i++){
        const pz=-46+i*15;
        box({x:0,y:py,z:pz,w:kind==='mag'?30:28,h:kind==='mag'?20:24,d:kind==='mag'?8:12,faces:{front:cols[(i+r)%cols.length],back:'#42505f',left:'#6d7b8b',right:'#6d7b8b',top:'#f9fbff'},parent:g,collider:false});
      }
    }
    COLL.push({x,z,w:128,d:54});
  }
  rack(-38,28,140,'snack');
  rack(68,6,148,'daily');
  rack(10,-78,104,'mag');

  const fridge=el('div','object'); tr(fridge,-122,0,-34);
  box({x:0,y:114,z:0,w:252,h:228,d:78,faces:{front:'#f3f7fc',back:'#d5dce5',left:'#d0d7df',right:'#d0d7df',top:'#f8fbff'},parent:fridge,collider:false});
  [-84,0,84].forEach(dx=>box({x:dx,y:116,z:40,w:66,h:196,d:4,faces:{front:'rgba(200,225,255,.18)',back:'rgba(200,225,255,.08)',left:'#7d8b9c',right:'#7d8b9c',top:'#9fb1c5'},parent:fridge,collider:false}));
  for(let r=0;r<4;r++) box({x:0,y:48+r*44,z:12,w:210,h:4,d:46,faces:{front:'#ced6df',back:'#c7cfd8',left:'#a4afbc',right:'#a4afbc',top:'#f8fbff'},parent:fridge,collider:false}));
  const fcols=['#59a7ff','#ffffff','#e65d5d','#47be73','#f2d257','#a07dff'];
  for(let r=0;r<4;r++) for(let c=0;c<10;c++){
    const px=-92+c*20, py=32+r*44;
    box({x:px,y:py,z:-4,w:12,h:30,d:12,faces:{front:fcols[(r+c)%fcols.length],back:'#54606d',left:'#768390',right:'#768390',top:'#f7fbff'},parent:fridge,collider:false});
  }
  COLL.push({x:-122,z:-34,w:252,d:80});
  addInter('fridge',-122,66,126,'冷蔵ケース',()=>{
    if(!S.hasDrink){ S.hasDrink=true; held.classList.remove('hidden'); hintText.textContent='飲み物を取った。レジへ向かおう。'; }
    else hintText.textContent='冷蔵ケース。白い灯りとガラスの冷たさが目立つ。';
    hint.classList.remove('dim'); S.fadeAt=performance.now()+2300;
  });

  const reg=el('div','object'); tr(reg,102,0,-60);
  box({x:0,y:58,z:0,w:194,h:116,d:66,faces:{front:'#d7ddd8',back:'#cdd3ce',left:'#c0c8c2',right:'#c0c8c2',top:'#eef3ef'},parent:reg,collider:false});
  box({x:-36,y:118,z:-8,w:44,h:30,d:10,faces:{front:'#1f2630',back:'#434c59',left:'#363f4c',right:'#363f4c',top:'#697280'},parent:reg,collider:false});
  box({x:34,y:112,z:-8,w:32,h:20,d:22,faces:{front:'#2d323a',back:'#454c57',left:'#596373',right:'#596373',top:'#97a2af'},parent:reg,collider:false});
  box({x:14,y:108,z:12,w:66,h:4,d:30,faces:{front:'#9aa5b1',back:'#8f9aa5',left:'#7f8994',right:'#7f8994',top:'#f0f4f8'},parent:reg,collider:false});
  box({x:-64,y:122,z:20,w:26,h:28,d:20,faces:{front:'#f2843d',back:'#b95c25',left:'#d06d2d',right:'#d06d2d',top:'#ffba8b'},parent:reg,collider:false});
  box({x:86,y:90,z:-2,w:46,h:94,d:34,faces:{front:'#d5dce4',back:'#bec7cf',left:'#aab6c2',right:'#aab6c2',top:'#eff4f8'},parent:reg,collider:false});
  COLL.push({x:102,z:-60,w:194,d:66});
  addInter('register',102,38,120,'レジ周辺',()=>{
    hintText.textContent=S.hasDrink?'レジ周辺。営業中の情報量があるが、人の気配は薄い。':'レジ周辺。先に飲み物を取った方がよさそうだ。';
    hint.classList.remove('dim'); S.fadeAt=performance.now()+2400;
  });
}
makeTown();
makeStore();

function wrap(a){while(a<-Math.PI)a+=Math.PI*2; while(a>Math.PI)a-=Math.PI*2; return a;}
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function hit(nx,nz){
  const r=18;
  for(const c of COLL){ if(Math.abs(nx-c.x)<=c.w/2+r && Math.abs(nz-c.z)<=c.d/2+r) return true; }
  return false;
}
function updateWorld(){
  const bob=S.bob?bobY:0;
  w.style.transform=`translate3d(${-S.x}px,${S.y*100-bob}px,${-S.z}px) rotateX(${S.pitch}rad) rotateY(${S.yaw}rad)`;
}
function nearest(){
  const fx=Math.sin(S.yaw), fz=-Math.cos(S.yaw);
  let best=null;
  for(const it of INTER){
    const dx=it.x-S.x, dz=it.z-S.z, dist=Math.hypot(dx,dz);
    if(dist>it.r) continue;
    const inv=dist>.001?1/dist:1, dot=dx*inv*fx+dz*inv*fz;
    if(dot<.42) continue;
    if(!best || dist<best.dist) best={it,dist};
  }
  return best;
}
function updateInteract(){
  const n=nearest();
  if(n){ actBtn.disabled=false; actBtn.textContent=typeof n.it.label==='function'?n.it.label():n.it.label; S.current=n.it; }
  else { actBtn.disabled=true; actBtn.textContent='調べる'; S.current=null; }
}

actBtn.addEventListener('click',()=>{ if(S.current) S.current.action(); });
runBtn.addEventListener('click',()=>{ S.run=!S.run; runBtn.textContent=`走る: ${S.run?'ON':'OFF'}`; runBtn.setAttribute('aria-pressed', String(S.run)); });
menuBtn.addEventListener('click',()=>menu.classList.toggle('hidden'));
scanlineBtn.addEventListener('click',()=>{ S.scan=!S.scan; scanlineBtn.textContent=S.scan?'ON':'OFF'; scanline.classList.toggle('hidden', !S.scan); });
sensBtn.addEventListener('click',()=>{ S.sensIndex=(S.sensIndex+1)%3; sensBtn.textContent=['低め','標準','高め'][S.sensIndex]; });
bobBtn.addEventListener('click',()=>{ S.bob=!S.bob; bobBtn.textContent=S.bob?'ON':'OFF'; });

const joyRect=()=>jb.getBoundingClientRect(); let jr=joyRect();
window.addEventListener('resize',()=>{ jr=joyRect(); });

moveZone.addEventListener('pointerdown',e=>{
  if(e.pointerType==='mouse' && e.button!==0) return;
  e.preventDefault();
  S.joy.active=true; S.joy.id=e.pointerId; jr=joyRect();
  moveZone.setPointerCapture(e.pointerId);
  joyUpdate(e.clientX,e.clientY);
},{passive:false});
moveZone.addEventListener('pointermove',e=>{
  if(!S.joy.active || e.pointerId!==S.joy.id) return;
  e.preventDefault();
  joyUpdate(e.clientX,e.clientY);
},{passive:false});
function joyEnd(e){
  if(!S.joy.active || e.pointerId!==S.joy.id) return;
  S.joy.active=false; S.joy.id=null; S.joy.vx=0; S.joy.vy=0;
  jk.style.transform='translate(0px,0px)';
}
moveZone.addEventListener('pointerup',joyEnd);
moveZone.addEventListener('pointercancel',joyEnd);

function joyUpdate(x,y){
  const cx=jr.left+jr.width/2, cy=jr.top+jr.height/2;
  let dx=x-cx, dy=y-cy;
  const len=Math.hypot(dx,dy)||1;
  const max=jr.width*INPUT.max, outer=jr.width*INPUT.outer;
  if(len>outer){ dx=dx/len*outer; dy=dy/len*outer; }
  const cur=Math.min(max, Math.hypot(dx,dy));
  const ndx=len?dx/len:0, ndy=len?dy/len:0;
  const localX=ndx*cur, localY=ndy*cur;
  let outX=localX/max, outY=localY/max;
  const mag=Math.hypot(outX,outY);
  if(mag<INPUT.dead){ outX=0; outY=0; }
  else {
    const norm=(mag-INPUT.dead)/(1-INPUT.dead);
    outX=(outX/mag)*norm; outY=(outY/mag)*norm;
  }
  S.joy.vx=outX; S.joy.vy=outY;
  jk.style.transform=`translate(${localX}px,${localY}px)`;
}

function isUI(t){ return !!t.closest(uiSel); }
lookZone.addEventListener('pointerdown',e=>{
  if(isUI(e.target)) return;
  e.preventDefault();
  S.look.active=true; S.look.id=e.pointerId; S.look.x=e.clientX; S.look.y=e.clientY;
  lookZone.setPointerCapture(e.pointerId);
},{passive:false});
lookZone.addEventListener('pointermove',e=>{
  if(!S.look.active || e.pointerId!==S.look.id) return;
  e.preventDefault();
  const dx=e.clientX-S.look.x, dy=e.clientY-S.look.y;
  S.look.x=e.clientX; S.look.y=e.clientY;
  const sens=S.sens[S.sensIndex];
  S.yaw=wrap(S.yaw-dx*sens);
  S.pitch=clamp(S.pitch-dy*sens*0.78,-0.46,0.32);
},{passive:false});
function lookEnd(e){ if(!S.look.active || e.pointerId!==S.look.id) return; S.look.active=false; S.look.id=null; }
lookZone.addEventListener('pointerup',lookEnd);
lookZone.addEventListener('pointercancel',lookEnd);

document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
document.addEventListener('touchmove',e=>{ if(e.target.closest('#game-root')) e.preventDefault(); },{passive:false});

let last=performance.now(), phase=0, bobY=0;
function loop(now){
  const dt=Math.min(0.032,(now-last)/1000); last=now;
  const mag=Math.hypot(S.joy.vx,S.joy.vy);
  let moved=false;
  if(mag>0.001){
    const nx=S.joy.vx/mag, ny=S.joy.vy/mag;
    const sin=Math.sin(S.yaw), cos=Math.cos(S.yaw);
    const speed=S.run?INPUT.run:INPUT.walk;
    // up on stick = forward in view direction
    const dx=(nx*cos + ny*sin) * speed * mag * dt;
    const dz=(ny*cos - nx*sin) * speed * mag * dt;
    const tx=S.x+dx, tz=S.z+dz;
    if(!hit(tx,S.z)) S.x=tx;
    if(!hit(S.x,tz)) S.z=tz;
    moved=true; phase+=dt*(S.run?13:9);
  }
  bobY = moved && S.bob ? Math.sin(phase)*1.6 : bobY*0.84;
  updateWorld(); updateInteract();
  if(now>S.fadeAt) hint.classList.add('dim');
  requestAnimationFrame(loop);
}
updateWorld();
requestAnimationFrame(loop);
})();
