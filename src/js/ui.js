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
    ctx.fillText('v1.4 - Inspired by Return Fire (1995) - MIT License', screenW / 2, screenH - 30);
    if (Game.Input.isTouch) {
      ctx.fillText('Tap to select  |  Touch controls in-game', screenW / 2, screenH - 14);
    } else {
      ctx.fillText('WASD/Arrows to move | Space/Click to shoot | 1-4 select vehicle', screenW / 2, screenH - 14);
    }
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
    const vehicleNames = ['JEEP', 'BUSHMASTER', 'URBANSTRIKE', 'STRIKEMASTER'];
    const vehicleDescs = [
      'Speed: ████░  HP: ██░░░\nGun: Machine Gun\n★ Only flag carrier!\n★ Can cross water briefly',
      'Speed: ██░░░  HP: ████░\nGun: 360° Auto-Aim Cannon\n★ Turret auto-tracks enemies\n★ Heavy armor',
      'Speed: ████░  HP: ██░░░\nGun: Strafe Guns\n★ Flies over terrain\n★ Detects mines (UrbanStrike)',
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
    if (Game.Input.isTouch) {
      ctx.fillText('Tap a vehicle bay to deploy  |  Swipe to browse', screenW / 2, descY + 10 + lines.length * 18 + 20);
    } else {
      ctx.fillText('Press ENTER/CLICK to deploy  |  A/D or ←/→ to browse', screenW / 2, descY + 10 + lines.length * 18 + 20);
    }
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

    if (Game.Input.isTouch) {
      renderHowToPlayTouch();
    } else {
      renderHowToPlayDesktop();
    }
  }

  function renderHowToPlayTouch() {
    var cx = screenW / 2;
    var topY = 70;

    // --- Objective banner ---
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Capture the enemy flag & return it to your base!', cx, topY);
    ctx.fillStyle = '#aaa';
    ctx.font = '12px monospace';
    ctx.fillText('First to 3 captures wins the round.', cx, topY + 18);

    // --- Diagram area ---
    var diagY = topY + 50;
    var diagH = Math.min(200, screenH * 0.32);
    var diagW = Math.min(screenW - 40, 420);
    var diagX = cx - diagW / 2;

    // Diagram background (simulated phone screen)
    ctx.fillStyle = 'rgba(40,40,40,0.8)';
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1.5;
    roundRect(ctx, diagX, diagY, diagW, diagH, 10);
    ctx.fill();
    ctx.stroke();

    // --- Left joystick ---
    var jR = Math.min(36, diagH * 0.17);
    var ljX = diagX + diagW * 0.18;
    var ljY = diagY + diagH * 0.55;

    // Outer ring
    ctx.beginPath();
    ctx.arc(ljX, ljY, jR, 0, Math.PI * 2);
    ctx.strokeStyle = '#66aaff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Thumb dot
    ctx.beginPath();
    ctx.arc(ljX + jR * 0.25, ljY - jR * 0.2, jR * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(102,170,255,0.5)';
    ctx.fill();
    // Arrows
    drawArrowMini(ctx, ljX, ljY - jR + 4, 0, '#66aaff');   // up
    drawArrowMini(ctx, ljX, ljY + jR - 4, Math.PI, '#66aaff'); // down
    drawArrowMini(ctx, ljX - jR + 4, ljY, Math.PI * 1.5, '#66aaff'); // left
    drawArrowMini(ctx, ljX + jR - 4, ljY, Math.PI * 0.5, '#66aaff'); // right
    // Label
    ctx.fillStyle = '#66aaff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MOVE', ljX, ljY + jR + 16);

    // --- Right joystick ---
    var rjX = diagX + diagW * 0.82;
    var rjY = diagY + diagH * 0.55;

    ctx.beginPath();
    ctx.arc(rjX, rjY, jR, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff5555';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Crosshair
    ctx.beginPath();
    ctx.moveTo(rjX - jR * 0.5, rjY); ctx.lineTo(rjX + jR * 0.5, rjY);
    ctx.moveTo(rjX, rjY - jR * 0.5); ctx.lineTo(rjX, rjY + jR * 0.5);
    ctx.strokeStyle = 'rgba(255,85,85,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#ff5555';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AIM', rjX, rjY + jR + 16);

    // --- Buttons (bottom middle-right area) ---
    var btnW = 30, btnH = 18, btnGap = 6;
    var btnX = diagX + diagW * 0.55;
    var btnY = diagY + diagH * 0.7;

    // Fire button
    ctx.fillStyle = 'rgba(255,0,0,0.4)';
    roundRect(ctx, btnX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    roundRect(ctx, btnX, btnY, btnW, btnH, 4);
    ctx.stroke();
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE', btnX + btnW / 2, btnY + 13);

    // Auto button
    var autoX = btnX + btnW + btnGap;
    ctx.fillStyle = 'rgba(0,180,0,0.3)';
    roundRect(ctx, autoX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = '#44cc44';
    ctx.lineWidth = 1;
    roundRect(ctx, autoX, btnY, btnW, btnH, 4);
    ctx.stroke();
    ctx.fillStyle = '#44cc44';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('AUTO', autoX + btnW / 2, btnY + 13);

    // Special button
    var specX = autoX + btnW + btnGap;
    ctx.fillStyle = 'rgba(255,170,0,0.3)';
    roundRect(ctx, specX, btnY, btnW, btnH, 4);
    ctx.fill();
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1;
    roundRect(ctx, specX, btnY, btnW, btnH, 4);
    ctx.stroke();
    ctx.fillStyle = '#ffaa00';
    ctx.font = 'bold 7px monospace';
    ctx.fillText('SPEC', specX + btnW / 2, btnY + 13);

    // Pause icon (top center of diagram)
    var pauseX = diagX + diagW * 0.5;
    var pauseY = diagY + 16;
    ctx.fillStyle = '#aaa';
    ctx.fillRect(pauseX - 5, pauseY - 5, 3, 10);
    ctx.fillRect(pauseX + 2, pauseY - 5, 3, 10);
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSE', pauseX, pauseY + 18);

    // --- Tips list ---
    var tipY = diagY + diagH + 28;
    var tips = [
      { icon: '🏁', text: 'Only JEEP can carry the flag!' },
      { icon: '⛽', text: 'Vehicles have limited fuel & ammo' },
      { icon: '🔧', text: 'Return to base or depots to resupply' },
      { icon: '💥', text: 'Destroy walls to create shortcuts' },
      { icon: '🚁', text: 'UrbanStrike flies over everything' },
      { icon: '📱', text: 'Play in landscape for best experience' }
    ];

    ctx.textAlign = 'center';
    var tipSpacing = Math.min(20, (screenH - tipY - 40) / tips.length);
    tips.forEach(function (tip, i) {
      ctx.fillStyle = '#ffcc00';
      ctx.font = '13px sans-serif';
      ctx.fillText(tip.icon, cx - diagW * 0.38, tipY + i * tipSpacing + 1);
      ctx.fillStyle = '#ccc';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tip.text, cx - diagW * 0.32, tipY + i * tipSpacing);
      ctx.textAlign = 'center';
    });

    // --- Footer ---
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Tap anywhere to return', cx, screenH - 18);
  }

  function renderHowToPlayDesktop() {
    var lines = [
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
      '║  • UrbanStrike flies over everything     ║',
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
    ctx.textAlign = 'center';
    lines.forEach(function (line, i) {
      ctx.fillText(line, screenW / 2, 90 + i * 20);
    });
  }

  // Helper: draw a rounded rectangle path
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  // Helper: draw a small directional arrow for joystick diagrams
  function drawArrowMini(c, x, y, rot, color) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.beginPath();
    c.moveTo(0, -5);
    c.lineTo(-3, 0);
    c.lineTo(3, 0);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.restore();
  }

  /* ========== HUD (In-Game) ========== */
  function renderHUD(player, score, flags, gameTime, jeepLives, currentRound, roundsWon) {
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

    // Round indicator
    if (currentRound) {
      ctx.fillStyle = '#ff9900';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('ROUND ' + currentRound + '/10', screenW / 2, 42);
      if (roundsWon) {
        ctx.fillStyle = '#888';
        ctx.font = '10px monospace';
        ctx.fillText('Won: ' + (roundsWon.team1 || 0) + ' - ' + (roundsWon.team2 || 0), screenW / 2, 56);
      }
    } else {
      ctx.fillStyle = '#666';
      ctx.font = '10px monospace';
      ctx.fillText('First to 3', screenW / 2, 42);
    }

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
      if (Game.Input.isTouch) {
        ctx.fillText('Tap SWAP to return to base & swap vehicle', screenW / 2, screenH - 55);
      } else {
        ctx.fillText('Press [R] to return to base & swap vehicle', screenW / 2, screenH - 55);
      }
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

  /* ========== ROUND STATS SCREEN ========== */
  function renderRoundStats(roundWinner, score, roundStats, currentRound, roundsWon, timer) {
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, screenW, screenH);

    var cx = screenW / 2;
    var topY = 60;

    // Title
    ctx.fillStyle = '#ff9900';
    ctx.font = 'bold 32px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND ' + currentRound + ' COMPLETE', cx, topY);

    // Round winner
    var isBlue = roundWinner === 1;
    ctx.fillStyle = isBlue ? '#3388ff' : '#ff4444';
    ctx.font = 'bold 22px monospace';
    ctx.fillText((isBlue ? 'BLUE' : 'RED') + ' WINS THE ROUND!', cx, topY + 40);

    // Flag score this round
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText(score.team1 + ' - ' + score.team2, cx, topY + 70);

    // Stats table
    var tableY = topY + 110;
    var colW = 160;
    var headers = ['', 'BLUE', 'RED', 'YOU'];
    var rows = [
      ['Kills', roundStats.team1.kills, roundStats.team2.kills, roundStats.player.kills],
      ['Deaths', roundStats.team1.deaths, roundStats.team2.deaths, roundStats.player.deaths],
      ['Flags', roundStats.team1.flags, roundStats.team2.flags, roundStats.player.flags],
      ['Turrets', roundStats.team1.turretsKilled, roundStats.team2.turretsKilled, roundStats.player.turretsKilled]
    ];

    // Header row
    ctx.font = 'bold 14px monospace';
    for (var h = 0; h < headers.length; h++) {
      ctx.fillStyle = h === 1 ? '#66aaff' : h === 2 ? '#ff7777' : h === 3 ? '#ffcc00' : '#aaa';
      ctx.textAlign = h === 0 ? 'right' : 'center';
      ctx.fillText(headers[h], cx - 240 + h * colW, tableY);
    }

    // Data rows
    ctx.font = '14px monospace';
    for (var r = 0; r < rows.length; r++) {
      var rowY = tableY + 28 + r * 26;
      for (var c = 0; c < rows[r].length; c++) {
        ctx.fillStyle = c === 0 ? '#aaa' : c === 1 ? '#88bbff' : c === 2 ? '#ff9999' : '#ffdd66';
        ctx.textAlign = c === 0 ? 'right' : 'center';
        ctx.fillText('' + rows[r][c], cx - 240 + c * colW, rowY);
      }
    }

    // Overall series score
    ctx.fillStyle = '#ff9900';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SERIES: ' + (roundsWon.team1 || 0) + ' - ' + (roundsWon.team2 || 0), cx, tableY + 160);

    // Timer / skip prompt
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    var remaining = Math.max(0, Math.ceil(timer));
    var pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    if (Game.Input.isTouch) {
      ctx.fillText('Next round in ' + remaining + 's  (tap to skip)', cx, screenH - 40);
    } else {
      ctx.fillText('Next round in ' + remaining + 's  (ENTER to skip)', cx, screenH - 40);
    }
    ctx.globalAlpha = 1;
  }

  /* ========== FINAL STATS SCREEN ========== */
  function renderFinalStats(winner, roundsWon, allRoundStats, maxRounds) {
    ctx.fillStyle = '#0a0a1a';
    ctx.fillRect(0, 0, screenW, screenH);

    var cx = screenW / 2;
    var topY = 50;

    // Title
    var isBlue = winner === 1;
    ctx.fillStyle = isBlue ? '#3388ff' : '#ff4444';
    ctx.font = 'bold 36px monospace';
    ctx.textAlign = 'center';
    ctx.fillText((isBlue ? 'BLUE' : 'RED') + ' WINS THE GAME!', cx, topY);

    // Series result
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px monospace';
    ctx.fillText('Rounds Won: ' + (roundsWon.team1 || 0) + ' - ' + (roundsWon.team2 || 0), cx, topY + 45);

    // Aggregate stats from all rounds
    var totals = {
      player: { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
      team1: { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
      team2: { kills: 0, deaths: 0, flags: 0, turretsKilled: 0 },
      totalTime: 0
    };
    for (var i = 0; i < allRoundStats.length; i++) {
      var rs = allRoundStats[i];
      totals.player.kills += rs.player.kills;
      totals.player.deaths += rs.player.deaths;
      totals.player.flags += rs.player.flags;
      totals.player.turretsKilled += rs.player.turretsKilled;
      totals.team1.kills += rs.team1.kills;
      totals.team1.deaths += rs.team1.deaths;
      totals.team1.flags += rs.team1.flags;
      totals.team1.turretsKilled += rs.team1.turretsKilled;
      totals.team2.kills += rs.team2.kills;
      totals.team2.deaths += rs.team2.deaths;
      totals.team2.flags += rs.team2.flags;
      totals.team2.turretsKilled += rs.team2.turretsKilled;
      totals.totalTime += rs.time;
    }

    // Total time
    var tm = Math.floor(totals.totalTime / 60);
    var ts = Math.floor(totals.totalTime % 60);
    ctx.fillStyle = '#aaa';
    ctx.font = '14px monospace';
    ctx.fillText('Total Play Time: ' + tm + ':' + (ts < 10 ? '0' : '') + ts, cx, topY + 75);

    // Stats table
    var tableY = topY + 110;
    var colW = 160;
    var headers = ['', 'BLUE', 'RED', 'YOU'];
    var rows = [
      ['Kills', totals.team1.kills, totals.team2.kills, totals.player.kills],
      ['Deaths', totals.team1.deaths, totals.team2.deaths, totals.player.deaths],
      ['Flags', totals.team1.flags, totals.team2.flags, totals.player.flags],
      ['Turrets', totals.team1.turretsKilled, totals.team2.turretsKilled, totals.player.turretsKilled]
    ];

    ctx.font = 'bold 14px monospace';
    for (var h = 0; h < headers.length; h++) {
      ctx.fillStyle = h === 1 ? '#66aaff' : h === 2 ? '#ff7777' : h === 3 ? '#ffcc00' : '#aaa';
      ctx.textAlign = h === 0 ? 'right' : 'center';
      ctx.fillText(headers[h], cx - 240 + h * colW, tableY);
    }

    ctx.font = '14px monospace';
    for (var r = 0; r < rows.length; r++) {
      var rowY = tableY + 28 + r * 26;
      for (var c = 0; c < rows[r].length; c++) {
        ctx.fillStyle = c === 0 ? '#aaa' : c === 1 ? '#88bbff' : c === 2 ? '#ff9999' : '#ffdd66';
        ctx.textAlign = c === 0 ? 'right' : 'center';
        ctx.fillText('' + rows[r][c], cx - 240 + c * colW, rowY);
      }
    }

    // Per-round mini results
    var prY = tableY + 160;
    ctx.fillStyle = '#999';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ROUND RESULTS', cx, prY);
    ctx.font = '12px monospace';
    for (var ri = 0; ri < allRoundStats.length; ri++) {
      var rr = allRoundStats[ri];
      var rrY = prY + 22 + ri * 20;
      var winColor = rr.winner === 1 ? '#66aaff' : '#ff7777';
      var winLabel = rr.winner === 1 ? 'Blue' : 'Red';
      ctx.fillStyle = winColor;
      ctx.fillText('R' + rr.round + ': ' + winLabel + ' wins  (' + rr.score.team1 + '-' + rr.score.team2 + ')', cx, rrY);
    }

    // MVP (player K/D ratio)
    var kd = totals.player.deaths > 0 ? (totals.player.kills / totals.player.deaths).toFixed(1) : totals.player.kills + '.0';
    var mvpY = prY + 30 + allRoundStats.length * 20 + 20;
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('YOUR K/D: ' + kd + '  |  FLAGS: ' + totals.player.flags + '  |  TURRETS: ' + totals.player.turretsKilled, cx, mvpY);

    // Prompt
    ctx.fillStyle = '#888';
    ctx.font = '13px monospace';
    var pulse = Math.sin(Date.now() * 0.004) * 0.3 + 0.7;
    ctx.globalAlpha = pulse;
    if (Game.Input.isTouch) {
      ctx.fillText('Tap to play again', cx, screenH - 30);
    } else {
      ctx.fillText('Press ENTER to play again  |  ESC for menu', cx, screenH - 30);
    }
    ctx.globalAlpha = 1;

    // Skull decorations
    var skull = Game.Sprites.sprites.skull;
    if (skull) {
      var bounce = Math.sin(Date.now() * 0.005) * 8;
      ctx.drawImage(skull, cx - 300 + bounce, topY - 20, 40, 40);
      ctx.drawImage(skull, cx + 260 - bounce, topY - 20, 40, 40);
    }
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
    if (Game.Input.isTouch) {
      ctx.fillText('Tap to play again', screenW / 2, screenH / 2 + 60);
    } else {
      ctx.fillText('Press ENTER to play again or ESC for menu', screenW / 2, screenH / 2 + 60);
    }
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

  /* ========== TOUCH JOYSTICK & HUD CONTROLS ========== */
  function renderTouchControls(playerVehicle) {
    if (!Game.Input.isTouch && !Game.Input.touchActive) return;

    var input = Game.Input;
    var pad = 20;
    var safeBottom = 30; // safe-area bottom inset

    // Clear previous touch buttons
    input.clearTouchButtons();

    // ===== Left movement joystick =====
    var ljCx = pad + 70;
    var ljCy = screenH - safeBottom - 80;
    var ljOuterR = 55;
    var ljInnerR = 22;

    // Outer ring
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(ljCx, ljCy, ljOuterR, 0, Math.PI * 2);
    ctx.stroke();

    // Inner thumb
    var mjDx = Game.clamp(input.moveJoystick.dx, -ljOuterR, ljOuterR);
    var mjDy = Game.clamp(input.moveJoystick.dy, -ljOuterR, ljOuterR);
    ctx.fillStyle = input.moveJoystick.active ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(ljCx + mjDx, ljCy + mjDy, ljInnerR, 0, Math.PI * 2);
    ctx.fill();

    // Label
    if (!input.moveJoystick.active) {
      ctx.fillStyle = 'rgba(255,255,255,0.3)';
      ctx.font = '9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('MOVE', ljCx, ljCy + 4);
    }

    // ===== Right aim joystick =====
    var rjCx = screenW - pad - 70;
    var rjCy = screenH - safeBottom - 80;
    var rjOuterR = 45;
    var rjInnerR = 18;

    // Outer ring
    ctx.strokeStyle = 'rgba(255,100,0,0.25)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(rjCx, rjCy, rjOuterR, 0, Math.PI * 2);
    ctx.stroke();

    // Inner thumb
    var ajDx = Game.clamp(input.aimJoystick.dx, -rjOuterR, rjOuterR);
    var ajDy = Game.clamp(input.aimJoystick.dy, -rjOuterR, rjOuterR);
    ctx.fillStyle = input.aimJoystick.active ? 'rgba(255,100,0,0.4)' : 'rgba(255,100,0,0.15)';
    ctx.beginPath();
    ctx.arc(rjCx + ajDx, rjCy + ajDy, rjInnerR, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = 'rgba(255,100,0,0.4)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    if (!input.aimJoystick.active) {
      ctx.fillText('AIM', rjCx, rjCy + 4);
    }

    // ===== Fire button =====
    var fireX = screenW - pad - 165;
    var fireY = screenH - safeBottom - 65;
    var fireR = 30;
    var firing = input.fireTouch.active || input.isShooting();

    ctx.strokeStyle = firing ? 'rgba(255,100,0,0.7)' : 'rgba(255,100,0,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(fireX, fireY, fireR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = firing ? 'rgba(255,100,0,0.3)' : 'rgba(255,100,0,0.1)';
    ctx.fill();
    ctx.fillStyle = firing ? 'rgba(255,150,50,0.9)' : 'rgba(255,100,0,0.6)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('FIRE', fireX, fireY + 4);

    input.registerTouchButton({ id: 'fire', x: fireX - fireR, y: fireY - fireR, w: fireR * 2, h: fireR * 2, action: 'fire' });

    // ===== Auto-fire toggle =====
    var afX = fireX;
    var afY = fireY - 70;
    var afW = 50, afH = 24;
    ctx.fillStyle = input.autoFire ? 'rgba(255,100,0,0.3)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(afX - afW / 2, afY - afH / 2, afW, afH);
    ctx.strokeStyle = input.autoFire ? '#ff6600' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.strokeRect(afX - afW / 2, afY - afH / 2, afW, afH);
    ctx.fillStyle = input.autoFire ? '#ff6600' : 'rgba(255,255,255,0.4)';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('AUTO', afX, afY + 3);

    input.registerTouchButton({ id: 'autofire', x: afX - afW / 2, y: afY - afH / 2, w: afW, h: afH, action: 'autofire' });

    // ===== Special action button (mine/swap) =====
    if (playerVehicle && playerVehicle.alive) {
      var spX = screenW - pad - 60;
      var spY = screenH - safeBottom - 160;
      var spW = 52, spH = 32;
      var isASV = playerVehicle.type === Game.VEH.ASV;
      var spLabel = isASV ? 'MINE' : 'SWAP';
      var spAction = isASV ? 'special' : 'swap';

      ctx.fillStyle = 'rgba(255,255,255,0.05)';
      ctx.fillRect(spX - spW / 2, spY - spH / 2, spW, spH);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(spX - spW / 2, spY - spH / 2, spW, spH);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(spLabel, spX, spY + 3);

      input.registerTouchButton({ id: 'special', x: spX - spW / 2, y: spY - spH / 2, w: spW, h: spH, action: spAction });
    }

    // ===== Pause button (top-right) =====
    var pX = screenW - 50;
    var pY = 14;
    var pW = 40, pH = 28;

    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(pX, pY, pW, pH);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pX, pY, pW, pH);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('⏸', pX + pW / 2, pY + pH / 2 + 4);

    input.registerTouchButton({ id: 'pause', x: pX, y: pY, w: pW, h: pH, action: 'pause' });
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

  /* ========== Pause/Exit Overlay (mobile) ========== */
  var pauseOverlayVisible = false;

  function showPauseOverlay() { pauseOverlayVisible = true; }
  function hidePauseOverlay() { pauseOverlayVisible = false; }
  function isPauseOverlayVisible() { return pauseOverlayVisible; }

  function renderPauseOverlay() {
    if (!pauseOverlayVisible) return;

    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, screenW, screenH);

    var cx = screenW / 2;
    var cy = screenH / 2;

    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold 28px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cx, cy - 80);

    // Resume button
    var btnW = 200, btnH = 50;
    var resumeY = cy - 30;
    var hover1 = isMouseInRect(cx - btnW / 2, resumeY, btnW, btnH);
    ctx.fillStyle = hover1 ? '#ff6600' : 'rgba(255,102,0,0.3)';
    ctx.fillRect(cx - btnW / 2, resumeY, btnW, btnH);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - btnW / 2, resumeY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('RESUME', cx, resumeY + 32);

    // Quit button
    var quitY = resumeY + 70;
    var hover2 = isMouseInRect(cx - btnW / 2, quitY, btnW, btnH);
    ctx.fillStyle = hover2 ? '#cc2222' : 'rgba(200,30,30,0.3)';
    ctx.fillRect(cx - btnW / 2, quitY, btnW, btnH);
    ctx.strokeStyle = '#cc2222';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - btnW / 2, quitY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.fillText('QUIT TO MENU', cx, quitY + 32);

    // Toggle music button
    var musicY = quitY + 70;
    var hover3 = isMouseInRect(cx - btnW / 2, musicY, btnW, btnH);
    ctx.fillStyle = hover3 ? '#336699' : 'rgba(50,100,150,0.3)';
    ctx.fillRect(cx - btnW / 2, musicY, btnW, btnH);
    ctx.strokeStyle = '#336699';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - btnW / 2, musicY, btnW, btnH);
    ctx.fillStyle = '#ccc';
    ctx.font = '14px monospace';
    ctx.fillText('TOGGLE MUSIC', cx, musicY + 32);
  }

  function getPauseOverlayClick() {
    updateMouse();
    var cx = screenW / 2;
    var cy = screenH / 2;
    var btnW = 200, btnH = 50;
    var resumeY = cy - 30;
    var quitY = resumeY + 70;
    var musicY = quitY + 70;
    if (isMouseInRect(cx - btnW / 2, resumeY, btnW, btnH)) return 'resume';
    if (isMouseInRect(cx - btnW / 2, quitY, btnW, btnH)) return 'quit';
    if (isMouseInRect(cx - btnW / 2, musicY, btnW, btnH)) return 'music';
    return null;
  }

  window.Game.UI = {
    init, resize,
    renderMenu, renderVehicleSelect, renderLobby, renderHowToPlay,
    renderHUD, renderGameOver, renderRespawn,
    renderRoundStats, renderFinalStats,
    renderTouchControls, renderNotifications,
    renderPauseOverlay, showPauseOverlay, hidePauseOverlay, isPauseOverlayVisible,
    getPauseOverlayClick,
    notify, updateNotifications, updateMouse,
    getMenuClick, getVehicleClick, getLobbyAction,
    startElevatorDeploy,
    set lobbyRooms(v) { lobbyRooms = v; },
    set lobbyStatus(v) { lobbyStatus = v; },
    get selectedMenuItem() { return selectedMenuItem; },
    set selectedMenuItem(v) { selectedMenuItem = v; }
  };
})();
