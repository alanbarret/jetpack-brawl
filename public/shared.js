// public/shared.js — constants, map and physics. Imported by BOTH server.js and the browser.
export const CFG = {
  TICK: 30, SNAP_MS: 50, INPUT_DT: 1 / 60,
  R: 0.4, H: 1.8, EYE: 1.6,
  WALK: 6, SPRINT: 9, JUMP: 7.5, G: 22, JET: 38, MAX_UP: 11, MAX_FALL: 30,
  FUEL_DRAIN: 0.25, FUEL_REGEN: 0.15, FUEL_DELAY: 0.8, JET_DELAY: 0.22,
  REGEN_DELAY: 4000, REGEN_RATE: 8,
  RESPAWN_MS: 3000, PROTECT_MS: 2000,
  KILL_LIMIT: 20, MATCH_MS: 8 * 60 * 1000, END_MS: 10000, MAX_PLAYERS: 12,
  INTERP_MS: 100, MAX_REWIND_MS: 300,
  MELEE_DMG: 50, MELEE_RANGE: 2, MELEE_CD: 600,
  NADE_FUSE: 2500, NADE_DMG: 100, NADE_R: 5, NADE_CD: 800, NADE_SPEED: 18,
  HEADSHOT: 1.8,
};

export const WEAPONS = {
  pistol:  { name: 'Pistol',  dmg: 20,  rate: 4,   mag: 12, reserve: 48,  reload: 1.2, spread: 0.012, range: 80,  len: 0.45, color: '#bbbbbb' },
  smg:     { name: 'SMG',     dmg: 12,  rate: 12,  mag: 30, reserve: 120, reload: 1.6, spread: 0.04,  range: 50,  len: 0.6,  color: '#66ccff' },
  ar:      { name: 'Rifle',   dmg: 18,  rate: 9,   mag: 30, reserve: 90,  reload: 1.9, spread: 0.02,  range: 100, len: 0.8,  color: '#88dd66' },
  shotgun: { name: 'Shotgun', dmg: 11,  rate: 1.2, mag: 6,  reserve: 24,  reload: 2.2, spread: 0.09,  range: 16,  len: 0.7,  color: '#ffaa44', pellets: 8, falloff: [5, 16, 0.25] },
  sniper:  { name: 'Sniper',  dmg: 95,  rate: 0.8, mag: 5,  reserve: 15,  reload: 2.5, spread: 0.008, range: 300, len: 1.2,  color: '#cc66ff', scope: true },
  rocket:  { name: 'Rocket',  dmg: 110, rate: 0.7, mag: 2,  reserve: 6,   reload: 2.8, spread: 0,     range: 0,   len: 1.0,  color: '#ff5544', projectile: true, speed: 35, radius: 5 },
};
export const WEAPON_POOL = ['smg', 'ar', 'shotgun', 'sniper', 'rocket'];

// ---------- Maps live in maps.js. MAP is the default map; every physics/raycast helper takes an optional `map`.
import { MAPS, MAP_IDS } from './maps.js';
export { MAPS, MAP_IDS };
export const MAP = MAPS.outpost;

// ---------- Math / collision helpers
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function aimDir(yaw, pitch) {
  const c = Math.cos(pitch);
  return [-Math.sin(yaw) * c, Math.sin(pitch), -Math.cos(yaw) * c];
}
export function inBox(p, b) {
  return p[0] >= b.min[0] && p[0] <= b.max[0] && p[1] >= b.min[1] && p[1] <= b.max[1] && p[2] >= b.min[2] && p[2] <= b.max[2];
}
export function rayBox(o, d, mn, mx) {
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) { if (o[i] < mn[i] || o[i] > mx[i]) return Infinity; }
    else {
      let t1 = (mn[i] - o[i]) / d[i], t2 = (mx[i] - o[i]) / d[i];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin;
}
export function rayWorld(o, d, maxT, map = MAP) {
  let best = maxT;
  for (const b of map.boxes) { const t = rayBox(o, d, b.min, b.max); if (t < best) best = t; }
  return best;
}
export function hitboxes(pos) {
  const [x, y, z] = pos;
  return [
    { min: [x - 0.38, y, z - 0.38], max: [x + 0.38, y + 1.42, z + 0.38], head: false },
    { min: [x - 0.28, y + 1.42, z - 0.28], max: [x + 0.28, y + 1.98, z + 0.28], head: true },
  ];
}

function overlaps(pos, b) {
  const R = CFG.R, H = CFG.H, e = 1e-4;
  return pos[0] + R > b.min[0] + e && pos[0] - R < b.max[0] - e &&
         pos[1] + H > b.min[1] + e && pos[1] < b.max[1] - e &&
         pos[2] + R > b.min[2] + e && pos[2] - R < b.max[2] - e;
}
function moveAxis(s, axis, delta, map) {
  if (!delta) return;
  s.pos[axis] += delta;
  for (const b of map.boxes) {
    if (!overlaps(s.pos, b)) continue;
    if (axis === 1) {
      if (delta > 0) s.pos[1] = b.min[1] - CFG.H;
      else { s.pos[1] = b.max[1]; s.onGround = true; }
    } else s.pos[axis] = delta > 0 ? b.min[axis] - CFG.R : b.max[axis] + CFG.R;
    s.vel[axis] = 0;
  }
}

// Deterministic movement step — identical on client (prediction) and server (authority).
// s: {pos, vel, onGround, fuel, groundTime, hoverArmed, pj, air, thrusting}
// inp: {mx, mz, yaw, jump, jet, sprint, down}
//
// Jetpack model: pressing jump/jet on the ground jumps first (0 fuel). Holding past JET_DELAY or
// pressing again in mid-air ignites the jetpack. Falling does not auto-fire or drain fuel.
// Map boundary: a rounded rectangle along the rock ring. Players (and flying jetpacks) can't cross it at any height.
export function limitPush(pos, r, L) {
  if (!L) return null;
  const R = L.r - r, ax = Math.abs(pos[0]), az = Math.abs(pos[2]);
  const qx = ax - (L.hx - L.r), qz = az - (L.hz - L.r);
  let nx = 0, nz = 0, over = 0;
  if (qx > 0 && qz > 0) { const d = Math.hypot(qx, qz); if (d > R) { over = d - R; nx = qx / d; nz = qz / d; } }
  else if (qx > R) { over = qx - R; nx = 1; }
  else if (qz > R) { over = qz - R; nz = 1; }
  if (!over) return null;
  const sx = Math.sign(pos[0]) || 1, sz = Math.sign(pos[2]) || 1;
  return [sx * nx, sz * nz, over];
}
function keepInside(s, L) {
  const h = limitPush(s.pos, CFG.R, L);
  if (!h) return;
  const [nx, nz, over] = h;
  s.pos[0] -= nx * over; s.pos[2] -= nz * over;
  const vOut = s.vel[0] * nx + s.vel[2] * nz;          // cancel only the outward part of the velocity
  if (vOut > 0) { s.vel[0] -= nx * vOut; s.vel[2] -= nz * vOut; }
}
export function stepPlayer(s, inp, dt, map = MAP) {
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  const mx = clamp(inp.mx || 0, -1, 1), mz = clamp(inp.mz || 0, -1, 1);
  let dx = cy * mx - sy * mz, dz = -sy * mx - cy * mz;
  const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
  const sp = inp.sprint ? CFG.SPRINT : CFG.WALK;
  const a = Math.min(1, (s.onGround ? 14 : 5) * dt);
  s.vel[0] += (dx * sp - s.vel[0]) * a;
  s.vel[2] += (dz * sp - s.vel[2]) * a;

  const down = !!inp.down, jump = !!inp.jump;
  // jet strength: true/1 = full thrust; the touch lever sends 0.62..1 for finer height control
  const jp = inp.jet === true ? 1 : Math.max(0, Math.min(1, +inp.jet || 0));
  if (s.onGround) {
    s.air = 0;
    s.hoverArmed = false;
    if (jump) { s.vel[1] = CFG.JUMP; s.onGround = false; }
  } else {
    s.air = (s.air || 0) + dt;
    if ((jump && !s.pj) || s.air >= CFG.JET_DELAY) s.hoverArmed = true;
  }
  s.pj = jump;

  s.vel[1] = Math.max(-CFG.MAX_FALL, s.vel[1] - CFG.G * dt);

  let thrusting = false;
  if (jp > 0 && s.fuel > 0 && !down && !s.onGround && s.hoverArmed) {
    const top = CFG.MAX_UP * (0.55 + 0.45 * jp);
    const netAcc = (CFG.JET - CFG.G) * (s.vel[1] < 0 ? 1.6 : 1) * jp;
    if (s.vel[1] < top) s.vel[1] = Math.min(top, s.vel[1] + (CFG.G + netAcc) * dt);
    s.fuel = Math.max(0, s.fuel - CFG.FUEL_DRAIN * jp * dt);
    s.groundTime = 0;
    thrusting = true;
  }
  s.thrusting = thrusting;

  if (s.onGround) {
    s.groundTime += dt;
    if (s.groundTime > CFG.FUEL_DELAY) s.fuel = Math.min(1, s.fuel + CFG.FUEL_REGEN * dt);
  }
  const maxD = Math.max(Math.abs(s.vel[0]), Math.abs(s.vel[1]), Math.abs(s.vel[2])) * dt;
  const n = Math.max(1, Math.ceil(maxD / 0.3)), h = dt / n;
  s.onGround = false;
  for (let i = 0; i < n; i++) {
    moveAxis(s, 0, s.vel[0] * h, map); moveAxis(s, 2, s.vel[2] * h, map); moveAxis(s, 1, s.vel[1] * h, map);
    if (map.limit) keepInside(s, map.limit);
  }
  if (s.onGround) { s.hoverArmed = false; s.thrusting = false; }
}

// ---------- Grenades (Mini Militia style): frag, gas and proximity mine.
// One shared simulation so the server and the client's throw preview always agree.
export const NADES = {
  frag: { name: 'Frag',  short: 'FRAG',  speed: 19, fuse: 2600, dmg: 100, r: 5.5, bounce: 0.3 },
  gas:  { name: 'Gas',   short: 'GAS',   speed: 18, fuse: 1500, dps: 16, r: 4.6, dur: 6000, bounce: 0.25 },
  prox: { name: 'Proxy', short: 'PROXY', speed: 17, arm: 900, trig: 2.6, dmg: 95, r: 4.6, life: 30000, bounce: 0 },
};
export const NADE_TYPES = ['frag', 'gas', 'prox'];
export const NADE_MAX = 3;
const NADE_G = 20, NADE_DRAG = 0.12;
// initial state of a thrown grenade from the thrower's eye, aim and velocity
export function nadeLaunch(pos, vel, yaw, pitch, type, map = MAP) {
  const d = aimDir(yaw, Math.min(1.45, pitch + 0.12)), sp = NADES[type].speed;
  const eye = [pos[0], pos[1] + CFG.EYE, pos[2]];
  const reach = Math.max(0, Math.min(0.6, rayWorld(eye, d, 0.75, map) - 0.12));
  return {
    pos: [eye[0] + d[0] * reach, eye[1] + d[1] * reach, eye[2] + d[2] * reach],
    vel: [d[0] * sp + vel[0] * 0.4, d[1] * sp + vel[1] * 0.4, d[2] * sp + vel[2] * 0.4],
    stuck: false,
  };
}
// advance a grenade: gravity, air drag, bounces with energy loss, rolling friction; proximity mines stick on first contact
export function stepNade(n, dt, map, type) {
  if (n.stuck) return;
  const spd = Math.hypot(n.vel[0], n.vel[1], n.vel[2]);
  const steps = Math.max(1, Math.ceil((spd * dt) / 0.2)), h = dt / steps, N = NADES[type];
  for (let i = 0; i < steps; i++) {
    n.vel[1] -= NADE_G * h;
    const dk = 1 - NADE_DRAG * h; n.vel[0] *= dk; n.vel[1] *= dk; n.vel[2] *= dk;
    for (let a = 0; a < 3; a++) {
      const old = n.pos[a]; n.pos[a] += n.vel[a] * h;
      if (!map.boxes.some((b) => inBox(n.pos, b))) continue;
      n.pos[a] = old;
      if (type === 'prox') { n.stuck = true; n.vel = [0, 0, 0]; n.normal = a; return; }
      if (a === 1 && n.vel[1] < 0) {                      // floor
        const impact = -n.vel[1];
        n.vel[1] = impact > 2.5 ? impact * N.bounce : 0;
        const f = impact > 2.5 ? 0.55 : Math.exp(-9 * h);   // impact scrub, then rolling friction
        n.vel[0] *= f; n.vel[2] *= f;
      } else { n.vel[a] *= -N.bounce * 1.3; n.vel[(a + 1) % 3] *= 0.85; n.vel[(a + 2) % 3] *= 0.85; }
    }
    const lh = limitPush(n.pos, 0.1, map.limit);
    if (lh) {
      const [nx, nz, over] = lh;
      n.pos[0] -= nx * over; n.pos[2] -= nz * over;
      if (type === 'prox') { n.stuck = true; n.vel = [0, 0, 0]; n.normal = Math.abs(nx) >= Math.abs(nz) ? 0 : 2; return; }
      const vOut = n.vel[0] * nx + n.vel[2] * nz;
      if (vOut > 0) {
        const imp = (1 + N.bounce * 1.3) * vOut;
        n.vel[0] = (n.vel[0] - nx * imp) * 0.85;
        n.vel[2] = (n.vel[2] - nz * imp) * 0.85;
      }
    }
  }
}
