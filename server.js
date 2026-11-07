// server.js — static file server + authoritative WebSocket game server (with solo bots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';
import { CFG, WEAPONS, WEAPON_POOL, MAP, stepPlayer, aimDir, rayWorld, rayBox, hitboxes, inBox, clamp } from './public/shared.js';
import { DIFFS, BOT_NAMES, newBotState, botThink } from './bots.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;
const MAX_ROOMS = 60;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};
// three.js is served from node_modules (installed by `npm install`), so there is no CDN dependency.
const VENDOR = { '/vendor/three.module.js': path.join(__dirname, 'node_modules/three/build/three.module.js') };

// ---------- static files (in-memory cache, gzip for text assets)
const fileCache = new Map();
async function serveFile(req, res, file, cacheControl) {
  let st;
  try { st = await fs.promises.stat(file); if (!st.isFile()) throw new Error('nf'); }
  catch { res.writeHead(404); return res.end('Not found'); }
  let e = fileCache.get(file);
  if (!e || e.m !== st.mtimeMs) {
    const buf = await fs.promises.readFile(file);
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    const gz = /^(text\/|application\/json|image\/svg)/.test(type) ? zlib.gzipSync(buf, { level: 9 }) : null;
    e = { m: st.mtimeMs, buf, gz, type };
    fileCache.set(file, e);
  }
  const useGz = !!e.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = useGz ? e.gz : e.buf;
  const h = {
    'Content-Type': e.type + (e.type.startsWith('text/') ? '; charset=utf-8' : ''),
    'Cache-Control': cacheControl, 'Content-Length': body.length, Vary: 'Accept-Encoding',
  };
  if (useGz) h['Content-Encoding'] = 'gzip';
  res.writeHead(200, h);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); }
  catch { res.writeHead(400); return res.end(); }
  if (pathname === '/health') { res.writeHead(200); return res.end('ok'); }
  const done = (err) => { if (err && !res.headersSent) { res.writeHead(500); res.end(); } };
  if (VENDOR[pathname]) return serveFile(req, res, VENDOR[pathname], 'public, max-age=86400').catch(done);
  const p = path.normalize(path.join(PUB, pathname === '/' ? 'index.html' : pathname));
  if (!p.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(req, res, p, 'no-cache').catch(done);
});

const wss = new WebSocketServer({ server, maxPayload: 4096 });
const rooms = new Map();
const now = () => Date.now();
const r2 = (v) => Math.round(v * 100) / 100;
const rnd = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const norm = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const send = (ws, o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const mkW = (id) => ({ id, mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve });
const COLORS = ['#ff5252', '#40c4ff', '#69f0ae', '#ffd740', '#e040fb', '#ff9100', '#18ffff', '#eeff41', '#ff80ab', '#b388ff', '#a1887f', '#ffffff'];
const PICK_RESPAWN = { weapon: 20000, health: 30000, shield: 60000, grenade: 25000 };
let nextId = 1;

class Room {
  constructor(code, opts = {}) {
    this.code = code; this.players = new Map(); this.projectiles = []; this.events = [];
    this.nextProj = 1; this.nextPick = 1000; this.solo = !!opts.solo;
    this.resetPickups();
    this.state = 'playing'; this.matchEnd = now() + CFG.MATCH_MS; this.endAt = 0;
    for (let i = 0; i < (opts.bots || 0); i++) this.addBot(opts.diff);
  }
  resetPickups() {
    this.pickups = MAP.pickups.map((n, i) => ({ id: i, type: n.type, w: n.type === 'weapon' ? rnd(WEAPON_POOL) : null, pos: n.pos, active: true, respawnAt: 0 }));
  }
  humans() { let n = 0; for (const p of this.players.values()) if (!p.bot) n++; return n; }
  add(ws, name, bot = false, diff = 'normal') {
    const used = new Set([...this.players.values()].map((p) => p.color));
    const p = {
      id: nextId++, ws, name, bot, color: COLORS.find((c) => !used.has(c)) || COLORS[0],
      pos: [0, 0, 0], vel: [0, 0, 0], onGround: false, fuel: 1, groundTime: 0,
      hoverArmed: false, pj: false, air: 0, thrusting: false,
      yaw: 0, pitch: 0, aimYaw: 0, aimPitch: 0, jet: false,
      hp: 100, armor: 0, alive: false, respawnAt: 0, protectUntil: 0,
      weapons: [null, null], slot: 0, nextFire: 0, reloadUntil: 0, grenades: 3, nextNade: 0, nextMelee: 0,
      kills: 0, deaths: 0, lastDamage: 0, lastSeq: 0, budget: 0.1, lastInputAt: now(), history: [], priv: [],
      ai: bot ? newBotState(diff) : null,
    };
    this.players.set(p.id, p);
    this.spawn(p);
    if (!bot) {
      send(ws, { type: 'welcome', id: p.id, room: this.code, solo: this.solo });
      this.events.push({ e: 'msg', text: `${name} joined` });
    }
    this.roster();
    return p;
  }
  addBot(diff) {
    const taken = new Set([...this.players.values()].map((p) => p.name));
    const pool = BOT_NAMES.filter((n) => !taken.has(`${n} [BOT]`));
    return this.add(null, `${rnd(pool.length ? pool : BOT_NAMES)} [BOT]`, true, diff);
  }
  remove(p) {
    this.players.delete(p.id);
    this.events.push({ e: 'msg', text: `${p.name} left` });
    this.roster();
  }
  roster() {
    const list = [...this.players.values()].map((p) => ({ id: p.id, name: p.name, color: p.color, kills: p.kills, deaths: p.deaths, bot: p.bot }));
    for (const p of this.players.values()) send(p.ws, { type: 'r', list });
  }
  spawn(p) {
    const enemies = [...this.players.values()].filter((o) => o !== p && o.alive);
    let best = MAP.spawns[0], bestD = -1;
    for (const s of MAP.spawns) {
      let d = 1000;
      for (const e of enemies) d = Math.min(d, dist(s, e.pos));
      d += Math.random() * 5;
      if (d > bestD) { bestD = d; best = s; }
    }
    Object.assign(p, {
      pos: [...best], vel: [0, 0, 0], onGround: false, hp: 100, armor: 0, alive: true, fuel: 1, groundTime: 0,
      hoverArmed: false, pj: false, air: 0, thrusting: false, jet: false,
      weapons: [mkW('pistol'), null], slot: 0, grenades: 3, reloadUntil: 0, nextFire: 0,
      protectUntil: now() + CFG.PROTECT_MS, history: [],
    });
    p.yaw = p.aimYaw = Math.atan2(best[0], best[2]);  // face map centre
    if (p.ai) Object.assign(p.ai, { yaw: p.yaw, pitch: 0, goal: null, target: null, lastKnown: null, unstick: 0, stuckN: 0, chkPos: null });
    else p.priv.push({ e: 'spawn', yaw: p.yaw });
  }

  onMsg(p, m) {
    if (m.type === 'i') this.onInput(p, m);
    else if (m.type === 'a') this.onAction(p, m.a);
    else if (m.type === 'ping') send(p.ws, { type: 'pong', c: m.c, s: now() });
    else if (m.type === 'chat') {
      const t = String(m.text || '').slice(0, 120).trim();
      if (t) this.events.push({ e: 'chat', n: p.name, c: p.color, text: t });
    }
  }
  onInput(p, m) {
    const t = now();
    p.budget = Math.min(p.budget + (t - p.lastInputAt) / 1000, 0.25); // anti speed-hack
    p.lastInputAt = t;
    if (typeof m.seq !== 'number') return;
    p.lastSeq = m.seq;
    p.yaw = +m.yaw || 0; p.pitch = clamp(+m.pitch || 0, -1.5, 1.5);
    p.aimYaw = Number.isFinite(+m.ay) ? +m.ay : p.yaw;
    p.aimPitch = clamp(+m.ap || 0, -1.55, 1.55);
    if (!p.alive || this.state !== 'playing') return;
    const dt = Math.min(CFG.INPUT_DT, p.budget); p.budget -= dt;
    stepPlayer(p, { mx: +m.mx || 0, mz: +m.mz || 0, yaw: p.yaw, jump: !!m.j, jet: !!m.jet, sprint: !!m.sp, down: !!m.dn }, dt);
    p.jet = p.thrusting;
    if (m.f) this.tryFire(p, clamp(+m.t || t, t - CFG.MAX_REWIND_MS, t), !!m.z);
  }
  onAction(p, a) {
    if (!p.alive || this.state !== 'playing') return;
    const t = now();
    if (a === 'reload') this.reload(p);
    else if (a === 'swap') {
      const o = 1 - p.slot;
      if (p.weapons[o]) { p.slot = o; p.reloadUntil = 0; p.nextFire = Math.max(p.nextFire, t + 250); }
    } else if (a === 'nade') {
      if (p.grenades > 0 && t >= p.nextNade) {
        p.grenades--; p.nextNade = t + CFG.NADE_CD; p.protectUntil = 0;
        this.spawnProj(p, 'nade', [p.pos[0], p.pos[1] + CFG.EYE, p.pos[2]], aimDir(p.aimYaw, p.aimPitch + 0.15), CFG.NADE_SPEED);
      }
    } else if (a === 'melee') this.melee(p);
    else if (a === 'pickup') this.swapPickup(p);
  }

  tryFire(p, rt, zoom) {
    const t = now(), w = p.weapons[p.slot];
    if (!w) return;
    const W = WEAPONS[w.id];
    if (t < p.nextFire || t < p.reloadUntil) return;
    if (w.mag <= 0) { this.reload(p); return; }
    w.mag--; p.nextFire = t + 1000 / W.rate; p.protectUntil = 0;
    const o = [p.pos[0], p.pos[1] + CFG.EYE, p.pos[2]];
    const base = aimDir(p.aimYaw, p.aimPitch);
    if (W.projectile) this.spawnProj(p, 'rocket', o, base, W.speed);
    else {
      const sp = W.spread * (zoom ? (W.scope ? 0 : 0.4) : 1);
      for (let i = 0; i < (W.pellets || 1); i++) {
        const d = norm([base[0] + (Math.random() - 0.5) * 2 * sp, base[1] + (Math.random() - 0.5) * 2 * sp, base[2] + (Math.random() - 0.5) * 2 * sp]);
        this.hitscan(p, o, d, W, rt, w.id);
      }
    }
    if (w.mag === 0 && w.reserve > 0) this.reload(p);
  }
  hitscan(p, o, d, W, rt, wid) {
    let best = rayWorld(o, d, W.range), target = null, head = false;
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      for (const hb of hitboxes(this.rewind(q, rt))) {
        const tt = rayBox(o, d, hb.min, hb.max);
        if (tt < best) { best = tt; target = q; head = hb.head; }
      }
    }
    const hit = [o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best];
    this.events.push({ e: 'shot', id: p.id, o: o.map(r2), h: hit.map(r2), pl: target ? 1 : 0 });
    if (target) this.damage(target, W.dmg * (head ? CFG.HEADSHOT : 1), p, wid, head);
  }
  rewind(q, t) {  // lag compensation: where was q at time t?
    const h = q.history;
    if (!h.length || t >= h[h.length - 1].t) return q.pos;
    for (let i = h.length - 1; i > 0; i--) {
      const a = h[i - 1], b = h[i];
      if (a.t <= t) return lerp3(a.p, b.p, (t - a.t) / (b.t - a.t || 1));
    }
    return h[0].p;
  }
  reload(p) {
    const w = p.weapons[p.slot]; if (!w) return;
    const W = WEAPONS[w.id];
    if (w.mag >= W.mag || w.reserve <= 0 || now() < p.reloadUntil) return;
    p.reloadUntil = now() + W.reload * 1000;
  }
  melee(p) {
    const t = now(); if (t < p.nextMelee) return;
    p.nextMelee = t + CFG.MELEE_CD; p.protectUntil = 0;
    const f = aimDir(p.aimYaw, 0);
    this.events.push({ e: 'melee', id: p.id });
    for (const q of this.players.values()) {
      if (q === p || !q.alive) continue;
      const dx = q.pos[0] - p.pos[0], dy = q.pos[1] - p.pos[1], dz = q.pos[2] - p.pos[2];
      const dd = Math.hypot(dx, dz);
      if (dd > CFG.MELEE_RANGE || Math.abs(dy) > 1.5) continue;
      if ((dx * f[0] + dz * f[2]) / (dd || 1) < 0.5) continue;
      const qf = aimDir(q.yaw, 0);
      const backstab = qf[0] * f[0] + qf[2] * f[2] > 0.5;
      this.damage(q, backstab ? 200 : CFG.MELEE_DMG, p, 'melee', false);
      break;
    }
  }
  damage(q, amt, att, wid, head = false, from = null) {
    const t = now();
    if (!q.alive || t < q.protectUntil || this.state !== 'playing') return;
    amt = Math.round(amt);
    if (q.armor > 0) { const a = Math.min(q.armor, Math.round(amt * 0.6)); q.armor -= a; amt -= a; }
    q.hp -= amt; q.lastDamage = t;
    if (att && att !== q) att.priv.push({ e: 'hit', head, kill: q.hp <= 0 });
    const src = from || (att ? att.pos : null);
    q.priv.push({ e: 'dmg', from: src ? [r2(src[0]), r2(src[2])] : null });
    if (q.hp <= 0) this.kill(q, att, wid, head);
  }
  kill(q, att, wid, head) {
    q.alive = false; q.hp = 0; q.deaths++; q.respawnAt = now() + CFG.RESPAWN_MS; q.jet = false; q.thrusting = false;
    const cw = q.weapons[q.slot];
    if (cw && cw.id !== 'pistol') this.drop(q.pos, cw);
    if (att && att !== q) att.kills++; else if (q.kills > 0) q.kills--;
    this.events.push({ e: 'kill', k: att && att !== q ? att.name : null, kc: att?.color, v: q.name, vc: q.color, w: wid, head });
    this.roster();
    if (att && att.kills >= CFG.KILL_LIMIT) this.endMatch(att);
  }
  drop(pos, w) {
    const top = pos[1] + 1;
    const gy = top - rayWorld([pos[0], top, pos[2]], [0, -1, 0], 200);
    this.pickups.push({ id: this.nextPick++, type: 'weapon', w: w.id, mag: w.mag, reserve: w.reserve, pos: [pos[0], gy, pos[2]], active: true, temp: true, expires: now() + 15000 });
  }
  consume(k) {
    if (k.temp) { k.active = false; k.dead = true; }
    else { k.active = false; k.respawnAt = now() + PICK_RESPAWN[k.type]; }
  }
  swapPickup(p) {
    let best = null, bd = 2.2;
    for (const k of this.pickups) {
      if (!k.active || k.type !== 'weapon') continue;
      const d = dist(k.pos, p.pos); if (d < bd) { bd = d; best = k; }
    }
    if (!best || p.weapons.some((w) => w && w.id === best.w)) return;
    const cur = p.weapons[p.slot];
    p.weapons[p.slot] = { id: best.w, mag: best.mag ?? WEAPONS[best.w].mag, reserve: best.reserve ?? WEAPONS[best.w].reserve };
    p.reloadUntil = 0;
    this.consume(best);
    if (cur) this.drop(p.pos, cur);
    p.priv.push({ e: 'pick', type: 'weapon', w: best.w });
  }
  pickupCheck(p) {
    for (const k of this.pickups) {
      if (!k.active) continue;
      const dy = k.pos[1] - p.pos[1];
      if (Math.abs(k.pos[0] - p.pos[0]) > 1.2 || Math.abs(k.pos[2] - p.pos[2]) > 1.2 || dy < -0.6 || dy > 1.8) continue;
      let took = false;
      if (k.type === 'health' && p.hp < 100) { p.hp = Math.min(100, p.hp + 50); took = true; }
      else if (k.type === 'shield' && p.armor < 100) { p.armor = Math.min(100, p.armor + 50); took = true; }
      else if (k.type === 'grenade' && p.grenades < 5) { p.grenades = Math.min(5, p.grenades + 2); took = true; }
      else if (k.type === 'weapon') {
        const W = WEAPONS[k.w];
        const have = p.weapons.find((w) => w && w.id === k.w);
        if (have) { if (have.reserve < W.reserve * 2) { have.reserve = Math.min(W.reserve * 2, have.reserve + W.mag); took = true; } }
        else {
          const e = p.weapons.indexOf(null);
          if (e >= 0) { p.weapons[e] = { id: k.w, mag: k.mag ?? W.mag, reserve: k.reserve ?? W.reserve }; took = true; }
        }
      }
      if (took) { this.consume(k); p.priv.push({ e: 'pick', type: k.type, w: k.w }); }
    }
  }

  spawnProj(p, type, o, d, speed) {
    const v = [d[0] * speed, d[1] * speed, d[2] * speed];
    if (type === 'nade') { v[0] += p.vel[0] * 0.5; v[1] += p.vel[1] * 0.5; v[2] += p.vel[2] * 0.5; }
    this.projectiles.push({ id: this.nextProj++, type, owner: p.id, pos: [o[0] + d[0] * 0.6, o[1] + d[1] * 0.6, o[2] + d[2] * 0.6], vel: v, born: now() });
  }
  updateProjectiles(dt) {
    const t = now();
    for (const pr of this.projectiles) {
      if (pr.dead) continue;
      const n = Math.max(1, Math.ceil(Math.hypot(...pr.vel) * dt / 0.25)), h = dt / n;
      for (let i = 0; i < n && !pr.dead; i++) {
        if (pr.type === 'nade') pr.vel[1] -= CFG.G * h;
        for (let a = 0; a < 3; a++) {
          const old = pr.pos[a];
          pr.pos[a] += pr.vel[a] * h;
          if (MAP.boxes.some((b) => inBox(pr.pos, b))) {
            pr.pos[a] = old;
            if (pr.type === 'rocket') { this.explode(pr, WEAPONS.rocket.dmg, WEAPONS.rocket.radius); break; }
            pr.vel[a] *= -0.45; pr.vel[(a + 1) % 3] *= 0.8; pr.vel[(a + 2) % 3] *= 0.8;
          }
        }
        if (pr.dead) break;
        if (pr.type === 'rocket') {
          for (const q of this.players.values()) {
            if (!q.alive || (q.id === pr.owner && t - pr.born < 300)) continue;
            if (hitboxes(q.pos).some((b) => inBox(pr.pos, b))) { this.explode(pr, WEAPONS.rocket.dmg, WEAPONS.rocket.radius); break; }
          }
        }
      }
      if (!pr.dead && pr.type === 'nade' && t - pr.born > CFG.NADE_FUSE) this.explode(pr, CFG.NADE_DMG, CFG.NADE_R);
      if (t - pr.born > 8000) pr.dead = true;
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }
  explode(pr, dmg, radius) {
    pr.dead = true;
    const att = this.players.get(pr.owner) || null;
    this.events.push({ e: 'boom', p: pr.pos.map(r2), r: radius });
    for (const q of this.players.values()) {
      if (!q.alive) continue;
      const c = [q.pos[0], q.pos[1] + 0.9, q.pos[2]];
      const dv = [c[0] - pr.pos[0], c[1] - pr.pos[1], c[2] - pr.pos[2]];
      const d = Math.hypot(...dv);
      if (d > radius) continue;
      if (d > 0.01) {
        const dir = dv.map((x) => x / d);
        if (rayWorld(pr.pos, dir, d) < d - 0.05) continue;  // behind cover
        const kb = (1 - d / radius) * 14;
        q.vel[0] += dir[0] * kb; q.vel[1] += dir[1] * kb + 3; q.vel[2] += dir[2] * kb;
      }
      let amt = dmg * (1 - (d / radius) * 0.7);
      if (q.id === pr.owner) amt *= 0.5;
      this.damage(q, amt, att, pr.type === 'nade' ? 'grenade' : 'rocket', false, pr.pos);
    }
  }

  endMatch(winner) {
    this.state = 'ended'; this.endAt = now() + CFG.END_MS; this.projectiles = [];
    const standings = [...this.players.values()].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths)
      .map((p) => ({ name: p.name, color: p.color, kills: p.kills, deaths: p.deaths }));
    this.events.push({ e: 'end', winner: winner?.name || null, standings });
  }
  resetMatch() {
    this.state = 'playing'; this.matchEnd = now() + CFG.MATCH_MS; this.resetPickups();
    for (const p of this.players.values()) { p.kills = 0; p.deaths = 0; this.spawn(p); }
    this.events.push({ e: 'start' });
    this.roster();
  }

  tick(dt) {
    const t = now();
    if (this.state === 'ended') { if (t >= this.endAt) this.resetMatch(); return; }
    if (t >= this.matchEnd) { this.endMatch([...this.players.values()].sort((a, b) => b.kills - a.kills)[0]); return; }
    for (const p of this.players.values()) {
      if (!p.alive) { if (t >= p.respawnAt) this.spawn(p); continue; }
      if (p.reloadUntil && t >= p.reloadUntil) {
        const w = p.weapons[p.slot];
        if (w) { const take = Math.min(WEAPONS[w.id].mag - w.mag, w.reserve); w.mag += take; w.reserve -= take; }
        p.reloadUntil = 0;
      }
      if (p.bot) { botThink(this, p, dt, t); if (!p.alive) continue; }
      if (t - p.lastDamage > CFG.REGEN_DELAY && p.hp < 100) p.hp = Math.min(100, p.hp + CFG.REGEN_RATE * dt);
      if (p.pos[1] < -10) { p.protectUntil = 0; this.damage(p, 999, null, 'void'); continue; }
      this.pickupCheck(p);
      p.history.push({ t, p: [...p.pos] });
      while (p.history.length && p.history[0].t < t - 1000) p.history.shift();
    }
    this.updateProjectiles(dt);
    for (const k of this.pickups) {
      if (!k.active && !k.temp && t >= k.respawnAt) { k.active = true; if (k.type === 'weapon') k.w = rnd(WEAPON_POOL); }
      if (k.temp && t > k.expires) k.dead = true;
    }
    this.pickups = this.pickups.filter((k) => !k.dead);
  }

  snapshot() {
    const t = now();
    const ps = [...this.players.values()].map((p) => [p.id, r2(p.pos[0]), r2(p.pos[1]), r2(p.pos[2]), r2(p.aimYaw), r2(p.aimPitch),
      p.alive ? 1 : 0, p.weapons[p.slot]?.id || '', t < p.protectUntil ? 1 : 0, Math.ceil(p.hp), p.jet && p.alive ? 1 : 0]);
    const pr = this.projectiles.map((q) => [q.id, q.type, r2(q.pos[0]), r2(q.pos[1]), r2(q.pos[2])]);
    const pk = this.pickups.filter((k) => k.active).map((k) => [k.id, k.type, k.w || '', r2(k.pos[0]), r2(k.pos[1]), r2(k.pos[2])]);
    const ev = this.events; this.events = [];
    const time = Math.max(0, (this.state === 'playing' ? this.matchEnd : this.endAt) - t);
    for (const p of this.players.values()) {
      if (p.ws) send(p.ws, {
        type: 's', t, ack: p.lastSeq, st: this.state, time, ps, pr, pk, ev, pv: p.priv,
        me: { pos: p.pos, vel: p.vel, og: p.onGround, fuel: p.fuel, gt: p.groundTime, ha: p.hoverArmed, pj: p.pj, air: p.air, th: p.thrusting,
              hp: Math.ceil(p.hp), ar: p.armor, alive: p.alive, rs: Math.max(0, p.respawnAt - t), w: p.weapons, slot: p.slot,
              rl: p.reloadUntil ? Math.max(0, p.reloadUntil - t) : 0, gn: p.grenades, prot: t < p.protectUntil },
      });
      p.priv = [];
    }
  }
}

wss.on('connection', (ws) => {
  let room = null, player = null;
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (!player) {
      if (m.type !== 'join') return;
      const name = String(m.name || 'Player').replace(/[<>&"']/g, '').slice(0, 16).trim() || 'Player';
      if (m.solo) {   // private solo match with bots
        if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'full' });
        let code; do { code = 'S' + Math.random().toString(36).slice(2, 7).toUpperCase(); } while (rooms.has(code));
        const bots = clamp(Math.floor(+m.bots || 0), 1, CFG.MAX_PLAYERS - 1);
        room = new Room(code, { solo: true, bots, diff: DIFFS[m.diff] ? m.diff : 'normal' });
        rooms.set(code, room);
      } else {
        const code = String(m.room || 'PUBLIC').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'PUBLIC';
        room = rooms.get(code);
        if (!room) {
          if (rooms.size >= MAX_ROOMS) return send(ws, { type: 'full' });
          room = new Room(code); rooms.set(code, room);
        }
      }
      if (room.players.size >= CFG.MAX_PLAYERS) return send(ws, { type: 'full' });
      player = room.add(ws, name);
      return;
    }
    room.onMsg(player, m);
  });
  ws.on('close', () => {
    if (room && player) room.remove(player);
    if (room && room.humans() === 0) rooms.delete(room.code);
  });
  ws.on('error', () => {});
});

let last = now();
setInterval(() => {
  const t = now(), dt = Math.min(0.1, (t - last) / 1000); last = t;
  for (const r of rooms.values()) r.tick(dt);
}, 1000 / CFG.TICK);
setInterval(() => { for (const r of rooms.values()) r.snapshot(); }, CFG.SNAP_MS);

server.listen(PORT, '0.0.0.0', () => console.log(`Jetpack Brawl running on http://localhost:${PORT}`));
