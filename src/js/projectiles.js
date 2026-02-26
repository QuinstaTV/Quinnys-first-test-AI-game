/* ============================================================
   projectiles.js - Bullets, shells, rockets, mines, missiles
   ============================================================ */
(function () {
  'use strict';

  const { TILE, T, dist } = Game;
  const projectiles = [];
  const mines = [];

  /* ---------- Projectile types ---------- */
  const PROJ = {
    BULLET:  { speed: 600, damage: 5,  radius: 2,  life: 0.8, explosive: false, sprite: 'bullet' },
    SHELL:   { speed: 400, damage: 40, radius: 4,  life: 1.5, explosive: true,  sprite: 'shell',  blastR: 40 },
    ROCKET:  { speed: 350, damage: 30, radius: 3,  life: 2.0, explosive: true,  sprite: 'rocket', blastR: 50 },
    MISSILE: { speed: 300, damage: 50, radius: 3,  life: 3.0, explosive: true,  sprite: 'shell',  blastR: 60 }
  };

  function fire(x, y, angle, type, owner, team) {
    const def = PROJ[type];
    if (!def) return;
    projectiles.push({
      x, y,
      vx: Math.cos(angle) * def.speed,
      vy: Math.sin(angle) * def.speed,
      angle,
      damage: def.damage,
      radius: def.radius,
      life: def.life,
      maxLife: def.life,
      explosive: def.explosive,
      blastR: def.blastR || 0,
      sprite: def.sprite,
      owner,
      team,
      type
    });
    Game.Particles.muzzleFlash(x, y, angle);
  }

  function layMine(x, y, owner, team) {
    mines.push({
      x, y,
      damage: 80,
      blastR: 48,
      owner,
      team,
      armed: false,
      armTimer: 1.0, // seconds before it arms
      alive: true
    });
  }

  function update(dt, map, vehicles, onHit) {
    // Update projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;

      // Out of life
      if (p.life <= 0) {
        if (p.explosive) {
          explode(p.x, p.y, p.blastR, p.damage, p.owner, p.team, map, vehicles, onHit);
        }
        projectiles.splice(i, 1);
        continue;
      }

      // World bounds
      if (p.x < 0 || p.y < 0 || p.x >= map.worldW || p.y >= map.worldH) {
        projectiles.splice(i, 1);
        continue;
      }

      // Tile collision
      const tx = Math.floor(p.x / TILE);
      const ty = Math.floor(p.y / TILE);
      const tile = map.getTile(tx, ty);

      if (tile === T.WALL || tile === T.TREES) {
        if (p.explosive) {
          explode(p.x, p.y, p.blastR, p.damage, p.owner, p.team, map, vehicles, onHit);
          map.destroyTile(tx, ty);
          Game.Particles.debris(p.x, p.y, 10);
        } else {
          Game.Particles.sparks(p.x, p.y, 3);
          map.destroyTile(tx, ty);
        }
        projectiles.splice(i, 1);
        continue;
      }

      // Vehicle collision
      let hit = false;
      for (let v = 0; v < vehicles.length; v++) {
        const veh = vehicles[v];
        if (!veh.alive || veh.id === p.owner) continue;
        if (veh.team === p.team) continue; // no friendly fire
        if (dist(p.x, p.y, veh.x, veh.y) < veh.hitRadius + p.radius) {
          if (p.explosive) {
            explode(p.x, p.y, p.blastR, p.damage, p.owner, p.team, map, vehicles, onHit);
          } else {
            veh.takeDamage(p.damage, p.owner);
            Game.Particles.sparks(p.x, p.y, 4);
            if (onHit) onHit(veh, p);
          }
          projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }
    }

    // Update mines
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      if (!m.alive) {
        mines.splice(i, 1);
        continue;
      }
      if (!m.armed) {
        m.armTimer -= dt;
        if (m.armTimer <= 0) m.armed = true;
        continue;
      }
      // Check vehicle proximity
      for (let v = 0; v < vehicles.length; v++) {
        const veh = vehicles[v];
        if (!veh.alive) continue;
        if (veh.type === Game.VEH.HELI) continue; // helicopters fly over mines
        if (dist(m.x, m.y, veh.x, veh.y) < 24) {
          explode(m.x, m.y, m.blastR, m.damage, m.owner, m.team, map, vehicles, onHit);
          m.alive = false;
          break;
        }
      }
    }
  }

  function explode(x, y, blastR, damage, owner, team, map, vehicles, onHit) {
    Game.Particles.explosion(x, y, blastR / 30);
    if (Game.Audio) Game.Audio.play('explosion');

    // Screen shake
    if (Game.screenShake) Game.screenShake(blastR / 5);

    // Damage area tiles
    const r = Math.ceil(blastR / TILE);
    const cx = Math.floor(x / TILE);
    const cy = Math.floor(y / TILE);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const tx = cx + dx, ty = cy + dy;
        const tdist = dist(x, y, tx * TILE + TILE/2, ty * TILE + TILE/2);
        if (tdist < blastR) {
          map.destroyTile(tx, ty);
        }
      }
    }

    // Damage vehicles in blast (skip friendly vehicles)
    for (let v = 0; v < vehicles.length; v++) {
      const veh = vehicles[v];
      if (!veh.alive || veh.id === owner) continue;
      if (veh.team === team && team !== 0) continue; // no friendly fire
      const d = dist(x, y, veh.x, veh.y);
      if (d < blastR) {
        const falloff = 1 - (d / blastR);
        const dmg = Math.round(damage * falloff);
        veh.takeDamage(dmg, owner);
        if (onHit) onHit(veh, { damage: dmg, owner, team, type: 'explosion' });
      }
    }

    // Detonate nearby mines
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      if (!m.alive) continue;
      if (dist(x, y, m.x, m.y) < blastR && dist(x, y, m.x, m.y) > 5) {
        m.alive = false;
        // Chain explosion with slight delay effect
        Game.Particles.explosion(m.x, m.y, 1.5);
      }
    }
  }

  function render(ctx, camX, camY) {
    const sprites = Game.Sprites.sprites;

    // Render mines
    for (let i = 0; i < mines.length; i++) {
      const m = mines[i];
      if (!m.alive) continue;
      const sx = m.x - camX - 8;
      const sy = m.y - camY - 8;
      if (sprites.mine) {
        ctx.globalAlpha = m.armed ? 1 : 0.5;
        ctx.drawImage(sprites.mine, sx, sy);
        ctx.globalAlpha = 1;
      }
    }

    // Render projectiles
    for (let i = 0; i < projectiles.length; i++) {
      const p = projectiles[i];
      const sx = p.x - camX;
      const sy = p.y - camY;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(p.angle + Math.PI / 2);

      const sprite = sprites[p.sprite];
      if (sprite) {
        ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      } else {
        ctx.fillStyle = '#ff0';
        ctx.beginPath();
        ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function clear() {
    projectiles.length = 0;
    mines.length = 0;
  }

  function getMines() { return mines; }
  function getProjectiles() { return projectiles; }

  window.Game.Projectiles = {
    PROJ, fire, layMine, update, render, clear, getMines, getProjectiles, explode
  };
})();
