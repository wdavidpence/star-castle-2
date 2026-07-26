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

# Infrastructure: scorecard.js & supervisor.sh

### scorecard.js — automated quality-gate runner

```bash
node scorecard.js
```

- Generates/updates `STATE.json` (top-level keys: project, target_description,
  overall_score, checklist, last_test_report, last_commit, next_action,
  pass_count, judge_review_due).
- Starts a tiny HTTP server on an **ephemeral port** (never 8080) and runs the
  same Playwright-based gate suite used by `npm test`.
- If the Playwright module cannot be imported, gates fail **and** the report
  explicitly states why — never silently passing.

### supervisor.sh — autonomous loop (bash)

```bash
chmod +x supervisor.sh
./supervisor.sh                            # default: indefinite loop, BATCH_SIZE=8
./supervisor.sh --once                     # single iteration, exit 0/1
```

- **Gates** before any commit: `scorecard.js` → `npm test` → `git diff --check`.
- **Lockfile** (`supervisor.lock`) prevents concurrent runs; stale locks from
  dead processes are auto-reclaimed.
- **`judge_decision.json`** contract: `{ "action": "continue"|"redirect"|"done" }`.
  The loop stops at `BATCH_SIZE` boundary and waits for a judge decision.
- **OpenCode serve** is used only when `opencode` exists on `$PATH`; otherwise
  the supervisor falls back to a minimal no-attach headless HTTP server with an
  explicit log message.  No fake flags or permission bypasses are invented.

### Limitations (documented, not worked around)

| Capability                 | Status                                   |
|----------------------------|------------------------------------------|
| `npm test` (CLI)           | Working when Playwright module is installed.  |
| `opencode serve`/`attach`  | Only when the CLI is on PATH. Otherwise a minimal HTTP server is started with **no attach** capability; the limitation is logged, never faked.  |
| Browser launch (Playwright)| Fails explicitly if the Playwright module is not importable; `last_test_report.available` and `.error` describe why.  |
| `~/.hermes/LOOP_DOCTRINE.md` write | Blocked by file-system permissions; this is a known limitation and the supervisor does not attempt to bypass it.  |

## License

MIT
