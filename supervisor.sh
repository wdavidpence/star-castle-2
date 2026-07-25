#!/usr/bin/env bash
# supervisor.sh — autonomous game-quality-supervisor for star-castle-2.
# POSIX-compatible Bash 3.2, no embedded multi-line Node, no fragile quoting.

set -u

# --- Resolve ROOT (no absolute paths in tool commands) ------------------
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

STATE_PATH="${ROOT}/STATE.json"
JUDGE_FILE="${ROOT}/judge_decision.json"
LOCK_FILE="${ROOT}/supervisor.lock"
LOG_DIR="${ROOT}/.opencode"
LOG_FILE="${LOG_DIR}/supervisor.log"

# --- Defaults (overridable via env) ------------------------------------
BATCH_SIZE="${BATCH_SIZE:-8}"
IDLE_MINUTES="${IDLE_MINUTES:-20}"

# --- Argument parsing --------------------------------------------------
RUN_ONCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --once) RUN_ONCE=true; shift ;;
    *) echo "supervisor: unknown arg: $1 (only --once is supported)" >&2; exit 1 ;;
  esac
done

# --- Logging (append-only, no credentials) -----------------------------
mkdir -p "${LOG_DIR}"

log() {
  local ts
  ts="$(date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date)"
  printf '[%s] %s\n' "${ts}" "$*" | tee -a "${LOG_FILE}" >&2
}

die() { log "FATAL: $*"; exit 1; }

# --- Lock helpers (trap-safe) ------------------------------------------
acquire_lock() {
  if [[ -f "${LOCK_FILE}" ]]; then
    local lock_pid
    lock_pid=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
    if [[ -n "${lock_pid}" ]] && kill -0 "${lock_pid}" 2>/dev/null; then
      log "Lock held by PID ${lock_pid}; skipping this iteration."
      return 1
    fi
    log "Removing stale lock file." && rm -f "${LOCK_FILE}"
  fi
  printf '%s\n' "$$" > "${LOCK_FILE}"
  return 0
}

release_lock() { rm -f "${LOCK_FILE}"; }

# Cleanup lock on exit / interrupt.
trap 'release_lock; exit 130' INT TERM
trap 'release_lock' EXIT

# Sanity: STATE.json must exist.
[[ -f "${STATE_PATH}" ]] || die "STATE.json missing at ${STATE_PATH}."

# --- Atomic state updaters (node -e one-liner, double-quoted arg) ------
# The outer shell uses "..." so $VAR expands; the JS inside uses '...'
update_state() {
  local pass_count="$1" next_action="$2" extra_json

  extra_json="${3:-}"

  node -e "
    var fs=require('fs'), p='${STATE_PATH}', s={};
    try { s=JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) {}
    s.pass_count = ${pass_count:-0};
    s.next_action = '${next_action}';
    s.last_pass_time = (new Date()).toISOString();
    ${extra_json}
    var tmp=p+'.tmp';
    fs.writeFileSync(tmp, JSON.stringify(s,null,2));
    try { fs.renameSync(tmp,p); } catch(e){}
  " 2>>"${LOG_FILE}" || true
}

# Atomically set judge_review_due (or clear it).
set_judge_flag() {
  local val="$1"   # true | false | "" (delete)
  if [[ "${val}" == "false" || -z "${val}" ]]; then
    node -e "
      var fs=require('fs'), p='${STATE_PATH}', s={};
      try { s=JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) {}
      delete s.judge_review_due;
      var tmp=p+'.tmp';
      fs.writeFileSync(tmp, JSON.stringify(s,null,2));
      try { fs.renameSync(tmp,p); } catch(e){}
    " 2>>"${LOG_FILE}" || true
  else
    node -e "
      var fs=require('fs'), p='${STATE_PATH}', s={};
      try { s=JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) {}
      s.judge_review_due = true;
      var tmp=p+'.tmp';
      fs.writeFileSync(tmp, JSON.stringify(s,null,2));
      try { fs.renameSync(tmp,p); } catch(e){}
    " 2>>"${LOG_FILE}" || true
  fi
}

# Read fresh STATE.json, log the worker prompt (read-only).
build_worker_prompt() {
  node -e "
    var fs=require('fs'), s={};
    try { s=JSON.parse(fs.readFileSync('${STATE_PATH}','utf8')); } catch(e) {}
    console.log(JSON.stringify(s,null,2));
  " 2>/dev/null | tee -a "${LOG_FILE}" > /dev/null || true
}

# --- Gate runners: capture exit codes and output --------------------
run_scorecard() {
  if node "${ROOT}/scorecard.js" >>"${LOG_FILE}" 2>&1; then
    printf '0\n'
  else
    local ec=$?
    [[ ${ec} -eq 0 ]] || printf '%s\n' "${ec}"
  fi
}

run_npm_test() {
  if npm test >>"${LOG_FILE}" 2>&1; then
    printf '0\n'
  else
    local ec=$?
    [[ ${ec} -eq 0 ]] || printf '%s\n' "${ec}"
  fi
}

run_npm_check() {
  if npm run check >>"${LOG_FILE}" 2>&1; then
    printf '0\n'
  else
    local ec=$?
    [[ ${ec} -eq 0 ]] || printf '%s\n' "${ec}"
  fi
}

run_git_diff() {
  if git diff --check >>"${LOG_FILE}" 2>&1; then
    printf '0\n'
  else
    local ec=$?
    [[ ${ec} -eq 0 ]] || printf '%s\n' "${ec}"
  fi
}

# --- Judge contract: consume decision values (continue, redirect, done) --
evaluate_judge() {
  [[ -f "${JUDGE_FILE}" ]] || return 0
  local action
  action=$(node -e "try{var d=JSON.parse(require('fs').readFileSync('${JUDGE_FILE}','utf8'));console.log((d.action||'').toLowerCase())}catch(e){}" 2>/dev/null) || true
  case "${action:-unknown}" in
    continue|c) printf 'continue' ;;
    redirect|r) printf 'redirect' ;;
    done|d)     printf 'done' ;;
    *)          printf '' ;;  # unknown/absent → treat as continue silently.
  esac
}

# --- OpenCode: headless noninteractive mode (best-effort) --------------
try_start_opencode() {
  if ! command -v opencode >/dev/null 2>&1; then
    log "opencode CLI not on PATH. Skipping model session."
    return 1
  fi

  log "Attempting headless opencode session with model myprovider/ornith-1.0-35b-mtplx..."

  # Try noninteractive headless mode — NEVER use --dangerously-skip-permissions.
  if opencode run --model "myprovider/ornith-1.0-35b-mtplx" <<< "" >>"${LOG_FILE}" 2>&1; then
    log "OpenCode headless session completed."
    return 0
  fi

  # Best-effort persistent server fallback. Log clearly if attach is unavailable.
  log "Headless mode not available; trying 'opencode serve' as persistent server..."
  if opencode serve >>"${LOG_FILE}" 2>&1; then
    log "opencode serve completed (attach is unavailable)."
  else
    log "Could not start opencode server. Proceeding without model."
  fi
  return 1
}

# --- Idle / mtime-based restart & stop ----------------------------------
check_idle() {
  [[ -f "${STATE_PATH}" ]] || return 0
  local now_mtime state_mtime diff_sec

  # `stat -f %m` (macOS) or `stat -c %Y` (linux).
  state_mtime=$(stat -f %m "${STATE_PATH}" 2>/dev/null || stat -c %Y "${STATE_PATH}" 2>/dev/null)
  now_mtime=$(date +%s)

  if [[ -n "${state_mtime}" ]]; then
    diff_sec=$((now_mtime - state_mtime))

    # If STATE.json untouched for >IDLE_MINUTES, stop the supervisor.
    if [[ ${diff_sec} -gt $((IDLE_MINUTES * 60)) ]]; then
      log "STATE.json idle ${diff_sec}s (>${IDLE_MINUTES}min). Stopping supervisor."
      exit 0
    fi

    # If stale for > half the idle window, log a restart warning.
    if [[ ${diff_sec} -gt $((IDLE_MINUTES * 30)) ]]; then
      log "STATE.json stale (${diff_sec}s). Restarting session this pass."
    fi
  fi
}

# --- Main loop (infinite by default, --once for a single run) ---------
main() {
  log "supervisor.sh started (PID $$). RUN_ONCE=${RUN_ONCE}, BATCH_SIZE=${BATCH_SIZE}, IDLE_MINUTES=${IDLE_MINUTES}."

  local pass_num=0 batch_count=0

  while true; do
    check_idle

    # Acquire lock; skip if another instance is running.
    acquire_lock || { sleep 10; continue; }

    (( ++pass_num ))
    log "=== Pass ${pass_num} ==="

    # Build worker prompt from freshly read STATE.json (read-only) before any mutation.
    build_worker_prompt

    # Atomically update pass_count, next_action, and timestamps BEFORE gates.
    update_state "${pass_num}" "running_pass_${pass_num}"

    # --- Run all gates, store actual exit codes & reports in STATE.json --
    local sc_exit test_exit check_exit diff_exit

    sc_exit=$(run_scorecard)
    log "scorecard.js exit code: ${sc_exit}"

    test_exit=$(run_npm_test)
    log "npm test exit code: ${test_exit}"

    check_exit=$(run_npm_check)
    log "npm run check exit code: ${check_exit}"

    diff_exit=$(run_git_diff)
    log "git diff --check exit code: ${diff_exit}"

    # Determine whether all gates passed.
    local all_pass=true
    if [[ ${sc_exit} -ne 0 ]] || [[ ${test_exit} -ne 0 ]] || \
       [[ ${check_exit} -ne 0 ]] || [[ ${diff_exit} -ne 0 ]]; then
      all_pass=false
    fi

    if ${all_pass}; then
      log "All gates passed on pass ${pass_num}."
    else
      log "Gates failed (${sc_exit}/${test_exit}/${check_exit}/${diff_exit})."
    fi

    # --- Update STATE.json with gate results (next_action, pass_count) --
    if ${all_pass}; then
      update_state "${pass_num}" "gates_passed" \
        "s.gate_results={scorecard_exit:${sc_exit},test_exit:${test_exit},check_exit:${check_exit},diff_exit:${diff_exit}}"
    else
      update_state "${pass_num}" "fix_failed_gates" \
        "s.gate_results={scorecard_exit:${sc_exit},test_exit:${test_exit},check_exit:${check_exit},diff_exit:${diff_exit}}"
    fi

    # Try to run the model (best-effort).
    try_start_opencode || true

    # Commit pass_count/next_action to STATE.json (final for this iteration).
    update_state "${pass_num}" "gates_passed"

    # --- After BATCH_SIZE passes, set judge_review_due=true & stop ------
    (( ++batch_count ))

    if [[ ${batch_count} -ge ${BATCH_SIZE} ]]; then
      log "Batch boundary reached (${batch_count}/${BATCH_SIZE}). Setting judge_review_due=true."

      # Atomically mark review due and stop until a decision file appears.
      set_judge_flag true

      log "Waiting for ${JUDGE_FILE}..."
      while [[ ! -f "${JUDGE_FILE}" ]]; do
        sleep 30
      done

      local decision
      decision=$(evaluate_judge)

      case "${decision:-continue}" in
        done)
          log "Judge: done. Stopping supervisor."
          update_state "${pass_num}" "judge_done"
          release_lock
          exit 0
          ;;
        redirect)
          log "Judge: redirect. Waiting for next decision after idle."
          update_state "${pass_num}" "judge_redirect"
          sleep $((IDLE_MINUTES * 60))
          batch_count=0
          set_judge_flag false
          ;;
        continue|*)
          log "Judge: continue (or absent). Resuming."
          update_state "${pass_num}" "judge_continue"
          batch_count=0
          set_judge_flag false
          ;;
      esac

    else
      # Reset judge_review_due for non-boundary passes.
      set_judge_flag false
    fi

    release_lock

    if ${RUN_ONCE}; then
      log "--once mode: exiting after pass ${pass_num}."
      exit 0
    fi

    log "Idle for ${IDLE_MINUTES} minutes before next pass."
    sleep $((IDLE_MINUTES * 60))

  done
}

main "$@"
