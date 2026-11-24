# NIGHT DRIVE // Neon District

A browser-based, neon-noir 3D driving game built with [Three.js](https://threejs.org/).
Cruise a procedurally generated city at night (or flip to day), take delivery
and VIP jobs for cash, unlock new cars from the garage, win street races
against AI rivals, and ride with a real in-game radio.

No install, no build step, no server-side code — open `index.html` in a
browser (via a local static server, see below) and drive.

## Features

- **Procedural neon city** — grid of blocks, roads, a plaza, a landmark
  "arts quarter" with hand-built architecture, an ocean skyline edge, and a
  Vice-City-style rooftop hotel.
- **Real car & building models** — Kenney Car Kit and Kenney City Kit
  Commercial (CC0), loaded as glTF and skinned with CC0 PBR textures.
- **Day/night cycle** — auto-cycling clock with a manual override key.
- **Missions** — delivery runs and VIP rides against the clock, plus a
  closed-loop street race with AI rivals, checkpoints, and a finish banner.
- **Garage** — own multiple cars, each with its own handling/top-speed feel;
  buy new ones with mission cash.
- **Physics** — speed-sensitive steering, handbrake drifting with
  tire-smoke particles, and forgiving-but-real collision response.
- **Heading-up minimap** — rotates with the car, shows mission and race
  markers (including an off-map direction pointer when a target isn't in
  view).
- **Real radio** — 16 licensed NCS (NoCopyrightSounds) tracks you can cycle
  through or switch off, plus engine and tire sound effects.

## Controls

| Key | Action |
|---|---|
| `W A S D` | Drive |
| `Shift` | Handbrake / drift |
| `Space` | NOS boost |
| `E` | Switch to next owned car |
| `G` | Open garage (pick or buy a car) |
| `R` | Next radio station |
| `M` | Radio off |
| `T` | Cycle day / night / auto |

## Running it locally

Everything is static files, but the game is loaded via `fetch`-style
resource requests (glTF model loading reads embedded data URIs, and the
browser's security model for `file://` pages blocks some of this), so serve
the folder over HTTP rather than double-clicking `index.html`:

```bash
# from the project root
python3 -m http.server 8080
# then open http://localhost:8080 in your browser
```

Any other static file server (`npx serve`, `php -S`, etc.) works the same
way.

## Project structure

```
night-drive/
├── index.html              # page shell, HUD markup, CSS, script load order
├── src/                    # game logic, split into focused modules
│   ├── environment.js      #   renderer/scene/camera, day-night, HDRI sky,
│   │                       #   CC0 materials, procedural textures
│   ├── city.js             #   procedural city generation, drift smoke pool,
│   │                       #   hand-built landmark district
│   ├── cars.js             #   car model loading, owned-car roster, garage UI
│   ├── traffic.js          #   AI traffic cars and pedestrians
│   ├── audio.js             #   engine/tire sfx + the in-game radio
│   ├── gameplay.js         #   input, missions, save/load, race circuit
│   ├── physics.js          #   player-car physics: steering, drift, collision
│   ├── hud.js              #   chase camera + rotating minimap
│   └── main.js             #   animation loop + game bootstrap
└── assets/
    └── data/
        ├── textures_data.js  # embedded CC0 PBR textures (base64)
        └── media_data.js     # embedded car/building models, HDRI sky,
                               # and the 16 NCS music tracks (base64)
```

The modules in `src/` are loaded as plain `<script>` tags, in the order
listed in `index.html`, and share one global scope — there's no bundler or
module loader involved. That load order is also the dependency order: a
later file can freely use constants/functions defined by an earlier one.

## Credits / licensing

- **Cars & buildings**: [Kenney](https://kenney.nl/) — CC0.
- **Sky HDRI**: [Poly Haven](https://polyhaven.com/) — CC0.
- **PBR ground/wall textures**: [ambientCG](https://ambientcg.com/) — CC0 /
  public domain.
- **Music**: 16 tracks released free via
  [NoCopyrightSounds (NCS)](https://ncs.io/) — Recall (Gabriawll), Fearless
  pt.II (TULE + Chris Linton), Heroes (RetroVision), Invincible (DEAF KEV),
  Unstoppable (JOXION + Thorne + iFeature), Legends (Star Party), Adventure
  (JJD), Fly (Fransis Derelle + Parker Polhill), Alive (Itro + Kontinuum),
  Fire (Brook Xiao + Rachel Horter), Warrior (Marin Hoxha + Maestro Chives +
  Chris Linton), Diamond (NIVIRO), Dreams (Lost Sky), Wildfire (Jim Yosef +
  Sara Skinner), Vibe (Ash O'Connor), Energy (Elektronomia) — all NCS
  Releases, free to use with credit.
- **Tire squeal sfx**: Tom Haigh (CC-BY 3.0), via opengameart.org.
- **Engine loop sfx**: domasx2 (CC0), via opengameart.org.
- **Engine**: [Three.js](https://threejs.org/) r128.

This repo is a personal/portfolio project built around those free assets;
see each source above for its own license terms if you reuse the assets
directly.
