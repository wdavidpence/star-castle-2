# Loop Doctrine — Star Castle 2 Autonomous Infrastructure

## Purpose

This document defines the permanent operating doctrine for all autonomous
loop-until-X, overnight, and batched-judge workflows in this repository.

## Core Principles

1. **STATE.json is the source of truth.** The state file owns all loop
   configuration, pass counts, gate results, and next-action metadata.
   Conversation memory is ephemeral; STATE.json persists across reboots,
   terminal closures, and supervisor restarts.

2. **supervisor.sh is the loop driver.** Every autonomous pass runs through
   `bash supervisor.sh` (indefinite) or `bash supervisor.sh --once` (single
   run). It atomically reads STATE.json, increments `pass_count`, launches
   the worker, records exit codes and commit hashes, then waits for the
   next cycle.

3. **scorecard.js is the gate.** Each pass runs `node scorecard.js` which
   serves or loads the game, exercises title → start → gameplay, collects
   console errors/unhandled rejections, inspects public entry points,
   canvas dimensions, frame activity, entity state probes, and input
   responsiveness. It writes `STATE.json.last_test_report` atomically.

4. **Judge batches are local-worker-only by default.** The worker executes
   exactly `BATCH_SIZE=8` passes without calling an external frontier model.
   After each batch, `judge_review_due=true` is set and the supervisor
   stops for a human or file-based judge decision via `judge_decision.json`.

5. **State file wins over conversation memory.** If STATE.json says
   `judge_review_due=true`, the loop halts regardless of what a running
   conversation session claims. The state file is the immutable record.

6. **Scaffold fresh state before build work.** Each loop pass begins by
   reading STATE.json and only using the freshly-loaded context. Stale or
   cached state from previous sessions is never replayed.

## File-Based Judge Decision Contract

When `judge_review_due=true`, the supervisor checks for
`judge_decision.json` at:

    star-castle-2/judge_decision.json

If present, it must contain one of:

    { "decision": "continue" }
    { "decision": "redirect", "to": "<new_goal_or_state_file>" }
    { "decision": "done" }

The file may also include:

    {
      "diff_summary": "... 8-line git diff summary",
      "latest_report_path": "... path to latest STATE.json.last_test_report"
    }

The supervisor consumes this file, applies the decision, clears
`judge_review_due`, increments `pass_count`, and either continues or stops.

If the file is absent, the supervisor waits indefinitely (or until a human
writes it) — no external API call is made.

## Thresholds & Configuration

| Parameter                  | Default | Description                           |
| -------------------------- | ------- | ------------------------------------- |
| `idle_minutes_threshold`   | 20      | Minutes of no state change before     |
|                            |         | supervisor considers worker stalled.    |
| `batch_size`               | 8       | Local passes between judge reviews.   |
| `CURRENT_BATCH_PASSES`     | 0       | Reset after each batch boundary.      |
| `IDLE_MINUTES` (env)       | 20      | Override via environment variable.    |

## Safe Installation (Optional)

To survive terminal close or reboot, install the supervisor as a
launchd agent:

1. Copy `supervisor.sh` to `/Users/davidpence/Library/LaunchAgents/`.
2. Create a plist pointing to it (see `install_supervisor.sh` if provided).
3. Run `launchctl load ~/Library/LaunchAgents/com.star-castle.supervisor.plist`.

Do NOT install automatically. The supervisor is designed to run under
`tmux`, `screen`, or a terminal multiplexer for manual control.

## Scorecard Gate Failures

If `scorecard.js` exits nonzero, the supervisor:
- Records the exit code in `gate_results`.
- Does NOT commit changes.
- Sets `next_action` to the failure description.
- Continues the loop only if the worker self-corrects in a subsequent pass.

## Never Include in Logs

- Credentials, API keys, or tokens.
- Full source code diffs (use `git diff --stat` instead).
- Personal file paths outside the project root.
