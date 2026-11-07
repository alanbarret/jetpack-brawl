// public/game.js — Three.js client: rendering, input, prediction, interpolation, HUD
import * as THREE from 'three';
import { CFG, WEAPONS, MAP, stepPlayer, aimDir, rayWorld, rayBox, hitboxes } from './shared.js';

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
const SENS = 0.0022;

// ---------- state
let ws = null, myId = null, roomCode = '', connected = false, synced = false;
let timeOffset = 0, rtt = 0;
const serverNow = () => Date.now() + timeOffset;
const local = { pos: [0, 0, 0], vel: [0, 0, 0], onGround: false, fuel: 1, groundTime: 0 };
let prevPos = [0, 0, 0], renderOffset = [0, 0, 0];
let me = null, state = 'playing', timeLeft = 0, timeLeftAt = 0, reloadEnd = 0, respawnEnd = 0;
let yaw = 0, pitch = 0, aimYaw = 0, aimPitch = 0, aimTarget = [0, 0, -10];
let seq = 0; const pending = [];
let zoom = false, mouseDown = false, chatOpen = false, boardOpen = false, lastWheel = 0;
let shake = 0, hitT = 0, dmgT = 0, dmgDirT = 0, dmgAngle = 0, localNextFire = 0;
const keys = {}; const touch = { mx: 0, mz: 0, fire: false, jet: false, sp: false };
const roster = new Map(), remotes = new Map(), pickMeshes = new Map(), projMeshes = new Map(), fx = [];
let myMesh = null;

// ---------- three.js setup
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const cv = renderer.domElement;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fc4e8'); scene.fog = new THREE.Fog('#9fc4e8', 70, 170);
const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 400);
scene.add(new THREE.HemisphereLight('#ffffff', '#556644', 1.3));
const sun = new THREE.DirectionalLight('#fff3dd', 2.2);
sun.position.set(30, 50, 20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -55, right: 55, top: 55, bottom: -55, near: 1, far: 160 });
scene.add(sun);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

for (const b of MAP.boxes) {
  if (!b.c) continue;
  const s = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
  const m = new THREE.Mesh(new THREE.BoxGeometry(...s), new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.9 }));
  m.position.set((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2);
  m.castShadow = m.receiveShadow = true; scene.add(m);
}

function makeLabel(text, color, scale = 1, y = 2.3) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 30px system-ui,sans-serif'; x.textAlign = 'center';
  x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,.7)'; x.strokeText(text, 128, 42);
  x.fillStyle = color; x.fillText(text, 128, 42);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  s.scale.set(2 * scale, 0.5 * scale, 1); s.position.y = y;
  return s;
}
function makeSoldier(color) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color });
  const dark = new THREE.MeshStandardMaterial({ color: '#2a2a2a' });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.4), mat); body.position.y = 1.05;
  const legs = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.65, 0.35), dark); legs.position.y = 0.33;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: '#e0b48a' })); head.position.y = 1.67;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.16, 0.48), mat); helmet.position.y = 1.86;
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.25), dark); pack.position.set(0, 1.05, 0.32);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.6, 8), new THREE.MeshBasicMaterial({ color: '#ffaa22' }));
  flame.position.set(0, 0.48, 0.32); flame.rotation.x = Math.PI; flame.visible = false;
  const arm = new THREE.Group(); arm.position.set(0.3, 1.3, 0);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1), new THREE.MeshStandardMaterial({ color: '#444' }));
  arm.add(gun);
  g.add(body, legs, head, helmet, pack, flame, arm);
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  g.userData = { arm, gun, flame, mat, wid: null };
  return g;
}
function setGun(m, wid) {
  if (m.userData.wid === wid) return;
  m.userData.wid = wid;
  const W = WEAPONS[wid], g = m.userData.gun;
  g.visible = !!W; if (!W) return;
  const th = wid === 'rocket' ? 2 : 1;
  g.scale.set(th, th, W.len); g.position.z = -W.len / 2 + 0.1;
  g.material.color.set(W.color).multiplyScalar(0.55);
}
function blink(m, on, t) { m.userData.mat.emissive.setHex(on && Math.floor(t / 120) % 2 ? 0x555555 : 0); }
function makePickup(type, w) {
  const em = (c) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45 });
  let m;
  if (type === 'weapon') {
    m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, WEAPONS[w].len + 0.3), em(WEAPONS[w].color));
    m.add(makeLabel(WEAPONS[w].name, '#fff', 0.6, 0.6));
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
  const r = { id, mesh, buf: [], alive: false, name: null, label: null, wid: '', prot: false, jet: false, rp: null };
  if (info) { r.label = makeLabel(info.name, info.color); mesh.add(r.label); r.name = info.name; }
  scene.add(mesh); remotes.set(id, r);
  return r;
}

// ---------- effects
function tracer(a, b, color) {
  const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a), new THREE.Vector3(...b)]);
  const l = new THREE.Line(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
  scene.add(l); fx.push({ o: l, life: 0.12, max: 0.12, kind: 'fade' });
}
function explosion(p, r) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), new THREE.MeshBasicMaterial({ color: '#ffaa33', transparent: true, opacity: 0.9 }));
  m.position.set(...p); scene.add(m); fx.push({ o: m, life: 0.45, max: 0.45, kind: 'boom', r });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.life -= dt;
    const k = 1 - f.life / f.max;
    if (f.kind === 'boom') f.o.scale.setScalar(0.5 + k * f.r);
    f.o.material.opacity = 0.9 * (1 - k);
    if (f.life <= 0) { scene.remove(f.o); f.o.geometry.dispose(); f.o.material.dispose(); fx.splice(i, 1); }
  }
}

// ---------- audio (synthesised, no files needed)
let actx = null, noiseBuf = null;
function initAudio() {
  try {
    actx = new (window.AudioContext || window.webkitAudioContext)();
    noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch { actx = null; }
}
function sfx(kind, vol = 1) {
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
  }
}
const sfxAt = (kind, p) => sfx(kind, Math.max(0, 1 - len(sub(p, local.pos)) / 70));

// ---------- networking
const send = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const sendAct = (a) => send({ type: 'a', a });
function connect(name, room) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => {
    send({ type: 'join', name, room });
    send({ type: 'ping', c: Date.now() });
    setInterval(() => send({ type: 'ping', c: Date.now() }), 2000);
  };
  ws.onmessage = (e) => onMessage(JSON.parse(e.data));
  ws.onclose = () => {
    connected = false;
    $('status').textContent = 'Disconnected — refresh to rejoin'; $('status').style.display = 'block';
    document.exitPointerLock?.();
  };
}
function onMessage(m) {
  switch (m.type) {
    case 'welcome':
      myId = m.id; roomCode = m.room; connected = true;
      $('join').style.display = 'none'; $('hud').style.display = 'block';
      if (isTouch) $('touch').style.display = 'block';
      $('room').textContent = `Room ${m.room}`;
      history.replaceState(null, '', `?room=${m.room}`);
      updateHint();
      break;
    case 'full': alert('That room is full (12 players).'); location.reload(); break;
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
    Object.assign(local, { pos: [...me.pos], vel: [...me.vel], onGround: me.og, fuel: me.fuel, groundTime: me.gt });
    while (pending.length && pending[0].seq <= s.ack) pending.shift();
    for (const p of pending) stepPlayer(local, p.mv, CFG.INPUT_DT);
    const err = sub(old, local.pos);
    if (!wasAlive || len(err) > 4) { renderOffset = [0, 0, 0]; prevPos = [...local.pos]; }
    else { renderOffset = add(renderOffset, err); prevPos = sub(prevPos, err); }
  } else { pending.length = 0; local.pos = [...me.pos]; prevPos = [...me.pos]; renderOffset = [0, 0, 0]; }

  // --- remote players (buffered for interpolation)
  const seen = new Set();
  for (const [id, x, y, z, ay, ap, alive, wid, prot, hp, jet] of s.ps) {
    seen.add(id);
    if (id === myId) continue;
    const r = remotes.get(id) || makeRemote(id);
    if (alive && !r.alive) r.buf = [];
    Object.assign(r, { alive: !!alive, wid, prot: !!prot, hp, jet: !!jet });
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
    case 'shot': if (e.id !== myId) { tracer(e.o, e.h, '#ffe9a0'); sfxAt('shot', e.o); } break;
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
  const hit = rayWorld(eye, dir, L);
  const d = hit < L ? Math.max(0.2, hit - 0.25) : L;
  return { eye, cam: add(eye, mul(dir, d)), fwd };
}
function computeAim() {
  const rig = cameraRig(local.pos);
  let t = rayWorld(rig.cam, rig.fwd, 300);
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
  if (!chatOpen) {
    if (keys.KeyW) mz += 1; if (keys.KeyS) mz -= 1; if (keys.KeyD) mx += 1; if (keys.KeyA) mx -= 1;
  }
  mx += touch.mx; mz += touch.mz;
  const jet = (!!keys.Space || touch.jet) && !chatOpen;
  [aimYaw, aimPitch] = computeAim();
  return {
    seq: ++seq, mx, mz, yaw, pitch, ay: aimYaw, ap: aimPitch, j: jet, jet,
    sp: !!(keys.ShiftLeft || keys.ShiftRight || touch.sp), f: (mouseDown || touch.fire) && !chatOpen,
    z: zoom, t: Math.round(serverNow() - CFG.INTERP_MS),
  };
}
function fixedStep() {
  if (!me) return;
  const inp = gatherInput();
  const mv = { mx: inp.mx, mz: inp.mz, yaw: inp.yaw, jump: inp.j, jet: inp.jet, sprint: inp.sp };
  prevPos = [...local.pos];
  if (me.alive && state === 'playing') {
    stepPlayer(local, mv, CFG.INPUT_DT);           // client-side prediction
    pending.push({ seq: inp.seq, mv });
    if (pending.length > 180) pending.shift();
  }
  send({ type: 'i', ...inp });
  if (inp.f) predictShot();
}
function getMuzzle() {
  if (!myMesh) return [local.pos[0], local.pos[1] + CFG.EYE, local.pos[2]];
  myMesh.updateMatrixWorld(true);
  return myMesh.userData.gun.localToWorld(new THREE.Vector3(0, 0, -0.5)).toArray();
}
function predictShot() {   // instant local feedback; the server decides real hits
  const w = me?.w?.[me.slot];
  if (!w || !me.alive || state !== 'playing') return;
  const W = WEAPONS[w.id], tn = performance.now();
  if (tn < localNextFire || tn < reloadEnd || w.mag <= 0) return;
  localNextFire = tn + 1000 / W.rate; w.mag--;
  sfx(W.pellets || W.scope || W.projectile ? 'heavy' : 'shot');
  if (W.projectile) return;
  const muzzle = getMuzzle(), d = len(sub(aimTarget, muzzle));
  const sp = W.spread * (zoom ? (W.scope ? 0 : 0.4) : 1) * d;
  for (let i = 0; i < (W.pellets || 1); i++)
    tracer(muzzle, add(aimTarget, [(Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp, (Math.random() - 0.5) * 2 * sp]), '#fff3b0');
}

function lockPointer() { try { const p = cv.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch {} }
function updateHint() { $('clickhint').style.display = connected && !isTouch && !chatOpen && document.pointerLockElement !== cv ? 'block' : 'none'; }
document.addEventListener('pointerlockchange', () => { if (document.pointerLockElement !== cv) mouseDown = false; updateHint(); });
cv.addEventListener('click', () => { if (connected && !isTouch && !chatOpen && document.pointerLockElement !== cv) lockPointer(); });
$('clickhint').style.pointerEvents = 'auto';
$('clickhint').addEventListener('click', lockPointer);
addEventListener('mousedown', (e) => { if (document.pointerLockElement !== cv) return; if (e.button === 0) mouseDown = true; if (e.button === 2) zoom = true; });
addEventListener('mouseup', (e) => { if (e.button === 0) mouseDown = false; if (e.button === 2) zoom = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== cv) return;
  const s = SENS * (zoom ? 0.35 : 1);
  yaw -= e.movementX * s; pitch = clamp(pitch - e.movementY * s, -1.4, 1.4);
});
addEventListener('wheel', () => { if (document.pointerLockElement === cv && performance.now() - lastWheel > 250) { lastWheel = performance.now(); sendAct('swap'); } });

addEventListener('keydown', (e) => {
  if (chatOpen) { if (e.code === 'Enter') sendChat(); else if (e.code === 'Escape') closeChat(); return; }
  if (!connected) return;
  if (e.code === 'Tab') { e.preventDefault(); boardOpen = true; renderBoard(); $('board').style.display = 'block'; return; }
  if (e.code === 'Enter') { e.preventDefault(); openChat(); return; }
  if (e.code === 'Space') e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  switch (e.code) {
    case 'KeyR': sendAct('reload'); break;
    case 'KeyQ': sendAct('swap'); break;
    case 'KeyG': sendAct('nade'); break;
    case 'KeyF': sendAct('melee'); sfx('melee'); break;
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
      else { sendAct(a); if (a === 'melee') sfx('melee'); }
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
        const s = zoom ? 0.0025 : 0.006;
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
}

// ---------- chat / feed / overlays
function openChat() {
  chatOpen = true; for (const k in keys) keys[k] = false; mouseDown = false;
  const i = $('chatin'); i.style.display = 'block'; i.value = ''; i.focus();
  document.exitPointerLock?.();
}
function closeChat() { chatOpen = false; const i = $('chatin'); i.style.display = 'none'; i.blur(); lockPointer(); updateHint(); }
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
  while (f.children.length > 6) f.firstChild.remove();
}
let toastTimer;
function toast(t) { const el = $('toast'); el.textContent = t; el.style.opacity = 1; clearTimeout(toastTimer); toastTimer = setTimeout(() => (el.style.opacity = 0), 1200); }
function renderBoard() {
  const list = [...roster.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  $('boardt').innerHTML = '<tr><th>Player</th><th>K</th><th>D</th></tr>' +
    list.map((p) => `<tr class="${p.id === myId ? 'me' : ''}"><td style="color:${p.color}">${esc(p.name)}</td><td>${p.kills}</td><td>${p.deaths}</td></tr>`).join('');
  $('boardr').textContent = `Room ${roomCode} · invite: ${location.origin}/?room=${roomCode} · ping ${rtt}ms`;
}
function showEnd(e) {
  $('end').style.display = 'flex';
  $('endw').textContent = e.winner ? `🏆 ${e.winner} wins!` : 'Match over';
  $('endl').innerHTML = e.standings.map((p, i) => `<tr><td>${i + 1}</td><td style="color:${p.color}">${esc(p.name)}</td><td>${p.kills} K</td><td>${p.deaths} D</td></tr>`).join('');
}

// ---------- HUD & minimap
const mm = $('mm'), mctx = mm.getContext('2d');
function drawMinimap() {
  const S = mm.width, k = S / 92, X = (x) => (x + 46) * k;
  mctx.clearRect(0, 0, S, S);
  mctx.fillStyle = 'rgba(20,25,20,.6)'; mctx.fillRect(0, 0, S, S);
  mctx.fillStyle = 'rgba(210,195,160,.6)';
  for (const b of MAP.boxes) {
    if (!b.c || b.min[1] < 0 || b.max[0] - b.min[0] > 80 || b.max[2] - b.min[2] > 80) continue;
    mctx.fillRect(X(b.min[0]), X(b.min[2]), (b.max[0] - b.min[0]) * k, (b.max[2] - b.min[2]) * k);
  }
  for (const r of remotes.values()) {
    if (!r.alive || !r.rp) continue;
    mctx.fillStyle = roster.get(r.id)?.color || '#f44';
    mctx.beginPath(); mctx.arc(X(r.rp[0]), X(r.rp[2]), 3, 0, 7); mctx.fill();
  }
  const px = X(local.pos[0]), pz = X(local.pos[2]);
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
function render(dt, alpha, tn) {
  if (!me) {   // title-screen camera orbit
    const a = tn * 0.0001;
    camera.position.set(Math.sin(a) * 60, 35, Math.cos(a) * 60); camera.lookAt(0, 5, 0);
    renderer.render(scene, camera); return;
  }
  const decay = Math.exp(-dt * 12); renderOffset = renderOffset.map((v) => v * decay);
  const lp = add(lerp3(prevPos, local.pos, alpha), renderOffset);
  const wid = curWeapon(), scoped = zoom && wid === 'sniper';

  if (myMesh) {
    myMesh.visible = me.alive && !scoped;
    myMesh.position.set(...lp); myMesh.rotation.y = aimYaw; myMesh.userData.arm.rotation.x = aimPitch;
    myMesh.userData.flame.visible = me.alive && (keys.Space || touch.jet) && local.fuel > 0 && Math.random() > 0.15;
    setGun(myMesh, wid); blink(myMesh, me.prot, tn);
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
    r.rp = s.pos;
    r.mesh.position.set(...s.pos); r.mesh.rotation.y = s.yaw; r.mesh.userData.arm.rotation.x = s.pitch;
    r.mesh.userData.flame.visible = r.jet && r.alive && Math.random() > 0.15;
    setGun(r.mesh, r.wid); blink(r.mesh, r.prot, tn);
  }
  for (const [id, m] of pickMeshes) { m.rotation.y += dt * 2; m.position.y = m.userData.baseY + Math.sin(tn / 300 + id) * 0.1; }
  for (const m of projMeshes.values()) if (m.userData.target) m.position.lerp(m.userData.target, 1 - Math.exp(-dt * 20));

  updateFx(dt);
  updateHUD(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

// ---------- join screen
try { $('name').value = localStorage.getItem('jb_name') || ''; } catch {}
$('roomin').value = new URLSearchParams(location.search).get('room') || '';
$('play').onclick = () => {
  const name = $('name').value.trim() || 'Player' + Math.floor(Math.random() * 1000);
  try { localStorage.setItem('jb_name', name); } catch {}
  initAudio();
  connect(name, $('roomin').value.trim());
  $('play').disabled = true; $('play').textContent = 'Connecting…';
  if (!isTouch) lockPointer();
};
