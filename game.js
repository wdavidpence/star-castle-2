/* global requestAnimationFrame, CanvasRenderingContext2D */
/* Star Castle 2 — game.js
 * Minimal browser foundation. No gameplay logic yet.
 */

(function () {
  'use strict';

  // ── State ────────────────────────────────────────────────
  var state = {
    running: false,
    muted: false,
    lastTime: 0,
    frameCount: 0
  };

  // ── DOM refs (lazy init) ────────────────────────────────
  var canvas, ctx, attractScreen, hud, touchControls;
  var dpr = 1;

  // ── Input ────────────────────────────────────────────────
  var keys = {};
  var touchState = { left: false, right: false, thrust: false, fire: false };

  function initInput() {
    // Keyboard
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (e.code === 'KeyM') toggleMute();
      if (!state.running && (e.code === 'Space' || e.code === 'Enter')) startGame();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });

    // Touch buttons
    var touchMap = {
      touchLeft: 'left',
      touchRight: 'right',
      touchThrust: 'thrust',
      touchFire: 'fire'
    };

    Object.keys(touchMap).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var action = touchMap[id];

      el.addEventListener('touchstart', function (e) {
        e.preventDefault();
        touchState[action] = true;
        if (!state.running && action === 'fire') startGame();
      }, { passive: false });

      el.addEventListener('touchend', function (e) {
        e.preventDefault();
        touchState[action] = false;
      }, { passive: false });
    });

    // Tap attract screen to start
    if (attractScreen) {
      attractScreen.addEventListener('touchstart', function (e) {
        if (!state.running) { e.preventDefault(); startGame(); }
      }, { passive: false });
      attractScreen.addEventListener('click', function () {
        if (!state.running) startGame();
      });
    }
  }

  function inputLeft()  { return keys['ArrowLeft'] || keys['KeyA'] || touchState.left; }
  function inputRight() { return keys['ArrowRight'] || keys['KeyD'] || touchState.right; }
  function inputThrust(){ return keys['ArrowUp'] || keys['KeyW'] || touchState.thrust; }
  function inputFire()  { return keys['Space'] || keys['ArrowDown'] || keys['KeyS'] || touchState.fire; }

  // ── Mute ─────────────────────────────────────────────────
  function toggleMute() {
    state.muted = !state.muted;
    var btn = document.getElementById('muteBtn');
    if (btn) btn.textContent = state.muted ? 'UNMUTE' : 'MUTE';
  }

  // ── Canvas resize ────────────────────────────────────────
  function resizeCanvas() {
    dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width  = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  // ── Drawing ──────────────────────────────────────────────
  function drawAttract() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    // Simple star field
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0f0';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    for (var i = 0; i < 40; i++) {
      var x = ((i * 137 + state.frameCount * 0.1) % w);
      var y = ((i * 251) % h);
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawGame() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    // Placeholder: ship dot
    ctx.fillStyle = '#0f0';
    ctx.fillRect(w / 2 - 4, h - 60, 8, 8);
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PHASE 1 — FOUNDATION', w / 2, 30);
  }

  // ── Loop ─────────────────────────────────────────────────
  function loop(timestamp) {
    state.frameCount++;
    if (state.running) {
      drawGame();
    } else {
      drawAttract();
    }
    state.lastTime = timestamp;
    requestAnimationFrame(loop);
  }

  // ── Start ────────────────────────────────────────────────
  function startGame() {
    if (state.running) return;
    state.running = true;
    if (attractScreen) attractScreen.classList.add('hidden');
    if (hud) hud.classList.add('visible');
    if (touchControls) touchControls.classList.add('visible');
  }

  // ── Init ─────────────────────────────────────────────────
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    attractScreen = document.getElementById('attractScreen');
    hud = document.getElementById('hud');
    touchControls = document.getElementById('touchControls');

    var muteBtn = document.getElementById('muteBtn');
    if (muteBtn) {
      muteBtn.addEventListener('click', toggleMute);
      muteBtn.addEventListener('touchstart', function (e) {
        e.preventDefault(); toggleMute();
      }, { passive: false });
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    initInput();

    // Expose API
    window.__game = {
      state: state,
      inputLeft: inputLeft,
      inputRight: inputRight,
      inputThrust: inputThrust,
      inputFire: inputFire,
      toggleMute: toggleMute,
      start: startGame,
      canvas: canvas,
      ctx: ctx
    };

    requestAnimationFrame(loop);
  }

  // Boot on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
