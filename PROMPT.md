# Star Castle 2 - Pass 6: Diagnostic & Test Infrastructure (Items 19, 20)

## Context
- File: game.js (~2800 lines, single-file browser game)
- Previous commits fixed items 1-4; Passes 1-5 (items 5-18) completed
- Item 10 (mute persistence to localStorage) is already in the code

## Target Improvements (from bugfix.md)

### Item 19: Diagnostic overlay for collision/fire logic
- **Problem**: There is no UI overlay that deterministically displays collision hitboxes, ring gap positions, and fire raycasts in real time. Regression of the shield-gap collision model requires manual visual guessing per run, which is unreliable and non-reproducible.
- **Fix**: Add a deterministic diagnostic overlay (toggleable via key press, e.g., `F1` or `D`) that renders collision geometry, ring gap angle, fire trajectory, and the computed cannon/ring intersection result in real time. This overlay should be optional and not affect gameplay.

### Item 20: Automated real touch start → hold-fire → restart regression gate
- **Problem**: There is no automated test that runs a real (or simulated-real) touch-start → hold-fire → restart cycle against the game's state machine. Without this gate, iPhone-specific regressions (touch event ordering, pointer/multi-touch interactions) can be introduced silently.
- **Fix**: Add a test script (test-regression.js or extend test-smoke.js) that performs a real (or realistically simulated) touch-start, hold-fire, and restart cycle on the game's state machine, asserting that states transition correctly and no touch-state leaks occur. This test should be runnable via `npm test` or a dedicated script.

## Constraints
- Do NOT rewrite unrelated code
- Preserve all existing public APIs and controls
- Keep changes minimal and focused on the two items above
- Do NOT commit, push, or deploy

## Acceptance
After implementation:
1. node --check game.js exits 0
2. No trailing whitespace in diff (git diff --check)
3. Diagnostic overlay exists and can be toggled via key press
4. Automated test script runs touch-start → hold-fire → restart cycle

EOF
echo 'Pass 6 prompt ready'
