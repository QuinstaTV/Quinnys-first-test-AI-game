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
  let currentDpr = 1;

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
  const RESPAWN_TIME = 3.0; // 3 second countdown before returning to vehicle select
  let respawnTimer = 0;
  let isRespawning = false;

  // Turret update
  let turrets = [];

  // Menu
  let showingHowToPlay = false;
  let menuSelection = 0;

  // Network state
  let remotePlayers = {};  // networkId -> { name, vehicleType }
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
    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resizeCanvas, 100);
    });
    window.addEventListener('orientationchange', function () {
      setTimeout(resizeCanvas, 200);
    });

    Game.Input.init(canvas);
    Game.Sprites.generate();
    Game.Audio.init();
    Game.UI.init(canvas);

    // Load saved username from localStorage
    try {
      var savedName = localStorage.getItem('dt_username');
      if (savedName) Game.UI.username = savedName;
    } catch (e) {}

    // Screen shake function
    Game.screenShake = function (amount) {
      shakeAmount = Math.max(shakeAmount, amount);
    };

    // Canvas click handler for menus
    canvas.addEventListener('click', handleClick);

    // Fullscreen button
    var fsBtn = document.getElementById('fullscreenBtn');
    if (fsBtn) {
      fsBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        Game.Input.toggleFullscreen();
      });
    }

    // Start loop
    requestAnimationFrame(gameLoop);
  }

  function resizeCanvas() {
    currentDpr = Math.min(window.devicePixelRatio || 1, 2);

    // Always use actual viewport dimensions
    screenW = window.innerWidth;
    screenH = window.innerHeight;

    // Desktop minimum: ensure menus remain usable on very small windows
    // but never exceed viewport (the v1.4.0 bug).
    // On desktop browsers (non-touch), use a logical minimum of 960x540
    // if the viewport is larger than that.  This prevents elements from
    // being clipped at extreme sizes.
    var isDesktop = !Game.Input || !Game.Input.isTouch;
    if (isDesktop) {
      // For desktop: the design targets 1920x1080.
      // We compute a uniform scale factor relative to that baseline
      // and expose it to UI so drawing adapts proportionally.
      Game.uiScale = Math.min(screenW / 1920, screenH / 1080);
      Game.uiScale = Math.max(Game.uiScale, 0.5); // floor so text stays readable
    } else {
      Game.uiScale = Math.min(screenW / 960, screenH / 540);
      Game.uiScale = Math.max(Game.uiScale, 0.45);
    }

    // Set canvas backing resolution (crisp rendering)
    canvas.width = Math.round(screenW * currentDpr);
    canvas.height = Math.round(screenH * currentDpr);

    // CSS display size = viewport (never overflows)
    canvas.style.width = screenW + 'px';
    canvas.style.height = screenH + 'px';

    // Scale context so drawing commands use CSS pixels
    ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    Game.UI.resize(screenW, screenH);
    Game.dpr = currentDpr;
    Game.screenW = screenW;
    Game.screenH = screenH;
  }

  /* ========== GAME LOOP ========== */
  function gameLoop(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000, 0.05);
    lastTime = timestamp;

    try {
      update(dt);
      render();
    } catch (err) {
      console.error('[GameLoop] Error caught — recovering:', err);
    }

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
      case STATE.SETTINGS:
        updateSettings(dt);
        break;
    }
  }

  /* ---------- Menu ---------- */
  function updateMenu(dt) {
    if (showingHowToPlay) {
      if (Game.Input.wasPressed('Escape') || Game.Input.wasPressed('Enter') ||
          Game.Input.wasPressed('Space') || Game.Input.wasClicked()) {
        showingHowToPlay = false;
        Game.Input.haptic(20);
      }
      return;
    }

    if (Game.Input.wasPressed('ArrowUp') || Game.Input.wasPressed('KeyW')) {
      menuSelection = (menuSelection - 1 + 4) % 4;
      Game.Audio.play('click');
    }
    if (Game.Input.wasPressed('ArrowDown') || Game.Input.wasPressed('KeyS')) {
      menuSelection = (menuSelection + 1) % 4;
      Game.Audio.play('click');
    }
    Game.UI.selectedMenuItem = menuSelection;

    // Keyboard confirm
    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space')) {
      selectMenuItem(menuSelection);
    }

    // Mouse click / touch tap — detect which menu item was hit
    if (Game.Input.wasClicked()) {
      var tapped = Game.UI.getMenuClick();
      if (tapped >= 0) {
        Game.Audio.init();
        Game.Audio.resume();
        selectMenuItem(tapped);
      }
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
        // If username is the default, prompt for a name before connecting
        var currentName = Game.UI.username || '';
        if (!currentName || currentName === 'Player') {
          if (Game.Input.isTouch) {
            var entered = prompt('Enter your player name:', currentName || '');
            if (entered && entered.trim()) {
              Game.UI.username = entered.trim().substring(0, 16);
              try { localStorage.setItem('dt_username', Game.UI.username); } catch(e) {}
            }
          } else {
            // On desktop, show a quick prompt too for convenience
            var entered2 = prompt('Enter your player name:', currentName || '');
            if (entered2 && entered2.trim()) {
              Game.UI.username = entered2.trim().substring(0, 16);
              try { localStorage.setItem('dt_username', Game.UI.username); } catch(e) {}
            }
          }
        }
        startMultiplayer();
        break;
      case 2:
        state = STATE.SETTINGS;
        break;
      case 3:
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
      // Vehicle select clicks handled in updateVehicleSelect() via wasClicked().
      // Don't duplicate here to avoid double-firing deployVehicle().
    } else if (state === STATE.LOBBY) {
      // Lobby clicks are handled in updateLobby() via wasClicked().
      // Don't duplicate here to avoid double-firing actions.
    }
  }

  /* ---------- Vehicle Select ---------- */
  function updateVehicleSelect(dt) {
    // Don't process any input while elevator deploy animation is running
    if (Game.UI.isElevatorDeploying()) return;

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

    // Keyboard confirm
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

    // Touch tap / mouse click on a vehicle bay
    if (Game.Input.wasClicked()) {
      var veh = Game.UI.getVehicleClick();
      if (veh === -2) {
        // Back button
        if (map) {
          state = STATE.PLAYING;
        } else {
          state = STATE.MENU;
        }
        Game.Audio.play('click');
      } else if (veh >= 0 && vehiclePool[veh]) {
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

    // Use the correct team (multiplayer players may be on team 2)
    var team = (gameMode === 'multi' && Game.Network.playerTeam) ? Game.Network.playerTeam : 1;
    const spawn = map.getSpawn(team);
    playerVehicle = Game.createVehicle(selectedVehicle, team, spawn.x + randFloat(-20, 20), spawn.y + randFloat(-20, 20));
    playerVehicle.isPlayer = true;
    if (gameMode === 'multi') {
      playerVehicle.networkId = Game.Network.playerId;
      // Notify other players about our new vehicle
      Game.Network.sendRespawn({
        vehicleType: selectedVehicle,
        team: team,
        x: playerVehicle.x,
        y: playerVehicle.y,
        name: Game.UI.username || 'Player'
      });
    }
    allVehicles.push(playerVehicle);

    // Safety: ensure respawn state is fully cleared before entering gameplay
    isRespawning = false;
    respawnTimer = 0;

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
    if (statsTimer <= 0 || Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space') || Game.Input.wasClicked()) {
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
    if (Game.Input.wasPressed('Enter') || Game.Input.wasPressed('Space') || Game.Input.wasClicked()) {
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

  function updateSettings(dt) {
    if (Game.Input.wasPressed('Escape')) {
      state = STATE.MENU;
      return;
    }

    // Handle keyboard input for username editing
    var keys = Game.Input.getTypedKeys ? Game.Input.getTypedKeys() : [];
    for (var ki = 0; ki < keys.length; ki++) {
      var key = keys[ki];
      if (key === 'Backspace') {
        Game.UI.username = Game.UI.username.slice(0, -1);
      } else if (key.length === 1 && Game.UI.username.length < 16) {
        Game.UI.username = Game.UI.username + key;
      }
    }

    if (Game.Input.wasClicked()) {
      var action = Game.UI.getSettingsAction();
      if (action === 'back') {
        state = STATE.MENU;
      } else if (action === 'save') {
        Game.Audio.play('click');
        // Save username to localStorage
        try { localStorage.setItem('dt_username', Game.UI.username); } catch(e) {}
        Game.UI.notify('Settings saved!', '#0f0', 2);
        state = STATE.MENU;
      } else if (action === 'username_field') {
        // Focus the username field - prompt for input on mobile
        if (Game.Input.isTouch) {
          var newName = prompt('Enter username:', Game.UI.username);
          if (newName !== null && newName.trim()) {
            Game.UI.username = newName.trim().substring(0, 16);
          }
        }
      }
    }
  }

  /* ---------- Playing ---------- */
  function updatePlaying(dt) {
    if (!map) return;
    gameTime += dt;

    // Desktop HUD pause button click
    if (Game.Input.wasClicked() && Game.UI.isHUDPauseClicked && Game.UI.isHUDPauseClicked()) {
      Game.UI.showPauseOverlay();
      return;
    }

    // Pause (keyboard + touch + desktop HUD button)
    if (Game.Input.wasPressed('Escape') || Game.Input.isPauseRequested()) {
      Game.UI.showPauseOverlay();
      return;
    }

    // Pause overlay handling (all platforms)
    if (Game.UI.isPauseOverlayVisible()) {
      if (Game.Input.wasClicked()) {
        var pauseAction = Game.UI.getPauseOverlayClick();
        if (pauseAction === 'resume') {
          Game.UI.hidePauseOverlay();
        } else if (pauseAction === 'restart') {
          Game.UI.hidePauseOverlay();
          Game.Audio.stopMusic();
          startRound();
        } else if (pauseAction === 'quit') {
          Game.UI.hidePauseOverlay();
          map = null;
          state = STATE.MENU;
          Game.Audio.stopMusic();
        } else if (pauseAction === 'music') {
          var on = Game.Audio.toggleMusic();
          Game.UI.notify(on ? 'Music ON' : 'Music OFF', '#aaa', 1.5);
          if (on && playerVehicle) Game.Audio.playMusic(playerVehicle.type);
        }
      }
      // Also allow ESC to resume from pause overlay
      if (Game.Input.wasPressed('Escape')) {
        Game.UI.hidePauseOverlay();
      }
      return; // Don't process game input while paused
    }

    // Toggle music
    if (Game.Input.wasPressed('KeyM')) {
      const on = Game.Audio.toggleMusic();
      Game.UI.notify(on ? 'Music ON' : 'Music OFF', '#aaa', 1.5);
      if (on && playerVehicle) Game.Audio.playMusic(playerVehicle.type);
    }

    // Debug cheat keys (development only)
    if (Game.Input.wasPressed('F1') && playerVehicle && playerVehicle.alive) {
      console.log('[DEBUG] F1: Kill vehicle. type=' + playerVehicle.type + ' hp=' + playerVehicle.hp + ' jeepLives=' + jeepLives);
      playerVehicle.takeDamage(999, -1);
      Game.UI.notify('[DEBUG] Vehicle killed', '#f0f', 2);
    }
    if (Game.Input.wasPressed('F2') && playerVehicle && playerVehicle.alive) {
      console.log('[DEBUG] F2: Drain fuel. type=' + playerVehicle.type + ' fuel=' + playerVehicle.fuel);
      playerVehicle.fuel = 0;
      Game.UI.notify('[DEBUG] Fuel drained', '#f0f', 2);
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

        // Check if all vehicles destroyed → round defeat
        var anyAvailable = vehiclePool.some(function (v) { return v; });
        if (!anyAvailable) {
          Game.UI.notify('All vehicles destroyed! Defeat!', '#ff4444', 3);
          Game.Audio.play('explosion');
          endRound(2);
          return;
        }

        // Go to vehicle select
        state = STATE.VEHICLE_SELECT;
        for (var vi = 0; vi < 4; vi++) {
          if (vehiclePool[vi]) { selectedVehicle = vi; break; }
        }
        return; // CRITICAL: stop processing updatePlaying — without this,
               // the death check below re-fires (old vehicle is still dead,
               // isRespawning just became false) creating an infinite death loop
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

      // UrbanStrike (Helicopter) faces aim direction (strafe movement)
      if (playerVehicle.type === VEH.HELI) {
        var heliAim = Game.Input.getAimDirection ? Game.Input.getAimDirection() : null;
        var heliTargetAngle;
        if (heliAim) {
          // Touch: use right joystick direction
          heliTargetAngle = heliAim.angle;
        } else {
          // Desktop: face toward mouse cursor
          var hMousePos = Game.Input.getMousePos();
          heliTargetAngle = angleTo(playerVehicle.x, playerVehicle.y, hMousePos.x + camX, hMousePos.y + camY);
        }
        var heliDiff = normAngle(heliTargetAngle - playerVehicle.angle);
        var heliMaxTurn = playerVehicle.turnRate * dt;
        playerVehicle.angle += clamp(heliDiff, -heliMaxTurn, heliMaxTurn);
        playerVehicle.angle = normAngle(playerVehicle.angle);
      }

      // Shooting
      if (Game.Input.isShooting()) {
        playerVehicle.shoot();
      }

      // Mine laying (ASV) - keyboard or touch special button
      if ((Game.Input.wasPressed('KeyE') || Game.Input.isSpecialPressed()) && playerVehicle.type === VEH.ASV) {
        playerVehicle.layMine();
        Game.Input.haptic(60);
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
        return; // Stop processing gameplay after state change
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
    }

    // Check player death -> 3s countdown then vehicle select
    // MUST be outside the alive block so projectile/turret kills are caught
    if (playerVehicle && !playerVehicle.alive && !isRespawning) {
      isRespawning = true;
      respawnTimer = RESPAWN_TIME;
      // Only record death here if not already recorded by onVehicleHit
      // (covers fuel=0, water drown, turret kills where no killer vehicle found)
      if (!playerVehicle._deathRecorded) {
        recordDeath(playerVehicle.team, true);
      }
      Game.Audio.stopMusic();
      Game.UI.notify('Vehicle destroyed!', '#ff4444', 2);
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
    // In multiplayer, send damage events for hits from the local player
    if (gameMode === 'multi' && Game.Network.connected) {
      // Find who shot this projectile
      var shooter = null;
      for (var si = 0; si < allVehicles.length; si++) {
        if (allVehicles[si].id === projectile.owner) { shooter = allVehicles[si]; break; }
      }
      // Only the shooter's client sends the damage event (avoid double-counting)
      if (shooter && shooter.isPlayer && vehicle.networkId) {
        Game.Network.sendDamage({
          targetId: vehicle.networkId,
          damage: projectile.damage || 10
        });
      }
    }

    if (!vehicle.alive) {
      // Vehicle just died - record stats
      var killer = null;
      for (var vi = 0; vi < allVehicles.length; vi++) {
        if (allVehicles[vi].id === projectile.owner) { killer = allVehicles[vi]; break; }
      }
      if (killer) {
        recordKill(killer.team, killer.isPlayer);
      }
      // Always record death and mark it so respawn detection doesn't double-count
      recordDeath(vehicle.team, vehicle.isPlayer);
      vehicle._deathRecorded = true;
      if (killer && killer.isPlayer) {
        Game.UI.notify('Enemy destroyed!', '#ff6600', 2);
        Game.Input.hapticPattern([50, 30, 100]); // kill haptic
      }
      if (vehicle.isPlayer) {
        Game.UI.notify('You were destroyed!', '#ff4444', 2);
        Game.Input.hapticPattern([100, 50, 200]); // death haptic
      }
    } else if (vehicle.isPlayer) {
      // Player got hit but survived
      Game.Input.haptic(40);
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
          var droppedByPlayer = f.carrier.isPlayer;
          f.carried = false;
          f.carrier.hasFlag = false;
          f.carrier.flagTeam = 0;
          f.carrier = null;
          Game.UI.notify((team === 1 ? 'Blue' : 'Red') + ' flag dropped!', team === 1 ? '#3388ff' : '#ff4444', 2);
          if (Game.Audio) Game.Audio.play('pickup');

          // Send flag drop event in multiplayer (only from the carrier's client)
          if (gameMode === 'multi' && droppedByPlayer && Game.Network.connected) {
            Game.Network.sendFlagEvent({ type: 'drop', flagTeam: team, team: enemyTeam, x: f.x, y: f.y });
          }

          // Return flag to base after 10s if not picked up
          (function(flag, flagTeam) {
            setTimeout(function () {
              if (!flag.carried) {
                var basePos = map ? map.getFlagPos(flagTeam) : { x: flag.x, y: flag.y };
                flag.x = basePos.x;
                flag.y = basePos.y;
                flag.atBase = true;
                Game.UI.notify((flagTeam === 1 ? 'Blue' : 'Red') + ' flag returned!', '#aaa', 2);
                if (gameMode === 'multi' && Game.Network.connected) {
                  Game.Network.sendFlagEvent({ type: 'return', flagTeam: flagTeam });
                }
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
              var scoringTeam = f.carrier.team;
              var scoredByPlayer = f.carrier.isPlayer;
              if (scoringTeam === 1) score.team1++;
              else score.team2++;

              recordFlag(scoringTeam, scoredByPlayer);

              Game.Audio.play('score');
              if (scoredByPlayer) Game.Input.hapticPattern([50, 30, 50, 30, 150]);
              Game.UI.notify(
                (scoringTeam === 1 ? 'Blue' : 'Red') + ' team SCORES!',
                scoringTeam === 1 ? '#3388ff' : '#ff4444', 3
              );

              // Send capture event in multiplayer
              if (gameMode === 'multi' && scoredByPlayer && Game.Network.connected) {
                Game.Network.sendFlagEvent({ type: 'capture', flagTeam: team, team: scoringTeam });
              }

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

              // Send return event in multiplayer (only if our player returned it)
              if (gameMode === 'multi' && veh.isPlayer && Game.Network.connected) {
                Game.Network.sendFlagEvent({ type: 'return', flagTeam: team });
              }
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

              // Send pickup event in multiplayer (only if our player picked it up)
              if (gameMode === 'multi' && veh.isPlayer && Game.Network.connected) {
                Game.Network.sendFlagEvent({ type: 'pickup', flagTeam: team, team: veh.team });
              }
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
      Game.UI.lobbyStatus = 'Joined room: ' + data.roomId;
      Game.UI.notify('Joined room!', '#0f0', 2);
      // Stay in lobby state (not vehicle select) - show in-room lobby
    });
    Game.Network.on('onLobbyUpdate', function (data) {
      // Lobby data updated by network.js automatically
    });
    Game.Network.on('onCountdown', function (data) {
      // Countdown updated by network.js automatically
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
    Game.Network.on('onVehicleDamage', function (data) {
      handleNetworkDamage(data);
    });
    Game.Network.on('onVehicleRespawn', function (data) {
      handleNetworkRespawn(data);
    });
    Game.Network.on('onFlagEvent', function (data) {
      handleNetworkFlagEvent(data);
    });
    Game.Network.on('onPlayerLeft', function (data) {
      // Remove their vehicle from the game
      for (var vi = allVehicles.length - 1; vi >= 0; vi--) {
        if (allVehicles[vi].networkId === data.playerId) {
          allVehicles.splice(vi, 1);
          break;
        }
      }
      delete remotePlayers[data.playerId];
    });
    Game.Network.on('onDisconnect', function () {
      Game.UI.lobbyStatus = 'Disconnected from server';
      Game.UI.notify('Disconnected!', '#f00', 3);
    });
  }

  function updateLobby(dt) {
    if (Game.Input.wasPressed('Escape')) {
      if (Game.Network.inRoom) {
        Game.Network.leaveRoom();
      } else {
        Game.Network.disconnect();
        state = STATE.MENU;
      }
      return;
    }

    // Touch tap / mouse click on lobby buttons
    if (Game.Input.wasClicked()) {
      var action = Game.UI.getLobbyAction();
      if (action === 'back') {
        if (Game.Network.inRoom) {
          Game.Network.leaveRoom();
        } else {
          Game.Network.disconnect();
          state = STATE.MENU;
        }
      } else if (action === 'create') {
        var username = Game.UI.username || 'Player';
        Game.Network.createRoom('Game ' + Math.floor(Math.random() * 1000), username);
      } else if (action === 'refresh') {
        Game.Network.requestRooms();
      } else if (action === 'ready') {
        Game.Network.toggleReady();
        Game.Audio.play('click');
      } else if (action === 'start') {
        Game.Network.startGame();
        Game.Audio.play('click');
      } else if (action === 'cancelCountdown') {
        Game.Network.cancelCountdown();
        Game.Audio.play('click');
      } else if (action === 'switchTeam') {
        Game.Network.switchTeam();
        Game.Audio.play('click');
      } else if (action === 'leave') {
        Game.Network.leaveRoom();
        Game.Audio.play('click');
      } else if (action && action.action === 'join') {
        var rooms = Game.Network.lobby.rooms;
        var username2 = Game.UI.username || 'Player';
        if (rooms[action.index]) {
          Game.Network.joinRoom(rooms[action.index].id, username2);
        }
      } else if (action && action.action === 'addAI') {
        Game.Network.addAI(action.team);
        Game.Audio.play('click');
      } else if (action && action.action === 'selectVehicle') {
        selectedVehicle = action.vehicleType;
        Game.Network.selectVehicle(action.vehicleType);
        Game.Audio.play('click');
      }
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

    // Hook tile destruction to broadcast over network
    var origDestroyTile = map.destroyTile.bind(map);
    map.destroyTile = function (tx, ty) {
      var result = origDestroyTile(tx, ty);
      if (result && Game.Network.connected) {
        Game.Network.sendTileDestroyed(tx, ty);
      }
      return result;
    };

    Game.resetVehicleIds();
    Game.Projectiles.clear();
    Game.Particles.clear();
    allVehicles = [];
    aiControllers = [];
    remotePlayers = {};
    score = { team1: 0, team2: 0 };
    gameTime = 0;
    winner = 0;

    // Spawn turrets from the generated map
    turrets = map.turrets;

    // Reset flags
    var f1Pos = map.getFlagPos(1);
    var f2Pos = map.getFlagPos(2);
    flags = {
      1: { x: f1Pos.x, y: f1Pos.y, atBase: true, carried: false, carrier: null, team: 1 },
      2: { x: f2Pos.x, y: f2Pos.y, atBase: true, carried: false, carrier: null, team: 2 }
    };

    // Create player vehicle on correct team
    var team = Game.Network.playerTeam;
    var spawn = map.getSpawn(team);
    playerVehicle = Game.createVehicle(selectedVehicle, team, spawn.x, spawn.y);
    playerVehicle.isPlayer = true;
    playerVehicle.networkId = Game.Network.playerId;
    allVehicles.push(playerVehicle);

    // Store own name for rendering
    remotePlayers[Game.Network.playerId] = {
      name: Game.UI.username || 'Player',
      vehicleType: selectedVehicle
    };

    // Spawn AI vehicles from lobby data
    if (data.players) {
      for (var pi = 0; pi < data.players.length; pi++) {
        var p = data.players[pi];
        if (p.isAI) {
          var aiSpawn = map.getSpawn(p.team);
          var aiType = (p.vehicleType != null) ? p.vehicleType : VEH.TANK;
          var aiVeh = Game.createVehicle(aiType, p.team, aiSpawn.x + randFloat(-40, 40), aiSpawn.y + randFloat(-40, 40));
          aiVeh.isAI = true;
          aiVeh.networkId = p.id;
          var aiCtrl = new Game.AIController(aiVeh, map);
          aiCtrl.difficulty = 0.5 + Math.random() * 0.3;
          allVehicles.push(aiVeh);
          aiControllers.push(aiCtrl);
          remotePlayers[p.id] = { name: p.name || 'AI Bot', vehicleType: aiType };
        } else if (p.id !== Game.Network.playerId) {
          // Pre-register remote human players so we know their names
          remotePlayers[p.id] = {
            name: p.name || 'Player',
            vehicleType: (p.vehicleType != null) ? p.vehicleType : VEH.TANK
          };
        }
      }
    }

    // Reset vehicle pool for multiplayer (all available)
    vehiclePool = [true, true, true, true];
    jeepLives = MAX_JEEP_LIVES;

    Game.Audio.playMusic(selectedVehicle);

    // Go through vehicle select first
    state = STATE.VEHICLE_SELECT;
  }

  function handleNetworkState(data) {
    if (data.playerId === Game.Network.playerId) return;

    // Track remote player names
    if (data.name && data.playerId) {
      if (!remotePlayers[data.playerId]) remotePlayers[data.playerId] = {};
      remotePlayers[data.playerId].name = data.name;
    }

    var remote = null;
    for (var ri = 0; ri < allVehicles.length; ri++) {
      if (allVehicles[ri].networkId === data.playerId) { remote = allVehicles[ri]; break; }
    }

    // Use != null checks so type 0 (Jeep) and team 1 are not treated as falsy
    var vehType = (data.type != null) ? data.type : VEH.TANK;
    var vehTeam = (data.team != null) ? data.team : 2;

    if (!remote && data.alive !== false) {
      remote = Game.createVehicle(vehType, vehTeam, data.x, data.y);
      remote.networkId = data.playerId;
      allVehicles.push(remote);
    } else if (remote && remote.type !== vehType && data.alive !== false) {
      // Vehicle type changed (player respawned with different vehicle)
      var idx = allVehicles.indexOf(remote);
      if (idx !== -1) allVehicles.splice(idx, 1);
      remote = Game.createVehicle(vehType, vehTeam, data.x, data.y);
      remote.networkId = data.playerId;
      allVehicles.push(remote);
    }

    if (remote) {
      remote.applyNetworkState(data);
    }
  }

  /* ---------- Network Damage Handler ---------- */
  function handleNetworkDamage(data) {
    // data: { targetId, damage, attackerId }
    if (!data || !data.targetId) return;
    // If WE are the target, apply damage to our player vehicle
    if (data.targetId === Game.Network.playerId && playerVehicle && playerVehicle.alive) {
      playerVehicle.takeDamage(data.damage || 10, -1);
      Game.Particles.sparks(playerVehicle.x, playerVehicle.y, 4);
      Game.Input.haptic(40);
      if (!playerVehicle.alive) {
        Game.UI.notify('You were destroyed!', '#ff4444', 2);
        Game.Input.hapticPattern([100, 50, 200]);
      }
    }
    // If a remote vehicle or AI is the target, apply damage to them too
    for (var vi = 0; vi < allVehicles.length; vi++) {
      var v = allVehicles[vi];
      if (v.networkId === data.targetId && !v.isPlayer) {
        v.takeDamage(data.damage || 10, -1);
        Game.Particles.sparks(v.x, v.y, 4);
      }
    }
  }

  /* ---------- Network Respawn Handler ---------- */
  function handleNetworkRespawn(data) {
    // data: { playerId, vehicleType, team, x, y, name }
    if (!data || data.playerId === Game.Network.playerId) return;
    // Update name tracking
    if (data.name) {
      if (!remotePlayers[data.playerId]) remotePlayers[data.playerId] = {};
      remotePlayers[data.playerId].name = data.name;
    }
    // Find existing vehicle for this player and replace it
    for (var vi = allVehicles.length - 1; vi >= 0; vi--) {
      if (allVehicles[vi].networkId === data.playerId) {
        allVehicles.splice(vi, 1);
        break;
      }
    }
    var vehType = (data.vehicleType != null) ? data.vehicleType : VEH.TANK;
    var vehTeam = (data.team != null) ? data.team : 2;
    var newVeh = Game.createVehicle(vehType, vehTeam, data.x, data.y);
    newVeh.networkId = data.playerId;
    allVehicles.push(newVeh);
  }

  /* ---------- Network Flag Event Handler ---------- */
  function handleNetworkFlagEvent(data) {
    // data: { type, flagTeam, team, x, y, playerId }
    if (!data || !flags) return;
    var f = flags[data.flagTeam];
    if (!f) return;

    switch (data.type) {
      case 'pickup':
        f.atBase = false;
        f.carried = true;
        // Find carrier vehicle
        for (var vi = 0; vi < allVehicles.length; vi++) {
          if (allVehicles[vi].networkId === data.playerId) {
            f.carrier = allVehicles[vi];
            allVehicles[vi].hasFlag = true;
            allVehicles[vi].flagTeam = data.flagTeam;
            break;
          }
        }
        Game.UI.notify(
          (data.team === 1 ? 'Blue' : 'Red') + ' stole the ' + (data.flagTeam === 1 ? 'blue' : 'red') + ' flag!',
          data.team === 1 ? '#66aaff' : '#ff7777', 3
        );
        break;
      case 'capture':
        if (data.team === 1) score.team1++;
        else score.team2++;
        f.carried = false;
        if (f.carrier) { f.carrier.hasFlag = false; f.carrier.flagTeam = 0; }
        f.carrier = null;
        var flagHome = map.getFlagPos(data.flagTeam);
        f.x = flagHome.x; f.y = flagHome.y; f.atBase = true;
        Game.Audio.play('score');
        Game.UI.notify(
          (data.team === 1 ? 'Blue' : 'Red') + ' team SCORES!',
          data.team === 1 ? '#3388ff' : '#ff4444', 3
        );
        break;
      case 'drop':
        f.carried = false;
        if (f.carrier) { f.carrier.hasFlag = false; f.carrier.flagTeam = 0; }
        f.carrier = null;
        f.x = data.x; f.y = data.y;
        Game.UI.notify(
          (data.flagTeam === 1 ? 'Blue' : 'Red') + ' flag dropped!',
          data.flagTeam === 1 ? '#3388ff' : '#ff4444', 2
        );
        break;
      case 'return':
        f.carried = false;
        if (f.carrier) { f.carrier.hasFlag = false; f.carrier.flagTeam = 0; }
        f.carrier = null;
        var retBase = map.getFlagPos(data.flagTeam);
        f.x = retBase.x; f.y = retBase.y; f.atBase = true;
        Game.UI.notify(
          (data.flagTeam === 1 ? 'Blue' : 'Red') + ' flag returned!', '#aaa', 2
        );
        break;
    }
  }

  /* ========== RENDER ========== */
  function render() {
    // Defensive: re-apply DPR transform every frame so a stale
    // save/restore or mid-frame resize can never shift drawing.
    ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);

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
        var lobbyInfo = {
          rooms: Game.Network.lobby.rooms,
          status: Game.UI.lobbyStatus,
          inRoom: Game.Network.inRoom,
          roomPlayers: Game.Network.lobbyData.players,
          playerTeam: Game.Network.playerTeam,
          isHost: Game.Network.isHost,
          countdown: Game.Network.lobbyData.countdown,
          readyStates: {},
          roomName: Game.Network.lobbyData.roomName,
          playerId: Game.Network.playerId
        };
        // Build readyStates map from players array
        if (lobbyInfo.roomPlayers) {
          for (var lp = 0; lp < lobbyInfo.roomPlayers.length; lp++) {
            lobbyInfo.readyStates[lobbyInfo.roomPlayers[lp].id] = lobbyInfo.roomPlayers[lp].ready;
          }
        }
        Game.UI.renderLobby(lobbyInfo);
        break;

      case STATE.SETTINGS:
        Game.UI.renderSettings();
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

    // Render player names above vehicles (multiplayer or always for identification)
    for (var ni = 0; ni < allVehicles.length; ni++) {
      var nv = allVehicles[ni];
      if (!nv.alive) continue;
      var playerName = null;
      if (nv.isPlayer) {
        playerName = Game.UI.username || 'Player';
      } else if (nv.networkId && remotePlayers[nv.networkId]) {
        playerName = remotePlayers[nv.networkId].name;
      } else if (nv.isAI) {
        playerName = 'AI';
      }
      if (playerName) {
        Game.UI.renderUsernameLabel(ctx, nv, camX, camY, playerName);
      }
    }

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

    Game.UI.renderTouchControls(playerVehicle);
    Game.UI.renderNotifications();

    // Pause overlay (on top of everything)
    if (Game.UI.isPauseOverlayVisible()) {
      Game.UI.renderPauseOverlay();
    }
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
