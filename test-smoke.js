const fs = require('fs');
const path = require('path');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    passed++;
  } else {
    failed++;
    console.log('FAIL:', msg);
  }
}

const root = path.dirname(__filename);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const js = fs.readFileSync(path.join(root, 'game.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'style.css'), 'utf8');

// ── index.html structural assertions ──
assert(html.includes('id="gameCanvas"'), 'index.html has gameCanvas');
assert(html.includes('id="attractScreen"'), 'index.html has attractScreen');
assert(html.includes('id="attractPrompt"'), 'index.html has attractPrompt');
assert(html.includes('id="hud"'), 'index.html has hud');
assert(html.includes('id="muteBtn"'), 'index.html has muteBtn');
assert(html.includes('id="touchControls"'), 'index.html has touchControls');
assert(html.includes('id="touchLeft"'), 'index.html has touchLeft');
assert(html.includes('id="touchThrust"'), 'index.html has touchThrust');
assert(html.includes('id="touchRight"'), 'index.html has touchRight');
assert(html.includes('id="touchFire"'), 'index.html has touchFire');
assert(html.includes('STAR CASTLE 2'), 'index.html has title');
assert(html.includes('src="game.js"'), 'index.html loads game.js');

// ── game.js contract assertions (fidelity model) ──
assert(js.includes('function startGame'), 'defines startGame');
assert(js.includes('function toggleMute'), 'defines toggleMute');
assert(js.includes('function initInput'), 'defines initInput');
assert(js.includes('function drawAttract'), 'defines drawAttract');
assert(js.includes('function drawGame'), 'defines drawGame');
assert(js.includes('function updateCastle'), 'defines updateCastle (central cannon AI)');
assert(js.includes('function updateMines'), 'defines updateMines');
assert(js.includes('function hitSection'), 'defines hitSection (per-section shield damage)');
assert(js.includes('function onRingDestroyed'), 'defines onRingDestroyed (regen cascade)');
assert(js.includes('function killCastle'), 'defines killCastle');
assert(js.includes('function fireBullet'), 'defines fireBullet');
assert(js.includes('function rayClear'), 'defines rayClear (gap fire-line)');

// Fidelity constants from the original arcade
assert(js.includes('RING_SEGMENTS = 12'), '12 shield sections per ring (original)');
assert(js.includes('SECTION_HP    = [7, 6, 5]'), 'tiered toughness: outer 5 / middle 6 / inner 7 hp (~20% per tier)');
assert(js.includes('CASTLE_POINTS = 1440'), 'castle worth 1440 points (original manual)');
assert(js.includes('MAX_MINES = 3'), 'exactly three mines (original)');
assert(js.includes('EXTRA SHIP') || js.includes('lives + 1'), 'extra ship on castle destruction');

// Ring color overlay: yellow/orange/red outer->inner
assert(/RING_COLORS\s*=\s*\["#ff2a2a",\s*"#ff8c1a",\s*"#ffd80a"\]/.test(js), 'overlay palette inner red / middle orange / outer yellow');

// Castle at center (no top-anchor bug)
assert(!/core\.y\s*=\s*60/.test(js), 'no top-anchored core position');
assert(/castle\.x\s*=\s*W \/ 2;/.test(js) && /castle\.y\s*=\s*H \/ 2;/.test(js), 'castle centered');

// Oppositely rotating rings
assert(/RING_DIRS\s*=\s*\[1,\s*-1,\s*1\]/.test(js), 'rings rotate in opposite directions');

// Mines earn no points (original rule)
const mineKillSection = js.match(/Bullet vs mine[\s\S]{0,400}/);
assert(mineKillSection && !/score\s*\+=/.test(mineKillSection[0]), 'no points for destroying mines');

// Ring regen restores mines
assert(/resetMines\(\);/.test(js.split('function onRingDestroyed')[1] || ''), 'ring regeneration restores mines');

// Wraparound playfield
assert(/function wrap\(obj\)/.test(js), 'wraparound playfield present');

// ── style.css sanity ──
assert(css.includes('#gameCanvas'), 'style.css styles gameCanvas');
assert(css.includes('.touch-btn'), 'style.css styles touch buttons');
assert(css.includes('.hidden'), 'style.css has hidden utility');

console.log('');
console.log('SMOKE TESTS: ' + passed + ' passed, ' + failed + ' failed');
if (failed > 0) process.exit(1);
