/* ============================================================
   sprites.js - Procedural sprite generation (zero external assets)
   All vehicles, terrain, effects drawn via offscreen Canvas
   ============================================================ */
(function () {
  'use strict';

  const sprites = {};
  const TILE = Game.TILE;

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function generate() {
    generateTiles();
    generateVehicles();
    generateEffects();
    generateUI();
  }

  /* ========== TERRAIN TILES ========== */
  function generateTiles() {
    const S = TILE;
    // Water
    sprites.water = makeCanvas(S, S);
    let ctx = sprites.water.getContext('2d');
    ctx.fillStyle = '#1a5276';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#1f618d';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(2 + i * 10, 8 + i * 7, 8, 2);
    }

    // Sand
    sprites.sand = makeCanvas(S, S);
    ctx = sprites.sand.getContext('2d');
    ctx.fillStyle = '#d4ac6e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#c49a5e';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(Game.randInt(0,S-2), Game.randInt(0,S-2), 2, 2);
    }

    // Grass
    sprites.grass = makeCanvas(S, S);
    ctx = sprites.grass.getContext('2d');
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#267a42';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(Game.randInt(0,S-2), Game.randInt(0,S-2), 2, 3);
    }

    // Road
    sprites.road = makeCanvas(S, S);
    ctx = sprites.road.getContext('2d');
    ctx.fillStyle = '#666';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#777';
    ctx.fillRect(S/2-1, 0, 2, S); // center line

    // Wall (destructible)
    sprites.wall = makeCanvas(S, S);
    ctx = sprites.wall.getContext('2d');
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(0, 0, S, S);
    ctx.strokeStyle = '#654321';
    ctx.lineWidth = 1;
    // Brick pattern
    for (let row = 0; row < 4; row++) {
      const y = row * 8;
      ctx.strokeRect(0, y, S, 8);
      const off = (row % 2) * (S / 2);
      ctx.beginPath();
      ctx.moveTo(off + S / 2, y);
      ctx.lineTo(off + S / 2, y + 8);
      ctx.stroke();
    }

    // Bridge
    sprites.bridge = makeCanvas(S, S);
    ctx = sprites.bridge.getContext('2d');
    ctx.fillStyle = '#8B7355';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#7a6348';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(0, i * 8, S, 1);
    }
    ctx.fillStyle = '#6b5639';
    ctx.fillRect(0, 0, 3, S);
    ctx.fillRect(S-3, 0, 3, S);

    // Trees
    sprites.trees = makeCanvas(S, S);
    ctx = sprites.trees.getContext('2d');
    ctx.fillStyle = '#1a6b30';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#145524';
    ctx.beginPath();
    ctx.arc(S/2, S/2, S/3, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#0f4520';
    ctx.beginPath();
    ctx.arc(S/2-3, S/2-3, S/5, 0, Math.PI*2);
    ctx.fill();

    // Base 1 (blue)
    sprites.base1 = makeCanvas(S, S);
    ctx = sprites.base1.getContext('2d');
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#3388ff';
    ctx.fillRect(2, 2, S-4, S-4);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(6, 6, S-12, S-12);
    ctx.fillStyle = '#3388ff';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('B', S/2, S/2+5);

    // Base 2 (red)
    sprites.base2 = makeCanvas(S, S);
    ctx = sprites.base2.getContext('2d');
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(2, 2, S-4, S-4);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(6, 6, S-12, S-12);
    ctx.fillStyle = '#ff4444';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('B', S/2, S/2+5);

    // Ammo depot
    sprites.depot_ammo = makeCanvas(S, S);
    ctx = sprites.depot_ammo.getContext('2d');
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#e5c100';
    ctx.fillRect(4, 4, S-8, S-8);
    ctx.fillStyle = '#333';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('A', S/2, S/2+4);

    // Fuel depot
    sprites.depot_fuel = makeCanvas(S, S);
    ctx = sprites.depot_fuel.getContext('2d');
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#e74c3c';
    ctx.fillRect(4, 4, S-8, S-8);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('F', S/2, S/2+4);

    // Rubble
    sprites.rubble = makeCanvas(S, S);
    ctx = sprites.rubble.getContext('2d');
    ctx.fillStyle = '#555';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#666';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(Game.randInt(2,S-8), Game.randInt(2,S-8), Game.randInt(3,8), Game.randInt(3,8));
    }

    // Turret base
    sprites.turret = makeCanvas(S, S);
    ctx = sprites.turret.getContext('2d');
    ctx.fillStyle = '#2d8a4e';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.arc(S/2, S/2, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#777';
    ctx.beginPath();
    ctx.arc(S/2, S/2, 6, 0, Math.PI*2);
    ctx.fill();
  }

  /* ========== VEHICLES ========== */
  function drawVehicle(type, team) {
    const S = 40;
    const c = makeCanvas(S, S);
    const ctx = c.getContext('2d');
    const col = team === 1 ? Game.TEAM_COLORS[1] : Game.TEAM_COLORS[2];

    ctx.save();
    ctx.translate(S/2, S/2);

    switch (type) {
      case Game.VEH.JEEP:
        // Body
        ctx.fillStyle = col.primary;
        ctx.fillRect(-7, -12, 14, 24);
        // Windshield
        ctx.fillStyle = col.light;
        ctx.fillRect(-5, -10, 10, 6);
        // Wheels
        ctx.fillStyle = '#222';
        ctx.fillRect(-9, -10, 3, 7);
        ctx.fillRect(6, -10, 3, 7);
        ctx.fillRect(-9, 3, 3, 7);
        ctx.fillRect(6, 3, 3, 7);
        // Gun mount
        ctx.fillStyle = '#444';
        ctx.fillRect(-1, -14, 2, 6);
        break;

      case Game.VEH.TANK:
        // Treads
        ctx.fillStyle = '#333';
        ctx.fillRect(-14, -14, 6, 28);
        ctx.fillRect(8, -14, 6, 28);
        // Body
        ctx.fillStyle = col.primary;
        ctx.fillRect(-10, -12, 20, 24);
        // Turret base
        ctx.fillStyle = col.dark;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI*2);
        ctx.fill();
        // Barrel
        ctx.fillStyle = '#444';
        ctx.fillRect(-2, -18, 4, 12);
        break;

      case Game.VEH.HELI:
        // Body
        ctx.fillStyle = col.primary;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 14, 0, 0, Math.PI*2);
        ctx.fill();
        // Tail
        ctx.fillStyle = col.dark;
        ctx.fillRect(-3, 8, 6, 10);
        // Tail rotor
        ctx.fillStyle = '#aaa';
        ctx.fillRect(-6, 16, 12, 2);
        // Cockpit
        ctx.fillStyle = '#88ccff';
        ctx.beginPath();
        ctx.ellipse(0, -8, 5, 5, 0, 0, Math.PI*2);
        ctx.fill();
        // Skids
        ctx.strokeStyle = '#555';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-10, -4); ctx.lineTo(-10, 6);
        ctx.moveTo(10, -4); ctx.lineTo(10, 6);
        ctx.stroke();
        break;

      case Game.VEH.ASV:
        // Body
        ctx.fillStyle = col.primary;
        ctx.fillRect(-12, -14, 24, 28);
        // Treads
        ctx.fillStyle = '#333';
        ctx.fillRect(-14, -12, 4, 24);
        ctx.fillRect(10, -12, 4, 24);
        // Rocket pods
        ctx.fillStyle = col.dark;
        ctx.fillRect(-10, -16, 8, 8);
        ctx.fillRect(2, -16, 8, 8);
        // Pod detail
        ctx.fillStyle = '#555';
        for (let i = 0; i < 2; i++) {
          for (let j = 0; j < 2; j++) {
            ctx.beginPath();
            ctx.arc(-6 + i*4, -14 + j*4, 1.5, 0, Math.PI*2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(6 + i*4, -14 + j*4, 1.5, 0, Math.PI*2);
            ctx.fill();
          }
        }
        break;
    }
    ctx.restore();
    return c;
  }

  function generateVehicles() {
    const types = ['jeep', 'tank', 'heli', 'asv'];
    for (let team = 1; team <= 2; team++) {
      for (let i = 0; i < 4; i++) {
        sprites[`${types[i]}_${team}`] = drawVehicle(i, team);
      }
    }
  }

  /* ========== EFFECTS ========== */
  function generateEffects() {
    // Flag sprites
    for (let team = 1; team <= 2; team++) {
      const c = makeCanvas(20, 24);
      const ctx = c.getContext('2d');
      const col = team === 1 ? '#3388ff' : '#ff4444';
      // Pole
      ctx.fillStyle = '#ddd';
      ctx.fillRect(2, 0, 2, 24);
      // Flag
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(4, 2);
      ctx.lineTo(18, 6);
      ctx.lineTo(4, 12);
      ctx.closePath();
      ctx.fill();
      sprites[`flag_${team}`] = c;
    }

    // Mine sprite
    const mc = makeCanvas(16, 16);
    let ctx = mc.getContext('2d');
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.arc(8, 8, 6, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#f00';
    ctx.beginPath();
    ctx.arc(8, 8, 2, 0, Math.PI*2);
    ctx.fill();
    sprites.mine = mc;

    // Bullet
    const bc = makeCanvas(4, 4);
    ctx = bc.getContext('2d');
    ctx.fillStyle = '#ff0';
    ctx.beginPath();
    ctx.arc(2, 2, 2, 0, Math.PI*2);
    ctx.fill();
    sprites.bullet = bc;

    // Shell
    const sc = makeCanvas(8, 8);
    ctx = sc.getContext('2d');
    ctx.fillStyle = '#ffa500';
    ctx.beginPath();
    ctx.arc(4, 4, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.fillStyle = '#ff6600';
    ctx.beginPath();
    ctx.arc(4, 4, 1.5, 0, Math.PI*2);
    ctx.fill();
    sprites.shell = sc;

    // Rocket
    const rc = makeCanvas(6, 12);
    ctx = rc.getContext('2d');
    ctx.fillStyle = '#aaa';
    ctx.fillRect(1, 0, 4, 8);
    ctx.fillStyle = '#f44';
    ctx.fillRect(0, 8, 6, 4);
    sprites.rocket = rc;

    // Skull (death humor)
    const skc = makeCanvas(32, 32);
    ctx = skc.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(16, 14, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.fillRect(12, 20, 8, 6);
    // Eyes
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(12, 12, 3, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(20, 12, 3, 0, Math.PI*2);
    ctx.fill();
    // Mouth
    ctx.fillRect(11, 22, 2, 3);
    ctx.fillRect(15, 22, 2, 3);
    ctx.fillRect(19, 22, 2, 3);
    sprites.skull = skc;

    // Explosion frames
    sprites.explosionFrames = [];
    for (let f = 0; f < 8; f++) {
      const ec = makeCanvas(64, 64);
      ctx = ec.getContext('2d');
      const r = 8 + f * 3.5;
      const alpha = 1.0 - f * 0.12;
      ctx.globalAlpha = alpha;
      // Outer glow
      ctx.fillStyle = '#ff4400';
      ctx.beginPath();
      ctx.arc(32, 32, r, 0, Math.PI*2);
      ctx.fill();
      // Inner
      ctx.fillStyle = '#ffaa00';
      ctx.beginPath();
      ctx.arc(32, 32, r * 0.6, 0, Math.PI*2);
      ctx.fill();
      // Core
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(32, 32, r * 0.25, 0, Math.PI*2);
      ctx.fill();
      sprites.explosionFrames.push(ec);
    }
  }

  /* ========== UI ELEMENTS ========== */
  function generateUI() {
    // Vehicle selector cards
    const types = [
      { name: 'JEEP', desc: 'Fast / Flag carrier', col: '#4a4' },
      { name: 'BUSHMASTER', desc: '360° cannon / Tough', col: '#a84' },
      { name: 'HELICOPTER', desc: 'Flies / Fragile', col: '#48a' },
      { name: 'STRIKEMASTER', desc: 'Rockets / Mines', col: '#a44' }
    ];
    sprites.vehicleCards = [];
    types.forEach((v, i) => {
      const c = makeCanvas(140, 100);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, 140, 100);
      ctx.strokeStyle = v.col;
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, 138, 98);
      ctx.fillStyle = v.col;
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(v.name, 70, 24);
      ctx.fillStyle = '#aaa';
      ctx.font = '11px monospace';
      ctx.fillText(v.desc, 70, 44);
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText(`[${i+1}]`, 70, 88);
      sprites.vehicleCards.push(c);
    });

    // Logo text
    const logo = makeCanvas(500, 60);
    const lctx = logo.getContext('2d');
    lctx.fillStyle = '#ff6600';
    lctx.font = 'bold 36px monospace';
    lctx.textAlign = 'center';
    lctx.fillText('DAMAGED TERRITORY', 250, 38);
    lctx.fillStyle = '#aaa';
    lctx.font = '14px monospace';
    lctx.fillText('Capture the Flag', 250, 56);
    sprites.logo = logo;
  }

  /* ========== Helper to get rotated vehicle ========== */
  function getVehicleSprite(type, team) {
    const names = ['jeep', 'tank', 'heli', 'asv'];
    return sprites[`${names[type]}_${team}`];
  }

  window.Game = window.Game || {};
  window.Game.Sprites = {
    generate,
    sprites,
    getVehicleSprite
  };
})();
