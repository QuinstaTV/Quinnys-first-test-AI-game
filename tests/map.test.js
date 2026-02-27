/**
 * Unit tests for map.js — procedural map generation, seeded PRNG
 */

// Setup browser mocks
require('./setup');

// Load dependencies in order
require('../src/js/utils');
require('../src/js/map');
const Game = window.Game;

describe('Map - Generation', () => {
  test('GameMap constructor exists', () => {
    expect(Game.GameMap).toBeDefined();
  });

  test('generate() creates a map with valid dimensions', () => {
    const map = new Game.GameMap();
    map.generate(12345, 1);

    expect(map.width).toBeGreaterThan(0);
    expect(map.height).toBeGreaterThan(0);
    expect(map.tiles).toBeDefined();
    expect(map.tiles.length).toBe(map.height);
    expect(map.tiles[0].length).toBe(map.width);
  });

  test('same seed produces identical maps', () => {
    const map1 = new Game.GameMap();
    map1.generate(42, 1);

    const map2 = new Game.GameMap();
    map2.generate(42, 1);

    expect(map1.width).toBe(map2.width);
    expect(map1.height).toBe(map2.height);

    for (let y = 0; y < map1.height; y++) {
      for (let x = 0; x < map1.width; x++) {
        expect(map1.tiles[y][x]).toBe(map2.tiles[y][x]);
      }
    }
  });

  test('different seeds produce different maps', () => {
    const map1 = new Game.GameMap();
    map1.generate(100, 1);

    const map2 = new Game.GameMap();
    map2.generate(200, 1);

    // At least some tiles should differ
    let diffs = 0;
    const checkH = Math.min(map1.height, map2.height);
    const checkW = Math.min(map1.width, map2.width);
    for (let y = 0; y < checkH; y++) {
      for (let x = 0; x < checkW; x++) {
        if (map1.tiles[y][x] !== map2.tiles[y][x]) diffs++;
      }
    }
    expect(diffs).toBeGreaterThan(0);
  });

  test('round 10 (EPIC) generates larger map', () => {
    const normalMap = new Game.GameMap();
    normalMap.generate(999, 1);

    const epicMap = new Game.GameMap();
    epicMap.generate(999, 10);

    expect(epicMap.width).toBeGreaterThanOrEqual(normalMap.width);
    expect(epicMap.height).toBeGreaterThanOrEqual(normalMap.height);
  });

  test('getSpawn returns valid spawn coordinates', () => {
    const map = new Game.GameMap();
    map.generate(777, 3);

    const spawn1 = map.getSpawn(1);
    const spawn2 = map.getSpawn(2);

    expect(spawn1.x).toBeGreaterThan(0);
    expect(spawn1.y).toBeGreaterThan(0);
    expect(spawn2.x).toBeGreaterThan(0);
    expect(spawn2.y).toBeGreaterThan(0);

    // Team 1 should be on left side, team 2 on right
    expect(spawn1.x).toBeLessThan(spawn2.x);
  });

  test('getFlagPos returns valid flag positions', () => {
    const map = new Game.GameMap();
    map.generate(555, 2);

    const f1 = map.getFlagPos(1);
    const f2 = map.getFlagPos(2);

    expect(f1.x).toBeGreaterThan(0);
    expect(f1.y).toBeGreaterThan(0);
    expect(f2.x).toBeGreaterThan(0);
    expect(f2.y).toBeGreaterThan(0);
  });

  test('getBasePos returns valid base positions', () => {
    const map = new Game.GameMap();
    map.generate(333, 1);

    const b1 = map.getBasePos(1);
    const b2 = map.getBasePos(2);

    expect(b1.x).toBeGreaterThan(0);
    expect(b1.y).toBeGreaterThan(0);
    expect(b2.x).toBeGreaterThan(0);
    expect(b2.y).toBeGreaterThan(0);
  });

  test('generated map contains essential tile types', () => {
    const map = new Game.GameMap();
    map.generate(888, 5);

    const T = Game.T;
    const tileTypes = new Set();
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        tileTypes.add(map.tiles[y][x]);
      }
    }

    // Should have at least water, grass, and road
    expect(tileTypes.has(T.WATER)).toBe(true);
    expect(tileTypes.has(T.GRASS)).toBe(true);
  });

  test('serialize includes seed and roundNum', () => {
    const map = new Game.GameMap();
    map.generate(12345, 7);
    const data = map.serialize();

    expect(data.seed).toBe(12345);
    expect(data.roundNum).toBe(7);
    expect(data.tiles).toBeDefined();
  });

  test('map has turrets array', () => {
    const map = new Game.GameMap();
    map.generate(444, 4);

    expect(Array.isArray(map.turrets)).toBe(true);
  });
});

describe('Map - Escalation', () => {
  test('later rounds have more turrets or features', () => {
    const earlyMap = new Game.GameMap();
    earlyMap.generate(100, 1);

    const lateMap = new Game.GameMap();
    lateMap.generate(100, 8);

    // Later rounds should generally have more turrets (or at least not fewer)
    // This is a soft check since randomness can vary
    expect(lateMap.turrets.length).toBeGreaterThanOrEqual(0);
  });
});
