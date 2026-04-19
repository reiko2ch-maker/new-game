(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const scanBtn = document.getElementById('scanBtn');
  const crtOverlay = document.getElementById('crtOverlay');
  const runBtn = document.getElementById('runBtn');
  const interactBtn = document.getElementById('interactBtn');
  const hintBox = document.getElementById('hintBox');
  const joystickBase = document.getElementById('joystickBase');
  const joystickStick = document.getElementById('joystickStick');

  const state = {
    running: false,
    scanline: true,
    showHintUntil: performance.now() + 9000,
    lookDragId: null,
    lastTime: performance.now(),
    input: {
      moveX: 0,
      moveY: 0,
      touchStarted: false,
    },
    message: 'コンビニの明かりを目印に、細い生活道路から商店前通りまで歩いてみてください。',
    audioStarted: false,
  };

  const game = {
    mapW: 44,
    mapH: 34,
    walls: [],
    zone: [],
    sprites: [],
    interactables: [],
    player: {
      x: 7.5,
      y: 27.5,
      angle: -Math.PI / 2 + 0.15,
      pitch: 0,
      dirX: 0,
      dirY: -1,
      planeX: 0.78,
      planeY: 0,
      bob: 0,
      lookVel: 0,
    },
    zBuffer: [],
    texSize: 64,
    textures: {},
    spriteTextures: {},
    skyCanvas: null,
    lowCanvas: document.createElement('canvas'),
    lowCtx: null,
    renderW: 216,
    renderH: 384,
    horizon: 0.5,
    time: 0,
  };
  game.lowCtx = game.lowCanvas.getContext('2d', { alpha: false });

  function setHint(text, duration = 2600) {
    state.message = text;
    hintBox.textContent = text;
    state.showHintUntil = performance.now() + duration;
  }

  function makeTexture(drawFn, size = 64) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    drawFn(g, size);
    const data = g.getImageData(0, 0, size, size).data;
    return { canvas: c, data, size };
  }

  function shadeColor(r, g, b, shade) {
    return [Math.max(0, Math.min(255, r * shade)), Math.max(0, Math.min(255, g * shade)), Math.max(0, Math.min(255, b * shade))];
  }

  function drawNoise(g, size, base, variance) {
    const img = g.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = base + (Math.random() - 0.5) * variance;
      img.data[i] = n;
      img.data[i + 1] = n;
      img.data[i + 2] = n;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  function textCenter(g, text, x, y, size, color, font = 'system-ui') {
    g.fillStyle = color;
    g.font = `800 ${size}px ${font}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, x, y);
  }

  function createTextures() {
    game.textures.asphalt = makeTexture((g, s) => {
      g.fillStyle = '#262932';
      g.fillRect(0, 0, s, s);
      drawNoise(g, s, 46, 18);
      g.fillStyle = 'rgba(20,20,26,0.26)';
      for (let i = 0; i < 120; i++) g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
      g.strokeStyle = 'rgba(175,180,190,0.1)';
      g.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        g.beginPath();
        g.moveTo(Math.random() * s, Math.random() * s);
        g.lineTo(Math.random() * s, Math.random() * s);
        g.stroke();
      }
    });

    game.textures.concrete = makeTexture((g, s) => {
      g.fillStyle = '#7d8287';
      g.fillRect(0, 0, s, s);
      drawNoise(g, s, 126, 28);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 60; i++) g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      g.strokeStyle = 'rgba(70,70,75,0.26)';
      for (let y = 0; y < s; y += 16) {
        g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke();
      }
    });

    game.textures.tile = makeTexture((g, s) => {
      g.fillStyle = '#dadbd6';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(120,128,128,0.32)';
      for (let i = 0; i <= s; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
      }
      g.fillStyle = 'rgba(110,110,100,0.06)';
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * s, Math.random() * s, 3, 3);
    });

    game.textures.dirt = makeTexture((g, s) => {
      g.fillStyle = '#615647';
      g.fillRect(0, 0, s, s);
      const img = g.createImageData(s, s);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = 86 + Math.random() * 34;
        img.data[i] = n;
        img.data[i + 1] = 73 + Math.random() * 25;
        img.data[i + 2] = 56 + Math.random() * 20;
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      g.fillStyle = 'rgba(70,90,50,0.18)';
      for (let i = 0; i < 70; i++) g.fillRect(Math.random() * s, Math.random() * s, 2, 4);
    });

    game.textures.grass = makeTexture((g, s) => {
      g.fillStyle = '#274025';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 180; i++) {
        const x = Math.random() * s;
        const y = Math.random() * s;
        const h = 3 + Math.random() * 8;
        g.strokeStyle = `rgba(${60 + Math.random() * 40}, ${110 + Math.random() * 80}, ${50 + Math.random() * 20}, 0.65)`;
        g.beginPath();
        g.moveTo(x, y + h);
        g.lineTo(x + (Math.random() - 0.5) * 3, y);
        g.stroke();
      }
    });

    game.textures.water = makeTexture((g, s) => {
      const grad = g.createLinearGradient(0, 0, s, s);
      grad.addColorStop(0, '#23426b');
      grad.addColorStop(1, '#0d2341');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(180,220,255,0.18)';
      for (let i = 0; i < s; i += 7) {
        g.beginPath();
        g.moveTo(0, i + Math.sin(i * 0.2) * 3);
        g.lineTo(s, i + Math.cos(i * 0.17) * 3);
        g.stroke();
      }
    });

    game.textures.stone = makeTexture((g, s) => {
      g.fillStyle = '#8f8a80';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(80,80,80,0.25)';
      g.lineWidth = 2;
      for (let y = 0; y < s; y += 18) {
        for (let x = 0; x < s; x += 18) {
          const ox = (Math.random() - 0.5) * 3;
          const oy = (Math.random() - 0.5) * 3;
          g.strokeRect(x + ox, y + oy, 16, 16);
        }
      }
    });

    game.textures.shopExterior = makeTexture((g, s) => {
      g.fillStyle = '#cfc6bb';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 8) {
        g.fillStyle = y % 16 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.04)';
        g.fillRect(0, y, s, 4);
      }
      g.fillStyle = '#2ead6e'; g.fillRect(0, 12, s, 4);
      g.fillStyle = '#df6f53'; g.fillRect(0, 18, s, 3);
      g.fillStyle = 'rgba(0,0,0,0.06)';
      for (let i = 0; i < 25; i++) g.fillRect(Math.random() * s, Math.random() * s, 2, 1 + Math.random() * 2);
    });

    game.textures.shopWallpaper = makeTexture((g, s) => {
      g.fillStyle = '#8b7b6a';
      g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 8) {
        g.fillStyle = x % 16 === 0 ? '#927f6a' : '#776959';
        g.fillRect(x, 0, 5, s);
      }
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 45; i++) g.fillRect(Math.random() * s, Math.random() * s, 1, 3);
    });

    game.textures.houseWallA = makeTexture((g, s) => {
      g.fillStyle = '#a49b92';
      g.fillRect(0, 0, s, s);
      for (let x = 0; x < s; x += 10) {
        g.fillStyle = x % 20 === 0 ? '#96897f' : '#b3aba4';
        g.fillRect(x, 0, 8, s);
      }
      g.strokeStyle = 'rgba(70,60,50,0.14)';
      for (let y = 0; y < s; y += 20) { g.beginPath(); g.moveTo(0, y); g.lineTo(s, y); g.stroke(); }
    });

    game.textures.houseWallB = makeTexture((g, s) => {
      g.fillStyle = '#72818a';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 8) {
        g.fillStyle = y % 16 === 0 ? '#85959e' : '#66727a';
        g.fillRect(0, y, s, 4);
      }
      g.fillStyle = 'rgba(255,255,255,0.05)';
      for (let i = 0; i < 40; i++) g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
    });

    game.textures.blockWall = makeTexture((g, s) => {
      g.fillStyle = '#a0a4a8';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(80,85,90,0.3)';
      g.lineWidth = 1;
      for (let y = 0; y < s; y += 16) {
        for (let x = 0; x < s; x += 24) {
          const offset = (y / 16 % 2) * 12;
          g.strokeRect((x + offset) % s, y, 23, 15);
        }
      }
    });

    game.textures.fence = makeTexture((g, s) => {
      g.fillStyle = '#555f6e';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#cad7e2';
      for (let x = 6; x < s; x += 12) g.fillRect(x, 0, 4, s);
      g.fillRect(0, 14, s, 4);
      g.fillRect(0, 34, s, 4);
    });

    game.textures.shelf = makeTexture((g, s) => {
      g.fillStyle = '#27354b';
      g.fillRect(0, 0, s, s);
      for (let y = 8; y < s; y += 14) {
        g.fillStyle = '#152130'; g.fillRect(0, y, s, 4);
        for (let x = 4; x < s; x += 9) {
          const hue = [ '#d45161', '#5e89d7', '#cea95a', '#7cc06f', '#a274d7', '#d98557' ][(x + y) % 6];
          g.fillStyle = hue;
          g.fillRect(x, y - 8, 6, 8 + (x % 2));
        }
      }
    });

    game.textures.fridge = makeTexture((g, s) => {
      g.fillStyle = '#ccd5dc';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#a6b8c2';
      for (let x = 0; x < s; x += 16) g.fillRect(x, 0, 3, s);
      g.fillStyle = 'rgba(180,230,255,0.24)';
      for (let x = 3; x < s; x += 16) g.fillRect(x, 2, 11, s - 4);
      for (let x = 5; x < s; x += 16) {
        for (let y = 8; y < s; y += 14) {
          g.fillStyle = [ '#88c9ff', '#ffa86e', '#f1f4f6', '#d96161' ][(x + y) % 4];
          g.fillRect(x, y, 7, 9);
        }
      }
    });

    game.textures.counter = makeTexture((g, s) => {
      g.fillStyle = '#c7c7bf';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 6) {
        g.fillStyle = y % 12 === 0 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.03)';
        g.fillRect(0, y, s, 2);
      }
      g.fillStyle = '#7a7e85'; g.fillRect(0, s - 10, s, 10);
    });

    game.textures.shutter = makeTexture((g, s) => {
      g.fillStyle = '#6c6f74';
      g.fillRect(0, 0, s, s);
      for (let y = 0; y < s; y += 6) {
        g.fillStyle = y % 12 === 0 ? '#81858a' : '#5f6369';
        g.fillRect(0, y, s, 3);
      }
    });

    game.textures.curtain = makeTexture((g, s) => {
      g.fillStyle = '#191c23';
      g.fillRect(0, 0, s, s);
      g.fillStyle = '#2b3140';
      for (let x = 0; x < s; x += 8) g.fillRect(x, 0, 4, s);
    });

    game.textures.ceiling = makeTexture((g, s) => {
      g.fillStyle = '#c9c9c2';
      g.fillRect(0, 0, s, s);
      g.strokeStyle = 'rgba(90,90,90,0.22)';
      for (let i = 0; i <= s; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, s); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(s, i); g.stroke();
      }
      g.fillStyle = 'rgba(255,255,255,0.34)';
      g.fillRect(18, 18, 28, 8);
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(16, 16, 32, 12);
    });

    game.spriteTextures.sign = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#29a85e';
      g.fillRect(6, 14, s - 12, 28);
      g.fillStyle = '#e8fbe9';
      g.font = '700 10px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('こもれびマート', s / 2, 28);
    });

    game.spriteTextures.lightPole = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#433f41';
      g.fillRect(s * 0.48, 4, 6, s - 4);
      g.fillRect(s * 0.48, 16, 16, 4);
      g.fillStyle = '#f0e2bb';
      g.fillRect(s * 0.62, 14, 18, 8);
      g.fillStyle = 'rgba(255,232,170,0.35)';
      g.beginPath(); g.arc(s * 0.76, 18, 12, 0, Math.PI * 2); g.fill();
    });

    game.spriteTextures.powerPole = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#3d332e';
      g.fillRect(s * 0.48, 2, 8, s - 2);
      g.fillRect(s * 0.3, 20, s * 0.45, 4);
      g.fillStyle = '#222831';
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(s * (0.3 + i * 0.16), 22, 3, 0, Math.PI * 2);
        g.fill();
      }
    });

    game.spriteTextures.vending = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#eef4f9'; g.fillRect(10, 8, s - 20, s - 8);
      g.fillStyle = '#7dd6ff'; g.fillRect(18, 16, s - 36, 24);
      g.fillStyle = '#7d8ea1'; g.fillRect(18, 44, s - 36, 28);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#d85454', '#5f8fd9', '#e0c65f', '#7bc875'][i];
        g.fillRect(22 + i * 10, 22, 8, 14);
      }
      g.fillStyle = '#1f2d40'; g.fillRect(14, s - 10, s - 28, 6);
    });

    game.spriteTextures.phone = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = 'rgba(195, 225, 255, 0.24)'; g.fillRect(8, 12, s - 16, s - 12);
      g.strokeStyle = '#a8d1ff'; g.lineWidth = 2; g.strokeRect(8, 12, s - 16, s - 12);
      g.fillStyle = '#4d6e91'; g.fillRect(20, 24, s - 40, 18);
      g.fillStyle = '#dfe7ef'; g.fillRect(24, 50, s - 48, 18);
    });

    game.spriteTextures.busStop = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#40494f'; g.fillRect(s * 0.48, 10, 6, s - 10);
      g.fillStyle = '#e6f0ff'; g.fillRect(s * 0.18, 10, s * 0.48, 18);
      g.fillStyle = '#2c456f'; g.fillRect(s * 0.2, 14, s * 0.44, 10);
    });

    game.spriteTextures.notice = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#715438'; g.fillRect(10, 10, s - 20, s - 18);
      g.fillStyle = '#ead7aa'; g.fillRect(14, 14, s - 28, s - 26);
      g.fillStyle = '#c76b60'; g.fillRect(18, 18, s - 36, 7);
      for (let i = 0; i < 6; i++) {
        g.fillStyle = i % 2 ? '#87a0c6' : '#d9bea0';
        g.fillRect(18 + (i % 2) * 20, 30 + i * 5, 18, 4);
      }
    });

    game.spriteTextures.bicycle = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.strokeStyle = '#26303d'; g.lineWidth = 3;
      g.beginPath(); g.arc(18, 48, 12, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(46, 48, 12, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      g.moveTo(18, 48); g.lineTo(28, 30); g.lineTo(42, 48); g.lineTo(28, 48); g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(28, 30); g.lineTo(36, 22); g.stroke();
    });

    game.spriteTextures.car = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#c8d0d6';
      g.beginPath();
      g.moveTo(10, 48); g.lineTo(18, 30); g.lineTo(44, 24); g.lineTo(58, 30); g.lineTo(62, 48); g.closePath(); g.fill();
      g.fillStyle = '#87a2b8'; g.fillRect(20, 28, 30, 12);
      g.fillStyle = '#272c36'; g.beginPath(); g.arc(20, 50, 8, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(52, 50, 8, 0, Math.PI * 2); g.fill();
    });

    game.spriteTextures.tree = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#493626'; g.fillRect(s * 0.48, s * 0.62, 8, s * 0.3);
      const colors = ['#263e27', '#325533', '#406943'];
      for (let i = 0; i < 24; i++) {
        g.fillStyle = colors[i % colors.length];
        const r = 10 + Math.random() * 12;
        const x = s * 0.5 + (Math.random() - 0.5) * 24;
        const y = s * 0.34 + (Math.random() - 0.5) * 18;
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      }
    });

    game.spriteTextures.shrine = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#b4473c';
      g.fillRect(16, 16, 6, s - 18); g.fillRect(s - 22, 16, 6, s - 18);
      g.fillRect(10, 16, s - 20, 6);
      g.fillRect(6, 22, s - 12, 4);
    });

    game.spriteTextures.curtain = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#0f1319'; g.fillRect(8, 10, s - 16, s - 10);
      g.fillStyle = '#232a36';
      for (let x = 12; x < s - 12; x += 8) g.fillRect(x, 10, 4, s - 10);
    });

    game.spriteTextures.crt = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#30383e'; g.fillRect(6, 14, s - 18, s - 12);
      g.fillStyle = '#091015'; g.fillRect(12, 20, s - 30, s - 28);
      g.fillStyle = '#ff9b40'; g.font = '700 8px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('THANK YOU', s / 2 - 5, 30); g.fillText('FOR COMING.', s / 2 - 5, 40);
    });

    game.spriteTextures.magazine = makeTexture((g, s) => {
      g.clearRect(0, 0, s, s);
      g.fillStyle = '#9f8f76'; g.fillRect(8, 8, s - 16, s - 8);
      for (let y = 14; y < s - 10; y += 12) {
        g.fillStyle = ['#d97d7b', '#d9b67f', '#9bc58c', '#7fb0d9'][Math.floor(y / 12) % 4];
        g.fillRect(12, y, s - 24, 8);
      }
    });

    buildSky();
  }

  function buildSky() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, c.height);
    grad.addColorStop(0, '#10255a');
    grad.addColorStop(0.55, '#173768');
    grad.addColorStop(0.62, '#2a4978');
    grad.addColorStop(0.72, '#e28b3f');
    grad.addColorStop(0.76, '#f6b365');
    grad.addColorStop(0.82, '#1d2f52');
    grad.addColorStop(1, '#07131f');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);

    for (let i = 0; i < 160; i++) {
      const x = Math.random() * c.width;
      const y = Math.random() * c.height * 0.56;
      const r = Math.random() * 1.4 + 0.2;
      g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.45})`;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }

    g.fillStyle = '#10203a';
    g.beginPath();
    g.moveTo(0, 360);
    for (let x = 0; x <= c.width; x += 48) {
      const y = 330 + Math.sin(x * 0.015) * 20 + Math.cos(x * 0.008) * 28 + Math.random() * 10;
      g.lineTo(x, y);
    }
    g.lineTo(c.width, c.height); g.lineTo(0, c.height); g.closePath(); g.fill();

    g.fillStyle = 'rgba(20,34,56,0.92)';
    for (let i = 0; i < 20; i++) {
      const x = i * 52 + Math.random() * 20;
      const w = 18 + Math.random() * 20;
      const h = 28 + Math.random() * 28;
      g.fillRect(x, 340 - h, w, h);
    }

    g.strokeStyle = 'rgba(52, 62, 72, 0.8)';
    g.lineWidth = 2;
    for (let i = 0; i < 5; i++) {
      const baseX = 100 + i * 190;
      g.beginPath(); g.moveTo(baseX, 250); g.lineTo(baseX, 360); g.stroke();
      for (let w = 0; w < 3; w++) {
        g.beginPath();
        g.moveTo(baseX, 260 + w * 12);
        g.bezierCurveTo(baseX + 90, 252 + w * 10, baseX + 160, 270 + w * 10, baseX + 260, 260 + w * 12);
        g.stroke();
      }
    }
    game.skyCanvas = c;
  }

  function initMap() {
    game.walls = Array.from({ length: game.mapH }, () => Array(game.mapW).fill(0));
    game.zone = Array.from({ length: game.mapH }, () => Array(game.mapW).fill('g'));
    const W = game.walls;
    const Z = game.zone;
    const setWallRect = (x1, y1, x2, y2, id) => {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) W[y][x] = id;
    };
    const setZoneRect = (x1, y1, x2, y2, code) => {
      for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) Z[y][x] = code;
    };

    for (let x = 0; x < game.mapW; x++) { W[0][x] = 9; W[game.mapH - 1][x] = 9; }
    for (let y = 0; y < game.mapH; y++) { W[y][0] = 9; W[y][game.mapW - 1] = 9; }

    // Main roads and narrow lanes
    setZoneRect(2, 22, 31, 29, 'a');
    setZoneRect(12, 10, 30, 21, 'a');
    setZoneRect(6, 18, 13, 29, 'a');
    setZoneRect(23, 8, 28, 29, 'a');
    setZoneRect(4, 24, 10, 31, 'a');
    setZoneRect(31, 16, 35, 22, 'a');
    setZoneRect(32, 9, 36, 15, 'a');

    // Parking and forecourt
    setZoneRect(15, 15, 28, 21, 'p');
    setZoneRect(17, 12, 26, 14, 'c');

    // Canal + bridge area
    setZoneRect(28, 22, 30, 31, 'w');
    setZoneRect(27, 25, 31, 26, 'b');
    setWallRect(27, 22, 27, 31, 8);
    setWallRect(31, 22, 31, 31, 8);
    W[25][27] = 0; W[26][27] = 0; W[25][31] = 0; W[26][31] = 0;

    // Convenience store building outer shell
    const sx1 = 17, sy1 = 8, sx2 = 27, sy2 = 14;
    for (let x = sx1; x <= sx2; x++) { W[sy1][x] = 1; W[sy2][x] = 1; }
    for (let y = sy1; y <= sy2; y++) { W[y][sx1] = 1; W[y][sx2] = 1; }
    W[sy2][21] = 0; W[sy2][22] = 0; W[sy2][23] = 0; // entrance opening
    setZoneRect(18, 9, 26, 13, 'i');
    setZoneRect(21, 14, 23, 14, 'c');

    // Store interior shelves and counter
    setWallRect(19, 9, 19, 12, 4); // fridge row
    setWallRect(21, 10, 21, 12, 3);
    setWallRect(23, 10, 23, 12, 3);
    setWallRect(25, 9, 26, 9, 5); // counter top near back-right
    setWallRect(25, 10, 25, 12, 5);
    W[24][9] = 4; W[24][10] = 4; W[24][11] = 4; W[24][12] = 4; // cooler island
    W[20][13] = 0; W[24][13] = 0;

    // Home and houses
    const makeHouse = (x1, y1, x2, y2, id = 2) => {
      for (let x = x1; x <= x2; x++) { W[y1][x] = id; W[y2][x] = id; }
      for (let y = y1; y <= y2; y++) { W[y][x1] = id; W[y][x2] = id; }
      setZoneRect(x1 + 1, y1 + 1, x2 - 1, y2 - 1, 'h');
    };
    makeHouse(4, 24, 8, 27, 2);
    makeHouse(10, 23, 13, 26, 6);
    makeHouse(8, 18, 12, 21, 2);
    makeHouse(32, 17, 35, 20, 2);
    makeHouse(33, 10, 36, 13, 6);
    makeHouse(2, 15, 5, 18, 2);

    // Closed dagashi shop
    for (let x = 31; x <= 35; x++) { W[23][x] = 7; W[27][x] = 7; }
    for (let y = 23; y <= 27; y++) { W[y][31] = 7; W[y][35] = 7; }
    setZoneRect(32, 24, 34, 26, 'c');

    // Shrine path boundaries
    setZoneRect(34, 7, 40, 12, 's');
    setWallRect(33, 7, 33, 12, 8);
    setWallRect(41, 7, 41, 12, 8);
    setWallRect(34, 6, 40, 6, 8);

    // Block fences and walls around homes
    setWallRect(3, 28, 9, 28, 8);
    setWallRect(14, 23, 14, 27, 8);
    setWallRect(31, 14, 36, 14, 8);
    setWallRect(6, 17, 6, 21, 8);

    // Small guard rails / bridge edges / little walls
    setWallRect(14, 15, 14, 18, 10);
    setWallRect(15, 14, 19, 14, 10);
    setWallRect(28, 15, 30, 15, 10);

    // Keep roads/lane open after adding barriers
    setZoneRect(6, 22, 14, 29, 'a');
    setZoneRect(15, 15, 28, 21, 'p');
    setZoneRect(23, 8, 28, 29, 'a');
    setZoneRect(31, 16, 35, 22, 'a');

    populateSprites();
    populateInteractables();
  }

  function addSprite(type, x, y, scale = 1, height = 1.1) {
    game.sprites.push({ type, x, y, scale, height });
  }

  function populateSprites() {
    game.sprites = [];
    // Store exterior and lot
    addSprite('sign', 22.0, 8.25, 2.4, 0.75);
    addSprite('lightPole', 16.1, 18.0, 1.7, 2.5);
    addSprite('lightPole', 28.9, 17.2, 1.7, 2.4);
    addSprite('powerPole', 14.5, 21.7, 2.0, 3.6);
    addSprite('powerPole', 29.4, 21.2, 2.0, 3.8);
    addSprite('powerPole', 8.0, 18.2, 2.0, 3.8);
    addSprite('vending', 16.2, 13.5, 1.2, 1.4);
    addSprite('car', 18.8, 18.2, 1.5, 1.0);
    addSprite('car', 25.6, 18.0, 1.5, 1.0);
    addSprite('bicycle', 15.4, 20.3, 1.1, 0.8);
    addSprite('notice', 12.7, 16.2, 1.2, 1.6);
    addSprite('phone', 30.8, 18.5, 1.1, 1.8);
    addSprite('busStop', 31.6, 16.8, 1.2, 1.8);
    addSprite('vending', 34.5, 21.8, 1.15, 1.4);
    addSprite('tree', 37.2, 14.0, 1.8, 2.6);
    addSprite('tree', 39.5, 9.8, 1.9, 2.6);
    addSprite('tree', 4.0, 13.5, 2.2, 3.0);
    addSprite('tree', 11.0, 31.0, 2.2, 3.0);
    addSprite('shrine', 37.4, 8.8, 1.2, 1.8);
    addSprite('curtain', 22.0, 8.7, 1.5, 1.1);
    // Store interior detail
    addSprite('crt', 25.8, 9.2, 0.8, 0.8);
    addSprite('magazine', 26.55, 13.2, 0.9, 1.2);
    addSprite('notice', 17.8, 14.3, 0.9, 0.8);
    addSprite('vending', 18.6, 9.0, 0.65, 1.1);
  }

  function addInteractable(x, y, label, text, radius = 1.25) {
    game.interactables.push({ x, y, label, text, radius });
  }

  function populateInteractables() {
    game.interactables = [];
    addInteractable(22.0, 18.2, '駐車場', '店の明かりが安心感になる配置。ここはあえて広すぎず、停め方にもムラを出しています。');
    addInteractable(16.2, 13.6, '自販機', '夜だけ白く浮く自販機。店の光とは違う青白さで、歩いた時の目印になります。');
    addInteractable(30.9, 18.4, '公衆電話', '田舎の夜に残っているだけで空気が出るスポット。今はまだ演出なし、雰囲気確認用です。');
    addInteractable(31.5, 16.8, 'バス停', '人の生活圏がちゃんとある感じを出すためのバス停。ストーリーがなくても町に見えます。');
    addInteractable(12.7, 16.2, '掲示板', '自治会の張り紙や祭りの告知が並ぶ想定。生活感はこういう小物で出すのが強いです。');
    addInteractable(29.0, 25.5, '小橋', '側溝をまたぐだけの小橋。こういう細い導線が歩きたくなる田舎町を作ります。');
    addInteractable(37.3, 8.8, '祠の階段', '奥に行きたくなる見せスポット。今はルート確認用だけど、先の余白としてかなり効きます。');
    addInteractable(34.2, 24.7, '閉店店舗', '閉まった駄菓子屋風の面。今後、看板や汚れを足すと一気に生っぽくなります。');
    addInteractable(25.65, 9.15, 'レジ横CRT', 'ブラウン管とオレンジ文字で、古い店の温度感を作っています。');
    addInteractable(22.05, 10.8, '棚', '箱の積み木感を減らすため、棚は高さと色数、通路の抜け感を意識して再構成しています。');
    addInteractable(19.0, 10.0, '冷蔵ケース', '冷蔵ケースは白い蛍光灯と青みを出して、店内の安心感を支える役にしています。');
  }

  const wallDefs = {
    1: { name: 'shop', out: 'shopExterior', in: 'shopWallpaper' },
    2: { name: 'houseA', out: 'houseWallA', in: 'houseWallA' },
    3: { name: 'shelf', out: 'shelf', in: 'shelf' },
    4: { name: 'fridge', out: 'fridge', in: 'fridge' },
    5: { name: 'counter', out: 'counter', in: 'counter' },
    6: { name: 'houseB', out: 'houseWallB', in: 'houseWallB' },
    7: { name: 'shutter', out: 'shutter', in: 'shutter' },
    8: { name: 'block', out: 'blockWall', in: 'blockWall' },
    9: { name: 'fence', out: 'fence', in: 'fence' },
    10: { name: 'rail', out: 'fence', in: 'fence' },
  };

  function getFloorTexture(zoneCode) {
    switch (zoneCode) {
      case 'a': return game.textures.asphalt;
      case 'p': return game.textures.asphalt;
      case 'c': return game.textures.concrete;
      case 'i': return game.textures.tile;
      case 'w': return game.textures.water;
      case 'b': return game.textures.concrete;
      case 's': return game.textures.stone;
      case 'h': return game.textures.concrete;
      default: return game.textures.grass;
    }
  }

  function getCeilingTexture(zoneCode) {
    return zoneCode === 'i' ? game.textures.ceiling : null;
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function isWalkable(x, y) {
    const gx = Math.floor(x), gy = Math.floor(y);
    if (gx < 0 || gy < 0 || gx >= game.mapW || gy >= game.mapH) return false;
    return game.walls[gy][gx] === 0 && game.zone[gy][gx] !== 'w';
  }

  function movePlayer(dx, dy) {
    const p = game.player;
    const radius = 0.18;
    if (isWalkable(p.x + dx, p.y)) p.x += dx;
    else if (isWalkable(p.x + Math.sign(dx) * radius, p.y)) p.x += Math.sign(dx) * Math.min(Math.abs(dx), radius);
    if (isWalkable(p.x, p.y + dy)) p.y += dy;
    else if (isWalkable(p.x, p.y + Math.sign(dy) * radius)) p.y += Math.sign(dy) * Math.min(Math.abs(dy), radius);
  }

  function updateDirPlane() {
    const p = game.player;
    p.dirX = Math.cos(p.angle);
    p.dirY = Math.sin(p.angle);
    p.planeX = -p.dirY * 0.78;
    p.planeY = p.dirX * 0.78;
  }

  function currentZone() {
    return game.zone[Math.floor(game.player.y)][Math.floor(game.player.x)];
  }

  function update(dt) {
    game.time += dt;
    const p = game.player;
    const moveSpeed = (state.running ? 4.55 : 2.65) * dt;
    const sideX = -Math.sin(p.angle);
    const sideY = Math.cos(p.angle);
    const forward = -state.input.moveY;
    const strafe = state.input.moveX;
    const dx = (Math.cos(p.angle) * forward + sideX * strafe) * moveSpeed;
    const dy = (Math.sin(p.angle) * forward + sideY * strafe) * moveSpeed;
    movePlayer(dx, dy);

    if (Math.abs(forward) + Math.abs(strafe) > 0.05) p.bob += dt * (state.running ? 14 : 8);

    const near = findNearestInteractable();
    if (near && performance.now() > state.showHintUntil) {
      hintBox.textContent = `調べる: ${near.label}`;
    } else if (performance.now() > state.showHintUntil) {
      hintBox.textContent = '左下スティックで移動、右半分ドラッグで視点移動。細い路地やスポットの密度を見てください。';
    }
  }

  function interact() {
    const near = findNearestInteractable(true);
    if (near) setHint(near.text, 4200);
    else setHint('気になる場所の近くで、正面を向いてから「調べる」を押してください。', 2200);
  }

  function findNearestInteractable(requireFacing = false) {
    const p = game.player;
    let best = null;
    let bestDist = Infinity;
    for (const item of game.interactables) {
      const dx = item.x - p.x;
      const dy = item.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist > item.radius || dist > bestDist) continue;
      if (requireFacing) {
        const ndx = dx / Math.max(0.0001, dist);
        const ndy = dy / Math.max(0.0001, dist);
        const facing = ndx * Math.cos(p.angle) + ndy * Math.sin(p.angle);
        if (facing < 0.55) continue;
      }
      best = item;
      bestDist = dist;
    }
    return best;
  }

  function render() {
    const low = game.lowCtx;
    const W = game.renderW;
    const H = game.renderH;
    game.lowCanvas.width = W;
    game.lowCanvas.height = H;
    const img = low.createImageData(W, H);
    const pix = img.data;
    const p = game.player;
    const zoneCode = currentZone();
    const bobOffset = Math.sin(p.bob) * (state.running ? 3.4 : 2.0);
    const horizonY = Math.floor(H * 0.52 + bobOffset + p.pitch * 20);

    // Draw sky backdrop first
    low.drawImage(game.skyCanvas, ((p.angle / (Math.PI * 2)) * game.skyCanvas.width * 0.5) % game.skyCanvas.width, 0, game.skyCanvas.width, game.skyCanvas.height, -game.skyCanvas.width * 0.2, 0, W * 1.4, H * 0.68);
    const back = low.getImageData(0, 0, W, H).data;
    pix.set(back);

    // Floor / ceiling casting
    for (let y = Math.max(0, horizonY); y < H; y++) {
      const pz = 0.5 * H;
      const rowDistance = pz / Math.max(1, y - H / 2 - p.pitch * 20);
      const rayDirX0 = p.dirX - p.planeX;
      const rayDirY0 = p.dirY - p.planeY;
      const rayDirX1 = p.dirX + p.planeX;
      const rayDirY1 = p.dirY + p.planeY;
      const stepX = rowDistance * (rayDirX1 - rayDirX0) / W;
      const stepY = rowDistance * (rayDirY1 - rayDirY0) / W;
      let floorX = p.x + rowDistance * rayDirX0;
      let floorY = p.y + rowDistance * rayDirY0;
      for (let x = 0; x < W; x++) {
        const cellX = Math.floor(floorX);
        const cellY = Math.floor(floorY);
        if (cellX >= 0 && cellY >= 0 && cellX < game.mapW && cellY < game.mapH) {
          const zone = game.zone[cellY][cellX];
          const ft = getFloorTexture(zone);
          const tx = Math.floor(ft.size * (floorX - cellX)) & (ft.size - 1);
          const ty = Math.floor(ft.size * (floorY - cellY)) & (ft.size - 1);
          const tidx = (ty * ft.size + tx) * 4;
          const idx = (y * W + x) * 4;
          const shade = clamp(1.2 - rowDistance * 0.08, 0.18, 1.0);
          pix[idx] = ft.data[tidx] * shade;
          pix[idx + 1] = ft.data[tidx + 1] * shade;
          pix[idx + 2] = ft.data[tidx + 2] * shade;
          pix[idx + 3] = 255;

          const ct = getCeilingTexture(zone);
          if (ct) {
            const cy = H - y - 1;
            const cidx = (cy * W + x) * 4;
            const cshade = clamp(1.04 - rowDistance * 0.09, 0.28, 1);
            pix[cidx] = ct.data[tidx] * cshade;
            pix[cidx + 1] = ct.data[tidx + 1] * cshade;
            pix[cidx + 2] = ct.data[tidx + 2] * cshade;
            pix[cidx + 3] = 255;
          }
        }
        floorX += stepX;
        floorY += stepY;
      }
    }

    // Wall casting
    game.zBuffer = new Array(W).fill(Infinity);
    for (let x = 0; x < W; x++) {
      const cameraX = 2 * x / W - 1;
      const rayDirX = p.dirX + p.planeX * cameraX;
      const rayDirY = p.dirY + p.planeY * cameraX;
      let mapX = Math.floor(p.x);
      let mapY = Math.floor(p.y);
      const deltaDistX = Math.abs(1 / (rayDirX || 0.00001));
      const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));
      let stepX, stepY, sideDistX, sideDistY;
      if (rayDirX < 0) { stepX = -1; sideDistX = (p.x - mapX) * deltaDistX; }
      else { stepX = 1; sideDistX = (mapX + 1 - p.x) * deltaDistX; }
      if (rayDirY < 0) { stepY = -1; sideDistY = (p.y - mapY) * deltaDistY; }
      else { stepY = 1; sideDistY = (mapY + 1 - p.y) * deltaDistY; }

      let hit = 0;
      let side = 0;
      let prevX = mapX;
      let prevY = mapY;
      while (!hit) {
        prevX = mapX; prevY = mapY;
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        hit = game.walls[mapY]?.[mapX] || 0;
        if (mapX < 0 || mapY < 0 || mapX >= game.mapW || mapY >= game.mapH) break;
      }
      if (!hit) continue;

      const perpWallDist = side === 0 ? (mapX - p.x + (1 - stepX) / 2) / (rayDirX || 0.00001) : (mapY - p.y + (1 - stepY) / 2) / (rayDirY || 0.00001);
      const lineHeight = Math.abs(Math.floor(H / Math.max(0.001, perpWallDist)));
      let drawStart = -lineHeight / 2 + H / 2 + bobOffset + p.pitch * 20;
      let drawEnd = lineHeight / 2 + H / 2 + bobOffset + p.pitch * 20;
      drawStart = Math.max(0, Math.floor(drawStart));
      drawEnd = Math.min(H - 1, Math.floor(drawEnd));

      const wallDef = wallDefs[hit] || wallDefs[8];
      const fromZone = game.zone[prevY][prevX];
      const useInterior = fromZone === 'i';
      const tex = game.textures[useInterior ? wallDef.in : wallDef.out];
      let wallX;
      if (side === 0) wallX = p.y + perpWallDist * rayDirY;
      else wallX = p.x + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);
      let texX = Math.floor(wallX * tex.size);
      if (side === 0 && rayDirX > 0) texX = tex.size - texX - 1;
      if (side === 1 && rayDirY < 0) texX = tex.size - texX - 1;
      const shade = clamp((side ? 0.78 : 0.95) * (1.15 - perpWallDist * 0.06), 0.15, 1.0);
      for (let y = drawStart; y <= drawEnd; y++) {
        const d = y * 256 - H * 128 + lineHeight * 128;
        const texY = ((d * tex.size) / lineHeight / 256) & (tex.size - 1);
        const tidx = (texY * tex.size + texX) * 4;
        const idx = (y * W + x) * 4;
        pix[idx] = tex.data[tidx] * shade;
        pix[idx + 1] = tex.data[tidx + 1] * shade;
        pix[idx + 2] = tex.data[tidx + 2] * shade;
        pix[idx + 3] = 255;
      }
      game.zBuffer[x] = perpWallDist;
    }

    low.putImageData(img, 0, 0);
    renderSprites();
    drawOverpaint();
    drawToScreen();
  }

  function renderSprites() {
    const low = game.lowCtx;
    const W = game.renderW;
    const H = game.renderH;
    const p = game.player;
    const list = game.sprites.map(s => ({ ...s, dist: (p.x - s.x) ** 2 + (p.y - s.y) ** 2 })).sort((a, b) => b.dist - a.dist);
    for (const s of list) {
      const tex = game.spriteTextures[s.type];
      if (!tex) continue;
      const spriteX = s.x - p.x;
      const spriteY = s.y - p.y;
      const invDet = 1.0 / (p.planeX * p.dirY - p.dirX * p.planeY || 0.00001);
      const transformX = invDet * (p.dirY * spriteX - p.dirX * spriteY);
      const transformY = invDet * (-p.planeY * spriteX + p.planeX * spriteY);
      if (transformY <= 0.1) continue;

      const spriteScreenX = Math.floor((W / 2) * (1 + transformX / transformY));
      const spriteHeight = Math.abs(Math.floor(H / transformY * s.height));
      const drawStartY = Math.floor(-spriteHeight / 2 + H / 2 + Math.sin(p.bob) * 2 + p.pitch * 20);
      const drawEndY = drawStartY + spriteHeight;
      const spriteWidth = Math.abs(Math.floor(H / transformY * s.scale));
      const drawStartX = Math.floor(-spriteWidth / 2 + spriteScreenX);
      const drawEndX = drawStartX + spriteWidth;
      for (let stripe = drawStartX; stripe < drawEndX; stripe++) {
        if (stripe < 0 || stripe >= W || transformY >= game.zBuffer[stripe]) continue;
        const texX = Math.floor((stripe - drawStartX) * tex.size / spriteWidth);
        low.save();
        low.beginPath();
        low.rect(stripe, drawStartY, 1, spriteHeight);
        low.clip();
        low.globalAlpha = clamp(1.2 - Math.sqrt(s.dist) * 0.07, 0.2, 1);
        low.drawImage(tex.canvas, texX, 0, 1, tex.size, stripe, drawStartY, 1, spriteHeight);
        low.restore();
      }
    }
  }

  function drawOverpaint() {
    const g = game.lowCtx;
    const W = game.renderW;
    const H = game.renderH;
    const zone = currentZone();

    // window glow on store entrance
    if (zone !== 'i') {
      const grad = g.createRadialGradient(W * 0.5, H * 0.56, 10, W * 0.5, H * 0.56, W * 0.4);
      grad.addColorStop(0, 'rgba(255,255,255,0.03)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
    }

    // vignetting
    const vg = g.createRadialGradient(W * 0.5, H * 0.55, H * 0.22, W * 0.5, H * 0.55, H * 0.9);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.33)');
    g.fillStyle = vg;
    g.fillRect(0, 0, W, H);

    if (zone === 'i') {
      g.fillStyle = 'rgba(255, 244, 214, 0.04)';
      g.fillRect(0, 0, W, H);
    }
  }

  function drawToScreen() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = window.innerWidth;
    const cssH = window.innerHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(game.lowCanvas, 0, 0, canvas.width, canvas.height);

    // soft bloom highlights for fluorescent lighting
    const g = ctx;
    g.save();
    g.globalCompositeOperation = 'screen';
    const grad = g.createRadialGradient(canvas.width * 0.5, canvas.height * 0.2, 0, canvas.width * 0.5, canvas.height * 0.2, canvas.width * 0.6);
    grad.addColorStop(0, 'rgba(120,175,255,0.03)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad; g.fillRect(0, 0, canvas.width, canvas.height);
    g.restore();

    // crosshair
    const cx = canvas.width * 0.5;
    const cy = canvas.height * 0.5;
    g.strokeStyle = 'rgba(255,255,255,0.82)';
    g.lineWidth = 1 * dpr;
    const gap = 6 * dpr;
    const len = 10 * dpr;
    g.beginPath();
    g.moveTo(cx - len, cy); g.lineTo(cx - gap, cy);
    g.moveTo(cx + gap, cy); g.lineTo(cx + len, cy);
    g.moveTo(cx, cy - len); g.lineTo(cx, cy - gap);
    g.moveTo(cx, cy + gap); g.lineTo(cx, cy + len);
    g.stroke();
  }

  function resizeRenderTarget() {
    const h = window.innerHeight;
    const targetH = h > 900 ? 460 : h > 700 ? 404 : 360;
    game.renderH = targetH;
    game.renderW = Math.floor(targetH * (window.innerWidth / window.innerHeight));
    if (game.renderW < 196) game.renderW = 196;
    if (game.renderW > 320) game.renderW = 320;
  }

  function initInput() {
    const joystick = {
      active: false,
      id: null,
      cx: 0,
      cy: 0,
      radius: 0,
    };

    function updateStick(nx, ny) {
      state.input.moveX = clamp(nx, -1, 1);
      state.input.moveY = clamp(ny, -1, 1);
      joystickStick.style.transform = `translate(${state.input.moveX * joystick.radius * 0.45}px, ${state.input.moveY * joystick.radius * 0.45}px)`;
    }

    function endJoystick() {
      joystick.active = false; joystick.id = null;
      state.input.moveX = 0; state.input.moveY = 0;
      joystickStick.style.transform = 'translate(0px, 0px)';
    }

    joystickBase.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      joystick.active = true; joystick.id = e.pointerId;
      joystick.cx = joystickBase.getBoundingClientRect().left + joystickBase.clientWidth / 2;
      joystick.cy = joystickBase.getBoundingClientRect().top + joystickBase.clientHeight / 2;
      joystick.radius = joystickBase.clientWidth / 2;
      joystickBase.setPointerCapture(e.pointerId);
      const dx = e.clientX - joystick.cx;
      const dy = e.clientY - joystick.cy;
      const len = Math.hypot(dx, dy) || 1;
      const max = joystick.radius * 0.7;
      updateStick(dx / len * Math.min(max, len) / max, dy / len * Math.min(max, len) / max);
      startAudioIfNeeded();
    });

    joystickBase.addEventListener('pointermove', (e) => {
      if (!joystick.active || joystick.id !== e.pointerId) return;
      const dx = e.clientX - joystick.cx;
      const dy = e.clientY - joystick.cy;
      const len = Math.hypot(dx, dy) || 1;
      const max = joystick.radius * 0.7;
      updateStick(dx / len * Math.min(max, len) / max, dy / len * Math.min(max, len) / max);
    });

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(evt => {
      joystickBase.addEventListener(evt, (e) => {
        if (!joystick.active) return;
        if (e.pointerId === undefined || joystick.id === e.pointerId) endJoystick();
      });
    });

    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || e.target === joystickBase || joystickBase.contains(e.target)) return;
      if (e.clientX > window.innerWidth * 0.46) {
        state.lookDragId = e.pointerId;
        state.input.touchStarted = true;
        startAudioIfNeeded();
      }
    }, { passive: false });

    window.addEventListener('pointermove', (e) => {
      if (state.lookDragId !== e.pointerId) return;
      game.player.angle += e.movementX ? e.movementX * 0.008 : (e.clientX - (state.lastLookX ?? e.clientX)) * 0.008;
      state.lastLookX = e.clientX;
      updateDirPlane();
    }, { passive: false });

    window.addEventListener('pointerup', (e) => {
      if (state.lookDragId === e.pointerId) {
        state.lookDragId = null;
        state.lastLookX = null;
      }
    });

    runBtn.addEventListener('click', () => {
      state.running = !state.running;
      runBtn.textContent = `走る: ${state.running ? 'ON' : 'OFF'}`;
      runBtn.className = `pill ${state.running ? 'run-on' : 'run-off'}`;
      setHint(state.running ? '走るをONにしました。長押し不要です。' : '走るをOFFにしました。歩き中心の速度に戻しています。', 1800);
      startAudioIfNeeded();
    });

    interactBtn.addEventListener('click', () => { startAudioIfNeeded(); interact(); });
    scanBtn.addEventListener('click', () => {
      state.scanline = !state.scanline;
      crtOverlay.classList.toggle('scan-on', state.scanline);
      scanBtn.textContent = `SCANLINE: ${state.scanline ? 'ON' : 'OFF'}`;
    });
  }

  function startAudioIfNeeded() {
    if (state.audioStarted) return;
    state.audioStarted = true;
    // Light ambience without assets. Safe to ignore if browser blocks it.
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ac = new AC();
      const master = ac.createGain();
      master.gain.value = 0.018;
      master.connect(ac.destination);

      // powerline hum
      const hum = ac.createOscillator(); hum.type = 'sine'; hum.frequency.value = 62;
      const humGain = ac.createGain(); humGain.gain.value = 0.08;
      hum.connect(humGain).connect(master); hum.start();

      // insect-ish filtered noise
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.4;
      const noise = ac.createBufferSource(); noise.buffer = buf; noise.loop = true;
      const bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4200; bp.Q.value = 1.4;
      const ng = ac.createGain(); ng.gain.value = 0.025;
      noise.connect(bp).connect(ng).connect(master); noise.start();

      // distant dog bark every so often
      let timer = 0;
      function bark() {
        const now = ac.currentTime;
        const osc = ac.createOscillator(); osc.type = 'triangle'; osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.08);
        const g = ac.createGain(); g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(0.025, now + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        osc.connect(g).connect(master); osc.start(now); osc.stop(now + 0.2);
      }
      setInterval(() => { if (Math.random() < 0.18) bark(); }, 9000);
    } catch (err) {
      console.warn(err);
    }
  }

  function loop(t) {
    const dt = Math.min(0.033, (t - state.lastTime) / 1000);
    state.lastTime = t;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resizeRenderTarget);

  createTextures();
  initMap();
  resizeRenderTarget();
  updateDirPlane();
  initInput();
  requestAnimationFrame(loop);
})();
