# Star Castle 2

A vector-style browser recreation of the 1980 Cinematronics Star Castle arcade game.

## Features

- **Vector arcade rendering**: Pure wireframe graphics with green phosphor glow, no filled elements
- **Central cannon**: Castle-shaped core that tracks and fires through shield gaps
- **Shield rings**: 3 rotating arc-based shield rings with outer-to-inner breach mechanics
- **Ring regeneration**: Destroyed outer rings trigger animated ring shift and new inner ring spawn
- **Enemy types**: Mines, chasers, fast ships, and tanks with distinct behaviors
- **Continuous gameplay**: Enemies spawn continuously; destroy the core to advance levels
- **Difficulty scaling**: Deterministic per-level scaling with hard caps (cannon speed, fire rate, turn rate, enemy speed)
- **Audio**: Web Audio API sound effects with distinct waveforms per event type
- **Mobile support**: Touch controls, safe-area insets, portrait-mode playable

## Running Locally

Serve the project directory with any static HTTP server, then open in a browser:

```
npx serve .
```

Or with Python:

```
python3 -m http.server 8000
```

Then navigate to the served URL (e.g. `http://localhost:3000` or `http://localhost:8000`).

## Controls

### Keyboard

| Action | Key(s) |
|---|---|
| Rotate left | `ArrowLeft` / `A` |
| Rotate right | `ArrowRight` / `D` |
| Thrust | `ArrowUp` / `W` |
| Fire | `Space` / `F` |
| Mute/Unmute | `M` |
| Start/Restart | `Space` / `Enter` |

### Touch

On-screen buttons for LEFT, THRUST, RIGHT, and FIRE. Tap the screen to start/restart.

### Mute

Press `M` or tap the MUTE button in the HUD to toggle sound on/off.

## Gameplay

Destroy enemy ships attacking from the screen edges. Destroy the central cannon core to clear each level. Green shield rings rotate around your ship — enemy projectiles must pass through shield gaps to reach you. When an outer shield ring is destroyed, inner rings shift outward and a new ring spawns at the core with a smooth animation.

## Smoke Tests

Verify the implementation is intact:

```
npm test
```

Runs `test-smoke.js`, which validates DOM structure, source code contracts, deterministic math simulations (shield collision, ring regen, movement physics, attract card rotation, difficulty scaling, death sequence, enemy spawning), and rendering conventions.

```
npm run check
```

Validates JavaScript syntax.

## Project Files

| File | Purpose |
|---|---|
| `index.html` | Entry point; canvas, attract screen, HUD, touch controls |
| `game.js` | Single-file game: loop, input, physics, collision, rendering, audio, state machine |
| `style.css` | Full-screen canvas, attract screen, HUD, touch button layout, safe-area support |
| `test-smoke.js` | Smoke test suite with deterministic simulations |
| `package.json` | Project metadata and npm scripts |

## License

MIT
