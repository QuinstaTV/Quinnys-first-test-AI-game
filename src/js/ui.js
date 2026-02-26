/* ============================================================
   ui.js - Menus, HUD, minimap, vehicle select, lobby, 
   game over screen, score display
   ============================================================ */
(function () {
  'use strict';

  const { STATE, VEH, VEHICLE_STATS } = Game;

  let canvas, ctx;
  let screenW, screenH;

  // Menu state
  let selectedMenuItem = 0;
  let lobbyRooms = [];
  let lobbyStatus = '';
  let lobbyInput = '';
  let vehicleHover = -1;

  function init(c) {
    canvas = c;
    ctx = c.getContext('2d');
    screenW = c.width;
    screenH = c.height;
  }

  function resize(w, h) {
    screenW = w;
    screenH = h;
  }

  /* ========== MAIN MENU ========== */
  function renderMenu() {
    // Background
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, screenW, screenH);

    // Stars
    for (let i = 0; i < 80; i++) {
      const sx = (Math.sin(i * 127.1) * 0.5 + 0.5) * screenW;
      const sy = (Math.cos(i * 311.7) * 0.5 + 0.5) * screenH;
      const brightness = Math.sin(Date.now() * 0.001 + i) * 0.3 + 0.7;
      ctx.fillStyle = `rgba(255,255,255,${brightness * 0.5})`;
      ctx.fillRect(sx, sy, 2, 2);
    }

    // Logo
    const logo = Game.Sprites.sprites.logo;
    if (logo) {
      ctx.drawImage(logo, screenW / 2 - 250, 60);
    }

    // Menu items
    const items = [
      { label: 'SINGLE PLAYER', desc: 'Battle against AI opponents' },
      { label: 'MULTIPLAYER', desc: 'Play online with others' },
      { label: 'HOW TO PLAY', desc: 'Controls and objectives' }
    ];

    const startY = 200;
    items.forEach((item, i) => {
      const y = startY + i * 70;
      const isSelected = i === selectedMenuItem;
      const hover = isMouseInRect(screenW / 2 - 160, y - 5, 320, 50);

      // Background
      ctx.fillStyle = isSelected || hover ? 'rgba(255,102,0,0.2)' : 'rgba(255,255,255,0.05)';
      ctx.fillRect(screenW / 2 - 160, y - 5, 320, 50);

      if (isSelected || hover) {
        ctx.strokeStyle = '#ff6600';
        ctx.lineWidth = 2;
        ctx.strokeRect(screenW / 2 - 160, y - 5, 320, 50);
      }

      ctx.fillStyle = isSelected || hover ? '#ff6600' : '#ccc';
      ctx.font = 'bold 20px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, screenW / 2, y + 20);

      ctx.fillStyle = '#666';
      ctx.font = '12px monospace';
      ctx.fillText(item.desc, screenW / 2, y + 38);
    });

    // Version / Credits
    ctx.fillStyle = '#444';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('v1.1 - Inspired by Return Fire (1995) - MIT License', screenW / 2, screenH - 30);
    ctx.fillText('WASD/Arrows to move | Space/Click to shoot | 1-4 select vehicle', screenW / 2, screenH - 14);
  }

  /* ========== VEHICLE SELECT ========== */
  // Elevator animation state
  let elevatorPhase = 'select'; // 'select' | 'deploying'
  let elevatorY = 0;
  let elevatorTarget = 0;
  let deployingVehicle = -1;
  let elevatorCallback = null;

  function startElevatorDeploy(vehicleType, callback) {
    elevatorPhase = 'deploying';
    elevatorY = 0;
    deployingVehicle = vehicleType;
    elevatorCallback = callback;
  }

  function renderVehicleSelect(currentType, vehiclePool, jeepLives) {
    const pool = vehiclePool || [true, true, true, true];
    const jLives = jeepLives !== undefined ? jeepLives : 3;
    const vehicleNames = ['JEEP', 'BUSHMASTER', 'HELICOPTER', 'STRIKEMASTER'];
    const vehicleDescs = [
      'Speed: ████░  HP: ██░░░\nGun: Machine Gun\n★ Only flag carrier!\n★ Can cross water briefly',
      'Speed: ██░░░  HP: ████░\nGun: 360° Auto-Aim Cannon\n★ Turret auto-tracks enemies\n★ Heavy armor',
      'Speed: ████░  HP: ██░░░\nGun: Strafe Guns\n★ Flies over terrain\n★ Detects mines',
      'Speed: █░░░░  HP: █████\nGun: Rockets\n★ Lays mines\n★ Heavily armored'
    ];

    // --- Elevator deploying animation ---
    if (elevatorPhase === 'deploying') {
      elevatorY += 4; // speed of elevator rise
      renderBunkerScene(deployingVehicle, pool, vehicleNames, true, jLives);

      if (elevatorY >= screenH * 0.6) {
        elevatorPhase = 'select';
        elevatorY = 0;
        if (elevatorCallback) {
          elevatorCallback();
          elevatorCallback = null;
        }
      }
      return;
    }

    // --- Bunker vehicle select ---
    renderBunkerScene(currentType, pool, vehicleNames, false, jLives);

    // Description panel at bottom
    const descY = screenH - 120;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, descY - 10, screenW, 130);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, descY - 10, screenW, 130);

    ctx.fillStyle = '#aaa';
    ctx.font = '13px monospace';
    ctx.textAlign = 'center';
    const lines = vehicleDescs[currentType].split('\n');
    lines.forEach((line, i) => {
      ctx.fillText(line, screenW / 2, descY + 10 + i * 18);
    });

    // Deploy prompt
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 14px monospace';
    const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.fillText('Press ENTER/CLICK to deploy  |  A/D or ←/→ to browse', screenW / 2, descY + 10 + lines.length * 18 + 20);
    ctx.globalAlpha = 1;
  }

  function renderBunkerScene(selectedType, pool, vehicleNames, isDeploying, jLives) {
    // Background: underground bunker
    ctx.fillStyle = '#0c0c14';
    ctx.fillRect(0, 0, screenW, screenH);

    // Concrete walls pattern
    const wallGrad = ctx.createLinearGradient(0, 0, 0, screenH);
    wallGrad.addColorStop(0, '#1a1a24');
    wallGrad.addColorStop(0.3, '#16161e');
    wallGrad.addColorStop(1, '#0e0e14');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, screenW, screenH);

    // Wall texture lines
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    for (let y = 0; y < screenH; y += 24) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(screenW, y);
      ctx.stroke();
    }
    for (let x = 0; x < screenW; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, screenH);
      ctx.stroke();
    }

    // Overhead sign
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(screenW / 2 - 180, 10, 360, 45);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.strokeRect(screenW / 2 - 180, 10, 360, 45);
    // Hazard stripes
    for (let sx = screenW / 2 - 178; sx < screenW / 2 + 178; sx += 16) {
      ctx.fillStyle = (Math.floor((sx - screenW / 2 + 180) / 16) % 2 === 0) ? '#ff6600' : '#1a1a1a';
      ctx.fillRect(sx, 11, 8, 3);
      ctx.fillRect(sx, 51, 8, 3);
    }
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⚙ VEHICLE BAY ⚙', screenW / 2, 40);

    // Vehicle bays
    const bayW = 150, bayH = 200, bayGap = 20;
    const totalW = 4 * bayW + 3 * bayGap;
    const startX = (screenW - totalW) / 2;
    const bayY = 80;

    for (let i = 0; i < 4; i++) {
      const x = startX + i * (bayW + bayGap);
      const isAvailable = pool[i];
      const isSelected = i === selectedType && isAvailable;
      const hover = isMouseInRect(x, bayY, bayW, bayH) && isAvailable;

      // Bay recess (darker background)
      ctx.fillStyle = isSelected ? 'rgba(255,102,0,0.08)' : 'rgba(0,0,0,0.4)';
      ctx.fillRect(x, bayY, bayW, bayH);

      // Bay border - industrial look
      ctx.strokeStyle = isSelected ? '#ff6600' : !isAvailable ? '#333' : hover ? '#666' : '#444';
      ctx.lineWidth = isSelected ? 3 : 1;
      ctx.strokeRect(x, bayY, bayW, bayH);

      // Elevator platform at bottom of bay
      const platY = bayY + bayH - 30;
      const platGrad = ctx.createLinearGradient(x, platY, x, platY + 30);
      platGrad.addColorStop(0, '#3a3a3a');
      platGrad.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = platGrad;
      ctx.fillRect(x + 2, platY, bayW - 4, 28);

      // Platform hazard stripes
      ctx.fillStyle = 'rgba(255,165,0,0.15)';
      for (let sx = x + 4; sx < x + bayW - 4; sx += 20) {
        ctx.fillRect(sx, platY + 2, 10, 4);
      }

      // Status lights on bay frame
      const lightColor = !isAvailable ? '#440000' : isSelected ? '#ff6600' : '#004400';
      ctx.fillStyle = lightColor;
      ctx.beginPath();
      ctx.arc(x + 8, bayY + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x + bayW - 8, bayY + 8, 4, 0, Math.PI * 2);
      ctx.fill();
      // Glow
      if (isSelected || !isAvailable) {
        ctx.fillStyle = !isAvailable ? 'rgba(255,0,0,0.1)' : 'rgba(255,102,0,0.1)';
        ctx.beginPath();
        ctx.arc(x + 8, bayY + 8, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + bayW - 8, bayY + 8, 10, 0, Math.PI * 2);
        ctx.fill();
      }

      // Vehicle in bay
      const sprite = Game.Sprites.getVehicleSprite(i, 1);
      if (sprite) {
        let vehY = bayY + bayH / 2 - 10;

        // Elevator animation for deploying vehicle
        if (isDeploying && i === selectedType) {
          vehY -= elevatorY;
          ctx.globalAlpha = Math.max(0, 1 - elevatorY / (screenH * 0.5));
        }

        if (!isAvailable) {
          ctx.globalAlpha = 0.15;
        }

        // Draw vehicle larger in bay
        const scale = 2.5;
        const vw = sprite.width * scale;
        const vh = sprite.height * scale;
        ctx.drawImage(sprite, x + bayW / 2 - vw / 2, vehY - vh / 2, vw, vh);
        ctx.globalAlpha = 1;
      }

      // Destroyed overlay
      if (!isAvailable) {
        // X marks
        ctx.strokeStyle = 'rgba(255,0,0,0.3)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x + 20, bayY + 40);
        ctx.lineTo(x + bayW - 20, bayY + bayH - 40);
        ctx.moveTo(x + bayW - 20, bayY + 40);
        ctx.lineTo(x + 20, bayY + bayH - 40);
        ctx.stroke();
      }

      // Vehicle name plate
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(x + 10, bayY + bayH - 55, bayW - 20, 22);
      ctx.strokeStyle = isSelected ? '#ff6600' : '#444';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 10, bayY + bayH - 55, bayW - 20, 22);

      ctx.fillStyle = !isAvailable ? '#555' : isSelected ? '#ff6600' : '#ccc';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(vehicleNames[i], x + bayW / 2, bayY + bayH - 39);

      // Status text
      if (!isAvailable) {
        ctx.fillStyle = '#aa3333';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('DESTROYED', x + bayW / 2, bayY + 28);
      } else if (i === 0 && jLives !== undefined) {
        // Show Jeep lives
        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 10px monospace';
        let livesStr = '';
        for (let l = 0; l < jLives; l++) livesStr += '♥ ';
        ctx.fillText(`LIVES: ${livesStr}`, x + bayW / 2, bayY + 28);
      } else {
        ctx.fillStyle = '#555';
        ctx.font = '10px monospace';
        ctx.fillText(`[${i + 1}]`, x + bayW / 2, bayY + bayH + 14);
      }
    }

    // Floor grating effect
    ctx.strokeStyle = 'rgba(100,100,100,0.1)';
    ctx.lineWidth = 1;
    const floorY = bayY + bayH + 25;
    for (let x = 0; x < screenW; x += 8) {
      ctx.beginPath();
      ctx.moveTo(x, floorY);
      ctx.lineTo(x, screenH);
      ctx.stroke();
    }

    // Animated warning strip at top (garage door feel)
    const stripOffset = (Date.now() * 0.05) % 20;
    ctx.fillStyle = 'rgba(255,165,0,0.06)';
    for (let sx = -20 + stripOffset; sx < screenW; sx += 40) {
      ctx.beginPath();
      ctx.moveTo(sx, 0);
      ctx.lineTo(sx + 20, 0);
      ctx.lineTo(sx + 10, 8);
      ctx.lineTo(sx - 10, 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  /* ========== LOBBY ========== */
  function renderLobby(rooms, status) {
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(0, 0, screenW, screenH);

    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MULTIPLAYER LOBBY', screenW / 2, 50);

    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText(status || 'Connecting to server...', screenW / 2, 80);

    // Room list
    const startY = 120;
    if (rooms && rooms.length > 0) {
      rooms.forEach((room, i) => {
        const y = startY + i * 40;
        const hover = isMouseInRect(screenW / 2 - 200, y, 400, 35);

        ctx.fillStyle = hover ? 'rgba(255,102,0,0.2)' : 'rgba(255,255,255,0.05)';
        ctx.fillRect(screenW / 2 - 200, y, 400, 35);

        if (hover) {
          ctx.strokeStyle = '#ff6600';
          ctx.lineWidth = 1;
          ctx.strokeRect(screenW / 2 - 200, y, 400, 35);
        }

        ctx.fillStyle = '#ccc';
        ctx.font = '14px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(room.name, screenW / 2 - 180, y + 22);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#888';
        ctx.fillText(`${room.players}/${room.maxPlayers} players`, screenW / 2 + 180, y + 22);
      });
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No rooms available', screenW / 2, startY + 20);
    }

    // Create room button
    const btnY = screenH - 160;
    const btnHover = isMouseInRect(screenW / 2 - 100, btnY, 200, 40);
    ctx.fillStyle = btnHover ? '#ff6600' : '#553300';
    ctx.fillRect(screenW / 2 - 100, btnY, 200, 40);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CREATE ROOM', screenW / 2, btnY + 26);

    // Refresh button
    const refY = btnY + 50;
    const refHover = isMouseInRect(screenW / 2 - 100, refY, 200, 40);
    ctx.fillStyle = refHover ? '#336699' : '#223355';
    ctx.fillRect(screenW / 2 - 100, refY, 200, 40);
    ctx.fillStyle = '#fff';
    ctx.fillText('REFRESH', screenW / 2, refY + 26);

    // Back button
    ctx.fillStyle = '#666';
    ctx.font = '12px monospace';
    ctx.fillText('Press ESC to go back', screenW / 2, screenH - 20);
  }

  /* ========== HOW TO PLAY ========== */
  function renderHowToPlay() {
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 0, screenW, screenH);

    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOW TO PLAY', screenW / 2, 50);

    const lines = [
      '',
      '╔══════════════════════════════════════════╗',
      '║  OBJECTIVE: Capture the enemy flag and   ║',
      '║  return it to your base. First to 3 wins!║',
      '╠══════════════════════════════════════════╣',
      '║                                          ║',
      '║  CONTROLS:                               ║',
      '║  WASD / Arrow Keys ... Move vehicle      ║',
      '║  Mouse / Space ....... Shoot             ║',
      '║  E ........... Lay mine (StrikeMaster)   ║',
      '║  R ................... Swap vehicle       ║',
      '║  M ................... Toggle music       ║',
      '║  ESC ................. Pause / Menu       ║',
      '║                                          ║',
      '║  TIPS:                                   ║',
      '║  • Only JEEP can carry the flag!         ║',
      '║  • Vehicles have limited fuel & ammo     ║',
      '║  • Return to base or depots to resupply  ║',
      '║  • Destroy walls to create new paths     ║',
      '║  • Helicopter flies over everything      ║',
      '║  • StrikeMaster can lay mines behind it  ║',
      '║  • BushMaster turret auto-aims enemies   ║',
      '║  • Jeep has 3 respawn lives per round    ║',
      '║                                          ║',
      '╚══════════════════════════════════════════╝',
      '',
      'Press any key to return to menu'
    ];

    ctx.fillStyle = '#ccc';
    ctx.font = '13px monospace';
    lines.forEach((line, i) => {
      ctx.fillText(line, screenW / 2, 90 + i * 20);
    });
  }

  /* ========== HUD (In-Game) ========== */
  function renderHUD(player, score, flags, gameTime, jeepLives) {
    if (!player) return;

    const pad = 10;

    // Health bar
    drawBar(pad, pad, 120, 14, player.hp / player.maxHp,
      player.hp > player.maxHp * 0.5 ? '#0c0' : player.hp > player.maxHp * 0.25 ? '#cc0' : '#c00',
      'HP');

    // Fuel bar
    drawBar(pad, pad + 22, 120, 14, player.fuel / player.maxFuel,
      player.fuel > player.maxFuel * 0.3 ? '#07f' : '#f70', 'FUEL');

    // Ammo bar
    drawBar(pad, pad + 44, 120, 14, player.ammo / player.maxAmmo, '#fa0', 'AMMO');

    // Mine count for ASV
    if (player.type === Game.VEH.ASV) {
      ctx.fillStyle = '#aaa';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(`MINES: ${Math.floor(player.mineAmmo)}`, pad, pad + 72);
    }

    // Vehicle name
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(player.name, pad, pad + (player.type === Game.VEH.ASV ? 86 : 72));

    // Jeep lives indicator
    if (player.type === Game.VEH.JEEP && jeepLives !== undefined) {
      ctx.fillStyle = '#ffaa00';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      const livesY = pad + (player.type === Game.VEH.ASV ? 100 : 86);
      let livesStr = 'LIVES: ';
      for (let i = 0; i < jeepLives; i++) livesStr += '♥ ';
      ctx.fillText(livesStr, pad, livesY);
    }

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${score.team1}  -  ${score.team2}`, screenW / 2, 28);

    // Team labels
    ctx.font = '12px monospace';
    ctx.fillStyle = '#66aaff';
    ctx.fillText('BLUE', screenW / 2 - 50, 28);
    ctx.fillStyle = '#ff7777';
    ctx.fillText('RED', screenW / 2 + 50, 28);

    // Win target
    ctx.fillStyle = '#666';
    ctx.font = '10px monospace';
    ctx.fillText('First to 3', screenW / 2, 42);

    // Timer
    if (gameTime !== undefined) {
      const mins = Math.floor(gameTime / 60);
      const secs = Math.floor(gameTime % 60);
      ctx.fillStyle = '#aaa';
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}`, screenW - pad, 22);
    }

    // Flag status indicator
    if (flags) {
      const fy = 55;
      ctx.font = '11px monospace';

      // Blue flag status
      ctx.fillStyle = '#66aaff';
      ctx.textAlign = 'right';
      const bf = flags[1];
      ctx.fillText(bf.carried ? '⚑ STOLEN!' : bf.atBase ? '⚑ Safe' : '⚑ Dropped', screenW - pad, fy);

      // Red flag status
      ctx.fillStyle = '#ff7777';
      const rf = flags[2];
      ctx.fillText(rf.carried ? '⚑ STOLEN!' : rf.atBase ? '⚑ Safe' : '⚑ Dropped', screenW - pad, fy + 16);
    }

    // Flag carrying indicator
    if (player.hasFlag) {
      ctx.fillStyle = player.flagTeam === 1 ? '#3388ff' : '#ff4444';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      const pulse = Math.sin(Date.now() * 0.006) * 0.3 + 0.7;
      ctx.globalAlpha = pulse;
      ctx.fillText('🚩 CARRYING FLAG! Return to base!', screenW / 2, screenH - 30);
      ctx.globalAlpha = 1;
    }

    // Low fuel/ammo warnings
    if (player.fuel < player.maxFuel * 0.2) {
      ctx.fillStyle = '#f00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const blink = Math.sin(Date.now() * 0.008) > 0;
      if (blink) ctx.fillText('⚠ LOW FUEL!', pad, screenH - 50);
    }
    if (player.ammo < 5 && player.ammo > 0) {
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('⚠ LOW AMMO!', pad, screenH - 35);
    }
    if (player.ammo <= 0) {
      ctx.fillStyle = '#f00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const blink = Math.sin(Date.now() * 0.008) > 0;
      if (blink) ctx.fillText('⚠ NO AMMO!', pad, screenH - 35);
    }

    // Return to base prompt (when at own base)
    if (player._atOwnBase && player.alive) {
      ctx.fillStyle = '#0f0';
      ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      const pulse = Math.sin(Date.now() * 0.005) * 0.3 + 0.7;
      ctx.globalAlpha = pulse;
      ctx.fillText('Press [R] to return to base & swap vehicle', screenW / 2, screenH - 55);
      ctx.globalAlpha = 1;
    }
  }

  function drawBar(x, y, w, h, ratio, color, label) {
    ratio = Game.clamp(ratio, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = color;
    ctx.fillRect(x + 1, y + 1, (w - 2) * ratio, h - 2);
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(label, x + 3, y + h - 3);
  }

  /* ========== GAME OVER ========== */
  function renderGameOver(winner, score) {
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, screenW, screenH);

    const isBlue = winner === 1;
    ctx.fillStyle = isBlue ? '#3388ff' : '#ff4444';
    ctx.font = 'bold 40px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isBlue ? 'BLUE WINS!' : 'RED WINS!', screenW / 2, screenH / 2 - 40);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(`${score.team1} - ${score.team2}`, screenW / 2, screenH / 2 + 10);

    ctx.fillStyle = '#aaa';
    ctx.font = '16px monospace';
    const pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    ctx.fillText('Press ENTER to play again or ESC for menu', screenW / 2, screenH / 2 + 60);
    ctx.globalAlpha = 1;

    // Laughing skull!
    const skull = Game.Sprites.sprites.skull;
    if (skull) {
      const bounce = Math.sin(Date.now() * 0.005) * 10;
      ctx.drawImage(skull, screenW / 2 - 80 + bounce, screenH / 2 + 80, 48, 48);
      ctx.drawImage(skull, screenW / 2 + 32 - bounce, screenH / 2 + 80, 48, 48);
    }
  }

  /* ========== RESPAWN SCREEN ========== */
  function renderRespawn(timer) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, screenW, screenH);

    // Skull
    const skull = Game.Sprites.sprites.skull;
    if (skull) {
      const size = 64;
      const bounce = Math.sin(Date.now() * 0.005) * 5;
      ctx.drawImage(skull, screenW / 2 - size / 2, screenH / 2 - size - 10 + bounce, size, size);
    }

    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DESTROYED!', screenW / 2, screenH / 2 + 20);

    ctx.fillStyle = '#ccc';
    ctx.font = '14px monospace';
    ctx.fillText(`Respawning in ${Math.ceil(timer)}...`, screenW / 2, screenH / 2 + 50);
  }

  /* ========== TOUCH JOYSTICK ========== */
  function renderTouchControls() {
    if (!Game.Input.touchActive && !('ontouchstart' in window)) return;

    const input = Game.Input;

    // Left joystick area
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(80, screenH - 100, 50, 0, Math.PI * 2);
    ctx.stroke();

    if (input.joystickActive) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.beginPath();
      const jx = Game.clamp(input.joystickDX, -40, 40);
      const jy = Game.clamp(input.joystickDY, -40, 40);
      ctx.arc(80 + jx, screenH - 100 + jy, 20, 0, Math.PI * 2);
      ctx.fill();
    }

    // Right side - fire button
    ctx.strokeStyle = 'rgba(255,100,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenW - 80, screenH - 100, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,100,0,0.15)';
    ctx.fill();
    ctx.fillStyle = 'rgba(255,100,0,0.5)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE', screenW - 80, screenH - 96);
  }

  /* ========== Notification System ========== */
  const notifications = [];

  function notify(text, color, duration) {
    notifications.push({
      text,
      color: color || '#fff',
      life: duration || 3,
      maxLife: duration || 3
    });
    if (notifications.length > 5) notifications.shift();
  }

  function renderNotifications() {
    for (let i = notifications.length - 1; i >= 0; i--) {
      const n = notifications[i];
      const alpha = Math.min(1, n.life * 2);
      const y = screenH / 2 - 100 - (notifications.length - 1 - i) * 25;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = n.color;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(n.text, screenW / 2, y);
    }
    ctx.globalAlpha = 1;
  }

  function updateNotifications(dt) {
    for (let i = notifications.length - 1; i >= 0; i--) {
      notifications[i].life -= dt;
      if (notifications[i].life <= 0) notifications.splice(i, 1);
    }
  }

  /* ========== Helpers ========== */
  let _mouseX = 0, _mouseY = 0;
  function updateMouse() {
    const pos = Game.Input.getMousePos();
    _mouseX = pos.x;
    _mouseY = pos.y;
  }

  function isMouseInRect(x, y, w, h) {
    return _mouseX >= x && _mouseX <= x + w && _mouseY >= y && _mouseY <= y + h;
  }

  function getMenuClick() {
    updateMouse();
    // Check menu items
    const startY = 200;
    for (let i = 0; i < 3; i++) {
      if (isMouseInRect(screenW / 2 - 160, startY + i * 70 - 5, 320, 50)) {
        return i;
      }
    }
    return -1;
  }

  function getVehicleClick() {
    updateMouse();
    // Match bunker bay layout
    const bayW = 150, bayH = 200, bayGap = 20;
    const totalW = 4 * bayW + 3 * bayGap;
    const startX = (screenW - totalW) / 2;
    const bayY = 80;
    for (let i = 0; i < 4; i++) {
      const x = startX + i * (bayW + bayGap);
      if (isMouseInRect(x, bayY, bayW, bayH)) return i;
    }
    return -1;
  }

  function getLobbyAction() {
    updateMouse();
    const btnY = screenH - 160;
    if (isMouseInRect(screenW / 2 - 100, btnY, 200, 40)) return 'create';
    if (isMouseInRect(screenW / 2 - 100, btnY + 50, 200, 40)) return 'refresh';

    // Check room clicks
    const rooms = lobbyRooms;
    const startY = 120;
    for (let i = 0; i < rooms.length; i++) {
      if (isMouseInRect(screenW / 2 - 200, startY + i * 40, 400, 35)) {
        return { action: 'join', index: i };
      }
    }
    return null;
  }

  window.Game.UI = {
    init, resize,
    renderMenu, renderVehicleSelect, renderLobby, renderHowToPlay,
    renderHUD, renderGameOver, renderRespawn,
    renderTouchControls, renderNotifications,
    notify, updateNotifications, updateMouse,
    getMenuClick, getVehicleClick, getLobbyAction,
    startElevatorDeploy,
    set lobbyRooms(v) { lobbyRooms = v; },
    set lobbyStatus(v) { lobbyStatus = v; },
    get selectedMenuItem() { return selectedMenuItem; },
    set selectedMenuItem(v) { selectedMenuItem = v; }
  };
})();
