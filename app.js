(function () {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const app = document.getElementById('app');
  const hintEl = document.getElementById('interactionHint');
  const toastEl = document.getElementById('toast');
  const introCard = document.getElementById('introCard');
  const startButton = document.getElementById('startButton');
  const errorText = document.getElementById('errorText');
  const scanlineLayer = document.getElementById('scanlineLayer');
  const scanlineToggle = document.getElementById('scanlineToggle');
  const runButton = document.getElementById('runButton');
  const interactButton = document.getElementById('interactButton');
  const joystickBase = document.getElementById('joystickBase');
  const joystickKnob = document.getElementById('joystickKnob');

  const state = {
    started: false,
    scanlines: true,
    running: false,
    player: { x: 0, y: 1.62, z: 7.5, yaw: 0, pitch: 0.06, bob: 0 },
    joystick: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    pointer: { joyId: null, lookId: null, lastX: 0, lastY: 0 },
    toastTimer: 0,
    time: 0,
    lastTs: 0,
    nearestHotspot: null,
  };

  const world = { faces: [], segments: [], colliders: [], hotspots: [], stars: [], mountains: [] };
  const palette = {
    skyTop: '#153056', skyMid: '#0a1b33', skyBottom: '#080d15',
    road: '#32363c', line: '#ddd9c7', shoulder: '#4d534d', grass: '#38523d',
    storeWall: '#c7c1b8', storeTrim: '#859096', signGreen: '#24a169', neonRed: '#da523f', neonOrange: '#e7a138',
    houseWallA: '#cac1b3', houseWallB: '#bcae9c', houseWallC: '#99978f', roofA: '#61574f', roofB: '#6c5f55', roofC: '#4f5158',
    window: '#d7d1b8', darkWindow: '#243243', pole: '#3f3f46', wire: '#22242b', concrete: '#6b6f73', vending: '#dae4f2', phone: '#7eaac5', shrine: '#8d5b42'
  };

  function showToast(text, duration = 2.3) {
    toastEl.textContent = text;
    toastEl.classList.add('show');
    state.toastTimer = duration;
  }
  function setHint(text) { hintEl.textContent = text; }
  function setSize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${h}px`);
    canvas.width = Math.floor(w * ratio);
    canvas.height = Math.floor(h * ratio);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist2(x1, z1, x2, z2) { const dx = x2 - x1; const dz = z2 - z1; return Math.hypot(dx, dz); }
  function makeVec(x, y, z) { return { x, y, z }; }

  function addFace(points, style) {
    const normal = computeNormal(points[0], points[1], points[2]);
    world.faces.push({ points, style, normal, center: centerOf(points) });
  }
  function addSegment(a, b, style) { world.segments.push({ a, b, style }); }
  function addHotspot(x, z, title, text, radius = 2.2) { world.hotspots.push({ x, z, title, text, radius }); }
  function addCollider(x1, z1, x2, z2, pad = 0.12) { world.colliders.push({ x1, z1, x2, z2, pad }); }
  function centerOf(points) {
    let x = 0, y = 0, z = 0;
    for (const p of points) { x += p.x; y += p.y; z += p.z; }
    const n = points.length;
    return { x: x / n, y: y / n, z: z / n };
  }
  function computeNormal(a, b, c) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    return { x: nx / len, y: ny / len, z: nz / len };
  }

  function addQuad(x1, z1, x2, z2, y, style) {
    addFace([
      makeVec(x1, y, z1), makeVec(x2, y, z1), makeVec(x2, y, z2), makeVec(x1, y, z2)
    ], style);
  }

  function addBox(x, y, z, w, h, d, style, collider = true) {
    const x1 = x - w / 2, x2 = x + w / 2, y1 = y, y2 = y + h, z1 = z - d / 2, z2 = z + d / 2;
    addFace([makeVec(x1,y1,z2), makeVec(x2,y1,z2), makeVec(x2,y2,z2), makeVec(x1,y2,z2)], style.front || style.side || style);
    addFace([makeVec(x2,y1,z1), makeVec(x1,y1,z1), makeVec(x1,y2,z1), makeVec(x2,y2,z1)], style.back || style.front || style);
    addFace([makeVec(x1,y1,z1), makeVec(x1,y1,z2), makeVec(x1,y2,z2), makeVec(x1,y2,z1)], style.left || style.side || style.front || style);
    addFace([makeVec(x2,y1,z2), makeVec(x2,y1,z1), makeVec(x2,y2,z1), makeVec(x2,y2,z2)], style.right || style.side || style.front || style);
    addFace([makeVec(x1,y2,z2), makeVec(x2,y2,z2), makeVec(x2,y2,z1), makeVec(x1,y2,z1)], style.top || style.side || style.front || style);
    if (collider) addCollider(x1, z1, x2, z2);
  }

  function addRoof(x, y, z, w, h, d, color) {
    const x1 = x - w / 2, x2 = x + w / 2, z1 = z - d / 2, z2 = z + d / 2;
    addFace([makeVec(x1,y,z2), makeVec(x2,y,z2), makeVec(x,y+h,z2), makeVec(x,y+h,z2)], { color, shade: 0.92 });
    addFace([makeVec(x2,y,z1), makeVec(x1,y,z1), makeVec(x,y+h,z1), makeVec(x,y+h,z1)], { color, shade: 0.82 });
    addFace([makeVec(x1,y,z1), makeVec(x1,y,z2), makeVec(x,y+h,z2), makeVec(x,y+h,z1)], { color, shade: 0.74 });
    addFace([makeVec(x2,y,z2), makeVec(x2,y,z1), makeVec(x,y+h,z1), makeVec(x,y+h,z2)], { color, shade: 0.74 });
  }

  function addHouse(x, z, variant) {
    const w = variant === 1 ? 5.8 : variant === 2 ? 5.2 : 6.4;
    const d = variant === 1 ? 4.6 : variant === 2 ? 5.6 : 4.8;
    const h = variant === 1 ? 3.2 : 3.4;
    const wall = variant === 1 ? palette.houseWallA : variant === 2 ? palette.houseWallB : palette.houseWallC;
    const roof = variant === 1 ? palette.roofA : variant === 2 ? palette.roofB : palette.roofC;
    addBox(x, 0, z, w, h, d, {
      front: { color: wall, shade: 1.0 }, back: { color: wall, shade: 0.88 }, side: { color: wall, shade: 0.76 }, top: { color: '#8a8276', shade: 0.85 }
    });
    addRoof(x, h, z, w + 0.6, 1.4, d + 0.4, roof);
    addBox(x - w * 0.18, 0, z + d * 0.5 + 0.05, 1.0, 2.0, 0.14, { front: { color: '#6a5a4d', shade: 1 }, side: { color: '#56473e', shade: 0.8 }, top: { color: '#59463f', shade: 0.82 } }, false);
    const wy = 1.3; const wz = z + d * 0.52;
    addFace([makeVec(x + w*0.12, wy-0.6, wz), makeVec(x + w*0.9/2, wy-0.6, wz), makeVec(x + w*0.9/2, wy+0.25, wz), makeVec(x + w*0.12, wy+0.25, wz)], { color: palette.window, emissive: 0.18, shade: 1.0 });
    addFace([makeVec(x - w*0.82/2, wy-0.45, z-d*0.51), makeVec(x - w*0.1, wy-0.45, z-d*0.51), makeVec(x - w*0.1, wy+0.15, z-d*0.51), makeVec(x - w*0.82/2, wy+0.15, z-d*0.51)], { color: palette.darkWindow, emissive: 0.06, shade: 0.9 });
    addBox(x + w*0.42, 0, z + d*0.2, 0.65, 0.65, 0.65, { front: { color: '#a6acb2', shade: 1 }, side: { color: '#8d949b', shade: 0.8 }, top: { color: '#bac0c4', shade: 0.9 } }, false);
    addBox(x - w*0.48, 0, z + d*0.6 + 0.4, 0.26, 1.45, 0.26, { front: { color: '#8e9ba5', shade: 1 }, side: { color: '#748089', shade: 0.76 }, top: { color: '#aeb5bd', shade: 0.86 } }, false);
    addBox(x + w*0.08, 0, z + d*0.75 + 0.6, 1.2, 0.6, 1.0, { front: { color: '#4e5f47', shade: 0.95 }, side: { color: '#40503a', shade: 0.76 }, top: { color: '#607355', shade: 0.88 } }, false);
  }

  function addPole(x, z, h = 6.8) {
    addBox(x, 0, z, 0.18, h, 0.18, { front: { color: palette.pole, shade: 1 }, side: { color: '#2c2c30', shade: 0.84 }, top: { color: '#5b5b63', shade: 0.9 } }, false);
    addBox(x + 0.45, h - 1.3, z, 1.1, 0.08, 0.08, { front: { color: '#505058', shade: 1 }, side: { color: '#34343a', shade: 0.8 }, top: { color: '#62626b', shade: 0.9 } }, false);
  }

  function addWireLine(points) {
    for (let i = 0; i < points.length - 1; i++) addSegment(points[i], points[i+1], { color: palette.wire, width: 1.2 });
  }

  function addStore() {
    // exterior shell
    addBox(0, 0, 54, 13.4, 4.6, 9.8, {
      front: { color: palette.storeWall, shade: 1 }, back: { color: '#b8b1a7', shade: 0.82 }, side: { color: '#b0a89d', shade: 0.78 }, top: { color: '#7d848b', shade: 0.85 }
    });
    // carve entrance by overlaying darker interior opening
    addFace([makeVec(-2.2, 0.05, 49.08), makeVec(2.2, 0.05, 49.08), makeVec(2.2, 4.08, 49.08), makeVec(-2.2, 4.08, 49.08)], { color: '#0f1116', shade: 1, emissive: 0.02 });
    addBox(0, 3.7, 49.05, 13.6, 0.7, 0.2, { front: { color: '#dee3e6', shade: 1 }, side: { color: '#b4bcc1', shade: 0.8 }, top: { color: '#eef3f6', shade: 0.92 } }, false);
    addBox(0, 3.1, 49.08, 13.6, 0.26, 0.26, { front: { color: palette.signGreen, shade: 1, emissive: 0.16 }, side: { color: '#1b7b50', shade: 0.85 }, top: { color: '#32b77c', shade: 0.92 } }, false);
    addFace([makeVec(-2.6, 0.05, 49.02), makeVec(-0.2, 0.05, 49.02), makeVec(-0.2, 3.2, 49.02), makeVec(-2.6, 3.2, 49.02)], { color: '#7f8f9a', shade: 0.95, glass: 0.18, emissive: 0.06 });
    addFace([makeVec(0.2, 0.05, 49.02), makeVec(2.6, 0.05, 49.02), makeVec(2.6, 3.2, 49.02), makeVec(0.2, 3.2, 49.02)], { color: '#8ea1ad', shade: 0.95, glass: 0.2, emissive: 0.06 });
    addFace([makeVec(-5.6, 0.7, 49.0), makeVec(-2.9, 0.7, 49.0), makeVec(-2.9, 2.7, 49.0), makeVec(-5.6, 2.7, 49.0)], { color: '#dbe0de', shade: 0.92, emissive: 0.15, glass: 0.1 });
    addFace([makeVec(2.95, 0.7, 49.0), makeVec(5.65, 0.7, 49.0), makeVec(5.65, 2.7, 49.0), makeVec(2.95, 2.7, 49.0)], { color: '#dbe0de', shade: 0.92, emissive: 0.15, glass: 0.1 });

    // interior floor and walls
    addQuad(-6.2, 49.2, 6.2, 58.5, 0.01, { color: '#d1d0ca', shade: 1.0, ground: true });
    addFace([makeVec(-6.2,0,58.5), makeVec(6.2,0,58.5), makeVec(6.2,4.2,58.5), makeVec(-6.2,4.2,58.5)], { color: '#b7aea4', shade: 0.82 });
    addFace([makeVec(-6.2,0,49.3), makeVec(-6.2,0,58.5), makeVec(-6.2,4.2,58.5), makeVec(-6.2,4.2,49.3)], { color: '#bfb5a7', shade: 0.8 });
    addFace([makeVec(6.2,0,58.5), makeVec(6.2,0,49.3), makeVec(6.2,4.2,49.3), makeVec(6.2,4.2,58.5)], { color: '#b7aea2', shade: 0.78 });
    // wallpaper stripes
    for (let i = -6; i <= 6; i += 0.9) {
      addFace([makeVec(i,0.1,58.42), makeVec(i+0.34,0.1,58.42), makeVec(i+0.34,4.12,58.42), makeVec(i,4.12,58.42)], { color: '#837867', shade: 0.9, alpha: 0.28 });
    }

    // counters and shelves
    addBox(3.85, 0, 54.6, 2.4, 1.1, 3.3, { front: { color: '#b8b8b2', shade: 1 }, side: { color: '#9ca1a5', shade: 0.82 }, top: { color: '#e3e4e1', shade: 0.96 } });
    addBox(5.0, 1.1, 54.4, 1.1, 0.8, 0.9, { front: { color: '#2d3135', shade: 1, emissive: 0.05 }, side: { color: '#20262d', shade: 0.8 }, top: { color: '#43484d', shade: 0.92 } }, false);
    addFace([makeVec(4.65,1.35,54.86), makeVec(5.35,1.35,54.86), makeVec(5.35,1.95,54.86), makeVec(4.65,1.95,54.86)], { color: '#f49b46', shade: 1, emissive: 0.45 });
    addFace([makeVec(4.4,1.48,54.15), makeVec(4.85,1.48,54.15), makeVec(4.85,1.78,54.15), makeVec(4.4,1.78,54.15)], { color: '#50d36f', shade: 1, emissive: 0.4 });
    addBox(-4.95, 0, 55.25, 1.2, 2.0, 2.6, { front: { color: '#dce1ea', shade: 1, emissive: 0.16 }, side: { color: '#c9d0d7', shade: 0.85 }, top: { color: '#edf1f5', shade: 0.96 } });
    addBox(-2.95, 0, 55.15, 1.2, 2.0, 2.6, { front: { color: '#dce1ea', shade: 1, emissive: 0.16 }, side: { color: '#c9d0d7', shade: 0.85 }, top: { color: '#edf1f5', shade: 0.96 } });
    addBox(-0.2, 0, 53.65, 1.1, 1.6, 3.8, { front: { color: '#4b4e59', shade: 1 }, side: { color: '#3a3e48', shade: 0.82 }, top: { color: '#6a7079', shade: 0.94 } });
    addBox(1.6, 0, 53.65, 1.1, 1.6, 3.8, { front: { color: '#4b4e59', shade: 1 }, side: { color: '#3a3e48', shade: 0.82 }, top: { color: '#6a7079', shade: 0.94 } });
    addBox(-5.6, 0, 51.8, 0.55, 1.3, 2.4, { front: { color: '#cfd6df', shade: 1, emissive: 0.2 }, side: { color: '#bcc5cf', shade: 0.82 }, top: { color: '#eef1f5', shade: 0.96 } }, false);
    // magazine rack
    addBox(5.6, 0, 50.9, 0.65, 1.5, 1.9, { front: { color: '#c7b8aa', shade: 1 }, side: { color: '#a99888', shade: 0.8 }, top: { color: '#d8c8bb', shade: 0.92 } }, false);
    for (let i = 0; i < 4; i++) {
      const y = 0.35 + i * 0.28;
      addFace([makeVec(5.28,y,50.02 + i*0.1), makeVec(5.92,y,50.1 + i*0.1), makeVec(5.92,y+0.2,50.52 + i*0.1), makeVec(5.28,y+0.2,50.44 + i*0.1)], { color: i % 2 ? '#f0c9c1' : '#d9e6f6', shade: 1, emissive: 0.08 });
    }
    // interior lights
    addFace([makeVec(-4.8,4.14,51.1), makeVec(-2.4,4.14,51.1), makeVec(-2.4,4.14,52.0), makeVec(-4.8,4.14,52.0)], { color: '#f4f2ec', shade: 1, emissive: 0.5 });
    addFace([makeVec(1.3,4.14,51.1), makeVec(4.5,4.14,51.1), makeVec(4.5,4.14,52.0), makeVec(1.3,4.14,52.0)], { color: '#f4f2ec', shade: 1, emissive: 0.5 });
    addHotspot(3.8, 54.7, 'レジ', 'レジ台。緑の時計と古いCRTが置かれている。');
    addHotspot(-4.9, 55.3, '冷蔵ケース', 'ペットボトルと缶がぎっしり。白い冷気が少しだけ漏れている。');
    addHotspot(5.58, 50.9, '雑誌棚', '薄い週刊誌と地元の無料冊子。縁が少し色褪せている。');

    // store collisions interior obstacles
    addCollider(-6.7, 49.1, 6.7, 49.35); addCollider(-6.7, 58.35, 6.7, 58.7); addCollider(-6.7, 49.1, -6.0, 58.7); addCollider(6.0, 49.1, 6.7, 58.7);
  }

  function buildWorld() {
    world.faces.length = 0; world.segments.length = 0; world.colliders.length = 0; world.hotspots.length = 0;
    // stars
    world.stars = Array.from({ length: 54 }, () => ({ x: Math.random(), y: Math.random() * 0.52, a: 0.25 + Math.random() * 0.7, s: 0.6 + Math.random() * 1.4 }));
    world.mountains = [
      [0.00,0.68],[0.12,0.62],[0.22,0.66],[0.34,0.58],[0.46,0.64],[0.61,0.56],[0.75,0.62],[0.89,0.54],[1.0,0.62],[1.0,1],[0,1]
    ];
    // base ground
    addQuad(-40,-10,40,140,0, { color: '#3c533f', shade: 0.88, ground: true });
    // main road
    addQuad(-4.5,0,4.5,92,0.01, { color: palette.road, shade: 1, ground: true, road: true });
    addQuad(-6.1,0,-4.5,92,0.0, { color: '#434f43', shade: 0.88, ground: true });
    addQuad(4.5,0,6.1,92,0.0, { color: '#434f43', shade: 0.88, ground: true });
    // road markings
    for (let z = 3; z < 90; z += 9) addQuad(-0.08, z, 0.08, z + 3.7, 0.03, { color: '#dcd7c7', shade: 1.0, ground: true });
    addQuad(-4.28, 0, -4.05, 92, 0.03, { color: '#dcd7c7', shade: 1, ground: true });
    addQuad(4.05, 0, 4.28, 92, 0.03, { color: '#dcd7c7', shade: 1, ground: true });

    // branch road and shrine path
    addQuad(-18,42,-4.5,48,0.01, { color: '#36393f', shade: 1, ground: true });
    addQuad(4.5,28,15,34,0.01, { color: '#373a40', shade: 1, ground: true });
    addQuad(8.8,34,15.2,72,0.01, { color: '#44473f', shade: 0.94, ground: true });
    addQuad(15.2,34,23,72,0.0, { color: '#35503b', shade: 0.92, ground: true });

    // ditch and small bridge
    addQuad(6.2,30,8.3,74,-0.18, { color: '#29465c', shade: 0.92, ground: true, water: true });
    addQuad(6.15,42.6,8.35,45.2,0.02, { color: '#8c8c82', shade: 0.92, ground: true });
    addFace([makeVec(6.2,0.65,42.6),makeVec(6.2,0.65,45.2),makeVec(6.2,0.75,45.2),makeVec(6.2,0.75,42.6)], { color: '#9a9a90', shade: 1 });
    addFace([makeVec(8.3,0.65,45.2),makeVec(8.3,0.65,42.6),makeVec(8.3,0.75,42.6),makeVec(8.3,0.75,45.2)], { color: '#9a9a90', shade: 1 });

    // home side objects
    addHouse(-10.2, 15, 1);
    addHouse(-13.5, 30, 2);
    addHouse(-12.4, 44, 3);
    addHouse(12.4, 21, 2);
    addHouse(14.2, 41, 1);

    // bulletin board
    addBox(-5.5, 0, 39.2, 1.8, 1.65, 0.18, { front: { color: '#c3b59e', shade: 1 }, side: { color: '#8e7d63', shade: 0.78 }, top: { color: '#d0c0ab', shade: 0.9 } }, false);
    addFace([makeVec(-6.2,0.3,39.31),makeVec(-4.8,0.3,39.31),makeVec(-4.8,1.45,39.31),makeVec(-6.2,1.45,39.31)], { color: '#efe1bd', shade: 1, emissive: 0.06 });
    addHotspot(-5.5, 39.2, '掲示板', '夏祭りのお知らせ、資源回収、落とし物の紙。色褪せたピンが刺さっている。');

    // phone booth
    addBox(-7.8, 0, 23.2, 1.4, 2.45, 1.4, { front: { color: '#95b7c8', shade: 1, glass: 0.26 }, side: { color: '#7a9baa', shade: 0.82, glass: 0.24 }, top: { color: '#c6d4de', shade: 0.94 } });
    addHotspot(-7.8, 23.2, '公衆電話', '曇った透明パネルの中に、緑色の受話器がぶら下がっている。');

    // bus stop
    addBox(10.8, 0, 34.0, 0.25, 2.2, 1.3, { front: { color: '#bcc7cf', shade: 1 }, side: { color: '#8d9aa3', shade: 0.78 }, top: { color: '#dfe5ea', shade: 0.94 } }, false);
    addFace([makeVec(9.5,0.4,34.7),makeVec(12.1,0.4,34.7),makeVec(12.1,1.7,34.7),makeVec(9.5,1.7,34.7)], { color: '#dbe2e6', shade: 1, glass: 0.18 });
    addHotspot(10.8, 34.2, 'バス停', '一日の本数が少ない路線。ベンチの端が少し錆びている。');

    // vending machine
    addBox(6.2, 0, 46.2, 1.25, 2.2, 1.0, { front: { color: palette.vending, shade: 1, emissive: 0.18 }, side: { color: '#c3ccd4', shade: 0.82 }, top: { color: '#eef2f5', shade: 0.96 } });
    addHotspot(6.2, 46.2, '自販機', '夜だけやけに白く見える自販機。ボタンの赤だけが浮いている。');

    // car / bike
    addBox(2.4, 0, 38.3, 2.3, 1.1, 4.2, { front: { color: '#8897aa', shade: 1 }, side: { color: '#637388', shade: 0.82 }, top: { color: '#aeb6c4', shade: 0.94 } });
    addBox(6.7, 0, 37.0, 0.16, 0.8, 1.4, { front: { color: '#cfd7de', shade: 1 }, side: { color: '#aab3bb', shade: 0.82 }, top: { color: '#eef3f6', shade: 0.96 } }, false);
    addSegment(makeVec(6.4,0.55,37.0), makeVec(7.0,0.8,37.0), { color: '#4b4f54', width: 1.1 });
    addSegment(makeVec(7.0,0.8,37.0), makeVec(7.2,0.55,37.3), { color: '#4b4f54', width: 1.1 });

    // closed shop
    addBox(13.6, 0, 53.6, 6.8, 3.8, 6.4, { front: { color: '#7f7567', shade: 1 }, side: { color: '#665d53', shade: 0.78 }, top: { color: '#4f504f', shade: 0.86 } });
    addFace([makeVec(10.8,0.7,50.4),makeVec(16.4,0.7,50.4),makeVec(16.4,2.8,50.4),makeVec(10.8,2.8,50.4)], { color: '#5f4b44', shade: 0.9 });
    addFace([makeVec(11.5,3.0,50.35),makeVec(15.7,3.0,50.35),makeVec(15.7,3.55,50.35),makeVec(11.5,3.55,50.35)], { color: '#a66a53', shade: 1, emissive: 0.05 });
    addHotspot(13.6, 53.6, '閉店した店', '駄菓子屋みたいな看板だけ残っている。シャッターの前に色褪せた箱。');

    // fields and fences
    addQuad(15.4,18,27,40,0.0, { color: '#4f6a3d', shade: 0.95, ground: true });
    addQuad(15.8,41,25.5,67,0.0, { color: '#4f6a3d', shade: 0.92, ground: true });
    for (let z = 18; z < 67; z += 4) {
      addSegment(makeVec(14.9,0.65,z), makeVec(27.3,0.65,z), { color: '#6c7063', width: 0.8 });
    }

    // shrine path and torii-ish gate
    addQuad(-22,44,-18,46,0.01, { color: '#4b4842', shade: 0.94, ground: true });
    addBox(-24.5, 0, 45, 0.22, 2.1, 0.22, { front: { color: palette.shrine, shade: 1 }, side: { color: '#6f4734', shade: 0.78 }, top: { color: '#a96b51', shade: 0.9 } }, false);
    addBox(-22.5, 0, 45, 0.22, 2.1, 0.22, { front: { color: palette.shrine, shade: 1 }, side: { color: '#6f4734', shade: 0.78 }, top: { color: '#a96b51', shade: 0.9 } }, false);
    addBox(-23.5, 2.0, 45, 2.4, 0.18, 0.18, { front: { color: '#a45f44', shade: 1 }, side: { color: '#824732', shade: 0.8 }, top: { color: '#b66d4f', shade: 0.92 } }, false);
    addHotspot(-23.5, 45.3, '神社側', '細い分岐の先に石段と小さな鳥居。夜は奥がほとんど見えない。');

    // convenience store and parking
    addStore();
    addQuad(-8.6,35.6,8.6,49.0,0.01, { color: '#404449', shade: 1, ground: true });
    for (let x = -6.0; x <= 6.0; x += 3) {
      addQuad(x-0.04, 39.2, x+0.04, 47.4, 0.03, { color: '#e4e0d2', shade: 1, ground: true });
    }
    addQuad(-6.6,39.1,-3.3,39.3,0.03, { color: '#e4e0d2', shade: 1, ground: true });
    addQuad(3.3,39.1,6.6,39.3,0.03, { color: '#e4e0d2', shade: 1, ground: true });
    addBox(8.8, 0, 50.2, 1.8, 0.7, 0.7, { front: { color: '#7d7d72', shade: 1 }, side: { color: '#616158', shade: 0.78 }, top: { color: '#909088', shade: 0.9 } }, false);

    // utility poles and wires
    const poleZs = [8, 18, 28, 40, 52, 64, 78];
    poleZs.forEach((z, i) => addPole(7.1 + (i % 2 ? 0.3 : 0), z, i === 4 ? 7.2 : 6.8));
    const leftPoints = poleZs.map((z, i) => makeVec(7.1 + (i % 2 ? 0.3 : 0), 5.7 + (i===4?0.3:0), z));
    const leftPoints2 = poleZs.map((z, i) => makeVec(7.25 + (i % 2 ? 0.3 : 0), 5.3 + (i===4?0.25:0), z));
    addWireLine(leftPoints); addWireLine(leftPoints2);
    poleZs.forEach((z, i) => addPole(-7.4 - (i % 2 ? 0.35 : 0), z + 6, 6.4));
    const rightPoints = poleZs.map((z, i) => makeVec(-7.4 - (i % 2 ? 0.35 : 0), 5.4, z + 6));
    addWireLine(rightPoints);

    // road accessories
    addHotspot(0.2, 55.0, 'コンビニ入口', '白い蛍光灯が強め。夜道から見ると安心感がある。');
    addHotspot(1.8, 70.0, '旅館へ続く道', '奥へ伸びる一本道。街灯が減って、先の方だけ暗い。');
    addHotspot(-11.5, 44.0, '民家の並び', '家そのものより、室外機や郵便受けが生活感を出している。');
    addHotspot(7.3, 43.4, '小橋', '側溝をまたぐ小さな橋。脇のコンクリが少し欠けている。');

    addCollider(-24, 0, -23.0, 70); // left outer block
    addCollider(23.0, 0, 24, 90);   // right outer block
    addCollider(-24, -1, 24, 0);    // front block
  }

  function projectPoint(p) {
    const dx = p.x - state.player.x;
    const dy = p.y - state.player.y;
    const dz = p.z - state.player.z;
    const sy = Math.sin(state.player.yaw), cy = Math.cos(state.player.yaw);
    let x = dx * cy - dz * sy;
    let z = dx * sy + dz * cy;
    const sp = Math.sin(state.player.pitch), cp = Math.cos(state.player.pitch);
    let y = dy * cp - z * sp;
    z = dy * sp + z * cp;
    return { x, y, z };
  }

  function toScreen(v) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const scale = h * 0.92;
    return { x: w * 0.5 + (v.x / v.z) * scale, y: h * 0.55 - (v.y / v.z) * scale };
  }

  function shadeColor(hex, mul = 1, add = 0) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(Math.round(r * mul + add), 0, 255);
    g = clamp(Math.round(g * mul + add), 0, 255);
    b = clamp(Math.round(b * mul + add), 0, 255);
    return `rgb(${r},${g},${b})`;
  }

  function drawBackground() {
    const w = window.innerWidth, h = window.innerHeight;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, palette.skyTop);
    sky.addColorStop(0.42, palette.skyMid);
    sky.addColorStop(0.75, palette.skyBottom);
    sky.addColorStop(1, '#05070c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // dusk orange near horizon
    const horizon = ctx.createRadialGradient(w * 0.5, h * 0.54, 10, w * 0.5, h * 0.58, w * 0.6);
    horizon.addColorStop(0, 'rgba(255,152,64,0.22)');
    horizon.addColorStop(0.42, 'rgba(255,117,34,0.08)');
    horizon.addColorStop(1, 'rgba(255,117,34,0.0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, h * 0.34, w, h * 0.5);

    for (const s of world.stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#dbe6ff';
      ctx.fillRect(s.x * w, s.y * h, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    ctx.fillStyle = '#111923';
    ctx.beginPath();
    const m = world.mountains;
    ctx.moveTo(m[0][0] * w, m[0][1] * h);
    for (let i = 1; i < m.length; i++) ctx.lineTo(m[i][0] * w, m[i][1] * h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(18,28,38,0.75)';
    ctx.fillRect(0, h * 0.66, w, h * 0.06);
  }

  function drawQuad(points, style, depth) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();

    let baseMul = style.shade || 1;
    const fog = clamp((depth - 10) / 140, 0, 1);
    baseMul *= 1 - fog * 0.38;
    const color = shadeColor(style.color || '#aaa', baseMul, 0);
    ctx.globalAlpha = style.alpha != null ? style.alpha : 1;
    ctx.fillStyle = color;
    ctx.fill();

    if (style.emissive) {
      ctx.globalAlpha = style.emissive * (1 - fog * 0.45);
      ctx.fillStyle = shadeColor(style.color || '#fff', 1.15, 16);
      ctx.fill();
    }

    if (style.glass) {
      ctx.globalAlpha = style.glass;
      ctx.fillStyle = 'rgba(180,210,255,0.42)';
      ctx.fill();
      ctx.globalAlpha = 0.14;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (!style.ground) {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function renderWorld() {
    drawBackground();
    const quads = [];
    for (const face of world.faces) {
      const cam = face.points.map(projectPoint);
      if (cam.every(v => v.z <= 0.16)) continue;
      if (cam.some(v => v.z <= 0.16)) continue;
      const pts = cam.map(toScreen);
      // backface cull
      let area = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        area += a.x * b.y - b.x * a.y;
      }
      if (area > 0) continue;
      const depth = cam.reduce((sum, v) => sum + v.z, 0) / cam.length;
      quads.push({ pts, style: face.style, depth });
    }
    quads.sort((a, b) => b.depth - a.depth);
    for (const q of quads) drawQuad(q.pts, q.style, q.depth);

    // wires / thin segments
    for (const seg of world.segments) {
      const a = projectPoint(seg.a), b = projectPoint(seg.b);
      if (a.z <= 0.16 || b.z <= 0.16) continue;
      const pa = toScreen(a), pb = toScreen(b);
      const fog = clamp(((a.z + b.z) * 0.5 - 10) / 140, 0, 1);
      ctx.strokeStyle = shadeColor(seg.style.color || '#222', 1 - fog * 0.35, 0);
      ctx.lineWidth = Math.max(0.6, seg.style.width * (1 - fog * 0.7));
      ctx.globalAlpha = 0.95;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function updateNearestHotspot() {
    state.nearestHotspot = null;
    let best = 999;
    for (const h of world.hotspots) {
      const dist = dist2(state.player.x, state.player.z, h.x, h.z);
      if (dist > h.radius) continue;
      const dx = h.x - state.player.x;
      const dz = h.z - state.player.z;
      const angle = Math.atan2(dx, dz) - state.player.yaw;
      const facing = Math.cos(angle);
      if (facing < 0.2) continue;
      if (dist < best) { best = dist; state.nearestHotspot = h; }
    }
    if (state.nearestHotspot) setHint(`調べる: ${state.nearestHotspot.title}`);
    else setHint('歩いて気持ちいい田舎町テスト。道・民家・店の明かりの感じを確認。');
  }

  function interact() {
    updateNearestHotspot();
    if (state.nearestHotspot) showToast(state.nearestHotspot.text, 2.8);
    else showToast('近くに調べられる場所はない。まずは店や路地の近くに寄ってみる。', 2.2);
  }

  function collideAndMove(nx, nz) {
    const radius = 0.36;
    let x = nx, z = nz;
    for (const c of world.colliders) {
      const minX = Math.min(c.x1, c.x2) - radius - c.pad;
      const maxX = Math.max(c.x1, c.x2) + radius + c.pad;
      const minZ = Math.min(c.z1, c.z2) - radius - c.pad;
      const maxZ = Math.max(c.z1, c.z2) + radius + c.pad;
      if (x > minX && x < maxX && z > minZ && z < maxZ) {
        const dx = Math.min(Math.abs(x - minX), Math.abs(maxX - x));
        const dz = Math.min(Math.abs(z - minZ), Math.abs(maxZ - z));
        if (dx < dz) x = x < (minX + maxX) * 0.5 ? minX : maxX;
        else z = z < (minZ + maxZ) * 0.5 ? minZ : maxZ;
      }
    }
    state.player.x = clamp(x, -22.5, 22.5);
    state.player.z = clamp(z, 1.2, 89.5);
  }

  function update(dt) {
    state.time += dt;
    if (state.toastTimer > 0) {
      state.toastTimer -= dt;
      if (state.toastTimer <= 0) toastEl.classList.remove('show');
    }

    const forward = -state.joystick.y;
    const strafe = state.joystick.x;
    const mag = Math.min(1, Math.hypot(forward, strafe));
    const moveSpeed = (state.running ? 6.0 : 3.85) * mag;
    const dx = Math.sin(state.player.yaw) * forward + Math.cos(state.player.yaw) * strafe;
    const dz = Math.cos(state.player.yaw) * forward - Math.sin(state.player.yaw) * strafe;
    collideAndMove(state.player.x + dx * moveSpeed * dt, state.player.z + dz * moveSpeed * dt);

    state.player.yaw += state.look.x * dt;
    state.player.pitch = clamp(state.player.pitch + state.look.y * dt, -0.42, 0.22);
    state.look.x *= 0.35;
    state.look.y *= 0.35;
    updateNearestHotspot();
  }

  function frame(ts) {
    const dt = Math.min(0.033, Math.max(0.001, (ts - (state.lastTs || ts)) / 1000));
    state.lastTs = ts;
    if (state.started) update(dt);
    renderWorld();
    requestAnimationFrame(frame);
  }

  function centerJoystick() {
    joystickKnob.style.left = '26%';
    joystickKnob.style.top = '26%';
  }

  function updateJoystickFromEvent(e) {
    const rect = joystickBase.getBoundingClientRect();
    const cx = rect.left + rect.width * 0.5;
    const cy = rect.top + rect.height * 0.5;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    const radius = rect.width * 0.34;
    const len = Math.hypot(dx, dy) || 1;
    const px = clamp(dx / radius, -1, 1);
    const py = clamp(dy / radius, -1, 1);
    const nx = len > radius ? dx / len * radius : dx;
    const ny = len > radius ? dy / len * radius : dy;
    joystickKnob.style.left = `${26 + (nx / rect.width) * 100}%`;
    joystickKnob.style.top = `${26 + (ny / rect.height) * 100}%`;
    state.joystick.x = clamp(px, -1, 1);
    state.joystick.y = clamp(py, -1, 1);
  }

  function pointerOverControl(target) {
    return !!target.closest?.('#joystickBase, #runButton, #interactButton, #scanlineToggle, #startButton, .intro-panel');
  }

  function startGame() {
    state.started = true;
    introCard.classList.add('hidden');
    showToast('ローカル動作版で開始。道、店、民家、路地の密度を確認。', 2.8);
    setHint('左で移動、右半分ドラッグで視点。走るはON/OFF切替。');
  }

  function safeStart(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }
    try {
      startGame();
    } catch (err) {
      errorText.textContent = '開始処理でエラーが出ました。';
      console.error(err);
    }
  }

  // Events
  ['click', 'pointerup', 'touchend'].forEach(name => startButton.addEventListener(name, safeStart, { passive: false }));
  scanlineToggle.addEventListener('click', function () {
    state.scanlines = !state.scanlines;
    scanlineLayer.classList.toggle('off', !state.scanlines);
    scanlineToggle.textContent = `SCANLINE: ${state.scanlines ? 'ON' : 'OFF'}`;
  });
  runButton.addEventListener('click', function () {
    state.running = !state.running;
    runButton.textContent = `走る: ${state.running ? 'ON' : 'OFF'}`;
    runButton.classList.toggle('active', state.running);
  });
  interactButton.addEventListener('pointerdown', function (e) { e.preventDefault(); interact(); });
  interactButton.addEventListener('click', function (e) { e.preventDefault(); interact(); });

  joystickBase.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    state.pointer.joyId = e.pointerId;
    joystickBase.setPointerCapture(e.pointerId);
    updateJoystickFromEvent(e);
  });
  window.addEventListener('pointermove', function (e) {
    if (state.pointer.joyId === e.pointerId) updateJoystickFromEvent(e);
    if (state.pointer.lookId === e.pointerId) {
      const dx = e.clientX - state.pointer.lastX;
      const dy = e.clientY - state.pointer.lastY;
      state.pointer.lastX = e.clientX;
      state.pointer.lastY = e.clientY;
      state.look.x += dx * 0.032;
      state.look.y += dy * -0.022;
    }
  }, { passive: false });
  window.addEventListener('pointerup', function (e) {
    if (state.pointer.joyId === e.pointerId) {
      state.pointer.joyId = null;
      state.joystick.x = 0; state.joystick.y = 0;
      centerJoystick();
    }
    if (state.pointer.lookId === e.pointerId) state.pointer.lookId = null;
  });
  window.addEventListener('pointercancel', function (e) {
    if (state.pointer.joyId === e.pointerId) {
      state.pointer.joyId = null;
      state.joystick.x = 0; state.joystick.y = 0;
      centerJoystick();
    }
    if (state.pointer.lookId === e.pointerId) state.pointer.lookId = null;
  });
  app.addEventListener('pointerdown', function (e) {
    if (!state.started) return;
    if (pointerOverControl(e.target)) return;
    if (e.clientX > window.innerWidth * 0.42 && state.pointer.lookId == null) {
      state.pointer.lookId = e.pointerId;
      state.pointer.lastX = e.clientX; state.pointer.lastY = e.clientY;
    }
  });

  window.addEventListener('resize', setSize);
  window.addEventListener('orientationchange', function () { setTimeout(setSize, 120); });

  // boot
  try {
    setSize();
    centerJoystick();
    buildWorld();
    renderWorld();
    requestAnimationFrame(frame);
    showToast('外部ライブラリなし版を読み込み完了。', 1.6);
  } catch (err) {
    errorText.textContent = '初期化でエラーが出ました。';
    console.error(err);
  }
})();
