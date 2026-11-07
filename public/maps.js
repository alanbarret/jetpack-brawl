// public/maps.js — all playable maps. Imported by BOTH server.js and the browser.
// A map is made of axis-aligned boxes (collision + visuals). B(centerX, bottomY, centerZ, w, h, d, colour|null).
// colour null = invisible collider. `theme` is purely visual (the server ignores it).

function make(def) {
  const boxes = [];
  const B = (cx, y, cz, w, h, d, c = '#8a7f6a') => boxes.push({ min: [cx - w / 2, y, cz - d / 2], max: [cx + w / 2, y + h, cz + d / 2], c });
  const { w, d, h } = def;
  // standard shell: floor, four walls, ceiling
  B(0, -1, 0, w, 1, d, def.floor);
  B(0, 0, -d / 2 - 0.5, w + 2, h, 1, def.wall); B(0, 0, d / 2 + 0.5, w + 2, h, 1, def.wall);
  B(-w / 2 - 0.5, 0, 0, 1, h, d + 2, def.wall); B(w / 2 + 0.5, 0, 0, 1, h, d + 2, def.wall);
  B(0, h, 0, w + 2, 1, d + 2, def.ceil === undefined ? null : def.ceil);
  const mirror = (x, y, z, ww, hh, dd, c) => { B(x, y, z, ww, hh, dd, c); B(-x, y, -z, ww, hh, dd, c); };   // 180° rotational symmetry
  def.build(B, mirror);
  const P = (type, list) => list.map((pos) => ({ type, pos }));
  return {
    id: def.id, name: def.name, desc: def.desc, code: def.code, w, d, h, theme: def.theme, lamps: def.lamps || [], boxes,
    spawns: def.spawns,
    pickups: [...P('weapon', def.weapons), ...P('health', def.health), ...P('shield', def.shield), ...P('grenade', def.grenade)],
  };
}

// ---------------------------------------------------------------------------------------------
// 1. OUTPOST — the original desert arena: a central tower, sniper ledges and floating platforms.
const outpost = make({
  id: 'outpost', name: 'Outpost', code: 'PUBOUT', desc: 'Desert base with a central tower and sniper ledges', w: 90, d: 90, h: 30,
  floor: '#6b7d52', wall: '#4a463e',
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
  grenade: [[24, 20, 0], [40, 0, 20], [-10, 0, -20]],
});

// ---------------------------------------------------------------------------------------------
// 2. FROSTBITE — icy research base: two fortified ends, a tall central spire, stepped terraces.
const frostbite = make({
  id: 'frostbite', name: 'Frostbite', code: 'PUBICE', desc: 'Frozen base with icy terraces and a central spire', w: 104, d: 60, h: 38,
  floor: '#c9dfeb', wall: '#7fa4bb',
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
  grenade: [[0, 0, 12], [0, 0, -12], [-36, 5, 14], [36, 5, -14]],
});

// ---------------------------------------------------------------------------------------------
// 3. DEEP MINE — dark, low-ceilinged tunnels with timber shelves, catwalks and lamp light.
const mine = make({
  id: 'mine', name: 'Deep Mine', code: 'PUBMINE', desc: 'Dark tunnels with a low ceiling and lamp light', w: 112, d: 44, h: 22,
  floor: '#4d3d2e', wall: '#3a2e24', ceil: '#2c231b',
  theme: { sky: ['#0b0907', '#15100b', '#1f160e'], fog: ['#16100a', 22, 85], hemi: ['#ffd9a8', '#4a2e18', 1.3], sun: ['#ffb870', 0.35, [10, 30, 5]], props: 'none', propColor: '#000' },
  lamps: [[-38, 9, -10], [38, 9, 10], [0, 16, 0], [-14, 9, 12], [14, 9, -12], [-38, 9, 12], [38, 9, -12]],
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
  grenade: [[0, 5, -14], [0, 5, 14], [-52, 0, -8], [52, 0, 8]],
});

// ---------------------------------------------------------------------------------------------
// 4. SNIPER CANYON — tall cliff nests at both ends, mesas in the middle and a natural stone bridge.
const canyon = make({
  id: 'canyon', name: 'Sniper Canyon', code: 'PUBCAN', desc: 'Open canyon with cliff nests and a stone bridge', w: 124, d: 48, h: 46,
  floor: '#c58a52', wall: '#8c4a2c',
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
  grenade: [[-6, 3, -18], [6, 3, 18], [-14, 5, 14], [14, 5, -14]],
});

// ---------------------------------------------------------------------------------------------
// 5. SKY ISLANDS — a grassy island under open sky: tall tree-pillars, a floating central keep and ring islets.
const sky = make({
  id: 'sky', name: 'Sky Islands', code: 'PUBSKY', desc: 'Bright floating island with trees and sky platforms', w: 96, d: 96, h: 58,
  floor: '#63a05a', wall: null,
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
  grenade: [[22, 2.5, -8], [-6, 2, -30], [8, 3, 36], [-34, 0, 12]],
});

export const MAPS = { outpost, frostbite, mine, canyon, sky };
export const MAP_IDS = ['outpost', 'frostbite', 'mine', 'canyon', 'sky'];
