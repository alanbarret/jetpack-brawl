# Jetpack Brawl 3D

Multiplayer jetpack arena shooter: authoritative Node + WebSocket server, Three.js client.

## Features
- **Solo vs bots** (1-11 bots, Easy / Normal / Hard) and **online multiplayer** (public arena or private room codes, up to 12 players)
- **Android / touch controls** (Settings → Touch controls): dual joysticks (aim stick fires at the edge, or swipe-to-look), floating or fixed sticks, aim assist (off/low/high), look/zoom/dead-zone/gyro sensitivity, gyro aiming, auto-fire, auto pick-up, auto reload, vibration, left-handed mode, and a layout editor (drag, resize, opacity, Classic/Thumbs/Claw presets). JET is a lever: slide up for more thrust, swipe down to dive; a ring shows fuel. Hold ⇄ for the weapon wheel, hold 💣 to see the throw arc, double-tap FIRE to zoom. Code lives in `public/controls.js`
- **Five maps**: Outpost, Frostbite, Deep Mine, Sniper Canyon, Sky Islands — pick one in Solo or Multiplayer (map list lives in `public/maps.js`)
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
