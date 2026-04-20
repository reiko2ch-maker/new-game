
(()=>{
const w=document.getElementById('world');
const leftUI=document.getElementById('left-ui');
const jb=document.getElementById('joystick-base');
const jk=document.getElementById('joystick-knob');
const run=document.getElementById('run-toggle');
const act=document.getElementById('interact-btn');
const mt=document.getElementById('menu-toggle');
const mp=document.getElementById('menu-panel');
const st=document.getElementById('scanline-toggle');
const se=document.getElementById('sensitivity-toggle');
const bt=document.getElementById('bob-toggle');
const so=document.getElementById('scanline-overlay');
const vz=document.getElementById('view-drag-zone');
const hint=document.getElementById('hint');
const ht=document.getElementById('hint-text');
const held=document.getElementById('held-item');

const S={
  x:0,y:1.68,z:660,yaw:0,pitch:-.035,run:false,bob:true,
  sensitivityIndex:1,sensitivities:[.00185,.00235,.0029],
  joy:{active:false,id:null,vx:0,vy:0,originX:0,originY:0},
  look:{active:false,id:null,x:0,y:0},
  hasDrink:false,doorOpened:false,scanline:false,infoFadeAt:performance.now()+5600
};
const C=[],I=[],ui='.ui-blocker, #menu-panel, #menu-panel *';
const INPUT={joyDead:.11,joyMax:.30,joyOuter:1.48,walkSpeed:126,runSpeed:192};
let leftRect=null;

function E(t,c,p=w){const n=document.createElement(t); if(c)n.className=c; p.appendChild(n); return n;}
function T(n,x,y,z,rx=0,ry=0,rz=0){n.style.transform=`translate3d(${x}px,${-y}px,${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`;}
function P({x,y,z,w,h,rx=-90,ry=0,rz=0,background='#fff',opacity=1,parent=w}){const p=E('div','plane',parent); p.style.width=`${w}px`; p.style.height=`${h}px`; p.style.background=background; p.style.opacity=opacity; T(p,x,y,z,rx,ry,rz); return p;}
function B({x,y,z,w,h,d,faces={},parent=w,collider=true}){
  const b=E('div','box',parent), hw=w/2, hh=h/2, hd=d/2;
  const def={front:'#d9dde4',back:'#cfd5de',left:'#b5bcc7',right:'#bcc4cf',top:'#f1f4f8',bottom:'#727987'};
  const s={...def,...faces};
  T(b,x,y+hh,z);
  [
    ['front',w,h,0,0,hd,0,0,0],['back',w,h,0,0,-hd,0,180,0],
    ['left',d,h,-hw,0,0,0,-90,0],['right',d,h,hw,0,0,0,90,0],
    ['top',w,d,0,-hh,0,90,0,0],['bottom',w,d,0,hh,0,-90,0,0]
  ].forEach(([n,fw,fh,fx,fy,fz,rx,ry,rz])=>{
    const f=E('div',`face ${n}`,b);
    f.style.width=`${fw}px`; f.style.height=`${fh}px`; f.style.background=s[n];
    T(f,fx,fy,fz,rx,ry,rz);
  });
  if(collider) C.push({x,z,w,d});
  return b;
}
const gradStr = cols => `linear-gradient(90deg, ${cols.map((c,i)=>`${c} ${(i/cols.length)*100}% ${((i+1)/cols.length)*100}%`).join(',')})`;

function house(x,z,wid=180,dep=150,lit=false,roof='#756a63',wall='#d2d0ca'){
  B({x,y:92,z,w:wid,h:184,d:dep,faces:{front:wall,back:'#c4c1bb',left:'#bebbb5',right:'#bebbb5',top:roof}});
  B({x,y:160,z,w:wid+20,h:18,d:dep+20,faces:{front:roof,back:'#625952',left:'#5c534d',right:'#5c534d',top:'#8a7d73'}});
  const wx=wid*.22;
  [-wx,wx].forEach(px=>B({x:x+px,y:112,z:z+dep/2+2,w:42,h:54,d:4,faces:{front:lit?'rgba(245,224,170,.38)':'rgba(195,214,235,.12)',back:'rgba(0,0,0,.02)',left:'#748292',right:'#748292',top:'#d8e2ec'},collider:false}));
  B({x:x,y:78,z:z+dep/2+4,w:44,h:88,d:6,faces:{front:'#6c727b',back:'#4d535c',left:'#555d68',right:'#555d68',top:'#adb5be'},collider:false});
  B({x:x-wid/2-18,y:40,z:z+dep/2-10,w:26,h:80,d:20,faces:{front:'#d6d9dd',back:'#bcc3ca',left:'#9aa4af',right:'#9aa4af',top:'#eff3f6'}});
  B({x:x+wid/2+16,y:28,z:z+dep/2-22,w:18,h:56,d:18,faces:{front:'#d9dee3',back:'#bbc3cc',left:'#99a3ae',right:'#99a3ae',top:'#eef3f6'}});
}
function apartment(x,z){
  B({x,y:140,z,w:210,h:280,d:170,faces:{front:'#c8ccd1',back:'#b8bec5',left:'#b0b7bf',right:'#b0b7bf',top:'#7c7f86'}});
  B({x,y:166,z:z+88,w:180,h:180,d:8,faces:{front:'#7a818a',back:'#5b616a',left:'#666d76',right:'#666d76',top:'#e5ebf0'},collider:false});
  [-60,0,60].forEach(px=>[70,126,182].forEach(py=>B({x:x+px,y:py,z:z+89,w:40,h:36,d:4,faces:{front:(py===126&&px===0)?'rgba(250,230,175,.35)':'rgba(195,214,235,.10)',back:'#1d2430',left:'#7a8797',right:'#7a8797',top:'#dae3ec'},collider:false})));
  B({x:x-92,y:22,z:z+76,w:22,h:44,d:18,faces:{front:'#d7dce2',back:'#c5ccd4',left:'#b7c0cb',right:'#b7c0cb',top:'#eef2f7'}});
}
function fence(x,z,wid){
  for(let i=0;i<Math.floor(wid/30);i++){
    B({x:x-wid/2+i*30,y:20,z,w:4,h:40,d:4,faces:{front:'#6f7781',back:'#5b636d',left:'#4a515b',right:'#4a515b',top:'#aab3bc'}});
    B({x:x-wid/2+i*30+14,y:30,z,w:28,h:4,d:4,faces:{front:'#8c949e',back:'#717882',left:'#5a616b',right:'#5a616b',top:'#cad1d9'},collider:false});
  }
}
function shrub(x,z,wid=70,dep=44,col='#385631'){B({x,y:18,z,w:wid,h:36,d:dep,faces:{front:col,back:'#254220',left:'#2c4c27',right:'#2c4c27',top:'#517843'}})}
function lamp(x,z,h=260){
  B({x,y:h/2,z,w:10,h,d:10,faces:{front:'#404752',back:'#2d333d',left:'#363d48',right:'#363d48',top:'#7f8894'}});
  B({x:x+26,y:h-18,z:z+4,w:54,h:8,d:8,faces:{front:'#4a525d',back:'#414853',left:'#333944',right:'#333944',top:'#79828d'}});
  B({x:x+54,y:h-18,z:z+4,w:18,h:16,d:22,faces:{front:'#f0db9a',back:'#6d654a',left:'#b4a36f',right:'#b4a36f',top:'#fff4ca'},collider:false});
  P({x:x+54,y:h-8,z:z+4,w:120,h:120,background:'radial-gradient(circle at center, rgba(255,235,180,.28), rgba(255,235,180,.08) 55%, transparent 72%)',rx:0,opacity:.95});
}
function pole(x,z,h=320){
  B({x,y:h/2,z,w:10,h,d:10,faces:{front:'#404752',back:'#2d333d',left:'#363d48',right:'#363d48',top:'#7f8894'}});
  B({x:x+26,y:h-18,z:z+4,w:54,h:8,d:8,faces:{front:'#4a525d',back:'#414853',left:'#333944',right:'#333944',top:'#79828d'}});
}
function vending(x,z){
  B({x,y:86,z,w:66,h:174,d:50,faces:{front:'#f3f7fd',back:'#d4dae3',left:'#cad2dc',right:'#cad2dc',top:'#ffffff'}});
  B({x,y:112,z:z+25,w:42,h:48,d:2,faces:{front:'rgba(212,233,255,0.18)',back:'#122138',left:'#38506a',right:'#38506a',top:'#cde8ff'},collider:false});
  const cols=['#ff5d5d','#4eb1ff','#65d07f','#f2d157','#c38cff'];
  for(let i=0;i<5;i++) B({x:x-18+i*9,y:96,z:z+26,w:6,h:18,d:2,faces:{front:cols[i],back:'#435166',left:'#7d8ba0',right:'#7d8ba0',top:'#fcfdff'},collider:false});
  P({x:x,y:92,z:z+28,w:90,h:140,background:'radial-gradient(circle at center, rgba(255,255,255,.12), transparent 70%)',rx:0});
}
function parkedCar(x,z,col1='#d7dce2'){
  B({x,y:22,z,w:118,h:44,d:56,faces:{front:col1,back:'#c5ccd4',left:'#b7c0cb',right:'#b7c0cb',top:'#eef2f7'}});
  B({x,y:44,z:w?z:z,w:64,h:32,d:44,faces:{front:'rgba(210,228,255,0.18)',back:'#6b7683',left:'#8d98a4',right:'#8d98a4',top:'#dce6ee'},collider:false});
}
function basketStack(x,z){
  [0,10,20].forEach((dy,i)=>B({x,y:10+dy,z,w:34,h:12,d:22,faces:{front:i===2?'#3d7fe8':'#6ca7ff',back:'#2f5fa8',left:'#4e83d8',right:'#4e83d8',top:'#8fb9ff'}}));
}
function magazineRack(x,z){
  B({x,y:50,z,w:60,h:100,d:24,faces:{front:'#d6dadf',back:'#c1c8cf',left:'#aab3bd',right:'#aab3bd',top:'#f2f6fa'}});
  ['#ff8080','#85b8ff','#ffe27f','#8fe0a0','#d39cff'].forEach((c,i)=>B({x:x-16+i*8,y:62+i*2,z:z+12,w:14,h:28,d:4,faces:{front:c,back:'#6c7784',left:'#95a0ac',right:'#95a0ac',top:'#fdfefe'},collider:false}));
}
function smallRack(x,z){
  B({x,y:38,z,w:62,h:76,d:34,faces:{front:'#d4dadf',back:'#c2c9d0',left:'#a6b0ba',right:'#a6b0ba',top:'#edf2f7'}});
  ['#ff7070','#ffd86a','#6cc5ff','#90db93'].forEach((c,i)=>B({x:x-18+i*12,y:46,z:z+10,w:10,h:22,d:10,faces:{front:c,back:'#667381',left:'#7b8794',right:'#7b8794',top:'#fdfefe'},collider:false}));
}
function terminal(x,y,z,p=w){
  B({x,y,z,w:44,h:30,d:10,faces:{front:'#1f2630',back:'#434c59',left:'#363f4c',right:'#363f4c',top:'#697280'},parent:p,collider:false});
  B({x,y,z:z+6,w:34,h:22,d:2,faces:{front:'#e9fffb',back:'#0f1b1d',left:'#1f2f33',right:'#1f2f33',top:'#cae7e2'},parent:p,collider:false});
  B({x,y:y-18,z,w:10,h:12,d:10,faces:{front:'#626d7a',back:'#525c69',left:'#4a5560',right:'#4a5560',top:'#8894a2'},parent:p,collider:false});
}
function shelfRow(x,z,kind='snack'){
  const g=E('div','object'); T(g,x,0,z);
  const h=kind==='daily'?148:(kind==='snack'?138:118);
  B({x:-54,y:h/2,z:0,w:16,h,d:128,faces:{front:'#9aa2ad',back:'#8d949d',left:'#8d949d',right:'#8d949d',top:'#d2d8e0'},parent:g,collider:false});
  B({x:54,y:h/2,z:0,w:16,h,d:128,faces:{front:'#9aa2ad',back:'#8d949d',left:'#8d949d',right:'#8d949d',top:'#d2d8e0'},parent:g,collider:false});
  const hs=kind==='daily'?[42,78,114,150]:kind==='mag'?[26,56,86]:[38,72,106,140];
  hs.forEach(py=>B({x:0,y:py,z:0,w:124,h:6,d:kind==='mag'?34:46,faces:{front:'#e3e8ed',back:'#d2d9e2',left:'#c4ccd5',right:'#c4ccd5',top:'#f5f9fd'},parent:g,collider:false}));
  const cols=kind==='daily'?['#7ec4ff','#f5a46d','#9ddf86','#d6a5ff','#ffd86d']:kind==='mag'?['#ff8d8d','#8fc3ff','#ffe089','#b9ffa8','#d6a5ff']:['#eb5a5a','#5274e8','#f0d470','#52bc7a','#ff8a48','#9f62ff'];
  const rows=kind==='mag'?3:4,cl=kind==='mag'?6:7;
  for(let l=0;l<rows;l++){
    const py=(kind==='mag'?20:30)+l*(kind==='mag'?30:34);
    for(let i=0;i<cl;i++){
      const pz=-46+i*15;
      B({x:0,y:py,z:pz,w:kind==='mag'?30:28,h:kind==='mag'?20:24,d:kind==='mag'?8:12,faces:{front:cols[(i+l)%cols.length],back:'#3f4652',left:'#6a7280',right:'#6a7280',top:'#f5f8ff'},parent:g,collider:false});
      if(kind==='mag') B({x:0,y:py+8,z:pz+8,w:20,h:3,d:2,faces:{front:'#ffffff',back:'#888',left:'#aaa',right:'#aaa',top:'#fff'},parent:g,collider:false});
    }
  }
  C.push({x,z,w:128,d:kind==='mag'?42:54});
}
function fridgeBank(x,z){
  const g=E('div','object'); T(g,x,0,z);
  B({x:0,y:112,z:0,w:246,h:224,d:76,faces:{front:'#f2f6fb',back:'#d4dbe4',left:'#d0d6df',right:'#d0d6df',top:'#f7fbff'},parent:g,collider:false});
  [-82,0,82].forEach(dx=>{
    B({x:dx,y:114,z:39,w:64,h:194,d:4,faces:{front:'rgba(200,225,255,0.18)',back:'rgba(200,225,255,0.08)',left:'#7d8b9c',right:'#7d8b9c',top:'#9fb1c5'},parent:g,collider:false});
    B({x:dx+24,y:100,z:42,w:6,h:144,d:2,faces:{front:'#a7b7c8',back:'#8594a3',left:'#7b8998',right:'#7b8998',top:'#e9f3fc'},parent:g,collider:false});
  });
  for(let r=0;r<4;r++) B({x:0,y:46+r*44,z:12,w:206,h:4,d:46,faces:{front:'#ced6df',back:'#c7cfd8',left:'#a4afbc',right:'#a4afbc',top:'#f8fbff'},parent:g,collider:false});
  const cols=['#59a7ff','#ffffff','#e65d5d','#47be73','#f2d257','#a07dff'];
  for(let r=0;r<4;r++) for(let c=0;c<10;c++){
    const px=-90+c*20, py=30+r*44;
    B({x:px,y:py,z:-4,w:12,h:30,d:12,faces:{front:cols[(r+c)%cols.length],back:'#54606d',left:'#768390',right:'#768390',top:'#f7fbff'},parent:g,collider:false});
  }
  P({x:0,y:118,z:46,w:286,h:180,background:'radial-gradient(ellipse at center, rgba(255,255,255,.22) 0%, rgba(255,255,255,.06) 60%, transparent 74%)',rx:0,parent:g,opacity:.9});
  C.push({x,z,w:246,d:78});
  I.push({id:'fridge',x,z:z+94,radius:126,label:'冷蔵ケース',action:fridgeAction});
}
function checkoutArea(x,z){
  const g=E('div','object'); T(g,x,0,z);
  B({x:0,y:58,z:0,w:190,h:116,d:66,faces:{front:'#d7ddd8',back:'#cdd3ce',left:'#c0c8c2',right:'#c0c8c2',top:'#eef3ef'},parent:g,collider:false});
  terminal(-34,116,-8,g);
  B({x:34,y:112,z:-8,w:32,h:20,d:22,faces:{front:'#2d323a',back:'#454c57',left:'#596373',right:'#596373',top:'#97a2af'},parent:g,collider:false});
  B({x:16,y:108,z:12,w:66,h:4,d:30,faces:{front:'#9aa5b1',back:'#8f9aa5',left:'#7f8994',right:'#7f8994',top:'#f0f4f8'},parent:g,collider:false});
  B({x:-62,y:122,z:20,w:26,h:28,d:20,faces:{front:'#f2843d',back:'#b95c25',left:'#d06d2d',right:'#d06d2d',top:'#ffba8b'},parent:g,collider:false});
  B({x:84,y:90,z:-2,w:44,h:94,d:32,faces:{front:'#d5dce4',back:'#bec7cf',left:'#aab6c2',right:'#aab6c2',top:'#eff4f8'},parent:g,collider:false});
  ['#e86a4f','#eab45a','#64c26f'].forEach((c,i)=>B({x:84,y:34+i*24,z:10,w:34,h:16,d:10,faces:{front:c,back:'#697684',left:'#7c8794',right:'#7c8794',top:'#fdfefe'},parent:g,collider:false}));
  B({x:0,y:180,z:-44,w:144,h:90,d:8,faces:{front:'#767d86',back:'#5a6169',left:'#4b535c',right:'#4b535c',top:'#e7ebef'},parent:g,collider:false});
  ['#d8b34a','#c88282','#84b6ff','#e8e8e8','#c1a0ff'].forEach((c,i)=>B({x:-48+i*24,y:186,z:-40,w:18,h:20,d:4,faces:{front:c,back:'#737f8c',left:'#8794a1',right:'#8794a1',top:'#fefefe'},parent:g,collider:false}));
  C.push({x,z,w:190,d:66});
  I.push({id:'register',x,z:z+96,radius:120,label:'レジ周辺',action:registerAction});
}
function storeInteriorProps(){
  magazineRack(144, 22);
  basketStack(78, 88);
  smallRack(122, -6);
  B({x:154,y:28,z:82,w:30,h:56,d:30,faces:{front:'#666d74',back:'#555b62',left:'#4e555c',right:'#4e555c',top:'#c9d0d7'}});
  B({x:152,y:62,z:66,w:46,h:4,d:34,faces:{front:'#b7bec7',back:'#a8b0b8',left:'#9098a1',right:'#9098a1',top:'#eef3f8'},collider:false});
  P({x:0,y:318,z:0,w:338,h:228,background:'linear-gradient(180deg,#d9ddd8 0%, #ced4cf 100%)',rx:90});
  for(let i=-1;i<=1;i++){
    B({x:i*96,y:306,z:8,w:66,h:8,d:24,faces:{front:'#fafcf8',back:'#afb4b0',left:'#d7dbd6',right:'#d7dbd6',top:'#fffefc'},collider:false});
    P({x:i*96,y:300,z:8,w:124,h:96,background:'radial-gradient(ellipse at center, rgba(255,255,255,.20) 0%, rgba(255,255,255,.05) 54%, transparent 75%)',opacity:.88});
  }
  P({x:0,y:1.2,z:0,w:334,h:224,background:'linear-gradient(180deg,#f3f4f5 0%, #eceef0 100%)'});
  for(let iz=-1; iz<=2; iz++){
    P({x:0,y:1.5,z:iz*58,w:334,h:2,background:'rgba(180,186,194,.18)'});
  }
  shelfRow(-34, 26, 'snack');
  shelfRow(66, 6, 'daily');
  shelfRow(8, -72, 'mag');
  shelfRow(-8, -144, 'snack');
  fridgeBank(-118, -34);
  checkoutArea(98, -58);
  B({x:-128,y:40,z:96,w:34,h:80,d:28,faces:{front:'#63686f',back:'#51565c',left:'#4a5057',right:'#4a5057',top:'#c7ccd2'}});
  B({x:-128,y:72,z:114,w:24,h:24,d:4,faces:{front:'#c7ffd8',back:'#607a68',left:'#8fae9b',right:'#8fae9b',top:'#f8fff9'},collider:false});
  B({x:126,y:18,z:96,w:52,h:36,d:32,faces:{front:'#d1d7dd',back:'#bcc4cc',left:'#9aa6b2',right:'#9aa6b2',top:'#f1f5f8'}});
  ['#ffb04d','#d95f5f','#74d29b'].forEach((c,i)=>B({x:126,y:32+i*10,z:112,w:36,h:8,d:6,faces:{front:c,back:'#6f7681',left:'#8a94a0',right:'#8a94a0',top:'#fefefe'},collider:false}));
}
function storeExterior(){
  B({x:0,y:160,z:0,w:372,h:320,d:246,faces:{front:'#e7ecef',back:'#cad2d6',left:'#d5dde2',right:'#d5dde2',top:'#f2f5f7'}});
  B({x:0,y:238,z:117,w:364,h:20,d:20,faces:{front:'#f5f7f9',back:'#d2d9de',left:'#cbd3d8',right:'#cbd3d8',top:'#fcfdff'}});
  B({x:0,y:214,z:118,w:364,h:28,d:12,faces:{front:gradStr(['#cf4f49','#49af64','#49af64','#d8b148']),back:'#96a3aa',left:'#9ca7af',right:'#9ca7af',top:'#f0f4f7'},collider:false});
  B({x:0,y:174,z:119,w:346,h:126,d:10,faces:{front:'rgba(212,230,255,0.16)',back:'rgba(212,230,255,0.05)',left:'#7e8e9e',right:'#7e8e9e',top:'#e4ecf4'},collider:false});
  [-126,126,-28,28].forEach(x=>B({x,y:174,z:123,w:8,h:122,d:12,faces:{front:'#657486',back:'#566273',left:'#4d5967',right:'#4d5967',top:'#8997a7'},collider:false}));
  C.push({x:-156,z:0,w:60,d:246},{x:156,z:0,w:60,d:246},{x:0,z:-114,w:372,d:22},{x:0,z:114,w:372,d:22});
  S.doorLeft=B({x:-14,y:160,z:124,w:48,h:114,d:4,faces:{front:'rgba(210,228,255,0.12)',back:'rgba(210,228,255,0.06)',left:'#7c8b9c',right:'#7c8b9c',top:'#dce8f4'},collider:false});
  S.doorRight=B({x:14,y:160,z:124,w:48,h:114,d:4,faces:{front:'rgba(210,228,255,0.12)',back:'rgba(210,228,255,0.06)',left:'#7c8b9c',right:'#7c8b9c',top:'#dce8f4'},collider:false});
  I.push({id:'door',x:0,z:154,radius:92,label:()=>S.doorOpened?'入口':'ドア',action:doorAction});
  P({x:0,y:82,z:126,w:314,h:164,background:'radial-gradient(ellipse at center, rgba(255,255,255,.16) 0%, rgba(255,255,255,.05) 55%, transparent 75%)',rx:0,opacity:.95});
  P({x:0,y:1.4,z:84,w:96,h:28,background:'#70767d'});
  P({x:0,y:1.2,z:114,w:360,h:110,background:'radial-gradient(ellipse at center, rgba(255,255,255,.12) 0%, rgba(255,255,255,.02) 48%, transparent 68%)'});
  B({x:156,y:22,z:96,w:12,h:44,d:12,faces:{front:'#515b67',back:'#3d454f',left:'#38404a',right:'#38404a',top:'#95a0ab'}});
  B({x:140,y:22,z:96,w:42,h:18,d:62,faces:{front:'#d6d9de',back:'#c4cbd3',left:'#a6b0ba',right:'#a6b0ba',top:'#eef3f7'}});
  B({x:-164,y:24,z:96,w:44,h:48,d:28,faces:{front:'#666d74',back:'#555b62',left:'#4e555c',right:'#4e555c',top:'#c9d0d7'}});
  B({x:-164,y:62,z:96,w:32,h:4,d:18,faces:{front:'#b7bec7',back:'#a8b0b8',left:'#9098a1',right:'#9098a1',top:'#eef3f8'},collider:false});
}
function groundAndRoad(){
  P({x:0,y:0,z:340,w:1600,h:3400,background:'linear-gradient(180deg,#3b4250 0%,#313846 35%,#2b303b 100%)'});
  P({x:0,y:1,z:170,w:400,h:260,background:'linear-gradient(180deg,rgba(72,78,90,.98) 0%,rgba(52,58,70,.98) 100%)'});
  P({x:-280,y:1,z:400,w:340,h:960,background:'linear-gradient(180deg,#444b56 0%,#3b414c 100%)'});
  P({x:220,y:1,z:420,w:320,h:1020,background:'linear-gradient(180deg,#444b56 0%,#363d47 100%)'});
  P({x:-470,y:1,z:330,w:260,h:600,background:'linear-gradient(180deg,#26311f 0%,#1f2719 100%)'});
  P({x:470,y:1,z:360,w:300,h:700,background:'linear-gradient(180deg,#26311f 0%,#1f2719 100%)'});
  for(let i=0;i<4;i++) P({x:-42+i*56,y:1.2,z:166,w:7,h:56,background:'rgba(245,245,246,0.92)'});
  [-120,-42,42,120].forEach(x=>P({x,y:1.2,z:94,w:8,h:136,background:'rgba(228,234,240,0.85)'}));
  P({x:-250,y:1.2,z:248,w:10,h:720,background:'rgba(198,204,212,.28)'});
  P({x:-248,y:1.2,z:248,w:4,h:720,background:'#666b70'});
  P({x:250,y:1.2,z:260,w:4,h:740,background:'#707880'});
}
function neighborhood(){
  P({x:0,y:126,z:-660,w:1600,h:300,background:'linear-gradient(180deg,#0a1323 0%,#090f1c 100%)'});
  P({x:-340,y:90,z:-610,w:400,h:136,background:'linear-gradient(180deg,#14191f 0%,#0e1318 100%)'});
  P({x:140,y:102,z:-596,w:620,h:150,background:'linear-gradient(180deg,#14191f 0%,#0c1015 100%)'});
  lamp(-150,210,310); lamp(176,70,292); pole(-244,312,326); pole(268,220,330); pole(404,122,312);
  vending(176,170); parkedCar(286,248); parkedCar(-344,178,'#c7d2e1');
  house(-250,-26,164,138,false,'#6e655f','#cbc9c4');
  house(-462,82,182,148,true,'#66605b','#d8d2ca');
  house(308,-84,174,146,true,'#706863','#d2d1cb');
  house(452,110,158,132,false,'#6f655d','#cfcac4');
  house(516,-40,146,126,true,'#766a60','#d7d1c9');
  apartment(-420,280);
  fence(-248,138,220); fence(302,158,200); fence(500,134,120);
  shrub(-180,138,72,42,'#35512f'); shrub(-118,134,60,38,'#43693a'); shrub(260,156,82,42,'#35512f'); shrub(340,154,66,34,'#507847'); shrub(500,120,54,30,'#35512f');
  B({x:-290,y:18,z:148,w:28,h:36,d:28,faces:{front:'#d6d9dd',back:'#bcc3ca',left:'#9aa4af',right:'#9aa4af',top:'#eff3f6'}});
  B({x:334,y:14,z:134,w:120,h:8,d:2,faces:{front:'#68727c',back:'#5e6872',left:'#444d57',right:'#444d57',top:'#c8d0d8'},collider:false});
  B({x:390,y:22,z:234,w:126,h:44,d:18,faces:{front:'#d1d5dc',back:'#bbc2cc',left:'#9ea8b3',right:'#9ea8b3',top:'#f3f5f7'}});
  B({x:390,y:76,z:230,w:132,h:12,d:24,faces:{front:'#7a8798',back:'#677382',left:'#5f6977',right:'#5f6977',top:'#e6ecf1'}});
  B({x:286,y:38,z:248,w:84,h:76,d:46,faces:{front:'#d7dce2',back:'#c5ccd4',left:'#b7c0cb',right:'#b7c0cb',top:'#eef2f7'}});
  B({x:286,y:50,z:272,w:56,h:56,d:4,faces:{front:'rgba(210,228,255,0.14)',back:'rgba(210,228,255,0.04)',left:'#8090a1',right:'#8090a1',top:'#dde7f1'},collider:false});
  P({x:500,y:10,z:180,w:220,h:120,background:'radial-gradient(ellipse at center, rgba(255,235,180,.10) 0%, transparent 70%)'});
  P({x:420,y:8,z:-120,w:380,h:160,background:'radial-gradient(ellipse at center, rgba(255,220,150,.08) 0%, transparent 70%)'});
}
function doorAction(){S.doorOpened=true;S.doorLeft.style.transform='translate3d(-52px,-160px,150px)';S.doorRight.style.transform='translate3d(52px,-160px,150px)';ht.textContent='ドアが開いた。中へ入れる。';hint.classList.remove('faded');S.infoFadeAt=performance.now()+2400}
function fridgeAction(){if(!S.hasDrink){S.hasDrink=true;held.classList.remove('hidden');ht.textContent='飲み物を取った。レジへ向かおう。'}else{ht.textContent='冷蔵ケース。白い灯りとガラスの冷たさが目立つ。'}hint.classList.remove('faded');S.infoFadeAt=performance.now()+2400}
function registerAction(){ht.textContent=S.hasDrink?'レジ周辺。営業中の情報量があるが、人の気配は薄い。':'レジ周辺。先に飲み物を取った方がよさそうだ。';hint.classList.remove('faded');S.infoFadeAt=performance.now()+2600}

groundAndRoad(); storeExterior(); storeInteriorProps(); neighborhood();

function U(){const bob=S.bob?bobv:0; w.style.transform=`translate3d(${-S.x}px,${S.y*100-bob}px,${-S.z}px) rotateX(${S.pitch}rad) rotateY(${S.yaw}rad)`;}
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
function wrap(a){while(a<-Math.PI)a+=Math.PI*2;while(a>Math.PI)a-=Math.PI*2;return a}
function hit(nx,nz){const r=18; for(const c of C){if(Math.abs(nx-c.x)<=c.w/2+r&&Math.abs(nz-c.z)<=c.d/2+r)return true} return false}
function nearest(){
  const fx=Math.sin(S.yaw), fz=-Math.cos(S.yaw); let b=null;
  for(const it of I){
    const dx=it.x-S.x, dz=it.z-S.z, dist=Math.hypot(dx,dz);
    if(dist>it.radius) continue;
    const inv=dist>.001?1/dist:1, dot=dx*inv*fx+dz*inv*fz;
    if(dot<.42) continue;
    if(!b||dist<b.dist) b={it,dist};
  }
  return b;
}
function RI(){
  const h=nearest();
  if(h){ act.disabled=false; act.textContent=typeof h.it.label==='function'?h.it.label():h.it.label; S.currentInteract=h.it; }
  else { act.disabled=true; act.textContent='調べる'; S.currentInteract=null; }
}
function PI(){ if(S.currentInteract) S.currentInteract.action(); }
act.addEventListener('click', PI);
act.addEventListener('pointerdown', e=>e.stopPropagation());
run.addEventListener('click', ()=>{ S.run=!S.run; run.textContent=`走る: ${S.run?'ON':'OFF'}`; run.setAttribute('aria-pressed', String(S.run));});
mt.addEventListener('click', ()=>mp.classList.toggle('hidden'));
st.addEventListener('click', ()=>{ S.scanline=!S.scanline; st.textContent=S.scanline?'ON':'OFF'; so.classList.toggle('hidden', !S.scanline);});
se.addEventListener('click', ()=>{ S.sensitivityIndex=(S.sensitivityIndex+1)%3; se.textContent=['低め','標準','高め'][S.sensitivityIndex];});
bt.addEventListener('click', ()=>{ S.bob=!S.bob; bt.textContent=S.bob?'ON':'OFF'; });

function refreshLeftRect(){ leftRect=leftUI.getBoundingClientRect(); }
refreshLeftRect(); window.addEventListener('resize', refreshLeftRect);

function startJoy(e){
  refreshLeftRect();
  const pad=14;
  const ox=Math.min(Math.max(e.clientX-leftRect.left, pad), leftRect.width-pad);
  const oy=Math.min(Math.max(e.clientY-leftRect.top, pad), leftRect.height-pad-18);
  S.joy.active=true; S.joy.id=e.pointerId; S.joy.originX=ox; S.joy.originY=oy;
  leftUI.setPointerCapture(e.pointerId);
  jb.style.transform=`translate(${ox-jb.offsetWidth/2}px, ${oy-jb.offsetHeight/2}px)`;
  J(e.clientX, e.clientY);
}
leftUI.addEventListener('pointerdown', e=>{
  if(e.target.closest('button')) return;
  e.preventDefault(); e.stopPropagation();
  startJoy(e);
},{passive:false});
leftUI.addEventListener('pointermove', e=>{
  if(!S.joy.active || e.pointerId!==S.joy.id) return;
  e.preventDefault(); J(e.clientX, e.clientY);
},{passive:false});
function endJ(e){
  if(!S.joy.active||e.pointerId!==S.joy.id) return;
  S.joy.active=false; S.joy.id=null; S.joy.vx=0; S.joy.vy=0;
  jk.style.transform='translate(0px,0px)';
  jb.style.transform='translate(0px,0px)';
}
leftUI.addEventListener('pointerup', endJ); leftUI.addEventListener('pointercancel', endJ);

function J(clientX, clientY){
  const originPageX=leftRect.left + S.joy.originX;
  const originPageY=leftRect.top + S.joy.originY;
  let dx=clientX-originPageX, dy=clientY-originPageY;
  const max=jb.offsetWidth*INPUT.joyMax, outer=jb.offsetWidth*INPUT.joyOuter;
  const len=Math.hypot(dx,dy)||1;
  if(len>outer){ dx=dx/len*outer; dy=dy/len*outer; }
  const clamped=Math.min(max, Math.hypot(dx,dy));
  const ndx=len?dx/len:0, ndy=len?dy/len:0;
  const localDx=ndx*clamped, localDy=ndy*clamped;
  let outX=localDx/max, outY=localDy/max;
  const mag=Math.hypot(outX,outY);
  if(mag<INPUT.joyDead){ outX=0; outY=0; }
  else {
    const norm=(mag-INPUT.joyDead)/(1-INPUT.joyDead);
    outX=(outX/mag)*norm; outY=(outY/mag)*norm;
  }
  S.joy.vx=outX; S.joy.vy=outY;
  jk.style.transform=`translate(${localDx}px, ${localDy}px)`;
}
function isUI(t){ return !!t.closest(ui); }
vz.addEventListener('pointerdown', e=>{
  if(isUI(e.target)) return;
  e.preventDefault();
  S.look.active=true; S.look.id=e.pointerId; S.look.x=e.clientX; S.look.y=e.clientY;
  vz.setPointerCapture(e.pointerId);
},{passive:false});
vz.addEventListener('pointermove', e=>{
  if(!S.look.active||e.pointerId!==S.look.id) return;
  e.preventDefault();
  const sens=S.sensitivities[S.sensitivityIndex], dx=e.clientX-S.look.x, dy=e.clientY-S.look.y;
  S.look.x=e.clientX; S.look.y=e.clientY;
  S.yaw=wrap(S.yaw-dx*sens);
  S.pitch=clamp(S.pitch-dy*sens*.78,-.48,.32);
},{passive:false});
function endL(e){ if(!S.look.active||e.pointerId!==S.look.id) return; S.look.active=false; S.look.id=null; }
vz.addEventListener('pointerup', endL); vz.addEventListener('pointercancel', endL);

document.addEventListener('gesturestart', e=>e.preventDefault(), {passive:false});
document.addEventListener('touchmove', e=>{ if(e.target.closest('#game-root')) e.preventDefault(); }, {passive:false});

let last=performance.now(), phase=0, bobv=0;
function loop(now){
  const dt=Math.min(.032,(now-last)/1000); last=now;
  const speed=S.run?INPUT.runSpeed:INPUT.walkSpeed;
  const forward=-S.joy.vy;
  const strafe=S.joy.vx;
  const mag=Math.hypot(forward, strafe);
  let moved=false;
  if(mag>.001){
    const dx=(Math.sin(S.yaw)*forward + Math.cos(S.yaw)*strafe)*speed*dt;
    const dz=(-Math.cos(S.yaw)*forward + Math.sin(S.yaw)*strafe)*speed*dt;
    const tx=S.x+dx, tz=S.z+dz;
    if(!hit(tx,S.z)) S.x=tx;
    if(!hit(S.x,tz)) S.z=tz;
    moved=true; phase+=dt*(S.run?13.4:9.4)*Math.min(1,mag);
  }
  bobv=moved&&S.bob?Math.sin(phase)*1.6:bobv*.84;
  U(); RI();
  if(now>S.infoFadeAt) hint.classList.add('faded');
  requestAnimationFrame(loop);
}
U(); requestAnimationFrame(loop);
})();
