
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js';

const canvas = document.getElementById('game');
const hint = document.getElementById('hint');
const hintText = document.getElementById('hint-text');
const toast = document.getElementById('toast');
const prompt = document.getElementById('prompt');
const topPanel = document.getElementById('top-panel');
const runToggle = document.getElementById('run-toggle');
const interactBtn = document.getElementById('interact-btn');
const menuToggle = document.getElementById('menu-toggle');
const menuPanel = document.getElementById('menu-panel');
const scanlineToggle = document.getElementById('scanline-toggle');
const sensitivityToggle = document.getElementById('sensitivity-toggle');
const bobToggle = document.getElementById('bob-toggle');
const scanlineOverlay = document.getElementById('scanline-overlay');
const joystickZone = document.getElementById('joystick-zone');
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const dragZone = document.getElementById('drag-zone');
const heldItem = document.getElementById('held-item');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.03;
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08111f);
scene.fog = new THREE.FogExp2(0x0a111b, 0.026);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 140);
const state = {
  yaw: 0,
  pitch: -0.045,
  run: false,
  bob: true,
  sensitivityIndex: 1,
  sensitivities: [0.00185, 0.00235, 0.0029],
  joy: { active: false, id: null, x: 0, y: 0, centerX: 0, centerY: 0 },
  look: { active: false, id: null, x: 0, y: 0 },
  doorOpen: false,
  hasDrink: false,
  toastTimer: null,
  infoFadeAt: performance.now() + 5200,
  currentInteractable: null,
};

const inputParams = {
  joyRadius: 42,
  joyDeadZone: 0.11,
  joyActivationMargin: 14,
  joyMaxVisual: 42,
  baseSize: 128,
};

const player = {
  position: new THREE.Vector3(0, 1.68, 10.2),
  radius: 0.24,
  speed: 2.18,
  runSpeed: 3.38,
};

const colliders = [];
const interactables = [];
const tmpVec = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
let walkTime = 0;
let currentInteractable = null;
const doorParts = [];
const dynamicObjects = [];

function showToast(text, ms = 2200) {
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
}
function showHint(text, ms = 2400) {
  hintText.textContent = text;
  hint.classList.remove('faded');
  topPanel.classList.remove('faded');
  state.infoFadeAt = performance.now() + ms;
}
function setPrompt(text) {
  if (!text) {
    prompt.classList.add('hidden');
    return;
  }
  prompt.textContent = text;
  prompt.classList.remove('hidden');
}

function makeCanvasTexture(width, height, draw, repeatX = 1, repeatY = 1) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const g = c.getContext('2d');
  draw(g, width, height);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const asphaltTex = makeCanvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#3a4149'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1600; i++) {
    const x = Math.random() * w, y = Math.random() * h, s = Math.random() * 2.4 + 0.4;
    const c = 64 + Math.random() * 30;
    g.fillStyle = `rgba(${c},${c+2},${c+6},${0.11 + Math.random()*0.16})`;
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 18; i++) {
    g.fillStyle = `rgba(255,255,255,${0.015 + Math.random()*0.02})`;
    g.beginPath(); g.arc(Math.random()*w, Math.random()*h, 16 + Math.random()*22, 0, Math.PI*2); g.fill();
  }
}, 12, 36);
const concreteTex = makeCanvasTexture(256, 256, (g,w,h)=>{
  g.fillStyle='#7b828b'; g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=48){ g.fillStyle='rgba(255,255,255,0.03)'; g.fillRect(0,y,w,1); }
  for(let x=0;x<w;x+=48){ g.fillStyle='rgba(0,0,0,0.05)'; g.fillRect(x,0,1,h); }
  for(let i=0;i<420;i++){ g.fillStyle=`rgba(255,255,255,${Math.random()*0.04})`; g.fillRect(Math.random()*w,Math.random()*h,1,1); }
}, 6, 6);
const tileTex = makeCanvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#eef1f3'; g.fillRect(0,0,w,h);
  for (let y = 0; y <= h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0,y,w,1); }
  for (let x = 0; x <= w; x += 32) { g.fillRect(x,0,1,h); }
  for (let i = 0; i < 220; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random()*0.03})`;
    g.fillRect(Math.random()*w, Math.random()*h, 1 + Math.random()*2, 1 + Math.random()*2);
  }
}, 9, 9);
const wallTex = makeCanvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#e6eaed'; g.fillRect(0,0,w,h);
  for (let y = 0; y < h; y += 24) {
    g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y, w, 6);
    g.fillStyle = 'rgba(0,0,0,0.03)'; g.fillRect(0, y + 11, w, 1);
  }
}, 3, 3);
const ceilingTex = makeCanvasTexture(256,256,(g,w,h)=>{
  g.fillStyle='#d8ddd9'; g.fillRect(0,0,w,h);
  for(let x=0;x<w;x+=32){g.fillStyle='rgba(0,0,0,0.04)'; g.fillRect(x,0,1,h)}
  for(let y=0;y<h;y+=32){g.fillRect(0,y,w,1)}
}, 5, 4);
const signTex = makeCanvasTexture(512, 64, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#d44d49'); grad.addColorStop(0.18, '#d44d49'); grad.addColorStop(0.18, '#46b268'); grad.addColorStop(0.82, '#46b268'); grad.addColorStop(0.82, '#d4b14a'); grad.addColorStop(1, '#d4b14a');
  g.fillStyle = grad; g.fillRect(0,0,w,h);
  g.fillStyle = 'rgba(255,255,255,0.88)';
  g.font = 'bold 28px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('こもれびストア', w/2, h/2 + 1);
}, 1, 1);
const woodTex = makeCanvasTexture(256,256,(g,w,h)=>{
  g.fillStyle='#9a7a62'; g.fillRect(0,0,w,h);
  for(let y=0;y<h;y+=18){ g.fillStyle=`rgba(60,36,20,${0.12 + Math.random()*0.06})`; g.fillRect(0,y,w,2); }
}, 2, 2);

const materials = {
  asphalt: new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0x4a5058, roughness: 0.86, metalness: 0.03 }),
  concrete: new THREE.MeshStandardMaterial({ map: concreteTex, color: 0x7e858e, roughness: 0.82, metalness: 0.02 }),
  grass: new THREE.MeshStandardMaterial({ color: 0x24341d, roughness: 0.96 }),
  wall: new THREE.MeshStandardMaterial({ map: wallTex, color: 0xf0f3f5, roughness: 0.88 }),
  trim: new THREE.MeshStandardMaterial({ color: 0xd5d9de, roughness: 0.62, metalness: 0.08 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x5a6675, roughness: 0.55, metalness: 0.25 }),
  glass: new THREE.MeshPhysicalMaterial({ color: 0xd7e8ff, transmission: 0.78, transparent: true, opacity: 0.28, roughness: 0.18, metalness: 0.0, thickness: 0.08, ior: 1.16 }),
  tile: new THREE.MeshStandardMaterial({ map: tileTex, color: 0xf5f7f8, roughness: 0.58, metalness: 0.02 }),
  ceiling: new THREE.MeshStandardMaterial({ map: ceilingTex, color: 0xe0e5e1, roughness: 0.72 }),
  black: new THREE.MeshStandardMaterial({ color: 0x1c2128, roughness: 0.42, metalness: 0.18 }),
  sign: new THREE.MeshStandardMaterial({ map: signTex, emissive: new THREE.Color(0x22261a), emissiveIntensity: 0.15, roughness: 0.54 }),
  metal: new THREE.MeshStandardMaterial({ color: 0xb8c2cc, roughness: 0.34, metalness: 0.55 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x4a5360, roughness: 0.44, metalness: 0.42 }),
  warmLight: new THREE.MeshBasicMaterial({ color: 0xffe6b3 }),
  whiteLight: new THREE.MeshBasicMaterial({ color: 0xf8fcff }),
  basket: new THREE.MeshStandardMaterial({ color: 0x3d6fe4, roughness: 0.54, metalness: 0.08 }),
  warmWood: new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9f7d66, roughness: 0.78, metalness: 0.04 }),
  poster: new THREE.MeshStandardMaterial({ color: 0xf2ebe2, roughness: 0.72 }),
  shrub: new THREE.MeshStandardMaterial({ color: 0x40542d, roughness: 0.98 }),
};

function addCollider(meshOrBox) {
  if (meshOrBox instanceof THREE.Box3) {
    colliders.push(meshOrBox.clone());
  } else {
    colliders.push(new THREE.Box3().setFromObject(meshOrBox));
  }
}
function box(w, h, d, mat) { return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); }
function plane(w, h, mat) { return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); }
function addSpriteGlow(color, intensity, distance, pos) {
  const l = new THREE.PointLight(color, intensity, distance, 2.2);
  l.position.copy(pos); scene.add(l); return l;
}

function buildGround() {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(18, 54), materials.asphalt);
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0, -6); scene.add(road);

  const parking = new THREE.Mesh(new THREE.PlaneGeometry(11.5, 8.4), materials.asphalt);
  parking.rotation.x = -Math.PI / 2; parking.position.set(0, 0.002, 1.8); scene.add(parking);

  const frontWalk = new THREE.Mesh(new THREE.PlaneGeometry(12.3, 1.12), materials.concrete);
  frontWalk.rotation.x = -Math.PI / 2; frontWalk.position.set(0, 0.03, 5.35); scene.add(frontWalk);

  const sideLane = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 18), materials.asphalt);
  sideLane.rotation.x = -Math.PI / 2; sideLane.position.set(6.8, 0.001, -0.8); scene.add(sideLane);

  const housingLane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 18), materials.asphalt);
  housingLane.rotation.x = -Math.PI / 2; housingLane.position.set(-7.6, 0.001, -4.2); scene.add(housingLane);

  const leftGrass = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 42), materials.grass);
  leftGrass.rotation.x = -Math.PI / 2; leftGrass.position.set(-7.2, 0, -3); scene.add(leftGrass);
  const rightGrass = leftGrass.clone(); rightGrass.position.x = 7.8; scene.add(rightGrass);

  const curb = box(12.3, 0.16, 0.24, materials.trim); curb.position.set(0, 0.08, 4.82); scene.add(curb);
  const drain = box(1.15, 0.04, 0.56, materials.darkMetal); drain.position.set(4.6, 0.021, 5.08); scene.add(drain);

  [-3.3, -1.1, 1.1, 3.3].forEach((x) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 5.6), new THREE.MeshBasicMaterial({ color: 0xf6f6f7 }));
    line.rotation.x = -Math.PI / 2; line.position.set(x, 0.006, 1.9); scene.add(line);
  });
  const endLine = new THREE.Mesh(new THREE.PlaneGeometry(8.8, 0.1), new THREE.MeshBasicMaterial({ color: 0xf6f6f7 }));
  endLine.rotation.x = -Math.PI / 2; endLine.position.set(0, 0.006, -0.95); scene.add(endLine);
}

function buildStore() {
  const store = new THREE.Group(); scene.add(store);

  const back = box(10.6, 4.3, 0.24, materials.wall); back.position.set(0, 2.15, -4.95); store.add(back);
  const left = box(0.24, 4.3, 10.1, materials.wall); left.position.set(-5.18, 2.15, 0); store.add(left);
  const right = left.clone(); right.position.x = 5.18; store.add(right);
  const roof = box(10.9, 0.24, 10.45, materials.trim); roof.position.set(0, 4.34, 0); store.add(roof);
  const canopy = box(11.15, 0.16, 1.28, materials.trim); canopy.position.set(0, 4.14, 4.94); store.add(canopy);
  const signBand = box(10.65, 0.58, 0.18, materials.sign); signBand.position.set(0, 3.86, 4.95); store.add(signBand);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(10.1, 9.6), materials.tile);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, -0.15); store.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(10.1, 9.6), materials.ceiling);
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 4.18, -0.15); store.add(ceiling);

  const frontFrameTop = box(10.05, 0.18, 0.18, materials.frame); frontFrameTop.position.set(0, 3.18, 4.82); store.add(frontFrameTop);
  const frontFrameBottom = box(10.05, 0.24, 0.22, materials.frame); frontFrameBottom.position.set(0, 0.12, 4.82); store.add(frontFrameBottom);
  [-4.25, -1.45, 1.45, 4.25].forEach((x) => {
    const mullion = box(0.12, 3.0, 0.18, materials.frame); mullion.position.set(x, 1.62, 4.82); store.add(mullion);
  });

  const leftWindow = box(2.45, 2.9, 0.05, materials.glass); leftWindow.position.set(-2.75, 1.63, 4.86); store.add(leftWindow);
  const rightWindow = box(2.45, 2.9, 0.05, materials.glass); rightWindow.position.set(2.75, 1.63, 4.86); store.add(rightWindow);

  const doorGroup = new THREE.Group(); doorGroup.position.set(0, 0, 4.86); store.add(doorGroup);
  const doorFrame = box(1.82, 3.0, 0.18, materials.frame); doorFrame.position.set(0, 1.62, 0); doorGroup.add(doorFrame);
  const doorVoid = box(1.48, 2.8, 0.24, new THREE.MeshBasicMaterial({ color: 0x122032 })); doorVoid.position.set(0, 1.58, -0.01); doorGroup.add(doorVoid);
  const doorLeft = box(0.7, 2.76, 0.03, materials.glass); doorLeft.position.set(-0.37, 1.58, 0.03); doorGroup.add(doorLeft);
  const doorRight = box(0.7, 2.76, 0.03, materials.glass); doorRight.position.set(0.37, 1.58, 0.03); doorGroup.add(doorRight);
  doorParts.push({ mesh: doorLeft, closedX: -0.37, openX: -0.92 }, { mesh: doorRight, closedX: 0.37, openX: 0.92 });

  const doormat = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.82), new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.86 }));
  doormat.rotation.x = -Math.PI / 2; doormat.position.set(0, 0.015, 5.38); scene.add(doormat);

  const frameLeft = box(0.24, 4.3, 0.72, materials.wall); frameLeft.position.set(-5.45, 2.15, 4.84); scene.add(frameLeft);
  const frameRight = box(0.24, 4.3, 0.72, materials.wall); frameRight.position.set(5.45, 2.15, 4.84); scene.add(frameRight);
  addCollider(back); addCollider(left); addCollider(right); addCollider(frameLeft); addCollider(frameRight);
  const frontLeftBlock = box(3.55, 4.3, 0.3, materials.wall); frontLeftBlock.position.set(-3.22, 2.15, 4.84); scene.add(frontLeftBlock); addCollider(frontLeftBlock);
  const frontRightBlock = box(3.55, 4.3, 0.3, materials.wall); frontRightBlock.position.set(3.22, 2.15, 4.84); scene.add(frontRightBlock); addCollider(frontRightBlock);

  const shelfSnack = buildShelf(new THREE.Vector3(-1.8, 0, 1.25), { width: 1.18, depth: 0.48, height: 1.44, rows: 4, category: 'snack' });
  const shelfDaily = buildShelf(new THREE.Vector3(1.15, 0, 0.82), { width: 1.14, depth: 0.46, height: 1.48, rows: 4, category: 'daily' });
  const shelfMagazine = buildMagazineRack(new THREE.Vector3(4.05, 0, 2.85));
  const shelfDrink = buildShelf(new THREE.Vector3(0.15, 0, -1.65), { width: 0.92, depth: 1.24, height: 1.32, rows: 3, rotate: Math.PI / 2, category: 'drink' });
  store.add(shelfSnack, shelfDaily, shelfMagazine, shelfDrink);

  const basketStack = buildBasketStack(new THREE.Vector3(-0.95, 0, 3.45)); store.add(basketStack);
  const bin = box(0.32, 0.44, 0.32, materials.darkMetal); bin.position.set(-4.4, 0.22, 3.15); store.add(bin);
  const hotShelf = buildHotShelf(new THREE.Vector3(4.15, 0, -1.62)); store.add(hotShelf);
  const popStand = buildPosterStand(new THREE.Vector3(-3.2, 0, 2.65)); store.add(popStand);

  const fridge = buildFridge(new THREE.Vector3(-4.18, 0, -0.55)); store.add(fridge.group);
  interactables.push({
    id: 'fridge', point: fridge.point, radius: 1.7, label: '冷蔵ケース', action: () => {
      if (!state.hasDrink) {
        state.hasDrink = true; heldItem.classList.remove('hidden');
        showHint('飲み物を取った。レジへ向かおう。'); showToast('飲み物を手に持った');
      } else {
        showHint('冷蔵ケース。白い灯りが静かに続いている。');
      }
    }
  });

  const counter = buildCounter(new THREE.Vector3(3.72, 0, -2.18)); store.add(counter.group);
  interactables.push({
    id: 'register', point: counter.point, radius: 1.62, label: 'レジ周辺', action: () => {
      if (state.hasDrink) {
        showHint('レジ周辺。液晶には 23:48 の表示。'); showToast('会計前の静けさがある');
      } else {
        showHint('レジ周辺。先に飲み物を取った方がよさそうだ。');
      }
    }
  });

  interactables.push({
    id: 'door', point: new THREE.Vector3(0, 1.5, 5.7), radius: 1.58,
    label: () => state.doorOpen ? '入口' : 'ドア', action: () => {
      if (!state.doorOpen) { state.doorOpen = true; showHint('ドアが開いた。中へ入れる。'); showToast('入口を開けた'); }
      else showHint('入口。中の明かりが近い。');
    }
  });

  const frameBar1 = box(0.08, 3.0, 0.2, materials.frame); frameBar1.position.set(-0.86, 1.62, 4.86); scene.add(frameBar1);
  const frameBar2 = box(0.08, 3.0, 0.2, materials.frame); frameBar2.position.set(0.86, 1.62, 4.86); scene.add(frameBar2);

  const poster = buildPosterStand(new THREE.Vector3(4.48, 0, 1.2), 0.74, 1.08); store.add(poster);

  for (let i = -2; i <= 2; i++) {
    const tube = box(1.48, 0.08, 0.2, materials.whiteLight); tube.position.set(i * 1.85, 4.02, 0.6); store.add(tube);
    const tubeGlow = new THREE.PointLight(0xf7fbff, 1.35, 6.8, 2.4); tubeGlow.position.set(i * 1.85, 3.82, 0.6); store.add(tubeGlow);
  }
}

function buildShelf(pos, opts) {
  const { width, depth, height, rows, category, rotate = 0 } = opts;
  const g = new THREE.Group(); g.position.copy(pos); g.rotation.y = rotate;
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.52, metalness: 0.15 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0xe8edf1, roughness: 0.46, metalness: 0.08 });
  const sideL = box(0.12, height, depth, sideMat); sideL.position.set(-width/2 + 0.06, height/2, 0); g.add(sideL);
  const sideR = box(0.12, height, depth, sideMat); sideR.position.set(width/2 - 0.06, height/2, 0); g.add(sideR);
  for (let r = 0; r < rows; r++) {
    const shelf = box(width - 0.06, 0.05, depth * 0.42, shelfMat);
    shelf.position.set(0, 0.16 + r * ((height - 0.24) / (rows - 1)), 0); g.add(shelf);
    const priceRail = box(width - 0.08, 0.03, 0.04, new THREE.MeshStandardMaterial({ color: 0xe55f5f, roughness: 0.52 }));
    priceRail.position.set(0, shelf.position.y - 0.02, depth * 0.22); g.add(priceRail);
  }
  const palettes = {
    snack: [0xea5e5e,0xf0d063,0x55c37c,0x597deb,0xff9a52,0xb176ff],
    drink: [0x51a9ff,0xffffff,0xf39c61,0x6ed08a,0xd85f5f],
    daily: [0xe8edf5,0xcbd6e8,0x89a8d8,0xf3e0a3,0xcfd7c7],
  };
  const colors = palettes[category] || palettes.snack;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < 5; col++) {
      const pw = category === 'daily' ? 0.18 : 0.16;
      const ph = 0.16 + (col % 2) * 0.06 + (category === 'drink' ? 0.05 : 0);
      const pd = category === 'drink' ? 0.14 : 0.12;
      const product = box(pw, ph, pd, new THREE.MeshStandardMaterial({ color: colors[(row + col) % colors.length], roughness: 0.5 }));
      product.position.set(-width * 0.28 + col * (width * 0.14), 0.22 + row * ((height - 0.3) / rows), -0.05 + ((row + col) % 2) * 0.08);
      g.add(product);
    }
  }
  addCollider(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(pos.x, height/2, pos.z), new THREE.Vector3(width + 0.08, height, depth + 0.08)));
  return g;
}

function buildMagazineRack(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const body = box(0.56, 1.56, 0.38, new THREE.MeshStandardMaterial({ color: 0xced7df, roughness: 0.46 })); body.position.set(0, 0.78, 0); g.add(body);
  const colors = [0xe36363,0xf1d26b,0x6ca8ef,0x78c98b,0xffffff];
  for (let i = 0; i < 6; i++) {
    const mag = box(0.44, 0.22, 0.03, new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.56 }));
    mag.position.set(0, 1.36 - i * 0.22, 0.16); mag.rotation.x = -0.3; g.add(mag);
  }
  addCollider(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(pos.x, 0.78, pos.z), new THREE.Vector3(0.6, 1.6, 0.44)));
  return g;
}

function buildBasketStack(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  for (let i = 0; i < 4; i++) {
    const b = box(0.44, 0.12, 0.3, materials.basket); b.position.set(0, 0.08 + i * 0.1, 0); g.add(b);
  }
  return g;
}

function buildPosterStand(pos, w = 0.58, h = 0.96) {
  const g = new THREE.Group(); g.position.copy(pos);
  const panel = box(w, h, 0.03, materials.poster); panel.position.set(0, h * 0.52, 0); g.add(panel);
  const stripe = box(w * 0.8, 0.08, 0.02, new THREE.MeshStandardMaterial({ color: 0xd06161, roughness: 0.62 })); stripe.position.set(0, h * 0.84, 0.02); g.add(stripe);
  const leg = box(0.04, 0.86, 0.04, materials.darkMetal); leg.position.set(0, 0.36, -0.08); g.add(leg);
  return g;
}

function buildHotShelf(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const body = box(0.54, 0.86, 0.32, new THREE.MeshStandardMaterial({ color: 0xe7ddd1, roughness: 0.62 })); body.position.set(0, 0.43, 0); g.add(body);
  const warm = box(0.42, 0.22, 0.22, new THREE.MeshStandardMaterial({ color: 0xf0c181, emissive: new THREE.Color(0x553418), emissiveIntensity: 0.12, roughness: 0.4 })); warm.position.set(0, 0.68, 0.04); g.add(warm);
  for (let i = 0; i < 3; i++) {
    const card = box(0.1, 0.16, 0.02, new THREE.MeshStandardMaterial({ color: 0xf6f0e6, roughness: 0.7 }));
    card.position.set(-0.16 + i * 0.16, 0.22, 0.18); g.add(card);
  }
  return g;
}

function buildFridge(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const shell = box(1.76, 2.2, 0.78, new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.5, metalness: 0.08 })); shell.position.set(0, 1.1, 0); g.add(shell);
  [-0.58, 0, 0.58].forEach((x, idx) => {
    const door = box(0.52, 1.9, 0.04, materials.glass); door.position.set(x, 1.1, 0.39); g.add(door);
    const handle = box(0.03, 1.08, 0.03, materials.metal); handle.position.set(x + 0.18, 1.1, 0.42); g.add(handle);
    const v = box(0.04, 1.96, 0.06, materials.frame); v.position.set(x + 0.26, 1.1, 0.37); g.add(v);
  });
  for (let y = 0.38; y < 2.0; y += 0.4) {
    const rail = box(1.48, 0.03, 0.42, new THREE.MeshStandardMaterial({ color: 0xdce4ed, roughness: 0.34, metalness: 0.15 })); rail.position.set(0, y, 0.08); g.add(rail);
  }
  const cols = [0x50abff,0xff725f,0x73d187,0xf0d164,0xc98cff,0xffffff];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const b = box(0.09, 0.3, 0.09, new THREE.MeshStandardMaterial({ color: cols[(row + col) % cols.length], roughness: 0.4 }));
      b.position.set(-0.66 + col * 0.19, 0.28 + row * 0.42, -0.03); g.add(b);
    }
  }
  const glow = new THREE.PointLight(0xf7fbff, 4.8, 5.8, 2.4); glow.position.set(0, 1.34, 0.2); g.add(glow);
  addCollider(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(pos.x, 1.1, pos.z), new THREE.Vector3(1.84, 2.2, 0.82)));
  return { group: g, point: new THREE.Vector3(pos.x, 1.12, pos.z + 0.82) };
}

function buildCounter(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const body = box(1.8, 1.04, 0.72, new THREE.MeshStandardMaterial({ color: 0xd6ddd7, roughness: 0.52 })); body.position.set(0, 0.52, 0); g.add(body);
  const top = box(1.9, 0.08, 0.82, new THREE.MeshStandardMaterial({ color: 0xf1f5f0, roughness: 0.36 })); top.position.set(0, 1.06, 0); g.add(top);
  const monitor = box(0.42, 0.24, 0.08, materials.black); monitor.position.set(-0.44, 1.28, -0.04); g.add(monitor);
  const screen = plane(0.32, 0.18, new THREE.MeshBasicMaterial({ color: 0xd8fef8 })); screen.position.set(0, 0, 0.05); monitor.add(screen);
  const reg = box(0.28, 0.2, 0.2, materials.darkMetal); reg.position.set(0.38, 1.14, 0); g.add(reg);
  const tray = box(0.62, 0.03, 0.28, new THREE.MeshStandardMaterial({ color: 0x8f9aa6, roughness: 0.44 })); tray.position.set(0.18, 1.1, 0.16); g.add(tray);
  const sideRack = box(0.32, 1.24, 0.18, new THREE.MeshStandardMaterial({ color: 0xc9d2db, roughness: 0.5 })); sideRack.position.set(-0.92, 0.62, 0.08); g.add(sideRack);
  [0xec7364,0x7eb7ff,0xffd967].forEach((c,i)=>{ const p = box(0.2,0.12,0.05,new THREE.MeshStandardMaterial({ color:c, roughness:0.55 })); p.position.set(-0.92,0.98 - i*0.18,0.18); g.add(p); });
  const tobaccoWall = box(1.1, 1.18, 0.16, new THREE.MeshStandardMaterial({ color: 0xd6d2c8, roughness: 0.74 })); tobaccoWall.position.set(-0.02, 1.76, -0.42); g.add(tobaccoWall);
  for (let i = 0; i < 6; i++) {
    const slot = box(0.14, 0.18, 0.03, new THREE.MeshStandardMaterial({ color: [0xf4f4f4,0xdca45a,0xbad7f8,0xee8484][i%4], roughness: 0.62 }));
    slot.position.set(-0.42 + i * 0.16, 1.84, -0.32); g.add(slot);
  }
  addCollider(new THREE.Box3().setFromCenterAndSize(new THREE.Vector3(pos.x, 0.52, pos.z), new THREE.Vector3(1.9, 1.08, 0.82)));
  return { group: g, point: new THREE.Vector3(pos.x, 1.1, pos.z + 0.92) };
}

function buildExteriorDetails() {
  const lampPoleGeo = new THREE.CylinderGeometry(0.05, 0.06, 4.2, 8);
  const pole1 = new THREE.Mesh(lampPoleGeo, materials.darkMetal); pole1.position.set(-4.9, 2.1, 1.8); scene.add(pole1);
  const arm1 = box(0.9, 0.08, 0.08, materials.darkMetal); arm1.position.set(-4.46, 3.72, 1.8); scene.add(arm1);
  const lamp1 = box(0.3, 0.12, 0.22, materials.warmLight); lamp1.position.set(-4.02, 3.7, 1.8); scene.add(lamp1);
  addSpriteGlow(0xffdba0, 2.35, 8.6, new THREE.Vector3(-4.02, 3.62, 1.8));

  const pole2 = new THREE.Mesh(lampPoleGeo, materials.darkMetal); pole2.position.set(5.25, 2.1, 3.45); scene.add(pole2);
  const arm2 = box(0.58, 0.08, 0.08, materials.darkMetal); arm2.position.set(5.52, 3.46, 3.45); scene.add(arm2);

  const vending = buildVendingMachine(); vending.position.set(4.95, 0, 5.85); scene.add(vending); addCollider(vending);
  [-3.25,-1.15,1.0,3.15].forEach(x=>{ const m = box(0.72,0.18,0.36,new THREE.MeshStandardMaterial({ color:0xcfd3d8, roughness:0.74 })); m.position.set(x,0.09,4.02); scene.add(m); });
  const phone = buildPhoneBooth(); phone.position.set(-5.55, 0, 4.65); scene.add(phone); addCollider(phone);
  const board = buildBulletinBoard(); board.position.set(-5.62, 0, -1.05); scene.add(board); addCollider(board);
  const closedShop = buildClosedShop(); closedShop.position.set(-5.82, 0, -7.45); scene.add(closedShop); addCollider(closedShop);
  const sign = buildRoadSign(); sign.position.set(5.75, 0, -4.8); scene.add(sign);

  const poleLineMat = new THREE.LineBasicMaterial({ color: 0x202833, transparent: true, opacity: 0.7 });
  [[new THREE.Vector3(-4.9, 3.7, 1.8), new THREE.Vector3(0, 3.52, 0.2), new THREE.Vector3(5.25, 3.45, 3.45)], [new THREE.Vector3(-4.9, 3.54, 1.8), new THREE.Vector3(0, 3.34, 0.3), new THREE.Vector3(5.25, 3.29, 3.45)]].forEach(points=> scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), poleLineMat)));
}

function buildTown() {
  const group = new THREE.Group(); scene.add(group);
  const houseA = buildHouse({ width: 3.2, depth: 3.4, height: 2.8, roofColor: 0x6e6359, wallColor: 0xcac8c1, lit: true });
  houseA.position.set(-7.4, 0, -5.4); group.add(houseA); addCollider(houseA);
  const houseB = buildHouse({ width: 2.8, depth: 2.8, height: 2.6, roofColor: 0x5d6a75, wallColor: 0xd6d7d1, lit: false });
  houseB.position.set(-10.9, 0, -1.7); houseB.rotation.y = 0.14; group.add(houseB); addCollider(houseB);
  const apt = buildApartment(); apt.position.set(8.4, 0, -4.2); group.add(apt); addCollider(apt);
  const houseC = buildHouse({ width: 2.7, depth: 2.4, height: 2.5, roofColor: 0x78655b, wallColor: 0xcfcfc8, lit: true });
  houseC.position.set(10.4, 0, 2.8); houseC.rotation.y = -0.12; group.add(houseC); addCollider(houseC);

  const fence1 = buildFence(4.2); fence1.position.set(-5.65, 0, -2.4); group.add(fence1);
  const fence2 = buildFence(4.8); fence2.position.set(6.1, 0, -1.8); fence2.rotation.y = Math.PI / 2; group.add(fence2);

  const mailbox = box(0.28, 0.4, 0.18, new THREE.MeshStandardMaterial({ color: 0xb34848, roughness: 0.58 })); mailbox.position.set(-6.2, 0.62, -1.2); group.add(mailbox);
  const mailboxPole = box(0.05, 0.84, 0.05, materials.darkMetal); mailboxPole.position.set(-6.2, 0.42, -1.2); group.add(mailboxPole);

  const parkedCar = buildCar(); parkedCar.position.set(6.7, 0, 0.65); parkedCar.rotation.y = Math.PI / 2; group.add(parkedCar); addCollider(parkedCar);
  const bike = buildBike(); bike.position.set(-8.9, 0, -2.0); bike.rotation.y = 0.4; group.add(bike);

  for (let i = 0; i < 9; i++) {
    const shrub = box(0.42 + (i%3)*0.1, 0.26 + (i%2)*0.08, 0.36, materials.shrub);
    shrub.position.set(-8.4 + i*0.55, 0.14, 2.8 + Math.sin(i)*0.14); group.add(shrub);
  }
  for (let i = 0; i < 7; i++) {
    const grass = box(0.12, 0.24 + (i%3)*0.05, 0.12, new THREE.MeshStandardMaterial({ color: 0x4b5e2e, roughness: 1 }));
    grass.position.set(5.2 + i*0.42, 0.14, 6.1 + Math.cos(i)*0.08); group.add(grass);
  }

  const farWindowMat = new THREE.MeshBasicMaterial({ color: 0xffe6b4 });
  for (let i = 0; i < 5; i++) {
    const far = box(0.22, 0.12, 0.02, farWindowMat);
    far.position.set(-14 + i * 7.2, 1.9 + (i % 2) * 0.4, -14 - i * 1.5); group.add(far);
  }

  const lanePole = buildStreetLamp(); lanePole.position.set(-8.6, 0, 2.3); group.add(lanePole);
  addSpriteGlow(0xffdeae, 1.6, 7.2, new THREE.Vector3(-8.6, 3.1, 2.3));
  const lanePole2 = buildStreetLamp(); lanePole2.position.set(7.8, 0, -2.6); group.add(lanePole2);
  addSpriteGlow(0xffdeae, 1.35, 6.8, new THREE.Vector3(7.8, 3.1, -2.6));

  colliders.push(new THREE.Box3(new THREE.Vector3(-12.8, -1, -13.2), new THREE.Vector3(-11.2, 6, 8.5)));
  colliders.push(new THREE.Box3(new THREE.Vector3(11.8, -1, -9.5), new THREE.Vector3(13.2, 6, 8.5)));
}

function buildHouse({ width, depth, height, roofColor, wallColor, lit }) {
  const g = new THREE.Group();
  const walls = box(width, height, depth, new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.82 }));
  walls.position.set(0, height / 2, 0); g.add(walls);
  const roof = box(width + 0.35, 0.18, depth + 0.35, new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.88 })); roof.position.set(0, height + 0.08, 0); g.add(roof);
  const door = box(0.54, 1.2, 0.06, new THREE.MeshStandardMaterial({ color: 0x666b71, roughness: 0.66 })); door.position.set(0, 0.6, depth / 2 + 0.04); g.add(door);
  const doorCanopy = box(0.82, 0.08, 0.46, materials.trim); doorCanopy.position.set(0, 1.3, depth / 2 + 0.12); g.add(doorCanopy);
  [-0.72, 0.72].forEach(x => {
    const frame = box(0.84, 0.72, 0.08, materials.frame); frame.position.set(x, 1.48, depth / 2 + 0.02); g.add(frame);
    const pane = box(0.72, 0.58, 0.02, lit ? materials.glass : new THREE.MeshStandardMaterial({ color: 0x2e3540, roughness: 0.58 })); pane.position.set(x, 1.48, depth / 2 + 0.06); g.add(pane);
    if (lit) {
      const glow = new THREE.PointLight(0xffeac6, 0.28, 2.2, 2.0); glow.position.set(x, 1.48, depth / 2 - 0.1); g.add(glow);
    }
  });
  const ac = box(0.42, 0.28, 0.28, materials.metal); ac.position.set(width / 2 + 0.12, 0.28, -depth / 2 + 0.52); g.add(ac);
  return g;
}

function buildApartment() {
  const g = new THREE.Group();
  const body = box(4.2, 4.8, 3.8, new THREE.MeshStandardMaterial({ color: 0xcfcfc8, roughness: 0.82 })); body.position.set(0, 2.4, 0); g.add(body);
  const roof = box(4.5, 0.2, 4.1, new THREE.MeshStandardMaterial({ color: 0x6e757c, roughness: 0.88 })); roof.position.set(0, 4.92, 0); g.add(roof);
  for (let floor = 0; floor < 2; floor++) {
    for (let i = 0; i < 3; i++) {
      const door = box(0.46, 1.14, 0.05, new THREE.MeshStandardMaterial({ color: 0x6d737a, roughness: 0.68 }));
      door.position.set(-1.2 + i * 1.2, 0.6 + floor * 2.0, 1.92); g.add(door);
      const win = box(0.38, 0.46, 0.02, i === 1 && floor === 0 ? materials.glass : new THREE.MeshStandardMaterial({ color: 0x27313a, roughness: 0.58 }));
      win.position.set(-1.2 + i * 1.2, 1.56 + floor * 2.0, 1.96); g.add(win);
    }
  }
  const stair = box(1.1, 1.8, 0.8, new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.82 })); stair.position.set(-1.82, 0.9, -1.4); g.add(stair);
  return g;
}

function buildFence(length) {
  const g = new THREE.Group();
  for (let i = 0; i < length; i += 0.5) {
    const post = box(0.03, 0.7, 0.03, materials.darkMetal); post.position.set(i - length / 2, 0.35, 0); g.add(post);
  }
  const rail1 = box(length, 0.03, 0.03, materials.darkMetal); rail1.position.set(0, 0.22, 0); g.add(rail1);
  const rail2 = box(length, 0.03, 0.03, materials.darkMetal); rail2.position.set(0, 0.52, 0); g.add(rail2);
  return g;
}

function buildStreetLamp() {
  const g = new THREE.Group();
  const pole = box(0.08, 3.2, 0.08, materials.darkMetal); pole.position.set(0, 1.6, 0); g.add(pole);
  const arm = box(0.5, 0.06, 0.06, materials.darkMetal); arm.position.set(0.22, 3.06, 0); g.add(arm);
  const lamp = box(0.18, 0.12, 0.18, materials.warmLight); lamp.position.set(0.42, 3.0, 0); g.add(lamp);
  return g;
}

function buildCar() {
  const g = new THREE.Group();
  const body = box(1.5, 0.52, 0.8, new THREE.MeshStandardMaterial({ color: 0xe7ebef, roughness: 0.48, metalness: 0.18 })); body.position.set(0, 0.4, 0); g.add(body);
  const cabin = box(0.82, 0.42, 0.72, new THREE.MeshStandardMaterial({ color: 0xd7dde7, roughness: 0.42, metalness: 0.15 })); cabin.position.set(-0.1, 0.82, 0); g.add(cabin);
  const glass = box(0.72, 0.24, 0.66, materials.glass); glass.position.set(-0.1, 0.86, 0); g.add(glass);
  return g;
}

function buildBike() {
  const g = new THREE.Group();
  const frame = box(0.6, 0.04, 0.04, materials.darkMetal); frame.position.set(0, 0.42, 0); frame.rotation.z = 0.3; g.add(frame);
  const frame2 = frame.clone(); frame2.rotation.z = -0.4; g.add(frame2);
  const wheel1 = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.02, 8, 16), materials.darkMetal); wheel1.position.set(-0.28, 0.18, 0); wheel1.rotation.y = Math.PI / 2; g.add(wheel1);
  const wheel2 = wheel1.clone(); wheel2.position.x = 0.28; g.add(wheel2);
  return g;
}

function buildVendingMachine() {
  const g = new THREE.Group();
  const body = box(0.78, 1.82, 0.56, new THREE.MeshStandardMaterial({ color: 0xebf1f7, roughness: 0.32, metalness: 0.08 })); body.position.y = 0.91; g.add(body);
  const glass = box(0.52, 0.62, 0.03, materials.glass); glass.position.set(0, 1.2, 0.29); g.add(glass);
  const cols = [0xff6a65,0xf2d466,0x67b8ff,0x74d286,0xc88cff];
  cols.forEach((c,i)=>{ const p = box(0.07,0.18,0.02,new THREE.MeshStandardMaterial({ color:c, roughness:0.45 })); p.position.set(-0.18 + i*0.09,0.96,0.3); g.add(p); });
  const slot = box(0.3,0.08,0.05, materials.black); slot.position.set(0,0.58,0.29); g.add(slot);
  const glow = new THREE.PointLight(0xe7f3ff, 1.4, 3.8, 2.2); glow.position.set(0, 1.2, 0.28); g.add(glow);
  return g;
}
function buildPhoneBooth() {
  const g = new THREE.Group();
  const shell = box(0.9, 2.22, 0.86, new THREE.MeshStandardMaterial({ color: 0xc9d8e6, roughness: 0.44 })); shell.position.set(0, 1.11, 0); g.add(shell);
  const glass = box(0.58, 1.56, 0.02, materials.glass); glass.position.set(0, 1.17, 0.43); g.add(glass);
  const phone = box(0.2, 0.32, 0.08, materials.darkMetal); phone.position.set(0, 1.12, 0.08); g.add(phone);
  return g;
}
function buildBulletinBoard() {
  const g = new THREE.Group();
  const board = box(1.12, 1.34, 0.12, new THREE.MeshStandardMaterial({ color: 0x757d87, roughness: 0.64 })); board.position.set(0, 1.22, 0); g.add(board);
  const face = plane(0.92, 1.04, new THREE.MeshBasicMaterial({ color: 0xf4ece1 })); face.position.set(0, 0, 0.07); board.add(face);
  const strip1 = box(0.82, 0.08, 0.02, new THREE.MeshStandardMaterial({ color: 0xd15f5a })); strip1.position.set(0, 0.32, 0.08); board.add(strip1);
  const strip2 = box(0.6, 0.06, 0.02, new THREE.MeshStandardMaterial({ color: 0x6d88c6 })); strip2.position.set(0, 0.08, 0.08); board.add(strip2);
  const poleL = box(0.08, 1.6, 0.08, materials.darkMetal); poleL.position.set(-0.38, 0.7, 0); g.add(poleL);
  const poleR = box(0.08, 1.6, 0.08, materials.darkMetal); poleR.position.set(0.38, 0.7, 0); g.add(poleR);
  return g;
}
function buildClosedShop() {
  const g = new THREE.Group();
  const body = box(2.7, 2.5, 2.2, new THREE.MeshStandardMaterial({ color: 0xc9cbc4, roughness: 0.82 })); body.position.set(0, 1.25, 0); g.add(body);
  const shutter = box(2.0, 1.6, 0.1, new THREE.MeshStandardMaterial({ color: 0x6c737c, roughness: 0.75 })); shutter.position.set(0, 0.95, 1.12); g.add(shutter);
  const roof = box(3.0, 0.18, 2.42, new THREE.MeshStandardMaterial({ color: 0x7b6f65, roughness: 0.82 })); roof.position.set(0, 2.48, 0); g.add(roof);
  return g;
}
function buildRoadSign() {
  const g = new THREE.Group();
  const pole = box(0.08, 1.7, 0.08, materials.darkMetal); pole.position.set(0, 0.85, 0); g.add(pole);
  const board = box(1.24, 0.46, 0.06, new THREE.MeshStandardMaterial({ color: 0xd8dce2, roughness: 0.58 })); board.position.set(0, 1.52, 0); g.add(board);
  const face = plane(1.08, 0.26, new THREE.MeshBasicMaterial({ color: 0x7890c0 })); face.position.set(0, 0, 0.04); board.add(face);
  return g;
}

function addMountainsAndSky() {
  const hemi = new THREE.HemisphereLight(0x8399c9, 0x101318, 0.72); scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x5d7086, 0.42); scene.add(ambient);
  const moonGlow = new THREE.DirectionalLight(0x96abd0, 0.4); moonGlow.position.set(-1.8, 2.4, -1.3); scene.add(moonGlow);
  const storeFill = new THREE.PointLight(0xfafcff, 5.2, 13, 2.0); storeFill.position.set(0, 2.8, 2.9); scene.add(storeFill);
  const insideA = new THREE.PointLight(0xf7fbff, 3.0, 8.4, 2.0); insideA.position.set(-1.8, 3.2, 0); scene.add(insideA);
  const insideB = new THREE.PointLight(0xf7fbff, 3.0, 8.4, 2.0); insideB.position.set(2.2, 3.2, -1.7); scene.add(insideB);

  const skyGeo = new THREE.SphereGeometry(70, 18, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { topColor: { value: new THREE.Color(0x112955) }, bottomColor: { value: new THREE.Color(0x09111d) }, offset: { value: 18 }, exponent: { value: 0.75 } },
    vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition + offset).y; float f = max(pow(max(h, 0.0), exponent), 0.0); gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0); }`
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  const mountainMat = new THREE.MeshBasicMaterial({ color: 0x111820 });
  [[-16, -18, 18, 5.0], [3, -20, 23, 6.0], [18, -16, 14, 4.1]].forEach(([x,z,wid,hei]) => {
    const shape = new THREE.Shape();
    shape.moveTo(-wid/2, 0); shape.lineTo(-wid*0.25, hei*0.7); shape.lineTo(0, hei); shape.lineTo(wid*0.22, hei*0.62); shape.lineTo(wid/2, 0); shape.lineTo(-wid/2,0);
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), mountainMat);
    mesh.position.set(x, 0.1, z); scene.add(mesh); mesh.rotation.y = 0.02;
  });

  const stars = new THREE.BufferGeometry();
  const starCount = 72;
  const pts = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const x = (Math.random() - 0.5) * 48; const y = 8 + Math.random() * 10; const z = -12 - Math.random() * 36;
    pts[i*3] = x; pts[i*3+1] = y; pts[i*3+2] = z;
  }
  stars.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: 0xf8fbff, size: 0.06, transparent: true, opacity: 0.55 })));
}

buildGround();
buildStore();
buildExteriorDetails();
buildTown();
addMountainsAndSky();

camera.position.copy(player.position);
camera.rotation.order = 'YXZ';

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener('resize', resize, { passive: true });

function isUiTarget(target) { return !!target.closest('.ui-hit, #menu-panel'); }

function updateJoystickVisual(cx, cy) {
  joystickBase.classList.remove('hidden');
  joystickBase.style.left = `${cx - inputParams.baseSize / 2}px`;
  joystickBase.style.top = `${cy - inputParams.baseSize / 2}px`;
}
function resetJoystickVisual() {
  joystickBase.classList.add('hidden');
  joystickKnob.style.transform = 'translate(0px, 0px)';
}

joystickZone.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  const rect = joystickZone.getBoundingClientRect();
  const cx = THREE.MathUtils.clamp(e.clientX, rect.left + inputParams.baseSize / 2 + inputParams.joyActivationMargin, rect.right - inputParams.baseSize / 2 - 4);
  const cy = THREE.MathUtils.clamp(e.clientY, rect.top + inputParams.baseSize / 2 - 10, rect.bottom - inputParams.baseSize / 2 - 2);
  state.joy.active = true; state.joy.id = e.pointerId; state.joy.centerX = cx; state.joy.centerY = cy;
  joystickZone.setPointerCapture(e.pointerId);
  updateJoystickVisual(cx, cy);
  updateJoystick(e.clientX, e.clientY);
}, { passive: false });
joystickZone.addEventListener('pointermove', (e) => {
  if (!state.joy.active || e.pointerId !== state.joy.id) return;
  e.preventDefault();
  updateJoystick(e.clientX, e.clientY);
}, { passive: false });
function endJoy(e) {
  if (!state.joy.active || e.pointerId !== state.joy.id) return;
  state.joy.active = false; state.joy.id = null; state.joy.x = 0; state.joy.y = 0;
  resetJoystickVisual();
}
joystickZone.addEventListener('pointerup', endJoy);
joystickZone.addEventListener('pointercancel', endJoy);

function updateJoystick(clientX, clientY) {
  let dx = clientX - state.joy.centerX;
  let dy = clientY - state.joy.centerY;
  const len = Math.hypot(dx, dy);
  if (len > inputParams.joyRadius * 1.35) {
    dx = dx / len * inputParams.joyRadius * 1.35;
    dy = dy / len * inputParams.joyRadius * 1.35;
  }
  const visualLen = Math.min(inputParams.joyMaxVisual, Math.hypot(dx, dy));
  const visualX = len > 0.001 ? dx / Math.hypot(dx, dy) * visualLen : 0;
  const visualY = len > 0.001 ? dy / Math.hypot(dx, dy) * visualLen : 0;
  joystickKnob.style.transform = `translate(${visualX}px, ${visualY}px)`;

  let nx = dx / inputParams.joyRadius;
  let ny = dy / inputParams.joyRadius;
  const mag = Math.min(1, Math.hypot(nx, ny));
  if (mag < inputParams.joyDeadZone) {
    state.joy.x = 0; state.joy.y = 0; return;
  }
  const scaled = (mag - inputParams.joyDeadZone) / (1 - inputParams.joyDeadZone);
  const curved = Math.min(1, scaled * scaled * 0.45 + scaled * 0.55);
  const inv = 1 / mag;
  state.joy.x = nx * inv * curved;
  state.joy.y = ny * inv * curved;
}

runToggle.addEventListener('click', () => {
  state.run = !state.run;
  runToggle.textContent = `走る: ${state.run ? 'ON' : 'OFF'}`;
  runToggle.setAttribute('aria-pressed', String(state.run));
});
interactBtn.addEventListener('click', () => currentInteractable && currentInteractable.action());
menuToggle.addEventListener('click', () => menuPanel.classList.toggle('hidden'));
scanlineToggle.addEventListener('click', () => {
  const on = scanlineOverlay.classList.toggle('hidden') === false;
  scanlineToggle.textContent = on ? 'ON' : 'OFF';
});
sensitivityToggle.addEventListener('click', () => {
  state.sensitivityIndex = (state.sensitivityIndex + 1) % 3;
  sensitivityToggle.textContent = ['低め', '標準', '高め'][state.sensitivityIndex];
});
bobToggle.addEventListener('click', () => {
  state.bob = !state.bob;
  bobToggle.textContent = state.bob ? 'ON' : 'OFF';
});

const lookState = state.look;
dragZone.addEventListener('pointerdown', (e) => {
  if (isUiTarget(e.target)) return;
  e.preventDefault();
  lookState.active = true; lookState.id = e.pointerId; lookState.x = e.clientX; lookState.y = e.clientY;
  dragZone.setPointerCapture(e.pointerId);
}, { passive: false });
dragZone.addEventListener('pointermove', (e) => {
  if (!lookState.active || e.pointerId !== lookState.id) return;
  e.preventDefault();
  const dx = e.clientX - lookState.x; const dy = e.clientY - lookState.y;
  lookState.x = e.clientX; lookState.y = e.clientY;
  const sens = state.sensitivities[state.sensitivityIndex];
  state.yaw -= dx * sens;
  state.pitch -= dy * sens * 0.78;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.46, 0.32);
}, { passive: false });
function endLook(e) {
  if (!lookState.active || e.pointerId !== lookState.id) return;
  lookState.active = false; lookState.id = null;
}
dragZone.addEventListener('pointerup', endLook);
dragZone.addEventListener('pointercancel', endLook);

document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.target.closest('#app')) e.preventDefault(); }, { passive: false });

function colliderHit(pos) {
  for (const box of colliders) {
    if (
      pos.x > box.min.x - player.radius && pos.x < box.max.x + player.radius &&
      pos.z > box.min.z - player.radius && pos.z < box.max.z + player.radius &&
      pos.y > box.min.y - 0.1 && pos.y < box.max.y + 3.0
    ) return true;
  }
  return false;
}

function updateCamera() {
  camera.position.copy(player.position);
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

function nearestInteractable() {
  camera.getWorldDirection(forward);
  let best = null;
  for (const item of interactables) {
    const point = typeof item.point === 'function' ? item.point() : item.point;
    tmpVec.copy(point).sub(player.position);
    const dist = tmpVec.length();
    if (dist > item.radius) continue;
    tmpVec.normalize();
    const dot = tmpVec.dot(forward);
    if (dot < 0.66) continue;
    if (!best || dist < best.dist) best = { item, dist };
  }
  return best ? best.item : null;
}

function updateInteractUi() {
  currentInteractable = nearestInteractable();
  if (!currentInteractable) {
    interactBtn.disabled = true; interactBtn.textContent = '調べる'; setPrompt(''); return;
  }
  interactBtn.disabled = false;
  const label = typeof currentInteractable.label === 'function' ? currentInteractable.label() : currentInteractable.label;
  interactBtn.textContent = '調べる';
  setPrompt(`調べる: ${label}`);
}

function animateDoor(dt) {
  const speed = 2.8 * dt;
  doorParts.forEach((part) => {
    const target = state.doorOpen ? part.openX : part.closedX;
    part.mesh.position.x = THREE.MathUtils.lerp(part.mesh.position.x, target, speed);
  });
}

let lastTime = performance.now();
function tick(now) {
  const dt = Math.min(0.032, (now - lastTime) / 1000);
  lastTime = now;

  const speed = state.run ? player.runSpeed : player.speed;
  const joyX = state.joy.x; const joyY = state.joy.y;
  const mag = Math.hypot(joyX, joyY);
  let moving = false;
  if (mag > 0.01) {
    forward.set(Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    right.set(Math.cos(state.yaw), 0, Math.sin(state.yaw));
    const move = new THREE.Vector3();
    move.addScaledVector(right, joyX);
    move.addScaledVector(forward, -joyY);
    move.normalize().multiplyScalar(speed * dt);
    const testX = player.position.clone(); testX.x += move.x;
    if (!colliderHit(testX)) player.position.x = testX.x;
    const testZ = player.position.clone(); testZ.z += move.z;
    if (!colliderHit(testZ)) player.position.z = testZ.z;
    moving = true; walkTime += dt * (state.run ? 11.8 : 8.1);
  }

  const bobOffset = moving && state.bob ? Math.sin(walkTime) * 0.018 : 0;
  player.position.y = 1.68 + bobOffset;

  updateCamera();
  animateDoor(dt);
  updateInteractUi();

  if (performance.now() > state.infoFadeAt) { topPanel.classList.add('faded'); hint.classList.add('faded'); }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

showToast('左は移動、右半分ドラッグで視点移動。まず入口を調べる。', 2600);
updateCamera();
requestAnimationFrame(tick);
