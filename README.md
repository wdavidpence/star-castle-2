# Star Castle 2

A faithful browser recreation of the 1980 Cinematronics arcade classic
*Star Castle* (design: Tim Skelly, original code: Scott Boden). Original
codebase, no ROMs or ripped assets.

## Fidelity model (what matches the cabinet)

- **Central castle**: the enemy turret sits dead center, defended by
  **3 concentric rotating shield rings of 12 independent sections**.
  Every section takes **two hits** (intact = solid, damaged = dashed).
- **Oppositely rotating rings**: outer YELLOW, middle ORANGE, inner RED
  (the cabinet's plastic color-overlay palette); playfield beams, ship,
  mines, and fuzzballs render blue-white/white like the vector monitor.
- **Mines**: exactly **3 mines** are launched by the castle. They orbit
  the castle, then break loose and home in on you. They pass through the
  shields. **Destroying a mine earns no points.** Mines are restored
  whenever the shields regenerate.
- **Cannon**: tracks you at all times and fires a big white-noise
  **fuzzball** only when it has a clear fire-line through aligned gaps —
  and once the inner ring is down, always. Fuzzballs grow as defenses
  fall and pass through the rings.
- **Ring regeneration**: when the outermost ring is fully destroyed, the
  middle expands to outer, the inner becomes middle, a brand-new ring
  blooms at the core, and the mines are restored.
- **Castle destruction**: **1,440 points + an extra ship** (original
  manual), followed by a violent explosion and the remaining rings
  collapsing inward before the next level.
- **Difficulty**: ramps per level *and continuously within each level*
  (the original's documented "catch").
- **Wraparound playfield** on all four edges.
- **Cabinet controls**: TURN LEFT / TURN RIGHT / THRUST / FIRE
  (arrows/WASD + keyboard, on-screen buttons on mobile), M to mute.

Scoring: castle 1440 + extra ship and "no points for mines" are from the
original operation manual. Per-section values (outer 30 / middle 40 /
inner 50) follow widely cited convention and are a documented design
choice of this recreation.

## Running

```
python3 -m http.server 8000
```

Open http://localhost:8000

## Tests

```
npm test          # static smoke tests (contracts + fidelity constants)
node verify-browser.js   # real Playwright gameplay verification
```

`verify-browser.js` boots a local server, plays the game headlessly, and
asserts: castle centering, 3x12 two-hit sections, two-hit damage states,
per-section scoring, regen cascade + mine restoration, gap-gated cannon
fire, fuzzball shield pass-through, 1440 + extra ship on castle kill,
collapse → next level, death/respawn flow, keyboard input, the intra-level
difficulty ramp, and zero console/page errors. It saves `gameplay.png`.

## Files

| File | Purpose |
|---|---|
| `index.html` | Entry point; canvas, attract screen, HUD, touch controls |
| `game.js` | Single-file game: fixed 60Hz sim, vector renderer, Web Audio SFX |
| `style.css` | Full-screen canvas, CRT overlay, HUD, touch layout |
| `test-smoke.js` | Static contract + fidelity assertions |
| `verify-browser.js` | Playwright gameplay verification harness |
