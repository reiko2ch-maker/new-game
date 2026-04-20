(() => {
  'use strict'

  const TWO_PI = Math.PI * 2
  const FOV = Math.PI / 3.2
  const BASE_SENSITIVITY = 0.0024
  const STORAGE_KEY = 'rural-night-store-v9-settings'
  const CAMERA_HEIGHT = 0.5
  const TARGET_FPS = 30
  const MAX_DT = 0.04

  const qualityProfiles = {
    low: 0.5,
    mid: 0.62,
    high: 0.75,
  }
  const sensitivityProfiles = [0.85, 1, 1.15]

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
  const itemPickupEl = document.getElementById('itemPickup')
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
    horizon: 0,
    imageData: null,
    pixels: null,
    depthBuffer: [],
    lastFrame: 0,
    accum: 0,
    run: false,
    scanline: settings.scanline,
    quality: settings.quality,
    sensitivity: settings.sensitivity,
    hintFaded: false,
    hudMessageTimer: 0,
    currentTarget: null,
    selectionOpen: false,
    inventory: { drink: null },
  }

  const input = {
    joyX: 0,
    joyY: 0,
    lookX: 0,
    lookY: 0,
    stickActive: false,
    stickId: null,
    stickCenterX: 0,
    stickCenterY: 0,
    lookActive: false,
    lookId: null,
    lastLookX: 0,
    lastLookY: 0,
  }

  const world = createWorld()
  const textures = createTextures()

  const player = {
    x: 11.5,
    y: 18.3,
    dir: -Math.PI / 2 + 0.08,
    pitch: 0,
  }

  let offscreen = document.createElement('canvas')
  let offCtx = offscreen.getContext('2d', { alpha: false })
  let skyTexture = textures.sky

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
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        scanline: state.scanline,
        quality: state.quality,
        sensitivity: state.sensitivity,
      })
    )
  }

  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v))
  }

  function lerp(a, b, t) {
    return a + (b - a) * t
  }

  function smoothstep(edge0, edge1, x) {
    const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
    return t * t * (3 - 2 * t)
  }

  function rgba(r, g, b, a = 255) {
    return ((a & 255) << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255)
  }

  function unpack(color) {
    return [color & 255, (color >> 8) & 255, (color >> 16) & 255, (color >>> 24) & 255]
  }

  function shadeColor(color, shade) {
    if (shade >= 0.999) return color
    const r = color & 255
    const g = (color >> 8) & 255
    const b = (color >> 16) & 255
    return rgba((r * shade) | 0, (g * shade) | 0, (b * shade) | 0, (color >>> 24) & 255)
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

  function createCanvasTexture(w, h, draw) {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    const g = c.getContext('2d')
    draw(g, w, h)
    const image = g.getImageData(0, 0, w, h)
    return {
      w,
      h,
      pixels: new Uint32Array(image.data.buffer.slice(0)),
    }
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
      grad.addColorStop(0, '#031126')
      grad.addColorStop(0.55, '#0a2246')
      grad.addColorStop(1, '#162744')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)

      for (let i = 0; i < 90; i++) {
        const x = Math.random() * w
        const y = Math.random() * h * 0.58
        const r = Math.random() * 1.5 + 0.3
        const a = Math.random() * 0.25 + 0.08
        g.fillStyle = `rgba(255,255,255,${a})`
        g.beginPath()
        g.arc(x, y, r, 0, TWO_PI)
        g.fill()
      }

      g.globalAlpha = 0.12
      g.fillStyle = '#d7e5ff'
      for (let i = 0; i < 8; i++) {
        const x = Math.random() * w
        const y = 34 + Math.random() * 80
        g.beginPath()
        g.ellipse(x, y, 55 + Math.random() * 60, 12 + Math.random() * 12, 0, 0, TWO_PI)
        g.fill()
      }
      g.globalAlpha = 1

      const layers = [
        { color: '#0c1830', height: 188, amp: 16, seed: 0.8 },
        { color: '#111e38', height: 200, amp: 22, seed: 1.6 },
        { color: '#172743', height: 212, amp: 26, seed: 2.4 },
      ]

      for (const layer of layers) {
        g.fillStyle = layer.color
        g.beginPath()
        g.moveTo(0, h)
        g.lineTo(0, layer.height)
        for (let x = 0; x <= w; x += 8) {
          const y = layer.height + Math.sin(x * 0.008 + layer.seed) * layer.amp + Math.sin(x * 0.024 + layer.seed * 2.1) * (layer.amp * 0.35)
          g.lineTo(x, y)
        }
        g.lineTo(w, h)
        g.closePath()
        g.fill()
      }
    })

    t.wallExterior = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#d8d5ce'
      g.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 8) {
        g.fillStyle = x % 16 === 0 ? '#d1cec6' : '#dfdcd4'
        g.fillRect(x, 0, 5, h)
        g.fillStyle = 'rgba(76, 70, 64, 0.18)'
        g.fillRect(x + 5, 0, 1, h)
      }
      g.fillStyle = 'rgba(90, 86, 77, 0.12)'
      for (let y = 0; y < h; y += 12) g.fillRect(0, y, w, 1)
      noise(g, w, h, 16, 255, [220, 220, 210])
    })

    t.wallDark = createCanvasTexture(64, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#2a3241')
      grad.addColorStop(1, '#111722')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      g.fillStyle = 'rgba(255,255,255,0.06)'
      for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1)
      noise(g, w, h, 10, 255, [100, 110, 130])
    })

    t.wallShopSide = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#eeece8'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#dad5cf'
      for (let y = 0; y < h; y += 10) g.fillRect(0, y, w, 1)
      g.fillStyle = '#c8c3bd'
      for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 1, h)
      noise(g, w, h, 10, 255, [235, 232, 225])
    })

    t.wallClosedShop = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#83796c'
      g.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 6) {
        g.fillStyle = x % 12 === 0 ? '#92887b' : '#766d63'
        g.fillRect(x, 0, 4, h)
      }
      g.fillStyle = 'rgba(0,0,0,0.15)'
      for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 1)
    })

    t.floorRoad = createCanvasTexture(64, 64, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#2d3645')
      grad.addColorStop(1, '#1d2430')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 26, 255, [160, 175, 190])
      g.strokeStyle = 'rgba(255,255,255,0.06)'
      g.lineWidth = 1
      for (let i = 0; i < 6; i++) {
        g.beginPath()
        g.moveTo(Math.random() * w, Math.random() * h)
        g.lineTo(Math.random() * w, Math.random() * h)
        g.stroke()
      }
    })

    t.floorParkingLeft = createCanvasTexture(64, 64, (g, w, h) => {
      g.drawImage(textureToCanvas(t.floorRoad), 0, 0)
      g.fillStyle = '#f2f3f6'
      g.fillRect(6, 0, 4, h)
    })

    t.floorParkingRight = createCanvasTexture(64, 64, (g, w, h) => {
      g.drawImage(textureToCanvas(t.floorRoad), 0, 0)
      g.fillStyle = '#f2f3f6'
      g.fillRect(w - 10, 0, 4, h)
    })

    t.floorSidewalk = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#8e939b'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#a0a6ad'
      g.fillRect(0, 0, w, 5)
      g.fillStyle = '#7a8086'
      for (let x = 0; x < w; x += 16) {
        g.fillRect(x, 0, 1, h)
      }
      for (let y = 0; y < h; y += 16) {
        g.fillRect(0, y, w, 1)
      }
      noise(g, w, h, 14, 255, [180, 185, 188])
    })

    t.floorTile = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#f6f6f4'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#d7d7d2'
      for (let x = 0; x <= w; x += 16) g.fillRect(x, 0, 1, h)
      for (let y = 0; y <= h; y += 16) g.fillRect(0, y, w, 1)
      noise(g, w, h, 10, 255, [235, 235, 232])
    })

    t.floorGrass = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#203622'
      g.fillRect(0, 0, w, h)
      noise(g, w, h, 24, 255, [70, 110, 70])
      g.fillStyle = 'rgba(93,128,73,0.4)'
      for (let i = 0; i < 90; i++) g.fillRect(Math.random() * w, Math.random() * h, 1, 3 + Math.random() * 4)
    })

    t.floorBridge = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#676d75'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#555d67'
      for (let x = 0; x < w; x += 10) g.fillRect(x, 0, 1, h)
      g.fillStyle = 'rgba(255,255,255,0.1)'
      g.fillRect(0, 6, w, 1)
      g.fillRect(0, h - 6, w, 1)
    })

    t.ceilStore = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#d7dbde'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#c7cbcf'
      for (let x = 0; x <= w; x += 16) g.fillRect(x, 0, 1, h)
      for (let y = 0; y <= h; y += 16) g.fillRect(0, y, w, 1)
      g.fillStyle = '#f7f9ff'
      g.fillRect(4, 6, 24, 6)
      g.fillRect(36, 6, 24, 6)
      g.fillStyle = 'rgba(255,255,255,0.15)'
      g.fillRect(4, 12, 24, 2)
      g.fillRect(36, 12, 24, 2)
    })

    t.ceilPorch = createCanvasTexture(64, 64, (g, w, h) => {
      g.fillStyle = '#d0d4d8'
      g.fillRect(0, 0, w, h)
      g.fillStyle = '#b7bdc5'
      for (let x = 0; x < w; x += 10) g.fillRect(x, 0, 2, h)
    })

    t.spriteSign = createCanvasTexture(256, 80, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#f5f6f8'
      g.fillRect(0, 22, w, 54)
      g.fillStyle = '#2fbd86'
      g.fillRect(0, 24, w, 16)
      g.fillStyle = '#d64545'
      g.fillRect(0, 60, w, 8)
      g.fillStyle = '#f2c14d'
      g.fillRect(0, 8, w, 10)
      g.fillStyle = '#ffffff'
      g.font = 'bold 34px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('こもれびマート', w / 2, 33)
    })

    t.spriteGlass = createCanvasTexture(160, 160, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(255,255,255,0.12)'
      g.fillRect(16, 8, w - 32, h - 12)
      g.strokeStyle = 'rgba(24,30,40,0.82)'
      g.lineWidth = 10
      g.strokeRect(16, 8, w - 32, h - 12)
      g.strokeStyle = 'rgba(180, 200, 235, 0.28)'
      g.lineWidth = 2
      g.beginPath()
      g.moveTo(26, 18)
      g.lineTo(w - 40, 18)
      g.stroke()
      const grad = g.createLinearGradient(0, 0, w, h)
      grad.addColorStop(0, 'rgba(255,255,255,0.22)')
      grad.addColorStop(0.4, 'rgba(255,255,255,0.02)')
      grad.addColorStop(1, 'rgba(255,255,255,0.15)')
      g.fillStyle = grad
      g.fillRect(16, 8, w - 32, h - 12)
    })

    t.spriteDoor = createCanvasTexture(128, 180, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.strokeStyle = 'rgba(18,18,20,0.9)'
      g.lineWidth = 8
      g.strokeRect(12, 8, w - 24, h - 12)
      g.strokeRect(18, 14, w / 2 - 22, h - 24)
      g.strokeRect(w / 2 + 4, 14, w / 2 - 22, h - 24)
      g.fillStyle = 'rgba(170, 195, 235, 0.12)'
      g.fillRect(18, 14, w / 2 - 22, h - 24)
      g.fillRect(w / 2 + 4, 14, w / 2 - 22, h - 24)
      g.fillStyle = 'rgba(255,255,255,0.4)'
      g.fillRect(30, h * 0.45, 18, 3)
      g.fillRect(w - 48, h * 0.45, 18, 3)
    })

    t.spritePole = createCanvasTexture(64, 256, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, '#5a534d')
      grad.addColorStop(1, '#2f2924')
      g.fillStyle = grad
      g.fillRect(26, 14, 12, h - 20)
      g.fillRect(18, 58, 28, 6)
      g.fillStyle = '#f0d59b'
      g.fillRect(44, 58, 12, 8)
      g.fillStyle = 'rgba(255,215,120,0.28)'
      g.beginPath()
      g.ellipse(48, 64, 18, 10, 0, 0, TWO_PI)
      g.fill()
    })

    t.spriteVending = createCanvasTexture(112, 176, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#f2f4f7'
      g.fillRect(12, 8, w - 24, h - 16)
      g.fillStyle = '#d7dbe2'
      g.fillRect(22, 18, w - 44, 54)
      g.fillStyle = '#bfc7d6'
      g.fillRect(22, 76, w - 44, 46)
      const colors = ['#e76d66', '#f1c858', '#68b8ff', '#71d47b', '#d88cff']
      colors.forEach((c, i) => {
        g.fillStyle = c
        g.fillRect(26 + i * 12, 82, 8, 34)
      })
      g.fillStyle = '#414b5c'
      g.fillRect(24, 126, w - 48, 20)
      g.fillStyle = '#d4dae4'
      g.fillRect(18, 150, w - 36, 10)
      g.strokeStyle = 'rgba(0,0,0,0.18)'
      g.strokeRect(12, 8, w - 24, h - 16)
    })

    t.spritePhone = createCanvasTexture(120, 190, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = 'rgba(140, 205, 255, 0.16)'
      g.fillRect(18, 8, w - 36, h - 18)
      g.strokeStyle = 'rgba(215, 235, 255, 0.88)'
      g.lineWidth = 8
      g.strokeRect(18, 8, w - 36, h - 18)
      g.fillStyle = '#4ca9d9'
      g.fillRect(34, 22, w - 68, 26)
      g.fillStyle = '#2c2f34'
      g.fillRect(42, 74, w - 84, 72)
      g.fillStyle = '#c7d8eb'
      g.fillRect(48, 82, w - 96, 48)
    })

    t.spriteNotice = createCanvasTexture(140, 120, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#7b5a3b'
      g.fillRect(18, 18, w - 36, h - 44)
      g.fillStyle = '#f1e8cf'
      g.fillRect(24, 24, w - 48, h - 56)
      g.fillStyle = '#c54242'
      g.fillRect(32, 34, 46, 14)
      g.fillStyle = '#4b4f56'
      g.fillRect(88, 34, 18, 14)
      g.fillStyle = '#6e716d'
      for (let y = 58; y < h - 40; y += 10) g.fillRect(32, y, w - 64, 2)
      g.fillStyle = '#635845'
      g.fillRect(46, h - 26, 8, 26)
      g.fillRect(w - 54, h - 26, 8, 26)
    })

    t.spriteBench = createCanvasTexture(180, 88, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#264165'
      g.fillRect(18, 20, w - 36, 18)
      g.fillRect(24, 44, w - 48, 10)
      g.fillStyle = '#1b2230'
      g.fillRect(32, 56, 10, 24)
      g.fillRect(w - 42, 56, 10, 24)
    })

    t.spriteShelf = createCanvasTexture(180, 150, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#707780'
      g.fillRect(18, 8, w - 36, h - 16)
      g.fillStyle = '#5c626a'
      for (let y = 28; y < h - 12; y += 32) g.fillRect(18, y, w - 36, 4)
      const palette = ['#d85c5c', '#7c9cf2', '#f1b75f', '#a1d15f', '#c270df']
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 6; col++) {
          g.fillStyle = palette[(row + col) % palette.length]
          g.fillRect(26 + col * 22, 12 + row * 32, 16, 14 + (col % 2 ? 2 : 0))
        }
      }
      g.fillStyle = '#41464d'
      g.fillRect(28, h - 12, 10, 12)
      g.fillRect(w - 38, h - 12, 10, 12)
    })

    t.spriteCounter = createCanvasTexture(220, 100, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#d4d8dc'
      g.fillRect(8, 16, w - 16, h - 22)
      g.fillStyle = '#b8c0c7'
      g.fillRect(8, 12, w - 16, 10)
      g.fillStyle = '#9aa2aa'
      g.fillRect(18, 32, 48, 36)
      g.fillRect(78, 24, 50, 44)
      g.fillStyle = '#373d47'
      g.fillRect(148, 20, 30, 22)
      g.fillStyle = '#f06d6d'
      g.fillRect(154, 26, 18, 10)
      g.fillStyle = '#505863'
      g.fillRect(186, 20, 12, 12)
      g.fillStyle = '#e4ebf4'
      g.fillRect(184, 34, 16, 10)
      g.fillStyle = '#717983'
      g.fillRect(18, h - 10, w - 36, 10)
    })

    t.spriteMonitor = createCanvasTexture(80, 72, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#2b3137'
      g.fillRect(8, 8, w - 16, h - 18)
      g.fillStyle = '#121417'
      g.fillRect(14, 14, w - 28, h - 30)
      g.fillStyle = '#ff9736'
      g.font = 'bold 10px monospace'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('THANK YOU', w / 2, 28)
      g.fillText('FOR COMING', w / 2, 40)
      g.fillStyle = '#59626d'
      g.fillRect(30, h - 10, 20, 6)
    })

    t.spriteCooler = createCanvasTexture(220, 160, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#dbe2ea'
      g.fillRect(10, 8, w - 20, h - 18)
      g.fillStyle = '#f4f7fb'
      g.fillRect(18, 18, w - 36, h - 40)
      g.strokeStyle = '#6e7c8c'
      g.lineWidth = 4
      g.strokeRect(18, 18, w - 36, h - 40)
      g.beginPath()
      g.moveTo(w / 2, 18)
      g.lineTo(w / 2, h - 22)
      g.stroke()
      const bottleRows = [30, 58, 86]
      const colors = ['#d34d4d', '#f0b351', '#6fb5ff', '#62c976', '#c170e1']
      bottleRows.forEach((yy, idx) => {
        for (let i = 0; i < 8; i++) {
          g.fillStyle = colors[(i + idx) % colors.length]
          g.fillRect(28 + i * 22, yy, 12, 16)
        }
      })
      g.fillStyle = 'rgba(255,255,255,0.32)'
      g.fillRect(28, 26, w - 56, 12)
    })

    t.spriteRack = createCanvasTexture(110, 130, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#cfc5b9'
      g.fillRect(10, 8, w - 20, h - 14)
      g.fillStyle = '#9e8f81'
      g.fillRect(16, 18, w - 32, 6)
      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 3; col++) {
          g.fillStyle = ['#e88a8a', '#f4d576', '#acd9f9', '#b8f0a9', '#e5aef5'][(row + col) % 5]
          g.fillRect(18 + col * 24, 28 + row * 22, 18, 18)
        }
      }
      g.fillStyle = '#796a5b'
      g.fillRect(24, h - 8, 8, 8)
      g.fillRect(w - 32, h - 8, 8, 8)
    })

    t.spriteCar = createCanvasTexture(210, 120, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#c7ced9'
      g.beginPath()
      g.moveTo(26, 70)
      g.lineTo(48, 42)
      g.lineTo(140, 42)
      g.lineTo(168, 70)
      g.closePath()
      g.fill()
      g.fillRect(20, 70, 170, 26)
      g.fillStyle = '#8fb0dc'
      g.fillRect(56, 48, 70, 18)
      g.fillRect(130, 48, 22, 18)
      g.fillStyle = '#1d2129'
      g.beginPath(); g.arc(56, 98, 16, 0, TWO_PI); g.fill()
      g.beginPath(); g.arc(156, 98, 16, 0, TWO_PI); g.fill()
      g.fillStyle = '#2a2f38'
      g.beginPath(); g.arc(56, 98, 8, 0, TWO_PI); g.fill()
      g.beginPath(); g.arc(156, 98, 8, 0, TWO_PI); g.fill()
    })

    t.spriteShrineSign = createCanvasTexture(100, 130, (g, w, h) => {
      g.clearRect(0, 0, w, h)
      g.fillStyle = '#5c4434'
      g.fillRect(40, 20, 20, h - 20)
      g.fillStyle = '#e7dfc4'
      g.fillRect(14, 10, 72, 34)
      g.fillStyle = '#404040'
      g.font = 'bold 14px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText('祠 →', 50, 28)
    })

    return t
  }

  function textureToCanvas(tex) {
    const c = document.createElement('canvas')
    c.width = tex.w
    c.height = tex.h
    const g = c.getContext('2d')
    const img = new ImageData(new Uint8ClampedArray(tex.pixels.buffer.slice(0)), tex.w, tex.h)
    g.putImageData(img, 0, 0)
    return c
  }

  function createWorld() {
    const mapW = 24
    const mapH = 22
    const walls = new Uint8Array(mapW * mapH)
    const floors = new Uint8Array(mapW * mapH)
    const ceilings = new Uint8Array(mapW * mapH)
    const lights = new Uint8Array(mapW * mapH)

    const idx = (x, y) => y * mapW + x
    const setWall = (x, y, v) => { walls[idx(x, y)] = v }
    const setFloor = (x, y, f, c = 0) => { floors[idx(x, y)] = f; ceilings[idx(x, y)] = c }

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        if (x === 0 || y === 0 || x === mapW - 1 || y === mapH - 1) {
          setWall(x, y, 1)
        }
        setFloor(x, y, 6, 0)
      }
    }

    for (let y = 11; y <= 20; y++) {
      for (let x = 6; x <= 17; x++) setFloor(x, y, 1, 0)
    }

    for (let y = 12; y <= 17; y++) {
      setFloor(8, y, 2, 0)
      setFloor(15, y, 3, 0)
      setFloor(11, y, 2, 0)
      setFloor(12, y, 3, 0)
    }

    for (let x = 8; x <= 15; x++) setFloor(x, 10, 4, 2)
    for (let x = 8; x <= 15; x++) setFloor(x, 9, 4, 2)

    for (let y = 5; y <= 10; y++) {
      for (let x = 8; x <= 15; x++) setFloor(x, y, 5, 1)
    }

    for (let x = 7; x <= 16; x++) {
      setWall(x, 4, x >= 8 && x <= 10 ? 2 : 3)
    }
    for (let y = 4; y <= 10; y++) {
      setWall(7, y, y === 10 ? 2 : 3)
      setWall(16, y, y === 10 ? 2 : 3)
    }
    setWall(8, 10, 2)
    setWall(15, 10, 2)

    for (let y = 6; y <= 12; y++) {
      setWall(19, y, 4)
      setWall(22, y, 4)
    }
    for (let x = 19; x <= 22; x++) {
      setWall(x, 6, 4)
      setWall(x, 12, 4)
    }
    for (let y = 7; y <= 11; y++) {
      for (let x = 20; x <= 21; x++) setFloor(x, y, 4, 2)
    }

    setWall(4, 13, 2)
    setWall(4, 14, 2)
    setWall(4, 15, 2)
    setFloor(4, 13, 7, 0)
    setFloor(5, 13, 7, 0)
    setFloor(4, 14, 7, 0)
    setFloor(5, 14, 7, 0)
    setFloor(4, 15, 7, 0)
    setFloor(5, 15, 7, 0)
    setFloor(6, 14, 4, 0)

    for (let y = 2; y <= 9; y++) {
      setFloor(3, y, 6, 0)
      setFloor(4, y, 6, 0)
    }

    const lightSources = [
      { x: 11.5, y: 10.3, intensity: 0.72, radius: 5.5 },
      { x: 10.8, y: 7.2, intensity: 0.25, radius: 4.6 },
      { x: 17.8, y: 12.6, intensity: 0.34, radius: 3.8 },
      { x: 5.0, y: 13.5, intensity: 0.24, radius: 3.4 },
      { x: 18.4, y: 9.0, intensity: 0.22, radius: 3.0 },
    ]

    for (let y = 0; y < mapH; y++) {
      for (let x = 0; x < mapW; x++) {
        const i = idx(x, y)
        const insideStore = x >= 8 && x <= 15 && y >= 5 && y <= 10
        const underCanopy = x >= 8 && x <= 15 && (y === 9 || y === 10)
        let ambient = insideStore ? 0.78 : underCanopy ? 0.48 : floors[i] === 6 ? 0.12 : 0.18
        const cx = x + 0.5
        const cy = y + 0.5
        for (const light of lightSources) {
          const dx = cx - light.x
          const dy = cy - light.y
          const dist = Math.hypot(dx, dy)
          if (dist < light.radius) {
            ambient += (1 - dist / light.radius) * light.intensity
          }
        }
        lights[i] = clamp((ambient * 255) | 0, 20, 255)
      }
    }

    const sprites = [
      { id: 'sign', texture: 'spriteSign', x: 11.5, y: 9.95, sizeX: 6.8, sizeY: 0.9, baseZ: 2.12, collidable: false },
      { id: 'glassL', texture: 'spriteGlass', x: 9.55, y: 10.05, sizeX: 2.0, sizeY: 2.26, baseZ: 0.08, collidable: true, radius: 0.42 },
      { id: 'glassR', texture: 'spriteGlass', x: 13.45, y: 10.05, sizeX: 2.0, sizeY: 2.26, baseZ: 0.08, collidable: true, radius: 0.42 },
      { id: 'door', texture: 'spriteDoor', x: 11.5, y: 10.02, sizeX: 1.92, sizeY: 2.42, baseZ: 0, collidable: false },
      { id: 'pole1', texture: 'spritePole', x: 16.9, y: 11.8, sizeX: 0.32, sizeY: 3.8, baseZ: 0, collidable: true, radius: 0.12 },
      { id: 'pole2', texture: 'spritePole', x: 6.8, y: 13.2, sizeX: 0.32, sizeY: 3.8, baseZ: 0, collidable: true, radius: 0.12 },
      { id: 'pole3', texture: 'spritePole', x: 18.6, y: 8.8, sizeX: 0.32, sizeY: 3.6, baseZ: 0, collidable: true, radius: 0.12 },
      { id: 'vending', texture: 'spriteVending', x: 18.2, y: 12.3, sizeX: 1.02, sizeY: 2.24, baseZ: 0, collidable: true, radius: 0.34 },
      { id: 'phone', texture: 'spritePhone', x: 18.7, y: 14.7, sizeX: 1.18, sizeY: 2.38, baseZ: 0, collidable: true, radius: 0.45 },
      { id: 'notice', texture: 'spriteNotice', x: 5.2, y: 12.7, sizeX: 1.4, sizeY: 1.28, baseZ: 0, collidable: true, radius: 0.26 },
      { id: 'bench', texture: 'spriteBench', x: 4.95, y: 14.55, sizeX: 1.6, sizeY: 0.72, baseZ: 0, collidable: true, radius: 0.36 },
      { id: 'car', texture: 'spriteCar', x: 14.9, y: 16.15, sizeX: 2.35, sizeY: 1.34, baseZ: 0, collidable: true, radius: 0.78 },
      { id: 'shrineSign', texture: 'spriteShrineSign', x: 6.55, y: 18.35, sizeX: 0.8, sizeY: 1.52, baseZ: 0, collidable: false },
      { id: 'shelf1', texture: 'spriteShelf', x: 11.05, y: 7.7, sizeX: 1.58, sizeY: 1.5, baseZ: 0, collidable: true, radius: 0.42 },
      { id: 'shelf2', texture: 'spriteShelf', x: 13.12, y: 7.45, sizeX: 1.58, sizeY: 1.5, baseZ: 0, collidable: true, radius: 0.42 },
      { id: 'counter', texture: 'spriteCounter', x: 13.4, y: 5.82, sizeX: 2.4, sizeY: 1.02, baseZ: 0, collidable: true, radius: 0.54, interactable: 'register', name: 'レジ周辺' },
      { id: 'monitor', texture: 'spriteMonitor', x: 13.95, y: 5.35, sizeX: 0.56, sizeY: 0.54, baseZ: 1.08, collidable: false },
      { id: 'cooler', texture: 'spriteCooler', x: 9.28, y: 5.2, sizeX: 2.58, sizeY: 2.12, baseZ: 0, collidable: true, radius: 0.56, interactable: 'fridge', name: '冷蔵ケース' },
      { id: 'rack', texture: 'spriteRack', x: 14.85, y: 8.85, sizeX: 0.95, sizeY: 1.26, baseZ: 0, collidable: true, radius: 0.22 },
    ]

    const wires = [
      [{ x: 6.8, y: 13.2, z: 3.2 }, { x: 16.9, y: 11.8, z: 3.15 }],
      [{ x: 16.9, y: 11.8, z: 3.15 }, { x: 18.6, y: 8.8, z: 2.95 }],
      [{ x: 6.8, y: 13.2, z: 2.75 }, { x: 16.9, y: 11.8, z: 2.7 }],
    ]

    return { mapW, mapH, walls, floors, ceilings, lights, sprites, wires, idx }
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
    if (x < 0 || y < 0 || x >= world.mapW || y >= world.mapH) return 0.1
    return world.lights[world.idx(x, y)] / 255
  }

  function init() {
    ctx.imageSmoothingEnabled = false
    applySettingsToUI()
    bindUI()
    resize()
    showMessage('夜道の先の店へ。冷蔵ケースを調べて飲み物を取り、レジ周辺まで進んでください。', 4.2)
    setTimeout(() => hintEl.classList.add('faded'), 5200)
    requestAnimationFrame(loop)
  }

  function applySettingsToUI() {
    scanlineOverlay.style.display = state.scanline ? 'block' : 'none'
    scanlineToggle.textContent = state.scanline ? 'ON' : 'OFF'
    qualityToggle.textContent = state.quality.toUpperCase()
    sensitivityToggle.textContent = `${state.sensitivity.toFixed(2).replace(/\.00$/, '')}x`
    runToggle.textContent = `走る: ${state.run ? 'ON' : 'OFF'}`
    heldItemEl.classList.toggle('hidden', !state.inventory.drink)
    document.documentElement.style.setProperty('--scanline-opacity', state.scanline ? '0.22' : '0')
  }

  function bindUI() {
    window.addEventListener('resize', resize)
    window.addEventListener('orientationchange', resize)
    document.addEventListener('visibilitychange', () => { state.lastFrame = 0 })

    menuBtn.addEventListener('click', () => {
      menuPanel.classList.toggle('hidden')
      const expanded = !menuPanel.classList.contains('hidden')
      menuBtn.setAttribute('aria-expanded', expanded ? 'true' : 'false')
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
      const i = sensitivityProfiles.indexOf(state.sensitivity)
      state.sensitivity = sensitivityProfiles[(i + 1) % sensitivityProfiles.length]
      applySettingsToUI()
      saveSettings()
    })

    runToggle.addEventListener('click', () => {
      state.run = !state.run
      applySettingsToUI()
    })

    interactBtn.addEventListener('click', tryInteract)
    interactBtn.addEventListener('touchend', (ev) => {
      ev.preventDefault()
      tryInteract()
    }, { passive: false })

    itemPickupEl.querySelectorAll('.pickup-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        pickDrink(btn.dataset.item)
      })
    })

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
    state.renderW = Math.max(160, ((state.width * scale) | 0))
    state.renderH = Math.max(284, ((state.height * scale) | 0))
    offscreen.width = state.renderW
    offscreen.height = state.renderH
    offCtx = offscreen.getContext('2d', { alpha: false })
    state.imageData = offCtx.createImageData(state.renderW, state.renderH)
    state.pixels = new Uint32Array(state.imageData.data.buffer)
    state.depthBuffer = new Float32Array(state.renderW)
    state.horizon = (state.renderH / 2) | 0
    state.lastFrame = 0
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

  function onStickMove(ev) {
    if (!input.stickActive || ev.pointerId !== input.stickId) return
    updateStick(ev.clientX, ev.clientY)
  }

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
    const max = 36
    const len = Math.hypot(dx, dy)
    const nx = len > max ? dx / len : dx / max
    const ny = len > max ? dy / len : dy / max
    input.joyX = clamp(nx, -1, 1)
    input.joyY = clamp(ny, -1, 1)
    const drawX = clamp(dx, -max, max)
    const drawY = clamp(dy, -max, max)
    joystickStick.style.transform = `translate(${drawX}px, ${drawY}px)`
  }

  function onLookStart(ev) {
    if (state.selectionOpen) return
    if (input.lookActive || ev.clientX < state.width * 0.45) return
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
    player.pitch = clamp(player.pitch + dy * 0.35 * state.sensitivity, -state.renderH * 0.07, state.renderH * 0.09)
  }

  function onLookEnd(ev) {
    if (!input.lookActive || ev.pointerId !== input.lookId) return
    input.lookActive = false
    input.lookId = null
  }

  function loop(ts) {
    requestAnimationFrame(loop)
    if (!state.lastFrame) state.lastFrame = ts
    const dt = Math.min(MAX_DT, (ts - state.lastFrame) / 1000)
    state.lastFrame = ts
    update(dt)
    render()
  }

  function update(dt) {
    if (state.selectionOpen) return

    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    const planeScale = Math.tan(FOV / 2)
    const rightX = -dirY
    const rightY = dirX
    let mx = input.joyX
    let my = input.joyY
    const dead = 0.08
    if (Math.abs(mx) < dead) mx = 0
    if (Math.abs(my) < dead) my = 0

    let moveX = 0
    let moveY = 0

    if (mx !== 0 || my !== 0) {
      const forward = -my
      const strafe = mx
      moveX = dirX * forward + rightX * strafe
      moveY = dirY * forward + rightY * strafe
      const len = Math.hypot(moveX, moveY) || 1
      moveX /= len
      moveY /= len
      const speed = state.run ? 3.15 : 2.2
      tryMove(moveX * speed * dt, moveY * speed * dt)
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
      if (!s.collidable || !s.radius) continue
      const dist = Math.hypot(x - s.x, y - s.y)
      if (dist < radius + s.radius) return true
    }
    return false
  }

  function updateInteractionTarget() {
    let best = null
    let bestScore = -Infinity
    const dirX = Math.cos(player.dir)
    const dirY = Math.sin(player.dir)
    for (const s of world.sprites) {
      if (!s.interactable) continue
      const dx = s.x - player.x
      const dy = s.y - player.y
      const dist = Math.hypot(dx, dy)
      if (dist > 1.4) continue
      const dot = (dx / dist) * dirX + (dy / dist) * dirY
      if (dot < 0.82) continue
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
    if (state.selectionOpen) return
    const target = state.currentTarget
    if (!target) return
    if (target.interactable === 'fridge') {
      if (state.inventory.drink) {
        showMessage('すでに飲み物を持っている。レジ周辺を調べてみよう。', 2.8)
        return
      }
      state.selectionOpen = true
      itemPickupEl.classList.remove('hidden')
      interactBtn.disabled = true
      showMessage('冷たい飲み物が並んでいる。一本選ぶ。', 2.4)
    } else if (target.interactable === 'register') {
      if (!state.inventory.drink) {
        showMessage('無人のレジ。小さなモニターに 22:46 の時刻が残っている。先に冷蔵ケースを調べよう。', 3.8)
      } else {
        showMessage('レジは無人のまま。古いモニターには “THANK YOU FOR COMING” が固定表示されている。', 4.2)
      }
    }
  }

  function pickDrink(type) {
    state.inventory.drink = type
    state.selectionOpen = false
    itemPickupEl.classList.add('hidden')
    heldItemEl.classList.remove('hidden')
    heldItemEl.dataset.item = type
    if (type === 'tea') {
      heldItemEl.querySelector('.bottle').style.filter = 'hue-rotate(40deg) saturate(0.95)'
    } else if (type === 'cola') {
      heldItemEl.querySelector('.bottle').style.filter = 'hue-rotate(-40deg) saturate(1.15)'
    } else {
      heldItemEl.querySelector('.bottle').style.filter = 'none'
    }
    updateInteractionTarget()
    showMessage('手に冷えたボトルの重みが乗る。レジ周辺を調べてみよう。', 3.2)
  }

  function showMessage(text, duration = 3) {
    messageEl.textContent = text
    messageEl.classList.remove('hidden')
    clearTimeout(state.hudMessageTimer)
    state.hudMessageTimer = setTimeout(() => messageEl.classList.add('hidden'), duration * 1000)
  }

  function getFloorTexture(type) {
    switch (type) {
      case 1: return textures.floorRoad
      case 2: return textures.floorParkingLeft
      case 3: return textures.floorParkingRight
      case 4: return textures.floorSidewalk
      case 5: return textures.floorTile
      case 7: return textures.floorBridge
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
      case 1: return textures.wallExterior
      case 2: return textures.wallDark
      case 3: return textures.wallShopSide
      case 4: return textures.wallClosedShop
      default: return textures.wallExterior
    }
  }

  function render() {
    const w = state.renderW
    const h = state.renderH
    const pixels = state.pixels
    const horizon = ((h / 2) + player.pitch) | 0
    const halfH = h / 2

    renderSky(pixels, w, h, horizon)
    renderFloorAndCeiling(pixels, w, h, horizon)
    renderWalls(pixels, w, h, horizon)
    renderSprites(pixels, w, h, horizon)
    renderWires(pixels, w, h)

    offCtx.putImageData(state.imageData, 0, 0)
    ctx.clearRect(0, 0, state.width, state.height)
    ctx.imageSmoothingEnabled = true
    ctx.drawImage(offscreen, 0, 0, state.width, state.height)
  }

  function renderSky(pixels, w, h, horizon) {
    const sky = skyTexture
    const upper = clamp(horizon, 0, h)
    for (let x = 0; x < w; x++) {
      const rayAngle = player.dir - FOV / 2 + (x / w) * FOV
      let sx = (((rayAngle / TWO_PI) % 1 + 1) % 1) * sky.w
      sx = sx | 0
      for (let y = 0; y < upper; y++) {
        const v = clamp((y / Math.max(upper, 1)) * 0.94 + (player.pitch / h) * 0.1, 0, 0.98)
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
    const maxDist = 18

    for (let y = horizon + 1; y < h; y++) {
      const p = y - horizon
      const rowDistance = posZ / p
      let floorX = player.x + rowDistance * rayDirX0
      let floorY = player.y + rowDistance * rayDirY0
      const stepX = (rowDistance * (rayDirX1 - rayDirX0)) / w
      const stepY = (rowDistance * (rayDirY1 - rayDirY0)) / w
      const fog = 1 - smoothstep(5, maxDist, rowDistance)
      for (let x = 0; x < w; x++) {
        const cellX = floorX | 0
        const cellY = floorY | 0
        const tex = getFloorTexture(getFloorType(cellX, cellY))
        const tx = ((tex.w * (floorX - cellX)) | 0) & (tex.w - 1)
        const ty = ((tex.h * (floorY - cellY)) | 0) & (tex.h - 1)
        const color = tex.pixels[ty * tex.w + tx]
        const light = getLightValue(cellX, cellY)
        const shade = clamp(light * (0.4 + fog * 0.8), 0.12, 1)
        pixels[y * w + x] = shadeColor(color, shade)
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
      const fog = 1 - smoothstep(3, 10, rowDistance)
      for (let x = 0; x < w; x++) {
        const cellX = floorX | 0
        const cellY = floorY | 0
        const ceilType = getCeilType(cellX, cellY)
        if (ceilType) {
          const tex = getCeilingTexture(ceilType)
          const tx = ((tex.w * (floorX - cellX)) | 0) & (tex.w - 1)
          const ty = ((tex.h * (floorY - cellY)) | 0) & (tex.h - 1)
          const color = tex.pixels[ty * tex.w + tx]
          const light = getLightValue(cellX, cellY)
          const shade = clamp(light * (0.48 + fog * 0.55), 0.22, 1)
          pixels[y * w + x] = shadeColor(color, shade)
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
    const maxDist = 20

    for (let x = 0; x < w; x++) {
      const cameraX = 2 * x / w - 1
      const rayDirX = dirX + planeX * cameraX
      const rayDirY = dirY + planeY * cameraX
      let mapX = player.x | 0
      let mapY = player.y | 0

      const deltaDistX = rayDirX === 0 ? 1e30 : Math.abs(1 / rayDirX)
      const deltaDistY = rayDirY === 0 ? 1e30 : Math.abs(1 / rayDirY)
      let sideDistX
      let sideDistY
      let stepX
      let stepY
      let hit = 0
      let side = 0

      if (rayDirX < 0) {
        stepX = -1
        sideDistX = (player.x - mapX) * deltaDistX
      } else {
        stepX = 1
        sideDistX = (mapX + 1 - player.x) * deltaDistX
      }
      if (rayDirY < 0) {
        stepY = -1
        sideDistY = (player.y - mapY) * deltaDistY
      } else {
        stepY = 1
        sideDistY = (mapY + 1 - player.y) * deltaDistY
      }

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
      const baseLight = getLightValue(mapX - (side === 0 ? stepX : 0), mapY - (side === 1 ? stepY : 0))
      const fog = 1 - smoothstep(2.5, maxDist, perpDist)
      const shadeBase = clamp(baseLight * (side ? 0.85 : 1) * (0.35 + fog * 0.85), 0.12, 1)

      for (let y = drawStart; y <= drawEnd; y++) {
        const texY = (texPos | 0) & (tex.h - 1)
        texPos += step
        const color = tex.pixels[texY * tex.w + texX]
        pixels[y * w + x] = shadeColor(color, shadeBase)
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
      const light = clamp(getLightValue(s.x | 0, s.y | 0) * (0.4 + (1 - smoothstep(2, 18, transformY)) * 0.9), 0.15, 1)

      for (let stripe = startX; stripe <= endX; stripe++) {
        if (transformY >= state.depthBuffer[stripe]) continue
        const texX = (((stripe - (screenX - spriteW / 2)) / spriteW) * tex.w) | 0
        if (texX < 0 || texX >= tex.w) continue
        for (let y = drawStartY; y <= drawEndY; y++) {
          const texY = (((y - drawStartY) / Math.max(drawEndY - drawStartY, 1)) * tex.h) | 0
          const src = shadeColor(tex.pixels[texY * tex.w + texX], light)
          const a = (src >>> 24) & 255
          if (a <= 4) continue
          const index = y * w + stripe
          pixels[index] = a >= 250 ? src : blendPixel(pixels[index], src)
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
    return {
      x: (w / 2) * (1 + transformX / transformY),
      y: (h / 2 + player.pitch) - (z - CAMERA_HEIGHT) * proj,
      depth: transformY,
    }
  }

  function drawLineOnBuffer(pixels, w, h, x0, y0, x1, y1, color) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0
    let dx = Math.abs(x1 - x0)
    let sx = x0 < x1 ? 1 : -1
    let dy = -Math.abs(y1 - y0)
    let sy = y0 < y1 ? 1 : -1
    let err = dx + dy

    while (true) {
      if (x0 >= 0 && x0 < w && y0 >= 0 && y0 < h) pixels[y0 * w + x0] = color
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
      const alpha = clamp(1 - smoothstep(2, 16, Math.min(pa.depth, pb.depth)), 0.12, 0.55)
      const color = rgba(40, 39, 46, (alpha * 255) | 0)
      drawLineOnBuffer(pixels, w, h, pa.x, pa.y, pb.x, pb.y, color)
      const color2 = rgba(76, 69, 60, (alpha * 120) | 0)
      drawLineOnBuffer(pixels, w, h, pa.x, pa.y + 1, pb.x, pb.y + 1, color2)
    }
  }

  init()
})()
