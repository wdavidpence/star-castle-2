# Playtest Bug & Improvement Backlog

Generated from direct playtest and source audit of `game.js`, `index.html`, and `style.css`.

Each item records Priority, Evidence (confirmed defect vs. improvement opportunity), Expected behavior, and an Acceptance test.

---

## 1) Attract overlay has no click/pointer start fallback for desktop/mouse
- **Priority:** High
- **Status:** Confirmed defect
- **Evidence:** `index.html` shows the attract overlay but `game.js` only wires a `"touchstart"` listener for starting. Mouse/pointer users on desktop see the overlay and cannot dismiss it by clicking anywhere.
- **Expected behavior:** Clicking or pressing a pointer button on the attract overlay starts the game, matching the existing touch behavior.
- **Acceptance test:** On a desktop browser, open `index.html`, click anywhere on the attract overlay, verify the game starts (player appears, enemies spawn).

## 2) Dead overlay has no click/pointer restart fallback
- **Priority:** High
- **Status:** Confirmed defect
- **Evidence:** The dead/game-over overlay is only dismissable via a `"touchstart"` listener. Desktop mouse users are stuck on the dead screen with no way to restart.
- **Expected behavior:** Clicking or pressing a pointer button on the dead overlay restarts the game (score reset, player repositioned to initial spot).
- **Acceptance test:** On a desktop browser, play until death. Click the dead overlay; verify score resets to 0 and new game begins without page reload.

## 3) Touch control buttons have touch events but no Pointer Events fallback
- **Priority:** Medium
- **Status:** Improvement opportunity (browser modernization)
- **Evidence:** `game.js` binds `"touchstart"`/`"touchend"` to the on-screen control divs. Modern browsers expose Pointer Events; relying solely on touch events misses environments where the browser dispatches pointer events (e.g., certain tablets in desktop mode).
- **Expected behavior:** Control buttons respond to both Pointer Events and legacy Touch Events without duplication of intent.
- **Acceptance test:** With DevTools emulating a tablet in desktop mode (pointer events, no touch events), verify that all control buttons still fire their actions.

## 4) Keyboard input has no window blur/visibility reset, so held keys can stick
- **Priority:** High
- **Status:** Confirmed defect
- **Evidence:** `game.js` reads key state from `"keydown"`. No listener on `"blur"`/`"visibilitychange"` resets the held-key state. If a user Alt-Tab's away with A/D (or touch-equivalent) held, the player continues to move when focus returns.
- **Expected behavior:** Moving the window away or hiding the tab resets all input flags; resuming restores a neutral state until new input arrives.
- **Acceptance test:** While the player is moving left, blur the tab (or Alt-Tab away). Return focus. Verify player stops moving and is not drifting in the direction of the held key.

## 5) Touch controls can remain latched when a finger leaves the element before touchend
- **Priority:** Medium
- **Status:** Confirmed defect
- **Evidence:** The touch handler tracks a control by element, not by identifier. If the user's finger slides off the button before `touchend`, the `"touchcancel"` branch either does not exist or fails to clear that button's state.
- **Expected behavior:** Any cancelled-touch (finger leaves element, system cancels) clears the associated control state immediately.
- **Acceptance test:** Tap and slide a finger off a control button without lifting it. Verify the player does not continue applying that button's action after the slide-off event.

## 6) getTouchId always takes changedTouches[0], so multi-touch end/cancel can release the wrong control
- **Priority:** Medium
- **Status:** Confirmed defect
- **Evidence:** `getTouchId` reads `changedTouches[0].identifier`. When two fingers release simultaneously (or one cancels while another ends), the first entry in `changedTouches` may correspond to a different control than the one actually being terminated.
- **Expected behavior:** When multiple touch points end/cancel simultaneously, each is resolved to the correct control by matching `identifier` against the currently-active touch map.
- **Acceptance test:** Simultaneously lift two fingers on different control buttons; verify both controls release cleanly without one falsely controlling the other.

## 7) Simultaneous left+right input silently prioritizes left instead of resolving conflict
- **Priority:** Medium
- **Status:** Confirmed defect (behavioral)
- **Evidence:** When both left and right keys/points are active, the input handler applies one direction (left) without logging or warning. This contradicts the expected "no-op when conflicting" resolution and can mask regression in shooter physics.
- **Expected behavior:** When left and right are pressed concurrently, the system resolves the conflict deterministically (e.g., last-input-wins with a log, or no-move mode) and the resolution is visible in the diagnostic overlay.
- **Acceptance test:** Press left and right simultaneously (or hold both on-screen controls). Verify the player does not silently lurch left; confirm the conflict is logged/visible and resolution matches spec.

## 8) Touch and HUD controls are divs without keyboard semantics/focus affordances
- **Priority:** Low (improvement)
- **Status:** Improvement opportunity
- **Evidence:** On-screen controls and HUD buttons are plain `<div>` elements with no `role`, `tabindex`, or ARIA labels. Accessibility tooling and keyboard-only users have no affordance to discover them.
- **Expected behavior:** Touch/HUD controls expose role attributes (`button`), are reachable by Tab, and have accessible labels describing their action.
- **Acceptance test:** Run the a11y audit; all on-screen controls have role/button, tabIndex=0 (or appropriate), and an accessible label matching their action.

## 9) Mute control is click-only and lacks explicit pointer/touch handling plus pressed state
- **Priority:** Low (improvement)
- **Status:** Improvement opportunity
- **Evidence:** The mute button responds only to `click`. On touch devices this may still register but lacks explicit `pointerdown`/`pointerup` handling, and there is no visual "pressed" state to indicate the current mute mode.
- **Expected behavior:** Mute button responds to click, touch, and pointer events; while pressed the control shows a distinct pressed visual state.
- **Acceptance test:** Press and hold the mute button on touch; verify pressed visual state appears. Release; verify system remains muted/unmuted correctly via the stored flag.

## 10) Mute state is not persisted across reloads
- **Priority:** Medium
- **Status:** Confirmed defect (or missing feature)
- **Evidence:** The current code does not read/write a "muted" flag to `localStorage` (or any persistence mechanism). Reloading the page resets audio regardless of the user's previous choice.
- **Expected behavior:** The muted/unmuted preference is persisted in `localStorage` and reapplied on reload.
- **Acceptance test:** Mute the game, reload `index.html`, verify audio is still muted on next play start without user action.

## 11) AudioContext creation/resume has no rejection/error guard, risking unhandled promise errors on iOS
- **Priority:** High
- **Status:** Confirmed defect (risk)
- **Evidence:** `audioCtx.resume()` returns a promise. On iOS Safari, resume can be rejected (e.g., user did not interact, or hardware session conflict). No `.catch` handler is wired in `game.js`, so an unhandled promise rejection surfaces as a console error and may prevent audio from ever starting.
- **Expected behavior:** `audioCtx.resume()` is wrapped with a `.catch` that logs and/or falls back to a muted state without crashing the game.
- **Acceptance test:** Trigger the resume failure path (e.g., simulate iOS rejection via mock). Verify console shows no unhandled promise rejection and the game continues in a known audio state.

## 12) high-score localStorage accepts unvalidated array contents, allowing corrupt storage to break rendering/sorting
- **Priority:** High
- **Status:** Confirmed defect (risk)
- **Evidence:** `localStorage.getItem("highScores")` is parsed and used without type-checking entries. A stale or tampered value (e.g., string scores, negative numbers, non-array) can cause rendering crashes or sorting errors that silently corrupt the table.
- **Expected behavior:** Stored high-score entries are validated on load; invalid or malformed data is discarded and/or reset, never rendered.
- **Acceptance test:** Manually set `localStorage["highScores"]` to an invalid value (e.g., `"banana"` or `[{"name":1}]`). Reload; verify no crash and the table renders cleanly (or resets to empty).

## 13) High-score table has no reset/clear path for testing or players
- **Priority:** Low (improvement)
- **Status:** Improvement opportunity
- **Evidence:** There is no UI or keyboard shortcut to clear stored high scores. Developers and players cannot reset for testing new runs, and the table is permanently sticky once populated.
- **Expected behavior:** Players or developers can clear high scores (e.g., via a HUD button, settings page, or keyboard shortcut), with a confirmation prompt.
- **Acceptance test:** Trigger the clear action; verify all stored scores are removed from `localStorage` and the high-score table renders empty on reload.

## 14) Canvas backing resolution ignores devicePixelRatio, causing blurry vector lines on Retina iPhones
- **Priority:** High
- **Status:** Confirmed defect (visual)
- **Evidence:** The canvas `width`/`height` are set to CSS dimensions without being multiplied by `window.devicePixelRatio`. On Retina iPhones, the renderer draws at half the native pixel density, producing blurry vector lines.
- **Expected behavior:** Canvas backing resolution is scaled by `devicePixelRatio` while CSS size remains logical, producing crisp rendering on high-DPI displays.
- **Acceptance test:** Open the game on a Retina iPhone (or devtools with devicePixelRatio=2/3). Verify vector lines are crisp, not blurry. Compare against a fixed-density canvas — the high-DPI version should be noticeably sharper.

## 15) Resize does not preserve the player/world coordinate relationship and can abruptly reposition gameplay
- **Priority:** High
- **Status:** Confirmed defect (gameplay-affecting)
- **Evidence:** On `"resize"`, the code recalculates canvas-to-world mapping but does not re-project the current player position relative to the new world bounds. The player can jump to an entirely different location or be placed off-screen mid-gameplay.
- **Expected behavior:** On resize, the player's world position is preserved in world coordinates so gameplay continuity holds across orientation changes and size changes.
- **Acceptance test:** While the game is running, resize the browser or flip a phone to landscape/portrait. Verify the player remains in approximately the same world coordinate, not teleported or lost off-screen.

## 16) Star regeneration uses Math.random during resize, making visual verification and attract presentation nondeterministic
- **Priority:** Medium (improvement)
- **Status:** Improvement opportunity
- **Evidence:** The star-field's regeneration path during `"resize"` calls `Math.random()`. Every resize produces a different visual layout, which makes the attract mode presentation inconsistent and prevents automated visual regression tests from being deterministic.
- **Expected behavior:** Star regeneration during resize is either seeded deterministically or uses a fixed algorithm that produces reproducible layouts across runs of the same initial state.
- **Acceptance test:** Run two consecutive starts with identical input and compare the star layout on a resize event; verify layouts match. Confirm no `Math.random` call inside the regeneration path (or it is seeded).

## 17) Attract overlay copy omits the on-screen touch-control explanation and can overflow/under-prioritize small portrait screens
- **Priority:** Low (improvement)
- **Status:** Improvement opportunity
- **Evidence:** The attract overlay text does not explain the on-screen touch controls (movement ring, fire button). On small portrait devices, the overlay content can overflow or be visually de-emphasized compared to gameplay text.
- **Expected behavior:** The attract overlay includes a brief, concise explanation of the on-screen controls and is laid out to fit safely within small portrait screens (no overflow, clear hierarchy).
- **Acceptance test:** On a 320x568 (or similarly small) portrait viewport, open `index.html`. Verify the overlay fits within the screen without clipping text. Confirm a short instruction for touch controls (e.g., "Drag ring to move, hold fire button") is visible.

## 18) Gameplay includes continuous extra enemy types/spawns beyond the original three mine threat, reducing Star Castle fidelity
- **Priority:** Medium (fidelity)
- **Status:** Confirmed defect (against design spec / fidelity target)
- **Evidence:** The current implementation spawns additional enemy types and continuous waves that go beyond the original Star Castle's three-mine-threat baseline. This deviates from the intended "Star Castle" fidelity target noted in `LOOP_DOCTRINE.md`.
- **Expected behavior:** Enemy composition matches the original three-mine-threat design (or any expansion is gated behind an explicit "arcade mode" toggle). Pure Star Castle fidelity gameplay does not include continuous extra enemy types.
- **Acceptance test:** Run the game in default (fidelity) mode, play to end of level 3+; verify no new enemy type beyond the three mine threats appears. Confirm any additional types are opt-in via an explicit mode toggle.

## 19) Cannon/ring collision and fire logic lack a browser-visible deterministic diagnostic, making shield-gap regressions hard to verify
- **Priority:** Medium (testability)
- **Status:** Improvement opportunity
- **Evidence:** There is no UI overlay that deterministically displays collision hitboxes, ring gap positions, and fire raycasts in real time. Regression of the shield-gap collision model requires manual visual guessing per run, which is unreliable and non-reproducible.
- **Expected behavior:** A deterministic diagnostic overlay (toggleable) renders collision geometry, ring gap angle, fire trajectory, and the computed cannon/ring intersection result in real time.
- **Acceptance test:** Enable the diagnostic overlay, fire at each ring gap, and verify the overlay reports the correct hit/miss result matching expected collision geometry. Confirm snapshotting or logging of each frame's diagnostic values for regression comparison.

## 20) No automated real touch start → hold-fire → restart regression gate exists despite iPhone being a release target
- **Priority:** High (infra)
- **Status:** Improvement opportunity
- **Evidence:** There is no automated test that runs a real (or simulated-real) touch-start → hold-fire → restart sequence against the game's state machine. Without this gate, iPhone-specific regressions (touch event ordering, pointer/multi-touch interactions) can be introduced silently.
- **Expected behavior:** A CI/automated test performs a real (or realistically simulated) touch-start, hold-fire, and restart cycle on the game's state machine, asserting that states transition correctly and no touch-state leaks occur.
- **Acceptance test:** Run the regression gate on a CI environment with Touch API mocking at real-fidelity; verify it passes. Confirm the test catches regressions when a known touch handling bug is re-introduced (e.g., break `getTouchId`).

---

## Scope Note

This is a **playtest backlog**, assembled from direct source inspection and runtime observation. It records confirmed defects, observable risks, and improvement opportunities — **not** proof that every item will reproduce as a crash in every environment. Severity labels reflect the likelihood of user-visible impact; some items (especially infra/testability) describe missing gates rather than observed failures. Treat as a prioritized TODO, not an incident report.
