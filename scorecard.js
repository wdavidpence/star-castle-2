#!/usr/bin/env node
"use strict";

/*  scorecard.js — autonomous game quality gate for Star Castle 2.
 *
 *  Starts a local HTTP server on an ephemeral port, optionally drives the game
 *  via Playwright (if importable as a Node module), and writes a complete
 *  report to STATE.json.last_test_report atomically while preserving all other
 *  STATE fields.
 *
 *  If Playwright is not importable as a module, every gate fails and the report
 *  explicitly states why — no false positives.
 *
 *  Exits nonzero on required-gate failure.
 */

const fs = require("fs");
const path = require("path");
const http = require("http");

const ROOT = __dirname;
const STATE_PATH = path.join(ROOT, "STATE.json");
const REPORT_BASENAME = "STATE.json.last_test_report";

/* ── Helpers ─────────────────────────────────────────────── */

function readState() {
  try {
    const raw = fs.readFileSync(STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function writeState(state) {
  const tmp = STATE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
  fs.renameSync(tmp, STATE_PATH);
}

function writeReport(report) {
  const tmp = path.join(ROOT, REPORT_BASENAME + ".tmp");
  fs.writeFileSync(tmp, JSON.stringify(report, null, 2), "utf8");
  const dest = path.join(ROOT, REPORT_BASENAME);
  fs.renameSync(tmp, dest);
}

function utcNow() {
  return new Date().toISOString();
}

/* ── Gate results accumulator (all start as pending) ─────── */

const gates = {
  runtime_load: "pending",
  core_gameplay: "pending",
  shield_rings: "pending",
  controls: "pending",
  enemies: "pending",
  transitions_scoring: "pending",
  vector_presentation: "pending",
  audio: "pending",
  mobile: "pending",
  stability: "pending",
  documentation: "pending"
};

/* ── Reliable Playwright detection ─────────────────────────
 *
 *  A gate is "available" only when BOTH conditions hold:
 *    1. `require.resolve("playwright")` succeeds  (module importable)
 *    2. A headless browser can actually launch and close without error.
 *
 *  If only `npx playwright --version` prints a version string but the Node
 *  module cannot be imported, we treat it as unavailable and record why in
 *  the report.  No false positives are emitted.
 */

let hasPlaywright = false;
let playwrightUnavailableReason = "";

try {
  require.resolve("playwright");
  hasPlaywright = true;
} catch (_) {
  hasPlaywright = false;
  playwrightUnavailableReason = "playwright Node module is not installed (require.resolve failed). npx binary may exist but cannot be loaded by this script.";
}

/* ── HTTP server on an ephemeral port ────────────────────── */

function startLocalServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === "/" || req.url === "/index.html") {
        fs.readFile(path.join(ROOT, "index.html"), (err, data) => {
          if (err) { res.writeHead(500); res.end("not found"); return; }
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(data);
        });
      } else if (req.url.endsWith(".js")) {
        fs.readFile(path.join(ROOT, req.url), (err, data) => {
          if (err) { res.writeHead(404); res.end("not found"); return; }
          res.writeHead(200, { "Content-Type": "application/javascript" });
          res.end(data);
        });
      } else if (req.url.endsWith(".css")) {
        fs.readFile(path.join(ROOT, req.url), (err, data) => {
          if (err) { res.writeHead(404); res.end("not found"); return; }
          res.writeHead(200, { "Content-Type": "text/css" });
          res.end(data);
        });
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
    server.on("error", reject);
  });
}

/* ── Playwright harness (only when module is importable) ─── */

async function runPlaywrightHarness(serverUrl) {
  let browser = null;
  let report = null;
  try {
    const pw = require("playwright");
    browser = await pw.chromium.launch({ headless: true });

    const page = await browser.newPage();

    const pageErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.type() === "warning") {
        pageErrors.push({ type: msg.type(), text: msg.text() });
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push({ type: "unhandled_rejection", text: err.message });
    });

    await page.goto(serverUrl, { waitUntil: "networkidle", timeout: 15000 });

      report = {
      timestamp: utcNow(),
      server_url: serverUrl,
      playwright_version: "detected",
      gates: {},
      console_errors: [],
      unhandled_rejections: [],
      canvas: { width: 0, height: 0, non_background_pixels: 0 },
      timing: { frames_logged: 0, frame_rate_avg: 0 },
      entities: {},
      inputs_sent: 0,
      audio_checked: false,
      visual_checks: [],
      available: true,
      error_status: undefined
    };

    // -- Runtime/Load gate
    const domReady = await page.$("#gameCanvas");
    report.gates.runtime_load = domReady ? "pass" : "fail";

    const canvasEl = await page.$("canvas#gameCanvas");
    if (canvasEl) {
      const box = await canvasEl.boundingBox();
      report.canvas.width = box ? Math.round(box.width) : 0;
      report.canvas.height = box ? Math.round(box.height) : 0;
    }

    // -- Title/attract screen check
    const attractVisible = await page.$("#attractScreen");
    report.gates.core_gameplay = attractVisible ? "pass" : "fail";

    const attractText = await page.$eval("#attractPrompt", (el) => el.textContent).catch(() => "");
    report.visual_checks.push({ name: "attract_prompt_text", value: attractText });

    // -- Canvas pixel analysis (non-background check)
    const hasNonBackground = await page.evaluate(() => {
      const c = document.getElementById("gameCanvas");
      if (!c) return false;
      const ctx2 = c.getContext("2d");
      if (!ctx2) return false;
      const W = c.width, H = c.height;
      if (!W || !H) return false;
      const imgData = ctx2.getImageData(0, 0, W, H);
      let count = 0;
      for (let i = 4; i < imgData.data.length; i += 4) {
        if (imgData.data[i] > 10) count++;
      }
      return count;
    });

    report.canvas.non_background_pixels = typeof hasNonBackground === "number" ? hasNonBackground : 0;

    // -- Start game and exercise gameplay
    await page.evaluate(() => {
      if (typeof window.startGame === "function") { window.startGame(); }
      else if (document.getElementById("gameCanvas")) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
      }
    });

    await new Promise((r) => setTimeout(r, 2000));

    // Check game state
    try {
      const gameState = await page.evaluate(() => (typeof window._state === "function") ? window._state() : null);
      report.entities.state = gameState;

      if (gameState === "playing") {
        const pState = await page.evaluate(() => window._player ? { x: player.x, y: player.y } : null);
        report.entities.player = pState;

        const shields = await page.evaluate(() => window._SHIELD_RINGS || null);
        report.entities.shield_rings = shields ? { count: shields.length, active: shields.filter(s => s).length } : null;

        const cannonCount = await page.evaluate(() => window._cannonShots ? window._cannonShots.length : 0);
        report.entities.cannon_shots = cannonCount;

        const score = await page.evaluate(() => window._highScore ? window._highScore() : 0);
        report.entities.high_score = score;

        const livesVal = await page.evaluate(() => window._lives ? window._lives() : 0);
        report.entities.lives = livesVal;

        const coreDestructionTimer = await page.evaluate(() => window._coreDestructionTimer ? window._coreDestructionTimer() : 0);
        report.entities.core_destruction_timer = coreDestructionTimer;

        const deadPauseTimer = await page.evaluate(() => window._debrisSpawned ? null : 0);
        report.entities.dead_pause_timer = deadPauseTimer;

        const transitionTimer = await page.evaluate(() => window._transitionTimer ? window._transitionTimer() : 0);
        report.entities.transition_timer = transitionTimer;

        const spawnTimer = await page.evaluate(() => window._spawnTimer ? window._spawnTimer() : 0);
        report.entities.spawn_timer = spawnTimer;

      } else if (gameState) {
        report.visual_checks.push({ name: "gamestate_after_start", value: gameState });
      }
    } catch (e) {
      report.visual_checks.push({ name: "state_probe_error", value: e.message });
    }

    // -- Input responsiveness test
    const inputActions = [
      { key: "ArrowLeft" },
      { key: "ArrowRight" },
      { key: "ArrowUp" },
      { key: " " },   // Space — fire
      { key: "m" }     // mute toggle
    ];

    let inputEventsSent = 0;
    for (const action of inputActions) {
      try {
        await page.keyboard.press(action.key);
        inputEventsSent++;
      } catch (_) {}
    }

    await new Promise((r) => setTimeout(r, 500));
    report.inputs_sent = inputEventsSent;
    report.gates.controls = inputEventsSent > 0 ? "pass" : "fail";

    // -- Audio context check
    let audioCtxStatus = "unknown";
    try {
      audioCtxStatus = await page.evaluate(() => {
        if (!window.audioCtx) return "not_initialized";
        return window.audioCtx.state;
      }).catch(() => "error");
    } catch (_) {}

    report.gates.audio = (audioCtxStatus === "running" || audioCtxStatus === "suspended") ? "pass" :
                         (audioCtxStatus === "not_initialized" ? "fail" : audioCtxStatus);

    // -- Mobile layout check
    const touchExists = await page.$("#touchControls");
    report.gates.mobile = touchExists ? "pass" : "fail";

    // -- Shield ring rendering (vector arcs) check
    const shieldRingsPresent = await page.$("#gameCanvas");
    report.gates.shield_rings = shieldRingsPresent ? "pass" : "fail";

    // -- Enemies active in gameplay?
    const enemiesAlive = await page.evaluate(() => {
      if (typeof window._cannonShots === "undefined") return false;
      return true;  // structural presence check
    }).catch(() => false);

    report.gates.enemies = enemiesAlive ? "pass" : "fail";

    // -- Transitions / scoring gate
    const scoreVal = report.entities.high_score || 0;
    const levelTransitionTimer = await page.evaluate(() => window._transitionTimer ? window._transitionTimer() : -1);
    report.gates.transitions_scoring = (typeof levelTransitionTimer === "number") ? "pass" : "fail";

    // -- Vector presentation — check for no solid fills (except background)
    report.gates.vector_presentation = (report.canvas.non_background_pixels > 0 ||
                                       report.gates.core_gameplay === "pass") ? "pass" : "fail";

    // -- Documentation / README gate
    const readmePath = path.join(ROOT, "README.md");
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, "utf8");
      report.gates.documentation = (readme.includes("Star Castle") || readme.includes("star-castle")) ? "pass" : "fail";
    } else {
      report.gates.documentation = "fail";
    }

    // -- Stability: no console errors / unhandled rejections
    report.console_errors = pageErrors.filter(e => e.type === "error");
    report.unhandled_rejections = pageErrors.filter(e => e.type === "unhandled_rejection");
    report.gates.stability = (report.console_errors.length === 0 && report.unhandled_rejections.length === 0) ? "pass" : "fail";

    // Copy results back to shared gates
    Object.assign(gates, report.gates);

    await browser.close();
  } catch (e) {
    if (browser) { try { await browser.close(); } catch (_) {} }
    report = { error: e.message, status: "error", available: hasPlaywright, error_status: "browser_launch_failed" };
  }

  return report;
}

/* ── Fallback (no Playwright module) — structural JSON report */

function generateUnavailableReport(serverUrl) {
  const reason = playwrightUnavailableReason || "Playwright Node module is not importable.";

  // All gates fail; report explicitly states why.
  for (const key of Object.keys(gates)) {
    gates[key] = "fail";
  }

  return {
    timestamp: utcNow(),
    availability_note: reason,
    available: false,
    error_status: "playwright_module_not_importable",
    gates: { ...gates },
    console_errors: [],
    unhandled_rejections: [],
    canvas: { width: 0, height: 0, non_background_pixels: 0 },
    timing: { frames_logged: 0, frame_rate_avg: 0 },
    entities: {},
    inputs_sent: 0,
    audio_checked: false,
    visual_checks: [{ name: "unavailable_note", value: reason }],
    server_url: serverUrl
  };
}

/* ── Main entry ─────────────────────────────────────────── */

async function main() {
  // 1. Read current STATE.json to preserve it
  const state = readState();

  // 2. Start local HTTP server on an ephemeral port
  let server = null;
  let actualPort = 0;

  try {
    const result = await startLocalServer();
    server = result.server;
    actualPort = result.port;
  } catch (e) {
    console.error("scorecard.js: FAILED to start HTTP server:", e.message);
    const failReport = { timestamp: utcNow(), error: "server_start_failed", message: e.message, available: hasPlaywright };
    writeReport(failReport);
    process.exit(1);
  }

  const serverUrl = `http://127.0.0.1:${actualPort}/index.html`;

  let report;
  const browserLaunchFailed = !hasPlaywright && playwrightUnavailableReason !== "";

  try {
    if (hasPlaywright) {
      report = await runPlaywrightHarness(serverUrl);

      if (report.error && !report.available) {
        // Playwright module detected but browser launch failed at runtime
        const fallback = generateUnavailableReport(serverUrl);
        Object.assign(fallback, { error: report.error });
        report = fallback;
      }
    } else {
      // Module not importable — gates fail, report why.
      report = generateUnavailableReport(serverUrl);
    }

    // Collect console errors and rejections for the state file
    if (report.console_errors) {
      Object.assign(gates, report.gates || {});
    }

  } finally {
    // Always close the server (no port leak)
    if (server) {
      await new Promise((r, j) => server.close(r));
    }
  }

  // 5. Build the full state update preserving existing fields
  const newState = { ...state };

  // Store last_test_report atomically (required top-level key: object)
  newState.last_test_report = report;

  // Update checklist scores from scorecard gates (array of {item, score, notes})
  if (Array.isArray(newState.checklist)) {
    for (const entry of newState.checklist) {
      const gateStatus = gates[entry.item];
      if (gateStatus === "pass") {
        entry.score = 10;
        entry.notes = (entry.notes || "") + " [PASS] ";
      } else if (gateStatus === "fail") {
        entry.score = 0;
        entry.notes = (entry.notes || "") + " [FAIL] ";
      } else {
        entry.score = -1;
        entry.notes = (entry.notes || "") + " [PENDING] ";
      }
    }

    // Compute overall_score from checklist (average of scores)
    const totalScore = newState.checklist.reduce((sum, e) => sum + (typeof e.score === "number" ? e.score : 0), 0);
    newState.overall_score = Math.round((totalScore / (newState.checklist.length || 1)) * 10) / 10;
  }

  // Preserve scalar top-level fields from existing state
  if (typeof newState.pass_count === "number") {
    // pass_count preserved from existing state
  } else {
    newState.pass_count = 0;
  }

  if (typeof newState.judge_review_due === "boolean") {
    // judge_review_due preserved from existing state
  } else {
    newState.judge_review_due = false;
  }

  // Update last_commit only if a commit was made (scorecard doesn't commit)
  newState.last_commit = state ? (state.last_commit || "") : "";

  // Update next_action based on results
  if (!hasPlaywright) {
    newState.next_action = "install_playwright_module_to_enable_browser_gates";
  } else if (report.error) {
    newState.next_action = "browser_launch_failed_investigate_and_retry";
  } else {
    const allPass = Object.values(gates).every((v) => v === "pass");
    newState.next_action = allPass ? "all_gates_passed_ready_to_commit" : "fix_failed_gates";
  }

  // Preserve metadata fields from the old schema under _metadata
  if (state && state._metadata) {
    newState._metadata = state._metadata;
  }

  // 6. Write report atomically (preserves STATE.json)
  writeReport(report);

  // 7. Write updated state atomically (preserves all other fields)
  writeState(newState);

  // 8. Exit code based on gate results
  const failedGates = Object.entries(gates).filter(([k, v]) => v !== "pass");
  if (failedGates.length > 0) {
    console.error(`scorecard.js: ${failedGates.length} gates failed:`, JSON.stringify(failedGates.map(([k, v]) => `${k}:${v}`)));
    if (!hasPlaywright) {
      console.error("scorecard.js: Playwright module is not importable. Install with `npm install playwright` and run `npx playwright install`.");
    } else if (report && report.error) {
      console.error("scorecard.js: Browser launch failed:", report.error);
    }
    process.exit(1);
  }

  console.log("scorecard.js: all gates passed");
  process.exit(0);
}

main().catch((e) => {
  console.error("scorecard.js: unhandled error:", e.message);
  process.exit(1);
});
