# Star Castle 2

> **Phase 1 — Browser Foundation**

A vector-style browser game inspired by classic arcade shooters. Currently implementing the foundational infrastructure.

## Current Status

**Full Star Castle gameplay is not yet implemented.** This repository contains only the Phase 1 browser foundation: canvas rendering loop, input handling, and UI scaffolding. No enemies, scoring, levels, or vector graphics gameplay exist at this time.

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
| Move left | `ArrowLeft` / `A` |
| Move right | `ArrowRight` / `D` |
| Thrust | `ArrowUp` / `W` |
| Fire | `Space` / `ArrowDown` / `S` |
| Mute/Unmute | `M` |
| Start game | `Space` / `Enter` |

### Touch

On-screen buttons for LEFT, THRUST, RIGHT, and FIRE. Tap the attract screen or FIRE to start.

### Mute

Press `M` or tap the MUTE button in the HUD to toggle sound on/off.

## Smoke Tests

Verify the foundation is intact:

```
npm test
```

Runs `test-smoke.js`, which asserts that required DOM elements exist in `index.html` and that core functions (`startGame`, `toggleMute`, `initInput`, `drawAttract`, `drawGame`, `loop`, `init`) are defined in `game.js`.

## Project Files

| File | Purpose |
|---|---|
| `index.html` | Entry point; canvas, attract screen, HUD, touch controls |
| `game.js` | Game loop, input handling, drawing, state management |
| `style.css` | Full-screen canvas, attract screen, HUD, touch button layout |
| `test-smoke.js` | Smoke test suite |
| `package.json` | Project metadata and npm scripts |

## License

MIT
