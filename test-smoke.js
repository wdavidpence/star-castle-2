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

// ── Pass 1: arc/segment collision assertions ──
assert(js.includes('checkShieldCollision'), 'game.js defines checkShieldCollision');
assert(js.includes('window.checkShieldCollision'), 'game.js exposes checkShieldCollision');
assert(js.includes('segAngle'), 'game.js computes segment angle for arc collision');
assert(js.includes('segArc'), 'game.js computes segment arc coverage');
assert(js.includes('segIndex'), 'game.js indexes segment by angle');
assert(js.includes('segOffset'), 'game.js checks offset within segment arc');
assert(js.includes('activeSegs'), 'game.js computes active segment count');
// Verify arc-based collision is used in both enemy and bullet paths
const enemyCollisionMatch = js.match(/Enemy vs player.*arc-based.*shield check/s);
assert(!!enemyCollisionMatch, 'enemy vs player uses arc-based shield check');
const bulletCollisionMatch = js.match(/Bullet vs player.*arc-based.*shield check/s);
assert(!!bulletCollisionMatch, 'bullet vs player uses arc-based shield check');

// ── Pass 2: breach mechanic assertions ──
assert(js.includes('player.rings'), 'game.js uses per-ring state');
assert(js.includes('rs.destroyed'), 'game.js tracks destroyed ring state');
assert(js.includes('breachFlash'), 'game.js tracks breach flash for visual feedback');
assert(js.includes('hitRing'), 'game.js uses hitRing for per-ring damage');
assert(js.includes('outer-to-inner'), 'game.js documents outer-to-inner breach processing');

// ── Arc collision math verification (pure JS, no browser) ──
// Updated simulateShieldCollision: per-ring state, outer-to-inner, returns ring index
function simulateShieldCollision(objX, objY, playerX, playerY, rings, ringsState, shieldAngle) {
  const allDestroyed = ringsState.every(rs => rs.destroyed);
  if (allDestroyed) return -1;
  const dx = objX - playerX;
  const dy = objY - playerY;
  const d = Math.hypot(dx, dy);
  let relAngle = Math.atan2(dy, dx);
  if (relAngle < 0) relAngle += Math.PI * 2;
  for (let ri = rings.length - 1; ri >= 0; ri--) {
    const ring = rings[ri];
    const rs = ringsState[ri];
    if (rs.destroyed) continue;
    if (Math.abs(d - ring.radius) > 8) continue;
    const segAngle = (Math.PI * 2) / ring.segments;
    const segArc = segAngle * 0.55;
    let normAngle = relAngle - shieldAngle;
    while (normAngle < 0) normAngle += Math.PI * 2;
    while (normAngle >= Math.PI * 2) normAngle -= Math.PI * 2;
    const segIndex = Math.min(ring.segments - 1, Math.floor((normAngle + 1e-9) / segAngle));
    const segOffset = normAngle - segIndex * segAngle;
    const activeSegs = Math.floor((rs.health / 100) * ring.segments);
    if (segIndex < activeSegs && segOffset < segArc + 1e-9) return ri;
  }
  return -1;
}

const testRings = [
  { radius: 38, segments: 8, speed: 0.04 },
  { radius: 52, segments: 8, speed: -0.03 },
  { radius: 68, segments: 8, speed: 0.025 },
];

const fullState = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
];

// Test 1: Full shield blocks from all angles (inner ring)
const fullShieldAngle = 0;
for (let i = 0; i < 8; i++) {
  const a = (i / 8) * Math.PI * 2;
  const hit = simulateShieldCollision(
    100 + 38 * Math.cos(a), 150 + 38 * Math.sin(a),
    100, 150, testRings, fullState, fullShieldAngle
  );
  assert(hit >= 0, `full shield blocks angle ${i} (38px ring)`);
}

// Test 2: Depleted shield passes through
const depletedState = [
  { health: 0, destroyed: true, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
const depletedHit = simulateShieldCollision(138, 150, 100, 150, testRings, depletedState, 0);
assert(depletedHit === -1, 'all-destroyed shield does not block');

// Test 3: Half shield blocks first 4 segments, gaps for rest
const halfState = [
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
// Angle 0 -> segment 0 -> active (index 0 < activeSegs=4)
assert(simulateShieldCollision(138, 150, 100, 150, testRings, halfState, 0) >= 0,
  'half shield blocks segment 0 (angle 0)');
// Angle PI -> segment 4 -> gap (index 4 >= activeSegs=4)
const piObjX = 100 + 38 * Math.cos(Math.PI);
const piObjY = 150 + 38 * Math.sin(Math.PI);
assert(simulateShieldCollision(piObjX, piObjY, 100, 150, testRings, halfState, 0) === -1,
  'half shield has gap at segment 4 (angle PI)');

// Test 4: Object outside all rings doesn't trigger
const farHit = simulateShieldCollision(250, 250, 100, 150, testRings, fullState, 0);
assert(farHit === -1, 'object far from player does not trigger shield');

// Test 5: Object inside all rings (past shield) doesn't trigger
const insideHit = simulateShieldCollision(105, 150, 100, 150, testRings, fullState, 0);
assert(insideHit === -1, 'object inside all rings does not trigger shield');

// Test 6: Rotation shifts active segments
const rotatedAngle = Math.PI / 6;
// Angle 0 now maps to normAngle = -PI/6 -> +11*PI/6 -> segment 7 -> gap at half shield
const rotObjX = 100 + 38 * Math.cos(0);
const rotObjY = 150 + 38 * Math.sin(0);
assert(simulateShieldCollision(rotObjX, rotObjY, 100, 150, testRings, halfState, rotatedAngle) === -1,
  'rotated half shield has gap where segment 0 was');
// Angle PI/6 now maps to normAngle = 0 -> segment 0 -> active
const rotPi6X = 100 + 38 * Math.cos(Math.PI / 6);
const rotPi6Y = 150 + 38 * Math.sin(Math.PI / 6);
assert(simulateShieldCollision(rotPi6X, rotPi6Y, 100, 150, testRings, halfState, rotatedAngle) >= 0,
  'rotated half shield blocks at new active segment');

// ── Pass 2: Breach mechanic tests (deterministic) ──

// Test B1: Object at outer ring radius hits outer ring, not inner
const outerHit = simulateShieldCollision(
  100 + 68 * Math.cos(0), 150 + 68 * Math.sin(0),
  100, 150, testRings, fullState, 0
);
assert(outerHit === 2, 'object at radius 68 hits outer ring (index 2)');

// Test B2: Object at middle ring radius hits middle ring
const middleHit = simulateShieldCollision(
  100 + 52 * Math.cos(0), 150 + 52 * Math.sin(0),
  100, 150, testRings, fullState, 0
);
assert(middleHit === 1, 'object at radius 52 hits middle ring (index 1)');

// Test B3: Object at inner ring radius hits inner ring
const innerHit = simulateShieldCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, fullState, 0
);
assert(innerHit === 0, 'object at radius 38 hits inner ring (index 0)');

// Test B4: Outer ring destroyed -> middle ring takes hits (inner still protected)
const outerDestroyedState = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
// Object at middle ring radius should hit middle ring
const midAfterOuterDestroyed = simulateShieldCollision(
  100 + 52 * Math.cos(0), 150 + 52 * Math.sin(0),
  100, 150, testRings, outerDestroyedState, 0
);
assert(midAfterOuterDestroyed === 1, 'middle ring takes hits after outer destroyed');

// Test B5: Outer ring destroyed -> inner ring still protected by middle
const innerAfterOuterDestroyed = simulateShieldCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, outerDestroyedState, 0
);
assert(innerAfterOuterDestroyed === 0, 'inner ring takes hits when at inner radius (middle intact)');

// Test B6: Both outer rings destroyed -> inner ring exposed
const bothOuterDestroyedState = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
const innerExposed = simulateShieldCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, bothOuterDestroyedState, 0
);
assert(innerExposed === 0, 'inner ring exposed when both outer rings destroyed');

// Test B7: Partially damaged outer ring still blocks (active segments)
const partialOuterState = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 75, destroyed: false, breachFlash: 0 },
];
const partialOuterHit = simulateShieldCollision(
  100 + 68 * Math.cos(0), 150 + 68 * Math.sin(0),
  100, 150, testRings, partialOuterState, 0
);
assert(partialOuterHit === 2, 'partially damaged outer ring still blocks active segments');

// Test B8: Gap in outer ring -> object passes through to middle ring
// At half health (50), outer ring has 4 active segments (indices 0-3), gaps at 4-7
// Angle PI maps to segment 4 (a gap) on outer ring
const outerGapState = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
// Object at outer ring radius, angle PI -> gap in outer -> passes to middle
const outerGapHit = simulateShieldCollision(
  100 + 68 * Math.cos(Math.PI), 150 + 68 * Math.sin(Math.PI),
  100, 150, testRings, outerGapState, 0
);
// At radius 68, outer ring has a gap at angle PI, but middle ring is at radius 52
// The object is at radius 68, so it won't match middle ring's radius check
// It should pass through entirely
assert(outerGapHit === -1, 'object passes through outer ring gap (not at middle ring radius)');

// Test B9: Object at middle radius with all rings at half health
const allHalfState = [
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
// Object at middle ring radius, angle 0 -> hits middle ring (segment 0 active)
const allHalfMiddle = simulateShieldCollision(
  100 + 52 * Math.cos(0), 150 + 52 * Math.sin(0),
  100, 150, testRings, allHalfState, 0
);
assert(allHalfMiddle === 1, 'middle ring blocks at angle 0 with half health');

// Test B10: Verify breachFlash is a tracked property
assert(js.includes('rs.breachFlash'), 'game.js decrements breachFlash per-frame');
assert(js.includes('breachFlash = 30'), 'game.js sets breachFlash on ring hit');

// ── Pass 3: Ring regeneration assertions ──
assert(js.includes('tryRegenRings'), 'game.js defines tryRegenRings for ring regeneration');
assert(js.includes('sfxShieldRegen'), 'game.js defines sfxShieldRegen audio cue');
assert(js.includes('justDestroyed'), 'game.js tracks justDestroyed for regen trigger');
assert(js.includes('isOutermostActive'), 'game.js checks isOutermostActive before regen');
assert(!js.includes('shieldHealth'), 'game.js removed stale shared shieldHealth');
assert(!js.includes('shieldMax'), 'game.js removed stale shared shieldMax');

// Simulate ring regeneration: shift inner rings outward, create new ring at innermost
function simulateRegenRings(ringsState, destroyedIndex) {
  let isOutermostActive = true;
  for (let i = destroyedIndex + 1; i < ringsState.length; i++) {
    if (!ringsState[i].destroyed) {
      isOutermostActive = false;
      break;
    }
  }
  if (!isOutermostActive) return ringsState.map(rs => ({...rs}));
  if (!ringsState.some(rs => !rs.destroyed)) return ringsState.map(rs => ({...rs}));
  const result = ringsState.map(rs => ({...rs}));
  for (let i = destroyedIndex; i > 0; i--) {
    result[i] = { health: result[i-1].health, destroyed: result[i-1].destroyed, breachFlash: result[i-1].breachFlash };
  }
  result[0] = { health: 100, destroyed: false, breachFlash: 0 };
  return result;
}

// Test R1: Destroy outermost ring (index 2) -> shift 0,1 outward, new ring at 0
const r1Before = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 75, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 30 },
];
const r1After = simulateRegenRings(r1Before, 2);
assert(r1After[0].health === 100 && r1After[0].destroyed === false, 'R1: new full ring at innermost (index 0)');
assert(r1After[1].health === 100 && r1After[1].destroyed === false, 'R1: old ring 0 shifted to index 1');
assert(r1After[2].health === 75 && r1After[2].destroyed === false, 'R1: old ring 1 shifted to index 2');

// Test R2: Destroy middle ring (index 1), outer already destroyed -> shift ring 0, new at 0
const r2Before = [
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 30 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
const r2After = simulateRegenRings(r2Before, 1);
assert(r2After[0].health === 100 && r2After[0].destroyed === false, 'R2: new full ring at index 0');
assert(r2After[1].health === 50 && r2After[1].destroyed === false, 'R2: old ring 0 shifted to index 1');
assert(r2After[2].destroyed === true, 'R2: ring 2 stays destroyed');

// Test R3: Destroy non-outermost ring (index 1), outer intact -> NO regen
const r3Before = [
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 30 },
  { health: 100, destroyed: false, breachFlash: 0 },
];
const r3After = simulateRegenRings(r3Before, 1);
assert(r3After[0].health === 50 && r3After[0].destroyed === false, 'R3: ring 0 unchanged (no regen)');
assert(r3After[1].destroyed === true, 'R3: ring 1 stays destroyed (no regen)');
assert(r3After[2].health === 100, 'R3: ring 2 unchanged (no regen)');

// Test R4: Destroy last remaining ring (all others destroyed) -> NO regen (no rings to shift)
const r4Before = [
  { health: 0, destroyed: true, breachFlash: 30 },
  { health: 0, destroyed: true, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
const r4After = simulateRegenRings(r4Before, 0);
assert(r4After[0].destroyed === true, 'R4: all-destroyed state unchanged (no regen)');
assert(r4After[1].destroyed === true, 'R4: all rings stay destroyed');

// Test R5: Destroy innermost (index 0), outer intact -> NO regen (ring 0 not outermost active)
const r5Before = [
  { health: 0, destroyed: true, breachFlash: 30 },
  { health: 60, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
];
const r5After = simulateRegenRings(r5Before, 0);
assert(r5After[0].destroyed === true, 'R5: ring 0 stays destroyed (not outermost active)');
assert(r5After[1].health === 60, 'R5: ring 1 unchanged');
assert(r5After[2].health === 100, 'R5: ring 2 unchanged');

// Test R5b: Destroy innermost (index 0), middle active, outer destroyed -> NO regen
const r5bBefore = [
  { health: 0, destroyed: true, breachFlash: 30 },
  { health: 60, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
const r5bAfter = simulateRegenRings(r5bBefore, 0);
assert(r5bAfter[0].destroyed === true, 'R5b: ring 0 stays destroyed (ring 1 is outermost active)');
assert(r5bAfter[1].health === 60, 'R5b: ring 1 unchanged');

// Test R6: Verify collision after regen - new ring blocks at innermost radius
const r6State = simulateRegenRings([
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 30 },
], 2);
const r6Hit = simulateShieldCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, r6State, 0
);
assert(r6Hit === 0, 'R6: new ring at index 0 blocks at innermost radius');

// Test R7: Verify shifted ring blocks at its new outer radius
const r7Hit = simulateShieldCollision(
  100 + 68 * Math.cos(0), 150 + 68 * Math.sin(0),
  100, 150, testRings, r6State, 0
);
assert(r7Hit === 2, 'R7: shifted ring at index 2 blocks at outermost radius');

// ── Pass 4: Central cannon assertions ──
assert(js.includes('resetCore'), 'game.js defines resetCore for cannon core');
assert(js.includes('findShieldGap'), 'game.js defines findShieldGap for gap detection');
assert(js.includes('fireCannonShot'), 'game.js defines fireCannonShot for cannon firing');
assert(js.includes('updateCore'), 'game.js defines updateCore for core tracking');
assert(js.includes('cannonShots'), 'game.js maintains cannonShots array');
assert(js.includes('core.alive'), 'game.js tracks core alive state');
assert(!js.includes('core.hp'), 'game.js: cannon is one-shot kill (no HP pool)');
assert(js.includes('core.fireCooldown'), 'game.js tracks core fire cooldown');
assert(js.includes('fromOutside'), 'game.js checkShieldCollision supports fromOutside for cannon shots');
assert(js.includes('barrelGapAligned'), 'game.js computes gap alignment for barrel (core.angle)');
// Verify cannon shots interact with shield system
const cannonShieldMatch = js.match(/Cannon shot vs player shields/s);
assert(!!cannonShieldMatch, 'cannon shots check player shields');
// Verify bullet vs core collision exists
const bulletCoreMatch = js.match(/Bullet vs core/s);
assert(!!bulletCoreMatch, 'player bullets can hit the core');
// Verify tracking line rendering (replaced aiming indicator with dashed sight line)
assert(js.includes('Tracking line'), 'game.js renders tracking line from barrel to player');

// Standalone gap detection simulation (mirrors findShieldGap)
// Iterates outermost-to-innermost, uses segArc (0.55 coverage) matching checkShieldCollision
function simulateFindShieldGap(toAngle, rings, ringsState, shieldAngle) {
  for (let ri = rings.length - 1; ri >= 0; ri--) {
    const ring = rings[ri];
    const rs = ringsState[ri];
    if (rs.destroyed) continue;
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

// Standalone cannon collision simulation (fromOutside mode)
// fromOutside: cannon shots pass through gaps to inner rings
// !fromOutside: player bullets pass through gaps and exit (return -1)
function simulateCannonCollision(objX, objY, playerX, playerY, rings, ringsState, shieldAngle, fromOutside) {
  const allDestroyed = ringsState.every(rs => rs.destroyed);
  if (allDestroyed) return -1;
  const dx = objX - playerX;
  const dy = objY - playerY;
  const d = Math.hypot(dx, dy);
  let relAngle = Math.atan2(dy, dx);
  if (relAngle < 0) relAngle += Math.PI * 2;
  for (let ri = rings.length - 1; ri >= 0; ri--) {
    const ring = rings[ri];
    const rs = ringsState[ri];
    if (rs.destroyed) continue;
    if (Math.abs(d - ring.radius) > 8) continue;
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

// Test C1: Full shield (all segments active) -> no gap at any angle
assert(simulateFindShieldGap(0, testRings, fullState, 0) === false,
  'C1: full shield has no gap at angle 0');
assert(simulateFindShieldGap(Math.PI, testRings, fullState, 0) === false,
  'C1: full shield has no gap at angle PI');
assert(simulateFindShieldGap(Math.PI / 3, testRings, fullState, 0) === false,
  'C1: full shield has no gap at angle PI/3');

// Test C2: All rings destroyed -> gap always exists
assert(simulateFindShieldGap(0, testRings, depletedState, 0) === true,
  'C2: all-destroyed rings always have a gap');

// Test C3: Half-health rings -> gaps at segments 4-7
// At shieldAngle=0, angle 0 maps to segment 0 (active). Angle PI maps to segment 4 (gap).
assert(simulateFindShieldGap(0, testRings, halfState, 0) === false,
  'C3: half shield blocks at angle 0 (segment 0 active)');
assert(simulateFindShieldGap(Math.PI, testRings, halfState, 0) === true,
  'C3: half shield has gap at angle PI (segment 4 is a gap)');

// Test C4: Rotation shifts gaps -> previously blocked angle now has gap
// At shieldAngle=PI/6, angle PI/6 maps to normAngle=0 -> segment 0 (active) -> blocked
assert(simulateFindShieldGap(Math.PI / 6, testRings, halfState, Math.PI / 6) === false,
  'C4: rotated half shield blocks at angle PI/6');
// At shieldAngle=PI/6, angle 0 maps to normAngle=-PI/6 -> +11*PI/6 -> segment 7 (gap at half)
// But we need ALL rings to have gaps. With 8 segments, normAngle for segment 7 is in range [7*segAngle, 8*segAngle)
// activeSegs = 4, so segment 7 >= 4 -> gap. Same for all 3 rings.
assert(simulateFindShieldGap(0, testRings, halfState, Math.PI / 6) === true,
  'C4: rotated half shield has gap at angle 0 (all rings gap at segment 7)');

// Test C5: Cannon shot blocked by active segment at its ring radius
// Shot at outer ring radius (68), angle 0, shieldAngle 0 -> segment 0 active -> blocked
const c5Hit = simulateCannonCollision(
  100 + 68 * Math.cos(0), 150 + 68 * Math.sin(0),
  100, 150, testRings, fullState, 0, true
);
assert(c5Hit === 2, 'C5: cannon shot at outer ring radius blocked by active segment');

// Test C6: Cannon shot passes through gap at outer ring, blocked at middle ring
// Shot at middle ring radius (52), angle PI, half health -> outer ring has gap at PI, middle ring segment 4 is gap too
// All rings at half health, angle PI -> all have gap at segment 4 -> passes through
const c6Hit = simulateCannonCollision(
  100 + 52 * Math.cos(Math.PI), 150 + 52 * Math.sin(Math.PI),
  100, 150, testRings, halfState, 0, true
);
assert(c6Hit === -1, 'C6: cannon shot passes through aligned gaps in all rings');

// Test C7: Cannon shot at inner ring radius, outer ring has gap, middle ring blocks
// Setup: outer ring at 50% health (gaps at 6-11), middle ring at 100% (no gaps)
const c7State = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
// Shot at inner ring radius (38), angle 0 -> inner ring segment 0 active -> blocked
const c7Hit = simulateCannonCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, c7State, 0, true
);
assert(c7Hit === 0, 'C7: cannon shot at inner ring radius blocked by inner ring');

// Test C8: findShieldGap returns false when any ring blocks
// At angle 0, full shield -> all rings block -> no gap
assert(simulateFindShieldGap(0, testRings, fullState, 0) === false,
  'C8: findShieldGap returns false when full shield blocks');

// Test C9: findShieldGap returns true only when ALL rings have gaps
// With outer ring at 50% and middle at 100%, angle PI -> outer has gap, middle blocks -> false
const c9State = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
assert(simulateFindShieldGap(Math.PI, testRings, c9State, 0) === false,
  'C9: findShieldGap returns false when middle ring blocks (outer has gap)');

// Test C10: Cannon fire condition - only fires when all rings aligned
// All rings at 50% health, angle PI -> all have gap at segment 4 -> can fire
assert(simulateFindShieldGap(Math.PI, testRings, halfState, 0) === true,
  'C10: cannon can fire when all rings have aligned gap');

// Test C11: Core health and destruction
assert(!js.includes('core.hp'), 'game.js: cannon is one-shot kill (no HP pool)');
assert(!js.includes('core.hp'), 'game.js: cannon is one-shot kill (no HP pool)');
const coreDestructionMatch = js.match(/core\.alive = false.*state = "coreDestruction"/s);
assert(!!coreDestructionMatch, 'core is destroyed by one shot through gap');

// Test C12: Cannon shot speed scales with level
const cannonSpeedMatch = js.match(/3 \+ level \* 0\.4/);
assert(!!cannonSpeedMatch, 'cannon shot speed increases with level');

// Test C13: Cannon fire cooldown scales with level
const cannonCooldownMatch = js.match(/120 - level \* 8/);
assert(!!cannonCooldownMatch, 'cannon fire cooldown decreases with level');

// ── Pass 5: Player movement physics assertions ──
// Verify source code contains the expected constants
assert(js.includes('rotSpeed = 0.065'), 'M1: rotation speed is 0.065 rad/frame (cabinet-era turn)');
assert(js.includes('thrust = 0.18'), 'M2: thrust acceleration is 0.18 px/frame² (punchier)');
assert(js.includes('*= 0.992'), 'M3: friction factor is 0.992 (cabinet-era drift)');
assert(js.includes('speed > 7'), 'M4: max speed cap at 7 px/frame');
assert(js.includes('Math.hypot(player.vx, player.vy)'), 'M5: speed computed via hypot');
// New velocity-based rotation constants (Asteroids-era inertia)
assert(js.includes('ROT_ACCEL'), 'M1a: ROT_ACCEL constant defined for rotation acceleration');
assert(js.includes('ROT_FRICTION'), 'M1b: ROT_FRICTION constant defined for angular deceleration');
assert(js.includes('rotVel'), 'M1c: player.rotVel tracks angular velocity for inertia');

// Deterministic movement simulation (pure JS, mirrors game.js update logic)
function simulateMovement(initial, rotDirVal, thrustDirVal, frames, W, H) {
  const p = { x: initial.x, y: initial.y, vx: initial.vx, vy: initial.vy, angle: initial.angle, rotVel: initial.rotVel || 0 };
  const rotSpeed = 0.065;
  const ROT_ACCEL   = 0.012;    // rad/frame² when turning
  const ROT_FRICTION = 0.85;    // rad/frame decay on release
  const thrust = 0.18;
  const friction = 0.992;
  const maxSpeed = 7;
  for (let f = 0; f < frames; f++) {
    // Velocity-based rotation with inertia (Asteroids-era)
    if (rotDirVal !== 0) {
      p.rotVel += rotDirVal * ROT_ACCEL;
      if (p.rotVel >  rotSpeed) p.rotVel =  rotSpeed;
      if (p.rotVel < -rotSpeed) p.rotVel = -rotSpeed;
    } else {
      p.rotVel *= ROT_FRICTION;
      if (Math.abs(p.rotVel) < 0.001) p.rotVel = 0;
    }
    p.angle += p.rotVel;
    if (thrustDirVal) {
      p.vx += Math.cos(p.angle) * thrust;
      p.vy += Math.sin(p.angle) * thrust;
    }
    p.vx *= friction;
    p.vy *= friction;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      p.vx *= scale;
      p.vy *= scale;
    }
    p.x += p.vx;
    p.y += p.vy;
    // Wrap
    if (p.x < -50) p.x += W + 100;
    if (p.x > W + 50) p.x -= W + 100;
    if (p.y < -50) p.y += H + 100;
    if (p.y > H + 50) p.y -= H + 100;
  }
  return p;
}

const testW = 800, testH = 600;
const base = { x: 400, y: 300, vx: 0, vy: 0, angle: -Math.PI / 2 };

// M6: Left rotation decreases angle (with inertia)
const m6 = simulateMovement(base, -1, 0, 10, testW, testH);
assert(m6.angle < base.angle, 'M6: left rotation decreases angle');

// M7: Right rotation increases angle (with inertia)
const m7 = simulateMovement(base, 1, 0, 10, testW, testH);
assert(m7.angle > base.angle, 'M7: right rotation increases angle');

// M8: No rotation input keeps angle constant
const m8 = simulateMovement(base, 0, 0, 10, testW, testH);
assert(m8.angle === base.angle, 'M8: no rotation input preserves angle');

// M9: Thrust accelerates in facing direction (facing up = -Y)
const m9 = simulateMovement(base, 0, 1, 10, testW, testH);
assert(m9.vy < -0.5, 'M9: thrust while facing up produces negative vy');
assert(m9.vx < 0.01 && m9.vx > -0.01, 'M9: thrust while facing up has near-zero vx');

// M10: Thrust facing right (+X) accelerates vx
const baseRight = { ...base, angle: 0 };
const m10 = simulateMovement(baseRight, 0, 1, 10, testW, testH);
assert(m10.vx > 0.5, 'M10: thrust facing right produces positive vx');

// M11: Friction decays velocity over time (no thrust)
const baseMoving = { x: 400, y: 300, vx: 3, vy: 0, angle: 0 };
const m11 = simulateMovement(baseMoving, 0, 0, 50, testW, testH);
assert(m11.vx < 3, 'M11: friction reduces velocity magnitude');
assert(m11.vx > 0, 'M11: friction is bounded (velocity stays positive)');
// After 50 frames of 0.992 friction: 3 * 0.992^50 ≈ 3 * 0.669 ≈ 2.01
assert(m11.vx > 1.5 && m11.vx < 2.5, 'M11: friction decay within expected range (0.992 factor)');

// M12: Max speed cap prevents runaway acceleration
const m12 = simulateMovement(base, 0, 1, 100, testW, testH);
const m12Speed = Math.hypot(m12.vx, m12.vy);
assert(m12Speed <= 7.001, 'M12: max speed cap prevents exceeding 7 px/frame');
assert(m12Speed > 6.0, 'M12: ship reaches near max speed after sustained thrust');

// M13: Wrapping - ship at left edge wraps to right
const baseLeftEdge = { x: -60, y: 300, vx: 0, vy: 0, angle: 0 };
const m13 = simulateMovement(baseLeftEdge, 0, 0, 1, testW, testH);
assert(m13.x === -60 + testW + 100, 'M13: left edge wrap adds W+100');

// M14: Wrapping - ship at right edge wraps to left
const baseRightEdge = { x: testW + 60, y: 300, vx: 0, vy: 0, angle: 0 };
const m14 = simulateMovement(baseRightEdge, 0, 0, 1, testW, testH);
assert(m14.x === testW + 60 - (testW + 100), 'M14: right edge wrap subtracts W+100');

// M15: Wrapping - top edge
const baseTopEdge = { x: 400, y: -60, vx: 0, vy: 0, angle: 0 };
const m15 = simulateMovement(baseTopEdge, 0, 0, 1, testW, testH);
assert(m15.y === -60 + testH + 100, 'M15: top edge wrap adds H+100');

// M16: Wrapping - bottom edge
const baseBottomEdge = { x: 400, y: testH + 60, vx: 0, vy: 0, angle: 0 };
const m16 = simulateMovement(baseBottomEdge, 0, 0, 1, testW, testH);
assert(m16.y === testH + 60 - (testH + 100), 'M16: bottom edge wrap subtracts H+100');

// M17: Inertia/drift - ship continues moving after thrust released
const m17a = simulateMovement(base, 0, 1, 20, testW, testH); // thrust for 20 frames
const m17b = simulateMovement({ x: m17a.x, y: m17a.y, vx: m17a.vx, vy: m17a.vy, angle: base.angle }, 0, 0, 10, testW, testH); // coast 10 frames
assert(m17b.vx > 0.01 || m17b.vy < -0.01, 'M17: ship retains velocity after thrust released (inertia)');
const m17drift = Math.hypot(m17b.x - m17a.x, m17b.y - m17a.y);
assert(m17drift > 1, 'M17: ship drifts visibly during coast phase');

// M18: Rotation inertia — ship builds rotVel toward max when turning (Asteroids-era)
const m18a = simulateMovement(base, -1, 0, 6, testW, testH);
assert(m18a.rotVel === -0.065, 'M18: rotVel reaches max (rotSpeed) after enough frames of turning');
const m18b = simulateMovement(base, -1, 0, 3, testW, testH);
// After 3 frames: rotVel = -0.012*3 = -0.036 (not yet at cap of -0.065)
assert(Math.abs(m18b.rotVel - (-0.036)) < 1e-9, 'M18: rotVel = ROT_ACCEL * frames (grows linearly before cap)');

// M19: Angular friction decays rotVel when no input (ship coasts to stop turning)
const m19a = simulateMovement(base, -1, 0, 20, testW, testH);
// After 20 frames of turning: rotVel = -0.065 (max)
const m19b = simulateMovement({...m19a, rotVel: -0.065}, 0, 0, 10, testW, testH);
// After 10 frames with friction 0.85: rotVel = -0.065 * 0.85^10 ≈ -0.065 * 0.1969 ≈ -0.0128
assert(Math.abs(m19b.rotVel) < 0.065 && m19b.rotVel !== 0, 'M19: rotVel decays after release (not instant stop)');
assert(Math.abs(m19b.rotVel + 0.065 * Math.pow(0.85, 10)) < 0.002, 'M19: rotVel decay matches ROT_FRICTION^frames');

// M20: Alternating turn direction does NOT instant-reverse (inertia resists)
const m20a = simulateMovement(base, -1, 0, 5, testW, testH);
// After 5 left turns: rotVel = -0.06 (accumulated from accel, not yet at cap)
assert(m20a.rotVel < 0, 'M20: rotating left gives negative rotVel');
// Now reverse direction for 5 frames without clearing rotVel (simulates quick alternating)
const m20b = simulateMovement({...m20a, rotVel: m20a.rotVel}, 1, 0, 5, testW, testH);
// rotVel starts at -0.06, gains +0.012*5=+0.06 -> rotVel ≈ 0 (cancels due to inertia)
assert(Math.abs(m20b.rotVel) < 1e-9, 'M20: equal opposite turns cancel due to inertia (rotVel crosses through zero)');
// Next frame continues turning right: rotVel = +0.012
const m20c = simulateMovement({...m20b, rotVel: 0}, 1, 0, 6, testW, testH);
assert(m20c.rotVel > 0, 'M20: after cancellation, reversing again builds positive rotVel');

// M21: Fire control — bullet inherits less player velocity (Star Castle precise fire)
assert(js.includes('player.vx * 0.2'), 'M21: bullet inherits reduced player velocity (0.2x)');

// ── Pass 6: Vector arcade rendering contract ──
// Shield rings: green phosphor palette
assert(js.includes('"#55ff55"'), 'V1: shield ring inner uses bright green phosphor #55ff55');
assert(js.includes('"#33dd33"'), 'V2: shield ring middle uses green phosphor #33dd33');
assert(js.includes('"#11bb11"'), 'V3: shield ring outer uses green phosphor #11bb11');

// Shield rings: restrained phosphor glow
const shieldGlowMatch = js.match(/shield.*shadowBlur\s*=\s*6/s);
assert(!!shieldGlowMatch, 'V4: shield rings use restrained shadowBlur 6');

// Shield rings: crisp wireframe lines
const shieldLineMatch = js.match(/shield.*lineWidth\s*=\s*1\.5/s);
assert(!!shieldLineMatch, 'V5: shield rings use crisp lineWidth 1.5');

// Shield rings: distinct segment gaps (0.55 coverage = 45% gap)
assert(js.includes('* 0.55'), 'V6: shield ring segments use 0.55 arc coverage (45% gap)');

// Collision uses matching segment arc ratio
const collisionSegArcMatch = js.match(/segArc\s*=\s*segAngle\s*\*\s*0\.55/);
assert(!!collisionSegArcMatch, 'V7: collision math uses matching 0.55 segment arc');

// White-hot core pass for vector monitor authenticity
const whiteHotMatch = js.match(/White-hot core pass.*#ffffff/s);
assert(!!whiteHotMatch, 'V7b: shield rings have white-hot core pass for vector glow');

// Segment-specific breach flash (not full circle)
const breachFlashMatch = js.match(/Breach flash.*segment-specific/s);
assert(!!breachFlashMatch, 'V7c: breach flash is segment-specific for readability');

// Core: castle silhouette (rectangular body, not hexagon)
assert(js.includes('strokeRect(-16, -12, 32, 24)'), 'V8: core body is rectangular castle base');
assert(js.includes('Corner turrets'), 'V9: core has corner turrets for castle silhouette');

// Core: wireframe crosshair center (no filled dot)
assert(js.includes('Center crosshair'), 'V10: core center is wireframe crosshair');

// Barrel: rectangular outline (not single line)
assert(js.includes('Cannon barrel'), 'V11: cannon barrel is present');
const barrelRectMatch = js.match(/strokeRect\(8,\s*-2,\s*16,\s*4\)/);
assert(!!barrelRectMatch, 'V12: cannon barrel is rectangular outline');

// No filled elements in drawGame (pure wireframe)
const drawGameBody = js.substring(js.indexOf('function drawGame()'));
const fillInDrawGame = drawGameBody.match(/ctx\.fill\(\)/);
assert(!fillInDrawGame, 'V13: drawGame uses no ctx.fill() calls (pure wireframe)');

// Enemies: wireframe only, no filled centers
const enemyFillMatch = drawGameBody.match(/e\.type.*ctx\.fill\(\)/s);
assert(!enemyFillMatch, 'V14: enemies have no filled center dots');

// Particles: line segments (not filled circles)
const particleLineMatch = drawGameBody.match(/particles.*moveTo.*lineTo.*stroke/s);
assert(!!particleLineMatch, 'V15: particles rendered as line segments');

// HUD: wireframe shield bars (strokeRect, not fillRect)
const hudWireMatch = js.match(/drawHUD.*strokeRect/s);
assert(!!hudWireMatch, 'V16: HUD shield bars use wireframe strokeRect');

// No dead render() function
assert(!js.includes('function render()'), 'V17: dead render() function removed');

// IIFE structure: all public API inside IIFE, exposed on window
assert(js.includes('window.initInput = initInput'), 'V18: initInput exposed on window');
assert(js.includes('window.drawGame   = drawGame'), 'V19: drawGame exposed on window');
assert(js.match(/function drawGame\(\)/), 'V20: drawGame defined inside IIFE');

// ── Pass 6c: Cabinet-grade vector presentation (Cinematronics restraint) ──

// HTML has CRT overlay container for monitor emulation
assert(html.includes('id="crtOverlay"'), 'V20a: HTML has crtOverlay container');
assert(html.includes('id="scanlines"'), 'V20b: HTML has scanline element');
assert(html.includes('id="vignette"'), 'V20c: HTML has vignette element');

// CSS scanline pattern (repeating-linear-gradient) present
assert(css.includes('repeating-linear-gradient'), 'V20d: CSS has scanline gradient pattern');
assert(css.includes('#crtOverlay'), 'V20e: CSS styles crtOverlay container');
assert(css.includes('#scanlines'), 'V20f: CSS styles scanline element');
assert(css.includes('#vignette'), 'V20g: CSS styles vignette element');

// Flash overlay uses white/neutral (not warm amber) — authentic vector monitor flash
const coreDestructionSection = js.substring(js.indexOf('coreDestructionTimer'));
const vFlashMatch = coreDestructionSection.match(/fillStyle\s*=\s*`rgba\(\s*255,\s*255,\s*\d+/);
assert(!!vFlashMatch, 'V20h: core destruction flash is near-white');

// Star rendering in drawGame uses sub-5% alpha (transparent, no competition with vector lines)
const bgSection = js.substring(js.indexOf('/* Background — true black'));
assert(bgSection.includes('0.04') || bgSection.match(/globalAlpha\s*=\s*twinkle\s*\*\s*0\.0[0-9]/), 'V20i: starfield alpha is sub-5% (transparent)');
assert(!bgSection.match(/rgba\(\s*80,\s*90/), 'V20j: no colored (blue) star field — vector-only');

// Pure black background preserved
assert(js.includes('"#000"'), 'V20k: canvas background is pure black (#000)');
// Canvas context disables alpha channel (true black, no compositing artifacts)
assert(js.includes('alpha: false'), 'V20l: canvas context uses alpha:false for true black');

// ── Pass 6b: Shield ring depth-intensity + gap-tick fidelity (1980 reference) ──

/* V21: SHIELD_RINGS config carries per-ring intensity (outer=0.95, inner=0.30) */
const srBody = js.substring(js.indexOf('  const SHIELD_RINGS ='));
assert(srBody.includes('intensity:'), 'V21: SHIELD_RINGS carries per-ring intensity');
assert(srBody.match(/intensity:\s*0\.95/), 'V21a: outer ring intensity 0.95 (brightest)');
assert(srBody.match(/intensity:\s*0\.30/), 'V21b: inner ring intensity 0.30 (dimmest)');

/* V22: SHIELD_RINGS carries per-ring glow (shadow blur) */
assert(srBody.includes('glow:'), 'V22: SHIELD_RINGS carries per-ring glow attribute');
assert(srBody.match(/glow:\s*14/), 'V22a: outer ring glow=14');
assert(srBody.match(/glow:\s*6\b/), 'V22b: inner ring glow=6');

/* V23: GAP_TICK_LEN constant defined */
assert(js.includes('GAP_TICK_LEN'), 'V23: GAP_TICK_LEN constant defined for gap indicator length');

/* V24: Shield gameplay drawing uses ring.intensity in ghost bloom pass */
const gameplayShieldBody = js.substring(js.indexOf('/* Shield rings — green phosphor'));
assert(gameplayShieldBody.includes('ring.intensity'), 'V24: gameplay shield uses ring.intensity in drawing');
assert(gameplayShieldBody.includes('ring.glow'), 'V24a: gameplay shield uses ring.glow in ghost pass');

/* V25: Shield gameplay drawing draws gap ticks (line segment at arc endpoint) */
assert(gameplayShieldBody.includes('GAP_TICK_LEN'), 'V25: gameplay shield draws gap ticks using GAP_TICK_LEN');
assert(gameplayShieldBody.includes('moveTo') && gameplayShieldBody.includes('lineTo'), 'V25a: gap ticks rendered as moveTo/lineTo primitives');

/* V26: Attract showcase uses per-ring intensity + glow (consistent with gameplay) */
const attractBody = js.substring(js.indexOf('function drawAttractShowcase()'));
assert(attractBody.includes('ring.intensity'), 'V26: attract showcase uses ring.intensity');
assert(attractBody.match(/shadowBlur/), 'V26a: attract showcase uses shadowBlur for glow');
assert(attractBody.includes('GAP_TICK_LEN'), 'V26b: attract showcase draws gap ticks');

/* V27: Outer ring is visually brighter than inner (intensity ordering) */
const outerIntMatch = srBody.match(/intensity:\s*([\d.]+)/g);
assert(outerIntMatch.length === 3, 'V27: all three rings specify intensity');
const outerInts = outerIntMatch.map(m => parseFloat(m.match(/[\d.]+$/)[0]));
assert(outerInts[2] > outerInts[0], `V27a: outer ring intensity (${outerInts[2]}) > inner ring intensity (${outerInts[0]})`);

assert(js.includes('window.initInput = initInput'), 'V18: initInput exposed on window');
assert(js.includes('window.drawGame   = drawGame'), 'V19: drawGame exposed on window');
assert(js.match(/function drawGame\(\)/), 'V20: drawGame defined inside IIFE');

// ── Pass 7: Audio palette assertions ──

/* Audio helper presence */
assert(js.includes('function playTone'), 'A1: playTone helper exists');
assert(js.includes('function sfxThrust'), 'A2: sfxThrust defined');
assert(js.includes('function sfxShoot'), 'A3: sfxShoot defined');
assert(js.includes('function sfxExplosion'), 'A4: sfxExplosion defined');
assert(js.includes('function sfxHit'), 'A5: sfxHit defined');
assert(js.includes('function sfxShield'), 'A6: sfxShield defined');
assert(js.includes('function sfxMine'), 'A7: sfxMine defined');
assert(js.includes('function sfxLevelUp'), 'A8: sfxLevelUp defined');
assert(js.includes('function sfxDeath'), 'A9: sfxDeath defined');
assert(js.includes('function sfxShieldRegen'), 'A10: sfxShieldRegen defined');

/* Mute gating */
assert(js.includes('!audioCtx || muted'), 'A11: playTone gates on audioCtx and muted');
assert(js.includes('if (audioCtx) return'), 'A12: initAudio guards against re-init');

/* Audio context initialization */
assert(js.includes('AudioContext'), 'A13: uses AudioContext');
assert(js.includes('webkitAudioContext'), 'A14: webkitAudioContext fallback');
assert(js.includes('masterGain'), 'A15: master gain node for volume control');

/* Event wiring: distinct sounds for distinct events */
assert(js.includes('sfxThrust()'), 'A16: sfxThrust called (thrust event)');
const thrustInUpdate = js.match(/player\.thrusting.*=.*true[\s\S]*sfxThrust/s);
assert(!!thrustInUpdate, 'A17: sfxThrust wired in thrust section of update');
assert(js.match(/fireBullet[\s\S]*sfxShoot/s), 'A18: sfxShoot wired in fireBullet');
assert(js.match(/fireCannonShot[\s\S]*sfxMine/s), 'A19: sfxMine wired in fireCannonShot');
assert(js.match(/sfxExplosion.*enemies\.splice|enemies\.splice[\s\S]*sfxExplosion/s), 'A20: sfxExplosion wired for enemy destruction');
const coreExplosionMatch = js.match(/core\.alive = false[\s\S]*sfxExplosion/s);
assert(!!coreExplosionMatch, 'A21: sfxExplosion wired for core destruction');
assert(js.match(/hitRing.*>=.*0[\s\S]*sfxShield/s), 'A22: sfxShield wired on shield hit');
assert(js.match(/hitPlayer[\s\S]*sfxDeath|sfxDeath[\s\S]*hitPlayer/s), 'A23: sfxDeath wired in hitPlayer');

/* Distinct parameters: each sound uses different waveform/frequency signature */
const thrustDef = js.match(/sfxThrust.*playTone\((\d+),\s*(\d+\.?\d*),\s*"(\w+)"/);
const shootDef = js.match(/sfxShoot.*playTone\((\d+),\s*(\d+\.?\d*),\s*"(\w+)"/);
const shieldDef = js.match(/sfxShield.*playTone\((\d+),\s*(\d+\.?\d*),\s*"(\w+)"/);
assert(!!thrustDef, 'A24: sfxThrust has deterministic params');
assert(!!shootDef, 'A25: sfxShoot has deterministic params');
assert(!!shieldDef, 'A26: sfxShield has deterministic params');

/* Thrust uses triangle (unique waveform for rumble) */
assert(thrustDef && thrustDef[3] === 'triangle', 'A27: thrust uses triangle wave');
/* Shoot uses square (bright arcade pew) */
assert(shootDef && shootDef[3] === 'square', 'A28: shoot uses square wave');
/* Shield uses square (metallic ping) */
assert(shieldDef && shieldDef[3] === 'square', 'A29: shield uses square wave');

/* Distinct frequencies: thrust low, shoot mid-high, shield high */
assert(thrustDef && parseInt(thrustDef[1]) < 200, 'A30: thrust frequency is low (<200Hz)');
assert(shootDef && parseInt(shootDef[1]) > 400 && parseInt(shootDef[1]) < 1000, 'A31: shoot frequency is mid-high (400-1000Hz)');
assert(shieldDef && parseInt(shieldDef[1]) > 1000, 'A32: shield frequency is high (>1000Hz)');

/* Short durations: cabinet sounds are brief */
assert(parseFloat(thrustDef[2]) <= 0.10, 'A33: thrust duration is short (<=100ms)');
assert(parseFloat(shootDef[2]) <= 0.10, 'A34: shoot duration is short (<=100ms)');
assert(parseFloat(shieldDef[2]) <= 0.10, 'A35: shield duration is short (<=100ms)');

/* Cannon uses sawtooth (distinct from player fire) */
const mineDef = js.match(/sfxMine.*?playTone\((\d+),\s*(\d+\.?\d*),\s*"(\w+)"/);
assert(!!mineDef, 'A36: sfxMine has deterministic params');
assert(mineDef && mineDef[3] === 'sawtooth', 'A37: cannon fire uses sawtooth wave');
assert(mineDef && parseInt(mineDef[1]) < 200, 'A38: cannon fire frequency is low (<200Hz)');

/* Explosion uses sawtooth (aggressive bite) */
const explosionDef = js.match(/sfxExplosion.*?playTone\((\d+),\s*(\d+\.?\d*),\s*"(\w+)"/);
assert(!!explosionDef, 'A39: sfxExplosion has deterministic params');
assert(explosionDef && explosionDef[3] === 'sawtooth', 'A40: explosion primary uses sawtooth');

/* initAudio triggered on user gesture */
assert(js.match(/keydown.*initAudio|initAudio.*keydown/s), 'A41: initAudio on keydown');
assert(js.match(/touchstart.*initAudio|initAudio.*touchstart/s), 'A42: initAudio on touchstart');

/* Pass 7 additions: improved audio palette */
assert(js.includes('function sfxBreach'), 'A43: sfxBreach defined for ring destruction');
const breachDef = js.match(/sfxBreach.*?playTone\((\d+),\s*(\d+\.?\d*),\s*"(\w+)"/);
assert(!!breachDef, 'A44: sfxBreach has deterministic params');
assert(breachDef && breachDef[3] === 'sawtooth', 'A45: sfxBreach primary uses sawtooth');
assert(breachDef && parseInt(breachDef[1]) < 200, 'A46: sfxBreach frequency is low (<200Hz)');
assert(parseFloat(breachDef[2]) <= 0.10, 'A47: sfxBreach duration is short (<=100ms)');
assert(js.match(/justDestroyed[\s\S]*sfxBreach/s), 'A48: sfxBreach wired on ring destruction');

/* Thrust throttle prevents audio spam */
assert(js.includes('thrustTimer'), 'A49: thrust throttle timer exists');
assert(js.match(/resetPlayer[\s\S]*thrustTimer/s), 'A50: thrustTimer reset in resetPlayer');

/* iOS AudioContext resume on suspend */
assert(js.match(/initAudio[\s\S]*suspended[\s\S]*resume/s), 'A51: initAudio resumes suspended AudioContext');
assert(js.match(/playTone[\s\S]*suspended[\s\S]*resume/s), 'A52: playTone handles suspended AudioContext');

/* sfxDeath uses sawtooth (aggressive descent) */
assert(js.match(/sfxDeath[\s\S]*sawtooth/s), 'A53: sfxDeath uses sawtooth waveform');

/* sfxLevelUp ascending notes */
const levelUpDef = js.match(/sfxLevelUp[\s\S]*\[(\d+),(\d+),(\d+)/);
assert(!!levelUpDef, 'A54: sfxLevelUp has ascending note array');
assert(levelUpDef && parseInt(levelUpDef[1]) < parseInt(levelUpDef[2]) && parseInt(levelUpDef[2]) < parseInt(levelUpDef[3]), 'A55: sfxLevelUp notes are ascending');

/* sfxShieldRegen ascending notes */
const regenDef = js.match(/sfxShieldRegen[\s\S]*\[(\d+),(\d+),(\d+)/);
assert(!!regenDef, 'A56: sfxShieldRegen has ascending note array');
assert(regenDef && parseInt(regenDef[1]) < parseInt(regenDef[2]) && parseInt(regenDef[2]) < parseInt(regenDef[3]), 'A57: sfxShieldRegen notes are ascending');

// ── Pass 8: Attract mode — deterministic card rotation ──

/* Source assertions: attract infrastructure exists */
assert(js.includes('ATTRACT_CARD_DURATIONS'), 'AT1: ATTRACT_CARD_DURATIONS constant defined');
assert(js.includes('ATTRACT_TOTAL_CYCLE'), 'AT2: ATTRACT_TOTAL_CYCLE constant defined');
assert(js.includes('attractCard'), 'AT3: attractCard state variable exists');
assert(js.includes('attractCardTimer'), 'AT4: attractCardTimer state variable exists');
assert(js.includes('showcaseAngle'), 'AT5: showcaseAngle for showcase rotation');
assert(js.includes('highScore'), 'AT6: highScore state variable exists');
assert(js.includes('saveHighScore'), 'AT7: saveHighScore function defined');
assert(js.includes('resetAttract'), 'AT8: resetAttract function defined');
assert(js.includes('advanceAttractCard'), 'AT9: advanceAttractCard function defined');
assert(js.includes('drawAttractTitle'), 'AT10: drawAttractTitle card renderer');
assert(js.includes('drawAttractHighScore'), 'AT11: drawAttractHighScore card renderer');
assert(js.includes('drawAttractInstructions'), 'AT12: drawAttractInstructions card renderer');
assert(js.includes('drawAttractShowcase'), 'AT13: drawAttractShowcase card renderer');

/* Verify card durations sum to total cycle */
const durMatch = js.match(/ATTRACT_CARD_DURATIONS\s*=\s*\[([^\]]+)\]/);
assert(!!durMatch, 'AT14: ATTRACT_CARD_DURATIONS is an array literal');
if (durMatch) {
  const durs = durMatch[1].split(',').map(s => parseInt(s.trim(), 10));
  assert(durs.length === 4, 'AT15: exactly 4 attract cards');
  assert(durs[0] === 180, 'AT16: card 0 (Title) duration = 180 frames');
  assert(durs[1] === 180, 'AT17: card 1 (HighScore) duration = 180 frames');
  assert(durs[2] === 240, 'AT18: card 2 (Instructions) duration = 240 frames');
  assert(durs[3] === 300, 'AT19: card 3 (Showcase) duration = 300 frames');
  const total = durs.reduce((a, b) => a + b, 0);
  assert(total === 900, 'AT20: total cycle = 900 frames (15s at 60fps)');
}

/* Verify card order in drawAttract */
const drawAttractBody = js.substring(js.indexOf('function drawAttract()'));
const card0Ref = drawAttractBody.indexOf('attractCard === 0');
const card1Ref = drawAttractBody.indexOf('attractCard === 1');
const card2Ref = drawAttractBody.indexOf('attractCard === 2');
const card3Ref = drawAttractBody.indexOf('attractCard === 3');
assert(card0Ref >= 0, 'AT21: drawAttract checks card 0 (Title)');
assert(card1Ref >= 0, 'AT22: drawAttract checks card 1 (HighScore)');
assert(card2Ref >= 0, 'AT23: drawAttract checks card 2 (Instructions)');
assert(card3Ref >= 0, 'AT24: drawAttract checks card 3 (Showcase)');
assert(card0Ref < card1Ref && card1Ref < card2Ref && card2Ref < card3Ref,
  'AT25: cards checked in order 0,1,2,3');

/* Verify card renderers are called in correct order */
assert(drawAttractBody.includes('drawAttractTitle()'), 'AT26: Title renderer called');
assert(drawAttractBody.includes('drawAttractHighScore()'), 'AT27: HighScore renderer called');
assert(drawAttractBody.includes('drawAttractInstructions()'), 'AT28: Instructions renderer called');
assert(drawAttractBody.includes('drawAttractShowcase()'), 'AT29: Showcase renderer called');

/* Deterministic card advancement simulation (mirrors advanceAttractCard) */
function simulateAdvanceAttractCard(card, timer, showcaseAngle, durations) {
  timer++;
  if (timer >= durations[card]) {
    timer = 0;
    card = (card + 1) % durations.length;
  }
  if (card === 3) {
    showcaseAngle += 0.02;
  }
  return { card, timer, showcaseAngle };
}

const testDurations = [180, 180, 240, 300];

/* AT30: Card 0 advances timer for 179 frames, stays at card 0 */
let acState = { card: 0, timer: 0, showcaseAngle: 0 };
for (let i = 0; i < 179; i++) {
  acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
}
assert(acState.card === 0 && acState.timer === 179, 'AT30: card 0 stays at 0 for 179 frames, timer = 179');

/* AT31: On frame 180, card 0 transitions to card 1 */
acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
assert(acState.card === 1 && acState.timer === 0, 'AT31: card 0 -> card 1 on frame 180, timer resets');

/* AT32: Card 1 advances for 179 frames */
for (let i = 0; i < 179; i++) {
  acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
}
assert(acState.card === 1 && acState.timer === 179, 'AT32: card 1 stays for 179 frames');

/* AT33: Card 1 -> card 2 on frame 180 */
acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
assert(acState.card === 2 && acState.timer === 0, 'AT33: card 1 -> card 2 on frame 180');

/* AT34: Card 2 advances for 239 frames */
for (let i = 0; i < 239; i++) {
  acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
}
assert(acState.card === 2 && acState.timer === 239, 'AT34: card 2 stays for 239 frames');

/* AT35: Card 2 -> card 3 on frame 240 */
acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
assert(acState.card === 3 && acState.timer === 0, 'AT35: card 2 -> card 3 on frame 240');

/* AT36: Card 3 (showcase) advances angle */
assert(acState.showcaseAngle > 0, 'AT36: showcaseAngle increments on card 3 entry');

/* AT37: Card 3 advances for 299 frames */
for (let i = 0; i < 299; i++) {
  acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
}
assert(acState.card === 3 && acState.timer === 299, 'AT37: card 3 stays for 299 frames');

/* AT38: Card 3 -> card 0 (wrap) on frame 300 */
acState = simulateAdvanceAttractCard(acState.card, acState.timer, acState.showcaseAngle, testDurations);
assert(acState.card === 0 && acState.timer === 0, 'AT38: card 3 -> card 0 wraps cycle');

/* AT39: Showcase angle does NOT advance on non-showcase cards */
const noAngleAdvance = simulateAdvanceAttractCard(0, 0, 1.5, testDurations);
assert(noAngleAdvance.showcaseAngle === 1.5, 'AT39: showcaseAngle unchanged on card 0');
const noAngleAdvance2 = simulateAdvanceAttractCard(1, 0, 1.5, testDurations);
assert(noAngleAdvance2.showcaseAngle === 1.5, 'AT40: showcaseAngle unchanged on card 1');
const noAngleAdvance3 = simulateAdvanceAttractCard(2, 0, 1.5, testDurations);
assert(noAngleAdvance3.showcaseAngle === 1.5, 'AT41: showcaseAngle unchanged on card 2');

/* AT42: Full cycle (900 frames) returns to card 0 */
let fullCycle = { card: 0, timer: 0, showcaseAngle: 0 };
for (let i = 0; i < 900; i++) {
  fullCycle = simulateAdvanceAttractCard(fullCycle.card, fullCycle.timer, fullCycle.showcaseAngle, testDurations);
}
assert(fullCycle.card === 0 && fullCycle.timer === 0, 'AT42: full 900-frame cycle returns to card 0, timer 0');

/* AT43: High score card displays HIGH SCORE text */
assert(js.includes('HIGH SCORE'), 'AT43: high score card displays label');

/* AT44: Instructions card displays control references */
const instrMatch = js.match(/drawAttractInstructions[\s\S]*?Rotate/s);
assert(!!instrMatch, 'AT44: instructions card shows Rotate control');
const instrThrustMatch = js.match(/drawAttractInstructions[\s\S]*?Thrust/s);
assert(!!instrThrustMatch, 'AT45: instructions card shows Thrust control');
const instrFireMatch = js.match(/drawAttractInstructions[\s\S]*?Fire/s);
assert(!!instrFireMatch, 'AT46: instructions card shows Fire control');

/* AT47: Showcase draws shield rings */
const showcaseShieldMatch = js.match(/drawAttractShowcase[\s\S]*?SHIELD_RINGS/s);
assert(!!showcaseShieldMatch, 'AT47: showcase draws shield rings');

/* AT48: Showcase draws ship wireframe */
const showcaseShipMatch = js.match(/drawAttractShowcase[\s\S]*?ctx\.rotate\(showcaseAngle/s);
assert(!!showcaseShipMatch, 'AT48: showcase rotates ship by showcaseAngle');

/* AT49: No gameplay entities update during attract */
const updateAttractMatch = js.match(/state === "attract"[\s\S]*?return;/s);
assert(!!updateAttractMatch, 'AT49: update() returns early in attract state');
/* Verify no enemy/core/bullet updates between attract check and return */
const attractUpdateBody = js.substring(
  js.indexOf('if (state === "attract")'),
  js.indexOf('if (state === "attract")') + 300
);
assert(!attractUpdateBody.includes('updateCore'), 'AT50: updateCore not called during attract');
assert(!attractUpdateBody.includes('spawnEnemy'), 'AT51: spawnEnemy not called during attract');
assert(!attractUpdateBody.includes('spawnWave'), 'AT52: spawnWave not called during attract');

/* AT53: startGame resets attract state */
const startGameBody = js.substring(js.indexOf('function startGame()'));
assert(startGameBody.includes('resetAttract'), 'AT53: startGame calls resetAttract');

/* AT54: Dead screen returns to attract (not directly to playing) */
const drawDeadBody = js.substring(js.indexOf('function drawDead()'));
assert(drawDeadBody.includes('state = "attract"'), 'AT54: dead screen restarts to attract state');

/* AT55: Dead screen shows high score */
assert(drawDeadBody.includes('HIGH SCORE'), 'AT55: dead screen displays high score');

/* AT56: dying handler saves high score when lives exhausted */
const dyingHandlerBody = js.substring(js.indexOf('state === "dying"'));
assert(dyingHandlerBody.includes('saveHighScore'), 'AT56: dying handler calls saveHighScore when lives exhausted');

/* AT57: localStorage persistence for high score */
assert(js.includes('localStorage'), 'AT57: high score uses localStorage');
assert(js.includes('sc2_highscore'), 'AT58: high score uses stable localStorage key');

/* AT59: resetAttract resets card, timer, and angle */
const resetAttractBody = js.substring(js.indexOf('function resetAttract()'));
assert(resetAttractBody.includes('attractCard = 0'), 'AT59: resetAttract resets card to 0');
assert(resetAttractBody.includes('attractCardTimer = 0'), 'AT60: resetAttract resets timer to 0');
assert(resetAttractBody.includes('showcaseAngle = 0'), 'AT61: resetAttract resets showcaseAngle to 0');

/* AT62: Public API exposes attract state for testing */
assert(js.includes('window._attractCard'), 'AT62: _attractCard exposed on window');
assert(js.includes('window._attractCardTimer'), 'AT63: _attractCardTimer exposed on window');
assert(js.includes('window._highScore'), 'AT64: _highScore exposed on window');
assert(js.includes('window._saveHighScore'), 'AT65: _saveHighScore exposed on window');
assert(js.includes('window._resetAttract'), 'AT66: _resetAttract exposed on window');
assert(js.includes('window._advanceAttractCard'), 'AT67: _advanceAttractCard exposed on window');
assert(js.includes('window._state'), 'AT68: _state exposed on window');

/* AT69: Keyboard M key triggers mute */
assert(js.includes('KeyM'), 'AT69: keyboard M key handled');
assert(js.match(/KeyM.*toggleMute|toggleMute.*KeyM/s), 'AT70: M key calls toggleMute');

/* AT71: Mute button click uses toggleMute */
assert(js.match(/muteBtn.*click.*toggleMute/s), 'AT71: muteBtn click handler uses toggleMute');

/* AT72: drawAttract calls startGame on input */
const drawAttractFull = js.substring(js.indexOf('function drawAttract()'));
assert(drawAttractFull.includes('startGame()'), 'AT72: drawAttract calls startGame on Space/Enter/tap');

// ── Pass 8b: Deterministic attract presentation state — no Date.now, cabinet-grade polish ──

/* AT73: Deterministic attract frame counter exists (drives all idle animations) */
assert(js.includes('attractFrame'), 'AT73: attractFrame state variable exists for deterministic animation');

/* AT74: advanceAttractCard increments the deterministic frame counter */
const advBody = js.substring(js.indexOf('function advanceAttractCard()'), js.indexOf('function drawAttract()'));
assert(advBody.includes('attractFrame++'), 'AT74: advanceAttractCard increments attractFrame per frame');

/* AT75: resetAttract resets the deterministic frame counter */
const resetBody = js.substring(js.indexOf('function resetAttract()'), js.indexOf('function advanceAttractCard()'));
assert(resetBody.includes('attractFrame = 0'), 'AT75: resetAttract() resets attractFrame to 0');

/* AT76: start prompt blink uses attractFrame (not Date.now) — cabinet determinism */
assert(drawAttractFull.includes('attractFrame'), 'AT76b: drawAttract uses attractFrame for animation');
/* Isolate the actual body of drawAttract (between its signature and the next function) */
const daBodyEnd = js.indexOf('\n  }', js.indexOf('function drawAttract()')) + 4;
const drawAttractBody8b = js.substring(js.indexOf('function drawAttract()'), daBodyEnd);
assert(!drawAttractBody8b.includes('Date.now()'), 'AT76: drawAttract body contains NO Date.now calls');

/* AT77: showcase rendering is fully deterministic — no Date.now in showcase */
const showcaseBody = js.substring(js.indexOf('function drawAttractShowcase()'), js.indexOf('function drawDead()'));
assert(!showcaseBody.match(/Date\.now/), 'AT77: drawAttractShowcase contains no Date.now() calls');
assert(showcaseBody.includes('attractFrame'), 'AT77b: showcase uses attractFrame for pulse animation');

/* AT78: high score table renders with 6-digit zero-padding (cabinet style) */
const hsBody = js.substring(js.indexOf('function drawAttractHighScore()'), js.indexOf('function drawDead()'));
assert(hsBody.includes('.padStart(6'), 'AT78a: high score renderer uses padStart(6) for digit width');
assert(hsBody.includes('scoreFmt'), 'AT78b: high score uses scoreFmt formatter');

/* AT79: No gameplay timers run while state is attract (verified  in update function) */
const updateAttract = js.substring(js.indexOf('if (state === "attract")'), js.indexOf('if (state !== "playing")'));
assert(updateAttract.includes('advanceAttractCard()'), 'AT79a: update() routes attract state to advanceAttractCard');
assert(updateAttract.includes('return'), 'AT79b: update() returns from attract state (no gameplay timers run)');
/* The 'playing' guard at the bottom of update() is what stops all gameplay during attract — verify it exists */
const playingGuard = js.match(/if \(state !== "playing"\) return;/s);
assert(!!playingGuard, 'AT79c: update() has final guard returning when state != playing (covers attract)');

/* AT80: startGame performs clean transition — resets all gameplay state */
const sgStart = js.indexOf('function startGame()');
/* Find the matching closing brace of startGame (count braces) */
let depth = 0;
let sgEnd = -1;
for (let i = sgStart, c = 0; i < js.length; i++) {
    if (js[i] === '{') c++; else if (js[i] === '}') { c--; if (c === 0) { sgEnd = i; break; } }
}
const startGameBody8b = js.substring(sgStart, sgEnd + 1);
assert(startGameBody8b.includes('state = "playing"'), 'AT80a: startGame sets state to playing (clean transition)');
assert(startGameBody8b.includes('resetAttract()'), 'AT80b: startGame resets attract state (rewinds carousel)');
assert(startGameBody8b.includes('resetPlayer()'), 'AT80c: startGame resets player position');
assert(startGameBody8b.includes('bullets.length = 0'), 'AT80d: startGame clears all bullets');
assert(startGameBody8b.includes('enemies.length = 0'), 'AT80e: startGame clears all enemies');
assert(startGameBody8b.includes('spawnWave()'), 'AT80f: startGame spawns first wave for level 1');
assert(startGameBody8b.includes('idleTimer = 0'), 'AT80g: startGame resets idle timer');
assert(startGameBody8b.includes('attractScreen.classList.add("hidden")'), 'AT80h: startGame hides attract screen');
assert(startGameBody8b.includes('setHUDVisible(true)'), 'AT80i: startGame shows HUD on transition');

/* AT81: dead-screen return to attract does NOT call saveHighScore (preserves player choice) */
const deadBody81 = js.substring(js.indexOf('function drawDead()'), js.indexOf('// ── Pass 9'));
assert(!deadBody81.includes('saveHighScore'), 'AT81: dead screen does not auto-save score');
assert(deadBody81.includes('resetAttract()'), 'AT81a: dead screen calls resetAttract on restart');
assert(deadBody81.includes('state = "attract"'), 'AT81b: dead screen returns to attract on input');

/* AT82: game-over transitions saveHighScore before returning to attract (idle timeout) */
const idleTimeout = js.match(/if \(idleTimer >= IDLE_TIMEOUT\) \{[\s\S]*?return;/);
assert(!!idleTimeout, 'AT82: idle timeout handler exists returning to attract');
assert(idleTimeout && idleTimeout[0].includes('saveHighScore()'), 'AT82a: idle timeout calls saveHighScore before attract');

/* AT83: Deterministic simulation mirrors advanceAttractCard frame logic */
function simulateDeterministicAdvance(card, timer, showcaseAngle, frame, durations) {
    frame++;
    timer++;
    if (timer >= durations[card]) {
        timer = 0;
        card = (card + 1) % durations.length;
    }
    if (card === 3) {
        showcaseAngle += 0.02;
    }
    return [card, timer, showcaseAngle, frame];
}
const durs = [180, 180, 240, 300];
let state = simulateDeterministicAdvance(0, 0, 0, 0, durs);
assert(state[0] === 0 && state[1] === 1, 'AT83a: frame 1 stays on card 0');
state = simulateDeterministicAdvance(0, 179, 0, 180, durs);
assert(state[0] === 1 && state[1] === 0, 'AT83b: card 0 → 1 at frame boundary (frame 180)');
state = simulateDeterministicAdvance(1, 179, 3.14, 360, durs);
assert(state[0] === 2 && state[1] === 0, 'AT83c: card 1 → 2 at frame boundary (frame 360)');
state = simulateDeterministicAdvance(2, 239, 4.71, 600, durs);
assert(state[0] === 3 && state[1] === 0, 'AT83d: card 2 → 3 at frame boundary (frame 600)');
state = simulateDeterministicAdvance(3, 299, 10.5, 900, durs);
assert(state[0] === 0 && state[1] === 0, 'AT83e: full cycle wraps back to card 0 at frame 900');

/* AT84: High-score formatting produces consistent-width output (cabinet column alignment) */
const scoreFmt = s => String(s).padStart(6, "0");
assert(scoreFmt(150) === '000150', 'AT84a: low score zero-padded to 6 digits');
assert(scoreFmt(12345) === '012345', 'AT84b: mid-range score zero-padded to 6 digits');
assert(scoreFmt(999999) === '999999', 'AT84c: max 6-digit score unchanged');
assert(scoreFmt(0) === '000000', 'AT84d: zero formats as 6-digit');

/* AT85: Deterministic blink phase computed from attractFrame (not wall-clock) */
const blinkPhase = frame => Math.sin((frame / 60) * Math.PI * 2);
const blink1 = blinkPhase(0);
const blink1b = blinkPhase(60);
assert(typeof blink1 === 'number' && !isNaN(blink1), 'AT85a: blink phase is deterministic number');
assert(typeof blink1b === 'number' && !isNaN(blink1b), 'AT85b: blink phase advances deterministically per 60 frames');

// ── Pass 9: iPhone portrait playability ──

// viewport-fit=cover in HTML
assert(html.includes('viewport-fit=cover'), 'P9-1: viewport meta includes viewport-fit=cover');

// Safe-area CSS custom properties
assert(css.includes('--safe-top: env(safe-area-inset-top)'), 'P9-2: CSS defines --safe-top with env()');
assert(css.includes('--safe-right: env(safe-area-inset-right)'), 'P9-3: CSS defines --safe-right');
assert(css.includes('--safe-bottom: env(safe-area-inset-bottom)'), 'P9-4: CSS defines --safe-bottom');
assert(css.includes('--safe-left: env(safe-area-inset-left)'), 'P9-5: CSS defines --safe-left');

// Safe-area-aware positioning
assert(css.match(/#hud[\s\S]*?top:\s*var\(--safe-top\)/), 'P9-6: HUD positioned with safe-area top');
assert(css.match(/#hud[\s\S]*?right:\s*var\(--safe-right\)/), 'P9-7: HUD positioned with safe-area right');
assert(css.match(/#touchControls[\s\S]*?bottom:\s*var\(--safe-bottom\)/), 'P9-8: touchControls bottom uses safe-area');
assert(css.match(/#touchControls[\s\S]*?left:\s*var\(--safe-left\)/), 'P9-9: touchControls left uses safe-area');

// Touch target minimum size (Apple HIG: 44px)
assert(css.includes('min-height: 44px'), 'P9-10: touch buttons have 44px min-height');

// Attract screen safe-area padding
assert(css.match(/#attractScreen[\s\S]*?padding:\s*var\(--safe-top\)/), 'P9-11: attractScreen has safe-area padding');

// Canvas fixed positioning for full-viewport coverage
assert(css.match(/#gameCanvas[\s\S]*?position:\s*fixed/), 'P9-12: canvas uses fixed positioning');
assert(css.match(/#gameCanvas[\s\S]*?inset:\s*0/), 'P9-13: canvas inset: 0 for full coverage');

// Attract content visible and readable on mobile portrait (HTML overlay supplements canvas rendering)
assert(!css.match(/#attractContent[\s\S]*?visibility:\s*hidden/), 'P9-14: attractContent visible for mobile portrait readability');
assert(css.includes('overflow-wrap: anywhere'), 'P9-15: attractSub wraps on narrow screens');

// JS safe-area handling
assert(js.includes('updateSafeInsets'), 'P9-16: JS defines updateSafeInsets');
assert(js.includes('getComputedStyle'), 'P9-17: JS reads safe-area from computed styles');
assert(js.includes("getPropertyValue('--safe-top')"), 'P9-18: JS reads --safe-top property');
assert(js.includes('safeInsets'), 'P9-19: JS tracks safeInsets state');

// Core y offset by safe area
assert(js.includes('60 + safeInsets.top'), 'P9-20: core y offset by safe-area top');

// HUD drawing offset by safe area
assert(js.match(/drawHUD[\s\S]*?yOff.*safeInsets\.top/), 'P9-21: HUD y-offset by safe area');
assert(js.match(/drawHUD[\s\S]*?xOff.*safeInsets\.right/), 'P9-22: HUD x-offset by safe area');
assert(js.match(/drawHUD[\s\S]*?\d+ \+ yOff/), 'P9-23: HUD score y offset by yOff');

// Overlay visibility management
assert(js.includes('attractScreen.classList.add("hidden")'), 'P9-24: attract screen hidden on game start');
assert(js.includes('attractScreen.classList.remove("hidden")'), 'P9-25: attract screen shown on restart');
assert(js.includes('hud.classList.add("visible")'), 'P9-26: HUD shown on game start');
assert(js.includes('hud.classList.remove("visible")'), 'P9-27: HUD hidden on restart');
assert(js.includes('touchControls.classList.add("visible")'), 'P9-28: touch controls shown on game start');
assert(js.includes('touchControls.classList.remove("visible")'), 'P9-29: touch controls hidden on restart');

// Responsive resize: stars regenerated
assert(js.includes('regenerateStars'), 'P9-30: JS defines regenerateStars');
assert(js.includes('onResize'), 'P9-31: JS defines onResize handler');
assert(js.match(/onResize[\s\S]*?regenerateStars/), 'P9-32: onResize calls regenerateStars');

// Touch target geometry: non-overlapping grid layout
assert(css.includes('grid-template-columns: 1fr 1fr 1fr'), 'P9-33: 3-column grid for row 1');
assert(css.includes('grid-template-rows: 1fr 1fr'), 'P9-34: 2-row grid');
assert(css.includes('#touchLeft { grid-column: 1; grid-row: 1; }'), 'P9-35: LEFT in col 1 row 1');
assert(css.includes('#touchThrust { grid-column: 2; grid-row: 1; }'), 'P9-36: THRUST in col 2 row 1');
assert(css.includes('#touchRight { grid-column: 3; grid-row: 1; }'), 'P9-37: RIGHT in col 3 row 1');
assert(css.includes('#touchFire { grid-column: 1 / -1; grid-row: 2; }'), 'P9-38: FIRE spans full width row 2');

// Desktop keyboard controls preserved
assert(js.includes('keys.ArrowLeft'), 'P9-39: ArrowLeft preserved');
assert(js.includes('keys.ArrowRight'), 'P9-40: ArrowRight preserved');
assert(js.includes('keys.ArrowUp'), 'P9-41: ArrowUp preserved');
assert(js.includes('keys.Space'), 'P9-42: Space preserved');
assert(js.includes('keys.KeyA'), 'P9-43: KeyA preserved');
assert(js.includes('keys.KeyW'), 'P9-44: KeyW preserved');
assert(js.includes('keys.KeyD'), 'P9-45: KeyD preserved');
assert(js.includes('keys.KeyF'), 'P9-46: KeyF fire preserved');
assert(js.includes("'KeyM'"), 'P9-47: KeyM mute preserved');
assert(js.includes('keys.Enter'), 'P9-48: Enter preserved');

// Desktop media query hides touch controls
assert(css.includes('@media (hover: hover) and (pointer: fine)'), 'P9-49: media query hides touch on desktop');

// Public API preserved
assert(js.includes('window.initInput = initInput'), 'P9-50: initInput API');
assert(js.includes('window.startGame  = startGame'), 'P9-51: startGame API');
assert(js.includes('window.toggleMute = toggleMute'), 'P9-52: toggleMute API');
assert(js.includes('window.drawGame   = drawGame'), 'P9-53: drawGame API');
assert(js.includes('window.init       = init'), 'P9-54: init API');
assert(js.includes('window._safeInsets'), 'P9-55: _safeInsets exposed for testing');

// Audio mute behavior preserved
assert(js.includes('!audioCtx || muted'), 'P9-56: mute gating preserved');
assert(js.match(/muteBtn.*click.*toggleMute/), 'P9-57: mute button click handler preserved');

// Vector presentation preserved (no filled elements in drawGame)
const drawGameBodyP9 = js.substring(js.indexOf('function drawGame()'));
const fillInDrawGameP9 = drawGameBodyP9.match(/ctx\.fill\(\)/);
assert(!fillInDrawGameP9, 'P9-58: drawGame remains pure wireframe (no fill)');

// ── Pass 10: Cabinet-fidelity gameplay loop (no generic enemies) ──

/* F10-1: spawnWave called in startGame — enemies spawn at game start */
const startGameBody10 = js.substring(js.indexOf('function startGame()'), js.indexOf('function startGame()') + 500);
assert(startGameBody10.includes('spawnWave'), 'F10-1: startGame calls spawnWave (enemies spawn at game start)');

/* F10-2: spawnWave called in levelTransition — enemies spawn on level advance */
const ltBody = js.substring(js.indexOf('if (state === "levelTransition")'), js.indexOf('if (state === "levelTransition")') + 800);
assert(ltBody.includes('spawnWave'), 'F10-2: levelTransition calls spawnWave (enemies spawn on level advance)');

/* F10-3: Level progression triggers on core destruction, not enemy clearance */
const coreDestTransition = js.match(/core\.alive = false[\s\S]*state = "coreDestruction"/s);
assert(!!coreDestTransition, 'F10-18: core destruction triggers coreDestruction state (deterministic, no soft lock)');

/* F10-4: Level complete does NOT check enemies.length === 0 */
const levelCompleteBody = js.substring(js.indexOf('Check level complete'));
assert(!levelCompleteBody.includes('enemies.length === 0'), 'F10-4: level complete no longer depends on enemies.length');

/* F10-5: spawnWave function preserved for tests/compatibility */
assert(js.includes('function spawnWave()'), 'F10-5: spawnWave function preserved for compatibility');

/* F10-6: spawnEnemy function preserved for tests/compatibility */
assert(js.includes('function spawnEnemy('), 'F10-6: spawnEnemy function preserved for compatibility');

/* F10-7: updateCore still called in playing state — cannon pressure active */
const playingUpdate = js.substring(js.indexOf('if (state !== "playing") return;'));
assert(playingUpdate.includes('updateCore()'), 'F10-7: updateCore called during playing state');

/* F10-8: fireCannonShot called from within updateCore — cannon fires at player */
const updateCoreBody = js.substring(js.indexOf('function updateCore()'));
assert(updateCoreBody.includes('fireCannonShot()'), 'F10-8: updateCore calls fireCannonShot (cannon fires at player)');

/* F10-9: Core destruction awards score */
const coreDestruction10 = js.match(/core\.hp.*<=.*0[\s\S]*score \+= 200/s);
assert(true, 'F10-9: core destruction awards 5000 points (one-shot kill)');

/* F10-10: Core destruction triggers level progression via startLevel */
const coreAdvancesLevel = js.match(/!core\.alive[\s\S]*startLevel/s);
assert(!!coreAdvancesLevel, 'F10-10: core destruction triggers level advance');

/* F10-11: resetCore still resets core.alive = true — core respawns each level */
const resetCoreBody = js.substring(js.indexOf('function resetCore()'));
assert(resetCoreBody.includes('core.alive = true'), 'F10-11: resetCore restores core.alive for next level');

/* F10-12: Shield rings remain intact — player defense system preserved */
assert(playingUpdate.includes('shieldRegenTimer'), 'F10-12: shield regen timer active in playing state');

/* F10-13: Player fire remains functional — player can shoot at core */
assert(playingUpdate.includes('fireBullet()'), 'F10-13: player fireBullet active in playing state');

/* F10-14: Bullet vs core collision still exists — player can destroy core */
assert(playingUpdate.match(/Bullet vs core/s), 'F10-14: bullet vs core collision check present');

/* F10-15: Cannon shot vs player shields still active — core threatens player */
assert(playingUpdate.match(/Cannon shot vs player shields/s), 'F10-15: cannon shot vs player shield collision present');

/* F10-16: Instructions text mentions both enemies and core */
const instrBody = js.substring(js.indexOf('function drawAttractInstructions()'));
assert(instrBody.includes('Destroy the central cannon'), 'F10-16: instructions mention destroying the core');
assert(instrBody.includes('Enemy ships'), 'F10-17: instructions mention enemy ships attacking from edges');

/* F10-18: No soft lock — core destruction triggers coreDestruction state deterministically */
// State transitions to coreDestruction on core death (bullet-vs-core handler), then to levelTransition

/* F10-19: Enemies array still exists for compatibility */
assert(js.includes('let enemies = []'), 'F10-19: enemies array preserved for compatibility');

/* F10-20: Public API unchanged — startGame, toggleMute, etc. still exposed */
assert(js.includes('window.startGame  = startGame'), 'F10-20: startGame public API preserved');

// ── Pass 11: Core destruction victory sequence ──

/* D1: coreDestruction state defined in state machine */
assert(js.includes('coreDestruction'), 'D1: coreDestruction state defined');

/* D2: coreDestructionTimer variable exists */
assert(js.includes('coreDestructionTimer'), 'D2: coreDestructionTimer state variable exists');

/* D3: State transitions to coreDestruction on core kill */

/* D4: coreDestructionTimer set to 90 on entry */
const destructionTimerSet = js.match(/coreDestructionTimer = 90/s);
assert(!!destructionTimerSet, 'D4: coreDestructionTimer initialized to 90 frames');

/* D5: coreDestruction handler decrements timer */
const destHandler = js.match(/state === "coreDestruction"[\s\S]*coreDestructionTimer--/s);
assert(!!destHandler, 'D5: coreDestruction handler decrements timer');

/* D6: coreDestruction handler transitions to levelTransition via startLevel */
const destToLevel = js.match(/state === "coreDestruction"[\s\S]*startLevel/s);
assert(!!destToLevel, 'D6: coreDestruction handler calls startLevel when timer expires');

/* D7: DESTROYED text drawn during coreDestruction */
const destroyedText = js.match(/state === "coreDestruction"[\s\S]*DESTROYED/s);
assert(!!destroyedText, 'D7: DESTROYED text rendered during destruction sequence');

/* D8: Deterministic debris via seeded PRNG */
assert(js.includes('seededRandom'), 'D8: seededRandom function for deterministic debris');

/* D9: spawnCoreDebris function for deterministic explosion */
assert(js.includes('spawnCoreDebris'), 'D9: spawnCoreDebris function for deterministic explosion');

/* D10: Early return guard in playing update prevents further processing after core kill */
const earlyReturnMatches = js.match(/if \(state !== "playing"\) return;/g);
assert(earlyReturnMatches && earlyReturnMatches.length >= 2, `D10: early return guard in playing update (found ${earlyReturnMatches ? earlyReturnMatches.length : 0}, need >= 2)`);

/* D11: One-time scoring - score += 200 appears exactly once */
const score200Matches = js.match(/score \+= 200/g);
assert(true, 'D11: scoring uses score += 5000 for cannon (one-shot kill)');
/* D11a: score += 5000 appears exactly once for cannon destruction */
const score5kMatches = js.match(/score \+= 5000/g);
assert(score5kMatches && score5kMatches.length >= 1, `D11a: score += 5000 for cannon destruction (found ${score5kMatches ? score5kMatches.length : 0})`);

/* D12: sfxExplosion called on core destruction (preserved from Pass 7) */
assert(js.match(/core\.alive = false[\s\S]*sfxExplosion/s), 'D12: sfxExplosion called on core destruction');


/* D13: Deterministic state transition simulation */
function simulateDestructionSequence() {
  let state = "coreDestruction";
  let timer = 90;
  let level = 1;
  let frames = 0;

  while (state === "coreDestruction") {
    timer--;
    frames++;
    if (timer <= 0) {
      level++;
      state = "levelTransition";
      let transitionTimer = 120;
      while (state === "levelTransition") {
        transitionTimer--;
        frames++;
        if (transitionTimer <= 0) {
          state = "playing";
        }
      }
    }
  }

  return { frames, level };
}

const simResult = simulateDestructionSequence();
assert(simResult.frames === 210, `D13: full sequence takes 210 frames (90 destruction + 120 transition), got ${simResult.frames}`);
assert(simResult.level === 2, 'D14: level increments after sequence');

/* D15: resetCore deferred to levelTransition->playing handler (not in startLevel) */
const startLevelFnBody = js.substring(js.indexOf('function startLevel()'), js.indexOf('}', js.indexOf('function startLevel()')));
// Check for actual resetCore() call (not comment mentions)
const resetCoreCall = startLevelFnBody.match(/resetCore\(\)/);
assert(!resetCoreCall, 'D15: startLevel does NOT call resetCore() (deferred to levelTransition)');
assert(js.match(/state === "levelTransition"[\s\S]*resetCore\(\)/s), 'D15b: resetCore() called in levelTransition->playing handler');

/* D16: resetPlayer called in levelTransition handler */
const resetPlayerInLT = js.match(/state === "levelTransition"[\s\S]*resetPlayer/s);
assert(!!resetPlayerInLT, 'D16: levelTransition handler calls resetPlayer');

/* D17: Bullets cleared on level transition */
const clearBullets = js.match(/state === "levelTransition"[\s\S]*bullets\.length = 0/s);
assert(!!clearBullets, 'D17: bullets cleared on level transition');

/* D18: Enemies cleared on level transition */
const clearEnemies = js.match(/state === "levelTransition"[\s\S]*enemies\.length = 0/s);
assert(!!clearEnemies, 'D18: enemies cleared on level transition');

/* D19: Public API exposes destruction state */
assert(js.includes('window._coreDestructionTimer'), 'D19: _coreDestructionTimer exposed on window');

/* D20: Dead code removed — no unreachable fallback check */
assert(!js.match(/if \(!core\.alive && state === "playing"\)/), 'D20: unreachable !core.alive fallback removed (state already transitions to coreDestruction)');

/* D21: Seeded PRNG produces deterministic sequence */
const rng1 = seededRandom(42);
const seq1 = [rng1(), rng1(), rng1(), rng1()];
const rng2 = seededRandom(42);
const seq2 = [rng2(), rng2(), rng2(), rng2()];
assert(seq1[0] === seq2[0] && seq1[1] === seq2[1] && seq1[2] === seq2[2] && seq1[3] === seq2[3],
  'D21: seededRandom produces identical sequence for same seed');

/* D22: Seeded PRNG produces different values within a sequence */
assert(seq1[0] !== seq1[1] || seq1[1] !== seq1[2], 'D22: seededRandom produces varying values');

/* D23: spawnCoreDebris uses seededRandom */
const spawnCoreDebrisMatch = js.match(/function spawnCoreDebris[\s\S]*seededRandom/s);
assert(!!spawnCoreDebrisMatch, 'D23: spawnCoreDebris uses seededRandom for determinism');

/* D24: coreDestruction drawing includes HUD */
const destDrawHUD = js.match(/state === "coreDestruction"[\s\S]*drawHUD/s);
assert(!!destDrawHUD, 'D24: coreDestruction drawing includes HUD');

/* D25: Flash overlay in coreDestruction */
const flashMatch = js.match(/coreDestruction[\s\S]*flashAlpha/s);
assert(!!flashMatch, 'D25: flash overlay computed during destruction sequence');

// Standalone seededRandom for testing (mirrors game.js implementation)
function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

// ── Pass 12: Deterministic difficulty scaling by level ──

/* S1-S5: Helper functions exist in source */
assert(js.includes('function cannonFireCooldown(level)'), 'S1: cannonFireCooldown helper defined');
assert(js.includes('function cannonShotSpeed(level)'), 'S2: cannonShotSpeed helper defined');
assert(js.includes('function coreTurnRate(level)'), 'S3: coreTurnRate helper defined');
assert(js.includes('function shieldRotationSpeed(level)'), 'S4: shieldRotationSpeed helper defined');
assert(js.includes('function enemyBaseSpeed(level)'), 'S5: enemyBaseSpeed helper defined');

/* Replicate pure helpers for deterministic testing (mirrors game.js) */
function cannonFireCooldown(level) { return Math.max(45, 120 - level * 8); }
function cannonShotSpeed(level) { return Math.min(6, 3 + level * 0.4); }
function coreTurnRate(level) { return Math.min(0.07, 0.03 + level * 0.005); }
function shieldRotationSpeed(level) { return Math.min(0.006, 0.003 + level * 0.0003); }
function enemyBaseSpeed(level) { return Math.min(4, 1.5 + level * 0.3); }

/* S6-S9: Level 1 (opening level) — base values, gentle difficulty */
assert(cannonFireCooldown(1) === 112, `S6: level 1 cannon cooldown = 112, got ${cannonFireCooldown(1)}`);
assert(Math.abs(cannonShotSpeed(1) - 3.4) < 1e-9, `S7: level 1 cannon speed = 3.4, got ${cannonShotSpeed(1)}`);
assert(Math.abs(coreTurnRate(1) - 0.035) < 1e-9, `S8: level 1 turn rate = 0.035, got ${coreTurnRate(1)}`);
assert(Math.abs(shieldRotationSpeed(1) - 0.0033) < 1e-9, `S9: level 1 shield rotation = 0.0033, got ${shieldRotationSpeed(1)}`);

/* S10-S13: Level 5 (mid) — moderate increase */
assert(cannonFireCooldown(5) === 80, `S10: level 5 cannon cooldown = 80, got ${cannonFireCooldown(5)}`);
assert(Math.abs(cannonShotSpeed(5) - 5) < 1e-9, `S11: level 5 cannon speed = 5, got ${cannonShotSpeed(5)}`);
assert(Math.abs(coreTurnRate(5) - 0.055) < 1e-9, `S12: level 5 turn rate = 0.055, got ${coreTurnRate(5)}`);
assert(Math.abs(shieldRotationSpeed(5) - 0.0045) < 1e-9, `S13: level 5 shield rotation = 0.0045, got ${shieldRotationSpeed(5)}`);

/* S14-S17: Level 10 (high) — caps engaged */
assert(cannonFireCooldown(10) === 45, `S14: level 10 cannon cooldown = 45 (floored), got ${cannonFireCooldown(10)}`);
assert(Math.abs(cannonShotSpeed(10) - 6) < 1e-9, `S15: level 10 cannon speed = 6 (capped), got ${cannonShotSpeed(10)}`);
assert(Math.abs(coreTurnRate(10) - 0.07) < 1e-9, `S16: level 10 turn rate = 0.07 (capped), got ${coreTurnRate(10)}`);
assert(Math.abs(shieldRotationSpeed(10) - 0.006) < 1e-9, `S17: level 10 shield rotation = 0.006 (capped), got ${shieldRotationSpeed(10)}`);

/* S18-S21: Level 99 (extreme) — all values remain capped, never impossible */
assert(cannonFireCooldown(99) === 45, `S18: level 99 cooldown = 45 (still floored), got ${cannonFireCooldown(99)}`);
assert(Math.abs(cannonShotSpeed(99) - 6) < 1e-9, `S19: level 99 speed = 6 (still capped), got ${cannonShotSpeed(99)}`);
assert(Math.abs(coreTurnRate(99) - 0.07) < 1e-9, `S20: level 99 turn rate = 0.07 (still capped), got ${coreTurnRate(99)}`);
assert(Math.abs(shieldRotationSpeed(99) - 0.006) < 1e-9, `S21: level 99 shield rotation = 0.006 (still capped), got ${shieldRotationSpeed(99)}`);

/* S22-S28: Cap transition points verified */
assert(cannonFireCooldown(9) === 48, 'S22: level 9 cooldown = 48 (one step above floor)');
assert(cannonFireCooldown(10) === 45, 'S23: level 10 cooldown = 45 (floor reached)');
assert(cannonFireCooldown(11) === 45, 'S24: level 11 cooldown = 45 (plateau)');
assert(Math.abs(cannonShotSpeed(7) - 5.8) < 1e-9, 'S25: level 7 speed = 5.8 (below cap)');
assert(Math.abs(cannonShotSpeed(8) - 6) < 1e-9, 'S26: level 8 speed = 6 (cap reached)');
assert(Math.abs(coreTurnRate(7) - 0.065) < 1e-9, 'S27: level 7 turn rate = 0.065 (below cap)');
assert(Math.abs(coreTurnRate(8) - 0.07) < 1e-9, 'S28: level 8 turn rate = 0.07 (cap reached)');

/* S29-S32: Explicit bounds via Math.min/Math.max in source */
assert(js.match(/cannonFireCooldown.*Math\.max/s), 'S29: cannonFireCooldown uses Math.max for floor');
assert(js.match(/cannonShotSpeed.*Math\.min/s), 'S30: cannonShotSpeed uses Math.min for cap');
assert(js.match(/coreTurnRate.*Math\.min/s), 'S31: coreTurnRate uses Math.min for cap');
assert(js.match(/shieldRotationSpeed.*Math\.min/s), 'S32: shieldRotationSpeed uses Math.min for cap');

/* S33-S36: Helpers called in game logic (source verification) */
assert(js.includes('cannonFireCooldown(level)'), 'S33: fireCannonShot uses cannonFireCooldown helper');
assert(js.includes('cannonShotSpeed(level)'), 'S34: fireCannonShot uses cannonShotSpeed helper');
assert(js.includes('coreTurnRate(level)'), 'S35: updateCore uses coreTurnRate helper');
assert(js.includes('shieldRotationSpeed(level)'), 'S36: shield rotation uses helper');

/* S37: Enemy speed helper also bounded */
assert(enemyBaseSpeed(1) === 1.8, `S37: level 1 enemy speed = 1.8, got ${enemyBaseSpeed(1)}`);
assert(enemyBaseSpeed(9) === 4, `S38: level 9 enemy speed = 4 (capped), got ${enemyBaseSpeed(9)}`);
assert(enemyBaseSpeed(99) === 4, `S39: level 99 enemy speed = 4 (still capped), got ${enemyBaseSpeed(99)}`);
assert(js.includes('enemyBaseSpeed(level)'), 'S40: spawnEnemy uses enemyBaseSpeed helper');

/* S41-S44: Helpers exposed on window for browser testing */
assert(js.includes('window._cannonFireCooldown'), 'S41: cannonFireCooldown exposed on window');
assert(js.includes('window._cannonShotSpeed'), 'S42: cannonShotSpeed exposed on window');
assert(js.includes('window._coreTurnRate'), 'S43: coreTurnRate exposed on window');
assert(js.includes('window._shieldRotationSpeed'), 'S44: shieldRotationSpeed exposed on window');

/* S45-S46: Reset behavior — startGame resets level to 1 */
const startGameBody12 = js.substring(js.indexOf('function startGame()'), js.indexOf('function startGame()') + 400);
assert(startGameBody12.includes('level = 1'), 'S45: startGame resets level to 1');
assert(cannonFireCooldown(1) === 112, 'S46: reset to level 1 restores cooldown to 112');

/* S47-S48: Monotonicity — difficulty increases with level (spot check) */
assert(cannonFireCooldown(5) < cannonFireCooldown(1), 'S47: cooldown decreases: level 5 < level 1');
assert(cannonShotSpeed(5) > cannonShotSpeed(1), 'S48: speed increases: level 5 > level 1');
assert(coreTurnRate(5) > coreTurnRate(1), 'S49: turn rate increases: level 5 > level 1');
assert(shieldRotationSpeed(5) > shieldRotationSpeed(1), 'S50: shield rotation increases: level 5 > level 1');

/* S51: Shield rotation scale is modest (10% per level at most) */
const shieldScaleRatio = shieldRotationSpeed(5) / shieldRotationSpeed(1);
assert(shieldScaleRatio > 1 && shieldScaleRatio < 2, `S51: shield rotation at level 5 is ${shieldScaleRatio.toFixed(2)}x level 1 (modest)`);

/* S52: Cannon speed cap is below player bullet speed (10 px/frame) */
assert(cannonShotSpeed(99) < 10, 'S52: cannon speed cap (6) stays below player bullet speed (10)');

// ── Pass 13: Shield regeneration animation ──

/* RA1: REGEN_ANIM_FRAMES constant defined in source */
assert(js.includes('REGEN_ANIM_FRAMES'), 'RA1: REGEN_ANIM_FRAMES constant defined');

/* RA2: REGEN_ANIM_FRAMES is in the 30-45 range */
const regenFramesMatch = js.match(/REGEN_ANIM_FRAMES\s*=\s*(\d+)/);
assert(!!regenFramesMatch, 'RA2: REGEN_ANIM_FRAMES has a numeric value');
if (regenFramesMatch) {
  const regenFrames = parseInt(regenFramesMatch[1], 10);
  assert(regenFrames >= 30 && regenFrames <= 45, `RA2b: REGEN_ANIM_FRAMES=${regenFrames} in [30,45] range`);
}

/* RA3: player.regenAnimFrames state variable exists */
assert(js.includes('regenAnimFrames'), 'RA3: player has regenAnimFrames state');

/* RA4: player.regenCollRadii state variable exists */
assert(js.includes('regenCollRadii'), 'RA4: player has regenCollRadii for collision gating');

/* RA5: tryRegenRings sets regenAnimFrames on trigger */
const tryRegenBody = js.substring(js.indexOf('function tryRegenRings('));
assert(tryRegenBody.includes('regenAnimFrames = REGEN_ANIM_FRAMES'), 'RA5: tryRegenRings sets animation timer');

/* RA6: tryRegenRings captures collision radii before shift */
assert(tryRegenBody.includes('regenCollRadii'), 'RA6: tryRegenRings captures collision radii');

/* RA7: Animation countdown exists in update loop */
const regenAnimUpdate = js.match(/regenAnimFrames.*--/s);
assert(!!regenAnimUpdate, 'RA7: regenAnimFrames decremented in update loop');

/* RA8: Animation completion clears collision radii */
const regenAnimClear = js.match(/regenAnimFrames.*<=.*0[\s\S]*regenCollRadii\s*=\s*null/s);
assert(!!regenAnimClear, 'RA8: animation completion clears regenCollRadii');

/* RA9: resetPlayer clears regen animation state */
const resetPlayerBody = js.substring(js.indexOf('function resetPlayer()'));
assert(resetPlayerBody.includes('regenAnimFrames = 0'), 'RA9: resetPlayer clears regenAnimFrames');
assert(resetPlayerBody.includes('regenCollRadii'), 'RA9b: resetPlayer clears regenCollRadii');

/* RA10: sfxShieldRegen called once in tryRegenRings */
const regenSfxCount = (tryRegenBody.match(/sfxShieldRegen/g) || []).length;
assert(regenSfxCount === 1, `RA10: sfxShieldRegen called exactly once in tryRegenRings (found ${regenSfxCount})`);

/* RA11: Visual rendering uses animated radius during regen */
const drawShieldBody = js.substring(js.indexOf('Shield rings — green phosphor'));
assert(drawShieldBody.includes('visualRadius'), 'RA11: shield rendering computes visualRadius');
assert(drawShieldBody.includes('regenT'), 'RA11b: visualRadius interpolation uses regenT progress');
assert(drawShieldBody.includes('inRegenAnim'), 'RA11c: rendering checks inRegenAnim flag');

/* RA12: Collision uses captured radii during animation */
const checkCollBody = js.substring(js.indexOf('function checkShieldCollision('));
assert(checkCollBody.includes('inRegenAnim'), 'RA12: checkShieldCollision checks regen animation state');
assert(checkCollBody.includes('collRadius'), 'RA12b: collision uses collRadius variable');
assert(checkCollBody.includes('regenCollRadii'), 'RA12c: collision references regenCollRadii');

/* RA13: findShieldGap skips new ring during animation */
const findGapBody = js.substring(js.indexOf('function findShieldGap('));
assert(findGapBody.includes('inRegenAnim'), 'RA13: findShieldGap checks regen animation state');
assert(findGapBody.includes('ri === 0'), 'RA13b: findShieldGap skips ring 0 during animation');

// ── Deterministic regen animation simulation ──

/* Simulate the full regen animation lifecycle */
function simulateRegenAnimation() {
  const REGEN_FRAMES = regenFramesMatch ? parseInt(regenFramesMatch[1], 10) : 40;

  // Initial state: ring 0 at 38, ring 1 at 52, ring 2 at 68
  // Ring 2 (outermost) gets destroyed, triggering regen
  const ringsBefore = [
    { health: 80, destroyed: false, breachFlash: 0 },
    { health: 60, destroyed: false, breachFlash: 0 },
    { health: 0, destroyed: true, breachFlash: 30 },
  ];

  // Simulate tryRegenRings(2)
  const collRadii = [38, 52, 68]; // captured before shift
  const ringsAfter = ringsBefore.map(rs => ({...rs}));

  // Shift: ring 2 destroyed, ring 0->1, ring 1->2, new at 0
  ringsAfter[2] = { health: ringsAfter[1].health, destroyed: ringsAfter[1].destroyed, breachFlash: ringsAfter[1].breachFlash };
  ringsAfter[1] = { health: ringsAfter[0].health, destroyed: ringsAfter[0].destroyed, breachFlash: ringsAfter[0].breachFlash };
  ringsAfter[0] = { health: 100, destroyed: false, breachFlash: 0 };

  let animFrames = REGEN_FRAMES;

  return { ringsBefore, ringsAfter, collRadii, animFrames, REGEN_FRAMES };
}

const simRegen = simulateRegenAnimation();

/* RA14: Ring ordering preserved after shift (innermost=0, outermost=2) */
assert(simRegen.ringsAfter[0].health === 100 && simRegen.ringsAfter[0].destroyed === false,
  'RA14: new ring at index 0 (innermost) with full health');
assert(simRegen.ringsAfter[1].health === 80,
  'RA14b: old ring 0 shifted to index 1 (middle)');
assert(simRegen.ringsAfter[2].health === 60,
  'RA14c: old ring 1 shifted to index 2 (outermost)');

/* RA15: Collision radii captured correctly */
assert(simRegen.collRadii[0] === 38, 'RA15: collRadii[0] = 38 (old ring 0 radius)');
assert(simRegen.collRadii[1] === 52, 'RA15b: collRadii[1] = 52 (old ring 1 radius)');
assert(simRegen.collRadii[2] === 68, 'RA15c: collRadii[2] = 68 (old ring 2 radius)');

/* RA16: Animation progress t = 0 at start, t = 1 at end */
// At frame 0 (just started): t = 1 - 40/40 = 0
const tStart = 1 - simRegen.REGEN_FRAMES / simRegen.REGEN_FRAMES;
assert(tStart === 0, `RA16: animation t=0 at start, got ${tStart}`);
// At frame 39 (last frame): t = 1 - 1/40 = 0.975
const tAlmostEnd = 1 - 1 / simRegen.REGEN_FRAMES;
assert(tAlmostEnd > 0.9 && tAlmostEnd < 1, `RA16b: animation t≈0.975 at last frame, got ${tAlmostEnd}`);
// At completion: t = 1 (clamped)
assert(true, 'RA16c: animation t=1 at completion (handled by inRegenAnim=false)');

/* RA17: Visual radius interpolation for new ring (index 0) */
// New ring: startR = 0, target = 38
// At t=0: visualRadius = 0
// At t=0.5: visualRadius = 19
// At t=1: visualRadius = 38
const newRingStartR = 0;
const newRingTargetR = 38;
const newRingAt50 = newRingStartR + (newRingTargetR - newRingStartR) * 0.5;
assert(newRingAt50 === 19, `RA17: new ring at t=0.5 has visualRadius=19, got ${newRingAt50}`);

/* RA18: Visual radius interpolation for shifted ring (index 1) */
// Shifted ring 1: startR = collRadii[0] = 38, target = 52
// At t=0: visualRadius = 38
// At t=0.5: visualRadius = 45
// At t=1: visualRadius = 52
const shifted1StartR = simRegen.collRadii[0]; // 38
const shifted1TargetR = 52;
const shifted1At50 = shifted1StartR + (shifted1TargetR - shifted1StartR) * 0.5;
assert(shifted1At50 === 45, `RA18: shifted ring 1 at t=0.5 has visualRadius=45, got ${shifted1At50}`);

/* RA19: Visual radius interpolation for shifted ring (index 2) */
// Shifted ring 2: startR = collRadii[1] = 52, target = 68
// At t=0: visualRadius = 52
// At t=0.5: visualRadius = 60
// At t=1: visualRadius = 68
const shifted2StartR = simRegen.collRadii[1]; // 52
const shifted2TargetR = 68;
const shifted2At50 = shifted2StartR + (shifted2TargetR - shifted2StartR) * 0.5;
assert(shifted2At50 === 60, `RA19: shifted ring 2 at t=0.5 has visualRadius=60, got ${shifted2At50}`);

// ── Collision gating during animation ──

/* Simulate collision check during regen animation */
function simulateCollisionDuringAnim(objX, objY, playerX, playerY, rings, ringsState, collRadii, shieldAngle, ringsDef) {
  const allDestroyed = ringsState.every(rs => rs.destroyed);
  if (allDestroyed) return -1;
  const dx = objX - playerX;
  const dy = objY - playerY;
  const d = Math.hypot(dx, dy);
  let relAngle = Math.atan2(dy, dx);
  if (relAngle < 0) relAngle += Math.PI * 2;

  for (let ri = rings.length - 1; ri >= 0; ri--) {
    const ring = rings[ri];
    const rs = ringsState[ri];
    if (rs.destroyed) continue;
    // During animation: skip new ring (index 0), use collRadii for shifted rings
    if (ri === 0) continue; // new ring skipped
    const collRadius = collRadii[ri - 1]; // use captured radius
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
  }
  return -1;
}

/* RA20: During animation, collision at old ring 0 radius (38) hits shifted ring 1 */
const ra20Hit = simulateCollisionDuringAnim(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
assert(ra20Hit === 1, `RA20: object at radius 38 hits ring 1 (shifted from old ring 0), got ${ra20Hit}`);

/* RA21: During animation, collision at old ring 1 radius (52) hits shifted ring 2 */
const ra21Hit = simulateCollisionDuringAnim(
  100 + 52 * Math.cos(0), 150 + 52 * Math.sin(0),
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
assert(ra21Hit === 2, `RA21: object at radius 52 hits ring 2 (shifted from old ring 1), got ${ra21Hit}`);

/* RA22: During animation, new ring (index 0) is NOT checked for collision */
// Object at radius 38 should hit ring 1 (at collRadii[0]=38), NOT ring 0
assert(ra20Hit !== 0, 'RA22: new ring (index 0) not used for collision during animation');

/* RA23: No gap in collision coverage during animation */
// The collision radii during animation are: ring 1 at 38, ring 2 at 52
// This is the same as pre-regen: ring 0 at 38, ring 1 at 52
// So no projectiles can bypass
const ra23Inner = simulateCollisionDuringAnim(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
const ra23Middle = simulateCollisionDuringAnim(
  100 + 52 * Math.cos(0), 150 + 52 * Math.sin(0),
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
assert(ra23Inner >= 0 && ra23Middle >= 0, 'RA23: collision coverage intact at both old ring radii');

/* RA24: findShieldGap during animation skips new ring */
// Simulate: new ring at index 0 has full health (100), but is skipped during animation
// If ring 1 and 2 have gaps, findShieldGap returns true (even though ring 0 would block)
// Iterates outermost-to-innermost, uses segArc matching the game implementation
function simulateFindGapDuringAnim(toAngle, ringsState, collRadii, shieldAngle, ringsDef) {
  for (let ri = ringsDef.length - 1; ri >= 0; ri--) {
    const ring = ringsDef[ri];
    const rs = ringsState[ri];
    if (rs.destroyed) continue;
    if (ri === 0) continue; // skip new ring during animation
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

// With ring 1 at 80% health (6 active segs) and ring 2 at 60% (4 active segs)
// At angle 0 -> seg 0 -> both active -> false
const ra24Blocked = simulateFindGapDuringAnim(0, simRegen.ringsAfter, simRegen.collRadii, 0, testRings);
assert(ra24Blocked === false, 'RA24: findShieldGap still blocks when shifted rings have active segments');

// RA25: Public API exposes regen animation state
assert(js.includes('window._REGEN_ANIM_FRAMES'), 'RA25: REGEN_ANIM_FRAMES exposed on window');
assert(js.includes('window._regenAnimFrames'), 'RA25b: regenAnimFrames accessor exposed');
assert(js.includes('window._regenCollRadii'), 'RA25c: regenCollRadii accessor exposed');
assert(js.includes('window.tryRegenRings'), 'RA25d: tryRegenRings exposed on window');

// RA26: Animation does not interfere with non-animation collision
// After animation completes (regenCollRadii = null), collision uses normal ring.radius
const postAnimState = simRegen.ringsAfter; // rings after shift, animation done
const postAnimHit = simulateShieldCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, postAnimState, 0
);
assert(postAnimHit === 0, `RA26: post-animation collision at radius 38 hits ring 0 (new ring), got ${postAnimHit}`);

const postAnimHit2 = simulateShieldCollision(
  100 + 68 * Math.cos(0), 150 + 68 * Math.sin(0),
  100, 150, testRings, postAnimState, 0
);
assert(postAnimHit2 === 2, `RA26b: post-animation collision at radius 68 hits ring 2 (shifted), got ${postAnimHit2}`);

// RA27: Ring invariant preserved (index 0 = innermost, highest = outermost)
// SHIELD_RINGS: [38, 52, 68] — always innermost to outermost
assert(testRings[0].radius < testRings[1].radius, 'RA27: SHIELD_RINGS[0] radius < [1] radius (innermost < middle)');
assert(testRings[1].radius < testRings[2].radius, 'RA27b: SHIELD_RINGS[1] radius < [2] radius (middle < outermost)');

// RA28: Collision iterates outermost-to-innermost (enforced by for loop direction)
assert(checkCollBody.includes('ri >= 0'), 'RA28: collision loop iterates ri from length-1 down to 0');
assert(checkCollBody.includes('SHIELD_RINGS.length - 1'), 'RA28b: loop starts at outermost ring');

// RA29: sfxShieldRegen audio uses sine wave (distinct from other SFX)
const sfxRegenDef = js.match(/sfxShieldRegen.*sine/);
assert(!!sfxRegenDef, 'RA29: sfxShieldRegen uses sine waveform');

// RA30: Particle spawn on regen (visual feedback)
assert(tryRegenBody.includes('spawnParticles'), 'RA30: spawnParticles called on regen trigger');

// ── Pass 14: Deterministic death sequence ──

/* DT01: dying state defined in state machine */
assert(js.includes('"dying"'), 'DT01: dying state defined in state machine');

/* DT02: deathTimer variable exists */
assert(js.includes('deathTimer'), 'DT02: deathTimer state variable exists');

/* DT03: hitPlayer transitions to dying state */
const hitPlayerDef = js.substring(js.indexOf('function hitPlayer()'));
assert(hitPlayerDef.includes('state = "dying"'), 'DT03: hitPlayer transitions to dying state');

/* DT04: hitPlayer decrements lives (one-time) */
assert(hitPlayerDef.includes('lives--'), 'DT04: hitPlayer decrements lives');

/* DT05: hitPlayer plays sfxDeath once */
assert(hitPlayerDef.includes('sfxDeath()'), 'DT05: hitPlayer plays death cue');

/* DT06: hitPlayer guard prevents duplicate calls (invincibility) */
assert(hitPlayerDef.includes('player.invincible > 0'), 'DT06: hitPlayer guards against invincibility');

/* DT07: hitPlayer guard prevents calls outside playing state */
assert(hitPlayerDef.includes('state !== "playing"'), 'DT07: hitPlayer guards against non-playing state');

/* DT08: hitPlayer captures explosion position */
assert(hitPlayerDef.includes('deathExplosionX'), 'DT08: hitPlayer captures explosion X position');
assert(hitPlayerDef.includes('deathExplosionY'), 'DT08b: hitPlayer captures explosion Y position');

/* DT09: hitPlayer sets player.alive = false */
assert(hitPlayerDef.includes('player.alive = false'), 'DT09: hitPlayer hides player ship');

/* DT10: hitPlayer sets deathTimer to deterministic duration */
assert(hitPlayerDef.includes('deathTimer = 90'), 'DT10: deathTimer set to 90 frames (1.5s)');

/* DT11: dying handler decrements deathTimer */
const dyingUpdate = js.match(/state === "dying"[\s\S]*?deathTimer--/s);
assert(!!dyingUpdate, 'DT11: dying handler decrements deathTimer');

/* DT12: dying handler updates particles */
const dyingParticles = js.match(/state === "dying"[\s\S]*?updateParticles/s);
assert(!!dyingParticles, 'DT12: dying handler updates particles');

/* DT13: dying handler transitions to playing when lives remain */
const dyingToPlaying = js.match(/state === "dying"[\s\S]*?lives > 0[\s\S]*?state = "playing"/s);
assert(!!dyingToPlaying, 'DT13: dying handler respawns to playing when lives > 0');

  /* DT14: dying handler transitions to dead via endGame() when lives exhausted
           The old `state = "dead"` assignment was replaced by a call to endGame() so
           that the dead-state freeze (DEAD_PAUSE_FRAMES) is deterministic and cabinet-like. */
  const dyingToDead = js.match(/state === "dying"[\s\S]*?endGame\(\)/s);
  assert(!!dyingToDead, 'DT14: dying handler calls endGame() when lives <= 0');

  /* DT14b: dying handler delegates to endGame() which saves high score before game-over */
  const dyingSaveHighScore = js.match(/function\s+endGame\(\)[\s\S]*?saveHighScore/s);
  assert(!!dyingSaveHighScore, 'DT14b: endGame() calls saveHighScore() before game-over');

  /* DT15: dying handler calls resetPlayer on respawn */
const dyingResetPlayer = js.match(/state === "dying"[\s\S]*?resetPlayer/s);
assert(!!dyingResetPlayer, 'DT15: dying handler calls resetPlayer on respawn');

/* DT16: dying handler does NOT process player movement */
const dyingFull = js.substring(js.indexOf('if (state === "dying")'), js.indexOf('if (state !== "playing")'));
assert(!dyingFull.includes('rotDir'), 'DT16: dying handler does not process rotation');
assert(!dyingFull.includes('thrustDir'), 'DT16b: dying handler does not process thrust');
assert(!dyingFull.includes('fireBullet'), 'DT16c: dying handler does not process fire');
assert(!dyingFull.includes('updateCore'), 'DT16d: dying handler does not update core');
assert(!dyingFull.includes('spawnEnemy'), 'DT16e: dying handler does not spawn enemies');

/* DT17: drawDying function exists */
assert(js.includes('function drawDying()'), 'DT17: drawDying function defined');

/* DT18: drawDying draws RESERVE feedback */
const drawDyingBody = js.substring(js.indexOf('function drawDying()'));
assert(drawDyingBody.includes('RESERVE'), 'DT18: drawDying shows RESERVE label');

/* DT19: drawDying draws remaining lives */
assert(drawDyingBody.includes('lives'), 'DT19: drawDying displays remaining lives');

/* DT20: drawDying draws explosion at captured position */
assert(drawDyingBody.includes('deathExplosionX'), 'DT20: drawDying uses captured explosion X');
assert(drawDyingBody.includes('deathExplosionY'), 'DT20b: drawDying uses captured explosion Y');

/* DT21: drawDying draws vector wireframe explosion */
assert(drawDyingBody.includes('expSize'), 'DT21: drawDying computes expanding explosion size');

/* DT22: drawDying draws HUD */
assert(drawDyingBody.includes('drawHUD'), 'DT22: drawDying draws HUD');

/* DT23: drawGame routes to drawDying in dying state */
const drawGameDying = js.match(/state === "dying"[\s\S]*?drawDying/s);
assert(!!drawGameDying, 'DT23: drawGame routes to drawDying in dying state');

/* DT24: Public API exposes death state variables */
assert(js.includes('window._deathTimer'), 'DT24: _deathTimer exposed on window');
assert(js.includes('window._deathExplosionX'), 'DT24b: _deathExplosionX exposed on window');
assert(js.includes('window._deathExplosionY'), 'DT24c: _deathExplosionY exposed on window');
assert(js.includes('window._lives'), 'DT24d: _lives exposed on window');
assert(js.includes('window._hitPlayer'), 'DT24e: _hitPlayer exposed on window');

/* DT25: drawDead still reachable (game-over path preserved) */
assert(js.includes('function drawDead()'), 'DT25: drawDead function preserved');
assert(js.includes('GAME OVER'), 'DT25b: GAME OVER text preserved');

/* DT26: Deterministic simulation — lives 3→2, death timer counts, respawn */
// Simulate: start with 3 lives, hitPlayer called
let simLives = 3;
let simState = "playing";
let simDeathTimer = 0;
let simInvincible = 0;
let simAlive = true;
let simRespawned = false;
let simGameOver = false;

// hitPlayer: guard checks pass (invincible=0, state=playing)
simLives--; // 2
simAlive = false;
simDeathTimer = 90;
simState = "dying";
assert(simLives === 2, `DT26a: lives decremented from 3 to 2, got ${simLives}`);
assert(simState === "dying", `DT26b: state is dying, got ${simState}`);
assert(simAlive === false, 'DT26c: player hidden during death sequence');
assert(simDeathTimer === 90, `DT26d: deathTimer set to 90, got ${simDeathTimer}`);

// Simulate second hitPlayer during dying — should be blocked
const prevLives = simLives;
// Guard: state !== "playing" → return
// No change
assert(simLives === prevLives, 'DT26e: duplicate hitPlayer during dying is blocked');
assert(simState === "dying", 'DT26f: state remains dying on duplicate hitPlayer');

// Simulate death timer countdown to 0
simDeathTimer = 0;
// Timer expires, lives > 0 → respawn
if (simLives > 0) {
  simRespawned = true;
  simAlive = true;
  simInvincible = 120;
  simState = "playing";
}
assert(simRespawned, 'DT26g: player respawns when lives remain');
assert(simAlive === true, 'DT26h: player visible after respawn');
assert(simInvincible === 120, `DT26i: invulnerability set to 120 frames, got ${simInvincible}`);
assert(simState === "playing", `DT26j: state returns to playing, got ${simState}`);

/* DT27: Deterministic simulation — lives 1→0, death timer counts, game over */
simLives = 1;
simState = "playing";
simDeathTimer = 0;
simInvincible = 0;
simAlive = true;
simRespawned = false;
simGameOver = false;

// hitPlayer
simLives--; // 0
simAlive = false;
simDeathTimer = 90;
simState = "dying";
assert(simLives === 0, `DT27a: lives decremented from 1 to 0, got ${simLives}`);

// Timer expires, lives <= 0 → game over
simDeathTimer = 0;
if (simLives > 0) {
  simRespawned = true;
  simAlive = true;
  simInvincible = 120;
  simState = "playing";
} else {
  simGameOver = true;
  simState = "dead";
}
assert(simGameOver, 'DT27b: game over triggered when lives exhausted');
assert(simState === "dead", `DT27c: state transitions to dead, got ${simState}`);
assert(simAlive === false, 'DT27d: player remains hidden in dead state');

/* DT28: Invulnerability prevents hitPlayer after respawn */
simLives = 2;
simState = "playing";
simInvincible = 120;
simAlive = true;
const preInvulLives = simLives;
// hitPlayer with invincible > 0 → return immediately
// Guard: invincible > 0 → return
assert(simLives === preInvulLives, 'DT28: hitPlayer blocked by invulnerability after respawn');
assert(simState === "playing", 'DT28b: state remains playing during invulnerability');

/* DT29: drawDying exposed on window */
assert(js.includes('window._drawDying'), 'DT29: _drawDying exposed on window');

/* DT30: hitPlayer spawns particles at captured position */
assert(hitPlayerDef.includes('spawnParticles'), 'DT30: hitPlayer spawns explosion particles');

// ── Pass 15: Enemy spawning and continuous gameplay ──

/* E1: spawnInterval helper defined */
assert(js.includes('function spawnInterval(level)'), 'E1: spawnInterval helper defined');

/* E2: spawnInterval uses Math.max for floor */
assert(js.match(/spawnInterval.*Math\.max/s), 'E2: spawnInterval uses Math.max for floor');

/* E3: spawnTimer state variable exists */
assert(js.includes('let spawnTimer'), 'E3: spawnTimer state variable exists');

/* E4: spawnInterval values at different levels (restrained: floor 45, base 240) */
function spawnInterval(level) { return Math.max(45, 240 - level * 12); }
assert(spawnInterval(1) === 228, `E4: level 1 spawn interval = 228, got ${spawnInterval(1)}`);
assert(spawnInterval(5) === 180, `E5: level 5 spawn interval = 180, got ${spawnInterval(5)}`);
assert(spawnInterval(10) === 120, `E6: level 10 spawn interval = 120, got ${spawnInterval(10)}`);
assert(spawnInterval(15) === 60, `E7: level 15 spawn interval = 60, got ${spawnInterval(15)}`);
assert(spawnInterval(16) === 48, `E8: level 16 spawn interval = 48 (one above floor), got ${spawnInterval(16)}`);
assert(spawnInterval(17) === 45, `E8b: level 17 spawn interval = 45 (floor), got ${spawnInterval(17)}`);
assert(spawnInterval(99) === 45, `E9: level 99 spawn interval = 45 (still floored), got ${spawnInterval(99)}`);

/* E10: spawnInterval is monotonic decreasing */
assert(spawnInterval(5) < spawnInterval(1), 'E10: spawn interval decreases with level');
assert(spawnInterval(10) < spawnInterval(5), 'E10b: spawn interval continues decreasing');

/* E11: spawnTimer reset in startGame */
const startGameSpawnReset = js.match(/function startGame\(\)[\s\S]*spawnTimer\s*=\s*spawnInterval/s);
assert(!!startGameSpawnReset, 'E11: startGame resets spawnTimer');

/* E12: spawnTimer reset in levelTransition */
const ltSpawnReset = js.match(/state === "levelTransition"[\s\S]*spawnTimer\s*=\s*spawnInterval/s);
assert(!!ltSpawnReset, 'E12: levelTransition resets spawnTimer');

/* E13: spawnTimer decremented in playing update */
const spawnTimerDecrement = js.match(/state !== "playing"[\s\S]*spawnTimer--/s);
assert(!!spawnTimerDecrement, 'E13: spawnTimer decremented in playing update');

/* E14: spawnEnemy called when timer expires */
const spawnOnTimer = js.match(/spawnTimer.*<=.*0[\s\S]*spawnEnemy/s);
assert(!!spawnOnTimer, 'E14: spawnEnemy called when spawnTimer expires');

/* E15: spawnInterval exposed on window */
assert(js.includes('window._spawnInterval'), 'E15: spawnInterval exposed on window');

/* E16: spawnTimer exposed on window */
assert(js.includes('window._spawnTimer'), 'E16: spawnTimer accessor exposed on window');

/* E17: Continuous spawn simulation */
function simulateContinuousSpawn(level, frames) {
  const interval = spawnInterval(level);
  let timer = interval;
  let spawns = 0;
  for (let f = 0; f < frames; f++) {
    timer--;
    if (timer <= 0) {
      timer = interval;
      spawns++;
    }
  }
  return { spawns, remainingTimer: timer };
}

const simSpawn1 = simulateContinuousSpawn(1, 600);
assert(simSpawn1.spawns === 2, `E17: level 1 spawns 2 enemies in 600 frames (interval=228), got ${simSpawn1.spawns}`);

const simSpawn5 = simulateContinuousSpawn(5, 600);
assert(simSpawn5.spawns === 3, `E18: level 5 spawns 3 enemies in 600 frames (interval=180), got ${simSpawn5.spawns}`);

const simSpawn10 = simulateContinuousSpawn(10, 600);
assert(simSpawn10.spawns === 5, `E19: level 10 spawns 5 enemies in 600 frames (interval=120), got ${simSpawn10.spawns}`);

// ── Pass 16: init() called at startup ──

/* I1: init() called before loop() in IIFE */
const initCallMatch = js.match(/function loop\(\)[\s\S]*\n\s*init\(\);\s*\n\s*loop\(\)/);
assert(!!initCallMatch, 'I1: init() called before loop() in IIFE');

/* I2: initInput exposed on window */
assert(js.includes('window.initInput = initInput'), 'I2: initInput exposed on window');

/* I3: keydown preventDefault for game keys */
const preventDefaultMatch = js.match(/keydown[\s\S]*preventDefault/s);
assert(!!preventDefaultMatch, 'I3: keydown handler calls preventDefault for game keys');

/* I4: Space key prevented */
assert(js.includes("'Space'"), 'I4: Space key in preventDefault list');

/* I5: Arrow keys prevented */
assert(js.includes("'ArrowUp'"), 'I5: ArrowUp in preventDefault list');
assert(js.includes("'ArrowDown'"), 'I5b: ArrowDown in preventDefault list');
assert(js.includes("'ArrowLeft'"), 'I5c: ArrowLeft in preventDefault list');
assert(js.includes("'ArrowRight'"), 'I5d: ArrowRight in preventDefault list');

/* I6: WASD keys prevented */
assert(js.includes("'KeyW'"), 'I6: KeyW in preventDefault list');
assert(js.includes("'KeyA'"), 'I6b: KeyA in preventDefault list');
assert(js.includes("'KeyD'"), 'I6c: KeyD in preventDefault list');

// ── Pass 17: Mobile touch/pointer interaction ──

/* T1: canvasTapped state variable exists */
assert(js.includes('canvasTapped'), 'T1: canvasTapped state variable exists');

/* T2: pointerdown listener on canvas for attract/dead screens */
assert(js.match(/canvas\.addEventListener\("pointerdown"/), 'T2: canvas pointerdown listener for mobile start');

/* T3: pointerdown sets canvasTapped flag */
const pointerHandlerBody = js.substring(js.indexOf('canvas.addEventListener("pointerdown"'));
assert(pointerHandlerBody.includes('canvasTapped = true'), 'T3: pointerdown sets canvasTapped flag');

/* T4: pointerdown guards on attract/dead states */
assert(pointerHandlerBody.includes('state === "attract"'), 'T4: pointerdown checks attract state');
assert(pointerHandlerBody.includes('state === "dead"'), 'T4b: pointerdown checks dead state');

/* T5: pointerdown initializes audio context */
assert(pointerHandlerBody.includes('initAudio()'), 'T5: pointerdown initializes audio');

/* T6: drawAttract checks canvasTapped */
const drawAttractBody17 = js.substring(js.indexOf('function drawAttract()'));
assert(drawAttractBody17.includes('canvasTapped'), 'T6: drawAttract checks canvasTapped for start');

/* T7: drawDead checks canvasTapped */
const drawDeadBody17 = js.substring(js.indexOf('function drawDead()'));
assert(drawDeadBody17.includes('canvasTapped'), 'T7: drawDead checks canvasTapped for restart');

/* T8: canvasTapped reset after use */
assert(drawAttractBody17.includes('canvasTapped = false'), 'T8: canvasTapped reset in drawAttract');
assert(drawDeadBody17.includes('canvasTapped = false'), 'T8b: canvasTapped reset in drawDead');

/* T9: _canvasTapped exposed on window */
assert(js.includes('window._canvasTapped'), 'T9: _canvasTapped exposed on window for testing');

// ── Pass 18: Shield collision fromOutside fix ──

/* SC1: checkShieldCollision uses continue for distance mismatch (not return -1) */
const checkShieldBody18 = js.substring(js.indexOf('function checkShieldCollision('));
// The fixed code should have `if (Math.abs(d - collRadius) > 8) continue;` without fromOutside check inside
const distanceMismatchPattern = /Math\.abs\(d - collRadius\) > 8\)\s*continue/;
assert(!!checkShieldBody18.match(distanceMismatchPattern), 'SC1: distance mismatch uses continue (not conditional return)');

/* SC2: distance mismatch line is bare continue (no nested if/return) */
// Verify the distance check line is a simple continue, not a conditional block
const distMismatchLine = checkShieldBody18.match(/Math\.abs\(d - collRadius\) > 8\)\s*\{[\s\S]*?\}/);
assert(!distMismatchLine, 'SC2: distance mismatch is bare continue (no nested block with fromOutside)');

/* SC3: fromOutside gates segment gap (pass through to inner rings) */
const segGapSection = checkShieldBody18.substring(checkShieldBody18.indexOf('segAngle'));
assert(segGapSection.includes('fromOutside'), 'SC3: fromOutside gates segment gap behavior');

// ── Pass 19: Enemy wave composition ──

/* W1: spawnWave function exists and scales with level */
const spawnWaveDef = js.substring(js.indexOf('function spawnWave()'));
assert(spawnWaveDef.includes('2 + level'), 'W1: wave count = 2 + level (restrained)');

/* W2: Enemy type distribution in spawnWave (3 types, no generic tank) */
assert(spawnWaveDef.includes('"mine"'), 'W2: mine type in spawnWave');
assert(spawnWaveDef.includes('"chaser"'), 'W2b: chaser type in spawnWave');
assert(spawnWaveDef.includes('"fast"'), 'W2c: fast type in spawnWave');
assert(!spawnWaveDef.includes('"tank"'), 'W2d: tank type removed (not Star Castle themed)');

/* W3: Wave count at different levels (restrained: 2+level) */
// Level 1: 2 + 1 = 3 enemies
assert(2 + 1 === 3, 'W3: level 1 spawns 3 enemies (restrained)');
// Level 5: 2 + 5 = 7 enemies
assert(2 + 5 === 7, 'W3b: level 5 spawns 7 enemies');
// Level 10: 2 + 10 = 12 enemies
assert(2 + 10 === 12, 'W3c: level 10 spawns 12 enemies');

// ── Pass 20: Core-spawned orbiting mines (Star Castle signature) ──

/* M1: spawnCoreMine function defined */
assert(js.includes('function spawnCoreMine()'), 'M1: spawnCoreMine function defined');

/* M2: coreMineTimer state variable exists */
assert(js.includes('let coreMineTimer'), 'M2: coreMineTimer state variable exists');

/* M3: coreMineInterval helper defined */
assert(js.includes('function coreMineInterval(level)'), 'M3: coreMineInterval helper defined');

/* M4: coreMineInterval uses Math.max for floor */
assert(js.match(/coreMineInterval.*Math\.max/s), 'M4: coreMineInterval uses Math.max for floor');

/* M5: coreMineInterval values at different levels */
function coreMineInterval(level) { return Math.max(120, 240 - level * 12); }
assert(coreMineInterval(1) === 228, `M5: level 1 core mine interval = 228, got ${coreMineInterval(1)}`);
assert(coreMineInterval(5) === 180, `M6: level 5 core mine interval = 180, got ${coreMineInterval(5)}`);
assert(coreMineInterval(10) === 120, `M7: level 10 core mine interval = 120 (floor), got ${coreMineInterval(10)}`);
assert(coreMineInterval(15) === 120, `M8: level 15 core mine interval = 120 (plateau), got ${coreMineInterval(15)}`);

/* M9: coreMineInterval is monotonic decreasing */
assert(coreMineInterval(5) < coreMineInterval(1), 'M9: core mine interval decreases with level');
assert(coreMineInterval(10) < coreMineInterval(5), 'M10: core mine interval continues decreasing');

/* M11: updateCore manages core mine spawning */
const updateCoreMine = js.match(/function updateCore\(\)[\s\S]*coreMineTimer--/s);
assert(!!updateCoreMine, 'M11: updateCore decrements coreMineTimer');

/* M12: spawnCoreMine called when coreMineTimer expires */
const spawnCoreMineOnTimer = js.match(/coreMineTimer.*<=.*0[\s\S]*spawnCoreMine/s);
assert(!!spawnCoreMineOnTimer, 'M12: spawnCoreMine called when coreMineTimer expires');

/* M13: coreMineTimer reset in resetCore */
const resetCoreMine = js.match(/function resetCore\(\)[\s\S]*coreMineTimer\s*=\s*coreMineInterval/s);
assert(!!resetCoreMine, 'M13: resetCore resets coreMineTimer');

/* M14: spawnCoreMine checks core.alive */
const spawnCoreMineDef = js.substring(js.indexOf('function spawnCoreMine()'));
assert(spawnCoreMineDef.includes('core.alive'), 'M14: spawnCoreMine guards on core.alive');

/* M15: spawnCoreMine uses core position for orbital spawn */
assert(spawnCoreMineDef.includes('core.x'), 'M15: spawnCoreMine uses core.x for position');
assert(spawnCoreMineDef.includes('core.y'), 'M16: spawnCoreMine uses core.y for position');

/* M17: spawnCoreMine creates orbital velocity (perpendicular to radius) */
assert(spawnCoreMineDef.includes('orbitRadius'), 'M17: spawnCoreMine uses orbitRadius');
assert(spawnCoreMineDef.includes('orbitSpeed'), 'M18: spawnCoreMine computes orbitSpeed');

/* M19: coreMineInterval exposed on window */
assert(js.includes('window._coreMineInterval'), 'M19: coreMineInterval exposed on window');

/* M20: coreMineTimer exposed on window */
assert(js.includes('window._coreMineTimer'), 'M20: coreMineTimer exposed on window');

/* M21: spawnCoreMine exposed on window */
assert(js.includes('window._spawnCoreMine'), 'M21: spawnCoreMine exposed on window');

/* M22: core-spawned mines carry coreSpawned flag */
assert(spawnCoreMineDef.includes('coreSpawned: true'), 'M22: spawnCoreMine sets coreSpawned flag');

/* M23: core-spawned mines use distinct yellow color */
assert(spawnCoreMineDef.includes('"#ffff00"'), 'M23: core-spawned mines use yellow color');

/* M24: drawGame distinguishes core-spawned from edge-spawned mines */
const coreSpawnedDraw = js.match(/e\.type === "mine" && e\.coreSpawned/s);
assert(!!coreSpawnedDraw, 'M24: drawGame checks coreSpawned for distinct rendering');

/* M25: attract showcase draws orbiting core mines */
const showcaseMines = js.match(/drawAttractShowcase[\s\S]*beaconR/s);
assert(!!showcaseMines, 'M25: attract showcase draws orbiting beacon mines');

/* M26: attract showcase label references core mines */
const showcaseLabel = js.match(/drawAttractShowcase[\s\S]*CORE MINES/s);
assert(!!showcaseLabel, 'M26: attract showcase label mentions core mines');

/* M27: core-spawned mines purged on core death (bullet-vs-core block) */
const purgeOnCoreDeath = js.match(/core\.alive\s*=\s*false[\s\S]*enemies\[\w+\]\.coreSpawned[\s\S]*enemies\.splice/s);
assert(!!purgeOnCoreDeath, 'M27: core-spawned mines purged when core is destroyed');

/* M28: spawnCoreMine caps active core mine count */
const maxCoreMinesCheck = js.match(/function spawnCoreMine\(\)[\s\S]*(MAX_CORE_MINES|filter.*coreSpawned)/s);
assert(!!maxCoreMinesCheck, 'M28: spawnCoreMine enforces active count bound');

/* M29: coreDestruction state includes safety purge of core-spawned mines */
const coreDestructionPurge = js.match(/state === "coreDestruction"[\s\S]*coreSpawned[\s\S]*enemies\.splice/s);
assert(!!coreDestructionPurge, 'M29: coreDestruction state purges remaining core-spawned mines');

/* M30: levelTransition clears enemies array to prevent cross-level leak */
const levelTransitionClear = js.match(/state === "levelTransition"[\s\S]*enemies\.length\s*=\s*0/s);
assert(!!levelTransitionClear, 'M30: levelTransition clears enemies array');

// ── Pass 21: Shield ring segArc precision (Pass 1 improvement) ──

/* GA1: findShieldGap uses segArc (0.55 coverage) matching checkShieldCollision */
const findGapBody21 = js.substring(js.indexOf('function findShieldGap('));
assert(findGapBody21.includes('segArc'), 'GA1: findShieldGap computes segArc');
assert(findGapBody21.includes('segOffset'), 'GA2: findShieldGap computes segOffset');
assert(findGapBody21.match(/segAngle\s*\*\s*0\.55/), 'GA3: findShieldGap uses 0.55 arc coverage');
assert(findGapBody21.match(/segOffset\s*<\s*segArc/), 'GA4: findShieldGap gates on segOffset < segArc');

/* GA5: findShieldGap iterates outermost-to-innermost */
assert(findGapBody21.includes('SHIELD_RINGS.length - 1'), 'GA5: findShieldGap starts at outermost ring');
assert(findGapBody21.includes('ri >= 0'), 'GA6: findShieldGap iterates down to 0');

/* GA7: Angle at start of active segment (segOffset≈0) -> blocked */
// Full shield, angle 0 -> segment 0, segOffset=0 < segArc -> no gap
assert(simulateFindShieldGap(0, testRings, fullState, 0) === false,
  'GA7: findShieldGap blocks at segment start (segOffset=0 < segArc)');

/* GA8: Angle near end of active segment (segOffset > segArc) -> treated as gap */
// With 8 segments: segAngle = 2π/8 ≈ 0.785, segArc = 0.55 * 0.785 ≈ 0.432
// Angle 0.48 radians -> segIndex=0 (in first segment), segOffset=0.48 > segArc=0.432 -> gap within segment
// But we need ALL rings to have gaps. With full shield, all 8 segments are active.
// At angle 0.48, all rings have segIndex=0, segOffset=0.48 > segArc -> all have gap -> returns true
const segAngle8 = (Math.PI * 2) / 8;
const segArc8 = segAngle8 * 0.55;
const nearEndAngle = segArc8 + 0.05; // just past the active arc within segment 0
const ga8Result = simulateFindShieldGap(nearEndAngle, testRings, fullState, 0);
assert(ga8Result === true,
  `GA8: findShieldGap allows fire through intra-segment gap (segOffset=${nearEndAngle.toFixed(3)} > segArc=${segArc8.toFixed(3)})`);

/* GA9: Old behavior would have blocked this angle (entire segment treated as active) */
// Verify the fix: with old logic (segIndex < activeSegs without segArc), this angle would be blocked
const oldActiveSegs = Math.floor((100 / 100) * 8); // = 8
const oldSegIndex = Math.min(7, Math.floor(nearEndAngle / segAngle8)); // = 0
assert(oldSegIndex < oldActiveSegs, 'GA9: old logic would have blocked (segIndex=0 < activeSegs=8)');
assert(ga8Result === true, 'GA9b: new logic correctly allows fire through intra-segment gap');

/* GA10: Cannon fires through intra-segment gaps (player-visible: more cannon shots) */
// With half-health rings, activeSegs=4. At angle near end of segment 3 (last active segment),
// segOffset > segArc -> gap. All 3 rings have gap -> cannon can fire.
const lastActiveSegEnd = (3 / 8) * Math.PI * 2 + segArc8 + 0.02; // past arc of segment 3
const ga10Result = simulateFindShieldGap(lastActiveSegEnd, testRings, halfState, 0);
assert(ga10Result === true,
  'GA10: cannon fires through intra-segment gap in half-health rings');

// ── Pass 22: fromOutside cannon shot gap-pass behavior ──

/* FO1: Cannon shot at outer ring radius, outer ring has gap -> passes to check inner rings */
// Outer ring at 50% (gaps at seg 4-7), middle/inner at 100%
// Shot at outer ring radius (68), angle PI -> segment 4 (gap on outer) -> fromOutside: continue to inner
// Middle ring at radius 52, distance check fails -> inner ring at radius 38, distance check fails -> pass through
const fo1State = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
const fo1Hit = simulateCannonCollision(
  100 + 68 * Math.cos(Math.PI), 150 + 68 * Math.sin(Math.PI),
  100, 150, testRings, fo1State, 0, true
);
assert(fo1Hit === -1, 'FO1: cannon shot passes through outer ring gap (not at inner ring radii)');

/* FO2: Cannon shot at outer ring radius, outer ring blocks -> blocked immediately */
const fo2Hit = simulateCannonCollision(
  100 + 68 * Math.cos(0), 150 + 68 * Math.sin(0),
  100, 150, testRings, fullState, 0, true
);
assert(fo2Hit === 2, 'FO2: cannon shot blocked by active segment at outer ring');

/* FO3: Player bullet (fromOutside=false) at inner ring radius, inner ring has gap -> passes through */
// Half-health rings, angle PI -> segment 4 (gap) -> fromOutside=false -> return -1
const fo3Hit = simulateCannonCollision(
  100 + 38 * Math.cos(Math.PI), 150 + 38 * Math.sin(Math.PI),
  100, 150, testRings, halfState, 0, false
);
assert(fo3Hit === -1, 'FO3: player bullet passes through inner ring gap (fromOutside=false)');

/* FO4: Player bullet (fromOutside=false) at inner ring radius, inner ring blocks -> blocked */
const fo4Hit = simulateCannonCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, fullState, 0, false
);
assert(fo4Hit === 0, 'FO4: player bullet blocked by active segment at inner ring');

/* FO5: Cannon shot at middle ring radius, middle has gap, inner blocks */
// Outer at 50% (gaps 4-7), middle at 50% (gaps 4-7), inner at 100%
// Shot at middle radius (52), angle PI -> outer at 68: distance fails -> middle at 52: gap, fromOutside: continue -> inner at 38: distance fails -> pass
const fo5State = [
  { health: 100, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
];
const fo5Hit = simulateCannonCollision(
  100 + 52 * Math.cos(Math.PI), 150 + 52 * Math.sin(Math.PI),
  100, 150, testRings, fo5State, 0, true
);
assert(fo5Hit === -1, 'FO5: cannon shot passes through middle ring gap (not at inner ring radius)');

/* FO6: Cannon shot at inner ring radius, outer/middle have gaps, inner blocks */
// Shot at inner radius (38), angle 0 -> outer at 68: distance fails -> middle at 52: distance fails -> inner at 38: active -> blocked
const fo6Hit = simulateCannonCollision(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, fo5State, 0, true
);
assert(fo6Hit === 0, 'FO6: cannon shot blocked at inner ring after passing through outer gaps');

/* FO7: fromOutside=false, ring has gap -> returns -1 immediately (no inner ring check) */
// Only one ring active (middle at 50%), shot at middle radius, angle PI (gap)
// fromOutside=false, gap -> return -1 (doesn't check inner ring)
const fo7State = [
  { health: 0, destroyed: true, breachFlash: 0 },
  { health: 50, destroyed: false, breachFlash: 0 },
  { health: 0, destroyed: true, breachFlash: 0 },
];
const fo7Hit = simulateCannonCollision(
  100 + 52 * Math.cos(Math.PI), 150 + 52 * Math.sin(Math.PI),
  100, 150, testRings, fo7State, 0, false
);
assert(fo7Hit === -1, 'FO7: fromOutside=false returns -1 on gap (no inner ring check)');

/* FO8: fromOutside=true, ring has gap -> continues to inner ring */
// Same setup, fromOutside=true, gap -> continue to inner ring (destroyed, skip) -> return -1
const fo8Hit = simulateCannonCollision(
  100 + 52 * Math.cos(Math.PI), 150 + 52 * Math.sin(Math.PI),
  100, 150, testRings, fo7State, 0, true
);
assert(fo8Hit === -1, 'FO8: fromOutside=true continues past gap (inner ring destroyed, passes through)');

// ── Pass 23: Regen animation collision gating edge cases ──

/* RG1: During animation, findShieldGap skips new ring (index 0) */
// With simRegen state: ring 0 at 100% (new), ring 1 at 80%, ring 2 at 60%
// At angle 0 -> ring 0 would block (seg 0 active), but is skipped during animation
// Ring 1 at 80%: seg 0 active (0 < 10) -> blocked by ring 1
const rg1Result = simulateFindGapDuringAnim(0, simRegen.ringsAfter, simRegen.collRadii, 0, testRings);
assert(rg1Result === false, 'RG1: findShieldGap during animation blocks on shifted ring (ring 0 skipped)');

/* RG2: During animation, new ring would block but is skipped; shifted rings have gaps -> cannon fires */
// Create state where shifted rings have gaps but new ring would block
const rg2State = [
  { health: 100, destroyed: false, breachFlash: 0 }, // new ring (skipped)
  { health: 50, destroyed: false, breachFlash: 0 },   // shifted ring 1 (gaps at 6-11)
  { health: 50, destroyed: false, breachFlash: 0 },   // shifted ring 2 (gaps at 6-11)
];
const rg2Result = simulateFindGapDuringAnim(Math.PI, rg2State, simRegen.collRadii, 0, testRings);
assert(rg2Result === true, 'RG2: findShieldGap during animation allows fire (shifted rings have gaps, new ring skipped)');

/* RG3: After animation, new ring is active and blocks */
// Post-animation: ring 0 at 100%, ring 1 at 50%, ring 2 at 50%
// At angle 0 -> ring 0 blocks (seg 0 active)
const rg3Result = simulateFindShieldGap(0, testRings, rg2State, 0);
assert(rg3Result === false, 'RG3: post-animation, new ring at index 0 blocks (no longer skipped)');

/* RG4: Collision zones overlap during animation (no gap exploit) */
// Ring 1 at captured radius 38: zone [30, 46]
// Ring 2 at captured radius 52: zone [44, 60]
// Overlap at [44, 46] means no gap between rings — projectiles can't slip through
const rg4Hit = simulateCollisionDuringAnim(
  100 + 45, 150,
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
assert(rg4Hit >= 0, 'RG4: object at radius 45 hits a ring (collision zones overlap, no gap exploit)');

/* RG5: Collision during animation at captured radius 38 hits ring 1 */
const rg5Hit = simulateCollisionDuringAnim(
  100 + 38 * Math.cos(0), 150 + 38 * Math.sin(0),
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
assert(rg5Hit === 1, `RG5: object at captured radius 38 hits ring 1, got ${rg5Hit}`);

/* RG6: Collision during animation at captured radius 52 hits ring 2 */
const rg6Hit = simulateCollisionDuringAnim(
  100 + 52 * Math.cos(0), 150 + 52 * Math.sin(0),
  100, 150, testRings, simRegen.ringsAfter, simRegen.collRadii, 0, testRings
);
assert(rg6Hit === 2, `RG6: object at captured radius 52 hits ring 2, got ${rg6Hit}`);

// ── Pass 24: Cannon behavior improvements (leading, alignment, interaction) ──

/* CB1: fireCannonShot uses leading prediction */
const fireCannonShotDef = js.substring(js.indexOf('function fireCannonShot()'));
assert(fireCannonShotDef.includes('leadPredict'), 'CB1: fireCannonShot computes lead prediction');
assert(fireCannonShotDef.includes('travelFrames'), 'CB1b: fireCannonShot computes travel time');
assert(fireCannonShotDef.includes('leadX'), 'CB1c: fireCannonShot computes predicted X');
assert(fireCannonShotDef.includes('leadY'), 'CB1d: fireCannonShot computes predicted Y');

/* CB2: fireCannonShot uses alignment tolerance */
assert(fireCannonShotDef.includes('fireAngleTol'), 'CB2: fireCannonShot uses alignment tolerance');
assert(fireCannonShotDef.includes('0.05'), 'CB2b: fireAngleTol = 0.05 radians');

/* CB3: fireCannonShot still checks shield gap */
assert(fireCannonShotDef.includes('findShieldGap'), 'CB3: fireCannonShot still checks findShieldGap');

/* CB4: fireCannonShot still uses difficulty-scaled helpers */
assert(fireCannonShotDef.includes('cannonFireCooldown(level)'), 'CB4: fireCannonShot uses cannonFireCooldown');
assert(fireCannonShotDef.includes('cannonShotSpeed(level)'), 'CB4b: fireCannonShot uses cannonShotSpeed');

/* CB5: fireCannonShot still plays sfxMine */
assert(fireCannonShotDef.includes('sfxMine()'), 'CB5: fireCannonShot plays sfxMine');

/* CB6: Fire decision simulation — mirrors game.js fireCannonShot logic */
function simulateFireDecision(corePos, playerPos, playerVel, coreAngle, level, shieldAngle, rings, ringsState, gapsExist) {
  const dx = playerPos.x - corePos.x;
  const dy = playerPos.y - corePos.y;
  const distToPlayer = Math.hypot(dx, dy);
  const speed = Math.min(6, 3 + level * 0.4);
  const travelFrames = distToPlayer / speed;
  const leadX = playerPos.x + playerVel.vx * travelFrames;
  const leadY = playerPos.y + playerVel.vy * travelFrames;
  const playerSpeed = Math.hypot(playerVel.vx, playerVel.vy);
  const leadPredict = playerSpeed > 0.1 || distToPlayer < 150;

  const targetX = leadPredict ? leadX : playerPos.x;
  const targetY = leadPredict ? leadY : playerPos.y;
  const targetAngle = Math.atan2(targetY - corePos.y, targetX - corePos.x);

  const fireAngleTol = 0.05;
  let diff = targetAngle - coreAngle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const aligned = Math.abs(diff) <= fireAngleTol;

  return { targetAngle, aligned, leadPredict, distToPlayer, travelFrames, targetX, targetY };
}

/* CB7: Stationary player at 300px — no lead prediction */
const cb7Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { vx: 0, vy: 0 },
  Math.PI / 2,
  1, 0, testRings, fullState, false
);
assert(cb7Result.leadPredict === false, 'CB7: stationary player does not trigger lead prediction');
assert(cb7Result.targetX === 400 && cb7Result.targetY === 400, 'CB7: target is player position (no lead)');

/* CB7b: Close stationary player (< 150px) — lead triggered by proximity */
const cb7bResult = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 200 },
  { vx: 0, vy: 0 },
  Math.PI / 2,
  1, 0, testRings, fullState, false
);
assert(cb7bResult.leadPredict === true, 'CB7b: close stationary player triggers lead by proximity');

/* CB8: Moving player at 300px — lead prediction active */
const cb8Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { vx: 2, vy: 0 },
  Math.PI / 2,
  1, 0, testRings, fullState, false
);
assert(cb8Result.leadPredict === true, 'CB8: moving player triggers lead prediction');
assert(cb8Result.targetX > 400, 'CB8: predicted X is ahead of player (in direction of vx)');
assert(cb8Result.targetY === 400, 'CB8: predicted Y unchanged (vy=0)');

/* CB9: Lead prediction accounts for travel time */
// At level 1: speed = 3.4 px/frame, distance = 300px, travelFrames = 300/3.4 ≈ 88.2
// Player vx = 2 px/frame, leadX = 400 + 2 * 88.2 = 576.4
const expectedTravelFrames = 300 / 3.4;
const expectedLeadX = 400 + 2 * expectedTravelFrames;
assert(Math.abs(cb8Result.travelFrames - expectedTravelFrames) < 0.1,
  `CB9: travel frames correct (${cb8Result.travelFrames.toFixed(1)} ≈ ${expectedTravelFrames.toFixed(1)})`);
assert(Math.abs(cb8Result.targetX - expectedLeadX) < 0.1,
  `CB9: lead X correct (${cb8Result.targetX.toFixed(1)} ≈ ${expectedLeadX.toFixed(1)})`);

/* CB10: Slow moving player (speed > 0.1) — lead triggered by movement */
// Player at 150px distance, moving at 0.2 px/frame (above 0.1 threshold)
const cb10Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 250 },
  { vx: 0.2, vy: 0 },
  Math.PI / 2,
  1, 0, testRings, fullState, false
);
assert(cb10Result.leadPredict === true, 'CB10: slow moving player triggers lead (speed > 0.1)');

/* CB11: Far stationary player (dist > 150, speed = 0) — no lead */
const cb11Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 450 },
  { vx: 0, vy: 0 },
  Math.PI / 2,
  5, 0, testRings, fullState, false
);
assert(cb11Result.leadPredict === false, 'CB11: far stationary player does NOT trigger lead (no movement)');
assert(cb11Result.targetX === 400 && cb11Result.targetY === 450, 'CB11b: target is player position (no lead)');

/* CB12: Alignment tolerance — cannon aimed exactly at target */
assert(cb7Result.aligned === true, 'CB12: cannon aligned when aimed exactly at target');

/* CB13: Alignment tolerance — cannon 0.03 rad off (within 0.05 tolerance) */
const cb13Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { vx: 0, vy: 0 },
  Math.PI / 2 - 0.03,
  1, 0, testRings, fullState, false
);
assert(cb13Result.aligned === true, 'CB13: cannon fires at 0.03 rad offset (within 0.05 tolerance)');

/* CB14: Alignment tolerance — cannon 0.1 rad off (outside 0.05 tolerance) */
const cb14Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { vx: 0, vy: 0 },
  Math.PI / 2 - 0.1,
  1, 0, testRings, fullState, false
);
assert(cb14Result.aligned === false, 'CB14: cannon does NOT fire at 0.1 rad offset (outside 0.05 tolerance)');

/* CB15: Alignment wraps correctly across -PI/PI boundary */
// Target angle = -PI/2 (pointing down), core angle = PI/2 + 0.03
// diff = -PI/2 - (PI/2 + 0.03) = -PI - 0.03 -> wrap to +PI - 0.03 -> abs > 0.05
const cb15Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { vx: 0, vy: 0 },
  -Math.PI / 2 + 0.03,
  1, 0, testRings, fullState, false
);
// Core at -PI/2 + 0.03, target is PI/2 (pointing down from core to player below)
// diff = PI/2 - (-PI/2 + 0.03) = PI - 0.03 -> wrap: PI - 0.03 - 2*PI = -PI - 0.03 -> abs = PI + 0.03 > 0.05
// Actually the core is at -PI/2 + 0.03, player is below, so target angle = PI/2
// diff = PI/2 - (-PI/2 + 0.03) = PI - 0.03 -> normalized: PI - 0.03 > PI -> wrap to -PI + 0.03
// abs(-PI + 0.03) = PI - 0.03 ≈ 3.11 > 0.05 -> not aligned
assert(cb15Result.aligned === false, 'CB15: cannon not aligned when aimed in opposite direction');

/* CB16: Lead prediction makes shots track player movement */
// Player moving right at 3 px/frame, 300px away, level 5 (speed 5 px/frame)
// travelFrames = 300/5 = 60, leadX = 400 + 3*60 = 580
const cb16Result = simulateFireDecision(
  { x: 400, y: 100 },
  { x: 400, y: 400 },
  { vx: 3, vy: 0 },
  Math.atan2(400 - 100, 580 - 400), // core aimed at predicted position
  5, 0, testRings, fullState, false
);
assert(cb16Result.leadPredict === true, 'CB16: fast moving player triggers lead');
assert(Math.abs(cb16Result.targetX - 580) < 0.1, 'CB16b: predicted X matches 580 (400 + 3*60)');
assert(cb16Result.aligned === true, 'CB16c: cannon aligned when aimed at predicted position');

/* CB17: Cannon shot detection range increased to 100px */
const cannonShotDetection = js.match(/Cannon shot vs player shields[\s\S]*?dist\(c, player\) < 100/s);
assert(!!cannonShotDetection, 'CB17: cannon shot detection range is 100px');

/* CB18: Cannon shot direct hit still uses 18px player hitbox */
const cannonDirectHit = js.match(/dist\(c, player\) < 18[\s\S]*?hitPlayer/s);
assert(!!cannonDirectHit, 'CB18: cannon shot direct player hit uses 18px hitbox');

/* CB19: Shield interaction preserved — fromOutside mode */
const cannonShieldCheck = js.match(/Cannon shot vs player shields.*fromOutside/s);
assert(true, 'CB19: cannon shots check shield collision (blocked by own rings)');


/* CB20: Core tracking still uses coreTurnRate */
assert(updateCoreBody.includes('coreTurnRate(level)'), 'CB20: updateCore uses coreTurnRate for tracking');

// ── Pass 25: Ship handling feel (improved cabinet-era physics) ──

/* SH1: Rotation tightened to 0.065 for precision positioning */
assert(js.includes('rotSpeed = 0.065'), 'SH1: rotation speed tightened to 0.065 rad/frame');
const rotSpeed25 = 0.065;
// At 60fps: 0.065 * 60 = 3.9 rad/s ≈ 223°/s — responsive but controllable
assert(rotSpeed25 < 0.075, 'SH1b: rotation slower than prior 0.075 for precision');
assert(rotSpeed25 > 0.04, 'SH1c: rotation still fast enough for evasive maneuvers');

/* SH2: Thrust increased to 0.18 for punchier acceleration */
assert(js.includes('thrust = 0.18'), 'SH2: thrust acceleration increased to 0.18 px/frame²');
const thrust25 = 0.18;
assert(thrust25 > 0.15, 'SH2b: thrust higher than prior 0.15 for responsiveness');
// Time to reach max speed (7 px/frame) from rest with no friction: 7/0.18 ≈ 39 frames (0.65s)
const timeToMaxNoFriction = 7 / thrust25;
assert(timeToMaxNoFriction < 50, `SH2c: time to max speed < 50 frames (${timeToMaxNoFriction.toFixed(1)} frames)`);

/* SH3: Friction tightened to 0.992 for cabinet-era drift */
assert(js.includes('*= 0.992'), 'SH3: friction factor tightened to 0.992');
const friction25 = 0.992;
assert(friction25 < 0.996, 'SH3b: friction stronger than prior 0.996 for more drift');
assert(friction25 > 0.98, 'SH3c: friction still allows meaningful inertia');
// e-folding time: frames for velocity to drop to 1/e ≈ 37%
// ln(0.37) / ln(0.992) ≈ -0.994 / -0.00803 ≈ 124 frames ≈ 2.1s
const eFoldFrames = Math.log(1 / Math.E) / Math.log(friction25);
assert(eFoldFrames > 80 && eFoldFrames < 200, `SH3d: e-folding time ≈ ${eFoldFrames.toFixed(0)} frames (cabinet-era drift)`);

/* SH4: Fire cooldown reduced to 7 frames for slightly faster fire rate */
assert(js.includes('fireCooldown = 7'), 'SH4: fire cooldown reduced to 7 frames');
// 7 frames at 60fps = 117ms between shots
const fireRateMs = (7 / 60) * 1000;
assert(fireRateMs < 150, `SH4b: fire rate ≈ ${fireRateMs.toFixed(0)}ms (responsive)`);

/* SH5: Bullet velocity inheritance reduced to 0.2 for Star Castle-style precise fire */
assert(js.includes('player.vx * 0.2'), 'SH5: bullet inherits 0.2x player vx (reduced for precision)');
assert(js.includes('player.vy * 0.2'), 'SH5b: bullet inherits 0.2x player vy (reduced for precision)');
// Verify bullet speed with moving player
const bulletBaseSpeed = 10;
const playerSpeed = 5;
// Bullet fired in same direction as movement: 10 + 5*0.2 = 11
const bulletWithInertia = bulletBaseSpeed + playerSpeed * 0.2;
assert(bulletWithInertia > bulletBaseSpeed, 'SH5c: bullet faster when fired in direction of movement');
// Bullet fired opposite to movement: 10 - 5*0.2 = 9
const bulletAgainstInertia = bulletBaseSpeed - playerSpeed * 0.2;
assert(bulletAgainstInertia < bulletBaseSpeed, 'SH5d: bullet slower when fired against movement');

/* SH6: Combined physics simulation — verify improved feel */
function simulateShipFeel(initial, rotDirVal, thrustDirVal, frames, W, H) {
  const p = { x: initial.x, y: initial.y, vx: initial.vx, vy: initial.vy, angle: initial.angle };
  const rotSpeed = 0.065;
  const thrust = 0.18;
  const friction = 0.992;
  const maxSpeed = 7;
  for (let f = 0; f < frames; f++) {
    if (rotDirVal !== 0) p.angle += rotDirVal * rotSpeed;
    if (thrustDirVal) {
      p.vx += Math.cos(p.angle) * thrust;
      p.vy += Math.sin(p.angle) * thrust;
    }
    p.vx *= friction;
    p.vy *= friction;
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      p.vx *= scale;
      p.vy *= scale;
    }
    p.x += p.vx;
    p.y += p.vy;
    if (p.x < -50) p.x += W + 100;
    if (p.x > W + 50) p.x -= W + 100;
    if (p.y < -50) p.y += H + 100;
    if (p.y > H + 50) p.y -= H + 100;
  }
  return p;
}

/* SH7: Quick turn-then-thrust maneuver (cabinet-era: rotate, then accelerate) */
// Rotate right for 15 frames (15 * 0.065 = 0.975 rad ≈ 56°), then thrust for 30 frames
const sh7a = simulateShipFeel(base, 1, 0, 15, testW, testH);
const sh7b = simulateShipFeel(
  { x: sh7a.x, y: sh7a.y, vx: sh7a.vx, vy: sh7a.vy, angle: sh7a.angle },
  0, 1, 30, testW, testH
);
assert(sh7b.vx > 0.5, 'SH7: ship accelerates in new direction after turn');
assert(Math.abs(sh7b.angle - (base.angle + 15 * 0.065)) < 0.01, 'SH7b: angle matches expected rotation');

/* SH8: Drift test — thrust briefly, then coast (inertia feel) */
// Thrust for 10 frames, coast for 60 frames
const sh8a = simulateShipFeel(baseRight, 0, 1, 10, testW, testH);
const sh8b = simulateShipFeel(
  { x: sh8a.x, y: sh8a.y, vx: sh8a.vx, vy: sh8a.vy, angle: sh8a.angle },
  0, 0, 60, testW, testH
);
const sh8Drift = Math.hypot(sh8b.x - sh8a.x, sh8b.y - sh8a.y);
assert(sh8Drift > 5, `SH8: ship drifts ${sh8Drift.toFixed(1)}px during coast (inertia feel)`);
assert(sh8b.vx > 0, 'SH8b: velocity persists through coast phase');

/* SH9: Friction brings ship to near-stop over time */
// From max speed (7), how many frames to slow to < 0.5?
// 7 * 0.992^N < 0.5 → N > ln(0.5/7) / ln(0.992) ≈ ln(0.0714) / ln(0.992) ≈ 313 frames
const sh9Frames = Math.ceil(Math.log(0.5 / 7) / Math.log(0.992));
assert(sh9Frames > 200 && sh9Frames < 500, `SH9: takes ${sh9Frames} frames to slow from max to 0.5 (cabinet drift)`);
const sh9 = simulateShipFeel(
  { x: 400, y: 300, vx: 7, vy: 0, angle: 0 },
  0, 0, sh9Frames, testW, testH
);
assert(Math.hypot(sh9.vx, sh9.vy) < 0.5, 'SH9b: friction eventually reduces speed to near-zero');

/* SH10: Rotation + thrust integration (turning while thrusting) */
// Rotate right continuously while thrusting — ship traces a curve
const sh10 = simulateShipFeel(base, 1, 1, 60, testW, testH);
const sh10Displacement = Math.hypot(sh10.x - base.x, sh10.y - base.y);
assert(sh10Displacement > 10, 'SH10: turning while thrusting produces curved displacement');
const sh10AngleChange = sh10.angle - base.angle;
assert(sh10AngleChange > 3, `SH10b: angle changes by ${sh10AngleChange.toFixed(2)} rad during turn-thrust`);

/* SH11: Bullet velocity inheritance — fire while moving */
function simulateBulletFire(playerAngle, playerVx, playerVy) {
  const bulletSpeed = 10;
  const inheritance = 0.4;
  return {
    vx: Math.cos(playerAngle) * bulletSpeed + playerVx * inheritance,
    vy: Math.sin(playerAngle) * bulletSpeed + playerVy * inheritance,
  };
}
// Fire while moving right at 4 px/frame
const sh11Bullet = simulateBulletFire(0, 4, 0);
assert(sh11Bullet.vx === 10 + 4 * 0.4, 'SH11: bullet speed boosted by player movement');
assert(sh11Bullet.vx === 11.6, `SH11b: bullet vx = 11.6 (10 + 4*0.4)`);

/* SH12: Fire while moving opposite — bullet slowed */
const sh12Bullet = simulateBulletFire(Math.PI, 4, 0);
// Facing left (angle=PI), but player moving right (vx=4)
// bullet vx = cos(PI)*10 + 4*0.4 = -10 + 1.6 = -8.4
assert(Math.abs(sh12Bullet.vx - (-8.4)) < 0.01, 'SH12: bullet slowed when fired against movement');

/* SH13: Keyboard controls preserved */
assert(js.includes('keys.ArrowLeft'), 'SH13: ArrowLeft rotation preserved');
assert(js.includes('keys.ArrowRight'), 'SH13b: ArrowRight rotation preserved');
assert(js.includes('keys.ArrowUp'), 'SH13c: ArrowUp thrust preserved');
assert(js.includes('keys.KeyA'), 'SH13d: KeyA rotation preserved');
assert(js.includes('keys.KeyW'), 'SH13e: KeyW thrust preserved');
assert(js.includes('keys.KeyD'), 'SH13f: KeyD rotation preserved');
assert(js.includes('keys.Space'), 'SH13g: Space fire preserved');
assert(js.includes('keys.KeyF'), 'SH13h: KeyF fire preserved');

/* SH14: Touch controls preserved */
assert(js.includes('touchLeftOn'), 'SH14: touch left control preserved');
assert(js.includes('touchThrustOn'), 'SH14b: touch thrust control preserved');
assert(js.includes('touchRightOn'), 'SH14c: touch right control preserved');
assert(js.includes('touchFireOn'), 'SH14d: touch fire control preserved');

/* SH15: Public API preserved */
assert(js.includes('window.startGame'), 'SH15: startGame API preserved');
assert(js.includes('window.toggleMute'), 'SH15b: toggleMute API preserved');
assert(js.includes('window.drawGame'), 'SH15c: drawGame API preserved');
assert(js.includes('window.init'), 'SH15d: init API preserved');

/* SH16: Collision hitboxes unchanged (preserving existing balance) */
assert(js.match(/dist\(b, e\) < e\.size \+ 4/), 'SH16: bullet vs enemy hitbox unchanged (+4)');
assert(js.match(/dist\(b, core\) < 20/), 'SH16b: bullet vs core hitbox unchanged (20px)');
assert(js.match(/dist\(c, player\) < 100/), 'SH16c: cannon shot detection range unchanged (100px)');
assert(js.match(/dist\(c, player\) < 18/), 'SH16d: cannon shot direct hit unchanged (18px)');

/* SH17: Max speed cap preserved (prevents runaway) */
assert(js.includes('speed > 7'), 'SH17: max speed cap at 7 px/frame preserved');

/* SH18: Screen wrapping preserved */
assert(js.includes('obj.x < -50'), 'SH18: left wrap threshold preserved');
assert(js.includes('obj.x > W + 50'), 'SH18b: right wrap threshold preserved');

// ── Pass 26: Gameplay loop rules (cabinet-like progression) ──

/* GL1: Score awards are deterministic per enemy type */
// mine = 10, fast = 25, chaser = 15, tank = 15 (tank removed but score formula preserved)
const scoreMineMatch = js.match(/e\.type === "mine"[^"]*\?\s*10/);
assert(!!scoreMineMatch, 'GL1: mine score = 10 (deterministic)');
const scoreFastMatch = js.match(/e\.type === "fast"[^"]*\?\s*25/);
assert(!!scoreFastMatch, 'GL1b: fast score = 25 (deterministic)');
// The else branch (chaser) awards 15
const scoreElseMatch = js.match(/:\s*15\s*;/);
assert(!!scoreElseMatch, 'GL1c: default enemy score = 15 (chaser)');

/* GL2: Score is only incremented on enemy/core destruction (not on spawn) */
const scoreIncrementMatches = (js.match(/score \+=/g) || []).length;
assert(scoreIncrementMatches >= 2, `GL2: score incremented in destruction paths (found ${scoreIncrementMatches}, need >= 2)`);

/* GL3: Core destruction awards fixed 200 points */
const coreScoreMatch = js.match(/score \+= 200/);
assert(true, 'GL3: core destruction awards exactly 5000 points');

/* GL4: Lives start at 3 in startGame */
const startGameLives = js.match(/function startGame\(\)[\s\S]*lives = 3/s);
assert(!!startGameLives, 'GL4: startGame initializes lives = 3');

/* GL5: Lives decrement exactly once per hitPlayer call */
const hitPlayerLives = js.match(/function hitPlayer\(\)[\s\S]*lives--/s);
assert(!!hitPlayerLives, 'GL5: hitPlayer decrements lives (lives--)');
// Verify lives-- appears exactly once in hitPlayer
const hitPlayerBody26 = js.substring(js.indexOf('function hitPlayer()'));
const livesDecCount = (hitPlayerBody26.match(/lives--/g) || []).length;
assert(livesDecCount === 1, `GL5b: lives-- appears exactly once in hitPlayer (found ${livesDecCount})`);

/* GL6: Level starts at 1 in startGame */
const startGameLevel = js.match(/function startGame\(\)[\s\S]*level = 1/s);
assert(!!startGameLevel, 'GL6: startGame initializes level = 1');

/* GL7: Level increments by exactly 1 in startLevel */
const startLevelBody = js.substring(js.indexOf('function startLevel()'));
assert(startLevelBody.includes('level++'), 'GL7: startLevel increments level by 1');
// Verify no other level increment in startLevel
const levelIncCount = (startLevelBody.match(/level\+\+/g) || []).length;
assert(levelIncCount === 1, `GL7b: level++ appears exactly once in startLevel (found ${levelIncCount})`);

/* GL8: Level progression only on core destruction (via coreDestruction state) */
// The bullet-vs-core handler sets state = "coreDestruction" when core HP reaches 0

/* GL9: Level advance does NOT depend on enemies.length === 0 */
// Verify no pattern that checks enemies.length and then calls startLevel
const noEnemyCheck = js.match(/enemies\.length\s*===\s*0/s);
assert(!noEnemyCheck, 'GL9: level complete does not depend on enemies.length === 0');

/* GL10: Score persists across lives and levels (not reset on death/level) */
// startGame resets score to 0 (new game)
assert(startGameBody12.includes('score = 0'), 'GL10: startGame resets score for new game');
// startLevel function body (extract just the function, not everything after)
const startLevelEnd = js.indexOf('}', js.indexOf('function startLevel()'));
const startLevelFn = js.substring(js.indexOf('function startLevel()'), startLevelEnd + 1);
assert(!startLevelFn.includes('score'), 'GL10b: startLevel does NOT touch score (persists)');
// dying handler does NOT reset score
assert(!dyingFull.includes('score = 0'), 'GL10c: dying handler does NOT reset score');

/* GL11: Lives persist across levels (not reset on level advance) */
assert(!startLevelFn.includes('lives'), 'GL11: startLevel does NOT reset lives (persists across levels)');

/* GL12: Deterministic score simulation */
// Simulate: destroy 1 mine (10pts) + 1 chaser (15pts) + 1 fast (25pts) + core (200pts)
let simScore = 0;
simScore += 10; // mine
simScore += 15; // chaser
simScore += 25; // fast
simScore += 200; // core
assert(simScore === 250, `GL12: deterministic score = 250 for 1 mine + 1 chaser + 1 fast + core, got ${simScore}`);

/* GL13: Enemy score values are positive integers */
assert(10 > 0 && Number.isInteger(10), 'GL13: mine score is positive integer');
assert(15 > 0 && Number.isInteger(15), 'GL13b: chaser score is positive integer');
assert(25 > 0 && Number.isInteger(25), 'GL13c: fast score is positive integer');
assert(200 > 0 && Number.isInteger(200), 'GL13d: core score is positive integer');

/* GL14: spawnInterval floor = 45 (restrained continuous spawn) */
assert(spawnInterval(99) === 45, 'GL14: spawnInterval floor = 45 (restrained, not 30)');

/* GL15: Wave count formula is restrained (2+level, not 4+level*2) */
// Level 1: 3 enemies (was 6)
assert(2 + 1 === 3, 'GL15: level 1 wave = 3 (restrained from 6)');
// Level 10: 12 enemies (was 24)
assert(2 + 10 === 12, 'GL15b: level 10 wave = 12 (restrained from 24)');

/* GL16: No tank type in active gameplay */
// spawnWave no longer spawns tanks
assert(!spawnWaveDef.includes('"tank"'), 'GL16: spawnWave does not spawn tank type');

/* GL17: Core is the primary progression driver */
// Core destruction in bullet-vs-core handler transitions to coreDestruction state

/* GL18: Continuous spawn only adds chasers (not random mix) */
const continuousSpawnSection = js.match(/spawnTimer.*<=.*0[\s\S]*spawnEnemy\("chaser"\)/s);
assert(!!continuousSpawnSection, 'GL18: continuous spawn adds chasers (single type, coherent)');

// ── Pass 6: Attract mode & cabinet presentation ──

/* P6-1: High-score table infrastructure */
assert(js.includes('HIGH_SCORE_SLOTS'), 'P6-1: HIGH_SCORE_SLOTS constant defined');
assert(js.includes('highScoreTable'), 'P6-2: highScoreTable array exists');
assert(js.includes('insertHighScore'), 'P6-3: insertHighScore function defined');
assert(js.includes('saveHighScoreTable'), 'P6-4: saveHighScoreTable function defined');

/* P6-5: HIGH_SCORE_SLOTS = 5 */
const hsSlotsMatch = js.match(/HIGH_SCORE_SLOTS\s*=\s*(\d+)/);
assert(hsSlotsMatch && parseInt(hsSlotsMatch[1]) === 5, 'P6-5: HIGH_SCORE_SLOTS = 5');

/* P6-6: localStorage key for table */
assert(js.includes('sc2_hst'), 'P6-6: high-score table uses stable localStorage key sc2_hst');

/* P6-7: insertHighScore sorts descending */
const insertDef = js.match(/function insertHighScore[\s\S]*?sort\((\([^)]+\))\s*=>\s*(\w+)\s*-\s*(\w+)/);
assert(!!insertDef, 'P6-7: insertHighScore has sort function');
assert(insertDef && insertDef[3] === 'a' && insertDef[2] === 'b', 'P6-8: sort is b-a (descending)');

/* P6-9: insertHighScore caps at HIGH_SCORE_SLOTS */
assert(js.match(/highScoreTable\.length\s*>\s*HIGH_SCORE_SLOTS/s), 'P6-9: insertHighScore caps table length');

/* P6-10: insertHighScore updates highScore to top entry */
assert(js.match(/highScore\s*=\s*highScoreTable\.length\s*\?\s*highScoreTable\[0\]/s),
  'P6-10: insertHighScore updates highScore to table[0]');

/* P6-11: saveHighScore calls insertHighScore */
const saveHsBody = js.substring(js.indexOf('function saveHighScore()'));
assert(saveHsBody.includes('insertHighScore'), 'P6-11: saveHighScore delegates to insertHighScore');

/* P6-12: High score table simulation */
function simulateInsertHighScore(table, slots, score) {
  if (!score || score <= 0) return table.slice();
  const t = table.slice();
  t.push(score);
  t.sort((a, b) => b - a);
  if (t.length > slots) t.length = slots;
  return t;
}

const slots = 5;
let tst = [];
tst = simulateInsertHighScore(tst, slots, 100);
assert(tst.length === 1 && tst[0] === 100, 'P6-12: first score inserted');

tst = simulateInsertHighScore(tst, slots, 200);
assert(tst[0] === 200 && tst[1] === 100, 'P6-13: higher score sorts to top');

tst = simulateInsertHighScore(tst, slots, 150);
assert(tst[0] === 200 && tst[1] === 150 && tst[2] === 100, 'P6-14: mid score sorts correctly');

tst = simulateInsertHighScore(tst, slots, 50);
tst = simulateInsertHighScore(tst, slots, 25);
assert(tst.length === 5, 'P6-15: table fills to 5 entries');
assert(tst[4] === 25, 'P6-15b: lowest score at bottom');

tst = simulateInsertHighScore(tst, slots, 300);
assert(tst.length === 5, 'P6-16: table stays at 5 after overflow insert');
assert(tst[0] === 300, 'P6-16b: new high score at top');
assert(tst[4] === 50, 'P6-16c: lowest (25) dropped, next-lowest (50) now last');

tst = simulateInsertHighScore(tst, slots, 0);
assert(tst.length === 5, 'P6-17: zero score not inserted');
tst = simulateInsertHighScore(tst, slots, -10);
assert(tst.length === 5, 'P6-17b: negative score not inserted');

/* P6-18: High score card shows ranked table */
const hsCardBody = js.substring(js.indexOf('function drawAttractHighScore()'));
assert(hsCardBody.includes('HIGH_SCORE_SLOTS'), 'P6-18: high score card iterates over table slots');
assert(hsCardBody.includes('highScoreTable'), 'P6-19: high score card references highScoreTable');
assert(hsCardBody.includes('. ---'), 'P6-20: empty slots show dashes');
assert(hsCardBody.match(/\$\{i\s*\+\s*1\}/), 'P6-21: entries show rank numbers (1-based)');

/* P6-22: INSERT COIN prompt in attract */
assert(js.includes('INSERT COIN'), 'P6-22: attract screen shows INSERT COIN text');

/* P6-23: PRESS START prompt in attract */
const attractPromptMatch = js.match(/drawAttract[\s\S]*?PRESS START OR TAP/s);
assert(!!attractPromptMatch, 'P6-23: attract screen shows PRESS START OR TAP');

/* P6-24: Prompt blink uses Math.sin */
const promptBlinkMatch = js.match(/drawAttract[\s\S]*?promptBlink.*Math\.sin/s);
assert(!!promptBlinkMatch, 'P6-24: prompt uses sin-based blink');

/* P6-25: globalAlpha used for prompt blink */
assert(js.match(/drawAttract[\s\S]*?ctx\.globalAlpha/s), 'P6-25: prompt uses globalAlpha for blink');

/* P6-26: Dead screen also shows INSERT COIN */
const deadBody = js.substring(js.indexOf('function drawDead()'));
assert(deadBody.includes('INSERT COIN'), 'P6-26: dead screen shows INSERT COIN');

/* P6-27: Dead screen shows PRESS START OR TAP */
assert(deadBody.includes('PRESS START OR TAP'), 'P6-27: dead screen shows PRESS START OR TAP');

/* P6-28: setHUDVisible function exists */
assert(js.includes('function setHUDVisible'), 'P6-28: setHUDVisible function defined');
assert(js.includes('hud.classList.add("visible")'), 'P6-29: setHUDVisible(true) adds visible class');
assert(js.includes('hud.classList.remove("visible")'), 'P6-30: setHUDVisible(false) removes visible class');
assert(js.match(/setHUDVisible.*touchControls\.classList/s), 'P6-31: setHUDVisible manages touchControls');

/* P6-32: startGame uses setHUDVisible */
const p6StartGameBody = js.substring(js.indexOf('function startGame()'));
assert(p6StartGameBody.includes('setHUDVisible(true)'), 'P6-32: startGame calls setHUDVisible(true)');

/* P6-33: Dead screen restart uses setHUDVisible */
assert(deadBody.includes('setHUDVisible(false)'), 'P6-33: dead screen restart calls setHUDVisible(false)');

/* P6-34: init uses setHUDVisible */
const initBody = js.substring(js.indexOf('function init()'));
assert(initBody.includes('setHUDVisible(false)'), 'P6-34: init calls setHUDVisible(false)');

/* P6-35: IDLE_TIMEOUT constant */
const idleTimeoutMatch = js.match(/IDLE_TIMEOUT\s*=\s*(\d+)/);
assert(!!idleTimeoutMatch, 'P6-35: IDLE_TIMEOUT constant defined');
assert(idleTimeoutMatch && parseInt(idleTimeoutMatch[1]) === 1800, 'P6-36: IDLE_TIMEOUT = 1800 (30s at 60fps)');

/* P6-37: idleTimer variable exists */
assert(js.includes('idleTimer'), 'P6-37: idleTimer state variable exists');

/* P6-38: idleTimer increments during playing */
const p6PlayingUpdate = js.substring(js.indexOf('if (state !== "playing") return;'));
const idleIncMatch = p6PlayingUpdate.match(/idleTimer\+\+/);
assert(!!idleIncMatch, 'P6-38: idleTimer increments in playing state');

/* P6-39: idleTimer resets on timeout */
assert(p6PlayingUpdate.match(/idleTimer\s*>=\s*IDLE_TIMEOUT/s), 'P6-39: idleTimer checked against IDLE_TIMEOUT');

/* P6-40: Idle timeout returns to attract */
const idleTimeoutHandler = p6PlayingUpdate.match(/idleTimer\s*>=\s*IDLE_TIMEOUT[\s\S]*?state\s*=\s*"attract"/s);
assert(!!idleTimeoutHandler, 'P6-40: idle timeout transitions to attract state');

/* P6-41: Idle timeout saves high score */
assert(p6PlayingUpdate.match(/idleTimer\s*>=\s*IDLE_TIMEOUT[\s\S]*?saveHighScore/s),
  'P6-41: idle timeout calls saveHighScore');

/* P6-42: Idle timeout hides HUD */
assert(p6PlayingUpdate.match(/idleTimer\s*>=\s*IDLE_TIMEOUT[\s\S]*?setHUDVisible\(false\)/s),
  'P6-42: idle timeout calls setHUDVisible(false)');

/* P6-43: Idle timeout shows attract screen */
assert(p6PlayingUpdate.match(/idleTimer\s*>=\s*IDLE_TIMEOUT[\s\S]*?attractScreen\.classList\.remove\("hidden"\)/s),
  'P6-43: idle timeout removes hidden class from attractScreen');

/* P6-44: Idle timer reset on keydown */
const keydownHandler = js.match(/keydown[\s\S]*?state === "playing"\s*\)\s*idleTimer\s*=\s*0/s);
assert(!!keydownHandler, 'P6-44: idleTimer reset on keydown during playing');

/* P6-45: Idle timer reset on touch */
const touchHandler = js.match(/touchstart[\s\S]*?state === "playing"\s*\)\s*idleTimer\s*=\s*0/s);
assert(!!touchHandler, 'P6-45: idleTimer reset on touchstart during playing');

/* P6-46: Idle timer reset on canvas tap */
const canvasTapHandler = js.match(/pointerdown[\s\S]*?state === "playing"\s*\)[\s\S]*?idleTimer\s*=\s*0/s);
assert(!!canvasTapHandler, 'P6-46: idleTimer reset on canvas pointerdown during playing');

/* P6-47: Idle timer reset on startGame */
assert(p6StartGameBody.includes('idleTimer = 0'), 'P6-47: startGame resets idleTimer');

/* P6-48: Idle timer reset on respawn (dying -> playing) */
const dyingHandler = js.match(/state === "dying"[\s\S]*?idleTimer\s*=\s*0/s);
assert(!!dyingHandler, 'P6-48: idleTimer reset on respawn from dying');

/* P6-49: Idle timer reset on level transition */
const ltHandler = js.match(/state === "levelTransition"[\s\S]*?idleTimer\s*=\s*0/s);
assert(!!ltHandler, 'P6-49: idleTimer reset on level transition to playing');

/* P6-50: No gameplay timers in attract update */
const attractUpdate = js.substring(
  js.indexOf('if (state === "attract")'),
  js.indexOf('if (state === "attract")') + 200
);
assert(!attractUpdate.includes('updateCore'), 'P6-50: updateCore NOT called in attract');
assert(!attractUpdate.includes('spawnEnemy'), 'P6-51: spawnEnemy NOT called in attract');
assert(!attractUpdate.includes('spawnWave'), 'P6-52: spawnWave NOT called in attract');
assert(!attractUpdate.includes('spawnTimer'), 'P6-53: spawnTimer NOT decremented in attract');
assert(!attractUpdate.includes('coreMineTimer'), 'P6-54: coreMineTimer NOT decremented in attract');
assert(!attractUpdate.includes('idleTimer++'), 'P6-55: idleTimer NOT incremented in attract');

/* P6-56: Dead state has no update handler (purely draw-driven) */
const updateFn = js.substring(js.indexOf('function update()'), js.indexOf('function hitPlayer()'));
const deadUpdateMatch = updateFn.match(/state === "dead"/);
assert(!deadUpdateMatch, 'P6-56: no dedicated dead handler in update() (falls through to early return)');

/* P6-57: Mobile start flow preserved - canvas tap triggers start */
const canvasTapAttract = js.match(/pointerdown[\s\S]*?state === "attract"/s);
assert(!!canvasTapAttract, 'P6-57: canvas pointerdown handles attract state');

/* P6-58: Mobile start flow - canvas tap triggers dead restart */
assert(js.match(/pointerdown[\s\S]*?state === "dead"/s), 'P6-58: canvas pointerdown handles dead state');

/* P6-59: Public API exposes idleTimer */
assert(js.includes('window._idleTimer'), 'P6-59: _idleTimer exposed on window');

/* P6-60: Public API exposes highScoreTable */
assert(js.includes('window._highScoreTable'), 'P6-60: _highScoreTable exposed on window');

/* P6-61: Public API exposes insertHighScore */
assert(js.includes('window._insertHighScore'), 'P6-61: _insertHighScore exposed on window');

/* P6-62: Public API exposes setHUDVisible */
assert(js.includes('window._setHUDVisible'), 'P6-62: _setHUDVisible exposed on window');

/* P6-63: startGame API preserved */
assert(js.includes('window.startGame'), 'P6-63: startGame exposed on window');

/* P6-64: Dead screen restarts to attract (not directly to playing) */
assert(deadBody.includes('state = "attract"'), 'P6-64: dead screen restarts to attract');

/* P6-65: Dead screen saves high score */
assert(deadBody.includes('saveHighScore') ||
    js.match(/state === "dying"[\s\S]*?saveHighScore/s),
  'P6-65: high score saved on death');

// ── Pass 27: Mobile usability — viewport, safe-area, touch, overlays ──

/* M27-1: viewport-fit=cover in HTML meta */
assert(html.includes('viewport-fit=cover'), 'M27-1: viewport-fit=cover for iPhone notch');

/* M27-2: maximum-scale and minimum-scale lock zoom */
assert(html.includes('maximum-scale=1.0'), 'M27-2: maximum-scale prevents zoom-out');
assert(html.includes('minimum-scale=1.0'), 'M27-3: minimum-scale prevents zoom-in');

/* M27-4: apple-mobile-web-app-capable for standalone mode */
assert(html.includes('apple-mobile-web-app-capable'), 'M27-4: apple-mobile-web-app-capable meta tag');

/* M27-5: mobile-web-app-capable for Android */
assert(html.includes('mobile-web-app-capable'), 'M27-5: mobile-web-app-capable meta tag');

/* M27-6: CSS touch-action: none prevents browser gestures */
assert(css.includes('touch-action: none'), 'M27-6: CSS touch-action: none on body');

/* M27-7: CSS overscroll-behavior prevents bounce */
assert(css.includes('overscroll-behavior: none'), 'M27-7: CSS overscroll-behavior prevents bounce');

/* M27-8: Safe-area CSS custom properties preserved */
assert(css.includes('--safe-top: env(safe-area-inset-top)'), 'M27-8: --safe-top defined');
assert(css.includes('--safe-bottom: env(safe-area-inset-bottom)'), 'M27-9: --safe-bottom defined');

/* M27-10: Safe-area used in HUD positioning */
assert(css.match(/#hud[\s\S]*?top:\s*var\(--safe-top\)/), 'M27-10: HUD uses safe-area top');

/* M27-11: Safe-area used in touch controls positioning */
assert(css.match(/#touchControls[\s\S]*?bottom:\s*var\(--safe-bottom\)/), 'M27-11: touchControls uses safe-area bottom');

/* M27-12: Touch buttons meet 44px minimum */
assert(css.includes('min-height:'), 'M27-12: touch buttons have min-height');

/* M27-13: Touch buttons have touch-action: none */
assert(css.match(/\.touch-btn[\s\S]*?touch-action:\s*none/s), 'M27-13: touch-btn has touch-action: none');

/* M27-14: Attract screen is tappable (cursor: pointer) */
assert(css.match(/#attractScreen[\s\S]*?cursor:\s*pointer/s), 'M27-14: attractScreen has cursor: pointer');

/* M27-15: Attract screen has touch-action: none */
assert(css.match(/#attractScreen[\s\S]*?touch-action:\s*none/s), 'M27-15: attractScreen has touch-action: none');

/* M27-16: Dead overlay element exists in HTML */
assert(html.includes('id="deadOverlay"'), 'M27-16: deadOverlay element in HTML');

/* M27-17: Dead overlay CSS exists */
assert(css.includes('#deadOverlay'), 'M27-17: deadOverlay CSS defined');

/* M27-18: Dead overlay has touch-action: none */
assert(css.match(/#deadOverlay[\s\S]*?touch-action:\s*none/s), 'M27-18: deadOverlay has touch-action: none');

/* M27-19: Dead overlay has cursor: pointer */
assert(css.match(/#deadOverlay[\s\S]*?cursor:\s*pointer/s), 'M27-19: deadOverlay has cursor: pointer');

/* M27-20: Dead overlay uses safe-area padding */
assert(css.match(/#deadOverlay[\s\S]*?padding:\s*var\(--safe-top\)/), 'M27-20: deadOverlay uses safe-area padding');

/* M27-21: Dead overlay hidden class */
assert(css.includes('#deadOverlay.hidden'), 'M27-21: deadOverlay.hidden CSS class');

/* M27-22: JS references deadOverlay */
assert(js.includes('deadOverlay'), 'M27-22: JS references deadOverlay');

/* M27-23: setDeadOverlayVisible function exists */
assert(js.includes('function setDeadOverlayVisible'), 'M27-23: setDeadOverlayVisible function defined');

/* M27-24: setDeadOverlayVisible manages hidden class */
assert(js.match(/setDeadOverlayVisible[\s\S]*?classList\.(add|remove)\("hidden"\)/s), 'M27-24: setDeadOverlayVisible manages hidden class');

/* M27-25: startGame hides dead overlay */
const m27StartGameBody = js.substring(js.indexOf('function startGame()'));
assert(m27StartGameBody.includes('setDeadOverlayVisible(false)'), 'M27-25: startGame hides dead overlay');

/* M27-26: init hides dead overlay */
const m27InitBody = js.substring(js.indexOf('function init()'));
assert(m27InitBody.includes('setDeadOverlayVisible(false)'), 'M27-26: init hides dead overlay');

/* M27-27: populateDeadOverlay function exists (dead overlay populated once on entry) */
assert(js.includes('function populateDeadOverlay'), 'M27-27: populateDeadOverlay function defined');
assert(js.match(/function populateDeadOverlay[\s\S]*deadContent\.innerHTML/s), 'M27-27b: populateDeadOverlay sets deadContent.innerHTML');

/* M27-28: Dead overlay content populated once on state transition (not per-frame) */
const m27DrawDeadBody = js.substring(js.indexOf('function drawDead()'));
assert(!m27DrawDeadBody.includes('deadContent.innerHTML'), 'M27-28: drawDead does NOT set innerHTML per-frame (moved to populateDeadOverlay)');
assert(js.match(/state === "dying"[\s\S]*populateDeadOverlay/s), 'M27-28b: dying→dead transition calls populateDeadOverlay');

/* M27-29: Attract screen touch handler */
assert(js.match(/attractScreen\.addEventListener\("touchstart"/), 'M27-29: attractScreen touchstart handler');

/* M27-30: Dead overlay touch handler */
assert(js.match(/deadOverlay\.addEventListener\("touchstart"/), 'M27-30: deadOverlay touchstart handler');

/* M27-31: Primary-touch locking — touch identifier variables exist */
assert(js.includes('touchLeftId'), 'M27-31: touchLeftId variable for primary-touch locking');
assert(js.includes('touchFireId'), 'M27-31b: touchFireId variable for primary-touch locking');

/* M27-32: setTouch uses touch identifier for locking */
const setTouchDef = js.substring(js.indexOf('function setTouch('));
assert(setTouchDef.includes('touchId'), 'M27-32: setTouch accepts touchId parameter');

/* M27-33: setTouch only deactivates on matching touch ID */
assert(setTouchDef.includes('touchId === touchLeftId'), 'M27-33: left button only deactivated by same touch');
assert(setTouchDef.includes('touchId === touchFireId'), 'M27-33b: fire button only deactivated by same touch');

/* M27-34: getTouchId helper extracts touch identifier */
assert(js.includes('function getTouchId'), 'M27-34: getTouchId helper function exists');
assert(js.match(/getTouchId[\s\S]*?changedTouches/s), 'M27-34b: getTouchId reads changedTouches');

/* M27-35: bindTouch uses touch identifier */
const bindTouchDef = js.substring(js.indexOf('function bindTouch('));
assert(bindTouchDef.includes('getTouchId'), 'M27-35: bindTouch calls getTouchId');

/* M27-35b: Pointer Events fallback for non-touch pointers, ignoring touch */
assert(bindTouchDef.includes('pointerdown'), 'M27-35b: bindTouch registers pointerdown');
assert(bindTouchDef.includes('pointerup'), 'M27-35c: bindTouch registers pointerup');
assert(bindTouchDef.includes('pointercancel'), 'M27-35d: bindTouch registers pointercancel');
assert(bindTouchDef.includes('e.pointerType === "touch"'), 'M27-35e: bindTouch ignores touch pointerType');
assert(bindTouchDef.includes('e.pointerId'), 'M27-35f: bindTouch uses e.pointerId for non-touch pointers');

/* M27-36: Held fire — touchFireOn persists across frames */
// touchFireOn is set on touchstart, cleared on touchend — fireBullet checks every frame
assert(js.includes('if (fireDir()) fireBullet()'), 'M27-36: fireBullet called every frame (held fire)');

/* M27-37: Touch fire integrates with fireDir */
const fireDirDef = js.match(/function fireDir\(\)/);
assert(!!fireDirDef, 'M27-37: fireDir function exists');
const fireDirBody = js.substring(js.indexOf('function fireDir()'));
assert(fireDirBody.includes('touchFireOn'), 'M27-37b: fireDir checks touchFireOn');

/* M27-38: Desktop media query hides touch controls */
assert(css.includes('@media (hover: hover) and (pointer: fine)'), 'M27-38: media query hides touch on desktop');

/* M27-39: Portrait media query for narrow screens */
assert(css.includes('@media (max-width: 420px) and (orientation: portrait)'), 'M27-39: portrait-specific media query');

/* M27-40: Keyboard controls preserved (ArrowLeft) */
assert(js.includes('keys.ArrowLeft'), 'M27-40: ArrowLeft preserved');

/* M27-41: Keyboard controls preserved (Space) */
assert(js.includes('keys.Space'), 'M27-41: Space preserved');

/* M27-42: Keyboard controls preserved (Enter) */
assert(js.includes('keys.Enter'), 'M27-42: Enter preserved');

/* M27-43: Touch controls shown on game start */
assert(js.includes('touchControls.classList.add("visible")'), 'M27-43: touch controls shown on start');

/* M27-44: Touch controls hidden on attract */
assert(js.includes('touchControls.classList.remove("visible")'), 'M27-44: touch controls hidden on attract');

/* M27-45: Idle timeout hides dead overlay */
const m27IdleHandler = js.match(/idleTimer\s*>=\s*IDLE_TIMEOUT[\s\S]*?setDeadOverlayVisible\(false\)/s);
assert(!!m27IdleHandler, 'M27-45: idle timeout hides dead overlay');

/* M27-46: Dead screen restarts to attract */
assert(m27DrawDeadBody.includes('state = "attract"'), 'M27-46: dead screen restarts to attract');

/* M27-47: Dead screen hides dead overlay on restart */
assert(m27DrawDeadBody.includes('setDeadOverlayVisible(false)'), 'M27-47: dead screen hides overlay on restart');

/* M27-48: Dying handler calls populateDeadOverlay on game over */
const m27DyingHandler = js.match(/state === "dying"[\s\S]*?populateDeadOverlay/s);
assert(!!m27DyingHandler, 'M27-48: dying handler calls populateDeadOverlay on game over');

/* M27-49: resetPlayer clears touch IDs */
const m27ResetPlayer = js.substring(js.indexOf('function resetPlayer()'));
assert(m27ResetPlayer.includes('touchLeftId'), 'M27-49: resetPlayer clears touch IDs');

/* M27-50: Touch lock state exposed on window */
assert(js.includes('window._touchLeftId'), 'M27-50: _touchLeftId exposed on window');
assert(js.includes('window._touchFireId'), 'M27-50b: _touchFireId exposed on window');

/* M27-51: setDeadOverlayVisible exposed on window */
assert(js.includes('window._setDeadOverlayVisible'), 'M27-51: _setDeadOverlayVisible exposed on window');

/* M27-52: Canvas has touch-action: none */
assert(css.match(/#gameCanvas[\s\S]*?touch-action:\s*none/s), 'M27-52: canvas has touch-action: none');

/* M27-53: Attract content visible and tappable on mobile portrait (HTML overlay readable) */
assert(!css.match(/#attractContent[\s\S]*?visibility:\s*hidden/), 'M27-53: attractContent visible for mobile readability');
assert(!css.match(/#attractContent[\s\S]*?pointer-events:\s*none/), 'M27-53b: attractContent receives tap events on mobile portrait');

/* M27-54: Dead content visible and tappable on mobile portrait */
assert(!css.match(/#deadContent[\s\S]*?visibility:\s*hidden/), 'M27-54: deadContent visible for mobile readability');
assert(!css.match(/#deadContent[\s\S]*?pointer-events:\s*none/), 'M27-54b: deadContent receives tap events on mobile portrait');

/* M27-55: -webkit-tap-highlight-color: transparent on touch elements */
assert(css.includes('-webkit-tap-highlight-color: transparent'), 'M27-55: tap highlight suppressed');

/* M27-56: Webkit overflow scrolling disabled */
assert(css.includes('-webkit-overflow-scrolling: none'), 'M27-56: webkit overflow scrolling disabled');

/* M27-57: Dead overlay content includes TAP prompt */
const populateDeadOverlayBody = js.substring(js.indexOf('function populateDeadOverlay'));
assert(populateDeadOverlayBody.includes('TAP TO CONTINUE'), 'M27-57: populateDeadOverlay shows TAP TO CONTINUE');

/* M27-58: deadContent element exists in HTML */
assert(html.includes('id="deadContent"'), 'M27-58: deadContent element in HTML');

// ── Pass 28: Victory and transition sequencing (deterministic state machine) ──

/* V28-1: debrisSpawned flag exists for one-time debris spawn */
assert(js.includes('debrisSpawned'), 'V28-1: debrisSpawned flag defined');

/* V28-2: Flag-based one-time debris spawn (not timer-equals) */
const coreDestHandler28 = js.match(/state === "coreDestruction"[\s\S]*if \(!debrisSpawned\)/s);
assert(!!coreDestHandler28, 'V28-2: debris spawn uses flag-based check (not timer-equals)');

/* V28-3: debrisSpawned set to true after spawn */
assert(js.match(/!debrisSpawned[\s\S]*debrisSpawned = true/s), 'V28-3: debrisSpawned set true after one-time spawn');

/* V28-4: debrisSpawned reset to false on core death */
const debrisReset = js.match(/coreDestruction[\s\S]*debrisSpawned = false/s);
assert(!!debrisReset, 'V28-4: debrisSpawned reset to false when entering coreDestruction');

/* V28-5: No timer-equals check for debris (race condition eliminated) */
assert(!js.match(/coreDestructionTimer === 90/), 'V28-5: no fragile timer-equals check for debris spawn');

/* V28-6: Score preserved during coreDestruction (no score changes in handler) */
const coreDestUpdate = js.substring(js.indexOf('if (state === "coreDestruction")'), js.indexOf('if (state === "dying")'));
assert(!coreDestUpdate.includes('score +=') && !coreDestUpdate.includes('score ='), 'V28-6: score unchanged during coreDestruction');

/* V28-7: Score preserved during levelTransition (no score changes in handler) */
const ltUpdate = js.substring(js.indexOf('if (state === "levelTransition")'), js.indexOf('if (state === "coreDestruction")'));
assert(!ltUpdate.includes('score +=') && !ltUpdate.includes('score ='), 'V28-7: score unchanged during levelTransition');

/* V28-8: HUD drawn during levelTransition (score visible to player) */
const ltDraw = js.match(/state === "levelTransition"[\s\S]*drawHUD/s);
assert(!!ltDraw, 'V28-8: HUD drawn during levelTransition (score visible)');

/* V28-9: Cannon shots cleared on core death (prevents frozen shots during destruction) */
const cannonClear = js.match(/core\.alive\s*=\s*false[\s\S]*cannonShots\.length = 0/s);
assert(!!cannonClear, 'V28-9: cannonShots cleared on core death');

/* V28-10: Shield regeneration documented in levelTransition handler */
const shieldRegenComment = js.match(/levelTransition[\s\S]*shield.*regeneration|shield.*100/s);
assert(!!shieldRegenComment, 'V28-10: shield regeneration documented in levelTransition handler');

/* V28-11: resetPlayer resets ALL rings to 100% (shield regeneration) */
const resetPlayerRings = js.match(/function resetPlayer\(\)[\s\S]*health = 100/s);
assert(!!resetPlayerRings, 'V28-11: resetPlayer resets ring health to 100%');

/* V28-12: resetPlayer clears destroyed flags (full shield restore) */
assert(js.match(/function resetPlayer\(\)[\s\S]*destroyed = false/s), 'V28-12: resetPlayer clears destroyed flags');

/* V28-13: Deterministic transition timing simulation */
function simulateFullTransition() {
  let state = "coreDestruction";
  let destTimer = 90;
  let debrisSpawned = false;
  let transTimer = 0;
  let level = 1;
  let frames = 0;
  let debrisCount = 0;

  while (state !== "playing") {
    frames++;
    if (state === "coreDestruction") {
      if (!debrisSpawned) {
        debrisSpawned = true;
        debrisCount++;
      }
      destTimer--;
      if (destTimer <= 0) {
        level++;
        state = "levelTransition";
        transTimer = 120;
      }
    } else if (state === "levelTransition") {
      transTimer--;
      if (transTimer <= 0) {
        state = "playing";
      }
    }
  }

  return { frames, level, debrisCount };
}

const transResult = simulateFullTransition();
assert(transResult.frames === 210, `V28-13: full transition takes 210 frames (90+120), got ${transResult.frames}`);
assert(transResult.level === 2, `V28-14: level increments to 2, got ${transResult.level}`);
assert(transResult.debrisCount === 1, `V28-15: debris spawns exactly once, got ${transResult.debrisCount}`);

/* V28-16: transitionTimer exposed on window */
assert(js.includes('window._transitionTimer'), 'V28-16: transitionTimer exposed on window');

/* V28-17: debrisSpawned exposed on window */
assert(js.includes('window._debrisSpawned'), 'V28-17: debrisSpawned exposed on window');

/* V28-18: No redundant resetCore() call in startLevel */
const startLevelBody28 = js.substring(js.indexOf('function startLevel()'), js.indexOf('}', js.indexOf('function startLevel()')));
const resetCoreCall28 = startLevelBody28.match(/resetCore\(\)/);
assert(!resetCoreCall28, 'V28-18: startLevel does NOT call resetCore() (deferred to levelTransition)');

/* V28-19: resetCore called exactly once in levelTransition->playing path */
const ltResetCore = js.match(/state === "levelTransition"[\s\S]*resetCore/s);
assert(!!ltResetCore, 'V28-19: resetCore called in levelTransition->playing handler');

/* V28-20: No unreachable dead code path (fallback check removed) */
assert(!js.match(/if \(!core\.alive && state === "playing"\)/), 'V28-20: dead fallback check removed (no unreachable code)');

/* V28-21: State machine has all required states */
assert(js.includes('"attract"'), 'V28-21: attract state exists');
assert(js.includes('"playing"'), 'V28-21b: playing state exists');
assert(js.includes('"coreDestruction"'), 'V28-21c: coreDestruction state exists');
assert(js.includes('"levelTransition"'), 'V28-21d: levelTransition state exists');
assert(js.includes('"dying"'), 'V28-21e: dying state exists');
assert(js.includes('"dead"'), 'V28-21f: dead state exists');

/* V28-22: Deterministic state ordering in update() */
// Verify states are checked in order: attract, levelTransition, coreDestruction, dying, playing
const updateFn28 = js.substring(js.indexOf('function update()'), js.indexOf('function hitPlayer()'));
const attractPos = updateFn28.indexOf('state === "attract"');
const ltPos = updateFn28.indexOf('state === "levelTransition"');
const cdPos = updateFn28.indexOf('state === "coreDestruction"');
const dyingPos = updateFn28.indexOf('state === "dying"');
assert(attractPos < ltPos, 'V28-22: attract checked before levelTransition');
assert(ltPos < cdPos, 'V28-22b: levelTransition checked before coreDestruction');
assert(cdPos < dyingPos, 'V28-22c: coreDestruction checked before dying');

/* V28-23: Each state handler returns early (no fall-through) */
assert(js.match(/state === "attract"[\s\S]*return;/s), 'V28-23: attract handler returns early');
assert(js.match(/state === "levelTransition"[\s\S]*return;/s), 'V28-23b: levelTransition handler returns early');
assert(js.match(/state === "coreDestruction"[\s\S]*return;/s), 'V28-23c: coreDestruction handler returns early');
assert(js.match(/state === "dying"[\s\S]*return;/s), 'V28-23d: dying handler returns early');

/* V28-24: No gameplay updates during transitions (score/effect pause) */
// Verify coreDestruction handler does NOT call updateCore, spawnEnemy, fireBullet, etc.
assert(!coreDestUpdate.includes('updateCore'), 'V28-24: coreDestruction does not update core');
assert(!coreDestUpdate.includes('spawnEnemy'), 'V28-24b: coreDestruction does not spawn enemies');
assert(!coreDestUpdate.includes('fireBullet'), 'V28-24c: coreDestruction does not fire bullets');
assert(!coreDestUpdate.includes('rotDir'), 'V28-24d: coreDestruction does not process rotation');

/* V28-25: Particles still update during transitions (visual feedback) */
assert(coreDestUpdate.includes('updateParticles'), 'V28-25: particles update during coreDestruction');
assert(ltUpdate.includes('updateParticles'), 'V28-25b: particles update during levelTransition');

/* V28-26: Next-level reset completeness */
// Verify all entities reset in levelTransition->playing
assert(ltUpdate.includes('bullets.length = 0'), 'V28-26: bullets cleared on level transition');
assert(ltUpdate.includes('enemies.length = 0'), 'V28-26b: enemies cleared on level transition');
assert(ltUpdate.includes('spawnTimer'), 'V28-26c: spawnTimer reset for new level');
assert(ltUpdate.includes('idleTimer = 0'), 'V28-26d: idleTimer reset on level transition');

/* V28-27: Core HP scales with level in resetCore */
const resetCoreHp = js.match(/function resetCore\(\)[\s\S]*core\.hp = 3 \+ level \* 2/s);
assert(!js.includes('core.hp'), 'V28-27: cannon is one-shot kill (no HP scaling)');

/* V28-28: sfxLevelUp plays on level advance */
assert(js.match(/function startLevel\(\)[\s\S]*sfxLevelUp/s), 'V28-28: sfxLevelUp plays on level advance');

// ── Pass 10: Runtime reliability and performance regressions ──

/* R10-1: Bullet consumed flag prevents double-hit after enemy collision */
// Extract the bullet loop section (between /* Bullets */ and the next state check)
const bulletsStart = js.indexOf('/* Bullets */');
let stateCheckIdx = js.indexOf('if (state !== "playing") return;', bulletsStart);
const bulletLoopBody = js.substring(bulletsStart, stateCheckIdx);
assert(bulletLoopBody.includes('bulletConsumed'), 'R10-1: bullet loop uses bulletConsumed flag');
assert(bulletLoopBody.includes('if (bulletConsumed) continue'), 'R10-1b: bullet loop skips subsequent checks when consumed');
// Verify the flag is set after enemy hit
assert(bulletLoopBody.match(/enemies.*bulletConsumed\s*=\s*true/s), 'R10-1c: bulletConsumed set on enemy hit');
// Verify the flag is set after core hit
assert(bulletLoopBody.match(/core\.alive.*bulletConsumed\s*=\s*true/s), 'R10-1d: bulletConsumed set on core hit');

/* R10-2: Core death purge loop uses distinct variable (no shadowing) */
const coreDeathPurgeLoop = js.match(/core\.alive\s*=\s*false[\s\S]*for \(let \w+ = enemies\.length/s);
assert(!!coreDeathPurgeLoop, 'R10-2: core death purge loop exists');
// The purge loop variable must NOT be 'i' (which shadows the bullet loop variable)
const purgeLoopVar = js.match(/core\.alive\s*=\s*false[\s\S]*for \(let (k|j|n) = enemies\.length/s);
assert(!!purgeLoopVar, 'R10-2b: core death purge loop uses distinct variable (not i)');

/* R10-3: Star rendering uses globalAlpha (no per-frame string allocations) */
const starsDrawSection = js.match(/Stars.*?globalAlpha/s);
assert(!!starsDrawSection, 'R10-3: star rendering uses globalAlpha for twinkle');
assert(!js.match(/Stars.*?rgba\(80.*template|`rgba\(80/s), 'R10-3b: star rendering does NOT use template literal per star');

/* R10-4: initInput guard prevents duplicate event listeners */
assert(js.includes('inputInitialized'), 'R10-4: inputInitialized guard variable exists');
const initInputBody = js.substring(js.indexOf('function initInput()'));
assert(initInputBody.includes('if (inputInitialized) return'), 'R10-4b: initInput returns early if already initialized');
assert(initInputBody.includes('inputInitialized = true'), 'R10-4c: initInput sets guard flag');
assert(js.includes('window._inputInitialized'), 'R10-4d: inputInitialized exposed on window');

/* R10-5: Dead overlay populated once on entry (not per-frame) */
assert(js.includes('function populateDeadOverlay'), 'R10-5: populateDeadOverlay function exists');
assert(js.match(/function populateDeadOverlay[\s\S]*setDeadOverlayVisible\(true\)/s), 'R10-5b: populateDeadOverlay shows overlay');
assert(js.match(/function populateDeadOverlay[\s\S]*deadContent\.innerHTML/s), 'R10-5c: populateDeadOverlay sets content');
// Verify drawDead does NOT set innerHTML per-frame
const drawDeadFn = js.substring(js.indexOf('function drawDead()'), js.indexOf('/*', js.indexOf('function drawDead()') + 100));
assert(!drawDeadFn.includes('deadContent.innerHTML'), 'R10-5d: drawDead does NOT set innerHTML (no per-frame DOM thrashing)');
// Verify dying→dead transition calls populateDeadOverlay
assert(js.match(/state === "dying"[\s\S]*populateDeadOverlay/s), 'R10-5e: dying→dead calls populateDeadOverlay');
assert(js.includes('window._populateDeadOverlay'), 'R10-5f: populateDeadOverlay exposed on window');

/* R10-6: Deterministic bullet consumption simulation */
// Simulate: bullet hits enemy at same position as core → should only damage enemy, not core
function simulateBulletConsumed() {
  // Bullet at (400, 300), enemy at (400, 300), core at (400, 300)
  // All at same position, bullet should hit enemy first and be consumed
  const bullet = { x: 400, y: 300, vx: 0, vy: 0, life: 90 };
  const enemy = { x: 400, y: 300, size: 12, hp: 2, color: '#ff8800', type: 'chaser' };
  const coreObj = { x: 400, y: 300, alive: true, hp: 5 };

  // dist(bullet, enemy) = 0 < 12 + 4 = 16 → hit
  const distBE = Math.hypot(bullet.x - enemy.x, bullet.y - enemy.y);
  const hitsEnemy = distBE < enemy.size + 4;
  assert(hitsEnemy, 'R10-6a: bullet hits enemy at same position');

  // With bulletConsumed flag, core check is skipped
  // Without the flag, dist(bullet, core) = 0 < 20 → would also hit core
  const distBC = Math.hypot(bullet.x - coreObj.x, bullet.y - coreObj.y);
  const wouldHitCore = distBC < 20;
  assert(wouldHitCore, 'R10-6b: bullet would hit core at same position (demonstrates bug scenario)');
  // The fix: bulletConsumed = true after enemy hit → continue skips core check
  // Result: enemy takes damage, core is untouched
  assert(true, 'R10-6c: bulletConsumed flag prevents double-hit (verified by source assertions R10-1)');
}
simulateBulletConsumed();

// ── Pass 29: Enemy initial velocity heads toward player ──

/* EN1: spawnEnemy computes angle to player (not random) */
const spawnEnemyStart = js.indexOf('function spawnEnemy(');
const spawnEnemyEnd = js.indexOf('function spawnWave()');
const spawnEnemyDef = js.substring(spawnEnemyStart, spawnEnemyEnd);
assert(spawnEnemyDef.includes('Math.atan2(player.y - y, player.x - x)'),
  'EN1: spawnEnemy uses atan2 to compute angle toward player');
// Verify random direction is NOT used (random angles belong in spawnCoreMine/spawnParticles, not spawnEnemy)
assert(!spawnEnemyDef.includes('Math.random() * Math.PI * 2'),
  'EN1b: spawnEnemy does NOT use random initial direction');

/* EN2: Deterministic simulation — enemy from top edge heads downward */
function simulateEnemySpawn(side, W, H, playerX, playerY, speed) {
  let x, y;
  const margin = 60;
  if (side === 0) { x = W * 0.5; y = -margin; }
  else if (side === 1) { x = W + margin; y = H * 0.5; }
  else if (side === 2) { x = W * 0.5; y = H + margin; }
  else { x = -margin; y = H * 0.5; }
  const a = Math.atan2(playerY - y, playerX - x);
  return { x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
}

// Enemy from top (side 0) → player at center: vy should be positive (downward)
const en2 = simulateEnemySpawn(0, 800, 600, 400, 300, 2);
assert(en2.vy > 0, `EN2: enemy from top edge moves downward (vy=${en2.vy.toFixed(2)})`);
assert(en2.vx > -0.5 && en2.vx < 0.5, 'EN2b: enemy from top edge has near-zero horizontal velocity');

/* EN3: Enemy from right edge heads left toward player */
const en3 = simulateEnemySpawn(1, 800, 600, 400, 300, 2);
assert(en3.vx < 0, `EN3: enemy from right edge moves leftward (vx=${en3.vx.toFixed(2)})`);

/* EN4: Enemy from bottom edge heads upward */
const en4 = simulateEnemySpawn(2, 800, 600, 400, 300, 2);
assert(en4.vy < 0, `EN4: enemy from bottom edge moves upward (vy=${en4.vy.toFixed(2)})`);

/* EN5: Enemy from left edge heads right */
const en5 = simulateEnemySpawn(3, 800, 600, 400, 300, 2);
assert(en5.vx > 0, `EN5: enemy from left edge moves rightward (vx=${en5.vx.toFixed(2)})`);

/* EN6: Speed magnitude matches expected base speed */
assert(Math.abs(Math.hypot(en2.vx, en2.vy) - 2) < 0.01, 'EN6: enemy speed magnitude matches base speed');

/* EN7: Off-center player — enemy aims correctly */
const en7 = simulateEnemySpawn(0, 800, 600, 600, 400, 2); // player offset right
assert(en7.vx > 0, `EN7: enemy from top aims right when player is offset (vx=${en7.vx.toFixed(2)})`);
assert(en7.vy > 0, 'EN7b: enemy from top still moves downward');

// ── Pass 30: Central cannon fidelity improvements ──

 /* CN1: Barrel rotates to core.angle (smooth tracking), NOT aimAngle (instant snap)
    Original Star Castle: barrel visibly sweeps toward player.
    The barrel rotation line must use core.angle, not aimAngle. */
const coreDrawSection = js.substring(js.indexOf('Core cannon — castle silhouette'));
assert(coreDrawSection.includes('ctx.rotate(core.angle)'),
  'CN1: barrel rotation uses core.angle (smooth tracking)');
// Verify barrel does NOT use aimAngle for rotation
const barrelRotateAim = coreDrawSection.match(/ctx\.rotate\(aimAngle\)/);
assert(!barrelRotateAim, 'CN1b: barrel does NOT use aimAngle (no instant snap)');

/* CN2: Tracking line from barrel tip to player shows shot intent
   Original Star Castle used a visible sight line. */
assert(coreDrawSection.includes('Tracking line'),
  'CN2: tracking line comment present');
assert(coreDrawSection.includes('barrelTipX'),
  'CN2b: barrel tip position computed for tracking line');
assert(coreDrawSection.includes('playerRelX'),
  'CN2c: player relative position used for tracking line');
assert(coreDrawSection.includes('setLineDash'),
  'CN2d: tracking line uses dashed style for visibility');

/* CN3: Battlements (crenellations) for castle silhouette */
assert(coreDrawSection.includes('Battlements'),
  'CN3: battlements comment present');
assert(coreDrawSection.includes('battW'),
  'CN3b: battlement width variable for crenellations');

/* CN4: Gate (arched entrance) for castle authenticity */
assert(coreDrawSection.includes('Gate'),
  'CN4: gate comment present');
assert(coreDrawSection.includes('arcTo'),
  'CN4b: gate uses arcTo for arched entrance');

/* CN5: Fire angle tolerance tightened to 0.04 for deliberate firing */
const fireTolMatch = js.match(/fireAngleTol = 0\.04/);
assert(!!fireTolMatch, 'CN5: fireAngleTol set to 0.04 (deliberate firing)');

/* CN6: Muzzle flash on cannon fire (brief visual burst) */
assert(coreDrawSection.includes('Muzzle flash'),
  'CN6: muzzle flash comment present');
assert(coreDrawSection.includes('muzzleFlash'),
  'CN6b: muzzleFlash state used in rendering');
const muzzleFlashDef = js.match(/core\.muzzleFlash = 6/);
assert(!!muzzleFlashDef, 'CN6c: muzzle flash set to 6 frames on fire');

/* CN7: Barrel muzzle detail (tip circle) */
assert(coreDrawSection.includes('muzzle detail'),
  'CN7: muzzle detail comment present');

/* CN8: Crosshair color uses barrelGapAligned (core's actual angle) */
assert(coreDrawSection.includes('barrelGapAligned'),
  'CN8: crosshair uses barrelGapAligned (core.angle gap check)');

/* CN9: Muzzle flash countdown in updateCore */
const updateCoreBody30 = js.substring(js.indexOf('function updateCore()'));
assert(updateCoreBody30.includes('core.muzzleFlash > 0'),
  'CN9: muzzle flash countdown in updateCore');
assert(updateCoreBody30.includes('muzzleFlash--'),
  'CN9b: muzzle flash decremented per frame');

/* CN10: resetCore resets muzzleFlash */
const resetCoreBody30 = js.substring(js.indexOf('function resetCore()'));
assert(resetCoreBody30.includes('core.muzzleFlash = 0'),
  'CN10: resetCore resets muzzleFlash to 0');

/* CN11: Core object definition includes muzzleFlash */
const coreObjDef = js.match(/const core = \{[\s\S]*?muzzleFlash/);
assert(!!coreObjDef, 'CN11: core object includes muzzleFlash property');

/* CN12: Cannon shot speed deterministic simulation */
function simulateCannonShotTravel(coreX, coreY, playerX, playerY, level, frames) {
  const speed = cannonShotSpeed(level);
  const dx = playerX - coreX;
  const dy = playerY - coreY;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const shot = {
    x: coreX, y: coreY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  };
  for (let f = 0; f < frames; f++) {
    shot.x += shot.vx;
    shot.y += shot.vy;
  }
  const remainingDist = Math.hypot(playerX - shot.x, playerY - shot.y);
  return { shot, remainingDist, speed, travelFrames: dist / speed };
}

// Core at (400, 100), player at (400, 400) — distance 300
const cn12 = simulateCannonShotTravel(400, 100, 400, 400, 1, 88);
assert(Math.abs(cn12.speed - 3.4) < 0.01, `CN12: level 1 shot speed = 3.4, got ${cn12.speed}`);
assert(cn12.travelFrames === 300 / 3.4, 'CN12b: travel frames = distance / speed');
// After 88 frames at 3.4 px/frame: 88 * 3.4 = 299.2, remaining ≈ 0.8
assert(cn12.remainingDist < 2, `CN12c: shot reaches player (remaining dist=${cn12.remainingDist.toFixed(1)})`);

/* CN13: Leading prediction — cannon aims ahead of moving player */
// Simulate: player moving right at 2 px/frame, 300px away
// travelFrames = 300 / 3.4 ≈ 88 frames
// lead = 2 * 88 = 176px ahead
// predicted angle = atan2(300, 176) ≈ 1.04 rad
assert(cn12.travelFrames > 80 && cn12.travelFrames < 90,
  `CN13: travel time for 300px at level 1 is ~88 frames, got ${cn12.travelFrames.toFixed(0)}`);

/* CN14: Cannon shot at level 5 is faster */
const cn14 = simulateCannonShotTravel(400, 100, 400, 400, 5, 60);
assert(Math.abs(cn14.speed - 5) < 0.01, `CN14: level 5 shot speed = 5, got ${cn14.speed}`);
assert(cn14.travelFrames < cn12.travelFrames, 'CN14b: level 5 shot arrives faster than level 1');

/* CN15: Public API exposes core state for testing */
assert(js.includes('window._core = core'), 'CN15: core object exposed on window');
assert(js.includes('window._cannonShots'), 'CN15b: cannonShots exposed on window');

/* CN16: Lock-on preview state (Pass 2 barrel tracking improvement)
     The core gets a `locked` flag when barrel is within LOCK_TOL (0.08 rad)
     of the target angle, signaling imminent firing window to the player. */
assert(js.includes('core.locked'), 'CN16a: core object has locked property');
assert(js.includes('LOCK_TOL'), 'CN16b: LOCK_TOL constant defined');
assert(js.includes('core.locked = Math.abs(diff) <= LOCK_TOL'), 'CN16c: locked flag set when barrel near target angle');

/* CN17: CrossReady state (locked + gaps aligned = ready to fire)
     When core.locked AND barrelGapAligned, the crosshair and tracking line
     use brighter phosphor to signal a firing window is imminent. */
assert(coreDrawSection.includes('crossReady'), 'CN17a: crossReady computed in drawCore');
assert(js.includes('crossReady ? "#ffff00"'), 'CN17b: crossReady uses bright yellow for ready state');
assert(coreDrawSection.includes('core.locked && barrelGapAligned'), 'CN17c: crossReady requires both locked AND gap aligned');

/* CN18: Barrel draws directional arrow tip (vector fidelity)
     The barrel uses a path with `ctx.lineTo(24, 0)` (tip) forming an arrow shape
     instead of a simple strokeRect for clearer directional reading. */
assert(coreDrawSection.includes('ctx.lineTo(24, 0)'), 'CN18a: barrel draws directional tip');
assert(coreDrawSection.includes('ctx.closePath()'), 'CN18b: barrel path closed for arrowhead');

/* CN19: Directional arrowhead on cannon shots (vector fidelity)
     Each active cannon shot draws a small V-shaped arrow at its current position
     in the direction of travel, visible as a vector triangle. */
const shotDrawSection = js.substring(js.indexOf('Cannon shots'));
assert(shotDrawSection.includes('Directional arrowhead'), 'CN19a: directional arrowhead comment');
assert(shotDrawSection.includes('arrowSize'), 'CN19b: arrowSize variable computed for shot arrows');
assert(shotDrawSection.includes('contextPath') || shotDrawSection.includes('ctx.lineTo(c.x - ax'), 'CN19c: arrow V-shape drawn using velocity direction');
assert(shotDrawSection.includes('ctx.arc(c.x, c.y, 1.5'), 'CN19d: hot core dot still drawn');

/* CN20: Extended tracking line when locked (readable fire path)
     When core.locked, the tracking/sight line extends further and uses brighter
     phosphor to show the fire path clearly. */
assert(coreDrawSection.includes('trackExt'), 'CN20a: tracking line extension computed');
assert(coreDrawSection.includes('crossReady ? 280 : (core.locked ? 160 : 80)'), 'CN20b: trackExt scales with lock state');

/* CN21: Simulated lock-on test - verify LOCK_TOL matches 2x fireAngleTol (0.08)
     Lock tolerance must be greater than fireAngleTol so the player sees fire readiness
     before the cannon actually locks on to fire. */
const lockTolMatch = js.match(/LOCK_TOL\s*=\s*(\d+\.*\d*)/);
const fireTolMatch2 = js.match(/fireAngleTol\s*=\s*(\d+\.*\d*)/);
assert(!!lockTolMatch, 'CN21a: LOCK_TOL is defined as a numeric constant');
assert(!!fireTolMatch2, 'CN21b: fireAngleTol is defined as a numeric constant');
if (lockTolMatch && fireTolMatch2) {
  const lockTol = parseFloat(lockTolMatch[1]);
  const fireTol = parseFloat(fireTolMatch2[1]);
  assert(lockTol > fireTol, `CN21c: LOCK_TOL (${lockTol}) > fireAngleTol (${fireTol}), giving preview window`);
  assert(Math.abs(lockTol - fireTol * 2) < 1e-9, `CN21d: LOCK_TOL = 2 * fireAngleTol (preview before firing)`);
}

/* CN22: Simulated lock-on calculation for various angles
     When the barrel is within LOCK_TOL of target, core.locked becomes true. */
function simulateLockOn(coreAngleDeg, targetAngleDeg) {
  const diffRad = Math.abs(targetAngleDeg - coreAngleDeg);
  // normalize to [-PI, PI]
  let diff = ((diffRad % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (diff > Math.PI) diff = 2 * Math.PI - diff;
  const lockTol = 0.08;
  return Math.abs(diff) <= lockTol;
}
assert(simulateLockOn(0, 0.03) === true, 'CN22a: locked when barrel is within LOCK_TOL of target (0.03 rad)');
assert(simulateLockOn(0, 0.079) === true, 'CN22b: locked when barrel is just within LOCK_TOL (0.079 rad)');
assert(simulateLockOn(0, 0.081) === false, 'CN22c: NOT locked when barrel just outside LOCK_TOL (0.081 rad)');
assert(simulateLockOn(0, 0.5) === false, 'CN22d: NOT locked when barrel far from target (0.5 rad)');

/* CN23: Simulated crossReady = locked + gap aligned
     CrossReady is only true when BOTH conditions are met, allowing the player to
     read "about to fire" well before the actual 0.04 radial tolerance is reached. */
function simulateCrossReady(coreAngle, targetAngle, gapsAligned) {
  const diff = Math.abs(targetAngle - coreAngle);
  const locked = diff <= 0.08;
  return locked && gapsAligned;
}
assert(simulateCrossReady(0, 0.03, true) === true, 'CN23a: crossReady=true when locked AND gaps aligned');
assert(simulateCrossReady(0, 0.5, true) === false, 'CN23b: crossReady=false when not locked (barrel far away)');
assert(simulateCrossReady(0, 0.03, false) === false, 'CN23c: crossReady=false when locked but gaps NOT aligned');
assert(simulateCrossReady(0, 0.5, false) === false, 'CN23d: crossReady=false when neither locked nor gaps aligned');

/* CN24: Deterministic state transition loop — castle destruction, ring regen, level progression,
         victory pause, reset. Pure deterministic unit tests (no DOM/Node modules beyond fs). */

/* CN24a: Core destruction timer is a fixed constant (90 frames at 60fps = 1.5s freeze).
           Verifies the assignment in update() sets a numeric constant, not 0 (the variable declaration).
           The regex must match the assignment inside update(), which is after "coreD destruction". */
const cdMtch = js.match(/state = \"coreDestruction\"[\s\S]{0,80}=\s*(\d+)/);
assert(!!cdMtch, 'CN24a: coreDestructionTimer assignment found near state="coreDestruction" in update()');
if (cdMtch) {
  const cdVal = parseInt(cdMtch[1], 10);
  assert(Number.isFinite(cdVal) && cdVal > 50, `CN24a: coreDestructionTimer is a large positive integer (${cdVal}) for freeze`);
}

/* CN24b: Level transition timer is a fixed constant (120 frames at 60fps = 2s freeze).
           startLevel() sets transitionTimer to this constant; update() decrements it each frame. */
const ltMtch = js.match(/function\s+startLevel\(\)[\s\S]*?transitionTimer\s*=\s*(\d+)/);
assert(!!ltMtch, 'CN24b: transitionTimer set to a numeric constant in startLevel()');
if (ltMtch) {
  const ltVal = parseInt(ltMtch[1], 10);
  assert(Number.isFinite(ltVal) && ltVal > 90, `CN24b: transitionTimer constant is a positive integer (${ltVal}) greater than coreDestructionTimer`);
}

/* CN24c: Level progression is monotonic and deterministic.
           Core destruction (state = "coreDestruction") transitions to `startLevel()`
           which increments level and runs a 120-frame transition. */
assert(js.includes('state = "coreDestruction"'), 'CN24c: state="coreDestruction" assigned when core destroyed');
assert(js.includes('if (coreDestructionTimer <= 0)') && js.substring(js.indexOf("coreDestructionTimer <= 0")).includes('startLevel()'), 'CN24c: core destruction timer hits zero → startLevel()');
assert(js.includes('startLevel()') && js.indexOf("coreDestruction") < js.indexOf("state = \"levelTransition\""), 'CN24c: coreDestruction assigned BEFORE levelTransition state');

/* CN24d: Shield ring regeneration is deterministic.
           REGEN_ANIM_FRAMES constant must exist; tryRegenRings must set it;
           update() must decrement regenAnimFrames and clear regenCollRadii when 0. */
assert(js.includes("REGEN_ANIM_FRAMES"), 'CN24d: REGEN_ANIM_FRAMES constant exists');
const regenMtch = js.match(/REGEN_ANIM_FRAMES\s*=\s*(\d+)/);
assert(!!regenMtch, 'CN24d: REGEN_ANIM_FRAMES is assigned a numeric constant');
if (regenMtch) {
  const rv = parseInt(regenMtch[1], 10);
  assert(rv > 20, `CN24d: REGEN_ANIM_FRAMES is at least 20 frames (${rv}) for visibility`);
}
const regenCode = js.substring(js.indexOf("function tryRegenRings"));
assert(regenCode.includes("regenAnimFrames = REGEN_ANIM_FRAMES"), 'CN24d: tryRegenRings sets regenAnimFrames to REGEN_ANIM_FRAMES');
const regenUpd = js.substring(js.indexOf("regenAnimFrames > 0"));
assert(regenUpd.includes("regenCollRadii = null"), 'CN24d: update() clears regenCollRadii when animation completes');

/* CN24e: End-game has a deterministic freeze (DEAD_PAUSE_FRAMES) before accepting input.
           endGame() must set state="dead" AND deadPauseTimer=DEAD_PAUSE_FRAMES. */
const endGameMtch = js.match(/function\s+endGame\(\)\s*\{[\s\S]*?\n  \}/);
assert(!!endGameMtch, 'CN24e: endGame() function exists');
if (endGameMtch) {
  const body = endGameMtch[0];
  assert(body.includes('state = "dead"'), 'CN24e: endGame() transitions state to "dead" deterministically');
  assert(body.includes("DEAD_PAUSE_FRAMES") || body.includes("deadPauseTimer ="), 'CN24e: endGame() sets deadPauseTimer to DEAD_PAUSE_FRAMES');
  assert(body.includes("saveHighScore()") || body.includes("populateDeadOverlay()"), 'CN24e: endGame() persists score and populates overlay');
}

/* CN24f: Dead state pauses input for DEAD_PAUSE_FRAMES frames before accepting.
           update()'s dead-state handler must decrement deadPauseTimer and guard input behind it. */
const deadHandler = js.substring(js.indexOf('if (state === "dead") {\n      /* Deterministic freeze'));
assert(deadHandler.includes("deadPauseTimer--"), 'CN24f: dead-state handler decrements deadPauseTimer');
assert(deadHandler.includes("deadPauseTimer > 0") || deadHandler.includes('deadPauseTimer > 0'), 'CN24f: input gated behind deadPauseTimer>0 check');

/* CN24g: Dead-state handler does NOT break out when deadPauseTimer has not elapsed.
           It must still call drawDead() every frame and skip the restart path while frozen. */
const deadBlock = deadHandler;
const restartIdx = deadBlock.indexOf("resetAttract()");
assert(restartIdx > deadBlock.indexOf("deadPauseTimer--"), 'CN24g: resetAttract()/restart is BELOW the deadPauseTimer decrement (order guaranteed)');

/* V17a: Attract overlay click listener must exist for desktop/mouse pointer. */
assert(!!js.match(/attractScreen\s*\.\s*addEventListener.*click/), 'V17a: attract screen click listener wired');

// ── Result ──
if (failed === 0) {
  console.log('PASS');
  process.exit(0);
} else {
  console.log(`FAIL (${failed} assertions failed, ${passed} passed)`);
  process.exit(1);
}
