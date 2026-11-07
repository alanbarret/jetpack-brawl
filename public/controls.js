// public/controls.js — touch controls for phones/tablets (Android first).
// Dual joysticks, analog JET lever, swipe-to-dive, fuel ring, weapon wheel, grenade hold-to-aim,
// FIRE drag-aim, gyro aiming, vibration, left-handed mode and a layout editor.

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- control settings (persisted, prefix c_)
export const CDEF = {
  aim: 'swipe', stickfire: false, joy: 'float', dead: 0.12, zsens: 0.45, gsens: 1,
  assist: 'low', gyro: false, autofire: false, autopick: false, autoreload: false,
  vibe: true, left: false, opa: 0.8, layout: null,
};
let nearPick = false;
const hiddenBtn = (id) => (id === 'reload' && S.autoreload) || (id === 'pickup' && (S.autopick || !nearPick));
const btnW = (id, size) => (id === 'pickup' ? size * 2.5 : id === 'ntype' ? size * 3.3 : size);

// ---------- layout: [x, y, scale] as fractions of the screen (right-handed; mirrored for left-handed)
// PUBG-style: big FIRE on the right (drag it to aim), small FIRE on the left above the move stick,
// scope + reload around the right FIRE, JET bottom-right, grenade/melee bottom, weapon slots bottom-centre.
const BASE = { ntype: 30, fire: 84, lfire: 68, jet: 76, nade: 54, melee: 54, reload: 54, pickup: 46, zoom: 54, board: 44, move: 124, aim: 124 };
const LABEL = { ntype: 'FRAG ⟳', fire: 'FIRE', lfire: 'FIRE', jet: 'JET', nade: '💣', melee: '🔪', reload: 'R', pickup: 'PICK UP', zoom: '🔍', board: '☰', move: 'MOVE', aim: 'AIM' };
export const PRESETS = {
  classic: {
    fire: [0.86, 0.5, 1], lfire: [0.09, 0.46, 1], zoom: [0.955, 0.36, 1], reload: [0.75, 0.36, 1],
    jet: [0.92, 0.82, 1], melee: [0.8, 0.885, 1], nade: [0.685, 0.885, 1], ntype: [0.685, 0.745, 1], pickup: [0.62, 0.58, 1], board: [0.159, 0.082, 1],
    move: [0.15, 0.75, 1], aim: [0.56, 0.7, 1],
  },
  thumbs: {
    fire: [0.85, 0.55, 1.1], lfire: [0.1, 0.5, 1.05], zoom: [0.95, 0.4, 1], reload: [0.74, 0.4, 1],
    jet: [0.915, 0.83, 1.1], melee: [0.79, 0.89, 1], nade: [0.675, 0.89, 1], ntype: [0.675, 0.75, 1], pickup: [0.6, 0.62, 1], board: [0.159, 0.082, 1],
    move: [0.16, 0.76, 1.05], aim: [0.55, 0.72, 1],
  },
  claw: {
    fire: [0.86, 0.55, 1], lfire: [0.27, 0.3, 1], jet: [0.8, 0.27, 1], zoom: [0.93, 0.3, 0.95], reload: [0.69, 0.27, 0.95],
    melee: [0.92, 0.84, 1], nade: [0.8, 0.86, 1], ntype: [0.8, 0.72, 1], pickup: [0.62, 0.58, 1], board: [0.159, 0.082, 1],
    move: [0.15, 0.75, 1], aim: [0.6, 0.66, 1],
  },
};
const IDS = Object.keys(BASE);
const BTN_IDS = IDS.filter((i) => i !== 'move' && i !== 'aim');

let api, S, T;                       // game API, settings object, touch state
let layout = null;
const uiScale = () => clamp(innerHeight / 390, 0.85, 1.35);
function fullLayout(l) { const o = {}; for (const id of IDS) o[id] = [...((l && l[id]) || PRESETS.classic[id])]; return o; }
// screen position of a control (mirrors x for left-handed, except the scoreboard button)
function place(id, l = layout) {
  const [fx, fy, sc] = l[id], x = S.left && id !== 'board' ? 1 - fx : fx;
  return { x: x * innerWidth, y: fy * innerHeight, size: BASE[id] * sc * uiScale() };
}

export function applyLayout() {
  if (!api) return;
  layout = fullLayout(S.layout);
  $('touch').style.setProperty('--topa', S.opa);
  document.body.classList.toggle('lefty', !!S.left && api.isTouch);
  for (const b of document.querySelectorAll('#touch .tbtn')) {
    const id = b.dataset.id, p = place(id);
    const w = btnW(id, p.size);
    Object.assign(b.style, { left: p.x - w / 2 + 'px', top: p.y - p.size / 2 + 'px', width: w + 'px', height: p.size + 'px', fontSize: Math.round(p.size * (id === 'pickup' ? 0.3 : id === 'ntype' ? 0.4 : BASE[id] > 60 ? 0.21 : 0.33)) + 'px' });
    b.style.display = hiddenBtn(id) ? 'none' : 'flex';
  }
  for (const k of ['move', 'aim']) {
    const el = $(k === 'move' ? 'mjoy' : 'ajoy'), p = place(k);
    el.style.width = el.style.height = p.size + 'px';
    el.dataset.fx = p.x; el.dataset.fy = p.y;
    const fixedVisible = S.joy === 'fixed' && (k === 'move' || S.aim === 'stick');
    if (!el.classList.contains('act')) { setJoy(el, p.x, p.y, 0, 0); el.style.display = fixedVisible ? 'block' : 'none'; }
    el.classList.toggle('fixed', fixedVisible);
  }
}
function setJoy(el, x, y, dx, dy) {
  el.style.left = x + 'px'; el.style.top = y + 'px';
  el.querySelector('.knob').style.transform = `translate(-50%,-50%) translate(${dx}px,${dy}px)`;
}

// ---------- vibration
export function buzz(kind) {
  if (!S?.vibe || !navigator.vibrate || !api?.isTouch) return;
  const P = { hit: 12, head: [14, 30, 14], kill: [30, 40, 50], dmg: 40, empty: 70, tap: 6 };
  try { navigator.vibrate(P[kind] || 10); } catch {}
}

// ---------- gyro aiming
let gyroBound = false, lastMotion = 0;
export async function enableGyro() {
  try { if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) { if ((await DeviceMotionEvent.requestPermission()) !== 'granted') return false; } } catch { return false; }
  if (!gyroBound) { addEventListener('devicemotion', onMotion); gyroBound = true; }
  return true;
}
function onMotion(e) {
  const t = performance.now(), dt = Math.min(0.05, (t - lastMotion) / 1000); lastMotion = t;
  const r = e.rotationRate;
  if (!S.gyro || !r || !api.active()) return;
  const ang = ((screen.orientation && screen.orientation.angle) ?? window.orientation ?? 90) % 360;
  let yr, pr;                                    // deg/s around the screen's up / right axes
  if (ang === 90) { yr = r.beta; pr = -r.gamma; }
  else if (ang === 270 || ang === -90) { yr = -r.beta; pr = r.gamma; }
  else { yr = r.gamma; pr = r.beta; }
  const k = (Math.PI / 180) * dt * S.gsens * (api.isZoom() ? S.zsens : 1);
  api.look((yr || 0) * k, (pr || 0) * k);
}

// ---------- touch handling
const mv = { id: null, ox: 0, oy: 0 };                         // move stick
const lk = { id: null, mode: null, ox: 0, oy: 0, lx: 0, ly: 0, ax: 0, ay: 0 };   // aim stick / swipe look
let fireTouch = null, lastFireTap = 0, wheel = null, fires = 0;
const buttonResets = [];

function lookGain() { return 0.006 * S.sens * (api.isZoom() ? S.zsens : 1) * api.lookScale(); }
function swipe(dx, dy) { const g = lookGain(); api.look(-dx * g, -dy * g); }
function refreshAiming() { T.aiming = mv.id !== null || lk.id !== null || fireTouch !== null; }

function canvasStart(e) {
  e.preventDefault();
  const live = new Set([...e.touches].map((q) => q.identifier));
  const stale = [mv.id, lk.id].filter((id) => id !== null && !live.has(id)).map((identifier) => ({ identifier }));
  if (stale.length) canvasEnd({ changedTouches: stale });
  for (const t of e.changedTouches) {
    const x = t.clientX, y = t.clientY;
    const moveSide = S.left ? x > innerWidth * 0.6 : x < innerWidth * 0.4;
    if (moveSide && mv.id === null) {
      if (T.runLock) setRunLock(false);
      const el = $('mjoy'), fixed = S.joy === 'fixed';
      mv.id = t.identifier; mv.ox = fixed ? +el.dataset.fx : x; mv.oy = fixed ? +el.dataset.fy : y;
      el.classList.add('act'); el.style.display = 'block'; setJoy(el, mv.ox, mv.oy, 0, 0);
      moveStick(x, y);
    } else if (!moveSide && lk.id === null) {
      lk.id = t.identifier; lk.lx = x; lk.ly = y; lk.ax = lk.ay = 0;
      const el = $('ajoy');
      if (S.aim === 'stick') {
        const fixed = S.joy === 'fixed', fx = +el.dataset.fx, fy = +el.dataset.fy;
        const nearFixed = Math.hypot(x - fx, y - fy) < parseFloat(el.style.width) * 0.9;
        if (!fixed || nearFixed) {
          lk.mode = 'stick'; lk.ox = fixed ? fx : x; lk.oy = fixed ? fy : y;
          el.classList.add('act'); el.style.display = 'block'; setJoy(el, lk.ox, lk.oy, 0, 0);
          if (fixed) aimStick(x, y);
        } else lk.mode = 'swipe';
      } else lk.mode = 'swipe';
    }
  }
  refreshAiming();
}
function moveStick(x, y) {
  const el = $('mjoy'), R = parseFloat(el.style.width) / 2;
  let dx = (x - mv.ox) / R, dy = (y - mv.oy) / R;
  const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
  const Lc = Math.min(1, L), k = Lc < S.dead ? 0 : (Lc - S.dead) / (1 - S.dead) / (Lc || 1);
  T.mx = dx * k; T.mz = -dy * k; T.sp = Lc > 0.95;
  const far = (mv.oy - y) / R > 1.7 && Math.abs(x - mv.ox) < R * 0.8;      // finger dragged well above the stick
  if (far !== mv.lockArm) { mv.lockArm = far; el.classList.toggle('lockarm', far); if (far) buzz('tap'); }
  setJoy(el, mv.ox, mv.oy, dx * R * 0.62, dy * R * 0.62);
}
function aimStick(x, y) {
  const el = $('ajoy'), R = parseFloat(el.style.width) / 2;
  let dx = (x - lk.ox) / R, dy = (y - lk.oy) / R;
  const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; }
  lk.ax = dx; lk.ay = dy;
  T.sfire = S.stickfire && L > 0.9;
  el.classList.toggle('firing', T.sfire);
  setJoy(el, lk.ox, lk.oy, dx * R * 0.62, dy * R * 0.62);
}
function canvasMove(e) {
  e.preventDefault();
  for (const t of e.changedTouches) {
    if (t.identifier === mv.id) moveStick(t.clientX, t.clientY);
    else if (t.identifier === lk.id) {
      if (lk.mode === 'stick') { swipe(t.clientX - lk.lx, t.clientY - lk.ly); lk.lx = t.clientX; lk.ly = t.clientY; aimStick(t.clientX, t.clientY); }
      else { swipe(t.clientX - lk.lx, t.clientY - lk.ly); lk.lx = t.clientX; lk.ly = t.clientY; }
    }
  }
}
function canvasEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === mv.id) {
      mv.id = null; T.mx = T.mz = 0; T.sp = false;
      const el = $('mjoy'); el.classList.remove('act', 'lockarm');
      if (mv.lockArm) { mv.lockArm = false; setRunLock(true); }
      setJoy(el, +el.dataset.fx, +el.dataset.fy, 0, 0); el.style.display = S.joy === 'fixed' ? 'block' : 'none';
    }
    if (t.identifier === lk.id) {
      lk.id = null; lk.ax = lk.ay = 0; T.sfire = false;
      const el = $('ajoy'); el.classList.remove('act', 'firing');
      setJoy(el, +el.dataset.fx, +el.dataset.fy, 0, 0); el.style.display = S.joy === 'fixed' && S.aim === 'stick' ? 'block' : 'none';
    }
  }
  refreshAiming();
}

function setRunLock(on) {
  T.runLock = on; $('runlock').style.display = on ? 'block' : 'none';
  if (on) { T.mx = 0; T.mz = 1; T.sp = true; buzz('kill'); } else { T.mx = T.mz = 0; T.sp = false; }
}

// buttons
function press(b) { b.classList.add('down'); api.sfx('tap', 0.5); buzz('tap'); }
function release(b) { b.classList.remove('down'); }
function bindButton(b) {
  const id = b.dataset.id;
  let sx = 0, sy = 0, lx = 0, ly = 0, tid = null, holdTimer = null;
  b.addEventListener('touchstart', (e) => {
    e.preventDefault(); e.stopPropagation();
    if (tid !== null) {
      if ([...e.touches].some((q) => q.identifier === tid)) return;   // still genuinely held
      finish(true);                                                  // lost touch (system gesture etc.) — recover
    }
    const t = e.changedTouches[0]; tid = t.identifier; sx = lx = t.clientX; sy = ly = t.clientY;
    press(b);
    switch (id) {
      case 'lfire': fires++; T.fire = true; break;
      case 'fire': {
        fires++; T.fire = true; fireTouch = tid;
        break;
      }
      case 'jet': T.jet = 0.85; T.down = false; b.classList.add('lever'); lever(b, 0); break;
      case 'down': T.down = true; break;
      case 'nade': T.nade = true; break;
      case 'swap': holdTimer = setTimeout(() => openWheel(b), 220); break;
      case 'zoom': api.setZoom(!api.isZoom()); break;
      case 'board': api.toggleBoard(); break;
      case 'melee': api.melee(); break;
      case 'ntype': api.act('nadesel'); break;
      default: api.act(id);
    }
    refreshAiming();
  }, { passive: false });
  b.addEventListener('touchmove', (e) => {
    e.preventDefault(); e.stopPropagation();
    const t = [...e.changedTouches].find((q) => q.identifier === tid); if (!t) return;
    const x = t.clientX, y = t.clientY;
    if (id === 'fire' || id === 'nade') swipe(x - lx, y - ly);                 // drag to aim while firing / aiming a grenade
    else if (id === 'jet') {
      const dy = y - sy;
      if (dy > 28) { T.jet = 0; T.down = true; b.classList.add('dive'); }      // swipe down = dive
      else { T.down = false; b.classList.remove('dive'); const k = dy < 0 ? 0.6 + 0.4 * Math.min(1, -dy / 30) : 0.6 * (1 - dy / 28); T.jet = 0.62 + 0.38 * k; }
      lever(b, clamp(dy, -30, 34));
    } else if (id === 'swap' && wheel) pickWheel(x, y);
    lx = x; ly = y;
  }, { passive: false });
  const end = (e, cancel) => {
    const t = [...e.changedTouches].find((q) => q.identifier === tid); if (!t) return;
    e.preventDefault(); finish(cancel);
  };
  function finish(cancel) {
    if (tid === null) return;
    tid = null; release(b);
    switch (id) {
      case 'lfire': fires = Math.max(0, fires - 1); T.fire = fires > 0; break;
      case 'fire': fires = Math.max(0, fires - 1); T.fire = fires > 0; fireTouch = null; break;
      case 'jet': T.jet = 0; T.down = false; b.classList.remove('lever', 'dive'); lever(b, 0); break;
      case 'down': T.down = false; break;
      case 'nade': T.nade = false; if (!cancel) api.act('nade'); break;
      case 'swap':
        clearTimeout(holdTimer);
        if (wheel) closeWheel(!cancel); else if (!cancel) api.act('swap');
        break;
    }
    refreshAiming();
  }
  buttonResets.push(() => finish(true));
  b.addEventListener('touchend', (e) => end(e, false), { passive: false });
  b.addEventListener('touchcancel', (e) => end(e, true), { passive: false });
}
function lever(b, dy) { const l = b.querySelector('.lev'); if (l) l.style.transform = `translateY(${dy}px)`; }

// weapon wheel (hold ⇄): up = weapon 1, down = weapon 2, left = reload, right = pick up
function openWheel(b) {
  const r = b.getBoundingClientRect(), el = $('wheel');
  const cx = clamp(r.left + r.width / 2, 104, innerWidth - 104), cy = clamp(r.top + r.height / 2, 104, innerHeight - 104);
  const ws = api.weapons();
  el.querySelector('[data-k=w0]').innerHTML = `<b>1</b> ${ws[0] ? ws[0].name : '—'}`;
  el.querySelector('[data-k=w1]').innerHTML = `<b>2</b> ${ws[1] ? ws[1].name : '—'}`;
  for (const s of el.querySelectorAll('.ws')) s.classList.toggle('cur', (s.dataset.k === 'w0' && api.slot() === 0) || (s.dataset.k === 'w1' && api.slot() === 1));
  el.style.left = cx + 'px'; el.style.top = cy + 'px'; el.style.display = 'block';
  wheel = { cx, cy, sel: null }; buzz('tap');
}
function pickWheel(x, y) {
  const dx = x - wheel.cx, dy = y - wheel.cy;
  let sel = null;
  if (Math.hypot(dx, dy) > 26) sel = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'pickup' : 'reload') : (dy < 0 ? 'w0' : 'w1');
  if (sel !== wheel.sel) { wheel.sel = sel; if (sel) buzz('tap'); for (const s of $('wheel').querySelectorAll('.ws')) s.classList.toggle('on', s.dataset.k === sel); }
}
function closeWheel(apply) {
  const sel = wheel?.sel; wheel = null;
  const el = $('wheel'); el.style.display = 'none'; for (const s of el.querySelectorAll('.ws')) s.classList.remove('on');
  if (!apply || !sel) return;
  if (sel === 'w0' || sel === 'w1') { const want = sel === 'w0' ? 0 : 1; if (api.slot() !== want && api.weapons()[want]) api.act('swap'); }
  else api.act(sel);
}

export function resetTouch() {
  Object.assign(T, { mx: 0, mz: 0, sp: false, fire: false, sfire: false, jet: 0, down: false, nade: false, aiming: false, runLock: false });
  for (const r of buttonResets) r();
  fires = 0; mv.lockArm = false; if ($('runlock')) $('runlock').style.display = 'none';
  mv.id = lk.id = fireTouch = null; lk.ax = lk.ay = 0;
  if (wheel) closeWheel(false);
  for (const b of document.querySelectorAll('#touch .tbtn')) b.classList.remove('down', 'lever', 'dive');
  for (const id of ['mjoy', 'ajoy']) $(id)?.classList.remove('act', 'firing', 'lockarm');
  applyLayout();
}

// per-frame: aim-stick turning + fuel ring
let lastFuel = -1;
export function updateControls(dt) {
  if (!api?.isTouch) return;
  if (lk.id !== null && lk.mode === 'stick' && api.active()) {
    const L = Math.hypot(lk.ax, lk.ay);
    if (L > 0.45) {                      // past the inner zone: keep turning while held
      const c = ((Math.min(1, L) - 0.45) / 0.55) / L, k = S.sens * (api.isZoom() ? S.zsens : 1) * api.lookScale() * dt;
      api.look(-lk.ax * c * 3.2 * k, -lk.ay * c * 1.8 * k);
    }
  }
  const np = !!api.nearPickup();
  if (np !== nearPick) {
    nearPick = np;
    const b = document.querySelector('#touch [data-id=pickup]');
    if (b) { b.style.display = hiddenBtn('pickup') ? 'none' : 'flex'; if (np && !S.autopick) buzz('tap'); }
  }
  const f = Math.round(api.fuel() * 100) / 100;
  if (f !== lastFuel) {
    lastFuel = f;
    const ring = document.querySelector('#touch [data-id=jet] .ring');
    if (ring) { ring.style.setProperty('--f', f); ring.style.setProperty('--fc', f < 0.2 ? '#ff5a4a' : '#4cc8ff'); }
  }
}

// ---------- settings UI binding (Controls screen)
export function bindSettingsUI(root, onChange) {
  for (const el of root.querySelectorAll('[data-set]')) {
    const k = el.dataset.set;
    if (el.classList.contains('tog')) {
      el.classList.toggle('on', !!S[k]);
      el.onclick = async () => {
        let v = !S[k];
        if (k === 'gyro' && v && !(await enableGyro())) { v = false; api.toast('Motion sensor not available'); }
        set(k, v); el.classList.toggle('on', v); api.sfx('ui'); onChange?.(k);
      };
    } else if (el.classList.contains('segs')) {
      const sync = () => { for (const b of el.querySelectorAll('.seg')) b.classList.toggle('on', b.dataset.v === S[k]); };
      for (const b of el.querySelectorAll('.seg')) b.onclick = () => { set(k, b.dataset.v); sync(); api.sfx('ui'); onChange?.(k); };
      sync();
    } else if (el.type === 'range') {
      el.value = S[k];
      el.oninput = () => { set(k, +el.value); onChange?.(k); };
    }
  }
}
function set(k, v) { S[k] = v; api.store.set(k === 'sens' ? 'sens' : 'c_' + k, v); if (['joy', 'aim', 'left', 'opa', 'autopick', 'autoreload'].includes(k)) applyLayout(); }

// ---------- layout editor
let ed = null;
export function openEditor() {
  const root = $('ctledit');
  ed = { l: fullLayout(S.layout), sel: 'fire', opa: S.opa, drag: null };
  const area = $('edarea'); area.innerHTML = '';
  for (const id of IDS) {
    const d = document.createElement('div');
    d.className = 'eitem' + (id === 'move' || id === 'aim' ? ' stick' : '') + (BASE[id] > 60 ? ' big' : '');
    d.dataset.id = id; d.textContent = LABEL[id];
    d.addEventListener('pointerdown', (e) => {
      e.preventDefault(); d.setPointerCapture(e.pointerId); $('ctledit').querySelector('.edhint').style.display = 'none';
      const p = place(id, ed.l); ed.drag = { id, dx: e.clientX - p.x, dy: e.clientY - p.y };
      select(id);
    });
    d.addEventListener('pointermove', (e) => {
      if (!ed?.drag || ed.drag.id !== id) return;
      let fx = clamp((e.clientX - ed.drag.dx) / innerWidth, 0.03, 0.97), fy = clamp((e.clientY - ed.drag.dy) / innerHeight, 0.05, 0.95);
      if (S.left && id !== 'board') fx = 1 - fx;
      ed.l[id][0] = fx; ed.l[id][1] = fy; drawEditor();
    });
    const up = () => { if (ed) ed.drag = null; };
    d.addEventListener('pointerup', up); d.addEventListener('pointercancel', up);
    area.appendChild(d);
  }
  $('edsize').oninput = (e) => { ed.l[ed.sel][2] = +e.target.value; drawEditor(); };
  $('edopa').value = ed.opa; $('edopa').oninput = (e) => { ed.opa = +e.target.value; drawEditor(); };
  for (const b of root.querySelectorAll('[data-preset]')) b.onclick = () => { ed.l = fullLayout(PRESETS[b.dataset.preset]); api.sfx('ui'); select(ed.sel); };
  $('edreset').onclick = () => { ed.l = fullLayout(PRESETS.classic); ed.opa = CDEF.opa; $('edopa').value = ed.opa; api.sfx('ui'); select(ed.sel); };
  $('edcancel').onclick = () => closeEditor(false);
  $('eddone').onclick = () => closeEditor(true);
  root.style.display = 'block'; root.querySelector('.edhint').style.display = '';
  select('fire');
}
function select(id) {
  ed.sel = id; $('edsel').textContent = LABEL[id];
  $('edsize').value = ed.l[id][2];
  drawEditor();
}
function drawEditor() {
  for (const d of $('edarea').children) {
    const id = d.dataset.id, p = place(id, ed.l);
    const hidden = (id === 'reload' && S.autoreload) || (id === 'pickup' && S.autopick);
    d.classList.toggle('pill', id === 'pickup'); d.classList.toggle('chip', id === 'ntype');
    const w = btnW(id, p.size);
    Object.assign(d.style, { left: p.x - w / 2 + 'px', top: p.y - p.size / 2 + 'px', width: w + 'px', height: p.size + 'px',
      fontSize: Math.round(p.size * (BASE[id] > 60 ? 0.2 : 0.32)) + 'px', opacity: id === 'move' || id === 'aim' ? 1 : ed.opa });
    d.classList.toggle('sel', id === ed.sel); d.classList.toggle('off', hidden);
  }
}
function closeEditor(save) {
  if (save) { S.layout = ed.l; S.opa = ed.opa; api.store.set('c_layout4', ed.l); api.store.set('c_opa', ed.opa); api.toast('Controls layout saved'); }
  $('ctledit').style.display = 'none'; ed = null; applyLayout(); api.sfx('ui');
}

// ---------- init
export function initControls(a) {
  api = a; S = a.settings; T = a.touch;
  for (const k in CDEF) if (!(k in S)) S[k] = a.store.get('c_' + (k === 'layout' ? 'layout4' : k), CDEF[k]);
  resetTouch();
  addEventListener('resize', () => setTimeout(applyLayout, 120));
  screen.orientation?.addEventListener?.('change', () => setTimeout(applyLayout, 200));
  if (!a.isTouch) return;
  const cv = a.canvas;
  cv.addEventListener('touchstart', canvasStart, { passive: false });
  cv.addEventListener('touchmove', canvasMove, { passive: false });
  cv.addEventListener('touchend', canvasEnd); cv.addEventListener('touchcancel', canvasEnd);
  for (const b of document.querySelectorAll('#touch .tbtn')) bindButton(b);
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) resetTouch(); });   // app switched / shade pulled down
  if (S.gyro) enableGyro();       // Android needs no permission; iOS re-asks on the toggle
}
