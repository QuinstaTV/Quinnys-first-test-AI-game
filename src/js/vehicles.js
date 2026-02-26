/* ============================================================
   vehicles.js - Jeep, BushMaster, Helicopter, StrikeMaster
   with full stats, weapons, fuel/ammo, flag carrying, specials
   ============================================================ */
(function () {
  'use strict';

  const { TILE, T, VEH, clamp, dist, angleTo, normAngle, randFloat } = Game;

  /* --------- Vehicle stat definitions --------- */
  const STATS = {
    [VEH.JEEP]: {
      name: 'Jeep', speed: 220, turnRate: 4.5, hp: 50,
      fuel: 300, fuelBurn: 3, ammo: 200, fireRate: 0.08,
      projType: 'BULLET', hitRadius: 12, canCarryFlag: true
    },
    [VEH.TANK]: {
      name: 'BushMaster', speed: 120, turnRate: 2.5, hp: 160,
      fuel: 240, fuelBurn: 5, ammo: 40, fireRate: 0.8,
      projType: 'SHELL', hitRadius: 16, canCarryFlag: false
    },
    [VEH.HELI]: {
      name: 'Helicopter', speed: 200, turnRate: 4.0, hp: 70,
      fuel: 180, fuelBurn: 6, ammo: 120, fireRate: 0.12,
      projType: 'BULLET', hitRadius: 14, canCarryFlag: false, flies: true
    },
    [VEH.ASV]: {
      name: 'StrikeMaster', speed: 90, turnRate: 2.0, hp: 200,
      fuel: 270, fuelBurn: 4, ammo: 24, fireRate: 0.6,
      projType: 'ROCKET', hitRadius: 18, canCarryFlag: false,
      mineAmmo: 8
    }
  };

  let nextId = 1;

  class Vehicle {
    constructor(type, team, x, y) {
      this.id = nextId++;
      this.type = type;
      this.team = team;
      this.x = x;
      this.y = y;
      this.angle = team === 1 ? 0 : Math.PI; // face enemy
      this.turretAngle = this.angle; // for tank

      const s = STATS[type];
      this.stats = s;
      this.name = s.name;
      this.speed = s.speed;
      this.turnRate = s.turnRate;
      this.maxHp = s.hp;
      this.hp = s.hp;
      this.maxFuel = s.fuel;
      this.fuel = s.fuel;
      this.maxAmmo = s.ammo;
      this.ammo = s.ammo;
      this.fireRate = s.fireRate;
      this.fireCooldown = 0;
      this.projType = s.projType;
      this.hitRadius = s.hitRadius;
      this.canCarryFlag = s.canCarryFlag;
      this.flies = !!s.flies;
      this.maxMines = s.mineAmmo || 0;
      this.mineAmmo = this.maxMines;
      this.mineCooldown = 0;

      this.vx = 0;
      this.vy = 0;
      this.alive = true;
      this.hasFlag = false;
      this.flagTeam = 0; // which team's flag we carry (the enemy's)
      this.isPlayer = false;
      this.isAI = false;

      // Jeep water crossing
      this.onWater = false;
      this.waterTimer = 0;
      this.maxWaterTime = 3.0; // seconds jeep can float

      // Helicopter rotor animation
      this.rotorAngle = 0;

      // Helicopter crash mechanic
      this.crashTimer = 0;
      this.isCrashing = false;

      // Death
      this.deathTimer = 0;
      this.respawnTimer = 0;

      // Network
      this.lastUpdate = 0;
      this.networkId = null;
    }

    update(dt, map, input) {
      if (!this.alive) {
        this.deathTimer += dt;
        return;
      }

      this.fireCooldown -= dt;
      this.mineCooldown -= dt;

      // Rotor animation for helicopter
      if (this.type === VEH.HELI) {
        // Rotor slows down when crashing
        const rotorSpeed = this.isCrashing ? 20 * Math.max(0, 1 - this.crashTimer / 3) : 20;
        this.rotorAngle += dt * rotorSpeed;
      }

      // Fuel consumption while moving (or hovering for heli)
      const isMoving = Math.abs(this.vx) > 1 || Math.abs(this.vy) > 1;
      const heliHovering = this.type === VEH.HELI && this.alive;
      if (isMoving || heliHovering) {
        const burnRate = heliHovering && !isMoving ? this.stats.fuelBurn * 0.5 : this.stats.fuelBurn;
        this.fuel -= burnRate * dt;
        if (this.fuel <= 0) {
          this.fuel = 0;
        }
      }

      // All vehicles explode when fuel reaches 0
      if (this.fuel <= 0) {
        if (this.type === VEH.HELI) {
          // Helicopter crash sequence (loses altitude over 3 seconds)
          if (!this.isCrashing) {
            this.isCrashing = true;
            this.crashTimer = 0;
          }
          this.crashTimer += dt;
          // Smoke trail while crashing
          if (Math.random() < 0.3) {
            Game.Particles.smoke(this.x, this.y);
          }
          // Crash after 3 seconds
          if (this.crashTimer >= 3.0) {
            this.takeDamage(999, -1);
            Game.Particles.explosion(this.x, this.y, 2, 20);
          }
        } else {
          // Ground vehicles: immediate explosion on fuel=0
          if (!this.isCrashing) {
            this.isCrashing = true;
            this.crashTimer = 0;
          }
          this.crashTimer += dt;
          // Smoke while stalling
          if (Math.random() < 0.2) {
            Game.Particles.smoke(this.x, this.y);
          }
          // Explode after 2 seconds
          if (this.crashTimer >= 2.0) {
            this.takeDamage(999, -1);
            Game.Particles.explosion(this.x, this.y, 2, 20);
          }
        }
      }

      // Water check for non-flying vehicles
      if (!this.flies) {
        const tx = Math.floor(this.x / TILE);
        const ty = Math.floor(this.y / TILE);
        const tile = map.getTile(tx, ty);

        if (tile === T.WATER) {
          if (this.type === VEH.JEEP) {
            this.onWater = true;
            this.waterTimer += dt;
            if (this.waterTimer >= this.maxWaterTime) {
              this.takeDamage(999, -1); // drown
              Game.Particles.waterSplash(this.x, this.y);
            }
          } else {
            // Other ground vehicles die in water
            this.takeDamage(999, -1);
            Game.Particles.waterSplash(this.x, this.y);
          }
        } else {
          this.onWater = false;
          this.waterTimer = Math.max(0, this.waterTimer - dt * 0.5); // recover
        }
      }

      // Resupply at base or depot
      this.checkResupply(map, dt);
    }

    move(dx, dy, dt, map) {
      if (!this.alive) return;
      // Ground vehicles stall when out of fuel; helicopter slows down instead
      if (this.fuel <= 0 && this.type !== VEH.HELI) return;

      // Speed scaling: helicopter slows when low on fuel, ground vehicles normal
      let speedMult = 1.0;
      if (this.type === VEH.HELI) {
        if (this.fuel <= 0) {
          // Crashing: very slow, losing altitude
          speedMult = 0.15;
        } else if (this.fuel < this.maxFuel * 0.3) {
          // Low fuel: scale speed from 100% at 30% fuel to 30% at 0% fuel
          speedMult = 0.3 + 0.7 * (this.fuel / (this.maxFuel * 0.3));
        }
      }

      const speed = this.speed * speedMult * dt;

      if (dx !== 0 || dy !== 0) {
        // True directional movement: move in input direction immediately
        const len = Math.sqrt(dx * dx + dy * dy);
        const normDx = dx / len;
        const normDy = dy / len;
        const moveX = normDx * speed;
        const moveY = normDy * speed;

        // Rotate body towards movement direction (visual)
        const targetAngle = Math.atan2(dy, dx);
        const diff = normAngle(targetAngle - this.angle);
        const maxTurn = this.turnRate * dt;
        this.angle += clamp(diff, -maxTurn, maxTurn);
        this.angle = normAngle(this.angle);

        // Collision check
        const newX = this.x + moveX;
        const newY = this.y + moveY;

        if (this.flies) {
          // Helicopter can fly over everything, just check world bounds
          if (map.isFlyable(newX, newY)) {
            this.x = newX;
            this.y = newY;
          }
        } else {
          // Ground vehicle - check walkability
          // Check multiple points around the vehicle
          const r = this.hitRadius * 0.7;
          const canMoveX = map.isWalkable(newX + r, this.y) &&
                           map.isWalkable(newX - r, this.y) &&
                           map.isWalkable(newX, this.y + r) &&
                           map.isWalkable(newX, this.y - r);
          const canMoveY = map.isWalkable(this.x, newY + r) &&
                           map.isWalkable(this.x + r, newY) &&
                           map.isWalkable(this.x - r, newY) &&
                           map.isWalkable(this.x, newY - r);

          // Also allow jeep on water temporarily
          const canMoveXW = this.type === VEH.JEEP && this.waterTimer < this.maxWaterTime;
          const canMoveYW = canMoveXW;

          if (canMoveX || canMoveXW) this.x = newX;
          if (canMoveY || canMoveYW) this.y = newY;
        }

        // Clamp to world
        this.x = clamp(this.x, TILE, map.worldW - TILE);
        this.y = clamp(this.y, TILE, map.worldH - TILE);

        this.vx = moveX / dt;
        this.vy = moveY / dt;

        // Engine smoke for ground vehicles
        if (!this.flies && Math.random() < 0.1) {
          Game.Particles.smoke(
            this.x - Math.cos(this.angle) * 10,
            this.y - Math.sin(this.angle) * 10
          );
        }
      } else {
        this.vx *= 0.9;
        this.vy *= 0.9;
      }
    }

    shoot() {
      if (!this.alive || this.ammo <= 0 || this.fireCooldown > 0) return false;

      let fireAngle = this.angle;

      // Tank has independent turret
      if (this.type === VEH.TANK) {
        fireAngle = this.turretAngle;
      }

      const muzzleX = this.x + Math.cos(fireAngle) * (this.hitRadius + 8);
      const muzzleY = this.y + Math.sin(fireAngle) * (this.hitRadius + 8);

      Game.Projectiles.fire(muzzleX, muzzleY, fireAngle, this.projType, this.id, this.team);

      this.ammo--;
      this.fireCooldown = this.fireRate;

      if (Game.Audio) Game.Audio.play(this.projType === 'BULLET' ? 'shoot' : 'cannon');
      return true;
    }

    layMine() {
      if (!this.alive || this.type !== VEH.ASV) return false;
      if (this.mineAmmo <= 0 || this.mineCooldown > 0) return false;

      const mx = this.x - Math.cos(this.angle) * 20;
      const my = this.y - Math.sin(this.angle) * 20;
      Game.Projectiles.layMine(mx, my, this.id, this.team);
      this.mineAmmo--;
      this.mineCooldown = 1.5;
      return true;
    }

    aimTurret(targetX, targetY, dt) {
      if (this.type !== VEH.TANK) return;
      dt = dt || 0.016;
      const targetAngle = angleTo(this.x, this.y, targetX, targetY);
      const diff = normAngle(targetAngle - this.turretAngle);
      const maxTurn = 3.0; // turret turn speed (radians/sec)
      this.turretAngle += clamp(diff, -maxTurn * dt, maxTurn * dt);
      this.turretAngle = normAngle(this.turretAngle);
    }

    takeDamage(amount, attackerId) {
      if (!this.alive) return;
      this.hp -= amount;
      if (this.hp <= 0) {
        this.hp = 0;
        this.die();
      }
    }

    die() {
      this.alive = false;
      this.deathTimer = 0;
      Game.Particles.explosion(this.x, this.y, 2, 25);
      if (Game.Audio) Game.Audio.play('explosion');
      if (Game.screenShake) Game.screenShake(8);

      // Drop flag
      if (this.hasFlag) {
        this.hasFlag = false;
        // Flag will be reset by game logic
      }
    }

    respawn(x, y) {
      this.x = x;
      this.y = y;
      this.angle = this.team === 1 ? 0 : Math.PI;
      this.turretAngle = this.angle;
      this.hp = this.maxHp;
      this.fuel = this.maxFuel;
      this.ammo = this.maxAmmo;
      this.mineAmmo = this.maxMines;
      this.alive = true;
      this.hasFlag = false;
      this.flagTeam = 0;
      this.deathTimer = 0;
      this.waterTimer = 0;
      this.fireCooldown = 0;
      this.mineCooldown = 0;
      this.isCrashing = false;
      this.crashTimer = 0;
    }

    checkResupply(map, dt) {
      const tx = Math.floor(this.x / TILE);
      const ty = Math.floor(this.y / TILE);
      const tile = map.getTile(tx, ty);

      // At own base - full resupply
      const ownBase = this.team === 1 ? T.BASE1 : T.BASE2;
      if (tile === ownBase) {
        this.fuel = Math.min(this.maxFuel, this.fuel + 20 * dt);
        this.ammo = Math.min(this.maxAmmo, this.ammo + 5 * dt);
        this.hp = Math.min(this.maxHp, this.hp + 10 * dt);
        this.mineAmmo = Math.min(this.maxMines, this.mineAmmo + 1 * dt);
      }

      // At ammo depot
      if (tile === T.DEPOT_AMMO) {
        this.ammo = Math.min(this.maxAmmo, this.ammo + 15 * dt);
        this.mineAmmo = Math.min(this.maxMines, this.mineAmmo + 2 * dt);
      }

      // At fuel depot
      if (tile === T.DEPOT_FUEL) {
        this.fuel = Math.min(this.maxFuel, this.fuel + 30 * dt);
      }
    }

    render(ctx, camX, camY) {
      if (!this.alive) {
        // Draw skull briefly
        if (this.deathTimer < 2.0) {
          const skull = Game.Sprites.sprites.skull;
          if (skull) {
            ctx.globalAlpha = 1 - this.deathTimer / 2.0;
            const bounce = Math.sin(this.deathTimer * 5) * 5;
            ctx.drawImage(skull,
              this.x - camX - 16,
              this.y - camY - 16 - this.deathTimer * 20 + bounce
            );
            ctx.globalAlpha = 1;
          }
        }
        return;
      }

      const sx = this.x - camX;
      const sy = this.y - camY;

      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(this.angle + Math.PI / 2); // sprites face up by default

      // Draw vehicle sprite
      const sprite = Game.Sprites.getVehicleSprite(this.type, this.team);
      if (sprite) {
        ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
      }

      ctx.restore();

      // Tank turret (drawn separately for independent rotation)
      if (this.type === VEH.TANK) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.turretAngle + Math.PI / 2);
        ctx.fillStyle = '#444';
        ctx.fillRect(-2, -20, 4, 14);
        ctx.restore();
      }

      // Helicopter rotor
      if (this.type === VEH.HELI) {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(this.rotorAngle);
        ctx.strokeStyle = 'rgba(200,200,200,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
        ctx.moveTo(0, -16); ctx.lineTo(0, 16);
        ctx.stroke();
        ctx.restore();

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.ellipse(sx + 5, sy + 8, 12, 8, 0.3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Flag indicator
      if (this.hasFlag) {
        const flagSprite = Game.Sprites.sprites[`flag_${this.flagTeam}`];
        if (flagSprite) {
          ctx.drawImage(flagSprite, sx - 10, sy - 30);
        }
        // Pulsing glow
        ctx.strokeStyle = this.flagTeam === 1 ? '#3388ff' : '#ff4444';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.5 + Math.sin(Date.now() * 0.005) * 0.3;
        ctx.beginPath();
        ctx.arc(sx, sy, this.hitRadius + 5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // Health bar (show when damaged)
      if (this.hp < this.maxHp) {
        const barW = 24;
        const barH = 3;
        const bx = sx - barW / 2;
        const by = sy - this.hitRadius - 8;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        const hpRatio = this.hp / this.maxHp;
        ctx.fillStyle = hpRatio > 0.5 ? '#0f0' : hpRatio > 0.25 ? '#ff0' : '#f00';
        ctx.fillRect(bx, by, barW * hpRatio, barH);
      }

      // Water warning for jeep
      if (this.onWater && this.type === VEH.JEEP) {
        const ratio = this.waterTimer / this.maxWaterTime;
        ctx.fillStyle = ratio > 0.7 ? '#f00' : '#ff0';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('WATER!', sx, sy - 25);
      }
    }

    // Serialize for network
    serialize() {
      return {
        id: this.id,
        type: this.type,
        team: this.team,
        x: Math.round(this.x),
        y: Math.round(this.y),
        angle: +(this.angle.toFixed(2)),
        turretAngle: +(this.turretAngle.toFixed(2)),
        hp: this.hp,
        fuel: Math.round(this.fuel),
        ammo: this.ammo,
        alive: this.alive,
        hasFlag: this.hasFlag,
        flagTeam: this.flagTeam
      };
    }

    // Update from network data
    applyNetworkState(data) {
      this.x = data.x;
      this.y = data.y;
      this.angle = data.angle;
      this.turretAngle = data.turretAngle;
      this.hp = data.hp;
      this.fuel = data.fuel;
      this.ammo = data.ammo;
      this.alive = data.alive;
      this.hasFlag = data.hasFlag;
      this.flagTeam = data.flagTeam;
    }
  }

  // Factory
  function createVehicle(type, team, x, y) {
    return new Vehicle(type, team, x, y);
  }

  function resetIdCounter() { nextId = 1; }

  window.Game.Vehicle = Vehicle;
  window.Game.VEHICLE_STATS = STATS;
  window.Game.createVehicle = createVehicle;
  window.Game.resetVehicleIds = resetIdCounter;
})();
