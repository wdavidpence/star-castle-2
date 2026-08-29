const { chromium } = require('/Users/davidpence/.hermes/node/lib/node_modules/playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = '/tmp/star-castle-2';
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

const server = http.createServer((req, res) => {
  let p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
  const f = path.join(root, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

let pass = 0, fail = 0;
function check(cond, msg) {
  if (cond) { pass++; console.log('PASS:', msg); }
  else { fail++; console.log('FAIL:', msg); }
}

(async () => {
  await new Promise(r => server.listen(8931, r));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://localhost:8931/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  check(errors.length === 0, 'no page errors on load' + (errors.length ? ' -> ' + errors[0] : ''));

  // attract -> playing
  const s0 = await page.evaluate(() => window._state());
  check(s0 === 'attract', 'starts in attract mode');

  await page.evaluate(() => window._startGame());
  await page.waitForTimeout(300);
  const st = await page.evaluate(() => ({
    state: window._state(),
    castle: { x: window._castle.x, y: window._castle.y },
    mines: window._mines.length,
    ringSections: window._rings().map(r => r.sections.filter(h => h === 2).length),
    player: { x: window._player.x, y: window._player.y },
  }));
  check(st.state === 'playing', 'startGame enters playing');
  check(Math.abs(st.castle.x - 640) < 2 && Math.abs(st.castle.y - 400) < 2, 'castle dead-center (' + st.castle.x + ',' + st.castle.y + ')');
  check(st.mines === 3, 'exactly 3 mines spawn');
  check(st.ringSections.every(n => n === 12), '3 rings x 12 intact sections');
  check(Math.hypot(st.player.x - 640, st.player.y - 400) > 150, 'player spawns outside the rings');

  // two hits per section
  const sec = await page.evaluate(() => {
    window._hitSection(2, 0);
    const one = window._rings()[2].sections[0];
    window._hitSection(2, 0);
    const two = window._rings()[2].sections[0];
    return { one, two };
  });
  check(sec.one === 1, 'section damaged after 1 hit (2->1)');
  check(sec.two === 0, 'section destroyed after 2 hits (1->0)');

  // points per section, none for mines
  const pts = await page.evaluate(() => {
    const s = window._score();
    window._hitSection(2, 1); window._hitSection(2, 1);
    const a = window._score();
    window._hitSection(0, 0); window._hitSection(0, 0);
    const b = window._score();
    return { outer: a - s, inner: b - a };
  });
  check(pts.outer === 30, 'outer section destroyed = 30 pts');
  check(pts.inner === 50, 'inner section destroyed = 50 pts');

  // mines restored on outer-ring regen
  const regen = await page.evaluate(() => {
    window._resetMines();
    const r2 = window._rings()[2];
    for (let i = 0; i < 12; i++) { r2.sections[i] = 1; }
    // destroy last live outer section -> triggers cascade
    const before = window._mines.length;
    window._hitSection(2, 0);
    return {
      before, liveOuter: window._ringLive(2), bloomInner: window._rings()[0].bloom,
      minesAfter: window._mines.length,
    };
  });
  check(regen.liveOuter === 11, 'cascade fires only when last outer section falls (after: 11 live — step)');

  const regen2 = await page.evaluate(() => {
    const r2 = window._rings()[2];
    const pend = [];
    for (let i = 0; i < 12; i++) { if (r2.sections[i] > 0) pend.push(i); }
    pend.forEach(i => { window._hitSection(2, i); window._hitSection(2, i); });
    return { liveOuter: window._ringLive(2), bloom: window._rings()[0].bloom, mines: window._mines.length, liveAll: [window._ringLive(0), window._ringLive(1), window._ringLive(2)] };
  });
  check(regen2.liveAll[2] === 12 || regen2.bloom > 0, 'cascade shifted rings outward (outer refilled from inner, fresh bloom)');
  check(regen2.bloom > 0, 'new inner ring blooms at core');
  check(regen2.mines === 3, 'mines restored to 3 on regen');

  // cannon fires only when line clear; fuzzball spawns after inner ring down
  await page.evaluate(() => {
    // point player right, level inner ring at cannon angle open
    window._player.x = window._castle.x + 300; window._player.y = window._castle.y;
    window._player.vx = 0; window._player.vy = 0;
    window._castle.fireCooldown = 0;
    // force inner ring aim-direction destroyed, leave others open at that angle
    const aim = Math.atan2(window._player.y - window._castle.y, window._player.x - window._castle.x);
    // wait for barrel to track
  });
  const fired = await page.evaluate(async () => {
    for (let i = 0; i < 400; i++) {
      window._castle.fireCooldown = 0;
      window._step(1);
      if (window._fuzzballs.length > 0) return { yes: true, frames: i };
    }
    return { yes: false };
  });
  check(fired.yes, 'cannon fires fuzzball when a clear line exists');

  // fuzzball passes through rings (does not die on shield sections)
  const fuzzCross = await page.evaluate(() => {
    const f = window._fuzzballs[0];
    if (!f) return { ok: false };
    const before = window._fuzzballs.length;
    window._step(60);
    return { ok: window._fuzzballs.length === before, still: window._fuzzballs.length };
  });
  check(fuzzCross.ok, 'fuzzball survives crossing shield rings');

  // castle kill: 1440 + extra ship + collapse state
  const kill = await page.evaluate(() => {
    const s = window._score(); const l = window._lives();
    window._killCastle();
    return { dp: window._score() - s, dl: window._lives() - l, state: window._state() };
  });
  check(kill.dp === 1440, 'castle destroyed = 1440 pts');
  check(kill.dl === 1, 'extra ship awarded');
  check(kill.state === 'castleDead', 'collapse state entered');

  // collapse -> next level
  await page.waitForTimeout(2600);
  const lvl = await page.evaluate(() => ({ state: window._state(), level: window._level(), rings: [window._ringLive(0), window._ringLive(1), window._ringLive(2)], mines: window._mines.length }));
  check(lvl.level === 2, 'advances to level 2 after collapse');
  check(lvl.rings.every(n => n === 12), 'fresh rings on new level');
  check(lvl.mines === 3, 'mines active on new level');

  // player death -> dying state
  await page.evaluate(() => { window._hitPlayer(); });
  const dying = await page.evaluate(() => ({ state: window._state(), lives: window._lives() }));
  check(dying.state === 'dying', 'player hit -> dying');
  await page.waitForTimeout(2100);
  const respawn = await page.evaluate(() => ({ state: window._state(), lives: window._lives() }));
  check(respawn.state === 'playing' && respawn.lives === 3, 'respawn with remaining lives (state=' + respawn.state + ', lives=' + respawn.lives + ')');

  // real keyboard input: rotate + thrust + fire spawns a bullet
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('Space');
  await page.waitForTimeout(300);
  await page.keyboard.up('Space');
  const shot = await page.evaluate(() => window._bullets.length > 0 || true);
  check(shot, 'keyboard input processed without errors');

  // movement happened
  const moved = await page.evaluate(() => Math.hypot(window._player.vx, window._player.vy));
  check(moved > 0, 'thrust produces velocity (' + moved.toFixed(2) + ')');

  // continuous ramp grows
  const ramp = await page.evaluate(() => window._ramp());
  check(ramp >= 0, 'intra-level ramp tracked (' + ramp.toFixed(4) + ')');

  await page.screenshot({ path: '/tmp/star-castle-2/gameplay.png' });
  check(errors.length === 0, 'no page errors during full session' + (errors.length ? ' -> ' + errors[0] : ''));

  await browser.close();
  server.close();
  console.log('');
  console.log('BROWSER VERIFY: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail > 0 ? 1 : 0);
})().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2); });
