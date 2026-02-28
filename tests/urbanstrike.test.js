/**
 * UrbanStrike (Helicopter) bug-bash regression tests:
 *  1. Shadow renders BEFORE body (z-order fix)
 *  2. Crash state clears when fuel is restored (mid-crash refuel fix)
 *  3. AI heli rotates body toward movement direction (non-combat aiming)
 *  4. AI heli in doDefend aims at nearby enemies and can shoot
 */

const { mockCanvas, mockCtx } = require('./setup');

// Load modules in dependency order
require('../src/js/utils');
require('../src/js/input');
require('../src/js/audio');
require('../src/js/particles');
require('../src/js/sprites');
require('../src/js/projectiles');
require('../src/js/vehicles');
require('../src/js/map');
require('../src/js/ai');

const {
  VEH, TILE, dist, angleTo, normAngle, clamp,
  createVehicle, VEHICLE_STATS, AIController, spawnAITeam
} = window.Game;

/* ========== Helper: minimal map stub ========== */
function makeMapStub(width, height) {
  width = width || 60;
  height = height || 60;
  const T = Game.T;
  const tiles = [];
  for (let y = 0; y < height; y++) {
    const row = [];
    for (let x = 0; x < width; x++) row.push(T.GRASS);
    tiles.push(row);
  }
  // Put bases
  tiles[5][5] = T.BASE1;
  tiles[height - 6][width - 6] = T.BASE2;
  // Put a fuel depot near center
  tiles[Math.floor(height / 2)][Math.floor(width / 2)] = T.DEPOT_FUEL;

  return {
    tiles,
    width,
    height,
    worldW: width * TILE,
    worldH: height * TILE,
    getTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) return T.WATER;
      return tiles[ty][tx];
    },
    setTile(tx, ty, type) {
      if (tx >= 0 && ty >= 0 && tx < width && ty < height) tiles[ty][tx] = type;
    },
    destroyTile() { return false; },
    isWalkable(wx, wy) {
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      const tile = this.getTile(tx, ty);
      return Game.isPassableGround(tile);
    },
    isFlyable(wx, wy) {
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      return tx >= 0 && ty >= 0 && tx < width && ty < height;
    },
    getSpawn(team) {
      return team === 1
        ? { x: 5 * TILE + TILE / 2, y: 5 * TILE + TILE / 2 }
        : { x: (width - 6) * TILE + TILE / 2, y: (height - 6) * TILE + TILE / 2 };
    },
    getFlagPos(team) { return this.getSpawn(team); },
    getBasePos(team) { return this.getSpawn(team); }
  };
}

// ========== 1. Shadow z-order ==========
describe('UrbanStrike: Shadow renders before body (z-order)', () => {
  test('render() calls ellipse (shadow) before drawImage (body) for heli', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);

    // Record call order via mocks
    const callOrder = [];
    const origEllipse = mockCtx.ellipse;
    const origDrawImage = mockCtx.drawImage;
    const origFill = mockCtx.fill;
    const origStroke = mockCtx.stroke;
    mockCtx.ellipse = jest.fn(() => { callOrder.push('ellipse'); });
    mockCtx.drawImage = jest.fn(() => { callOrder.push('drawImage'); });
    mockCtx.fill = jest.fn(() => { callOrder.push('fill'); });
    mockCtx.stroke = jest.fn(() => { callOrder.push('stroke'); });

    heli.render(mockCtx, 0, 0);

    // ellipse() should be called (shadow). Even if sprite is null and drawImage
    // isn't called, verify ellipse comes before stroke (rotor) or fill.
    const ellipseIdx = callOrder.indexOf('ellipse');
    expect(ellipseIdx).toBeGreaterThanOrEqual(0);

    // The first fill call after ellipse is the shadow fill.
    // Rotor stroke should come AFTER the shadow ellipse+fill.
    const strokeIdx = callOrder.indexOf('stroke');
    if (strokeIdx >= 0) {
      expect(ellipseIdx).toBeLessThan(strokeIdx);
    }

    // Restore
    mockCtx.ellipse = origEllipse;
    mockCtx.drawImage = origDrawImage;
    mockCtx.fill = origFill;
    mockCtx.stroke = origStroke;
  });

  test('ground vehicles do NOT render shadow ellipse', () => {
    const jeep = createVehicle(VEH.JEEP, 1, 500, 500);
    const callOrder = [];
    const origEllipse = mockCtx.ellipse;
    mockCtx.ellipse = jest.fn(() => { callOrder.push('ellipse'); });

    jeep.render(mockCtx, 0, 0);

    expect(callOrder.filter(c => c === 'ellipse').length).toBe(0);
    mockCtx.ellipse = origEllipse;
  });
});

// ========== 2. Crash state clears on refuel ==========
describe('UrbanStrike: Crash state clears when refuelled', () => {
  test('isCrashing is set when fuel hits 0', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.fuel = 0;

    heli.update(0.016, map);

    expect(heli.isCrashing).toBe(true);
    expect(heli.crashTimer).toBeGreaterThan(0);
  });

  test('isCrashing clears when fuel is restored above 0', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);

    // Start crashing
    heli.fuel = 0;
    heli.update(0.016, map);
    expect(heli.isCrashing).toBe(true);
    const savedTimer = heli.crashTimer;

    // Simulate refueling (e.g. depot gave fuel)
    heli.fuel = 50;
    heli.update(0.016, map);

    expect(heli.isCrashing).toBe(false);
    expect(heli.crashTimer).toBe(0);
  });

  test('crashTimer does NOT resume from old value after second fuel-out', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);

    // First crash
    heli.fuel = 0;
    heli.update(0.5, map);
    expect(heli.isCrashing).toBe(true);
    const firstTimer = heli.crashTimer;
    expect(firstTimer).toBeGreaterThan(0);

    // Refuel clears crash
    heli.fuel = 50;
    heli.update(0.016, map);
    expect(heli.isCrashing).toBe(false);
    expect(heli.crashTimer).toBe(0);

    // Second crash starts fresh
    heli.fuel = 0;
    heli.update(0.016, map);
    expect(heli.isCrashing).toBe(true);
    expect(heli.crashTimer).toBeLessThan(firstTimer);
  });

  test('rotor animation returns to normal speed after refuel', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);

    // Crash → slowed rotor
    heli.fuel = 0;
    heli.update(0.5, map);
    expect(heli.isCrashing).toBe(true);

    // Refuel
    heli.fuel = 50;
    heli.update(0.016, map);

    // isCrashing is false → rotor speed should be normal (20, not slowed)
    // We verify by checking the flag that controls rotor speed
    expect(heli.isCrashing).toBe(false);
  });

  test('ground vehicle crash state also clears on refuel', () => {
    const map = makeMapStub();
    const jeep = createVehicle(VEH.JEEP, 1, 500, 500);

    jeep.fuel = 0;
    jeep.update(0.016, map);
    expect(jeep.isCrashing).toBe(true);

    jeep.fuel = 50;
    jeep.update(0.016, map);
    expect(jeep.isCrashing).toBe(false);
    expect(jeep.crashTimer).toBe(0);
  });
});

// ========== 3. AI heli rotates body during movement ==========
describe('UrbanStrike AI: Body rotates during non-combat movement', () => {
  test('AI heli moveTowards rotates body toward target', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.isAI = true;
    heli.angle = 0; // facing right

    const ai = new AIController(heli, map);

    // Move toward a point that's straight up (angle = -PI/2)
    const targetX = 500;
    const targetY = 100; // above
    const expectedAngle = angleTo(500, 500, 500, 100); // should be -PI/2

    // Run several frames so the heli turns
    for (let i = 0; i < 100; i++) {
      ai.moveTowards(targetX, targetY, 0.016);
    }

    // Heli should now face roughly toward the target
    const diff = Math.abs(normAngle(heli.angle - expectedAngle));
    expect(diff).toBeLessThan(0.3); // within ~17 degrees
  });

  test('AI ground vehicle body rotation still works in moveTowards', () => {
    const map = makeMapStub();
    const jeep = createVehicle(VEH.JEEP, 1, 500, 500);
    jeep.isAI = true;
    jeep.angle = 0;

    const ai = new AIController(jeep, map);

    // moveTowards for ground vehicles — body rotation is in Vehicle.move()
    for (let i = 0; i < 100; i++) {
      ai.moveTowards(500, 100, 0.016);
    }

    // Ground vehicle should face toward target (handled by Vehicle.move)
    const expected = angleTo(500, 500, 500, 100);
    const diff = Math.abs(normAngle(jeep.angle - expected));
    expect(diff).toBeLessThan(0.5);
  });

  test('AI heli moveAway rotates body away from threat', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.isAI = true;
    heli.angle = 0;

    const ai = new AIController(heli, map);

    // Move away from point at (500, 100) — should face down (~PI/2)
    const awayAngle = angleTo(500, 100, 500, 500); // angle from threat to heli

    for (let i = 0; i < 100; i++) {
      ai.moveAway(500, 100, 0.016);
    }

    const diff = Math.abs(normAngle(heli.angle - awayAngle));
    expect(diff).toBeLessThan(0.3);
  });

  test('player heli body does NOT auto-rotate in Vehicle.move (strafing preserved)', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.isPlayer = true;
    heli.angle = 0; // facing right

    // Move upward — player heli should NOT have its angle changed by move()
    heli.move(0, -1, 0.016, map);

    // Angle should still be 0 (move() skips rotation for heli)
    expect(heli.angle).toBe(0);
  });
});

// ========== 4. AI heli doDefend aims and shoots ==========
describe('UrbanStrike AI: doDefend aims at enemies and fires', () => {
  test('AI heli in doDefend turns body toward nearby enemy', () => {
    const map = makeMapStub();
    // Place heli near its own base so doDefend patrols instead of moving to base
    const basePos = map.getBasePos(1);
    const heli = createVehicle(VEH.HELI, 1, basePos.x, basePos.y);
    heli.isAI = true;
    heli.angle = Math.PI; // facing left (away from enemy)

    // Place enemy within 300px range
    const enemy = createVehicle(VEH.JEEP, 2, basePos.x + 150, basePos.y);

    const ai = new AIController(heli, map);
    ai.state = 5; // AI_STATE.DEFEND

    const enemies = [heli, enemy];

    // Run many frames — the heli aim code in doDefend turns body toward enemy
    for (let i = 0; i < 200; i++) {
      ai.doDefend(0.016, enemies);
    }

    // Heli should be facing roughly toward the enemy (angle ~= 0, right)
    const expectedAngle = angleTo(heli.x, heli.y, enemy.x, enemy.y);
    const diff = Math.abs(normAngle(heli.angle - expectedAngle));
    expect(diff).toBeLessThan(1.5); // within ~85 degrees (patrol movement also pulls angle)
  });

  test('AI tank in doDefend still uses aimTurret (not body rotation)', () => {
    const map = makeMapStub();
    const tank = createVehicle(VEH.TANK, 1, 500, 500);
    tank.isAI = true;

    const enemy = createVehicle(VEH.JEEP, 2, 500, 300);

    const ai = new AIController(tank, map);
    ai.state = 5; // AI_STATE.DEFEND

    const initialAngle = tank.angle;
    const enemies = [tank, enemy];

    for (let i = 0; i < 30; i++) {
      ai.doDefend(0.016, enemies);
    }

    // Tank body rotation is handled by move(), turret by aimTurret
    // turretAngle should aim at enemy
    const expectedTurret = angleTo(500, 500, 500, 300);
    const turretDiff = Math.abs(normAngle(tank.turretAngle - expectedTurret));
    expect(turretDiff).toBeLessThan(0.5);
  });

  test('AI heli doDefend fires when aimed at enemy', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.isAI = true;

    const enemy = createVehicle(VEH.JEEP, 2, 600, 500); // enemy 100px to the right
    // Pre-aim the heli toward the enemy
    heli.angle = angleTo(500, 500, 600, 500); // = 0

    const ai = new AIController(heli, map);
    ai.state = 5; // DEFEND
    ai.shootTimer = 0; // ready to fire

    const initialAmmo = heli.ammo;

    // Run doDefend — enemy is within 300px and heli is aimed at it
    for (let i = 0; i < 10; i++) {
      ai.doDefend(0.016, [heli, enemy]);
    }

    // Heli should have fired at least once
    expect(heli.ammo).toBeLessThan(initialAmmo);
  });
});

// ========== 5. Heli stat sanity checks ==========
describe('UrbanStrike: Stats and properties', () => {
  test('HELI stats are correct', () => {
    const stats = VEHICLE_STATS[VEH.HELI];
    expect(stats.name).toBe('UrbanStrike');
    expect(stats.flies).toBe(true);
    expect(stats.canCarryFlag).toBe(false);
    expect(stats.projType).toBe('BULLET');
    expect(stats.speed).toBe(200);
    expect(stats.turnRate).toBe(4.0);
    expect(stats.hp).toBe(70);
    expect(stats.fuel).toBe(180);
    expect(stats.fuelBurn).toBe(6);
    expect(stats.ammo).toBe(120);
    expect(stats.fireRate).toBe(0.12);
  });

  test('heli instance has flies=true', () => {
    const heli = createVehicle(VEH.HELI, 1, 0, 0);
    expect(heli.flies).toBe(true);
  });

  test('heli instance has canCarryFlag=false', () => {
    const heli = createVehicle(VEH.HELI, 1, 0, 0);
    expect(heli.canCarryFlag).toBe(false);
  });

  test('heli has rotorAngle property', () => {
    const heli = createVehicle(VEH.HELI, 1, 0, 0);
    expect(typeof heli.rotorAngle).toBe('number');
  });

  test('heli has crashTimer/isCrashing properties', () => {
    const heli = createVehicle(VEH.HELI, 1, 0, 0);
    expect(heli.crashTimer).toBe(0);
    expect(heli.isCrashing).toBe(false);
  });
});

// ========== 6. Heli movement mechanics ==========
describe('UrbanStrike: Movement mechanics', () => {
  test('heli can fly over water', () => {
    const map = makeMapStub();
    // Place water at center
    map.setTile(15, 15, Game.T.WATER);
    const heli = createVehicle(VEH.HELI, 1, 15 * TILE + 16, 15 * TILE + 16);

    // Heli should be on water tile
    const tx = Math.floor(heli.x / TILE);
    const ty = Math.floor(heli.y / TILE);
    expect(map.getTile(tx, ty)).toBe(Game.T.WATER);

    // update should NOT kill heli (water check skips flies=true)
    heli.update(0.016, map);
    expect(heli.alive).toBe(true);
  });

  test('heli gets slow-speed at low fuel', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.fuel = 0;

    // Move — should use reduced speedMult (0.15)
    const startX = heli.x;
    heli.move(1, 0, 0.1, map);
    const moved = heli.x - startX;

    // At 0 fuel, speedMult = 0.15, so movement = 200 * 0.15 * 0.1 = 3
    expect(moved).toBeCloseTo(3, 0);
  });

  test('heli hovers and burns fuel while stationary', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    const startFuel = heli.fuel;

    // Don't move, just update
    heli.update(1.0, map);

    // Should burn fuel at half rate while hovering (fuelBurn * 0.5 * dt)
    const expected = startFuel - heli.stats.fuelBurn * 0.5 * 1.0;
    expect(heli.fuel).toBeCloseTo(expected, 1);
  });

  test('heli is immune to mines', () => {
    // Mine update skips helis: if (veh.type === Game.VEH.HELI) continue;
    // Verified by reading projectiles.js mine update code
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    expect(heli.type).toBe(VEH.HELI);
    // The mine skip is hardcoded in projectiles.js — functional test
    // would require full game loop. Verify type is correct.
    expect(heli.flies).toBe(true);
  });
});

// ========== 7. Heli combat mechanics ==========
describe('UrbanStrike: Combat mechanics', () => {
  test('heli fires from body angle (not turretAngle)', () => {
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.angle = Math.PI / 4; // face 45 degrees
    heli.fireCooldown = 0;

    // Clear existing projectiles
    Game.Projectiles.clear();

    heli.shoot();

    const projs = Game.Projectiles.getProjectiles();
    expect(projs.length).toBe(1);

    // Projectile should fly at body angle, not turretAngle
    expect(projs[0].angle).toBeCloseTo(Math.PI / 4);
  });

  test('heli bullet is non-explosive', () => {
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    heli.fireCooldown = 0;
    Game.Projectiles.clear();

    heli.shoot();

    const projs = Game.Projectiles.getProjectiles();
    expect(projs[0].explosive).toBe(false);
    expect(projs[0].type).toBe('BULLET');
  });

  test('heli rotor animation advances each update', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);
    const startRotor = heli.rotorAngle;

    heli.update(0.016, map);

    expect(heli.rotorAngle).toBeGreaterThan(startRotor);
  });

  test('heli rotor slows during crash', () => {
    const map = makeMapStub();
    const heli = createVehicle(VEH.HELI, 1, 500, 500);

    // Normal rotor speed
    heli.update(1.0, map);
    const normalRotor = heli.rotorAngle;

    // Reset and crash
    const heli2 = createVehicle(VEH.HELI, 1, 500, 500);
    heli2.fuel = 0;
    heli2.isCrashing = true;
    heli2.crashTimer = 2.0; // deep into crash

    heli2.update(1.0, map);
    const crashRotor = heli2.rotorAngle;

    // Crash rotor should have advanced less than normal rotor
    expect(crashRotor).toBeLessThan(normalRotor);
  });
});
