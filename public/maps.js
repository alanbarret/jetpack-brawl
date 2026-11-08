// public/maps.js — all playable maps. Imported by BOTH server.js and the browser.
// A map is made of axis-aligned boxes (collision + visuals). B(centerX, bottomY, centerZ, w, h, d, colour|null).
// colour null = invisible collider. `theme` is purely visual (the server ignores it).

// Deterministic RNG so the server and every browser generate exactly the same scenery.
function rng(str) {
  let h = 2166136261; for (const c of str) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h += 0x6d2b79f5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Natural maps: no visible square walls. The play area is ringed by an irregular band of rocks / cliffs / trees
// (each with a box collider), the ground runs on to the horizon, and invisible limits sit hidden behind the ring.
function make(def) {
  const boxes = [], deco = [];
  const B = (cx, y, cz, w, h, d, c = '#8a7f6a') => boxes.push({ min: [cx - w / 2, y, cz - d / 2], max: [cx + w / 2, y + h, cz + d / 2], c });
  const { w, d, h } = def, N = def.nature, R = rng(def.id), rand = (a, b) => a + R() * (b - a);
  const band = N.band, HW = w / 2 + band, HD = d / 2 + band;            // outer (invisible) limits
  // invisible shell: floor, limits, ceiling (Deep Mine keeps a visible rock ceiling)
  B(0, -1, 0, HW * 2, 1, HD * 2, null);
  B(0, 0, -HD - 0.5, HW * 2 + 2, h, 1, null); B(0, 0, HD + 0.5, HW * 2 + 2, h, 1, null);
  B(-HW - 0.5, 0, 0, 1, h, HD * 2 + 2, null); B(HW + 0.5, 0, 0, 1, h, HD * 2 + 2, null);
  B(0, h, 0, HW * 2 + 2, 1, HD * 2 + 2, def.ceil === undefined ? null : def.ceil);
  const mirror = (x, y, z, ww, hh, dd, c) => { B(x, y, z, ww, hh, dd, c); B(-x, y, -z, ww, hh, dd, c); };
  def.build(B, mirror);
  const built = boxes.length;

  const keep = [...def.spawns, ...def.weapons, ...def.health, ...def.shield, ...def.grenade.map((g) => g.slice(0, 3))];
  const clear = (x, z, r, gap) => keep.every((q) => Math.hypot(q[0] - x, q[2] - z) > r + gap);
  const solid = (x, z, r) => boxes.slice(6, built).some((b) => x + r > b.min[0] - 1.2 && x - r < b.max[0] + 1.2 && z + r > b.min[2] - 1.2 && z - r < b.max[2] + 1.2);
  const rock = (x, z, size, ht, col = N.rock) => {
    B(x, 0, z, size * 0.72, ht * 0.92, size * 0.72, null);
    deco.push({ k: 'rock', x, z, sx: size, sy: ht, sz: size * rand(0.75, 1.15), rot: rand(0, 6.28), v: Math.floor(R() * 4), c: col });
  };
  const tree = (x, z, ht) => {
    B(x, 0, z, 0.9, ht * 0.55, 0.9, null);
    deco.push({ k: 'tree', x, z, sy: ht, rot: rand(0, 6.28), style: N.tree });
  };

  // 1) the edge ring, following a rounded rectangle with a wobbly radius
  const ix = w / 2 + 1, iz = d / 2 + 1, cr = Math.min(ix, iz) * 0.5;
  const path = [];
  const seg = [[ix - cr, iz - cr, 0], [-(ix - cr), iz - cr, 1], [-(ix - cr), -(iz - cr), 2], [ix - cr, -(iz - cr), 3]];
  const per = 2 * (ix - cr) * 2 + 2 * (iz - cr) * 2 + 2 * Math.PI * cr, step = N.spacing;
  for (let t = 0; t < per; t += step * rand(0.75, 1.15)) {
    // walk the perimeter: straight edges joined by quarter circles
    let u = t, px, pz, nx, nz;
    const L1 = 2 * (ix - cr), L2 = 2 * (iz - cr), Q = (Math.PI * cr) / 2;
    const parts = [['e', L2, ix, -(iz - cr), 0, 1, 1, 0], ['c', Q, 0], ['e', L1, ix - cr, iz, -1, 0, 0, 1], ['c', Q, 1], ['e', L2, -ix, iz - cr, 0, -1, -1, 0], ['c', Q, 2], ['e', L1, -(ix - cr), -iz, 1, 0, 0, -1], ['c', Q, 3]];
    for (const pt of parts) {
      if (u > pt[1]) { u -= pt[1]; continue; }
      if (pt[0] === 'e') { px = pt[2] + pt[4] * u; pz = pt[3] + pt[5] * u; nx = pt[6]; nz = pt[7]; }
      else { const c = seg[pt[2]], a = (pt[2] * Math.PI) / 2 + u / cr; nx = Math.cos(a); nz = Math.sin(a); px = c[0] + nx * cr; pz = c[1] + nz * cr; }
      break;
    }
    path.push([px, pz, nx, nz]);
  }
  for (const [px, pz, nx, nz] of path) {
    const isTree = N.tree && R() < N.treeP;
    const size = isTree ? 2 : rand(N.rockS[0], N.rockS[1]), ht = isTree ? rand(N.treeH[0], N.treeH[1]) : rand(N.rockH[0], N.rockH[1]);
    let off = rand(-2, band * 0.35);
    while (off < band - size / 2 - 1 && !clear(px + nx * off, pz + nz * off, size * 0.5, 3)) off += 1.5;
    off = Math.min(off, band - size / 2 - 0.5);
    const x = px + nx * off, z = pz + nz * off;
    if (isTree) tree(x, z, ht); else rock(x, z, size, ht);
    // a second, lower boulder in front or behind so the edge has depth
    if (R() < 0.55) {
      const o2 = off + rand(-4, 6), s2 = rand(N.rockS[0] * 0.5, N.rockS[0]), x2 = px + nx * o2 + -nz * rand(-2, 2), z2 = pz + nz * o2 + nx * rand(-2, 2);
      if (o2 < band - s2 / 2 && clear(x2, z2, s2 * 0.5, 3)) rock(x2, z2, s2, ht * rand(0.35, 0.6));
    }
  }
  // fill the hidden corners behind the ring so nobody hides there
  for (const [cx, cz] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    for (let k = 0; k < 3; k++) {
      const s2 = rand(N.rockS[0], N.rockS[1]) * 1.2;
      rock(cx * (HW - s2 / 2 - rand(0, 6)), cz * (HD - s2 / 2 - rand(0, 6)), s2, rand(N.rockH[0], N.rockH[1]));
    }
  }
  // 2) a few boulders / trees inside the arena for cover
  for (let n = 0, tries = 0; n < N.scatter && tries < 400; tries++) {
    const x = rand(-w / 2 + 4, w / 2 - 4), z = rand(-d / 2 + 4, d / 2 - 4), isTree = N.tree && R() < 0.35;
    const size = isTree ? 2 : rand(1.6, 3.4);
    if (!clear(x, z, size, 3.5) || solid(x, z, size / 2)) continue;
    if (isTree) tree(x, z, rand(N.treeH[0] * 0.8, N.treeH[1])); else rock(x, z, size, rand(1.2, 2.8));
    n++;
  }
  // 3) scenery beyond the limits (visual only) so the land runs on to the horizon
  const far = [];
  for (let n = 0; n < N.far; n++) {
    const a = R() * Math.PI * 2, r = 1 + rand(0.12, 0.9), isTree = N.tree && R() < 0.45;
    const x = Math.cos(a) * HW * r * 1.05, z = Math.sin(a) * HD * r * 1.05;
    far.push(isTree ? { k: 'tree', x, z, sy: rand(N.treeH[0], N.treeH[1] * 1.4), rot: R() * 6.28, style: N.tree }
                    : { k: 'rock', x, z, sx: rand(4, 14), sy: rand(3, N.rockH[1] * 1.2), sz: rand(4, 14), rot: R() * 6.28, v: Math.floor(R() * 4), c: N.rock });
  }

  const P = (type, list) => list.map((pos) => ({ type, pos }));
  return {
    id: def.id, name: def.name, desc: def.desc, code: def.code, w: HW * 2, d: HD * 2, h, inner: [w, d],
    limit: { hx: ix + 2.5, hz: iz + 2.5, r: cr + 2.5 },        // invisible rounded wall along the rock ring (all heights)
    theme: def.theme, nature: N, ground: def.floor, lamps: def.lamps || [], boxes, deco, far,
    spawns: def.spawns,
    pickups: [...P('weapon', def.weapons), ...P('health', def.health), ...P('shield', def.shield),
              ...def.grenade.map((g) => ({ type: 'grenade', pos: g.slice(0, 3), w: g[3] }))],
  };
}

// ---------------------------------------------------------------------------------------------
// 1. OUTPOST — the original desert arena: a central tower, sniper ledges and floating platforms.
const outpost = make({
  id: 'outpost', name: 'Outpost', code: 'PUBOUT', desc: 'Desert base with a central tower and sniper ledges', w: 90, d: 90, h: 30,
  floor: '#6b7d52', wall: '#4a463e',
  nature: { band: 22, spacing: 6.5, rock: '#a88a62', rockS: [6, 11], rockH: [7, 16], tree: 'acacia', treeP: 0.18, treeH: [5, 8], scatter: 7, far: 70 },
  theme: { sky: ['#4a82c4', '#9fc4e8', '#dbe9f2'], fog: ['#b9d2e6', 75, 200], hemi: ['#ffffff', '#556644', 1.3], sun: ['#fff3dd', 2.2, [30, 50, 20]], props: 'mountains', propColor: '#58755a' },
  build(B) {
    B(0, 0, 0, 8, 12, 8, '#a08e6c'); B(0, 12, 0, 14, 1, 14, '#7d6f55');   // central tower + roof
    B(-22, 0, -22, 10, 8, 10, '#9a8a70'); B(22, 0, 22, 10, 8, 10, '#9a8a70');
    B(22, 0, -22, 6, 14, 6, '#8c7b60'); B(-22, 0, 22, 6, 14, 6, '#8c7b60');
    B(-38, 0, 0, 6, 10, 28, '#857a64'); B(38, 0, 0, 6, 10, 28, '#857a64'); // sniper ledges
    B(0, 17, -24, 12, 1, 4, '#6f8fa8'); B(0, 17, 24, 12, 1, 4, '#6f8fa8');  // floating platforms
    B(-24, 19, 0, 4, 1, 12, '#6f8fa8'); B(24, 19, 0, 4, 1, 12, '#6f8fa8');
    B(-12, 0, 0, 1, 3, 8, '#77705f'); B(12, 0, 0, 1, 3, 8, '#77705f');     // cover walls
    B(0, 0, -12, 8, 3, 1, '#77705f'); B(0, 0, 12, 8, 3, 1, '#77705f');
    for (const [x, z, s, hh] of [[-30, -10, 3, 3], [30, 10, 3, 3], [-10, 30, 3, 3], [10, -30, 3, 3], [-32, 32, 4, 2], [32, -32, 4, 2], [-8, -34, 2, 2], [8, 34, 2, 2]])
      B(x, 0, z, s, hh, s, '#a5763d');                                      // crates
  },
  spawns: [[-40, 0, -40], [40, 0, 40], [40, 0, -40], [-40, 0, 40], [0, 0, -40], [0, 0, 40],
           [-28, 0, 0], [28, 0, 0], [-38, 10, 0], [38, 10, 0], [0, 13, 0], [-22, 8, -22], [22, 8, 22]],
  weapons: [[0, 13, 4], [-22, 8, -22], [22, 8, 22], [-38, 10, 8], [38, 10, -8], [0, 0, -20], [0, 0, 20], [-20, 0, 0], [20, 0, 0]],
  health: [[-32, 2, 32], [32, 2, -32], [0, 18, -24], [-40, 0, -20]],
  shield: [[0, 18, 24], [-24, 20, 0]],
  grenade: [[24, 20, 0, 'prox'], [40, 0, 20, 'gas'], [-10, 0, -20, 'gas'], [-40, 0, -20, 'frag']],
});

// ---------------------------------------------------------------------------------------------
// 2. FROSTBITE — icy research base: two fortified ends, a tall central spire, stepped terraces.
const frostbite = make({
  id: 'frostbite', name: 'Frostbite', code: 'PUBICE', desc: 'Frozen base with icy terraces and a central spire', w: 104, d: 60, h: 38,
  floor: '#c9dfeb', wall: '#7fa4bb',
  nature: { band: 22, spacing: 6, rock: '#d9ebf4', rockS: [6, 11], rockH: [8, 18], tree: 'pine', treeP: 0.4, treeH: [8, 13], scatter: 8, far: 80 },
  theme: { sky: ['#1e3a5f', '#7fb2d6', '#e8f4fa'], fog: ['#cfe4f0', 60, 175], hemi: ['#e8f4ff', '#8fb0c4', 1.4], sun: ['#e6f2ff', 2.0, [-30, 50, 25]], props: 'snowpeaks', propColor: '#eef6fa' },
  build(B, M) {
    M(-43, 0, 0, 12, 9, 18, '#b4d2e3');                 // end fortresses
    M(-43, 9, -10, 4, 7, 2, '#9cc3dc');                 // parapet
    M(-36, 0, 14, 5, 5, 5, '#c9e4f2');
    B(0, 0, 0, 6, 20, 6, '#d6eef9'); B(0, 20, 0, 18, 1, 18, '#a9d4ea');   // central spire + deck
    M(-20, 0, -18, 14, 4, 10, '#bfdcec'); M(-14, 4, -18, 8, 4, 10, '#a9d0e6');   // terraces
    M(-18, 12, 14, 12, 1, 5, '#8fc0de');                // floating ice slabs
    B(0, 10, -22, 10, 1, 4, '#8fc0de'); B(0, 10, 22, 10, 1, 4, '#8fc0de');
    M(-8, 0, 10, 6, 2.5, 4, '#eef8fc');                 // igloo cover
    M(-30, 0, -14, 5, 3, 5, '#eef8fc');
    M(10, 0, 20, 2, 7, 2, '#cfeaf7'); M(-10, 0, 20, 2, 7, 2, '#cfeaf7');   // ice pillars
  },
  spawns: [[-43, 9, 4], [43, 9, -4], [-47, 0, -24], [47, 0, 24], [-47, 0, 24], [47, 0, -24], [0, 0, -26], [0, 0, 26],
           [-30, 0, 6], [30, 0, -6], [-18, 13, 14], [18, 13, -14], [0, 21, 6], [-14, 8, -18], [14, 8, 18]],
  weapons: [[0, 21, -5], [-43, 9, -4], [43, 9, 4], [-14, 8, -20], [14, 8, 20], [-26, 0, 10], [26, 0, -10], [0, 11, 22], [0, 11, -22]],
  health: [[-8, 2.5, 10], [8, 2.5, -10], [-30, 3, -14], [30, 3, 14]],
  shield: [[-18, 13, 14], [18, 13, -14]],
  grenade: [[0, 0, 12, 'gas'], [0, 0, -12, 'gas'], [-36, 5, 14, 'prox'], [36, 5, -14, 'prox']],
});

// ---------------------------------------------------------------------------------------------
// 3. DEEP MINE — dark, low-ceilinged tunnels with timber shelves, catwalks and lamp light.
const mine = make({
  id: 'mine', name: 'Deep Mine', code: 'PUBMINE', desc: 'Dark tunnels with a low ceiling and lamp light', w: 112, d: 44, h: 22,
  floor: '#4d3d2e', wall: '#3a2e24', ceil: '#2c231b',
  nature: { band: 12, spacing: 5, rock: '#5a4634', rockS: [6, 10], rockH: [22, 22], tree: null, treeP: 0, treeH: [0, 0], scatter: 4, far: 0, indoor: true },
  theme: { sky: ['#0b0907', '#15100b', '#1f160e'], fog: ['#16100a', 22, 85], hemi: ['#ffd9a8', '#4a2e18', 1.3], sun: ['#ffb870', 0.35, [10, 30, 5]], props: 'none', propColor: '#000' },
  lamps: [[-38, 9, -10], [38, 9, 10], [0, 20.5, 0], [-14, 9, 12], [14, 9, -12], [-38, 9, 12], [38, 9, -12]],
  build(B, M) {
    for (const x of [-40, -24, -8, 8, 24, 40]) { B(x, 0, -10, 2.4, 22, 2.4, '#6b4f33'); B(x, 0, 10, 2.4, 22, 2.4, '#6b4f33'); }   // timber supports
    B(-30, 6, -16, 36, 1, 10, '#8a6a44'); B(30, 6, 16, 36, 1, 10, '#8a6a44');     // side shelves
    B(30, 6, -16, 16, 1, 10, '#8a6a44'); B(-30, 6, 16, 16, 1, 10, '#8a6a44');
    B(0, 13, 0, 34, 1, 6, '#9a7548');                                              // central catwalk
    B(-17, 0, 0, 3, 12, 3, '#6b4f33'); B(17, 0, 0, 3, 12, 3, '#6b4f33');          // catwalk legs
    M(-20, 0, 0, 10, 4, 12, '#5d4b3a');                                             // rock mounds
    M(0, 0, -14, 3, 5, 3, '#6a5844');                                               // stalagmites
    M(-46, 0, 8, 6, 3, 8, '#5d4b3a');
    M(36, 0, 3, 3, 2, 3, '#a5763d'); M(-8, 0, -6, 2.5, 2.5, 2.5, '#a5763d');        // crates
    M(-4, 17, 0, 8, 1, 4, '#7a5a3a');                                               // upper nook
  },
  spawns: [[-52, 0, -18], [52, 0, 18], [-52, 0, 18], [52, 0, -18], [0, 0, -19], [0, 0, 19], [-30, 7, -16], [30, 7, 16],
           [30, 7, -16], [-30, 7, 16], [0, 14, 0], [-10, 0, 0], [10, 0, 0]],
  weapons: [[0, 14, 0], [-30, 7, -16], [30, 7, 16], [-52, 0, 0], [52, 0, 0], [-20, 4, 0], [20, 4, 0], [0, 0, 16], [0, 0, -16]],
  health: [[-46, 3, 8], [46, 3, -8], [30, 7, -16], [-30, 7, 16]],
  shield: [[-4, 18, 0], [4, 18, 0]],
  grenade: [[0, 5, -14, 'prox'], [0, 5, 14, 'prox'], [-52, 0, -8, 'gas'], [52, 0, 8, 'gas']],
});

// ---------------------------------------------------------------------------------------------
// 4. SNIPER CANYON — tall cliff nests at both ends, mesas in the middle and a natural stone bridge.
const canyon = make({
  id: 'canyon', name: 'Sniper Canyon', code: 'PUBCAN', desc: 'Open canyon with cliff nests and a stone bridge', w: 124, d: 48, h: 46,
  floor: '#c58a52', wall: '#8c4a2c',
  nature: { band: 20, spacing: 6, rock: '#a65a36', rockS: [7, 12], rockH: [20, 38], tree: null, treeP: 0, treeH: [0, 0], scatter: 6, far: 50 },
  theme: { sky: ['#2d5fa8', '#f0b27a', '#fbe2b8'], fog: ['#f2c9a0', 85, 240], hemi: ['#ffe6c8', '#a0623a', 1.3], sun: ['#ffd2a0', 2.4, [60, 40, -30]], props: 'mesas', propColor: '#9a4f2e' },
  build(B, M) {
    M(-50, 0, 0, 24, 18, 44, '#a85a35');               // cliff plateaus
    M(-36, 0, 0, 8, 8, 30, '#b8683d');                 // cliff steps
    M(-52, 18, 12, 6, 3, 2, '#8c4a2c');                // nest cover
    M(-14, 0, -12, 10, 10, 10, '#c07040');             // mesas
    M(-14, 0, 14, 6, 5, 6, '#c9824f');
    B(0, 0, 0, 8, 16, 8, '#b5653a');                   // centre pillar
    B(-22, 0, 0, 4, 17, 4, '#a85a35'); B(22, 0, 0, 4, 17, 4, '#a85a35');
    B(0, 16, 0, 48, 1, 4, '#8f5a3a');                  // stone bridge
    B(-26, 27, 0, 10, 1, 8, '#b5653a'); B(26, 27, 0, 10, 1, 8, '#b5653a');   // floating rocks
    M(-26, 0, 14, 3, 2.5, 3, '#9a4f2e'); M(-6, 0, -18, 4, 3, 4, '#9a4f2e');   // boulders
  },
  spawns: [[-52, 18, -14], [52, 18, 14], [-52, 18, 14], [52, 18, -14], [-30, 0, 18], [30, 0, -18], [0, 0, -20], [0, 0, 20],
           [-14, 10, -12], [14, 10, 12], [0, 17, 0], [-26, 28, 0], [26, 28, 0]],
  weapons: [[0, 17, 0], [-52, 18, 0], [52, 18, 0], [-14, 10, -12], [14, 10, 12], [-26, 28, 0], [26, 28, 0], [-24, 0, -4], [24, 0, 4]],
  health: [[-30, 0, 0], [30, 0, 0], [-26, 2.5, 14], [26, 2.5, -14]],
  shield: [[-12, 17, 0], [12, 17, 0]],
  grenade: [[-6, 3, -18, 'gas'], [6, 3, 18, 'gas'], [-14, 5, 14, 'prox'], [14, 5, -14, 'prox']],
});

// ---------------------------------------------------------------------------------------------
// 5. SKY ISLANDS — a grassy island under open sky: tall tree-pillars, a floating central keep and ring islets.
const sky = make({
  id: 'sky', name: 'Sky Islands', code: 'PUBSKY', desc: 'Bright floating island with trees and sky platforms', w: 96, d: 96, h: 58,
  floor: '#63a05a', wall: null,
  nature: { band: 16, spacing: 6.5, rock: '#8d9480', rockS: [4, 8], rockH: [3, 7], tree: 'round', treeP: 0.5, treeH: [6, 10], scatter: 8, far: 0, island: true },
  theme: { sky: ['#2a6fd6', '#7fc0ff', '#e9f6ff'], fog: ['#cfe8ff', 90, 270], hemi: ['#ffffff', '#6fa56a', 1.45], sun: ['#fffbe6', 2.3, [40, 70, 30]], props: 'clouds', propColor: '#ffffff' },
  build(B, M) {
    B(0, 14, 0, 22, 3, 22, '#6aa75e'); B(0, 17, 0, 6, 7, 6, '#b8a07a');       // floating keep + tower
    B(0, 24, 0, 14, 1, 14, '#8fbf7a');                                          // tower roof deck
    for (const [x, y, z, c] of [[32, 8, 0, '#79b36a'], [-32, 8, 0, '#79b36a'], [0, 8, 32, '#79b36a'], [0, 8, -32, '#79b36a']])
      B(x, y, z, 12, 2, 12, c);
    for (const [x, y, z] of [[26, 24, 26], [-26, 24, -26], [26, 30, -26], [-26, 30, 26]]) B(x, y, z, 9, 1.5, 9, '#9ccf86');
    M(14, 0, 14, 2.2, 7, 2.2, '#6b4a2b'); M(14, 7, 14, 7, 4, 7, '#3f8f4a');    // tree pillars
    M(-14, 0, 24, 2.2, 5, 2.2, '#6b4a2b'); M(-14, 5, 24, 6, 3.5, 6, '#3f8f4a');
    M(36, 0, -30, 2.2, 6, 2.2, '#6b4a2b'); M(36, 6, -30, 6, 4, 6, '#3f8f4a');
    M(22, 0, -8, 4, 2.5, 4, '#a5763d'); M(-6, 0, -30, 3, 2, 3, '#a5763d');     // crates
    M(8, 0, 36, 5, 3, 5, '#8a8f7a');                                            // boulders
  },
  spawns: [[-40, 0, -40], [40, 0, 40], [40, 0, -40], [-40, 0, 40], [-44, 0, 0], [44, 0, 0],
           [32, 10, 0], [-32, 10, 0], [0, 10, 32], [0, 10, -32], [0, 25, 0], [0, 17, 10]],
  weapons: [[0, 25, 0], [0, 17, 9], [32, 10, 4], [-32, 10, -4], [0, 10, 34], [0, 10, -34], [26, 25.5, 26], [-26, 25.5, -26], [0, 0, 16]],
  health: [[26, 31.5, -26], [-26, 31.5, 26], [14, 11, 14], [-14, 8.5, 24]],
  shield: [[0, 25, -4], [36, 10, -30]],
  grenade: [[22, 2.5, -8, 'gas'], [-6, 2, -30, 'prox'], [8, 3, 36, 'prox'], [-34, 0, 12, 'gas']],
});

export const MAPS = { outpost, frostbite, mine, canyon, sky };
export const MAP_IDS = ['outpost', 'frostbite', 'mine', 'canyon', 'sky'];
