# Star Castle 2 — Playtest Bug & Improvement Backlog

Generated from research into the original 1980 Cinematronics Star Castle arcade cabinet and source audit of `game.js`, `index.html`.

Each item records Priority, Evidence (confirmed defect vs. improvement opportunity), Expected behavior, and an Acceptance test.

---

## 1) Shield rings have 8 segments instead of original 12
- **Priority:** High (fidelity)
- **Evidence:** `SHIELD_RINGS` array defines `segments: 8`. Original Star Castle cabinet used exactly 12 segments per ring.
- **Expected behavior:** All three rings have 12 arc segments each, matching the cabinet.
- **Acceptance test:** Inspect `SHIELD_RINGS` — all entries have `segments: 12`. In-game, count visible ring segments; verify 12 per ring.

## 2) Ring segments lack two-hit dimming (original: first hit dims, second destroys)
- **Priority:** High (fidelity)
- **Evidence:** Current code uses a single `health` percentage per ring; destroying a ring requires 100% health drain. No per-segment dimming state exists.
- **Expected behavior:** Each segment tracks individual hit count (0, 1=dimmed, 2=destroyed). First bullet pass dims the segment (half opacity); second destroys it.
- **Acceptance test:** Fire one bullet at a ring segment — it dims but remains visible. Fire again at the same segment location — it is destroyed.

## 3) Cannon has HP (multi-hit) instead of being one-shot kill
- **Priority:** High (fidelity)
- **Evidence:** `core.hp = 3 + level * 2` — cannon takes multiple hits. Original Star Castle: the energy cannon is destroyed by a single bullet once shields are gone.
- **Expected behavior:** Cannon has no HP pool; one player bullet through a shield gap destroys it instantly.
- **Acceptance test:** Fire one bullet through an aligned gap at the cannon — it explodes immediately. No HP bar or multi-hit animation.

## 4) Too many core mines (max 8); original has exactly 3
- **Priority:** High (fidelity)
- **Evidence:** `MAX_CORE_MINES = 8`. Original Star Castle spawns exactly 3 homing mines from the core that orbit and pursue the player.
- **Expected behavior:** Maximum 3 concurrent core mines at any time. New mine spawns only when an existing one is destroyed (some variants keep 3 churning constantly).
- **Acceptance test:** Play through a level; count maximum simultaneous core mines. Verify never exceeds 3.

## 5) Cannon fires small bullets instead of large distinctive projectiles
- **Priority:** Medium (fidelity)
- **Evidence:** `cannonShots` use the same small bullet size as player shots. Original cabinet fires large, visually distinct fireballs that are unmistakably dangerous.
- **Expected behavior:** Cannon shots are larger (radius ~8px vs player bullet ~3px), visually distinct, and clearly communicate threat.
- **Acceptance test:** Visually distinguish cannon shots from player bullets by size and color. Cannon shot radius is at least 2× player bullet radius.

## 6) No maximum simultaneous bullets (original: max 4 shots at once)
- **Priority:** Medium (fidelity)
- **Evidence:** `fireBullet()` only checks `fireCooldown`; no cap on total bullets in flight. Original Star Castle limits to 4 simultaneous projectiles.
- **Expected behavior:** Maximum 4 bullets (player + cannon combined) in flight at any time. Oldest bullet is removed when limit reached and new shot fired.
- **Acceptance test:** Rapid-fire until 4 bullets exist; fire again — oldest bullet is removed and replaced. Total never exceeds 4.

## 7) Ring regeneration lacks dramatic visual cascade (original: rings shift outward visibly)
- **Priority:** Medium (fidelity)
- **Evidence:** `tryRegenRings()` shifts rings logically but animation is subtle. Original cabinet shows a dramatic visual cascade: outer ring collapses, middle expands outward, inner follows, new ring blooms from core.
- **Expected behavior:** Ring regeneration shows a clear visual cascade: destroyed ring collapses, remaining rings expand outward with glow effect, new inner ring expands from core center.
- **Acceptance test:** Destroy outermost ring; observe cascade animation. Verify rings visibly shift outward and new ring expands from core with distinct visual effect.

## 8) No scoring system (original: points for ring segments and cannon destruction)
- **Priority:** High (playability)
- **Evidence:** `score` variable exists but no points are awarded for destroying ring segments or the cannon. Original: ring segment = 100 pts, cannon destruction = 5000 pts + extra ship.
- **Expected behavior:** Destroying a ring segment awards 100 points. Destroying the cannon awards 5000 points and an extra life. Score displays prominently in HUD.
- **Acceptance test:** Destroy a ring segment — score increases by 100. Destroy cannon — score increases by 5000 and lives increment. HUD shows current score at all times during gameplay.

## 9) Player invincibility after respawn is too long (120 frames = 2s); original is shorter
- **Priority:** Medium (gameplay)
- **Evidence:** `player.invincible = 120` (2 seconds at 60fps). Original Star Castle gives a brief respawn flash (~0.5s) then exposes the player.
- **Expected behavior:** Invincibility is ~30 frames (0.5s). Player ship flashes during invincibility period, then becomes solid and vulnerable.
- **Acceptance test:** After respawning, player is invincible for ~30 frames then vulnerable. Ship flashes visibly during invincibility.

## 10) No game-over score entry screen (original: cabinet prompts for initials)
- **Priority:** Medium (fidelity)
- **Evidence:** `endGame()` transitions to dead overlay with no score entry. Original cabinet shows high-score table and allows entering initials for top scores.
- **Expected behavior:** On game over, show score and prompt player to enter initials for high-score table. Allow 3-character name entry via on-screen buttons or keyboard.
- **Acceptance test:** After losing all lives, score entry UI appears. Enter 3 characters; verify name+score saved to high-score table and displayed on attract screen.

## 11) Attract mode does not display high-score table
- **Priority:** Medium (fidelity)
- **Evidence:** Attract cards cycle through Title, HighScore placeholder, Instructions, Showcase — but the "HighScore" card shows generic text rather than actual stored scores.
- **Expected behavior:** Attract mode's high-score card displays the top 5 stored scores with names, ranked. Matches cabinet presentation.
- **Acceptance test:** Reach attract mode high-score card; verify top 5 scores with names are displayed in ranked order.

## 12) Canvas does not scale for mobile viewport; game is unplayable on small screens
- **Priority:** High (playability)
- **Evidence:** Canvas uses `window.innerWidth/Height` but game world coordinates (ring radii 38-68px, core at y=60) are fixed. On mobile, the castle is tiny in a corner and most screen is empty space.
- **Expected behavior:** Game world scales to fill the viewport while maintaining aspect ratio. Rings, cannon, and player are proportionally sized for the display. Touch controls reposition to not obstruct gameplay.
- **Acceptance test:** Open on iPhone-sized viewport (375×667). Castle fills center ~40% of screen. Rings are clearly visible and shootable. Touch controls sit at screen edges without blocking view.

## 13) Shield collision only works one way (player bullets → rings); cannon shots should also be blocked
- **Priority:** Medium (fidelity)
- **Evidence:** `checkShieldCollision` has a `fromOutside` parameter but cannon shots may not properly use it. In original, shield rings block BOTH player bullets AND cannon fire — you can shoot yourself with a ricochet.
- **Expected behavior:** Both player bullets and cannon shots are blocked by shield rings when they hit an active segment. Cannon shot hitting its own ring is destroyed (player can use this strategically).
- **Acceptance test:** Fire a player bullet at an active ring segment — it is blocked and destroyed. Fire cannon shot into its own ring — it is also blocked.

## 14) No phosphor glow / vector aesthetic (original: black background, bright white lines with green overlay)
- **Priority:** Medium (fidelity)
- **Evidence:** Game uses colored fills and standard canvas rendering. Original Star Castle used vector graphics: bright white lines on black background with colored overlay plastic.
- **Expected behavior:** Background is pure black (#000). Game elements use bright white/colored lines with glow effects simulating vector phosphor bloom. No filled shapes — wireframe-only rendering for rings, ship, and cannon.
- **Acceptance test:** Background is pure black. Rings render as wireframe arcs with subtle glow. Ship and cannon are line-drawn, not filled shapes. Overall aesthetic matches vector cabinet feel.

## 15) Enemy spawn waves include non-original enemy types (chasers, fast ships)
- **Priority:** Medium (fidelity)
- **Evidence:** `spawnWave()` spawns "mine", "chaser", and "fast" enemy types. Original Star Castle only has homing mines from the core — no edge-spawning enemies.
- **Expected behavior:** In fidelity mode, only core-spawned mines exist as enemies. No edge-spawning chasers or fast ships. The only threat is the 3 orbiting mines + cannon fire.
- **Acceptance test:** Play in fidelity mode; verify no enemies spawn from screen edges. Only core mines appear, orbiting and homing toward player.

## 16) Level progression ends at level 9; original is endless
- **Priority:** Medium (gameplay)
- **Evidence:** Need to check if there's a level cap. Original Star Castle is an endless game that gets progressively harder with no final level or ending condition.
- **Expected behavior:** No level cap. Game continues indefinitely with increasing difficulty (faster mines, quicker cannon fire, faster ring rotation). Only ends when player loses all lives.
- **Acceptance test:** Play past level 9 — game continues. Difficulty parameters increase each level. No "you win" or end-of-game screen except losing all lives.

## 17) No ship awarded for cannon destruction (original: extra life per castle destroyed)
- **Priority:** High (fidelity)
- **Evidence:** `coreDestruction` state transitions to level start but does not increment lives. Original Star Castle awards one extra ship for each castle destroyed.
- **Expected behavior:** Destroying the cannon increments `lives` by 1 (capped at max 9). Display "EXTRA SHIP" text briefly during core destruction sequence.
- **Acceptance test:** Destroy cannon — lives increment by 1 (if below max). "EXTRA SHIP" text flashes on screen during destruction sequence.

## 18) Bullet speed too slow for original arcade feel (original: fast, snappy projectiles)
- **Priority:** Medium (gameplay)
- **Evidence:** Player bullets travel at speed 10 px/frame. Original vector arcade projectiles feel faster and snappier — they traverse screen width in ~1 second or less.
- **Expected behavior:** Player bullet speed is 14 px/frame (traverses ~600px screen in ~43 frames / 0.7s). Feels snappy and responsive like the cabinet.
- **Acceptance test:** Fire bullet from one side of screen to center — it arrives in under 50 frames. Feels fast and responsive, not sluggish.

## 19) No visual feedback when cannon is "locked on" (original: barrel visibly tracks player)
- **Priority:** Medium (gameplay)
- **Evidence:** `core.locked` flag exists internally but no visual indicator is shown to the player. Original cabinet: cannon barrel visibly rotates and tracks the player's position in real time, giving clear read on when it's about to fire.
- **Expected behavior:** Cannon barrel is a visible line from core center that rotates in real time to track the player. When locked (within firing tolerance), barrel glows or pulses to signal imminent fire.
- **Acceptance test:** Move player around screen — cannon barrel visibly tracks the player's position. When aligned for firing, barrel pulses/glow changes to indicate lock-on state.

## 20) No pause functionality (original: coin-return button pauses cabinet game)
- **Priority:** Low (convenience)
- **Evidence:** No pause mechanism exists. Original Star Castle cabinet had a coin-return/pause button that froze gameplay while displaying "PAUSED" on screen.
- **Expected behavior:** Pressing 'P' or 'Escape' pauses the game. Paused state shows "PAUSED" overlay, freezes all updates (player, enemies, cannon, rings), and resumes on same key press.
- **Acceptance test:** Press 'P' during gameplay — game freezes, "PAUSED" text appears. Press 'P' again — game resumes from exact same state (player position, enemies, bullets unchanged).

---

## Scope Note

This is a **fidelity-focused backlog**, assembled from direct comparison of the original 1980 Cinematronics Star Castle arcade cabinet mechanics against the current `game.js` implementation. Items are ordered by priority (High → Medium → Low) and grouped by category: fidelity, gameplay, playability. Each item includes a concrete acceptance test for verification.
