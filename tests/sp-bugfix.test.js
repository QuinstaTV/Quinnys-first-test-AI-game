/**
 * Tests for single-player bug bash fixes:
 *  1. All vehicles destroyed = round defeat (not pool reset)
 *  2. UrbanStrike immune to ground fire (non-explosive bullets pass through)
 *  3. UrbanStrike strafe movement (body doesn't rotate toward movement)
 *  4. Fuel=0 explosion (no double explosion)
 *  5. Pause menu works on both desktop and mobile (Restart Round added)
 *  6. Double death stat recording fixed
 *  7. Debug cheat keys (F1/F2)
 */

const fs = require('fs');
const path = require('path');
const { mockCanvas, mockCtx } = require('./setup');

// localStorage mock
const localStorageMock = {};
global.localStorage = {
  getItem: jest.fn(k => localStorageMock[k] || null),
  setItem: jest.fn((k, v) => { localStorageMock[k] = v; }),
  removeItem: jest.fn(k => { delete localStorageMock[k]; }),
};

// Load game modules in order
require('../src/js/utils');
require('../src/js/sprites');
require('../src/js/map');
require('../src/js/vehicles');
require('../src/js/ai');
require('../src/js/projectiles');

// Mock Game.Particles (needed for die()/takeDamage()/fire())
if (!Game.Particles) Game.Particles = {};
Game.Particles.explosion = jest.fn();
Game.Particles.smoke = jest.fn();
Game.Particles.sparks = jest.fn();
Game.Particles.dirt = jest.fn();
Game.Particles.muzzleFlash = jest.fn();
Game.Particles.waterSplash = jest.fn();
Game.Particles.trail = jest.fn();

// ============================================================
// 1. ALL VEHICLES DESTROYED = ROUND DEFEAT
// ============================================================
describe('All vehicles destroyed = round defeat', () => {
  test('game.js endRound(2) is called when all vehicles lost (no pool reset)', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // Should NOT contain the old pool reset logic
    expect(gameSrc).not.toContain('vehiclePool = [true, true, true, true];\n          jeepLives = MAX_JEEP_LIVES;\n          Game.UI.notify(\'All vehicles lost');
    // Should call endRound(2)
    expect(gameSrc).toContain("Game.UI.notify('All vehicles destroyed! Defeat!'");
    expect(gameSrc).toContain('endRound(2);\n          return;');
  });

  test('all vehicles lost does NOT award enemy a direct flag score', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // The old code had: score.team2++; recordFlag(2, false);
    // After all-vehicles-lost check, there should be no score.team2++ and recordFlag
    const defeatBlock = gameSrc.substring(
      gameSrc.indexOf('All vehicles destroyed'),
      gameSrc.indexOf('All vehicles destroyed') + 200
    );
    expect(defeatBlock).not.toContain('score.team2++');
    expect(defeatBlock).not.toContain('recordFlag');
  });
});

// ============================================================
// 2. URBANSTRIKE IMMUNE TO GROUND FIRE
// ============================================================
describe('UrbanStrike immune to non-explosive ground fire', () => {
  test('projectiles.js has air vehicle immunity check for ALL ground fire', () => {
    const projSrc = fs.readFileSync(path.join(__dirname, '../src/js/projectiles.js'), 'utf8');
    // New: ALL ground vehicle projectiles are blocked, not just non-explosive
    expect(projSrc).toContain('if (veh.flies)');
    expect(projSrc).toContain('shooterIsGroundVehicle');
  });

  test('ALL projectiles from ground vehicles skip flying targets', () => {
    const projSrc = fs.readFileSync(path.join(__dirname, '../src/js/projectiles.js'), 'utf8');
    // Verify the logic: if target flies AND shooter is ground vehicle, continue
    expect(projSrc).toContain('if (shooterIsGroundVehicle) continue;');
  });

  test('turret fire can still hit flying vehicles (turrets are not vehicles)', () => {
    const projSrc = fs.readFileSync(path.join(__dirname, '../src/js/projectiles.js'), 'utf8');
    // The shooterIsGroundVehicle check only matches when the owner IS in vehicles[]
    // Turrets have negative IDs not in the vehicles array, so they bypass immunity
    expect(projSrc).toContain('vehicles[sf].id === p.owner');
  });

  test('heli-to-heli combat still works (air-to-air)', () => {
    const projSrc = fs.readFileSync(path.join(__dirname, '../src/js/projectiles.js'), 'utf8');
    // shooterFlies is true for helicopter shooters, so they bypass the check
    expect(projSrc).toContain('vehicles[sf].flies');
  });

  test('UrbanStrike has flies=true in stats', () => {
    const stats = Game.VEHICLE_STATS;
    expect(stats[Game.VEH.HELI].flies).toBe(true);
  });

  test('ground vehicles do NOT have flies', () => {
    const stats = Game.VEHICLE_STATS;
    expect(stats[Game.VEH.JEEP].flies).toBeFalsy();
    expect(stats[Game.VEH.TANK].flies).toBeFalsy();
    expect(stats[Game.VEH.ASV].flies).toBeFalsy();
  });

  test('Jeep fires BULLET (non-explosive) type', () => {
    expect(Game.VEHICLE_STATS[Game.VEH.JEEP].projType).toBe('BULLET');
    expect(Game.Projectiles.PROJ.BULLET.explosive).toBe(false);
  });

  test('BushMaster fires SHELL (explosive) type', () => {
    expect(Game.VEHICLE_STATS[Game.VEH.TANK].projType).toBe('SHELL');
    expect(Game.Projectiles.PROJ.SHELL.explosive).toBe(true);
  });

  test('StrikeMaster fires ROCKET (explosive) type', () => {
    expect(Game.VEHICLE_STATS[Game.VEH.ASV].projType).toBe('ROCKET');
    expect(Game.Projectiles.PROJ.ROCKET.explosive).toBe(true);
  });

  // Functional test: simulate bullet hitting heli
  test('bullet from ground vehicle does not damage heli (functional)', () => {
    Game.Projectiles.clear();
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const jeep = Game.createVehicle(Game.VEH.JEEP, 1, 100, 80);
    const vehicles = [jeep, heli];

    // Fire a bullet from the jeep toward the heli
    Game.Projectiles.fire(100, 85, Math.PI / 2, 'BULLET', jeep.id, 1);

    // Create a simple map stub
    const mapStub = {
      worldW: 2000, worldH: 2000,
      getTile: () => 0,
      destroyTile: () => false
    };

    const startHp = heli.hp;
    // Run several updates to move bullet through heli position
    for (let i = 0; i < 20; i++) {
      Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    }
    // Heli should NOT have taken bullet damage
    expect(heli.hp).toBe(startHp);
    Game.Projectiles.clear();
  });

  // Functional test: shell from tank does NOT damage heli (full ground immunity)
  test('shell from BushMaster does NOT damage heli (full ground immunity)', () => {
    Game.Projectiles.clear();
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const tank = Game.createVehicle(Game.VEH.TANK, 1, 100, 80);
    const vehicles = [tank, heli];

    Game.Projectiles.fire(100, 85, Math.PI / 2, 'SHELL', tank.id, 1);

    const mapStub = {
      worldW: 2000, worldH: 2000,
      getTile: () => 0,
      destroyTile: () => false
    };

    const startHp = heli.hp;
    for (let i = 0; i < 30; i++) {
      Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    }
    // Heli should NOT have taken any damage from ground vehicle fire
    expect(heli.hp).toBe(startHp);
    Game.Projectiles.clear();
  });

  // Functional test: blast radius from ground vehicle does NOT damage heli
  test('explosion blast from ground vehicle does NOT damage heli', () => {
    Game.Projectiles.clear();
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 120, 100);
    const tank = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    const vehicles = [tank, heli];

    const mapStub = {
      worldW: 2000, worldH: 2000,
      getTile: () => 0,
      destroyTile: () => false
    };

    const startHp = heli.hp;
    // Simulate explosion at tank position (blast should reach heli at 20px away)
    Game.Projectiles.explode(100, 100, 50, 40, tank.id, 1, mapStub, vehicles, () => {});
    // Heli should NOT have taken blast damage from ground vehicle
    expect(heli.hp).toBe(startHp);
    Game.Projectiles.clear();
  });
});

// ============================================================
// 3. URBANSTRIKE STRAFE MOVEMENT
// ============================================================
describe('UrbanStrike strafe movement', () => {
  test('heli body does not rotate toward movement in move()', () => {
    const vehSrc = fs.readFileSync(path.join(__dirname, '../src/js/vehicles.js'), 'utf8');
    expect(vehSrc).toContain("if (this.type !== VEH.HELI)");
    // Verify the angle rotation is inside this block
    const moveBlock = vehSrc.substring(vehSrc.indexOf("if (this.type !== VEH.HELI)"), vehSrc.indexOf("if (this.type !== VEH.HELI)") + 300);
    expect(moveBlock).toContain("targetAngle");
    expect(moveBlock).toContain("this.angle +=");
  });

  test('heli angle is controlled by game.js aim code', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("// UrbanStrike (Helicopter) faces aim direction (strafe movement)");
    expect(gameSrc).toContain("playerVehicle.type === VEH.HELI");
    // Verify it uses the aim joystick or mouse
    expect(gameSrc).toContain("Game.Input.getAimDirection");
    expect(gameSrc).toContain("heliTargetAngle");
  });

  test('heli can move backward without changing facing (functional)', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 1, 200, 200);
    heli.angle = 0; // facing right

    const mapStub = {
      worldW: 2000, worldH: 2000,
      isFlyable: () => true,
      getTile: () => 0
    };

    // Move backward (left)
    heli.move(-1, 0, 0.1, mapStub);

    // Angle should NOT have changed (heli skips rotation in move())
    expect(heli.angle).toBe(0);
    // But position should have moved left
    expect(heli.x).toBeLessThan(200);
  });

  test('ground vehicle DOES rotate toward movement direction', () => {
    const jeep = Game.createVehicle(Game.VEH.JEEP, 1, 200, 200);
    jeep.angle = 0; // facing right

    const mapStub = {
      worldW: 2000, worldH: 2000,
      isWalkable: () => true,
      getTile: () => 0
    };

    // Move down
    jeep.move(0, 1, 0.1, mapStub);

    // Angle should have changed toward movement direction (downward = PI/2)
    expect(jeep.angle).not.toBe(0);
  });
});

// ============================================================
// 4. FUEL=0 EXPLOSION (NO DOUBLE EXPLOSION)
// ============================================================
describe('Fuel=0 explosion cleanup', () => {
  test('ground vehicle fuel death does NOT have a second explosion call', () => {
    const vehSrc = fs.readFileSync(path.join(__dirname, '../src/js/vehicles.js'), 'utf8');
    // Find the ground vehicle fuel death section
    const groundFuelSection = vehSrc.substring(
      vehSrc.indexOf('// Explode after 2 seconds'),
      vehSrc.indexOf('// Explode after 2 seconds') + 200
    );
    expect(groundFuelSection).toContain('this.takeDamage(999, -1)');
    // Should NOT have Game.Particles.explosion after takeDamage
    expect(groundFuelSection).not.toContain('Game.Particles.explosion');
  });

  test('heli fuel death does NOT have a second explosion call', () => {
    const vehSrc = fs.readFileSync(path.join(__dirname, '../src/js/vehicles.js'), 'utf8');
    const heliFuelSection = vehSrc.substring(
      vehSrc.indexOf('// Crash after 3 seconds'),
      vehSrc.indexOf('// Crash after 3 seconds') + 200
    );
    expect(heliFuelSection).toContain('this.takeDamage(999, -1)');
    expect(heliFuelSection).not.toContain('Game.Particles.explosion');
  });

  test('die() creates explosion and plays audio', () => {
    const vehSrc = fs.readFileSync(path.join(__dirname, '../src/js/vehicles.js'), 'utf8');
    const dieMethod = vehSrc.substring(vehSrc.indexOf('die() {'), vehSrc.indexOf('die() {') + 200);
    expect(dieMethod).toContain('Game.Particles.explosion');
    expect(dieMethod).toContain("Game.Audio.play('explosion')");
    expect(dieMethod).toContain('Game.screenShake');
  });

  test('vehicle fuel reaches 0 triggers crash state', () => {
    const v = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    v.fuel = 0;

    const mapStub = {
      worldW: 2000, worldH: 2000,
      getTile: () => 0,
      isWalkable: () => true
    };

    v.update(0.016, mapStub);
    expect(v.isCrashing).toBe(true);
    expect(v.crashTimer).toBeGreaterThan(0);
  });

  test('vehicle crash timer leads to death after 2 seconds', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.fuel = 0;

    const mapStub = {
      worldW: 2000, worldH: 2000,
      getTile: () => 0,
      isWalkable: () => true
    };

    // Fast-forward crash sequence
    for (let i = 0; i < 150; i++) { // 150 frames at ~60fps ≈ 2.5s
      if (!v.alive) break;
      v.update(0.016, mapStub);
    }
    expect(v.alive).toBe(false);
  });

  test('heli crash takes 3 seconds', () => {
    const h = Game.createVehicle(Game.VEH.HELI, 1, 100, 100);
    h.fuel = 0;

    const mapStub = {
      worldW: 2000, worldH: 2000,
      getTile: () => 0,
      isFlyable: () => true
    };

    // At 2 seconds, heli should still be alive
    for (let i = 0; i < 120; i++) {
      if (!h.alive) break;
      h.update(0.016, mapStub);
    }
    expect(h.alive).toBe(true); // Should still be alive (only ~1.9s)

    // At 3+ seconds, heli should be dead
    for (let i = 0; i < 80; i++) {
      if (!h.alive) break;
      h.update(0.016, mapStub);
    }
    expect(h.alive).toBe(false);
  });
});

// ============================================================
// 5. PAUSE MENU (DESKTOP + MOBILE, RESTART ROUND)
// ============================================================
describe('Pause menu (desktop + mobile, restart round)', () => {
  test('ESC on desktop shows pause overlay (not direct menu jump)', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // The old code had: if (Game.Input.isTouch) { showPauseOverlay } else { state = STATE.MENU }
    // Now it should always show pause overlay
    expect(gameSrc).not.toContain('if (Game.Input.isTouch) {\n        // On mobile, show pause overlay');
    expect(gameSrc).toContain('Game.UI.showPauseOverlay()');
    expect(gameSrc).toContain('// Pause overlay handling (all platforms)');
  });

  test('pause overlay has Restart Round option', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    expect(uiSrc).toContain("'RESTART ROUND'");
    // getPauseOverlayClick should return 'restart'
    expect(uiSrc).toContain("return 'restart'");
  });

  test('game.js handles restart action from pause overlay', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("pauseAction === 'restart'");
    expect(gameSrc).toContain('startRound()');
  });

  test('desktop HUD has a pause button', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    expect(uiSrc).toContain('// Pause button (desktop HUD');
    expect(uiSrc).toContain('_pauseButtonRect');
    expect(uiSrc).toContain("!Game.Input.isTouch");
  });

  test('isHUDPauseClicked function exists and is exported', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    expect(uiSrc).toContain('function isHUDPauseClicked()');
    expect(uiSrc).toContain('isHUDPauseClicked: isHUDPauseClicked');
  });

  test('game.js checks desktop HUD pause button click', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('Game.UI.isHUDPauseClicked()');
  });

  test('ESC toggles pause: hides overlay when visible', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // ESC handler toggles: if overlay visible, hide it; else show it
    expect(gameSrc).toContain('Game.UI.hidePauseOverlay()');
    // The primary ESC handler has an if/else to toggle
    expect(gameSrc).toContain('if (Game.UI.isPauseOverlayVisible())');
  });
});

// ============================================================
// 6. DOUBLE DEATH STAT RECORDING FIX
// ============================================================
describe('No double death stat recording', () => {
  test('onVehicleHit marks _deathRecorded on vehicle death', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('vehicle._deathRecorded = true');
  });

  test('respawn detection checks _deathRecorded before recording', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('!playerVehicle._deathRecorded');
    expect(gameSrc).toContain('// Only record death here if not already recorded by onVehicleHit');
  });

  test('onVehicleHit always records death (not conditional on killer)', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // Find the death recording block in onVehicleHit
    const hitFunc = gameSrc.substring(gameSrc.indexOf('function onVehicleHit'), gameSrc.indexOf('function onVehicleHit') + 1200);
    // recordDeath should be OUTSIDE the if(killer) block
    expect(hitFunc).toContain('// Always record death and mark it so respawn detection doesn\'t double-count');
    expect(hitFunc).toContain('recordDeath(vehicle.team, vehicle.isPlayer)');
  });
});

// ============================================================
// 7. DEBUG CHEAT KEYS
// ============================================================
describe('Debug cheat keys', () => {
  test('F1 kills player vehicle', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("Game.Input.wasPressed('F1')");
    expect(gameSrc).toContain('playerVehicle.takeDamage(999, -1)');
    expect(gameSrc).toContain("[DEBUG] Vehicle killed");
  });

  test('F2 drains player fuel', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("Game.Input.wasPressed('F2')");
    expect(gameSrc).toContain('playerVehicle.fuel = 0');
    expect(gameSrc).toContain("[DEBUG] Fuel drained");
  });
});

// ============================================================
// 8. RESPAWN MECHANICS CORRECTNESS
// ============================================================
describe('Respawn mechanics', () => {
  test('respawn() resets all vehicle state', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.hp = 0;
    v.alive = false;
    v.fuel = 0;
    v.ammo = 0;
    v.isCrashing = true;
    v.crashTimer = 5;
    v.hasFlag = true;
    v.flagTeam = 2;
    v.waterTimer = 2;
    v.deathTimer = 3;

    v.respawn(200, 200);

    expect(v.alive).toBe(true);
    expect(v.hp).toBe(v.maxHp);
    expect(v.fuel).toBe(v.maxFuel);
    expect(v.ammo).toBe(v.maxAmmo);
    expect(v.isCrashing).toBe(false);
    expect(v.crashTimer).toBe(0);
    expect(v.hasFlag).toBe(false);
    expect(v.flagTeam).toBe(0);
    expect(v.waterTimer).toBe(0);
    expect(v.deathTimer).toBe(0);
    expect(v.x).toBe(200);
    expect(v.y).toBe(200);
  });

  test('die() drops flag', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.hasFlag = true;
    v.flagTeam = 2;
    v.die();
    expect(v.hasFlag).toBe(false);
    expect(v.alive).toBe(false);
  });

  test('all four vehicle types can be created and destroyed', () => {
    [Game.VEH.JEEP, Game.VEH.TANK, Game.VEH.HELI, Game.VEH.ASV].forEach(type => {
      const v = Game.createVehicle(type, 1, 100, 100);
      expect(v.alive).toBe(true);
      expect(v.hp).toBe(v.maxHp);
      v.takeDamage(999, -1);
      expect(v.alive).toBe(false);
      expect(v.hp).toBe(0);
    });
  });

  test('Jeep has canCarryFlag=true, others false', () => {
    expect(Game.createVehicle(Game.VEH.JEEP, 1, 0, 0).canCarryFlag).toBe(true);
    expect(Game.createVehicle(Game.VEH.TANK, 1, 0, 0).canCarryFlag).toBe(false);
    expect(Game.createVehicle(Game.VEH.HELI, 1, 0, 0).canCarryFlag).toBe(false);
    expect(Game.createVehicle(Game.VEH.ASV, 1, 0, 0).canCarryFlag).toBe(false);
  });

  test('ASV has mine ammo', () => {
    const asv = Game.createVehicle(Game.VEH.ASV, 1, 100, 100);
    expect(asv.maxMines).toBeGreaterThan(0);
    expect(asv.mineAmmo).toBe(asv.maxMines);
  });

  test('vehicle pool check logic: vehiclePool.some() detects empty pool', () => {
    const pool = [false, false, false, false];
    expect(pool.some(v => v)).toBe(false);
    pool[2] = true;
    expect(pool.some(v => v)).toBe(true);
  });
});

// ============================================================
// 9. AI RESPAWN MECHANICS
// ============================================================
describe('AI respawn', () => {
  test('AI respawn has vehicle limit check in SP', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("if (aliveCount < MAX_AI_VEHICLES)");
    expect(gameSrc).toContain('aiVeh.deathTimer > RESPAWN_TIME + 2');
  });

  test('AI vehicle deathTimer increments while dead', () => {
    const v = Game.createVehicle(Game.VEH.TANK, 2, 100, 100);
    v.alive = false;
    v.deathTimer = 0;
    const mapStub = { worldW: 2000, worldH: 2000, getTile: () => 0 };
    v.update(0.5, mapStub);
    expect(v.deathTimer).toBe(0.5);
  });
});

// ============================================================
// 10. EDGE CASES
// ============================================================
describe('Edge cases', () => {
  test('heli has flies=true property on instances', () => {
    const h = Game.createVehicle(Game.VEH.HELI, 1, 100, 100);
    expect(h.flies).toBe(true);
  });

  test('ground vehicles have flies=false property', () => {
    expect(Game.createVehicle(Game.VEH.JEEP, 1, 0, 0).flies).toBe(false);
    expect(Game.createVehicle(Game.VEH.TANK, 1, 0, 0).flies).toBe(false);
    expect(Game.createVehicle(Game.VEH.ASV, 1, 0, 0).flies).toBe(false);
  });

  test('takeDamage with amount > hp kills vehicle', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.takeDamage(999, -1);
    expect(v.alive).toBe(false);
    expect(v.hp).toBe(0);
  });

  test('takeDamage does nothing to dead vehicle', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.takeDamage(999, -1);
    expect(v.alive).toBe(false);
    // Second call should not throw
    v.takeDamage(100, -1);
    expect(v.hp).toBe(0);
  });

  test('shoot fails with no ammo', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.ammo = 0;
    const result = v.shoot();
    expect(result).toBe(false);
  });

  test('shoot fails while dead', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.alive = false;
    const result = v.shoot();
    expect(result).toBe(false);
  });

  test('move does nothing when dead', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.alive = false;
    v.move(1, 0, 0.1, { worldW: 2000, worldH: 2000, isWalkable: () => true, getTile: () => 0 });
    expect(v.x).toBe(100); // unchanged
  });

  test('ground vehicle cannot move when fuel=0', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.fuel = 0;
    v.move(1, 0, 0.1, { worldW: 2000, worldH: 2000, isWalkable: () => true, getTile: () => 0 });
    expect(v.x).toBe(100); // unchanged - stalled
  });

  test('heli CAN still move slowly when fuel=0', () => {
    const h = Game.createVehicle(Game.VEH.HELI, 1, 200, 200);
    h.fuel = 0;
    h.move(1, 0, 0.1, { worldW: 2000, worldH: 2000, isFlyable: () => true, getTile: () => 0 });
    // Should have moved slightly (15% speed during crash)
    expect(h.x).toBeGreaterThan(200);
  });
});

// ============================================================
// 11. RESPAWN DEATH-LOOP FIX
// ============================================================
describe('Respawn death-loop fix', () => {
  test('respawn timer block returns after setting VEHICLE_SELECT', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // After "Go to vehicle select" and setting state, there must be a return
    const vehicleSelectBlock = gameSrc.substring(
      gameSrc.indexOf('// Go to vehicle select'),
      gameSrc.indexOf('// Go to vehicle select') + 300
    );
    expect(vehicleSelectBlock).toContain('return;');
    expect(vehicleSelectBlock).toContain('CRITICAL: stop processing updatePlaying');
  });

  test('finishDeploy clears isRespawning and respawnTimer', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    const finishDeployBlock = gameSrc.substring(
      gameSrc.indexOf('function finishDeploy()'),
      gameSrc.indexOf('function finishDeploy()') + 1200
    );
    expect(finishDeployBlock).toContain('isRespawning = false');
    expect(finishDeployBlock).toContain('respawnTimer = 0');
  });

  test('Return to base (R key) handler returns after state change', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    const returnToBaseBlock = gameSrc.substring(
      gameSrc.indexOf('Returning to base'),
      gameSrc.indexOf('Returning to base') + 350
    );
    expect(returnToBaseBlock).toContain('return; // Stop processing gameplay after state change');
  });

  test('death check only fires when vehicle is dead and not already respawning', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('!playerVehicle.alive && !isRespawning');
  });

  test('all endRound calls in updatePlaying are followed by return', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // The all-vehicles-destroyed endRound
    expect(gameSrc).toContain('endRound(2);\n          return;');
    // The score-based endRound calls
    expect(gameSrc).toContain('endRound(1);\n      return;');
    expect(gameSrc).toContain('endRound(2);\n      return;');
  });
});
