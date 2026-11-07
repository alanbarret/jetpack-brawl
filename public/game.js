// public/game.js — Three.js client: loading, menu, rendering, input, prediction, interpolation, HUD
import * as THREE from 'three';
import { CFG, WEAPONS, MAP, MAPS, MAP_IDS, stepPlayer, aimDir, rayWorld, rayBox, hitboxes } from './shared.js';
import { makeSoldier, setWeapon, animateSoldier, kickRecoil, flashMuzzle, swingMelee, muzzleWorld, setBlink, makeWeaponModel } from './models.js';

// ---------- helpers
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const lerpAng = (a, b, k) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return a + d * k; };
const fmt = (ms) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const setHTML = (el, h) => { if (el._h !== h) { el.innerHTML = h; el._h = h; } };
const wName = (id) => WEAPONS[id]?.name || { melee: 'Melee', grenade: 'Grenade', void: 'Void' }[id] || id;
const isTouch = matchMedia('(pointer: coarse)').matches;
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone;
const frameWait = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 25)));

// ---------- settings (persisted)
const store = {
  get(k, d) { try { const v = localStorage.getItem('jb2_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jb2_' + k, JSON.stringify(v)); } catch {} },
};
const settings = {
  sens: store.get('sens', 1), vol: store.get('vol', 0.8), shadows: store.get('shadows', !isTouch),
  map: store.get('map', 'outpost'), bots: store.get('bots', 5), diff: store.get('diff', 'normal'), name: store.get('name', ''),
};
const SENS = 0.0022;

// ---------- state
let ws = null, pingTimer = 0, myId = null, roomCode = '', connected = false, synced = false, wantLeave = false, soloMatch = false;
let timeOffset = 0, rtt = 0;
const serverNow = () => Date.now() + timeOffset;
const local = { pos: [0, 0, 0], vel: [0, 0, 0], onGround: false, fuel: 1, groundTime: 0, hoverArmed: false, pj: false, air: 0, thrusting: false };
let prevPos = [0, 0, 0], renderOffset = [0, 0, 0];
let me = null, state = 'playing', timeLeft = 0, timeLeftAt = 0, reloadEnd = 0, respawnEnd = 0;
let yaw = 0, pitch = 0, aimYaw = 0, aimPitch = 0, aimTarget = [0, 0, -10];
let seq = 0; const pending = [];
let zoom = false, mouseDown = false, chatOpen = false, boardOpen = false, paused = false, lastWheel = 0;
let shake = 0, hitT = 0, dmgT = 0, dmgDirT = 0, dmgAngle = 0, localNextFire = 0;
const keys = {}; const touch = { mx: 0, mz: 0, fire: false, jet: false, down: false, sp: false };
const roster = new Map(), remotes = new Map(), pickMeshes = new Map(), projMeshes = new Map(), fx = [];
let myMesh = null, showcase = null, inMenu = true, booted = false;

// ---------- loading screen
const TIPS = [
  'Jump off a high ledge — your jetpack fires on its own and slows the fall.',
  'Hold JET to climb, hold ▼ / C to drop back down.',
  'Headshots deal 80% extra damage.',
  'Sneak up behind someone: a melee backstab is an instant kill.',
  'Grab a weapon pickup and press E to swap for it.',
  'Five maps: try the Deep Mine’s low ceiling or the Canyon’s cliff nests.',
  'Shields soak up 60% of incoming damage.',
  'Hold JET to climb above a ledge, then drop a grenade on campers.',
];
function setProgress(p, msg) { $('lbar').style.width = p + '%'; if (msg) $('lstatus').textContent = msg; }
let tipI = Math.floor(Math.random() * TIPS.length);
const tipTimer = setInterval(() => { $('ltip').textContent = TIPS[tipI++ % TIPS.length]; }, 3200);
$('ltip').textContent = TIPS[tipI++ % TIPS.length];

// ---------- three.js setup
const renderer = new THREE.WebGLRenderer({ antialias: !isTouch, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = settings.shadows; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const cv = renderer.domElement;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 500);
const hemi = new THREE.HemisphereLight('#ffffff', '#556644', 1.3); scene.add(hemi);
let MAPC = MAP;   // the map of the match we are in (menu backdrop is always the default map)
const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
sun.position.set(30, 50, 20); sun.castShadow = settings.shadows; sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 });
scene.add(sun);
function onResize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); }
addEventListener('resize', onResize); addEventListener('orientationchange', () => setTimeout(onResize, 200));
function setShadows(on) {
  settings.shadows = on; store.set('shadows', on);
  renderer.shadowMap.enabled = on; sun.castShadow = on;
  scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
}

let skyGroup = null, arenaGroup = null, skyTex = null, visualMapId = null;
function disposeGroup(g) {
  if (!g) return; scene.remove(g);
  g.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.map && m.map !== arenaTex) m.map.dispose(); m.dispose(); }
  });
}
function applyTheme(map) {
  const t = map.theme;
  hemi.color.set(t.hemi[0]); hemi.groundColor.set(t.hemi[1]); hemi.intensity = t.hemi[2];
  sun.color.set(t.sun[0]); sun.intensity = t.sun[1]; sun.position.set(...t.sun[2]);
  const half = Math.max(map.w, map.d) / 2 + 8;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
}
function buildSky(map) {
  disposeGroup(skyGroup); skyTex?.dispose();
  const t = map.theme;
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, t.sky[0]); g.addColorStop(0.55, t.sky[1]); g.addColorStop(1, t.sky[2]);
  x.fillStyle = g; x.fillRect(0, 0, 2, 256);
  skyTex = new THREE.CanvasTexture(c); skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex; scene.fog = new THREE.Fog(t.fog[0], t.fog[1], t.fog[2]);
  skyGroup = new THREE.Group(); scene.add(skyGroup);
  const base = Math.max(map.w, map.d) / 2 + 80, rnd = Math.random;
  const mat = new THREE.MeshStandardMaterial({ color: t.propColor, roughness: 1, flatShading: true });
  if (t.props === 'mountains' || t.props === 'snowpeaks') {
    const snow = t.props === 'snowpeaks';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rnd() * 0.2, r = base + rnd() * 25, h = snow ? 40 + rnd() * 45 : 24 + rnd() * 34;
      const m = new THREE.Mesh(new THREE.ConeGeometry(snow ? 14 + rnd() * 12 : 18 + rnd() * 16, h, snow ? 5 : 6), mat);
      m.position.set(Math.cos(a) * r, h / 2 - 2, Math.sin(a) * r); skyGroup.add(m);
    }
  } else if (t.props === 'mesas') {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + rnd() * 0.2, r = base + rnd() * 30, h = 40 + rnd() * 40, rb = 14 + rnd() * 12;
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rb * 0.75, rb, h, 7), mat);
      m.position.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r); skyGroup.add(m);
    }
  } else if (t.props === 'clouds') {
    const cm = new THREE.MeshBasicMaterial({ color: t.propColor, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 30; i++) {
      const a = rnd() * Math.PI * 2, r = 60 + rnd() * 90, s = 8 + rnd() * 16;
      const m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 8), cm);
      m.scale.set(1.4, 0.38, 1); m.position.set(Math.cos(a) * r, -18 + rnd() * 70, Math.sin(a) * r); skyGroup.add(m);
    }
  }
}

let arenaTex = null;
function arenaTexture() {
  if (arenaTex) return arenaTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#dcdcdc'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1100; i++) { const v = 165 + (Math.random() * 80 | 0); x.fillStyle = `rgb(${v},${v},${v})`; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
  x.strokeStyle = 'rgba(0,0,0,.22)'; x.lineWidth = 2; x.strokeRect(1, 1, 126, 126);
  arenaTex = new THREE.CanvasTexture(c);
  arenaTex.wrapS = arenaTex.wrapT = THREE.RepeatWrapping; arenaTex.colorSpace = THREE.SRGBColorSpace; arenaTex.anisotropy = 4;
  return arenaTex;
}
function boxGeo(sx, sy, sz, tile = 3) {
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const k = f * 4 + i; uv.setXY(k, uv.getX(k) * dims[f][0] / tile, uv.getY(k) * dims[f][1] / tile); }
  return g;
}
function buildArena(map) {
  disposeGroup(arenaGroup);
  arenaGroup = new THREE.Group(); scene.add(arenaGroup);
  const mats = new Map(), tex = arenaTexture();
  const edge = new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 });
  for (const b of map.boxes) {
    if (!b.c) continue;
    const s = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
    if (!mats.has(b.c)) mats.set(b.c, new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.9, map: tex }));
    const m = new THREE.Mesh(boxGeo(...s), mats.get(b.c));
    m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
    m.castShadow = m.receiveShadow = true; arenaGroup.add(m);
    if (Math.max(...s) < 60) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(...s)), edge));
  }
  const lamps = isTouch ? map.lamps.slice(0, 4) : map.lamps;     // lamp light (Deep Mine)
  for (const [x, y, z] of lamps) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffd9a0' }));
    bulb.position.set(x, y, z);
    const l = new THREE.PointLight('#ffb35c', 110, 46, 2); bulb.add(l);
    arenaGroup.add(bulb);
  }
}
// Swap the whole scenery (boxes, sky, fog, lights) to another map.
function loadMapVisuals(map) {
  if (visualMapId === map.id) return;
  visualMapId = map.id;
  applyTheme(map); buildArena(map); buildSky(map);
}

function makeLabel(text, color, scale = 1, y = 2.3) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px system-ui,sans-serif'; x.textAlign = 'center';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(text, 128, 42);
  x.fillStyle = color; x.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  s.scale.set(2 * scale, 0.5 * scale, 1); s.position.y = y;
  return s;
}
function makeHpBar() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 20;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sp.scale.set(1.5, 0.234, 1);
  sp.userData = { c, x: c.getContext('2d'), key: -1 };
  return sp;
}
function drawHpBar(sp, hp, ar) {
  const key = hp * 1000 + ar, u = sp.userData;
  if (u.key === key) return; u.key = key;
  const x = u.x, W = 128, H = 20, f = Math.max(0, Math.min(1, hp / 100));
  x.clearRect(0, 0, W, H);
  x.fillStyle = 'rgba(0,0,0,.78)'; x.fillRect(0, 0, W, H);
  x.fillStyle = 'rgba(70,70,70,.9)'; x.fillRect(3, 3, W - 6, H - 6);
  x.fillStyle = f > 0.6 ? '#4fd45a' : f > 0.3 ? '#f0c530' : '#ee4040';
  x.fillRect(3, 3, (W - 6) * f, H - 6);
  x.fillStyle = 'rgba(255,255,255,.28)'; x.fillRect(3, 3, (W - 6) * f, 4);          // gloss
  if (ar > 0) { x.fillStyle = '#4aa8ff'; x.fillRect(3, H - 7, (W - 6) * Math.min(1, ar / 100), 4); }   // armour strip
  x.fillStyle = 'rgba(0,0,0,.55)';
  for (let i = 1; i < 4; i++) x.fillRect(3 + ((W - 6) * i) / 4 - 1, 3, 2, H - 6);   // quarter ticks
  sp.material.map.needsUpdate = true;
}
function makePickup(type, w) {
  const em = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45 });
  let m;
  if (type === 'weapon') {
    m = new THREE.Group();
    const g = makeWeaponModel(w); g.scale.setScalar(1.25); g.rotation.y = Math.PI / 2; g.position.x = WEAPONS[w].len * 0.5; m.add(g);
    m.add(makeLabel(WEAPONS[w].name, '#fff', 0.6, 0.7));
  } else if (type === 'health') {
    m = new THREE.Group(); const mt = em('#ff3344');
    m.add(new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.2), mt), new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.2), mt));
  } else if (type === 'shield') m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), em('#4488ff'));
  else m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), em('#55aa44'));
  return m;
}
function makeRemote(id) {
  const info = roster.get(id);
  const mesh = makeSoldier(info?.color || '#aaaaaa');
  const r = { id, mesh, bar: makeHpBar(), hp: 100, ar: 0, buf: [], alive: false, name: null, label: null, wid: '', prot: false, jet: false, rp: null, lp: null, vx: 0, vy: 0, vz: 0 };
  if (info) { r.label = makeLabel(info.name, info.color); mesh.add(r.label); r.name = info.name; }
  mesh.add(r.bar); scene.add(mesh); remotes.set(id, r);
  return r;
}

// ---------- effects
function tracer(a, b, color) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l); fx.push({ o: l, life: 0.12, max: 0.12, kind: 'fade', op: 0.9 });
}
function spark(p, color = '#ffd27a') {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 5), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  m.position.set(...p); scene.add(m); fx.push({ o: m, life: 0.18, max: 0.18, kind: 'spark', op: 0.9 });
}
function explosion(p, r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffaa33', transparent: true, opacity: 0.9 }));
  m.position.set(...p); scene.add(m); fx.push({ o: m, life: 0.45, max: 0.45, kind: 'boom', r, op: 0.9 });
  const s = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: '#3a3a3a', transparent: true, opacity: 0.5 }));
  s.position.set(p[0], p[1] + 0.6, p[2]); scene.add(s); fx.push({ o: s, life: 1.1, max: 1.1, kind: 'boom', r: r * 0.9, op: 0.5 });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    const k = 1 - f.life / f.max;
    if (f.kind === 'boom') f.o.scale.setScalar(0.5 + k * f.r);
    else if (f.kind === 'spark') f.o.scale.setScalar(1 + k * 2);
    f.o.material.opacity = f.op * (1 - k);
    if (f.life <= 0) { scene.remove(f.o); f.o.geometry.dispose(); f.o.material.dispose(); fx.splice(i, 1); }
  }
}

// ---------- audio (synthesised, no files needed)
let actx = null, noiseBuf = null;
function initAudio() {
  if (actx) { actx.resume?.(); return; }
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}
function sfx(kind, vol = 1) {
  vol *= settings.vol;
  if (!actx || vol <= 0.02) return;
  const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
  const env = (peak, dur) => { g.gain.setValueAtTime(peak * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); };
  const noise = (dur, type, freq) => { const s = actx.createBufferSource(); s.buffer = noiseBuf; const f = actx.createBiquadFilter(); f.type = type; f.frequency.value = freq; s.connect(f); f.connect(g); s.start(t); s.stop(t + dur); };
  const tone = (f0, f1, dur, type = 'sine') => { const o = actx.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur); o.connect(g); o.start(t); o.stop(t + dur); };
  switch (kind) {
    case 'shot': env(0.25, 0.12); noise(0.12, 'bandpass', 1800); break;
    case 'heavy': env(0.4, 0.3); noise(0.3, 'lowpass', 900); break;
    case 'boom': env(0.8, 0.9); noise(0.9, 'lowpass', 400); break;
    case 'hit': env(0.2, 0.06); tone(1200, 900, 0.06, 'square'); break;
    case 'hurt': env(0.25, 0.15); tone(200, 90, 0.15, 'sawtooth'); break;
    case 'pick': env(0.2, 0.15); tone(600, 1300, 0.15); break;
    case 'melee': env(0.3, 0.08); noise(0.08, 'highpass', 2500); break;
    case 'ui': env(0.15, 0.07); tone(700, 500, 0.07, 'square'); break;
  }
}
const sfxAt = (kind, p) => sfx(kind, Math.max(0, 1 - len(sub(p, local.pos)) / 70));

// ---------- fullscreen / orientation
let wakeLock = null;
async function goFullscreen() {
  const el = document.documentElement;
  try { if (!document.fullscreenElement && !document.webkitFullscreenElement) await (el.requestFullscreen || el.webkitRequestFullscreen)?.call(el, { navigationUI: 'hide' }); } catch {}
  try { await screen.orientation?.lock?.('landscape'); } catch {}
  try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {}
}
function toggleFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
  else goFullscreen();
}
document.addEventListener('visibilitychange', async () => { if (!document.hidden && connected) { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} } });

// ---------- networking
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const sendAct = (a) => send({ type: 'a', a });
const showConn = (msg) => { $('connmsg').textContent = msg; $('conn').style.display = 'flex'; };
const hideConn = () => { $('conn').style.display = 'none'; };
function showStatus(msg) { hideConn(); $('statusmsg').textContent = msg; $('status').style.display = 'flex'; document.exitPointerLock?.(); }

function connect(name, opts) {
  wantLeave = false; showConn(opts.solo ? 'Starting solo match…' : 'Connecting…');
  openSocket(name, opts, 0);
}
function openSocket(name, opts, attempt) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const sock = new WebSocket(`${proto}://${location.host}`);
  ws = sock;
  let opened = false, welcomed = false;
  const timer = setTimeout(() => { if (!opened) { try { sock.close(); } catch {} } }, 15000);
  sock.onopen = () => {
    opened = true; clearTimeout(timer);
    send({ type: 'join', name, room: opts.room || '', solo: !!opts.solo, bots: opts.bots, diff: opts.diff, map: opts.map });
    send({ type: 'ping', c: Date.now() });
    clearInterval(pingTimer); pingTimer = setInterval(() => send({ type: 'ping', c: Date.now() }), 2000);
  };
  sock.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === 'welcome') welcomed = true; onMessage(m); };
  sock.onclose = () => {
    clearTimeout(timer); clearInterval(pingTimer);
    if (sock !== ws || wantLeave) return;
    connected = false;
    if (!welcomed && attempt < 5) {
      showConn(attempt >= 1 ? 'Waking up the server… (free hosting can take up to a minute)' : 'Connecting…');
      setTimeout(() => { if (!wantLeave && sock === ws) openSocket(name, opts, attempt + 1); }, 2500);
      return;
    }
    showStatus(welcomed ? 'Disconnected from the match.' : 'Could not reach the server.');
  };
}
function onMessage(m) {
  switch (m.type) {
    case 'welcome': {
      myId = m.id; roomCode = m.room; soloMatch = !!m.solo; connected = true; inMenu = false;
      MAPC = MAPS[m.map] || MAP; loadMapVisuals(MAPC);
      hideConn(); $('menu').style.display = 'none'; $('hud').style.display = 'block';
      if (isTouch) $('touch').style.display = 'block';
      if (showcase) showcase.visible = false;
      $('room').textContent = (soloMatch ? 'Solo vs bots' : `Room ${m.room}`) + ' · ' + MAPC.name;
      if (!soloMatch) history.replaceState(null, '', `?room=${m.room}`);
      $('copyroom').style.display = soloMatch ? 'none' : 'inline-block';
      if (!isTouch) { lockPointer(); setTimeout(() => { if (connected && document.pointerLockElement !== cv && !chatOpen) setPause(true); }, 600); }
      goWake();
      break;
    }
    case 'full': wantLeave = true; try { ws.close(); } catch {} showStatus('That room is full (12 players max).'); break;
    case 'pong': {
      const t = Date.now(); rtt = t - m.c;
      const off = m.s + rtt / 2 - t;
      timeOffset = synced ? timeOffset * 0.8 + off * 0.2 : off; synced = true;
      break;
    }
    case 'r': roster.clear(); for (const p of m.list) roster.set(p.id, p); refreshNames(); break;
    case 's': onSnapshot(m); break;
  }
}
async function goWake() { try { wakeLock = await navigator.wakeLock?.request('screen'); } catch {} }
function refreshNames() {
  const mine = roster.get(myId);
  if (mine && !myMesh) { myMesh = makeSoldier(mine.color); scene.add(myMesh); }
  for (const [id, r] of remotes) {
    const info = roster.get(id);
    if (info && r.name !== info.name) {
      if (r.label) r.mesh.remove(r.label);
      r.label = makeLabel(info.name, info.color); r.mesh.add(r.label); r.name = info.name;
    }
  }
  if (boardOpen) renderBoard();
}

function onSnapshot(s) {
  if (!synced) timeOffset = s.t - Date.now();
  const wasAlive = me?.alive;
  state = s.st; timeLeft = s.time; timeLeftAt = performance.now();
  me = s.me;
  reloadEnd = performance.now() + me.rl; respawnEnd = performance.now() + me.rs;

  // --- server reconciliation: reset to authoritative state, replay unacknowledged inputs
  if (me.alive) {
    const old = [...local.pos];
    Object.assign(local, { pos: [...me.pos], vel: [...me.vel], onGround: me.og, fuel: me.fuel, groundTime: me.gt, hoverArmed: me.ha, pj: me.pj, air: me.air, thrusting: me.th });
    while (pending.length && pending[0].seq <= s.ack) pending.shift();
    for (const p of pending) stepPlayer(local, p.mv, CFG.INPUT_DT, MAPC);
    const err = sub(old, local.pos);
    if (!wasAlive || len(err) > 4) { renderOffset = [0, 0, 0]; prevPos = [...local.pos]; }
    else { renderOffset = add(renderOffset, err); prevPos = sub(prevPos, err); }
  } else { pending.length = 0; local.pos = [...me.pos]; local.thrusting = false; prevPos = [...me.pos]; renderOffset = [0, 0, 0]; }

  // --- remote players (buffered for interpolation)
  const seen = new Set();
  for (const [id, x, y, z, ay, ap, alive, wid, prot, hp, jet, ar] of s.ps) {
    seen.add(id);
    if (id === myId) continue;
    const r = remotes.get(id) || makeRemote(id);
    if (alive && !r.alive) { r.buf = []; r.lp = null; }
    Object.assign(r, { alive: !!alive, wid, prot: !!prot, hp, ar: ar || 0, jet: !!jet });
    r.buf.push({ t: s.t, pos: [x, y, z], yaw: ay, pitch: ap });
    if (r.buf.length > 30) r.buf.shift();
  }
  for (const [id, r] of remotes) if (!seen.has(id)) { scene.remove(r.mesh); remotes.delete(id); }

  // --- pickups
  const pkSeen = new Set();
  for (const [id, type, w, x, y, z] of s.pk) {
    pkSeen.add(id);
    if (!pickMeshes.has(id)) {
      const m = makePickup(type, w); m.position.set(x, y + 0.5, z); m.userData.baseY = y + 0.5;
      scene.add(m); pickMeshes.set(id, m);
    }
  }
  for (const [id, m] of pickMeshes) if (!pkSeen.has(id)) { scene.remove(m); pickMeshes.delete(id); }

  // --- projectiles
  const prSeen = new Set();
  for (const [id, type, x, y, z] of s.pr) {
    prSeen.add(id);
    let m = projMeshes.get(id);
    if (!m) {
      m = type === 'rocket'
        ? new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), new THREE.MeshBasicMaterial({ color: '#ff7a22' }))
        : new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshStandardMaterial({ color: '#2f4a22' }));
      m.position.set(x, y, z); scene.add(m); projMeshes.set(id, m);
    }
    m.userData.target = new THREE.Vector3(x, y, z);
  }
  for (const [id, m] of projMeshes) if (!prSeen.has(id)) { scene.remove(m); projMeshes.delete(id); }

  for (const e of s.ev) handleEvent(e);
  for (const e of s.pv) handlePriv(e);
}

function handleEvent(e) {
  switch (e.e) {
    case 'shot':
      if (e.id !== myId) {
        const r = remotes.get(e.id); let o = e.o;
        if (r) { kickRecoil(r.mesh); flashMuzzle(r.mesh); if (r.mesh.visible) o = muzzleWorld(r.mesh); }
        tracer(o, e.h, '#ffe9a0'); sfxAt('shot', e.o);
      }
      spark(e.h, e.pl ? '#ff5a4a' : '#ffd27a');
      break;
    case 'melee': { if (e.id !== myId) { const r = remotes.get(e.id); if (r) swingMelee(r.mesh); } break; }
    case 'boom': {
      explosion(e.p, e.r); sfxAt('boom', e.p);
      const d = len(sub(e.p, local.pos)); if (d < 15) shake = Math.max(shake, (1 - d / 15) * 0.6);
      break;
    }
    case 'kill':
      addFeed(e.k
        ? `<b style="color:${e.kc}">${esc(e.k)}</b> <i>[${wName(e.w)}${e.head ? ' ✛' : ''}]</i> <b style="color:${e.vc}">${esc(e.v)}</b>`
        : `<b style="color:${e.vc}">${esc(e.v)}</b> <i>self-destructed</i>`);
      break;
    case 'msg': addFeed(`<i>${esc(e.text)}</i>`); break;
    case 'chat': addChat(e); break;
    case 'end': showEnd(e); break;
    case 'start': $('end').style.display = 'none'; break;
  }
}
function handlePriv(e) {
  if (e.e === 'hit') { $('hitm').className = e.kill ? 'kill' : e.head ? 'head' : ''; hitT = 0.15; sfx('hit'); }
  else if (e.e === 'dmg') {
    dmgT = 0.5; sfx('hurt');
    if (e.from) { const dx = e.from[0] - local.pos[0], dz = e.from[1] - local.pos[2]; if (dx || dz) { dmgAngle = Math.atan2(-dx, -dz); dmgDirT = 1.2; } }
  } else if (e.e === 'spawn') { yaw = e.yaw; pitch = 0; }
  else if (e.e === 'pick') {
    toast(e.type === 'weapon' ? `+ ${WEAPONS[e.w].name}` : e.type === 'health' ? '+50 Health' : e.type === 'shield' ? '+50 Shield' : '+2 Grenades');
    sfx('pick');
  }
}

// ---------- camera & aiming
function curWeapon() { return me?.w?.[me.slot]?.id; }
function cameraRig(pos) {
  const eye = [pos[0], pos[1] + CFG.EYE, pos[2]];
  const fwd = aimDir(yaw, pitch);
  if (zoom && curWeapon() === 'sniper') return { eye, cam: eye, fwd };
  const dist = zoom ? 2.2 : 4.2;
  const right = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const want = add(add(eye, mul(fwd, -dist)), [right[0] * 0.8, 0.35, right[2] * 0.8]);
  const dv = sub(want, eye), L = len(dv), dir = mul(dv, 1 / L);
  const hit = rayWorld(eye, dir, L, MAPC);
  const d = hit < L ? Math.max(0.2, hit - 0.25) : L;
  return { eye, cam: add(eye, mul(dir, d)), fwd };
}
function computeAim() {
  const rig = cameraRig(local.pos);
  let t = rayWorld(rig.cam, rig.fwd, 300, MAPC);
  for (const r of remotes.values()) {
    if (!r.alive || !r.rp) continue;
    for (const hb of hitboxes(r.rp)) { const tt = rayBox(rig.cam, rig.fwd, hb.min, hb.max); if (tt < t) t = tt; }
  }
  aimTarget = add(rig.cam, mul(rig.fwd, t));
  const d = sub(aimTarget, rig.eye), L = len(d);
  if (L < 1.5) return [yaw, pitch];
  return [Math.atan2(-d[0], -d[2]), Math.asin(clamp(d[1] / L, -1, 1))];
}

// ---------- input
function gatherInput() {
  let mx = 0, mz = 0;
  const typing = chatOpen || paused;
  if (!typing) {
    if (keys.KeyW) mz += 1; if (keys.KeyS) mz -= 1; if (keys.KeyD) mx += 1; if (keys.KeyA) mx -= 1;
  }
  mx += touch.mx; mz += touch.mz;
  const jet = (!!keys.Space || touch.jet) && !typing;
  const dn = (!!keys.KeyC || !!keys.KeyX || touch.down) && !typing;
  [aimYaw, aimPitch] = computeAim();
  return {
    seq: ++seq, mx, mz, yaw, pitch, ay: aimYaw, ap: aimPitch, j: jet, jet, dn,
    sp: !!(keys.ShiftLeft || keys.ShiftRight || touch.sp), f: (mouseDown || touch.fire) && !typing,
    z: zoom, t: Math.round(serverNow() - CFG.INTERP_MS),
  };
}
function fixedStep() {
  if (!me) return;
  const inp = gatherInput();
  const mv = { mx: inp.mx, mz: inp.mz, yaw: inp.yaw, jump: inp.j, jet: inp.jet, sprint: inp.sp, down: inp.dn };
  prevPos = [...local.pos];
  if (me.alive && state === 'playing') {
    stepPlayer(local, mv, CFG.INPUT_DT, MAPC);           // client-side prediction
    pending.push({ seq: inp.seq, mv });
    if (pending.length > 180) pending.shift();
  }
  send({ type: 'i', ...inp });
  if (inp.f) predictShot();
}
function predictShot() {   // instant local feedback; the server decides real hits
  const w = me?.w?.[me.slot];
  if (!w || !me.alive || state !== 'playing') return;
  const W = WEAPONS[w.id], tn = performance.now();
  if (tn < localNextFire || tn < reloadEnd || w.mag <= 0) return;
  localNextFire = tn + 1000 / W.rate; w.mag--;
  sfx(W.pellets || W.scope || W.projectile ? 'heavy' : 'shot');
  if (myMesh) { kickRecoil(myMesh); flashMuzzle(myMesh); }
  if (W.projectile) return;
  const muzzle = myMesh ? muzzleWorld(myMesh) : [local.pos[0], local.pos[1] + CFG.EYE, local.pos[2]], d = len(sub(aimTarget, muzzle));
  const sp = W.spread * (zoom ? (W.scope ? 0 : 0.4) : 1) * d;
  for (let i = 0; i < (W.pellets || 1); i++)
    tracer(muzzle, add(aimTarget, [(Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp]), '#fff3b0');
}
function doMelee() { sendAct('melee'); sfx('melee'); if (myMesh) swingMelee(myMesh); }

function lockPointer() { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  try {
    const t = document.createElement('textarea'); t.value = text; t.setAttribute('readonly', ''); t.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(t); t.select(); const ok = document.execCommand('copy'); t.remove(); return ok;
  } catch { return false; }
}
async function copyRoom(code, btn) {
  if (!code) { toast('No room code yet'); return; }
  const ok = await copyText(code);
  toast(ok ? `Room code ${code} copied` : `Room code: ${code}`);
  if (btn && ok) { const o = btn.textContent; btn.textContent = '✓ COPIED'; setTimeout(() => (btn.textContent = o), 1400); }
}
function setPause(on) {
  if (on && (!connected || inMenu)) return;
  paused = on; $('pause').style.display = on ? 'flex' : 'none';
  if (on) { $('pcode').style.display = soloMatch ? 'none' : 'flex'; $('pcodev').textContent = roomCode || ''; }
  if (on) { mouseDown = false; for (const k in keys) keys[k] = false; touch.fire = touch.jet = touch.down = false; if (document.pointerLockElement) document.exitPointerLock?.(); }
  else if (!isTouch && connected) lockPointer();
}
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== cv) { mouseDown = false; if (connected && !isTouch && !chatOpen && !paused) setPause(true); }
  else if (paused) { paused = false; $('pause').style.display = 'none'; }
});
cv.addEventListener('click', () => { if (connected && !isTouch && !chatOpen && !paused && document.pointerLockElement !== cv) lockPointer(); });
addEventListener('mousedown', (e) => { if (document.pointerLockElement !== cv) return; if (e.button === 0) mouseDown = true; if (e.button === 2) zoom = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) zoom = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== cv) return;
  const s = SENS * settings.sens * (zoom ? 0.35 : 1);
  yaw -= e.movementX * s; pitch = clamp(pitch - e.movementY * s, -1.4, 1.4);
});
addEventListener('wheel', () => { if (document.pointerLockElement === cv && performance.now() - lastWheel > 250) { lastWheel = performance.now(); sendAct('swap'); } });

addEventListener('keydown', (e) => {
  if (chatOpen) { if (e.code === 'Enter') sendChat(); else if (e.code === 'Escape') closeChat(); return; }
  if (!connected || paused) return;
  if (e.code === 'Tab') { e.preventDefault(); boardOpen = true; renderBoard(); $('board').style.display = 'block'; return; }
  if (e.code === 'Enter') { e.preventDefault(); openChat(); return; }
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  switch (e.code) {
    case 'KeyR': sendAct('reload'); break;
    case 'KeyQ': sendAct('swap'); break;
    case 'KeyG': sendAct('nade'); break;
    case 'KeyF': doMelee(); break;
    case 'KeyE': sendAct('pickup'); break;
    case 'Digit1': if (me && me.slot !== 0) sendAct('swap'); break;
    case 'Digit2': if (me && me.slot !== 1) sendAct('swap'); break;
  }
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Tab') { boardOpen = false; $('board').style.display = 'none'; } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; mouseDown = false; });

// ---------- touch controls
if (isTouch) {
  for (const b of document.querySelectorAll('.tbtn')) {
    b.addEventListener('touchstart', (e) => {
      e.preventDefault(); e.stopPropagation(); b.classList.add('down');
      const a = b.dataset.act;
      if (b.dataset.hold) touch[b.dataset.hold] = true;
      else if (a === 'zoom') zoom = !zoom;
      else if (a === 'board') { boardOpen = !boardOpen; renderBoard(); $('board').style.display = boardOpen ? 'block' : 'none'; }
      else if (a === 'melee') doMelee();
      else sendAct(a);
    }, { passive: false });
    const up = (e) => { e.preventDefault(); b.classList.remove('down'); if (b.dataset.hold) touch[b.dataset.hold] = false; };
    b.addEventListener('touchend', up, { passive: false }); b.addEventListener('touchcancel', up, { passive: false });
  }
  let joyId = null, joyO = null, lookId = null, lookL = null;
  const joy = $('joy'), knob = $('knob');
  cv.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < innerWidth * 0.4 && joyId === null) {
        joyId = t.identifier; joyO = [t.clientX, t.clientY];
        joy.style.left = t.clientX + 'px'; joy.style.top = t.clientY + 'px'; joy.style.display = 'block';
        knob.style.transform = 'translate(0,0)';
      } else if (lookId === null) { lookId = t.identifier; lookL = [t.clientX, t.clientY]; }
    }
  }, { passive: false });
  cv.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) {
        let dx = (t.clientX - joyO[0]) / 55, dy = (t.clientY - joyO[1]) / 55;
        const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
        touch.mx = dx; touch.mz = -dy; touch.sp = L > 0.95;
        knob.style.transform = `translate(${dx * 32}px,${dy * 32}px)`;
      } else if (t.identifier === lookId) {
        const s = (zoom ? 0.0025 : 0.006) * settings.sens;
        yaw -= (t.clientX - lookL[0]) * s; pitch = clamp(pitch - (t.clientY - lookL[1]) * s, -1.4, 1.4);
        lookL = [t.clientX, t.clientY];
      }
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === joyId) { joyId = null; touch.mx = touch.mz = 0; touch.sp = false; joy.style.display = 'none'; }
      if (t.identifier === lookId) lookId = null;
    }
  };
  cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

// ---------- chat / feed / overlays
function openChat() {
  chatOpen = true; for (const k in keys) keys[k] = false; mouseDown = false;
  const i = $('chatin'); i.style.display = 'block'; i.value = ''; i.focus();
  document.exitPointerLock?.();
}
function closeChat() { chatOpen = false; const i = $('chatin'); i.style.display = 'none'; i.blur(); if (!isTouch) lockPointer(); }
function sendChat() { const t = $('chatin').value.trim(); if (t) send({ type: 'chat', text: t }); closeChat(); }
function addChat(e) {
  const d = document.createElement('div');
  d.innerHTML = `<b style="color:${e.c}">${esc(e.n)}:</b> ${esc(e.text)}`;
  const log = $('chatlog'); log.appendChild(d); setTimeout(() => d.remove(), 12000);
  while (log.children.length > 6) log.firstChild.remove();
}
function addFeed(html) {
  const d = document.createElement('div'); d.innerHTML = html;
  const f = $('feed'); f.appendChild(d); setTimeout(() => d.remove(), 6000);
  while (f.children.length > (isTouch ? 3 : 6)) f.firstChild.remove();
}
let toastTimer;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.style.opacity = 0), 1200); }
function renderBoard() {
  const list = [...roster.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  $('boardt').innerHTML = '<tr><th>Player</th><th>K</th><th>D</th></tr>' +
    list.map((p) => `<tr class="${p.id === myId ? 'me' : ''}"><td style="color:${p.color}">${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('');
  $('boardr').textContent = soloMatch ? `Solo match · ping ${rtt}ms` : `Room ${roomCode} · invite: ${location.origin}/?room=${roomCode} · ping ${rtt}ms`;
}
function showEnd(e) {
  $('end').style.display = 'flex';
  $('endw').textContent = e.winner ? `🏆 ${e.winner} wins!` : 'Match over';
  $('endl').innerHTML = e.standings.map((p, i) => `<tr><td>${i + 1}</td><td style="color:${p.color}">${esc(p.name)}</td><td>${p.kills} K</td><td>${p.deaths} D</td></tr>`).join('');
}

// ---------- HUD & minimap
const mm = $('mm'), mctx = mm.getContext('2d');
function drawMinimap() {
  const S = mm.width, M = MAPC, k = S / Math.max(M.w, M.d), ox = (S - M.w * k) / 2, oz = (S - M.d * k) / 2;
  const X = (x) => (x + M.w / 2) * k + ox, Z = (z) => (z + M.d / 2) * k + oz;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = 'rgba(20,25,20,.6)'; mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = 'rgba(210,195,160,.6)';
  for (const b of M.boxes) {
    if (!b.c || b.min[1] < 0 || b.max[0] - b.min[0] > M.w * 0.85 || b.max[2] - b.min[2] > M.d * 0.85) continue;
    mctx.fillRect(X(b.min[0]), Z(b.min[2]), (b.max[0] - b.min[0]) * k, (b.max[2] - b.min[2]) * k);
  }
  for (const r of remotes.values()) {
    if (!r.alive || !r.rp) continue;
    mctx.fillStyle = roster.get(r.id)?.color || '#f44';
    mctx.beginPath(); mctx.arc(X(r.rp[0]), Z(r.rp[2]), 3, 0, 7); mctx.fill();
  }
  const px = X(local.pos[0]), pz = Z(local.pos[2]);
  mctx.strokeStyle = '#fff'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(px, pz); mctx.lineTo(px - Math.sin(yaw) * 10, pz - Math.cos(yaw) * 10); mctx.stroke();
  mctx.fillStyle = '#fff'; mctx.beginPath(); mctx.arc(px, pz, 4, 0, 7); mctx.fill();
}
function updateHUD(dt) {
  if (!me) return;
  const tn = performance.now();
  $('hpf').style.width = me.hp + '%'; $('hpt').textContent = Math.ceil(me.hp);
  $('arf').style.width = me.ar + '%';
  $('fuf').style.width = local.fuel * 100 + '%'; $('fuf').style.background = local.fuel < 0.2 ? '#f55' : '#4cf';
  $('hov').textContent = local.thrusting && !local.onGround && !(keys.Space || touch.jet) ? '· BRAKE' : '';
  const w = me.w[me.slot];
  if (w) setHTML($('ammo'), `<span>${WEAPONS[w.id].name}</span>${w.mag}<small>/${w.reserve}</small>` + (tn < reloadEnd ? '<div class="rl">RELOADING</div>' : ''));
  setHTML($('slots'), me.w.map((x, i) => `<div class="slot ${i === me.slot ? 'on' : ''}">${i + 1} ${x ? WEAPONS[x.id].name : '—'}</div>`).join(''));
  setHTML($('nades'), `💣 ${me.gn}`);
  const tl = Math.max(0, timeLeft - (tn - timeLeftAt));
  $('timer').textContent = state === 'ended' ? 'Next match ' + fmt(tl) : fmt(tl);
  if (state === 'ended') $('endt').textContent = `Next match in ${fmt(tl)}`;
  else $('end').style.display = 'none';
  $('dead').style.display = me.alive || state === 'ended' ? 'none' : 'flex';
  if (!me.alive) $('deadt').textContent = `💀 Respawning in ${Math.max(0, Math.ceil((respawnEnd - tn) / 1000))}…`;
  $('prot').style.display = me.prot && me.alive ? 'block' : 'none';
  hitT = Math.max(0, hitT - dt); $('hitm').style.opacity = hitT > 0 ? 1 : 0;
  dmgT = Math.max(0, dmgT - dt); $('vig').style.opacity = Math.max(dmgT, me.alive && me.hp < 30 ? 0.35 : 0);
  dmgDirT = Math.max(0, dmgDirT - dt);
  const dd = $('ddir'); dd.style.opacity = Math.min(1, dmgDirT); dd.style.transform = `rotate(${-(dmgAngle - yaw)}rad)`;
  drawMinimap();
}

// ---------- remote interpolation
function interp(buf, t) {
  if (!buf.length) return null;
  while (buf.length > 2 && buf[1].t <= t) buf.shift();
  const a = buf[0], b = buf[1];
  if (!b || t <= a.t) return a;
  const k = Math.min(1, (t - a.t) / (b.t - a.t));
  return { pos: lerp3(a.pos, b.pos, k), yaw: lerpAng(a.yaw, b.yaw, k), pitch: a.pitch + (b.pitch - a.pitch) * k };
}

// ---------- main loop
let acc = 0, lastFrame = performance.now();
function frame() {
  requestAnimationFrame(frame);
  const tn = performance.now(), dt = Math.min(0.1, (tn - lastFrame) / 1000); lastFrame = tn;
  if (connected && me) {
    acc += dt;
    while (acc >= CFG.INPUT_DT) { acc -= CFG.INPUT_DT; fixedStep(); }
  }
  render(dt, acc / CFG.INPUT_DT, tn);
}
const SHOW_WEAPONS = ['ar', 'smg', 'shotgun', 'sniper', 'rocket', 'pistol'];
let showIdx = 0, showNext = 0;
function renderMenuScene(dt, tn) {
  if (showcase && inMenu) {
    showcase.visible = true;
    if (tn > showNext) { showNext = tn + 3200; const id = SHOW_WEAPONS[showIdx++ % SHOW_WEAPONS.length]; setWeapon(showcase, id); $('wlabel').textContent = WEAPONS[id].name; }
    showcase.rotation.y = 1.0 + Math.sin(tn * 0.0007) * 0.15;   // 3/4 view, facing the menu
    animateSoldier(showcase, { dt, t: tn, vx: 0, vz: 0, yaw: 0, pitch: 0.04, onGround: true, thrusting: false });
  }
  const C = new THREE.Vector3(0, 14.05, 0);
  const ang = Math.sin(tn * 0.0004) * 0.45;
  const cp = new THREE.Vector3(C.x + Math.sin(ang) * 4.6, C.y + 0.5, C.z - Math.cos(ang) * 4.6);
  const fwd = C.clone().sub(cp).setY(0).normalize();
  const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  camera.position.copy(cp);
  camera.lookAt(C.clone().addScaledVector(right, 1.5 * Math.max(1, camera.aspect / 1.78)));
  if (Math.abs(camera.fov - 55) > 0.1) { camera.fov = 55; camera.updateProjectionMatrix(); }
  renderer.render(scene, camera);
}
function render(dt, alpha, tn) {
  if (!me) { renderMenuScene(dt, tn); return; }
  if (showcase) showcase.visible = false;
  const decay = Math.exp(-dt * 12); renderOffset = renderOffset.map((v) => v * decay);
  const lp = add(lerp3(prevPos, local.pos, alpha), renderOffset);
  const wid = curWeapon(), scoped = zoom && wid === 'sniper';

  if (myMesh) {
    myMesh.visible = me.alive && !scoped;
    myMesh.position.set(...lp); myMesh.rotation.y = aimYaw;
    setWeapon(myMesh, wid || null);
    animateSoldier(myMesh, { dt, t: tn, vx: local.vel[0], vz: local.vel[2], yaw: aimYaw, pitch: aimPitch, onGround: local.onGround, thrusting: local.thrusting && me.alive });
    setBlink(myMesh, me.prot, tn);
  }

  const rig = cameraRig(lp);
  let c = rig.cam;
  if (shake > 0) { c = add(c, [(Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake]); shake = Math.max(0, shake - dt * 1.5); }
  camera.position.set(...c);
  camera.lookAt(c[0] + rig.fwd[0], c[1] + rig.fwd[1], c[2] + rig.fwd[2]);
  const fov = scoped ? 20 : zoom ? 50 : 72;
  if (Math.abs(camera.fov - fov) > 0.1) { camera.fov += (fov - camera.fov) * Math.min(1, dt * 12); camera.updateProjectionMatrix(); }
  $('scope').style.display = scoped ? 'block' : 'none';

  const rt = serverNow() - CFG.INTERP_MS;
  for (const r of remotes.values()) {
    const s = interp(r.buf, rt);
    r.mesh.visible = r.alive && !!s;
    if (!s) continue;
    if (r.lp && dt > 0) {
      const k = 0.25;
      r.vx += ((s.pos[0] - r.lp[0]) / dt - r.vx) * k; r.vy += ((s.pos[1] - r.lp[1]) / dt - r.vy) * k; r.vz += ((s.pos[2] - r.lp[2]) / dt - r.vz) * k;
    } else { r.vx = r.vy = r.vz = 0; }
    r.lp = s.pos; r.rp = s.pos;
    r.mesh.position.set(...s.pos); r.mesh.rotation.y = s.yaw;
    setWeapon(r.mesh, r.wid || null);
    animateSoldier(r.mesh, { dt, t: tn, vx: r.vx, vz: r.vz, yaw: s.yaw, pitch: s.pitch, onGround: !r.jet && Math.abs(r.vy) < 1.2, thrusting: r.jet && r.alive });
    setBlink(r.mesh, r.prot, tn);
    // health bar + name above the head; grows with distance so it stays readable
    const dx = s.pos[0] - c[0], dy = s.pos[1] - c[1], dz = s.pos[2] - c[2];
    const k = Math.min(4, Math.max(1, Math.hypot(dx, dy, dz) / 10));
    drawHpBar(r.bar, r.hp, r.ar);
    r.bar.scale.set(1.5 * k, 0.234 * k, 1); r.bar.position.y = 2.15 + 0.06 * k;
    if (r.label) { r.label.scale.set(2 * k, 0.5 * k, 1); r.label.position.y = 2.15 + 0.06 * k + 0.2 * k + 0.12; }
  }
  for (const [id, m] of pickMeshes) { m.rotation.y += dt * 2; m.position.y = m.userData.baseY + Math.sin(tn / 300 + id) * 0.1; }
  for (const m of projMeshes.values()) if (m.userData.target) m.position.lerp(m.userData.target, 1 - Math.exp(-dt * 20));

  updateFx(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
}

// ---------- leaving a match / returning to the menu
function leaveMatch() {
  wantLeave = true; clearInterval(pingTimer);
  if (ws) { ws.onclose = null; try { ws.close(); } catch {} ws = null; }
  for (const r of remotes.values()) scene.remove(r.mesh);
  remotes.clear();
  for (const m of pickMeshes.values()) scene.remove(m); pickMeshes.clear();
  for (const m of projMeshes.values()) scene.remove(m); projMeshes.clear();
  if (myMesh) { scene.remove(myMesh); myMesh = null; }
  roster.clear(); pending.length = 0; seq = 0; synced = false;
  MAPC = MAP; loadMapVisuals(MAP);
  me = null; connected = false; inMenu = true; paused = false; zoom = false; state = 'playing';
  for (const k in keys) keys[k] = false;
  touch.mx = touch.mz = 0; touch.fire = touch.jet = touch.down = touch.sp = false;
  for (const id of ['chatlog', 'feed']) $(id).innerHTML = '';
  for (const id of ['hud', 'touch', 'pause', 'conn', 'status', 'end', 'board']) $(id).style.display = 'none';
  document.exitPointerLock?.();
  history.replaceState(null, '', location.pathname);
  $('menu').style.display = 'block'; showScreen('main');
}

// ---------- menu
function showScreen(id) { for (const s of document.querySelectorAll('#menu .screen')) s.classList.toggle('on', s.id === 's-' + id); }
function playerName() {
  const n = $('name').value.trim() || ('Player' + Math.floor(Math.random() * 1000));
  settings.name = n.slice(0, 16); store.set('name', settings.name);
  return settings.name;
}
function beginGame(opts) {
  const name = playerName();
  initAudio(); sfx('ui');
  if (isTouch) goFullscreen();
  connect(name, opts);
}
function drawMapPreview(cv, map) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, t = map.theme;
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, t.sky[0]); g.addColorStop(1, t.sky[2]);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  const k = Math.min((W - 16) / map.w, (H - 16) / map.d), ox = (W - map.w * k) / 2, oz = (H - map.d * k) / 2;
  x.fillStyle = map.boxes[0].c || '#555'; x.fillRect(ox, oz, map.w * k, map.d * k);
  const list = map.boxes.filter((b) => b.c && b.min[1] >= 0 && b.max[0] - b.min[0] <= map.w * 0.85 && b.max[2] - b.min[2] <= map.d * 0.85).sort((a, b) => a.max[1] - b.max[1]);
  for (const b of list) {
    const rx = ox + (b.min[0] + map.w / 2) * k, rz = oz + (b.min[2] + map.d / 2) * k, rw = (b.max[0] - b.min[0]) * k, rd = (b.max[2] - b.min[2]) * k;
    const lift = Math.min(4, b.max[1] / 8);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(rx + lift, rz + lift, rw, rd);
    x.fillStyle = b.c; x.fillRect(rx, rz, rw, rd);
    x.strokeStyle = 'rgba(0,0,0,.45)'; x.lineWidth = 1; x.strokeRect(rx + 0.5, rz + 0.5, rw, rd);
  }
  x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.strokeRect(ox, oz, map.w * k, map.d * k);
}
function initMenu() {
  if (!MAPS[settings.map]) settings.map = 'outpost';
  const step = (d) => { settings.map = MAP_IDS[(MAP_IDS.indexOf(settings.map) + d + MAP_IDS.length) % MAP_IDS.length]; syncMap(); };
  function syncMap() {
    const m = MAPS[settings.map]; store.set('map', settings.map);
    for (const el of document.querySelectorAll('.mapsel')) {
      drawMapPreview(el.querySelector('canvas'), m);
      el.querySelector('.mapname').textContent = m.name; el.querySelector('.mapdesc').textContent = m.desc;
    }
    $('quicksub').textContent = `Join the public ${m.name} lobby`;
  }
  for (const el of document.querySelectorAll('.mapsel')) {
    for (const b of el.querySelectorAll('.mapnav')) b.onclick = () => { initAudio(); sfx('ui'); step(+b.dataset.dir); };
    el.querySelector('canvas').onclick = () => { initAudio(); sfx('ui'); step(1); };
  }
  syncMap();
  $('name').value = settings.name;
  $('roomin').value = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  for (const b of document.querySelectorAll('[data-go]')) b.addEventListener('click', () => { initAudio(); sfx('ui'); showScreen(b.dataset.go); });
  const syncBots = () => { $('botsval').textContent = settings.bots; store.set('bots', settings.bots); };
  $('botsminus').onclick = () => { settings.bots = clamp(settings.bots - 1, 1, 11); syncBots(); };
  $('botsplus').onclick = () => { settings.bots = clamp(settings.bots + 1, 1, 11); syncBots(); };
  syncBots();
  const segs = [...document.querySelectorAll('.seg')];
  const syncDiff = () => { for (const s of segs) s.classList.toggle('on', s.dataset.diff === settings.diff); store.set('diff', settings.diff); };
  for (const s of segs) s.onclick = () => { settings.diff = s.dataset.diff; syncDiff(); };
  syncDiff();
  $('startsolo').onclick = () => beginGame({ solo: true, bots: settings.bots, diff: settings.diff, map: settings.map });
  $('quick').onclick = () => beginGame({ room: MAPS[settings.map].code, map: settings.map });
  $('joinroom').onclick = () => { const r = $('roomin').value.trim(); if (r) beginGame({ room: r }); else $('roomin').focus(); };
  $('createroom').onclick = () => {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = '';
    for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)];
    $('roomin').value = c; beginGame({ room: c, map: settings.map });
  };
  $('sens').value = settings.sens; $('sens').oninput = (e) => { settings.sens = +e.target.value; store.set('sens', settings.sens); };
  $('vol').value = settings.vol; $('vol').oninput = (e) => { settings.vol = +e.target.value; store.set('vol', settings.vol); sfx('ui'); };
  const tog = $('shadows'); tog.classList.toggle('on', settings.shadows);
  tog.onclick = () => { setShadows(!settings.shadows); tog.classList.toggle('on', settings.shadows); };
  $('fsbtn').onclick = toggleFullscreen; $('pfs').onclick = toggleFullscreen;
  $('pausebtn').onclick = () => setPause(true);
  $('copyroom').onclick = (e) => { e.stopPropagation(); copyRoom(roomCode, e.currentTarget); };
  $('pcopy').onclick = (e) => copyRoom(roomCode, e.currentTarget);
  $('mcopy').onclick = (e) => copyRoom($('roomin').value.trim().toUpperCase(), e.currentTarget);
  $('resume').onclick = () => setPause(false);
  $('leave').onclick = leaveMatch;
  $('backmenu').onclick = leaveMatch;
  $('conncancel').onclick = leaveMatch;
}

// ---------- boot
(async function boot() {
  try {
    setProgress(6, 'Building the arena…'); await frameWait();
    loadMapVisuals(MAP);
    setProgress(30, 'Painting the sky…'); await frameWait();
    setProgress(48, 'Equipping soldiers…'); await frameWait();
    showcase = makeSoldier('#ffb43a'); showcase.position.set(0, 13, 0); scene.add(showcase);
    for (const id of Object.keys(WEAPONS)) makeWeaponModel(id);
    setProgress(72, 'Compiling shaders…'); await frameWait();
    camera.position.set(0, 14.5, -4.6); camera.lookAt(0, 14, 0);
    renderer.compile(scene, camera);
    setProgress(90, 'Getting ready…'); await frameWait();
    initMenu();
    requestAnimationFrame(frame);
    setProgress(100, 'Ready!');
    clearInterval(tipTimer);
    window.__jbReady = true; booted = true;
    const play = $('lplay');
    play.textContent = isTouch ? 'TAP TO PLAY' : 'CLICK TO PLAY'; play.style.display = 'block';
    if (isIOS && !isStandalone) {
      const h = $('lhint'); h.style.display = 'block';
      h.textContent = 'Tip for iPhone: tap Share → “Add to Home Screen”, then open Jetpack Brawl from your home screen for true full screen.';
    }
    play.onclick = () => {
      initAudio(); sfx('ui');
      if (isTouch) goFullscreen();
      $('loader').classList.add('off'); setTimeout(() => ($('loader').style.display = 'none'), 600);
      $('menu').style.display = 'block'; showScreen('main');
    };
  } catch (err) {
    console.error(err);
    $('lstatus').textContent = 'Failed to start: ' + (err && err.message ? err.message : err);
  }
})();
