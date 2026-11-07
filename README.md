# Jetpack Brawl 3D

Multiplayer jetpack arena shooter: authoritative Node + WebSocket server, Three.js client.

## Features
- **Solo vs bots** (1-11 bots, Easy / Normal / Hard) and **online multiplayer** (public arena or private room codes, up to 12 players)
- **Jetpack hover**: tap jump and let go, and you hover in place. Hold jet to climb, hold descend (`C` / ▼) to drop
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
