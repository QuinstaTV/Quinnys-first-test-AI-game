/* ============================================================
   game.js - Main game orchestrator
   Game loop, state management, flag logic, camera, turrets,
   singleplayer and multiplayer mode handling
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

  // Score
  let score = { team1: 0, team2: 0 };
  const WIN_SCORE = 3;
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
  const RESPAWN_TIME = 3;
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
    // Responsive: fit window but maintain minimum
    screenW = Math.max(800, window.innerWidth);
    screenH = Math.max(500, window.innerHeight);
    canvas.width = screenW;
    canvas.height = screenH;
    Game.UI.resize(screenW, screenH);
  }

  /* ========== GAME LOOP ========== */
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50ms
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

    // Keyboard navigation
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
      case 0: // Single player
        gameMode = 'single';
        state = STATE.VEHICLE_SELECT;
        break;
      case 1: // Multiplayer
        gameMode = 'multi';
        startMultiplayer();
        break;
      case 2: // How to play
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
    // Only allow selecting available vehicles
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
      // Skip to next available vehicle going left
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
          // First game start — show elevator then start
          Game.UI.startElevatorDeploy(selectedVehicle, function () {
            startGame();
          });
        }
      }
    }

    if (Game.Input.wasPressed('Escape')) {
      if (map) {
        // If game is in progress, go back to playing (cancel swap)
        state = STATE.PLAYING;
      } else {
        state = STATE.MENU;
      }
    }
  }

  /* ---------- Deploy Vehicle (mid-game) ---------- */
  function deployVehicle() {
    Game.Audio.play('click');

    // Trigger elevator animation, then actually spawn
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

    // Create new player vehicle at spawn
    const spawn = map.getSpawn(1);
    playerVehicle = Game.createVehicle(selectedVehicle, 1, spawn.x + randFloat(-20, 20), spawn.y + randFloat(-20, 20));
    playerVehicle.isPlayer = true;
    allVehicles.push(playerVehicle);

    Game.Audio.playMusic(selectedVehicle);
    state = STATE.PLAYING;
  }

  /* ---------- Start Game ---------- */
  function startGame() {
    Game.Audio.play('click');

    // Create map
    map = new Game.GameMap();
    map.generate();

    // Reset
    Game.resetVehicleIds();
    Game.Projectiles.clear();
    Game.Particles.clear();
    allVehicles = [];
    aiControllers = [];
    score = { team1: 0, team2: 0 };
    gameTime = 0;
    winner = 0;
    isRespawning = false;
    vehiclePool = [true, true, true, true]; // reset vehicle availability
    jeepLives = MAX_JEEP_LIVES; // reset jeep lives

    // Create player vehicle
    const spawn = map.getSpawn(1);
    playerVehicle = Game.createVehicle(selectedVehicle, 1, spawn.x, spawn.y);
    playerVehicle.isPlayer = true;
    allVehicles.push(playerVehicle);

    // Create AI team (enemy)
    if (gameMode === 'single') {
      const aiTeamData = Game.spawnAITeam(map, 2, 4);
      aiTeamData.forEach(d => {
        allVehicles.push(d.vehicle);
        aiControllers.push(d.ai);
      });

      // Also create friendly AI
      const friendlyAI = Game.spawnAITeam(map, 1, 3);
      friendlyAI.forEach(d => {
        allVehicles.push(d.vehicle);
        aiControllers.push(d.ai);
      });
    }

    // Reset flags
    const f1Pos = map.getFlagPos(1);
    const f2Pos = map.getFlagPos(2);
    flags = {
      1: { x: f1Pos.x, y: f1Pos.y, atBase: true, carried: false, carrier: null, team: 1 },
      2: { x: f2Pos.x, y: f2Pos.y, atBase: true, carried: false, carrier: null, team: 2 }
    };

    // Turrets
    turrets = map.turrets;

    // Play music for selected vehicle
    Game.Audio.playMusic(selectedVehicle);

    state = STATE.PLAYING;
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

    // Handle respawn → now goes to vehicle select
    if (isRespawning) {
      respawnTimer -= dt;
      if (respawnTimer <= 0) {
        isRespawning = false;
        // Mark destroyed vehicle type as unavailable
        // Jeep has multiple lives
        if (playerVehicle.type === VEH.JEEP) {
          jeepLives--;
          if (jeepLives <= 0) {
            vehiclePool[VEH.JEEP] = false;
            Game.UI.notify('Jeep out of lives!', '#ff4444', 2);
          } else {
            Game.UI.notify(`Jeep lives remaining: ${jeepLives}`, '#ffaa00', 2);
          }
        } else {
          vehiclePool[playerVehicle.type] = false;
        }

        // Check if all vehicles destroyed
        const anyAvailable = vehiclePool.some(v => v);
        if (!anyAvailable) {
          // All vehicles destroyed - point to opponent, reset pool
          score.team2++;
          vehiclePool = [true, true, true, true];
          jeepLives = MAX_JEEP_LIVES;
          Game.UI.notify('All vehicles lost! Enemy scores!', '#ff4444', 3);
          Game.Audio.play('score');

          // Check win
          if (score.team2 >= WIN_SCORE) {
            winner = 2;
            state = STATE.GAME_OVER;
            Game.Audio.stopMusic();
            return;
          }
        }

        // Go to vehicle select with available vehicles
        state = STATE.VEHICLE_SELECT;
        // Pre-select first available vehicle
        for (let i = 0; i < 4; i++) {
          if (vehiclePool[i]) { selectedVehicle = i; break; }
        }
      }
      // Still update world while respawning
    }

    // Player input
    if (playerVehicle && playerVehicle.alive) {
      const move = Game.Input.getMovement();
      playerVehicle.move(move.dx, move.dy, dt, map);

      // BushMaster (Tank) turret auto-aim at nearest enemy
      if (playerVehicle.type === VEH.TANK) {
        let nearestEnemy = null;
        let nearestDist = 400; // auto-aim range
        for (let v = 0; v < allVehicles.length; v++) {
          const veh = allVehicles[v];
          if (!veh.alive || veh.team === playerVehicle.team) continue;
          const d = dist(playerVehicle.x, playerVehicle.y, veh.x, veh.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearestEnemy = veh;
          }
        }
        if (nearestEnemy) {
          playerVehicle.aimTurret(nearestEnemy.x, nearestEnemy.y, dt);
        } else {
          // No enemy in range: turret follows mouse
          const mousePos = Game.Input.getMousePos();
          const worldMX = mousePos.x + camX;
          const worldMY = mousePos.y + camY;
          playerVehicle.aimTurret(worldMX, worldMY, dt);
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

      // Return to base (R key) — swap vehicle without losing it
      const basePosR = map.getBasePos(playerVehicle.team);
      const distToBase = dist(playerVehicle.x, playerVehicle.y, basePosR.x, basePosR.y);
      playerVehicle._atOwnBase = distToBase < 60;

      if (Game.Input.wasPressed('KeyR') && playerVehicle._atOwnBase) {
        // Return current vehicle to pool (not destroyed)
        Game.Audio.play('click');
        Game.UI.notify('Returning to base...', '#aaa', 1.5);
        // Vehicle stays available in pool
        state = STATE.VEHICLE_SELECT;
        // Remove old vehicle
        const idx = allVehicles.indexOf(playerVehicle);
        if (idx !== -1) allVehicles.splice(idx, 1);
      }

      playerVehicle.update(dt, map);

      // Fuel warning beep
      if (playerVehicle.alive && playerVehicle.fuel < playerVehicle.maxFuel * 0.2 && playerVehicle.fuel > 0) {
        fuelWarnTimer -= dt;
        if (fuelWarnTimer <= 0) {
          Game.Audio.play('fuelwarn');
          fuelWarnTimer = 2.0; // beep every 2 seconds
        }
      } else {
        fuelWarnTimer = 0;
      }

      // Check player death
      if (!playerVehicle.alive && !isRespawning) {
        isRespawning = true;
        respawnTimer = RESPAWN_TIME;
        Game.Audio.stopMusic();
        Game.UI.notify('Vehicle destroyed!', '#ff4444', 2);
      }
    }

    // Update AI
    for (let i = 0; i < aiControllers.length; i++) {
      const ai = aiControllers[i];
      const v = ai.vehicle;

      if (!v.alive) {
        v.deathTimer += dt;
        if (v.deathTimer > RESPAWN_TIME) {
          const spawn = map.getSpawn(v.team);
          v.respawn(spawn.x + randFloat(-30, 30), spawn.y + randFloat(-30, 30));
        }
        continue;
      }

      v.update(dt, map);
      ai.update(dt, allVehicles, flags, { score });
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

    // Check win condition
    if (score.team1 >= WIN_SCORE) {
      winner = 1;
      state = STATE.GAME_OVER;
      Game.Audio.stopMusic();
      Game.Audio.play('score');
    } else if (score.team2 >= WIN_SCORE) {
      winner = 2;
      state = STATE.GAME_OVER;
      Game.Audio.stopMusic();
      Game.Audio.play('score');
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
      if (netSyncTimer >= 0.05) { // 20 ticks/sec
        netSyncTimer = 0;
        if (playerVehicle) {
          Game.Network.sendState(playerVehicle.serialize());
        }
      }
    }
  }

  function onVehicleHit(vehicle, projectile) {
    if (!vehicle.alive) {
      // Vehicle just died
      const killer = allVehicles.find(v => v.id === projectile.owner);
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
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      if (!t.alive) continue;

      t.cooldown -= dt;

      // Find nearest enemy (skip friendlies)
      let nearestEnemy = null;
      let nearestDist = 300; // turret range
      const tWorldX = t.x * TILE + TILE / 2;
      const tWorldY = t.y * TILE + TILE / 2;

      for (let v = 0; v < allVehicles.length; v++) {
        const veh = allVehicles[v];
        if (!veh.alive) continue;
        // Skip friendly vehicles - turrets don't fire on own team
        if (t.team !== 0 && veh.team === t.team) continue;
        const d = dist(tWorldX, tWorldY, veh.x, veh.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = veh;
        }
      }

      if (nearestEnemy) {
        // Rotate turret towards enemy
        const targetAngle = angleTo(tWorldX, tWorldY, nearestEnemy.x, nearestEnemy.y);
        t.angle = targetAngle;

        // Shoot
        if (t.cooldown <= 0) {
          const muzzleX = tWorldX + Math.cos(t.angle) * 14;
          const muzzleY = tWorldY + Math.sin(t.angle) * 14;
          Game.Projectiles.fire(muzzleX, muzzleY, t.angle, 'BULLET', -100 - i, t.team);
          t.cooldown = 0.5;
        }
      }
    }
  }

  /* ---------- Turret Damage ---------- */
  function updateTurretDamage() {
    const projs = Game.Projectiles.getProjectiles();
    for (let i = projs.length - 1; i >= 0; i--) {
      const p = projs[i];
      for (let j = 0; j < turrets.length; j++) {
        const t = turrets[j];
        if (!t.alive) continue;
        // Skip friendly projectiles
        if (p.team === t.team && t.team !== 0) continue;
        const tWorldX = t.x * TILE + TILE / 2;
        const tWorldY = t.y * TILE + TILE / 2;
        if (dist(p.x, p.y, tWorldX, tWorldY) < 16) {
          t.hp -= p.explosive ? 30 : p.damage;
          Game.Particles.sparks(p.x, p.y, 4);
          if (t.hp <= 0) {
            t.alive = false;
            t.hp = 0;
            Game.Particles.explosion(tWorldX, tWorldY, 1.5, 15);
            if (Game.Audio) Game.Audio.play('explosion');
            Game.UI.notify('Turret destroyed!', '#ff6600', 2);
          }
          // Remove projectile
          projs.splice(i, 1);
          break;
        }
      }
    }
  }

  /* ---------- Flags ---------- */
  function updateFlags(dt) {
    for (let team = 1; team <= 2; team++) {
      const f = flags[team];
      const enemyTeam = team === 1 ? 2 : 1;

      if (f.carried && f.carrier) {
        // Move flag with carrier
        f.x = f.carrier.x;
        f.y = f.carrier.y;

        // Check if carrier died
        if (!f.carrier.alive) {
          f.carried = false;
          f.carrier.hasFlag = false;
          f.carrier.flagTeam = 0;
          f.carrier = null;
          Game.UI.notify(`${team === 1 ? 'Blue' : 'Red'} flag dropped!`, team === 1 ? '#3388ff' : '#ff4444', 2);
          if (Game.Audio) Game.Audio.play('pickup');

          // Flag returns to base after being dropped
          setTimeout(() => {
            if (!f.carried) {
              const basePos = map.getFlagPos(team);
              f.x = basePos.x;
              f.y = basePos.y;
              f.atBase = true;
              Game.UI.notify(`${team === 1 ? 'Blue' : 'Red'} flag returned!`, '#aaa', 2);
            }
          }, 10000);
        }

        // Check if carrier reached their own base (score!)
        if (f.carrier) {
          const basePos = map.getBasePos(f.carrier.team);
          if (dist(f.carrier.x, f.carrier.y, basePos.x, basePos.y) < 50) {
            // CHECK: carrier team's OWN flag must be at base to score
            const ownFlag = flags[f.carrier.team];
            if (ownFlag.atBase) {
              // SCORE!
              if (f.carrier.team === 1) score.team1++;
              else score.team2++;

              Game.Audio.play('score');
              Game.UI.notify(
                `${f.carrier.team === 1 ? 'Blue' : 'Red'} team SCORES!`,
                f.carrier.team === 1 ? '#3388ff' : '#ff4444', 3
              );

              // Reset flag
              f.carrier.hasFlag = false;
              f.carrier.flagTeam = 0;
              f.carrier = null;
              f.carried = false;
              const flagHome = map.getFlagPos(team);
              f.x = flagHome.x;
              f.y = flagHome.y;
              f.atBase = true;
            }
          }
        }
      } else {
        // Flag is on the ground - check for pickup
        for (let v = 0; v < allVehicles.length; v++) {
          const veh = allVehicles[v];
          if (!veh.alive) continue;
          if (veh.team === team) {
            // Own team touches flag = return to base
            if (!f.atBase && dist(veh.x, veh.y, f.x, f.y) < 30) {
              const basePos = map.getFlagPos(team);
              f.x = basePos.x;
              f.y = basePos.y;
              f.atBase = true;
              Game.UI.notify(`${team === 1 ? 'Blue' : 'Red'} flag returned!`, '#aaa', 2);
              if (Game.Audio) Game.Audio.play('pickup');
            }
          } else {
            // Enemy team touches flag = pickup (only jeep can carry!)
            if (veh.canCarryFlag && !veh.hasFlag && dist(veh.x, veh.y, f.x, f.y) < 30) {
              f.carried = true;
              f.carrier = veh;
              f.atBase = false;
              veh.hasFlag = true;
              veh.flagTeam = team;
              Game.UI.notify(
                `${veh.team === 1 ? 'Blue' : 'Red'} stole the ${team === 1 ? 'blue' : 'red'} flag!`,
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

    // Target: center player on screen
    let targetX = playerVehicle.x - screenW / 2;
    let targetY = playerVehicle.y - screenH / 2;

    // Clamp to map bounds
    targetX = clamp(targetX, 0, map.worldW - screenW);
    targetY = clamp(targetY, 0, map.worldH - screenH);

    // Smooth follow
    camX += (targetX - camX) * 8 * dt;
    camY += (targetY - camY) * 8 * dt;

    // Apply shake
    camX += shakeX;
    camY += shakeY;
  }

  /* ---------- Game Over ---------- */
  function updateGameOver(dt) {
    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      // Reset for new round with fresh map
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

    Game.Network.connect().then(id => {
      Game.UI.lobbyStatus = 'Connected! ID: ' + id.substring(0, 8);
      Game.Network.requestRooms();
    }).catch(err => {
      Game.UI.lobbyStatus = 'Cannot connect: ' + err.message +
        ' (Start server with: node server.js)';
    });

    // Network callbacks
    Game.Network.on('onRoomList', (rooms) => {
      Game.UI.lobbyRooms = rooms;
    });

    Game.Network.on('onRoomJoined', (data) => {
      Game.UI.lobbyStatus = `Joined room: ${data.roomId} as Team ${data.team}`;
      Game.UI.notify('Joined room!', '#0f0', 2);
      // Go to vehicle select
      state = STATE.VEHICLE_SELECT;
    });

    Game.Network.on('onGameStart', (data) => {
      // Start multiplayer game
      startMultiplayerGame(data);
    });

    Game.Network.on('onGameState', (data) => {
      handleNetworkState(data);
    });

    Game.Network.on('onTileDestroyed', (data) => {
      if (map) map.destroyTile(data.tx, data.ty);
    });

    Game.Network.on('onDisconnect', () => {
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
    // Similar to startGame but uses network data
    map = new Game.GameMap();
    if (data.map) {
      map.loadFromData(data.map);
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

    const team = Game.Network.playerTeam;
    const spawn = map.getSpawn(team);
    playerVehicle = Game.createVehicle(selectedVehicle, team, spawn.x, spawn.y);
    playerVehicle.isPlayer = true;
    playerVehicle.networkId = Game.Network.playerId;
    allVehicles.push(playerVehicle);

    Game.Audio.playMusic(selectedVehicle);
    state = STATE.PLAYING;
  }

  function handleNetworkState(data) {
    // Update or create remote player vehicles
    if (data.playerId === Game.Network.playerId) return;

    let remote = allVehicles.find(v => v.networkId === data.playerId);
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

    // Flags at base or dropped (not carried - carried ones drawn on vehicle)
    for (let team = 1; team <= 2; team++) {
      const f = flags[team];
      if (!f.carried) {
        const sprite = Game.Sprites.sprites[`flag_${team}`];
        if (sprite) {
          const sx = f.x - camX - 10;
          const sy = f.y - camY - 20;
          // Pulsing glow
          ctx.fillStyle = team === 1 ? 'rgba(51,136,255,0.3)' : 'rgba(255,68,68,0.3)';
          const pulse = 8 + Math.sin(Date.now() * 0.004) * 4;
          ctx.beginPath();
          ctx.arc(f.x - camX, f.y - camY, pulse, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(sprite, sx, sy);
        }
      }
    }

    // Turrets
    for (let i = 0; i < turrets.length; i++) {
      const t = turrets[i];
      const tx = t.x * TILE + TILE / 2 - camX;
      const ty = t.y * TILE + TILE / 2 - camY;

      if (!t.alive) {
        // Destroyed turret: rubble
        ctx.fillStyle = 'rgba(80,80,80,0.5)';
        ctx.beginPath();
        ctx.arc(tx, ty, 8, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      // Barrel
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(t.angle);
      ctx.fillStyle = '#888';
      ctx.fillRect(0, -2, 16, 4);
      ctx.restore();

      // HP bar (show when damaged)
      if (t.hp < 60) {
        const barW = 20;
        const barH = 3;
        const bx = tx - barW / 2;
        const by = ty - 14;
        ctx.fillStyle = '#333';
        ctx.fillRect(bx, by, barW, barH);
        const hpRatio = t.hp / 60;
        ctx.fillStyle = hpRatio > 0.5 ? '#0f0' : hpRatio > 0.25 ? '#ff0' : '#f00';
        ctx.fillRect(bx, by, barW * hpRatio, barH);
      }

      // Team indicator dot
      ctx.fillStyle = t.team === 1 ? 'rgba(51,136,255,0.6)' : t.team === 2 ? 'rgba(255,68,68,0.6)' : 'rgba(128,128,128,0.6)';
      ctx.beginPath();
      ctx.arc(tx, ty, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Mine layer markers (semi-transparent circles for mine detection by heli)
    if (playerVehicle && playerVehicle.type === VEH.HELI && playerVehicle.alive) {
      const mines = Game.Projectiles.getMines();
      for (let i = 0; i < mines.length; i++) {
        const m = mines[i];
        if (!m.alive) continue;
        ctx.strokeStyle = 'rgba(255,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m.x - camX, m.y - camY, 12, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    // Render projectiles (includes mines)
    Game.Projectiles.render(ctx, camX, camY);

    // Vehicles (ground first, then air)
    // Sort: ground vehicles first, then helicopters
    const groundVehicles = allVehicles.filter(v => v.type !== VEH.HELI);
    const airVehicles = allVehicles.filter(v => v.type === VEH.HELI);

    groundVehicles.forEach(v => v.render(ctx, camX, camY));
    airVehicles.forEach(v => v.render(ctx, camX, camY));

    // Particles (on top of everything)
    Game.Particles.render(ctx, camX, camY);

    ctx.restore();

    // HUD
    Game.UI.renderHUD(playerVehicle, score, flags, gameTime, jeepLives);

    // Minimap
    const mmW = 180, mmH = 120;
    const mmX = screenW - mmW - 10, mmY = screenH - mmH - 10;
    const entityList = allVehicles.filter(v => v.alive);
    const flagList = [
      { x: flags[1].x, y: flags[1].y, team: 1 },
      { x: flags[2].x, y: flags[2].y, team: 2 }
    ];
    map.renderMinimap(ctx, mmX, mmY, mmW, mmH, entityList, flagList);

    // Player position on minimap
    if (playerVehicle && playerVehicle.alive) {
      const scaleX = mmW / map.width;
      const scaleY = mmH / map.height;
      const px = mmX + (playerVehicle.x / TILE) * scaleX;
      const py = mmY + (playerVehicle.y / TILE) * scaleY;
      ctx.fillStyle = '#fff';
      ctx.fillRect(px - 2, py - 2, 4, 4);
    }

    // Respawn overlay
    if (isRespawning) {
      Game.UI.renderRespawn(respawnTimer);
    }

    // Touch controls
    Game.UI.renderTouchControls();

    // Notifications
    Game.UI.renderNotifications();
  }

  /* ========== START ========== */
  // Wait for DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Expose for network
  window.Game.getState = function () {
    return { state, score, flags, gameTime };
  };
})();
