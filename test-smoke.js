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

// ── index.html assertions ──
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

// ── game.js assertions ──
assert(js.includes('startGame'), 'game.js defines startGame');
assert(js.includes('toggleMute'), 'game.js defines toggleMute');
assert(js.includes('initInput'), 'game.js defines initInput');
assert(js.includes('drawAttract'), 'game.js defines drawAttract');
assert(js.includes('drawGame'), 'game.js defines drawGame');
assert(js.includes('function loop'), 'game.js defines loop');
assert(js.includes('function init'), 'game.js defines init');
assert(js.includes('requestAnimationFrame'), 'game.js uses requestAnimationFrame');
assert(js.includes('gameCanvas'), 'game.js references gameCanvas');
assert(js.includes('attractScreen'), 'game.js references attractScreen');
assert(js.includes('muteBtn'), 'game.js references muteBtn');
assert(js.includes('touchControls'), 'game.js references touchControls');

// ── Result ──
if (failed === 0) {
  console.log('PASS');
  process.exit(0);
} else {
  console.log(`FAIL (${failed} assertions failed, ${passed} passed)`);
  process.exit(1);
}
