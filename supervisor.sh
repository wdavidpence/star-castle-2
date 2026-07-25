#!/usr/bin/env bash
# supervisor.sh -- autonomous game-quality-supervisor for star-castle-2.
# Bash 3.2 (macOS default), no embedded multi-line Node, schema-preserving
# atomic state updates, background worker with PID tracking and idle restart.

set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_PATH="${ROOT}/STATE.json"
JUDGE_FILE="${ROOT}/judge_decision.json"
LOCK_FILE="${ROOT}/supervisor.lock"
LOG_DIR="${ROOT}/.opencode"
LOG_FILE="${LOG_DIR}/supervisor.log"

BATCH_SIZE="${BATCH_SIZE:-8}"
IDLE_MINUTES="${IDLE_MINUTES:-20}"

RUN_ONCE=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --once) RUN_ONCE=true; shift ;;
    *) echo "supervisor: unknown arg: $1 (only --once is supported)" >&2; exit 1 ;;
  esac
done

mkdir -p "${LOG_DIR}"

utc_ts() { date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date; }

log() { printf '[%s] %s\n' "$(utc_ts)" "$*" | tee -a "${LOG_FILE}" >&2; }
die() { log "FATAL: $*"; exit 1; }

# --- Lock helpers (trap-safe) ------------------------------------------
acquire_lock() {
  if [[ -f "${LOCK_FILE}" ]]; then
    local lock_pid
    lock_pid=$(cat "${LOCK_FILE}" 2>/dev/null || echo "")
    if [[ -n "${lock_pid}" ]] && kill -0 "${lock_pid}" 2>/dev/null; then
      log "Lock held by PID ${lock_pid}; another supervisor is running."
      return 1
    fi
    log "Removing stale lock file (PID ${lock_pid} not alive)." && rm -f "${LOCK_FILE}"
  fi
  printf '%s\n' "$$" > "${LOCK_FILE}"
  return 0
}

release_lock() { rm -f "${LOCK_FILE}"; }

trap 'release_lock; exit 130' INT TERM
trap 'release_lock' EXIT

[[ -f "${STATE_PATH}" ]] || die "STATE.json missing at ${STATE_PATH}."

# --- Atomic state helpers (schema-preserving) --------------------------
# These read existing STATE.json, modify only what is needed, and write
# atomically via rename so no top-level keys are ever destroyed.

mark_worker_running() {
  # Atomically: increment pass_count (from existing numeric value) and set
  # next_action="worker_running". Also stamps _metadata.last_updated.
  node -e '
    (function(){
      var fs=require("fs"), p=process.argv[1];
      try { var s=JSON.parse(fs.readFileSync(p,"utf8")); } catch(e) { s={}; }
      if (typeof s.pass_count !== "number") s.pass_count = 0;
      s.pass_count += 1;
      s.next_action = "worker_running";
      s.last_pass_time = (new Date()).toISOString();
      if (!s._metadata) s._metadata = {};
      s._metadata.last_updated = (new Date()).toISOString();
      var tmp=p+".tmp";
      fs.writeFileSync(tmp, JSON.stringify(s,null,2));
      try { fs.renameSync(tmp,p); } catch(e){}
    })("'${STATE_PATH}'")' 2>>"${LOG_FILE}" || true
}

store_gate_exit_codes() {
  # Store real gate exit codes in _metadata.gate_results and last_test_report.
  # Does NOT touch checklist, overall_score, pass_count, or any other top-level key.
  local sc="$1" test_ec="$2" check_ec="$3" diff_ec="$4"
  node -e '
    (function(){
      var fs=require("fs"), p=process.argv[1], s={};
      try { s=JSON.parse(fs.readFileSync(p,"utf8")); } catch(e) { s={}; }
      if (!s._metadata) s._metadata = {};
      s._metadata.gate_results = {
        npm_test_pass:     ("'${test_ec}'" === "0"),
        npm_check_pass:    ("'${check_ec}'" === "0"),
        git_diff_clean:    ("'${diff_ec}'"  === "0"),
        scorecard_pass:    ("'${sc}'"       === "0"),
        last_gate_exit_codes: { scorecard: parseInt("'${sc}'",10), test: parseInt("'${test_ec}'",10), check: parseInt("'${check_ec}'",10), diff: parseInt("'${diff_ec}'",10) }
      };
      s.last_test_report = { updated_at: (new Date()).toISOString(), gate_exits: s._metadata.gate_results.last_gate_exit_codes };
      var tmp=p+".tmp";
      fs.writeFileSync(tmp, JSON.stringify(s,null,2));
      try { fs.renameSync(tmp,p); } catch(e){}
    })("'${STATE_PATH}'")' 2>>"${LOG_FILE}" || true
}

set_judge_flag() {
  # Set or clear judge_review_due; optionally update next_action.
  local val="$1" next_act="${2:-}"
  node -e '
    (function(){
      var fs=require("fs"), p=process.argv[1], s={};
      try { s=JSON.parse(fs.readFileSync(p,"utf8")); } catch(e) { s={}; }
      if ("'${val}'" === "false" || "'${val}'" === "") { delete s.judge_review_due; }
      else { s.judge_review_due = true; }
      if ("'${next_act}'" !== "") { s.next_action = "'${next_act}'"; }
      if (!s._metadata) s._metadata = {};
      s._metadata.last_updated = (new Date()).toISOString();
      var tmp=p+".tmp";
      fs.writeFileSync(tmp, JSON.stringify(s,null,2));
      try { fs.renameSync(tmp,p); } catch(e){}
    })("'${STATE_PATH}'")' 2>>"${LOG_FILE}" || true
}

# --- Judge contract: consume decision OR action ------------------------
evaluate_judge() {
  [[ -f "${JUDGE_FILE}" ]] || return 0
  node -e '
    (function(){
      try { var d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); } catch(e) { process.exit(0); return; }
      var v = (d.decision || d.action || "").toLowerCase();
      if (v==="continue"||v==="c") { console.log("continue"); process.exit(0); }
      if (v==="redirect"||v==="r") { console.log("redirect"); process.exit(0); }
      if (v==="done"||v==="d")    { console.log("done"); process.exit(0); }
      process.exit(0);
    })("'${JUDGE_FILE}'")' 2>/dev/null || true
}

# --- Build worker prompt (STATE.json + instructions) -------------------
build_worker_prompt() {
  cat "${STATE_PATH}"
  printf '\n\nInstructions:\n'
  printf '1. Read scorecard.js output and identify the weakest failing gate.\n'
  printf '2. Make exactly one coherent improvement or repair to the game source files.\n'
  printf '3. After making changes, run the gates (node scorecard.js; npm test; npm run check; git diff --check).\n'
  printf '4. Only commit your changes if ALL gates pass.\n'
  printf '5. Update STATE.json atomically (preserving the full top-level schema): increment pass_count by 1, '
  printf 'update _metadata.gate_results with the latest gate exit codes, and set next_action to "worker_running".\n'
  printf '6. Do NOT use --dangerously-skip-permissions flag.\n'
  printf '\nState file (STATE.json) follows:\n'
}

# --- Gate runners: capture real exit codes -----------------------------
run_gate() {
  # Usage: run_gate "description" command... -- args...
  local _desc="$1"; shift
  if "$@" >>"${LOG_FILE}" 2>&1; then printf '0\n'
  else printf '%s\n' "$?"; fi
}

# --- Idle / mtime-based worker restart ---------------------------------
check_state_mtime_idle() {
  # Returns 0 if STATE.json has been modified within IDLE_MINUTES, 1 otherwise.
  [[ -f "${STATE_PATH}" ]] || return 1
  local state_mtime now diff_sec
  state_mtime=$(stat -f %m "${STATE_PATH}" 2>/dev/null || stat -c %Y "${STATE_PATH}" 2>/dev/null)
  now=$(date +%s)
  if [[ -z "${state_mtime}" ]]; then return 1; fi
  diff_sec=$(( now - state_mtime ))
  if [[ ${diff_sec} -gt $(( IDLE_MINUTES * 60 )) ]]; then
    log "STATE.json idle ${diff_sec}s (>${IDLE_MINUTES}min). Worker should be restarted."
    return 1
  fi
  return 0
}

# --- Background worker management (PID tracking, crash/idle restart) --
run_worker_background() {
  # Launches opencode in background with the worker prompt. Polls its PID,
  # restarts it if it crashes or if STATE.json has been idle (mtime-based).

  if ! command -v opencode >/dev/null 2>&1; then
    log "opencode CLI not on PATH. Skipping model session."
    return 127
  fi

  local prompt_file="${LOG_DIR}/worker_prompt.tmp"
  build_worker_prompt > "${prompt_file}"

  log "Launching worker: opencode run --model myprovider/ornith-1.0-35b-mtplx"

  # Launch in background; track PID for polling.
  opencode run --model "myprovider/ornith-1.0-35b-mtplx" < "${prompt_file}" >>"${LOG_FILE}" 2>&1 &
  local wpid=$!
  printf '%s\n' "${wpid}" > "${LOG_DIR}/worker.pid"

  local max_restarts=3 restarts=0 wc_exit=0

  # Poll until the worker exits; on idle or crash, restart.
  while kill -0 "${wpid}" 2>/dev/null; do
    if ! check_state_mtime_idle; then
      log "Worker ${wpid} interrupted (STATE.json idle). Restarting."
      kill "${wpid}" 2>/dev/null || true
      wait "${wpid}" 2>/dev/null
      build_worker_prompt > "${prompt_file}"
      opencode run --model "myprovider/ornith-1.0-35b-mtplx" < "${prompt_file}" >>"${LOG_FILE}" 2>&1 &
      wpid=$!
      printf '%s\n' "${wpid}" > "${LOG_DIR}/worker.pid"
    fi
    sleep 5
  done

  wait "${wpid}" 2>/dev/null
  wc_exit=$?
  rm -f "${LOG_DIR}/worker.pid"

  if [[ ${wc_exit} -ne 0 ]]; then
    (( ++restarts ))
    if [[ ${restarts} -ge ${max_restarts} ]]; then
      log "Worker crashed ${restarts} times. Giving up this pass."
    else
      log "Worker exited with ${wc_exit}. Restarting (attempt ${restarts}/${max_restarts})."
      build_worker_prompt > "${prompt_file}"
      opencode run --model "myprovider/ornith-1.0-35b-mtplx" < "${prompt_file}" >>"${LOG_FILE}" 2>&1 &
      wpid=$!
      printf '%s\n' "${wpid}" > "${LOG_DIR}/worker.pid"
      wait "${wpid}" 2>/dev/null
      wc_exit=$?
    fi
  fi

  rm -f "${prompt_file}"
  return ${wc_exit}
}

# Best-effort `opencode serve` fallback (documented; never a fake attach).
try_opencode_serve() {
  command -v opencode >/dev/null 2>&1 || return 1
  log "Best-effort: trying 'opencode serve' (not a fake attach)."
  if opencode serve >>"${LOG_FILE}" 2>&1; then
    log "opencode serve completed."
    return 0
  fi
  log "Could not start opencode server. Proceeding without model."
  return 1
}

# --- Main loop (infinite by default; --once exits after one pass) ------
main() {
  log "supervisor.sh started (PID $$). RUN_ONCE=${RUN_ONCE}, BATCH_SIZE=${BATCH_SIZE}, IDLE_MINUTES=${IDLE_MINUTES}."

  local pass_num=0 batch_count=0

  while true; do
    acquire_lock || { sleep 10; continue; }

    (( ++pass_num ))
    log "=== Pass ${pass_num} ==="

    # 1. Read fresh STATE.json into a shell variable (for the prompt).
    local state_content
    state_content=$(cat "${STATE_PATH}" 2>/dev/null || echo "{}")

    # 2. Atomically increment pass_count (from existing value) and set
    #    next_action="worker_running" BEFORE launching anything else.
    mark_worker_running

    # 3. Launch worker (background, PID-tracked, with idle/crash restart).
    run_worker_background || true

    # 4. After worker completes, run gates and capture real exit codes.
    local sc_exit test_ec check_ec diff_ec all_pass=true

    sc_exit=$(run_gate scorecard  node "${ROOT}/scorecard.js")
    log "scorecard.js exit code: ${sc_exit}"

    test_ec=$(run_gate npm_test  "npm" "test")
    log "npm test exit code: ${test_ec}"

    check_ec=$(run_gate npm_check "npm" "run" "check")
    log "npm run check exit code: ${check_ec}"

    diff_ec=$(run_gate git_diff  "git" "diff" "--check")
    log "git diff --check exit code: ${diff_ec}"

    # Store gate results atomically without destroying top-level schema.
    store_gate_exit_codes "${sc_exit}" "${test_ec}" "${check_ec}" "${diff_ec}"

    if [[ ${sc_exit} -ne 0 ]] || [[ ${test_ec} -ne 0 ]] || \
       [[ ${check_ec} -ne 0 ]] || [[ ${diff_ec} -ne 0 ]]; then
      all_pass=false
    fi

    if ${all_pass}; then
      log "All gates passed on pass ${pass_num}."
    else
      log "Gates failed (scorecard=${sc_exit}, test=${test_ec}, check=${check_ec}, diff=${diff_ec})."
    fi

    # 5. Batch local worker passes: after BATCH_SIZE, set judge_review_due
    #    and wait for judge_decision.json.  Consume decision or action:
    #    done -> exit; redirect -> update next_action; continue -> clear flag + reset batch.
    (( ++batch_count ))

    if [[ ${batch_count} -ge ${BATCH_SIZE} ]]; then
      log "Batch boundary reached (${batch_count}/${BATCH_SIZE}). Setting judge_review_due=true."
      set_judge_flag true

      log "Waiting for ${JUDGE_FILE}..."
      while [[ ! -f "${JUDGE_FILE}" ]]; do
        sleep 30
      done

      local decision=""
      decision=$(evaluate_judge) || true
      case "${decision:-continue}" in
        done)
          log "Judge: done. Stopping supervisor."
          set_judge_flag false "judge_done"
          release_lock
          exit 0
          ;;
        redirect)
          log "Judge: redirect."
          set_judge_flag false "redirect"
          batch_count=0
          ;;
        continue|*)
          log "Judge: continue (or absent). Resuming."
          set_judge_flag false ""
          batch_count=0
          ;;
      esac

    else
      set_judge_flag false ""
    fi

    release_lock

    if ${RUN_ONCE}; then
      log "--once mode: exiting after pass ${pass_num}."
      exit 0
    fi

    log "Idle for ${IDLE_MINUTES} minutes before next pass."
    sleep $(( IDLE_MINUTES * 60 ))

  done
}

main "$@"
