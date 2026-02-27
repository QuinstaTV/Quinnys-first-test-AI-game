/**
 * Unit tests for utils.js — constants, helpers, A* pathfinding
 */

// Setup browser mocks
require('./setup');

// Load utils.js (attaches to window.Game)
require('../src/js/utils');
const Game = window.Game;

describe('Utils - Constants', () => {
  test('TILE is 32', () => {
    expect(Game.TILE).toBe(32);
  });

  test('VEH enum has 4 vehicle types', () => {
    expect(Game.VEH.JEEP).toBe(0);
    expect(Game.VEH.TANK).toBe(1);
    expect(Game.VEH.HELI).toBe(2);
    expect(Game.VEH.ASV).toBe(3);
  });

  test('STATE enum includes ROUND_STATS and FINAL_STATS', () => {
    expect(Game.STATE.MENU).toBe(0);
    expect(Game.STATE.VEHICLE_SELECT).toBe(1);
    expect(Game.STATE.PLAYING).toBe(2);
    expect(Game.STATE.GAME_OVER).toBe(3);
    expect(Game.STATE.LOBBY).toBe(4);
    expect(Game.STATE.ROUND_STATS).toBe(5);
    expect(Game.STATE.FINAL_STATS).toBe(6);
  });

  test('T tile types include basic terrain', () => {
    expect(Game.T.WATER).toBeDefined();
    expect(Game.T.GRASS).toBeDefined();
    expect(Game.T.ROAD).toBeDefined();
    expect(Game.T.WALL).toBeDefined();
    expect(Game.T.TREES).toBeDefined();
  });
});

describe('Utils - Math helpers', () => {
  test('clamp constrains values', () => {
    expect(Game.clamp(5, 0, 10)).toBe(5);
    expect(Game.clamp(-5, 0, 10)).toBe(0);
    expect(Game.clamp(15, 0, 10)).toBe(10);
  });

  test('lerp interpolates correctly', () => {
    expect(Game.lerp(0, 10, 0.5)).toBe(5);
    expect(Game.lerp(0, 10, 0)).toBe(0);
    expect(Game.lerp(0, 10, 1)).toBe(10);
  });

  test('dist calculates Euclidean distance', () => {
    expect(Game.dist(0, 0, 3, 4)).toBe(5);
    expect(Game.dist(0, 0, 0, 0)).toBe(0);
  });

  test('randInt returns integer in range', () => {
    for (let i = 0; i < 50; i++) {
      const v = Game.randInt(0, 10);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(10);
      expect(Number.isInteger(v)).toBe(true);
    }
  });

  test('randFloat returns float in range', () => {
    for (let i = 0; i < 50; i++) {
      const v = Game.randFloat(1, 5);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(5);
    }
  });

  test('angleTo computes correct angles', () => {
    // Right
    expect(Game.angleTo(0, 0, 1, 0)).toBeCloseTo(0);
    // Down
    expect(Game.angleTo(0, 0, 0, 1)).toBeCloseTo(Math.PI / 2);
  });
});

describe('Utils - Tile helpers', () => {
  test('tileCentre returns center of tile', () => {
    const c = Game.tileCentre(2, 3);
    expect(c.x).toBe(2 * 32 + 16);
    expect(c.y).toBe(3 * 32 + 16);
  });

  test('tileAt converts world coords to tile coords', () => {
    const t = Game.tileAt(100, 200);
    expect(t.tx).toBe(Math.floor(100 / 32));
    expect(t.ty).toBe(Math.floor(200 / 32));
  });
});

describe('Utils - Geometry helpers', () => {
  test('rectOverlap detects overlapping rectangles', () => {
    expect(Game.rectOverlap(0, 0, 10, 10, 5, 5, 10, 10)).toBe(true);
    expect(Game.rectOverlap(0, 0, 10, 10, 20, 20, 10, 10)).toBe(false);
  });

  test('circleOverlap detects overlapping circles', () => {
    expect(Game.circleOverlap(0, 0, 5, 3, 0, 5)).toBe(true);
    expect(Game.circleOverlap(0, 0, 5, 100, 0, 5)).toBe(false);
  });

  test('pointInRect detects point inside rectangle', () => {
    expect(Game.pointInRect(5, 5, 0, 0, 10, 10)).toBe(true);
    expect(Game.pointInRect(15, 5, 0, 0, 10, 10)).toBe(false);
  });
});
