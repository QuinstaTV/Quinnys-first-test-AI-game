/* ============================================================
   map.js - Procedural island map generator & tilemap system
   Creates CTF maps with bases, depots, bridges, walls, trees
   ============================================================ */
(function () {
  'use strict';

  const { TILE, T, randInt, randFloat, isSolid, isPassableGround } = Game;

  const MAP_W = 80;
  const MAP_H = 50;

  class GameMap {
    constructor() {
      this.width = MAP_W;
      this.height = MAP_H;
      this.tiles = [];
      this.team1Base = { x: 0, y: 0 };
      this.team2Base = { x: 0, y: 0 };
      this.team1Flag = { x: 0, y: 0 };
      this.team2Flag = { x: 0, y: 0 };
      this.depots = [];
      this.turrets = [];
      this.worldW = MAP_W * TILE;
      this.worldH = MAP_H * TILE;
    }

    generate() {
      const W = this.width, H = this.height;
      // Start with water
      this.tiles = [];
      for (let y = 0; y < H; y++) {
        this.tiles[y] = [];
        for (let x = 0; x < W; x++) {
          this.tiles[y][x] = T.WATER;
        }
      }

      // Create island shape using distance from center
      const cx = W / 2, cy = H / 2;
      const rx = W * 0.44, ry = H * 0.42;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const dx = (x - cx) / rx;
          const dy = (y - cy) / ry;
          const d = dx * dx + dy * dy;
          // Noise-like variation
          const noise = Math.sin(x * 0.5) * 0.08 + Math.cos(y * 0.7) * 0.06 +
                        Math.sin((x + y) * 0.3) * 0.05;
          if (d + noise < 0.85) {
            this.tiles[y][x] = T.GRASS;
          } else if (d + noise < 1.0) {
            this.tiles[y][x] = T.SAND;
          }
        }
      }

      // Create water channels through the middle (strategic obstacles)
      this.carveChannel(cx, cy - 8, cx, cy + 8, 2);
      // Smaller ponds
      this.carvePond(cx - 8, cy - 6, 3);
      this.carvePond(cx + 8, cy + 6, 3);

      // Create roads connecting bases
      const baseY = Math.floor(cy);
      const base1X = 6;
      const base2X = W - 7;

      // Main horizontal roads
      this.carveRoad(base1X, baseY, base2X, baseY);
      // Upper path
      this.carveRoad(base1X + 4, baseY - 10, base2X - 4, baseY - 10);
      this.carveRoad(base1X + 4, baseY, base1X + 4, baseY - 10);
      this.carveRoad(base2X - 4, baseY, base2X - 4, baseY - 10);
      // Lower path
      this.carveRoad(base1X + 4, baseY + 10, base2X - 4, baseY + 10);
      this.carveRoad(base1X + 4, baseY, base1X + 4, baseY + 10);
      this.carveRoad(base2X - 4, baseY, base2X - 4, baseY + 10);
      // Cross roads
      this.carveRoad(Math.floor(cx), baseY - 10, Math.floor(cx), baseY + 10);

      // Bridges over water channels
      this.placeBridges(Math.floor(cx), baseY);
      this.placeBridges(Math.floor(cx), baseY - 10);
      this.placeBridges(Math.floor(cx), baseY + 10);

      // Base areas (3x3 blocks)
      this.placeBase(base1X, baseY, 1);
      this.placeBase(base2X, baseY, 2);

      // Flags near bases
      this.team1Flag = { x: base1X + 2, y: baseY };
      this.team2Flag = { x: base2X - 2, y: baseY };

      // Walls (destructible barriers)
      this.placeWallCluster(Math.floor(cx) - 5, baseY - 3, 3, 6);
      this.placeWallCluster(Math.floor(cx) + 3, baseY - 3, 3, 6);
      this.placeWallCluster(Math.floor(cx) - 2, baseY - 14, 4, 2);
      this.placeWallCluster(Math.floor(cx) - 2, baseY + 13, 4, 2);
      // Walls near bases
      this.placeWallCluster(base1X + 6, baseY - 3, 2, 6);
      this.placeWallCluster(base2X - 7, baseY - 3, 2, 6);

      // Tree clusters
      this.placeTreeCluster(15, baseY - 7, 4, 3);
      this.placeTreeCluster(W - 19, baseY + 5, 4, 3);
      this.placeTreeCluster(15, baseY + 5, 3, 3);
      this.placeTreeCluster(W - 18, baseY - 7, 3, 3);
      this.placeTreeCluster(Math.floor(cx) - 12, baseY - 12, 3, 2);
      this.placeTreeCluster(Math.floor(cx) + 10, baseY + 11, 3, 2);

      // Depots
      this.depots = [];
      this.placeDepot(20, baseY - 5, T.DEPOT_AMMO);
      this.placeDepot(W - 21, baseY + 5, T.DEPOT_AMMO);
      this.placeDepot(Math.floor(cx), baseY - 5, T.DEPOT_AMMO);
      this.placeDepot(Math.floor(cx), baseY + 5, T.DEPOT_AMMO);
      this.placeDepot(20, baseY + 5, T.DEPOT_FUEL);
      this.placeDepot(W - 21, baseY - 5, T.DEPOT_FUEL);
      this.placeDepot(Math.floor(cx) - 8, baseY, T.DEPOT_FUEL);
      this.placeDepot(Math.floor(cx) + 8, baseY, T.DEPOT_FUEL);

      // Turrets (defensive positions) - assigned to nearby team
      this.turrets = [];
      this.placeTurret(base1X + 5, baseY - 4, 1);
      this.placeTurret(base1X + 5, baseY + 4, 1);
      this.placeTurret(base2X - 5, baseY - 4, 2);
      this.placeTurret(base2X - 5, baseY + 4, 2);

      // Make sure base areas are clean
      this.clearArea(base1X - 1, baseY - 2, 5, 5);
      this.clearArea(base2X - 2, baseY - 2, 5, 5);
      this.placeBase(base1X, baseY, 1);
      this.placeBase(base2X, baseY, 2);

      return this;
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
