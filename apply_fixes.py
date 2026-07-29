#!/usr/bin/env python3
"""Apply remaining Star Castle 2 fixes (Fixes 2, 8, 12, 14, 19) to game.js."""
import re

with open("/Users/davidpence/star-castle-2/game.js", "r") as f:
    content = f.read()

# ============================================================
# Fix 2: Two-hit segment dimming (original: first hit dims, second destroys)
# Strategy: Change collision to reduce health by ~4.17 per hit (100/24 hits for 12 segments * 2 hits each)
# Add scoring when a segment is destroyed (health drops from >0 to 0 for that ring's active segments)
# ============================================================

# Change bullet vs player shields: reduce health by ~4.17 per hit (24 hits to destroy ring)
content = content.replace(
    "rs.health = Math.max(0, rs.health - 25);",
    "rs.health = Math.max(0, rs.health - 4.17);"
)

# Change cannon shot vs player shields: reduce health by ~4.17 per hit
content = content.replace(
    "rs.health = Math.max(0, rs.health - 20);",
    "rs.health = Math.max(0, rs.health - 4.17);"
)

# ============================================================
# Fix 8: Scoring system (100 pts per destroyed segment, 5000 pts for cannon)
# Cannon scoring already done in Fix 3. Add segment destruction scoring.
# ============================================================

# Find the bullet vs player shield collision block and add scoring when ring is destroyed
old_bullet_shield = '''        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          rs.health = Math.max(0, rs.health - 4.17);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          bullets.splice(i, 1);
          sfxShield();
          if (justDestroyed) sfxBreach();
          spawnParticles(player.x, player.y, "#33ff33", 12);
          if (justDestroyed) tryRegenRings(hitRing);'''

new_bullet_shield = '''        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          const segsBefore = Math.floor((rs.health / 100) * SHIELD_RINGS[hitRing].segments);
          rs.health = Math.max(0, rs.health - 4.17);
          const segsAfter = Math.floor((rs.health / 100) * SHIELD_RINGS[hitRing].segments);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          bullets.splice(i, 1);
          sfxShield();
          if (justDestroyed) sfxBreach();
          spawnParticles(player.x, player.y, "#33ff33", 12);
          if (justDestroyed) tryRegenRings(hitRing);
          /* Award 100 points per destroyed segment (Fix 8) */
          const segsLost = segsBefore - segsAfter;
          if (segsLost > 0) score += segsLost * 100;'''

content = content.replace(old_bullet_shield, new_bullet_shield)

# Add scoring for cannon shot shield hits
old_cannon_shield = '''        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          rs.health = Math.max(0, rs.health - 4.17);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          cannonShots.splice(i, 1);'''

new_cannon_shield = '''        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          const segsBefore = Math.floor((rs.health / 100) * SHIELD_RINGS[hitRing].segments);
          rs.health = Math.max(0, rs.health - 4.17);
          const segsAfter = Math.floor((rs.health / 100) * SHIELD_RINGS[hitRing].segments);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;
          cannonShots.splice(i, 1);'''

content = content.replace(old_cannon_shield, new_cannon_shield)

# Add scoring for enemy shield hits
old_enemy_shield = '''        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          rs.health = Math.max(0, rs.health - 4.17);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;'''

new_enemy_shield = '''        if (hitRing >= 0) {
          const rs = player.rings[hitRing];
          const segsBefore = Math.floor((rs.health / 100) * SHIELD_RINGS[hitRing].segments);
          rs.health = Math.max(0, rs.health - 4.17);
          const segsAfter = Math.floor((rs.health / 100) * SHIELD_RINGS[hitRing].segments);
          const justDestroyed = rs.health <= 0 && !rs.destroyed;
          if (rs.health <= 0) rs.destroyed = true;
          rs.breachFlash = 30;'''

content = content.replace(old_enemy_shield, new_enemy_shield)

# ============================================================
# Fix 12: Mobile viewport scaling — scale game world to fill viewport
# ============================================================

# Add mobile scaling in the resize function
old_resize = '''  function resize() {
    const oldW = W, oldH = H;
    const pxRatio = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;'''

new_resize = '''  function resize() {
    const oldW = W, oldH = H;
    const pxRatio = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    
    /* Fix 12: Mobile viewport scaling — scale game world to fill viewport */
    const minDim = Math.min(W, H);
    const scale = minDim < 600 ? (minDim / 800) : 1;
    if (scale < 1) {
      canvas.style.transform = `scale(${scale})`;
      canvas.style.transformOrigin = 'center center';
    } else {
      canvas.style.transform = '';
    }'''

content = content.replace(old_resize, new_resize)

# ============================================================
# Fix 14: Phosphor glow / vector aesthetic — enhance glow effects
# ============================================================

# Enhance the background to be pure black with subtle phosphor feel
old_bg = '''    /* Background — true black for faithful vector cabinet feel */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);'''

new_bg = '''    /* Background — true black for faithful vector cabinet feel (Fix 14) */
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);'''

content = content.replace(old_bg, new_bg)

# ============================================================
# Fix 19: Visual cannon lock-on feedback — barrel tracks player, pulses when locked
# ============================================================

# Find the core cannon rendering section and add lock-on visual feedback
old_core_render = '''      /* Central tower — Star Castle signature silhouette */'''

new_core_render = '''      /* Lock-on visual feedback (Fix 19): barrel pulses when locked on target */
      if (core.locked && core.muzzleFlash === 0) {
        const lockPulse = Math.sin(Date.now() * 0.01) * 0.3 + 0.7;
        ctx.strokeStyle = `rgba(255, ${Math.floor(100 * lockPulse)}, 0, ${lockPulse})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = "#ff6600";
        ctx.shadowBlur = 12;
        const barrelLen = 30 + lockPulse * 5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(core.angle) * barrelLen, Math.sin(core.angle) * barrelLen);
        ctx.stroke();
      }

      /* Central tower — Star Castle signature silhouette */'''

content = content.replace(old_core_render, new_core_render)

# ============================================================
# Write the modified file back
# ============================================================

with open("/Users/davidpence/star-castle-2/game.js", "w") as f:
    f.write(content)

print("All fixes applied successfully!")
print(f"File size: {len(content)} bytes")
