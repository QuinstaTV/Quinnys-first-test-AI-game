/**
 * SP Bug Bash regression tests — comprehensive single-player mode tests
 * Covers:
 *  1. Helicopter full immunity to ALL ground-vehicle fire (bullets + shells + rockets + blast)
 *  2. gameTime does NOT advance while paused
 *  3. HUD pause button not consumed when overlay is visible
 *  4. Fuel stall notification for ground vehicles
 *  5. AI-to-air and turret-to-air fire still works
 *  6. Vehicle pool / jeep lives / defeat flow
 *  7. Complete respawn lifecycle
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

// Mock Game.Particles
if (!Game.Particles) Game.Particles = {};
Game.Particles.explosion = jest.fn();
Game.Particles.smoke = jest.fn();
Game.Particles.sparks = jest.fn();
Game.Particles.dirt = jest.fn();
Game.Particles.muzzleFlash = jest.fn();
Game.Particles.waterSplash = jest.fn();
Game.Particles.trail = jest.fn();
Game.Particles.debris = jest.fn();

const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
const projSrc = fs.readFileSync(path.join(__dirname, '../src/js/projectiles.js'), 'utf8');
const vehSrc = fs.readFileSync(path.join(__dirname, '../src/js/vehicles.js'), 'utf8');
const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');

// ============================================================
// 1. HELICOPTER FULL GROUND-FIRE IMMUNITY (ALL projectile types)
// ============================================================
describe('Helicopter full ground-fire immunity', () => {
  const mapStub = {
    worldW: 2000, worldH: 2000,
    getTile: () => 0,
    destroyTile: () => false
  };

  afterEach(() => Game.Projectiles.clear());

  test('BULLET from Jeep (ground) does NOT damage heli', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const jeep = Game.createVehicle(Game.VEH.JEEP, 1, 100, 80);
    const vehicles = [jeep, heli];
    Game.Projectiles.fire(100, 85, Math.PI / 2, 'BULLET', jeep.id, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(heli.hp).toBe(heli.maxHp);
  });

  test('SHELL from BushMaster (ground) does NOT damage heli', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const tank = Game.createVehicle(Game.VEH.TANK, 1, 100, 80);
    const vehicles = [tank, heli];
    Game.Projectiles.fire(100, 95, Math.PI / 2, 'SHELL', tank.id, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(heli.hp).toBe(heli.maxHp);
  });

  test('ROCKET from StrikeMaster (ground) does NOT damage heli', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const asv = Game.createVehicle(Game.VEH.ASV, 1, 100, 80);
    const vehicles = [asv, heli];
    Game.Projectiles.fire(100, 95, Math.PI / 2, 'ROCKET', asv.id, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(heli.hp).toBe(heli.maxHp);
  });

  test('explosion blast from ground vehicle does NOT damage heli', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 120, 100);
    const tank = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    const vehicles = [tank, heli];
    Game.Projectiles.explode(100, 100, 50, 40, tank.id, 1, mapStub, vehicles, () => {});
    expect(heli.hp).toBe(heli.maxHp);
  });

  test('BULLET from heli (air) DOES damage enemy heli (air-to-air)', () => {
    const heli1 = Game.createVehicle(Game.VEH.HELI, 1, 100, 80);
    const heli2 = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const vehicles = [heli1, heli2];
    Game.Projectiles.fire(100, 85, Math.PI / 2, 'BULLET', heli1.id, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(heli2.hp).toBeLessThan(heli2.maxHp);
  });

  test('explosion blast from heli (air) DOES damage enemy heli', () => {
    const heli1 = Game.createVehicle(Game.VEH.HELI, 1, 100, 100);
    const heli2 = Game.createVehicle(Game.VEH.HELI, 2, 120, 100);
    const vehicles = [heli1, heli2];
    Game.Projectiles.explode(100, 100, 50, 40, heli1.id, 1, mapStub, vehicles, () => {});
    expect(heli2.hp).toBeLessThan(heli2.maxHp);
  });

  test('turret fire (negative owner ID) CAN damage heli', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 2, 100, 100);
    const vehicles = [heli];
    // Turrets use owner = -100 - turretIndex
    Game.Projectiles.fire(100, 85, Math.PI / 2, 'BULLET', -100, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(heli.hp).toBeLessThan(heli.maxHp);
  });

  test('ground vehicle fire CAN damage ground vehicles (no friendly immunity bug)', () => {
    const jeep = Game.createVehicle(Game.VEH.JEEP, 1, 100, 80);
    const tank = Game.createVehicle(Game.VEH.TANK, 2, 100, 100);
    const vehicles = [jeep, tank];
    Game.Projectiles.fire(100, 85, Math.PI / 2, 'BULLET', jeep.id, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(tank.hp).toBeLessThan(tank.maxHp);
  });

  test('heli fire CAN damage ground vehicles', () => {
    const heli = Game.createVehicle(Game.VEH.HELI, 1, 100, 80);
    const tank = Game.createVehicle(Game.VEH.TANK, 2, 100, 100);
    const vehicles = [heli, tank];
    Game.Projectiles.fire(100, 95, Math.PI / 2, 'BULLET', heli.id, 1);
    for (let i = 0; i < 30; i++) Game.Projectiles.update(0.016, mapStub, vehicles, () => {});
    expect(tank.hp).toBeLessThan(tank.maxHp);
  });

  test('immunity source code uses shooterIsGroundVehicle pattern', () => {
    expect(projSrc).toContain('shooterIsGroundVehicle');
    expect(projSrc).toContain('if (shooterIsGroundVehicle) continue;');
    // Also in the explode() function
    expect(projSrc).toContain('ownerIsGroundVehicle');
    expect(projSrc).toContain('if (ownerIsGroundVehicle) continue;');
  });
});

// ============================================================
// 2. GAME TIME DOES NOT ADVANCE WHILE PAUSED
// ============================================================
describe('gameTime does not advance while paused', () => {
  test('gameTime += dt is placed AFTER the pause overlay return', () => {
    // The pause overlay handling has a `return;` before gameTime increments
    const pauseReturn = gameSrc.indexOf('return; // Don\'t process game input while paused');
    const gameTimeInc = gameSrc.indexOf('gameTime += dt;');
    expect(pauseReturn).toBeGreaterThan(-1);
    expect(gameTimeInc).toBeGreaterThan(-1);
    // gameTime must come AFTER the pause return
    expect(gameTimeInc).toBeGreaterThan(pauseReturn);
  });

  test('gameTime comment indicates it only runs while NOT paused', () => {
    expect(gameSrc).toContain('// Game timer only advances while NOT paused');
  });
});

// ============================================================
// 3. HUD PAUSE BUTTON NOT CONSUMED WHILE OVERLAY VISIBLE
// ============================================================
describe('HUD pause button click guard', () => {
  test('HUD pause click check guards against isPauseOverlayVisible', () => {
    // The HUD pause button click check should include !isPauseOverlayVisible()
    expect(gameSrc).toContain('!Game.UI.isPauseOverlayVisible()');
    // It should appear before isHUDPauseClicked
    const guardIdx = gameSrc.indexOf('!Game.UI.isPauseOverlayVisible()');
    const hudPauseIdx = gameSrc.indexOf('Game.UI.isHUDPauseClicked()');
    expect(guardIdx).toBeLessThan(hudPauseIdx);
  });

  test('ESC handler toggles pause on/off', () => {
    // ESC should hide overlay if visible, show it if hidden
    const escBlock = gameSrc.substring(
      gameSrc.indexOf("Game.Input.wasPressed('Escape') || Game.Input.isPauseRequested()"),
      gameSrc.indexOf("Game.Input.wasPressed('Escape') || Game.Input.isPauseRequested()") + 400
    );
    expect(escBlock).toContain('Game.UI.isPauseOverlayVisible()');
    expect(escBlock).toContain('Game.UI.hidePauseOverlay()');
    expect(escBlock).toContain('Game.UI.showPauseOverlay()');
  });
});

// ============================================================
// 4. FUEL STALL NOTIFICATION FOR GROUND VEHICLES
// ============================================================
describe('Fuel stall notification', () => {
  test('game.js has fuel stall notification code', () => {
    expect(gameSrc).toContain('OUT OF FUEL');
    expect(gameSrc).toContain('_stallNotified');
  });

  test('stall notification only fires once (uses _stallNotified flag)', () => {
    // The code checks !playerVehicle._stallNotified before notifying
    expect(gameSrc).toContain('!playerVehicle._stallNotified');
    expect(gameSrc).toContain('playerVehicle._stallNotified = true');
  });

  test('stall notification only applies to ground vehicles (not heli)', () => {
    expect(gameSrc).toContain('!playerVehicle.flies');
  });
});

// ============================================================
// 5. FUEL=0 CRASH SEQUENCES (ALL VEHICLE TYPES)
// ============================================================
describe('Fuel=0 crash sequence for all vehicle types', () => {
  const mapStub = {
    worldW: 2000, worldH: 2000,
    getTile: () => 2, // GRASS (not WATER=0)
    isWalkable: () => true,
    isFlyable: () => true
  };

  test('Jeep stalls and explodes within ~2s when fuel=0', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.fuel = 0;
    for (let i = 0; i < 150; i++) { if (!v.alive) break; v.update(0.016, mapStub); }
    expect(v.alive).toBe(false);
  });

  test('BushMaster stalls and explodes within ~2s when fuel=0', () => {
    const v = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    v.fuel = 0;
    for (let i = 0; i < 150; i++) { if (!v.alive) break; v.update(0.016, mapStub); }
    expect(v.alive).toBe(false);
  });

  test('StrikeMaster stalls and explodes within ~2s when fuel=0', () => {
    const v = Game.createVehicle(Game.VEH.ASV, 1, 100, 100);
    v.fuel = 0;
    for (let i = 0; i < 150; i++) { if (!v.alive) break; v.update(0.016, mapStub); }
    expect(v.alive).toBe(false);
  });

  test('UrbanStrike crashes and explodes within ~3s when fuel=0', () => {
    const h = Game.createVehicle(Game.VEH.HELI, 1, 100, 100);
    h.fuel = 0;
    // At 2s should still be alive
    for (let i = 0; i < 120; i++) { if (!h.alive) break; h.update(0.016, mapStub); }
    expect(h.alive).toBe(true);
    // At 3.5s should be dead
    for (let i = 0; i < 100; i++) { if (!h.alive) break; h.update(0.016, mapStub); }
    expect(h.alive).toBe(false);
  });

  test('crash state clears if fuel is restored mid-crash', () => {
    const v = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    v.fuel = 0;
    v.update(0.5, mapStub);
    expect(v.isCrashing).toBe(true);
    // Restore fuel (simulates being on a depot)
    v.fuel = 50;
    v.update(0.016, mapStub);
    expect(v.isCrashing).toBe(false);
    expect(v.crashTimer).toBe(0);
  });

  test('ground vehicle cannot move when fuel=0', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.fuel = 0;
    const moveMap = { worldW: 2000, worldH: 2000, isWalkable: () => true, getTile: () => 0 };
    v.move(1, 0, 0.1, moveMap);
    expect(v.x).toBe(100);
  });

  test('heli can still drift slowly when fuel=0 (15% speed)', () => {
    const h = Game.createVehicle(Game.VEH.HELI, 1, 200, 200);
    h.fuel = 0;
    const moveMap = { worldW: 2000, worldH: 2000, isFlyable: () => true, getTile: () => 0 };
    h.move(1, 0, 0.1, moveMap);
    expect(h.x).toBeGreaterThan(200);
  });
});

// ============================================================
// 6. VEHICLE POOL / JEEP LIVES / DEFEAT FLOW
// ============================================================
describe('Vehicle pool and defeat flow', () => {
  test('vehiclePool.some() correctly detects all destroyed', () => {
    expect([false, false, false, false].some(v => v)).toBe(false);
    expect([false, true, false, false].some(v => v)).toBe(true);
  });

  test('game.js has defeat flow with endRound(2) when pool empty', () => {
    expect(gameSrc).toContain("var anyAvailable = vehiclePool.some(function (v) { return v; });");
    expect(gameSrc).toContain("endRound(2);\n          return;");
    expect(gameSrc).toContain("All vehicles destroyed! Defeat!");
  });

  test('jeepLives decrements when jeep type dies', () => {
    expect(gameSrc).toContain('jeepLives--');
    expect(gameSrc).toContain('if (jeepLives <= 0)');
    expect(gameSrc).toContain("vehiclePool[VEH.JEEP] = false");
  });

  test('non-jeep vehicle death marks pool type as false', () => {
    expect(gameSrc).toContain('vehiclePool[playerVehicle.type] = false');
  });

  test('selected vehicle pre-selects first available on respawn', () => {
    expect(gameSrc).toContain('if (vehiclePool[vi]) { selectedVehicle = vi; break; }');
  });

  test('startRound resets vehiclePool and jeepLives', () => {
    const roundBlock = gameSrc.substring(
      gameSrc.indexOf('function startRound()'),
      gameSrc.indexOf('function startRound()') + 800
    );
    expect(roundBlock).toContain('vehiclePool = [true, true, true, true]');
    expect(roundBlock).toContain('jeepLives = MAX_JEEP_LIVES');
  });
});

// ============================================================
// 7. PAUSE OVERLAY COMPLETENESS
// ============================================================
describe('Pause overlay features', () => {
  test('pause overlay has Resume button', () => {
    expect(uiSrc).toContain("'RESUME'");
    expect(uiSrc).toContain("return 'resume'");
  });

  test('pause overlay has Restart Round button', () => {
    expect(uiSrc).toContain("'RESTART ROUND'");
    expect(uiSrc).toContain("return 'restart'");
  });

  test('pause overlay has Quit to Menu button', () => {
    expect(uiSrc).toContain("'QUIT TO MENU'");
    expect(uiSrc).toContain("return 'quit'");
  });

  test('pause overlay has Toggle Music button', () => {
    expect(uiSrc).toContain("'TOGGLE MUSIC'");
    expect(uiSrc).toContain("return 'music'");
  });

  test('pause overlay renders semi-transparent background', () => {
    expect(uiSrc).toContain("rgba(0,0,0,0.75)");
    expect(uiSrc).toContain("'PAUSED'");
  });

  test('game.js handles all pause actions correctly', () => {
    expect(gameSrc).toContain("pauseAction === 'resume'");
    expect(gameSrc).toContain("pauseAction === 'restart'");
    expect(gameSrc).toContain("pauseAction === 'quit'");
    expect(gameSrc).toContain("pauseAction === 'music'");
  });

  test('HUD pause button exists on desktop', () => {
    expect(uiSrc).toContain('// Pause button (desktop HUD');
    expect(uiSrc).toContain('_pauseButtonRect');
  });
});

// ============================================================
// 8. COMPLETE RESPAWN LIFECYCLE
// ============================================================
describe('Complete respawn lifecycle', () => {
  test('respawn() fully resets all vehicle properties', () => {
    const v = Game.createVehicle(Game.VEH.ASV, 2, 50, 50);
    v.hp = 0;
    v.alive = false;
    v.fuel = 0;
    v.ammo = 0;
    v.mineAmmo = 0;
    v.isCrashing = true;
    v.crashTimer = 5;
    v.hasFlag = true;
    v.flagTeam = 1;
    v.waterTimer = 3;
    v.deathTimer = 10;
    v.fireCooldown = 5;
    v.mineCooldown = 5;

    v.respawn(300, 400);

    expect(v.alive).toBe(true);
    expect(v.hp).toBe(v.maxHp);
    expect(v.fuel).toBe(v.maxFuel);
    expect(v.ammo).toBe(v.maxAmmo);
    expect(v.mineAmmo).toBe(v.maxMines);
    expect(v.isCrashing).toBe(false);
    expect(v.crashTimer).toBe(0);
    expect(v.hasFlag).toBe(false);
    expect(v.flagTeam).toBe(0);
    expect(v.waterTimer).toBe(0);
    expect(v.deathTimer).toBe(0);
    expect(v.fireCooldown).toBe(0);
    expect(v.mineCooldown).toBe(0);
    expect(v.x).toBe(300);
    expect(v.y).toBe(400);
  });

  test('die() sets alive=false, plays explosion, drops flag', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.hasFlag = true;
    v.flagTeam = 2;
    jest.clearAllMocks();
    v.die();
    expect(v.alive).toBe(false);
    expect(v.hasFlag).toBe(false);
    expect(v.deathTimer).toBe(0);
    expect(Game.Particles.explosion).toHaveBeenCalled();
  });

  test('takeDamage(999) triggers die()', () => {
    const v = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    jest.clearAllMocks();
    v.takeDamage(999, -1);
    expect(v.alive).toBe(false);
    expect(v.hp).toBe(0);
    expect(Game.Particles.explosion).toHaveBeenCalled();
  });

  test('dead vehicle does not update normally', () => {
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.alive = false;
    v.deathTimer = 0;
    const mapStub = { worldW: 2000, worldH: 2000, getTile: () => 0 };
    v.update(0.5, mapStub);
    // deathTimer should have incremented
    expect(v.deathTimer).toBe(0.5);
  });

  test('finishDeploy creates new vehicle and clears respawn flags', () => {
    expect(gameSrc).toContain('function finishDeploy()');
    const deployBlock = gameSrc.substring(
      gameSrc.indexOf('function finishDeploy()'),
      gameSrc.indexOf('function finishDeploy()') + 1200
    );
    expect(deployBlock).toContain('isRespawning = false');
    expect(deployBlock).toContain('respawnTimer = 0');
    expect(deployBlock).toContain('Game.createVehicle(selectedVehicle');
    expect(deployBlock).toContain("state = STATE.PLAYING");
  });
});

// ============================================================
// 9. HELICOPTER STRAFE MOVEMENT
// ============================================================
describe('Helicopter strafe movement', () => {
  test('heli move() does not rotate body toward movement direction', () => {
    const h = Game.createVehicle(Game.VEH.HELI, 1, 200, 200);
    h.angle = 0; // facing right
    const mapStub = { worldW: 2000, worldH: 2000, isFlyable: () => true, getTile: () => 0 };

    // Move backward (left)
    h.move(-1, 0, 0.1, mapStub);
    expect(h.angle).toBe(0); // angle unchanged

    // Move up
    h.move(0, -1, 0.1, mapStub);
    expect(h.angle).toBe(0); // still unchanged
  });

  test('ground vehicle move() DOES rotate body toward movement', () => {
    const j = Game.createVehicle(Game.VEH.JEEP, 1, 200, 200);
    j.angle = 0;
    const mapStub = { worldW: 2000, worldH: 2000, isWalkable: () => true, getTile: () => 0 };
    j.move(0, 1, 0.1, mapStub); // move down
    expect(j.angle).not.toBe(0); // angle changed toward PI/2
  });

  test('vehicles.js skips heli rotation inside move()', () => {
    expect(vehSrc).toContain("if (this.type !== VEH.HELI)");
  });

  test('game.js sets heli angle from aim direction', () => {
    expect(gameSrc).toContain("// UrbanStrike (Helicopter) faces aim direction (strafe movement)");
    expect(gameSrc).toContain("playerVehicle.type === VEH.HELI");
    expect(gameSrc).toContain("heliTargetAngle");
  });
});

// ============================================================
// 10. MINE IMMUNITY FOR HELICOPTER
// ============================================================
describe('Helicopter mine immunity', () => {
  test('mine update skips helicopters', () => {
    expect(projSrc).toContain("veh.type === Game.VEH.HELI");
    // The mine check says: if (veh.type === VEH.HELI) continue;
    expect(projSrc).toMatch(/if \(veh\.type === Game\.VEH\.HELI\) continue/);
  });
});

// ============================================================
// 11. ROUND SYSTEM INTEGRITY
// ============================================================
describe('Round system integrity', () => {
  test('10-round max is defined', () => {
    expect(gameSrc).toContain('const MAX_ROUNDS = 10');
  });

  test('WIN_SCORE is 3 flags per round', () => {
    expect(gameSrc).toContain('const WIN_SCORE = 3');
  });

  test('endRound records stats and transitions to ROUND_STATS', () => {
    const endRoundBlock = gameSrc.substring(
      gameSrc.indexOf('function endRound('),
      gameSrc.indexOf('function endRound(') + 700
    );
    expect(endRoundBlock).toContain('state = STATE.ROUND_STATS');
    expect(endRoundBlock).toContain('allRoundStats.push');
    expect(endRoundBlock).toContain('Game.Audio.stopMusic()');
  });

  test('score check for both teams in updatePlaying', () => {
    expect(gameSrc).toContain('score.team1 >= WIN_SCORE');
    expect(gameSrc).toContain('score.team2 >= WIN_SCORE');
  });
});

/* ========================================================
 *  12. UrbanStrike normAngle import — game.js must import
 *      normAngle so the helicopter aim code does not throw
 *      a ReferenceError that freezes the render loop.
 * ======================================================== */
describe('UrbanStrike normAngle import (lockup fix)', () => {
  test('game.js destructures normAngle from Game', () => {
    // The destructuring line at the top of the IIFE must include normAngle
    const destructureMatch = gameSrc.match(
      /const\s*\{[^}]*\}\s*=\s*Game\s*;/
    );
    expect(destructureMatch).not.toBeNull();
    expect(destructureMatch[0]).toContain('normAngle');
  });

  test('normAngle is used in helicopter aim code', () => {
    // Ensure the helicopter aim block actually calls normAngle
    expect(gameSrc).toContain('normAngle(heliTargetAngle - playerVehicle.angle)');
    expect(gameSrc).toContain('playerVehicle.angle = normAngle(playerVehicle.angle)');
  });

  test('Game.normAngle is defined in utils.js', () => {
    expect(typeof Game.normAngle).toBe('function');
  });

  test('normAngle normalises angles correctly', () => {
    const na = Game.normAngle;
    expect(na(0)).toBeCloseTo(0);
    expect(na(Math.PI)).toBeCloseTo(Math.PI);
    expect(na(-Math.PI)).toBeCloseTo(-Math.PI);
    // Wrap-around
    expect(na(3 * Math.PI)).toBeCloseTo(Math.PI, 4);
    expect(na(-3 * Math.PI)).toBeCloseTo(-Math.PI, 4);
  });
});
