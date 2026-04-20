
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
const joystickBase = document.getElementById('joystick-base');
const joystickKnob = document.getElementById('joystick-knob');
const dragZone = document.getElementById('drag-zone');
const heldItem = document.getElementById('held-item');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x08111f);
scene.fog = new THREE.FogExp2(0x09111d, 0.028);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 120);
const state = {
  yaw: 0,
  pitch: -0.05,
  run: false,
  bob: true,
  sensitivityIndex: 1,
  sensitivities: [0.0019, 0.0024, 0.003],
  joy: { active: false, id: null, x: 0, y: 0 },
  look: { active: false, id: null, x: 0, y: 0 },
  doorOpen: false,
  hasDrink: false,
  toastTimer: null,
  infoFadeAt: performance.now() + 5000,
};

const player = {
  position: new THREE.Vector3(0, 1.68, 8.7),
  radius: 0.24,
  speed: 2.05,
  runSpeed: 3.2,
};

const colliders = [];
const interactables = [];
const tmpVec = new THREE.Vector3();
const forward = new THREE.Vector3();
const right = new THREE.Vector3();
let walkTime = 0;
let currentInteractable = null;
const doorParts = [];

const texLoader = new THREE.CanvasTexture(document.createElement('canvas'));

function showToast(text, ms = 2200) {
  toast.textContent = text;
  toast.classList.remove('hidden');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.add('hidden'), ms);
}
function showHint(text, ms = 2400) {
  hintText.textContent = text;
  hint.classList.remove('faded');
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
  g.fillStyle = '#3b4149';
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 1400; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const s = Math.random() * 2 + 0.4;
    g.fillStyle = `rgba(${70 + Math.random()*30},${70 + Math.random()*30},${72 + Math.random()*30},${0.12 + Math.random()*0.18})`;
    g.fillRect(x, y, s, s);
  }
  for (let i = 0; i < 16; i++) {
    g.fillStyle = `rgba(255,255,255,${0.02 + Math.random()*0.03})`;
    g.beginPath();
    g.arc(Math.random()*w, Math.random()*h, 16 + Math.random()*24, 0, Math.PI*2);
    g.fill();
  }
}, 10, 26);

const sidewalkTex = makeCanvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#767d86';
  g.fillRect(0,0,w,h);
  for (let y = 0; y < h; y += 32) {
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(0, y, w, 1);
  }
  for (let x = 0; x < w; x += 64) {
    g.fillStyle = 'rgba(0,0,0,0.08)';
    g.fillRect(x, 0, 1, h);
  }
}, 4, 12);

const tileTex = makeCanvasTexture(256, 256, (g, w, h) => {
  g.fillStyle = '#eef1f3'; g.fillRect(0,0,w,h);
  for (let y = 0; y <= h; y += 32) { g.fillStyle = 'rgba(0,0,0,0.08)'; g.fillRect(0,y,w,1); }
  for (let x = 0; x <= w; x += 32) { g.fillRect(x,0,1,h); }
  for (let i = 0; i < 240; i++) {
    g.fillStyle = `rgba(0,0,0,${Math.random()*0.03})`;
    g.fillRect(Math.random()*w, Math.random()*h, 1 + Math.random()*2, 1 + Math.random()*2);
  }
}, 8, 7);

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
}, 4, 3);

const signTex = makeCanvasTexture(512, 64, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#d44d49');
  grad.addColorStop(0.18, '#d44d49');
  grad.addColorStop(0.18, '#46b268');
  grad.addColorStop(0.82, '#46b268');
  grad.addColorStop(0.82, '#d4b14a');
  grad.addColorStop(1, '#d4b14a');
  g.fillStyle = grad; g.fillRect(0,0,w,h);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = 'bold 28px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('こもれびストア', w/2, h/2 + 1);
}, 1, 1);

const materials = {
  asphalt: new THREE.MeshStandardMaterial({ map: asphaltTex, color: 0x4a5058, roughness: 0.86, metalness: 0.03 }),
  sidewalk: new THREE.MeshStandardMaterial({ map: sidewalkTex, color: 0x7d858f, roughness: 0.82, metalness: 0.02 }),
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
};

function addCollider(mesh, pad = 0.0) {
  const box = new THREE.Box3().setFromObject(mesh);
  colliders.push({ box, pad });
}

function box(w, h, d, mat) {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
}
function plane(w, h, mat) {
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
}

function buildGround() {
  const road = new THREE.Mesh(new THREE.PlaneGeometry(16, 42), materials.asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -5);
  scene.add(road);

  const parking = new THREE.Mesh(new THREE.PlaneGeometry(10.8, 7.2), materials.asphalt);
  parking.rotation.x = -Math.PI / 2;
  parking.position.set(0, 0.002, 1.3);
  scene.add(parking);

  const sideWalk = new THREE.Mesh(new THREE.PlaneGeometry(11.8, 1.05), materials.sidewalk);
  sideWalk.rotation.x = -Math.PI / 2;
  sideWalk.position.set(0, 0.03, 5.15);
  scene.add(sideWalk);

  const leftGrass = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 32), materials.grass);
  leftGrass.rotation.x = -Math.PI / 2; leftGrass.position.set(-5.8, 0, -2);
  scene.add(leftGrass);
  const rightGrass = leftGrass.clone(); rightGrass.position.x = 5.8; scene.add(rightGrass);

  const curbGeo = new THREE.BoxGeometry(11.8, 0.16, 0.24);
  const curb = new THREE.Mesh(curbGeo, materials.trim); curb.position.set(0, 0.08, 4.66); scene.add(curb);

  const drain = box(1.15, 0.04, 0.56, materials.darkMetal); drain.position.set(4.4, 0.021, 5.07); scene.add(drain);

  const lines = [];
  [-2.95, -1.05, 0.85, 2.75].forEach((x) => {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 5.0), new THREE.MeshBasicMaterial({ color: 0xf6f6f7 }));
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.006, 1.4);
    scene.add(line); lines.push(line);
  });
  const backLine = new THREE.Mesh(new THREE.PlaneGeometry(8.0, 0.08), new THREE.MeshBasicMaterial({ color: 0xf6f6f7 }));
  backLine.rotation.x = -Math.PI / 2; backLine.position.set(0, 0.006, -1.15); scene.add(backLine);
}

function buildStore() {
  const store = new THREE.Group();
  store.position.set(0, 0, 0);
  scene.add(store);

  const back = box(10.4, 4.3, 0.24, materials.wall); back.position.set(0, 2.15, -4.86); store.add(back);
  const left = box(0.24, 4.3, 9.8, materials.wall); left.position.set(-5.08, 2.15, 0); store.add(left);
  const right = left.clone(); right.position.x = 5.08; store.add(right);
  const roof = box(10.7, 0.24, 10.2, materials.trim); roof.position.set(0, 4.34, 0); store.add(roof);
  const canopy = box(10.95, 0.16, 1.2, materials.trim); canopy.position.set(0, 4.14, 4.8); store.add(canopy);

  const signBand = box(10.45, 0.58, 0.18, materials.sign); signBand.position.set(0, 3.86, 4.86); store.add(signBand);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(9.9, 9.2), materials.tile);
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0.01, -0.1); store.add(floor);
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(9.9, 9.2), materials.ceiling);
  ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 4.18, -0.1); store.add(ceiling);

  const frontFrameTop = box(9.9, 0.18, 0.18, materials.frame); frontFrameTop.position.set(0, 3.18, 4.72); store.add(frontFrameTop);
  const frontFrameBottom = box(9.9, 0.24, 0.22, materials.frame); frontFrameBottom.position.set(0, 0.12, 4.72); store.add(frontFrameBottom);
  [-4.2, -1.4, 1.4, 4.2].forEach((x) => {
    const mullion = box(0.12, 3.0, 0.18, materials.frame); mullion.position.set(x, 1.62, 4.72); store.add(mullion);
  });

  const leftWindow = box(2.4, 2.9, 0.05, materials.glass); leftWindow.position.set(-2.7, 1.63, 4.77); store.add(leftWindow);
  const rightWindow = box(2.4, 2.9, 0.05, materials.glass); rightWindow.position.set(2.7, 1.63, 4.77); store.add(rightWindow);

  const doorGroup = new THREE.Group();
  doorGroup.position.set(0, 0, 4.77);
  store.add(doorGroup);
  const doorFrame = box(1.75, 3.0, 0.18, materials.frame); doorFrame.position.set(0, 1.62, 0); doorGroup.add(doorFrame);
  const doorVoid = box(1.45, 2.8, 0.24, new THREE.MeshBasicMaterial({ color: 0x122032 })); doorVoid.position.set(0, 1.58, -0.01); doorGroup.add(doorVoid);
  const doorLeft = box(0.68, 2.76, 0.03, materials.glass); doorLeft.position.set(-0.36, 1.58, 0.03); doorGroup.add(doorLeft);
  const doorRight = box(0.68, 2.76, 0.03, materials.glass); doorRight.position.set(0.36, 1.58, 0.03); doorGroup.add(doorRight);
  doorParts.push({ mesh: doorLeft, closedX: -0.36, openX: -0.88 }, { mesh: doorRight, closedX: 0.36, openX: 0.88 });

  const doormat = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.72), new THREE.MeshStandardMaterial({ color: 0x6a7078, roughness: 0.86 }));
  doormat.rotation.x = -Math.PI / 2; doormat.position.set(0, 0.015, 5.28); scene.add(doormat);

  const frameLeft = box(0.24, 4.3, 0.62, materials.wall); frameLeft.position.set(-5.32, 2.15, 4.72); scene.add(frameLeft);
  const frameRight = box(0.24, 4.3, 0.62, materials.wall); frameRight.position.set(5.32, 2.15, 4.72); scene.add(frameRight);

  addCollider(back); addCollider(left); addCollider(right); addCollider(frameLeft); addCollider(frameRight);
  const frontLeftBlock = box(3.55, 4.3, 0.3, materials.wall); frontLeftBlock.position.set(-3.22, 2.15, 4.72); scene.add(frontLeftBlock); addCollider(frontLeftBlock);
  const frontRightBlock = box(3.55, 4.3, 0.3, materials.wall); frontRightBlock.position.set(3.22, 2.15, 4.72); scene.add(frontRightBlock); addCollider(frontRightBlock);

  const shelf1 = buildShelf(new THREE.Vector3(-1.8, 0, 1.25), 0);
  const shelf2 = buildShelf(new THREE.Vector3(1.15, 0, 0.82), 0);
  const shelf3 = buildShelf(new THREE.Vector3(0.1, 0, -1.45), Math.PI / 2, 0.92);
  store.add(shelf1, shelf2, shelf3);

  const fridge = buildFridge(new THREE.Vector3(-4.1, 0, -0.4));
  store.add(fridge.group);
  interactables.push({
    id: 'fridge',
    point: fridge.point,
    radius: 1.7,
    label: '冷蔵ケース',
    action: () => {
      if (!state.hasDrink) {
        state.hasDrink = true;
        heldItem.classList.remove('hidden');
        showHint('飲み物を取った。レジへ向かおう。');
        showToast('飲み物を手に持った');
      } else {
        showHint('冷蔵ケース。白い灯りが静かに続いている。');
      }
    }
  });

  const counter = buildCounter(new THREE.Vector3(3.7, 0, -2.15));
  store.add(counter.group);
  interactables.push({
    id: 'register',
    point: counter.point,
    radius: 1.6,
    label: 'レジ周辺',
    action: () => {
      if (state.hasDrink) {
        showHint('レジ周辺。液晶には 23:48 の表示。');
        showToast('会計前の静けさがある');
      } else {
        showHint('レジ周辺。先に飲み物を取った方がよさそうだ。');
      }
    }
  });

  interactables.push({
    id: 'door',
    point: new THREE.Vector3(0, 1.5, 5.6),
    radius: 1.55,
    label: () => state.doorOpen ? '入口' : 'ドア',
    action: () => {
      if (!state.doorOpen) {
        state.doorOpen = true;
        showHint('ドアが開いた。中へ入れる。');
        showToast('入口を開けた');
      } else {
        showHint('入口。中の明かりが近い。');
      }
    }
  });

  const frameBar1 = box(0.08, 3.0, 0.2, materials.frame); frameBar1.position.set(-0.84, 1.62, 4.76); scene.add(frameBar1);
  const frameBar2 = box(0.08, 3.0, 0.2, materials.frame); frameBar2.position.set(0.84, 1.62, 4.76); scene.add(frameBar2);

  const poster = box(0.74, 1.08, 0.04, materials.trim); poster.position.set(4.32, 2.0, 1.2); store.add(poster);
  const posterFace = plane(0.6, 0.94, new THREE.MeshBasicMaterial({ color: 0xf7ece0 })); posterFace.position.set(0, 0, 0.03); poster.add(posterFace);
}

function buildShelf(pos, rotY = 0, scale = 1.0) {
  const g = new THREE.Group();
  g.position.copy(pos); g.rotation.y = rotY; g.scale.setScalar(scale);
  const sideMat = new THREE.MeshStandardMaterial({ color: 0xcfd6dd, roughness: 0.52, metalness: 0.15 });
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0xe8edf1, roughness: 0.46, metalness: 0.08 });
  const sideL = box(0.12, 1.35, 1.1, sideMat); sideL.position.set(-0.56, 0.68, 0); g.add(sideL);
  const sideR = box(0.12, 1.35, 1.1, sideMat); sideR.position.set(0.56, 0.68, 0); g.add(sideR);
  [0.14, 0.52, 0.9, 1.26].forEach((y) => {
    const shelf = box(1.1, 0.05, 0.44, shelfMat); shelf.position.set(0, y, 0); g.add(shelf);
  });
  const colors = [0xec5c5d, 0x5b82ef, 0xf0cf63, 0x55c37c, 0x8d68f1, 0xf59348];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const product = box(0.16, 0.2 + (col % 2) * 0.06, 0.14, new THREE.MeshStandardMaterial({ color: colors[(row + col) % colors.length], roughness: 0.5 }));
      product.position.set(-0.36 + col * 0.18, 0.18 + row * 0.38, -0.06 + ((row + col) % 2) * 0.08);
      g.add(product);
    }
  }
  addCollider(g, 0.06);
  return g;
}

function buildFridge(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const shell = box(1.7, 2.15, 0.72, new THREE.MeshStandardMaterial({ color: 0xf4f7fb, roughness: 0.5, metalness: 0.08 })); shell.position.set(0, 1.08, 0); g.add(shell);
  const frames = [-0.56, 0, 0.56].map((x) => {
    const door = box(0.5, 1.86, 0.03, materials.glass); door.position.set(x, 1.08, 0.37); g.add(door);
    const v = box(0.04, 1.9, 0.06, materials.frame); v.position.set(x + 0.24, 1.08, 0.36); g.add(v);
    return door;
  });
  for (let y = 0.36; y < 1.95; y += 0.42) {
    const rail = box(1.42, 0.03, 0.36, new THREE.MeshStandardMaterial({ color: 0xdce4ed, roughness: 0.34, metalness: 0.15 }));
    rail.position.set(0, y, 0.06); g.add(rail);
  }
  const cols = [0x50abff,0xff725f,0x73d187,0xf0d164,0xc98cff,0xffffff];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      const b = box(0.09, 0.28, 0.09, new THREE.MeshStandardMaterial({ color: cols[(row + col) % cols.length], roughness: 0.4 }));
      b.position.set(-0.62 + col * 0.18, 0.26 + row * 0.42, -0.03); g.add(b);
    }
  }
  const glow = new THREE.PointLight(0xf7fbff, 4.6, 5.5, 2.4); glow.position.set(0, 1.3, 0.2); g.add(glow);
  addCollider(g, 0.02);
  return { group: g, point: new THREE.Vector3(pos.x, 1.1, pos.z + 0.72) };
}

function buildCounter(pos) {
  const g = new THREE.Group(); g.position.copy(pos);
  const body = box(1.62, 1.02, 0.62, new THREE.MeshStandardMaterial({ color: 0xd6ddd7, roughness: 0.52 })); body.position.set(0, 0.51, 0); g.add(body);
  const top = box(1.7, 0.08, 0.72, new THREE.MeshStandardMaterial({ color: 0xf1f5f0, roughness: 0.36 })); top.position.set(0, 1.04, 0); g.add(top);
  const monitor = box(0.36, 0.22, 0.08, materials.black); monitor.position.set(-0.42, 1.24, -0.02); g.add(monitor);
  const screen = plane(0.28, 0.16, new THREE.MeshBasicMaterial({ color: 0xd8fef8 })); screen.position.set(0, 0, 0.05); monitor.add(screen);
  const reg = box(0.26, 0.18, 0.18, materials.darkMetal); reg.position.set(0.34, 1.12, 0); g.add(reg);
  const tray = box(0.56, 0.03, 0.26, new THREE.MeshStandardMaterial({ color: 0x8f9aa6, roughness: 0.44 })); tray.position.set(0.16, 1.08, 0.14); g.add(tray);
  const sideRack = box(0.26, 1.18, 0.18, new THREE.MeshStandardMaterial({ color: 0xc9d2db, roughness: 0.5 })); sideRack.position.set(-0.82, 0.6, 0.08); g.add(sideRack);
  [0xec7364,0x7eb7ff,0xffd967].forEach((c,i)=>{
    const p = box(0.18,0.12,0.05,new THREE.MeshStandardMaterial({ color:c, roughness:0.55 }));
    p.position.set(-0.82,0.95 - i*0.18,0.18); g.add(p);
  });
  addCollider(g, 0.04);
  return { group: g, point: new THREE.Vector3(pos.x, 1.08, pos.z + 0.82) };
}

function buildExteriorDetails() {
  const lampPoleGeo = new THREE.CylinderGeometry(0.05, 0.06, 4.2, 8);
  const pole1 = new THREE.Mesh(lampPoleGeo, materials.darkMetal); pole1.position.set(-4.8, 2.1, 1.5); scene.add(pole1);
  const arm1 = box(0.86, 0.08, 0.08, materials.darkMetal); arm1.position.set(-4.38, 3.72, 1.5); scene.add(arm1);
  const lamp1 = box(0.3, 0.12, 0.22, materials.warmLight); lamp1.position.set(-4.0, 3.7, 1.5); scene.add(lamp1);
  const lampLight = new THREE.PointLight(0xffdba0, 2.2, 8.6, 2.0); lampLight.position.set(-4.0, 3.62, 1.5); scene.add(lampLight);

  const pole2 = new THREE.Mesh(lampPoleGeo, materials.darkMetal); pole2.position.set(5.05, 2.1, 3.05); scene.add(pole2);
  const arm2 = box(0.58, 0.08, 0.08, materials.darkMetal); arm2.position.set(5.32, 3.46, 3.05); scene.add(arm2);

  const vending = buildVendingMachine(); vending.position.set(4.65, 0, 5.55); scene.add(vending); addCollider(vending, 0.02);
  const stopBlocks = [-3.15,-1.1,0.96,3.02].map(x=>{ const m = box(0.66,0.18,0.36,new THREE.MeshStandardMaterial({ color:0xcfd3d8, roughness:0.74 })); m.position.set(x,0.09,3.82); scene.add(m); return m; });
  const phone = buildPhoneBooth(); phone.position.set(-5.25, 0, 4.4); scene.add(phone); addCollider(phone, 0.02);
  const board = buildBulletinBoard(); board.position.set(-5.35, 0, -0.85); scene.add(board); addCollider(board, 0.02);
  const closedShop = buildClosedShop(); closedShop.position.set(-5.55, 0, -6.8); scene.add(closedShop); addCollider(closedShop, 0.04);
  const sign = buildRoadSign(); sign.position.set(5.4, 0, -4.2); scene.add(sign);

  const poleLineMat = new THREE.LineBasicMaterial({ color: 0x202833, transparent: true, opacity: 0.7 });
  const points1 = [new THREE.Vector3(-4.8, 3.7, 1.5), new THREE.Vector3(0, 3.52, 0.2), new THREE.Vector3(5.05, 3.45, 3.05)];
  const wire1 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points1), poleLineMat); scene.add(wire1);
  const points2 = [new THREE.Vector3(-4.8, 3.54, 1.5), new THREE.Vector3(0, 3.34, 0.3), new THREE.Vector3(5.05, 3.29, 3.05)];
  const wire2 = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points2), poleLineMat); scene.add(wire2);
}

function buildVendingMachine() {
  const g = new THREE.Group();
  const body = box(0.72, 1.76, 0.54, new THREE.MeshStandardMaterial({ color: 0xebf1f7, roughness: 0.32, metalness: 0.08 })); body.position.y = 0.88; g.add(body);
  const glass = box(0.5, 0.6, 0.03, materials.glass); glass.position.set(0, 1.18, 0.28); g.add(glass);
  const cols = [0xff6a65,0xf2d466,0x67b8ff,0x74d286,0xc88cff];
  cols.forEach((c,i)=>{
    const p = box(0.07,0.18,0.02,new THREE.MeshStandardMaterial({ color:c, roughness:0.45 }));
    p.position.set(-0.18 + i*0.09,0.95,0.29); g.add(p);
  });
  const slot = box(0.3,0.08,0.05, materials.black); slot.position.set(0,0.58,0.29); g.add(slot);
  const glow = new THREE.PointLight(0xe7f3ff, 1.3, 3.4, 2.2); glow.position.set(0, 1.2, 0.28); g.add(glow);
  return g;
}

function buildPhoneBooth() {
  const g = new THREE.Group();
  const shell = box(0.86, 2.2, 0.82, new THREE.MeshStandardMaterial({ color: 0xc9d8e6, roughness: 0.44 })); shell.position.set(0, 1.1, 0); g.add(shell);
  const glass = box(0.56, 1.54, 0.02, materials.glass); glass.position.set(0, 1.15, 0.41); g.add(glass);
  const phone = box(0.2, 0.32, 0.08, materials.darkMetal); phone.position.set(0, 1.1, 0.08); g.add(phone);
  return g;
}

function buildBulletinBoard() {
  const g = new THREE.Group();
  const board = box(1.1, 1.3, 0.12, new THREE.MeshStandardMaterial({ color: 0x757d87, roughness: 0.64 })); board.position.set(0, 1.2, 0); g.add(board);
  const face = plane(0.92, 1.04, new THREE.MeshBasicMaterial({ color: 0xf4ece1 })); face.position.set(0, 0, 0.07); board.add(face);
  const strip1 = box(0.82, 0.08, 0.02, new THREE.MeshStandardMaterial({ color: 0xd15f5a })); strip1.position.set(0, 0.32, 0.08); board.add(strip1);
  const strip2 = box(0.6, 0.06, 0.02, new THREE.MeshStandardMaterial({ color: 0x6d88c6 })); strip2.position.set(0, 0.08, 0.08); board.add(strip2);
  const poleL = box(0.08, 1.6, 0.08, materials.darkMetal); poleL.position.set(-0.38, 0.7, 0); g.add(poleL);
  const poleR = box(0.08, 1.6, 0.08, materials.darkMetal); poleR.position.set(0.38, 0.7, 0); g.add(poleR);
  return g;
}

function buildClosedShop() {
  const g = new THREE.Group();
  const body = box(2.5, 2.45, 2.1, new THREE.MeshStandardMaterial({ color: 0xc9cbc4, roughness: 0.82 })); body.position.set(0, 1.22, 0); g.add(body);
  const shutter = box(1.86, 1.54, 0.1, new THREE.MeshStandardMaterial({ color: 0x6c737c, roughness: 0.75 })); shutter.position.set(0, 0.92, 1.06); g.add(shutter);
  const roof = box(2.8, 0.18, 2.3, new THREE.MeshStandardMaterial({ color: 0x7b6f65, roughness: 0.82 })); roof.position.set(0, 2.43, 0); g.add(roof);
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

  const storeFill = new THREE.PointLight(0xfafcff, 4.9, 12, 2.0); storeFill.position.set(0, 2.7, 2.8); scene.add(storeFill);
  const insideA = new THREE.PointLight(0xf7fbff, 2.8, 8.0, 2.0); insideA.position.set(-1.8, 3.2, 0); scene.add(insideA);
  const insideB = new THREE.PointLight(0xf7fbff, 2.8, 8.0, 2.0); insideB.position.set(2.0, 3.2, -1.7); scene.add(insideB);

  const skyGeo = new THREE.SphereGeometry(70, 18, 18);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: {
      topColor: { value: new THREE.Color(0x112955) },
      bottomColor: { value: new THREE.Color(0x09111d) },
      offset: { value: 18 },
      exponent: { value: 0.75 }
    },
    vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 worldPosition = modelMatrix * vec4(position, 1.0); vWorldPosition = worldPosition.xyz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 topColor; uniform vec3 bottomColor; uniform float offset; uniform float exponent; varying vec3 vWorldPosition; void main(){ float h = normalize(vWorldPosition + offset).y; float f = max(pow(max(h, 0.0), exponent), 0.0); gl_FragColor = vec4(mix(bottomColor, topColor, f), 1.0); }`
  });
  const sky = new THREE.Mesh(skyGeo, skyMat); scene.add(sky);

  const mountainMat = new THREE.MeshBasicMaterial({ color: 0x111820 });
  [[-12, 2.1, -18, 16, 5.0], [6, 2.4, -20, 20, 6.2], [18, 1.8, -15, 12, 4.2]].forEach(([x,y,z,wid,hei]) => {
    const shape = new THREE.Shape();
    shape.moveTo(-wid/2, 0); shape.lineTo(-wid*0.25, hei*0.7); shape.lineTo(0, hei); shape.lineTo(wid*0.22, hei*0.62); shape.lineTo(wid/2, 0); shape.lineTo(-wid/2,0);
    const geo = new THREE.ShapeGeometry(shape);
    const mesh = new THREE.Mesh(geo, mountainMat);
    mesh.position.set(x, 0.1, z);
    scene.add(mesh);
    mesh.rotation.y = 0.02;
  });

  const stars = new THREE.BufferGeometry();
  const starCount = 80;
  const pts = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const x = (Math.random() - 0.5) * 44;
    const y = 8 + Math.random() * 10;
    const z = -12 - Math.random() * 34;
    pts[i*3] = x; pts[i*3+1] = y; pts[i*3+2] = z;
  }
  stars.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xf8fbff, size: 0.06, transparent: true, opacity: 0.6 });
  scene.add(new THREE.Points(stars, starMat));
}

buildGround();
buildStore();
buildExteriorDetails();
addMountainsAndSky();

camera.position.copy(player.position);
camera.rotation.order = 'YXZ';

function resize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
}
window.addEventListener('resize', resize, { passive: true });

function isUiTarget(target) {
  return !!target.closest('.ui-hit, #menu-panel');
}

let joyRect = null;
function refreshJoyRect() { joyRect = joystickBase.getBoundingClientRect(); }
refreshJoyRect();
window.addEventListener('resize', refreshJoyRect, { passive: true });

joystickBase.addEventListener('pointerdown', (e) => {
  e.preventDefault(); e.stopPropagation();
  state.joy.active = true; state.joy.id = e.pointerId;
  refreshJoyRect();
  joystickBase.setPointerCapture(e.pointerId);
  updateJoystick(e.clientX, e.clientY);
}, { passive: false });
joystickBase.addEventListener('pointermove', (e) => {
  if (!state.joy.active || e.pointerId !== state.joy.id) return;
  e.preventDefault();
  updateJoystick(e.clientX, e.clientY);
}, { passive: false });
function endJoy(e) {
  if (!state.joy.active || e.pointerId !== state.joy.id) return;
  state.joy.active = false; state.joy.id = null;
  state.joy.x = 0; state.joy.y = 0;
  joystickKnob.style.transform = 'translate(0px, 0px)';
}
joystickBase.addEventListener('pointerup', endJoy);
joystickBase.addEventListener('pointercancel', endJoy);

function updateJoystick(clientX, clientY) {
  const cx = joyRect.left + joyRect.width / 2;
  const cy = joyRect.top + joyRect.height / 2;
  let dx = clientX - cx;
  let dy = clientY - cy;
  const max = joyRect.width * 0.28;
  const len = Math.hypot(dx, dy) || 1;
  if (len > max) { dx = dx / len * max; dy = dy / len * max; }
  state.joy.x = dx / max;
  state.joy.y = dy / max;
  joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
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
  lookState.active = true;
  lookState.id = e.pointerId;
  lookState.x = e.clientX;
  lookState.y = e.clientY;
  dragZone.setPointerCapture(e.pointerId);
}, { passive: false });

dragZone.addEventListener('pointermove', (e) => {
  if (!lookState.active || e.pointerId !== lookState.id) return;
  e.preventDefault();
  const dx = e.clientX - lookState.x;
  const dy = e.clientY - lookState.y;
  lookState.x = e.clientX;
  lookState.y = e.clientY;
  const sens = state.sensitivities[state.sensitivityIndex];
  state.yaw -= dx * sens;
  state.pitch -= dy * sens * 0.78;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.46, 0.32);
}, { passive: false });
function endLook(e) {
  if (!lookState.active || e.pointerId !== lookState.id) return;
  lookState.active = false;
  lookState.id = null;
}
dragZone.addEventListener('pointerup', endLook);
dragZone.addEventListener('pointercancel', endLook);

document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => {
  if (e.target.closest('#app')) e.preventDefault();
}, { passive: false });

function colliderHit(pos) {
  for (const c of colliders) {
    const b = c.box;
    if (
      pos.x > b.min.x - player.radius &&
      pos.x < b.max.x + player.radius &&
      pos.z > b.min.z - player.radius &&
      pos.z < b.max.z + player.radius &&
      pos.y > b.min.y - 0.1 && pos.y < b.max.y + 3.0
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
    if (dot < 0.68) continue;
    if (!best || dist < best.dist) best = { item, dist };
  }
  return best ? best.item : null;
}

function updateInteractUi() {
  currentInteractable = nearestInteractable();
  if (!currentInteractable) {
    interactBtn.disabled = true;
    interactBtn.textContent = '調べる';
    setPrompt('');
    return;
  }
  interactBtn.disabled = false;
  const label = typeof currentInteractable.label === 'function' ? currentInteractable.label() : currentInteractable.label;
  interactBtn.textContent = '調べる';
  setPrompt(`調べる: ${label}`);
}

function animateDoor(dt) {
  const speed = 2.6 * dt;
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
  const joyX = state.joy.x;
  const joyY = state.joy.y;
  const mag = Math.hypot(joyX, joyY);
  let moving = false;
  if (mag > 0.08) {
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
    moving = true;
    walkTime += dt * (state.run ? 11.5 : 7.8);
  }

  const bobOffset = moving && state.bob ? Math.sin(walkTime) * 0.018 : 0;
  player.position.y = 1.68 + bobOffset;

  updateCamera();
  animateDoor(dt);
  updateInteractUi();

  if (performance.now() > state.infoFadeAt) {
    topPanel.classList.add('faded');
    hint.classList.add('faded');
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

showToast('右半分ドラッグで視点移動。UIの上ではなく何もない場所を触ると確実です', 2600);
updateCamera();
requestAnimationFrame(tick);
