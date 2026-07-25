#!/bin/bash
set -u
REPO="/Users/davidpence/star-castle-2"
LOG="/Users/davidpence/star-castle-2-95-loop.log"
MODEL="myprovider/ornith-1.0-35b-mtplx"
mkdir -p "$(dirname "$LOG")"
exec >>"$LOG" 2>&1
printf '\n===== LOOP START %s =====\n' "$(date -u +%FT%TZ)"
cd "$REPO" || exit 2
passes=(
"Resume from the live worktree. Focus only on the real browser start transition and first gameplay frame. Inspect the current files narrowly, implement the smallest robust fix if needed, preserve controls and public APIs, and do not reset/checkout/restore history. Run npm test and npm run check. Do not commit or publish."
"Focus only on cabinet-accurate attract/title presentation: black vector CRT look, readable title/instructions, high-score/credit/start behavior, and clean transition into play. Make a real player-visible improvement only if needed; preserve working gameplay. Run npm test, npm run check, and git diff --check. No reset/checkout/commit/publish."
"Focus only on Star Castle shield-ring semantics: innermost/outermost ordering, outer-to-inner collision, breach damage, regeneration and gap behavior. Add or correct deterministic tests and integrate the real gameplay path. Preserve public APIs. Run all checks. No reset/checkout/commit/publish."
"Focus only on ship controls and movement feel: rotation, thrust, inertia, friction, screen bounds/wrap behavior, keyboard and touch mapping. Compare against the existing implementation and make a narrow improvement, not a rewrite. Run all checks. No reset/checkout/commit/publish."
"Focus only on cannon/core behavior: targeting, projectile timing, shield-gap firing, core vulnerability, hit feedback, and level-clear transition. Use deterministic rules where appropriate and verify the live path. Run all checks. No reset/checkout/commit/publish."
"Focus only on enemy lifecycle and fidelity: mine/ship/tank behavior, spawn pacing, homing limits, collisions, cleanup, and difficulty scaling. Fix concrete mismatches or runtime defects without broad rewrites. Run all checks. No reset/checkout/commit/publish."
"Focus only on death/reserve/respawn/game-over/attract transitions. Ensure one-time life loss, deterministic timers, frozen simulation during death, restart reset, and no delayed exceptions. Run all checks. No reset/checkout/commit/publish."
"Focus only on vector presentation: line weights, green phosphor glow, ring readability, ship/enemy/core silhouettes, HUD hierarchy, CRT overlay, and responsive portrait/landscape composition. Make a substantial but bounded visual improvement that preserves gameplay. Run all checks. No reset/checkout/commit/publish."
"Focus only on audio and feedback: Web Audio unlock, mute state, fire/hit/explosion/core/death/level cues, and visual particles/screenshake that reinforce cabinet feel without runtime errors. Make narrow corrections and verify. No reset/checkout/commit/publish."
"Focus only on mobile playability: real touch start/restart, touch controls, safe areas, portrait layout, held fire, and overlay hit testing. Verify the real browser path if available; do not weaken tests or use stubs. Run all checks. No reset/checkout/commit/publish."
"Act as a focused integration/reliability pass. Inspect current git diff and runtime entry points, find the highest-impact remaining defect preventing a faithful playable Star Castle 2 experience, fix only that defect, and independently run tests/syntax/whitespace. Do not reset/checkout/commit/publish."
"Act as a strict reference-driven fidelity pass. Compare the current implementation to the original Star Castle cabinet's gameplay loop and presentation using available project evidence, identify the single largest remaining mismatch, implement it narrowly, and run all checks. Do not claim a percentage; do not reset/checkout/commit/publish."
)
for i in "${!passes[@]}"; do
  n=$((i+1))
  printf '\n===== PASS %02d START %s =====\n' "$n" "$(date -u +%FT%TZ)"
  printf 'STATUS BEFORE\n'; git status --short
  opencode run --model "$MODEL" "${passes[$i]}" 2>&1
  worker=$?
  printf 'WORKER_EXIT=%s\n' "$worker"
  npm test 2>&1; printf 'TEST_EXIT=%s\n' "$?"
  npm run check 2>&1; printf 'CHECK_EXIT=%s\n' "$?"
  git diff --check 2>&1; printf 'DIFF_CHECK_EXIT=%s\n' "$?"
  printf 'STATUS AFTER\n'; git status --short
  printf '===== PASS %02d END %s =====\n' "$n" "$(date -u +%FT%TZ)"
done
printf '\n===== LOOP COMPLETE %s =====\n' "$(date -u +%FT%TZ)"
