/* ============================================================
   map.js - Seed-based procedural island map generator & tilemap
   Creates unique CTF maps per round with escalation (R1-9 normal,
   R10 "Epic" with multiple flag towers). Perlin-like noise for
   natural terrain; path-connected bases guaranteed.
   ============================================================ */
(function () {
  'use strict';

  const { TILE, T, randInt, randFloat, isSolid, isPassableGround } = Game;

  /* ---- Seeded PRNG (Mulberry32) ---- */
  function mulberry32(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- Simple value noise (seeded) ---- */
  function makeNoise(rng, gridW, gridH) {
    const grid = [];
    for (let y = 0; y < gridH; y++) {
      grid[y] = [];
      for (let x = 0; x < gridW; x++) grid[y][x] = rng();
    }
    return function (x, y) {
      const gx = (x / gridW) * (gridW - 1);
      const gy = (y / gridH) * (gridH - 1);
      const ix = Math.floor(gx), iy = Math.floor(gy);
      const fx = gx - ix, fy = gy - iy;
      const ix1 = Math.min(ix + 1, gridW - 1);
      const iy1 = Math.min(iy + 1, gridH - 1);
      const a = grid[iy][ix], b = grid[iy][ix1];
      const c = grid[iy1][ix], d = grid[iy1][ix1];
      const top = a + (b - a) * fx;
      const bot = c + (d - c) * fx;
      return top + (bot - top) * fy;
    };
  }

  const DEFAULT_W = 80;
  const DEFAULT_H = 50;
  const EPIC_W = 100;
  const EPIC_H = 62;

  class GameMap {
    constructor() {
      this.width = DEFAULT_W;
      this.height = DEFAULT_H;
      this.tiles = [];
      this.team1Base = { x: 0, y: 0 };
      this.team2Base = { x: 0, y: 0 };
      this.team1Flag = { x: 0, y: 0 };
      this.team2Flag = { x: 0, y: 0 };
      this.depots = [];
      this.turrets = [];
      this.seed = Date.now();
      this.roundNum = 1;
      this.worldW = this.width * TILE;
      this.worldH = this.height * TILE;
    }

    /**
     * Generate map from seed + round number.
     * Multi-island layout with wooden bridges connecting them.
     * @param {number} [seed]     - deterministic seed (for MP sync)
     * @param {number} [roundNum] - 1-10; round 10 is "Epic"
     */
    generate(seed, roundNum) {
      this.seed = seed !== undefined ? seed : Date.now();
      this.roundNum = roundNum || 1;
      const isEpic = this.roundNum >= 10;
      this.width  = isEpic ? EPIC_W : DEFAULT_W;
      this.height = isEpic ? EPIC_H : DEFAULT_H;
      this.worldW = this.width * TILE;
      this.worldH = this.height * TILE;

      const rng = mulberry32(this.seed);
      const W = this.width, H = this.height;

      // Noise layers for terrain variance
      const noise1 = makeNoise(rng, 12, 10);
      const noise2 = makeNoise(rng, 20, 16);

      // Water fill
      this.tiles = [];
      for (let y = 0; y < H; y++) {
        this.tiles[y] = [];
        for (let x = 0; x < W; x++) this.tiles[y][x] = T.WATER;
      }

      // ---- Multi-island generation ----
      // Generate 2-4 islands with varied shapes
      const numIslands = 2 + Math.floor(rng() * (isEpic ? 3 : 2)); // 2-3 normal, 2-4 epic
      const islands = [];

      // Distribute island centers across the map
      // Left island for team 1, right for team 2, extras in between
      const islandConfigs = [];
      if (numIslands === 2) {
        islandConfigs.push({ cx: W * 0.26, cy: H * 0.5, rx: W * 0.22, ry: H * 0.38 });
        islandConfigs.push({ cx: W * 0.74, cy: H * 0.5, rx: W * 0.22, ry: H * 0.38 });
      } else if (numIslands === 3) {
        islandConfigs.push({ cx: W * 0.20, cy: H * 0.5, rx: W * 0.17, ry: H * 0.36 });
        islandConfigs.push({ cx: W * 0.50, cy: H * 0.5, rx: W * 0.16, ry: H * 0.32 });
        islandConfigs.push({ cx: W * 0.80, cy: H * 0.5, rx: W * 0.17, ry: H * 0.36 });
      } else {
        islandConfigs.push({ cx: W * 0.18, cy: H * 0.5, rx: W * 0.15, ry: H * 0.34 });
        islandConfigs.push({ cx: W * 0.40, cy: H * 0.35, rx: W * 0.13, ry: H * 0.26 });
        islandConfigs.push({ cx: W * 0.60, cy: H * 0.65, rx: W * 0.13, ry: H * 0.26 });
        islandConfigs.push({ cx: W * 0.82, cy: H * 0.5, rx: W * 0.15, ry: H * 0.34 });
      }

      // Add random offset to each island center
      for (let i = 0; i < islandConfigs.length; i++) {
        islandConfigs[i].cx += (rng() - 0.5) * 4;
        islandConfigs[i].cy += (rng() - 0.5) * 4;
      }

      // Generate each island
      for (let idx = 0; idx < numIslands; idx++) {
        const cfg = islandConfigs[idx];
        const icx = cfg.cx, icy = cfg.cy;
        const irx = cfg.rx, iry = cfg.ry;

        // Shape variation: elongation and rotation
        const shapeVar = rng() * 0.3;
        const islandNoise = makeNoise(rng, 8, 6);

        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const dx = (x - icx) / irx;
            const dy = (y - icy) / iry;
            const d = dx * dx + dy * dy;
            const n = islandNoise(x / W, y / H) * 0.2 + noise1(x / W, y / H) * 0.1;
            if (d + n + shapeVar < 0.85) {
              if (this.tiles[y][x] === T.WATER) {
                this.tiles[y][x] = T.GRASS;
              }
            } else if (d + n + shapeVar < 1.05) {
              if (this.tiles[y][x] === T.WATER) {
                this.tiles[y][x] = T.SAND;
              }
            }
          }
        }

        islands.push({ cx: Math.floor(icx), cy: Math.floor(icy), rx: irx, ry: iry });
      }

      // ---- Connect islands with wooden bridges ----
      // Connect each pair of adjacent islands
      for (let i = 0; i < islands.length - 1; i++) {
        const a = islands[i];
        const b = islands[i + 1];
        this.buildBridge(a.cx, a.cy, b.cx, b.cy, rng);
      }
      // For 4 islands, also connect diagonal pairs
      if (islands.length >= 4) {
        this.buildBridge(islands[0].cx, islands[0].cy, islands[2].cx, islands[2].cy, rng);
        this.buildBridge(islands[1].cx, islands[1].cy, islands[3].cx, islands[3].cy, rng);
      }

      // ---- Strategic water channels on larger islands ----
      for (let idx = 0; idx < numIslands; idx++) {
        var isl = islands[idx];
        if (rng() < 0.5) {
          const chOffX = Math.floor((rng() - 0.5) * 4);
          const chLen = 3 + Math.floor(rng() * 4);
          this.carveChannel(isl.cx + chOffX, isl.cy - chLen, isl.cx + chOffX, isl.cy + chLen, 1);
        }
      }

      // Ponds
      const numPonds = 2 + Math.floor(rng() * 2);
      for (let p = 0; p < numPonds; p++) {
        const islandIdx = Math.floor(rng() * numIslands);
        const isl = islands[islandIdx];
        const px = isl.cx + (rng() - 0.5) * isl.rx * 0.8;
        const py = isl.cy + (rng() - 0.5) * isl.ry * 0.8;
        this.carvePond(px, py, 2 + Math.floor(rng() * 2));
      }

      // ---- Bases (on first and last islands) ----
      const leftIsland = islands[0];
      const rightIsland = islands[islands.length - 1];
      const base1X = Math.floor(leftIsland.cx) + Math.floor((rng() - 0.5) * 3);
      const base1Y = Math.floor(leftIsland.cy) + Math.floor((rng() - 0.5) * 3);
      const base2X = Math.floor(rightIsland.cx) + Math.floor((rng() - 0.5) * 3);
      const base2Y = Math.floor(rightIsland.cy) + Math.floor((rng() - 0.5) * 3);

      // ---- Roads (within each island and across bridges) ----
      // Main horizontal road across the map
      this.carveRoad(base1X, base1Y, base2X, base2Y);
      // Roads within each island
      for (let idx = 0; idx < numIslands; idx++) {
        var isl2 = islands[idx];
        const roadOffY = Math.floor(3 + rng() * 4);
        this.carveRoad(
          Math.floor(isl2.cx - isl2.rx * 0.5), Math.floor(isl2.cy - roadOffY),
          Math.floor(isl2.cx + isl2.rx * 0.5), Math.floor(isl2.cy - roadOffY)
        );
        this.carveRoad(
          Math.floor(isl2.cx - isl2.rx * 0.5), Math.floor(isl2.cy + roadOffY),
          Math.floor(isl2.cx + isl2.rx * 0.5), Math.floor(isl2.cy + roadOffY)
        );
        // Vertical connector
        this.carveRoad(
          Math.floor(isl2.cx), Math.floor(isl2.cy - roadOffY),
          Math.floor(isl2.cx), Math.floor(isl2.cy + roadOffY)
        );
      }

      // ---- Base areas ----
      this.clearArea(base1X - 1, base1Y - 2, 5, 5);
      this.clearArea(base2X - 2, base2Y - 2, 5, 5);
      this.placeBase(base1X, base1Y, 1);
      this.placeBase(base2X, base2Y, 2);
      this.team1Flag = { x: base1X + 2, y: base1Y };
      this.team2Flag = { x: base2X - 2, y: base2Y };

      // Epic: extra flag towers
      if (isEpic) {
        this.placeWallCluster(base1X + 3, base1Y - 3, 2, 2);
        this.placeWallCluster(base1X + 3, base1Y + 2, 2, 2);
        this.placeWallCluster(base2X - 4, base2Y - 3, 2, 2);
        this.placeWallCluster(base2X - 4, base2Y + 2, 2, 2);
      }

      // ---- Walls ----
      const wallClusters = 3 + Math.floor(rng() * 3) + (isEpic ? 3 : 0);
      for (let w = 0; w < wallClusters; w++) {
        const islandIdx = Math.floor(rng() * numIslands);
        const isl3 = islands[islandIdx];
        const wx = Math.floor(isl3.cx + (rng() - 0.5) * isl3.rx * 1.2);
        const wy = Math.floor(isl3.cy + (rng() - 0.5) * isl3.ry * 1.2);
        const ww = 2 + Math.floor(rng() * 3);
        const wh = 2 + Math.floor(rng() * 4);
        this.placeWallCluster(wx, wy, ww, wh);
      }

      // ---- Trees ----
      const treeClusters = 4 + Math.floor(rng() * 4) + (isEpic ? 3 : 0);
      for (let t = 0; t < treeClusters; t++) {
        const islandIdx = Math.floor(rng() * numIslands);
        const isl4 = islands[islandIdx];
        const tx = Math.floor(isl4.cx + (rng() - 0.5) * isl4.rx * 1.0);
        const ty = Math.floor(isl4.cy + (rng() - 0.5) * isl4.ry * 1.0);
        this.placeTreeCluster(tx, ty, 2 + Math.floor(rng() * 3), 2 + Math.floor(rng() * 2));
      }

      // ---- Depots ----
      this.depots = [];
      const depotCount = 6 + Math.floor(rng() * 3) + (isEpic ? 2 : 0);
      for (let d = 0; d < depotCount; d++) {
        const islandIdx = Math.floor(rng() * numIslands);
        const isl5 = islands[islandIdx];
        const dx = Math.floor(isl5.cx + (rng() - 0.5) * isl5.rx * 0.8);
        const dy = Math.floor(isl5.cy + (rng() - 0.5) * isl5.ry * 0.8);
        const dtype = rng() < 0.5 ? T.DEPOT_AMMO : T.DEPOT_FUEL;
        this.placeDepot(dx, dy, dtype);
      }

      // ---- Turrets ----
      this.turrets = [];
      const turretsPerSide = 2 + (isEpic ? 2 : Math.min(Math.floor(this.roundNum / 3), 2));
      for (let t = 0; t < turretsPerSide; t++) {
        const ty1 = base1Y + Math.floor((rng() - 0.5) * 8);
        this.placeTurret(base1X + 3 + Math.floor(rng() * 4), ty1, 1);
        const ty2 = base2Y + Math.floor((rng() - 0.5) * 8);
        this.placeTurret(base2X - 3 - Math.floor(rng() * 4), ty2, 2);
      }

      // Final cleanup of base areas
      this.clearArea(base1X - 1, base1Y - 2, 5, 5);
      this.clearArea(base2X - 2, base2Y - 2, 5, 5);
      this.placeBase(base1X, base1Y, 1);
      this.placeBase(base2X, base2Y, 2);

      return this;
    }

    /**
     * Build a wooden bridge between two points, clearing a 3-wide path
     * across water. Adds BRIDGE tiles over water and ROAD on land.
     */
    buildBridge(x1, y1, x2, y2, rng) {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      if (steps === 0) return;

      // Slight curve via midpoint offset
      const midX = (x1 + x2) / 2 + (rng() - 0.5) * 4;
      const midY = (y1 + y2) / 2 + (rng() - 0.5) * 4;

      const allSteps = steps * 2;
      for (let i = 0; i <= allSteps; i++) {
        const t = i / allSteps;
        // Quadratic bezier through midpoint
        const px = (1-t)*(1-t)*x1 + 2*(1-t)*t*midX + t*t*x2;
        const py = (1-t)*(1-t)*y1 + 2*(1-t)*t*midY + t*t*y2;
        const ix = Math.round(px);
        const iy = Math.round(py);

        // 3-wide bridge path
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const tx = ix + dx, ty = iy + dy;
            if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
              if (this.tiles[ty][tx] === T.WATER) {
                this.tiles[ty][tx] = T.BRIDGE;
              } else if (this.tiles[ty][tx] === T.SAND) {
                this.tiles[ty][tx] = T.ROAD;
              }
            }
          }
        }
      }
    }

    clearArea(x, y, w, h) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const tx = x + dx, ty = y + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            if (this.tiles[ty][tx] !== T.WATER) {
              this.tiles[ty][tx] = T.GRASS;
            }
          }
        }
      }
    }

    carveChannel(x1, y1, x2, y2, width) {
      const steps = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const x = Math.round(x1 + (x2 - x1) * t);
        const y = Math.round(y1 + (y2 - y1) * t);
        for (let dy = -width; dy <= width; dy++) {
          for (let dx = -width; dx <= width; dx++) {
            const tx = x + dx, ty = y + dy;
            if (tx > 3 && tx < this.width - 3 && ty > 3 && ty < this.height - 3) {
              this.tiles[ty][tx] = T.WATER;
            }
          }
        }
      }
    }

    carvePond(cx, cy, r) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx + dy*dy <= r*r) {
            const tx = Math.floor(cx) + dx, ty = Math.floor(cy) + dy;
            if (tx > 2 && tx < this.width - 2 && ty > 2 && ty < this.height - 2) {
              this.tiles[ty][tx] = T.WATER;
            }
          }
        }
      }
    }

    carveRoad(x1, y1, x2, y2) {
      const dx = x2 - x1, dy = y2 - y1;
      const steps = Math.max(Math.abs(dx), Math.abs(dy));
      for (let i = 0; i <= steps; i++) {
        const t = steps === 0 ? 0 : i / steps;
        const x = Math.round(x1 + dx * t);
        const y = Math.round(y1 + dy * t);
        if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
          if (this.tiles[y][x] !== T.WATER) {
            this.tiles[y][x] = T.ROAD;
          }
        }
      }
    }

    placeBridges(cx, cy) {
      // Place bridge tiles over water at/near position
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = cx + dx, ty = cy + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            if (this.tiles[ty][tx] === T.WATER) {
              this.tiles[ty][tx] = T.BRIDGE;
            }
          }
        }
      }
    }

    placeBase(bx, by, team) {
      const baseType = team === 1 ? T.BASE1 : T.BASE2;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const tx = bx + dx, ty = by + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            this.tiles[ty][tx] = baseType;
          }
        }
      }
      if (team === 1) {
        this.team1Base = { x: bx, y: by };
      } else {
        this.team2Base = { x: bx, y: by };
      }
    }

    placeWallCluster(x, y, w, h) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const tx = x + dx, ty = y + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            if (this.tiles[ty][tx] === T.GRASS || this.tiles[ty][tx] === T.SAND) {
              this.tiles[ty][tx] = T.WALL;
            }
          }
        }
      }
    }

    placeTreeCluster(x, y, w, h) {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const tx = x + dx, ty = y + dy;
          if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
            if (this.tiles[ty][tx] === T.GRASS) {
              this.tiles[ty][tx] = T.TREES;
            }
          }
        }
      }
    }

    placeDepot(x, y, type) {
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        this.tiles[y][x] = type;
        this.depots.push({ x, y, type });
      }
    }

    placeTurret(x, y, team) {
      if (x >= 0 && x < this.width && y >= 0 && y < this.height) {
        this.tiles[y][x] = T.TURRET;
        this.turrets.push({ x, y, angle: 0, cooldown: 0, hp: 60, alive: true, team: team || 0 });
      }
    }

    getTile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.width || ty >= this.height) return T.WATER;
      return this.tiles[ty][tx];
    }

    setTile(tx, ty, type) {
      if (tx >= 0 && ty >= 0 && tx < this.width && ty < this.height) {
        this.tiles[ty][tx] = type;
      }
    }

    destroyTile(tx, ty) {
      const tile = this.getTile(tx, ty);
      if (tile === T.WALL || tile === T.BRIDGE) {
        this.tiles[ty][tx] = tile === T.BRIDGE ? T.WATER : T.RUBBLE;
        return true;
      }
      if (tile === T.TREES) {
        this.tiles[ty][tx] = T.GRASS;
        return true;
      }
      return false;
    }

    isWalkable(wx, wy) {
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      const tile = this.getTile(tx, ty);
      return isPassableGround(tile);
    }

    isFlyable(wx, wy) {
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      return tx >= 0 && ty >= 0 && tx < this.width && ty < this.height;
    }

    // Get base spawn position (world coordinates)
    // Ensures spawn is on walkable ground, scanning outward if needed
    getSpawn(team) {
      const base = team === 1 ? this.team1Base : this.team2Base;
      const offset = team === 1 ? -2 : 2;
      let sx = base.x + offset;
      let sy = base.y;

      // If target tile isn't walkable, scan outward in a spiral to find one
      if (!isPassableGround(this.getTile(sx, sy))) {
        let found = false;
        for (let r = 1; r <= 5 && !found; r++) {
          for (let dy = -r; dy <= r && !found; dy++) {
            for (let dx = -r; dx <= r && !found; dx++) {
              if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only ring
              const tx = base.x + dx;
              const ty = base.y + dy;
              if (tx >= 0 && tx < this.width && ty >= 0 && ty < this.height) {
                if (isPassableGround(this.getTile(tx, ty))) {
                  sx = tx;
                  sy = ty;
                  found = true;
                }
              }
            }
          }
        }
        // Fallback: spawn directly on base tile
        if (!found) { sx = base.x; sy = base.y; }
      }

      return {
        x: sx * TILE + TILE / 2,
        y: sy * TILE + TILE / 2
      };
    }

    // Get flag position (world coordinates)
    getFlagPos(team) {
      const flag = team === 1 ? this.team1Flag : this.team2Flag;
      return { x: flag.x * TILE + TILE / 2, y: flag.y * TILE + TILE / 2 };
    }

    getBasePos(team) {
      const base = team === 1 ? this.team1Base : this.team2Base;
      return { x: base.x * TILE + TILE / 2, y: base.y * TILE + TILE / 2 };
    }

    // Render visible tiles
    render(ctx, camX, camY, viewW, viewH) {
      const startTX = Math.max(0, Math.floor(camX / TILE));
      const startTY = Math.max(0, Math.floor(camY / TILE));
      const endTX = Math.min(this.width, Math.ceil((camX + viewW) / TILE) + 1);
      const endTY = Math.min(this.height, Math.ceil((camY + viewH) / TILE) + 1);

      const tileSprites = {
        [T.WATER]: Game.Sprites.sprites.water,
        [T.SAND]: Game.Sprites.sprites.sand,
        [T.GRASS]: Game.Sprites.sprites.grass,
        [T.ROAD]: Game.Sprites.sprites.road,
        [T.WALL]: Game.Sprites.sprites.wall,
        [T.BRIDGE]: Game.Sprites.sprites.bridge,
        [T.TREES]: Game.Sprites.sprites.trees,
        [T.BASE1]: Game.Sprites.sprites.base1,
        [T.BASE2]: Game.Sprites.sprites.base2,
        [T.DEPOT_AMMO]: Game.Sprites.sprites.depot_ammo,
        [T.DEPOT_FUEL]: Game.Sprites.sprites.depot_fuel,
        [T.TURRET]: Game.Sprites.sprites.turret,
        [T.RUBBLE]: Game.Sprites.sprites.rubble
      };

      for (let ty = startTY; ty < endTY; ty++) {
        for (let tx = startTX; tx < endTX; tx++) {
          const tile = this.tiles[ty][tx];
          const sprite = tileSprites[tile];
          if (sprite) {
            ctx.drawImage(sprite, tx * TILE - camX, ty * TILE - camY, TILE, TILE);
          }
        }
      }
    }

    // Render minimap
    renderMinimap(ctx, x, y, w, h, entities, flags) {
      const scaleX = w / this.width;
      const scaleY = h / this.height;

      // Background
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - 1, y - 1, w + 2, h + 2);

      // Tiles (simplified)
      for (let ty = 0; ty < this.height; ty++) {
        for (let tx = 0; tx < this.width; tx++) {
          const tile = this.tiles[ty][tx];
          let col;
          switch (tile) {
            case T.WATER: col = '#1a5276'; break;
            case T.SAND: col = '#d4ac6e'; break;
            case T.GRASS: col = '#2d8a4e'; break;
            case T.ROAD: col = '#666'; break;
            case T.WALL: col = '#8B4513'; break;
            case T.BRIDGE: col = '#8B7355'; break;
            case T.TREES: col = '#1a6b30'; break;
            case T.BASE1: col = '#3388ff'; break;
            case T.BASE2: col = '#ff4444'; break;
            case T.DEPOT_AMMO: col = '#e5c100'; break;
            case T.DEPOT_FUEL: col = '#e74c3c'; break;
            case T.RUBBLE: col = '#555'; break;
            default: col = '#333';
          }
          ctx.fillStyle = col;
          ctx.fillRect(x + tx * scaleX, y + ty * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
        }
      }

      // Entity dots
      if (entities) {
        entities.forEach(e => {
          if (!e.alive) return;
          ctx.fillStyle = e.team === 1 ? '#66aaff' : '#ff7777';
          const ex = x + (e.x / TILE) * scaleX;
          const ey = y + (e.y / TILE) * scaleY;
          ctx.fillRect(ex - 2, ey - 2, 4, 4);
        });
      }

      // Flag positions
      if (flags) {
        flags.forEach(f => {
          ctx.fillStyle = f.team === 1 ? '#3388ff' : '#ff4444';
          const fx = x + (f.x / TILE) * scaleX;
          const fy = y + (f.y / TILE) * scaleY;
          ctx.beginPath();
          ctx.arc(fx, fy, 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Border
      ctx.strokeStyle = '#888';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1, y - 1, w + 2, h + 2);
    }

    // Serialize for network
    serialize() {
      return {
        seed: this.seed,
        roundNum: this.roundNum,
        width: this.width,
        height: this.height,
        tiles: this.tiles,
        team1Base: this.team1Base,
        team2Base: this.team2Base,
        team1Flag: this.team1Flag,
        team2Flag: this.team2Flag,
        depots: this.depots,
        turrets: this.turrets.map(t => ({ x: t.x, y: t.y, hp: t.hp, alive: t.alive, team: t.team }))
      };
    }

    // Load from serialized data
    loadFromData(data) {
      this.width = data.width;
      this.height = data.height;
      this.tiles = data.tiles;
      this.team1Base = data.team1Base;
      this.team2Base = data.team2Base;
      this.team1Flag = data.team1Flag;
      this.team2Flag = data.team2Flag;
      this.depots = data.depots;
      this.worldW = data.width * TILE;
      this.worldH = data.height * TILE;
      if (data.turrets) {
        this.turrets = data.turrets.map(t => ({
          x: t.x, y: t.y, angle: 0, cooldown: 0, hp: t.hp, alive: t.alive, team: t.team || 0
        }));
      }
      return this;
    }
  }

  window.Game.GameMap = GameMap;
})();
