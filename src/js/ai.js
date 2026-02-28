/* ============================================================
   ai.js - Enemy AI with FSM (patrol, attack, capture, defend)
   Uses A* pathfinding for navigation
   ============================================================ */
(function () {
  'use strict';

  const { VEH, dist, angleTo, normAngle, clamp, randInt, randFloat, tileAt, tileCentre, astar } = Game;

  const AI_STATE = {
    IDLE: 0,
    PATROL: 1,
    ATTACK: 2,
    CAPTURE: 3,
    RETURN_FLAG: 4,
    DEFEND: 5,
    RESUPPLY: 6
  };

  class AIController {
    constructor(vehicle, map) {
      this.vehicle = vehicle;
      this.map = map;
      this.state = AI_STATE.IDLE;
      this.target = null; // target entity
      this.targetPos = null; // target world position
      this.path = [];
      this.pathIndex = 0;
      this.thinkTimer = 0;
      this.thinkInterval = 0.5; // re-evaluate every 0.5s
      this.stuckTimer = 0;
      this.lastX = 0;
      this.lastY = 0;
      this.shootTimer = 0;
      this.difficulty = 0.7; // 0-1, affects accuracy and reaction
    }

    update(dt, enemies, flags, gameState) {
      const v = this.vehicle;
      if (!v.alive) return;

      this.thinkTimer += dt;
      this.shootTimer -= dt;

      // Periodic re-evaluation of strategy
      if (this.thinkTimer >= this.thinkInterval) {
        this.thinkTimer = 0;
        this.evaluate(enemies, flags, gameState);
      }

      // Stuck detection
      if (dist(v.x, v.y, this.lastX, this.lastY) < 2) {
        this.stuckTimer += dt;
        if (this.stuckTimer > 2.0) {
          this.path = [];
          this.stuckTimer = 0;
          this.state = AI_STATE.PATROL;
        }
      } else {
        this.stuckTimer = 0;
      }
      this.lastX = v.x;
      this.lastY = v.y;

      // Execute current behavior
      switch (this.state) {
        case AI_STATE.IDLE:
          this.doIdle(dt);
          break;
        case AI_STATE.PATROL:
          this.doPatrol(dt);
          break;
        case AI_STATE.ATTACK:
          this.doAttack(dt, enemies);
          break;
        case AI_STATE.CAPTURE:
          this.doCapture(dt, flags);
          break;
        case AI_STATE.RETURN_FLAG:
          this.doReturnFlag(dt);
          break;
        case AI_STATE.DEFEND:
          this.doDefend(dt, enemies);
          break;
        case AI_STATE.RESUPPLY:
          this.doResupply(dt);
          break;
      }
    }

    evaluate(enemies, flags, gameState) {
      const v = this.vehicle;
      const enemyTeam = v.team === 1 ? 2 : 1;

      // If carrying flag, return it
      if (v.hasFlag) {
        this.state = AI_STATE.RETURN_FLAG;
        return;
      }

      // If low on fuel or ammo, resupply
      if (v.fuel < v.maxFuel * 0.2 || (v.ammo < v.maxAmmo * 0.15 && v.ammo < 5)) {
        this.state = AI_STATE.RESUPPLY;
        return;
      }

      // If low HP, go resupply
      if (v.hp < v.maxHp * 0.25) {
        this.state = AI_STATE.RESUPPLY;
        return;
      }

      // Find nearby enemies
      const nearestEnemy = this.findNearest(enemies, e => e.alive && e.team !== v.team);
      const distToEnemy = nearestEnemy ? dist(v.x, v.y, nearestEnemy.x, nearestEnemy.y) : 9999;

      // If enemy is very close, attack
      if (distToEnemy < 250) {
        this.target = nearestEnemy;
        this.state = AI_STATE.ATTACK;
        return;
      }

      // If we're a jeep (flag carrier), try to capture
      if (v.canCarryFlag) {
        // Check if enemy flag is available
        const enemyFlagPos = this.map.getFlagPos(enemyTeam);
        if (flags && flags[enemyTeam] && !flags[enemyTeam].carried) {
          this.state = AI_STATE.CAPTURE;
          return;
        }
      }

      // Tanks/ASV/Heli - attack or defend
      if (v.type === VEH.TANK || v.type === VEH.ASV) {
        // 60% chance attack, 40% defend
        if (Math.random() < 0.6 && nearestEnemy) {
          this.target = nearestEnemy;
          this.state = AI_STATE.ATTACK;
          return;
        }
        this.state = AI_STATE.DEFEND;
        return;
      }

      if (v.type === VEH.HELI) {
        // Helicopter scouts and attacks
        if (nearestEnemy) {
          this.target = nearestEnemy;
          this.state = AI_STATE.ATTACK;
          return;
        }
      }

      // Default: patrol
      this.state = AI_STATE.PATROL;
    }

    doIdle(dt) {
      // Just wait briefly then patrol
      this.state = AI_STATE.PATROL;
    }

    doPatrol(dt) {
      const v = this.vehicle;
      // Pick random point on map to move to
      if (!this.targetPos || dist(v.x, v.y, this.targetPos.x, this.targetPos.y) < 40) {
        const tx = randInt(10, this.map.width - 10);
        const ty = randInt(10, this.map.height - 10);
        this.targetPos = tileCentre(tx, ty);
        this.computePath(tx, ty);
      }
      this.followPath(dt);
    }

    doAttack(dt, enemies) {
      const v = this.vehicle;
      const t = this.target;

      if (!t || !t.alive) {
        this.target = null;
        this.state = AI_STATE.PATROL;
        return;
      }

      const d = dist(v.x, v.y, t.x, t.y);

      // Move towards target if too far, away if too close
      const idealDist = v.type === VEH.HELI ? 200 : v.type === VEH.TANK ? 150 : 120;

      if (d > idealDist + 50) {
        // Move closer
        this.moveTowards(t.x, t.y, dt);
      } else if (d < idealDist - 50) {
        // Move away
        this.moveAway(t.x, t.y, dt);
      } else {
        // Strafe (move perpendicular)
        const perpAngle = angleTo(v.x, v.y, t.x, t.y) + Math.PI / 2;
        const dx = Math.cos(perpAngle);
        const dy = Math.sin(perpAngle);
        v.move(dx * 0.5, dy * 0.5, dt, this.map);
      }

      // Aim and shoot
      if (v.type === VEH.TANK) {
        v.aimTurret(t.x, t.y);
      } else {
        const targetAngle = angleTo(v.x, v.y, t.x, t.y);
        const diff = normAngle(targetAngle - v.angle);
        v.angle += clamp(diff, -v.turnRate * dt, v.turnRate * dt);
        v.angle = normAngle(v.angle);
      }

      // Shoot with some inaccuracy based on difficulty
      if (d < 400 && this.shootTimer <= 0) {
        const aimError = (1 - this.difficulty) * 0.3;
        const accuracy = Math.abs(normAngle(angleTo(v.x, v.y, t.x, t.y) - (v.type === VEH.TANK ? v.turretAngle : v.angle)));
        if (accuracy < 0.2 + aimError) {
          v.shoot();
          this.shootTimer = v.fireRate + randFloat(0, 0.3);
        }
      }

      // ASV: lay mines when being chased
      if (v.type === VEH.ASV && d < 100 && v.mineAmmo > 0) {
        v.layMine();
      }

      // Disengage if too far
      if (d > 500) {
        this.target = null;
        this.state = AI_STATE.PATROL;
      }
    }

    doCapture(dt, flags) {
      const v = this.vehicle;
      const enemyTeam = v.team === 1 ? 2 : 1;
      const flagPos = this.map.getFlagPos(enemyTeam);

      // Navigate to enemy flag
      this.moveTowards(flagPos.x, flagPos.y, dt);

      // Flag pickup is handled by game logic
    }

    doReturnFlag(dt) {
      const v = this.vehicle;
      if (!v.hasFlag) {
        this.state = AI_STATE.PATROL;
        return;
      }

      // Navigate to own base
      const basePos = this.map.getBasePos(v.team);
      this.moveTowards(basePos.x, basePos.y, dt);
    }

    doDefend(dt, enemies) {
      const v = this.vehicle;
      const basePos = this.map.getBasePos(v.team);
      const d = dist(v.x, v.y, basePos.x, basePos.y);

      // Stay near base
      if (d > 200) {
        this.moveTowards(basePos.x, basePos.y, dt);
      } else {
        // Patrol around base
        if (!this.targetPos || dist(v.x, v.y, this.targetPos.x, this.targetPos.y) < 40) {
          const angle = Math.random() * Math.PI * 2;
          this.targetPos = {
            x: basePos.x + Math.cos(angle) * 150,
            y: basePos.y + Math.sin(angle) * 150
          };
        }
        this.moveTowards(this.targetPos.x, this.targetPos.y, dt);
      }

      // Attack any nearby enemies
      const nearestEnemy = this.findNearest(enemies, e => e.alive && e.team !== v.team);
      if (nearestEnemy && dist(v.x, v.y, nearestEnemy.x, nearestEnemy.y) < 300) {
        if (v.type === VEH.TANK) {
          v.aimTurret(nearestEnemy.x, nearestEnemy.y);
        } else if (v.type === VEH.HELI) {
          // Heli must face enemy to shoot (body aim, same as doAttack)
          const targetAngle = angleTo(v.x, v.y, nearestEnemy.x, nearestEnemy.y);
          const aDiff = normAngle(targetAngle - v.angle);
          v.angle += clamp(aDiff, -v.turnRate * dt, v.turnRate * dt);
          v.angle = normAngle(v.angle);
        }
        const aimAngle = angleTo(v.x, v.y, nearestEnemy.x, nearestEnemy.y);
        const diff = normAngle(aimAngle - (v.type === VEH.TANK ? v.turretAngle : v.angle));
        if (Math.abs(diff) < 0.3) {
          v.shoot();
        }
      }
    }

    doResupply(dt) {
      const v = this.vehicle;
      const basePos = this.map.getBasePos(v.team);

      // Go to base for resupply
      this.moveTowards(basePos.x, basePos.y, dt);

      const d = dist(v.x, v.y, basePos.x, basePos.y);
      if (d < 50) {
        // At base, wait for resupply
        if (v.fuel > v.maxFuel * 0.7 && v.ammo > v.maxAmmo * 0.5 && v.hp > v.maxHp * 0.5) {
          this.state = AI_STATE.PATROL;
        }
      }
    }

    moveTowards(tx, ty, dt) {
      const v = this.vehicle;
      const d = dist(v.x, v.y, tx, ty);

      if (d < 10) return;

      // Simple direct movement (A* too expensive every frame)
      const angle = angleTo(v.x, v.y, tx, ty);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      v.move(dx, dy, dt, this.map);

      // AI helicopters face movement direction (player helis face aim direction
      // via game.js, but AI needs explicit rotation since Vehicle.move skips it)
      if (v.type === VEH.HELI) {
        const diff = normAngle(angle - v.angle);
        const maxTurn = v.turnRate * dt;
        v.angle += clamp(diff, -maxTurn, maxTurn);
        v.angle = normAngle(v.angle);
      }
    }

    moveAway(tx, ty, dt) {
      const v = this.vehicle;
      const angle = angleTo(tx, ty, v.x, v.y);
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      v.move(dx, dy, dt, this.map);

      // AI helicopters face movement direction
      if (v.type === VEH.HELI) {
        const diff = normAngle(angle - v.angle);
        const maxTurn = v.turnRate * dt;
        v.angle += clamp(diff, -maxTurn, maxTurn);
        v.angle = normAngle(v.angle);
      }
    }

    computePath(targetTX, targetTY) {
      const v = this.vehicle;
      const start = tileAt(v.x, v.y);
      this.path = astar(this.map, start.tx, start.ty, targetTX, targetTY, v.flies);
      this.pathIndex = 0;
    }

    followPath(dt) {
      const v = this.vehicle;
      if (this.path.length === 0) return;

      if (this.pathIndex >= this.path.length) {
        this.path = [];
        return;
      }

      const node = this.path[this.pathIndex];
      const target = tileCentre(node.x, node.y);
      const d = dist(v.x, v.y, target.x, target.y);

      if (d < 20) {
        this.pathIndex++;
        if (this.pathIndex >= this.path.length) {
          this.path = [];
          return;
        }
      }

      this.moveTowards(target.x, target.y, dt);
    }

    findNearest(entities, filter) {
      const v = this.vehicle;
      let best = null;
      let bestDist = Infinity;
      for (let i = 0; i < entities.length; i++) {
        const e = entities[i];
        if (!filter(e)) continue;
        const d = dist(v.x, v.y, e.x, e.y);
        if (d < bestDist) {
          bestDist = d;
          best = e;
        }
      }
      return best;
    }
  }

  // Create AI-controlled vehicles for a team
  function spawnAITeam(map, team, count) {
    const vehicles = [];
    const types = [VEH.JEEP, VEH.TANK, VEH.HELI, VEH.ASV];
    const spawn = map.getSpawn(team);

    for (let i = 0; i < count; i++) {
      const type = types[i % types.length];
      const offsetX = (i % 2) * 40 - 20;
      const offsetY = Math.floor(i / 2) * 40 - 20;
      const v = Game.createVehicle(type, team, spawn.x + offsetX, spawn.y + offsetY);
      v.isAI = true;
      const ai = new AIController(v, map);
      ai.difficulty = 0.5 + Math.random() * 0.3;
      vehicles.push({ vehicle: v, ai });
    }
    return vehicles;
  }

  window.Game.AIController = AIController;
  window.Game.spawnAITeam = spawnAITeam;
})();
