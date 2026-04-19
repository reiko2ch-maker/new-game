import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const app = document.getElementById('app');
const canvas = document.getElementById('game');
const hintEl = document.getElementById('interactionHint');
const toastEl = document.getElementById('toast');
const introCard = document.getElementById('introCard');
const startButton = document.getElementById('startButton');
const scanlineLayer = document.getElementById('scanlineLayer');
const scanlineToggle = document.getElementById('scanlineToggle');
const runButton = document.getElementById('runButton');
const interactButton = document.getElementById('interactButton');
const joystickBase = document.getElementById('joystickBase');
const joystickKnob = document.getElementById('joystickKnob');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
renderer.shadowMap.enabled = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05070b);
scene.fog = new THREE.Fog(0x09101a, 16, 72);

const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 150);
const listener = new THREE.AudioListener();
camera.add(listener);

const world = new THREE.Group();
scene.add(world);

const colliders = [];
const interactables = [];
const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const centerNDC = new THREE.Vector2(0, 0);

const state = {
  started: false,
  scanlines: true,
  yaw: Math.PI,
  pitch: -0.04,
  player: new THREE.Vector3(0, 1.62, 19),
  velocity: new THREE.Vector3(),
  joystick: new THREE.Vector2(),
  lookDelta: new THREE.Vector2(),
  moveSpeed: 3.15,
  runMultiplier: 1.42,
  isRunning: false,
  bob: 0,
  doorOpen: 0,
  hintDefault: '左で移動、右側ドラッグで視点移動。売店に入って感触を確認。',
  currentTarget: null,
  toastTimer: 0,
};

const pointerState = {
  joystickId: null,
  lookId: null,
  lookLastX: 0,
  lookLastY: 0,
};

const keyState = {};

function setAppHeight() {
  const h = window.innerHeight;
  document.documentElement.style.setProperty('--app-height', `${h}px`);
  renderer.setSize(window.innerWidth, h, false);
  camera.aspect = window.innerWidth / h;
  camera.updateProjectionMatrix();
}

window.addEventListener('resize', setAppHeight);
window.addEventListener('orientationchange', () => setTimeout(setAppHeight, 120));
setAppHeight();

function showToast(text, duration = 2.4) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  state.toastTimer = duration;
}

function hideToast() {
  toastEl.classList.remove('show');
}

function setHint(text) {
  hintEl.textContent = text;
}

function addCollider(x, z, width, depth) {
  colliders.push({
    minX: x - width / 2,
    maxX: x + width / 2,
    minZ: z - depth / 2,
    maxZ: z + depth / 2,
  });
}

function createCanvasTexture({ width = 512, height = 256, draw }) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d');
  draw(ctx, width, height);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextSign(text, width = 4.6, height = 1.08) {
  const texture = createCanvasTexture({
    width: 1024,
    height: 256,
    draw(ctx, w, h) {
      ctx.fillStyle = '#1e9a66';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 6);
    },
  });
  const mat = new THREE.MeshBasicMaterial({ map: texture });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), mat);
}

function createCRTText(text) {
  const texture = createCanvasTexture({
    width: 512,
    height: 512,
    draw(ctx, w, h) {
      ctx.fillStyle = '#080607';
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createRadialGradient(w * 0.5, h * 0.42, 20, w * 0.5, h * 0.42, 280);
      grad.addColorStop(0, 'rgba(255, 176, 87, 0.9)');
      grad.addColorStop(1, 'rgba(255, 122, 22, 0.04)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffb15a';
      ctx.shadowColor = '#ff7b1c';
      ctx.shadowBlur = 18;
      ctx.font = 'bold 54px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const lines = text.split('\n');
      lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 70));
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      for (let y = 0; y < h; y += 4) ctx.fillRect(0, y, w, 1);
    },
  });
  return texture;
}

function makeBox(w, h, d, color, roughness = 0.9, metalness = 0.05) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness })
  );
}

function addInteractable({ object, label, hint, onInteract }) {
  object.userData.interactable = { label, hint, onInteract };
  interactables.push(object);
}

function buildEnvironment() {
  const hemi = new THREE.HemisphereLight(0x89a9ff, 0x0f1015, 0.68);
  hemi.position.set(0, 20, 0);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x7897d8, 0.36);
  moon.position.set(8, 16, 12);
  scene.add(moon);

  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.2, 24),
    new THREE.MeshBasicMaterial({ color: 0xf6c468, transparent: true, opacity: 0.9 })
  );
  moonDisc.position.set(0, 17, -28);
  scene.add(moonDisc);

  const starsGeo = new THREE.BufferGeometry();
  const starCount = 180;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 120;
    starPos[i * 3 + 1] = 10 + Math.random() * 18;
    starPos[i * 3 + 2] = -10 - Math.random() * 100;
  }
  starsGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(
    starsGeo,
    new THREE.PointsMaterial({ color: 0xbfd6ff, size: 0.12, transparent: true, opacity: 0.8 })
  );
  scene.add(stars);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(180, 180, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x111419, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);

  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 90),
    new THREE.MeshStandardMaterial({ color: 0x2b2f34, roughness: 0.98 })
  );
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.012, 6);
  world.add(road);

  const roadLineMat = new THREE.MeshBasicMaterial({ color: 0xd0d0c6 });
  for (let i = 0; i < 14; i++) {
    const dash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 2.4), roadLineMat);
    dash.rotation.x = -Math.PI / 2;
    dash.position.set(0, 0.018, 30 - i * 6.2);
    world.add(dash);
  }

  const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x1c2a1e, roughness: 1 });
  const shoulderL = new THREE.Mesh(new THREE.PlaneGeometry(40, 120), shoulderMat);
  shoulderL.rotation.x = -Math.PI / 2;
  shoulderL.position.set(-25, 0.01, 0);
  world.add(shoulderL);

  const shoulderR = shoulderL.clone();
  shoulderR.position.x = 25;
  world.add(shoulderR);

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x324528, roughness: 1 });
  for (let i = 0; i < 110; i++) {
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6 + Math.random() * 0.7, 0.1), grassMat);
    const side = i % 2 === 0 ? -1 : 1;
    tuft.position.set(
      side * (7 + Math.random() * 18),
      0.25,
      26 - Math.random() * 84
    );
    tuft.rotation.y = Math.random() * Math.PI;
    world.add(tuft);
  }

  for (let i = 0; i < 8; i++) {
    const pole = makeBox(0.14, 7, 0.14, 0x4d565f, 0.9, 0.05);
    pole.position.set(5.7, 3.5, 26 - i * 10.5);
    world.add(pole);

    const arm = makeBox(0.9, 0.08, 0.08, 0x59636d);
    arm.position.set(6.1, 6.2, 26 - i * 10.5);
    world.add(arm);

    const lamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.18, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xfff1d3 })
    );
    lamp.position.set(6.5, 6.15, 26 - i * 10.5);
    world.add(lamp);

    const lampLight = new THREE.PointLight(0xbfd7ff, 0.22, 10, 2);
    lampLight.position.set(6.5, 5.9, 26 - i * 10.5);
    scene.add(lampLight);
  }

  buildStore();
}

let doorLeft;
let doorRight;
let doorLight;
let counterLight;
let shelfHit;
let fridgeHit;
let counterHit;
let crtHit;

function buildStore() {
  const store = new THREE.Group();
  store.position.set(0, 0, 0);
  world.add(store);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc4b8a7, roughness: 0.96 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xaa9b8a, roughness: 1 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd6d2ca, roughness: 0.65, metalness: 0.06 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x4c555f, roughness: 0.85 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd4d1c5, roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xd9f0ff, roughness: 0.08, metalness: 0.02, transparent: true, opacity: 0.18 });

  const base = makeBox(12.4, 0.34, 10.4, 0x62676e, 0.9, 0.03);
  base.position.set(0, 0.17, 0);
  store.add(base);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(12, 0.12, 10), floorMat);
  floor.position.set(0, 0.34, 0);
  store.add(floor);

  const roof = makeBox(12.8, 0.32, 10.8, 0x59626c, 0.88, 0.04);
  roof.position.set(0, 4.52, 0);
  store.add(roof);

  const frontBandWhite = makeBox(12.4, 0.4, 0.18, 0xffffff, 0.7, 0.05);
  frontBandWhite.position.set(0, 3.92, 5.08);
  store.add(frontBandWhite);

  const frontBandGreen = makeBox(12.2, 0.56, 0.16, 0x26a96e, 0.68, 0.05);
  frontBandGreen.position.set(0, 3.4, 5.06);
  store.add(frontBandGreen);

  const frontBandOrange = makeBox(12.2, 0.14, 0.16, 0xf6b330, 0.68, 0.05);
  frontBandOrange.position.set(0, 3.76, 5.07);
  store.add(frontBandOrange);

  const frontBandRed = makeBox(12.2, 0.14, 0.16, 0xe75445, 0.68, 0.05);
  frontBandRed.position.set(0, 3.03, 5.07);
  store.add(frontBandRed);

  const sign = createTextSign('こもれびマート');
  sign.position.set(0, 3.4, 5.16);
  store.add(sign);

  const backWall = makeBox(12, 4, 0.22, 0xc8bbab, 0.97, 0.03);
  backWall.position.set(0, 2.32, -5);
  store.add(backWall);
  addCollider(0, -5, 12, 0.42);

  const leftWall = makeBox(0.22, 4, 10, 0xc8bbab, 0.97, 0.03);
  leftWall.position.set(-6, 2.32, 0);
  store.add(leftWall);
  addCollider(-6, 0, 0.42, 10);

  const rightWall = makeBox(0.22, 4, 10, 0xc8bbab, 0.97, 0.03);
  rightWall.position.set(6, 2.32, 0);
  store.add(rightWall);
  addCollider(6, 0, 0.42, 10);

  const frontLeftWall = makeBox(4.4, 4, 0.22, 0xc8bbab, 0.97, 0.03);
  frontLeftWall.position.set(-3.8, 2.32, 5);
  store.add(frontLeftWall);
  addCollider(-3.8, 5, 4.4, 0.42);

  const frontRightWall = makeBox(4.4, 4, 0.22, 0xc8bbab, 0.97, 0.03);
  frontRightWall.position.set(3.8, 2.32, 5);
  store.add(frontRightWall);
  addCollider(3.8, 5, 4.4, 0.42);

  const frontHeader = makeBox(3.2, 1.28, 0.22, 0xd6d1ca, 0.84, 0.04);
  frontHeader.position.set(0, 3.36, 5);
  store.add(frontHeader);

  const frontWindowL = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.2), glassMat);
  frontWindowL.position.set(-3.8, 1.9, 4.9);
  store.add(frontWindowL);

  const frontWindowR = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 2.2), glassMat);
  frontWindowR.position.set(3.8, 1.9, 4.9);
  store.add(frontWindowR);

  const doorFrameTop = makeBox(2.1, 0.14, 0.18, 0xe7e4df, 0.7, 0.03);
  doorFrameTop.position.set(0, 2.58, 4.96);
  store.add(doorFrameTop);

  const doorFrameL = makeBox(0.08, 2.26, 0.18, 0xe7e4df, 0.7, 0.03);
  doorFrameL.position.set(-1.04, 1.44, 4.96);
  store.add(doorFrameL);

  const doorFrameR = makeBox(0.08, 2.26, 0.18, 0xe7e4df, 0.7, 0.03);
  doorFrameR.position.set(1.04, 1.44, 4.96);
  store.add(doorFrameR);

  doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.22, 0.05), glassMat);
  doorLeft.position.set(-0.46, 1.44, 4.93);
  store.add(doorLeft);

  doorRight = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.22, 0.05), glassMat);
  doorRight.position.set(0.46, 1.44, 4.93);
  store.add(doorRight);

  doorLight = new THREE.PointLight(0xffffff, 1.1, 8, 2);
  doorLight.position.set(0, 2.7, 4.3);
  scene.add(doorLight);

  const stripeWallGeo = new THREE.BoxGeometry(0.03, 4, 10.02);
  for (let i = -5.5; i <= 5.5; i += 0.6) {
    const s1 = new THREE.Mesh(stripeWallGeo, stripeMat);
    s1.position.set(-5.84, 2.32, i * 0.91);
    s1.rotation.y = Math.PI / 2;
    store.add(s1);

    const s2 = s1.clone();
    s2.position.x = 5.84;
    store.add(s2);

    const s3 = new THREE.Mesh(new THREE.BoxGeometry(12.02, 4, 0.03), stripeMat);
    s3.position.set(i, 2.32, -4.84);
    store.add(s3);
  }

  const interiorCeiling = makeBox(11.8, 0.06, 9.8, 0xdfe2e4, 0.96, 0.02);
  interiorCeiling.position.set(0, 4.08, 0);
  store.add(interiorCeiling);

  const ceilingLampMat = new THREE.MeshBasicMaterial({ color: 0xfffff3 });
  for (let z = -2.8; z <= 2.5; z += 2.2) {
    const lamp1 = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.06, 0.3), ceilingLampMat);
    lamp1.position.set(-2.2, 3.98, z);
    store.add(lamp1);

    const lamp2 = lamp1.clone();
    lamp2.position.x = 2.2;
    store.add(lamp2);

    const ceilingLightA = new THREE.PointLight(0xf6f5ee, 1.2, 14, 1.8);
    ceilingLightA.position.set(-2.2, 3.6, z);
    scene.add(ceilingLightA);

    const ceilingLightB = new THREE.PointLight(0xf6f5ee, 1.2, 14, 1.8);
    ceilingLightB.position.set(2.2, 3.6, z);
    scene.add(ceilingLightB);
  }

  // Fridge bank
  const fridgeBodyMat = new THREE.MeshStandardMaterial({ color: 0xe8eef3, roughness: 0.78, metalness: 0.02 });
  const fridgeGlassMat = new THREE.MeshStandardMaterial({ color: 0xcde8ff, roughness: 0.08, transparent: true, opacity: 0.2 });
  const fridgeGroup = new THREE.Group();
  fridgeGroup.position.set(-4.3, 0.7, -0.8);
  store.add(fridgeGroup);

  for (let i = 0; i < 3; i++) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.7, 0.9), fridgeBodyMat);
    body.position.set(i * 1.24, 0.65, 0);
    fridgeGroup.add(body);

    const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.18), fridgeGlassMat);
    doorGlass.position.set(i * 1.24, 0.65, 0.46);
    fridgeGroup.add(doorGlass);

    for (let s = 0; s < 4; s++) {
      const shelf = makeBox(0.88, 0.04, 0.72, 0xdbe1e6, 0.75, 0.04);
      shelf.position.set(i * 1.24, -0.24 + s * 0.56, -0.02);
      fridgeGroup.add(shelf);
    }

    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 0.28, 8),
          new THREE.MeshStandardMaterial({ color: [0xe7f2ff, 0xfff2c6, 0xffdccb, 0xdfeedd, 0xc9d9ff][(i + r + c) % 5], roughness: 0.65 })
        );
        bottle.position.set(i * 1.24 - 0.25 + c * 0.25, -0.38 + r * 0.58, 0.08);
        fridgeGroup.add(bottle);
      }
    }
  }

  const fridgeGlow = new THREE.PointLight(0xc7e5ff, 1.4, 8, 1.7);
  fridgeGlow.position.set(1.2, 1.5, 0.3);
  fridgeGroup.add(fridgeGlow);

  fridgeHit = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 2.7, 1.05),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 })
  );
  fridgeHit.position.set(1.2, 0.65, 0.02);
  fridgeGroup.add(fridgeHit);
  addInteractable({
    object: fridgeHit,
    label: '冷蔵庫',
    hint: '調べる: 冷蔵庫',
    onInteract: () => showToast('冷気が腕にまとわりつく。ラベルの色だけ妙に鮮やかだ。'),
  });
  addCollider(-3.1, -0.8, 4.4, 1.15);

  // Center shelf
  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(0.2, 0.68, -0.55);
  store.add(shelfGroup);

  const shelfFrameMat = new THREE.MeshStandardMaterial({ color: 0x54585d, roughness: 0.9 });
  const shelfTrayMat = new THREE.MeshStandardMaterial({ color: 0xc9c8c3, roughness: 0.95 });
  const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.8, 0.88), shelfFrameMat);
  shelfBody.position.y = 0.25;
  shelfGroup.add(shelfBody);

  for (let s = 0; s < 4; s++) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.06, 0.82), shelfTrayMat);
    tray.position.set(0, -0.54 + s * 0.48, 0);
    shelfGroup.add(tray);
    for (let i = 0; i < 10; i++) {
      const item = makeBox(0.14, 0.2 + Math.random() * 0.12, 0.16, [0xbb5062, 0x6c7fd0, 0xecc177, 0x8ab383, 0xb07ad9][i % 5], 0.86, 0.02);
      item.position.set(-0.82 + (i % 5) * 0.42, -0.42 + s * 0.48, i < 5 ? -0.16 : 0.16);
      shelfGroup.add(item);
    }
  }

  shelfHit = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.8, 0.88), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  shelfHit.position.y = 0.25;
  shelfGroup.add(shelfHit);
  addInteractable({
    object: shelfHit,
    label: '棚',
    hint: '調べる: 棚',
    onInteract: () => showToast('菓子の袋は軽いのに、棚だけ少し湿っている。'),
  });
  addCollider(0.2, -0.55, 2.3, 1.05);

  // Mag rack near front right
  const rackGroup = new THREE.Group();
  rackGroup.position.set(4.35, 0.52, 2.1);
  store.add(rackGroup);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.48), shelfFrameMat);
  rack.position.y = 0.2;
  rackGroup.add(rack);
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 4; col++) {
      const mag = makeBox(0.2, 0.26, 0.03, [0xe9b1b0, 0xd9d8b4, 0xb8d0ec, 0xf0c878][(row + col) % 4], 0.8, 0.02);
      mag.position.set(-0.3 + col * 0.2, -0.18 + row * 0.36, 0.25);
      mag.rotation.x = -0.3;
      rackGroup.add(mag);
    }
  }
  addCollider(4.35, 2.1, 1.3, 0.66);

  // Counter + CRT
  const counterGroup = new THREE.Group();
  counterGroup.position.set(2.75, 0.78, 1.9);
  store.add(counterGroup);

  const counterFront = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.56, 1.2), new THREE.MeshStandardMaterial({ color: 0x747878, roughness: 0.94 }));
  counterGroup.add(counterFront);

  const counterTop = makeBox(3.5, 0.08, 1.34, 0xdad9d3, 0.92, 0.04);
  counterTop.position.y = 0.82;
  counterGroup.add(counterTop);

  const register = makeBox(0.42, 0.3, 0.52, 0x676d73, 0.78, 0.04);
  register.position.set(0.78, 1.02, -0.06);
  counterGroup.add(register);

  const clockBox = makeBox(0.52, 0.18, 0.28, 0x20262a, 0.6, 0.2);
  clockBox.position.set(1.05, 1.02, -0.42);
  counterGroup.add(clockBox);
  const clockText = createCanvasTexture({
    width: 512,
    height: 256,
    draw(ctx, w, h) {
      ctx.fillStyle = '#08100a';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#6dd781';
      ctx.shadowColor = '#3fe364';
      ctx.shadowBlur = 15;
      ctx.font = 'bold 126px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('22:46', w / 2, h / 2 + 4);
    },
  });
  const clockScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.14), new THREE.MeshBasicMaterial({ map: clockText }));
  clockScreen.position.set(1.05, 1.02, -0.27);
  counterGroup.add(clockScreen);

  const crtBody = makeBox(0.86, 0.7, 0.76, 0x31383f, 0.76, 0.05);
  crtBody.position.set(0.18, 1.17, -0.16);
  counterGroup.add(crtBody);
  const crtScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.34),
    new THREE.MeshBasicMaterial({ map: createCRTText('THANK YOU\nFOR COMING.') })
  );
  crtScreen.position.set(0.18, 1.18, 0.24);
  counterGroup.add(crtScreen);

  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.06, 0.22, 16), new THREE.MeshStandardMaterial({ color: 0xe5dcc7, roughness: 0.72 }));
  cup.position.set(-1.08, 0.98, 0.04);
  counterGroup.add(cup);
  for (let i = 0; i < 3; i++) {
    const pencil = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 6), new THREE.MeshStandardMaterial({ color: [0xd8aa44, 0xe2d1a8, 0xb46a42][i], roughness: 0.7 }));
    pencil.position.set(-1.1 + i * 0.04, 1.08, 0.02 + i * 0.02);
    pencil.rotation.z = -0.26 + i * 0.15;
    counterGroup.add(pencil);
  }

  counterLight = new THREE.PointLight(0xffd9b2, 0.65, 6, 2);
  counterLight.position.set(0.28, 1.4, 0.18);
  counterGroup.add(counterLight);

  counterHit = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 1.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  counterHit.position.set(0, 0.25, 0.02);
  counterGroup.add(counterHit);
  addInteractable({
    object: counterHit,
    label: 'レジ',
    hint: '調べる: レジ',
    onInteract: () => showToast('レジ横の時計は22:46で止まっている。秒だけ進んでいない。'),
  });

  crtHit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.85), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  crtHit.position.set(0.18, 1.17, -0.16);
  counterGroup.add(crtHit);
  addInteractable({
    object: crtHit,
    label: 'CRT',
    hint: '調べる: CRT',
    onInteract: () => showToast('オレンジ色の文字が焼き付いている。電源コードは見当たらない。'),
  });
  addCollider(2.75, 1.9, 3.7, 1.7);

  // Interior back desk silhouette
  const backDesk = makeBox(1.6, 0.86, 0.82, 0x6a7070, 0.92, 0.03);
  backDesk.position.set(4.3, 0.76, -1.8);
  store.add(backDesk);
  addCollider(4.3, -1.8, 1.9, 1.06);

  // Parking blocks + bench outside
  for (let i = -2; i <= 2; i += 2) {
    const block = makeBox(1.08, 0.15, 0.34, 0xafb4bb, 0.88, 0.03);
    block.position.set(i * 1.8, 0.08, 8.15);
    world.add(block);
  }

  const bench = makeBox(1.7, 0.24, 0.36, 0x838b8a, 0.86, 0.04);
  bench.position.set(-4.8, 0.42, 8.5);
  world.add(bench);
  addCollider(-4.8, 8.5, 1.9, 0.58);

  const bin = makeBox(0.46, 0.8, 0.46, 0x7a817f, 0.9, 0.03);
  bin.position.set(4.8, 0.4, 8.1);
  world.add(bin);
  addCollider(4.8, 8.1, 0.66, 0.66);

  addCollider(-8.4, 0, 0.4, 120);
  addCollider(8.4, 0, 0.4, 120);
}

buildEnvironment();

function applyCamera() {
  const bobOffset = Math.sin(state.bob) * Math.min(state.velocity.length() * 0.005, 0.018);
  camera.position.set(state.player.x, state.player.y + bobOffset, state.player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}
applyCamera();

function updateDoor(dt) {
  const dx = state.player.x;
  const dz = state.player.z - 5;
  const nearDoor = Math.abs(dx) < 1.7 && Math.abs(dz) < 3.2;
  const target = nearDoor ? 1 : 0;
  const speed = nearDoor ? 4.8 : 2.8;
  state.doorOpen += (target - state.doorOpen) * Math.min(1, dt * speed);
  if (doorLeft && doorRight) {
    doorLeft.position.x = -0.46 - state.doorOpen * 0.48;
    doorRight.position.x = 0.46 + state.doorOpen * 0.48;
  }
  if (doorLight) doorLight.intensity = 1.05 + state.doorOpen * 0.18;
}

function getForward() {
  return new THREE.Vector3(Math.sin(state.yaw), 0, Math.cos(state.yaw)).normalize();
}

function getRight() {
  return new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).normalize();
}

function circleRectCollision(x, z, radius, rect) {
  const cx = Math.max(rect.minX, Math.min(x, rect.maxX));
  const cz = Math.max(rect.minZ, Math.min(z, rect.maxZ));
  const dx = x - cx;
  const dz = z - cz;
  return dx * dx + dz * dz < radius * radius;
}

function resolveMovement(nextX, nextZ, radius) {
  let x = nextX;
  let z = nextZ;

  for (const rect of colliders) {
    if (circleRectCollision(x, state.player.z, radius, rect)) {
      x = state.player.x;
      break;
    }
  }

  for (const rect of colliders) {
    if (circleRectCollision(x, z, radius, rect)) {
      z = state.player.z;
      break;
    }
  }

  x = THREE.MathUtils.clamp(x, -7.9, 7.9);
  z = THREE.MathUtils.clamp(z, -44, 32);
  return { x, z };
}

function updatePlayer(dt) {
  const forward = getForward();
  const right = getRight();

  const keyMoveX = (keyState['KeyD'] ? 1 : 0) - (keyState['KeyA'] ? 1 : 0);
  const keyMoveY = (keyState['KeyW'] ? 1 : 0) - (keyState['KeyS'] ? 1 : 0);

  const moveInput = new THREE.Vector2(state.joystick.x + keyMoveX, state.joystick.y + keyMoveY);
  if (moveInput.lengthSq() > 1) moveInput.normalize();

  const desiredDir = new THREE.Vector3();
  desiredDir.addScaledVector(right, moveInput.x);
  desiredDir.addScaledVector(forward, moveInput.y);
  if (desiredDir.lengthSq() > 0) desiredDir.normalize();

  const targetSpeed = state.moveSpeed * (state.isRunning || keyState['ShiftLeft'] ? state.runMultiplier : 1);
  const accel = desiredDir.lengthSq() > 0 ? 16 : 12;

  const desiredVelX = desiredDir.x * targetSpeed;
  const desiredVelZ = desiredDir.z * targetSpeed;
  state.velocity.x = THREE.MathUtils.damp(state.velocity.x, desiredVelX, accel, dt);
  state.velocity.z = THREE.MathUtils.damp(state.velocity.z, desiredVelZ, accel, dt);

  const nextX = state.player.x + state.velocity.x * dt;
  const nextZ = state.player.z + state.velocity.z * dt;
  const resolved = resolveMovement(nextX, nextZ, 0.32);
  state.player.x = resolved.x;
  state.player.z = resolved.z;

  const speed = Math.hypot(state.velocity.x, state.velocity.z);
  state.bob += dt * (3 + speed * 2.4);
}

function updateLook(dt) {
  const smooth = 1 - Math.exp(-dt * 18);
  state.yaw += state.lookDelta.x * smooth;
  state.pitch += state.lookDelta.y * smooth;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.52, 0.35);
  state.lookDelta.multiplyScalar(1 - smooth);
}

function updateInteractTarget() {
  raycaster.setFromCamera(centerNDC, camera);
  const hits = raycaster.intersectObjects(interactables, false);
  const hit = hits.find((h) => h.distance < 4.6);
  if (hit) {
    const info = hit.object.userData.interactable;
    state.currentTarget = info;
    setHint(info.hint);
  } else {
    state.currentTarget = null;
    if (state.player.z > 8.5) setHint('左で移動、右側ドラッグで視点移動。店へ近づくと自動ドアが開く。');
    else if (state.player.z > 4.4) setHint('蛍光灯の白さと外の青さの境目が気持ち悪い。');
    else if (state.player.z > -0.5) setHint('棚や冷蔵庫、レジを正面に入れて「調べる」で触感を確認。');
    else setHint(state.hintDefault);
  }
}

function interact() {
  if (!state.started) return;
  if (state.currentTarget?.onInteract) {
    state.currentTarget.onInteract();
  } else if (state.player.z > 4.2 && Math.abs(state.player.x) < 1.6) {
    showToast('自動ドアが静かに横へ逃げる。これくらいの開き速度が一番触りやすい。');
  } else {
    showToast('今はここに触れるものはない。', 1.4);
  }
}

function animate() {
  const dt = Math.min(clock.getDelta(), 0.033);

  if (state.started) {
    updateLook(dt);
    updatePlayer(dt);
    updateDoor(dt);
    applyCamera();
    updateInteractTarget();

    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) hideToast();
    }
  }

  if (counterLight) counterLight.intensity = 0.58 + Math.sin(performance.now() * 0.0023) * 0.04;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

function resetJoystick() {
  state.joystick.set(0, 0);
  joystickKnob.style.transform = 'translate(0px, 0px)';
}

function beginLook(pointer) {
  pointerState.lookId = pointer.pointerId;
  pointerState.lookLastX = pointer.clientX;
  pointerState.lookLastY = pointer.clientY;
}

function pointerOverControl(target) {
  return joystickBase.contains(target) || runButton.contains(target) || interactButton.contains(target) || scanlineToggle.contains(target);
}

joystickBase.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  pointerState.joystickId = e.pointerId;
  joystickBase.setPointerCapture(e.pointerId);
  const rect = joystickBase.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const maxR = rect.width * 0.31;
  const dx = e.clientX - cx;
  const dy = e.clientY - cy;
  const len = Math.min(Math.hypot(dx, dy), maxR);
  const angle = Math.atan2(dy, dx);
  const nx = Math.cos(angle) * len;
  const ny = Math.sin(angle) * len;
  state.joystick.set(nx / maxR, -ny / maxR);
  joystickKnob.style.transform = `translate(${nx}px, ${ny}px)`;
});

window.addEventListener('pointermove', (e) => {
  if (pointerState.joystickId === e.pointerId) {
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.31;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const angle = Math.atan2(dy, dx);
    const len = Math.min(Math.hypot(dx, dy), maxR);
    const nx = Math.cos(angle) * len;
    const ny = Math.sin(angle) * len;
    state.joystick.set(nx / maxR, -ny / maxR);
    joystickKnob.style.transform = `translate(${nx}px, ${ny}px)`;
  }

  if (pointerState.lookId === e.pointerId) {
    const dx = e.clientX - pointerState.lookLastX;
    const dy = e.clientY - pointerState.lookLastY;
    pointerState.lookLastX = e.clientX;
    pointerState.lookLastY = e.clientY;
    const sensitivityX = 0.0037;
    const sensitivityY = 0.0033;
    state.lookDelta.x -= dx * sensitivityX;
    state.lookDelta.y -= dy * sensitivityY;
  }
});

window.addEventListener('pointerup', (e) => {
  if (pointerState.joystickId === e.pointerId) {
    pointerState.joystickId = null;
    resetJoystick();
  }
  if (pointerState.lookId === e.pointerId) {
    pointerState.lookId = null;
  }
  if (e.pointerId === runButton.dataset.pointerId) {
    state.isRunning = false;
  }
});

window.addEventListener('pointercancel', (e) => {
  if (pointerState.joystickId === e.pointerId) {
    pointerState.joystickId = null;
    resetJoystick();
  }
  if (pointerState.lookId === e.pointerId) {
    pointerState.lookId = null;
  }
  if (String(e.pointerId) === runButton.dataset.pointerId) {
    state.isRunning = false;
  }
});

app.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  if (pointerOverControl(e.target)) return;
  if (e.clientX > window.innerWidth * 0.38 && pointerState.lookId == null) {
    beginLook(e);
  }
});

runButton.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  state.isRunning = true;
  runButton.dataset.pointerId = String(e.pointerId);
  runButton.setPointerCapture(e.pointerId);
});

runButton.addEventListener('pointerup', () => {
  state.isRunning = false;
});
runButton.addEventListener('pointercancel', () => {
  state.isRunning = false;
});

interactButton.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  interactButton.setPointerCapture(e.pointerId);
  interact();
});

scanlineToggle.addEventListener('click', () => {
  state.scanlines = !state.scanlines;
  scanlineLayer.classList.toggle('off', !state.scanlines);
  scanlineToggle.textContent = `SCANLINE: ${state.scanlines ? 'ON' : 'OFF'}`;
});

startButton.addEventListener('click', () => {
  state.started = true;
  introCard.classList.add('hidden');
  showToast('テスト開始。まずは店の外から入店までの感触を確認。', 2.6);
  setHint('左で移動、右側ドラッグで視点移動。売店に近づいてみる。');
});

window.addEventListener('keydown', (e) => {
  keyState[e.code] = true;
  if (e.code === 'KeyE') interact();
});
window.addEventListener('keyup', (e) => {
  keyState[e.code] = false;
});

canvas.addEventListener('mousedown', (e) => {
  if (!state.started) return;
  if (e.button === 0 && pointerState.lookId == null) {
    beginLook({ pointerId: -1, clientX: e.clientX, clientY: e.clientY });
  }
});
window.addEventListener('mouseup', () => {
  if (pointerState.lookId === -1) pointerState.lookId = null;
});
window.addEventListener('mousemove', (e) => {
  if (pointerState.lookId === -1) {
    const dx = e.clientX - pointerState.lookLastX;
    const dy = e.clientY - pointerState.lookLastY;
    pointerState.lookLastX = e.clientX;
    pointerState.lookLastY = e.clientY;
    state.lookDelta.x -= dx * 0.0037;
    state.lookDelta.y -= dy * 0.0033;
  }
});
