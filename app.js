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
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0c1524);
scene.fog = new THREE.Fog(0x1a2230, 44, 156);

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
  scanlines: false,
  yaw: Math.PI,
  pitch: -0.05,
  player: new THREE.Vector3(0, 1.62, 35),
  velocity: new THREE.Vector3(),
  joystick: new THREE.Vector2(),
  lookDelta: new THREE.Vector2(),
  moveSpeed: 3.65,
  runMultiplier: 1.38,
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
scanlineLayer.classList.add('off');
scanlineToggle.textContent = 'SCANLINE: OFF';
runButton.textContent = '走る: OFF';

function showToast(text, duration = 2.4) {
  toastEl.textContent = text;
  toastEl.classList.add('show');
  state.toastTimer = duration;
}

function hideToast() {
  toastEl.classList.remove('show');
}

function startGame() {
  if (state.started) return;
  state.started = true;
  introCard.classList.add('hidden');
  showToast('田舎町・商店前通りテスト開始。まずは自宅前からコンビニまで歩いてみる。', 2.8);
  setHint('左で移動、右側ドラッグで視点移動。走るはON/OFF切替。まずは歩いて空気感を確認。');
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
      const base = ctx.createLinearGradient(0, 0, 0, h);
      base.addColorStop(0, '#3a3f44');
      base.addColorStop(1, '#2f3438');
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, w, h);

      for (let i = 0; i < 4200; i++) {
        const v = 40 + Math.floor(Math.random() * 28);
        const a = 0.02 + Math.random() * 0.04;
        ctx.fillStyle = `rgba(${v},${v},${v},${a})`;
        const x = Math.random() * w;
        const y = Math.random() * h;
        const s = 1 + Math.random() * 3.5;
        ctx.fillRect(x, y, s, s);
      }

      for (let i = 0; i < 60; i++) {
        ctx.strokeStyle = 'rgba(20,20,20,0.30)';
        ctx.lineWidth = 2 + Math.random() * 4;
        ctx.beginPath();
        const sy = (i / 60) * h;
        ctx.moveTo(180 + Math.random() * 80, sy + Math.random() * 40);
        for (let s = 0; s < 6; s++) {
          ctx.lineTo(160 + s * 130 + Math.random() * 40, sy + s * 38 + Math.random() * 40);
        }
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(245,245,240,0.08)';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(64, 0);
      ctx.lineTo(64, h);
      ctx.moveTo(w - 64, 0);
      ctx.lineTo(w - 64, h);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 10;
      for (let y = 220; y < h; y += 360) {
        ctx.beginPath();
        ctx.moveTo(w * 0.5, y);
        ctx.lineTo(w * 0.5, y + 120);
        ctx.stroke();
      }

      for (let i = 0; i < 18; i++) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        const x = 140 + Math.random() * (w - 280);
        const y = 260 + Math.random() * (h - 520);
        ctx.beginPath();
        ctx.ellipse(x, y, 30 + Math.random() * 28, 12 + Math.random() * 10, Math.random() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  return tex;
}

function createWallpaperTexture() {
  const tex = createCanvasTexture({
    width: 1024,
    height: 1024,
    draw(ctx, w, h) {
      ctx.fillStyle = '#b8a691';
      ctx.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 56) {
        ctx.fillStyle = x % 112 === 0 ? '#9f8b78' : '#c5b39d';
        ctx.fillRect(x, 0, 22, h);
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.fillRect(x + 23, 0, 5, h);
      }
      for (let i = 0; i < 3000; i++) {
        const a = 0.02 + Math.random() * 0.04;
        ctx.fillStyle = `rgba(255,255,255,${a})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
      }
    },
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.8, 1.1);
  return tex;
}

function createTileTexture() {
  const tex = createCanvasTexture({
    width: 1024,
    height: 1024,
    draw(ctx, w, h) {
      ctx.fillStyle = '#d7d4cb';
      ctx.fillRect(0, 0, w, h);
      const step = 128;
      for (let y = 0; y < h; y += step) {
        for (let x = 0; x < w; x += step) {
          const base = 213 + Math.floor(Math.random() * 14);
          ctx.fillStyle = `rgb(${base},${base-2},${base-5})`;
          ctx.fillRect(x, y, step, step);
        }
      }
      ctx.strokeStyle = 'rgba(90,90,90,0.14)';
      ctx.lineWidth = 6;
      for (let x = 0; x <= w; x += step) {
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let y = 0; y <= h; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      for (let i = 0; i < 2200; i++) {
        const a = 0.01 + Math.random() * 0.04;
        ctx.fillStyle = `rgba(80,80,70,${a})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    },
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.6, 3.6);
  return tex;
}

function createConcreteTexture(tint = '#737c83') {
  const tex = createCanvasTexture({
    width: 1024,
    height: 1024,
    draw(ctx, w, h) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 3600; i++) {
        const s = Math.random() * 3;
        const c = 140 + Math.floor(Math.random() * 60);
        const a = 0.03 + Math.random() * 0.05;
        ctx.fillStyle = `rgba(${c},${c},${c},${a})`;
        ctx.fillRect(Math.random() * w, Math.random() * h, s + 1, s + 1);
      }
      ctx.strokeStyle = 'rgba(30,30,30,0.12)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 22; i++) {
        ctx.beginPath();
        const x = Math.random() * w;
        const y = Math.random() * h;
        ctx.moveTo(x, y);
        ctx.lineTo(x + (Math.random() - 0.5) * 180, y + Math.random() * 90);
        ctx.stroke();
      }
    },
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.4, 1.4);
  return tex;
}

function createWindowReflectionTexture() {
  return createCanvasTexture({
    width: 1024,
    height: 1024,
    draw(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, 'rgba(55,92,128,0.9)');
      g.addColorStop(0.55, 'rgba(34,48,69,0.96)');
      g.addColorStop(1, 'rgba(13,16,20,1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const rg = ctx.createRadialGradient(w * 0.32, h * 0.2, 30, w * 0.32, h * 0.2, 260);
      rg.addColorStop(0, 'rgba(255,196,124,0.85)');
      rg.addColorStop(1, 'rgba(255,196,124,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.16)';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(0, h * 0.1); ctx.lineTo(w * 0.78, h * 0.45); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w * 0.15, 0); ctx.lineTo(w, h * 0.36); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, h * 0.72, w, h * 0.06);
    },
  });
}

function createStoreSignTexture(text) {
  return createCanvasTexture({
    width: 1024,
    height: 256,
    draw(ctx, w, h) {
      ctx.fillStyle = '#22ad6d';
      ctx.fillRect(0, 0, w, h);
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, 'rgba(255,255,255,0.22)');
      grad.addColorStop(1, 'rgba(0,0,0,0.08)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 8;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 118px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.24)';
      ctx.shadowBlur = 10;
      ctx.fillText(text, w / 2, h / 2 + 4);
    },
  });
}

function createShelfLabelTexture(name) {
  return createCanvasTexture({
    width: 512,
    height: 128,
    draw(ctx, w, h) {
      ctx.fillStyle = '#2f4256';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#f8fbff';
      ctx.font = 'bold 52px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(name, w / 2, h / 2 + 2);
    },
  });
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

  const tileTex = createTileTexture();
  const wallpaperTex = createWallpaperTexture();
  const concreteTex = createConcreteTexture('#8f949a');
  const windowTex = createWindowReflectionTexture();

  const wallMat = new THREE.MeshStandardMaterial({ map: wallpaperTex, roughness: 0.98 });
  const outerWallMat = new THREE.MeshStandardMaterial({ color: 0xbfb1a0, roughness: 0.96 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xd9d4cb, roughness: 0.78, metalness: 0.04 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x5b646d, roughness: 0.92 });
  const floorMat = new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({ map: windowTex, color: 0xdfe9f4, roughness: 0.05, metalness: 0.02, transparent: true, opacity: 0.3 });

  const base = new THREE.Mesh(new THREE.BoxGeometry(13.1, 0.36, 11.0), new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.95 }));
  base.position.set(0, 0.18, 0);
  store.add(base);

  const floor = new THREE.Mesh(new THREE.BoxGeometry(12.34, 0.1, 10.28), floorMat);
  floor.position.set(0, 0.35, 0);
  store.add(floor);

  const roof = makeBox(13.4, 0.38, 11.4, 0x5a6066, 0.92, 0.04);
  roof.position.set(0, 4.56, 0);
  store.add(roof);
  const parapet = makeBox(13.0, 0.28, 0.35, 0x6d7278, 0.92, 0.04);
  parapet.position.set(0, 4.28, 5.2);
  store.add(parapet);

  const frontBandWhite = makeBox(12.9, 0.4, 0.18, 0xf4f4f0, 0.76, 0.03);
  frontBandWhite.position.set(0, 3.98, 5.15);
  store.add(frontBandWhite);
  const frontBandGreen = new THREE.Mesh(new THREE.PlaneGeometry(12.7, 0.62), new THREE.MeshBasicMaterial({ color: 0x22ad6d }));
  frontBandGreen.position.set(0, 3.42, 5.24);
  store.add(frontBandGreen);
  const frontBandOrange = makeBox(12.7, 0.13, 0.17, 0xf0af2d, 0.68, 0.03);
  frontBandOrange.position.set(0, 3.78, 5.13);
  store.add(frontBandOrange);
  const frontBandRed = makeBox(12.7, 0.13, 0.17, 0xdc4e42, 0.68, 0.03);
  frontBandRed.position.set(0, 3.05, 5.13);
  store.add(frontBandRed);

  const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.9, 1.12), new THREE.MeshBasicMaterial({ map: createStoreSignTexture('こもれびマート') }));
  sign.position.set(0, 3.42, 5.26);
  store.add(sign);

  const backWall = new THREE.Mesh(new THREE.BoxGeometry(12.24, 4.0, 0.22), wallMat);
  backWall.position.set(0, 2.32, -5.05);
  store.add(backWall);
  addCollider(0, -5.05, 12.24, 0.42);

  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.22, 4.0, 10.24), wallMat);
  leftWall.position.set(-6.1, 2.32, 0);
  store.add(leftWall);
  addCollider(-6.1, 0, 0.42, 10.24);

  const rightWall = leftWall.clone();
  rightWall.position.x = 6.1;
  store.add(rightWall);
  addCollider(6.1, 0, 0.42, 10.24);

  const frontLeftWall = new THREE.Mesh(new THREE.BoxGeometry(4.45, 4.0, 0.22), outerWallMat);
  frontLeftWall.position.set(-3.87, 2.32, 5.02);
  store.add(frontLeftWall);
  addCollider(-3.87, 5.02, 4.45, 0.42);
  const frontRightWall = frontLeftWall.clone();
  frontRightWall.position.x = 3.87;
  store.add(frontRightWall);
  addCollider(3.87, 5.02, 4.45, 0.42);

  const frontHeader = new THREE.Mesh(new THREE.BoxGeometry(3.22, 1.26, 0.22), frameMat);
  frontHeader.position.set(0, 3.35, 5.02);
  store.add(frontHeader);

  const frontWindowL = new THREE.Mesh(new THREE.PlaneGeometry(3.36, 2.3), glassMat);
  frontWindowL.position.set(-3.8, 1.9, 4.92);
  store.add(frontWindowL);
  const frontWindowR = frontWindowL.clone();
  frontWindowR.position.x = 3.8;
  store.add(frontWindowR);

  const posterL = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.84), new THREE.MeshBasicMaterial({ map: createPosterTexture(['氷', 'つめたい', 'あります']) }));
  posterL.position.set(-4.9, 1.42, 4.93);
  store.add(posterL);
  const posterR = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.02), new THREE.MeshBasicMaterial({ map: createPosterTexture(['祭礼', '8/18', '商店前通り']) }));
  posterR.position.set(4.82, 1.56, 4.93);
  store.add(posterR);

  const doorFrameTop = makeBox(2.18, 0.14, 0.18, 0xe7e4df, 0.74, 0.03);
  doorFrameTop.position.set(0, 2.58, 4.97);
  store.add(doorFrameTop);
  const doorFrameL = makeBox(0.08, 2.26, 0.18, 0xe7e4df, 0.74, 0.03);
  doorFrameL.position.set(-1.05, 1.44, 4.97);
  store.add(doorFrameL);
  const doorFrameR = doorFrameL.clone();
  doorFrameR.position.x = 1.05;
  store.add(doorFrameR);

  doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.22, 0.05), glassMat.clone());
  doorLeft.position.set(-0.46, 1.44, 4.94);
  store.add(doorLeft);
  doorRight = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.22, 0.05), glassMat.clone());
  doorRight.position.set(0.46, 1.44, 4.94);
  store.add(doorRight);

  doorLight = new THREE.PointLight(0xf7f3ea, 1.45, 12, 2);
  doorLight.position.set(0, 2.74, 4.2);
  scene.add(doorLight);

  const interiorCeiling = makeBox(12.0, 0.08, 10.0, 0xe0dfda, 0.98, 0.02);
  interiorCeiling.position.set(0, 4.03, 0);
  store.add(interiorCeiling);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfffffb });
  for (let z = -3.4; z <= 2.5; z += 2.1) {
    const lamp1 = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.06, 0.28), lampMat);
    lamp1.position.set(-2.15, 3.97, z);
    store.add(lamp1);
    const lamp2 = lamp1.clone();
    lamp2.position.x = 2.15;
    store.add(lamp2);
    const lightA = new THREE.PointLight(0xf6f3ed, 1.18, 14, 1.7);
    lightA.position.set(-2.15, 3.55, z);
    scene.add(lightA);
    const lightB = lightA.clone();
    lightB.position.x = 2.15;
    scene.add(lightB);
  }

  // front mat
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.45, 0.82), new THREE.MeshStandardMaterial({ color: 0x70757a, roughness: 1 }));
  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0, 0.41, 4.2);
  store.add(mat);

  // fridge wall
  const fridgeGroup = new THREE.Group();
  fridgeGroup.position.set(-4.45, 0.72, -1.0);
  store.add(fridgeGroup);
  const fridgeBodyMat = new THREE.MeshStandardMaterial({ color: 0xecf0f5, roughness: 0.74, metalness: 0.02 });
  const fridgeGlassMat = new THREE.MeshStandardMaterial({ color: 0xd6ecff, roughness: 0.06, metalness: 0.02, transparent: true, opacity: 0.22 });
  for (let i = 0; i < 3; i++) {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.18, 2.8, 0.92), fridgeBodyMat);
    body.position.set(i * 1.24, 0.68, 0);
    fridgeGroup.add(body);
    const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 2.22), fridgeGlassMat);
    doorGlass.position.set(i * 1.24, 0.68, 0.47);
    fridgeGroup.add(doorGlass);
    for (let s = 0; s < 4; s++) {
      const shelf = makeBox(0.9, 0.04, 0.72, 0xdbe1e6, 0.75, 0.04);
      shelf.position.set(i * 1.24, -0.24 + s * 0.56, -0.02);
      fridgeGroup.add(shelf);
    }
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 3; c++) {
        const bottle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.06, 0.08, 0.3, 10),
          new THREE.MeshStandardMaterial({ color: [0xe7f2ff, 0xfff2c6, 0xffdccb, 0xdfeedd, 0xc9d9ff][(i + r + c) % 5], roughness: 0.65 })
        );
        bottle.position.set(i * 1.24 - 0.25 + c * 0.25, -0.52 + r * 0.56, 0.08);
        fridgeGroup.add(bottle);
      }
    }
  }
  const fridgeGlow = new THREE.PointLight(0xc7e5ff, 1.6, 8, 1.7);
  fridgeGlow.position.set(1.2, 1.55, 0.4);
  fridgeGroup.add(fridgeGlow);
  addCollider(-2.95, -1.0, 4.1, 1.25);
  const fridgeHit = new THREE.Mesh(new THREE.BoxGeometry(4.1, 2.9, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  fridgeHit.position.set(1.24, 0.68, 0);
  fridgeGroup.add(fridgeHit);
  addInteractable({
    object: fridgeHit,
    label: '冷蔵ケース',
    hint: '調べる: 冷蔵ケース',
    onInteract: () => showToast('白く冷えた冷蔵ケースの光で、店内と外の青さの対比を作る。'),
  });

  // central aisles
  buildShelfAisle(store, -1.25, 1.05, 2.2, 1.7, '棚', '棚の密度が上がると、ただの箱っぽさがかなり減る。', true);
  buildShelfAisle(store, 1.45, 1.0, 2.2, 1.7, '棚', '通路が見切れる構図を作ると、奥に何かありそうに見える。', true);
  buildShelfAisle(store, -1.25, -1.18, 2.2, 1.7, '', '', true);
  buildShelfAisle(store, 1.45, -1.25, 2.2, 1.7, '', '', true);

  // wall magazine rack
  const magRack = new THREE.Group();
  magRack.position.set(5.1, 0.76, 2.2);
  store.add(magRack);
  for (let i = 0; i < 3; i++) {
    const shelf = makeBox(0.36, 0.05, 1.6, 0xb6b8bb, 0.88, 0.03);
    shelf.position.set(0, 0.1 + i * 0.65, 0);
    magRack.add(shelf);
    for (let j = 0; j < 6; j++) {
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.46, 0.22), new THREE.MeshStandardMaterial({ color: [0xf0cf8c, 0xe8a7a4, 0xd3e3f2, 0xc9d9bc][(i+j)%4], roughness: 0.96 }));
      mag.position.set(0.05, 0.32 + i * 0.65, -0.58 + j * 0.24);
      mag.rotation.z = 0.12;
      magRack.add(mag);
    }
  }
  addCollider(5.1, 2.2, 0.8, 1.8);

  // counter area
  const counterGroup = new THREE.Group();
  counterGroup.position.set(3.65, 0.72, 1.85);
  store.add(counterGroup);
  const counterBody = new THREE.Mesh(new THREE.BoxGeometry(2.9, 0.9, 1.0), new THREE.MeshStandardMaterial({ map: createConcreteTexture('#7b7f7e'), roughness: 0.94 }));
  counterBody.position.set(0, 0.45, 0);
  counterGroup.add(counterBody);
  const counterTop = makeBox(3.1, 0.08, 1.08, 0xd9d4cd, 0.94, 0.02);
  counterTop.position.set(0, 0.94, 0);
  counterGroup.add(counterTop);
  counterLight = new THREE.PointLight(0xf6f1e7, 0.7, 8, 2);
  counterLight.position.set(-0.5, 1.55, 0.4);
  counterGroup.add(counterLight);

  const register = makeBox(0.54, 0.26, 0.5, 0x62676d, 0.74, 0.18);
  register.position.set(-0.35, 1.08, -0.12);
  counterGroup.add(register);
  const registerScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ color: 0x76c88c }));
  registerScreen.position.set(-0.35, 1.16, 0.14);
  counterGroup.add(registerScreen);

  counterClockScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.38), new THREE.MeshBasicMaterial({ map: createDigitalClockTexture('22:46') }));
  counterClockScreen.position.set(0.85, 1.16, 0.15);
  counterGroup.add(counterClockScreen);

  const phone = makeBox(0.24, 0.1, 0.18, 0xe0dfd8, 0.84, 0.02);
  phone.position.set(1.12, 0.99, -0.25);
  counterGroup.add(phone);
  const pencilCup = makeBox(0.14, 0.24, 0.14, 0xe8e6dd, 0.94, 0.02);
  pencilCup.position.set(-1.0, 1.02, 0.18);
  counterGroup.add(pencilCup);
  for (let i = 0; i < 3; i++) {
    const pencil = makeBox(0.02, 0.18, 0.02, [0xd8b14b, 0xa66e4a, 0x4f86cf][i], 0.7, 0.02);
    pencil.position.set(-1.03 + i * 0.03, 1.16, 0.18 + (i % 2) * 0.02);
    counterGroup.add(pencil);
  }

  const crtBase = makeBox(1.42, 0.86, 0.88, 0x434b50, 0.92, 0.04);
  crtBase.position.set(1.05, 1.36, -0.25);
  counterGroup.add(crtBase);
  const crtScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.54), new THREE.MeshBasicMaterial({ map: createCRTText('THANK YOU
FOR COMING.') }));
  crtScreen.position.set(1.05, 1.42, 0.2);
  counterGroup.add(crtScreen);

  const outsideWindow = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 1.62), new THREE.MeshBasicMaterial({ map: createWindowReflectionTexture() }));
  outsideWindow.position.set(-0.95, 1.56, -0.52);
  counterGroup.add(outsideWindow);
  const winFrame = makeBox(2.06, 0.08, 0.08, 0xd4d1cb, 0.8, 0.04);
  winFrame.position.set(-0.95, 2.36, -0.56);
  counterGroup.add(winFrame);
  const windowTrimL = makeBox(0.08, 1.66, 0.08, 0xd4d1cb, 0.8, 0.04);
  windowTrimL.position.set(-1.96, 1.56, -0.56);
  counterGroup.add(windowTrimL);
  const windowTrimR = windowTrimL.clone();
  windowTrimR.position.x = 0.06;
  counterGroup.add(windowTrimR);
  const notePad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 0.16), new THREE.MeshStandardMaterial({ color: 0xe4e0d6, roughness: 0.96 }));
  notePad.position.set(-0.92, 1.0, 0.28);
  counterGroup.add(notePad);

  addCollider(3.65, 1.85, 3.5, 1.4);
  const counterHit = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.8, 1.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  counterHit.position.set(0, 0.96, 0);
  counterGroup.add(counterHit);
  addInteractable({ object: counterHit, label: 'レジ', hint: '調べる: レジ', onInteract: () => showToast('レジまわりは生活感の小物を増やすほど一気に本物っぽく見える。') });
  addInteractable({ object: crtScreen, label: 'CRT', hint: '調べる: CRT', onInteract: () => showToast('ブラウン管のオレンジ文字はこの空気にかなり効く。') });

  // exit-facing magazine near counter
  const smallRack = new THREE.Group();
  smallRack.position.set(5.18, 0.7, 3.85);
  store.add(smallRack);
  for (let i = 0; i < 4; i++) {
    const shelf = makeBox(0.4, 0.04, 1.1, 0xb4b4b1, 0.9, 0.02);
    shelf.position.set(0, 0.15 + i * 0.42, 0);
    smallRack.add(shelf);
  }
  for (let i = 0; i < 12; i++) {
    const item = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.28, 0.18), new THREE.MeshStandardMaterial({ color: [0xefb1ae, 0xc6d8f2, 0xf3dda2][i % 3], roughness: 0.96 }));
    item.position.set(0.04, 0.26 + Math.floor(i / 3) * 0.42, -0.36 + (i % 3) * 0.24);
    item.rotation.z = 0.06;
    smallRack.add(item);
  }
  addCollider(5.18, 3.85, 0.8, 1.3);
}


function buildShelfAisle(parent, x, z, width, height, label, text, dense = false) {
  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(x, 0.7, z);
  parent.add(shelfGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x575d62, roughness: 0.92 });
  const trayMat = new THREE.MeshStandardMaterial({ color: 0xc9c8c2, roughness: 0.96 });
  const sidePanel = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.96), bodyMat);
  sidePanel.position.y = 0.28;
  shelfGroup.add(sidePanel);

  const topSign = new THREE.Mesh(new THREE.PlaneGeometry(width - 0.08, 0.24), new THREE.MeshBasicMaterial({ map: createShelfLabelTexture(dense ? '日用品' : '雑貨') }));
  topSign.position.set(0, 1.05, 0.49);
  shelfGroup.add(topSign);

  const rows = dense ? 4 : 3;
  const cols = dense ? 10 : 8;
  const palette = [0xd0635f, 0x5a75c4, 0xebb865, 0x8fb570, 0xb384d7, 0xe4d1c5];
  for (let s = 0; s < rows; s++) {
    const tray = new THREE.Mesh(new THREE.BoxGeometry(width - 0.08, 0.06, 0.88), trayMat);
    tray.position.set(0, -0.58 + s * 0.44, 0);
    shelfGroup.add(tray);
    for (let i = 0; i < cols; i++) {
      const isTall = Math.random() > 0.5;
      const item = new THREE.Mesh(
        new THREE.BoxGeometry(0.13 + Math.random() * 0.06, isTall ? 0.3 + Math.random() * 0.12 : 0.18 + Math.random() * 0.08, 0.12 + Math.random() * 0.08),
        new THREE.MeshStandardMaterial({ color: palette[(i + s) % palette.length], roughness: 0.88 })
      );
      const colCount = Math.ceil(cols / 2);
      item.position.set(-0.38 * (colCount - 1) + (i % colCount) * 0.45, -0.44 + s * 0.44, i < colCount ? -0.19 : 0.19);
      shelfGroup.add(item);
      if (Math.random() > 0.68) {
        const can = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), new THREE.MeshStandardMaterial({ color: palette[(i + s + 2) % palette.length], roughness: 0.74 }));
        can.position.set(item.position.x + 0.02, item.position.y + 0.02, item.position.z + 0.03);
        shelfGroup.add(can);
      }
    }
  }

  addCollider(x, z, width + 0.2, 1.1);
  if (label) {
    const hit = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.92), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
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
  const lotLineMat = new THREE.MeshBasicMaterial({ color: 0xe9e7e1 });
  for (let i = -3; i <= 3; i++) {
    const line = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 5.0), lotLineMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(i * 2.65, 0.025, 8.6);
    world.add(line);
  }
  const frontBar = new THREE.Mesh(new THREE.PlaneGeometry(19.2, 0.08), lotLineMat);
  frontBar.rotation.x = -Math.PI / 2;
  frontBar.position.set(0, 0.026, 10.92);
  world.add(frontBar);

  for (let i = -3; i <= 3; i += 2) {
    const block = new THREE.Mesh(new THREE.BoxGeometry(1.08, 0.15, 0.34), new THREE.MeshStandardMaterial({ map: createConcreteTexture('#b5b8bb'), roughness: 0.92 }));
    block.position.set(i * 2.1, 0.08, 8.1);
    world.add(block);
  }

  const bench = makeBox(1.7, 0.18, 0.34, 0x8a8f93, 0.86, 0.04);
  bench.position.set(-5.6, 0.42, 8.6);
  world.add(bench);
  const benchLeg1 = makeBox(0.08, 0.34, 0.08, 0x74797d);
  benchLeg1.position.set(-6.15, 0.2, 8.6); world.add(benchLeg1);
  const benchLeg2 = benchLeg1.clone(); benchLeg2.position.x = -5.05; world.add(benchLeg2);
  addCollider(-5.6, 8.6, 1.9, 0.58);

  const ashTray = makeBox(0.2, 0.92, 0.2, 0x7e878c, 0.65, 0.15);
  ashTray.position.set(-6.55, 0.46, 8.65);
  world.add(ashTray);

  const bin = makeBox(0.46, 0.8, 0.46, 0x7a817f, 0.9, 0.03);
  bin.position.set(5.75, 0.4, 8.1);
  world.add(bin);
  addCollider(5.75, 8.1, 0.66, 0.66);

  const crateColors = [0xd95f53, 0x5a76c5, 0xe3c166, 0x7fb36d];
  for (let i = 0; i < 8; i++) {
    const crate = makeBox(0.46, 0.24, 0.36, crateColors[i % crateColors.length], 0.86, 0.03);
    crate.position.set(4.7 + (i % 2) * 0.5, 0.13 + Math.floor(i / 2) * 0.25, 4.85 + (i % 4) * 0.28);
    world.add(crate);
  }

  // bike near vending
  const bike = new THREE.Group();
  bike.position.set(-7.9, 0, 8.3);
  bike.rotation.y = -0.4;
  world.add(bike);
  for (let s of [-0.45, 0.45]) {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 8, 18), new THREE.MeshStandardMaterial({ color: 0x1f2327, roughness: 0.9 }));
    wheel.position.set(s, 0.34, 0);
    wheel.rotation.y = Math.PI / 2;
    bike.add(wheel);
  }
  const frame1 = makeBox(0.95, 0.04, 0.04, 0x7f8fa3, 0.75, 0.1); frame1.position.set(0, 0.54, 0); frame1.rotation.z = 0.18; bike.add(frame1);
  const frame2 = makeBox(0.5, 0.04, 0.04, 0x7f8fa3, 0.75, 0.1); frame2.position.set(-0.12, 0.46, 0); frame2.rotation.z = -0.9; bike.add(frame2);
  const handle = makeBox(0.28, 0.04, 0.04, 0x666d73); handle.position.set(0.48, 0.84, 0); bike.add(handle);
  const seat = makeBox(0.18, 0.04, 0.1, 0x3b3d41); seat.position.set(-0.22, 0.75, 0); bike.add(seat);

  // parked kei car
  const car = new THREE.Group();
  car.position.set(7.1, 0, 7.55);
  car.rotation.y = Math.PI;
  world.add(car);
  const carBody = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.85, 1.35), new THREE.MeshStandardMaterial({ color: 0xdcd9d0, roughness: 0.74, metalness: 0.08 }));
  carBody.position.set(0, 0.48, 0);
  car.add(carBody);
  const carCabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.72, 1.18), new THREE.MeshStandardMaterial({ color: 0xe9edf0, roughness: 0.74, metalness: 0.08 }));
  carCabin.position.set(-0.2, 1.03, 0);
  car.add(carCabin);
  const carGlass = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 1.08), new THREE.MeshStandardMaterial({ color: 0x9fc0d7, transparent: true, opacity: 0.22, roughness: 0.08 }));
  carGlass.position.set(-0.2, 1.03, 0);
  car.add(carGlass);
  for (let s of [-0.85, 0.85]) {
    for (let z of [-0.6, 0.6]) {
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.22, 14), new THREE.MeshStandardMaterial({ color: 0x1a1d20, roughness: 1 }));
      tire.position.set(s, 0.28, z);
      tire.rotation.z = Math.PI / 2;
      car.add(tire);
    }
  }
  addCollider(7.1, 7.55, 2.8, 1.7);

  // vending machine improved
  const vending = new THREE.Group();
  vending.position.set(-8.7, 0, 6.6);
  world.add(vending);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.22, 2.28, 0.98), new THREE.MeshStandardMaterial({ color: 0xf0f4fb, roughness: 0.56, metalness: 0.06 }));
  body.position.set(0, 1.14, 0);
  vending.add(body);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 1.46), new THREE.MeshBasicMaterial({ color: 0xf4faff }));
  glow.position.set(0, 1.28, 0.5);
  vending.add(glow);
  const slot = makeBox(0.5, 0.08, 0.05, 0x2e3136, 0.6, 0.08);
  slot.position.set(0, 0.44, 0.5);
  vending.add(slot);
  const buyPanel = makeBox(0.18, 0.54, 0.05, 0x4d555c, 0.76, 0.18);
  buyPanel.position.set(0.36, 0.94, 0.5); vending.add(buyPanel);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 10), new THREE.MeshStandardMaterial({ color: crateColors[(r + c) % crateColors.length] }));
      can.position.set(-0.24 + c * 0.24, 0.74 + r * 0.24, 0.49);
      vending.add(can);
    }
  }
  const vendingLight = new THREE.PointLight(0xeef7ff, 1.5, 8, 1.8);
  vendingLight.position.set(0, 1.4, 1.0);
  vending.add(vendingLight);
  addCollider(-8.7, 6.6, 1.4, 1.16);
  const vendingHit = new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.3, 1.0), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  vendingHit.position.set(0, 1.1, 0);
  vending.add(vendingHit);
  addInteractable({ object: vendingHit, label: '自販機', hint: '調べる: 自販機', onInteract: () => showToast('夜の自販機は遠くからでも目印になる。歩きたくなる光。') });
}


function buildHouse({ x, z, w = 4.6, d = 4.4, color = 0xc2b39e, roof = 0x5e5752, glow = false, facing = 0, props = 'basic' }) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = facing;
  world.add(group);

  const wallTex = createConcreteTexture('#bfae9c');
  const houseMat = new THREE.MeshStandardMaterial({ map: wallTex, color, roughness: 0.98 });
  const roofMat = new THREE.MeshStandardMaterial({ color: roof, roughness: 0.96 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, 3.05, d), houseMat);
  body.position.y = 1.52;
  group.add(body);

  const roofMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, Math.max(w, d) * 0.82, 1.9, 4, 1),
    roofMat
  );
  roofMesh.position.y = 3.86;
  roofMesh.rotation.z = Math.PI / 2;
  roofMesh.rotation.y = Math.PI * 0.25;
  group.add(roofMesh);

  const eave = makeBox(w + 0.24, 0.08, 0.18, roof, 0.96, 0.02);
  eave.position.set(0, 3.02, d / 2 + 0.08);
  group.add(eave);

  const frontDoor = makeBox(0.82, 1.78, 0.08, 0x6a5848, 0.92, 0.03);
  frontDoor.position.set(0.8, 0.9, d / 2 + 0.03);
  group.add(frontDoor);
  const doorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.32), new THREE.MeshStandardMaterial({ color: 0xa9bfd0, transparent: true, opacity: 0.24 }));
  doorGlass.position.set(0.95, 1.32, d / 2 + 0.08);
  group.add(doorGlass);

  const windowMat = new THREE.MeshStandardMaterial({ color: glow ? 0xffdda0 : 0x2c3240, emissive: glow ? 0x6d5328 : 0x000000, emissiveIntensity: glow ? 0.8 : 0, roughness: 0.55 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xe4e1dc, roughness: 0.94 });
  for (const wx of [-1.1, 1.85]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.72, 0.05), frameMat);
    frame.position.set(wx, 1.9, d / 2 + 0.03);
    group.add(frame);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.58), windowMat);
    win.position.set(wx, 1.9, d / 2 + 0.06);
    group.add(win);
  }

  const ac = makeBox(0.58, 0.38, 0.32, 0xc9d0d6, 0.82, 0.06);
  ac.position.set(-w / 2 - 0.18, 1.0, 0.5);
  group.add(ac);

  const meter = makeBox(0.14, 0.42, 0.1, 0x9ca3a9, 0.7, 0.08);
  meter.position.set(w / 2 + 0.08, 1.28, -0.4); group.add(meter);

  if (props === 'basic' || props === 'garden') {
    const mailbox = makeBox(0.26, 0.34, 0.22, 0xb14f46, 0.88, 0.03);
    mailbox.position.set(1.8, 0.62, d / 2 + 0.32);
    group.add(mailbox);
    const planter = makeBox(0.7, 0.24, 0.3, 0x7f674f, 0.92, 0.02);
    planter.position.set(-1.3, 0.16, d / 2 + 0.3);
    group.add(planter);
    for (let i = 0; i < 5; i++) {
      const sprout = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.28 + Math.random() * 0.14, 5), new THREE.MeshStandardMaterial({ color: 0x5d8c45 }));
      sprout.position.set(-1.6 + i * 0.15, 0.28, d / 2 + 0.3 + (Math.random() - 0.5) * 0.08);
      group.add(sprout);
    }
  }

  if (props === 'laundry') {
    const poleL = makeBox(0.06, 1.7, 0.06, 0x888f96);
    poleL.position.set(-1.1, 0.85, d / 2 + 1.0);
    group.add(poleL);
    const poleR = poleL.clone(); poleR.position.x = 1.1; group.add(poleR);
    const wire = makeBox(2.4, 0.02, 0.02, 0xa0a8ae, 0.6, 0.2);
    wire.position.set(0, 1.6, d / 2 + 1.0); group.add(wire);
    for (let i = 0; i < 3; i++) {
      const cloth = makeBox(0.45, 0.52, 0.02, [0xe7efef, 0xe5d2ca, 0xcfd8f2][i], 0.98, 0.01);
      cloth.position.set(-0.7 + i * 0.7, 1.18, d / 2 + 1.02);
      group.add(cloth);
    }
  }

  // garden wall / small fence
  const fenceCount = Math.max(2, Math.floor(w * 1.2));
  for (let i = 0; i < fenceCount; i++) {
    const block = makeBox(0.42, 0.36, 0.12, 0xa6a099, 0.95, 0.02);
    block.position.set(-w / 2 + 0.3 + i * 0.46, 0.18, d / 2 + 0.72);
    group.add(block);
  }

  addCollider(x, z, w + 0.4, d + 0.4);
  return group;
}


function buildHouses() {
  buildHouse({ x: -3.9, z: 34.8, w: 4.8, d: 4.6, color: 0xbeafa0, roof: 0x605852, facing: 0.04, props: 'garden' });
  buildHouse({ x: 4.2, z: 33.8, w: 4.9, d: 4.3, color: 0xc5baaa, roof: 0x6b625c, facing: -0.06, glow: true, props: 'laundry' });
  buildHouse({ x: -10.8, z: -1.2, w: 5.2, d: 4.9, color: 0xc5b49f, roof: 0x57524b, facing: Math.PI * 0.48, props: 'garden' });
  buildHouse({ x: -10.4, z: -15.8, w: 4.3, d: 4.3, color: 0xbba998, roof: 0x655b50, facing: Math.PI * 0.52, glow: true, props: 'basic' });
  buildHouse({ x: 10.8, z: 14.8, w: 4.4, d: 4.2, color: 0xc1b7a6, roof: 0x64605b, facing: -Math.PI * 0.46, props: 'garden' });
  buildHouse({ x: 11.8, z: -9.8, w: 4.8, d: 4.0, color: 0xc2b4a1, roof: 0x5a524b, facing: -Math.PI * 0.48, glow: true, props: 'basic' });
  buildHouse({ x: -13.6, z: 18.5, w: 4.2, d: 3.9, color: 0xc4b8a7, roof: 0x5b554f, facing: Math.PI * 0.55, props: 'basic' });

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

  // closed snack shop / extra density spot
  const shop = new THREE.Group();
  shop.position.set(-14.2, 0, 7.8);
  shop.rotation.y = Math.PI * 0.46;
  world.add(shop);
  const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.8, 3.4), new THREE.MeshStandardMaterial({ map: createConcreteTexture('#b6a58e'), roughness: 0.98 }));
  body.position.set(0, 1.4, 0); shop.add(body);
  const roof = makeBox(5.0, 0.22, 3.6, 0x5f5c57, 0.98, 0.02); roof.position.set(0, 2.92, 0); shop.add(roof);
  const shutter = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.9, 0.08), new THREE.MeshStandardMaterial({ map: createConcreteTexture('#a7a9ad'), roughness: 0.96 }));
  shutter.position.set(-0.2, 1.1, 1.74); shop.add(shutter);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), new THREE.MeshBasicMaterial({ map: createPosterTexture(['駄菓子', 'たばこ', '休み']) }));
  sign.position.set(0.1, 2.3, 1.75); shop.add(sign);
  addCollider(-14.2, 7.8, 5.0, 3.8);
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
  legL.position.set(-0.95, 0.95, 0); board.add(legL);
  const legR = legL.clone(); legR.position.x = 0.95; board.add(legR);
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.35), new THREE.MeshStandardMaterial({ color: 0xd0c7b8, roughness: 1 }));
  panel.position.set(0, 1.25, 0.04); board.add(panel);
  const posterData = [ ['回覧', '今月の当番', '夜道注意'], ['バス', '時刻変更', '18:40 最終'], ['祭礼', '神社清掃', '土曜 7時'] ];
  posterData.forEach((lines, i) => {
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.52, 0.68), new THREE.MeshBasicMaterial({ map: createPosterTexture(lines) }));
    poster.position.set(-0.58 + i * 0.58, 1.27, 0.06); board.add(poster);
  });
  addCollider(8.55, 8.8, 2.4, 0.4);
  const boardHit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.4, 0.2), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  boardHit.position.set(0, 1.25, 0.06); board.add(boardHit);
  addInteractable({ object: boardHit, label: '掲示板', hint: '調べる: 掲示板', onInteract: () => showToast('掲示板があるだけで「ちゃんと人が住んでる町」に見える。') });

  // bus stop shelter
  const stop = new THREE.Group();
  stop.position.set(7.6, 0, 18.8); world.add(stop);
  const pole = makeBox(0.08, 2.1, 0.08, 0x92979d, 0.78, 0.18); pole.position.set(0, 1.05, 0); stop.add(pole);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.44), new THREE.MeshBasicMaterial({ map: createCanvasTexture({ width: 256, height: 256, draw(ctx, w, h) { ctx.fillStyle = '#f6f1d8'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#3a6bc0'; ctx.beginPath(); ctx.arc(w / 2, h / 2, 72, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 100px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('バ', w / 2, h / 2 + 6); } }) }));
  sign.position.set(0, 1.78, 0.12); stop.add(sign);
  const bench = makeBox(1.2, 0.16, 0.32, 0x7b8287); bench.position.set(0.8, 0.44, 0.38); stop.add(bench);
  const stopRoof = makeBox(1.6, 0.08, 0.9, 0x747b80); stopRoof.position.set(0.55, 1.76, 0.15); stop.add(stopRoof);
  const stopGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.2), new THREE.MeshStandardMaterial({ color: 0xb9d4e8, transparent: true, opacity: 0.18 }));
  stopGlass.position.set(0.95, 0.98, -0.22); stop.add(stopGlass);

  // shrine approach on far right
  const torii = new THREE.Group(); torii.position.set(13.4, 0, -30); world.add(torii);
  const red = 0xb14b42;
  const legA = makeBox(0.22, 3.2, 0.22, red, 0.88, 0.03); legA.position.set(-1.1, 1.6, 0); torii.add(legA);
  const legB = legA.clone(); legB.position.x = 1.1; torii.add(legB);
  const beamTop = makeBox(2.9, 0.18, 0.26, red, 0.88, 0.03); beamTop.position.set(0, 3.1, 0); torii.add(beamTop);
  const beamMid = makeBox(2.4, 0.14, 0.2, red, 0.88, 0.03); beamMid.position.set(0, 2.6, 0.02); torii.add(beamMid);
  const stoneSteps = new THREE.Group(); stoneSteps.position.set(13.4, 0, -25.5); world.add(stoneSteps);
  for (let i = 0; i < 5; i++) { const step = makeBox(2.0 - i * 0.08, 0.18, 1.1, 0x858a90, 0.98, 0.02); step.position.set(0, 0.09 + i * 0.15, -i * 0.86); stoneSteps.add(step); }

  // bridge over ditch
  const bridge = new THREE.Group(); bridge.position.set(4.7, 0.02, -4.8); world.add(bridge);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.06, 1.8), new THREE.MeshStandardMaterial({ map: createConcreteTexture('#8b8f94'), roughness: 0.98 }));
  slab.position.set(0, 0.03, 0); bridge.add(slab);
  const bridgeHit = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.4, 1.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0 }));
  bridgeHit.position.set(0, 0.2, 0); bridge.add(bridgeHit);
  addInteractable({ object: bridgeHit, label: '側溝', hint: '調べる: 側溝', onInteract: () => showToast('側溝や小橋があると、田舎の生活道路っぽさが一気に出る。') });

  // public phone
  const phone = new THREE.Group(); phone.position.set(-12.6, 0, -6.8); world.add(phone);
  const booth = makeBox(1.1, 2.3, 1.1, 0x9f2f3e, 0.82, 0.08); booth.position.set(0, 1.15, 0); phone.add(booth);
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.4), new THREE.MeshStandardMaterial({ color: 0xb8d9ec, transparent: true, opacity: 0.24 }));
  glass.position.set(0, 1.28, 0.56); phone.add(glass);
  addCollider(-12.6, -6.8, 1.5, 1.5);

  // small field and sign on road to inn
  const field = new THREE.Mesh(new THREE.PlaneGeometry(9, 10), new THREE.MeshStandardMaterial({ color: 0x405c2f, roughness: 1 }));
  field.rotation.x = -Math.PI / 2; field.position.set(-10.5, 0.03, -27.5); world.add(field);
  for (let i = 0; i < 160; i++) {
    const blade = makeBox(0.05, 0.35 + Math.random() * 0.5, 0.05, 0x608f46, 0.96, 0.02);
    blade.position.set(-14.8 + Math.random() * 8.6, 0.15, -31.8 + Math.random() * 8.6); world.add(blade);
  }

  const mirror = new THREE.Group(); mirror.position.set(-5.8, 0, 0.8); world.add(mirror);
  const mPole = makeBox(0.08, 2.8, 0.08, 0x888f96); mPole.position.set(0, 1.4, 0); mirror.add(mPole);
  const mDisc = new THREE.Mesh(new THREE.CircleGeometry(0.38, 24), new THREE.MeshStandardMaterial({ color: 0xff7b4e, roughness: 0.2, metalness: 0.18 }));
  mDisc.position.set(0.1, 2.5, 0); mirror.add(mDisc);

  const innSign = new THREE.Group(); innSign.position.set(7.6, 0, -34.5); world.add(innSign);
  const signPole = makeBox(0.08, 1.7, 0.08, 0x8a8f95); signPole.position.set(0, 0.85, 0); innSign.add(signPole);
  const signBoard = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.48), new THREE.MeshBasicMaterial({ map: createPosterTexture(['旅館', 'この先', '→']) }));
  signBoard.position.set(0.45, 1.5, 0.06); innSign.add(signBoard);
}


function buildTreesAndGrass() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x584636, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x314924, roughness: 1 });
  const leafDarkMat = new THREE.MeshStandardMaterial({ color: 0x25371d, roughness: 1 });

  const treeSpots = [
    [-16, 30], [-18, 18], [-17, 0], [-18, -15], [-15, -34],
    [17, 28], [19, 12], [18, -10], [21, -26], [15, -46],
    [-24, -78], [26, -82], [0, -95], [22, -60], [-22, -58]
  ];
  treeSpots.forEach(([x, z], idx) => {
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 2.8 + Math.random() * 1.4, 7), trunkMat);
    trunk.position.set(x, 1.4, z);
    world.add(trunk);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(1.1 + Math.random() * 0.8, 8, 8), i % 2 === 0 ? leafMat : leafDarkMat);
      leaf.position.set(x + (Math.random() - 0.5) * 1.2, 3.0 + i * 0.45, z + (Math.random() - 0.5) * 1.2);
      leaf.scale.y = 0.8 + Math.random() * 0.45;
      world.add(leaf);
    }
  });

  const grassMat = new THREE.MeshStandardMaterial({ color: 0x39512c, roughness: 1 });
  for (let i = 0; i < 320; i++) {
    const side = i % 3 === 0 ? -1 : 1;
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.4 + Math.random() * 0.7, 0.08), grassMat);
    const xBase = side > 0 ? 6.5 + Math.random() * 17 : -6.5 - Math.random() * 17;
    tuft.position.set(xBase + (Math.random() - 0.5) * 1.6, 0.18, 36 - Math.random() * 132);
    world.add(tuft);
  }

  // distant house lights / silhouettes
  for (let i = 0; i < 8; i++) {
    const house = makeBox(4 + Math.random() * 2, 2 + Math.random() * 1.2, 3 + Math.random() * 2, 0x151923, 1, 0);
    house.position.set(-40 + i * 10 + Math.random() * 3, 1.4, -82 - Math.random() * 26);
    world.add(house);
    if (i % 2 === 0) {
      const light = new THREE.PointLight(0xffd4a4, 0.12, 8, 2);
      light.position.set(house.position.x, 2.1, house.position.z + 1.2);
      scene.add(light);
    }
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
  return new THREE.Vector3(-Math.cos(state.yaw), 0, Math.sin(state.yaw)).normalize();
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
  const resolved = resolveMovement(nextX, nextZ, 0.28);
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
});

window.addEventListener('pointercancel', (e) => {
  if (pointerState.joystickId === e.pointerId) {
    pointerState.joystickId = null;
    resetJoystick();
  }
  if (pointerState.lookId === e.pointerId) pointerState.lookId = null;
});

app.addEventListener('pointerdown', (e) => {
  if (!state.started) return;
  if (pointerOverControl(e.target)) return;
  if (e.clientX > window.innerWidth * 0.38 && pointerState.lookId == null) beginLook(e);
});

runButton.addEventListener('click', () => {
  if (!state.started) return;
  state.isRunning = !state.isRunning;
  runButton.classList.toggle('active', state.isRunning);
  runButton.textContent = `走る: ${state.isRunning ? 'ON' : 'OFF'}`;
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

['click','pointerdown','touchend'].forEach((eventName) => {
  startButton.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    startGame();
  }, { passive: false });
});

['click','pointerdown','touchend'].forEach((eventName) => {
  introCard.addEventListener(eventName, (e) => {
    const withinPanel = e.target && (e.target.closest?.('.intro-panel'));
    if (!withinPanel || e.target === startButton || e.target.closest?.('#startButton')) {
      e.preventDefault();
      startGame();
    }
  }, { passive: false });
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
