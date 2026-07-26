(function() {
  "use strict";

  /* ── Canvas & DOM refs ─────────────────────────────── */
  const canvas = document.getElementById("gameCanvas");
  const ctx    = canvas.getContext("2d", { alpha: false });
  let W, H;

  const attractScreen = document.getElementById("attractScreen");
  const attractPrompt = document.getElementById("attractPrompt");

  const deadOverlay = document.getElementById("deadOverlay");
  const deadContent = document.getElementById("deadContent");

  const hud       = document.getElementById("hud");
  const muteBtn   = document.getElementById("muteBtn");

  const touchControls = document.getElementById("touchControls");
  const touchLeft     = document.getElementById("touchLeft");
  const touchThrust   = document.getElementById("touchThrust");
  const touchRight    = document.getElementById("touchRight");
  const touchFire     = document.getElementById("touchFire");

  let safeInsets = { top: 0, right: 0, bottom: 0, left: 0 };

  /* ── Audio (Web Audio API) ─────────────────────────── */
  let audioCtx = null, masterGain = null, muted = false;
  let thrustTimer = 0;

  function initAudio() {
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  }

  function playTone(freq, dur, type, vol) {
    if (!audioCtx || muted) return;
    if (audioCtx.state === 'suspended') { audioCtx.resume(); }
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || "square";
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.12, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(masterGain);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  }

  /* Cabinet-fidelity audio palette: short, distinct, procedural vector-arcade cues.
     Waveforms chosen per their 1980s vector arcade character:
     - triangle: soft rumble (thrust)
     - square: bright ping (shoot, shield)
     - sawtooth: aggressive bite (hit, breach, cannon, explosion, death)
     - sine: melodic arc (victory/level-up, shield regen)
     iPhone-safe: initAudio resumes suspended context; playTone guards against suspend. */

  function sfxThrust() { thrustTimer++; if (thrustTimer > 1 && thrustTimer % 8 !== 0) return; playTone(80, 0.04, "triangle", 0.04); }

  function sfxShoot() { playTone(660, 0.06, "square", 0.08); if (audioCtx && !muted) { var t = audioCtx.currentTime, o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(); o2.type = "square"; o2.frequency.setValueAtTime(1200, t); o2.frequency.exponentialRampToValueAtTime(480, t + 0.035); g2.gain.setValueAtTime(0.04, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.06); o2.connect(g2).connect(masterGain); o2.start(t); o2.stop(t + 0.06); } }

  function sfxExplosion() { playTone(80, 0.15, "sawtooth", 0.15); playTone(45, 0.25, "square", 0.10); }

  function sfxHit() { playTone(300, 0.04, "square", 0.12); if (audioCtx && !muted) { var t = audioCtx.currentTime, o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(); o2.type = "square"; o2.frequency.value = 900; g2.gain.setValueAtTime(0.06, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.025); o2.connect(g2).connect(masterGain); o2.start(t); o2.stop(t + 0.025); } }

  function sfxShield() { playTone(1500, 0.04, "square", 0.06); }

  function sfxBreach() { playTone(150, 0.08, "sawtooth", 0.12); playTone(800, 0.03, "square", 0.08); if (audioCtx && !muted) { var t = audioCtx.currentTime, o2 = audioCtx.createOscillator(), g2 = audioCtx.createGain(); o2.type = "sawtooth"; o2.frequency.setValueAtTime(2400, t); o2.frequency.exponentialRampToValueAtTime(400, t + 0.035); g2.gain.setValueAtTime(0.06, t); g2.gain.exponentialRampToValueAtTime(0.001, t + 0.04); o2.connect(g2).connect(masterGain); o2.start(t); o2.stop(t + 0.04); } }

  function sfxLevelUp() { [523,659,784,1047,1319].forEach((f,i) => setTimeout(() => playTone(f, 0.20, "sine", 0.10), i*70)); }

  function sfxDeath() { [300,220,150,80].forEach((f,i) => setTimeout(() => playTone(f, 0.30, "sawtooth", 0.15), i*100)); }

  function sfxMine() { playTone(100, 0.08, "sawtooth", 0.12); playTone(55, 0.05, "square", 0.06); }

  function sfxShieldRegen() { [440,554,659,880,1100].forEach((f,i) => setTimeout(() => playTone(f, 0.15, "sine", 0.10), i*50)); }

  muteBtn.addEventListener("click", () => { toggleMute(); });

  /* ── Resize ─────────────────────────────────────────── */
  function updateSafeInsets() {
    const root = getComputedStyle(document.documentElement);
    safeInsets = {
      top: parseInt(root.getPropertyValue('--safe-top')) || 0,
      right: parseInt(root.getPropertyValue('--safe-right')) || 0,
      bottom: parseInt(root.getPropertyValue('--safe-bottom')) || 0,
      left: parseInt(root.getPropertyValue('--safe-left')) || 0,
    };
  }

  function regenerateStars() {
    stars = [];
    for (let i = 0; i < 120; i++) {
      stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.3, b: Math.random() });
    }
  }

  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
    updateSafeInsets();
  }

  function onResize() {
    resize();
    regenerateStars();
  }

  window.addEventListener("resize", onResize);
  resize();

  /* ── Input ─────────────────────────────────────────── */
  const keys = {};
  let touchLeftOn  = false, touchThrustOn = false, touchRightOn = false, touchFireOn = false;
  let canvasTapped = false;

  /* Primary-touch locking: each button remembers the touch identifier that
     activated it. Only that specific touch can deactivate it. This prevents
     a second finger from accidentally toggling a held button. */
  let touchLeftId  = null, touchThrustId = null, touchRightId = null, touchFireId = null;

  function setTouch(id, on, touchId) {
    if (id === "left") {
      if (on) { touchLeftOn = true; touchLeftId = touchId; }
      else if (touchId === touchLeftId) { touchLeftOn = false; touchLeftId = null; }
    }
    if (id === "thrust") {
      if (on) { touchThrustOn = true; touchThrustId = touchId; }
      else if (touchId === touchThrustId) { touchThrustOn = false; touchThrustId = null; }
    }
    if (id === "right") {
      if (on) { touchRightOn = true; touchRightId = touchId; }
      else if (touchId === touchRightId) { touchRightOn = false; touchRightId = null; }
    }
    if (id === "fire") {
      if (on) { touchFireOn = true; touchFireId = touchId; }
      else if (touchId === touchFireId) { touchFireOn = false; touchFireId = null; }
    }
  }

  function getTouchId(e) {
    if (e.changedTouches && e.changedTouches.length > 0) return e.changedTouches[0].identifier;
    if (e.targetTouches && e.targetTouches.length > 0) return e.targetTouches[0].identifier;
    return null;
  }

  function bindTouch(el, id) {
    el.addEventListener("touchstart", e => {
      e.preventDefault();
      const tid = getTouchId(e);
      setTouch(id, true, tid);
      initAudio();
      if (state === "playing") idleTimer = 0;
    });
    el.addEventListener("touchend", e => {
      e.preventDefault();
      const tid = getTouchId(e);
      setTouch(id, false, tid);
    });
    el.addEventListener("touchcancel", e => {
      e.preventDefault();
      const tid = getTouchId(e);
      setTouch(id, false, tid);
    });
  }

  let inputInitialized = false;

  function initInput() {
    if (inputInitialized) return;
    inputInitialized = true;
    window.addEventListener("keydown", e => {
      keys[e.code] = true;
      initAudio();
      if (state === "playing") idleTimer = 0;
      if (e.code === 'KeyM') toggleMute();
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyF', 'Enter'].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup",   e => { keys[e.code] = false; });

    /* Canvas tap/pointer for attract screen start (mobile) */
    canvas.addEventListener("pointerdown", e => {
      if (state === "attract" || state === "dead") {
        initAudio();
        canvasTapped = true;
        e.preventDefault();
      }
      if (state === "playing") {
        idleTimer = 0;
        initAudio();
      }
    });

    /* iOS Safari: register touchstart on the canvas so tap gestures don't trigger browser chrome (address bar, double-tap zoom). */
    canvas.addEventListener("touchstart", e => {
      if (state === "attract" || state === "dead") {
        e.preventDefault();
        initAudio();
      }
    }, { passive: false });

    /* Attract screen div: tap anywhere to start */
    attractScreen.addEventListener("touchstart", e => {
      if (state === "attract") {
        e.preventDefault();
        initAudio();
        canvasTapped = true;
      }
    });

    /* Desktop mouse pointer: click on attract overlay starts the game (V17a) */
    if (attractScreen) {
      attractScreen.addEventListener("click", () => { initAudio(); canvasTapped = true; });
    }

    /* Dead overlay div: tap anywhere to restart */
    if (deadOverlay) {
      deadOverlay.addEventListener("touchstart", e => {
        if (state === "dead") {
          e.preventDefault();
          initAudio();
          canvasTapped = true;
        }
      });
    }

    bindTouch(touchLeft, "left");
    bindTouch(touchThrust, "thrust");
    bindTouch(touchRight, "right");
    bindTouch(touchFire, "fire");

  window._touchLeftOn   = () => touchLeftOn;
  window._touchThrustOn = () => touchThrustOn;
  window._touchRightOn  = () => touchRightOn;
  window._touchFireOn   = () => touchFireOn;
  window._canvasTapped  = () => canvasTapped;
  window._touchLeftId   = () => touchLeftId;
  window._touchFireId   = () => touchFireId;
  }

  function rotDir() { return (keys.ArrowLeft || keys.KeyA || touchLeftOn)  ? -1 :
                     (keys.ArrowRight|| keys.KeyD || touchRightOn) ?  1 : 0; }
  function thrustDir() { return (keys.ArrowUp || keys.KeyW || touchThrustOn) ? 1 : 0; }
  function fireDir()   { return keys.Space || keys.KeyF || touchFireOn; }

  /* ── Vector helpers ─────────────────────────────────── */
  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  /* ── Difficulty scaling helpers (pure, deterministic) ── */
  /* Cannon fire cooldown in frames. Floor 45 prevents impossible fire rate. */
  function cannonFireCooldown(level) {
    return Math.max(45, 120 - level * 8);
  }

  /* Cannon shot speed in px/frame. Cap 6 keeps shots dodgeable. */
  function cannonShotSpeed(level) {
    return Math.min(6, 3 + level * 0.4);
  }

  /* Core aim turn rate in rad/frame. Cap 0.07 keeps tracking readable. */
  function coreTurnRate(level) {
    return Math.min(0.07, 0.03 + level * 0.005);
  }

  /* Shield ring rotation multiplier (rad/ms). Cap 0.006 keeps gaps readable. */
  function shieldRotationSpeed(level) {
    return Math.min(0.006, 0.003 + level * 0.0003);
  }

/* Enemy base speed in px/frame. Cap 4 keeps movement tractable. */
function enemyBaseSpeed(level) {
  return Math.min(4, 1.5 + level * 0.3);
}

/* Enemy spawn interval in frames. Floor 45 keeps continuous spawn restrained. */
function spawnInterval(level) {
  return Math.max(45, 240 - level * 12);
}

/* Core mine spawn interval in frames. Mines orbit the core (Star Castle signature). */
function coreMineInterval(level) {
  return Math.max(120, 240 - level * 12);
}

  /* ── Game state ─────────────────────────────────────── */
let state = "attract"; // attract | playing | coreDestruction | dead | levelTransition | dying

/* Idle timeout: after IDLE_TIMEOUT frames of no input during gameplay,
   return to attract mode (cabinet coin-drop behavior). */
const IDLE_TIMEOUT = 1800; // 30s at 60fps
const DEAD_PAUSE_FRAMES = 120; // 2s at 60fps — fixed "FREE PLAY" freeze before input accepted
let idleTimer = 0;
let score = 0, lives = 3, level = 1;
let transitionTimer = 0;
let coreDestructionTimer = 0;
let debrisSpawned = false;
let deathTimer = 0;
let deadPauseTimer = 0; // deterministic freeze before input accepted on dead state
let deathExplosionX = 0, deathExplosionY = 0;
let spawnTimer = 0;
let coreMineTimer = 0;
let shieldAngle = 0; /* frame-accumulated shield rotation state (deterministic, frame-rate independent) */

  /* ── Attract mode: deterministic card rotation ──────── */
  /* Card order: 0=Title, 1=HighScore, 2=Instructions, 3=Showcase
     Durations in frames at 60fps. Total cycle = 900 frames (15s). */
const ATTRACT_CARD_DURATIONS = [180, 180, 240, 300];
const ATTRACT_TOTAL_CYCLE  = 900;
let attractCard       = 0;
let attractCardTimer  = 0;
let showcaseAngle     = 0;
/* Deterministic attract-frame counter: drives all idle animations without Date.now().
   This is the basis for cabinet-style deterministic presentation. */
let attractFrame      = 0;
  let highScore = 0;
  try { highScore = parseInt(localStorage.getItem("sc2_highscore"), 10) || 0; } catch(e) {}

  /* High-score table: top N entries, persisted to localStorage.
     Cabinet-authentic: shows ranked scores on the attract card. */
  const HIGH_SCORE_SLOTS = 5;
  let highScoreTable = [];
  try {
    const saved = JSON.parse(localStorage.getItem("sc2_hst") || "[]");
    if (Array.isArray(saved)) highScoreTable = saved.slice(0, HIGH_SCORE_SLOTS);
  } catch(e) {}

  function saveHighScoreTable() {
    try { localStorage.setItem("sc2_hst", JSON.stringify(highScoreTable)); } catch(e) {}
  }

  function insertHighScore(s) {
    if (!s || s <= 0) return;
    highScoreTable.push(s);
    highScoreTable.sort((a, b) => b - a);
    if (highScoreTable.length > HIGH_SCORE_SLOTS) highScoreTable.length = HIGH_SCORE_SLOTS;
    saveHighScoreTable();
    highScore = highScoreTable.length ? highScoreTable[0] : 0;
    try { localStorage.setItem("sc2_highscore", String(highScore)); } catch(e) {}
  }

  function saveHighScore() {
    insertHighScore(score);
  }

function resetAttract() {
    attractCard = 0;
    attractCardTimer = 0;
    showcaseAngle = 0;
    attractFrame = 0;
    setAttractScreenVisible(true);
}

function advanceAttractCard() {
    attractFrame++;
    attractCardTimer++;
    if (attractCardTimer >= ATTRACT_CARD_DURATIONS[attractCard]) {
      attractCardTimer = 0;
      attractCard = (attractCard + 1) % ATTRACT_CARD_DURATIONS.length;
    }
    /* Showcase angle rotates continuously during showcase card */
    if (attractCard === 3) {
      showcaseAngle += 0.02;
    }
}

  /* ── Player ─────────────────────────────────────────── */
  const REGEN_ANIM_FRAMES = 40;

  const player = {
    x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2, rotVel: 0,
    thrusting: false,
    rings: [
      { health: 100, destroyed: false, breachFlash: 0 },
      { health: 100, destroyed: false, breachFlash: 0 },
      { health: 100, destroyed: false, breachFlash: 0 },
    ],
    invincible: 0, alive: true,
    fireCooldown: 0,
    shieldRegenTimer: 0,
    shieldRegenAmount: 1.5,
    regenAnimFrames: 0,
    regenOldRadii: null,
  };

  function resetPlayer() {
    player.x = W / 2;
    player.y = H / 2;
    player.vx = 0; player.vy = 0;
    player.angle = -Math.PI / 2;
    player.rotVel = 0;
    for (let i = 0; i < SHIELD_RINGS.length; i++) {
      player.rings[i].health = 100;
      player.rings[i].destroyed = false;
      player.rings[i].breachFlash = 0;
    }
    player.invincible = 120; // frames
    player.alive = true;
    player.fireCooldown = 0;
    player.regenAnimFrames = 0;
    player.regenOldRadii = null;
    thrustTimer = 0;
    /* Clear touch locks on respawn */
    touchLeftId = touchThrustId = touchRightId = touchFireId = null;
    touchLeftOn = touchThrustOn = touchRightOn = touchFireOn = false;
  }

  /* ── Projectiles ────────────────────────────────────── */
  let bullets = [];

  function fireBullet() {
    if (player.fireCooldown > 0) return;
    player.fireCooldown = 7;
    const tipX = player.x + Math.cos(player.angle) * 16;
    const tipY = player.y + Math.sin(player.angle) * 16;
    bullets.push({
      x: tipX, y: tipY,
      vx: Math.cos(player.angle) * 10 + player.vx * 0.2,
      vy: Math.sin(player.angle) * 10 + player.vy * 0.2,
      life: 90,
    });
    sfxShoot();
  }

  /* ── Central Core / Cannon ─────────────────────────── */
  const core = {
    x: 0, y: 0,
    angle: 0,
    fireCooldown: 0,
    muzzleFlash: 0,
    locked: false,
    hp: 5, maxHp: 5,
    alive: true,
  };
  let cannonShots = [];

  function resetCore() {
    core.x = W / 2;
    core.y = 60 + safeInsets.top;
    core.angle = Math.PI / 2;
    core.fireCooldown = 0;
    core.muzzleFlash = 0;
    core.locked = false;
    core.hp = 3 + level * 2;
    core.maxHp = core.hp;
    core.alive = true;
    cannonShots.length = 0;
    coreMineTimer = coreMineInterval(level);
  }

   /* Check if all shield rings have a gap at the given angle.
        Returns true if a clear path exists through all rings.
        Iterates outermost-to-innermost to match checkShieldCollision ordering.
        Uses the same segArc (0.55 coverage) as checkShieldCollision so the
        cannon can fire through the 45% intra-segment gaps, making shield
        gaps a genuine threat rather than an absolute barrier.
        During regen animation, skips the new ring (index 0) to prevent
        the core from firing through a ring that hasn't fully formed. */
  function findShieldGap(toAngle, shieldAngle) {
    const inRegenAnim = player.regenAnimFrames > 0 && player.regenCollRadii;
    for (let ri = SHIELD_RINGS.length - 1; ri >= 0; ri--) {
      const ring = SHIELD_RINGS[ri];
      const rs = player.rings[ri];
      if (rs.destroyed) continue;
      if (inRegenAnim && ri === 0) continue;
      const segAngle = (Math.PI * 2) / ring.segments;
      const segArc = segAngle * 0.55;
      let normAngle = toAngle - shieldAngle;
      while (normAngle < 0) normAngle += Math.PI * 2;
      while (normAngle >= Math.PI * 2) normAngle -= Math.PI * 2;
      const segIndex = Math.min(ring.segments - 1, Math.floor((normAngle + 1e-9) / segAngle));
      const segOffset = normAngle - segIndex * segAngle;
      const activeSegs = Math.floor((rs.health / 100) * ring.segments);
      if (segIndex < activeSegs && segOffset < segArc + 1e-9) return false;
    }
    return true;
  }

  /* Fire a cannon shot from the core toward the player.
      Uses leading prediction: estimates where the player will be when the shot
      arrives, so shots track moving targets rather than current position.
      Only fires when the cannon's aim is within fireAngleTol of the predicted
      target angle AND all rings have an aligned gap at that angle.
      This makes the cannon feel responsive (it tracks and leads) while remaining
      fair (player can dodge by breaking line-of-sight with shields). */
  function fireCannonShot() {
    if (!core.alive) return;
    if (core.fireCooldown > 0) return;

    /* Leading prediction: estimate player position at shot arrival time.
       travelFrames = distance / shotSpeed; predictedPos = playerPos + playerVel * travelFrames.
       Falls back to current player position if player is stationary or very close. */
    const dx = player.x - core.x;
    const dy = player.y - core.y;
    const distToPlayer = Math.hypot(dx, dy);
    const speed = cannonShotSpeed(level);
    const travelFrames = distToPlayer / speed;
    const leadX = player.x + player.vx * travelFrames;
    const leadY = player.y + player.vy * travelFrames;
    const playerSpeed = Math.hypot(player.vx, player.vy);
    const leadPredict = playerSpeed > 0.1 || distToPlayer < 150;

    const targetX = leadPredict ? leadX : player.x;
    const targetY = leadPredict ? leadY : player.y;
    const targetAngle = Math.atan2(targetY - core.y, targetX - core.x);

    /* Alignment tolerance: cannon only fires when its aim is within fireAngleTol
        of the target angle. Tighter tolerance (0.04) makes firing more deliberate
        and gives the player clearer read on when a shot is imminent.
        Barrel visibly tracks via core.angle, and fires only when locked on target. */
    const fireAngleTol = 0.04;
    let diff = targetAngle - core.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > fireAngleTol) return;

    if (!findShieldGap(targetAngle, shieldAngle)) return;

    core.fireCooldown = cannonFireCooldown(level);
    core.muzzleFlash = 6; /* frames of visible muzzle flash */
    cannonShots.push({
      x: core.x, y: core.y,
      vx: Math.cos(targetAngle) * speed,
      vy: Math.sin(targetAngle) * speed,
      life: 300,
    });
    sfxMine();
  }

  /* Update core tracking: rotate toward the player with lock-on preview.
      The barrel smoothly rotates via coreTurnRate. A "locked" flag triggers when
      the barrel is within LOCK_TOL of firing alignment (ready to fire if gaps align).
      This gives the player readable feedback that the cannon is about to fire. */
  const LOCK_TOL = 0.08;

  function updateCore() {
    if (!core.alive) return;
    const targetAngle = angle(core, player);
    let diff = targetAngle - core.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const turnRate = coreTurnRate(level);
    if (Math.abs(diff) > turnRate) {
      core.angle += Math.sign(diff) * turnRate;
    } else {
      core.angle = targetAngle;
    }

    /* Lock-on preview: barrel is "locked" when within LOCK_TOL (2x fireAngleTol)
       of the target angle. Signals imminent firing when gaps align. */
    core.locked = Math.abs(diff) <= LOCK_TOL;

    if (core.fireCooldown > 0) core.fireCooldown--;
    if (core.muzzleFlash > 0) core.muzzleFlash--;
    fireCannonShot();

    /* Core mine spawning (Star Castle signature: orbiting mines) */
    coreMineTimer--;
    if (coreMineTimer <= 0) {
      coreMineTimer = coreMineInterval(level);
      spawnCoreMine();
    }
  }

  /* ── Enemies / Mines ───────────────────────────────── */
  let enemies = [];

  function spawnEnemy(type) {
    const side = Math.floor(Math.random() * 4);
    let x, y;
    const margin = 60;
    if (side === 0) { x = Math.random() * W; y = -margin; }
    else if (side === 1) { x = W + margin; y = Math.random() * H; }
    else if (side === 2) { x = Math.random() * W; y = H + margin; }
    else { x = -margin; y = Math.random() * H; }

    const baseSpeed = enemyBaseSpeed(level);
    let speed, hp, size, color;

    if (type === "mine") {
      speed = baseSpeed * 0.6;
      hp = 1; size = 12; color = "#ff4444";
    } else if (type === "chaser") {
      speed = baseSpeed;
      hp = 2; size = 14; color = "#ff8800";
    } else if (type === "fast") {
      speed = baseSpeed * 1.6;
      hp = 1; size = 10; color = "#ffcc00";
    } else {
      speed = baseSpeed * 1.2;
      hp = 3; size = 16; color = "#ff0088";
    }

    const angleToPlayer = Math.atan2(player.y - y, player.x - x);
    enemies.push({
      x, y,
      vx: Math.cos(angleToPlayer) * speed,
      vy: Math.sin(angleToPlayer) * speed,
      hp, maxHp: hp, size, color, type,
      angle: 0,
    });
  }

  function spawnWave() {
    const count = 2 + level;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < 0.30) spawnEnemy("mine");
      else if (r < 0.70) spawnEnemy("chaser");
      else spawnEnemy("fast");
    }
  }

  /* Spawn a mine that orbits the core (Star Castle signature mechanic).
     Mine spawns at orbitRadius from core center with perpendicular velocity
     to create circular orbit. Homing behavior still applies toward player. */
  function spawnCoreMine() {
    if (!core.alive) return;
    const MAX_CORE_MINES = 8;
    const activeCoreMines = enemies.filter(e => e.coreSpawned).length;
    if (activeCoreMines >= MAX_CORE_MINES) return;
    const orbitRadius = 100;
    const a = Math.random() * Math.PI * 2;
    const orbitSpeed = (orbitRadius * Math.PI * 2) / 180;
    enemies.push({
      x: core.x + Math.cos(a) * orbitRadius,
      y: core.y + Math.sin(a) * orbitRadius,
      vx: -Math.sin(a) * orbitSpeed,
      vy: Math.cos(a) * orbitSpeed,
      hp: 1, maxHp: 1, size: 12, color: "#ffff00", type: "mine", coreSpawned: true,
      angle: 0,
    });
  }

  /* ── Particles ─────────────────────────────────────── */
  let particles = [];

  /* Seeded PRNG (LCG) for deterministic visual sequences */
  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 16807 + 0) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  /* Deterministic core-destruction debris burst */
  function spawnCoreDebris(x, y) {
    const rng = seededRandom(42);
    for (let i = 0; i < 24; i++) {
      const a = rng() * Math.PI * 2;
      const s = rng() * 4 + 2;
      particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 60 + Math.floor(rng() * 30), maxLife: 90,
        color: rng() > 0.5 ? "#ff8800" : "#ff4444",
        size: rng() * 3 + 2,
      });
    }
  }

  function spawnParticles(x, y, color, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = Math.random() * 3 + 1;
      particles.push({
        x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 30 + Math.random() * 25, maxLife: 55,
        color, size: Math.random() * 3 + 1,
      });
    }
  }

  /* ── Shield rings (outermost=ring 2, innermost=ring 0) ───────────── */
  /* Each ring has per-depth visual attributes: intensity controls bloom weight,
     glow is the shadow blur radius for that ring's ghost pass. Outer rings are
     brighter/larger so the player reads "outer = primary defense" instantly. */
  const SHIELD_RINGS = [
    { radius: 38, segments: 8, speed: 0.04, color: "#55ff55", intensity: 0.30, glow: 6 },
    { radius: 52, segments: 8, speed: -0.03, color: "#33dd33", intensity: 0.65, glow: 10 },
    { radius: 68, segments: 8, speed: 0.025, color: "#11bb11", intensity: 0.95, glow: 14 },
  ];

  /* Gap tick: short perpendicular line drawn at each arc endpoint. Mirrors the
     1980 Star Castle cabinet where gaps between arcs were sharp directional cues. */
  const GAP_TICK_LEN = 5;


  /* ── Stars (background) ─────────────────────────────── */
  let stars = [];
  regenerateStars();

  /* ── Level transition / end-game helpers ─────────────── */
  function startLevel() {
    level++;
    state = "levelTransition";
    transitionTimer = 120;
    sfxLevelUp();
    /* Core reset deferred to levelTransition->playing handler;
       keeps core hidden during transition screen. */
  }

  /* End-game: deterministic freeze-then-input sequence.
     Freezes all gameplay for DEAD_PAUSE_FRAMES frames, then unlocks input
     (same as cabinet "FREE PLAY" freeze before accepting coin-drop). */
  function endGame() {
    state = "dead";
    deadPauseTimer = DEAD_PAUSE_FRAMES;
    deadFrame = 0;
    saveHighScore();
    populateDeadOverlay();
  }

  /* ── Collision helpers ─────────────────────────────── */
  function wrap(obj) {
    if (obj.x < -50) obj.x += W + 100;
    if (obj.x > W + 50) obj.x -= W + 100;
    if (obj.y < -50) obj.y += H + 100;
    if (obj.y > H + 50) obj.y -= H + 100;
  }

  /* Arc/segment shield collision: processes rings outermost-to-innermost.
      Returns ring index (0..N-1) if blocked by an active segment, -1 if passes through.
      Destroyed rings are skipped, enforcing the breach rule: inner rings cannot be
      damaged until the outermost active ring is completely destroyed.
      When fromOutside is true (cannon shots), rings with gaps at the current angle
      allow the projectile to pass through to inner rings rather than stopping.
      During regen animation, uses captured collision radii to prevent gaps. */
  function checkShieldCollision(obj, fromOutside) {
    const allDestroyed = player.rings.every(rs => rs.destroyed);
    if (allDestroyed) return -1;
    const dx = obj.x - player.x;
    const dy = obj.y - player.y;
    const d = Math.hypot(dx, dy);
    let relAngle = Math.atan2(dy, dx);
    if (relAngle < 0) relAngle += Math.PI * 2;
    const inRegenAnim = player.regenAnimFrames > 0 && player.regenCollRadii;
    for (let ri = SHIELD_RINGS.length - 1; ri >= 0; ri--) {
      const ring = SHIELD_RINGS[ri];
      const rs = player.rings[ri];
      if (rs.destroyed) continue;
      /* During regen animation, skip new ring (index 0) for collision;
         use captured collision radii for shifted rings to prevent gaps. */
      if (inRegenAnim && ri === 0) continue;
      const collRadius = inRegenAnim && ri > 0 ? player.regenCollRadii[ri - 1] : ring.radius;
      if (Math.abs(d - collRadius) > 8) continue;
      const segAngle = (Math.PI * 2) / ring.segments;
      const segArc = segAngle * 0.55;
      let normAngle = relAngle - shieldAngle;
      while (normAngle < 0) normAngle += Math.PI * 2;
      while (normAngle >= Math.PI * 2) normAngle -= Math.PI * 2;
      const segIndex = Math.min(ring.segments - 1, Math.floor((normAngle + 1e-9) / segAngle));
      const segOffset = normAngle - segIndex * segAngle;
      const activeSegs = Math.floor((rs.health / 100) * ring.segments);
      if (segIndex < activeSegs && segOffset < segArc + 1e-9) return ri;
      if (fromOutside) continue;
      return -1;
    }
    return -1;
  }

  /* Ring regeneration: when the outermost active ring is destroyed,
      shift remaining inner rings outward and spawn a fresh ring at the core.
      Only fires when there is at least one surviving ring to shift.
      Visual feedback: a deterministic REGEN_ANIM_FRAMES animation shows
      existing rings moving outward while a new inner ring expands into place.
      During animation, collision uses pre-shift radii to prevent gaps. */
  function tryRegenRings(destroyedIndex) {
    let isOutermostActive = true;
    for (let i = destroyedIndex + 1; i < SHIELD_RINGS.length; i++) {
      if (!player.rings[i].destroyed) {
        isOutermostActive = false;
        break;
      }
    }
    if (!isOutermostActive) return;
    if (!player.rings.some(rs => !rs.destroyed)) return;

    /* Capture current logical radii for collision during animation.
       During animation, collision uses these radii (pre-shift positions)
       so no projectiles can bypass the shield coverage. The new ring at
       index 0 is skipped for collision until animation completes. */
    const collRadii = SHIELD_RINGS.map(r => r.radius);

    /* Perform the logical shift immediately */
    for (let i = destroyedIndex; i > 0; i--) {
      player.rings[i] = { health: player.rings[i-1].health, destroyed: player.rings[i-1].destroyed, breachFlash: player.rings[i-1].breachFlash };
    }
    player.rings[0] = { health: 100, destroyed: false, breachFlash: 0 };

    /* Start visual animation: rings interpolate from captured radii to target */
    player.regenAnimFrames = REGEN_ANIM_FRAMES;
    player.regenCollRadii = collRadii;

    sfxShieldRegen();
    spawnParticles(player.x, player.y, "#33ff33", 24);
  }

  /* ── Update ─────────────────────────────────────────── */
  function update() {
    if (state === "attract") {
      advanceAttractCard();
      return;
    }

    if (state === "levelTransition") {
      transitionTimer--;
      updateParticles();
      if (transitionTimer <= 0) {
        /* Next-level reset: deterministic state transition.
           resetPlayer() resets position, invincibility, and ALL shield rings
           to 100% health (shield regeneration between levels).
           resetCore() scales HP for the new level.
           Score is preserved across the transition (no timer races). */
        state = "playing";
        idleTimer = 0;
        resetPlayer();
        bullets.length = 0;
        enemies.length = 0;
        spawnWave();
        spawnTimer = spawnInterval(level);
        resetCore();
      }
      return;
    }

    if (state === "coreDestruction") {
      /* One-time debris burst: flag-based (not timer-equals) to prevent
         frame-skip races. Debris spawns exactly once per core destruction. */
      if (!debrisSpawned) {
        debrisSpawned = true;
        spawnCoreDebris(core.x, core.y);
        /* Purge any remaining core-spawned mines */
        for (let i = enemies.length - 1; i >= 0; i--) {
          if (enemies[i].coreSpawned) enemies.splice(i, 1);
        }
      }
      coreDestructionTimer--;
      updateParticles();
      if (coreDestructionTimer <= 0) {
        startLevel();
      }
      return;
    }

    if (state === "dying") {
      deathTimer--;
      updateParticles();
      if (deathTimer <= 0) {
        if (lives > 0) {
          resetPlayer();
          idleTimer = 0;
          state = "playing";
        } else {
          endGame();
        }
      }
      return;
    }

    if (state !== "playing") return;

    /* Advance shield rotation state per frame — deterministic, frame-rate independent.
        Original Star Castle cabinet used fixed per-frame angular step for shield rings;
        Date.now() timestamps make the gameplay non-deterministic and FPS-dependent. */
    shieldAngle += shieldRotationSpeed(level);

    /* Idle timeout: increment on every playing frame; reset on any input.
        After IDLE_TIMEOUT frames with no input, return to attract mode. */
    idleTimer++;
    if (idleTimer >= IDLE_TIMEOUT) {
      idleTimer = 0;
      saveHighScore();
      resetAttract();
      state = "attract";
      setHUDVisible(false);
      setDeadOverlayVisible(false);
      attractScreen.classList.remove("hidden");
      return;
    }

    /* Player rotation — Asteroids-era inertia (acceleration + friction) */
    const rotSpeed = 0.065;
    const ROT_ACCEL  = 0.012;   // rad/frame² when turning (builds rotational momentum)
    const ROT_FRICTION = 0.85;  // rad/frame decay factor on release (cabinet-era drift)

    if (rotDir() !== 0) {
      player.rotVel += rotDir() * ROT_ACCEL;
      if (player.rotVel >  rotSpeed) player.rotVel =  rotSpeed;
      if (player.rotVel < -rotSpeed) player.rotVel = -rotSpeed;
    } else {
      player.rotVel *= ROT_FRICTION;
      if (Math.abs(player.rotVel) < 0.001) player.rotVel = 0;
    }
    player.angle += player.rotVel;

    /* Thrust — punchier acceleration for responsive control */
    const thrust = 0.18;
    if (thrustDir()) {
      player.vx += Math.cos(player.angle) * thrust;
      player.vy += Math.sin(player.angle) * thrust;
      player.thrusting = true;
      sfxThrust();
    } else {
      player.thrusting = false;
    }

    /* Friction — cabinet-era drift: decays noticeably but retains momentum */
    player.vx *= 0.992;
    player.vy *= 0.992;

    /* Max speed cap */
    const speed = Math.hypot(player.vx, player.vy);
    if (speed > 7) {
      const scale = 7 / speed;
      player.vx *= scale;
      player.vy *= scale;
    }

    /* Move */
    player.x += player.vx;
    player.y += player.vy;
    wrap(player);

    /* Invincibility countdown */
    if (player.invincible > 0) player.invincible--;

    /* Breach flash countdown */
    for (const rs of player.rings) {
      if (rs.breachFlash > 0) rs.breachFlash--;
    }

    /* Core tracking and firing */
    updateCore();

    /* Fire */
    if (player.fireCooldown > 0) player.fireCooldown--;
    if (fireDir()) fireBullet();

    /* Shield regen */
    player.shieldRegenTimer++;
    if (player.shieldRegenTimer >= 60) {
      player.shieldRegenTimer = 0;
      for (const rs of player.rings) {
        if (!rs.destroyed && rs.health < 100) {
          rs.health = Math.min(100, rs.health + player.shieldRegenAmount);
          rs.breachFlash = 0;
        }
      }
    }

    /* Shield regen animation countdown */
    if (player.regenAnimFrames > 0) {
      player.regenAnimFrames--;
      if (player.regenAnimFrames <= 0) {
        player.regenCollRadii = null;
      }
    }

    /* Bullets */
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx; b.y += b.vy;
      wrap(b);
      b.life--;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }

      let bulletConsumed = false;

      /* Bullet vs enemies */
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (dist(b, e) < e.size + 4) {
          e.hp--;
          bullets.splice(i, 1);
          bulletConsumed = true;
          spawnParticles(e.x, e.y, e.color, 6);
          if (e.hp <= 0) {
            score += e.type === "mine" ? 10 : e.type === "fast" ? 25 : 15;
            spawnParticles(e.x, e.y, e.color, 14);
            sfxExplosion();
            enemies.splice(j, 1);
          } else {
            sfxHit();
          }
          break;
        }
      }
      if (bulletConsumed) continue;

      /* Bullet vs core */
      if (core.alive && dist(b, core) < 20) {
        core.hp--;
        bullets.splice(i, 1);
        bulletConsumed = true;
        spawnParticles(core.x, core.y, "#ff4444", 8);
        sfxHit();
        if (core.hp <= 0) {
          core.alive = false;
          score += 200;
          sfxExplosion();
          /* Purge core-spawned mines on core death to prevent leak */
          for (let k = enemies.length - 1; k >= 0; k--) {
            if (enemies[k].coreSpawned) {
              spawnParticles(enemies[k].x, enemies[k].y, "#ffff00", 4);
              enemies.splice(k, 1);
            }
          }
          state = "coreDestruction";
          coreDestructionTimer = 90;
          debrisSpawned = false;
          cannonShots.length = 0;
        }
        break;
      }
      if (bulletConsumed) continue;

      /* Bullet vs player (arc-based shield check, outer-to-inner breach) */
      if (dist(b, player) < 76) {
        const hitRing = checkShieldCollision(b);
        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          rs.health = Math.max(0, rs.health - 25);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          bullets.splice(i, 1);
          sfxShield();
          if (justDestroyed) sfxBreach();
          spawnParticles(player.x, player.y, "#33ff33", 12);
          if (justDestroyed) tryRegenRings(hitRing);
        } else if (dist(b, player) < 18) {
          bullets.splice(i, 1);
          hitPlayer();
        }
      }
    }
    if (state !== "playing") return;

    /* Cannon shots (fired from core, travel toward player) */
    for (let i = cannonShots.length - 1; i >= 0; i--) {
      const c = cannonShots[i];
      c.x += c.vx; c.y += c.vy;
      c.life--;
      if (c.life <= 0) { cannonShots.splice(i, 1); continue; }

      /* Cannon shot vs player shields (fromOutside: pass through gaps to inner rings) */
      if (dist(c, player) < 100) {
        const hitRing = checkShieldCollision(c, true);
        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          rs.health = Math.max(0, rs.health - 20);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          cannonShots.splice(i, 1);
          sfxShield();
          if (justDestroyed) sfxBreach();
          spawnParticles(player.x, player.y, "#33ff33", 10);
          if (justDestroyed) tryRegenRings(hitRing);
        } else if (dist(c, player) < 18) {
          cannonShots.splice(i, 1);
          hitPlayer();
        }
      }
    }

    /* Enemies */
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];

      /* Homing behavior */
      if (e.type === "mine" || e.type === "chaser") {
        const a = angle(e, player);
        const turnRate = e.type === "mine" ? 0.025 : 0.018;
        e.angle = a;
        const turnSpeed = Math.min(e.vx * 0.15, turnRate);
        e.vx += Math.cos(a) * turnSpeed;
        e.vy += Math.sin(a) * turnSpeed;
      }

      /* Chaser acceleration toward player */
      if (e.type === "chaser") {
        const a = angle(e, player);
        e.vx += Math.cos(a) * 0.02;
        e.vy += Math.sin(a) * 0.02;
      }

      /* Move */
      e.x += e.vx; e.y += e.vy;
      wrap(e);

      /* Enemy vs player (arc-based shield check, outer-to-inner breach) */
      if (dist(e, player) < e.size + 76) {
        const hitRing = checkShieldCollision(e);
        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          rs.health = Math.max(0, rs.health - 25);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          spawnParticles(e.x, e.y, e.color, 8);
          sfxExplosion();
          enemies.splice(i, 1);
          sfxShield();
          if (justDestroyed) sfxBreach();
          spawnParticles(player.x, player.y, "#33ff33", 12);
          if (justDestroyed) tryRegenRings(hitRing);
        } else if (dist(e, player) < e.size + 16) {
          spawnParticles(e.x, e.y, e.color, 8);
          sfxExplosion();
          enemies.splice(i, 1);
          hitPlayer();
        }
      }

      /* Enemy vs bullets (already handled above) */
    }

    /* Continuous enemy spawning */
    spawnTimer--;
    if (spawnTimer <= 0) {
      spawnTimer = spawnInterval(level);
      spawnEnemy("chaser");
    }

    updateParticles();
  }

  function hitPlayer() {
    if (player.invincible > 0) return;
    if (state !== "playing") return;

    lives--;
    sfxDeath();
    deathExplosionX = player.x;
    deathExplosionY = player.y;
    player.alive = false;
    spawnParticles(deathExplosionX, deathExplosionY, "#ff4444", 30);
    deathTimer = 90;
    state = "dying";
  }

  function updateParticles() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy;
      p.life--;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  /* ── Draw helpers ───────────────────────────────────── */
  function glow(color, radius) {
    ctx.shadowColor = color;
    ctx.shadowBlur = radius;
  }

  function noGlow() {
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }

  /* ── HUD ───────────────────────────────────────────── */
  function drawHUD() {
    const yOff = safeInsets.top;
    const xOff = safeInsets.right;

    ctx.textAlign = "left";

    /* Score — primary hierarchy: ghost-line bloom + crisp phosphor */
    const scoreSize = Math.floor(H * 0.038);
    ctx.font = `bold ${scoreSize}px "Courier New", monospace`;
    /* Ghost-line pass for phosphor bloom */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#aaccff";
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.15;
    ctx.fillText(`SCORE: ${score}`, 20, 38 + yOff);
    ctx.globalAlpha = 1;
    /* Primary phosphor: crisp white text */
    ctx.fillStyle = "#ffffff";
    glow("#aaccff", 6);
    ctx.fillText(`SCORE: ${score}`, 20, 38 + yOff);

    /* Level — secondary, smaller, muted */
    ctx.font = `bold ${Math.floor(H * 0.024)}px "Courier New", monospace`;
    ctx.fillStyle = "#88aacc";
    glow("#6699cc", 3);
    ctx.fillText(`LEVEL: ${level}`, 20, 68 + yOff);

    /* Lives — tertiary, warm accent */
    ctx.font = `bold ${Math.floor(H * 0.022)}px "Courier New", monospace`;
    ctx.fillStyle = "#ff4444";
    glow("#cc0000", 4);
    let livesText = "LIVES: ";
    for (let i = 0; i < lives; i++) livesText += "★ ";
    ctx.fillText(livesText, 20, 98 + yOff);

    /* Shield bars (per-ring) — wireframe outlines, more vertical room */
    if (player.alive) {
      const barW = Math.floor(W * 0.15);
      const barH = 8;
      const bx = W - barW - 20 - xOff;
      const by = 32 + yOff;

      for (let ri = 0; ri < SHIELD_RINGS.length; ri++) {
        const rs = player.rings[ri];
        const ry = by + ri * (barH + 5);

        if (rs.destroyed) {
          ctx.setLineDash([3, 3]);
          ctx.strokeStyle = "#444466";
          ctx.lineWidth = 1;
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.strokeRect(bx, ry, barW, barH);
          ctx.setLineDash([]);
        } else {
          const pct = rs.health / 100;
          ctx.strokeStyle = pct > 0.5 ? "#33ff33" : pct > 0.25 ? "#22dd22" : "#ff6666";
          ctx.lineWidth = 1.5;
          ctx.shadowColor = ctx.strokeStyle;
          ctx.shadowBlur = 4;
          ctx.strokeRect(bx, ry, barW * pct, barH);
        }
      }

      noGlow();
      ctx.fillStyle = "#88aacc";
      ctx.font = `bold ${Math.floor(H * 0.018)}px "Courier New", monospace`;
      ctx.textAlign = "right";
      ctx.fillText(`SHIELD`, bx + barW, by - 4);
    }

    ctx.textAlign = "left";
  }

  /* ── Attract screen ────────────────────────────────── */
  function drawAttract() {
    ctx.textAlign = "center";

    const titleSize = Math.floor(W * 0.14);
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;

    /* Always draw the game title at top — ghost-line bloom + crisp phosphor */
    ctx.textAlign = "center";
    /* Ghost-line bloom pass */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 5;
    ctx.shadowColor = "#00aaff";
    ctx.shadowBlur = 20;
    ctx.globalAlpha = 0.15;
    ctx.strokeText("STAR CASTLE", W / 2, H * 0.13);
    ctx.globalAlpha = 1;
    /* Primary phosphor */
    glow("#00aaff", 40);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("STAR CASTLE", W / 2, H * 0.13);

    /* Subtitle "2" — ghost-line bloom */
    ctx.strokeStyle = "#ff88cc";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#ff4488";
    ctx.shadowBlur = 16;
    ctx.globalAlpha = 0.15;
    const twoSize = Math.floor(W * 0.07);
    ctx.font = `bold ${twoSize}px "Courier New", monospace`;
    ctx.strokeText("2", W / 2, H * 0.21);
    ctx.globalAlpha = 1;
    glow("#ff4488", 25);
    ctx.font = `bold ${twoSize}px "Courier New", monospace`;
    ctx.fillStyle = "#ff88cc";
    ctx.fillText("2", W / 2, H * 0.21);

    noGlow();

    /* Draw card-specific content */
    if (attractCard === 0) {
      drawAttractTitle();
    } else if (attractCard === 1) {
      drawAttractHighScore();
    } else if (attractCard === 2) {
      drawAttractInstructions();
    } else if (attractCard === 3) {
      drawAttractShowcase();
    }

    /* Cabinet-authentic start prompt: INSERT COIN + PRESS START
        Dual-line prompt with distinct blink phases — deterministic, frame-driven. */
    const promptBlink = Math.sin((attractFrame / 60) * Math.PI * 2) * 0.5 + 0.5;
    attractPrompt.style.opacity = promptBlink;

    const promptSize = Math.floor(W * 0.03);
    ctx.font = `bold ${promptSize}px "Courier New", monospace`;
    ctx.textAlign = "center";

    /* INSERT COIN line: always visible, steady glow */
    ctx.fillStyle = "#ffcc00";
    glow("#ffaa00", 14);
    ctx.fillText("INSERT COIN", W / 2, H * 0.80);

    /* PRESS START line: blinks, ghost-line bloom for emphasis */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#aaccff";
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.12;
    ctx.strokeText("PRESS START OR TAP", W / 2, H * 0.86);
    ctx.globalAlpha = 0.4 + promptBlink * 0.6;
    ctx.fillStyle = "#ffffff";
    glow("#aaccff", 15);
    ctx.fillText("PRESS START OR TAP", W / 2, H * 0.86);
    ctx.globalAlpha = 1;
    noGlow();
    ctx.textAlign = "left";

    /* Start on space/tap */
    if (keys.Space || keys.Enter || touchFireOn || canvasTapped) {
      canvasTapped = false;
      startGame();
    }
  }

  function drawAttractTitle() {
    ctx.textAlign = "center";
    ctx.font = `${Math.floor(W * 0.028)}px "Courier New", monospace`;
    ctx.fillStyle = "#6688aa";
    ctx.fillText("A Vector Space Shooter", W / 2, H * 0.42);
  }

  function drawAttractHighScore() {
    const hsSize = Math.floor(W * 0.055);
    ctx.font = `bold ${hsSize}px "Courier New", monospace`;
    ctx.textAlign = "center";
    /* Ghost-line bloom */
    ctx.strokeStyle = "#ffcc00";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#ffaa00";
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.15;
    ctx.strokeText("HIGH SCORE", W / 2, H * 0.28);
    ctx.globalAlpha = 1;
    glow("#ffaa00", 12);
    ctx.fillStyle = "#ffcc00";
    ctx.fillText("HIGH SCORE", W / 2, H * 0.28);
    noGlow();

    /* Ranked score table: top N entries */
    const entrySize = Math.floor(W * 0.038);
    ctx.font = `bold ${entrySize}px "Courier New", monospace`;
    ctx.textAlign = "center";
    const lineH = Math.floor(W * 0.048);
    const tableStartY = H * 0.36;

    /* Cabinet-style: pad scores to 6 digits for consistent column width */
    const scoreFmt = s => String(s).padStart(6, "0");

    for (let i = 0; i < HIGH_SCORE_SLOTS; i++) {
      const y = tableStartY + i * lineH;
      if (i < highScoreTable.length) {
        const isTop = i === 0;
        ctx.fillStyle = isTop ? "#ffcc00" : "#aaddff";
        if (isTop) {
          glow("#ffaa00", 8);
          ctx.font = `bold ${Math.floor(entrySize * 1.2)}px "Courier New", monospace`;
        } else {
          noGlow();
          ctx.font = `bold ${entrySize}px "Courier New", monospace`;
        }
        ctx.fillText(`${i + 1}. ${scoreFmt(highScoreTable[i])}`, W / 2, y);
      } else {
        ctx.fillStyle = "#334455";
        noGlow();
        ctx.font = `bold ${entrySize}px "Courier New", monospace`;
        ctx.fillText(`${i + 1}. ---`, W / 2, y);
      }
    }
    noGlow();
    ctx.textAlign = "left";
  }

  function drawAttractInstructions() {
    ctx.textAlign = "center";
    const fontSize = Math.floor(W * 0.028);
    ctx.font = `bold ${fontSize}px "Courier New", monospace`;
    /* Ghost-line bloom */
    ctx.strokeStyle = "#aaddff";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#6699cc";
    ctx.shadowBlur = 12;
    ctx.globalAlpha = 0.15;
    ctx.strokeText("INSTRUCTIONS", W / 2, H * 0.28);
    ctx.globalAlpha = 1;
    ctx.fillStyle = "#aaddff";
    glow("#6699cc", 6);
    ctx.fillText("INSTRUCTIONS", W / 2, H * 0.28);
    noGlow();

    ctx.font = `${Math.floor(W * 0.02)}px "Courier New", monospace`;
    ctx.fillStyle = "#88aacc";
    const lineH = Math.floor(W * 0.026);
    const startY = H * 0.38;
    ctx.fillText("← → or A D  :  Rotate", W / 2, startY);
    ctx.fillText("↑ or W       :  Thrust", W / 2, startY + lineH);
    ctx.fillText("SPACE or F   :  Fire", W / 2, startY + lineH * 2);

    ctx.fillStyle = "#668899";
    ctx.font = `${Math.floor(W * 0.016)}px "Courier New", monospace`;
    ctx.fillText("Enemy ships attack from the edges — destroy them.", W / 2, startY + lineH * 4);
    ctx.fillText("Destroy the central cannon to clear each level.", W / 2, startY + lineH * 5);
    ctx.fillText("Green shield rings rotate — aim for the gaps.", W / 2, startY + lineH * 6);
    ctx.fillText("The core fires through shield gaps — dodge its shots.", W / 2, startY + lineH * 7);
  }

  function drawAttractShowcase() {
    /* Rotating ship with shield rings — pure vector art, no gameplay.
       Uses per-ring intensity/glow so the showcase mirrors gameplay fidelity:
       outer ring glows brightest, inner ring is subtle. Gap ticks mark openings. */
    const cx = W / 2;
    const cy = H * 0.48;

    /* Shield rings rotating with ghost-line bloom */
    const shieldAngle = showcaseAngle;
    for (let ri = 0; ri < SHIELD_RINGS.length; ri++) {
      const ring = SHIELD_RINGS[ri];
      const segments = ring.segments;

      /* Ghost-line bloom pass (per-ring intensity + glow) */
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 3 * ring.intensity;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 12 * ring.intensity;
      ctx.globalAlpha = 0.15 * ring.intensity;
      for (let i = 0; i < segments; i++) {
        const a = shieldAngle + (i / segments) * Math.PI * 2;
        const startA = a;
        const endA = a + (Math.PI * 2 / segments) * 0.70;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.radius, startA, endA);
        ctx.stroke();
      }

      /* Primary phosphor pass (per-ring glow) */
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 4 * (0.5 + ring.intensity);

      for (let i = 0; i < segments; i++) {
        const a = shieldAngle + (i / segments) * Math.PI * 2;
        const startA = a;
        const endA = a + (Math.PI * 2 / segments) * 0.70;
        ctx.beginPath();
        ctx.arc(cx, cy, ring.radius, startA, endA);
        ctx.stroke();
      }

      /* Gap ticks: short perpendicular line at each segment end */
      const segArc = (Math.PI * 2 / segments) * 0.70;
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 1;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 3;
      ctx.globalAlpha = 0.5 * ring.intensity;
      for (let i = 0; i < segments; i++) {
        const a = shieldAngle + (i / segments) * Math.PI * 2;
        const endAngle = a + segArc;
        const tx = cx + Math.cos(endAngle) * ring.radius;
        const ty = cy + Math.sin(endAngle) * ring.radius;
        const radNX = Math.cos(endAngle) * GAP_TICK_LEN;
        const radNY = Math.sin(endAngle) * GAP_TICK_LEN;
        ctx.beginPath();
        ctx.moveTo(tx - radNX, ty - radNY);
        ctx.lineTo(tx + radNX, ty + radNY);
        ctx.stroke();
      }
    }
    noGlow();

    /* Orbiting core mines — pulsing beacon circles with bloom (deterministic pulse) */
    for (let mi = 0; mi < 3; mi++) {
      const mA = showcaseAngle * 0.8 + (mi / 3) * Math.PI * 2;
      const mR = 80;
      const mx = cx + Math.cos(mA) * mR;
      const my = cy + Math.sin(mA) * mR;
      /* Deterministic pulse driven by attractFrame, phase-offset per mine */
      const pulse = 0.7 + 0.3 * Math.sin((attractFrame / 60) * Math.PI * 2 + (mi * 2.1));
      const beaconR = 10 * pulse;

      /* Ghost-line bloom */
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ffff00";
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      ctx.arc(mx, my, beaconR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;

      /* Primary wireframe */
      ctx.strokeStyle = "#ffff00";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#ffff00";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(mx, my, beaconR, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 3;
      ctx.beginPath();
      ctx.arc(mx, my, 2, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = "#ffaa00";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#ff8800";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(mx, my, beaconR + 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    noGlow();

    /* Ship body rotating slowly — white phosphor with bloom */
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(showcaseAngle * 0.5);

    /* Ghost-line bloom pass */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#aaddff";
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.12;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.stroke();
    ctx.globalAlpha = 1;

    /* Primary phosphor: crisp white wireframe */
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#aaddff";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, 10);
    ctx.closePath();
    ctx.stroke();

    /* Wing detail lines */
    ctx.strokeStyle = "#aaddff";
    ctx.lineWidth = 1;
    ctx.shadowColor = "#88bbdd";
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(-6, 0);
    ctx.lineTo(-14, -8);
    ctx.moveTo(-6, 0);
    ctx.lineTo(-14, 8);
    ctx.stroke();

    /* Cockpit detail */
    ctx.strokeStyle = "#88ccff";
    ctx.lineWidth = 1;
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(16, 0);
    ctx.stroke();

    noGlow();
    ctx.restore();

    /* Label */
    ctx.textAlign = "center";
    ctx.font = `${Math.floor(W * 0.018)}px "Courier New", monospace`;
    ctx.fillStyle = "#556688";
    ctx.fillText("CORE MINES ORBIT THE CASTLE", W / 2, H * 0.65);
  }

  /* ── Dying sequence: explosion + reserve/lives feedback ─ */
  function drawDying() {
    /* Explosion particles — warm phosphor sparks */
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.globalAlpha = alpha;
      const len = p.size * alpha;
      ctx.beginPath();
      ctx.moveTo(p.x - len, p.y);
      ctx.lineTo(p.x + len, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noGlow();

    /* Vector ship explosion at captured position */
    const progress = 1 - deathTimer / 90;
    const expSize = 20 + progress * 40;
    ctx.save();
    ctx.translate(deathExplosionX, deathExplosionY);

    /* Ghost-line bloom for explosion */
    ctx.strokeStyle = "#ff6644";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#ff4422";
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.15;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * expSize, Math.sin(a) * expSize);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    /* Expanding wireframe lines — warm phosphor */
    ctx.strokeStyle = "#ff6644";
    ctx.lineWidth = 2;
    ctx.shadowColor = "#ff4422";
    ctx.shadowBlur = 8;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * expSize, Math.sin(a) * expSize);
      ctx.stroke();
    }

    /* Expanding circle with bloom */
    ctx.strokeStyle = "#ff8866";
    ctx.lineWidth = 1.5;
    ctx.shadowColor = "#ff6644";
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(0, 0, expSize * 0.7, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
    noGlow();

    /* RESERVE / LIVES feedback — ghost-line bloom + crisp phosphor */
    ctx.textAlign = "center";
    const resSize = Math.floor(W * 0.05);
    ctx.font = `bold ${resSize}px "Courier New", monospace`;
    /* Ghost-line bloom */
    ctx.strokeStyle = "#ff4444";
    ctx.lineWidth = 3;
    ctx.shadowColor = "#cc0000";
    ctx.shadowBlur = 14;
    ctx.globalAlpha = 0.15;
    ctx.strokeText("RESERVE", W / 2, H * 0.68);
    ctx.globalAlpha = 1;
    /* Primary phosphor */
    ctx.fillStyle = "#ff4444";
    glow("#cc0000", 10);
    ctx.fillText("RESERVE", W / 2, H * 0.68);
    noGlow();

    /* Remaining lives as star indicators */
    ctx.font = `${Math.floor(W * 0.03)}px "Courier New", monospace`;
    ctx.fillStyle = "#aaddff";
    let livesDisplay = "";
    for (let i = 0; i < lives; i++) livesDisplay += "★ ";
    ctx.fillText(livesDisplay || "—", W / 2, H * 0.75);

    drawHUD();
  }

  /* Populate dead overlay content once on entry (avoids per-frame DOM thrashing) */
  function populateDeadOverlay() {
    if (!deadOverlay) return;
    setDeadOverlayVisible(true);
    deadContent.innerHTML = `
      <h2>GAME OVER</h2>
      <p style="color:#aaddff">FINAL SCORE: ${score}</p>
      <p style="color:#aaddff">LEVEL REACHED: ${level}</p>
      ${score >= highScore && score > 0 ? '<p style="color:#ffcc00">NEW HIGH SCORE!</p>' : ''}
      <p style="color:#886644">HIGH SCORE: ${highScore}</p>
      <p style="color:#ffcc00;margin-top:1rem">INSERT COIN</p>
      <p style="color:#fff;animation:blink 1.2s step-end infinite">TAP TO CONTINUE</p>
    `;
  }

  /* ── Dead screen ───────────────────────────────────── */
  function drawDead() {
    ctx.textAlign = "center";

    /* GAME OVER — ghost-line bloom + crisp phosphor */
    const titleSize = Math.floor(W * 0.12);
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.shadowColor = "#ff4444";
    ctx.shadowBlur = 18;
    ctx.globalAlpha = 0.15;
    ctx.strokeText("GAME OVER", W / 2, H * 0.30);
    ctx.globalAlpha = 1;
    glow("#ff4444", 30);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("GAME OVER", W / 2, H * 0.30);

    noGlow();
    ctx.font = `${Math.floor(W * 0.04)}px "Courier New", monospace`;
    ctx.fillStyle = "#aaddff";
    ctx.fillText(`FINAL SCORE: ${score}`, W / 2, H * 0.42);
    ctx.fillText(`LEVEL REACHED: ${level}`, W / 2, H * 0.49);

    if (score >= highScore && score > 0) {
      ctx.fillStyle = "#ffcc00";
      glow("#ffaa00", 8);
      ctx.font = `bold ${Math.floor(W * 0.025)}px "Courier New", monospace`;
      ctx.fillText("NEW HIGH SCORE!", W / 2, H * 0.56);
      noGlow();
    }

    ctx.font = `bold ${Math.floor(W * 0.022)}px "Courier New", monospace`;
    ctx.fillStyle = "#88644";
    ctx.fillText(`HIGH SCORE: ${highScore}`, W / 2, H * 0.63);

    deadFrame = (deadFrame || 0) + 1;
    const promptBlink = Math.sin(deadFrame * 0.08) * 0.5 + 0.5;
    if (attractPrompt) attractPrompt.style.opacity = promptBlink;

    ctx.font = `bold ${Math.floor(W * 0.028)}px "Courier New", monospace`;
    ctx.textAlign = "center";

    ctx.fillStyle = "#ffcc00";
    glow("#ffaa00", 12);
    ctx.fillText("INSERT COIN", W / 2, H * 0.72);

    ctx.globalAlpha = 0.4 + promptBlink * 0.6;
    ctx.fillStyle = "#ffffff";
    glow("#aaccff", 12);
    ctx.fillText("PRESS START OR TAP", W / 2, H * 0.78);
    ctx.globalAlpha = 1;
    noGlow();
    ctx.textAlign = "left";

    if (keys.Space || keys.Enter || touchFireOn || canvasTapped) {
      canvasTapped = false;
      resetAttract();
      state = "attract";
      setHUDVisible(false);
      setDeadOverlayVisible(false);
      attractScreen.classList.remove("hidden");
    }
  }
  // ── Pass 9: iPhone portrait playability & reliability

  /* ── Public API ─────────────────────────────────────── */

  function init() {
    resize();
    initInput();
    resetAttract();
    setHUDVisible(false);
    setDeadOverlayVisible(false);
  }

  function setHUDVisible(visible) {
    if (visible) {
      hud.classList.add("visible");
      touchControls.classList.add("visible");
    } else {
      hud.classList.remove("visible");
      touchControls.classList.remove("visible");
    }
  }

  function setDeadOverlayVisible(visible) {
    if (!deadOverlay) return;
    if (visible) {
      deadOverlay.classList.remove("hidden");
    } else {
      deadOverlay.classList.add("hidden");
    }
  }

  /* ── Attract screen HTML overlay (mobile readable text) ─────── */
  function setAttractScreenVisible(visible) {
    if (visible) {
      attractScreen.classList.remove("hidden");
    } else {
      attractScreen.classList.add("hidden");
    }
  }

  function startGame() {
    state = "playing";
    score = 0;
    lives = 3;
    level = 1;
    resetAttract();
    resetPlayer();
    bullets.length = 0;
    enemies.length = 0;
    spawnWave();
    spawnTimer = spawnInterval(level);
    resetCore();
    idleTimer = 0;
    attractScreen.classList.add("hidden");
    setDeadOverlayVisible(false);
    setHUDVisible(true);
  }

  function toggleMute() {
    muted = !muted;
    if (muteBtn) {
      muteBtn.textContent = muted ? "UNMUTE" : "MUTE";
    }
  }

  /* ── drawGame: cabinet-era vector arcade rendering ──── */
  function drawGame() {
    /* Runtime-safe geometry checks (once, on first frame) */
    if (!drawGame._checked) {
      drawGame._checked = true;
      /* Verify shield ring radii are ordered innermost to outermost */
      for (let i = 1; i < SHIELD_RINGS.length; i++) {
        if (SHIELD_RINGS[i - 1].radius >= SHIELD_RINGS[i].radius) {
          console.warn(`Star Castle 2: shield ring ${i-1} radius (${SHIELD_RINGS[i-1].radius}) >= ring ${i} radius (${SHIELD_RINGS[i].radius}) — expected ascending order`);
        }
      }
      /* Verify shield ring segments are reasonable */
      for (let i = 0; i < SHIELD_RINGS.length; i++) {
        if (SHIELD_RINGS[i].segments < 6 || SHIELD_RINGS[i].segments > 24) {
          console.warn(`Star Castle 2: shield ring ${i} segments (${SHIELD_RINGS[i].segments}) outside [6,24] range`);
        }
      }
      /* Verify canvas dimensions are valid */
      if (W <= 0 || H <= 0 || W > 10000 || H > 10000) {
        console.warn(`Star Castle 2: canvas dimensions ${W}x${H} outside expected range`);
      }
    }

    /* Background — true black for faithful vector cabinet feel */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    /* Stars — barely visible, no competition with vector lines.
       Pure white at sub-5% alpha; authentic vector cabinets had no starfield,
       so this is kept to a whisper behind the phosphor artwork. */
    for (const s of stars) {
      const twinkle = 0.3 + Math.sin(Date.now() * 0.002 + s.b * 10) * 0.3;
      ctx.fillStyle = "rgba(255, 255, 255, 1)";
      ctx.globalAlpha = twinkle * 0.04;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    if (state === "attract") {
      drawAttract();
      return;
    }

    /* Level transition: show level number + HUD (score preserved, visible) */
    if (state === "levelTransition") {
      ctx.textAlign = "center";
      /* Ghost-line bloom */
      const lvlSize = Math.floor(W * 0.12);
      ctx.font = `bold ${lvlSize}px "Courier New", monospace`;
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#33ff33";
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.15;
      ctx.strokeText(`LEVEL ${level}`, W / 2, H / 2 - 10);
      ctx.globalAlpha = 1;
      /* Primary phosphor */
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "#33ff33";
      ctx.shadowBlur = 12;
      ctx.fillText(`LEVEL ${level}`, W / 2, H / 2 - 10);
      ctx.shadowBlur = 0;
      drawHUD();
      return;
    }

    if (state === "coreDestruction") {
      /* Flash overlay on entry */
      if (coreDestructionTimer > 75) {
        const flashAlpha = (coreDestructionTimer - 75) / 15 * 0.2;
        ctx.fillStyle = `rgba(255, 255, 250, ${flashAlpha})`;
        ctx.fillRect(0, 0, W, H);
      }

      /* Explosion debris particles — warm phosphor sparks */
      for (const p of particles) {
        const alpha = p.life / p.maxLife;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.globalAlpha = alpha;
        const len = p.size * alpha;
        ctx.beginPath();
        ctx.moveTo(p.x - len, p.y);
        ctx.lineTo(p.x + len, p.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      noGlow();

      /* DESTROYED feedback text — ghost-line bloom + crisp phosphor */
      ctx.textAlign = "center";
      const destSize = Math.floor(W * 0.10);
      ctx.font = `bold ${destSize}px "Courier New", monospace`;
      /* Ghost-line bloom */
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ff4400";
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.15;
      ctx.strokeText("DESTROYED", W / 2, H / 2);
      ctx.globalAlpha = 1;
      /* Primary phosphor */
      ctx.fillStyle = "#ffffff";
      glow("#ff4400", 20);
      ctx.fillText("DESTROYED", W / 2, H / 2);
      noGlow();

      drawHUD();
      return;
    }

    if (state === "dead") {
      /* Deterministic freeze: during DEAD_PAUSE_FRAMES frames, reject all input.
         Only after the pause elapses does "INSERT COIN / TAP" accept a restart.
         This matches the cabinet's fixed-duration dead-screen freeze. */
      if (deadPauseTimer > 0) {
        deadPauseTimer--;
      } else if (keys.Space || keys.Enter || touchFireOn || canvasTapped) {
        /* INPUT ACCEPTED — transition to attract mode */
        canvasTapped = false;
        resetAttract();
        state = "attract";
        setHUDVisible(false);
        setDeadOverlayVisible(false);
      }
      drawDead();
      return;
    }

    if (state === "dying") {
      drawDying();
      return;
    }

    /* Shield rings — green phosphor, crisp wireframe, distinct segment gaps.
       Outer ring glows brightest (intensity 0.95, glow 14), inner ring is dimmest
       (intensity 0.30, glow 6) so the player reads "outer = primary defense" at a glance.
       Gap ticks mark each arc endpoint so breaches are visible even during rapid rotation. */
     if (player.alive) {
       const inRegenAnim = player.regenAnimFrames > 0;
      const regenT = inRegenAnim ? 1 - player.regenAnimFrames / REGEN_ANIM_FRAMES : 1;
      for (let ri = 0; ri < SHIELD_RINGS.length; ri++) {
        const ring = SHIELD_RINGS[ri];
        const rs = player.rings[ri];
        if (rs.destroyed) continue;
        const segments = ring.segments;
        const activeSegs = Math.floor((rs.health / 100) * segments);
        const segAngle = (Math.PI * 2) / segments;
        const segArc = segAngle * 0.55;

        /* Visual radius: during regen animation, interpolate from start to target */
        let visualRadius = ring.radius;
        if (inRegenAnim && player.regenCollRadii) {
          const startR = ri === 0 ? 0 : player.regenCollRadii[ri - 1];
          visualRadius = startR + (ring.radius - startR) * regenT;
        }

        /* Breach flash: segment-specific red flash for breach readability */
        if (rs.breachFlash > 0) {
          const flashAlpha = rs.breachFlash / 30;
          for (let i = 0; i < activeSegs; i++) {
            const a = shieldAngle + (i / segments) * Math.PI * 2;
            const startA = a;
            const endA = a + segArc;
            ctx.beginPath();
            ctx.arc(player.x, player.y, visualRadius, startA, endA);
            ctx.strokeStyle = `rgba(255, ${Math.floor(60 * flashAlpha)}, ${Math.floor(60 * flashAlpha)}, ${flashAlpha})`;
            ctx.lineWidth = 3;
            ctx.shadowColor = "#ff0000";
            ctx.shadowBlur = 10;
            ctx.stroke();
          }
        }

        /* Ghost-line bloom pass: dimmer, wider glow for phosphor bloom.
           Uses per-ring intensity + glow so outer rings cast a bigger, brighter aura */
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 4 * ring.intensity;
        ctx.shadowColor = ring.color;
        ctx.shadowBlur = ring.glow;
        ctx.globalAlpha = 0.12 * ring.intensity;
        for (let i = 0; i < segments; i++) {
          const a = shieldAngle + (i / segments) * Math.PI * 2;
          if (i < activeSegs) {
            const startA = a;
            const endA = a + (Math.PI * 2 / segments) * 0.55;
            ctx.beginPath();
            ctx.arc(player.x, player.y, visualRadius, startA, endA);
            ctx.stroke();
          }
        }

        /* White-hot core pass: bright center line for vector monitor authenticity */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 0.8;
        ctx.shadowColor = "#aaffaa";
        ctx.shadowBlur = 2;
        ctx.globalAlpha = 0.85 * ring.intensity;
        for (let i = 0; i < segments; i++) {
          const a = shieldAngle + (i / segments) * Math.PI * 2;
          if (i < activeSegs) {
            const startA = a;
            const endA = a + (Math.PI * 2 / segments) * 0.55;
            ctx.beginPath();
            ctx.arc(player.x, player.y, visualRadius, startA, endA);
            ctx.stroke();
          }
        }

        /* Primary phosphor pass: crisp green wireframe (preserves lineWidth 1.5, shadowBlur 6) */
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = ring.color;
        ctx.shadowBlur = 6;
        ctx.globalAlpha = 1;

        for (let i = 0; i < segments; i++) {
          const a = shieldAngle + (i / segments) * Math.PI * 2;
          if (i < activeSegs) {
            const startA = a;
            const endA = a + (Math.PI * 2 / segments) * 0.55;
            ctx.beginPath();
            ctx.arc(player.x, player.y, visualRadius, startA, endA);
            ctx.stroke();
          }
        }

        /* Gap tick: short perpendicular line at each active-segment endpoint.
           Mirrors the 1980 Star Castle cabinet where gap direction was a crisp visual cue. */
        /* Draw gap ticks for each active segment boundary */
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 1.2;
        ctx.shadowColor = ring.color;
        ctx.shadowBlur = 4;
        ctx.globalAlpha = 0.7 * ring.intensity;
        for (let i = 0; i < activeSegs; i++) {
          const a = shieldAngle + (i / segments) * Math.PI * 2;
          /* Tick at the END of each segment (the gap boundary) */
          const endAngle = a + segArc;
          const tx = player.x + Math.cos(endAngle) * visualRadius;
          const ty = player.y + Math.sin(endAngle) * visualRadius;
          /* Radial tick: short line along the radius at each gap boundary */
          const radNX = Math.cos(endAngle) * GAP_TICK_LEN;
          const radNY = Math.sin(endAngle) * GAP_TICK_LEN;
          ctx.beginPath();
          ctx.moveTo(tx - radNX, ty - radNY);
          ctx.lineTo(tx + radNX, ty + radNY);
          ctx.stroke();
        }
      }
      noGlow();
    }

    /* Core cannon — castle silhouette, wireframe only, distinct barrel
       The cannon barrel smoothly tracks the player via core.angle (set in updateCore).
       Barrel rotation uses core.angle (actual cannon position) not direct aimAngle,
       matching the original Star Castle where the turret visibly sweeps toward the ship.
       A tracking line from barrel tip to player shows shot intent when aligned. */
     if (core.alive) {
       const aimAngle = angle(core, player);
       /* Gap check uses core's actual pointing direction (what the barrel shows) */
      const barrelGapAligned = findShieldGap(core.angle, shieldAngle);
      /* Also check if a direct shot at player would go through gaps */
      const aimGapAligned = findShieldGap(aimAngle, shieldAngle);

      ctx.save();
      ctx.translate(core.x, core.y);

      /* Castle body: rectangular base with corner turrets */
      /* Ghost-line bloom pass for phosphor glow — stronger for cabinet presence */
      ctx.strokeStyle = "#33ff33";
      ctx.lineWidth = 5;
      ctx.shadowColor = "#33ff33";
      ctx.shadowBlur = 18;
      ctx.globalAlpha = 0.18;
      ctx.strokeRect(-16, -12, 32, 24);
      ctx.globalAlpha = 1;

      /* Primary wireframe: thicker for cabinet presence */
      ctx.strokeStyle = "#33ff33";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#22ff22";
      ctx.shadowBlur = 8;
      ctx.strokeRect(-16, -12, 32, 24);

      /* Corner turrets */
      const ts = 4;
      ctx.strokeStyle = "#33ff33";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-16 - ts/2, -12 - ts/2, ts, ts);
      ctx.strokeRect(16 - ts/2, -12 - ts/2, ts, ts);
      ctx.strokeRect(-16 - ts/2, 12 - ts/2, ts, ts);
      ctx.strokeRect(16 - ts/2, 12 - ts/2, ts, ts);

      /* Battlements: crenellations along top edge for castle silhouette */
      ctx.strokeStyle = "#33ff33";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#33ff33";
      ctx.shadowBlur = 3;
      const battW = 4;
      for (let bx = -16; bx < 16; bx += battW * 2) {
        ctx.beginPath();
        ctx.moveTo(bx, -12);
        ctx.lineTo(bx, -16);
        ctx.lineTo(bx + battW, -16);
        ctx.lineTo(bx + battW, -12);
        ctx.stroke();
      }

      /* Central tower — Star Castle signature silhouette */
      ctx.strokeStyle = "#33ff33";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#33ff33";
      ctx.shadowBlur = 5;
      ctx.strokeRect(-4, -12, 8, 24);

      /* Tower spire — pointed top for castle profile */
      ctx.strokeStyle = "#44ff44";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = "#44ff44";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.moveTo(-4, -12);
      ctx.lineTo(0, -20);
      ctx.lineTo(4, -12);
      ctx.stroke();

      /* Gate: arched entrance at bottom for castle authenticity */
      ctx.strokeStyle = "#22dd22";
      ctx.lineWidth = 1;
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.moveTo(-5, 12);
      ctx.arcTo(-5, 4, 5, 4, 5);
      ctx.arcTo(5, 12, -5, 12, 5);
      ctx.stroke();

      /* Inner chamber */
      ctx.strokeStyle = "#22dd22";
      ctx.lineWidth = 1;
      ctx.shadowBlur = 3;
      ctx.strokeRect(-8, -6, 16, 12);

      /* Inner structural lines — vertical/horizontal divisions */
      ctx.strokeStyle = "#11bb11";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#11bb11";
      ctx.shadowBlur = 2;
      ctx.beginPath();
      ctx.moveTo(0, -12);
      ctx.lineTo(0, 12);
      ctx.moveTo(-16, 0);
      ctx.lineTo(16, 0);
      ctx.stroke();

      /* Center crosshair: color and size indicate barrel alignment with gaps.
         When locked (barrel within 2x fireAngleTol of player), crosshair is bright
         and outlines the imminent firing zone for readable cue. */
      const crossReady = core.locked && barrelGapAligned;
      ctx.strokeStyle = crossReady ? "#ffff00" : (barrelGapAligned ? "#ffff33" : "#33ff33");
      ctx.shadowColor = crossReady ? "#ffff00" : (barrelGapAligned ? "#ffff00" : "#22ff22");
      ctx.shadowBlur = crossReady ? 6 : 3;
      ctx.lineWidth = crossReady ? 2 : 1.5;
      const chR = crossReady ? 6 : 4;
      ctx.beginPath();
      ctx.moveTo(0, -chR); ctx.lineTo(0, chR);
      ctx.moveTo(-chR, 0); ctx.lineTo(chR, 0);
      if (crossReady) {
        /* Outer ring when locked-on: signals imminent firing window */
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0, 0, chR + 1.5, 0, Math.PI * 2);
      }
      ctx.stroke();

      /* Cannon barrel: rectangular outline, rotated to core.angle (smooth tracking)
         Original Star Castle: barrel visibly sweeps to track the player,
         does not snap instantly. Using core.angle preserves this behavior. */
      ctx.save();
      ctx.rotate(core.angle);
      /* Barrel ghost-line for bloom */
      const barrelAlpha = crossReady ? 0.3 : 0.15;
      ctx.strokeStyle = crossReady ? "#ffffaa" : "#33ff33";
      ctx.lineWidth = 3;
      ctx.shadowColor = crossReady ? "#ffff00" : "#33ff33";
      ctx.shadowBlur = crossReady ? 14 : 10;
      ctx.globalAlpha = barrelAlpha;
      ctx.strokeRect(8, -2, 16, 4);
      ctx.globalAlpha = 1;
      /* Primary barrel wireframe */
      ctx.strokeStyle = crossReady ? "#ffff66" : "#33ff33";
      ctx.lineWidth = 1.5;
      ctx.shadowColor = crossReady ? "#ffff44" : "#22ff22";
      ctx.shadowBlur = crossReady ? 5 : 3;
      /* Barrel: rectangular body with directional arrow tip for clear direction read */
      ctx.beginPath();
      ctx.moveTo(8, -2);
      ctx.lineTo(24, 0);         // converges to muzzle tip
      ctx.lineTo(8, 2);
      ctx.closePath();
      ctx.stroke();
      /* Barrel muzzle detail — small circle at tip */
      ctx.strokeStyle = crossReady ? "#ffffff" : "#44ff44";
      ctx.lineWidth = 1;
      ctx.shadowColor = crossReady ? "#ffffff" : "#44ff44";
      ctx.shadowBlur = crossReady ? 6 : 4;
      ctx.beginPath();
      ctx.arc(24, 0, crossReady ? 2.5 : 2, 0, Math.PI * 2);
      ctx.stroke();
      /* Muzzle flash: bright burst when cannon fires (6 frames)
         Original Star Castle showed a brief flash at barrel exit. */
      if (core.muzzleFlash > 0) {
        const flashAlpha = core.muzzleFlash / 6;
        const flashR = 4 + (1 - flashAlpha) * 6;
        ctx.strokeStyle = `rgba(255, 255, 200, ${flashAlpha})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ffffaa";
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(26, 0, flashR, 0, Math.PI * 2);
        ctx.stroke();
        /* Flash rays */
        ctx.strokeStyle = `rgba(255, 255, 100, ${flashAlpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 6;
        for (let r = 0; r < 4; r++) {
          const ra = (r / 4) * Math.PI * 2 + core.muzzleFlash * 0.3;
          ctx.beginPath();
          ctx.moveTo(26 + Math.cos(ra) * flashR, Math.sin(ra) * flashR);
          ctx.lineTo(26 + Math.cos(ra) * (flashR + 4), Math.sin(ra) * (flashR + 4));
          ctx.stroke();
        }
      }
      ctx.restore();

      /* Tracking line: faint dashed line from barrel tip toward player
         Shows where the cannon is actually pointing vs. where player is.
         Original Star Castle used a visible sight line. When locked-on,
         the tracking line extends further and uses brighter phosphor to signal
         an imminent firing window (barrel within fireAngleTol, all ring gaps aligned). */
      const barrelTipX = Math.cos(core.angle) * 24;
      const barrelTipY = Math.sin(core.angle) * 24;
      /* Extend tracking line to player position when locked (full fire path visible).
         When tracking, extend just a bit toward the player angle for guidance. */
      const trackExt = crossReady ? 280 : (core.locked ? 160 : 80);
      const playerRelX = player.x - core.x;
      const playerRelY = player.y - core.y;
      const distToPlayer = Math.hypot(playerRelX, playerRelY);
      /* Clamp draw length to actual distance or max extension */
      const drawScale = Math.max(1, distToPlayer / trackExt);
      const extX = barrelTipX + playerRelX * (drawScale >= 1 ? 1 : distToPlayer / trackExt);
      const extY = barrelTipY + playerRelY * (drawScale >= 1 ? 1 : distToPlayer / trackExt);
      const trackAlpha = crossReady ? 0.5 : (core.locked ? 0.35 : 0.15);
      /* Line color: bright yellow when locked+gaps, amber when just locked, green otherwise */
      const trackColor = crossReady ? "#ffff44" : (core.locked ? "#ffcc33" : "#33ff33");
      const trackGlow = crossReady ? 8 : (core.locked ? 5 : 2);
      ctx.strokeStyle = trackColor;
      ctx.lineWidth = crossReady ? 1.5 : 1;
      ctx.shadowColor = crossReady ? "#ffff00" : (core.locked ? "#ff8800" : "#22ff22");
      ctx.shadowBlur = trackGlow;
      ctx.globalAlpha = trackAlpha;
      ctx.setLineDash(crossReady ? [] : [4, 4]);
      /* Dashed when tracking, solid when locked (ready to fire). */
      ctx.beginPath();
      ctx.moveTo(barrelTipX, barrelTipY);
      ctx.lineTo(extX, extY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      noGlow();
      ctx.restore();
    }

    /* Cannon shots — bright warm phosphor, high visibility threat indicator.
       Direction arrow at head for clear trajectory read on vector display. */
    for (const c of cannonShots) {
      /* Ghost-line bloom for threat presence */
      ctx.strokeStyle = "#ff8844";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#ff6622";
      ctx.shadowBlur = 14;
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      const speed = Math.hypot(c.vx, c.vy);
      if (speed > 0) {
        /* Normalize velocity for trail calculations */
        const nvx = c.vx / speed;
        const nvy = c.vy / speed;
        ctx.moveTo(c.x - nvx * 12, c.y - nvy * 12);
        ctx.lineTo(c.x + nvx * 4, c.y + nvy * 4);
      } else {
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + 4, c.y);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      /* Primary phosphor: bright, crisp streak */
      ctx.strokeStyle = "#ffaa66";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#ff6622";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      if (speed > 0) {
        const nvx = c.vx / speed;
        const nvy = c.vy / speed;
        ctx.moveTo(c.x - nvx * 8, c.y - nvy * 8);
        ctx.lineTo(c.x + nvx * 2, c.y + nvy * 2);
      } else {
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(c.x + 2, c.y);
      }
      ctx.stroke();

      /* Directional arrowhead at shot head: small vector triangle showing trajectory
         Core Star Castle fidelity: cannon shots have clear directional indicators. */
      if (speed > 0) {
        const arrowSize = Math.min(5, speed * 0.6);
        /* Arrowhead pointing in velocity direction */
        const ax = c.vx / speed;
        const ay = c.vy / speed;
        /* Perpendicular: (-ay, ax) */
        const px = -ay;
        const py = ax;
        /* Arrowhead: V-shape at shot head position */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#ffcc88";
        ctx.shadowBlur = 5;
        ctx.beginPath();
        /* Tip of arrow at current shot position */
        ctx.moveTo(c.x, c.y);
        /* Left wing of V */
        ctx.lineTo(c.x - ax * arrowSize + px * arrowSize * 0.5,
                   c.y - ay * arrowSize + py * arrowSize * 0.5);
        /* Right wing of V */
        ctx.lineTo(c.x - ax * arrowSize - px * arrowSize * 0.5,
                   c.y - ay * arrowSize - py * arrowSize * 0.5);
        ctx.closePath();
        ctx.stroke();
      }

      /* Hot core dot */
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.shadowColor = "#ffcc88";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(c.x, c.y, 1.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    noGlow();

    /* Player — wireframe ship, white phosphor, ghost-line bloom */
    if (player.alive) {
      const blink = player.invincible > 0 && Math.floor(Date.now() / 80) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);

        /* Thrust flame: wireframe line, warm phosphor */
        if (player.thrusting) {
          const flicker = Math.random() * 4 + 8;
          ctx.strokeStyle = "#ff8844";
          ctx.lineWidth = 2;
          ctx.shadowColor = "#ff6622";
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.moveTo(-16, 0);
          ctx.lineTo(-16 - flicker, 0);
          ctx.stroke();
        }

        /* Ghost-line bloom pass: dimmer, wider glow for phosphor bloom */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "#aaddff";
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;

        /* Ship body: crisp white phosphor wireframe */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.shadowColor = "#aaddff";
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.stroke();

        /* Wing detail lines — inner structure for cabinet authenticity */
        ctx.strokeStyle = "#aaddff";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#88bbdd";
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.lineTo(-14, -8);
        ctx.moveTo(-6, 0);
        ctx.lineTo(-14, 8);
        ctx.stroke();

        /* Cockpit detail — center forward line */
        ctx.strokeStyle = "#88ccff";
        ctx.lineWidth = 1;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(8, 0);
        ctx.lineTo(16, 0);
        ctx.stroke();

        noGlow();
        ctx.restore();
      }
    }

    /* Bullets — bright white phosphor sparks, blue glow, ghost-line bloom */
    for (const b of bullets) {
      /* Ghost-line bloom */
      ctx.strokeStyle = "#aaccff";
      ctx.lineWidth = 4;
      ctx.shadowColor = "#88bbdd";
      ctx.shadowBlur = 12;
      ctx.globalAlpha = 0.15;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.8, b.y - b.vy * 0.8);
      ctx.lineTo(b.x + b.vx * 0.3, b.y + b.vy * 0.3);
      ctx.stroke();
      ctx.globalAlpha = 1;
      /* Primary phosphor: crisp white streak */
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#aaddff";
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.5, b.y - b.vy * 0.5);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    noGlow();

    /* Enemies — wireframe only, no filled centers, phosphor bloom */
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      if (e.type === "mine" && e.coreSpawned) {
        /* Core-spawned mine: pulsing beacon circle (Star Castle signature) */
        const pulse = 0.7 + 0.3 * Math.sin(Date.now() * 0.008);
        const beaconR = e.size * pulse;
        /* Ghost-line bloom */
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 4;
        ctx.shadowColor = "#ffff00";
        ctx.shadowBlur = 14;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.arc(0, 0, beaconR, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
        /* Primary wireframe */
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ffff00";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, beaconR, 0, Math.PI * 2);
        ctx.stroke();
        /* Inner dot */
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#ffffff";
        ctx.shadowBlur = 3;
        ctx.beginPath();
        ctx.arc(0, 0, 2, 0, Math.PI * 2);
        ctx.stroke();
        /* Outer ring */
        ctx.strokeStyle = "#ffaa00";
        ctx.lineWidth = 1;
        ctx.shadowColor = "#ff8800";
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(0, 0, beaconR + 3, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.type === "mine") {
        /* Ghost-line bloom */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? e.size : e.size * 0.5;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        /* Primary wireframe */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? e.size : e.size * 0.5;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();
        /* Center crosshair */
        ctx.lineWidth = 1;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(-e.size * 0.3, 0); ctx.lineTo(e.size * 0.3, 0);
        ctx.moveTo(0, -e.size * 0.3); ctx.lineTo(0, e.size * 0.3);
        ctx.stroke();
      } else if (e.type === "chaser") {
        /* Ghost-line bloom */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size * 0.75, 0);
        ctx.lineTo(0, e.size);
        ctx.lineTo(-e.size * 0.75, 0);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        /* Primary wireframe */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size * 0.75, 0);
        ctx.lineTo(0, e.size);
        ctx.lineTo(-e.size * 0.75, 0);
        ctx.closePath();
        ctx.stroke();
        /* Center crosshair */
        ctx.lineWidth = 1;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(-e.size * 0.25, 0); ctx.lineTo(e.size * 0.25, 0);
        ctx.moveTo(0, -e.size * 0.25); ctx.lineTo(0, e.size * 0.25);
        ctx.stroke();
      } else if (e.type === "fast") {
        /* Ghost-line bloom */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 10;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size * 0.85, e.size * 0.6);
        ctx.lineTo(-e.size * 0.85, e.size * 0.6);
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        /* Primary wireframe */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size * 0.85, e.size * 0.6);
        ctx.lineTo(-e.size * 0.85, e.size * 0.6);
        ctx.closePath();
        ctx.stroke();
        /* Center crosshair */
        ctx.lineWidth = 1;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        ctx.moveTo(-e.size * 0.2, 0); ctx.lineTo(e.size * 0.2, 0);
        ctx.moveTo(0, -e.size * 0.2); ctx.lineTo(0, e.size * 0.2);
        ctx.stroke();
      } else {
        /* Tank: thicker primary line for visual weight */
        /* Ghost-line bloom */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 4;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.12;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
          else ctx.lineTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.globalAlpha = 1;
        /* Primary wireframe */
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = e.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
          else ctx.lineTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
        }
        ctx.closePath();
        ctx.stroke();
        /* Inner hexagon */
        ctx.strokeStyle = "#ff88cc";
        ctx.lineWidth = 1;
        ctx.shadowBlur = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          if (i === 0) ctx.moveTo(Math.cos(a) * e.size * 0.5, Math.sin(a) * e.size * 0.5);
          else ctx.lineTo(Math.cos(a) * e.size * 0.5, Math.sin(a) * e.size * 0.5);
        }
        ctx.closePath();
        ctx.stroke();
        /* Center crosshair */
        ctx.strokeStyle = e.color;
        ctx.beginPath();
        ctx.moveTo(-e.size * 0.3, 0); ctx.lineTo(e.size * 0.3, 0);
        ctx.moveTo(0, -e.size * 0.3); ctx.lineTo(0, e.size * 0.3);
        ctx.stroke();
      }

      noGlow();
      ctx.restore();
    }

    /* Particles — wireframe line segments, phosphor glow */
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 4;
      ctx.globalAlpha = alpha;
      const len = p.size * alpha;
      ctx.beginPath();
      ctx.moveTo(p.x - len, p.y);
      ctx.lineTo(p.x + len, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    noGlow();

    /* HUD */
    drawHUD();
  }

  /* ── Main loop ─────────────────────────────────────── */
  function loop() {
    update();
    drawGame();
    requestAnimationFrame(loop);
  }
  init();
  loop();

  /* Expose public API on window for browser integration */
  window.initInput = initInput;
  window.startGame  = startGame;
  window.toggleMute = toggleMute;
  window.drawGame   = drawGame;
  window.init       = init;
  window.checkShieldCollision = checkShieldCollision;
  window.tryRegenRings = tryRegenRings;
  window._SHIELD_RINGS = SHIELD_RINGS;
  window._player = player;
  window._core = core;
  window._cannonShots = cannonShots;
  window._findShieldGap = findShieldGap;
  window._attractCard = () => attractCard;
  window._attractCardTimer = () => attractCardTimer;
  window._highScore = () => highScore;
  window._saveHighScore = saveHighScore;
  window._resetAttract = resetAttract;
  window._advanceAttractCard = advanceAttractCard;
  window._state = () => state;
  window._safeInsets = () => safeInsets;
  window._coreDestructionTimer = () => coreDestructionTimer;
  window._debrisSpawned = () => debrisSpawned;
  window._transitionTimer = () => transitionTimer;
  window._seededRandom = seededRandom;
  window._cannonFireCooldown = cannonFireCooldown;
  window._cannonShotSpeed = cannonShotSpeed;
  window._coreTurnRate = coreTurnRate;
  window._shieldRotationSpeed = shieldRotationSpeed;
  window._enemyBaseSpeed = enemyBaseSpeed;
  window._spawnInterval = spawnInterval;
  window._spawnTimer = () => spawnTimer;
  window._coreMineInterval = coreMineInterval;
  window._coreMineTimer = () => coreMineTimer;
  window._spawnCoreMine = spawnCoreMine;
  window._REGEN_ANIM_FRAMES = REGEN_ANIM_FRAMES;
  window._regenAnimFrames = () => player.regenAnimFrames;
  window._regenCollRadii = () => player.regenCollRadii;
  window._deathTimer = () => deathTimer;
  window._deathExplosionX = () => deathExplosionX;
  window._deathExplosionY = () => deathExplosionY;
  window._lives = () => lives;
  window._hitPlayer = hitPlayer;
  window._drawDying = drawDying;
  window._idleTimer = () => idleTimer;
  window._highScoreTable = () => highScoreTable.slice();
  window._insertHighScore = insertHighScore;
  window._setHUDVisible = setHUDVisible;
  window._setDeadOverlayVisible = setDeadOverlayVisible;
  window._populateDeadOverlay = populateDeadOverlay;
  window._inputInitialized = () => inputInitialized;
})();
