// bots.js — server-side bot AI. Bots are ordinary players driven by botThink() each server tick.
import { CFG, WEAPONS, stepPlayer, rayWorld, clamp, NADE_TYPES } from './public/shared.js';
const nadeCount = (p) => NADE_TYPES.reduce((s, k) => s + (p.nades[k] || 0), 0);

export const DIFFS = {
  // aim = steady wobble (rad), turn = max turn speed (rad/s), react = ms before first shot, settle = ms for the
  // first-sight aim error to fade, rest = pause between bursts, sprint = chance to run instead of walk
  easy:   { aim: 0.07, turn: 2.0, react: 950, settle: 1000, rest: 1.8, nade: 12000, view: 50, sprint: 0.15 },
  normal: { aim: 0.04, turn: 3.0, react: 620, settle: 700,  rest: 1.2, nade: 8000,  view: 65, sprint: 0.3 },
  hard:   { aim: 0.022, turn: 4.4, react: 380, settle: 450, rest: 0.8, nade: 5500,  view: 80, sprint: 0.45 },
};
export const BOT_NAMES = ['Viper', 'Falcon', 'Ghost', 'Razor', 'Nomad', 'Phantom', 'Cobra', 'Hawk', 'Titan', 'Rogue', 'Blaze', 'Storm', 'Raven', 'Saber'];

const rand = (a, b) => a + Math.random() * (b - a);
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const dist3 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const IDEAL = { pistol: 14, smg: 12, ar: 20, shotgun: 6, sniper: 40, rocket: 22 };
const SCORE = {
  pistol: () => 1,
  smg: (d) => (d < 22 ? 4 : 2),
  ar: () => 5,
  shotgun: (d) => (d < 10 ? 6.5 : 0.4),
  sniper: (d) => (d > 38 ? 6 : d > 22 ? 3 : 0.8),
  rocket: (d) => (d < 9 ? 0 : d < 50 ? 4.6 : 2),
};

export function newBotState(diff) {
  return {
    diff: DIFFS[diff] ? diff : 'normal', yaw: 0, pitch: 0,
    goal: null, goalPick: false, goalUntil: 0,
    target: null, seenAt: 0, lastSeen: -1e9, lastKnown: null, nextScan: 0,
    strafe: 1, strafeUntil: 0, burstUntil: 0, restUntil: 0,
    nextSwap: 0, nextNade: 0, nextPick: 0, nextHouse: 0,
    refuel: false, chk: 0, chkPos: null, unstick: 0, stuckN: 0,
    offY: 0, offP: 0, seed: Math.random() * 100, idleUntil: 0, lookYaw: 0, goalSprint: false,
  };
}

function bestSlot(p, d) {
  let best = p.slot, bs = -1;
  p.weapons.forEach((w, i) => {
    if (!w || w.mag + w.reserve <= 0) return;
    const s = SCORE[w.id](d) + (i === p.slot ? 0.4 : 0);
    if (s > bs) { bs = s; best = i; }
  });
  return best;
}

function pickGoal(room, p) {
  const hasGun = p.weapons.some((w) => w && w.id !== 'pistol' && w.mag + w.reserve > 0);
  const ammoLow = p.weapons.every((w) => !w || w.mag + w.reserve < 8);
  let best = null, bd = Infinity;
  for (const k of room.pickups) {
    if (!k.active) continue;
    let want = false;
    if (k.type === 'health') want = p.hp < 65;
    else if (k.type === 'shield') want = p.armor < 40;
    else if (k.type === 'grenade') want = nadeCount(p) < 3;
    else if (k.type === 'weapon') want = !hasGun || ammoLow;
    if (!want) continue;
    const d = Math.hypot(k.pos[0] - p.pos[0], (k.pos[1] - p.pos[1]) * 1.5, k.pos[2] - p.pos[2]);
    if (d < bd) { bd = d; best = k; }
  }
  if (best && bd < 80) return { pos: [...best.pos], pick: true };
  const pool = Math.random() < 0.5 ? room.map.spawns : room.map.pickups.map((x) => x.pos);
  return { pos: [...pool[Math.floor(Math.random() * pool.length)]], pick: false };
}

export function botThink(room, p, dt, t) {
  const ai = p.ai, D = DIFFS[ai.diff];
  const eye = [p.pos[0], p.pos[1] + CFG.EYE, p.pos[2]];

  // ---- perception: pick a visible enemy (sticky for a couple of seconds)
  if (t >= ai.nextScan) {
    ai.nextScan = t + 140;
    let best = null, bd = Infinity, curVisible = false;
    for (const q of room.players.values()) {
      if (q === p || !q.alive || t < q.protectUntil) continue;
      const c = [q.pos[0], q.pos[1] + 1.0, q.pos[2]];
      const dv = [c[0] - eye[0], c[1] - eye[1], c[2] - eye[2]];
      const d = Math.hypot(dv[0], dv[1], dv[2]);
      if (d > D.view || d < 0.01) continue;
      if (rayWorld(eye, [dv[0] / d, dv[1] / d, dv[2] / d], d, room.map) < d - 0.6) continue;
      if (q.id === ai.target) curVisible = true;
      if (d < bd) { bd = d; best = q; }
    }
    if (curVisible && t - ai.seenAt < 2500) { ai.lastSeen = t; }
    else if (best) { if (ai.target !== best.id) { ai.target = best.id; ai.seenAt = t; ai.offY = rand(-0.35, 0.35); ai.offP = rand(-0.18, 0.12); } ai.lastSeen = t; }
    const cur = ai.target != null ? room.players.get(ai.target) : null;
    if (cur && cur.alive && t - ai.lastSeen < 10) ai.lastKnown = [...cur.pos];
  }
  let tgt = ai.target != null ? room.players.get(ai.target) : null;
  if (tgt && !tgt.alive) { ai.target = null; tgt = null; }
  const visible = !!tgt && t - ai.lastSeen < 350;
  const cw = p.weapons[p.slot];
  const W = cw ? WEAPONS[cw.id] : null;
  const d3 = visible ? dist3(p.pos, tgt.pos) : 20;

  // ---- weapon choice / housekeeping
  if (t >= ai.nextSwap) {
    ai.nextSwap = t + 800;
    if (bestSlot(p, d3) !== p.slot) room.onAction(p, 'swap');
  }
  if (!visible && cw && W && t >= ai.nextHouse) {
    ai.nextHouse = t + 600;
    if (cw.mag < W.mag * 0.5 && cw.reserve > 0) room.reload(p);
  }
  if (t >= ai.nextPick) {
    ai.nextPick = t + 500;
    if (cw && (cw.id === 'pistol' || cw.mag + cw.reserve === 0)) room.onAction(p, 'pickup');
  }

  // ---- movement intent (world-space direction wx,wz) and desired altitude
  let wx = 0, wz = 0, goalY = p.pos[1], sprint = false;
  if (visible) {
    const dx = tgt.pos[0] - p.pos[0], dz = tgt.pos[2] - p.pos[2];
    const dh = Math.hypot(dx, dz) || 1, tx = dx / dh, tz = dz / dh;
    const ideal = IDEAL[cw?.id] ?? 15;
    const radial = dh > ideal + 4 ? 1 : dh < ideal - 4 ? -1 : 0;
    if (t >= ai.strafeUntil || (t - p.lastDamage < 300 && Math.random() < 0.03)) {
      ai.strafe = Math.random() < 0.25 ? 0 : Math.random() < 0.5 ? -1 : 1; ai.strafeUntil = t + rand(1100, 2600);
    }
    wx = tx * radial - tz * ai.strafe * 0.8;
    wz = tz * radial + tx * ai.strafe * 0.8;
    goalY = tgt.pos[1] + 0.1;
  } else {
    if (tgt && ai.lastKnown && t - ai.lastSeen < 3000) { ai.goal = ai.lastKnown; ai.goalPick = false; ai.goalUntil = t + 500; }
    else {
      const reached = ai.goal && Math.hypot(ai.goal[0] - p.pos[0], ai.goal[2] - p.pos[2]) < 1.5 && Math.abs(ai.goal[1] - p.pos[1]) < 1.8;
      if (reached && t > ai.idleUntil + 3000 && Math.random() < 0.6) { ai.idleUntil = t + rand(600, 1800); ai.lookYaw = ai.yaw; }
      if (!ai.goal || t > ai.goalUntil || reached) {
        const g = pickGoal(room, p); ai.goal = g.pos; ai.goalPick = g.pick; ai.goalUntil = t + 12000;
        ai.goalSprint = g.pick || Math.random() < D.sprint;
      }
    }
    const dx = ai.goal[0] - p.pos[0], dz = ai.goal[2] - p.pos[2], dh = Math.hypot(dx, dz);
    if (dh > 1.0 && t >= ai.idleUntil) { wx = dx / dh; wz = dz / dh; }
    goalY = t < ai.idleUntil ? p.pos[1] : ai.goal[1] + 0.15; sprint = ai.goalSprint;
  }

  // ---- stuck detection: if we want to move but aren't, fly up and flip strafe
  if (t >= ai.chk) {
    ai.chk = t + 450;
    if (ai.chkPos) {
      const mv = Math.hypot(p.pos[0] - ai.chkPos[0], p.pos[2] - ai.chkPos[2]);
      if ((wx || wz) && mv < 0.7 && t > ai.unstick) {
        ai.unstick = t + 900; ai.strafe *= -1;
        if (++ai.stuckN > 2) { ai.goal = null; ai.stuckN = 0; }
      } else if (mv > 1.5) ai.stuckN = 0;
    }
    ai.chkPos = [p.pos[0], p.pos[1], p.pos[2]];
  }
  if (t < ai.unstick) goalY = Math.max(goalY, p.pos[1] + 4);

  // ---- vertical control: thrust up, or descend (fall brake is automatic)
  if (p.fuel < 0.1) ai.refuel = true; else if (p.fuel > 0.55) ai.refuel = false;
  let jet = false, down = false;
  const y = p.pos[1];
  if (ai.refuel) down = !p.onGround;
  else if (y < goalY - 0.3) jet = true;
  else if (!p.onGround && p.vel[1] < -3 && y < goalY + 1.2) jet = true;
  else if (y > goalY + 1.0) down = true;

  // ---- aiming
  let wantYaw = ai.yaw, wantPitch = 0, aimed = false;
  if (tgt && (visible || t - ai.lastSeen < 800) && ai.lastKnown) {
    const tp = visible ? tgt.pos : ai.lastKnown;
    let ax = tp[0], ay = tp[1] + (cw?.id === 'sniper' ? 1.55 : 1.15), az = tp[2];
    if (visible && cw?.id === 'rocket') {
      const tt = (dist3(eye, [ax, ay, az]) / 35) * (ai.diff === 'easy' ? 0 : ai.diff === 'normal' ? 0.5 : 0.9);
      ax += tgt.vel[0] * tt; az += tgt.vel[2] * tt;
    }
    const dx = ax - eye[0], dy = ay - eye[1], dz = az - eye[2], L = Math.hypot(dx, dy, dz) || 1;
    const decay = Math.exp((-dt * 3000) / D.settle); ai.offY *= decay; ai.offP *= decay;
    const wob = Math.sin(t * 0.0019 + ai.seed) * 0.6 + Math.sin(t * 0.0041 + ai.seed * 2) * 0.4;
    wantYaw = Math.atan2(-dx, -dz) + ai.offY + wob * D.aim;
    wantPitch = Math.asin(clamp(dy / L, -1, 1)) + ai.offP + Math.cos(t * 0.0023 + ai.seed) * D.aim * 0.6;
    aimed = visible;
  } else if (t < ai.idleUntil) { wantYaw = ai.lookYaw + Math.sin(t * 0.0015 + ai.seed) * 1.1; }     // glance around
  else if (wx || wz) wantYaw = Math.atan2(-wx, -wz);
  // human-like turning: ease toward the target, never faster than D.turn
  const ease = 1 - Math.exp(-7 * dt), cap = D.turn * dt;
  ai.yaw = wrap(ai.yaw + clamp(wrap(wantYaw - ai.yaw) * ease * 1.6, -cap, cap));
  ai.pitch += clamp((wantPitch - ai.pitch) * ease * 1.6, -cap, cap);
  const aimErr = Math.abs(wrap(wantYaw - ai.yaw)) + Math.abs(wantPitch - ai.pitch);
  p.yaw = p.aimYaw = ai.yaw; p.pitch = p.aimPitch = ai.pitch;

  // ---- apply movement through the shared (authoritative) physics
  if (t < ai.burstUntil) { wx *= 0.5; wz *= 0.5; sprint = false; }
  const sy = Math.sin(ai.yaw), cy = Math.cos(ai.yaw);
  let mx = cy * wx - sy * wz, mz = -sy * wx - cy * wz;
  const ml = Math.hypot(mx, mz); if (ml > 1) { mx /= ml; mz /= ml; }
  stepPlayer(p, { mx, mz, yaw: ai.yaw, jump: jet, jet, sprint, down }, dt, room.map);
  p.jet = p.thrusting;

  // ---- combat
  if (!aimed || !cw) return;
  const hd = Math.hypot(tgt.pos[0] - p.pos[0], tgt.pos[2] - p.pos[2]);
  if (hd < 1.8 && Math.abs(tgt.pos[1] - p.pos[1]) < 1.4) room.onAction(p, 'melee');

  if (nadeCount(p) > 0 && t >= ai.nextNade && d3 > 7 && d3 < 22 && t - ai.seenAt > D.react && aimErr < 0.2) {
    ai.nextNade = t + D.nade * (0.6 + Math.random() * 0.8);
    const r = Math.random(); p.nadeSel = r < 0.6 ? 'frag' : r < 0.85 ? 'gas' : 'prox';
    p.aimPitch = ai.pitch + clamp((d3 - 10) / 36, -0.2, 0.7); p.aimYaw = ai.yaw + rand(-D.aim, D.aim) * 2;
    room.onAction(p, 'nade');
    p.aimPitch = ai.pitch; p.aimYaw = ai.yaw;
  }

  if (t - ai.seenAt >= D.react && aimErr < 0.12 && !(cw.id === 'rocket' && d3 < 7) && !(cw.id === 'shotgun' && d3 > 18)) {
    if (t >= ai.restUntil && t >= ai.burstUntil) {
      ai.burstUntil = t + 300 + Math.random() * 700;
      ai.restUntil = ai.burstUntil + D.rest * (150 + Math.random() * 350);
    }
    if (t < ai.burstUntil) {
      p.aimYaw = ai.yaw + rand(-D.aim, D.aim) * 0.5; p.aimPitch = ai.pitch + rand(-D.aim, D.aim) * 0.5;
      room.tryFire(p, t, cw.id === 'sniper');
      p.aimYaw = ai.yaw; p.aimPitch = ai.pitch;
    }
  }
}
