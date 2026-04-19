(() => {
  'use strict';

  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const runBtn = document.getElementById('runBtn');
  const scanBtn = document.getElementById('scanBtn');
  const qualityBtn = document.getElementById('qualityBtn');
  const hintEl = document.getElementById('hint');
  const actBtn = document.getElementById('actBtn');
  const pad = document.getElementById('pad');
  const stick = document.getElementById('stick');
  const app = document.getElementById('app');

  const state = {
    x: 14.5,
    y: 25.4,
    angle: -1.58,
    joyX: 0,
    joyY: 0,
    run: false,
    scanline: true,
    quality: 'mid',
    messageUntil: 0,
    hint: 'コンビニ前スタート。重さを抑えつつ、立体感と街の密度を戻した版です。',
  };

  const qualityPresets = {
    low: { w: 180, h: 320, floorStepX: 2, floorStepY: 3, maxDist: 18 },
    mid: { w: 220, h: 392, floorStepX: 2, floorStepY: 2, maxDist: 20 },
    high: { w: 260, h: 462, floorStepX: 1, floorStepY: 2, maxDist: 22 },
  };

  let renderW = 220;
  let renderH = 392;
  let floorStepX = 2;
  let floorStepY = 2;
  let MAX_DIST = 20;
  let HALF_FOV = Math.PI / 6.2;
  let FOV = HALF_FOV * 2;
  let horizonBase = 170;
  let zBuffer = new Float32Array(renderW);
  let wallTop = new Int16Array(renderW);
  let wallBottom = new Int16Array(renderW);
  let lastFrame = 0;
  let fpsStep = 1000 / 30;
  let lookId = null;
  let lookLastX = 0;
  let joyId = null;

  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d', { alpha: false, desynchronized: true });
  offCtx.imageSmoothingEnabled = true;
  ctx.imageSmoothingEnabled = true;

  function setRenderQuality(name) {
    state.quality = name;
    const p = qualityPresets[name];
    renderW = p.w;
    renderH = p.h;
    floorStepX = p.floorStepX;
    floorStepY = p.floorStepY;
    MAX_DIST = p.maxDist;
    off.width = renderW;
    off.height = renderH;
    zBuffer = new Float32Array(renderW);
    wallTop = new Int16Array(renderW);
    wallBottom = new Int16Array(renderW);
    qualityBtn.textContent = `QUALITY: ${name.toUpperCase()}`;
  }

  function resizeVisible() {
    canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
    canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
  }

  window.addEventListener('resize', () => {
    resizeVisible();
    if (window.innerWidth < 390) setRenderQuality('low');
    else setRenderQuality(state.quality);
  });

  if (window.innerWidth < 390) setRenderQuality('low');
  else setRenderQuality('mid');
  resizeVisible();

  const TEX = {};
  const SPR = {};

  function texCanvas(w = 64, h = 64) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function buildTex(name, painter, w = 64, h = 64) {
    const c = texCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    painter(g, w, h);
    TEX[name] = c;
  }
  function buildSpr(name, painter, w = 64, h = 96) {
    const c = texCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    painter(g, w, h);
    SPR[name] = c;
  }

  function grain(g, w, h, alpha = 0.08, count = 180) {
    for (let i = 0; i < count; i++) {
      const c = 150 + Math.random() * 90 | 0;
      g.fillStyle = `rgba(${c},${c},${c},${Math.random() * alpha})`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
  }

  buildTex('store', (g, w, h) => {
    const wall = g.createLinearGradient(0, 0, 0, h);
    wall.addColorStop(0, '#d7d0c3');
    wall.addColorStop(1, '#b3ab9f');
    g.fillStyle = wall; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 10) {
      g.fillStyle = x % 20 ? '#d8d1c5' : '#bdb4a8';
      g.fillRect(x, 0, 6, h);
    }
    g.fillStyle = '#1cbe88'; g.fillRect(0, 8, w, 5);
    g.fillStyle = '#c34d48'; g.fillRect(0, 14, w, 3);
    g.fillStyle = '#f4f3ef'; g.fillRect(4, 24, 16, 22);
    g.fillStyle = '#cad9ea'; g.fillRect(6, 26, 12, 18);
    g.fillStyle = '#f4f3ef'; g.fillRect(w - 20, 24, 16, 22);
    g.fillStyle = '#cbd9ec'; g.fillRect(w - 18, 26, 12, 18);
    g.fillStyle = '#222830'; g.fillRect(w / 2 - 10, 20, 20, h - 20);
    g.fillStyle = '#0f141b'; g.fillRect(w / 2 - 7, 20, 14, h - 20);
    grain(g, w, h, 0.05, 130);
  });

  buildTex('house', (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#d8cdbd'); grad.addColorStop(1, '#b59f89');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 8) {
      g.fillStyle = x % 16 ? '#d3c8b8' : '#b39f8c';
      g.fillRect(x, 0, 5, h);
    }
    g.fillStyle = '#6f6257'; g.fillRect(0, 0, w, 9);
    g.fillStyle = '#7f725f'; g.fillRect(6, 24, 18, 28);
    g.fillStyle = '#f0efe8'; g.fillRect(10, 28, 10, 18);
    g.fillStyle = '#5a584f'; g.fillRect(36, 25, 18, 16);
    g.fillStyle = '#f2f0ea'; g.fillRect(39, 28, 12, 10);
    grain(g, w, h, 0.03, 120);
  });

  buildTex('wallpaper', (g, w, h) => {
    g.fillStyle = '#d7cfbf'; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 9) {
      g.fillStyle = x % 18 ? '#c6bba8' : '#b4a792';
      g.fillRect(x, 0, 5, h);
    }
    g.fillStyle = 'rgba(90,70,45,.08)';
    for (let y = 0; y < h; y += 12) g.fillRect(0, y, w, 1);
    grain(g, w, h, 0.02, 90);
  });

  buildTex('fridge', (g, w, h) => {
    g.fillStyle = '#e4eaef'; g.fillRect(0, 0, w, h);
    for (let x = 8; x < w; x += 18) {
      g.fillStyle = '#b7c4cf'; g.fillRect(x, 0, 2, h);
    }
    for (let y = 10; y < h; y += 16) {
      g.fillStyle = '#ccd7e0'; g.fillRect(0, y, w, 2);
      for (let x = 2; x < w; x += 10) {
        g.fillStyle = ['#ffffff','#7fc7ff','#ff6a5a','#5bd48b','#d99bff'][(x + y) % 5];
        g.fillRect(x, y + 2, 6, 8);
      }
    }
    g.fillStyle = 'rgba(120, 150, 170, .14)'; g.fillRect(0, 0, w, h);
  });

  buildTex('shutter', (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#8d857b'); grad.addColorStop(1, '#69645d');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let y = 4; y < h; y += 7) {
      g.fillStyle = y % 14 ? '#807870' : '#9b9489';
      g.fillRect(0, y, w, 3);
    }
  });

  buildTex('hedge', (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4a6b55'); grad.addColorStop(1, '#264032');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 300; i++) {
      g.fillStyle = ['#58795f', '#6d8f72', '#39523f'][i % 3];
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });

  buildTex('asphalt', (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#4f535b'); grad.addColorStop(1, '#232731');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    grain(g, w, h, 0.12, 260);
    g.strokeStyle = 'rgba(230,230,230,0.45)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(8, 14); g.lineTo(22, 15); g.lineTo(39, 13); g.lineTo(58, 15);
    g.stroke();
  });

  buildTex('tile', (g, w, h) => {
    g.fillStyle = '#d8dce2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#bcc5d0'; g.lineWidth = 1;
    for (let x = 0; x <= w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let y = 0; y <= h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    grain(g, w, h, 0.03, 100);
  });

  buildTex('grass', (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#577749'); grad.addColorStop(1, '#213723');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = ['#73975f','#436741','#89ac6e'][i % 3];
      g.fillRect(Math.random() * w, Math.random() * h, 1, 4);
    }
  });

  buildTex('concrete', (g, w, h) => {
    g.fillStyle = '#868b8f'; g.fillRect(0, 0, w, h);
    grain(g, w, h, 0.08, 180);
    g.strokeStyle = 'rgba(50,50,50,.28)';
    g.beginPath(); g.moveTo(4, 44); g.lineTo(18, 30); g.lineTo(36, 37); g.stroke();
  });

  buildTex('dirt', (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#847360'); grad.addColorStop(1, '#473c31');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    grain(g, w, h, 0.08, 170);
  });

  buildSpr('sign', (g, w, h) => {
    g.fillStyle = '#53bc74'; g.fillRect(4, 18, w - 8, 28);
    g.fillStyle = '#ebf8ee';
    g.font = 'bold 16px sans-serif';
    g.fillText('こもれびマート', 14, 36);
  }, 150, 64);

  buildSpr('pole', (g, w, h) => {
    g.fillStyle = '#3b3f45'; g.fillRect(34, 0, 6, h - 8);
    g.fillRect(36, 20, 28, 3);
    g.strokeStyle = '#2a2d31'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(40, 18); g.lineTo(82, 5); g.stroke();
    g.fillStyle = '#fff0bb'; g.fillRect(60, 14, 18, 10);
    g.fillStyle = 'rgba(255,227,168,.18)'; g.beginPath(); g.arc(69, 19, 22, 0, Math.PI * 2); g.fill();
  }, 96, 132);

  buildSpr('vending', (g, w, h) => {
    g.fillStyle = '#eaf1ff'; g.fillRect(10, 6, 44, 82);
    g.fillStyle = '#a9c7ff'; g.fillRect(14, 12, 36, 28);
    g.fillStyle = '#ffffff'; g.fillRect(15, 44, 34, 18);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = ['#ff6464','#ffe16f','#74c7ff','#89e283','#d899ff'][i];
      g.fillRect(18 + i * 6, 48, 4, 10);
    }
    g.fillStyle = '#313a46'; g.fillRect(22, 67, 20, 8);
    g.fillStyle = '#bcc5d0'; g.fillRect(20, 80, 24, 6);
  });

  buildSpr('board', (g, w, h) => {
    g.fillStyle = '#7b654d'; g.fillRect(6, 18, w - 12, 8);
    g.fillRect(12, 26, 8, 58); g.fillRect(w - 20, 26, 8, 58);
    g.fillStyle = '#d9cbb3'; g.fillRect(10, 26, w - 20, 34);
    g.fillStyle = '#977b5f'; g.fillRect(12, 28, w - 24, 30);
    g.fillStyle = '#f2eadb'; g.fillRect(18, 33, 20, 10); g.fillRect(42, 40, 16, 8);
  }, 74, 96);

  buildSpr('phone', (g, w, h) => {
    g.fillStyle = 'rgba(190,220,255,.2)'; g.fillRect(13, 12, 38, 74);
    g.strokeStyle = '#d0e2ff'; g.lineWidth = 2; g.strokeRect(13, 12, 38, 74);
    g.fillStyle = '#50647f'; g.fillRect(21, 30, 22, 22);
    g.fillStyle = '#23324a'; g.fillRect(24, 34, 16, 14);
    g.fillStyle = '#e4eefb'; g.fillRect(18, 10, 28, 8);
  }, 64, 100);

  buildSpr('bus', (g, w, h) => {
    g.fillStyle = '#cadbf4'; g.fillRect(20, 6, 24, 16);
    g.fillStyle = '#5f7087'; g.fillRect(18, 22, 4, 62); g.fillRect(42, 22, 4, 62);
    g.fillStyle = '#8ca0ba'; g.fillRect(14, 54, 36, 8);
  }, 64, 100);

  buildSpr('car', (g, w, h) => {
    g.fillStyle = '#e2e3e7'; g.fillRect(12, 30, 74, 28);
    g.fillStyle = '#c4ccd7'; g.fillRect(28, 16, 40, 16);
    g.fillStyle = '#9cafcb'; g.fillRect(32, 19, 14, 10); g.fillRect(50, 19, 14, 10);
    g.fillStyle = '#23252a'; g.fillRect(22, 52, 14, 12); g.fillRect(60, 52, 14, 12);
    g.fillStyle = '#f0dfa5'; g.fillRect(12, 36, 5, 6); g.fillStyle = '#e97b6f'; g.fillRect(81, 36, 5, 6);
  }, 98, 72);

  buildSpr('mirror', (g, w, h) => {
    g.fillStyle = '#4c5b72'; g.fillRect(28, 18, 4, 70);
    g.fillStyle = '#d05b2c'; g.beginPath(); g.arc(30, 16, 14, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d6e4f4'; g.beginPath(); g.arc(30, 16, 10, 0, Math.PI * 2); g.fill();
  }, 64, 100);

  buildSpr('tree', (g, w, h) => {
    g.fillStyle = '#5d4530'; g.fillRect(44, 52, 10, h - 56);
    const blobs = [[49,32,22,'#395740'],[33,48,18,'#4d7158'],[65,50,18,'#2b4433'],[50,56,24,'#45654c']];
    for (const [x,y,r,c] of blobs) { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
  }, 100, 130);

  buildSpr('life', (g, w, h) => {
    g.fillStyle = '#c2b08a'; g.fillRect(8, 30, 18, 12);
    g.fillStyle = '#888c94'; g.fillRect(30, 24, 16, 18);
    g.fillStyle = '#acc0d9'; g.fillRect(44, 22, 7, 8);
    g.fillStyle = '#4a8d48'; g.fillRect(52, 34, 12, 10);
    g.fillStyle = '#82bb6d'; g.fillRect(54, 26, 8, 8);
  }, 72, 56);

  buildSpr('rack', (g, w, h) => {
    g.fillStyle = '#343a49'; g.fillRect(10, 12, 48, 78);
    g.fillStyle = '#2a2f3b'; g.fillRect(12, 14, 44, 74);
    for (let y = 18; y < 82; y += 11) {
      for (let x = 16; x < 50; x += 8) {
        g.fillStyle = ['#ef7272','#efe07a','#7bc5ff','#b588e4','#92de9a'][(x + y) % 5];
        g.fillRect(x, y, 6, 8);
      }
    }
  }, 70, 100);

  buildSpr('counter', (g, w, h) => {
    g.fillStyle = '#ccc7bd'; g.fillRect(4, 42, w - 8, 30);
    g.fillStyle = '#958d82'; g.fillRect(4, 68, w - 8, 14);
    g.fillStyle = '#242d3e'; g.fillRect(66, 16, 24, 28);
    g.fillStyle = '#141b26'; g.fillRect(69, 19, 18, 22);
    g.fillStyle = '#f4eee7'; g.fillRect(18, 29, 12, 18);
    g.fillStyle = '#8daf68'; g.fillRect(18, 39, 12, 4); g.fillStyle = '#4b6c8a'; g.fillRect(18, 43, 12, 4);
  }, 100, 90);

  buildSpr('clock', (g, w, h) => {
    g.fillStyle = '#17212c'; g.fillRect(10, 10, 50, 24);
    g.fillStyle = '#4df08d'; g.font = 'bold 18px monospace'; g.fillText('22:46', 14, 28);
  }, 72, 48);

  buildSpr('bridge', (g, w, h) => {
    g.fillStyle = '#72787e'; g.fillRect(0, 34, w, 10);
    g.fillStyle = '#62676d'; for (let x = 6; x < w; x += 10) g.fillRect(x, 18, 4, 28);
  }, 94, 60);

  buildSpr('closed', (g, w, h) => {
    g.fillStyle = '#7b5d43'; g.fillRect(8, 14, w - 16, 18);
    g.fillStyle = '#f0dfc7'; g.font = 'bold 10px sans-serif'; g.fillText('駄菓子', 22, 27);
    g.fillStyle = '#5f564d'; g.fillRect(12, 34, w - 24, 42);
  }, 94, 84);

  const MAP_W = 34;
  const MAP_H = 34;
  // 0 open 1 store 2 house 3 wallpaper interior 4 fridge 5 shrine/wood 6 shutter 7 hedge
  const map = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));
  const floorMap = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(0));

  function fillRectMap(x0, y0, x1, y1, v) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) map[y][x] = v;
  }
  function fillFloor(x0, y0, x1, y1, v) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) floorMap[y][x] = v;
  }

  // world floor layout
  fillFloor(0,0,33,33,2);   // grass default
  fillFloor(9,0,16,33,4);   // road/side path dirt shoulder
  fillFloor(11,0,15,33,0);  // asphalt road center
  fillFloor(13,18,22,29,3); // parking/concrete apron
  fillFloor(16,19,21,28,1); // store tiles
  fillFloor(6,20,10,28,3);  // side lot concrete
  fillFloor(21,5,24,10,3);  // closed shop front
  fillFloor(17,2,20,6,4);   // shrine path

  // hedges
  fillRectMap(8,1,8,14,7);
  fillRectMap(17,0,17,8,7);

  // homes left side
  fillRectMap(1,2,5,6,2);
  fillRectMap(1,9,5,13,2);
  fillRectMap(1,18,5,23,2);

  // store exterior shell
  fillRectMap(16,19,21,19,1);
  fillRectMap(16,28,21,28,1);
  fillRectMap(16,19,16,28,1);
  fillRectMap(21,19,21,28,1);
  // door opening and windows are sprites/openings
  map[18][16] = 0; map[18][21] = 0; // front apron left/right approach open
  map[19][18] = 0; map[19][19] = 0; // front door opening not used but keeps center readable
  map[20][18] = 0; map[20][19] = 0;
  // interior walls and fixtures
  fillRectMap(17,20,20,20,3); // back wallpaper wall
  fillRectMap(17,21,17,27,4);
  fillRectMap(20,21,20,27,4);
  fillRectMap(18,23,19,23,3);
  fillRectMap(18,25,19,25,3);

  // closed shop / shuttered store
  fillRectMap(22,6,25,9,6);
  // shrine shed
  fillRectMap(18,2,20,4,5);

  const floorTexNames = ['asphalt','tile','grass','concrete','dirt'];

  const sprites = [
    { x: 18.5, y: 18.55, tex: 'sign', scale: 2.0, yOffset: 0.98 },
    { x: 22.4, y: 18.6, tex: 'pole', scale: 1.6, yOffset: 1.35 },
    { x: 12.4, y: 24.6, tex: 'vending', scale: 1.12, yOffset: 0.84 },
    { x: 9.2, y: 18.6, tex: 'mirror', scale: 0.96, yOffset: 1.18 },
    { x: 8.8, y: 20.8, tex: 'phone', scale: 1.05, yOffset: 0.92 },
    { x: 10.8, y: 12.0, tex: 'board', scale: 1.12, yOffset: 0.82 },
    { x: 22.6, y: 23.5, tex: 'bus', scale: 1.1, yOffset: 0.82 },
    { x: 11.8, y: 26.4, tex: 'bridge', scale: 1.14, yOffset: 0.62 },
    { x: 24.0, y: 6.2, tex: 'closed', scale: 1.2, yOffset: 0.88 },
    { x: 7.4, y: 25.2, tex: 'car', scale: 1.38, yOffset: 0.75 },
    { x: 5.8, y: 7.6, tex: 'tree', scale: 1.74, yOffset: 1.18 },
    { x: 5.6, y: 15.0, tex: 'tree', scale: 1.6, yOffset: 1.14 },
    { x: 4.6, y: 23.8, tex: 'life', scale: 1.3, yOffset: 0.62 },
    { x: 5.2, y: 11.8, tex: 'life', scale: 1.28, yOffset: 0.62 },
    { x: 19.0, y: 24.0, tex: 'counter', scale: 1.34, yOffset: 0.82 },
    { x: 18.0, y: 22.1, tex: 'rack', scale: 1.02, yOffset: 0.82 },
    { x: 19.0, y: 22.1, tex: 'rack', scale: 1.02, yOffset: 0.82 },
    { x: 18.0, y: 26.1, tex: 'rack', scale: 1.02, yOffset: 0.82 },
    { x: 19.0, y: 26.1, tex: 'rack', scale: 1.02, yOffset: 0.82 },
    { x: 19.1, y: 20.7, tex: 'clock', scale: 0.78, yOffset: 1.56 },
    { x: 21.7, y: 4.9, tex: 'tree', scale: 1.4, yOffset: 1.08 },
  ];

  const hotspots = [
    { x: 18.6, y: 19.5, text: 'コンビニ入口。外の白い蛍光灯と中の壁紙で、参考画像の空気感に寄せる想定。' },
    { x: 19.1, y: 24.2, text: 'レジ。窓際・時計・CRT方向の構図を後でさらに強化する前提。' },
    { x: 18.1, y: 22.2, text: '冷蔵棚。今回は軽さ優先で密度を保った版。' },
    { x: 10.8, y: 12.0, text: '掲示板。夏祭りや町内会の紙が貼られている想定。' },
    { x: 21.8, y: 4.7, text: '祠方向。歩きたくなる奥スポットとして残している。' },
    { x: 8.8, y: 20.8, text: '電話ボックス。生活感と不穏さの中間地点。' },
    { x: 11.8, y: 26.4, text: '小橋と側溝。田舎道の密度を出すための見せ場。' },
    { x: 24.0, y: 6.2, text: '閉店店舗。夜だけ看板がなんとなく見える配置。' },
  ];

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function wrapAngle(a) { while (a < -Math.PI) a += Math.PI * 2; while (a > Math.PI) a -= Math.PI * 2; return a; }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx*dx + dy*dy; }

  function isBlocking(x, y) {
    const mx = Math.floor(x), my = Math.floor(y);
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return true;
    return map[my][mx] !== 0;
  }

  function wallTexture(tile) {
    switch (tile) {
      case 1: return TEX.store;
      case 2: return TEX.house;
      case 3: return TEX.wallpaper;
      case 4: return TEX.fridge;
      case 5: return TEX.house;
      case 6: return TEX.shutter;
      case 7: return TEX.hedge;
      default: return TEX.house;
    }
  }

  function floorTextureAt(x, y) {
    const mx = clamp(Math.floor(x), 0, MAP_W - 1);
    const my = clamp(Math.floor(y), 0, MAP_H - 1);
    return TEX[floorTexNames[floorMap[my][mx]]];
  }

  function showHint(text, ms = 1800) {
    state.hint = text;
    hintEl.textContent = text;
    state.messageUntil = performance.now() + ms;
  }

  function refreshHint(now) {
    if (state.messageUntil && now > state.messageUntil) {
      state.messageUntil = 0;
      hintEl.textContent = state.hint;
    }
  }

  function interact() {
    let best = null;
    let bestD = 1.4;
    for (const h of hotspots) {
      const d = Math.sqrt(dist2(state.x, state.y, h.x, h.y));
      if (d < bestD) {
        const dir = Math.atan2(h.y - state.y, h.x - state.x);
        const diff = Math.abs(wrapAngle(dir - state.angle));
        if (diff < 0.8) { bestD = d; best = h; }
      }
    }
    if (best) showHint(best.text, 2400);
    else showHint('今はイベント未実装。歩きやすさ、軽さ、立体感、密度を確認してください。', 1600);
  }

  runBtn.addEventListener('click', () => {
    state.run = !state.run;
    runBtn.classList.toggle('on', state.run);
    runBtn.textContent = `走る: ${state.run ? 'ON' : 'OFF'}`;
  });
  scanBtn.addEventListener('click', () => {
    state.scanline = !state.scanline;
    scanBtn.textContent = `SCANLINE: ${state.scanline ? 'ON' : 'OFF'}`;
  });
  qualityBtn.addEventListener('click', () => {
    const next = state.quality === 'low' ? 'mid' : state.quality === 'mid' ? 'high' : 'low';
    setRenderQuality(next);
  });
  actBtn.addEventListener('click', interact);

  function resetStick() {
    state.joyX = 0; state.joyY = 0;
    stick.style.transform = 'translate(0px, 0px)';
  }
  function moveStick(clientX, clientY) {
    const rect = pad.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const maxR = rect.width * 0.33;
    const len = Math.hypot(dx, dy) || 1;
    if (len > maxR) { dx = dx / len * maxR; dy = dy / len * maxR; }
    state.joyX = dx / maxR;
    state.joyY = dy / maxR;
    stick.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  pad.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId; pad.setPointerCapture(e.pointerId); moveStick(e.clientX, e.clientY);
  });
  pad.addEventListener('pointermove', (e) => { if (e.pointerId === joyId) moveStick(e.clientX, e.clientY); });
  pad.addEventListener('pointerup', (e) => { if (e.pointerId === joyId) { joyId = null; resetStick(); } });
  pad.addEventListener('pointercancel', () => { joyId = null; resetStick(); });

  app.addEventListener('pointerdown', (e) => {
    const rightHalf = window.innerWidth * 0.44;
    if (e.clientX > rightHalf && !e.target.closest('#pad') && !e.target.closest('button')) {
      lookId = e.pointerId; lookLastX = e.clientX; app.setPointerCapture(e.pointerId);
    }
  });
  app.addEventListener('pointermove', (e) => {
    if (e.pointerId === lookId) {
      const dx = e.clientX - lookLastX;
      lookLastX = e.clientX;
      state.angle = wrapAngle(state.angle + dx * 0.0027);
    }
  });
  app.addEventListener('pointerup', (e) => { if (e.pointerId === lookId) lookId = null; });
  app.addEventListener('pointercancel', (e) => { if (e.pointerId === lookId) lookId = null; });

  function castRay(rayAngle) {
    const sin = Math.sin(rayAngle), cos = Math.cos(rayAngle);
    let mapX = Math.floor(state.x), mapY = Math.floor(state.y);
    const deltaX = Math.abs(1 / (cos || 1e-6));
    const deltaY = Math.abs(1 / (sin || 1e-6));
    let stepX, stepY, sideX, sideY;
    if (cos < 0) { stepX = -1; sideX = (state.x - mapX) * deltaX; }
    else { stepX = 1; sideX = (mapX + 1 - state.x) * deltaX; }
    if (sin < 0) { stepY = -1; sideY = (state.y - mapY) * deltaY; }
    else { stepY = 1; sideY = (mapY + 1 - state.y) * deltaY; }

    let hit = 0, side = 0;
    while (!hit) {
      if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
      else { sideY += deltaY; mapY += stepY; side = 1; }
      if (mapX < 0 || mapY < 0 || mapX >= MAP_W || mapY >= MAP_H) return { dist: MAX_DIST, texId: 0, texX: 0, side: 0 };
      hit = map[mapY][mapX];
    }
    const perp = side === 0 ? (mapX - state.x + (1 - stepX) / 2) / (cos || 1e-6) : (mapY - state.y + (1 - stepY) / 2) / (sin || 1e-6);
    let wallX = side === 0 ? state.y + perp * sin : state.x + perp * cos;
    wallX -= Math.floor(wallX);
    let texX = Math.floor(wallX * 64);
    if (side === 0 && cos > 0) texX = 63 - texX;
    if (side === 1 && sin < 0) texX = 63 - texX;
    return { dist: Math.max(0.001, perp), texId: hit, texX, side };
  }

  function drawSky(g) {
    const grad = g.createLinearGradient(0, 0, 0, renderH);
    grad.addColorStop(0, '#0f2a61');
    grad.addColorStop(0.24, '#102653');
    grad.addColorStop(0.54, '#162037');
    grad.addColorStop(1, '#10151c');
    g.fillStyle = grad; g.fillRect(0, 0, renderW, renderH);

    g.fillStyle = 'rgba(255, 155, 74, .1)';
    g.beginPath(); g.arc(renderW * 0.62, 64, 54, 0, Math.PI * 2); g.fill();

    g.fillStyle = 'rgba(255,255,255,.9)';
    for (let i = 0; i < 22; i++) {
      const x = (i * 43.7 + 17) % renderW;
      const y = (i * 31.2 + 11) % 110;
      g.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }

    const h = horizonBase;
    const px = state.angle * 22;
    g.fillStyle = '#202738';
    g.beginPath();
    g.moveTo(0, h + 18);
    for (let x = 0; x <= renderW + 40; x += 30) {
      const xx = x - (px * 0.18 % 34);
      const peak = Math.sin((x + px * 0.4) * 0.06) * 11;
      g.lineTo(xx, h + 14 - peak - ((x % 90) === 0 ? 12 : 0));
    }
    g.lineTo(renderW, h + 40); g.lineTo(0, h + 40); g.closePath(); g.fill();

    g.fillStyle = '#2d3344';
    for (let i = 0; i < 8; i++) {
      const xx = ((i * 52 - px * 0.28) % (renderW + 60)) - 20;
      const w = 12 + (i % 4) * 7;
      const hh = 14 + (i % 3) * 12;
      g.fillRect(xx, h + 10 - hh, w, hh);
    }

    g.strokeStyle = 'rgba(34, 34, 36, .82)';
    g.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(-8, 78 + i * 7);
      g.quadraticCurveTo(renderW * .45, 90 + i * 6, renderW + 10, 74 + i * 9);
      g.stroke();
    }
  }

  function drawFloor(g) {
    const dirX = Math.cos(state.angle), dirY = Math.sin(state.angle);
    const planeX = -dirY * Math.tan(HALF_FOV), planeY = dirX * Math.tan(HALF_FOV);
    const posZ = 0.68 * renderH;
    const h = horizonBase;

    for (let y = h; y < renderH; y += floorStepY) {
      const p = y - h;
      if (p <= 0) continue;
      const rowDist = (0.56 * posZ) / p;
      const ray0x = dirX - planeX, ray0y = dirY - planeY;
      const ray1x = dirX + planeX, ray1y = dirY + planeY;
      const stepX = rowDist * (ray1x - ray0x) / renderW;
      const stepY = rowDist * (ray1y - ray0y) / renderW;
      let floorX = state.x + rowDist * ray0x;
      let floorY = state.y + rowDist * ray0y;

      for (let x = 0; x < renderW; x += floorStepX) {
        const cellX = Math.floor(floorX), cellY = Math.floor(floorY);
        if (cellX >= 0 && cellY >= 0 && cellX < MAP_W && cellY < MAP_H) {
          const tex = floorTextureAt(floorX, floorY);
          const tx = ((floorX - cellX) * 64) & 63;
          const ty = ((floorY - cellY) * 64) & 63;
          g.drawImage(tex, tx, ty, 1, 1, x, y, floorStepX, floorStepY);
          const shade = Math.min(0.76, Math.max(0, (rowDist - 1.2) / 16));
          if (shade > .01) {
            g.fillStyle = `rgba(6,10,18,${shade})`;
            g.fillRect(x, y, floorStepX, floorStepY);
          }
        }
        floorX += stepX * floorStepX;
        floorY += stepY * floorStepX;
      }
    }
  }

  function renderFrame(now) {
    drawSky(offCtx);
    drawFloor(offCtx);

    for (let x = 0; x < renderW; x++) {
      const camX = 2 * x / renderW - 1;
      const rayAngle = state.angle + Math.atan(camX * Math.tan(HALF_FOV));
      const ray = castRay(rayAngle);
      const corrected = ray.dist * Math.cos(rayAngle - state.angle);
      zBuffer[x] = corrected;
      const lineH = Math.min(renderH * 1.3, renderH / corrected);
      const start = Math.floor(renderH / 2 - lineH / 2);
      const end = Math.floor(start + lineH);
      wallTop[x] = start; wallBottom[x] = end;
      const tex = wallTexture(ray.texId);
      offCtx.drawImage(tex, ray.texX, 0, 1, 64, x, start, 1, lineH);
      const shade = Math.min(.88, Math.max(0, corrected / MAX_DIST));
      offCtx.fillStyle = `rgba(8,12,20,${shade * .72 + (ray.side ? .1 : .04)})`;
      offCtx.fillRect(x, start, 1, lineH);
    }

    const dirX = Math.cos(state.angle), dirY = Math.sin(state.angle);
    const planeX = -dirY * Math.tan(HALF_FOV), planeY = dirX * Math.tan(HALF_FOV);
    const ordered = sprites.map(s => ({ ...s, d: dist2(state.x, state.y, s.x, s.y) })).sort((a,b) => b.d - a.d);

    for (const s of ordered) {
      const sx = s.x - state.x, sy = s.y - state.y;
      const invDet = 1 / (planeX * dirY - dirX * planeY || 1e-6);
      const tx = invDet * (dirY * sx - dirX * sy);
      const ty = invDet * (-planeY * sx + planeX * sy);
      if (ty <= 0.08 || ty > MAX_DIST) continue;

      const img = SPR[s.tex];
      const screenX = Math.floor((renderW / 2) * (1 + tx / ty));
      const h = Math.abs(Math.floor((renderH / ty) * (s.scale || 1)));
      const w = Math.floor(h * (img.width / img.height));
      const startY = Math.floor(renderH / 2 - h + h * (1 - (s.yOffset || 1)));
      const startX = Math.floor(screenX - w / 2);
      const endX = startX + w;

      for (let stripe = startX; stripe < endX; stripe++) {
        if (stripe < 0 || stripe >= renderW || ty >= zBuffer[stripe]) continue;
        const texX = Math.floor((stripe - startX) / w * img.width);
        offCtx.drawImage(img, texX, 0, 1, img.height, stripe, startY, 1, h);
        const shade = Math.min(0.84, ty / MAX_DIST);
        offCtx.fillStyle = `rgba(8,12,20,${shade * .6})`;
        offCtx.fillRect(stripe, startY, 1, h);
      }
    }

    if (state.scanline) {
      offCtx.fillStyle = 'rgba(255,255,255,.045)';
      for (let y = 0; y < renderH; y += 4) offCtx.fillRect(0, y, renderW, 1);
    }

    const vw = window.innerWidth, vh = window.innerHeight;
    ctx.clearRect(0, 0, vw, vh);
    ctx.drawImage(off, 0, 0, vw, vh);

    // subtle bloom-ish glows around bright shop area
    ctx.fillStyle = 'rgba(255, 235, 190, .05)';
    ctx.beginPath(); ctx.arc(vw * .55, vh * .33, vw * .1, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120, 170, 255, .05)';
    ctx.beginPath(); ctx.arc(vw * .17, vh * .8, vw * .13, 0, Math.PI * 2); ctx.fill();
  }

  function update(dt) {
    let forward = -state.joyY;
    let strafe = state.joyX;
    if (Math.abs(forward) < .06) forward = 0;
    if (Math.abs(strafe) < .06) strafe = 0;

    const speed = (state.run ? 3.05 : 1.95) * dt;
    if (forward || strafe) {
      const len = Math.hypot(forward, strafe) || 1;
      forward /= len; strafe /= len;
      const cos = Math.cos(state.angle), sin = Math.sin(state.angle);
      const moveX = (cos * forward - sin * strafe) * speed;
      const moveY = (sin * forward + cos * strafe) * speed;
      const r = 0.16;
      const nx = state.x + moveX;
      if (!isBlocking(nx + Math.sign(moveX || 1) * r, state.y) && !isBlocking(nx, state.y + r) && !isBlocking(nx, state.y - r)) state.x = nx;
      const ny = state.y + moveY;
      if (!isBlocking(state.x, ny + Math.sign(moveY || 1) * r) && !isBlocking(state.x + r, ny) && !isBlocking(state.x - r, ny)) state.y = ny;
    }

    // nearest ambient hint refresh
    let nearest = null, best = 999;
    for (const h of hotspots) {
      const d = dist2(state.x, state.y, h.x, h.y);
      if (d < best) { best = d; nearest = h; }
    }
    if (!state.messageUntil) {
      if (nearest && best < 2.4) hintEl.textContent = nearest.text;
      else hintEl.textContent = 'コンビニ前広場・民家・路地・分岐の歩き心地を確認してください。';
    }
  }

  function loop(now) {
    if (now - lastFrame < fpsStep) { requestAnimationFrame(loop); return; }
    const dt = Math.min(0.033, (now - lastFrame) / 1000 || 0.016);
    lastFrame = now;
    update(dt);
    renderFrame(now);
    refreshHint(now);
    requestAnimationFrame(loop);
  }

  showHint('コンビニ前スタート。重さを抑えつつ、立体感と街の密度を戻した版です。', 2200);
  requestAnimationFrame(loop);
})();
