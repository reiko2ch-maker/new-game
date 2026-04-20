(() => {
  'use strict';

  const app = document.getElementById('app');
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const off = document.createElement('canvas');
  const offCtx = off.getContext('2d', { alpha: false, willReadFrequently: true });

  const runBtn = document.getElementById('runBtn');
  const interactBtn = document.getElementById('interactBtn');
  const menuBtn = document.getElementById('menuBtn');
  const menuPanel = document.getElementById('menuPanel');
  const toggleScanline = document.getElementById('toggleScanline');
  const qualityBtn = document.getElementById('qualityBtn');
  const sensitivityBtn = document.getElementById('sensitivityBtn');
  const hideHintBtn = document.getElementById('hideHintBtn');
  const hintBox = document.getElementById('hintBox');
  const messageBox = document.getElementById('messageBox');

  const joystickBase = document.getElementById('joystickBase');
  const joystickKnob = document.getElementById('joystickKnob');

  const QUALITY_LEVELS = {
    LOW: 144,
    MID: 184,
    HIGH: 228,
  };

  let quality = 'MID';
  let sensitivityIndex = 1;
  const sensitivities = [0.75, 1.0, 1.25, 1.5];
  let scanlineOn = false;
  let hintVisible = true;

  let viewW = 0;
  let viewH = 0;
  let renderW = 0;
  let renderH = 0;
  let imageData = null;
  let buffer32 = null;
  let skyBuffer = null;

  const TEX_SIZE = 64;
  const textures = [];
  const sprites = [];
  const zBuffer = [];

  const floorMap = [];
  const ceilMap = [];
  const wallMap = [];

  const worldLines = [];
  const parkingLines = [];

  const player = {
    x: 13.5,
    y: 15.6,
    dirX: 0,
    dirY: -1,
    planeX: 0.68,
    planeY: 0,
    z: 0.5,
    moveSpeed: 2.0,
    runFactor: 1.52,
    rotSpeed: 1.7,
  };

  const input = {
    moveX: 0,
    moveY: 0,
    running: false,
    lookDelta: 0,
    lookActive: false,
    touchId: null,
    lookTouchId: null,
    lookPrevX: 0,
  };

  const uiState = {
    message: '',
    messageUntil: 0,
  };

  function rgb(r, g, b, a = 255) {
    return (a << 24) | (b << 16) | (g << 8) | r;
  }

  function shade(color, factor) {
    const r = Math.max(0, Math.min(255, (color & 255) * factor));
    const g = Math.max(0, Math.min(255, ((color >> 8) & 255) * factor));
    const b = Math.max(0, Math.min(255, ((color >> 16) & 255) * factor));
    const a = (color >>> 24) & 255;
    return (a << 24) | ((b | 0) << 16) | ((g | 0) << 8) | (r | 0);
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  function rand(seed) {
    const x = Math.sin(seed * 12.9898) * 43758.5453;
    return x - Math.floor(x);
  }

  function makeTexture(draw) {
    const c = document.createElement('canvas');
    c.width = TEX_SIZE;
    c.height = TEX_SIZE;
    const g = c.getContext('2d');
    draw(g, TEX_SIZE);
    const data = g.getImageData(0, 0, TEX_SIZE, TEX_SIZE).data;
    return new Uint32Array(data.buffer.slice(0));
  }

  function makeSprite(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const data = g.getImageData(0, 0, w, h).data;
    return { width: w, height: h, data: new Uint32Array(data.buffer.slice(0)) };
  }

  function initTextures() {
    textures.length = 0;
    // 0 unused
    textures[0] = makeTexture((g, s) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, s, s);
    });

    textures[1] = makeTexture((g, s) => {
      // store pillar / façade panel
      g.fillStyle = '#ddd8cb';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 8) {
        g.fillStyle = i % 16 === 0 ? '#d2cbbd' : '#e6e1d7';
        g.fillRect(i, 0, 4, s);
      }
      g.fillStyle = '#e7e7dd';
      g.fillRect(0, 0, s, 11);
      g.fillStyle = '#f0b83a';
      g.fillRect(0, 3, s, 2);
      g.fillStyle = '#20a35e';
      g.fillRect(0, 5, s, 4);
      g.fillStyle = '#c84643';
      g.fillRect(0, 9, s, 2);
      g.fillStyle = '#bdb4a6';
      g.fillRect(0, s - 2, s, 2);
    });

    textures[2] = makeTexture((g, s) => {
      // store window
      g.fillStyle = '#ddd8cb';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#e8e8df';
      g.fillRect(0, 0, s, 11);
      g.fillStyle = '#f0b83a';
      g.fillRect(0, 3, s, 2);
      g.fillStyle = '#20a35e';
      g.fillRect(0, 5, s, 4);
      g.fillStyle = '#c84643';
      g.fillRect(0, 9, s, 2);
      g.fillStyle = '#292f3d';
      g.fillRect(6, 15, s - 12, s - 22);
      g.fillStyle = '#f0f3fb';
      g.fillRect(8, 17, s - 16, s - 26);
      g.fillStyle = '#b8c9f1';
      g.fillRect(10, 19, s - 20, s - 30);
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(12, 21, s - 24, 6);
      g.fillStyle = '#52678a';
      for (let i = 0; i < 6; i++) {
        g.fillRect(13 + i * 8, 31, 5, 20 + (i % 2) * 5);
      }
      g.fillStyle = '#3b4558';
      g.fillRect(s / 2 - 1, 16, 2, s - 24);
      g.fillRect(8, 41, s - 16, 2);
      g.fillStyle = '#2a303d';
      g.fillRect(6, 15, 2, s - 22);
      g.fillRect(s - 8, 15, 2, s - 22);
    });

    textures[3] = makeTexture((g, s) => {
      // door frame with dark opening
      g.fillStyle = '#ddd8cb';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#e8e8df';
      g.fillRect(0, 0, s, 11);
      g.fillStyle = '#f0b83a';
      g.fillRect(0, 3, s, 2);
      g.fillStyle = '#20a35e';
      g.fillRect(0, 5, s, 4);
      g.fillStyle = '#c84643';
      g.fillRect(0, 9, s, 2);
      g.fillStyle = '#222732';
      g.fillRect(8, 15, s - 16, s - 15);
      g.fillStyle = '#10131a';
      g.fillRect(12, 16, s - 24, s - 18);
      g.fillStyle = '#bac4d8';
      g.fillRect(9, 16, 2, s - 18);
      g.fillRect(s - 11, 16, 2, s - 18);
      g.fillStyle = '#596781';
      g.fillRect(18, 20, 6, 22);
      g.fillRect(38, 28, 8, 12);
      g.fillStyle = '#8b99b7';
      g.fillRect(15, s - 6, s - 30, 2);
    });

    textures[4] = makeTexture((g, s) => {
      // side wall with beige stripes and grime
      g.fillStyle = '#d6d0c2';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < s; i += 6) {
        g.fillStyle = i % 12 === 0 ? '#cec7b8' : '#e0dbd0';
        g.fillRect(i, 0, 3, s);
      }
      g.fillStyle = '#e8e8df';
      g.fillRect(0, 0, s, 10);
      g.fillStyle = '#f0b83a';
      g.fillRect(0, 3, s, 2);
      g.fillStyle = '#20a35e';
      g.fillRect(0, 5, s, 4);
      g.fillStyle = '#c84643';
      g.fillRect(0, 9, s, 2);
      g.fillStyle = 'rgba(80,72,60,0.18)';
      for (let i = 0; i < 30; i++) {
        g.fillRect(rand(i) * s, rand(i + 3) * s, 2, 2);
      }
    });

    textures[5] = makeTexture((g, s) => {
      // interior wall
      g.fillStyle = '#eceae2';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#d8d3c8';
      for (let i = 0; i < s; i += 12) g.fillRect(i, 0, 2, s);
      g.fillStyle = '#bdb7ab';
      g.fillRect(0, s - 8, s, 8);
      g.fillStyle = '#faf9f1';
      g.fillRect(0, 0, s, 6);
    });

    textures[6] = makeTexture((g, s) => {
      // shelf front
      g.fillStyle = '#3a404b';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#272c35';
      g.fillRect(0, 0, s, 8);
      g.fillRect(0, s - 8, s, 8);
      for (let row = 0; row < 3; row++) {
        const y = 10 + row * 17;
        g.fillStyle = '#4a515e';
        g.fillRect(4, y - 2, s - 8, 2);
        for (let i = 0; i < 7; i++) {
          const x = 6 + i * 8;
          const colors = ['#d84f4b', '#f0b44e', '#77a3ea', '#8bd989', '#b67be6'];
          g.fillStyle = colors[(i + row) % colors.length];
          g.fillRect(x, y, 6, 11);
        }
      }
    });

    textures[7] = makeTexture((g, s) => {
      // shelf side
      g.fillStyle = '#252a33';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#495160';
      g.fillRect(6, 8, s - 12, s - 16);
      g.fillStyle = '#12161d';
      g.fillRect(12, 14, s - 24, s - 28);
      g.fillStyle = '#616c80';
      g.fillRect(10, s - 10, s - 20, 4);
    });

    textures[8] = makeTexture((g, s) => {
      // counter
      g.fillStyle = '#ded7c9';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#bac5d8';
      g.fillRect(0, 0, s, 8);
      g.fillStyle = '#3ba566';
      g.fillRect(0, 8, s, 4);
      g.fillStyle = '#d1cabd';
      g.fillRect(6, 16, s - 12, s - 20);
      g.fillStyle = '#b8b1a4';
      g.fillRect(6, s - 12, s - 12, 6);
    });

    textures[9] = makeTexture((g, s) => {
      // house wall
      g.fillStyle = '#c8c2b6';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#d8d3c9';
      for (let i = 0; i < s; i += 10) g.fillRect(i, 0, 5, s);
      g.fillStyle = '#8b9098';
      g.fillRect(0, 0, s, 10);
      g.fillStyle = '#6d7178';
      g.fillRect(0, 10, s, 3);
      g.fillStyle = '#9ea7b3';
      g.fillRect(14, 24, 14, 18);
      g.fillRect(38, 26, 12, 16);
      g.fillStyle = '#737b89';
      g.fillRect(18, 28, 6, 10);
      g.fillRect(42, 30, 4, 8);
    });

    textures[10] = makeTexture((g, s) => {
      // closed shop / dark facade
      g.fillStyle = '#b9b5ab';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#8d8073';
      g.fillRect(0, 0, s, 10);
      g.fillStyle = '#5a5d65';
      g.fillRect(6, 16, s - 12, s - 20);
      g.fillStyle = '#2d323b';
      for (let x = 10; x < s - 10; x += 6) g.fillRect(x, 16, 2, s - 20);
      g.fillStyle = '#e3d7ad';
      g.fillRect(18, 6, s - 36, 2);
    });

    textures[11] = makeTexture((g, s) => {
      // utility/board wall
      g.fillStyle = '#a8a398';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#7f776c';
      g.fillRect(0, 0, s, 8);
      g.fillStyle = '#d9d2c3';
      g.fillRect(10, 16, s - 20, s - 26);
      g.fillStyle = '#b94e4e';
      g.fillRect(16, 22, s - 32, 4);
      g.fillStyle = '#4971bd';
      g.fillRect(18, 32, s - 36, 4);
      g.fillStyle = '#6f6b64';
      g.fillRect(0, s - 4, s, 4);
    });

    textures[12] = makeTexture((g, s) => {
      // shrine stone / wall
      g.fillStyle = '#8e928f';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 60; i++) {
        const x = rand(i) * s | 0;
        const y = rand(i + 8) * s | 0;
        const v = 120 + (rand(i + 13) * 70 | 0);
        g.fillStyle = `rgb(${v},${v},${v})`;
        g.fillRect(x, y, 2, 2);
      }
      g.fillStyle = '#737875';
      g.fillRect(0, 0, s, 4);
      g.fillRect(0, s - 4, s, 4);
    });

    textures[20] = makeTexture((g, s) => {
      // asphalt floor
      g.fillStyle = '#4f5156';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 140; i++) {
        const x = rand(i * 2.1) * s;
        const y = rand(i * 3.7) * s;
        const c = 70 + (rand(i * 6.7) * 28 | 0);
        g.fillStyle = `rgb(${c},${c},${c})`;
        g.fillRect(x, y, 1 + (i % 2), 1 + (i % 2));
      }
      g.strokeStyle = '#6a6d72';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(5, 50); g.lineTo(18, 38); g.lineTo(34, 42);
      g.moveTo(40, 55); g.lineTo(58, 47);
      g.stroke();
    });

    textures[21] = makeTexture((g, s) => {
      // interior tile floor
      g.fillStyle = '#ecece7';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c9c9c1';
      g.lineWidth = 1;
      for (let i = 0; i <= s; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
      }
      for (let i = 0; i < 30; i++) {
        const x = rand(i * 3.2) * s;
        const y = rand(i * 6.1) * s;
        g.fillStyle = 'rgba(180,180,174,0.14)';
        g.fillRect(x, y, 2, 2);
      }
    });

    textures[22] = makeTexture((g, s) => {
      // grass
      g.fillStyle = '#263f27';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 100; i++) {
        const x = rand(i * 5.3) * s;
        const y = rand(i * 3.1) * s;
        const h = 2 + (rand(i * 7.7) * 4 | 0);
        const r = 42 + (rand(i) * 18 | 0);
        const gch = 88 + (rand(i + 3) * 40 | 0);
        const b = 35 + (rand(i + 6) * 14 | 0);
        offCtx.fillStyle = `rgb(${r},${gch},${b})`;
        g.fillStyle = `rgb(${r},${gch},${b})`;
        g.fillRect(x, y, 1, h);
      }
    });

    textures[23] = makeTexture((g, s) => {
      // concrete / sidewalk
      g.fillStyle = '#8c8f95';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#76797e';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(5, 12); g.lineTo(56, 10); g.lineTo(40, 54);
      g.moveTo(6, 36); g.lineTo(52, 34);
      g.stroke();
      for (let i = 0; i < 40; i++) {
        const x = rand(i * 2) * s;
        const y = rand(i * 4) * s;
        g.fillStyle = 'rgba(255,255,255,0.06)';
        g.fillRect(x, y, 2, 2);
      }
    });

    textures[24] = makeTexture((g, s) => {
      // water / canal
      g.fillStyle = '#204863';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#326986';
      g.lineWidth = 1;
      for (let i = 0; i < s; i += 8) {
        g.beginPath(); g.moveTo(0, i + 2); g.lineTo(s, i); g.stroke();
      }
    });

    textures[30] = makeTexture((g, s) => {
      // fluorescent ceiling
      g.fillStyle = '#f2f0e7';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#d5d3ca';
      for (let i = 0; i <= s; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
      }
      g.fillStyle = '#fdfdf8';
      g.fillRect(10, 20, 44, 8);
      g.fillRect(10, 42, 44, 8);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(12, 22, 40, 2);
      g.fillRect(12, 44, 40, 2);
    });

    textures[31] = makeTexture((g, s) => {
      // dim interior ceiling / back room
      g.fillStyle = '#d8d6cf';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = '#c4c0b6';
      for (let i = 0; i <= s; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
      }
      g.fillStyle = '#f0efe8';
      g.fillRect(14, 18, 34, 6);
    });
  }

  let spriteSheets = {};

  function initSprites() {
    spriteSheets = {
      vending: makeSprite(64, 128, (g, w, h) => {
        g.clearRect(0, 0, w, h);
        g.fillStyle = '#e8ebf1'; g.fillRect(8, 8, w - 16, h - 12);
        g.fillStyle = '#d2dae8'; g.fillRect(12, 14, w - 24, 42);
        g.fillStyle = '#b6d2ff'; g.fillRect(16, 18, w - 32, 34);
        const cols = ['#d95b58','#ebc65b','#79a7ff','#83ce7b','#b485f0'];
        cols.forEach((c,i)=>{ g.fillStyle=c; g.fillRect(14 + i*9, 66, 7, 24); });
        g.fillStyle = '#283040'; g.fillRect(18, 96, w - 36, 12);
        g.fillStyle = '#c2c7d2'; g.fillRect(20, 112, w - 40, 8);
        g.fillStyle = '#9aa5ba'; g.fillRect(10, h - 8, w - 20, 4);
      }),
      phone: makeSprite(72, 140, (g, w, h) => {
        g.clearRect(0,0,w,h);
        g.fillStyle = '#87a9ae'; g.fillRect(10, 12, w - 20, h - 14);
        g.fillStyle = '#d7e4ea'; g.fillRect(14, 20, w - 28, h - 28);
        g.strokeStyle = '#5f787d'; g.lineWidth = 3;
        g.strokeRect(14, 20, w - 28, h - 28);
        g.beginPath(); g.moveTo(w/2, 20); g.lineTo(w/2, h - 8); g.stroke();
        g.beginPath(); g.moveTo(14, h/2); g.lineTo(w - 14, h/2); g.stroke();
        g.fillStyle = '#1d3240'; g.fillRect(26, 32, w - 52, 18);
      }),
      busStop: makeSprite(64, 128, (g, w, h) => {
        g.clearRect(0,0,w,h);
        g.fillStyle = '#56606e'; g.fillRect(w/2 - 3, 24, 6, h - 24);
        g.fillStyle = '#d7d7cf'; g.fillRect(16, 8, w - 32, 22);
        g.fillStyle = '#4b6ab8'; g.fillRect(18, 10, w - 36, 5);
        g.fillStyle = '#51596a'; g.fillRect(12, h - 18, w - 24, 6);
      }),
      bulletin: makeSprite(90, 78, (g, w, h) => {
        g.clearRect(0,0,w,h);
        g.fillStyle = '#7b5b37'; g.fillRect(0,0,w,h);
        g.fillStyle = '#d8cfb7'; g.fillRect(8, 8, w - 16, h - 16);
        g.fillStyle = '#d65a5a'; g.fillRect(14, 12, w - 28, 8);
        g.fillStyle = '#5d7ec7'; g.fillRect(16, 26, w - 32, 10);
        g.fillStyle = '#eadfbe'; g.fillRect(18, 42, w - 36, 20);
      }),
      clerk: makeSprite(74, 122, (g, w, h) => {
        g.clearRect(0,0,w,h);
        g.fillStyle = '#2a4d8b'; g.fillRect(18, 48, w - 36, 50);
        g.fillStyle = '#f2ccb0'; g.beginPath(); g.arc(w/2, 34, 18, 0, Math.PI*2); g.fill();
        g.fillStyle = '#3a2c25'; g.beginPath(); g.arc(w/2, 28, 18, Math.PI, Math.PI*2); g.fill();
        g.fillStyle = '#f1f4fb'; g.fillRect(30, 54, 14, 12);
        g.fillStyle = '#182131'; g.fillRect(24, 98, 10, 22); g.fillRect(w-34, 98, 10, 22);
      }),
      keiCar: makeSprite(136, 78, (g,w,h) => {
        g.clearRect(0,0,w,h);
        g.fillStyle = '#98a6b8';
        g.beginPath();
        g.moveTo(16, 54); g.lineTo(30, 30); g.lineTo(92, 30); g.lineTo(110, 44); g.lineTo(122, 54); g.closePath(); g.fill();
        g.fillRect(22, 42, 92, 18);
        g.fillStyle = '#d9e6f8'; g.fillRect(40, 34, 44, 16);
        g.fillRect(88, 36, 18, 12);
        g.fillStyle = '#20252d'; g.beginPath(); g.arc(38, 60, 10, 0, Math.PI*2); g.fill(); g.beginPath(); g.arc(102, 60, 10, 0, Math.PI*2); g.fill();
        g.fillStyle = '#8595ad'; g.beginPath(); g.arc(38, 60, 5, 0, Math.PI*2); g.fill(); g.beginPath(); g.arc(102, 60, 5, 0, Math.PI*2); g.fill();
      }),
      tree: makeSprite(96, 138, (g,w,h) => {
        g.clearRect(0,0,w,h);
        g.fillStyle = '#5b3e2d'; g.fillRect(w/2 - 8, 84, 16, 50);
        const bunches = [[30,74,24],[48,56,30],[66,76,24],[42,86,22],[56,90,20]];
        bunches.forEach(([x,y,r],i)=>{
          g.fillStyle = ['#314f2d','#3a5d35','#497443'][i%3];
          g.beginPath(); g.arc(x,y,r,0,Math.PI*2); g.fill();
        });
      }),
      signArrow: makeSprite(90, 46, (g,w,h)=>{
        g.clearRect(0,0,w,h);
        g.fillStyle = '#d9d1b7'; g.fillRect(10, 6, w - 22, h - 12);
        g.fillStyle = '#6e4f35'; g.fillRect(0, h/2 - 3, 18, 6);
        g.beginPath(); g.moveTo(0,h/2); g.lineTo(18,h/2-10); g.lineTo(18,h/2+10); g.closePath(); g.fill();
        g.fillStyle = '#834f37'; g.fillRect(14, 16, w - 30, 8);
      }),
      bench: makeSprite(110, 56, (g,w,h)=>{
        g.clearRect(0,0,w,h);
        g.fillStyle = '#5c6470'; g.fillRect(8, 26, w - 16, 10);
        g.fillStyle = '#8f98a8'; g.fillRect(10, 18, w - 20, 6);
        g.fillStyle = '#515865'; g.fillRect(20, 34, 6, 16); g.fillRect(w - 26, 34, 6, 16);
      }),
      shrineLamp: makeSprite(76, 122, (g,w,h)=>{
        g.clearRect(0,0,w,h);
        g.fillStyle = '#8f948f'; g.fillRect(w/2 - 6, 60, 12, 56);
        g.fillStyle = '#a7aba7'; g.fillRect(14, 44, w - 28, 20);
        g.fillStyle = '#f1df8d'; g.fillRect(22, 48, w - 44, 12);
      }),
    };

    sprites.length = 0;
    const push = (cfg) => sprites.push(Object.assign({ scale: 1, z: 0.5, label: '', alphaTest: true }, cfg));

    push({ x: 19.8, y: 8.9, art: spriteSheets.vending, scale: 0.9, z: 0.55, label: '夜だけ光る自販機' });
    push({ x: 7.2, y: 9.2, art: spriteSheets.phone, scale: 0.76, z: 0.55, label: '公衆電話ボックス' });
    push({ x: 6.3, y: 15.8, art: spriteSheets.busStop, scale: 0.65, z: 0.58, label: '古いバス停' });
    push({ x: 7.8, y: 7.4, art: spriteSheets.bulletin, scale: 0.78, z: 0.52, label: '町内掲示板' });
    push({ x: 14.0, y: 4.2, art: spriteSheets.clerk, scale: 0.62, z: 0.58, label: '店員' });
    push({ x: 17.2, y: 12.2, art: spriteSheets.keiCar, scale: 1.05, z: 0.34, label: '軽自動車' });
    push({ x: 4.9, y: 11.6, art: spriteSheets.tree, scale: 1.0, z: 0.52 });
    push({ x: 23.2, y: 13.8, art: spriteSheets.tree, scale: 1.05, z: 0.52 });
    push({ x: 21.8, y: 4.8, art: spriteSheets.signArrow, scale: 0.65, z: 0.58, label: '旅館方面の看板' });
    push({ x: 5.9, y: 16.5, art: spriteSheets.bench, scale: 0.78, z: 0.30 });
    push({ x: 22.8, y: 18.2, art: spriteSheets.shrineLamp, scale: 0.65, z: 0.55, label: '祠へ続く灯り' });
    push({ x: 18.9, y: 17.0, art: spriteSheets.vending, scale: 0.76, z: 0.55, label: '古びた自販機' });
  }

  function setWall(x, y, tex) { wallMap[y][x] = tex; }
  function setFloorRect(x0, y0, x1, y1, floorTex, ceilTex) {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        floorMap[y][x] = floorTex;
        ceilMap[y][x] = ceilTex;
      }
    }
  }

  function initMap() {
    const W = 28, H = 24;
    wallMap.length = 0; floorMap.length = 0; ceilMap.length = 0;
    for (let y = 0; y < H; y++) {
      wallMap[y] = new Array(W).fill(0);
      floorMap[y] = new Array(W).fill(20);
      ceilMap[y] = new Array(W).fill(0);
    }

    // border
    for (let x = 0; x < W; x++) { setWall(x, 0, 9); setWall(x, H - 1, 9); }
    for (let y = 0; y < H; y++) { setWall(0, y, 9); setWall(W - 1, y, 9); }

    // store shell
    for (let x = 9; x <= 18; x++) setWall(x, 2, 4);
    for (let y = 2; y <= 7; y++) { setWall(9, y, 4); setWall(18, y, 4); }
    // front façade with open door
    setWall(9, 7, 1);
    setWall(10, 7, 2); setWall(11, 7, 2); setWall(12, 7, 1);
    // 13,14 open entrance
    setWall(15, 7, 1); setWall(16, 7, 2); setWall(17, 7, 2); setWall(18, 7, 1);
    // store interior
    setFloorRect(10, 3, 17, 6, 21, 30);
    // shelves and counter
    setWall(11, 4, 6); setWall(12, 4, 6);
    setWall(15, 4, 6); setWall(16, 4, 6);
    setWall(11, 5, 6); setWall(12, 5, 6);
    setWall(15, 5, 6); setWall(16, 5, 6);
    setWall(13, 3, 8); setWall(14, 3, 8); setWall(15, 3, 8);

    // left houses
    for (let x = 3; x <= 6; x++) { setWall(x, 10, 9); setWall(x, 13, 9); }
    for (let y = 10; y <= 13; y++) { setWall(3, y, 9); setWall(6, y, 9); }
    for (let x = 4; x <= 6; x++) { setWall(x, 16, 9); setWall(x, 18, 9); }
    for (let y = 16; y <= 18; y++) { setWall(4, y, 9); setWall(6, y, 9); }

    // right houses / closed store
    for (let x = 21; x <= 24; x++) { setWall(x, 10, 9); setWall(x, 13, 9); }
    for (let y = 10; y <= 13; y++) { setWall(21, y, 9); setWall(24, y, 9); }
    for (let x = 21; x <= 25; x++) { setWall(x, 5, 10); setWall(x, 8, 10); }
    for (let y = 5; y <= 8; y++) { setWall(21, y, 10); setWall(25, y, 10); }

    // side concrete/canal areas
    setFloorRect(1, 1, 8, 23, 22, 0);
    setFloorRect(19, 1, 26, 23, 22, 0);
    setFloorRect(1, 14, 8, 19, 23, 0);
    setFloorRect(19, 13, 26, 19, 23, 0);

    // road / parking lot
    setFloorRect(7, 8, 20, 16, 20, 0);
    setFloorRect(9, 17, 17, 22, 20, 0);

    // grass edges
    setFloorRect(1, 1, 8, 9, 22, 0);
    setFloorRect(19, 1, 26, 4, 22, 0);
    setFloorRect(1, 20, 26, 22, 22, 0);

    // canal path east
    setFloorRect(19, 14, 24, 17, 24, 0);
    setFloorRect(24, 14, 26, 17, 23, 0);

    // shrine approach wall
    for (let x = 22; x <= 24; x++) setWall(x, 18, 12);

    // parking curbs / low visual walls as normal walls on edges
    setWall(8, 8, 11); setWall(8, 9, 11);
    setWall(20, 8, 11); setWall(20, 9, 11);

    worldLines.length = 0;
    parkingLines.length = 0;
    // utility poles and wires
    const poles = [
      { x: 8.2, y: 8.0, h: 1.25 },
      { x: 14.3, y: 8.0, h: 1.15 },
      { x: 21.3, y: 8.2, h: 1.35 },
      { x: 24.6, y: 6.8, h: 1.28 },
    ];
    poles.forEach((p) => {
      sprites.push({ x: p.x, y: p.y, art: makePoleSprite(), scale: 0.52, z: 0.7 });
    });
    for (let i = 0; i < poles.length - 1; i++) {
      const a = poles[i], b = poles[i + 1];
      worldLines.push({ ax: a.x, ay: a.y, az: a.h, bx: b.x, by: b.y, bz: b.h - 0.05, color: 'rgba(34,42,58,0.92)', width: 1.6 });
      worldLines.push({ ax: a.x, ay: a.y, az: a.h - 0.08, bx: b.x, by: b.y, bz: b.h - 0.14, color: 'rgba(48,56,74,0.9)', width: 1.2 });
    }

    // parking lines
    const slots = [9.7, 12.0, 14.3, 16.6, 18.9];
    slots.forEach((sx) => {
      parkingLines.push({ ax: sx, ay: 15.6, az: 0.02, bx: sx, by: 9.0, bz: 0.02, color: 'rgba(245,245,248,0.94)', width: 2.6 });
    });
    parkingLines.push({ ax: 9.7, ay: 15.6, az: 0.02, bx: 18.9, by: 15.6, bz: 0.02, color: 'rgba(245,245,248,0.94)', width: 2.6 });
    parkingLines.push({ ax: 12.9, ay: 7.92, az: 0.02, bx: 15.1, by: 7.92, bz: 0.02, color: 'rgba(90,95,105,0.98)', width: 4.0 });
  }

  function makePoleSprite() {
    return makeSprite(42, 144, (g, w, h) => {
      g.clearRect(0,0,w,h);
      g.fillStyle = '#44372d'; g.fillRect(w/2 - 4, 8, 8, h - 10);
      g.fillStyle = '#504236'; g.fillRect(w/2 - 10, 26, 20, 6);
      g.fillRect(w/2 - 12, 54, 24, 5);
    });
  }

  function resize() {
    viewW = window.innerWidth;
    viewH = window.innerHeight;
    canvas.width = Math.max(1, Math.floor(viewW * (window.devicePixelRatio > 1.5 ? 1.15 : 1)));
    canvas.height = Math.max(1, Math.floor(viewH * (window.devicePixelRatio > 1.5 ? 1.15 : 1)));
    canvas.style.width = `${viewW}px`;
    canvas.style.height = `${viewH}px`;

    const baseW = QUALITY_LEVELS[quality];
    renderW = baseW;
    renderH = Math.max(160, Math.floor(baseW * (viewH / viewW)));
    off.width = renderW;
    off.height = renderH;
    imageData = offCtx.createImageData(renderW, renderH);
    buffer32 = new Uint32Array(imageData.data.buffer);
    buildSkyBuffer();
    zBuffer.length = renderW;
    ctx.imageSmoothingEnabled = true;
  }

  function setMessage(text, dur = 1800) {
    uiState.message = text;
    uiState.messageUntil = performance.now() + dur;
    messageBox.textContent = text;
    messageBox.classList.remove('hidden');
  }

  function clearMessageIfNeeded(now) {
    if (uiState.message && now > uiState.messageUntil) {
      uiState.message = '';
      messageBox.classList.add('hidden');
    }
  }

  function getCell(map, x, y) {
    x = Math.floor(x); y = Math.floor(y);
    if (y < 0 || y >= map.length || x < 0 || x >= map[0].length) return 0;
    return map[y][x];
  }

  function isWallAt(x, y) {
    return getCell(wallMap, x, y) !== 0;
  }

  function buildSkyBuffer() {
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = renderW;
    skyCanvas.height = renderH;
    const g = skyCanvas.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, renderH);
    grad.addColorStop(0.0, '#0f255c');
    grad.addColorStop(0.38, '#0d245a');
    grad.addColorStop(0.58, '#13274b');
    grad.addColorStop(1.0, '#09111f');
    g.fillStyle = grad;
    g.fillRect(0, 0, renderW, renderH);

    g.fillStyle = 'rgba(255,255,255,0.82)';
    for (let i = 0; i < 34; i++) {
      const x = ((i * 53.13) % 1) * renderW;
      const y = (Math.sin(i * 7.3) * 0.5 + 0.5) * renderH * 0.34;
      const s = i % 7 === 0 ? 2 : 1;
      g.fillRect(x | 0, y | 0, s, s);
    }

    g.fillStyle = '#0a1220';
    g.beginPath();
    g.moveTo(0, renderH * 0.40);
    const points = [
      [0.08,0.35],[0.16,0.38],[0.25,0.32],[0.34,0.39],[0.44,0.31],[0.53,0.38],[0.62,0.34],[0.72,0.41],[0.84,0.33],[0.94,0.39],[1.0,0.37]
    ];
    points.forEach(([px, py]) => g.lineTo(px * renderW, py * renderH));
    g.lineTo(renderW, renderH * 0.52);
    g.lineTo(renderW, renderH);
    g.lineTo(0, renderH);
    g.closePath();
    g.fill();

    skyBuffer = new Uint32Array(g.getImageData(0, 0, renderW, renderH).data.buffer.slice(0));
  }

  function renderFloorAndCeiling() {
    const rayDirX0 = player.dirX - player.planeX;
    const rayDirY0 = player.dirY - player.planeY;
    const rayDirX1 = player.dirX + player.planeX;
    const rayDirY1 = player.dirY + player.planeY;
    const horizon = renderH >> 1;
    const maxDist = 18;

    for (let y = 0; y < renderH; y++) {
      const isFloor = y > horizon;
      const p = isFloor ? (y - horizon) : (horizon - y);
      if (p === 0) continue;
      const rowDistance = player.z * renderH / p;
      const stepX = rowDistance * (rayDirX1 - rayDirX0) / renderW;
      const stepY = rowDistance * (rayDirY1 - rayDirY0) / renderW;
      let floorX = player.x + rowDistance * rayDirX0;
      let floorY = player.y + rowDistance * rayDirY0;
      const fog = clamp(1 - rowDistance / maxDist, isFloor ? 0.28 : 0.18, 1);

      for (let x = 0; x < renderW; x++) {
        const cellX = floorX | 0;
        const cellY = floorY | 0;
        const tx = ((TEX_SIZE * (floorX - cellX)) & (TEX_SIZE - 1)) | 0;
        const ty = ((TEX_SIZE * (floorY - cellY)) & (TEX_SIZE - 1)) | 0;
        if (cellY >= 0 && cellY < floorMap.length && cellX >= 0 && cellX < floorMap[0].length) {
          if (isFloor) {
            const floorTex = floorMap[cellY][cellX] || 20;
            const col = textures[floorTex][ty * TEX_SIZE + tx];
            buffer32[y * renderW + x] = shade(col, fog);
          } else {
            const ceilTex = ceilMap[cellY][cellX] || 0;
            if (ceilTex) {
              const col = textures[ceilTex][ty * TEX_SIZE + tx];
              buffer32[y * renderW + x] = shade(col, Math.min(1, fog * 1.08));
            }
          }
        }
        floorX += stepX;
        floorY += stepY;
      }
    }
  }

  function renderWalls() {
    for (let x = 0; x < renderW; x++) {
      const cameraX = 2 * x / renderW - 1;
      const rayDirX = player.dirX + player.planeX * cameraX;
      const rayDirY = player.dirY + player.planeY * cameraX;
      let mapX = player.x | 0;
      let mapY = player.y | 0;

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX);
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY);
      let stepX, stepY, sideDistX, sideDistY;

      if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1.0 - player.x) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1.0 - player.y) * deltaDistY; }

      let hit = 0, side = 0, texId = 1;
      while (!hit) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX; mapX += stepX; side = 0;
        } else {
          sideDistY += deltaDistY; mapY += stepY; side = 1;
        }
        texId = getCell(wallMap, mapX, mapY);
        if (texId > 0) hit = 1;
      }

      let perpWallDist = side === 0 ? (mapX - player.x + (1 - stepX) / 2) / rayDirX : (mapY - player.y + (1 - stepY) / 2) / rayDirY;
      perpWallDist = Math.max(0.01, perpWallDist);
      zBuffer[x] = perpWallDist;

      const lineHeight = Math.abs((renderH / perpWallDist) | 0);
      let drawStart = ((renderH - lineHeight) >> 1) - (player.z - 0.5) * lineHeight;
      let drawEnd = ((renderH + lineHeight) >> 1) - (player.z - 0.5) * lineHeight;
      drawStart = clamp(drawStart | 0, 0, renderH - 1);
      drawEnd = clamp(drawEnd | 0, 0, renderH - 1);

      let wallX = side === 0 ? player.y + perpWallDist * rayDirY : player.x + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);
      let texX = (wallX * TEX_SIZE) | 0;
      if (side === 0 && rayDirX > 0) texX = TEX_SIZE - texX - 1;
      if (side === 1 && rayDirY < 0) texX = TEX_SIZE - texX - 1;
      const tex = textures[texId];
      const shadeBase = side ? 0.78 : 0.92;
      const fog = clamp(1 - perpWallDist / 18, 0.18, 1) * shadeBase;

      for (let y = drawStart; y <= drawEnd; y++) {
        const d = ((y << 8) - (renderH << 7) + (lineHeight << 7));
        const texY = (((d * TEX_SIZE) / lineHeight) >> 8) & (TEX_SIZE - 1);
        const col = tex[texY * TEX_SIZE + texX];
        buffer32[y * renderW + x] = shade(col, fog);
      }
    }
  }

  function renderSprites() {
    const spriteOrder = sprites.map((s, i) => ({ i, dist: (player.x - s.x) ** 2 + (player.y - s.y) ** 2 }))
      .sort((a, b) => b.dist - a.dist);

    for (const item of spriteOrder) {
      const spr = sprites[item.i];
      const spriteX = spr.x - player.x;
      const spriteY = spr.y - player.y;
      const invDet = 1.0 / (player.planeX * player.dirY - player.dirX * player.planeY);
      const transformX = invDet * (player.dirY * spriteX - player.dirX * spriteY);
      const transformY = invDet * (-player.planeY * spriteX + player.planeX * spriteY);
      if (transformY <= 0.1) continue;

      const spriteScreenX = ((renderW / 2) * (1 + transformX / transformY)) | 0;
      const spriteHeight = Math.abs((renderH / transformY) * spr.scale) | 0;
      const yOffset = ((0.5 - spr.z) * renderH / transformY) | 0;
      let drawStartY = ((renderH - spriteHeight) >> 1) + yOffset;
      let drawEndY = drawStartY + spriteHeight;
      drawStartY = clamp(drawStartY, 0, renderH - 1);
      drawEndY = clamp(drawEndY, 0, renderH - 1);
      const spriteWidth = spriteHeight * (spr.art.width / spr.art.height);
      let drawStartX = (spriteScreenX - spriteWidth / 2) | 0;
      let drawEndX = (spriteScreenX + spriteWidth / 2) | 0;
      drawStartX = clamp(drawStartX, 0, renderW - 1);
      drawEndX = clamp(drawEndX, 0, renderW - 1);
      const fog = clamp(1 - transformY / 18, 0.18, 1);

      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        const texX = (((stripe - (spriteScreenX - spriteWidth / 2)) * spr.art.width) / spriteWidth) | 0;
        if (transformY >= zBuffer[stripe]) continue;
        for (let y = drawStartY; y < drawEndY; y++) {
          const d = y - (((renderH - spriteHeight) >> 1) + yOffset);
          const texY = ((d * spr.art.height) / spriteHeight) | 0;
          const col = spr.art.data[texY * spr.art.width + texX];
          if ((col >>> 24) === 0) continue;
          buffer32[y * renderW + stripe] = shade(col, fog);
        }
      }
    }
  }

  function projectPoint(wx, wy, wz) {
    const relX = wx - player.x;
    const relY = wy - player.y;
    const invDet = 1.0 / (player.planeX * player.dirY - player.dirX * player.planeY);
    const transformX = invDet * (player.dirY * relX - player.dirX * relY);
    const transformY = invDet * (-player.planeY * relX + player.planeX * relY);
    if (transformY <= 0.06) return null;
    const x = (renderW / 2) * (1 + transformX / transformY);
    const y = renderH / 2 - ((wz - player.z) / transformY) * renderH;
    return { x, y, depth: transformY };
  }

  function drawWorldLine(line) {
    const a = projectPoint(line.ax, line.ay, line.az);
    const b = projectPoint(line.bx, line.by, line.bz);
    if (!a || !b) return;
    offCtx.strokeStyle = line.color;
    offCtx.lineWidth = clamp(line.width / ((a.depth + b.depth) * 0.3), 0.8, 4);
    offCtx.beginPath();
    offCtx.moveTo(a.x, a.y);
    offCtx.lineTo(b.x, b.y);
    offCtx.stroke();
  }

  function renderOverlays() {
    // parking lines and wires
    for (const line of parkingLines) drawWorldLine(line);
    for (const line of worldLines) drawWorldLine(line);

    // subtle fluorescent glow near store entrance
    const entrance = projectPoint(13.8, 7.15, 0.6);
    if (entrance) {
      const glow = offCtx.createRadialGradient(entrance.x, entrance.y, 2, entrance.x, entrance.y, renderW * 0.12);
      glow.addColorStop(0, 'rgba(255,255,240,0.18)');
      glow.addColorStop(1, 'rgba(255,255,240,0)');
      offCtx.fillStyle = glow;
      offCtx.beginPath();
      offCtx.arc(entrance.x, entrance.y, renderW * 0.12, 0, Math.PI * 2);
      offCtx.fill();
    }
  }

  function renderFrame() {
    buffer32.set(skyBuffer);
    renderFloorAndCeiling();
    renderWalls();
    renderSprites();
    offCtx.putImageData(imageData, 0, 0);
    renderOverlays();

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }

  function rotate(amount) {
    const cos = Math.cos(amount), sin = Math.sin(amount);
    const oldDirX = player.dirX;
    player.dirX = player.dirX * cos - player.dirY * sin;
    player.dirY = oldDirX * sin + player.dirY * cos;
    const oldPlaneX = player.planeX;
    player.planeX = player.planeX * cos - player.planeY * sin;
    player.planeY = oldPlaneX * sin + player.planeY * cos;
  }

  function update(dt) {
    const turn = input.lookDelta * player.rotSpeed * sensitivities[sensitivityIndex] * dt;
    input.lookDelta = 0;
    if (turn) rotate(turn);

    const forwardX = player.dirX;
    const forwardY = player.dirY;
    const rightX = player.dirY;
    const rightY = -player.dirX;
    const speed = player.moveSpeed * (input.running ? player.runFactor : 1) * dt;

    let wishX = 0, wishY = 0;
    wishX += forwardX * input.moveY * speed;
    wishY += forwardY * input.moveY * speed;
    wishX += rightX * input.moveX * speed;
    wishY += rightY * input.moveX * speed;

    const nextX = player.x + wishX;
    const nextY = player.y + wishY;
    const radius = 0.18;

    if (!isWallAt(nextX + Math.sign(wishX || 1) * radius, player.y) && !isWallAt(nextX, player.y + radius) && !isWallAt(nextX, player.y - radius)) {
      player.x = nextX;
    }
    if (!isWallAt(player.x, nextY + Math.sign(wishY || 1) * radius) && !isWallAt(player.x + radius, nextY) && !isWallAt(player.x - radius, nextY)) {
      player.y = nextY;
    }
  }

  function nearestInteractable() {
    let best = null;
    for (const spr of sprites) {
      if (!spr.label) continue;
      const dx = spr.x - player.x;
      const dy = spr.y - player.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1.8) continue;
      const dot = (dx * player.dirX + dy * player.dirY) / dist;
      if (dot < 0.55) continue;
      if (!best || dist < best.dist) best = { label: spr.label, dist };
    }
    if (player.x > 12.7 && player.x < 14.9 && player.y > 3.5 && player.y < 5.2) {
      return { label: 'レジカウンター', dist: 0.5 };
    }
    return best;
  }

  function handleInteract() {
    const target = nearestInteractable();
    if (!target) {
      setMessage('いま調べられるものはない。');
      return;
    }
    setMessage(`${target.label} を見た。`, 1500);
  }

  function updateInteractionLabel() {
    const target = nearestInteractable();
    interactBtn.textContent = target ? `調べる：${target.label}` : '調べる';
  }

  function setupInput() {
    runBtn.addEventListener('click', () => {
      input.running = !input.running;
      runBtn.textContent = `走る：${input.running ? 'ON' : 'OFF'}`;
      runBtn.className = `action-btn ${input.running ? 'run-on' : 'run-off'}`;
    });

    interactBtn.addEventListener('click', handleInteract);
    menuBtn.addEventListener('click', () => menuPanel.classList.toggle('hidden'));

    toggleScanline.addEventListener('click', () => {
      scanlineOn = !scanlineOn;
      app.classList.toggle('scanline-on', scanlineOn);
      app.classList.toggle('scanline-off', !scanlineOn);
      toggleScanline.textContent = scanlineOn ? 'ON' : 'OFF';
    });

    qualityBtn.addEventListener('click', () => {
      quality = quality === 'LOW' ? 'MID' : quality === 'MID' ? 'HIGH' : 'LOW';
      qualityBtn.textContent = quality;
      resize();
    });

    sensitivityBtn.addEventListener('click', () => {
      sensitivityIndex = (sensitivityIndex + 1) % sensitivities.length;
      sensitivityBtn.textContent = `${sensitivities[sensitivityIndex].toFixed(2).replace(/\.00$/, '')}x`;
    });

    hideHintBtn.addEventListener('click', () => {
      hintVisible = !hintVisible;
      hintBox.classList.toggle('hidden', !hintVisible);
      hideHintBtn.textContent = hintVisible ? '表示' : '非表示';
    });

    function baseCenter() {
      const rect = joystickBase.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: rect.width * 0.36 };
    }

    function setStick(dx, dy) {
      const c = baseCenter();
      const len = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(c.r, len);
      const nx = dx / len;
      const ny = dy / len;
      const px = nx * clamped;
      const py = ny * clamped;
      joystickKnob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
      input.moveX = clamp(px / c.r, -1, 1);
      input.moveY = clamp(py / c.r, -1, 1) * -1;
    }

    function resetStick() {
      joystickKnob.style.transform = 'translate(-50%, -50%)';
      input.moveX = 0;
      input.moveY = 0;
      input.touchId = null;
    }

    function pointFromEvent(ev) {
      return { x: ev.clientX, y: ev.clientY };
    }

    window.addEventListener('pointerdown', (ev) => {
      if (menuPanel.contains(ev.target) || ev.target === menuBtn || ev.target === runBtn || ev.target === interactBtn || ev.target === toggleScanline || ev.target === qualityBtn || ev.target === sensitivityBtn || ev.target === hideHintBtn) return;
      const joyRect = joystickBase.getBoundingClientRect();
      if (ev.clientX >= joyRect.left && ev.clientX <= joyRect.right && ev.clientY >= joyRect.top && ev.clientY <= joyRect.bottom) {
        input.touchId = ev.pointerId;
        const c = baseCenter();
        setStick(ev.clientX - c.x, ev.clientY - c.y);
      } else if (ev.clientX > window.innerWidth * 0.42) {
        input.lookTouchId = ev.pointerId;
        input.lookActive = true;
        input.lookPrevX = ev.clientX;
      }
    }, { passive: true });

    window.addEventListener('pointermove', (ev) => {
      if (input.touchId === ev.pointerId) {
        const c = baseCenter();
        setStick(ev.clientX - c.x, ev.clientY - c.y);
      }
      if (input.lookTouchId === ev.pointerId && input.lookActive) {
        const dx = ev.clientX - input.lookPrevX;
        input.lookPrevX = ev.clientX;
        input.lookDelta = clamp(input.lookDelta - dx * 0.0038, -0.15, 0.15);
      }
    }, { passive: true });

    function releasePointer(id) {
      if (input.touchId === id) resetStick();
      if (input.lookTouchId === id) {
        input.lookTouchId = null;
        input.lookActive = false;
      }
    }

    window.addEventListener('pointerup', (ev) => releasePointer(ev.pointerId), { passive: true });
    window.addEventListener('pointercancel', (ev) => releasePointer(ev.pointerId), { passive: true });
  }

  let last = performance.now();
  let lastRender = 0;
  const targetStep = 1000 / 30;

  function loop(now) {
    const dtMs = Math.min(40, now - last);
    last = now;
    update(dtMs / 1000);
    clearMessageIfNeeded(now);
    updateInteractionLabel();
    if (now - lastRender >= targetStep) {
      renderFrame();
      lastRender = now;
    }
    requestAnimationFrame(loop);
  }

  function init() {
    initTextures();
    initSprites();
    initMap();
    resize();
    setupInput();

    menuPanel.classList.add('hidden');
    toggleScanline.textContent = 'OFF';
    qualityBtn.textContent = quality;
    sensitivityBtn.textContent = `${sensitivities[sensitivityIndex].toFixed(2).replace(/\.00$/, '')}x`;
    app.classList.toggle('scanline-on', false);
    app.classList.toggle('scanline-off', true);
    runBtn.textContent = '走る：OFF';
    runBtn.className = 'action-btn run-off';

    window.addEventListener('resize', resize);
    setMessage('1から再構築した版。まずは外観→店内→路地の見え方を確認。', 2400);
    requestAnimationFrame(loop);
  }

  init();
})();
