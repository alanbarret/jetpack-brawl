# Jetpack Brawl 3D

Multiplayer jetpack arena shooter: authoritative Node + WebSocket server, Three.js client.

## Features
- **Solo vs bots** (1-11 bots, Easy / Normal / Hard) and **online multiplayer** (public arena or private room codes, up to 12 players)
- **Natural maps**: no square walls. Each map is ringed by rocks, cliffs and trees (Deep Mine is a rock cave, Sky Islands a floating island), the ground and scenery run on to the horizon, and the limits are hidden behind the ring
- **Grenades**: spawn with 3 Frag grenades; Gas and Proxy grenades are pickups in the arena (+2 each)
- **Three grenade types (Mini Militia style)**: Frag (bounces and rolls, explodes after 2.6 s), Gas (poison cloud for 6 s) and Proxy mine (sticks where it lands, arms in 0.9 s, triggers when an enemy comes close). Realistic arc with drag, bounces and rolling, about 22 m max throw. Hold 💣 on phones to see the dotted path and blast radius; tap the chip above it (or press `T`) to switch type
- **Shotgun** is short range: 16 m max with damage falling off after 5 m
- **Human-like bots**: slower reactions, aim that settles onto you, mostly walking, look-around pauses, slow down to shoot
- **Controls lock while dead** and come back on respawn
- **Android / touch controls** (Settings → Touch controls): swipe-to-look (default) or an aim stick that fires at the edge, floating or fixed sticks, aim assist (off/low/high), look/zoom/dead-zone/gyro sensitivity, gyro aiming, auto-fire, auto pick-up, auto reload, vibration, left-handed mode, and a layout editor (drag, resize, opacity, Classic/Thumbs/Claw presets). PUBG-style layout: big FIRE on the right (drag to aim) plus a small left FIRE, scope and reload by the right FIRE, tap the weapon slots (bottom centre) to switch, slide the move stick far up to lock running, PICK UP appears next to weapons. JET is a lever: slide up for more thrust, swipe down to dive; a ring shows fuel. hold 💣 to see the throw arc, double-tap FIRE to zoom. Code lives in `public/controls.js`
- **Five maps**: Outpost, Frostbite, Deep Mine, Sniper Canyon, Sky Islands — pick one in Solo or Multiplayer (map list and the seeded natural-edge generator live in `public/maps.js`)
- **Enemy health bars** (plus shield strip) float above every opponent's head
- **Jetpack (Mini Militia style)**: hold jet to climb. Jump off a high ledge and the jetpack fires automatically to slow your fall. Hold descend (`C` / ▼) to dive fast instead
- Detailed procedural soldiers and six weapon models, with walk/jet/recoil/melee animation
- Mini-Militia style menu, loading screen, pause menu, settings (sensitivity, volume, shadows)
- Mobile: auto fullscreen + landscape lock, rotate-to-landscape prompt, touch controls

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000. Friends on the same Wi-Fi can use `http://YOUR-PC-IP:3000`.

## Deploy on Render (free plan)
New → Web Service → Build: `npm install` → Start: `npm start`.
`three` is installed from npm and served by the game server, so no CDN is needed. The client switches to `wss://` automatically on HTTPS. Free instances sleep when idle, so the first connection can take about a minute; the game shows a "waking up the server" message and retries.

## Controls
**PC:** WASD move · Space jetpack · C descend · Shift sprint · Mouse aim · Left-click fire · Right-click zoom · R reload · Q / wheel swap · G grenade · F melee · E take weapon · Tab scores · Enter chat
**Phone:** left thumb = move stick · drag right side = aim · buttons for FIRE, JET, ▼ descend, grenade, melee, reload, swap, pickup, zoom

## Project layout
```
server.js          static server + game server (rooms, combat, bots hookup)
bots.js            bot AI
public/index.html  menu, loader, HUD, touch UI
public/game.js     rendering, input, networking, UI logic
public/models.js   soldier + weapon models and animation
public/shared.js   constants, map, movement physics (shared with server)
```

## iPhone fullscreen
Safari doesn't allow web pages to go fullscreen. Use Share → Add to Home Screen, then launch the game from the home screen icon.
