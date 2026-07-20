(function() {
  "use strict";

  /* ── Canvas & DOM refs ─────────────────────────────── */
  const canvas = document.getElementById("gameCanvas");
  const ctx    = canvas.getContext("2d", { alpha: false });
  let W, H;

  const attractScreen = document.getElementById("attractScreen");
  const attractPrompt = document.getElementById("attractPrompt");

  const hud       = document.getElementById("hud");
  const muteBtn   = document.getElementById("muteBtn");

  const touchControls = document.getElementById("touchControls");
  const touchLeft     = document.getElementById("touchLeft");
  const touchThrust   = document.getElementById("touchThrust");
  const touchRight    = document.getElementById("touchRight");
  const touchFire     = document.getElementById("touchFire");

  /* ── Audio (Web Audio API) ─────────────────────────── */
  let audioCtx = null, masterGain = null, muted = false;

  function initAudio() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = audioCtx.createGain();
    masterGain.gain.value = 0.35;
    masterGain.connect(audioCtx.destination);
  }

  function playTone(freq, dur, type, vol) {
    if (!audioCtx || muted) return;
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

  function sfxShoot() { playTone(880, 0.12, "square", 0.1); playTone(440, 0.15, "sawtooth", 0.08); }
  function sfxExplosion() { playTone(120, 0.4, "sawtooth", 0.2); playTone(60, 0.5, "square", 0.15); }
  function sfxHit() { playTone(200, 0.15, "sawtooth", 0.18); }
  function sfxShield() { playTone(600, 0.15, "sine", 0.08); }
  function sfxLevelUp() { [523,659,784,1047].forEach((f,i) => setTimeout(() => playTone(f, 0.25, "sine", 0.1), i*80)); }
  function sfxDeath() { [300,240,180,100].forEach((f,i) => setTimeout(() => playTone(f, 0.35, "sawtooth", 0.18), i*120)); }
  function sfxMine() { playTone(300, 0.25, "sine", 0.1); }

  muteBtn.addEventListener("click", () => { muted = !muted; });

  /* ── Resize ─────────────────────────────────────────── */
  function resize() {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

/* ── Input ─────────────────────────────────────────── */
const keys = {};

function initInput() {
  window.addEventListener("keydown", e => { keys[e.code] = true; initAudio(); });
  window.addEventListener("keyup",   e => { keys[e.code] = false; });

  let touchLeftOn  = false, touchThrustOn = false, touchRightOn = false, touchFireOn = false;

  function setTouch(id, on) {
    if (id === "left")  touchLeftOn   = on;
    if (id === "thrust") touchThrustOn = on;
    if (id === "right") touchRightOn  = on;
    if (id === "fire")  touchFireOn   = on;
  }

  function bindTouch(el, id) {
    el.addEventListener("touchstart", e => { e.preventDefault(); setTouch(id, true); initAudio(); });
    el.addEventListener("touchend",   e => { e.preventDefault(); setTouch(id, false); });
    el.addEventListener("touchcancel",e => { e.preventDefault(); setTouch(id, false); });
  }
  bindTouch(touchLeft, "left");
  bindTouch(touchThrust, "thrust");
  bindTouch(touchRight, "right");
  bindTouch(touchFire, "fire");

  /* Expose for external use */
  window._touchLeftOn   = () => touchLeftOn;
  window._touchThrustOn = () => touchThrustOn;
  window._touchRightOn  = () => touchRightOn;
  window._touchFireOn   = () => touchFireOn;

  /* Rebind after initInput so tests can call it */
  window._touchLeftOn   = () => touchLeftOn;
  window._touchThrustOn = () => touchThrustOn;
  window._touchRightOn  = () => touchRightOn;
  window._touchFireOn   = () => touchFireOn;

  /* Store references for external access */
  window._touchLeftOn   = () => touchLeftOn;
  window._touchThrustOn = () => touchThrustOn;
  window._touchRightOn  = () => touchRightOn;
  window._touchFireOn   = () => touchFireOn;

  /* Expose input state */
  window._getTouchLeft   = () => touchLeftOn;
  window._getTouchThrust = () => touchThrustOn;
  window._getTouchRight  = () => touchRightOn;
  window._getTouchFire   = () => touchFireOn;

  /* Rebind after initInput so tests can call it */
  window._touchLeftOn   = () => touchLeftOn;
  window._touchThrustOn = () => touchThrustOn;
  window._touchRightOn  = () => touchRightOn;
  window._touchFireOn   = () => touchFireOn;

}

/* Re-declare for external access */
let touchLeftOn  = false, touchThrustOn = false, touchRightOn = false, touchFireOn = false;

function setTouch(id, on) {
  if (id === "left")  touchLeftOn   = on;
  if (id === "thrust") touchThrustOn = on;
  if (id === "right") touchRightOn  = on;
  if (id === "fire")  touchFireOn   = on;
}

function bindTouch(el, id) {
  el.addEventListener("touchstart", e => { e.preventDefault(); setTouch(id, true); initAudio(); });
  el.addEventListener("touchend",   e => { e.preventDefault(); setTouch(id, false); });
  el.addEventListener("touchcancel",e => { e.preventDefault(); setTouch(id, false); });
}
bindTouch(touchLeft, "left");
bindTouch(touchThrust, "thrust");
bindTouch(touchRight, "right");
bindTouch(touchFire, "fire");

function rotDir() { return (keys.ArrowLeft || keys.KeyA || touchLeftOn)  ? -1 :
                         (keys.ArrowRight|| keys.KeyD || touchRightOn) ?  1 : 0; }
function thrustDir() { return (keys.ArrowUp || keys.KeyW || touchThrustOn) ? 1 : 0; }
function fireDir()   { return keys.Space || keys.KeyF || touchFireOn; }

  /* ── Vector helpers ─────────────────────────────────── */
  function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function angle(a, b) { return Math.atan2(b.y - a.y, b.x - a.x); }

  /* ── Game state ─────────────────────────────────────── */
  let state = "attract"; // attract | playing | dead | levelTransition
  let score = 0, lives = 3, level = 1;
  let transitionTimer = 0;

  /* ── Player ─────────────────────────────────────────── */
  const player = {
    x: 0, y: 0, vx: 0, vy: 0, angle: -Math.PI / 2,
    thrusting: false, shieldHealth: 100, shieldMax: 100,
    invincible: 0, alive: true,
    fireCooldown: 0,
    shieldRegenTimer: 0,
    shieldRegenAmount: 1.5,
  };

  function resetPlayer() {
    player.x = W / 2;
    player.y = H / 2;
    player.vx = 0; player.vy = 0;
    player.angle = -Math.PI / 2;
    player.shieldHealth = player.shieldMax;
    player.invincible = 120; // frames
    player.alive = true;
    player.fireCooldown = 0;
  }

  /* ── Projectiles ────────────────────────────────────── */
  let bullets = [];

  function fireBullet() {
    if (player.fireCooldown > 0) return;
    player.fireCooldown = 8;
    const tipX = player.x + Math.cos(player.angle) * 16;
    const tipY = player.y + Math.sin(player.angle) * 16;
    bullets.push({
      x: tipX, y: tipY,
      vx: Math.cos(player.angle) * 10 + player.vx * 0.3,
      vy: Math.sin(player.angle) * 10 + player.vy * 0.3,
      life: 90,
    });
    sfxShoot();
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

    const baseSpeed = 1.5 + level * 0.3;
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

    const angleToPlayer = Math.random() * Math.PI * 2;
    enemies.push({
      x, y,
      vx: Math.cos(angleToPlayer) * speed,
      vy: Math.sin(angleToPlayer) * speed,
      hp, maxHp: hp, size, color, type,
      angle: 0,
    });
  }

  function spawnWave() {
    const count = 4 + level * 2;
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      if (r < 0.3) spawnEnemy("mine");
      else if (r < 0.65) spawnEnemy("chaser");
      else if (r < 0.85) spawnEnemy("fast");
      else spawnEnemy("chaser");
    }
  }

  /* ── Particles ─────────────────────────────────────── */
  let particles = [];

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

  /* ── Shield rings ───────────────────────────────────── */
  const SHIELD_RINGS = [
    { radius: 38, segments: 12, speed: 0.04, color: "#00ccff" },
    { radius: 52, segments: 12, speed: -0.03, color: "#44aaff" },
    { radius: 68, segments: 12, speed: 0.025, color: "#66bbff" },
  ];

  /* ── Stars (background) ─────────────────────────────── */
  let stars = [];
  for (let i = 0; i < 120; i++) {
    stars.push({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.5 + 0.3, b: Math.random() });
  }

  /* ── Level transition ───────────────────────────────── */
  function startLevel() {
    level++;
    state = "levelTransition";
    transitionTimer = 120;
    sfxLevelUp();
  }

  /* ── Collision helpers ─────────────────────────────── */
  function wrap(obj) {
    if (obj.x < -50) obj.x += W + 100;
    if (obj.x > W + 50) obj.x -= W + 100;
    if (obj.y < -50) obj.y += H + 100;
    if (obj.y > H + 50) obj.y -= H + 100;
  }

  /* ── Update ─────────────────────────────────────────── */
  function update() {
    if (state === "attract") {
      attractPrompt.style.opacity = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
      return;
    }

    if (state === "levelTransition") {
      transitionTimer--;
      updateParticles();
      if (transitionTimer <= 0) {
        state = "playing";
        resetPlayer();
        bullets.length = 0;
        enemies.length = 0;
        spawnWave();
      }
      return;
    }

    if (state !== "playing") return;

    /* Player rotation */
    const rotSpeed = 0.065;
    if (rotDir() !== 0) player.angle += rotDir() * rotSpeed;

    /* Thrust */
    const thrust = 0.12;
    if (thrustDir()) {
      player.vx += Math.cos(player.angle) * thrust;
      player.vy += Math.sin(player.angle) * thrust;
      player.thrusting = true;
    } else {
      player.thrusting = false;
    }

    /* Friction */
    player.vx *= 0.985;
    player.vy *= 0.985;

    /* Move */
    player.x += player.vx;
    player.y += player.vy;
    wrap(player);

    /* Invincibility countdown */
    if (player.invincible > 0) player.invincible--;

    /* Fire */
    if (player.fireCooldown > 0) player.fireCooldown--;
    if (fireDir()) fireBullet();

    /* Shield regen */
    player.shieldRegenTimer++;
    if (player.shieldRegenTimer >= 60) {
      player.shieldRegenTimer = 0;
      if (player.shieldHealth < player.shieldMax) {
        player.shieldHealth = Math.min(player.shieldMax, player.shieldHealth + player.shieldRegenAmount);
      }
    }

    /* Bullets */
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx; b.y += b.vy;
      wrap(b);
      b.life--;
      if (b.life <= 0) { bullets.splice(i, 1); continue; }

      /* Bullet vs enemies */
      for (let j = enemies.length - 1; j >= 0; j--) {
        const e = enemies[j];
        if (dist(b, e) < e.size + 4) {
          e.hp--;
          bullets.splice(i, 1);
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

      /* Bullet vs player (if shield depleted) */
      if (i < bullets.length && player.shieldHealth <= 0 && dist(b, player) < 18) {
        bullets.splice(i, 1);
        hitPlayer();
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

      /* Enemy vs player */
      if (dist(e, player) < e.size + 16) {
        spawnParticles(e.x, e.y, e.color, 8);
        sfxExplosion();
        enemies.splice(i, 1);
        hitPlayer();
      }

      /* Enemy vs bullets (already handled above) */
    }

    /* Check level complete */
    if (enemies.length === 0 && state === "playing") {
      startLevel();
    }

    updateParticles();
  }

  function hitPlayer() {
    if (player.invincible > 0) return;

    /* Shield absorbs damage */
    if (player.shieldHealth > 0) {
      player.shieldHealth = Math.max(0, player.shieldHealth - 25);
      sfxShield();
      spawnParticles(player.x, player.y, "#00ccff", 12);
      return;
    }

    /* Direct hit */
    lives--;
    sfxDeath();
    spawnParticles(player.x, player.y, "#ff4444", 30);
    if (lives <= 0) {
      player.alive = false;
      state = "dead";
    } else {
      resetPlayer();
    }
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

  function drawStar(x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a1 = (i * 2) * Math.PI / 5 - Math.PI / 2;
      const a2 = (i * 2 + 1) * Math.PI / 5 - Math.PI / 2;
      if (i === 0) ctx.moveTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
      else ctx.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r);
      ctx.lineTo(x + Math.cos(a2) * r, y + Math.sin(a2) * r);
    }
    ctx.closePath();
  }

  /* ── Render ─────────────────────────────────────────── */
  function render() {
    ctx.fillStyle = "#050510";
    ctx.fillRect(0, 0, W, H);

    /* Stars */
    for (const s of stars) {
      const twinkle = 0.3 + Math.sin(Date.now() * 0.002 + s.b * 10) * 0.3;
      ctx.fillStyle = `rgba(200,210,255,${twinkle})`;
      ctx.fillRect(s.x, s.y, s.s, s.s);
    }

    if (state === "attract") {
      drawAttract();
      return;
    }

    /* Level transition text */
    if (state === "levelTransition") {
      ctx.fillStyle = "#ffffff";
      ctx.font = `bold ${Math.floor(W * 0.1)}px "Courier New", monospace`;
      ctx.textAlign = "center";
      ctx.shadowColor = "#00ccff";
      ctx.shadowBlur = 30;
      ctx.fillText(`LEVEL ${level}`, W / 2, H / 2 - 10);
      ctx.shadowBlur = 0;
    }

    if (state === "dead") {
      drawDead();
      return;
    }

    /* Shield rings */
    if (player.alive) {
      const shieldAngle = Date.now() * 0.003;
      for (const ring of SHIELD_RINGS) {
        const segments = ring.segments;
        const activeSegs = Math.floor((player.shieldHealth / player.shieldMax) * segments);
        const gap = (segments - activeSegs) / segments;

        ctx.strokeStyle = ring.color;
        ctx.lineWidth = 2.5;
        ctx.shadowColor = ring.color;
        ctx.shadowBlur = 8;

        for (let i = 0; i < segments; i++) {
          const a = shieldAngle + (i / segments) * Math.PI * 2;
          if (i < activeSegs || i >= segments - Math.floor(segments * gap)) {
            const startA = a;
            const endA = a + (Math.PI * 2 / segments) * 0.75;
            ctx.beginPath();
            ctx.arc(player.x, player.y, ring.radius, startA, endA);
            ctx.stroke();
          }
        }
      }
      noGlow();
    }

    /* Player */
    if (player.alive) {
      const blink = player.invincible > 0 && Math.floor(Date.now() / 80) % 2 === 0;
      if (!blink) {
        ctx.save();
        ctx.translate(player.x, player.y);
        ctx.rotate(player.angle);

        /* Thrust flame */
        if (player.thrusting) {
          const flicker = Math.random() * 8 + 12;
          ctx.fillStyle = "#ff6600";
          glow("#ff4400", 12);
          ctx.beginPath();
          ctx.moveTo(-16, -5);
          ctx.lineTo(-24 - flicker, 0);
          ctx.lineTo(-16, 5);
          ctx.closePath();
          ctx.fill();

          ctx.fillStyle = "#ffcc00";
          glow("#ffaa00", 6);
          ctx.beginPath();
          ctx.moveTo(-14, -3);
          ctx.lineTo(-20 - flicker * 0.5, 0);
          ctx.lineTo(-14, 3);
          ctx.closePath();
          ctx.fill();
        }

        /* Ship body */
        noGlow();
        ctx.strokeStyle = "#aaddff";
        ctx.lineWidth = 2;
        ctx.shadowColor = "#00aaff";
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.moveTo(18, 0);
        ctx.lineTo(-12, -10);
        ctx.lineTo(-6, 0);
        ctx.lineTo(-12, 10);
        ctx.closePath();
        ctx.stroke();

        /* Core */
        ctx.fillStyle = "#ffffff";
        glow("#aaccff", 10);
        ctx.beginPath();
        ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
        ctx.fill();

        noGlow();
        ctx.restore();
      }
    }

    /* Bullets */
    for (const b of bullets) {
      ctx.fillStyle = "#ffffff";
      glow("#00ffff", 10);
      ctx.beginPath();
      ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    noGlow();

    /* Enemies */
    for (const e of enemies) {
      ctx.save();
      ctx.translate(e.x, e.y);

      if (e.type === "mine") {
        /* Mine: spiky circle */
        ctx.strokeStyle = e.color;
        glow(e.color, 8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const r = i % 2 === 0 ? e.size : e.size * 0.5;
          if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
          else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.closePath();
        ctx.stroke();

        /* Core */
        ctx.fillStyle = "#ff8800";
        glow("#ff6600", 6);
        ctx.beginPath();
        ctx.arc(0, 0, e.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === "chaser") {
        /* Chaser: diamond */
        ctx.strokeStyle = e.color;
        glow(e.color, 8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size * 0.75, 0);
        ctx.lineTo(0, e.size);
        ctx.lineTo(-e.size * 0.75, 0);
        ctx.closePath();
        ctx.stroke();

        /* Core */
        ctx.fillStyle = "#ffcc00";
        glow("#ffaa00", 6);
        ctx.beginPath();
        ctx.arc(0, 0, e.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else if (e.type === "fast") {
        /* Fast: triangle */
        ctx.strokeStyle = e.color;
        glow(e.color, 8);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, -e.size);
        ctx.lineTo(e.size * 0.85, e.size * 0.6);
        ctx.lineTo(-e.size * 0.85, e.size * 0.6);
        ctx.closePath();
        ctx.stroke();

        /* Core */
        ctx.fillStyle = "#ffdd00";
        glow("#ffaa00", 6);
        ctx.beginPath();
        ctx.arc(0, 0, e.size * 0.25, 0, Math.PI * 2);
        ctx.fill();
      } else {
        /* Boss-like: hexagon */
        ctx.strokeStyle = e.color;
        glow(e.color, 10);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          if (i === 0) ctx.moveTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
          else ctx.lineTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
        }
        ctx.closePath();
        ctx.stroke();

        /* Inner ring */
        ctx.strokeStyle = "#ff88cc";
        glow("#ff66aa", 6);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          if (i === 0) ctx.moveTo(Math.cos(a) * e.size * 0.5, Math.sin(a) * e.size * 0.5);
          else ctx.lineTo(Math.cos(a) * e.size * 0.5, Math.sin(a) * e.size * 0.5);
        }
        ctx.closePath();
        ctx.stroke();

        /* Core */
        ctx.fillStyle = "#ff0066";
        glow("#ff4488", 10);
        ctx.beginPath();
        ctx.arc(0, 0, e.size * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      noGlow();
      ctx.restore();
    }

    /* Particles */
    for (const p of particles) {
      const alpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      glow(p.color, 4);
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    noGlow();

    /* HUD */
    drawHUD();
  }

  function drawHUD() {
    ctx.textAlign = "left";
    ctx.font = `bold ${Math.floor(H * 0.028)}px "Courier New", monospace`;

    /* Score */
    ctx.fillStyle = "#ffffff";
    glow("#aaccff", 6);
    ctx.fillText(`SCORE: ${score}`, 20, 35);

    /* Level */
    ctx.fillStyle = "#aaddff";
    glow("#6699cc", 4);
    ctx.fillText(`LEVEL: ${level}`, 20, 65);

    /* Lives */
    ctx.fillStyle = "#ff4444";
    glow("#cc0000", 6);
    let livesText = "LIVES: ";
    for (let i = 0; i < lives; i++) livesText += "★ ";
    ctx.fillText(livesText, 20, 95);

    /* Shield bar */
    if (player.alive) {
      const barW = Math.floor(W * 0.15);
      const barH = 8;
      const bx = W - barW - 20;
      const by = 35;

      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(bx, by, barW, barH);

      const pct = player.shieldHealth / player.shieldMax;
      ctx.fillStyle = pct > 0.5 ? "#00ccff" : pct > 0.25 ? "#4488ff" : "#ff6666";
      glow(ctx.fillStyle, 6);
      ctx.fillRect(bx, by, barW * pct, barH);

      noGlow();
      ctx.fillStyle = "#aaddff";
      ctx.font = `bold ${Math.floor(H * 0.018)}px "Courier New", monospace`;
      ctx.textAlign = "right";
      ctx.fillText(`SHIELD`, bx + barW, by - 4);
    }

    ctx.textAlign = "left";
  }

  function drawAttract() {
    /* Title */
    ctx.textAlign = "center";

    const titleSize = Math.floor(W * 0.12);
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;

    /* Glow effect */
    glow("#00aaff", 40);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("STAR CASTLE", W / 2, H * 0.3);

    glow("#ff4488", 25);
    ctx.font = `bold ${Math.floor(W * 0.06)}px "Courier New", monospace`;
    ctx.fillStyle = "#ff88cc";
    ctx.fillText("2", W / 2, H * 0.38);

    noGlow();

    /* Subtitle */
    ctx.font = `${Math.floor(W * 0.025)}px "Courier New", monospace`;
    ctx.fillStyle = "#6688aa";
    ctx.fillText("A Vector Space Shooter", W / 2, H * 0.45);

    /* Prompt */
    attractPrompt.style.opacity = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
    ctx.font = `bold ${Math.floor(W * 0.03)}px "Courier New", monospace`;
    ctx.fillStyle = "#ffffff";
    glow("#aaccff", 15);
    ctx.fillText("PRESS SPACE OR TAP TO START", W / 2, H * 0.65);
    noGlow();

    /* Controls */
    ctx.font = `${Math.floor(W * 0.018)}px "Courier New", monospace`;
    ctx.fillStyle = "#556688";
    const controlsY = H * 0.78;
    ctx.fillText("← → or A D : Rotate", W / 2, controlsY);
    ctx.fillText("↑ or W : Thrust", W / 2, controlsY + 25);
    ctx.fillText("SPACE or F : Fire", W / 2, controlsY + 50);

    /* Start on space/tap */
    if (keys.Space || keys.Enter || touchFireOn) {
      state = "playing";
      score = 0; lives = 3; level = 1;
      resetPlayer();
      bullets.length = 0;
      enemies.length = 0;
      spawnWave();
    }
  }

  function drawDead() {
    ctx.textAlign = "center";

    const titleSize = Math.floor(W * 0.1);
    ctx.font = `bold ${titleSize}px "Courier New", monospace`;

    glow("#ff4444", 30);
    ctx.fillStyle = "#ffffff";
    ctx.fillText("GAME OVER", W / 2, H * 0.4);

    noGlow();
    ctx.font = `${Math.floor(W * 0.04)}px "Courier New", monospace`;
    ctx.fillStyle = "#aaddff";
    ctx.fillText(`FINAL SCORE: ${score}`, W / 2, H * 0.5);
    ctx.fillText(`LEVEL REACHED: ${level}`, W / 2, H * 0.56);

    attractPrompt.style.opacity = 0.5 + Math.sin(Date.now() * 0.004) * 0.5;
    ctx.font = `bold ${Math.floor(W * 0.028)}px "Courier New", monospace`;
    ctx.fillStyle = "#ffffff";
    glow("#aaccff", 12);
    ctx.fillText("PRESS SPACE OR TAP TO RESTART", W / 2, H * 0.7);
    noGlow();

    if (keys.Space || keys.Enter || touchFireOn) {
      state = "playing";
      score = 0; lives = 3; level = 1;
      resetPlayer();
      bullets.length = 0;
      enemies.length = 0;
      spawnWave();
    }
  }

/* ── Public API ─────────────────────────────────────── */

function init() {
  resize();
  initInput();
}

function startGame() {
  state = "playing";
  score = 0;
  lives = 3;
  level = 1;
  resetPlayer();
  bullets.length = 0;
  enemies.length = 0;
  spawnWave();
}

function toggleMute() {
  muted = !muted;
  if (muteBtn) {
    muteBtn.textContent = muted ? "UNMUTE" : "MUTE";
  }
}

function drawGame() {
  if (state === "attract") {
    drawAttract();
    return;
  }

  if (state === "levelTransition") {
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${Math.floor(W * 0.1)}px "Courier New", monospace`;
    ctx.textAlign = "center";
    ctx.shadowColor = "#00ccff";
    ctx.shadowBlur = 30;
    ctx.fillText(`LEVEL ${level}`, W / 2, H / 2 - 10);
    ctx.shadowBlur = 0;
    return;
  }

  if (state === "dead") {
    drawDead();
    return;
  }

  /* Shield rings */
  if (player.alive) {
    const shieldAngle = Date.now() * 0.003;
    for (const ring of SHIELD_RINGS) {
      const segments = ring.segments;
      const activeSegs = Math.floor((player.shieldHealth / player.shieldMax) * segments);
      const gap = (segments - activeSegs) / segments;

      ctx.strokeStyle = ring.color;
      ctx.lineWidth = 2.5;
      ctx.shadowColor = ring.color;
      ctx.shadowBlur = 8;

      for (let i = 0; i < segments; i++) {
        const a = shieldAngle + (i / segments) * Math.PI * 2;
        if (i < activeSegs || i >= segments - Math.floor(segments * gap)) {
          const startA = a;
          const endA = a + (Math.PI * 2 / segments) * 0.75;
          ctx.beginPath();
          ctx.arc(player.x, player.y, ring.radius, startA, endA);
          ctx.stroke();
        }
      }
    }
    noGlow();
  }

  /* Player */
  if (player.alive) {
    const blink = player.invincible > 0 && Math.floor(Date.now() / 80) % 2 === 0;
    if (!blink) {
      ctx.save();
      ctx.translate(player.x, player.y);
      ctx.rotate(player.angle);

      /* Thrust flame */
      if (player.thrusting) {
        const flicker = Math.random() * 8 + 12;
        ctx.fillStyle = "#ff6600";
        glow("#ff4400", 12);
        ctx.beginPath();
        ctx.moveTo(-16, -5);
        ctx.lineTo(-24 - flicker, 0);
        ctx.lineTo(-16, 5);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = "#ffcc00";
        glow("#ffaa00", 6);
        ctx.beginPath();
        ctx.moveTo(-14, -3);
        ctx.lineTo(-20 - flicker * 0.5, 0);
        ctx.lineTo(-14, 3);
        ctx.closePath();
        ctx.fill();
      }

      /* Ship body */
      noGlow();
      ctx.strokeStyle = "#aaddff";
      ctx.lineWidth = 2;
      ctx.shadowColor = "#00aaff";
      ctx.shadowBlur = 12;

      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-12, -10);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-12, 10);
      ctx.closePath();
      ctx.stroke();

      /* Core */
      ctx.fillStyle = "#ffffff";
      glow("#aaccff", 10);
      ctx.beginPath();
      ctx.arc(2, 0, 3.5, 0, Math.PI * 2);
      ctx.fill();

      noGlow();
      ctx.restore();
    }
  }

  /* Bullets */
  for (const b of bullets) {
    ctx.fillStyle = "#ffffff";
    glow("#00ffff", 10);
    ctx.beginPath();
    ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  noGlow();

  /* Enemies */
  for (const e of enemies) {
    ctx.save();
    ctx.translate(e.x, e.y);

    if (e.type === "mine") {
      ctx.strokeStyle = e.color;
      glow(e.color, 8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? e.size : e.size * 0.5;
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = "#ff8800";
      glow("#ff6600", 6);
      ctx.beginPath();
      ctx.arc(0, 0, e.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === "chaser") {
      ctx.strokeStyle = e.color;
      glow(e.color, 8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -e.size);
      ctx.lineTo(e.size * 0.75, 0);
      ctx.lineTo(0, e.size);
      ctx.lineTo(-e.size * 0.75, 0);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = "#ffcc00";
      glow("#ffaa00", 6);
      ctx.beginPath();
      ctx.arc(0, 0, e.size * 0.3, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.type === "fast") {
      ctx.strokeStyle = e.color;
      glow(e.color, 8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -e.size);
      ctx.lineTo(e.size * 0.85, e.size * 0.6);
      ctx.lineTo(-e.size * 0.85, e.size * 0.6);
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = "#ffdd00";
      glow("#ffaa00", 6);
      ctx.beginPath();
      ctx.arc(0, 0, e.size * 0.25, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.strokeStyle = e.color;
      glow(e.color, 10);
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
        else ctx.lineTo(Math.cos(a) * e.size, Math.sin(a) * e.size);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.strokeStyle = "#ff88cc";
      glow("#ff66aa", 6);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        if (i === 0) ctx.moveTo(Math.cos(a) * e.size * 0.5, Math.sin(a) * e.size * 0.5);
        else ctx.lineTo(Math.cos(a) * e.size * 0.5, Math.sin(a) * e.size * 0.5);
      }
      ctx.closePath();
      ctx.stroke();

      ctx.fillStyle = "#ff0066";
      glow("#ff4488", 10);
      ctx.beginPath();
      ctx.arc(0, 0, e.size * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }

    noGlow();
    ctx.restore();
  }

  /* Particles */
  for (const p of particles) {
    const alpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    glow(p.color, 4);
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  noGlow();

  /* HUD */
  drawHUD();
}

/* ── Expose public API on window for browser integration ─ */
window.initInput = initInput;
window.startGame  = startGame;
window.toggleMute = toggleMute;
window.drawGame   = drawGame;
window.init       = init;

/* ── Main loop ─────────────────────────────────────── */
function loop() {
  update();
  drawGame();
  requestAnimationFrame(loop);
}

loop();
})();
