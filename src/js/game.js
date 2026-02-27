/* ============================================================
   game.js - Main game orchestrator  (v1.2)
   10-round flow, per-round & final stats, seed-based proc maps,
   death→garage respawn, SP vehicle limits (1 player / 2 AI),
   camera, turrets, flag logic, singleplayer & multiplayer
   ============================================================ */
(function () {
  'use strict';

  const { STATE, VEH, T, TILE, dist, angleTo, clamp, randFloat } = Game;

  let canvas, ctx;
  let state = STATE.MENU;
  let prevState = STATE.MENU;
  let gameMode = 'single'; // 'single' or 'multi'

  // Screen
  let screenW = 960, screenH = 640;

  // Camera
  let camX = 0, camY = 0;
  let shakeX = 0, shakeY = 0;
  let shakeAmount = 0;

  // Map
  let map = null;

  // Entities
  let playerVehicle = null;
  let allVehicles = [];
  let aiControllers = [];

  // Flags
  let flags = {
    1: { x: 0, y: 0, atBase: true, carried: false, carrier: null, team: 1 },
    2: { x: 0, y: 0, atBase: true, carried: false, carrier: null, team: 2 }
  };

  // Score (per-round flag captures)
  let score = { team1: 0, team2: 0 };
  const WIN_SCORE = 3; // flags per round

  // ========== ROUND SYSTEM (10 rounds) ==========
  const MAX_ROUNDS = 10;
  let currentRound = 1;
  let roundsWon = { team1: 0, team2: 0 };
  let roundSeed = Date.now();

  // Per-round stats: { kills, deaths, flags, turretsKilled }
  let roundStats = {
    player: { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
    team1:  { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
    team2:  { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 }
  };
  // Accumulate all rounds
  let allRoundStats = []; // array of { round, winner, team1:{…}, team2:{…}, player:{…}, time }
  let roundWinner = 0; // 1 or 2

  // Round-stats screen timer
  let statsTimer = 0;
  const STATS_DURATION = 5; // seconds

  let gameTime = 0;
  let winner = 0;

  // Vehicle selection
  let selectedVehicle = VEH.JEEP;

  // Vehicle availability per round (one of each type)
  let vehiclePool = [true, true, true, true]; // indexed by VEH type

  // Jeep lives (3 respawns per round)
  let jeepLives = 3;
  const MAX_JEEP_LIVES = 3;

  // Respawn
  const RESPAWN_TIME = 1.5; // short animation then straight to garage
  let respawnTimer = 0;
  let isRespawning = false;

  // Turret update
  let turrets = [];

  // Menu
  let showingHowToPlay = false;
  let menuSelection = 0;

  // Network state
  let remotePlayers = {};
  let netSyncTimer = 0;

  // Frame timing
  let lastTime = 0;

  // Fuel warning
  let fuelWarnTimer = 0;

  // SP AI vehicle limit
  const MAX_AI_VEHICLES = 2;

  /* ========== INITIALIZATION ========== */
  function init() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    Game.Input.init(canvas);
    Game.Sprites.generate();
    Game.Audio.init();
    Game.UI.init(canvas);

    // Screen shake function
    Game.screenShake = function (amount) {
      shakeAmount = Math.max(shakeAmount, amount);
    };

    // Canvas click handler for menus
    canvas.addEventListener('click', handleClick);

    // Start loop
    requestAnimationFrame(gameLoop);
  }

  function resizeCanvas() {
    screenW = Math.max(800, window.innerWidth);
    screenH = Math.max(500, window.innerHeight);
    canvas.width = screenW;
    canvas.height = screenH;
    Game.UI.resize(screenW, screenH);
  }

  /* ========== GAME LOOP ========== */
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    update(dt);
    render();

    Game.Input.endFrame();
    requestAnimationFrame(gameLoop);
  }

  /* ========== UPDATE ========== */
  function update(dt) {
    Game.UI.updateMouse();
    Game.UI.updateNotifications(dt);

    switch (state) {
      case STATE.MENU:
        updateMenu(dt);
        break;
      case STATE.VEHICLE_SELECT:
        updateVehicleSelect(dt);
        break;
      case STATE.PLAYING:
        updatePlaying(dt);
        break;
      case STATE.GAME_OVER:
        updateGameOver(dt);
        break;
      case STATE.LOBBY:
        updateLobby(dt);
        break;
      case STATE.ROUND_STATS:
        updateRoundStats(dt);
        break;
      case STATE.FINAL_STATS:
        updateFinalStats(dt);
        break;
    }
  }

  /* ---------- Menu ---------- */
  function updateMenu(dt) {
    if (showingHowToPlay) {
      if (Game.Input.wasPressed('Escape') || Game.Input.wasPressed('Enter') ||
          Game.Input.wasPressed('Space') || Game.Input.wasClicked()) {
        showingHowToPlay = false;
      }
      return;
    }

    if (Game.Input.wasPressed('ArrowUp') || Game.Input.wasPressed('KeyW')) {
      menuSelection = (menuSelection - 1 + 3) % 3;
      Game.Audio.play('click');
    }
    if (Game.Input.wasPressed('ArrowDown') || Game.Input.wasPressed('KeyS')) {
      menuSelection = (menuSelection + 1) % 3;
      Game.Audio.play('click');
    }
    Game.UI.selectedMenuItem = menuSelection;

    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      selectMenuItem(menuSelection);
    }
  }

  function selectMenuItem(index) {
    Game.Audio.play('click');
    switch (index) {
      case 0:
        gameMode = 'single';
        state = STATE.VEHICLE_SELECT;
        break;
      case 1:
        gameMode = 'multi';
        startMultiplayer();
        break;
      case 2:
        showingHowToPlay = true;
        break;
    }
  }

  function handleClick() {
    Game.Audio.init();
    Game.Audio.resume();

    if (state === STATE.MENU && !showingHowToPlay) {
      const item = Game.UI.getMenuClick();
      if (item >= 0) selectMenuItem(item);
    } else if (state === STATE.VEHICLE_SELECT) {
      const veh = Game.UI.getVehicleClick();
      if (veh >= 0 && vehiclePool[veh]) {
        selectedVehicle = veh;
        Game.Audio.play('click');
        if (map) {
          deployVehicle();
        } else {
          Game.UI.startElevatorDeploy(selectedVehicle, function () {
            startGame();
          });
        }
      }
    } else if (state === STATE.LOBBY) {
      const action = Game.UI.getLobbyAction();
      if (action === 'create') {
        Game.Network.createRoom('Game ' + Math.floor(Math.random() * 1000));
      } else if (action === 'refresh') {
        Game.Network.requestRooms();
      } else if (action && action.action === 'join') {
        const rooms = Game.Network.lobby.rooms;
        if (rooms[action.index]) {
          Game.Network.joinRoom(rooms[action.index].id);
        }
      }
    }
  }

  /* ---------- Vehicle Select ---------- */
  function updateVehicleSelect(dt) {
    const trySelect = (type) => {
      if (vehiclePool[type]) {
        selectedVehicle = type;
        Game.Audio.play('click');
      }
    };

    if (Game.Input.wasPressed('Digit1')) trySelect(VEH.JEEP);
    if (Game.Input.wasPressed('Digit2')) trySelect(VEH.TANK);
    if (Game.Input.wasPressed('Digit3')) trySelect(VEH.HELI);
    if (Game.Input.wasPressed('Digit4')) trySelect(VEH.ASV);

    if (Game.Input.wasPressed('ArrowLeft') || Game.Input.wasPressed('KeyA')) {
      for (let i = 1; i <= 4; i++) {
        const idx = (selectedVehicle - i + 4) % 4;
        if (vehiclePool[idx]) { selectedVehicle = idx; Game.Audio.play('click'); break; }
      }
    }
    if (Game.Input.wasPressed('ArrowRight') || Game.Input.wasPressed('KeyD')) {
      for (let i = 1; i <= 4; i++) {
        const idx = (selectedVehicle + i) % 4;
        if (vehiclePool[idx]) { selectedVehicle = idx; Game.Audio.play('click'); break; }
      }
    }

    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      if (vehiclePool[selectedVehicle]) {
        if (map) {
          deployVehicle();
        } else {
          Game.UI.startElevatorDeploy(selectedVehicle, function () {
            startGame();
          });
        }
      }
    }

    if (Game.Input.wasPressed('Escape')) {
      if (map) {
        state = STATE.PLAYING;
      } else {
        state = STATE.MENU;
      }
    }
  }

  /* ---------- Deploy Vehicle (mid-game) ---------- */
  function deployVehicle() {
    Game.Audio.play('click');
    Game.UI.startElevatorDeploy(selectedVehicle, function () {
      finishDeploy();
    });
  }

  function finishDeploy() {
    // Remove old player vehicle from allVehicles
    const idx = allVehicles.indexOf(playerVehicle);
    if (idx !== -1) {
      allVehicles.splice(idx, 1);
    }

    const spawn = map.getSpawn(1);
    playerVehicle = Game.createVehicle(selectedVehicle, 1, spawn.x + randFloat(-20, 20), spawn.y + randFloat(-20, 20));
    playerVehicle.isPlayer = true;
    allVehicles.push(playerVehicle);

    Game.Audio.playMusic(selectedVehicle);
    state = STATE.PLAYING;
  }

  /* ========== START GAME (round 1) ========== */
  function startGame() {
    Game.Audio.play('click');

    // Reset all round tracking
    currentRound = 1;
    roundsWon = { team1: 0, team2: 0 };
    allRoundStats = [];
    roundSeed = Date.now();

    startRound();
  }

  function startRound() {
    // Generate seed-based map for this round
    const seed = roundSeed + currentRound;
    map = new Game.GameMap();
    try {
      map.generate(seed, currentRound);
    } catch (e) {
      console.warn('Map gen failed, fallback', e);
      map.generate(); // fallback
    }

    // Reset per-round state
    Game.resetVehicleIds();
    Game.Projectiles.clear();
    Game.Particles.clear();
    allVehicles = [];
    aiControllers = [];
    score = { team1: 0, team2: 0 };
    gameTime = 0;
    winner = 0;
    roundWinner = 0;
    isRespawning = false;
    vehiclePool = [true, true, true, true];
    jeepLives = MAX_JEEP_LIVES;
    resetRoundStats();

    // Create player vehicle
    const spawn = map.getSpawn(1);
    playerVehicle = Game.createVehicle(selectedVehicle, 1, spawn.x, spawn.y);
    playerVehicle.isPlayer = true;
    allVehicles.push(playerVehicle);

    // Create AI (SP mode)
    if (gameMode === 'single') {
      // SP limit: max 2 AI vehicles total on each team
      const aiEnemyCount = Math.min(MAX_AI_VEHICLES, 2);
      const aiFriendlyCount = Math.min(MAX_AI_VEHICLES - 1, 1); // 1 friendly AI

      const aiTeamData = Game.spawnAITeam(map, 2, aiEnemyCount);
      aiTeamData.forEach(d => {
        allVehicles.push(d.vehicle);
        aiControllers.push(d.ai);
      });

      if (aiFriendlyCount > 0) {
        const friendlyAI = Game.spawnAITeam(map, 1, aiFriendlyCount);
        friendlyAI.forEach(d => {
          allVehicles.push(d.vehicle);
          aiControllers.push(d.ai);
        });
      }
    }

    // Reset flags
    const f1Pos = map.getFlagPos(1);
    const f2Pos = map.getFlagPos(2);
    flags = {
      1: { x: f1Pos.x, y: f1Pos.y, atBase: true, carried: false, carrier: null, team: 1 },
      2: { x: f2Pos.x, y: f2Pos.y, atBase: true, carried: false, carrier: null, team: 2 }
    };

    turrets = map.turrets;

    Game.Audio.playMusic(selectedVehicle);
    Game.UI.notify('ROUND ' + currentRound + (currentRound >= 10 ? ' \u2014 EPIC!' : ''), '#ff6600', 3);
    state = STATE.PLAYING;
  }

  /* ========== STATS HELPERS ========== */
  function resetRoundStats() {
    roundStats = {
      player: { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
      team1:  { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
      team2:  { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 }
    };
  }

  function recordKill(killerTeam, isPlayer) {
    if (killerTeam === 1) roundStats.team1.kills++;
    else roundStats.team2.kills++;
    if (isPlayer) roundStats.player.kills++;
  }

  function recordDeath(victimTeam, isPlayer) {
    if (victimTeam === 1) roundStats.team1.deaths++;
    else roundStats.team2.deaths++;
    if (isPlayer) roundStats.player.deaths++;
  }

  function recordFlag(team, isPlayer) {
    if (team === 1) roundStats.team1.flags++;
    else roundStats.team2.flags++;
    if (isPlayer) roundStats.player.flags++;
  }

  function recordTurretKill(killerTeam, isPlayer) {
    if (killerTeam === 1) roundStats.team1.turretsKilled++;
    else roundStats.team2.turretsKilled++;
    if (isPlayer) roundStats.player.turretsKilled++;
  }

  /* ========== END ROUND -> STATS ========== */
  function endRound(winTeam) {
    roundWinner = winTeam;
    if (winTeam === 1) roundsWon.team1++;
    else roundsWon.team2++;

    allRoundStats.push({
      round: currentRound,
      winner: winTeam,
      team1: { ...roundStats.team1 },
      team2: { ...roundStats.team2 },
      player: { ...roundStats.player },
      time: gameTime,
      score: { team1: score.team1, team2: score.team2 }
    });

    Game.Audio.stopMusic();
    Game.Audio.play('score');
    statsTimer = STATS_DURATION;
    state = STATE.ROUND_STATS;
  }

  function updateRoundStats(dt) {
    statsTimer -= dt;
    if (statsTimer <= 0 || Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      // Check if game is over
      const gameOver = currentRound >= MAX_ROUNDS ||
                       roundsWon.team1 > MAX_ROUNDS / 2 ||
                       roundsWon.team2 > MAX_ROUNDS / 2;
      if (gameOver) {
        winner = roundsWon.team1 >= roundsWon.team2 ? 1 : 2;
        state = STATE.FINAL_STATS;
      } else {
        // Next round
        currentRound++;
        // Pre-select first available vehicle
        for (let i = 0; i < 4; i++) {
          selectedVehicle = i;
          break;
        }
        startRound();
      }
    }
  }

  function updateFinalStats(dt) {
    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      map = null;
      state = STATE.VEHICLE_SELECT;
      vehiclePool = [true, true, true, true];
      jeepLives = MAX_JEEP_LIVES;
    }
    if (Game.Input.wasPressed('Escape')) {
      map = null;
      state = STATE.MENU;
    }
  }

  /* ---------- Playing ---------- */
  function updatePlaying(dt) {
    if (!map) return;
    gameTime += dt;

    // Pause
    if (Game.Input.wasPressed('Escape')) {
      state = STATE.MENU;
      Game.Audio.stopMusic();
      return;
    }

    // Toggle music
    if (Game.Input.wasPressed('KeyM')) {
      const on = Game.Audio.toggleMusic();
      Game.UI.notify(on ? 'Music ON' : 'Music OFF', '#aaa', 1.5);
      if (on && playerVehicle) Game.Audio.playMusic(playerVehicle.type);
    }

    // Handle respawn -> goes to vehicle select quickly
    if (isRespawning) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        isRespawning = false;

        // Mark destroyed vehicle type as unavailable
        if (playerVehicle.type === VEH.JEEP) {
          jeepLives--;
          if (jeepLives <= 0) {
            vehiclePool[VEH.JEEP] = false;
            Game.UI.notify('Jeep out of lives!', '#ff4444', 2);
          } else {
            Game.UI.notify('Jeep lives remaining: ' + jeepLives, '#ffaa00', 2);
          }
        } else {
          vehiclePool[playerVehicle.type] = false;
        }

        // Check if all vehicles destroyed
        var anyAvailable = vehiclePool.some(function (v) { return v; });
        if (!anyAvailable) {
          // All vehicles destroyed - point to opponent, reset pool
          score.team2++;
          recordFlag(2, false);
          vehiclePool = [true, true, true, true];
          jeepLives = MAX_JEEP_LIVES;
          Game.UI.notify('All vehicles lost! Enemy scores!', '#ff4444', 3);
          Game.Audio.play('score');

          // Check round win
          if (score.team2 >= WIN_SCORE) {
            endRound(2);
            return;
          }
        }

        // Go to vehicle select
        state = STATE.VEHICLE_SELECT;
        for (var vi = 0; vi < 4; vi++) {
          if (vehiclePool[vi]) { selectedVehicle = vi; break; }
        }
      }
    }

    // Player input
    if (playerVehicle && playerVehicle.alive) {
      var move = Game.Input.getMovement();
      playerVehicle.move(move.dx, move.dy, dt, map);

      // BushMaster (Tank) turret auto-aim at nearest enemy
      if (playerVehicle.type === VEH.TANK) {
        var nearestEnemy = null;
        var nearestDist = 400;
        for (var v = 0; v < allVehicles.length; v++) {
          var veh = allVehicles[v];
          if (!veh.alive || veh.team === playerVehicle.team) continue;
          var d = dist(playerVehicle.x, playerVehicle.y, veh.x, veh.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestEnemy = veh;
          }
        }
        if (nearestEnemy) {
          playerVehicle.aimTurret(nearestEnemy.x, nearestEnemy.y, dt);
        } else {
          var mousePos = Game.Input.getMousePos();
          playerVehicle.aimTurret(mousePos.x + camX, mousePos.y + camY, dt);
        }
      }

      // Shooting
      if (Game.Input.isShooting()) {
        playerVehicle.shoot();
      }

      // Mine laying (ASV)
      if (Game.Input.wasPressed('KeyE') && playerVehicle.type === VEH.ASV) {
        playerVehicle.layMine();
      }

      // Return to base (R key)
      var basePosR = map.getBasePos(playerVehicle.team);
      var distToBase = dist(playerVehicle.x, playerVehicle.y, basePosR.x, basePosR.y);
      playerVehicle._atOwnBase = distToBase < 60;

      if (Game.Input.wasPressed('KeyR') && playerVehicle._atOwnBase) {
        Game.Audio.play('click');
        Game.UI.notify('Returning to base...', '#aaa', 1.5);
        state = STATE.VEHICLE_SELECT;
        var spliceIdx = allVehicles.indexOf(playerVehicle);
        if (spliceIdx !== -1) allVehicles.splice(spliceIdx, 1);
      }

      playerVehicle.update(dt, map);

      // Fuel warning beep
      if (playerVehicle.alive && playerVehicle.fuel < playerVehicle.maxFuel * 0.2 && playerVehicle.fuel > 0) {
        fuelWarnTimer -= dt;
        if (fuelWarnTimer <= 0) {
          Game.Audio.play('fuelwarn');
          fuelWarnTimer = 2.0;
        }
      } else {
        fuelWarnTimer = 0;
      }

      // Check player death -> immediate garage return
      if (!playerVehicle.alive && !isRespawning) {
        isRespawning = true;
        respawnTimer = RESPAWN_TIME;
        recordDeath(playerVehicle.team, true);
        Game.Audio.stopMusic();
        Game.UI.notify('Vehicle destroyed!', '#ff4444', 2);
      }
    }

    // Update AI (with SP vehicle limits)
    for (var ai_i = 0; ai_i < aiControllers.length; ai_i++) {
      var aiCtrl = aiControllers[ai_i];
      var aiVeh = aiCtrl.vehicle;

      if (!aiVeh.alive) {
        if (typeof aiVeh.deathTimer === 'undefined') aiVeh.deathTimer = 0;
        aiVeh.deathTimer += dt;
        // AI auto-respawn after timer, but respect vehicle limits
        if (aiVeh.deathTimer > RESPAWN_TIME + 2) {
          if (gameMode === 'single') {
            // Count alive AI on same team
            var aliveCount = 0;
            for (var ac = 0; ac < allVehicles.length; ac++) {
              if (allVehicles[ac].alive && allVehicles[ac].isAI && allVehicles[ac].team === aiVeh.team) {
                aliveCount++;
              }
            }
            if (aliveCount < MAX_AI_VEHICLES) {
              var aiSpawn = map.getSpawn(aiVeh.team);
              aiVeh.respawn(aiSpawn.x + randFloat(-30, 30), aiSpawn.y + randFloat(-30, 30));
              aiVeh.deathTimer = 0;
            }
          } else {
            var aiSpawnMP = map.getSpawn(aiVeh.team);
            aiVeh.respawn(aiSpawnMP.x + randFloat(-30, 30), aiSpawnMP.y + randFloat(-30, 30));
            aiVeh.deathTimer = 0;
          }
        }
        continue;
      }

      aiVeh.update(dt, map);
      aiCtrl.update(dt, allVehicles, flags, { score: score });
    }

    // Update projectiles
    Game.Projectiles.update(dt, map, allVehicles, onVehicleHit);

    // Update particles
    Game.Particles.update(dt);

    // Update turrets
    updateTurrets(dt);

    // Turret damage from projectiles
    updateTurretDamage();

    // Flag logic
    updateFlags(dt);

    // Check round win condition (first to WIN_SCORE flags)
    if (score.team1 >= WIN_SCORE) {
      endRound(1);
      return;
    } else if (score.team2 >= WIN_SCORE) {
      endRound(2);
      return;
    }

    // Camera
    updateCamera(dt);

    // Screen shake decay
    if (shakeAmount > 0) {
      shakeX = (Math.random() - 0.5) * shakeAmount * 2;
      shakeY = (Math.random() - 0.5) * shakeAmount * 2;
      shakeAmount *= 0.9;
      if (shakeAmount < 0.5) {
        shakeAmount = 0;
        shakeX = 0;
        shakeY = 0;
      }
    }

    // Network sync
    if (gameMode === 'multi' && Game.Network.connected) {
      netSyncTimer += dt;
      if (netSyncTimer >= 0.05) {
        netSyncTimer = 0;
        if (playerVehicle) {
          Game.Network.sendState(playerVehicle.serialize());
        }
      }
    }
  }

  function onVehicleHit(vehicle, projectile) {
    if (!vehicle.alive) {
      // Vehicle just died - record stats
      var killer = null;
      for (var vi = 0; vi < allVehicles.length; vi++) {
        if (allVehicles[vi].id === projectile.owner) { killer = allVehicles[vi]; break; }
      }
      if (killer) {
        recordKill(killer.team, killer.isPlayer);
        recordDeath(vehicle.team, vehicle.isPlayer);
      }
      if (killer && killer.isPlayer) {
        Game.UI.notify('Enemy destroyed!', '#ff6600', 2);
      }
      if (vehicle.isPlayer) {
        Game.UI.notify('You were destroyed!', '#ff4444', 2);
      }
    }
  }

  /* ---------- Turrets ---------- */
  function updateTurrets(dt) {
    for (var i = 0; i < turrets.length; i++) {
      var t = turrets[i];
      if (!t.alive) continue;

      t.cooldown -= dt;

      var nearestEnemy = null;
      var nearestDist = 300;
      var tWorldX = t.x * TILE + TILE / 2;
      var tWorldY = t.y * TILE + TILE / 2;

      for (var v = 0; v < allVehicles.length; v++) {
        var veh = allVehicles[v];
        if (!veh.alive) continue;
        if (t.team !== 0 && veh.team === t.team) continue;
        var d = dist(tWorldX, tWorldY, veh.x, veh.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = veh;
        }
      }

      if (nearestEnemy) {
        var targetAngle = angleTo(tWorldX, tWorldY, nearestEnemy.x, nearestEnemy.y);
        t.angle = targetAngle;

        if (t.cooldown <= 0) {
          var muzzleX = tWorldX + Math.cos(t.angle) * 14;
          var muzzleY = tWorldY + Math.sin(t.angle) * 14;
          Game.Projectiles.fire(muzzleX, muzzleY, t.angle, 'BULLET', -100 - i, t.team);
          t.cooldown = 0.5;
        }
      }
    }
  }

  /* ---------- Turret Damage ---------- */
  function updateTurretDamage() {
    var projs = Game.Projectiles.getProjectiles();
    for (var i = projs.length - 1; i >= 0; i--) {
      var p = projs[i];
      for (var j = 0; j < turrets.length; j++) {
        var t = turrets[j];
        if (!t.alive) continue;
        if (p.team === t.team && t.team !== 0) continue;
        var tWorldX = t.x * TILE + TILE / 2;
        var tWorldY = t.y * TILE + TILE / 2;
        if (dist(p.x, p.y, tWorldX, tWorldY) < 16) {
          t.hp -= p.explosive ? 30 : p.damage;
          Game.Particles.sparks(p.x, p.y, 4);
          if (t.hp <= 0) {
            t.alive = false;
            t.hp = 0;
            Game.Particles.explosion(tWorldX, tWorldY, 1.5, 15);
            if (Game.Audio) Game.Audio.play('explosion');
            // Record turret kill stat
            var killer = null;
            for (var vi = 0; vi < allVehicles.length; vi++) {
              if (allVehicles[vi].id === p.owner) { killer = allVehicles[vi]; break; }
            }
            if (killer) {
              recordTurretKill(killer.team, killer.isPlayer);
            }
            Game.UI.notify('Turret destroyed!', '#ff6600', 2);
          }
          projs.splice(i, 1);
          break;
        }
      }
    }
  }

  /* ---------- Flags ---------- */
  function updateFlags(dt) {
    for (var team = 1; team <= 2; team++) {
      var f = flags[team];
      var enemyTeam = team === 1 ? 2 : 1;

      if (f.carried && f.carrier) {
        f.x = f.carrier.x;
        f.y = f.carrier.y;

        if (!f.carrier.alive) {
          f.carried = false;
          f.carrier.hasFlag = false;
          f.carrier.flagTeam = 0;
          f.carrier = null;
          Game.UI.notify((team === 1 ? 'Blue' : 'Red') + ' flag dropped!', team === 1 ? '#3388ff' : '#ff4444', 2);
          if (Game.Audio) Game.Audio.play('pickup');

          // Return flag to base after 10s if not picked up
          (function(flag, flagTeam) {
            setTimeout(function () {
              if (!flag.carried) {
                var basePos = map.getFlagPos(flagTeam);
                flag.x = basePos.x;
                flag.y = basePos.y;
                flag.atBase = true;
                Game.UI.notify((flagTeam === 1 ? 'Blue' : 'Red') + ' flag returned!', '#aaa', 2);
              }
            }, 10000);
          })(f, team);
        }

        if (f.carrier) {
          var basePos = map.getBasePos(f.carrier.team);
          if (dist(f.carrier.x, f.carrier.y, basePos.x, basePos.y) < 50) {
            var ownFlag = flags[f.carrier.team];
            if (ownFlag.atBase) {
              // SCORE!
              if (f.carrier.team === 1) score.team1++;
              else score.team2++;

              recordFlag(f.carrier.team, f.carrier.isPlayer);

              Game.Audio.play('score');
              Game.UI.notify(
                (f.carrier.team === 1 ? 'Blue' : 'Red') + ' team SCORES!',
                f.carrier.team === 1 ? '#3388ff' : '#ff4444', 3
              );

              f.carrier.hasFlag = false;
              f.carrier.flagTeam = 0;
              f.carrier = null;
              f.carried = false;
              var flagHome = map.getFlagPos(team);
              f.x = flagHome.x;
              f.y = flagHome.y;
              f.atBase = true;
            }
          }
        }
      } else {
        for (var v = 0; v < allVehicles.length; v++) {
          var veh = allVehicles[v];
          if (!veh.alive) continue;
          if (veh.team === team) {
            // Own team can return their dropped flag
            if (!f.atBase && dist(veh.x, veh.y, f.x, f.y) < 30) {
              var returnBase = map.getFlagPos(team);
              f.x = returnBase.x;
              f.y = returnBase.y;
              f.atBase = true;
              Game.UI.notify((team === 1 ? 'Blue' : 'Red') + ' flag returned!', '#aaa', 2);
              if (Game.Audio) Game.Audio.play('pickup');
            }
          } else {
            // Enemy team can pick up flag
            if (veh.canCarryFlag && !veh.hasFlag && dist(veh.x, veh.y, f.x, f.y) < 30) {
              f.carried = true;
              f.carrier = veh;
              f.atBase = false;
              veh.hasFlag = true;
              veh.flagTeam = team;
              Game.UI.notify(
                (veh.team === 1 ? 'Blue' : 'Red') + ' stole the ' + (team === 1 ? 'blue' : 'red') + ' flag!',
                veh.team === 1 ? '#66aaff' : '#ff7777', 3
              );
              if (Game.Audio) Game.Audio.play('pickup');
            }
          }
        }
      }
    }
  }

  /* ---------- Camera ---------- */
  function updateCamera(dt) {
    if (!playerVehicle) return;

    var targetX = playerVehicle.x - screenW / 2;
    var targetY = playerVehicle.y - screenH / 2;

    targetX = clamp(targetX, 0, map.worldW - screenW);
    targetY = clamp(targetY, 0, map.worldH - screenH);

    camX += (targetX - camX) * 8 * dt;
    camY += (targetY - camY) * 8 * dt;

    camX += shakeX;
    camY += shakeY;
  }

  /* ---------- Game Over (legacy - redirects to FINAL_STATS) ---------- */
  function updateGameOver(dt) {
    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      map = null;
      vehiclePool = [true, true, true, true];
      jeepLives = MAX_JEEP_LIVES;
      state = STATE.VEHICLE_SELECT;
    }
    if (Game.Input.wasPressed('Escape')) {
      map = null;
      state = STATE.MENU;
    }
  }

  /* ---------- Lobby ---------- */
  function startMultiplayer() {
    state = STATE.LOBBY;
    Game.UI.lobbyStatus = 'Connecting...';

    Game.Network.connect().then(function (id) {
      Game.UI.lobbyStatus = 'Connected! ID: ' + id.substring(0, 8);
      Game.Network.requestRooms();
    }).catch(function (err) {
      Game.UI.lobbyStatus = 'Cannot connect: ' + err.message +
        ' (Start server with: node server.js)';
    });

    Game.Network.on('onRoomList', function (rooms) {
      Game.UI.lobbyRooms = rooms;
    });
    Game.Network.on('onRoomJoined', function (data) {
      Game.UI.lobbyStatus = 'Joined room: ' + data.roomId + ' as Team ' + data.team;
      Game.UI.notify('Joined room!', '#0f0', 2);
      state = STATE.VEHICLE_SELECT;
    });
    Game.Network.on('onGameStart', function (data) {
      startMultiplayerGame(data);
    });
    Game.Network.on('onGameState', function (data) {
      handleNetworkState(data);
    });
    Game.Network.on('onTileDestroyed', function (data) {
      if (map) map.destroyTile(data.tx, data.ty);
    });
    Game.Network.on('onDisconnect', function () {
      Game.UI.lobbyStatus = 'Disconnected from server';
      Game.UI.notify('Disconnected!', '#f00', 3);
    });
  }

  function updateLobby(dt) {
    if (Game.Input.wasPressed('Escape')) {
      Game.Network.disconnect();
      state = STATE.MENU;
    }
  }

  function startMultiplayerGame(data) {
    map = new Game.GameMap();
    if (data.map) {
      map.loadFromData(data.map);
    } else if (data.mapSeed !== undefined) {
      map.generate(data.mapSeed, 1);
    } else {
      map.generate();
    }

    Game.resetVehicleIds();
    Game.Projectiles.clear();
    Game.Particles.clear();
    allVehicles = [];
    aiControllers = [];
    score = { team1: 0, team2: 0 };
    gameTime = 0;
    winner = 0;

    var team = Game.Network.playerTeam;
    var spawn = map.getSpawn(team);
    playerVehicle = Game.createVehicle(selectedVehicle, team, spawn.x, spawn.y);
    playerVehicle.isPlayer = true;
    playerVehicle.networkId = Game.Network.playerId;
    allVehicles.push(playerVehicle);

    Game.Audio.playMusic(selectedVehicle);
    state = STATE.PLAYING;
  }

  function handleNetworkState(data) {
    if (data.playerId === Game.Network.playerId) return;

    var remote = null;
    for (var ri = 0; ri < allVehicles.length; ri++) {
      if (allVehicles[ri].networkId === data.playerId) { remote = allVehicles[ri]; break; }
    }
    if (!remote && data.alive !== false) {
      remote = Game.createVehicle(
        data.type || VEH.TANK,
        data.team || 2,
        data.x, data.y
      );
      remote.networkId = data.playerId;
      allVehicles.push(remote);
    }
    if (remote) {
      remote.applyNetworkState(data);
    }
  }

  /* ========== RENDER ========== */
  function render() {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, screenW, screenH);

    switch (state) {
      case STATE.MENU:
        if (showingHowToPlay) {
          Game.UI.renderHowToPlay();
        } else {
          Game.UI.renderMenu();
        }
        break;

      case STATE.VEHICLE_SELECT:
        Game.UI.renderVehicleSelect(selectedVehicle, vehiclePool, jeepLives);
        break;

      case STATE.PLAYING:
        renderGame();
        break;

      case STATE.GAME_OVER:
        renderGame();
        Game.UI.renderGameOver(winner, score);
        break;

      case STATE.ROUND_STATS:
        renderGame();
        Game.UI.renderRoundStats(roundWinner, score, roundStats, currentRound, roundsWon, statsTimer);
        break;

      case STATE.FINAL_STATS:
        Game.UI.renderFinalStats(winner, roundsWon, allRoundStats, MAX_ROUNDS);
        break;

      case STATE.LOBBY:
        Game.UI.renderLobby(Game.Network.lobby.rooms, Game.UI.lobbyStatus);
        break;
    }
  }

  function renderGame() {
    if (!map) return;

    ctx.save();

    // Map
    map.render(ctx, camX, camY, screenW, screenH);

    // Flags
    for (var team = 1; team <= 2; team++) {
      var f = flags[team];
      if (!f.carried) {
        var sprite = Game.Sprites.sprites['flag_' + team];
        if (sprite) {
          var sx = f.x - camX - 10;
          var sy = f.y - camY - 20;
          ctx.fillStyle = team === 1 ? 'rgba(51,136,255,0.3)' : 'rgba(255,68,68,0.3)';
          var pulse = 8 + Math.sin(Date.now() * 0.004) * 4;
          ctx.beginPath();
          ctx.arc(f.x - camX, f.y - camY, pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(sprite, sx, sy);
        }
      }
    }

    // Turrets
    for (var i = 0; i < turrets.length; i++) {
      var t = turrets[i];
      var tx = t.x * TILE + TILE / 2 - camX;
      var ty = t.y * TILE + TILE / 2 - camY;

      if (!t.alive) {
        ctx.fillStyle = 'rgba(80,80,80,0.5)';
        ctx.beginPath();
        ctx.arc(tx, ty, 8, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(t.angle);
      ctx.fillStyle = '#888';
      ctx.fillRect(0, -2, 16, 4);
      ctx.restore();

      if (t.hp < 60) {
        var barW = 20, barH = 3;
        var bx = tx - barW / 2, by = ty - 14;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        var hpRatio = t.hp / 60;
        ctx.fillStyle = hpRatio > 0.5 ? '#0f0' : hpRatio > 0.25 ? '#ff0' : '#f00';
        ctx.fillRect(bx, by, barW * hpRatio, barH);
      }

      ctx.fillStyle = t.team === 1 ? 'rgba(51,136,255,0.6)' : t.team === 2 ? 'rgba(255,68,68,0.6)' : 'rgba(128,128,128,0.6)';
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mine detection by UrbanStrike
    if (playerVehicle && playerVehicle.type === VEH.HELI && playerVehicle.alive) {
      var mines = Game.Projectiles.getMines();
      for (var mi = 0; mi < mines.length; mi++) {
        var m = mines[mi];
        if (!m.alive) continue;
        ctx.strokeStyle = 'rgba(255,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    Game.Projectiles.render(ctx, camX, camY);

    // Render ground vehicles then air vehicles (layering)
    var groundVehicles = [];
    var airVehicles = [];
    for (var vi = 0; vi < allVehicles.length; vi++) {
      if (allVehicles[vi].type === VEH.HELI) airVehicles.push(allVehicles[vi]);
      else groundVehicles.push(allVehicles[vi]);
    }
    for (var gi = 0; gi < groundVehicles.length; gi++) groundVehicles[gi].render(ctx, camX, camY);
    for (var ai = 0; ai < airVehicles.length; ai++) airVehicles[ai].render(ctx, camX, camY);

    Game.Particles.render(ctx, camX, camY);

    ctx.restore();

    // HUD (with round indicator)
    Game.UI.renderHUD(playerVehicle, score, flags, gameTime, jeepLives, currentRound, roundsWon);

    // Minimap
    var mmW = 180, mmH = 120;
    var mmX = screenW - mmW - 10, mmY = screenH - mmH - 10;
    var entityList = [];
    for (var el = 0; el < allVehicles.length; el++) {
      if (allVehicles[el].alive) entityList.push(allVehicles[el]);
    }
    var flagList = [
      { x: flags[1].x, y: flags[1].y, team: 1 },
      { x: flags[2].x, y: flags[2].y, team: 2 }
    ];
    map.renderMinimap(ctx, mmX, mmY, mmW, mmH, entityList, flagList);

    if (playerVehicle && playerVehicle.alive) {
      var scaleX = mmW / map.width;
      var scaleY = mmH / map.height;
      var px = mmX + (playerVehicle.x / TILE) * scaleX;
      var py = mmY + (playerVehicle.y / TILE) * scaleY;
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    if (isRespawning) {
      Game.UI.renderRespawn(respawnTimer);
    }

    Game.UI.renderTouchControls();
    Game.UI.renderNotifications();
  }

  /* ========== START ========== */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Game.getState = function () {
    return { state: state, score: score, flags: flags, gameTime: gameTime, currentRound: currentRound, roundsWon: roundsWon };
  };
})();
