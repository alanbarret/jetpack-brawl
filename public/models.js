// public/models.js — procedural 3D soldier + weapon models and their animation (no external assets).
import * as THREE from 'three';
import { WEAPONS } from './shared.js';

// ---------- geometry / material helpers
const geoCache = new Map();
const cached = (k, f) => { let g = geoCache.get(k); if (!g) { g = f(); geoCache.set(k, g); } return g; };
const boxG = (w, h, d) => cached(`b${w}|${h}|${d}`, () => new THREE.BoxGeometry(w, h, d));
const cylG = (rt, rb, h, seg = 12) => cached(`c${rt}|${rb}|${h}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sphG = (r, ws = 14, hs = 10) => cached(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
const capG = (r, l) => cached(`p${r}|${l}`, () => new THREE.CapsuleGeometry(r, l, 4, 12));
const coneG = (r, h, seg = 10) => cached(`k${r}|${h}|${seg}`, () => new THREE.ConeGeometry(r, h, seg));
const limbG = (r) => cached(`l${r}`, () => { const g = new THREE.CylinderGeometry(r, r * 0.88, 1, 10); g.translate(0, 0.5, 0); return g; });
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...o });

function M(g, m, x = 0, y = 0, z = 0, shadow = false) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = shadow; return o;
}
const bx = (w, h, d, m, x, y, z, rx = 0) => { const o = M(boxG(w, h, d), m, x, y, z); o.rotation.x = rx; return o; };
const cz = (r, len, m, x, y, z, seg = 10) => { const o = M(cylG(r, r, len, seg), m, x, y, z); o.rotation.x = Math.PI / 2; return o; };

let S = null;
function shared() {
  if (S) return S;
  const add = { blending: THREE.AdditiveBlending, depthWrite: false, transparent: true };
  S = {
    skin: std('#d4a583', { roughness: 0.8 }),
    glove: std('#1b1b1b', { roughness: 0.8 }),
    boot: std('#15120e', { roughness: 0.9 }),
    metal: std('#2b2e34', { roughness: 0.35, metalness: 0.85 }),
    metalL: std('#6b7078', { roughness: 0.4, metalness: 0.8 }),
    poly: std('#1c1d1f', { roughness: 0.65, metalness: 0.2 }),
    wood: std('#6a4426', { roughness: 0.8 }),
    visor: std('#0c1822', { roughness: 0.15, metalness: 0.6, emissive: '#0a3550', emissiveIntensity: 0.7 }),
    lens: new THREE.MeshBasicMaterial({ color: '#7fe0ff' }),
    lensR: new THREE.MeshBasicMaterial({ color: '#ff4a3a' }),
    knife: std('#c9ced4', { metalness: 0.9, roughness: 0.25 }),
    flame1: new THREE.MeshBasicMaterial({ color: '#ff8a1f', opacity: 0.85, ...add }),
    flame2: new THREE.MeshBasicMaterial({ color: '#fff2b0', opacity: 0.95, ...add }),
    flash: new THREE.MeshBasicMaterial({ color: '#ffd27a', opacity: 0.95, side: THREE.DoubleSide, ...add }),
  };
  return S;
}

// ---------- weapon models (grip at origin, barrel along -Z, +Y up)
const BUILD = {
  pistol(g, s, a) {
    g.add(bx(0.034, 0.042, 0.21, s.metal, 0, 0.035, -0.105));
    g.add(bx(0.028, 0.02, 0.16, s.metalL, 0, 0.012, -0.09));
    g.add(bx(0.03, 0.115, 0.05, s.poly, 0, -0.05, 0.012, -0.22));
    g.add(bx(0.01, 0.03, 0.07, s.poly, 0, -0.01, -0.055));
    g.add(bx(0.012, 0.014, 0.018, s.metalL, 0, 0.062, -0.19));
    g.add(bx(0.024, 0.012, 0.016, s.metalL, 0, 0.062, -0.02));
    g.add(bx(0.036, 0.006, 0.07, a, 0, 0.05, -0.1));
    g.add(cz(0.008, 0.04, s.metalL, 0, 0.035, -0.225));
    g.userData = { fore: -0.03, mz: -0.25, my: 0.035 };
  },
  smg(g, s, a) {
    g.add(bx(0.05, 0.07, 0.3, s.metal, 0, 0.02, -0.16));
    g.add(bx(0.04, 0.022, 0.3, s.poly, 0, 0.066, -0.16));
    g.add(cz(0.022, 0.18, s.poly, 0, 0.03, -0.4));
    g.add(cz(0.016, 0.13, s.metal, 0, 0.03, -0.53));
    g.add(bx(0.034, 0.1, 0.05, s.poly, 0, -0.06, 0.02, -0.3));
    g.add(bx(0.03, 0.18, 0.045, s.metalL, 0, -0.12, -0.17, 0.12));
    g.add(bx(0.012, 0.012, 0.2, s.metalL, 0, 0.03, 0.2));
    g.add(bx(0.03, 0.08, 0.02, s.poly, 0, 0.03, 0.3));
    g.add(bx(0.03, 0.04, 0.06, s.poly, 0, 0.1, -0.14));
    g.add(bx(0.02, 0.022, 0.004, s.lensR, 0, 0.1, -0.172));
    g.add(bx(0.026, 0.075, 0.034, s.poly, 0, -0.055, -0.33));
    g.add(bx(0.052, 0.008, 0.1, a, 0, 0.058, -0.12));
    g.userData = { fore: -0.3, mz: -0.6, my: 0.03 };
  },
  ar(g, s, a) {
    g.add(bx(0.055, 0.085, 0.36, s.metal, 0, 0.01, -0.18));
    g.add(bx(0.062, 0.07, 0.3, s.poly, 0, 0.005, -0.51));
    g.add(bx(0.028, 0.012, 0.3, s.metalL, 0, 0.047, -0.51));
    g.add(cz(0.01, 0.2, s.metal, 0, 0.012, -0.77));
    g.add(cz(0.017, 0.07, s.metalL, 0, 0.012, -0.88));
    g.add(bx(0.05, 0.1, 0.26, s.poly, 0, 0, 0.28));
    g.add(bx(0.054, 0.12, 0.03, s.poly, 0, 0, 0.42));
    g.add(bx(0.04, 0.11, 0.05, s.poly, 0, -0.09, 0.04, -0.3));
    g.add(bx(0.04, 0.16, 0.07, s.metalL, 0, -0.125, -0.14, 0.15));
    g.add(cz(0.022, 0.16, s.poly, 0, 0.115, -0.2));
    g.add(bx(0.02, 0.04, 0.06, s.metal, 0, 0.08, -0.2));
    g.add(cz(0.02, 0.005, s.lens, 0, 0.115, -0.285));
    g.add(cz(0.016, 0.005, s.lens, 0, 0.115, -0.118));
    g.add(bx(0.058, 0.008, 0.14, a, 0, 0.054, -0.11));
    g.userData = { fore: -0.4, mz: -0.92, my: 0.012 };
  },
  shotgun(g, s, a) {
    g.add(bx(0.056, 0.08, 0.28, s.metal, 0, 0.01, -0.14));
    g.add(cz(0.022, 0.62, s.metal, 0, 0.032, -0.58));
    g.add(cz(0.019, 0.5, s.metalL, 0, -0.02, -0.5));
    g.add(bx(0.066, 0.06, 0.2, s.wood, 0, -0.014, -0.42));
    g.add(bx(0.05, 0.1, 0.34, s.wood, 0, -0.005, 0.26));
    g.add(bx(0.054, 0.115, 0.03, s.poly, 0, -0.005, 0.43));
    g.add(bx(0.04, 0.1, 0.05, s.wood, 0, -0.085, 0.03, -0.3));
    g.add(bx(0.008, 0.014, 0.008, s.metalL, 0, 0.07, -0.88));
    g.add(bx(0.058, 0.008, 0.12, a, 0, 0.054, -0.1));
    g.userData = { fore: -0.42, mz: -0.9, my: 0.032 };
  },
  sniper(g, s, a) {
    g.add(bx(0.05, 0.08, 0.42, s.metal, 0, 0.01, -0.21));
    g.add(cz(0.013, 0.72, s.metal, 0, 0.02, -0.78));
    g.add(cz(0.022, 0.09, s.metalL, 0, 0.02, -1.17));
    g.add(bx(0.054, 0.115, 0.38, s.poly, 0, -0.005, 0.3));
    g.add(bx(0.046, 0.04, 0.22, s.poly, 0, 0.075, 0.28));
    g.add(bx(0.056, 0.13, 0.03, s.poly, 0, -0.005, 0.5));
    g.add(cz(0.03, 0.34, s.poly, 0, 0.125, -0.2));
    g.add(cz(0.042, 0.1, s.poly, 0, 0.125, -0.4));
    g.add(cz(0.034, 0.06, s.poly, 0, 0.125, -0.01));
    g.add(cz(0.036, 0.004, s.lens, 0, 0.125, -0.452));
    g.add(bx(0.03, 0.05, 0.03, s.metal, 0, 0.085, -0.3));
    g.add(bx(0.03, 0.05, 0.03, s.metal, 0, 0.085, -0.1));
    const bolt = M(cylG(0.007, 0.007, 0.08, 8), s.metalL, 0.05, 0.04, -0.06); bolt.rotation.z = Math.PI / 2; g.add(bolt);
    g.add(M(sphG(0.016, 8, 6), s.poly, 0.092, 0.04, -0.06));
    g.add(bx(0.035, 0.07, 0.12, s.metalL, 0, -0.07, -0.22));
    g.add(bx(0.04, 0.1, 0.05, s.poly, 0, -0.09, 0.04, -0.3));
    g.add(bx(0.01, 0.012, 0.22, s.metal, 0.028, -0.012, -0.86));
    g.add(bx(0.01, 0.012, 0.22, s.metal, -0.028, -0.012, -0.86));
    g.add(bx(0.056, 0.008, 0.2, a, 0, 0.054, -0.2));
    g.userData = { fore: -0.45, mz: -1.22, my: 0.02 };
  },
  rocket(g, s, a) {
    g.add(cz(0.072, 1.1, s.poly, 0, 0.085, -0.33, 16));
    g.add(cz(0.095, 0.1, s.metal, 0, 0.085, -0.92, 16));
    g.add(cz(0.1, 0.14, s.metal, 0, 0.085, 0.24, 16));
    const nose = M(coneG(0.065, 0.22, 12), a, 0, 0.085, -1.0); nose.rotation.x = -Math.PI / 2; g.add(nose);
    g.add(cz(0.078, 0.025, a, 0, 0.085, -0.7, 16));
    g.add(cz(0.078, 0.025, a, 0, 0.085, -0.1, 16));
    g.add(bx(0.04, 0.1, 0.05, s.poly, 0, -0.03, 0, -0.25));
    g.add(bx(0.035, 0.09, 0.04, s.poly, 0, -0.025, -0.45));
    g.add(bx(0.03, 0.07, 0.05, s.metal, 0, 0.19, -0.3));
    g.add(bx(0.06, 0.008, 0.08, s.metalL, 0, 0.228, -0.3));
    g.userData = { fore: -0.45, mz: -1.15, my: 0.085 };
  },
};
const weaponCache = new Map();
export function makeWeaponModel(id) {
  let base = weaponCache.get(id);
  if (!base) {
    const W = WEAPONS[id], s = shared();
    const accent = new THREE.MeshStandardMaterial({ color: W.color, emissive: W.color, emissiveIntensity: 0.3, roughness: 0.5 });
    base = new THREE.Group(); BUILD[id](base, s, accent);
    weaponCache.set(id, base);
  }
  return base.clone();   // shares geometry + materials
}

// ---------- limbs & 2-bone IK
const UP = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
const limbMesh = (r, m) => { const o = new THREE.Mesh(limbG(r), m); o.castShadow = true; return o; };
function place(o, a, b) {
  _v.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const L = _v.length() || 1e-4;
  o.position.set(a[0], a[1], a[2]); o.scale.set(1, L, 1);
  o.quaternion.setFromUnitVectors(UP, _v.divideScalar(L));
}
const A1 = 0.36, A2 = 0.36;
function solveArm(arm, Sh, H, side) {
  const dx = H[0] - Sh[0], dy = H[1] - Sh[1], dz = H[2] - Sh[2];
  let d = Math.hypot(dx, dy, dz) || 0.01;
  const u = [dx / d, dy / d, dz / d], reach = A1 + A2 - 0.01;
  if (d > reach) { d = reach; H = [Sh[0] + u[0] * d, Sh[1] + u[1] * d, Sh[2] + u[2] * d]; }
  const x = (d * d + A1 * A1 - A2 * A2) / (2 * d), h = Math.sqrt(Math.max(0, A1 * A1 - x * x));
  let p = [side * 0.5, -1, 0.3];
  const dot = p[0] * u[0] + p[1] * u[1] + p[2] * u[2];
  p = [p[0] - u[0] * dot, p[1] - u[1] * dot, p[2] - u[2] * dot];
  const pl = Math.hypot(p[0], p[1], p[2]) || 1; p = [p[0] / pl, p[1] / pl, p[2] / pl];
  const E = [Sh[0] + u[0] * x + p[0] * h, Sh[1] + u[1] * x + p[1] * h, Sh[2] + u[2] * x + p[2] * h];
  place(arm.upper, Sh, E); place(arm.fore, E, H);
  arm.elbow.position.set(E[0], E[1], E[2]); arm.hand.position.set(H[0], H[1], H[2]);
}

// ---------- soldier
const MOUNT = [0.1, -0.2, -0.22];
const SH_R = [0.27, -0.02, 0], SH_L = [-0.27, -0.02, 0];

export function makeSoldier(tintColor = '#ffb43a') {
  const s = shared();
  const tint = std(tintColor, { roughness: 0.55, metalness: 0.15 });
  const cloth = std('#3e4a37', { roughness: 0.9 });
  const pants = std('#353c2f', { roughness: 0.9 });
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);

  const hips = new THREE.Group(); hips.position.y = 0.99; body.add(hips);
  hips.add(M(boxG(0.34, 0.2, 0.23), pants, 0, 0, 0, true));
  hips.add(M(boxG(0.37, 0.06, 0.25), s.poly, 0, 0.1, 0));
  const legs = [-1, 1].map((side) => {
    const hip = new THREE.Group(); hip.position.set(side * 0.13, -0.02, 0); hips.add(hip);
    const th = limbMesh(0.112, pants); place(th, [0, 0, 0], [0, -0.44, 0]); hip.add(th);
    const knee = new THREE.Group(); knee.position.y = -0.44; hip.add(knee);
    const sh = limbMesh(0.088, pants); place(sh, [0, 0, 0], [0, -0.43, 0]); knee.add(sh);
    knee.add(M(sphG(0.097, 10, 8), pants, 0, 0, 0));
    knee.add(M(boxG(0.11, 0.11, 0.04), tint, 0, 0.0, -0.095));
    knee.add(M(boxG(0.12, 0.09, 0.27), s.boot, 0, -0.46, -0.045, true));
    knee.add(M(boxG(0.125, 0.03, 0.285), s.poly, 0, -0.51, -0.045));
    return { hip, knee };
  });

  const chest = new THREE.Group(); chest.position.y = 1.03; body.add(chest);
  const torso = M(capG(0.17, 0.28), cloth, 0, 0.3, 0, true); torso.scale.set(1.35, 1, 0.85); chest.add(torso);
  chest.add(M(boxG(0.5, 0.4, 0.31), tint, 0, 0.36, 0, true));
  chest.add(M(boxG(0.32, 0.3, 0.05), s.metal, 0, 0.4, -0.17, true));
  for (const x of [-0.14, 0, 0.14]) chest.add(M(boxG(0.09, 0.1, 0.06), s.poly, x, 0.18, -0.17));
  chest.add(M(sphG(0.04, 8, 6), std('#2f4a22'), 0.2, 0.12, -0.18));
  for (const x of [-0.27, 0.27]) chest.add(M(boxG(0.14, 0.07, 0.22), tint, x, 0.6, 0, true));
  chest.add(M(cylG(0.05, 0.055, 0.1, 10), s.skin, 0, 0.66, 0));

  const head = new THREE.Group(); head.position.set(0, 0.74, 0); chest.add(head);
  const skull = M(sphG(0.112, 16, 12), s.skin, 0, 0, 0, true); skull.scale.y = 1.12; head.add(skull);
  const helmet = M(cached('helm', () => new THREE.SphereGeometry(0.148, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)), tint, 0, 0.02, 0, true);
  head.add(helmet);
  head.add(M(boxG(0.2, 0.055, 0.05), s.visor, 0, 0.01, -0.115));
  head.add(M(boxG(0.17, 0.07, 0.08), s.poly, 0, -0.065, -0.075));
  for (const x of [-0.115, 0.115]) { const e = M(cylG(0.04, 0.04, 0.03, 10), s.poly, x, 0, 0); e.rotation.z = Math.PI / 2; head.add(e); }

  // jetpack
  const pack = new THREE.Group(); pack.position.set(0, 0.34, 0.24); chest.add(pack);
  pack.add(M(boxG(0.36, 0.42, 0.08), s.metal, 0, 0, 0, true));
  pack.add(M(boxG(0.36, 0.05, 0.09), tint, 0, 0.15, 0));
  const flames = [];
  for (const side of [-1, 1]) {
    pack.add(M(cylG(0.075, 0.075, 0.5, 12), s.metalL, side * 0.1, 0.02, 0.08, true));
    pack.add(M(sphG(0.075, 10, 6), s.metalL, side * 0.1, 0.27, 0.08));
    pack.add(M(cylG(0.045, 0.065, 0.12, 10), s.metal, side * 0.1, -0.3, 0.08));
    const f = new THREE.Group(); f.position.set(side * 0.1, -0.36, 0.08); f.visible = false;
    const o1 = M(coneG(0.06, 0.55), s.flame1, 0, -0.275, 0); o1.rotation.x = Math.PI;
    const o2 = M(coneG(0.035, 0.38), s.flame2, 0, -0.19, 0); o2.rotation.x = Math.PI;
    f.add(o1, o2); pack.add(f); flames.push(f);
  }

  // aim group: shoulders, arms, weapon mount — pitches with the aim
  const aim = new THREE.Group(); aim.position.set(0, 0.58, 0); chest.add(aim);
  for (const x of [-0.27, 0.27]) aim.add(M(sphG(0.08, 10, 8), cloth, x, -0.02, 0));
  const mkArm = () => {
    const a = { upper: limbMesh(0.064, cloth), fore: limbMesh(0.055, cloth), elbow: M(sphG(0.064, 8, 6), cloth), hand: M(sphG(0.056, 10, 8), s.glove) };
    aim.add(a.upper, a.fore, a.elbow, a.hand); return a;
  };
  const armR = mkArm(), armL = mkArm();
  const mount = new THREE.Group(); mount.position.set(...MOUNT); aim.add(mount);
  const knife = new THREE.Group(); knife.visible = false;
  knife.add(bx(0.02, 0.03, 0.22, s.knife, 0, 0, -0.14), bx(0.026, 0.034, 0.1, s.poly, 0, 0, 0), bx(0.04, 0.05, 0.015, s.metal, 0, 0, -0.04));
  mount.add(knife);
  const flash = new THREE.Group(); flash.visible = false;
  const fc = M(coneG(0.045, 0.3, 8), s.flash, 0, 0, -0.15); fc.rotation.x = -Math.PI / 2;
  flash.add(fc, M(sphG(0.06, 8, 6), s.flash, 0, 0, -0.02));
  mount.add(flash);

  solveArm(armR, SH_R, [MOUNT[0], MOUNT[1] - 0.045, MOUNT[2] + 0.01], 1);
  solveArm(armL, SH_L, [MOUNT[0] - 0.02, MOUNT[1] - 0.12, MOUNT[2] - 0.2], -1);

  root.userData = {
    body, hips, chest, head, aim, mount, legs, flames, flash, knife, armL, weapon: null, wid: undefined,
    phase: Math.random() * 6, airK: 0, lean: 0, recoil: 0, flashT: 0, melee: 0,
    blink: [tint, cloth, pants],
  };
  setWeapon(root, null);
  return root;
}

export function setWeapon(m, wid) {
  const u = m.userData;
  if (u.wid === wid) return;
  u.wid = wid;
  if (u.weapon) { u.mount.remove(u.weapon); u.weapon = null; }
  let fore = -0.1;
  if (wid && WEAPONS[wid]) {
    const w = makeWeaponModel(wid); u.weapon = w; u.mount.add(w);
    fore = w.userData.fore;
    u.flash.position.set(0, w.userData.my, w.userData.mz);
  } else u.flash.position.set(0, 0, -0.2);
  u.weapon && (u.weapon.visible = u.melee <= 0);
  solveArm(u.armL, SH_L, [MOUNT[0] - 0.02, MOUNT[1] - 0.035, MOUNT[2] + fore], -1);
}

export const kickRecoil = (m) => { m.userData.recoil = 1; };
export function flashMuzzle(m) {
  const u = m.userData; u.flashT = 0.055;
  u.flash.visible = true; u.flash.scale.setScalar(0.8 + Math.random() * 0.7); u.flash.rotation.z = Math.random() * 6;
}
export const swingMelee = (m) => { m.userData.melee = 0.28; };
export function muzzleWorld(m) {
  m.updateWorldMatrix(true, true);
  return m.userData.flash.getWorldPosition(_v).toArray();
}
export function setBlink(m, on, t) {
  const e = on && Math.floor(t / 120) % 2 ? 0x555555 : 0;
  for (const mat of m.userData.blink) mat.emissive.setHex(e);
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// o: { dt, t, vx, vz, yaw, pitch, onGround, thrusting }
export function animateSoldier(m, o) {
  const u = m.userData, dt = o.dt;
  const sp = Math.hypot(o.vx, o.vz);
  const fwd = o.vx * -Math.sin(o.yaw) + o.vz * -Math.cos(o.yaw);
  const k = o.onGround ? Math.min(1, sp / 5) : 0;
  u.phase += dt * sp * 1.55 * (fwd < -0.5 ? -1 : 1);
  const ph = u.phase;
  u.airK += ((o.onGround ? 0 : 1) - u.airK) * Math.min(1, dt * 10);
  const a = u.airK, g = 1 - a;

  const sw = Math.sin(ph) * 0.75 * k;
  const c = Math.cos(ph);
  const kneeL = -Math.max(0, c) * 0.9 * k, kneeR = -Math.max(0, -c) * 0.9 * k;
  u.legs[0].hip.rotation.x = sw * g + a * (o.thrusting ? -0.05 : 0.2);
  u.legs[1].hip.rotation.x = -sw * g + a * (o.thrusting ? -0.25 : -0.15);
  u.legs[0].knee.rotation.x = kneeL * g - a * 0.45;
  u.legs[1].knee.rotation.x = kneeR * g - a * 0.35;

  const leanT = clamp(fwd * 0.022, -0.12, 0.3) * (o.onGround ? 1 : 0.7) + (o.thrusting && !o.onGround ? 0.1 : 0);
  u.lean += (leanT - u.lean) * Math.min(1, dt * 8);
  u.chest.rotation.x = -u.lean;
  u.body.position.y = Math.abs(Math.sin(ph)) * 0.035 * k;
  u.chest.scale.y = 1 + Math.sin(o.t * 0.002) * 0.006;
  u.head.rotation.x = clamp(o.pitch * 0.55, -0.5, 0.5) + u.lean * 0.8;

  u.recoil *= Math.exp(-dt * 16);
  let rot = o.pitch + u.recoil * 0.06, pz = u.recoil * 0.07;
  if (u.melee > 0) {
    u.melee = Math.max(0, u.melee - dt);
    const sw2 = Math.sin((1 - u.melee / 0.28) * Math.PI);
    rot += sw2 * 0.9; pz -= sw2 * 0.25;
    u.knife.visible = true; if (u.weapon) u.weapon.visible = false;
  } else if (u.knife.visible) { u.knife.visible = false; if (u.weapon) u.weapon.visible = true; }
  u.aim.rotation.x = rot; u.aim.position.z = pz;

  if (u.flashT > 0) { u.flashT -= dt; if (u.flashT <= 0) u.flash.visible = false; }
  for (const f of u.flames) {
    f.visible = !!o.thrusting;
    if (f.visible) f.scale.set(1, 0.75 + Math.random() * 0.5, 1);
  }
}
