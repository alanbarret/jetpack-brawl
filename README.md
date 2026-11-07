# Jetpack Brawl 3D

Multiplayer jetpack arena shooter. Authoritative Node + WebSocket server, Three.js browser client.

## Run locally
```bash
npm install
npm start
```
Open http://localhost:3000 (open a second tab to test multiplayer). Same room code = same match.

## Deploy (Render, free plan)
New → Web Service → Build: `npm install` → Start: `npm start`.
The client switches to `wss://` automatically on HTTPS.

## Controls
WASD move · Space jetpack · Shift sprint · Mouse aim · Left-click fire · Right-click zoom · R reload · Q/wheel swap · G grenade · F melee · E take weapon · Tab scores · Enter chat. Mobile: on-screen stick and buttons.
