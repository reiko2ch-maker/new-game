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

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance',
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1524);
scene.fog = new THREE.Fog(0x182336, 38, 128);

const camera = new THREE.PerspectiveCamera(73, 1, 0.1, 240);
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
  pitch: -0.05,
  player: new THREE.Vector3(0, 1.62, 35),
  velocity: new THREE.Vector3(),
  joystick: new THREE.Vector2(),
  lookDelta: new THREE.Vector2(),
  moveSpeed: 3.3,
  runMultiplier: 1.45,
  isRunning: false,
  bob: 0,
  doorOpen: 0,
  hintDefault: '歩いて気持ちいい田舎町テスト。コンビニ周辺と路地の空気を確認。',
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
let doorLeft;
let doorRight;
let doorLight;
let counterLight;
let counterClockScreen;
let lastClockLabel = '';

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

function createTextSign(text, width = 4.8, height = 1.08) {
  const texture = createCanvasTexture({
    width: 1024,
    height: 256,
    draw(ctx, w, h) {
      ctx.fillStyle = '#1ea46c';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 120px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, w / 2, h / 2 + 4);
    },
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({ map: texture }));
}

function createPosterTexture(lines) {
  return createCanvasTexture({
    width: 512,
    height: 768,
    draw(ctx, w, h) {
      const palette = [
        ['#f7f3d0', '#e06d5f'],
        ['#e8f4ff', '#4d7bc9'],
        ['#fff4e5', '#e49d34'],
      ];
      const [bg, accent] = palette[Math.floor(Math.random() * palette.length)];
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = accent;
      ctx.fillRect(0, 0, w, 58);
      ctx.fillStyle = '#222';
      ctx.font = 'bold 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(lines[0], w / 2, 38);
      ctx.textAlign = 'left';
      ctx.font = '28px sans-serif';
      lines.slice(1).forEach((line, i) => ctx.fillText(line, 32, 130 + i * 68));
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
    },
  });
}

function createCRTText(text) {
  return createCanvasTexture({
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
}

function createDigitalClockTexture(text) {
  return createCanvasTexture({
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
      ctx.fillText(text, w / 2, h / 2 + 4);
    },
  });
}

function createRoadTexture() {
  const tex = createCanvasTexture({
    width: 1024,
    height: 4096,
    draw(ctx, w, h) {
      ctx.fillStyle = '#31353a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.015 + Math.random() * 0.03})`;
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = 2 + Math.random() * 6;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(17,17,17,0.35)';
      ctx.lineWidth = 4;
      for (let i = 0; i < 28; i++) {
        const y = (i / 28) * h;
        ctx.beginPath();
        ctx.moveTo(200 + Math.random() * 100, y + Math.random() * 40);
        ctx.lineTo(420 + Math.random() * 140, y + 20 + Math.random() * 80);
        ctx.lineTo(560 + Math.random() * 180, y + 50 + Math.random() * 150);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 10;
      for (let y = 180; y < h; y += 350) {
        ctx.beginPath();
        ctx.moveTo(w * 0.49, y);
        ctx.lineTo(w * 0.49, y + 120);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(70, 0);
      ctx.lineTo(70, h);
      ctx.moveTo(w - 70, 0);
      ctx.lineTo(w - 70, h);
      ctx.stroke();
    },
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

function makeBox(w, h, d, color, roughness = 0.92, metalness = 0.04) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color, roughness, metalness })
  );
}

function addInteractable({ object, label, hint, onInteract }) {
  object.userData.interactable = { label, hint, onInteract };
  interactables.push(object);
}

function addMountainSilhouette() {
  const shape = new THREE.Shape();
  shape.moveTo(-90, -4);
  shape.lineTo(-65, 8);
  shape.lineTo(-38, 2);
  shape.lineTo(-18, 14);
  shape.lineTo(8, 4);
  shape.lineTo(32, 11);
  shape.lineTo(60, 2);
  shape.lineTo(90, 9);
  shape.lineTo(90, -4);
  shape.lineTo(-90, -4);

  const geo = new THREE.ShapeGeometry(shape);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x172233 }));
  mesh.position.set(0, 7, -110);
  scene.add(mesh);

  const far = mesh.clone();
  far.material = new THREE.MeshBasicMaterial({ color: 0x121b2b });
  far.scale.set(1.25, 0.7, 1);
  far.position.set(0, 9, -130);
  scene.add(far);
}

function addStarsAndSky() {
  const hemi = new THREE.HemisphereLight(0x89b6ff, 0x172212, 0.8);
  scene.add(hemi);

  const dusk = new THREE.DirectionalLight(0xf8c177, 0.34);
  dusk.position.set(-40, 12, -90);
  scene.add(dusk);

  const moon = new THREE.DirectionalLight(0x85a6ff, 0.2);
  moon.position.set(24, 20, 16);
  scene.add(moon);

  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffc96a, transparent: true, opacity: 0.85 })
  );
  sunDisc.position.set(-10, 10.5, -102);
  scene.add(sunDisc);

  const starGeo = new THREE.BufferGeometry();
  const count = 220;
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = (Math.random() - 0.5) * 220;
    arr[i * 3 + 1] = 12 + Math.random() * 24;
    arr[i * 3 + 2] = -20 - Math.random() * 200;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd4e6ff, size: 0.14, transparent: true, opacity: 0.8 }));
  scene.add(stars);

  addMountainSilhouette();
}

function buildEnvironment() {
  addStarsAndSky();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(260, 260),
    new THREE.MeshStandardMaterial({ color: 0x24311f, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  world.add(ground);

  const farGrass = new THREE.Mesh(
    new THREE.PlaneGeometry(300, 300),
    new THREE.MeshStandardMaterial({ color: 0x2b3c24, roughness: 1, transparent: true, opacity: 0.6 })
  );
  farGrass.rotation.x = -Math.PI / 2;
  farGrass.position.y = 0.01;
  world.add(farGrass);

  const roadTexture = createRoadTexture();
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTexture, roughness: 1, color: 0xffffff });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 136), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0.015, -18);
  world.add(road);

  // plaza in front of store
  const plaza = new THREE.Mesh(
    new THREE.PlaneGeometry(22, 22),
    new THREE.MeshStandardMaterial({ color: 0x656c73, roughness: 0.95 })
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.014, 6.4);
  world.add(plaza);

  // home lane
  const homeLane = new THREE.Mesh(
    new THREE.PlaneGeometry(4.8, 18),
    new THREE.MeshStandardMaterial({ color: 0x3b4046, roughness: 0.98 })
  );
  homeLane.rotation.x = -Math.PI / 2;
  homeLane.position.set(0, 0.017, 32.5);
  world.add(homeLane);

  // left / right branch roads
  addSideRoad(-8.8, -4, 3.6, 26, Math.PI / 2);
  addSideRoad(9.2, -3, 3.4, 22, Math.PI / 2);
  addSideRoad(13.4, -22, 2.4, 15, Math.PI / 2);

  // drainage channel
  buildDrainageChannel();
  buildStore();
  buildParkingAndProps();
  buildHouses();
  buildPolesAndWires();
  buildTownProps();
  buildTreesAndGrass();
  buildBoundaryHints();
}

function addSideRoad(x, z, width, depth, rot = 0) {
  const road = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    new THREE.MeshStandardMaterial({ color: 0x383d42, roughness: 1 })
  );
  road.rotation.x = -Math.PI / 2;
  road.rotation.z = rot;
  road.position.set(x, 0.016, z);
  world.add(road);
}

function buildDrainageChannel() {
  const ditchMat = new THREE.MeshStandardMaterial({ color: 0x575e65, roughness: 0.96 });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x364f64, roughness: 0.2, metalness: 0.08, transparent: true, opacity: 0.78 });

  for (let i = 0; i < 14; i++) {
    const z = 26 - i * 7.4;
    const wallL = makeBox(0.18, 0.34, 4.6, 0x666c73, 0.95, 0.02);
    wallL.position.set(4.2, 0.17, z);
    wallL.rotation.y = Math.PI / 2;
    world.add(wallL);

    const wallR = wallL.clone();
    wallR.position.x = 5.18;
    world.add(wallR);

    const water = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 4.4), waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(4.69, 0.045, z);
    world.add(water);
  }
  addCollider(4.7, -15, 1.1, 96);
}

function buildStore() {
  const store = new THREE.Group();
  world.add(store);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xc6b6a1, roughness: 0.98 });
  const stripeMat = new THREE.MeshStandardMaterial({ color: 0xac9b88, roughness: 1 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x555d66, roughness: 0.86 });
  const floorMat = new THREE.MeshStandardMaterial({ color: 0xd8d6cd, roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xdff0ff, roughness: 0.08, metalness: 0.02, transparent: true, opacity: 0.18 });

  const base = makeBox(12.8, 0.36, 10.8, 0x646a72, 0.9, 0.03);
  base.position.set(0, 0.18, 0);
  store.add(base);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(12.2, 0.12, 10.2), floorMat);
  floor.position.set(0, 0.35, 0);
  store.add(floor);

  const roof = makeBox(13.2, 0.34, 11.2, 0x5b646d, 0.9, 0.04);
  roof.position.set(0, 4.55, 0);
  store.add(roof);

  const frontBandWhite = makeBox(12.8, 0.42, 0.18, 0xffffff, 0.72, 0.03);
  frontBandWhite.position.set(0, 3.95, 5.14);
  store.add(frontBandWhite);
  const frontBandGreen = makeBox(12.6, 0.58, 0.16, 0x26a96e, 0.68, 0.03);
  frontBandGreen.position.set(0, 3.42, 5.12);
  store.add(frontBandGreen);
  const frontBandOrange = makeBox(12.6, 0.14, 0.16, 0xf6b330, 0.68, 0.03);
  frontBandOrange.position.set(0, 3.79, 5.13);
  store.add(frontBandOrange);
  const frontBandRed = makeBox(12.6, 0.14, 0.16, 0xe75445, 0.68, 0.03);
  frontBandRed.position.set(0, 3.05, 5.13);
  store.add(frontBandRed);

  const sign = createTextSign('こもれびマート');
  sign.position.set(0, 3.42, 5.24);
  store.add(sign);

  const backWall = makeBox(12.2, 4, 0.22, 0xc9b9a5, 0.97, 0.03);
  backWall.position.set(0, 2.32, -5.05);
  store.add(backWall);
  addCollider(0, -5.05, 12.2, 0.42);

  const leftWall = makeBox(0.22, 4, 10.2, 0xc9b9a5, 0.97, 0.03);
  leftWall.position.set(-6.1, 2.32, 0);
  store.add(leftWall);
  addCollider(-6.1, 0, 0.42, 10.2);

  const rightWall = leftWall.clone();
  rightWall.position.x = 6.1;
  store.add(rightWall);
  addCollider(6.1, 0, 0.42, 10.2);

  const frontLeftWall = makeBox(4.48, 4, 0.22, 0xc9b9a5, 0.97, 0.03);
  frontLeftWall.position.set(-3.86, 2.32, 5.02);
  store.add(frontLeftWall);
  addCollider(-3.86, 5.02, 4.48, 0.42);

  const frontRightWall = frontLeftWall.clone();
  frontRightWall.position.x = 3.86;
  store.add(frontRightWall);
  addCollider(3.86, 5.02, 4.48, 0.42);

  const frontHeader = makeBox(3.16, 1.28, 0.22, 0xe2ded7, 0.84, 0.03);
  frontHeader.position.set(0, 3.36, 5.02);
  store.add(frontHeader);

  const frontWindowL = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.26), glassMat);
  frontWindowL.position.set(-3.8, 1.9, 4.92);
  store.add(frontWindowL);
  const frontWindowR = frontWindowL.clone();
  frontWindowR.position.x = 3.8;
  store.add(frontWindowR);

  // posters on windows
  const posterL = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.84), new THREE.MeshBasicMaterial({ map: createPosterTexture(['冷し', 'そうめん', 'あります']) }));
  posterL.position.set(-4.9, 1.42, 4.93);
  store.add(posterL);
  const posterR = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.0), new THREE.MeshBasicMaterial({ map: createPosterTexture(['夏祭り', '8/18', '商店前広場']) }));
  posterR.position.set(4.8, 1.56, 4.93);
  store.add(posterR);

  const doorFrameTop = makeBox(2.14, 0.14, 0.18, 0xe7e4df, 0.74, 0.03);
  doorFrameTop.position.set(0, 2.58, 4.97);
  store.add(doorFrameTop);
  const doorFrameL = makeBox(0.08, 2.26, 0.18, 0xe7e4df, 0.74, 0.03);
  doorFrameL.position.set(-1.05, 1.44, 4.97);
  store.add(doorFrameL);
  const doorFrameR = doorFrameL.clone();
  doorFrameR.position.x = 1.05;
  store.add(doorFrameR);

  doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.22, 0.05), glassMat);
  doorLeft.position.set(-0.46, 1.44, 4.94);
  store.add(doorLeft);
  doorRight = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.22, 0.05), glassMat);
  doorRight.position.set(0.46, 1.44, 4.94);
  store.add(doorRight);

  doorLight = new THREE.PointLight(0xfaf8ef, 1.22, 10, 2);
  doorLight.position.set(0, 2.74, 4.2);
  scene.add(doorLight);

  for (let i = -5.6; i <= 5.6; i += 0.62) {
    const stripeBack = new THREE.Mesh(new THREE.BoxGeometry(12.24, 4, 0.03), stripeMat);
    stripeBack.position.set(i, 2.32, -4.9);
    store.add(stripeBack);
    const stripeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 4, 10.22), stripeMat);
    stripeLeft.position.set(-5.94, 2.32, i * 0.9);
    stripeLeft.rotation.y = Math.PI / 2;
    store.add(stripeLeft);
    const stripeRight = stripeLeft.clone();
    stripeRight.position.x = 5.94;
    store.add(stripeRight);
  }

  // interior
  const interiorCeiling = makeBox(11.9, 0.08, 9.9, 0xdfdfdc, 0.96, 0.02);
  interiorCeiling.position.set(0, 4.05, 0);
  store.add(interiorCeiling);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffff2 });
  for (let z = -3.2; z <= 2.6; z += 2.18) {
    const lamp1 = new THREE.Mesh(new THREE.BoxGeometry(3.3, 0.06, 0.3), lampMat);
    lamp1.position.set(-2.15, 3.98, z);
    store.add(lamp1);
    const lamp2 = lamp1.clone();
    lamp2.position.x = 2.15;
    store.add(lamp2);
    const lightA = new THREE.PointLight(0xf4f2eb, 1.25, 15, 1.7);
    lightA.position.set(-2.15, 3.58, z);
    scene.add(lightA);
    const lightB = lightA.clone();
    lightB.position.x = 2.15;
    scene.add(lightB);
  }

  // fridge wall
  const fridgeGroup = new THREE.Group();
  fridgeGroup.position.set(-4.35, 0.7, -0.9);
  store.add(fridgeGroup);
  const fridgeBodyMat = new THREE.MeshStandardMaterial({ color: 0xe8eef3, roughness: 0.78, metalness: 0.02 });
  const fridgeGlassMat = new THREE.MeshStandardMaterial({ color: 0xcde8ff, roughness: 0.08, transparent: true, opacity: 0.2 });
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
  const fridgeHit = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.7, 1.05), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  fridgeHit.position.set(1.2, 0.65, 0.02);
  fridgeGroup.add(fridgeHit);
  addInteractable({
    object: fridgeHit,
    label: '冷蔵庫',
    hint: '調べる: 冷蔵庫',
    onInteract: () => showToast('冷気と蛍光灯の白さが強い。ここは安心感がある。'),
  });
  addCollider(-3.1, -0.9, 4.4, 1.15);

  // aisles
  buildShelfAisle(store, 0.1, -0.55, 2.1, 1.8, '棚', '棚の密度はこのくらいあると店っぽく見える。');
  buildShelfAisle(store, -1.9, 1.75, 1.2, 1.5, null, null, true);
  buildShelfAisle(store, 0.6, 1.7, 1.2, 1.5, null, null, true);
  buildShelfAisle(store, 3.2, -1.2, 1.0, 1.25, null, null, true);

  // rack near entrance
  const rackGroup = new THREE.Group();
  rackGroup.position.set(4.4, 0.52, 2.1);
  store.add(rackGroup);
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.3, 0.48), new THREE.MeshStandardMaterial({ color: 0x565b60, roughness: 0.92 }));
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
  addCollider(4.4, 2.1, 1.3, 0.66);

  // counter
  const counterGroup = new THREE.Group();
  counterGroup.position.set(2.8, 0.78, 1.85);
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
  counterClockScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.14), new THREE.MeshBasicMaterial({ map: createDigitalClockTexture('18:38') }));
  counterClockScreen.position.set(1.05, 1.02, -0.27);
  counterGroup.add(counterClockScreen);

  const crtBody = makeBox(0.86, 0.7, 0.76, 0x31383f, 0.76, 0.05);
  crtBody.position.set(0.18, 1.17, -0.16);
  counterGroup.add(crtBody);
  const crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.34), new THREE.MeshBasicMaterial({ map: createCRTText('OPEN\nUNTIL 23') }));
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

  const counterHit = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.8, 1.4), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  counterHit.position.set(0, 0.25, 0.02);
  counterGroup.add(counterHit);
  addInteractable({
    object: counterHit,
    label: 'レジ',
    hint: '調べる: レジ',
    onInteract: () => showToast('レジ前は安心感がある。光と雑多さで「店に入れそう」に見える。'),
  });
  const crtHit = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 0.85), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  crtHit.position.set(0.18, 1.17, -0.16);
  counterGroup.add(crtHit);
  addInteractable({
    object: crtHit,
    label: 'CRT',
    hint: '調べる: CRT',
    onInteract: () => showToast('ブラウン管のオレンジが一個あるだけで、時代感が一気に出る。'),
  });
  addCollider(2.8, 1.85, 3.7, 1.7);

  const backDesk = makeBox(1.6, 0.86, 0.82, 0x6a7070, 0.92, 0.03);
  backDesk.position.set(4.35, 0.76, -1.8);
  store.add(backDesk);
  addCollider(4.35, -1.8, 1.9, 1.06);
}

function buildShelfAisle(parent, x, z, width, height, label, text, dense = false) {
  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(x, 0.68, z);
  parent.add(shelfGroup);
  const shelfFrameMat = new THREE.MeshStandardMaterial({ color: 0x54585d, roughness: 0.9 });
  const shelfTrayMat = new THREE.MeshStandardMaterial({ color: 0xc9c8c3, roughness: 0.95 });
  const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.88), shelfFrameMat);
  shelfBody.position.y = 0.25;
  shelfGroup.add(shelfBody);
  const rows = dense ? 3 : 4;
  const cols = dense ? 8 : 10;
  for (let s = 0; s < rows; s++) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(width - 0.06, 0.06, 0.82), shelfTrayMat);
    tray.position.set(0, -0.54 + s * 0.48, 0);
    shelfGroup.add(tray);
    for (let i = 0; i < cols; i++) {
      const item = makeBox(0.14, 0.16 + Math.random() * 0.14, 0.16, [0xbb5062, 0x6c7fd0, 0xecc177, 0x8ab383, 0xb07ad9][i % 5], 0.86, 0.02);
      const colCount = Math.ceil(cols / 2);
      item.position.set(-0.35 * (colCount - 1) + (i % colCount) * 0.42, -0.42 + s * 0.48, i < colCount ? -0.16 : 0.16);
      shelfGroup.add(item);
    }
  }
  addCollider(x, z, width + 0.18, 1.06);
  if (label) {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.88), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
    hit.position.y = 0.25;
    shelfGroup.add(hit);
    addInteractable({
      object: hit,
      label,
      hint: `調べる: ${label}`,
      onInteract: () => showToast(text),
    });
  }
}

function buildParkingAndProps() {
  const lotLineMat = new THREE.MeshBasicMaterial({ color: 0xe8e7e1 });
  for (let i = -3; i <= 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 5.0), lotLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * 2.65, 0.025, 8.6);
    world.add(line);
  }
  const frontBar = new THREE.Mesh(new THREE.PlaneGeometry(19, 0.08), lotLineMat);
  frontBar.rotation.x = -Math.PI / 2;
  frontBar.position.set(0, 0.026, 10.92);
  world.add(frontBar);

  for (let i = -3; i <= 3; i += 2) {
    const block = makeBox(1.08, 0.15, 0.34, 0xafb4bb, 0.88, 0.03);
    block.position.set(i * 2.1, 0.08, 8.1);
    world.add(block);
  }

  const bench = makeBox(1.7, 0.24, 0.36, 0x838b8a, 0.86, 0.04);
  bench.position.set(-5.6, 0.42, 8.6);
  world.add(bench);
  addCollider(-5.6, 8.6, 1.9, 0.58);

  const ashTray = makeBox(0.2, 0.92, 0.2, 0x7e878c, 0.65, 0.15);
  ashTray.position.set(-6.55, 0.46, 8.65);
  world.add(ashTray);

  const bin = makeBox(0.46, 0.8, 0.46, 0x7a817f, 0.9, 0.03);
  bin.position.set(5.75, 0.4, 8.1);
  world.add(bin);
  addCollider(5.75, 8.1, 0.66, 0.66);

  const crateColors = [0xd95f53, 0x5a76c5, 0xe3c166, 0x7fb36d];
  for (let i = 0; i < 6; i++) {
    const crate = makeBox(0.46, 0.24, 0.36, crateColors[i % crateColors.length], 0.86, 0.03);
    crate.position.set(4.8 + (i % 2) * 0.5, 0.13 + Math.floor(i / 2) * 0.25, 4.9 + (i % 3) * 0.36);
    world.add(crate);
  }

  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.9), new THREE.MeshStandardMaterial({ color: 0x757b80, roughness: 1 }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.021, 5.5);
  world.add(mat);

  // vending machine
  const vending = new THREE.Group();
  vending.position.set(-8.7, 0, 6.6);
  world.add(vending);
  const body = makeBox(1.18, 2.2, 0.95, 0xf1f5fa, 0.5, 0.06);
  body.position.set(0, 1.1, 0);
  vending.add(body);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshBasicMaterial({ color: 0xeef6ff }));
  glow.position.set(0, 1.25, 0.49);
  vending.add(glow);
  const slot = makeBox(0.48, 0.08, 0.05, 0x2e3136, 0.6, 0.08);
  slot.position.set(0, 0.45, 0.5);
  vending.add(slot);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: crateColors[(r + c) % crateColors.length] }));
      can.position.set(-0.24 + c * 0.24, 0.72 + r * 0.24, 0.49);
      vending.add(can);
    }
  }
  addCollider(-8.7, 6.6, 1.4, 1.16);
  const vendingHit = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.3, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  vendingHit.position.set(0, 1.1, 0);
  vending.add(vendingHit);
  addInteractable({
    object: vendingHit,
    label: '自販機',
    hint: '調べる: 自販機',
    onInteract: () => showToast('夜の自販機は遠くからでも目印になる。歩きたくなる光。'),
  });
}

function buildHouse({ x, z, w = 4.6, d = 4.4, color = 0xc2b39e, roof = 0x5e5752, glow = false, facing = 0, props = 'basic' }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = facing;
  world.add(group);

  const body = makeBox(w, 3.05, d, color, 0.98, 0.02);
  body.position.y = 1.52;
  group.add(body);

  const roofMesh = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w, d) * 0.78, 1.8, 4),
    new THREE.MeshStandardMaterial({ color: roof, roughness: 0.96 })
  );
  roofMesh.position.y = 3.7;
  roofMesh.rotation.y = Math.PI * 0.25;
  group.add(roofMesh);

  const frontDoor = makeBox(0.78, 1.75, 0.08, 0x6a5848, 0.92, 0.03);
  frontDoor.position.set(0.8, 0.86, d / 2 + 0.03);
  group.add(frontDoor);

  const windowMat = new THREE.MeshStandardMaterial({ color: glow ? 0xffdda0 : 0x2c3240, emissive: glow ? 0x6d5328 : 0x000000, emissiveIntensity: glow ? 0.8 : 0 });
  const win1 = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.62), windowMat);
  win1.position.set(-1.1, 1.9, d / 2 + 0.05);
  group.add(win1);
  const win2 = win1.clone();
  win2.position.x = 1.85;
  group.add(win2);

  const ac = makeBox(0.58, 0.38, 0.32, 0xc9d0d6, 0.82, 0.06);
  ac.position.set(-w / 2 - 0.18, 1.0, 0.5);
  group.add(ac);

  if (props === 'basic' || props === 'garden') {
    const mailbox = makeBox(0.26, 0.34, 0.22, 0xb14f46, 0.88, 0.03);
    mailbox.position.set(1.8, 0.62, d / 2 + 0.32);
    group.add(mailbox);
    const planter = makeBox(0.7, 0.24, 0.3, 0x7f674f, 0.92, 0.02);
    planter.position.set(-1.3, 0.16, d / 2 + 0.3);
    group.add(planter);
    for (let i = 0; i < 4; i++) {
      const sprout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28 + Math.random() * 0.14, 5), new THREE.MeshStandardMaterial({ color: 0x5d8c45 }));
      sprout.position.set(-1.55 + i * 0.16, 0.28, d / 2 + 0.3 + (Math.random() - 0.5) * 0.08);
      group.add(sprout);
    }
  }

  if (props === 'laundry') {
    const poleL = makeBox(0.06, 1.7, 0.06, 0x888f96);
    poleL.position.set(-1.1, 0.85, d / 2 + 1.0);
    group.add(poleL);
    const poleR = poleL.clone();
    poleR.position.x = 1.1;
    group.add(poleR);
    const wire = makeBox(2.4, 0.02, 0.02, 0xa0a8ae, 0.6, 0.2);
    wire.position.set(0, 1.6, d / 2 + 1.0);
    group.add(wire);
    for (let i = 0; i < 3; i++) {
      const cloth = makeBox(0.45, 0.52, 0.02, [0xe7efef, 0xe5d2ca, 0xcfd8f2][i], 0.98, 0.01);
      cloth.position.set(-0.7 + i * 0.7, 1.18, d / 2 + 1.02);
      group.add(cloth);
    }
  }

  addCollider(x, z, w + 0.4, d + 0.4);
  return group;
}

function buildHouses() {
  // home-front houses / life lane
  buildHouse({ x: -3.9, z: 34.8, w: 4.6, d: 4.5, color: 0xbeafa0, roof: 0x605852, facing: 0.04, props: 'garden' });
  buildHouse({ x: 4.1, z: 33.8, w: 4.8, d: 4.2, color: 0xc5baaa, roof: 0x6b625c, facing: -0.06, glow: true, props: 'laundry' });
  buildHouse({ x: -10.8, z: -1.2, w: 5.2, d: 4.9, color: 0xc5b49f, roof: 0x57524b, facing: Math.PI * 0.48, props: 'garden' });
  buildHouse({ x: -10.4, z: -15.8, w: 4.3, d: 4.3, color: 0xbba998, roof: 0x655b50, facing: Math.PI * 0.52, glow: true, props: 'basic' });
  buildHouse({ x: 10.8, z: 14.8, w: 4.4, d: 4.2, color: 0xc1b7a6, roof: 0x64605b, facing: -Math.PI * 0.46, props: 'garden' });
  buildHouse({ x: 11.8, z: -9.8, w: 4.7, d: 4.0, color: 0xc2b4a1, roof: 0x5a524b, facing: -Math.PI * 0.48, glow: true, props: 'basic' });

  // block walls and driveway clutter
  for (let i = 0; i < 6; i++) {
    const wall = makeBox(1.1, 0.42, 0.18, 0xa5a19a, 0.95, 0.02);
    wall.position.set(-6.2 + i * 0.95, 0.21, 30.7);
    world.add(wall);
  }
  for (let i = 0; i < 5; i++) {
    const wall = makeBox(0.94, 0.42, 0.18, 0xa5a19a, 0.95, 0.02);
    wall.position.set(2.3 + i * 0.95, 0.21, 30.2);
    world.add(wall);
  }
}

function buildPolesAndWires() {
  const poleTopPoints = [];
  for (let i = 0; i < 10; i++) {
    const z = 33 - i * 12;
    const x = i < 2 ? 3.7 : 3.9;
    const pole = makeBox(0.14, 7.2, 0.14, 0x505962, 0.92, 0.05);
    pole.position.set(x, 3.6, z);
    world.add(pole);

    const arm = makeBox(0.95, 0.08, 0.08, 0x59636d);
    arm.position.set(x + 0.36, 6.28, z);
    world.add(arm);

    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xfff1d3 }));
    lamp.position.set(x + 0.82, 6.16, z);
    world.add(lamp);

    const lampLight = new THREE.PointLight(i < 3 ? 0xffd8ae : 0xc1d7ff, i < 3 ? 0.28 : 0.18, 11, 2);
    lampLight.position.set(x + 0.82, 5.94, z);
    scene.add(lampLight);

    poleTopPoints.push(new THREE.Vector3(x + 0.25, 6.55, z));
  }

  const wireMat = new THREE.LineBasicMaterial({ color: 0x1e232c, transparent: true, opacity: 0.72 });
  for (let i = 0; i < poleTopPoints.length - 1; i++) {
    for (let w = 0; w < 3; w++) {
      const a = poleTopPoints[i].clone();
      const b = poleTopPoints[i + 1].clone();
      a.y -= w * 0.18;
      b.y -= w * 0.18;
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= 0.18 + w * 0.02;
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(12);
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, wireMat);
      world.add(line);
    }
  }
}

function buildTownProps() {
  // bulletin board
  const board = new THREE.Group();
  board.position.set(8.55, 0, 8.8);
  world.add(board);
  const legL = makeBox(0.12, 1.9, 0.12, 0x86755b);
  legL.position.set(-0.95, 0.95, 0);
  board.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.95;
  board.add(legR);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.35), new THREE.MeshStandardMaterial({ color: 0xd0c7b8, roughness: 1 }));
  panel.position.set(0, 1.25, 0.04);
  board.add(panel);
  const posterData = [
    ['回覧', '今月の当番', '夜道注意'],
    ['バス', '時刻変更', '18:40 最終'],
    ['祭礼', '神社清掃', '土曜 7時'],
  ];
  posterData.forEach((lines, i) => {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.68), new THREE.MeshBasicMaterial({ map: createPosterTexture(lines) }));
    poster.position.set(-0.58 + i * 0.58, 1.27, 0.06);
    board.add(poster);
  });
  addCollider(8.55, 8.8, 2.4, 0.4);
  const boardHit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  boardHit.position.set(0, 1.25, 0.06);
  board.add(boardHit);
  addInteractable({
    object: boardHit,
    label: '掲示板',
    hint: '調べる: 掲示板',
    onInteract: () => showToast('掲示板があるだけで「ちゃんと人が住んでる町」に見える。'),
  });

  // bus stop
  const stop = new THREE.Group();
  stop.position.set(7.6, 0, 18.8);
  world.add(stop);
  const pole = makeBox(0.08, 2.1, 0.08, 0x92979d, 0.78, 0.18);
  pole.position.set(0, 1.05, 0);
  stop.add(pole);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), new THREE.MeshBasicMaterial({ map: createCanvasTexture({
    width: 256,
    height: 256,
    draw(ctx, w, h) {
      ctx.fillStyle = '#f6f1d8';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3a6bc0';
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, 72, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 100px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('バ', w / 2, h / 2 + 6);
    },
  }) }));
  sign.position.set(0, 1.78, 0.12);
  stop.add(sign);
  const bench = makeBox(1.2, 0.16, 0.32, 0x7b8287);
  bench.position.set(0.8, 0.44, 0.38);
  stop.add(bench);

  // shrine approach on far right
  const torii = new THREE.Group();
  torii.position.set(13.4, 0, -30);
  world.add(torii);
  const red = 0xb14b42;
  const legA = makeBox(0.22, 3.2, 0.22, red, 0.88, 0.03);
  legA.position.set(-1.1, 1.6, 0);
  torii.add(legA);
  const legB = legA.clone();
  legB.position.x = 1.1;
  torii.add(legB);
  const beamTop = makeBox(2.9, 0.18, 0.26, red, 0.88, 0.03);
  beamTop.position.set(0, 3.1, 0);
  torii.add(beamTop);
  const beamMid = makeBox(2.4, 0.14, 0.2, red, 0.88, 0.03);
  beamMid.position.set(0, 2.6, 0.02);
  torii.add(beamMid);
  const stoneSteps = new THREE.Group();
  stoneSteps.position.set(13.4, 0, -25.5);
  world.add(stoneSteps);
  for (let i = 0; i < 5; i++) {
    const step = makeBox(2.0 - i * 0.08, 0.18, 1.1, 0x858a90, 0.98, 0.02);
    step.position.set(0, 0.09 + i * 0.15, -i * 0.86);
    stoneSteps.add(step);
  }

  // bridge over ditch
  const bridge = new THREE.Group();
  bridge.position.set(4.7, 0.02, -4.8);
  world.add(bridge);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 1.8), new THREE.MeshStandardMaterial({ color: 0x8b8f94, roughness: 0.98 }));
  slab.position.set(0, 0.03, 0);
  bridge.add(slab);

  const bridgeHit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  bridgeHit.position.set(0, 0.2, 0);
  bridge.add(bridgeHit);
  addInteractable({
    object: bridgeHit,
    label: '側溝',
    hint: '調べる: 側溝',
    onInteract: () => showToast('側溝や小橋があると、田舎の生活道路っぽさが一気に出る。'),
  });

  // public phone
  const phone = new THREE.Group();
  phone.position.set(-12.6, 0, -6.8);
  world.add(phone);
  const booth = makeBox(1.1, 2.3, 1.1, 0x9f2f3e, 0.82, 0.08);
  booth.position.set(0, 1.15, 0);
  phone.add(booth);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0xb8d9ec, transparent: true, opacity: 0.24 }));
  glass.position.set(0, 1.28, 0.56);
  phone.add(glass);
  addCollider(-12.6, -6.8, 1.5, 1.5);
}

function buildTreesAndGrass() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x584636, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x314924, roughness: 1 });
  const leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x25371d, roughness: 1 });

  const treeSpots = [
    [-16, 30], [-18, 18], [-17, 0], [-18, -15], [-15, -34],
    [17, 28], [19, 12], [18, -10], [21, -26], [15, -46],
    [-24, -78], [26, -82], [0, -95],
  ];
  treeSpots.forEach(([x, z], idx) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.8 + Math.random() * 1.4, 7), trunkMat);
    trunk.position.set(x, 1.4, z);
    world.add(trunk);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.4 + Math.random() * 0.7, 8, 8), i % 2 === 0 ? leafMat : leafDarkMat);
      leaf.position.set(x + (Math.random() - 0.5) * 1.2, 3.1 + i * 0.6, z + (Math.random() - 0.5) * 1.2);
      leaf.scale.y = 0.8 + Math.random() * 0.4;
      world.add(leaf);
    }
  });

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x39512c, roughness: 1 });
  for (let i = 0; i < 240; i++) {
    const side = i % 3 === 0 ? -1 : 1;
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55 + Math.random() * 0.9, 0.1), grassMat);
    const xBase = side > 0 ? 6.4 + Math.random() * 17 : -6.4 - Math.random() * 17;
    tuft.position.set(xBase + (Math.random() - 0.5) * 1.4, 0.2, 36 - Math.random() * 130);
    world.add(tuft);
  }
}

function buildBoundaryHints() {
  // invisible boundaries
  addCollider(-21.8, -18, 0.5, 170);
  addCollider(21.8, -18, 0.5, 170);
  addCollider(0, 42.6, 46, 0.5);
  addCollider(0, -94.8, 52, 0.5);

  // visible destination marker for inn road
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.5), new THREE.MeshBasicMaterial({ map: createCanvasTexture({ width: 512, height: 256, draw(ctx, w, h) {
    ctx.fillStyle = '#312b28'; ctx.fillRect(0,0,w,h);
    ctx.fillStyle = '#f2e5c7'; ctx.fillRect(10,10,w-20,h-20);
    ctx.fillStyle = '#2b2928'; ctx.font = 'bold 72px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText('旅館 →', w/2, h/2+4);
  } }) }));
  marker.position.set(1.8, 1.2, -18.2);
  world.add(marker);
}

function applyCamera() {
  const bobOffset = Math.sin(state.bob) * Math.min(state.velocity.length() * 0.005, 0.018);
  camera.position.set(state.player.x, state.player.y + bobOffset, state.player.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = state.yaw;
  camera.rotation.x = state.pitch;
}

function updateDoor(dt) {
  const dx = state.player.x;
  const dz = state.player.z - 5;
  const nearDoor = Math.abs(dx) < 1.8 && Math.abs(dz) < 3.4;
  const target = nearDoor ? 1 : 0;
  const speed = nearDoor ? 4.9 : 2.9;
  state.doorOpen += (target - state.doorOpen) * Math.min(1, dt * speed);
  if (doorLeft && doorRight) {
    doorLeft.position.x = -0.46 - state.doorOpen * 0.48;
    doorRight.position.x = 0.46 + state.doorOpen * 0.48;
  }
  if (doorLight) doorLight.intensity = 1.08 + state.doorOpen * 0.18;
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
  x = THREE.MathUtils.clamp(x, -21.3, 21.3);
  z = THREE.MathUtils.clamp(z, -94.2, 42.1);
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
  const accel = desiredDir.lengthSq() > 0 ? 16 : 13;
  state.velocity.x = THREE.MathUtils.damp(state.velocity.x, desiredDir.x * targetSpeed, accel, dt);
  state.velocity.z = THREE.MathUtils.damp(state.velocity.z, desiredDir.z * targetSpeed, accel, dt);

  const nextX = state.player.x + state.velocity.x * dt;
  const nextZ = state.player.z + state.velocity.z * dt;
  const resolved = resolveMovement(nextX, nextZ, 0.32);
  state.player.x = resolved.x;
  state.player.z = resolved.z;

  const speed = Math.hypot(state.velocity.x, state.velocity.z);
  state.bob += dt * (3 + speed * 2.5);
}

function updateLook(dt) {
  const smooth = 1 - Math.exp(-dt * 18);
  state.yaw += state.lookDelta.x * smooth;
  state.pitch += state.lookDelta.y * smooth;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.52, 0.34);
  state.lookDelta.multiplyScalar(1 - smooth);
}

function updateInteractTarget() {
  raycaster.setFromCamera(centerNDC, camera);
  const hits = raycaster.intersectObjects(interactables, false);
  const hit = hits.find((h) => h.distance < 4.8);
  if (hit) {
    const info = hit.object.userData.interactable;
    state.currentTarget = info;
    setHint(info.hint);
    return;
  }
  state.currentTarget = null;
  const { x, z } = state.player;
  if (z > 28) setHint('自宅前の細い生活道路。少し歩くだけで夏休み感が出るか確認。');
  else if (z > 12) setHint('コンビニの明かりが安心感になる導線。ここは歩きやすさ重視。');
  else if (z > 4) setHint('商店前通り。店内に入れそう・何かありそうに見えるか確認。');
  else if (Math.abs(x) > 8 && z > -20) setHint('路地の先が気になる構図になっているか確認。');
  else if (z < -18 && x > 9) setHint('右の祠・石段は「追加スポット候補」。歩きたくなるかを見る。');
  else if (z < -18) setHint('旅館へ続く一本道を見せるだけで、奥行きが出る。');
  else setHint(state.hintDefault);
}

function interact() {
  if (!state.started) return;
  if (state.currentTarget?.onInteract) {
    state.currentTarget.onInteract();
  } else if (state.player.z > 4.3 && Math.abs(state.player.x) < 1.6) {
    showToast('自動ドアの反応はこのくらいが一番ストレスが少ない。');
  } else {
    showToast('今はここに直接触れるものはない。', 1.4);
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
  if (counterClockScreen) {
    const hh = String(18 + ((Math.floor(performance.now() * 0.0001)) % 2)).padStart(2, '0');
    const mm = String(32 + Math.floor((Math.sin(performance.now() * 0.0005) + 1) * 5)).padStart(2, '0');
    const label = `${hh}:${mm}`;
    if (label !== lastClockLabel) {
      if (counterClockScreen.material.map) counterClockScreen.material.map.dispose();
      counterClockScreen.material.map = createDigitalClockTexture(label);
      counterClockScreen.material.needsUpdate = true;
      lastClockLabel = label;
    }
  }

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

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
    state.lookDelta.x -= dx * 0.0037;
    state.lookDelta.y -= dy * 0.00325;
  }
});

window.addEventListener('pointerup', (e) => {
  if (pointerState.joystickId === e.pointerId) {
    pointerState.joystickId = null;
    resetJoystick();
  }
  if (pointerState.lookId === e.pointerId) pointerState.lookId = null;
  if (String(e.pointerId) === runButton.dataset.pointerId) state.isRunning = false;
});

window.addEventListener('pointercancel', (e) => {
  if (pointerState.joystickId === e.pointerId) {
    pointerState.joystickId = null;
    resetJoystick();
  }
  if (pointerState.lookId === e.pointerId) pointerState.lookId = null;
  if (String(e.pointerId) === runButton.dataset.pointerId) state.isRunning = false;
});

app.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  if (pointerOverControl(e.target)) return;
  if (e.clientX > window.innerWidth * 0.38 && pointerState.lookId == null) beginLook(e);
});

runButton.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  state.isRunning = true;
  runButton.dataset.pointerId = String(e.pointerId);
  runButton.setPointerCapture(e.pointerId);
});
runButton.addEventListener('pointerup', () => { state.isRunning = false; });
runButton.addEventListener('pointercancel', () => { state.isRunning = false; });

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
  showToast('田舎町・商店前通りテスト開始。まずは自宅前からコンビニまで歩いてみる。', 2.8);
  setHint('左で移動、右側ドラッグで視点移動。まずは歩いて空気感を確認。');
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
  if (e.button === 0 && pointerState.lookId == null) beginLook({ pointerId: -1, clientX: e.clientX, clientY: e.clientY });
});
window.addEventListener('mouseup', () => { if (pointerState.lookId === -1) pointerState.lookId = null; });
window.addEventListener('mousemove', (e) => {
  if (pointerState.lookId === -1) {
    const dx = e.clientX - pointerState.lookLastX;
    const dy = e.clientY - pointerState.lookLastY;
    pointerState.lookLastX = e.clientX;
    pointerState.lookLastY = e.clientY;
    state.lookDelta.x -= dx * 0.0037;
    state.lookDelta.y -= dy * 0.00325;
  }
});

buildEnvironment();
applyCamera();
requestAnimationFrame(animate);
