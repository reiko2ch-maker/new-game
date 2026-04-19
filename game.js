(() => {
  'use strict';

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = false;

  const scanlineBtn = document.getElementById('scanlineBtn');
  const runBtn = document.getElementById('runBtn');
  const interactBtn = document.getElementById('interactBtn');
  const messageEl = document.getElementById('message');
  const joyBase = document.getElementById('joystickBase');
  const joyKnob = document.getElementById('joystickKnob');

  const baseW = 360;
  const baseH = 640;
  canvas.width = baseW;
  canvas.height = baseH;

  const HALF_FOV = Math.PI / 5.2;
  const FOV = HALF_FOV * 2;
  const MOVE_SPEED = 1.7;
  const RUN_MULT = 1.75;
  const ROT_SPEED = 0.0028;
  const MAX_DIST = 22;
  const horizonBase = 256;
  const cameraHeight = 0.52;
  const floorPlane = 0.72;
  const textureSize = 64;

  let lastTime = performance.now();
  let scanlineOn = true;
  let runOn = true;
  let lookDragId = null;
  let lookLastX = 0;
  let joyId = null;
  let msgTimer = 0;

  const state = {
    x: 15.55,
    y: 23.45,
    angle: -1.56,
    horizon: 0,
    joyX: 0,
    joyY: 0,
    interactText: '歩くだけで夏の湿度が出るマップを目指して再構築。',
  };

  const textures = {};
  const spriteTextures = {};

  const MAP_W = 29;
  const MAP_H = 28;
  // 0 empty, 1 store exterior, 2 shelf/interior wall, 3 houses, 4 shrine/storehouse, 5 closed shop, 6 hedge/block
  const map = [
    [3,3,3,3,3,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [3,0,0,0,0,3,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [3,0,0,0,0,3,0,0,6,6,6,0,0,0,0,0,0,0,0,4,4,4,0,0,0,0,0,0,0],
    [3,0,0,0,0,3,0,0,6,0,6,0,0,0,0,0,0,0,0,4,0,4,0,0,0,0,0,0,0],
    [3,3,3,0,3,3,0,0,6,0,6,0,0,0,0,0,0,0,0,4,0,4,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,4,0,4,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,4,4,4,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,5,5,5,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,5,0,5,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,5,0,5,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,5,5,5,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,1,0,1,2,2,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,1,0,1,2,0,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,0,0,0,2,0,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,0,6,0,0,0,1,0,1,2,0,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,6,6,6,0,0,0,1,1,1,2,2,2,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
    [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  ];

  // area ids for floor texture selection
  // 0 asphalt/road, 1 store tile, 2 grass, 3 concrete/parking, 4 dirt path
  const floorMap = Array.from({ length: MAP_H }, (_, y) => Array.from({ length: MAP_W }, (_, x) => {
    if (y < 8 && x < 6) return 2;
    if (x >= 14 && x <= 19 && y >= 15 && y <= 22) return 1;
    if (x >= 6 && x <= 11 && y >= 2 && y <= 22) return 4;
    if (y >= 15 && y <= 22 && x >= 12 && x <= 16) return 3;
    if (y >= 7 && y <= 10 && x >= 23 && x <= 25) return 3;
    if (x <= 7 || x >= 20) return 2;
    return 0;
  }));

  const hotspots = [
    { x: 15.4, y: 18.3, text: '商店の入口。白い蛍光灯が周囲より少しだけ安心感を作る。' },
    { x: 18.1, y: 20.4, text: '棚。まだストーリーは入れていないので、今は内装の密度確認用。' },
    { x: 10.2, y: 12.2, text: '掲示板。町内会の貼り紙や夏祭りの名残がある想定。' },
    { x: 20.3, y: 6.2, text: '祠方向。歩きたくなる分岐スポットとして配置。' },
    { x: 24.1, y: 9.2, text: '閉店した駄菓子屋。夜だと看板だけ見える。' },
    { x: 7.2, y: 18.2, text: '電話ボックス。生活感と少しの不穏さを足すスポット。' },
    { x: 11.2, y: 21.5, text: '小橋と側溝。田舎道の密度を出すための要素。' },
  ];

  const sprites = [
    { x: 14.5, y: 15.1, tex: 'storeSign', scale: 1.8, yOffset: 0.95 },
    { x: 16.1, y: 15.15, tex: 'lampPost', scale: 1.7, yOffset: 1.35 },
    { x: 12.8, y: 19.0, tex: 'vending', scale: 1.15, yOffset: 0.75 },
    { x: 10.3, y: 12.0, tex: 'board', scale: 1.15, yOffset: 0.78 },
    { x: 7.2, y: 18.2, tex: 'phone', scale: 1.05, yOffset: 0.88 },
    { x: 11.1, y: 21.45, tex: 'bridgeRail', scale: 1.2, yOffset: 0.55 },
    { x: 20.5, y: 6.3, tex: 'shrineLantern', scale: 1.2, yOffset: 0.74 },
    { x: 24.0, y: 8.7, tex: 'closedShopSign', scale: 1.4, yOffset: 0.86 },
    { x: 21.9, y: 18.5, tex: 'busStop', scale: 1.2, yOffset: 0.82 },
    { x: 12.0, y: 17.2, tex: 'car', scale: 1.55, yOffset: 0.68 },
    { x: 9.1, y: 16.0, tex: 'mirror', scale: 1.0, yOffset: 1.15 },
    { x: 22.1, y: 20.8, tex: 'tree', scale: 1.9, yOffset: 1.25 },
    { x: 5.9, y: 10.0, tex: 'houseLife', scale: 1.35, yOffset: 0.64 },
    { x: 3.7, y: 3.8, tex: 'houseLife', scale: 1.35, yOffset: 0.64 },
    { x: 5.4, y: 3.0, tex: 'tree', scale: 1.6, yOffset: 1.2 },
    { x: 17.1, y: 18.2, tex: 'aisle', scale: 1.0, yOffset: 0.72 },
    { x: 18.9, y: 18.2, tex: 'aisle', scale: 1.0, yOffset: 0.72 },
    { x: 17.1, y: 20.2, tex: 'aisle', scale: 1.0, yOffset: 0.72 },
    { x: 18.9, y: 20.2, tex: 'aisle', scale: 1.0, yOffset: 0.72 },
    { x: 15.2, y: 17.1, tex: 'counter', scale: 1.35, yOffset: 0.78 },
    { x: 15.8, y: 16.4, tex: 'clock', scale: 0.72, yOffset: 1.48 },
    { x: 15.1, y: 20.8, tex: 'doorFrame', scale: 1.18, yOffset: 1.05 },
  ];

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function wrapAngle(a) {
    while (a < -Math.PI) a += Math.PI * 2;
    while (a > Math.PI) a -= Math.PI * 2;
    return a;
  }
  function dist2(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return dx * dx + dy * dy;
  }

  function makeCanvas(w = textureSize, h = textureSize) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function paintTexture(name, painter, w = textureSize, h = textureSize) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    painter(g, w, h);
    textures[name] = c;
  }

  function paintSprite(name, painter, w = 64, h = 96) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    painter(g, w, h);
    spriteTextures[name] = c;
  }

  function addGrain(g, w, h, alpha = 0.08) {
    for (let i = 0; i < 180; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const a = Math.random() * alpha;
      g.fillStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      g.fillRect(x, y, 1, 1);
    }
  }

  function buildTextures() {
    paintTexture('store', (g, w, h) => {
      g.fillStyle = '#c8c2b6'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 12) {
        g.fillStyle = x % 24 === 0 ? '#b5aea2' : '#d7d1c6';
        g.fillRect(x, 0, 7, h);
      }
      g.fillStyle = '#1bba86'; g.fillRect(0, 8, w, 6);
      g.fillStyle = '#bf4541'; g.fillRect(0, 15, w, 4);
      g.fillStyle = '#f9f9f5'; g.fillRect(18, 0, 28, 18);
      g.fillStyle = '#59be72'; g.fillRect(12, 10, 40, 16);
      g.fillStyle = '#e4f4ea';
      g.font = 'bold 8px sans-serif';
      g.fillText('KOMOREBI', 15, 21);
      g.fillStyle = '#3b3c46'; g.fillRect(24, 28, 16, 36);
      g.fillStyle = '#0a0c14'; g.fillRect(26, 30, 12, 34);
      g.fillStyle = '#d3e1f9'; g.fillRect(2, 30, 18, 28);
      g.fillRect(44, 30, 18, 28);
      addGrain(g, w, h, 0.04);
    });

    paintTexture('shelf', (g, w, h) => {
      g.fillStyle = '#3b4254'; g.fillRect(0, 0, w, h);
      for (let y = 4; y < h; y += 14) {
        g.fillStyle = '#262c38'; g.fillRect(0, y, w, 2);
      }
      for (let y = 7; y < h; y += 14) {
        for (let x = 2; x < w; x += 10) {
          g.fillStyle = ['#e9d86c','#d04f4f','#6d89ef','#8ed19b','#c788e1'][((x+y) / 3) % 5 | 0];
          g.fillRect(x, y, 6, 8 + ((x + y) % 3));
        }
      }
      addGrain(g, w, h, 0.04);
    });

    paintTexture('house', (g, w, h) => {
      g.fillStyle = '#cfc6b5'; g.fillRect(0, 0, w, h);
      for (let x = 0; x < w; x += 10) {
        g.fillStyle = x % 20 === 0 ? '#b9af9f' : '#ddd4c6';
        g.fillRect(x, 0, 7, h);
      }
      g.fillStyle = '#6e6659'; g.fillRect(0, 0, w, 10);
      g.fillStyle = '#7f6f55'; g.fillRect(4, 24, 16, 22);
      g.fillStyle = '#ebe9de'; g.fillRect(7, 28, 10, 16);
      g.fillStyle = '#857b6d'; g.fillRect(36, 24, 18, 16);
      g.fillStyle = '#f3f1eb'; g.fillRect(39, 27, 12, 10);
      addGrain(g, w, h, 0.03);
    });

    paintTexture('shrine', (g, w, h) => {
      g.fillStyle = '#6d5845'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#574737'; g.fillRect(0, 0, w, 10);
      for (let y = 10; y < h; y += 8) {
        g.fillStyle = y % 16 === 0 ? '#836652' : '#705948';
        g.fillRect(0, y, w, 6);
      }
      addGrain(g, w, h, 0.02);
    });

    paintTexture('closedShop', (g, w, h) => {
      g.fillStyle = '#988e80'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#584e46'; g.fillRect(0, 0, w, 12);
      for (let x = 0; x < w; x += 6) {
        g.fillStyle = x % 12 === 0 ? '#80786f' : '#a1998d';
        g.fillRect(x, 18, 4, h - 18);
      }
      g.fillStyle = '#22242a'; g.fillRect(16, 18, 32, 36);
      addGrain(g, w, h, 0.04);
    });

    paintTexture('hedge', (g, w, h) => {
      g.fillStyle = '#335241'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 320; i++) {
        g.fillStyle = ['#416652','#587a61','#2f4c3f'][i % 3];
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });

    paintTexture('asphalt', (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#4f5157'); grad.addColorStop(1, '#242731');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) {
        const c = 30 + Math.random() * 50;
        g.fillStyle = `rgba(${c},${c},${c},0.35)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.strokeStyle = 'rgba(230,230,230,0.55)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(12, 12); g.lineTo(28, 14); g.lineTo(44, 12); g.stroke();
    });

    paintTexture('tile', (g, w, h) => {
      g.fillStyle = '#d8dbe1'; g.fillRect(0, 0, w, h);
      g.strokeStyle = '#bcc2cf'; g.lineWidth = 1;
      for (let x = 0; x < w; x += 16) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 0; y < h; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      addGrain(g, w, h, 0.03);
    });

    paintTexture('grass', (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#4c6c43'); grad.addColorStop(1, '#1f3824');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 240; i++) {
        g.fillStyle = ['#58794f','#7d985c','#375036'][i % 3];
        const x = Math.random() * w;
        const y = Math.random() * h;
        g.fillRect(x, y, 1, 4);
      }
    });

    paintTexture('concrete', (g, w, h) => {
      g.fillStyle = '#7c7f84'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 220; i++) {
        const c = 120 + Math.random() * 50;
        g.fillStyle = `rgba(${c},${c},${c},0.2)`;
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
      g.strokeStyle = 'rgba(50,50,50,0.35)';
      g.beginPath(); g.moveTo(5, 45); g.lineTo(18, 30); g.lineTo(30, 36); g.stroke();
    });

    paintTexture('dirt', (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#7b705c'); grad.addColorStop(1, '#4a4035');
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 200; i++) {
        g.fillStyle = ['#655a4a','#8c806d','#3e342b'][i % 3];
        g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
      }
    });

    paintSprite('storeSign', (g, w, h) => {
      g.fillStyle = '#56be75'; g.fillRect(4, 18, w - 8, 28);
      g.fillStyle = '#dff7e7';
      g.font = 'bold 10px sans-serif';
      g.fillText('こもれびマート', 8, 36);
    }, 128, 64);

    paintSprite('lampPost', (g, w, h) => {
      g.fillStyle = '#2b2f38'; g.fillRect(29, 10, 6, h - 18);
      g.fillRect(30, 22, 20, 4);
      g.fillStyle = '#fff5cc'; g.fillRect(46, 18, 18, 12);
      g.fillStyle = 'rgba(255,238,170,0.18)'; g.beginPath(); g.arc(54, 26, 22, 0, Math.PI * 2); g.fill();
    });

    paintSprite('vending', (g, w, h) => {
      g.fillStyle = '#d9e6ff'; g.fillRect(10, 8, 40, 74);
      g.fillStyle = '#76a3ff'; g.fillRect(14, 14, 32, 30);
      g.fillStyle = '#f4f6f8'; g.fillRect(14, 48, 32, 18);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#ff5959','#ffe06e','#71c4ff','#9ded90'][i];
        g.fillRect(18 + i * 6, 52, 4, 10);
      }
      g.fillStyle = '#2e374a'; g.fillRect(18, 68, 24, 6);
      g.fillStyle = '#a6b8d4'; g.fillRect(16, 78, 28, 6);
    });

    paintSprite('board', (g, w, h) => {
      g.fillStyle = '#72624d'; g.fillRect(4, 16, 56, 8);
      g.fillRect(10, 24, 8, 56); g.fillRect(46, 24, 8, 56);
      g.fillStyle = '#d3c7b2'; g.fillRect(8, 24, 48, 32);
      g.fillStyle = '#917458'; g.fillRect(10, 26, 44, 28);
      g.fillStyle = '#f1eadf'; g.fillRect(14, 30, 18, 10); g.fillRect(34, 34, 14, 8);
    });

    paintSprite('phone', (g, w, h) => {
      g.fillStyle = 'rgba(194, 224, 255, 0.25)'; g.fillRect(12, 12, 40, 70);
      g.strokeStyle = '#d3e6ff'; g.lineWidth = 2; g.strokeRect(12, 12, 40, 70);
      g.fillStyle = '#4a5d7a'; g.fillRect(22, 28, 20, 20);
      g.fillStyle = '#26364d'; g.fillRect(25, 32, 14, 12);
      g.fillStyle = '#dce7f5'; g.fillRect(18, 10, 28, 8);
    });

    paintSprite('bridgeRail', (g, w, h) => {
      g.fillStyle = '#6a6f75'; g.fillRect(0, 42, w, 8);
      g.fillStyle = '#5b6066';
      for (let x = 4; x < w; x += 10) g.fillRect(x, 24, 4, 32);
    }, 88, 64);

    paintSprite('shrineLantern', (g, w, h) => {
      g.fillStyle = '#5e4a37'; g.fillRect(28, 38, 8, 44);
      g.fillStyle = '#f2d79d'; g.fillRect(16, 18, 32, 24);
      g.fillStyle = '#8a3f32'; g.fillRect(16, 14, 32, 4); g.fillRect(16, 42, 32, 4);
      g.fillStyle = 'rgba(246, 217, 146, 0.18)'; g.beginPath(); g.arc(32, 30, 28, 0, Math.PI * 2); g.fill();
    });

    paintSprite('closedShopSign', (g, w, h) => {
      g.fillStyle = '#7a5c42'; g.fillRect(6, 12, w - 12, 20);
      g.fillStyle = '#ecdec5'; g.font = 'bold 9px sans-serif'; g.fillText('駄菓子', 18, 26);
      g.fillStyle = '#564c45'; g.fillRect(12, 34, w - 24, 36);
    }, 92, 80);

    paintSprite('busStop', (g, w, h) => {
      g.fillStyle = '#6d7f93'; g.fillRect(14, 18, 36, 6);
      g.fillStyle = '#cfe2ff'; g.fillRect(18, 4, 28, 18);
      g.fillStyle = '#39465a'; g.fillRect(22, 24, 4, 58); g.fillRect(38, 24, 4, 58);
      g.fillStyle = '#8ba0bb'; g.fillRect(14, 52, 36, 8);
    });

    paintSprite('car', (g, w, h) => {
      g.fillStyle = '#d8d9de'; g.fillRect(10, 28, 68, 26);
      g.fillStyle = '#bcc3ce'; g.fillRect(24, 16, 40, 16);
      g.fillStyle = '#8fa2bf'; g.fillRect(28, 18, 14, 12); g.fillRect(44, 18, 14, 12);
      g.fillStyle = '#23242b'; g.fillRect(20, 50, 14, 12); g.fillRect(54, 50, 14, 12);
      g.fillStyle = '#f1e1a8'; g.fillRect(10, 34, 6, 6);
      g.fillStyle = '#e26758'; g.fillRect(72, 34, 6, 6);
    }, 88, 72);

    paintSprite('mirror', (g, w, h) => {
      g.fillStyle = '#4f5b6d'; g.fillRect(28, 18, 4, 64);
      g.fillStyle = '#cf612f'; g.beginPath(); g.arc(28, 16, 14, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#cdddf2'; g.beginPath(); g.arc(28, 16, 10, 0, Math.PI * 2); g.fill();
    });

    paintSprite('tree', (g, w, h) => {
      g.fillStyle = '#5d4530'; g.fillRect(28, 42, 8, 54);
      for (const [x,y,r,c] of [[32,22,18,'#33553d'],[20,34,16,'#456c4f'],[44,35,18,'#294635'],[32,42,22,'#3f5e45']]) {
        g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });

    paintSprite('houseLife', (g, w, h) => {
      g.fillStyle = '#bfae8d'; g.fillRect(12, 30, 16, 12);
      g.fillStyle = '#7a7d82'; g.fillRect(32, 24, 16, 18);
      g.fillStyle = '#b5c5db'; g.fillRect(46, 22, 6, 8);
      g.fillStyle = '#4a8a4a'; g.fillRect(52, 34, 10, 10);
      g.fillStyle = '#8bc173'; g.fillRect(54, 26, 6, 8);
    }, 72, 56);

    paintSprite('aisle', (g, w, h) => {
      g.fillStyle = '#343a48'; g.fillRect(10, 18, 44, 64);
      g.fillStyle = '#2a2f3b'; g.fillRect(12, 20, 40, 60);
      for (let y = 24; y < 74; y += 10) {
        for (let x = 16; x < 48; x += 8) {
          g.fillStyle = ['#ef7272','#efe072','#7ec8ff','#bd88e8','#95df95'][(x + y) % 5];
          g.fillRect(x, y, 6, 8);
        }
      }
    }, 64, 96);

    paintSprite('counter', (g, w, h) => {
      g.fillStyle = '#c8c3b8'; g.fillRect(4, 40, w - 8, 26);
      g.fillStyle = '#9c9689'; g.fillRect(4, 62, w - 8, 14);
      g.fillStyle = '#273140'; g.fillRect(64, 18, 24, 30);
      g.fillStyle = '#161c27'; g.fillRect(67, 21, 18, 24);
      g.fillStyle = '#f7f1ea'; g.fillRect(20, 30, 12, 18);
      g.fillStyle = '#9ab668'; g.fillRect(20, 40, 12, 4);
      g.fillStyle = '#4a6987'; g.fillRect(20, 44, 12, 4);
    }, 96, 88);

    paintSprite('clock', (g, w, h) => {
      g.fillStyle = '#1a232e'; g.fillRect(10, 10, 44, 26);
      g.fillStyle = '#41ee8a'; g.font = 'bold 18px monospace'; g.fillText('22:46', 12, 29);
    }, 64, 48);

    paintSprite('doorFrame', (g, w, h) => {
      g.fillStyle = '#d6d0c4'; g.fillRect(18, 4, 12, h - 8);
      g.fillRect(52, 4, 12, h - 8);
      g.fillRect(18, 4, 46, 10);
      g.fillStyle = 'rgba(190, 210, 240, 0.18)'; g.fillRect(26, 20, 12, h - 24); g.fillRect(44, 20, 12, h - 24);
    }, 82, 112);
  }

  buildTextures();

  function isBlocking(x, y) {
    const mx = Math.floor(x);
    const my = Math.floor(y);
    if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) return true;
    return map[my][mx] !== 0;
  }

  function floorTextureIdAt(x, y) {
    const mx = clamp(Math.floor(x), 0, MAP_W - 1);
    const my = clamp(Math.floor(y), 0, MAP_H - 1);
    return floorMap[my][mx];
  }

  const floorTextures = ['asphalt','tile','grass','concrete','dirt'];

  function showMessage(text, ms = 1800) {
    messageEl.textContent = text;
    messageEl.classList.remove('hidden');
    msgTimer = performance.now() + ms;
  }

  function updateMessage(now) {
    if (msgTimer && now > msgTimer) {
      messageEl.classList.add('hidden');
      msgTimer = 0;
    }
  }

  function handleInteract() {
    let best = null;
    let bestD = 1.25;
    for (const h of hotspots) {
      const d = Math.sqrt(dist2(state.x, state.y, h.x, h.y));
      if (d < bestD) {
        const dir = Math.atan2(h.y - state.y, h.x - state.x);
        const diff = Math.abs(wrapAngle(dir - state.angle));
        if (diff < 0.72) {
          bestD = d;
          best = h;
        }
      }
    }
    if (best) {
      showMessage(best.text, 2400);
      state.interactText = best.text;
    } else {
      showMessage('今はイベント未実装。マップの歩き心地と構図を確認してください。', 1800);
      state.interactText = '今はイベント未実装。マップの歩き心地と構図を確認してください。';
    }
  }

  runBtn.addEventListener('click', () => {
    runOn = !runOn;
    runBtn.textContent = `走る: ${runOn ? 'ON' : 'OFF'}`;
    runBtn.classList.toggle('on', runOn);
    runBtn.classList.toggle('off', !runOn);
  });

  interactBtn.addEventListener('click', handleInteract);
  scanlineBtn.addEventListener('click', () => {
    scanlineOn = !scanlineOn;
    scanlineBtn.textContent = `SCANLINE: ${scanlineOn ? 'ON' : 'OFF'}`;
  });

  function resetJoystick() {
    state.joyX = 0;
    state.joyY = 0;
    joyKnob.style.transform = 'translate(0px, 0px)';
  }

  function updateJoystick(clientX, clientY) {
    const rect = joyBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const maxR = rect.width * 0.34;
    const len = Math.hypot(dx, dy) || 1;
    if (len > maxR) {
      dx = dx / len * maxR;
      dy = dy / len * maxR;
    }
    state.joyX = dx / maxR;
    state.joyY = dy / maxR;
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  joyBase.addEventListener('pointerdown', (e) => {
    joyId = e.pointerId;
    joyBase.setPointerCapture(e.pointerId);
    updateJoystick(e.clientX, e.clientY);
  });
  joyBase.addEventListener('pointermove', (e) => {
    if (e.pointerId === joyId) updateJoystick(e.clientX, e.clientY);
  });
  joyBase.addEventListener('pointerup', (e) => {
    if (e.pointerId === joyId) {
      joyId = null;
      resetJoystick();
    }
  });
  joyBase.addEventListener('pointercancel', () => {
    joyId = null;
    resetJoystick();
  });

  const app = document.getElementById('app');
  app.addEventListener('pointerdown', (e) => {
    const half = window.innerWidth * 0.42;
    if (e.clientX > half && !e.target.closest('#joystickBase') && !e.target.closest('button')) {
      lookDragId = e.pointerId;
      lookLastX = e.clientX;
      app.setPointerCapture(e.pointerId);
    }
  });
  app.addEventListener('pointermove', (e) => {
    if (e.pointerId === lookDragId) {
      const dx = e.clientX - lookLastX;
      lookLastX = e.clientX;
      state.angle = wrapAngle(state.angle + dx * ROT_SPEED);
    }
  });
  app.addEventListener('pointerup', (e) => {
    if (e.pointerId === lookDragId) lookDragId = null;
  });
  app.addEventListener('pointercancel', (e) => {
    if (e.pointerId === lookDragId) lookDragId = null;
  });

  function castRay(rayAngle) {
    const sin = Math.sin(rayAngle);
    const cos = Math.cos(rayAngle);
    let mapX = Math.floor(state.x);
    let mapY = Math.floor(state.y);

    const deltaDistX = Math.abs(1 / (cos || 1e-6));
    const deltaDistY = Math.abs(1 / (sin || 1e-6));

    let stepX, stepY, sideDistX, sideDistY;
    if (cos < 0) {
      stepX = -1;
      sideDistX = (state.x - mapX) * deltaDistX;
    } else {
      stepX = 1;
      sideDistX = (mapX + 1.0 - state.x) * deltaDistX;
    }
    if (sin < 0) {
      stepY = -1;
      sideDistY = (state.y - mapY) * deltaDistY;
    } else {
      stepY = 1;
      sideDistY = (mapY + 1.0 - state.y) * deltaDistY;
    }

    let hit = 0;
    let side = 0;
    while (!hit) {
      if (sideDistX < sideDistY) {
        sideDistX += deltaDistX;
        mapX += stepX;
        side = 0;
      } else {
        sideDistY += deltaDistY;
        mapY += stepY;
        side = 1;
      }
      if (mapX < 0 || mapX >= MAP_W || mapY < 0 || mapY >= MAP_H) {
        return { dist: MAX_DIST, texId: 0, texX: 0, side: 0, mapX: 0, mapY: 0 };
      }
      if (map[mapY][mapX] > 0) hit = map[mapY][mapX];
    }

    let perpDist;
    if (side === 0) perpDist = (mapX - state.x + (1 - stepX) / 2) / (cos || 1e-6);
    else perpDist = (mapY - state.y + (1 - stepY) / 2) / (sin || 1e-6);

    let wallX;
    if (side === 0) wallX = state.y + perpDist * sin;
    else wallX = state.x + perpDist * cos;
    wallX -= Math.floor(wallX);

    let texX = Math.floor(wallX * textureSize);
    if (side === 0 && cos > 0) texX = textureSize - texX - 1;
    if (side === 1 && sin < 0) texX = textureSize - texX - 1;

    return { dist: Math.max(perpDist, 0.001), texId: hit, texX, side, mapX, mapY };
  }

  function getWallTexture(tile) {
    switch (tile) {
      case 1: return textures.store;
      case 2: return textures.shelf;
      case 3: return textures.house;
      case 4: return textures.shrine;
      case 5: return textures.closedShop;
      case 6: return textures.hedge;
      default: return textures.house;
    }
  }

  function drawSky() {
    const grad = ctx.createLinearGradient(0, 0, 0, baseH);
    grad.addColorStop(0, '#0d2b5d');
    grad.addColorStop(0.24, '#0a2450');
    grad.addColorStop(0.48, '#15203c');
    grad.addColorStop(1, '#11161f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, baseW, baseH);

    // distant orange sun glow / humid dusk
    ctx.fillStyle = 'rgba(255, 150, 70, 0.12)';
    ctx.beginPath();
    ctx.arc(baseW * 0.62 + Math.sin(state.angle * 0.2) * 12, 108, 74, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.86)';
    for (let i = 0; i < 30; i++) {
      const x = (i * 97.3 + 23) % baseW;
      const y = (i * 41.7 + 32) % 190;
      ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, i % 3 === 0 ? 2 : 1);
    }

    const horizon = horizonBase + state.horizon;
    const parallax = state.angle * 32;

    ctx.fillStyle = '#1b2231';
    ctx.beginPath();
    ctx.moveTo(0, horizon + 26);
    for (let x = 0; x <= baseW + 40; x += 36) {
      const xx = x - (parallax * 0.18 % 40);
      const peak = Math.sin((x + parallax * 0.4) * 0.045) * 15;
      ctx.lineTo(xx, horizon + 24 - peak - ((x % 108) === 0 ? 14 : 0));
    }
    ctx.lineTo(baseW, horizon + 52);
    ctx.lineTo(0, horizon + 52);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#2a3244';
    for (let i = 0; i < 11; i++) {
      const xx = ((i * 74 - parallax * 0.3) % (baseW + 90)) - 30;
      const w = 20 + (i % 4) * 8;
      const h = 18 + (i % 3) * 12;
      ctx.fillRect(xx, horizon + 18 - h, w, h);
    }

    // electric wires in sky
    ctx.strokeStyle = 'rgba(30,30,32,0.8)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-20, 118 + i * 8 + Math.sin(state.angle * 0.4 + i) * 2);
      ctx.quadraticCurveTo(baseW * 0.45, 130 + i * 8 + Math.sin(state.angle * 0.3 + i) * 2, baseW + 20, 110 + i * 10);
      ctx.stroke();
    }
  }

  function drawFloorAndCeiling() {
    const posZ = floorPlane * baseH;
    const dirX = Math.cos(state.angle);
    const dirY = Math.sin(state.angle);
    const planeX = -dirY * Math.tan(HALF_FOV);
    const planeY = dirX * Math.tan(HALF_FOV);
    const horizon = horizonBase + state.horizon;

    for (let y = horizon; y < baseH; y++) {
      const p = y - horizon;
      if (p === 0) continue;
      const rowDist = (cameraHeight * posZ) / p;

      const rayDirX0 = dirX - planeX;
      const rayDirY0 = dirY - planeY;
      const rayDirX1 = dirX + planeX;
      const rayDirY1 = dirY + planeY;

      const stepX = rowDist * (rayDirX1 - rayDirX0) / baseW;
      const stepY = rowDist * (rayDirY1 - rayDirY0) / baseW;

      let floorX = state.x + rowDist * rayDirX0;
      let floorY = state.y + rowDist * rayDirY0;

      for (let x = 0; x < baseW; x++) {
        const cellX = Math.floor(floorX);
        const cellY = Math.floor(floorY);
        if (cellX >= 0 && cellY >= 0 && cellX < MAP_W && cellY < MAP_H) {
          const texName = floorTextures[floorMap[cellY][cellX]];
          const tex = textures[texName];
          const tx = ((floorX - cellX) * textureSize) & (textureSize - 1);
          const ty = ((floorY - cellY) * textureSize) & (textureSize - 1);
          ctx.drawImage(tex, tx, ty, 1, 1, x, y, 1, 1);
          // dim by distance
          const shade = clamp((rowDist - 1) / 16, 0, 0.72);
          if (shade > 0.01) {
            ctx.fillStyle = `rgba(4,8,16,${shade})`;
            ctx.fillRect(x, y, 1, 1);
          }
        }
        floorX += stepX;
        floorY += stepY;
      }
    }
  }

  function renderScene(now) {
    drawSky();
    drawFloorAndCeiling();

    const zBuffer = new Float32Array(baseW);

    for (let x = 0; x < baseW; x++) {
      const cameraX = 2 * x / baseW - 1;
      const rayAngle = state.angle + Math.atan(cameraX * Math.tan(HALF_FOV));
      const ray = castRay(rayAngle);
      const corrected = ray.dist * Math.cos(rayAngle - state.angle);
      zBuffer[x] = corrected;
      const lineH = Math.min(baseH * 1.5, (baseH / corrected));
      const drawStart = Math.floor(baseH / 2 + state.horizon - lineH / 2);
      const tex = getWallTexture(ray.texId);
      const shade = clamp(corrected / MAX_DIST, 0, 1);

      ctx.drawImage(tex, ray.texX, 0, 1, textureSize, x, drawStart, 1, lineH);
      const wallShade = ray.side === 1 ? 0.12 : 0.05;
      ctx.fillStyle = `rgba(8,12,20,${clamp(shade * 0.82 + wallShade, 0, 0.88)})`;
      ctx.fillRect(x, drawStart, 1, lineH);
    }

    const ordered = sprites.map((s, i) => ({ ...s, _d: dist2(state.x, state.y, s.x, s.y), _i: i }))
      .sort((a, b) => b._d - a._d);

    const dirX = Math.cos(state.angle);
    const dirY = Math.sin(state.angle);
    const planeX = -dirY * Math.tan(HALF_FOV);
    const planeY = dirX * Math.tan(HALF_FOV);

    for (const s of ordered) {
      const spriteX = s.x - state.x;
      const spriteY = s.y - state.y;
      const invDet = 1.0 / (planeX * dirY - dirX * planeY || 1e-6);
      const transformX = invDet * (dirY * spriteX - dirX * spriteY);
      const transformY = invDet * (-planeY * spriteX + planeX * spriteY);
      if (transformY <= 0.08) continue;

      const tex = spriteTextures[s.tex];
      const spriteScreenX = Math.floor((baseW / 2) * (1 + transformX / transformY));
      const spriteH = Math.abs(Math.floor((baseH / transformY) * (s.scale || 1)));
      const spriteW = Math.floor(spriteH * (tex.width / tex.height));
      const drawStartY = Math.floor(baseH / 2 + state.horizon - spriteH + spriteH * (1 - (s.yOffset || 1)));
      const drawEndY = drawStartY + spriteH;
      const drawStartX = Math.floor(spriteScreenX - spriteW / 2);
      const drawEndX = drawStartX + spriteW;

      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (stripe < 0 || stripe >= baseW || transformY >= zBuffer[stripe]) continue;
        const texX = Math.floor((stripe - drawStartX) / spriteW * tex.width);
        ctx.drawImage(tex, texX, 0, 1, tex.height, stripe, drawStartY, 1, spriteH);
        const shade = clamp(transformY / MAX_DIST, 0, 0.88);
        if (shade > 0.01) {
          ctx.fillStyle = `rgba(8,12,20,${shade * 0.75})`;
          ctx.fillRect(stripe, drawStartY, 1, spriteH);
        }
      }
    }

    // parking lines and outdoor highlights overlay based on camera direction (subtle)
    if (scanlineOn) {
      ctx.fillStyle = 'rgba(255,255,255,0.045)';
      for (let y = 0; y < baseH; y += 4) ctx.fillRect(0, y, baseW, 1);
    }

    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 10; i++) {
      const x = (i * 57 + now * 0.01) % baseW;
      ctx.fillRect(x, (i * 43) % baseH, 1, 1);
    }
  }

  function update(dt) {
    let speed = MOVE_SPEED * (runOn ? RUN_MULT : 1);
    let forward = -state.joyY;
    let strafe = state.joyX;
    if (Math.abs(forward) < 0.06) forward = 0;
    if (Math.abs(strafe) < 0.06) strafe = 0;

    let moveX = 0;
    let moveY = 0;
    if (forward || strafe) {
      const len = Math.hypot(strafe, forward) || 1;
      strafe /= len;
      forward /= len;
      const cos = Math.cos(state.angle);
      const sin = Math.sin(state.angle);
      moveX = (cos * forward - sin * strafe) * speed * dt;
      moveY = (sin * forward + cos * strafe) * speed * dt;
    }

    // collision with small radius and axis separation
    const radius = 0.18;
    const nx = state.x + moveX;
    if (!isBlocking(nx + Math.sign(moveX) * radius, state.y) && !isBlocking(nx, state.y + radius) && !isBlocking(nx, state.y - radius)) {
      state.x = nx;
    }
    const ny = state.y + moveY;
    if (!isBlocking(state.x, ny + Math.sign(moveY) * radius) && !isBlocking(state.x + radius, ny) && !isBlocking(state.x - radius, ny)) {
      state.y = ny;
    }

    // keep from drifting into walls from spawn weirdness
    state.x = clamp(state.x, 1.2, MAP_W - 1.2);
    state.y = clamp(state.y, 1.2, MAP_H - 1.2);

    // automatic nearby hint refresh
    let nearest = null;
    let bestD = 99;
    for (const h of hotspots) {
      const d = dist2(state.x, state.y, h.x, h.y);
      if (d < bestD) {
        bestD = d;
        nearest = h;
      }
    }
    if (nearest && bestD < 3.0) {
      state.interactText = nearest.text;
    } else {
      state.interactText = '道・店・民家・分岐の構図が気持ちいいかを確認してください。';
    }
  }

  function animate(now) {
    const dt = Math.min(0.033, (now - lastTime) / 1000);
    lastTime = now;
    update(dt);
    renderScene(now);
    updateMessage(now);
    requestAnimationFrame(animate);
  }

  // initial boot message
  showMessage('開始位置は商店前通り。今度は最初から動ける版で組み直しています。', 2200);
  requestAnimationFrame(animate);
})();
