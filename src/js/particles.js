/* ============================================================
   particles.js - Particle system for explosions, smoke, debris
   ============================================================ */
(function () {
  'use strict';

  const particles = [];
  const MAX_PARTICLES = 500;

  function spawn(x, y, options) {
    if (particles.length >= MAX_PARTICLES) {
      // Recycle oldest
      particles.shift();
    }
    particles.push({
      x, y,
      vx: options.vx || 0,
      vy: options.vy || 0,
      life: options.life || 1.0,
      maxLife: options.life || 1.0,
      size: options.size || 4,
      color: options.color || '#ff6600',
      shrink: options.shrink !== false,
      gravity: options.gravity || 0,
      fade: options.fade !== false,
      type: options.type || 'circle' // 'circle', 'square', 'spark'
    });
  }

  function explosion(x, y, size, count) {
    count = count || 15;
    size = size || 1;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Game.randFloat(30, 120) * size;
      const colors = ['#ff6600', '#ff4400', '#ffaa00', '#ff0000', '#ffcc00'];
      spawn(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Game.randFloat(0.3, 0.8),
        size: Game.randFloat(2, 6) * size,
        color: Game.choose(colors),
        gravity: 20
      });
    }
    // Smoke
    for (let i = 0; i < count / 2; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Game.randFloat(10, 50) * size;
      spawn(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Game.randFloat(0.5, 1.5),
        size: Game.randFloat(4, 10) * size,
        color: '#555',
        gravity: -10,
        type: 'circle'
      });
    }
  }

  function smoke(x, y) {
    spawn(x, y, {
      vx: Game.randFloat(-10, 10),
      vy: Game.randFloat(-30, -10),
      life: Game.randFloat(0.3, 0.8),
      size: Game.randFloat(3, 6),
      color: '#888',
      gravity: -5
    });
  }

  function sparks(x, y, count) {
    for (let i = 0; i < (count || 5); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Game.randFloat(50, 150);
      spawn(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Game.randFloat(0.1, 0.3),
        size: 2,
        color: '#ffff00',
        type: 'spark'
      });
    }
  }

  function debris(x, y, count) {
    for (let i = 0; i < (count || 8); i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Game.randFloat(40, 100);
      const colors = ['#8B4513', '#654321', '#555', '#777'];
      spawn(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Game.randFloat(0.5, 1.2),
        size: Game.randFloat(2, 5),
        color: Game.choose(colors),
        gravity: 80,
        type: 'square'
      });
    }
  }

  function muzzleFlash(x, y, angle) {
    for (let i = 0; i < 3; i++) {
      const spread = Game.randFloat(-0.3, 0.3);
      const speed = Game.randFloat(80, 160);
      spawn(x, y, {
        vx: Math.cos(angle + spread) * speed,
        vy: Math.sin(angle + spread) * speed,
        life: 0.1,
        size: Game.randFloat(2, 4),
        color: '#ffff00'
      });
    }
  }

  function waterSplash(x, y) {
    for (let i = 0; i < 6; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Game.randFloat(20, 60);
      spawn(x, y, {
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: Game.randFloat(0.3, 0.6),
        size: Game.randFloat(2, 4),
        color: '#4488cc',
        gravity: 40
      });
    }
  }

  function update(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
      }
    }
  }

  function render(ctx, camX, camY) {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const sx = p.x - camX;
      const sy = p.y - camY;
      const lifeRatio = p.life / p.maxLife;
      const alpha = p.fade ? lifeRatio : 1;
      const size = p.shrink ? p.size * lifeRatio : p.size;

      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;

      if (p.type === 'square') {
        ctx.fillRect(sx - size / 2, sy - size / 2, size, size);
      } else if (p.type === 'spark') {
        ctx.fillRect(sx, sy, size, 1);
      } else {
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, size), 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function clear() {
    particles.length = 0;
  }

  window.Game.Particles = {
    spawn, explosion, smoke, sparks, debris, muzzleFlash,
    waterSplash, update, render, clear,
    get count() { return particles.length; }
  };
})();
