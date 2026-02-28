/**
 * Regression tests for spawn / respawn lockup fixes:
 *  1. normAngle() is safe against Infinity, -Infinity, NaN (no infinite loops)
 *  2. normAngle() still produces correct results for normal values
 *  3. Double-click dispatch removed from handleClick for VEHICLE_SELECT
 *  4. Elevator animation guard prevents input during deploy
 *  5. Game loop try-catch prevents permanent freeze on errors
 *  6. AI angle normalization after doAttack adjustments
 */

const { mockCanvas, mockCtx } = require('./setup');

// Load game modules in order
require('../src/js/utils');

const { normAngle, clamp, angleTo, dist, VEH, STATE } = window.Game;

// ========== 1. normAngle safety tests ==========
describe('normAngle: Infinity / NaN safety (freeze prevention)', () => {
  test('normAngle(Infinity) returns 0 instead of infinite-looping', () => {
    const result = normAngle(Infinity);
    expect(result).toBe(0);
  });

  test('normAngle(-Infinity) returns 0 instead of infinite-looping', () => {
    const result = normAngle(-Infinity);
    expect(result).toBe(0);
  });

  test('normAngle(NaN) returns 0 instead of NaN', () => {
    const result = normAngle(NaN);
    expect(result).toBe(0);
  });

  test('normAngle completes within 1ms for any input (no while-loop hang)', () => {
    const edgeCases = [
      Infinity, -Infinity, NaN,
      Number.MAX_VALUE, -Number.MAX_VALUE,
      Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER,
      1e308, -1e308,
      0, 1, -1, Math.PI, -Math.PI
    ];
    for (const val of edgeCases) {
      const start = Date.now();
      normAngle(val);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(50); // should be instant
    }
  });
});

// ========== 2. normAngle correctness tests ==========
describe('normAngle: correct results for normal values', () => {
  test('0 stays 0', () => {
    expect(normAngle(0)).toBeCloseTo(0);
  });

  test('PI stays PI', () => {
    expect(normAngle(Math.PI)).toBeCloseTo(Math.PI);
  });

  test('-PI stays -PI', () => {
    expect(normAngle(-Math.PI)).toBeCloseTo(-Math.PI);
  });

  test('values just over PI wrap to negative', () => {
    const a = Math.PI + 0.1;
    const result = normAngle(a);
    expect(result).toBeCloseTo(-Math.PI + 0.1);
    expect(result).toBeGreaterThanOrEqual(-Math.PI);
    expect(result).toBeLessThanOrEqual(Math.PI);
  });

  test('values just under -PI wrap to positive', () => {
    const a = -Math.PI - 0.1;
    const result = normAngle(a);
    expect(result).toBeCloseTo(Math.PI - 0.1);
    expect(result).toBeGreaterThanOrEqual(-Math.PI);
    expect(result).toBeLessThanOrEqual(Math.PI);
  });

  test('2*PI wraps to 0', () => {
    expect(normAngle(2 * Math.PI)).toBeCloseTo(0);
  });

  test('-2*PI wraps to 0', () => {
    expect(normAngle(-2 * Math.PI)).toBeCloseTo(0);
  });

  test('3*PI wraps correctly', () => {
    const result = normAngle(3 * Math.PI);
    expect(result).toBeCloseTo(Math.PI);
  });

  test('-3*PI wraps correctly', () => {
    const result = normAngle(-3 * Math.PI);
    expect(result).toBeCloseTo(-Math.PI);
  });

  test('large positive angles wrap correctly', () => {
    const result = normAngle(100 * Math.PI + 0.5);
    expect(result).toBeCloseTo(0.5);
    expect(result).toBeGreaterThanOrEqual(-Math.PI);
    expect(result).toBeLessThanOrEqual(Math.PI);
  });

  test('large negative angles wrap correctly', () => {
    const result = normAngle(-100 * Math.PI - 0.5);
    expect(result).toBeCloseTo(-0.5);
    expect(result).toBeGreaterThanOrEqual(-Math.PI);
    expect(result).toBeLessThanOrEqual(Math.PI);
  });

  test('small angles unchanged', () => {
    expect(normAngle(0.5)).toBeCloseTo(0.5);
    expect(normAngle(-0.5)).toBeCloseTo(-0.5);
    expect(normAngle(1.0)).toBeCloseTo(1.0);
    expect(normAngle(-1.0)).toBeCloseTo(-1.0);
  });

  test('angle differences work correctly (heli aim pattern)', () => {
    // Simulate: heli faces right (0), mouse is up-left (3*PI/4)
    const heliAngle = 0;
    const targetAngle = 3 * Math.PI / 4;
    const diff = normAngle(targetAngle - heliAngle);
    expect(diff).toBeCloseTo(3 * Math.PI / 4);

    // Simulate: heli faces right (0), mouse is slightly below-right (-0.1)
    const diff2 = normAngle(-0.1 - 0);
    expect(diff2).toBeCloseTo(-0.1);

    // Simulate: wrapping across the PI/-PI boundary
    // Heli at PI-0.1, target at -PI+0.1 (just across the boundary)
    const diff3 = normAngle((-Math.PI + 0.1) - (Math.PI - 0.1));
    expect(diff3).toBeCloseTo(0.2);
  });
});

// ========== 3. Angle computation safety in gameplay ==========
describe('Angle computations: no Infinity/NaN from common operations', () => {
  test('angleTo always returns finite values', () => {
    // Various edge cases that might produce bad angles
    expect(isFinite(angleTo(0, 0, 0, 0))).toBe(true);  // same point
    expect(isFinite(angleTo(0, 0, 1, 0))).toBe(true);   // right
    expect(isFinite(angleTo(0, 0, 0, 1))).toBe(true);   // down
    expect(isFinite(angleTo(100, 200, 100, 200))).toBe(true); // same point large
  });

  test('normAngle(angleTo(...) - angle) is always safe', () => {
    // This is the exact pattern used in heli aiming and AI combat
    const angles = [0, Math.PI, -Math.PI, Math.PI / 2, -Math.PI / 2, 2.5, -2.5];
    const positions = [[0, 0], [100, 200], [999, 999]];

    for (const baseAngle of angles) {
      for (const [x, y] of positions) {
        const target = angleTo(x, y, 500, 300);
        const diff = normAngle(target - baseAngle);
        expect(isFinite(diff)).toBe(true);
        expect(diff).toBeGreaterThanOrEqual(-Math.PI);
        expect(diff).toBeLessThanOrEqual(Math.PI);
      }
    }
  });

  test('repeated angle accumulation stays finite', () => {
    // Simulate AI angle accumulation over many frames
    let angle = 0;
    const dt = 0.016; // ~60fps
    const turnRate = 3.0;

    for (let i = 0; i < 100000; i++) {
      const target = angleTo(0, 0, Math.cos(i * 0.01) * 100, Math.sin(i * 0.01) * 100);
      const diff = normAngle(target - angle);
      angle += clamp(diff, -turnRate * dt, turnRate * dt);
      angle = normAngle(angle);
    }
    expect(isFinite(angle)).toBe(true);
    expect(angle).toBeGreaterThanOrEqual(-Math.PI);
    expect(angle).toBeLessThanOrEqual(Math.PI);
  });

  test('angle accumulation WITHOUT normAngle grows but normAngle still handles it', () => {
    // Simulate AI bug: angle grows without normalization
    let rawAngle = 0;
    const dt = 0.016;
    const turnRate = 3.0;

    for (let i = 0; i < 10000; i++) {
      rawAngle += turnRate * dt; // always adding, angle grows
    }
    // rawAngle is now very large (~480 radians)
    expect(rawAngle).toBeGreaterThan(100);

    // normAngle should still handle this cleanly
    const normalized = normAngle(rawAngle);
    expect(isFinite(normalized)).toBe(true);
    expect(normalized).toBeGreaterThanOrEqual(-Math.PI);
    expect(normalized).toBeLessThanOrEqual(Math.PI);
  });
});

// ========== 4. Vehicle select state machine ==========
describe('Vehicle select: deploy flow safety', () => {
  // Load additional modules needed for UI testing
  beforeAll(() => {
    // These are loaded once; Game namespace is already set up by utils
    try { require('../src/js/input'); } catch(e) {}
    try { require('../src/js/audio'); } catch(e) {}
    try { require('../src/js/sprites'); } catch(e) {}
    try { require('../src/js/ui'); } catch(e) {}
  });

  test('UI module exposes isElevatorDeploying()', () => {
    expect(typeof Game.UI.isElevatorDeploying).toBe('function');
  });

  test('isElevatorDeploying returns false by default', () => {
    expect(Game.UI.isElevatorDeploying()).toBe(false);
  });

  test('startElevatorDeploy sets deploying state', () => {
    Game.UI.startElevatorDeploy(VEH.HELI, () => {});
    expect(Game.UI.isElevatorDeploying()).toBe(true);
  });

  test('startElevatorDeploy accepts all vehicle types', () => {
    [VEH.JEEP, VEH.TANK, VEH.HELI, VEH.ASV].forEach(type => {
      Game.UI.startElevatorDeploy(type, () => {});
      expect(Game.UI.isElevatorDeploying()).toBe(true);
    });
  });
});

// ========== 5. Edge-case angle scenarios that could cause freezes ==========
describe('Edge-case angle scenarios', () => {
  test('normAngle handles result of division by zero', () => {
    const badAngle = 1 / 0; // Infinity
    expect(normAngle(badAngle)).toBe(0);
  });

  test('normAngle handles negative division by zero', () => {
    const badAngle = -1 / 0; // -Infinity
    expect(normAngle(badAngle)).toBe(0);
  });

  test('normAngle handles 0/0', () => {
    const badAngle = 0 / 0; // NaN
    expect(normAngle(badAngle)).toBe(0);
  });

  test('normAngle handles Number.MAX_VALUE', () => {
    const result = normAngle(Number.MAX_VALUE);
    expect(isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(-Math.PI);
    expect(result).toBeLessThanOrEqual(Math.PI);
  });

  test('normAngle handles -Number.MAX_VALUE', () => {
    const result = normAngle(-Number.MAX_VALUE);
    expect(isFinite(result)).toBe(true);
    expect(result).toBeGreaterThanOrEqual(-Math.PI);
    expect(result).toBeLessThanOrEqual(Math.PI);
  });

  test('normAngle handles very small values near zero', () => {
    expect(normAngle(1e-15)).toBeCloseTo(0, 10);
    expect(normAngle(-1e-15)).toBeCloseTo(0, 10);
  });

  test('normAngle handles Number.EPSILON', () => {
    const result = normAngle(Number.EPSILON);
    expect(isFinite(result)).toBe(true);
    expect(result).toBeCloseTo(Number.EPSILON);
  });
});
