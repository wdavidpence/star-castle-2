(function() {
  "use strict";

  /* ═══════════════════════════════════════════════════════════════════
     STAR CASTLE 2 — faithful recreation of the 1980 Cinematronics
     vector arcade game (design: Tim Skelly, code: Scott Boden).

     FIDELITY MODEL (original arcade rules):
       • The central CASTLE (turret) sits dead center, defended by 3
         concentric rotating shield rings of 12 independent sections each.
         Every section takes TWO hits to destroy.
       • Rings rotate in OPPOSITE directions to each other.
       • The player's ship attacks from OUTSIDE, shooting through the
         rotating gaps. A ship touching a live shield section dies.
       • SPARK MINES (user-spec behavior): a max battery of 3 sparks,
         but they are SCHEDULED — level 1 gets one spark that appears
         after ~60s, level 3 gets two, level 6+ gets all three. They
         orbit briefly, then break loose and NEVER charge head-on into
         gunfire: they swing in on lateral pincer arcs, jittering like
         zero-gravity sparks, dodging incoming bullets. At higher levels
         some lay back and ambush the player from the far side of the
         map. Unlike the player ship they do NOT wrap — they bank off
         the screen edges and come back across. They pass through the
         shields. No points for destroying them. Sparks are restored
         (at that level's count) whenever the shield rings regenerate.
       • The cannon tracks the player at all times and fires a large
         white-noise FUZZBALL whenever it has a clear line of fire
         (aligned gaps — and always, once the inner ring is down).
       • When the OUTERMOST ring is fully destroyed the shields
         regenerate: middle expands out, inner becomes middle, a brand
         new ring blooms at the core, and mines are restored.
       • Destroying the castle = 1,440 points + an EXTRA SHIP, and the
         remaining rings collapse inward in a slow crumbling animation.
       • Difficulty increases per level AND continuously within a level.
       • Color overlay palette: outer ring YELLOW, middle ORANGE, inner
         RED; castle / ship / mines / text BLUE-WHITE vector beams.
       • The playfield WRAPS on all four edges.
       • Cabinet controls: TURN LEFT, TURN RIGHT, THRUST, FIRE.

     Scoring note: the castle value (1,440 + extra ship) and the
     "no points for mines" rule are straight from the original
     operation manual. Per-section ring values (outer 30 / middle 40 /
     inner 50 per section destroyed) follow widely cited convention and
     are a documented design choice of this recreation.
     ═══════════════════════════════════════════════════════════════════ */

  /* ── Canvas & DOM refs ─────────────────────────────────────────────── */
  const canvas = document.getElementById("gameCanvas");
  const ctx    = canvas.getContext("2d", { alpha: false });
  let W = 0, H = 0, S = 0; /* S = min(W,H): the scaling unit */

  const attractScreen = document.getElementById("attractScreen");
  const deadOverlay   = document.getElementById("deadOverlay");
  const deadContent   = document.getElementById("deadContent");
  const hud     = document.getElementById("hud");
  const muteBtn = document.getElementById("muteBtn");

  const touchControls = document.getElementById("touchControls");
  const touchLeft   = document.getElementById("touchLeft");
  const touchThrust = document.getElementById("touchThrust");
  const touchRight  = document.getElementById("touchRight");
  const touchFire   = document.getElementById("touchFire");

  /* Accessibility attributes on touch/mute controls */
  [[touchLeft, "Rotate left"], [touchThrust, "Thrust forward"],
   [touchRight, "Rotate right"], [touchFire, "Fire weapon"],
   [muteBtn, "Toggle mute"]].forEach(function(pair) {
    const el = pair[0];
    if (!el) return;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-label", pair[1]);
  });

  let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  /* ── Audio (Web Audio API) ─────────────────────────────────────────── */
  let audioCtx = null, masterGain = null, muted = false;
  let thrustTimer = 0;

  function initAudio() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext || null;
      if (!AC) return;
      if (!audioCtx) {
        audioCtx = new AC();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.9;
        masterGain.connect(audioCtx.destination);
      } else if (audioCtx.state === "suspended") {
        audioCtx.resume();
      }
    } catch (e) { audioCtx = null; }
  }

  function playTone(freq, dur, type, vol, freqEnd) {
    if (!audioCtx || muted) return;
    try {
      const t = audioCtx.currentTime;
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(masterGain);
      o.start(t); o.stop(t + dur);
    } catch (e) {}
  }

  /* White-noise burst — the original cannon "fuzzball" hisses */
  function playNoise(dur, vol, freqStart, freqEnd) {
    if (!audioCtx || muted) return;
    try {
      const t = audioCtx.currentTime;
      const len = Math.max(1, Math.floor(audioCtx.sampleRate * dur));
      const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = audioCtx.createBufferSource();
      src.buffer = buf;
      const f = audioCtx.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.setValueAtTime(freqStart, t);
      f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
      f.Q.value = 1.2;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f); f.connect(g); g.connect(masterGain);
      src.start(t); src.stop(t + dur);
    } catch (e) {}
  }

  /* ── Thrust engine: continuous detuned saw drone (user-spec rework) ── */
  let thrustVoice = null;
  function startThrustSound() {
    if (!audioCtx || muted || thrustVoice) return;
    try {
      const t = audioCtx.currentTime;
      const g = audioCtx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.06);
      const lp = audioCtx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(160, t);
      lp.Q.value = 0.7;
      /* two detuned saws = fat vector-cabinet engine, no stutter pops */
      const o1 = audioCtx.createOscillator();
      o1.type = "sawtooth"; o1.frequency.setValueAtTime(47, t);
      const o2 = audioCtx.createOscillator();
      o2.type = "sawtooth"; o2.frequency.setValueAtTime(48.7, t);
      const o2g = audioCtx.createGain(); o2g.gain.value = 0.6;
      /* slow filter wobble so it breathes instead of buzzing */
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine"; lfo.frequency.value = 7.5;
      const lfoGain = audioCtx.createGain(); lfoGain.gain.value = 55;
      lfo.connect(lfoGain); lfoGain.connect(lp.frequency);
      o1.connect(lp); o2.connect(o2g); o2g.connect(lp);
      lp.connect(g); g.connect(masterGain);
      o1.start(t); o2.start(t); lfo.start(t);
      thrustVoice = { o1, o2, lfo, g };
    } catch (e) {}
  }
  function stopThrustSound() {
    if (!thrustVoice) return;
    try {
      const t = audioCtx.currentTime;
      thrustVoice.g.gain.cancelScheduledValues(t);
      thrustVoice.g.gain.setValueAtTime(Math.max(0.0001, thrustVoice.g.gain.value), t);
      thrustVoice.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      thrustVoice.o1.stop(t + 0.15);
      thrustVoice.o2.stop(t + 0.15);
      thrustVoice.lfo.stop(t + 0.15);
    } catch (e) {}
    thrustVoice = null;
  }

  function sfxShoot()    { playTone(980, 0.05, "square", 0.07, 420); }
  function sfxRingHit()  { playTone(1600, 0.05, "square", 0.09, 1100); }
  function sfxRingBreak(){ playTone(700, 0.12, "sawtooth", 0.11, 180); }
  function sfxFuzzball() { playNoise(0.5, 0.16, 3400, 500); playTone(140, 0.25, "sawtooth", 0.08, 90); }
  function sfxMineLaunch(){ playTone(300, 0.12, "square", 0.07, 900); }
  function sfxMineDie()  { playTone(1200, 0.04, "triangle", 0.05, 300); }
  function sfxCastleBoom(){ playNoise(0.9, 0.22, 900, 60); playTone(120, 0.7, "sawtooth", 0.16, 30); playTone(60, 0.9, "square", 0.12, 20); }
  function sfxExtraShip(){ [523, 659, 784, 1047].forEach(function(f, i) { setTimeout(function() { playTone(f, 0.14, "sine", 0.09); }, i * 80); }); }
  function sfxDeath()    { playNoise(0.6, 0.18, 1800, 120); [320, 240, 160, 90].forEach(function(f, i) { setTimeout(function() { playTone(f, 0.28, "sawtooth", 0.14); }, i * 90); }); }
  function sfxRegen()    { [440, 554, 659, 880].forEach(function(f, i) { setTimeout(function() { playTone(f, 0.14, "sine", 0.09); }, i * 60); }); }
  function sfxLevelIntro(){ playTone(660, 0.12, "square", 0.07); setTimeout(function() { playTone(880, 0.18, "square", 0.07); }, 140); }

  /* ── Layout / resize / stars ───────────────────────────────────────── */
  function updateSafeInsets() {
    try {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;top:0;left:0;right:0;bottom:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);padding-left:env(safe-area-inset-left,0px);padding-right:env(safe-area-inset-right,0px);";
      document.body.appendChild(probe);
      const cs = getComputedStyle(probe);
      safeInsets = {
        top: parseInt(cs.paddingTop, 10) || 0,
        bottom: parseInt(cs.paddingBottom, 10) || 0,
        left: parseInt(cs.paddingLeft, 10) || 0,
        right: parseInt(cs.paddingRight, 10) || 0
      };
      document.body.removeChild(probe);
    } catch (e) {}
  }

  let stars = [];
  function regenerateStars() {
    stars = [];
    const count = Math.floor((W * H) / 9000);
    for (let i = 0; i < count; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, b: 0.25 + Math.random() * 0.6, tw: Math.random() * Math.PI * 2 });
    }
  }

  function resize() {
    const oldW = W || window.innerWidth, oldH = H || window.innerHeight;
    updateSafeInsets();
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    S = Math.min(W, H);
    if (player && oldW > 0) {
      player.x = (player.x / oldW) * W;
      player.y = (player.y / oldH) * H;
    }
    regenerateStars();
  }

  let resizeTimer = null;
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  }

  /* ── Input ─────────────────────────────────────────────────────────── */
  const keys = {};
  let touchLeftOn = false, touchThrustOn = false, touchRightOn = false, touchFireOn = false;

  function setTouch(which, on) {
    if (which === "left")   touchLeftOn = on;
    if (which === "thrust") touchThrustOn = on;
    if (which === "right")  touchRightOn = on;
    if (which === "fire")   touchFireOn = on;
  }

  function bindTouch(el, which) {
    if (!el) return;
    const down = function(ev) { ev.preventDefault(); initAudio(); if (state === "attract") { startGame(); return; } if (state === "dead" && deadPauseTimer <= 0) { toAttract(); return; } setTouch(which, true); };
    const up = function(ev) { ev.preventDefault(); setTouch(which, false); };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    el.addEventListener("pointerleave", up);
  }

  function pressStartOrConfirm() {
    if (state === "attract") { startGame(); return true; }
    if (state === "dead" && deadPauseTimer <= 0) { toAttract(); return true; }
    return false;
  }

  function initInput() {
    window.addEventListener("keydown", function(e) {
      initAudio();
      if (e.code === "Space" || e.code === "ArrowUp" || e.code === "ArrowDown" ||
          e.code === "ArrowLeft" || e.code === "ArrowRight") e.preventDefault();
      keys[e.code] = true;
      if (e.code === "KeyM") toggleMute();
      if (e.code === "Space" || e.code === "Enter") pressStartOrConfirm();
      idleTimer = 0;
    });
    window.addEventListener("keyup", function(e) { keys[e.code] = false; });
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", function() { setTimeout(resize, 200); });
    if (canvas) {
      canvas.addEventListener("pointerdown", function() {
        initAudio();
        if (state === "attract") startGame();
        else if (state === "dead" && deadPauseTimer <= 0) toAttract();
      });
    }
    bindTouch(touchLeft, "left");
    bindTouch(touchRight, "right");
    bindTouch(touchThrust, "thrust");
    bindTouch(touchFire, "fire");
    if (muteBtn) muteBtn.addEventListener("pointerdown", function(ev) { ev.preventDefault(); initAudio(); toggleMute(); });
  }

  function rotDir() {
    let d = 0;
    if (keys.ArrowLeft || keys.KeyA || touchLeftOn)   d -= 1;
    if (keys.ArrowRight || keys.KeyD || touchRightOn) d += 1;
    return d;
  }
  function thrustDir() { return (keys.ArrowUp || keys.KeyW || touchThrustOn) ? 1 : 0; }
  function fireHeld()  { return keys.Space || keys.KeyF || touchFireOn; }

  /* ── Math helpers ──────────────────────────────────────────────────── */
  function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }
  function angTo(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }
  function angDiff(a, b) {
    let d = a - b;
    while (d > Math.PI)  d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrap(obj) {
    const m = 14;
    if (obj.x < -m) obj.x = W + m; else if (obj.x > W + m) obj.x = -m;
    if (obj.y < -m) obj.y = H + m; else if (obj.y > H + m) obj.y = -m;
  }

  /* ── Fidelity constants ────────────────────────────────────────────── */
  const RING_SEGMENTS = 12;          /* original: 12 sections per ring */
  const SECTION_HITS  = 2;           /* original: two hits per section */
  const RING_RADII  = [0.115, 0.152, 0.19]; /* inner, middle, outer (x S) */
  const RING_DIRS   = [1, -1, 1];   /* oppositely rotating rings */
  /* Color overlay: rings YELLOW / ORANGE / RED from outer to inner */
  const RING_COLORS = ["#ff2a2a", "#ff8c1a", "#ffd80a"];
  const RING_CORES  = ["#ff9a8a", "#ffc38a", "#ffef9a"]; /* hot cores, still tinted */
  const CORE_COLOR  = "#3ecbff";    /* playfield beams: blue-white */
  const FUZZ_COLOR  = "#ffffff";    /* fuzzball: white noise */
  const CORE_RADIUS = 0.052;        /* x S: castle */
  const CASTLE_POINTS = 1440;       /* original manual: 1440 + extra ship */
  const SECTION_POINTS = [50, 40, 30]; /* inner/middle/outer — documented choice */
  const MAX_MINES = 3;              /* max spark battery (3, but scheduled) */
  const MINE_ORBIT_FRAMES = 180;   /* sparks orbit ~3s, then break loose */
  const MAX_PLAYER_BULLETS = 2;     /* classic vector-shooter shot limit */
  const PLAYER_FIRE_CD = 9;
  const COLLIDE_BAND = 0.016;       /* ring hit band (x S) */
  const REGEN_ANIM_FRAMES = 50;
  const COLLAPSE_FRAMES = 130;
  const IDLE_TIMEOUT = 1800;
  const DEAD_PAUSE_FRAMES = 150;

  /* ── Difficulty (per level + continuous intra-level ramp) ─────────── */
  function ringRotSpeed(level)        { return Math.min(0.014, 0.006 + level * 0.0008); }
  function coreTurnRate(level)        { return Math.min(0.045, 0.018 + level * 0.0025); }
  function cannonFireCooldown(level)  { return Math.max(55, 130 - level * 8); }
  function fuzzSpeed(level)           { return Math.min(5.2, 2.4 + level * 0.28); }
  function mineSpeed(level, ramp)     { return Math.min(5.0, (0.85 + level * 0.14) * (1 + ramp)); }
  function mineTurnRate(level, ramp)  { return Math.min(0.045, (0.014 + level * 0.002) * (1 + ramp)); }
  /* Spark deployment schedule (user-spec): no sparks attack on level 1
     start — one appears after ~60s, two from level 3, three from level 6. */
  function sparkCountForLevel(lv) { return lv >= 6 ? 3 : lv >= 3 ? 2 : 1; }
  function sparkFirstDelay(lv)    { return Math.max(900, 3600 - (lv - 1) * 450); } /* ~60s on lvl 1 */
  function sparkGap(lv)           { return Math.max(600, 1200 - (lv - 1) * 100); }

  /* ── Game state ────────────────────────────────────────────────────── */
  let state = "attract"; /* attract | playing | dying | castleDead | dead */
  let score = 0, lives = 3, level = 1;
  let levelFrames = 0;        /* drives the continuous intra-level ramp */
  let ramp = 0;               /* speed multiplier growth within a level */
  let idleTimer = 0;
  let deadPauseTimer = 0;
  let dyingTimer = 0;
  let collapseTimer = 0;
  let collapseFactor = 1;    /* rings shrink 1 -> 0 when the castle dies */
  let introTimer = 0;
  let gameOverScore = 0;

  let highScore = 0;
  try { highScore = parseInt(localStorage.getItem("sc2_highscore"), 10) || 0; } catch (e) {}
  const HIGH_SCORE_SLOTS = 5;
  let highScoreTable = [];
  try {
    const saved = JSON.parse(localStorage.getItem("sc2_hst") || "[]");
    if (Array.isArray(saved)) {
      highScoreTable = saved.filter(function(x) { return typeof x === "number" && x >= 0; }).slice(0, HIGH_SCORE_SLOTS);
    }
  } catch (e) {}
  function saveHighScoreTable() {
    try { localStorage.setItem("sc2_hst", JSON.stringify(highScoreTable)); } catch (e) {}
  }
  function insertHighScore(s) {
    highScoreTable.push(s);
    highScoreTable.sort(function(a, b) { return b - a; });
    if (highScoreTable.length > HIGH_SCORE_SLOTS) highScoreTable.length = HIGH_SCORE_SLOTS;
    if (s > highScore) highScore = s;
    try { localStorage.setItem("sc2_highscore", String(highScore)); } catch (e) {}
    saveHighScoreTable();
  }

  /* ── Attract: deterministic card rotation ──────────────────────────── */
  const ATTRACT_CARD_DURATIONS = [300, 300, 300, 360];
  let attractCard = 0, attractCardTimer = 0, attractFrame = 0;

  function advanceAttractCard() {
    attractCardTimer++;
    if (attractCardTimer >= ATTRACT_CARD_DURATIONS[attractCard]) {
      attractCardTimer = 0;
      attractCard = (attractCard + 1) % ATTRACT_CARD_DURATIONS.length;
    }
  }

  /* ── Entities ──────────────────────────────────────────────────────── */
  const player = {
    x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2,
    alive: true, fireCooldown: 0, invincible: 0, thrusting: false,
  };

  const castle = {
    x: 0, y: 0, angle: -Math.PI / 2,
    fireCooldown: 0, locked: false, alive: true,
  };

  /* Rings: index 0 = inner, 1 = middle, 2 = outer.
     Each section health: 2 intact, 1 damaged, 0 destroyed. */
  function freshSections() {
    const a = [];
    for (let i = 0; i < RING_SEGMENTS; i++) a.push(SECTION_HITS);
    return a;
  }
  function freshRing(i) { return { rot: 0, sections: freshSections(), bloom: 0 }; }

  let rings = [freshRing(0), freshRing(1), freshRing(2)];

  let bullets = [];     /* player shots */
  let fuzzballs = [];   /* castle fuzzball shots */
  let mines = [];       /* spark battery, deployed per level schedule */
  let sparkScheduled = 0;   /* sparks waiting to deploy this level */
  let sparkTimer = 0;       /* frames until the next scheduled deploy */
  let particles = [];
  let debris = [];

  function ringRadius(i) {
    const r = rings[i];
    if (r.bloom > 0) {
      const t = 1 - r.bloom / REGEN_ANIM_FRAMES;
      return S * RING_RADII[i] * (0.15 + 0.85 * t);
    }
    return S * RING_RADII[i] * collapseFactor;
  }
  function ringLive(i) {
    let n = 0;
    const sec = rings[i].sections;
    for (let k = 0; k < RING_SEGMENTS; k++) if (sec[k] > 0) n++;
    return n;
  }
  function ringBulwark(i) { return ringLive(i) > 0 && rings[i].bloom <= 0; }
  function coreRadius() { return S * CORE_RADIUS * collapseFactor; }

  function resetCastle() {
    castle.x = W / 2;
    castle.y = H / 2;
    castle.angle = -Math.PI / 2;
    castle.fireCooldown = cannonFireCooldown(level);
    castle.locked = false;
    castle.alive = true;
    fuzzballs.length = 0;
  }

  function resetPlayer(spawnAtEdge) {
    if (spawnAtEdge) {
      /* Respawn away from the castle: pick a far corner */
      const corners = [[W * 0.12, H * 0.14], [W * 0.88, H * 0.14], [W * 0.12, H * 0.86], [W * 0.88, H * 0.86]];
      const c = corners[Math.floor(Math.random() * corners.length)];
      player.x = c[0]; player.y = c[1];
    }
    player.vx = 0; player.vy = 0;
    player.angle = angTo(player.x, player.y, W / 2, H / 2);
    player.alive = true;
    player.fireCooldown = 0;
    player.invincible = 120;
    player.thrusting = false;
    thrustTimer = 0;
    stopThrustSound();
    setTouch("left", false); setTouch("right", false);
    setTouch("thrust", false); setTouch("fire", false);
  }

  /* Sparks are launched from the core and orbit the castle (signature),
     then attack in lateral pincer arcs (never head-on). Deployment is
     scheduled per level — they do NOT all show up on level 1. */
  function spawnMine(i, role) {
    const a = (Math.PI * 2 * (i || 0)) / Math.max(1, sparkCountForLevel(level)) + attractFrame * 0.01;
    const r = coreRadius() + 6;
    const sp = mineSpeed(level, ramp);
    mines.push({
      x: castle.x + Math.cos(a) * r,
      y: castle.y + Math.sin(a) * r,
      vx: -Math.sin(a) * sp, vy: Math.cos(a) * sp,
      age: 0, loose: false, orbitDir: 1, size: 0.008,
      angle: 0,
      role: role || "pincer",          /* pincer | ambusher */
      side: (mines.length % 2 === 0) ? 1 : -1, /* pincer flank */
      sparkPhase: Math.random() * Math.PI * 2,  /* vector jitter seed */
      dodge: 0,                         /* frames of active bullet-dodge */
      trail: [],                      /* zero-g spark trail */
    });
    sfxMineLaunch();
  }

  function resetMines() {
    mines.length = 0;
    /* Schedule this level's battery: nothing attacks immediately on
       level 1; the first spark breaks loose after ~60s. */
    sparkScheduled = sparkCountForLevel(level);
    sparkTimer = sparkFirstDelay(level);
  }

  function deployScheduledSparks() {
    if (sparkScheduled <= 0 || sparkTimer > 0) return;
    if (mines.length >= MAX_MINES) { sparkTimer = 30; return; }
    /* Higher levels: the LAST spark of the battery lays back as an
       ambusher so the attack never comes from one direction only. */
    const battery = sparkCountForLevel(level);
    const ambusher = level >= 2 && battery >= 2 && sparkScheduled === 1 && mines.length > 0;
    spawnMine(mines.length, ambusher ? "ambusher" : "pincer");
    sparkScheduled--;
    sparkTimer = sparkGap(level);
  }

  function resetRings() {
    rings = [freshRing(0), freshRing(1), freshRing(2)];
  }

  /* ── Player firing ─────────────────────────────────────────────────── */
  function fireBullet() {
    if (player.fireCooldown > 0) return;
    if (bullets.length >= MAX_PLAYER_BULLETS) return;
    const speed = 8.2;
    const nx = Math.cos(player.angle), ny = Math.sin(player.angle);
    bullets.push({
      x: player.x + nx * 12, y: player.y + ny * 12,
      px: player.x + nx * 12, py: player.y + ny * 12,
      vx: player.vx + nx * speed, vy: player.vy + ny * speed,
      life: 90,
    });
    player.fireCooldown = PLAYER_FIRE_CD;
    sfxShoot();
  }

  /* ── Ray / crossing geometry ───────────────────────────────────────── */
  /* Section index covering an absolute field angle for a given ring. */
  function sectionAt(ringIdx, absAngle) {
    const ring = rings[ringIdx];
    const seg = (Math.PI * 2) / RING_SEGMENTS;
    let a = absAngle - ring.rot;
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    return Math.floor(a / seg) % RING_SEGMENTS;
  }

  /* Is an outward ray from the castle at absAngle clear of live sections? */
  function rayClear(absAngle) {
    for (let i = 0; i < 3; i++) {
      if (ringBulwark(i) && rings[i].sections[sectionAt(i, absAngle)] > 0) return false;
    }
    return true;
  }

  /* Did a moving point cross a ring radius this frame over a live section?
     Returns ring index or -1. prevR/newR = radii before/after the step. */
  function crossedLiveSection(ringIdx, absAngle, prevR, newR) {
    const R = ringRadius(ringIdx);
    if (!ringBulwark(ringIdx)) return -1;
    const band = S * COLLIDE_BAND;
    /* near the ring radius AND moving across it */
    if (Math.abs(prevR - R) > band && Math.abs(newR - R) > band) {
      const crossed = (prevR - R) * (newR - R) < 0;
      if (!crossed) return -1;
    } else if (Math.abs(newR - R) > band) {
      return -1;
    }
    const segIdx = sectionAt(ringIdx, absAngle);
    const ring = rings[ringIdx];
    if (ring.sections[segIdx] <= 0) return -1;
    /* Also reject near-gap cases: angle inside the swept section arc. */
    const seg = (Math.PI * 2) / RING_SEGMENTS;
    let a = absAngle - ring.rot;
    while (a < 0) a += Math.PI * 2;
    while (a >= Math.PI * 2) a -= Math.PI * 2;
    const off = a - Math.floor(a / seg) * seg;
    const arcCover = seg * 0.8; /* 80% arc per section, 20% gap */
    if (off > arcCover) return -1;
    return ringIdx;
  }

  /* ── Shield damage / regeneration ──────────────────────────────────── */
  function hitSection(ringIdx, segIdx) {
    const ring = rings[ringIdx];
    const before = ring.sections[segIdx];
    if (before <= 0) return;
    ring.sections[segIdx] = before - 1;
    if (ring.sections[segIdx] === 1) {
      sfxRingHit();
      spawnSparks(ringIdx, segIdx, 4);
    } else {
      /* Section destroyed */
      score += SECTION_POINTS[ringIdx];
      sfxRingBreak();
      spawnSparks(ringIdx, segIdx, 10);
      if (ringLive(ringIdx) === 0) onRingDestroyed(ringIdx);
    }
  }

  /* Full-ring destruction: only the OUTERMOST surviving ring regenerates.
     Middle expands to outer, inner to middle, brand-new ring blooms at the
     core, and the mines are restored (original cabinet behavior). */
  function onRingDestroyed(ringIdx) {
    if (ringIdx !== 2) return; /* inner/middle holes persist until cascade */
    /* Cascade shift: outer = old middle, middle = old inner, inner = fresh */
    for (let i = 2; i > 0; i--) {
      rings[i].sections = rings[i - 1].sections.slice();
      rings[i].rot = rings[i - 1].rot;
    }
    rings[0].sections = freshSections();
    rings[0].bloom = REGEN_ANIM_FRAMES;
    /* Mines restored when rings regenerate */
    resetMines();
    sfxRegen();
  }

  /* ── Cannon: tracks always, fires only through clear fire-lines ───── */
  function updateCastle() {
    if (!castle.alive) return;
    const target = angTo(castle.x, castle.y, player.x, player.y);
    const d = angDiff(target, castle.angle);
    const rate = coreTurnRate(level) * (1 + ramp * 0.5);
    if (Math.abs(d) > rate) castle.angle += Math.sign(d) * rate;
    else castle.angle = target;
    castle.locked = Math.abs(d) < 0.06;

    if (castle.fireCooldown > 0) { castle.fireCooldown--; return; }
    /* Fire rule: clear line of fire along the tracked aim angle.
       With the inner ring down there is always a clear line. */
    const innerDown = !ringBulwark(0);
    if (innerDown || rayClear(castle.angle)) {
      const speed = fuzzSpeed(level);
      const exposed = 1 - liveSectionFraction();
      fuzzballs.push({
        x: castle.x + Math.cos(castle.angle) * (coreRadius() + 4),
        y: castle.y + Math.sin(castle.angle) * (coreRadius() + 4),
        vx: Math.cos(castle.angle) * speed,
        vy: Math.sin(castle.angle) * speed,
        size: 0.012 + exposed * 0.016, /* fuzzball grows as defenses fall */
        life: 420, seed: Math.random() * 1000,
      });
      castle.fireCooldown = cannonFireCooldown(level);
      sfxFuzzball();
    }
  }

  function liveSectionFraction() {
    let live = 0;
    for (let i = 0; i < 3; i++) live += ringLive(i);
    return live / (3 * RING_SEGMENTS);
  }

  /* ── Spark mines: orbit, then lateral pincer attacks (user-spec) ──── */
  /* Sparks NEVER steer straight at the ship (that just flies into the
     player's own gunfire). They swing in on offset flank arcs, jitter
     their vectors like zero-gravity sparks, veer off an oncoming
     bullet, and bank off screen edges instead of wrapping. Ambushers
     hang back on the far side of the map to catch the player later. */
  function nearestBulletThreat(m) {
    let best = null, bestD = 1e9;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const d = dist(b.x, b.y, m.x, m.y);
      if (d > 90) continue;
      /* only bullets that travel roughly toward this spark matter */
      const toSpark = angTo(b.x, b.y, m.x, m.y);
      const bDir = Math.atan2(b.vy, b.vx);
      if (Math.abs(angDiff(toSpark, bDir)) < 0.9 && d < bestD) { bestD = d; best = b; }
    }
    return best;
  }

  function bounceEdges(m) {
    const m0 = 10;
    let hit = false;
    if (m.x < m0)        { m.x = m0;        m.vx =  Math.abs(m.vx); hit = true; }
    else if (m.x > W-m0) { m.x = W - m0;  m.vx = -Math.abs(m.vx); hit = true; }
    if (m.y < m0)        { m.y = m0;        m.vy =  Math.abs(m.vy); hit = true; }
    else if (m.y > H-m0) { m.y = H - m0;  m.vy = -Math.abs(m.vy); hit = true; }
    if (hit) {
      /* fold the flank-side preference so the spark comes back across */
      const sp = mineSpeed(level, ramp);
      const cur = Math.atan2(m.vy, m.vx);
      m.vx = Math.cos(cur) * sp; m.vy = Math.sin(cur) * sp;
      m.side = -m.side;
    }
    return hit;
  }

  function updateMines() {
    if (sparkTimer > 0) sparkTimer--;
    deployScheduledSparks();
    const sp = mineSpeed(level, ramp);
    const turn = mineTurnRate(level, ramp);
    const orbitR = coreRadius() + S * 0.06;
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      m.age++;
      m.angle += 0.08;
      let want;
      if (!m.loose) {
        /* Orbit: steer perpendicular around the castle at fixed radius */
        const toC = angTo(m.x, m.y, castle.x, castle.y);
        want = toC + Math.PI / 2 * m.orbitDir;
        /* zero-gravity spark shimmer while it orbits */
        want += Math.sin(attractFrame * 0.25 + m.sparkPhase) * 0.12;
        const cur = Math.atan2(m.vy, m.vx);
        const step = clamp(angDiff(want, cur), -0.05, 0.05);
        const na = cur + step;
        m.vx = Math.cos(na) * sp; m.vy = Math.sin(na) * sp;
        /* Pull back if drifted far from orbit radius */
        const dC = dist(m.x, m.y, castle.x, castle.y);
        if (dC > orbitR + 20) {
          const inward = angTo(m.x, m.y, castle.x, castle.y);
          m.vx = lerp(m.vx, Math.cos(inward) * sp, 0.1);
          m.vy = lerp(m.vy, Math.sin(inward) * sp, 0.1);
        }
        if (m.age > MINE_ORBIT_FRAMES) m.loose = true;
      } else {
        const dP = dist(m.x, m.y, player.x, player.y);
        const toP = angTo(m.x, m.y, player.x, player.y);
        if (m.role === "ambusher") {
          /* Lay back on the far side of the map until the player comes
             close, then break into a fresh flank charge. */
          const hold = Math.min(W, H) * 0.42;
          const cPull = angTo(m.x, m.y, castle.x, castle.y);
          if (dP < hold * 0.6) {
            /* player crossed into range — flank strike from behind */
            want = toP + m.side * Math.PI * 0.5;
          } else if (dP < hold) {
            /* SKIRMISH: surge away (sparks have no gravity to fall back
               on — they vector-change), then sweep back in next phase */
            const phase = Math.floor(attractFrame * 0.01 + m.sparkPhase) % 3;
            if (phase === 0) want = toP + Math.PI * 0.8 * m.side;   /* back off */
            else if (phase === 1) want = toP;                        /* surge    */
            else want = toP + m.side * Math.PI * 0.5;                /* flank    */
          } else {
            /* patrol the far side: orbit the castle at long range */
            want = cPull + Math.PI / 2 * (m.side >= 0 ? 1 : -1);
          }
        } else {
          /* Pincer: aim at an offset FLANK of the ship, not at the
             ship itself, so the approach arc enters from the side. */
          const flank = Math.min(90, 40 + dP * 0.25);
          want = toP + m.side * (Math.PI / 2) * clamp(flank / 60, 0.45, 1);
          /* very close & nearly abeam: cut the arc inward to connect */
          if (dP < 60) want = toP + m.side * 0.35;
          /* spark shimmer: constantly changing vectors, gravity-free */
          want += Math.sin(attractFrame * 0.18 + m.sparkPhase) * 0.35;
        }
        /* dodge: oncoming bullet → swing perpendicular, never head-on */
        const threat = nearestBulletThreat(m);
        if (threat) m.dodge = 18;
        if (m.dodge > 0) {
          m.dodge--;
          const cur0 = Math.atan2(m.vy, m.vx);
          const away = angDiff(toP, cur0) >= 0 ? Math.PI / 2 : -Math.PI / 2;
          want = toP + away;
        }
        const cur = Math.atan2(m.vy, m.vx);
        /* smarter at higher levels: the turn closes on the arc faster */
        const smartTurn = turn * (1 + Math.min(0.8, level * 0.12));
        const step = clamp(angDiff(want, cur), -smartTurn, smartTurn);
        const na = cur + step;
        m.vx = Math.cos(na) * sp; m.vy = Math.sin(na) * sp;
      }
      m.x += m.vx; m.y += m.vy;
      m.size = 0.008 + Math.min(0.006, m.age * 0.00002);
      bounceEdges(m);
      /* pack the spark trail behind it: newest head, older tail —
         spread backwards along its own vector so it streaks like a
         gravity-free spark */
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > 9) m.trail.shift();
    }
  }

  /* ── Particles & debris (vector style: short bright line segments) ── */
  function spawnSparks(ringIdx, segIdx, n) {
    const R = ringRadius(ringIdx);
    const seg = (Math.PI * 2) / RING_SEGMENTS;
    const a = rings[ringIdx].rot + segIdx * seg + seg / 2;
    const cx = castle.x + Math.cos(a) * R;
    const cy = castle.y + Math.sin(a) * R;
    burstParticles(cx, cy, RING_COLORS[ringIdx], n);
  }

  function burstParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.5 + Math.random() * 3;
      particles.push({
        x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 25 + Math.floor(Math.random() * 25), maxLife: 50, color: color,
      });
    }
  }

  function updateParticles(list) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i];
      p.x += p.vx; p.y += p.vy;
      p.vx *= 0.97; p.vy *= 0.97;
      p.life--;
      if (p.life <= 0) list.splice(i, 1);
    }
  }

  /* ── Death / castle collapse / level flow ─────────────────────────── */
  function hitPlayer() {
    if (!player.alive || player.invincible > 0 || state !== "playing") return;
    player.alive = false;
    lives--;
    stopThrustSound();
    sfxDeath();
    burstParticles(player.x, player.y, CORE_COLOR, 26);
    dyingTimer = 110;
    state = "dying";
  }

  function killCastle() {
    castle.alive = false;
    score += CASTLE_POINTS;          /* original: 1440 + extra ship */
    lives = Math.min(9, lives + 1);
    sfxCastleBoom();
    setTimeout(sfxExtraShip, 900);
    /* Violent explosion + ring collapse animation */
    burstParticles(castle.x, castle.y, FUZZ_COLOR, 40);
    burstParticles(castle.x, castle.y, CORE_COLOR, 24);
    const seg = (Math.PI * 2) / RING_SEGMENTS;
    for (let ri = 0; ri < 3; ri++) {
      for (let si = 0; si < RING_SEGMENTS; si++) {
        if (rings[ri].sections[si] > 0 && Math.random() < 0.5) spawnSparks(ri, si, 2);
      }
    }
    bullets.length = 0;
    fuzzballs.length = 0;
    collapseTimer = COLLAPSE_FRAMES;
    collapseFactor = 1;
    state = "castleDead";
  }

  function startLevel(nextLevel) {
    level = nextLevel;
    levelFrames = 0; ramp = 0;
    resetCastle();
    resetRings();
    resetMines();
    bullets.length = 0; fuzzballs.length = 0;
    resetPlayer(false);
    player.x = W / 2; player.y = H * 0.82;
    player.angle = -Math.PI / 2;
    introTimer = 100;
    state = "playing";
    sfxLevelIntro();
  }

  function endGame() {
    gameOverScore = score;
    insertHighScore(score);
    populateDeadOverlay();
    deadPauseTimer = DEAD_PAUSE_FRAMES;
    state = "dead";
  }

  function toAttract() {
    setDeadOverlayVisible(false);
    score = 0; lives = 3; level = 1; levelFrames = 0; ramp = 0;
    resetRings(); resetCastle(); mines.length = 0;
    sparkScheduled = 0; sparkTimer = 0;
    stopThrustSound();
    bullets.length = 0; fuzzballs.length = 0; particles.length = 0; debris.length = 0;
    attractCard = 0; attractCardTimer = 0;
    setHUDVisible(false);
    state = "attract";
  }

  function startGame() {
    score = 0; lives = 3; level = 1; levelFrames = 0; ramp = 0;
    particles.length = 0;
    resetPlayer(false);
    player.x = W / 2; player.y = H * 0.82;
    player.angle = -Math.PI / 2;
    resetCastle(); resetRings(); resetMines();
    bullets.length = 0; fuzzballs.length = 0;
    setAttractScreen(false);
    setDeadOverlayVisible(false);
    setHUDVisible(true);
    introTimer = 100;
    state = "playing";
    idleTimer = 0;
    sfxLevelIntro();
  }

  function toggleMute() {
    muted = !muted;
    if (muteBtn) muteBtn.textContent = muted ? "SOUND ON" : "MUTE";
  }

  /* ── Main update ───────────────────────────────────────────────────── */
  function update() {
    attractFrame++;

    if (state === "attract") { advanceAttractCard(); return; }

    if (state === "dead") {
      if (deadPauseTimer > 0) deadPauseTimer--;
      return;
    }

    if (state === "dying") {
      dyingTimer--;
      updateParticles(particles);
      if (dyingTimer <= 0) {
        if (lives > 0) { resetPlayer(true); state = "playing"; }
        else endGame();
      }
      return;
    }

    if (state === "castleDead") {
      collapseTimer--;
      collapseFactor = Math.max(0, collapseTimer / COLLAPSE_FRAMES);
      updateParticles(particles);
      /* Ring sections flicker off as they collapse inward */
      if (collapseTimer % 6 === 0) {
        const ri = Math.floor(Math.random() * 3);
        const si = Math.floor(Math.random() * RING_SEGMENTS);
        if (rings[ri].sections[si] > 0) { rings[ri].sections[si] = 0; spawnSparks(ri, si, 2); }
      }
      if (collapseTimer <= 0) startLevel(level + 1);
      return;
    }

    if (state !== "playing") return;

    /* Idle → cabinet attract behavior */
    idleTimer++;
    if (idleTimer >= IDLE_TIMEOUT) { toAttract(); return; }

    /* Continuous intra-level difficulty ramp (the original "catch") */
    levelFrames++;
    ramp = Math.min(0.5, levelFrames * 0.00012);

    if (introTimer > 0) introTimer--;

    /* Rings rotate (opposite directions) */
    const rs = ringRotSpeed(level) * (1 + ramp * 0.3);
    for (let i = 0; i < 3; i++) {
      rings[i].rot += RING_DIRS[i] * rs;
      if (rings[i].rot > Math.PI * 2) rings[i].rot -= Math.PI * 2;
      if (rings[i].rot < 0) rings[i].rot += Math.PI * 2;
      if (rings[i].bloom > 0) rings[i].bloom--;
    }

    /* Player physics */
    if (player.alive) {
      const TURN = 0.09;
      const d = rotDir();
      if (d !== 0) player.angle += d * TURN;
      const thrust = 0.16;
      player.thrusting = thrustDir() !== 0;
      if (player.thrusting) {
        player.vx += Math.cos(player.angle) * thrust;
        player.vy += Math.sin(player.angle) * thrust;
        startThrustSound();
      } else {
        stopThrustSound();
      }
      /* Terminal drift decay — cabinet-era feel */
      player.vx *= 0.996; player.vy *= 0.996;
      const sp = Math.hypot(player.vx, player.vy);
      const cap = 5.0;
      if (sp > cap) { player.vx = (player.vx / sp) * cap; player.vy = (player.vy / sp) * cap; }
      player.x += player.vx; player.y += player.vy;
      wrap(player);
      if (player.fireCooldown > 0) player.fireCooldown--;
      if (player.invincible > 0) player.invincible--;
      if (fireHeld()) fireBullet();

      /* Player vs shield rings (live sections kill), vs castle */
      const pr = dist(player.x, player.y, castle.x, castle.y);
      if (pr < coreRadius() + S * 0.008) hitPlayer();
      else {
        for (let i = 0; i < 3; i++) {
          if (crossedLiveSection(i, angTo(castle.x, castle.y, player.x, player.y), pr, pr) >= 0) { hitPlayer(); break; }
        }
      }
    }

    /* Castle AI */
    updateCastle();

    /* Mines */
    updateMines();

    /* Player bullets */
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.px = b.x; b.py = b.y;
      b.x += b.vx; b.y += b.vy;
      b.life--;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }
      const bMoved = dist(b.px, b.py, b.x, b.y) > 0.01;
      if (!bMoved) { continue; }
      wrapB(b);
      const c0 = dist(b.px, b.py, castle.x, castle.y);
      const c1 = dist(b.x, b.y, castle.x, castle.y);
      /* Skip collisions across a wrap discontinuity */
      if (dist(b.px, b.py, b.x, b.y) > Math.max(W, H) * 0.5) continue;
      const aim = angTo(castle.x, castle.y, b.x, b.y);
      /* Castle hit */
      if (castle.alive && (c1 < coreRadius() || (c0 > coreRadius() && c1 < coreRadius()))) {
        bullets.splice(i, 1);
        killCastle();
        break;
      }
      /* Ring section hits (outermost inward) */
      let consumed = false;
      for (let ri = 2; ri >= 0; ri--) {
        const R = ringRadius(ri);
        const crossed = (c0 - R) * (c1 - R) <= 0 || Math.abs(c1 - R) < S * COLLIDE_BAND;
        if (!crossed) continue;
        const hit = crossedLiveSection(ri, angTo(castle.x, castle.y, (b.px + b.x) / 2, (b.py + b.y) / 2), c0, c1);
        if (hit >= 0) {
          const segIdx = sectionAt(ri, angTo(castle.x, castle.y, (b.px + b.x) / 2, (b.py + b.y) / 2));
          hitSection(ri, segIdx);
          bullets.splice(i, 1);
          consumed = true;
          break;
        }
      }
      if (consumed) continue;
      /* Bullet vs mine — destroyed, NO points (original rule) */
      for (let j = mines.length - 1; j >= 0; j--) {
        if (dist(b.x, b.y, mines[j].x, mines[j].y) < Math.max(7, mines[j].size * S + 3)) {
          burstParticles(mines[j].x, mines[j].y, CORE_COLOR, 8);
          mines.splice(j, 1);
          bullets.splice(i, 1);
          sfxMineDie();
          break;
        }
      }
    }

    /* Fuzzballs: pass through shields (energy rounds), kill player */
    for (let i = fuzzballs.length - 1; i >= 0; i--) {
      const f = fuzzballs[i];
      f.x += f.vx; f.y += f.vy;
      f.life--;
      if (f.life <= 0) { fuzzballs.splice(i, 1); continue; }
      wrap(f);
      if (player.alive && player.invincible <= 0 && dist(f.x, f.y, player.x, player.y) < f.size * S + 7) {
        fuzzballs.splice(i, 1);
        hitPlayer();
      }
    }

    /* Loose mines kill on contact */
    if (player.alive && player.invincible <= 0) {
      for (let j = 0; j < mines.length; j++) {
        if (dist(mines[j].x, mines[j].y, player.x, player.y) < mines[j].size * S + 8) { hitPlayer(); break; }
      }
    }

    updateParticles(particles);
  }

  /* Wrap helper for bullets using the same margin as wrap() */
  function wrapB(b) { const m = 14; if (b.x < -m) b.x = W + m; else if (b.x > W + m) b.x = -m; if (b.y < -m) b.y = H + m; else if (b.y > H + m) b.y = -m; }

  /* ── Vector rendering helpers ──────────────────────────────────────── */
  function glow(color, radius) {
    ctx.shadowColor = color;
    ctx.shadowBlur = radius;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }
  function glowThick(color, w, radius) {
    glow(color, radius);
    ctx.lineWidth = w;
  }
  function noGlow() { ctx.shadowBlur = 0; ctx.shadowColor = "transparent"; }

  function drawStars() {
    noGlow();
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      const tw = 0.7 + 0.3 * Math.sin(attractFrame * 0.02 + s.tw);
      ctx.fillStyle = "rgba(180,220,255," + (s.b * tw).toFixed(3) + ")";
      ctx.fillRect(s.x, s.y, 1.4, 1.4);
    }
  }

  function arcSeg(cx, cy, r, a0, a1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
  }

  function dashedArc(cx, cy, r, a0, a1, dash) {
    ctx.save();
    ctx.setLineDash([dash, dash]);
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a1);
    ctx.stroke();
    ctx.restore();
  }

  /* One ring: intact = solid bright, damaged = dashed dim, destroyed = gap
     with end-tick marks (cabinet-style directional cue). */
  function drawRing(ri) {
    const ring = rings[ri];
    const R = ringRadius(ri);
    if (R < 4) return;
    const seg = (Math.PI * 2) / RING_SEGMENTS;
    const arcCover = seg * 0.8;
    const color = RING_COLORS[ri];
    const thickness = Math.max(2.2, S * 0.006);
    for (let si = 0; si < RING_SEGMENTS; si++) {
      const hp = ring.sections[si];
      if (hp <= 0) {
        /* gap ticks at the broken section edges */
        const a0 = ring.rot + si * seg;
        const a1 = a0 + arcCover;
        glow(color, 4);
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.35;
        for (const a of [a0, a1]) {
          ctx.beginPath();
          ctx.moveTo(castle.x + Math.cos(a) * (R - S * 0.008), castle.y + Math.sin(a) * (R - S * 0.008));
          ctx.lineTo(castle.x + Math.cos(a) * (R + S * 0.008), castle.y + Math.sin(a) * (R + S * 0.008));
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        continue;
      }
      const a0 = ring.rot + si * seg;
      const a1 = a0 + arcCover;
      if (hp === SECTION_HITS) {
        glowThick(color, thickness, 14);
        ctx.globalAlpha = 0.22;
        arcSeg(castle.x, castle.y, R, a0, a1);
        ctx.globalAlpha = 1;
        glowThick("#ffffff", Math.max(1, thickness * 0.45), 8);
        arcSeg(castle.x, castle.y, R, a0, a1);
      } else {
        /* damaged: dashed, dimmer */
        glowThick(color, Math.max(1.4, thickness * 0.6), 8);
        ctx.globalAlpha = 0.55;
        dashedArc(castle.x, castle.y, R, a0, a1, S * 0.008);
        ctx.globalAlpha = 1;
      }
    }
    noGlow();
  }

  /* Castle: low vector fort silhouette + tracking barrel */
  function drawCastle() {
    if (!castle.alive && collapseTimer <= 0) return;
    const r = coreRadius();
    glow(CORE_COLOR, 12);
    ctx.lineWidth = 1.8;
    /* Base fort: wide flat hull with dome */
    ctx.beginPath();
    ctx.moveTo(castle.x - r, castle.y + r * 0.55);
    ctx.lineTo(castle.x - r * 0.55, castle.y - r * 0.1);
    ctx.lineTo(castle.x + r * 0.55, castle.y - r * 0.1);
    ctx.lineTo(castle.x + r, castle.y + r * 0.55);
    ctx.stroke();
    /* Dome */
    ctx.beginPath();
    ctx.arc(castle.x, castle.y - r * 0.1, r * 0.42, Math.PI, 0);
    ctx.stroke();
    /* Tracking barrel */
    const bx = castle.x + Math.cos(castle.angle) * r * 0.3;
    const by = castle.y + Math.sin(castle.angle) * r * 0.3;
    const mx = castle.x + Math.cos(castle.angle) * r * 1.35;
    const my = castle.y + Math.sin(castle.angle) * r * 1.35;
    const perp = castle.angle + Math.PI / 2;
    const bw = r * 0.16;
    ctx.beginPath();
    ctx.moveTo(bx + Math.cos(perp) * bw, by + Math.sin(perp) * bw);
    ctx.lineTo(mx + Math.cos(perp) * bw, my + Math.sin(perp) * bw);
    ctx.lineTo(mx - Math.cos(perp) * bw, my - Math.sin(perp) * bw);
    ctx.lineTo(bx - Math.cos(perp) * bw, by - Math.sin(perp) * bw);
    ctx.stroke();
    /* Lock indicator: small chevron when locked */
    if (castle.locked && castle.alive) {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(mx, my, r * 0.22, castle.angle - 0.7, castle.angle + 0.7);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    noGlow();
  }

  /* Player: classic vector wedge + thrust flame */
  function drawPlayer() {
    if (!player.alive) return;
    if (player.invincible > 0 && Math.floor(attractFrame / 4) % 2 === 0) return; /* blink */
    const a = player.angle;
    const sz = Math.max(9, S * 0.022);
    glow(CORE_COLOR, 10);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(castle.x === 0 ? 0 : player.x + Math.cos(a) * sz, player.y + Math.sin(a) * sz);
    ctx.lineTo(player.x + Math.cos(a + 2.5) * sz * 0.8, player.y + Math.sin(a + 2.5) * sz * 0.8);
    ctx.moveTo(player.x + Math.cos(a) * sz, player.y + Math.sin(a) * sz);
    ctx.lineTo(player.x + Math.cos(a - 2.5) * sz * 0.8, player.y + Math.sin(a - 2.5) * sz * 0.8);
    ctx.moveTo(player.x + Math.cos(a + 2.5) * sz * 0.8, player.y + Math.sin(a + 2.5) * sz * 0.8);
    ctx.lineTo(player.x + Math.cos(a) * sz * 0.25, player.y + Math.sin(a) * sz * 0.25);
    ctx.lineTo(player.x + Math.cos(a - 2.5) * sz * 0.8, player.y + Math.sin(a - 2.5) * sz * 0.8);
    ctx.stroke();
    if (player.thrusting) {
      glow("#ff8c1a", 8);
      const fa = a + Math.PI;
      const fl = sz * (0.7 + Math.random() * 0.4);
      ctx.beginPath();
      ctx.moveTo(player.x + Math.cos(fa - 0.3) * sz * 0.5, player.y + Math.sin(fa - 0.3) * sz * 0.5);
      ctx.lineTo(player.x + Math.cos(fa) * fl, player.y + Math.sin(fa) * fl);
      ctx.lineTo(player.x + Math.cos(fa + 0.3) * sz * 0.5, player.y + Math.sin(fa + 0.3) * sz * 0.5);
      ctx.stroke();
    }
    noGlow();
  }

  /* Sparks: bright jittery streaks with a trailing tail (no diamond) */
  function drawMines() {
    glowThick("#ffe9a0", 1.6, 14);
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      const sz = Math.max(3, m.size * S);
      const a = Math.atan2(m.vy, m.vx);
      /* tail: fade along the back-vector */
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(m.x - Math.cos(a) * sz * 3.2, m.y - Math.sin(a) * sz * 3.2);
      ctx.stroke();
      ctx.restore();
      /* head: random 3-armed spark crackle, re-rolled every few frames */
      glowThick("#ffffff", 1.5, 16);
      const seed = Math.floor(attractFrame * 0.5) + i * 7;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) {
        const sa = a + Math.sin(seed * 1.7 + k * 2.4) * 2.1 + k * 2.09;
        const sl = sz * (0.8 + ((Math.sin(seed * 2.3 + k * 3.1) + 1) * 0.5) * 1.1);
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(m.x + Math.cos(sa) * sl, m.y + Math.sin(sa) * sl);
      }
      ctx.stroke();
      ctx.fillStyle = "#fffbe8";
      ctx.beginPath();
      ctx.arc(m.x, m.y, Math.max(1.2, sz * 0.42), 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow();
  }

  /* Bullets: bright blue darts */
  function drawBullets() {
    glow(CORE_COLOR, 8);
    ctx.lineWidth = 2;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      const a = Math.atan2(b.vy, b.vx);
      ctx.beginPath();
      ctx.moveTo(b.x - Math.cos(a) * 3, b.y - Math.sin(a) * 3);
      ctx.lineTo(b.x + Math.cos(a) * 3, b.y + Math.sin(a) * 3);
      ctx.stroke();
    }
    noGlow();
  }

  /* Fuzzball: white scribbled noise circle */
  function drawFuzzballs() {
    glowThick(FUZZ_COLOR, 1.4, 16);
    for (let i = 0; i < fuzzballs.length; i++) {
      const f = fuzzballs[i];
      const R = f.size * S;
      ctx.beginPath();
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const jit = R * (0.75 + 0.35 * Math.sin(attractFrame * 0.35 + k * 2.1 + f.seed));
        const x = f.x + Math.cos(a) * jit, y = f.y + Math.sin(a) * jit;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.stroke();
    }
    noGlow();
  }

  function drawParticles() {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const a = Math.max(0, p.life / p.maxLife);
      ctx.globalAlpha = a;
      glow(p.color, 6);
      ctx.lineWidth = 1.6;
      const ang = Math.atan2(p.vy, p.vx);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - Math.cos(ang) * 4, p.y - Math.sin(ang) * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noGlow();
  }

  function glowText(text, x, y, size, color, align, blur) {
    ctx.save();
    ctx.font = "bold " + size + "px 'Courier New', monospace";
    ctx.textAlign = align || "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = color;
    ctx.shadowBlur = blur === undefined ? 12 : blur;
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  /* ── HUD ───────────────────────────────────────────────────────────── */
  function drawHUD() {
    const yOff = safeInsets.top;
    const fs = Math.max(14, Math.min(20, S * 0.035));
    glowText(String(score).padStart(6, "0"), 18, 26 + yOff, fs, "#ffffff", "left");
    glowText("1UP SCORE", 18, 26 + yOff + fs * 1.4, fs * 0.55, CORE_COLOR, "left", 6);
    glowText(String(Math.max(highScore, gameOverScore)).padStart(6, "0"), W / 2, 26 + yOff, fs, "#ffd80a", "center");
    glowText("HIGH SCORE", W / 2, 26 + yOff + fs * 1.4, fs * 0.55, CORE_COLOR, "center", 6);
    glowText("LEVEL " + level, W - 18, 26 + yOff, fs * 0.8, "#ffffff", "right");
    /* Ships remaining as tiny wedges */
    for (let i = 0; i < Math.min(lives, 5); i++) {
      const x = W - 24 - i * (fs + 6);
      const yy = 26 + yOff + fs * 1.6;
      glow(CORE_COLOR, 6);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, yy - 5);
      ctx.lineTo(x - 4, yy + 4);
      ctx.lineTo(x + 4, yy + 4);
      ctx.closePath();
      ctx.stroke();
    }
    noGlow();
  }

  /* ── Attract mode ──────────────────────────────────────────────────── */
  function drawAttractShowcase() {
    /* Rotating ring + mine demo behind the cards, purely decorative */
    ctx.save();
    const demoT = attractFrame;
    for (let ri = 0; ri < 3; ri++) {
      const R = S * RING_RADII[ri] * 0.9;
      const seg = (Math.PI * 2) / RING_SEGMENTS;
      const rot = demoT * ringRotSpeed(3) * RING_DIRS[ri];
      glowThick(RING_COLORS[ri], Math.max(2, S * 0.005), 12);
      for (let si = 0; si < RING_SEGMENTS; si++) {
        if ((si + ri) % 5 === 3) continue; /* some simulated damage gaps */
        arcSeg(W / 2, H / 2, R, rot + si * seg, rot + si * seg + seg * 0.8);
      }
    }
    /* castle silhouette */
    ctx.translate(W / 2, H / 2);
    ctx.rotate(demoT * 0.01);
    const r = coreRadius();
    glow(CORE_COLOR, 10);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-r, r * 0.55); ctx.lineTo(-r * 0.55, -r * 0.1);
    ctx.lineTo(r * 0.55, -r * 0.1); ctx.lineTo(r, r * 0.55);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -r * 0.1, r * 0.42, Math.PI, 0); ctx.stroke();
    ctx.restore();
    /* orbiting mines */
    glow(CORE_COLOR, 8);
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 3; i++) {
      const a = demoT * 0.02 + (i * Math.PI * 2) / 3;
      const rr = S * 0.19 * 1.55;
      const mx = W / 2 + Math.cos(a) * rr, my = H / 2 + Math.sin(a) * rr;
      ctx.beginPath();
      ctx.moveTo(mx, my - 5); ctx.lineTo(mx + 5, my); ctx.lineTo(mx, my + 5); ctx.lineTo(mx - 5, my);
      ctx.closePath(); ctx.stroke();
    }
    noGlow();
  }

  function drawAttract() {
    const cx = W / 2;
    const titleY = H * 0.24;
    if (attractCard === 0) {
      const fs = Math.max(30, Math.min(64, S * 0.1));
      glowText("STAR CASTLE", cx, titleY, fs, "#ffd80a", "center", 24);
      glowText("2", cx + fs * 1.9, titleY - fs * 0.45, fs * 0.6, "#ff2a2a", "center", 18);
      if (Math.floor(attractFrame / 30) % 2 === 0) {
        glowText("PRESS FIRE TO PLAY", cx, H * 0.52, Math.max(16, S * 0.04), "#ffffff", "center", 10);
      }
      glowText("CREDIT 01", cx, H * 0.9, Math.max(11, S * 0.028), CORE_COLOR, "center", 6);
    } else if (attractCard === 1) {
      const fs = Math.max(14, S * 0.045);
      glowText("OBJECT OF THE GAME", cx, H * 0.18, fs, "#ffd80a", "center", 12);
      const lines = [
        "DESTROY THE STAR CASTLE",
        "SECTIONS REQUIRE TWO HITS",
        "RING REGENERATES WHEN OUTER",
        "RING IS DESTROYED",
        "MINES HAVE NO POINTS VALUE",
      ];
      lines.forEach(function(ln, i) {
        glowText(ln, cx, H * 0.3 + i * fs * 1.7, fs * 0.62, i === 4 ? "#ff8c1a" : "#ffffff", "center", 6);
      });
    } else if (attractCard === 2) {
      const fs = Math.max(14, S * 0.045);
      glowText("SCORING", cx, H * 0.18, fs, "#ffd80a", "center", 12);
      const rows = [
        ["OUTER RING SECTION", "30"],
        ["MIDDLE RING SECTION", "40"],
        ["INNER RING SECTION", "50"],
        ["STAR CASTLE", "1440 + SHIP"],
      ];
      rows.forEach(function(row, i) {
        glowText(row[0], cx - fs * 0.4, H * 0.32 + i * fs * 1.9, fs * 0.55, "#ffffff", "right", 5);
        glowText(row[1], cx + fs * 0.6, H * 0.32 + i * fs * 1.9, fs * 0.55, RING_COLORS[2 - Math.min(2, i)], "left", 5);
      });
      glowText("MINES - NO POINTS", cx, H * 0.32 + 4 * fs * 1.9, fs * 0.5, CORE_COLOR, "center", 5);
    } else {
      const fs = Math.max(14, S * 0.045);
      glowText("HIGH SCORES", cx, H * 0.18, fs, "#ffd80a", "center", 12);
      for (let i = 0; i < HIGH_SCORE_SLOTS; i++) {
        const s = highScoreTable[i];
        glowText(String(i + 1), cx - fs * 2.2, H * 0.3 + i * fs * 1.8, fs * 0.6, CORE_COLOR, "left", 5);
        glowText(s === undefined ? "------" : String(s).padStart(6, "0"), cx + fs * 2.2, H * 0.3 + i * fs * 1.8, fs * 0.6, i === 0 ? "#ffd80a" : "#ffffff", "right", 5);
      }
      glowText("LEFT / RIGHT TURN   THRUST   FIRE", cx, H * 0.88, fs * 0.5, CORE_COLOR, "center", 5);
      glowText("M = MUTE", cx, H * 0.93, fs * 0.45, "#ffffff", "center", 4);
    }
  }

  /* ── Game render ───────────────────────────────────────────────────── */
  function drawGame() {
    drawStars();
    drawCastle();
    drawRing(2);
    drawRing(1);
    drawRing(0);
    drawMines();
    drawBullets();
    drawFuzzballs();
    drawPlayer();
    drawParticles();
    drawHUD();
    if (introTimer > 0) {
      glowText("LEVEL " + level, W / 2, H * 0.34, Math.max(24, S * 0.07), "#ffffff", "center", 16);
    }
    if (state === "castleDead") {
      if (collapseTimer % 20 < 12) {
        glowText("STAR CASTLE DESTROYED", W / 2, H * 0.3, Math.max(16, S * 0.05), "#ffd80a", "center", 14);
        glowText("EXTRA SHIP AWARDED", W / 2, H * 0.37, Math.max(12, S * 0.035), CORE_COLOR, "center", 8);
      }
    }
  }

  /* ── DOM overlays ──────────────────────────────────────────────────── */
  function populateDeadOverlay() {
    if (!deadContent) return;
    deadContent.innerHTML =
      '<p class="do-title">GAME OVER</p>' +
      '<p class="do-score">FINAL SCORE: ' + score + '</p>' +
      (gameOverScore >= highScore && gameOverScore > 0 ? '<p class="do-new">NEW HIGH SCORE!</p>' : '') +
      '<p class="do-high">HIGH SCORE: ' + highScore + '</p>' +
      '<p class="do-prompt">PRESS FIRE TO CONTINUE</p>';
    setDeadOverlayVisible(true);
  }

  function setHUDVisible(v)   { if (hud)   hud.style.display = v ? "block" : "none"; }
  function setDeadOverlayVisible(v) { if (deadOverlay) deadOverlay.classList.toggle("hidden", !v); }
  function setAttractScreen(v) { if (attractScreen) attractScreen.classList.toggle("hidden", !v); }

  /* ── Frame loop: fixed 60 Hz logic steps ──────────────────────────── */
  let lastT = 0, acc = 0;
  const FRAME = 1000 / 60;

  function render() {
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, W, H);
    if (state === "attract") { drawStars(); drawAttractShowcase(); drawAttract(); }
    else if (state === "dead") { drawStars(); }
    else drawGame();
  }

  function loop(now) {
    if (!lastT) lastT = now;
    acc += now - lastT;
    lastT = now;
    if (acc > FRAME * 5) acc = FRAME * 5;
    while (acc >= FRAME) { update(); acc -= FRAME; }
    render();
    requestAnimationFrame(loop);
  }

  /* ── Boot ──────────────────────────────────────────────────────────── */
  function init() {
    resize();
    initInput();
    resetCastle();
    resetPlayer(false);
    setHUDVisible(false);
    setDeadOverlayVisible(false);
    requestAnimationFrame(loop);
  }

  init();

  /* ── Test hooks ────────────────────────────────────────────────────── */
  window._state = function() { return state; };
  window._rings = function() { return rings; };
  window._ringRadius = ringRadius;
  window._ringLive = ringLive;
  window._castle = castle;
  window._player = player;
  window._mines = mines;
  window._bullets = bullets;
  window._fuzzballs = fuzzballs;
  window._score = function() { return score; };
  window._lives = function() { return lives; };
  window._level = function() { return level; };
  window._startGame = function() { startGame(); };
  window._step = function(n) { idleTimer = 0; for (let i = 0; i < (n || 1); i++) { update(); idleTimer = 0; } };
  window._rayClear = rayClear;
  window._sectionAt = sectionAt;
  window._hitSection = hitSection;
  window._hitPlayer = function() { const inv = player.invincible; player.invincible = 0; hitPlayer(); player.invincible = inv; };
  window._killCastle = killCastle;
  window._spawnMine = spawnMine;
  window._resetMines = resetMines;
  window._sparkState = function() { return { scheduled: sparkScheduled, timer: sparkTimer, active: mines.length }; };
  window._sparkCountForLevel = sparkCountForLevel;
  window._sparkFirstDelay = sparkFirstDelay;
  window._scores = { CASTLE: CASTLE_POINTS, SECTION: SECTION_POINTS };
  window._consts = { SEGMENTS: RING_SEGMENTS, HITS: SECTION_HITS, MINES: MAX_MINES };
  window._ringRotSpeed = ringRotSpeed;
  window._mineSpeed = mineSpeed;
  window._cannonFireCooldown = cannonFireCooldown;
  window._ramp = function() { return ramp; };
})();
