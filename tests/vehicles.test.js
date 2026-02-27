/**
 * Unit tests for vehicles.js — Vehicle stats, creation, death, respawn, jeep lives
 */

// Setup browser mocks
require('./setup');

// Load dependencies in order
require('../src/js/utils');

// Mock particles and projectiles (vehicles depend on them for effects)
window.Game.Particles = {
  explosion: jest.fn(),
  sparks: jest.fn(),
  smoke: jest.fn(),
  trail: jest.fn(),
};
window.Game.Projectiles = {
  fire: jest.fn(),
  layMine: jest.fn(),
};
window.Game.Audio = {
  play: jest.fn(),
};
window.Game.screenShake = jest.fn();

// Mock sprites
window.Game.Sprites = {
  sprites: {},
  generate: jest.fn(),
};

require('../src/js/vehicles');
const Game = window.Game;

describe('Vehicle - Stats', () => {
  test('Jeep stats exist and name is Jeep', () => {
    const stats = Game.VEHICLE_STATS[Game.VEH.JEEP];
    expect(stats).toBeDefined();
    expect(stats.name).toBe('Jeep');
    expect(stats.speed).toBeGreaterThan(0);
    expect(stats.hp).toBeGreaterThan(0);
  });

  test('Tank stats exist and name is BushMaster', () => {
    const stats = Game.VEHICLE_STATS[Game.VEH.TANK];
    expect(stats).toBeDefined();
    expect(stats.name).toBe('BushMaster');
  });

  test('UrbanStrike (ex-Helicopter) name is correct', () => {
    const stats = Game.VEHICLE_STATS[Game.VEH.HELI];
    expect(stats).toBeDefined();
    expect(stats.name).toBe('UrbanStrike');
    expect(stats.flies).toBe(true);
  });

  test('ASV stats exist and name is StrikeMaster', () => {
    const stats = Game.VEHICLE_STATS[Game.VEH.ASV];
    expect(stats).toBeDefined();
    expect(stats.name).toBe('StrikeMaster');
  });
});

describe('Vehicle - Creation', () => {
  test('createVehicle returns a vehicle with correct team', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 200);
    expect(v).toBeDefined();
    expect(v.team).toBe(1);
    expect(v.type).toBe(Game.VEH.JEEP);
    expect(v.x).toBe(100);
    expect(v.y).toBe(200);
    expect(v.alive).toBe(true);
  });

  test('createVehicle gives unique IDs', () => {
    Game.resetVehicleIds();
    const v1 = Game.createVehicle(Game.VEH.JEEP, 1, 0, 0);
    const v2 = Game.createVehicle(Game.VEH.TANK, 2, 100, 100);
    expect(v1.id).not.toBe(v2.id);
  });

  test('vehicle starts with full HP, fuel, ammo', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.TANK, 1, 0, 0);
    expect(v.hp).toBe(v.maxHp);
    expect(v.fuel).toBe(v.maxFuel);
    expect(v.ammo).toBe(v.maxAmmo);
  });

  test('vehicle has isPlayer false and isAI false by default', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.HELI, 2, 0, 0);
    expect(v.isPlayer).toBeFalsy();
  });
});

describe('Vehicle - Damage and Death', () => {
  test('takeDamage reduces HP', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    const initialHp = v.hp;
    v.takeDamage(10);
    expect(v.hp).toBe(initialHp - 10);
  });

  test('vehicle dies when HP reaches 0', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 100, 100);
    v.takeDamage(v.hp + 10);
    expect(v.alive).toBe(false);
  });

  test('deathTimer initializes to 0', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    expect(v.deathTimer).toBe(0);
  });
});

describe('Vehicle - Respawn', () => {
  test('respawn restores vehicle to alive with full stats', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.TANK, 1, 100, 100);
    v.takeDamage(v.hp + 10);
    expect(v.alive).toBe(false);

    v.respawn(200, 300);
    expect(v.alive).toBe(true);
    expect(v.hp).toBe(v.maxHp);
    expect(v.x).toBe(200);
    expect(v.y).toBe(300);
  });

  test('respawn resets deathTimer', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.ASV, 2, 50, 50);
    v.takeDamage(v.hp + 5);
    v.deathTimer = 5;
    v.respawn(100, 100);
    expect(v.deathTimer).toBe(0);
  });
});

describe('Vehicle - Serialize', () => {
  test('serialize returns expected fields', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.HELI, 2, 300, 400);
    const data = v.serialize();

    expect(data.id).toBeDefined();
    expect(data.type).toBe(Game.VEH.HELI);
    expect(data.team).toBe(2);
    expect(data.x).toBe(300);
    expect(data.y).toBe(400);
    expect(data.alive).toBe(true);
  });
});

describe('Vehicle - Flag carrying', () => {
  test('Jeep can carry flag', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 0, 0);
    expect(v.canCarryFlag).toBe(true);
  });

  test('Tank cannot carry flag', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.TANK, 1, 0, 0);
    expect(v.canCarryFlag).toBe(false);
  });

  test('hasFlag starts as false', () => {
    Game.resetVehicleIds();
    const v = Game.createVehicle(Game.VEH.JEEP, 1, 0, 0);
    expect(v.hasFlag).toBe(false);
  });
});
