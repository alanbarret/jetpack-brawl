// public/shared.js — constants, map and physics. Imported by BOTH server.js and the browser.
export const CFG = {
  TICK: 30, SNAP_MS: 50, INPUT_DT: 1 / 60,
  R: 0.4, H: 1.8, EYE: 1.6,
  WALK: 6, SPRINT: 9, JUMP: 7.5, G: 22, JET: 38, MAX_UP: 11, MAX_FALL: 30,
  FUEL_DRAIN: 0.25, FUEL_REGEN: 0.15, FUEL_DELAY: 0.8,
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
  shotgun: { name: 'Shotgun', dmg: 10,  rate: 1.2, mag: 6,  reserve: 24,  reload: 2.2, spread: 0.09,  range: 30,  len: 0.7,  color: '#ffaa44', pellets: 8 },
  sniper:  { name: 'Sniper',  dmg: 95,  rate: 0.8, mag: 5,  reserve: 15,  reload: 2.5, spread: 0.06,  range: 300, len: 1.2,  color: '#cc66ff', scope: true },
  rocket:  { name: 'Rocket',  dmg: 110, rate: 0.7, mag: 2,  reserve: 6,   reload: 2.8, spread: 0,     range: 0,   len: 1.0,  color: '#ff5544', projectile: true, speed: 35, radius: 5 },
};
export const WEAPON_POOL = ['smg', 'ar', 'shotgun', 'sniper', 'rocket'];

// ---------- Map: axis-aligned boxes. B(centerX, bottomY, centerZ, width, height, depth, color|null=invisible)
const boxes = [];
function B(cx, y, cz, w, h, d, c = '#8a7f6a') {
  boxes.push({ min: [cx - w / 2, y, cz - d / 2], max: [cx + w / 2, y + h, cz + d / 2], c });
}
B(0, -1, 0, 90, 1, 90, '#6b7d52');                         // floor
B(0, 0, -45.5, 92, 30, 1, '#4a463e'); B(0, 0, 45.5, 92, 30, 1, '#4a463e');
B(-45.5, 0, 0, 1, 30, 92, '#4a463e'); B(45.5, 0, 0, 1, 30, 92, '#4a463e');
B(0, 30, 0, 92, 1, 92, null);                              // invisible ceiling
B(0, 0, 0, 8, 12, 8, '#a08e6c'); B(0, 12, 0, 14, 1, 14, '#7d6f55');   // central tower + roof
B(-22, 0, -22, 10, 8, 10, '#9a8a70'); B(22, 0, 22, 10, 8, 10, '#9a8a70');
B(22, 0, -22, 6, 14, 6, '#8c7b60'); B(-22, 0, 22, 6, 14, 6, '#8c7b60');
B(-38, 0, 0, 6, 10, 28, '#857a64'); B(38, 0, 0, 6, 10, 28, '#857a64'); // sniper ledges
B(0, 17, -24, 12, 1, 4, '#6f8fa8'); B(0, 17, 24, 12, 1, 4, '#6f8fa8');  // floating platforms
B(-24, 19, 0, 4, 1, 12, '#6f8fa8'); B(24, 19, 0, 4, 1, 12, '#6f8fa8');
B(-12, 0, 0, 1, 3, 8, '#77705f'); B(12, 0, 0, 1, 3, 8, '#77705f');     // cover walls
B(0, 0, -12, 8, 3, 1, '#77705f'); B(0, 0, 12, 8, 3, 1, '#77705f');
for (const [x, z, s, h] of [[-30, -10, 3, 3], [30, 10, 3, 3], [-10, 30, 3, 3], [10, -30, 3, 3], [-32, 32, 4, 2], [32, -32, 4, 2], [-8, -34, 2, 2], [8, 34, 2, 2]])
  B(x, 0, z, s, h, s, '#a5763d');                          // crates

export const MAP = {
  boxes,
  spawns: [[-40, 0, -40], [40, 0, 40], [40, 0, -40], [-40, 0, 40], [0, 0, -40], [0, 0, 40],
           [-28, 0, 0], [28, 0, 0], [-38, 10, 0], [38, 10, 0], [0, 13, 0], [-22, 8, -22], [22, 8, 22]],
  pickups: [
    ...[[0, 13, 4], [-22, 8, -22], [22, 8, 22], [-38, 10, 8], [38, 10, -8], [0, 0, -20], [0, 0, 20], [-20, 0, 0], [20, 0, 0]].map(pos => ({ type: 'weapon', pos })),
    ...[[-32, 2, 32], [32, 2, -32], [0, 18, -24], [-40, 0, -20]].map(pos => ({ type: 'health', pos })),
    ...[[0, 18, 24], [-24, 20, 0]].map(pos => ({ type: 'shield', pos })),
    ...[[24, 20, 0], [40, 0, 20], [-10, 0, -20]].map(pos => ({ type: 'grenade', pos })),
  ],
};

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
export function rayWorld(o, d, maxT) {
  let best = maxT;
  for (const b of boxes) { const t = rayBox(o, d, b.min, b.max); if (t < best) best = t; }
  return best;
}
export function hitboxes(pos) {
  const [x, y, z] = pos;
  return [
    { min: [x - 0.4, y, z - 0.4], max: [x + 0.4, y + 1.45, z + 0.4], head: false },
    { min: [x - 0.25, y + 1.45, z - 0.25], max: [x + 0.25, y + 1.9, z + 0.25], head: true },
  ];
}

function overlaps(pos, b) {
  const R = CFG.R, H = CFG.H, e = 1e-4;
  return pos[0] + R > b.min[0] + e && pos[0] - R < b.max[0] - e &&
         pos[1] + H > b.min[1] + e && pos[1] < b.max[1] - e &&
         pos[2] + R > b.min[2] + e && pos[2] - R < b.max[2] - e;
}
function moveAxis(s, axis, delta) {
  if (!delta) return;
  s.pos[axis] += delta;
  for (const b of boxes) {
    if (!overlaps(s.pos, b)) continue;
    if (axis === 1) {
      if (delta > 0) s.pos[1] = b.min[1] - CFG.H;
      else { s.pos[1] = b.max[1]; s.onGround = true; }
    } else s.pos[axis] = delta > 0 ? b.min[axis] - CFG.R : b.max[axis] + CFG.R;
    s.vel[axis] = 0;
  }
}

// Deterministic movement step — identical on client (prediction) and server (authority).
// s: {pos, vel, onGround, fuel, groundTime}   inp: {mx, mz, yaw, jump, jet, sprint}
export function stepPlayer(s, inp, dt) {
  const sy = Math.sin(inp.yaw), cy = Math.cos(inp.yaw);
  const mx = clamp(inp.mx || 0, -1, 1), mz = clamp(inp.mz || 0, -1, 1);
  let dx = cy * mx - sy * mz, dz = -sy * mx - cy * mz;
  const l = Math.hypot(dx, dz); if (l > 1) { dx /= l; dz /= l; }
  const sp = inp.sprint ? CFG.SPRINT : CFG.WALK;
  const a = Math.min(1, (s.onGround ? 14 : 5) * dt);
  s.vel[0] += (dx * sp - s.vel[0]) * a;
  s.vel[2] += (dz * sp - s.vel[2]) * a;

  if (inp.jump && s.onGround) s.vel[1] = CFG.JUMP;
  if (inp.jet && s.fuel > 0) {
    if (s.vel[1] < CFG.MAX_UP) s.vel[1] = Math.min(CFG.MAX_UP, s.vel[1] + CFG.JET * dt);
    s.fuel = Math.max(0, s.fuel - CFG.FUEL_DRAIN * dt);
    s.groundTime = 0;
  }
  s.vel[1] = Math.max(-CFG.MAX_FALL, s.vel[1] - CFG.G * dt);

  if (s.onGround) {
    s.groundTime += dt;
    if (s.groundTime > CFG.FUEL_DELAY) s.fuel = Math.min(1, s.fuel + CFG.FUEL_REGEN * dt);
  }
  const maxD = Math.max(Math.abs(s.vel[0]), Math.abs(s.vel[1]), Math.abs(s.vel[2])) * dt;
  const n = Math.max(1, Math.ceil(maxD / 0.3)), h = dt / n;
  s.onGround = false;
  for (let i = 0; i < n; i++) {
    moveAxis(s, 0, s.vel[0] * h); moveAxis(s, 2, s.vel[2] * h); moveAxis(s, 1, s.vel[1] * h);
  }
}
