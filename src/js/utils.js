/* ============================================================
   utils.js - Shared constants, math helpers, collision utilities
   ============================================================ */
(function () {
  'use strict';

  const TILE = 32;

  // Tile type constants
  const T = {
    WATER: 0,
    SAND: 1,
    GRASS: 2,
    ROAD: 3,
    WALL: 4,
    BRIDGE: 5,
    TREES: 6,
    BASE1: 7,
    BASE2: 8,
    DEPOT_AMMO: 9,
    DEPOT_FUEL: 10,
    TURRET: 11,
    RUBBLE: 12
  };

  // Vehicle type constants
  const VEH = { JEEP: 0, TANK: 1, HELI: 2, ASV: 3 };

  // Game state constants
  const STATE = {
    MENU: 0,
    VEHICLE_SELECT: 1,
    PLAYING: 2,
    GAME_OVER: 3,
    LOBBY: 4,
    ROUND_STATS: 5,
    FINAL_STATS: 6,
    SETTINGS: 7
  };

  // Team colours
  const TEAM_COLORS = {
    1: { primary: '#3388ff', dark: '#2266cc', light: '#66aaff' },
    2: { primary: '#ff4444', dark: '#cc2222', light: '#ff7777' }
  };

  /* ---------- Math helpers ---------- */
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function dist(x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
  function angleTo(x1, y1, x2, y2) { return Math.atan2(y2 - y1, x2 - x1); }
  function normAngle(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return a;
  }
  function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }
  function randFloat(lo, hi) { return lo + Math.random() * (hi - lo); }
  function choose(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  /* ---------- Collision helpers ---------- */
  function rectOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }
  function circleOverlap(x1, y1, r1, x2, y2, r2) {
    const d = dist(x1, y1, x2, y2);
    return d < r1 + r2;
  }
  function pointInRect(px, py, rx, ry, rw, rh) {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  /* ---------- Tile helpers ---------- */
  function tileAt(x, y) { return { tx: Math.floor(x / TILE), ty: Math.floor(y / TILE) }; }
  function tileCentre(tx, ty) { return { x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 }; }

  function isSolid(type) {
    return type === T.WATER || type === T.WALL || type === T.TREES;
  }
  function isPassableGround(type) {
    return type === T.SAND || type === T.GRASS || type === T.ROAD ||
           type === T.BRIDGE || type === T.BASE1 || type === T.BASE2 ||
           type === T.DEPOT_AMMO || type === T.DEPOT_FUEL || type === T.RUBBLE;
  }

  /* ---------- A* Pathfinding ---------- */
  function astar(map, sx, sy, gx, gy, canFly) {
    const w = map.width, h = map.height;
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return [];
    if (gx < 0 || gy < 0 || gx >= w || gy >= h) return [];

    const key = (x, y) => y * w + x;
    const open = [];
    const gScore = {};
    const fScore = {};
    const cameFrom = {};
    const closed = new Set();

    const sk = key(sx, sy);
    gScore[sk] = 0;
    fScore[sk] = heuristic(sx, sy, gx, gy);
    open.push({ x: sx, y: sy, f: fScore[sk] });

    function heuristic(ax, ay, bx, by) {
      return Math.abs(bx - ax) + Math.abs(by - ay);
    }

    const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
    let iterations = 0;
    const maxIter = 2000;

    while (open.length > 0 && iterations++ < maxIter) {
      // Find lowest f
      let best = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[best].f) best = i;
      }
      const cur = open.splice(best, 1)[0];
      const ck = key(cur.x, cur.y);

      if (cur.x === gx && cur.y === gy) {
        // Reconstruct path
        const path = [];
        let k = ck;
        while (k !== undefined) {
          const py = Math.floor(k / w), px = k % w;
          path.unshift({ x: px, y: py });
          k = cameFrom[k];
        }
        return path;
      }

      closed.add(ck);

      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const nk = key(nx, ny);
        if (closed.has(nk)) continue;

        const tile = map.tiles[ny][nx];
        if (!canFly && isSolid(tile)) continue;
        // Heli can fly over everything (water, trees, walls)

        const moveCost = (dx !== 0 && dy !== 0) ? 1.414 : 1;
        const tentG = gScore[ck] + moveCost;

        if (gScore[nk] === undefined || tentG < gScore[nk]) {
          cameFrom[nk] = ck;
          gScore[nk] = tentG;
          fScore[nk] = tentG + heuristic(nx, ny, gx, gy);
          open.push({ x: nx, y: ny, f: fScore[nk] });
        }
      }
    }
    return []; // no path
  }

  /* ---------- Export ---------- */
  window.Game = window.Game || {};
  Object.assign(window.Game, {
    TILE, T, VEH, STATE, TEAM_COLORS,
    clamp, lerp, dist, angleTo, normAngle,
    randInt, randFloat, choose,
    rectOverlap, circleOverlap, pointInRect,
    tileAt, tileCentre, isSolid, isPassableGround,
    astar
  });
})();
