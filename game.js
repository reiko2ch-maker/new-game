(() => {
  'use strict'

  const TWO_PI = Math.PI * 2
  const FOV = Math.PI / 3.5
  const BASE_SENSITIVITY = 0.00235
  const STORAGE_KEY = 'rural-night-store-v10-settings'
  const CAMERA_HEIGHT = 0.5
  const TARGET_FPS = 30
  const MAX_DT = 0.05

  const qualityProfiles = {
    low: 0.50,
    mid: 0.62,
    high: 0.76,
  }
  const sensitivityProfiles = [0.85, 1, 1.18]

  const app = document.getElementById('app')
  const canvas = document.getElementById('game')
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true })
  const menuBtn = document.getElementById('menuBtn')
  const menuPanel = document.getElementById('menuPanel')
  const scanlineOverlay = document.getElementById('scanlineOverlay')
  const scanlineToggle = document.getElementById('scanlineToggle')
  const qualityToggle = document.getElementById('qualityToggle')
  const sensitivityToggle = document.getElementById('sensitivityToggle')
  const runToggle = document.getElementById('runToggle')
  const interactBtn = document.getElementById('interactBtn')
  const promptEl = document.getElementById('prompt')
  const messageEl = document.getElementById('message')
  const hintEl = document.getElementById('hint')
  const heldItemEl = document.getElementById('heldItem')
  const pickupPanel = document.getElementById('pickupPanel')
  const leftZone = document.getElementById('leftZone')
  const rightZone = document.getElementById('rightZone')
  const joystickBase = document.getElementById('joystickBase')
  const joystickStick = document.getElementById('joystickStick')

  const settings = loadSettings()

  const state = {
    width: 0,
    height: 0,
    renderW: 0,
    renderH: 0,
    imageData: null,
    pixels: null,
    depthBuffer: [],
    currentTarget: null,
    selectionOpen: false,
    run: false,
    scanline: settings.scanline,
    quality: settings.quality,
    sensitivity: settings.sensitivity,
    inventory: { drink: null },
    hudTimer: 0,
    lastTick: 0,
    fpsStep: 1000 / TARGET_FPS,
  }

  const input = {
    joyX: 0,
    joyY: 0,
    stickActive: false,
    stickId: null,
    stickCenterX: 0,
    stickCenterY: 0,
    lookActive: false,
    lookId: null,
    lastLookX: 0,
    lastLookY: 0,
  }

  const textures = createTextures()
  const world = createWorld()

  const player = {
    x: 12.5,
    y: 20.4,
    dir: -Math.PI / 2 + 0.01,
    pitch: -8,
  }

  let offscreen = document.createElement('canvas')
  let offCtx = offscreen.getContext('2d', { alpha: false })

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')
      return {
        scanline: saved.scanline !== false,
        quality: saved.quality || 'mid',
        sensitivity: sensitivityProfiles.includes(saved.sensitivity) ? saved.sensitivity : 1,
      }
    } catch {
      return { scanline: true, quality: 'mid', sensitivity: 1 }
    }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      scanline: state.scanline,
      quality: state.quality,
      sensitivity: state.sensitivity,
    }))
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)) }
  function smoothstep(a, b, x) {
    const t = clamp((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
  }
  function rgba(r, g, b, a = 255) { return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255) }
  function shadeColor(color, shade) {
    const r = color & 255
    const g = (color >> 8) & 255
    const b = (color >> 16) & 255
    const a = (color >>> 24) & 255
    return rgba((r * shade) | 0, (g * shade) | 0, (b * shade) | 0, a)
  }
  function blendPixel(dst, src) {
    const a = (src >>> 24) & 255
    if (a <= 0) return dst
    if (a >= 252) return src
    const ia = 255 - a
    const dr = dst & 255
    const dg = (dst >> 8) & 255
    const db = (dst >> 16) & 255
    const sr = src & 255
    const sg = (src >> 8) & 255
    const sb = (src >> 16) & 255
    return rgba(((sr * a + dr * ia) / 255) | 0, ((sg * a + dg * ia) / 255) | 0, ((sb * a + db * ia) / 255) | 0, 255)
  }

  function textureToCanvas(tex) {
    const c = document.createElement('canvas')
    c.width = tex.w
    c.height = tex.h
    const g = c.getContext('2d')
    g.putImageData(new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h), 0, 0)
    return c
  }

  function createCanvasTexture(w, h, draw) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    draw(g, w, h)
    const image = g.getImageData(0, 0, w, h)
    return { w, h, pixels: new Uint32Array(image.data.buffer.slice(0)) }
  }

  function noise(g, w, h, amount, alpha, tint = [255, 255, 255]) {
    const image = g.getImageData(0, 0, w, h)
    const data = image.data
    for (let i = 0; i < data.length; i += 4) {
      const n = (Math.random() - 0.5) * amount
      data[i] = clamp(data[i] + n * (tint[0] / 255), 0, 255)
      data[i + 1] = clamp(data[i + 1] + n * (tint[1] / 255), 0, 255)
      data[i + 2] = clamp(data[i + 2] + n * (tint[2] / 255), 0, 255)
      data[i + 3] = Math.max(data[i + 3], alpha)
    }
    g.putImageData(image, 0, 0)
  }

  function createTextures() {
    const t = {}

    t.sky = createCanvasTexture(1024, 256, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#031120')
      grad.addColorStop(0.48, '#0b1f3f')
      grad.addColorStop(0.78, '#11284f')
      grad.addColorStop(1, '#1a2d46')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)

      g.globalAlpha = 0.10
      g.fillStyle = '#dbe8ff'
      for (let i = 0; i < 6; i++) {
        g.beginPath()
        g.ellipse(Math.random() * w, 40 + Math.random() * 80, 80 + Math.random() * 90, 12 + Math.random() * 18, 0, 0, TWO_PI)
        g.fill()
      }
      g.globalAlpha = 1

      for (let i = 0; i < 34; i++) {
        const x = Math.random() * w
        const y = Math.random() * (h * 0.48)
        const r = Math.random() * 1.1 + 0.25
        const a = Math.random() * 0.22 + 0.05
        g.fillStyle = `rgba(255,255,255,${a})`
        g.beginPath()
        g.arc(x, y, r, 0, TWO_PI)
        g.fill()
      }

      const layers = [
        { c: '#081326', y: 188, amp: 12, s: 0.7 },
        { c: '#0d1a31', y: 198, amp: 16, s: 1.4 },
        { c: '#122140', y: 208, amp: 20, s: 2.1 },
      ]
      for (const layer of layers) {
        g.fillStyle = layer.c
        g.beginPath()
        g.moveTo(0, h)
        g.lineTo(0, layer.y)
        for (let x = 0; x <= w; x += 8) {
          const y = layer.y + Math.sin(x * 0.008 + layer.s) * layer.amp + Math.sin(x * 0.024 + layer.s * 1.8) * (layer.amp * 0.34)
          g.lineTo(x, y)
        }
        g.lineTo(w, h)
        g.closePath()
        g.fill()
      }
    })

    t.wallStoreFront = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#eceae5'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#d8d4cd'
      for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1)
      g.fillStyle = '#c7c3bc'
      for (let x = 0; x < w; x += 18) g.fillRect(x, 0, 1, h)
      g.fillStyle = '#245b52'
      g.fillRect(0, 10, w, 4)
      g.fillStyle = '#d84d4a'
      g.fillRect(0, 16, w, 3)
      noise(g, w, h, 12, 255, [228, 225, 220])
    })

    t.wallStoreSide = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#f2f0eb'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#ddd9d1'
      for (let y = 0; y < h; y += 10) g.fillRect(0, y, w, 1)
      g.fillStyle = '#cfcabf'
      for (let x = 8; x < w; x += 16) g.fillRect(x, 0, 1, h)
      noise(g, w, h, 10, 255, [235, 232, 228])
    })

    t.wallBack = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#cfc7bb'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#bdb29f'
      for (let x = 0; x < w; x += 10) g.fillRect(x, 0, 1, h)
      g.fillStyle = 'rgba(86,76,64,0.18)'
      for (let y = 0; y < h; y += 12) g.fillRect(0, y, w, 1)
      noise(g, w, h, 12, 255, [210, 200, 186])
    })

    t.wallClosedShop = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#8b7f72'
      g.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 6) {
        g.fillStyle = x % 12 === 0 ? '#978a7d' : '#7b7268'
        g.fillRect(x, 0, 4, h)
      }
      g.fillStyle = 'rgba(0,0,0,0.12)'
      for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1)
    })

    t.wallUtility = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#3c4657'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#2e3645'
      for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1)
      noise(g, w, h, 10, 255, [85, 95, 120])
    })

    t.floorRoad = createCanvasTexture(64, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#303945')
      grad.addColorStop(1, '#1a212a')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 24, 255, [155, 168, 182])
      g.strokeStyle = 'rgba(255,255,255,0.06)'
      for (let i = 0; i < 6; i++) {
        g.beginPath(); g.moveTo(Math.random()*w, Math.random()*h); g.lineTo(Math.random()*w, Math.random()*h); g.stroke()
      }
      g.fillStyle = 'rgba(170, 190, 215, 0.05)'
      g.fillRect(0, 14, w, 6)
      g.fillRect(0, 44, w, 5)
    })

    t.floorParkingLeft = createCanvasTexture(64, 64, (g, w, h) => {
      g.drawImage(textureToCanvas(t.floorRoad), 0, 0)
      g.fillStyle = '#f4f5f7'
      g.fillRect(7, 0, 3, h)
    })

    t.floorParkingRight = createCanvasTexture(64, 64, (g, w, h) => {
      g.drawImage(textureToCanvas(t.floorRoad), 0, 0)
      g.fillStyle = '#f4f5f7'
      g.fillRect(w - 10, 0, 3, h)
    })

    t.floorSidewalk = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#92979e'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#b2b8bf'
      g.fillRect(0, 0, w, 6)
      g.fillStyle = '#7c8289'
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h)
      for (let y = 0; y < h; y += 16) g.fillRect(0, y, w, 1)
      noise(g, w, h, 12, 255, [175, 180, 185])
    })

    t.floorPorch = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#a7aeb7'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#8f97a0'
      for (let x = 0; x < w; x += 12) g.fillRect(x, 0, 2, h)
      g.fillStyle = 'rgba(255,255,255,0.08)'
      g.fillRect(0, 6, w, 2)
      noise(g, w, h, 12, 255, [170, 176, 182])
    })

    t.floorTile = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#f5f5f2'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#d8d8d2'
      for (let x = 0; x <= w; x += 16) g.fillRect(x, 0, 1, h)
      for (let y = 0; y <= h; y += 16) g.fillRect(0, y, w, 1)
      g.fillStyle = 'rgba(180,190,210,0.05)'
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 8, 255, [240, 240, 236])
    })

    t.floorGrass = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#223525'
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 22, 255, [75, 110, 72])
      g.fillStyle = 'rgba(90,132,74,0.46)'
      for (let i = 0; i < 80; i++) g.fillRect(Math.random() * w, Math.random() * h, 1, 3 + Math.random() * 4)
    })

    t.ceilStore = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#dde1e4'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#c6ccd0'
      for (let x = 0; x <= w; x += 16) g.fillRect(x, 0, 1, h)
      for (let y = 0; y <= h; y += 16) g.fillRect(0, y, w, 1)
      g.fillStyle = '#fafcff'
      g.fillRect(4, 6, 24, 6)
      g.fillRect(36, 6, 24, 6)
      g.fillStyle = 'rgba(255,255,255,0.15)'
      g.fillRect(4, 12, 24, 2)
      g.fillRect(36, 12, 24, 2)
    })

    t.ceilPorch = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#d7dbe0'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#bdc3cb'
      for (let x = 0; x < w; x += 12) g.fillRect(x, 0, 2, h)
    })

    t.spriteSign = createCanvasTexture(320, 92, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#f6f6f3'
      g.fillRect(0, 28, w, 58)
      g.fillStyle = '#2aa572'
      g.fillRect(0, 30, w, 16)
      g.fillStyle = '#d54d4a'
      g.fillRect(0, 68, w, 8)
      g.fillStyle = '#f0c24f'
      g.fillRect(0, 12, w, 10)
      g.fillStyle = '#ffffff'
      g.font = 'bold 38px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('こもれびマート', w / 2, 39)
    })

    t.spriteGlass = createCanvasTexture(160, 168, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(170, 200, 235, 0.08)'
      g.fillRect(12, 8, w - 24, h - 14)
      g.strokeStyle = 'rgba(22, 26, 34, 0.85)'
      g.lineWidth = 10
      g.strokeRect(12, 8, w - 24, h - 14)
      g.strokeStyle = 'rgba(255,255,255,0.24)'
      g.lineWidth = 2
      g.beginPath(); g.moveTo(18, 20); g.lineTo(w - 44, 20); g.stroke()
      g.fillStyle = 'rgba(255,255,255,0.14)'
      g.beginPath(); g.moveTo(28, 14); g.lineTo(96, 14); g.lineTo(54, h - 22); g.lineTo(12, h - 22); g.closePath(); g.fill()
      g.fillStyle = 'rgba(255,255,255,0.06)'
      g.fillRect(20, 26, w - 58, h - 60)
    })

    t.spriteDoorHalf = createCanvasTexture(96, 182, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.strokeStyle = 'rgba(16,18,21,0.92)'
      g.lineWidth = 8
      g.strokeRect(10, 8, w - 20, h - 14)
      g.fillStyle = 'rgba(150, 180, 215, 0.12)'
      g.fillRect(12, 10, w - 24, h - 18)
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(22, 18, w - 42, h - 60)
      g.fillStyle = '#dbe4ef'
      g.fillRect(w - 26, h * 0.48, 12, 3)
    })

    t.spritePole = createCanvasTexture(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#665d52')
      grad.addColorStop(1, '#2f2923')
      g.fillStyle = grad
      g.fillRect(26, 12, 12, h - 18)
      g.fillRect(16, 54, 26, 6)
      g.fillStyle = '#eed8a2'
      g.fillRect(42, 54, 12, 9)
      g.fillStyle = 'rgba(255,217,126,0.28)'
      g.beginPath(); g.ellipse(46, 60, 18, 11, 0, 0, TWO_PI); g.fill()
    })

    t.spriteVending = createCanvasTexture(116, 184, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#eef2f7'
      g.fillRect(10, 8, w - 20, h - 14)
      g.fillStyle = '#d5dbe5'
      g.fillRect(20, 18, w - 40, 54)
      g.fillStyle = '#bcc4d2'
      g.fillRect(20, 78, w - 40, 48)
      const colors = ['#e76d66', '#f1c858', '#68b8ff', '#71d47b', '#d88cff']
      colors.forEach((c, i) => {
        g.fillStyle = c
        g.fillRect(24 + i * 14, 84, 10, 34)
      })
      g.fillStyle = '#3e4756'
      g.fillRect(24, 130, w - 48, 20)
      g.fillStyle = '#d9dee6'
      g.fillRect(18, 156, w - 36, 10)
      g.strokeStyle = 'rgba(0,0,0,0.16)'
      g.strokeRect(10, 8, w - 20, h - 14)
    })

    t.spritePhone = createCanvasTexture(122, 196, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(135, 205, 255, 0.14)'
      g.fillRect(18, 8, w - 36, h - 18)
      g.strokeStyle = 'rgba(219,236,255,0.92)'
      g.lineWidth = 8
      g.strokeRect(18, 8, w - 36, h - 18)
      g.fillStyle = '#4aa0cc'
      g.fillRect(34, 18, w - 68, 24)
      g.fillStyle = '#2e3238'
      g.fillRect(40, 68, w - 80, 82)
      g.fillStyle = '#cad8ea'
      g.fillRect(48, 78, w - 96, 48)
    })

    t.spriteNotice = createCanvasTexture(152, 130, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#6f5238'
      g.fillRect(20, 16, w - 40, h - 44)
      g.fillStyle = '#efe3c8'
      g.fillRect(26, 22, w - 52, h - 56)
      g.fillStyle = '#cc5148'
      g.fillRect(34, 32, 46, 12)
      g.fillStyle = '#5a5f66'
      for (let y = 56; y < h - 42; y += 10) g.fillRect(34, y, w - 68, 2)
      g.fillStyle = '#5f4e3a'
      g.fillRect(48, h - 26, 8, 26)
      g.fillRect(w - 56, h - 26, 8, 26)
    })

    t.spriteBench = createCanvasTexture(186, 88, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#274165'
      g.fillRect(18, 20, w - 36, 18)
      g.fillRect(24, 44, w - 48, 10)
      g.fillStyle = '#1b2230'
      g.fillRect(34, 56, 10, 24)
      g.fillRect(w - 44, 56, 10, 24)
    })

    t.spriteShelf = createCanvasTexture(188, 152, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#737a84'
      g.fillRect(16, 8, w - 32, h - 16)
      g.fillStyle = '#5b626b'
      for (let y = 28; y < h - 12; y += 32) g.fillRect(16, y, w - 32, 4)
      const palette = ['#cf5757', '#7b9deb', '#f0b75d', '#95d26a', '#bf73de']
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          g.fillStyle = palette[(row + col) % palette.length]
          g.fillRect(24 + col * 22, 12 + row * 32, 15, 14 + ((row + col) % 2 ? 2 : 0))
        }
      }
      g.fillStyle = '#43484f'
      g.fillRect(28, h - 12, 10, 12)
      g.fillRect(w - 38, h - 12, 10, 12)
    })

    t.spriteCounter = createCanvasTexture(220, 108, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#d7dde2'
      g.fillRect(8, 18, w - 16, h - 24)
      g.fillStyle = '#bbc4cc'
      g.fillRect(8, 12, w - 16, 10)
      g.fillStyle = '#aab2bb'
      g.fillRect(22, 28, 54, 38)
      g.fillRect(82, 26, 56, 42)
      g.fillStyle = '#353b44'
      g.fillRect(154, 20, 28, 22)
      g.fillStyle = '#ef6e67'
      g.fillRect(160, 26, 16, 10)
      g.fillStyle = '#535b66'
      g.fillRect(188, 22, 12, 18)
      g.fillStyle = '#eef4fc'
      g.fillRect(186, 44, 16, 10)
      g.fillStyle = '#7b848d'
      g.fillRect(20, h - 10, w - 40, 10)
    })

    t.spriteMonitor = createCanvasTexture(86, 76, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#2c3239'
      g.fillRect(8, 8, w - 16, h - 18)
      g.fillStyle = '#111417'
      g.fillRect(14, 14, w - 28, h - 30)
      g.fillStyle = '#ff9736'
      g.font = 'bold 10px monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('THANK YOU', w / 2, 28)
      g.fillText('FOR COMING', w / 2, 40)
      g.fillStyle = '#5b6470'
      g.fillRect(32, h - 10, 20, 6)
    })

    t.spriteCooler = createCanvasTexture(240, 166, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#dbe2ea'
      g.fillRect(8, 8, w - 16, h - 16)
      g.fillStyle = '#f5f8fc'
      g.fillRect(16, 16, w - 32, h - 38)
      g.strokeStyle = '#6d7c8d'
      g.lineWidth = 4
      g.strokeRect(16, 16, w - 32, h - 38)
      g.beginPath(); g.moveTo(w / 2, 16); g.lineTo(w / 2, h - 22); g.stroke()
      const colors = ['#d95050', '#f0b351', '#72b8ff', '#66cb7a', '#ca7be0']
      ;[30, 58, 86].forEach((yy, row) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = colors[(i + row) % colors.length]
          g.fillRect(26 + i * 24, yy, 14, 16)
        }
      })
      g.fillStyle = 'rgba(255,255,255,0.35)'
      g.fillRect(26, 24, w - 52, 14)
    })

    t.spriteRack = createCanvasTexture(112, 138, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#d3c8ba'
      g.fillRect(10, 8, w - 20, h - 14)
      g.fillStyle = '#998a7b'
      g.fillRect(16, 18, w - 32, 6)
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          g.fillStyle = ['#e88a8a', '#f4d576', '#acd9f9', '#b8f0a9', '#e5aef5'][(row + col) % 5]
          g.fillRect(18 + col * 24, 28 + row * 22, 18, 18)
        }
      }
      g.fillStyle = '#78695a'
      g.fillRect(24, h - 8, 8, 8)
      g.fillRect(w - 32, h - 8, 8, 8)
    })

    t.spriteMat = createCanvasTexture(160, 60, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#6d747e'
      g.fillRect(6, 12, w - 12, 30)
      g.fillStyle = '#4f5660'
      for (let x = 10; x < w - 10; x += 10) g.fillRect(x, 12, 2, 30)
    })

    t.spriteBollard = createCanvasTexture(64, 120, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#c9d2db'
      g.fillRect(24, 16, 16, h - 18)
      g.fillStyle = '#e14343'
      g.fillRect(24, 30, 16, 10)
      g.fillStyle = '#b6bec8'
      g.fillRect(20, h - 10, 24, 8)
    })

    t.spriteTrash = createCanvasTexture(88, 110, (g, w, h) => {
      g.clearRect(0,0,w,h)
      g.fillStyle = '#5d6672'
      g.fillRect(18, 18, w - 36, h - 22)
      g.fillStyle = '#7b8793'
      g.fillRect(12, 12, w - 24, 12)
      g.fillStyle = '#36404b'
      g.fillRect(26, 32, w - 52, h - 44)
    })

    return t
  }

  function createWorld() {
    const mapW = 26
    const mapH = 24
    const walls = new Uint8Array(mapW * mapH)
    const floors = new Uint8Array(mapW * mapH)
    const ceilings = new Uint8Array(mapW * mapH)
    const lights = new Uint8Array(mapW * mapH)
    const idx = (x, y) => y * mapW + x
    const setWall = (x, y, v) => { walls[idx(x, y)] = v }
    const setFloor = (x, y, f, c = 0) => { floors[idx(x, y)] = f; ceilings[idx(x, y)] = c }

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        setFloor(x, y, 6, 0)
        if (x === 0 || y === 0 || x === mapW - 1 || y === mapH - 1) setWall(x, y, 1)
      }
    }

    // main approach road and parking
    for (let y = 13; y <= 22; y++) for (let x = 7; x <= 18; x++) setFloor(x, y, 1, 0)
    for (let y = 14; y <= 18; y++) {
      setFloor(9, y, 2, 0)
      setFloor(12, y, 2, 0)
      setFloor(15, y, 3, 0)
    }
    for (let y = 11; y <= 12; y++) for (let x = 8; x <= 17; x++) setFloor(x, y, 4, 2)
    for (let x = 7; x <= 18; x++) setFloor(x, 12, 4, 2)

    // interior
    for (let y = 5; y <= 10; y++) for (let x = 9; x <= 16; x++) setFloor(x, y, 5, 1)
    for (let x = 8; x <= 17; x++) setFloor(x, 10, 4, 2)

    // store shell
    for (let x = 8; x <= 17; x++) setWall(x, 4, 5)
    for (let y = 4; y <= 10; y++) {
      setWall(8, y, y >= 9 ? 1 : 2)
      setWall(17, y, y >= 9 ? 1 : 2)
    }
    setWall(9, 10, 1)
    setWall(10, 10, 1)
    setWall(15, 10, 1)
    setWall(16, 10, 1)

    // side utility / closed building
    for (let x = 19; x <= 22; x++) for (let y = 8; y <= 14; y++) setFloor(x, y, 4, 2)
    for (let x = 19; x <= 22; x++) { setWall(x, 8, 4); setWall(x, 14, 4) }
    for (let y = 8; y <= 14; y++) { setWall(19, y, 4); setWall(22, y, 4) }

    // side lane left and grass
    for (let y = 10; y <= 21; y++) for (let x = 4; x <= 6; x++) setFloor(x, y, y >= 17 ? 6 : 4, 0)
    for (let y = 10; y <= 22; y++) setFloor(19, y, 4, 0)

    // utility wall blocks and edge masses to avoid openness
    for (let y = 15; y <= 22; y++) setWall(6, y, 1)
    for (let y = 16; y <= 22; y++) setWall(19, y, 1)
    for (let x = 4; x <= 6; x++) setWall(x, 22, 1)
    for (let x = 19; x <= 22; x++) setWall(x, 22, 1)

    const lightSources = [
      { x: 12.5, y: 11.2, intensity: 0.72, radius: 5.2 },
      { x: 12.5, y: 7.5, intensity: 0.38, radius: 4.8 },
      { x: 18.2, y: 12.6, intensity: 0.28, radius: 3.2 },
      { x: 5.4, y: 13.2, intensity: 0.22, radius: 3.0 },
      { x: 6.6, y: 18.4, intensity: 0.18, radius: 2.8 },
    ]

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = idx(x, y)
        const insideStore = x >= 9 && x <= 16 && y >= 5 && y <= 10
        const porch = x >= 8 && x <= 17 && y >= 10 && y <= 12
        let ambient = insideStore ? 0.76 : porch ? 0.42 : floors[i] === 1 ? 0.14 : floors[i] === 4 ? 0.18 : 0.11
        const cx = x + 0.5
        const cy = y + 0.5
        for (const l of lightSources) {
          const dist = Math.hypot(cx - l.x, cy - l.y)
          if (dist < l.radius) ambient += (1 - dist / l.radius) * l.intensity
        }
        lights[i] = clamp((ambient * 255) | 0, 20, 255)
      }
    }

    const sprites = [
      { id: 'storeSign', texture: 'spriteSign', x: 12.5, y: 9.92, sizeX: 7.4, sizeY: 1.05, baseZ: 2.22 },
      { id: 'glassL', texture: 'spriteGlass', x: 10.38, y: 10.02, sizeX: 1.95, sizeY: 2.34, baseZ: 0.04, collidable: true, radius: 0.42 },
      { id: 'glassR', texture: 'spriteGlass', x: 14.62, y: 10.02, sizeX: 1.95, sizeY: 2.34, baseZ: 0.04, collidable: true, radius: 0.42 },
      { id: 'doorL', texture: 'spriteDoorHalf', x: 11.78, y: 10.02, sizeX: 0.92, sizeY: 2.34, baseZ: 0.02, collidable: true, radius: 0.25, dynamic: 'door' },
      { id: 'doorR', texture: 'spriteDoorHalf', x: 13.22, y: 10.02, sizeX: 0.92, sizeY: 2.34, baseZ: 0.02, collidable: true, radius: 0.25, dynamic: 'door' },
      { id: 'doorTrigger', texture: null, x: 12.5, y: 10.45, interactable: 'door', name: '入口', collidable: false },
      { id: 'mat', texture: 'spriteMat', x: 12.5, y: 11.55, sizeX: 1.48, sizeY: 0.36, baseZ: 0.01 },
      { id: 'poleA', texture: 'spritePole', x: 17.9, y: 12.1, sizeX: 0.34, sizeY: 3.9, baseZ: 0, collidable: true, radius: 0.12 },
      { id: 'poleB', texture: 'spritePole', x: 6.8, y: 13.4, sizeX: 0.34, sizeY: 3.9, baseZ: 0, collidable: true, radius: 0.12 },
      { id: 'poleC', texture: 'spritePole', x: 20.0, y: 15.3, sizeX: 0.34, sizeY: 3.8, baseZ: 0, collidable: true, radius: 0.12 },
      { id: 'vending', texture: 'spriteVending', x: 18.45, y: 12.3, sizeX: 1.03, sizeY: 2.25, baseZ: 0, collidable: true, radius: 0.34 },
      { id: 'phone', texture: 'spritePhone', x: 5.15, y: 13.45, sizeX: 1.12, sizeY: 2.28, baseZ: 0, collidable: true, radius: 0.4 },
      { id: 'notice', texture: 'spriteNotice', x: 6.05, y: 13.0, sizeX: 1.32, sizeY: 1.18, baseZ: 0, collidable: true, radius: 0.25 },
      { id: 'bench', texture: 'spriteBench', x: 5.85, y: 14.35, sizeX: 1.52, sizeY: 0.7, baseZ: 0, collidable: true, radius: 0.34 },
      { id: 'bollard1', texture: 'spriteBollard', x: 9.3, y: 12.2, sizeX: 0.34, sizeY: 1.18, baseZ: 0, collidable: true, radius: 0.14 },
      { id: 'bollard2', texture: 'spriteBollard', x: 15.7, y: 12.2, sizeX: 0.34, sizeY: 1.18, baseZ: 0, collidable: true, radius: 0.14 },
      { id: 'trash', texture: 'spriteTrash', x: 16.6, y: 11.95, sizeX: 0.66, sizeY: 0.88, baseZ: 0, collidable: true, radius: 0.18 },
      { id: 'shelfA', texture: 'spriteShelf', x: 12.15, y: 7.82, sizeX: 1.62, sizeY: 1.54, baseZ: 0, collidable: true, radius: 0.46 },
      { id: 'shelfB', texture: 'spriteShelf', x: 14.18, y: 7.55, sizeX: 1.62, sizeY: 1.54, baseZ: 0, collidable: true, radius: 0.46 },
      { id: 'rack', texture: 'spriteRack', x: 15.48, y: 9.12, sizeX: 0.98, sizeY: 1.3, baseZ: 0, collidable: true, radius: 0.22 },
      { id: 'cooler', texture: 'spriteCooler', x: 9.82, y: 5.35, sizeX: 2.8, sizeY: 2.18, baseZ: 0, collidable: true, radius: 0.60, interactable: 'fridge', name: '冷蔵ケース' },
      { id: 'counter', texture: 'spriteCounter', x: 14.15, y: 5.52, sizeX: 2.55, sizeY: 1.02, baseZ: 0, collidable: true, radius: 0.56, interactable: 'register', name: 'レジ周辺' },
      { id: 'monitor', texture: 'spriteMonitor', x: 14.85, y: 5.06, sizeX: 0.62, sizeY: 0.58, baseZ: 1.10 },
    ]

    const wires = [
      [{ x: 6.8, y: 13.4, z: 3.20 }, { x: 17.9, y: 12.1, z: 3.08 }],
      [{ x: 17.9, y: 12.1, z: 3.08 }, { x: 20.0, y: 15.3, z: 2.96 }],
      [{ x: 6.8, y: 13.4, z: 2.74 }, { x: 17.9, y: 12.1, z: 2.66 }],
    ]

    return {
      mapW, mapH, walls, floors, ceilings, lights, sprites, wires, idx,
      doors: { open: false }
    }
  }

  function isWall(x, y) {
    if (x < 0 || y < 0 || x >= world.mapW || y >= world.mapH) return true
    return world.walls[world.idx(x, y)] !== 0
  }

  function getFloorType(x, y) {
    if (x < 0 || y < 0 || x >= world.mapW || y >= world.mapH) return 6
    return world.floors[world.idx(x, y)]
  }

  function getCeilType(x, y) {
    if (x < 0 || y < 0 || x >= world.mapW || y >= world.mapH) return 0
    return world.ceilings[world.idx(x, y)]
  }

  function getLightValue(x, y) {
    if (x < 0 || y < 0 || x >= world.mapW || y >= world.mapH) return 0.12
    return world.lights[world.idx(x, y)] / 255
  }

  function getFloorTexture(type) {
    switch (type) {
      case 1: return textures.floorRoad
      case 2: return textures.floorParkingLeft
      case 3: return textures.floorParkingRight
      case 4: return textures.floorSidewalk
      case 5: return textures.floorTile
      default: return textures.floorGrass
    }
  }

  function getCeilingTexture(type) {
    switch (type) {
      case 1: return textures.ceilStore
      case 2: return textures.ceilPorch
      default: return null
    }
  }

  function getWallTexture(id) {
    switch (id) {
      case 1: return textures.wallStoreFront
      case 2: return textures.wallStoreSide
      case 4: return textures.wallClosedShop
      case 5: return textures.wallBack
      default: return textures.wallUtility
    }
  }

  function init() {
    ctx.imageSmoothingEnabled = false
    applySettingsToUI()
    bindUI()
    resize()
    showMessage('暗い進入路の先に店の光がある。入口を開けて、冷蔵ケースから飲み物を取り、レジ周辺まで進んでください。', 4.2)
    setTimeout(() => hintEl.classList.add('faded'), 4800)
    requestAnimationFrame(loop)
  }

  function applySettingsToUI() {
    scanlineOverlay.style.display = state.scanline ? 'block' : 'none'
    scanlineToggle.textContent = state.scanline ? 'ON' : 'OFF'
    qualityToggle.textContent = state.quality.toUpperCase()
    sensitivityToggle.textContent = `${state.sensitivity.toFixed(2).replace(/\.00$/, '')}x`
    runToggle.textContent = `走る: ${state.run ? 'ON' : 'OFF'}`
    runToggle.classList.toggle('active', state.run)
    heldItemEl.classList.toggle('hidden', !state.inventory.drink)
    document.documentElement.style.setProperty('--scanline-opacity', state.scanline ? '0.16' : '0')
  }

  function bindUI() {
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    document.addEventListener('visibilitychange', () => { state.lastTick = 0 })

    menuBtn.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden')
      menuBtn.setAttribute('aria-expanded', menuPanel.classList.contains('hidden') ? 'false' : 'true')
    })

    scanlineToggle.addEventListener('click', () => {
      state.scanline = !state.scanline
      applySettingsToUI()
      saveSettings()
    })
    qualityToggle.addEventListener('click', () => {
      state.quality = state.quality === 'low' ? 'mid' : state.quality === 'mid' ? 'high' : 'low'
      resize()
      applySettingsToUI()
      saveSettings()
    })
    sensitivityToggle.addEventListener('click', () => {
      const idx = sensitivityProfiles.indexOf(state.sensitivity)
      state.sensitivity = sensitivityProfiles[(idx + 1) % sensitivityProfiles.length]
      applySettingsToUI()
      saveSettings()
    })
    runToggle.addEventListener('click', () => {
      state.run = !state.run
      applySettingsToUI()
    })

    interactBtn.addEventListener('click', tryInteract)
    interactBtn.addEventListener('touchend', (ev) => { ev.preventDefault(); tryInteract() }, { passive: false })

    pickupPanel.querySelectorAll('.pickup-btn').forEach((btn) => btn.addEventListener('click', () => pickDrink(btn.dataset.item)))

    leftZone.addEventListener('pointerdown', onStickStart)
    leftZone.addEventListener('pointermove', onStickMove)
    leftZone.addEventListener('pointerup', onStickEnd)
    leftZone.addEventListener('pointercancel', onStickEnd)
    leftZone.addEventListener('pointerleave', onStickEnd)

    rightZone.addEventListener('pointerdown', onLookStart)
    rightZone.addEventListener('pointermove', onLookMove)
    rightZone.addEventListener('pointerup', onLookEnd)
    rightZone.addEventListener('pointercancel', onLookEnd)
    rightZone.addEventListener('pointerleave', onLookEnd)
  }

  function resize() {
    state.width = app.clientWidth
    state.height = app.clientHeight
    canvas.width = state.width * devicePixelRatio
    canvas.height = state.height * devicePixelRatio
    canvas.style.width = `${state.width}px`
    canvas.style.height = `${state.height}px`
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

    const scale = qualityProfiles[state.quality] || qualityProfiles.mid
    state.renderW = Math.max(180, ((state.width * scale) | 0))
    state.renderH = Math.max(320, ((state.height * scale) | 0))
    offscreen.width = state.renderW
    offscreen.height = state.renderH
    offCtx = offscreen.getContext('2d', { alpha: false })
    state.imageData = offCtx.createImageData(state.renderW, state.renderH)
    state.pixels = new Uint32Array(state.imageData.data.buffer)
    state.depthBuffer = new Float32Array(state.renderW)
    state.lastTick = 0
  }

  function onStickStart(ev) {
    if (input.stickActive || state.selectionOpen) return
    input.stickActive = true
    input.stickId = ev.pointerId
    const rect = joystickBase.getBoundingClientRect()
    input.stickCenterX = rect.left + rect.width / 2
    input.stickCenterY = rect.top + rect.height / 2
    joystickBase.setPointerCapture(ev.pointerId)
    updateStick(ev.clientX, ev.clientY)
  }
  function onStickMove(ev) { if (input.stickActive && ev.pointerId === input.stickId) updateStick(ev.clientX, ev.clientY) }
  function onStickEnd(ev) {
    if (!input.stickActive || ev.pointerId !== input.stickId) return
    input.stickActive = false
    input.stickId = null
    input.joyX = 0
    input.joyY = 0
    joystickStick.style.transform = 'translate(0px, 0px)'
  }
  function updateStick(clientX, clientY) {
    const dx = clientX - input.stickCenterX
    const dy = clientY - input.stickCenterY
    const max = 34
    const len = Math.hypot(dx, dy) || 1
    input.joyX = clamp(dx / max, -1, 1)
    input.joyY = clamp(dy / max, -1, 1)
    const drawX = len > max ? dx / len * max : dx
    const drawY = len > max ? dy / len * max : dy
    joystickStick.style.transform = `translate(${drawX}px, ${drawY}px)`
  }

  function onLookStart(ev) {
    if (state.selectionOpen || input.lookActive || ev.clientX < state.width * 0.42) return
    input.lookActive = true
    input.lookId = ev.pointerId
    input.lastLookX = ev.clientX
    input.lastLookY = ev.clientY
    rightZone.setPointerCapture(ev.pointerId)
  }
  function onLookMove(ev) {
    if (!input.lookActive || ev.pointerId !== input.lookId) return
    const dx = ev.clientX - input.lastLookX
    const dy = ev.clientY - input.lastLookY
    input.lastLookX = ev.clientX
    input.lastLookY = ev.clientY
    const sens = BASE_SENSITIVITY * state.sensitivity
    player.dir += dx * sens
    player.pitch = clamp(player.pitch + dy * 0.28 * state.sensitivity, -28, 22)
  }
  function onLookEnd(ev) {
    if (!input.lookActive || ev.pointerId !== input.lookId) return
    input.lookActive = false
    input.lookId = null
  }

  function loop(ts) {
    requestAnimationFrame(loop)
    if (!state.lastTick) {
      state.lastTick = ts
      render()
      return
    }
    const elapsed = ts - state.lastTick
    if (elapsed < state.fpsStep) return
    const dt = Math.min(MAX_DT, elapsed / 1000)
    state.lastTick = ts
    update(dt)
    render()
  }

  function update(dt) {
    if (!state.selectionOpen) {
      const dirX = Math.cos(player.dir)
      const dirY = Math.sin(player.dir)
      const rightX = -dirY
      const rightY = dirX
      let mx = Math.abs(input.joyX) < 0.08 ? 0 : input.joyX
      let my = Math.abs(input.joyY) < 0.08 ? 0 : input.joyY
      if (mx || my) {
        const forward = -my
        const strafe = mx
        let moveX = dirX * forward + rightX * strafe
        let moveY = dirY * forward + rightY * strafe
        const len = Math.hypot(moveX, moveY) || 1
        moveX /= len
        moveY /= len
        const speed = state.run ? 3.15 : 2.15
        tryMove(moveX * speed * dt, moveY * speed * dt)
      }
    }
    player.dir = (player.dir + TWO_PI) % TWO_PI
    updateInteractionTarget()
  }

  function tryMove(dx, dy) {
    const radius = 0.18
    let nx = player.x + dx
    let ny = player.y
    if (!collides(nx, ny, radius)) player.x = nx
    nx = player.x
    ny = player.y + dy
    if (!collides(nx, ny, radius)) player.y = ny
  }

  function collides(x, y, radius) {
    const minX = Math.floor(x - radius)
    const maxX = Math.floor(x + radius)
    const minY = Math.floor(y - radius)
    const maxY = Math.floor(y + radius)
    for (let cy = minY; cy <= maxY; cy++) {
      for (let cx = minX; cx <= maxX; cx++) {
        if (isWall(cx, cy)) return true
      }
    }
    for (const s of world.sprites) {
      if (s.hidden || !s.collidable || !s.radius) continue
      if (Math.hypot(x - s.x, y - s.y) < radius + s.radius) return true
    }
    return false
  }

  function updateInteractionTarget() {
    let best = null
    let bestScore = -Infinity
    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    for (const s of world.sprites) {
      if (s.hidden || !s.interactable) continue
      const dx = s.x - player.x
      const dy = s.y - player.y
      const dist = Math.hypot(dx, dy)
      if (dist > 1.55) continue
      const dot = (dx / dist) * dirX + (dy / dist) * dirY
      if (dot < 0.84) continue
      const score = dot * 2 - dist
      if (score > bestScore) {
        bestScore = score
        best = s
      }
    }
    state.currentTarget = best
    if (best) {
      promptEl.textContent = `調べる: ${best.name}`
      promptEl.classList.remove('hidden')
      interactBtn.disabled = false
    } else {
      promptEl.classList.add('hidden')
      interactBtn.disabled = true
    }
  }

  function tryInteract() {
    if (state.selectionOpen || !state.currentTarget) return
    const target = state.currentTarget
    if (target.interactable === 'door') {
      if (!world.doors.open) {
        world.doors.open = true
        for (const s of world.sprites) {
          if (s.dynamic === 'door') {
            s.hidden = true
            s.collidable = false
          }
        }
        target.hidden = true
        showMessage('入口の引き戸が静かに開く。白い店内の明かりが少し強くなる。', 2.4)
        updateInteractionTarget()
      }
      return
    }
    if (target.interactable === 'fridge') {
      if (state.inventory.drink) {
        showMessage('もう一本持つ気にはならない。先にレジ周辺を見てみよう。', 2.4)
        return
      }
      state.selectionOpen = true
      pickupPanel.classList.remove('hidden')
      showMessage('冷たい飲み物が並んでいる。一本だけ選ぶ。', 2.2)
      return
    }
    if (target.interactable === 'register') {
      if (!state.inventory.drink) {
        showMessage('無人のレジ。液晶には 22:46 が残っている。先に冷蔵ケースを調べよう。', 3.6)
      } else {
        showMessage('レジは無人のまま。モニターには “THANK YOU FOR COMING” が焼き付いたように残っている。', 4.0)
      }
    }
  }

  function pickDrink(type) {
    state.inventory.drink = type
    state.selectionOpen = false
    pickupPanel.classList.add('hidden')
    heldItemEl.classList.remove('hidden')
    const bottle = heldItemEl.querySelector('.bottle')
    if (type === 'tea') bottle.style.filter = 'hue-rotate(42deg) saturate(0.95)'
    else if (type === 'cola') bottle.style.filter = 'hue-rotate(-38deg) saturate(1.15)'
    else bottle.style.filter = 'none'
    showMessage('冷たいボトルを持った。レジ周辺を調べてみる。', 2.8)
    updateInteractionTarget()
    applySettingsToUI()
  }

  function showMessage(text, duration = 3) {
    messageEl.textContent = text
    messageEl.classList.remove('hidden')
    clearTimeout(state.hudTimer)
    state.hudTimer = setTimeout(() => messageEl.classList.add('hidden'), duration * 1000)
  }

  function render() {
    const w = state.renderW
    const h = state.renderH
    const horizon = ((h / 2) + player.pitch) | 0
    renderSky(state.pixels, w, h, horizon)
    renderFloorAndCeiling(state.pixels, w, h, horizon)
    renderWalls(state.pixels, w, h, horizon)
    renderSprites(state.pixels, w, h, horizon)
    renderWires(state.pixels, w, h)
    offCtx.putImageData(state.imageData, 0, 0)
    ctx.clearRect(0, 0, state.width, state.height)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(offscreen, 0, 0, state.width, state.height)
  }

  function renderSky(pixels, w, h, horizon) {
    const sky = textures.sky
    const upper = clamp(horizon, 0, h)
    for (let x = 0; x < w; x++) {
      const rayAngle = player.dir - FOV / 2 + (x / w) * FOV
      const sx = ((((rayAngle / TWO_PI) % 1 + 1) % 1) * sky.w) | 0
      for (let y = 0; y < upper; y++) {
        const v = clamp(y / Math.max(upper, 1), 0, 0.98)
        const sy = (v * (sky.h - 1)) | 0
        pixels[y * w + x] = sky.pixels[sy * sky.w + sx]
      }
    }
  }

  function renderFloorAndCeiling(pixels, w, h, horizon) {
    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    const planeLen = Math.tan(FOV / 2)
    const planeX = -dirY * planeLen
    const planeY = dirX * planeLen
    const rayDirX0 = dirX - planeX
    const rayDirY0 = dirY - planeY
    const rayDirX1 = dirX + planeX
    const rayDirY1 = dirY + planeY
    const posZ = 0.5 * h

    for (let y = horizon + 1; y < h; y++) {
      const p = y - horizon
      const rowDistance = posZ / p
      let floorX = player.x + rowDistance * rayDirX0
      let floorY = player.y + rowDistance * rayDirY0
      const stepX = (rowDistance * (rayDirX1 - rayDirX0)) / w
      const stepY = (rowDistance * (rayDirY1 - rayDirY0)) / w
      const fog = 1 - smoothstep(4, 18, rowDistance)
      for (let x = 0; x < w; x++) {
        const cellX = floorX | 0
        const cellY = floorY | 0
        const tex = getFloorTexture(getFloorType(cellX, cellY))
        const tx = ((tex.w * (floorX - cellX)) | 0) & (tex.w - 1)
        const ty = ((tex.h * (floorY - cellY)) | 0) & (tex.h - 1)
        const light = getLightValue(cellX, cellY)
        pixels[y * w + x] = shadeColor(tex.pixels[ty * tex.w + tx], clamp(light * (0.38 + fog * 0.92), 0.12, 1))
        floorX += stepX
        floorY += stepY
      }
    }

    for (let y = 0; y < horizon; y++) {
      const p = horizon - y
      if (p <= 0) continue
      const rowDistance = posZ / p
      let floorX = player.x + rowDistance * rayDirX0
      let floorY = player.y + rowDistance * rayDirY0
      const stepX = (rowDistance * (rayDirX1 - rayDirX0)) / w
      const stepY = (rowDistance * (rayDirY1 - rayDirY0)) / w
      const fog = 1 - smoothstep(3, 12, rowDistance)
      for (let x = 0; x < w; x++) {
        const cellX = floorX | 0
        const cellY = floorY | 0
        const ceilType = getCeilType(cellX, cellY)
        if (ceilType) {
          const tex = getCeilingTexture(ceilType)
          const tx = ((tex.w * (floorX - cellX)) | 0) & (tex.w - 1)
          const ty = ((tex.h * (floorY - cellY)) | 0) & (tex.h - 1)
          const light = getLightValue(cellX, cellY)
          pixels[y * w + x] = shadeColor(tex.pixels[ty * tex.w + tx], clamp(light * (0.45 + fog * 0.6), 0.22, 1))
        }
        floorX += stepX
        floorY += stepY
      }
    }
  }

  function renderWalls(pixels, w, h, horizon) {
    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    const planeLen = Math.tan(FOV / 2)
    const planeX = -dirY * planeLen
    const planeY = dirX * planeLen

    for (let x = 0; x < w; x++) {
      const cameraX = 2 * x / w - 1
      const rayDirX = dirX + planeX * cameraX
      const rayDirY = dirY + planeY * cameraX
      let mapX = player.x | 0
      let mapY = player.y | 0

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX)
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY)
      let sideDistX, sideDistY, stepX, stepY, hit = 0, side = 0

      if (rayDirX < 0) { stepX = -1; sideDistX = (player.x - mapX) * deltaDistX }
      else { stepX = 1; sideDistX = (mapX + 1 - player.x) * deltaDistX }
      if (rayDirY < 0) { stepY = -1; sideDistY = (player.y - mapY) * deltaDistY }
      else { stepY = 1; sideDistY = (mapY + 1 - player.y) * deltaDistY }

      while (!hit) {
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX
          mapX += stepX
          side = 0
        } else {
          sideDistY += deltaDistY
          mapY += stepY
          side = 1
        }
        hit = world.walls[world.idx(mapX, mapY)]
      }

      const perpDist = side === 0
        ? (mapX - player.x + (1 - stepX) / 2) / rayDirX
        : (mapY - player.y + (1 - stepY) / 2) / rayDirY

      state.depthBuffer[x] = perpDist
      const lineH = (h / Math.max(perpDist, 0.0001)) | 0
      let drawStart = ((horizon - lineH * (1 - CAMERA_HEIGHT)) | 0)
      let drawEnd = ((horizon + lineH * CAMERA_HEIGHT) | 0)
      drawStart = clamp(drawStart, 0, h - 1)
      drawEnd = clamp(drawEnd, 0, h - 1)

      const tex = getWallTexture(hit)
      let wallX = side === 0 ? player.y + perpDist * rayDirY : player.x + perpDist * rayDirX
      wallX -= Math.floor(wallX)
      let texX = (wallX * tex.w) | 0
      if (side === 0 && rayDirX > 0) texX = tex.w - texX - 1
      if (side === 1 && rayDirY < 0) texX = tex.w - texX - 1
      const step = tex.h / lineH
      let texPos = (drawStart - horizon + lineH * (1 - CAMERA_HEIGHT)) * step
      const light = getLightValue(mapX - (side === 0 ? stepX : 0), mapY - (side === 1 ? stepY : 0))
      const fog = 1 - smoothstep(2.5, 18, perpDist)
      const shade = clamp(light * (side ? 0.84 : 1) * (0.34 + fog * 0.88), 0.12, 1)

      for (let y = drawStart; y <= drawEnd; y++) {
        const texY = (texPos | 0) & (tex.h - 1)
        texPos += step
        pixels[y * w + x] = shadeColor(tex.pixels[texY * tex.w + texX], shade)
      }
    }
  }

  function renderSprites(pixels, w, h, horizon) {
    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    const planeLen = Math.tan(FOV / 2)
    const planeX = -dirY * planeLen
    const planeY = dirX * planeLen
    const invDet = 1 / (planeX * dirY - dirX * planeY)
    const ordered = world.sprites
      .filter((s) => !s.hidden && s.texture)
      .map((s) => ({ s, d: (player.x - s.x) ** 2 + (player.y - s.y) ** 2 }))
      .sort((a, b) => b.d - a.d)

    for (const entry of ordered) {
      const s = entry.s
      const tex = textures[s.texture]
      const spriteX = s.x - player.x
      const spriteY = s.y - player.y
      const transformX = invDet * (dirY * spriteX - dirX * spriteY)
      const transformY = invDet * (-planeY * spriteX + planeX * spriteY)
      if (transformY <= 0.1) continue

      const proj = h / transformY
      const screenX = ((w / 2) * (1 + transformX / transformY)) | 0
      const spriteW = Math.abs(proj * s.sizeX) | 0
      const spriteH = Math.abs(proj * s.sizeY) | 0
      const startX = clamp((screenX - spriteW / 2) | 0, 0, w - 1)
      const endX = clamp((screenX + spriteW / 2) | 0, 0, w - 1)
      const drawStartY = clamp((horizon - (s.baseZ + s.sizeY - CAMERA_HEIGHT) * proj) | 0, 0, h - 1)
      const drawEndY = clamp((horizon - (s.baseZ - CAMERA_HEIGHT) * proj) | 0, 0, h - 1)
      const light = clamp(getLightValue(s.x | 0, s.y | 0) * (0.42 + (1 - smoothstep(2, 18, transformY)) * 0.92), 0.15, 1)

      for (let stripe = startX; stripe <= endX; stripe++) {
        if (transformY >= state.depthBuffer[stripe]) continue
        const texX = (((stripe - (screenX - spriteW / 2)) / spriteW) * tex.w) | 0
        if (texX < 0 || texX >= tex.w) continue
        for (let y = drawStartY; y <= drawEndY; y++) {
          const texY = (((y - drawStartY) / Math.max(drawEndY - drawStartY, 1)) * tex.h) | 0
          const src = shadeColor(tex.pixels[texY * tex.w + texX], light)
          const a = (src >>> 24) & 255
          if (a <= 4) continue
          const i = y * w + stripe
          pixels[i] = a >= 250 ? src : blendPixel(pixels[i], src)
        }
      }
    }
  }

  function projectPoint(x, y, z, w, h) {
    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    const planeLen = Math.tan(FOV / 2)
    const planeX = -dirY * planeLen
    const planeY = dirX * planeLen
    const invDet = 1 / (planeX * dirY - dirX * planeY)
    const dx = x - player.x
    const dy = y - player.y
    const transformX = invDet * (dirY * dx - dirX * dy)
    const transformY = invDet * (-planeY * dx + planeX * dy)
    if (transformY <= 0.1) return null
    const proj = h / transformY
    return { x: (w / 2) * (1 + transformX / transformY), y: (h / 2 + player.pitch) - (z - CAMERA_HEIGHT) * proj, depth: transformY }
  }

  function drawLineOnBuffer(pixels, w, h, x0, y0, x1, y1, color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    let dx = Math.abs(x1 - x0)
    let sx = x0 < x1 ? 1 : -1
    let dy = -Math.abs(y1 - y0)
    let sy = y0 < y1 ? 1 : -1
    let err = dx + dy
    while (true) {
      if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) pixels[y0 * w + x0] = blendPixel(pixels[y0 * w + x0], color)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 >= dy) { err += dy; x0 += sx }
      if (e2 <= dx) { err += dx; y0 += sy }
    }
  }

  function renderWires(pixels, w, h) {
    for (const [a, b] of world.wires) {
      const pa = projectPoint(a.x, a.y, a.z, w, h)
      const pb = projectPoint(b.x, b.y, b.z, w, h)
      if (!pa || !pb) continue
      const alpha = clamp(1 - smoothstep(2, 18, Math.min(pa.depth, pb.depth)), 0.10, 0.52)
      const dark = rgba(40, 39, 44, (alpha * 255) | 0)
      const soft = rgba(88, 75, 62, (alpha * 115) | 0)
      drawLineOnBuffer(pixels, w, h, pa.x, pa.y, pb.x, pb.y, dark)
      drawLineOnBuffer(pixels, w, h, pa.x, pa.y + 1, pb.x, pb.y + 1, soft)
    }
  }

  init()
})()
