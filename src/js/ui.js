/* ============================================================
   ui.js - Menus, HUD, minimap, vehicle select, lobby,
   game over screen, score display, settings, username labels
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

  // Lobby data for enhanced lobby
  let _lobbyData = {
    rooms: [],
    status: '',
    inRoom: false,
    roomPlayers: [],
    playerTeam: 1,
    isHost: false,
    countdown: 0,
    readyStates: {},
    roomName: ''
  };

  // Settings state
  let _username = 'Player';

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

  /* ========== BACK BUTTON HELPER ========== */
  function _drawBackButton() {
    var s = Game.uiScale || 1;
    var bx = 12 * s;
    var by = 12 * s;
    var bw = 90 * s;
    var bh = 34 * s;
    var hover = isMouseInRect(bx, by, bw, bh);
    ctx.fillStyle = hover ? 'rgba(255,102,0,0.25)' : 'rgba(255,255,255,0.06)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = hover ? '#ff6600' : '#4a5a3a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = hover ? '#ff6600' : '#aaa';
    ctx.font = 'bold ' + Math.round(14 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('< BACK', bx + bw / 2, by + bh / 2 + 5 * s);
    return { x: bx, y: by, w: bw, h: bh };
  }

  var _lastBackBtn = null;

  function getBackClick() {
    updateMouse();
    if (_lastBackBtn) {
      if (isMouseInRect(_lastBackBtn.x, _lastBackBtn.y, _lastBackBtn.w, _lastBackBtn.h)) {
        return true;
      }
    }
    return false;
  }

  /* ========== CAMO PATTERN HELPER ========== */
  function _drawCamoBackground() {
    // Dark olive base
    ctx.fillStyle = '#1a1f14';
    ctx.fillRect(0, 0, screenW, screenH);

    // Subtle camo blobs
    var seed = 42;
    for (var i = 0; i < 60; i++) {
      seed = (seed * 16807 + 7) % 2147483647;
      var cx = (seed % screenW);
      seed = (seed * 16807 + 7) % 2147483647;
      var cy = (seed % screenH);
      seed = (seed * 16807 + 7) % 2147483647;
      var r = 30 + (seed % 80);
      seed = (seed * 16807 + 7) % 2147483647;
      var shade = seed % 3;
      var colors = ['rgba(42,48,32,0.4)', 'rgba(58,74,42,0.25)', 'rgba(30,36,22,0.35)'];
      ctx.fillStyle = colors[shade];
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.6, (seed % 314) / 100, 0, Math.PI * 2);
      ctx.fill();
    }

    // Subtle grid overlay
    ctx.strokeStyle = 'rgba(255,255,255,0.015)';
    ctx.lineWidth = 1;
    for (var y = 0; y < screenH; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(screenW, y);
      ctx.stroke();
    }
    for (var x = 0; x < screenW; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, screenH);
      ctx.stroke();
    }
  }

  /* ========== MAIN MENU ========== */
  function renderMenu() {
    _drawCamoBackground();

    var s = Game.uiScale || 1;
    var cx = screenW / 2;

    // Military-style horizontal lines at top
    ctx.strokeStyle = '#4a5a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 280 * s, 40 * s);
    ctx.lineTo(cx + 280 * s, 40 * s);
    ctx.stroke();

    // Title
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold ' + Math.round(36 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('DAMAGED TERRITORY', cx, 80 * s);

    // Subtitle
    ctx.fillStyle = '#8a9a6a';
    ctx.font = Math.round(13 * s) + 'px monospace';
    ctx.fillText('CAPTURE  THE  FLAG', cx, 102 * s);

    // Military-style horizontal lines below title
    ctx.strokeStyle = '#4a5a3a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 280 * s, 115 * s);
    ctx.lineTo(cx + 280 * s, 115 * s);
    ctx.stroke();

    // Logo sprite if available
    var logo = Game.Sprites.sprites.logo;
    if (logo) {
      var lw = Math.min(500 * s, screenW * 0.5);
      var lh = lw * (logo.height / logo.width);
      ctx.globalAlpha = 0.15;
      ctx.drawImage(logo, cx - lw / 2, 30 * s, lw, lh);
      ctx.globalAlpha = 1;
    }

    // Menu items (4 items now)
    var items = [
      { label: 'SINGLE PLAYER', desc: 'Battle against AI opponents' },
      { label: 'MULTIPLAYER', desc: 'Play online with others' },
      { label: 'SETTINGS', desc: 'Configure your game options' },
      { label: 'HOW TO PLAY', desc: 'Controls and objectives' }
    ];

    var startY = 150 * s;
    var itemH = 56 * s;
    var itemGap = 10 * s;
    var itemW = 340 * s;

    for (var i = 0; i < items.length; i++) {
      var y = startY + i * (itemH + itemGap);
      var isSelected = i === selectedMenuItem;
      var hover = isMouseInRect(cx - itemW / 2, y, itemW, itemH);

      // Background
      ctx.fillStyle = isSelected || hover ? 'rgba(255,102,0,0.12)' : 'rgba(255,255,255,0.03)';
      ctx.fillRect(cx - itemW / 2, y, itemW, itemH);

      // Border
      ctx.strokeStyle = isSelected || hover ? '#ff6600' : '#4a5a3a';
      ctx.lineWidth = isSelected ? 2.5 : 1;
      ctx.strokeRect(cx - itemW / 2, y, itemW, itemH);

      // Chevron decorations for selected
      if (isSelected || hover) {
        ctx.fillStyle = '#ff6600';
        ctx.font = 'bold ' + Math.round(14 * s) + 'px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('>>>', cx - itemW / 2 + 30 * s, y + itemH / 2 + 2);
        ctx.textAlign = 'left';
        ctx.fillText('<<<', cx + itemW / 2 - 30 * s, y + itemH / 2 + 2);
      }

      // Label
      ctx.fillStyle = isSelected || hover ? '#ff6600' : '#ccc';
      ctx.font = 'bold ' + Math.round(18 * s) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(items[i].label, cx, y + itemH / 2 - 4 * s);

      // Description
      ctx.fillStyle = isSelected || hover ? '#aa7733' : '#666';
      ctx.font = Math.round(11 * s) + 'px monospace';
      ctx.fillText(items[i].desc, cx, y + itemH / 2 + 14 * s);
    }

    // Footer separator
    var footY = screenH - 65 * s;
    ctx.strokeStyle = '#4a5a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 280 * s, footY);
    ctx.lineTo(cx + 280 * s, footY);
    ctx.stroke();

    // Credits
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold ' + Math.round(13 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Created by Quinsta & QuinstaJr', cx, footY + 20 * s);

    // Version & controls
    ctx.fillStyle = '#4a5a3a';
    ctx.font = Math.round(10 * s) + 'px monospace';
    ctx.fillText('v1.5.0 - Inspired by Return Fire (1995) - MIT License', cx, footY + 38 * s);
    if (Game.Input.isTouch) {
      ctx.fillText('Tap to select  |  Touch controls in-game', cx, footY + 52 * s);
    } else {
      ctx.fillText('WASD/Arrows to navigate | Enter to select | 1-4 select vehicle', cx, footY + 52 * s);
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

    // Back button at top-left
    _lastBackBtn = _drawBackButton();

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
    ctx.fillText('\u2699 VEHICLE BAY \u2699', screenW / 2, 40);

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
        for (let l = 0; l < jLives; l++) livesStr += '\u2665 ';
        ctx.fillText('LIVES: ' + livesStr, x + bayW / 2, bayY + 28);
      } else {
        ctx.fillStyle = '#555';
        ctx.font = '10px monospace';
        ctx.fillText('[' + (i + 1) + ']', x + bayW / 2, bayY + bayH + 14);
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
  function renderLobby(roomsOrData, status) {
    // Support both old-style (rooms, status) and new lobbyData
    var lobbyData;
    if (roomsOrData && typeof roomsOrData === 'object' && !Array.isArray(roomsOrData) && roomsOrData.hasOwnProperty('inRoom')) {
      lobbyData = roomsOrData;
    } else {
      lobbyData = {
        rooms: roomsOrData || lobbyRooms || [],
        status: status || lobbyStatus || '',
        inRoom: _lobbyData.inRoom || false,
        roomPlayers: _lobbyData.roomPlayers || [],
        playerTeam: _lobbyData.playerTeam || 1,
        isHost: _lobbyData.isHost || false,
        countdown: _lobbyData.countdown || 0,
        readyStates: _lobbyData.readyStates || {},
        roomName: _lobbyData.roomName || ''
      };
    }

    // If in a room, show the full lobby screen
    if (lobbyData.inRoom) {
      _renderInRoomLobby(lobbyData);
      return;
    }

    // Otherwise show room browser
    _renderRoomBrowser(lobbyData);
  }

  function _renderRoomBrowser(lobbyData) {
    _drawCamoBackground();

    var s = Game.uiScale || 1;
    var cx = screenW / 2;

    // Back button
    _lastBackBtn = _drawBackButton();

    // Title
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold ' + Math.round(24 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MULTIPLAYER LOBBY', cx, 50 * s);

    // Status
    ctx.fillStyle = '#8a9a6a';
    ctx.font = Math.round(13 * s) + 'px monospace';
    ctx.fillText(lobbyData.status || 'Connecting to server...', cx, 75 * s);

    // Separator
    ctx.strokeStyle = '#4a5a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 220 * s, 88 * s);
    ctx.lineTo(cx + 220 * s, 88 * s);
    ctx.stroke();

    // Room list
    var rooms = lobbyData.rooms;
    var startY = 105 * s;
    var roomH = 38 * s;
    var roomW = 420 * s;

    if (rooms && rooms.length > 0) {
      for (var i = 0; i < rooms.length; i++) {
        var y = startY + i * (roomH + 4);
        var hover = isMouseInRect(cx - roomW / 2, y, roomW, roomH);

        ctx.fillStyle = hover ? 'rgba(255,102,0,0.15)' : 'rgba(255,255,255,0.04)';
        ctx.fillRect(cx - roomW / 2, y, roomW, roomH);
        ctx.strokeStyle = hover ? '#ff6600' : '#4a5a3a';
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - roomW / 2, y, roomW, roomH);

        ctx.fillStyle = '#ccc';
        ctx.font = Math.round(13 * s) + 'px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(rooms[i].name, cx - roomW / 2 + 14 * s, y + roomH / 2 + 4 * s);

        ctx.textAlign = 'right';
        ctx.fillStyle = '#888';
        ctx.fillText(rooms[i].players + '/' + rooms[i].maxPlayers + ' players', cx + roomW / 2 - 14 * s, y + roomH / 2 + 4 * s);
      }
    } else {
      ctx.fillStyle = '#666';
      ctx.font = Math.round(13 * s) + 'px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No rooms available', cx, startY + 20 * s);
    }

    // Create Room button
    var btnW = 210 * s;
    var btnH = 40 * s;
    var btnY = screenH - 160 * s;
    var btnHover = isMouseInRect(cx - btnW / 2, btnY, btnW, btnH);
    ctx.fillStyle = btnHover ? '#ff6600' : '#553300';
    ctx.fillRect(cx - btnW / 2, btnY, btnW, btnH);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - btnW / 2, btnY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(14 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('CREATE ROOM', cx, btnY + btnH / 2 + 5 * s);

    // Refresh button
    var refY = btnY + btnH + 12 * s;
    var refHover = isMouseInRect(cx - btnW / 2, refY, btnW, btnH);
    ctx.fillStyle = refHover ? '#336699' : '#223355';
    ctx.fillRect(cx - btnW / 2, refY, btnW, btnH);
    ctx.strokeStyle = '#4488aa';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx - btnW / 2, refY, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.fillText('REFRESH', cx, refY + btnH / 2 + 5 * s);

    // ESC hint
    ctx.fillStyle = '#4a5a3a';
    ctx.font = Math.round(11 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC for back', cx, screenH - 18 * s);
  }

  function _renderInRoomLobby(lobbyData) {
    _drawCamoBackground();

    var s = Game.uiScale || 1;
    var cx = screenW / 2;

    // Back (leave) button at top-left
    _lastBackBtn = _drawBackButton();

    // Title
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold ' + Math.round(26 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('GAME LOBBY', cx, 44 * s);

    if (lobbyData.roomName) {
      ctx.fillStyle = '#8a9a6a';
      ctx.font = Math.round(12 * s) + 'px monospace';
      ctx.fillText('Room: ' + lobbyData.roomName, cx, 64 * s);
    }

    // Separator
    ctx.strokeStyle = '#4a5a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 300 * s, 76 * s);
    ctx.lineTo(cx + 300 * s, 76 * s);
    ctx.stroke();

    // Two columns: TEAM 1 (BLUE) left, TEAM 2 (RED) right
    var colW = 260 * s;
    var colGap = 40 * s;
    var colLeft = cx - colGap / 2 - colW;
    var colRight = cx + colGap / 2;
    var headerY = 95 * s;
    var slotStartY = 120 * s;
    var slotH = 42 * s;
    var slotGap = 6 * s;

    // Team 1 header
    ctx.fillStyle = '#66aaff';
    ctx.font = 'bold ' + Math.round(16 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TEAM 1 (BLUE)', colLeft + colW / 2, headerY);

    // Team 2 header
    ctx.fillStyle = '#ff7777';
    ctx.fillText('TEAM 2 (RED)', colRight + colW / 2, headerY);

    // Draw slots for each team (4 per team)
    var players = lobbyData.roomPlayers || [];
    var readyStates = lobbyData.readyStates || {};

    for (var team = 1; team <= 2; team++) {
      var colX = team === 1 ? colLeft : colRight;
      var teamColor = team === 1 ? '#66aaff' : '#ff7777';
      var teamDarkColor = team === 1 ? 'rgba(102,170,255,0.08)' : 'rgba(255,119,119,0.08)';
      var teamBorderColor = team === 1 ? 'rgba(102,170,255,0.3)' : 'rgba(255,119,119,0.3)';

      // Get players on this team
      var teamPlayers = [];
      for (var p = 0; p < players.length; p++) {
        if (players[p].team === team) teamPlayers.push(players[p]);
      }

      for (var slot = 0; slot < 4; slot++) {
        var sy = slotStartY + slot * (slotH + slotGap);
        var player = teamPlayers[slot] || null;
        var hover = isMouseInRect(colX, sy, colW, slotH);

        // Slot background
        ctx.fillStyle = player ? teamDarkColor : 'rgba(255,255,255,0.02)';
        ctx.fillRect(colX, sy, colW, slotH);

        // Slot border
        ctx.strokeStyle = hover && !player ? '#ff6600' : (player ? teamBorderColor : '#3a4a2a');
        ctx.lineWidth = 1;
        ctx.strokeRect(colX, sy, colW, slotH);

        if (player) {
          // Player name
          ctx.fillStyle = player.isAI ? '#aa8844' : '#ddd';
          ctx.font = 'bold ' + Math.round(13 * s) + 'px monospace';
          ctx.textAlign = 'left';
          var nameStr = player.name || (player.isAI ? 'AI Bot' : 'Player');
          ctx.fillText(nameStr, colX + 12 * s, sy + slotH / 2 + 2 * s);

          // Ready indicator
          var isReady = readyStates[player.id] || player.ready || false;
          ctx.fillStyle = isReady ? '#44cc44' : '#cc4444';
          ctx.font = 'bold ' + Math.round(14 * s) + 'px monospace';
          ctx.textAlign = 'right';
          ctx.fillText(isReady ? '\u2713' : '\u2717', colX + colW - 12 * s, sy + slotH / 2 + 4 * s);

          // AI label
          if (player.isAI) {
            ctx.fillStyle = '#887744';
            ctx.font = Math.round(9 * s) + 'px monospace';
            ctx.textAlign = 'left';
            ctx.fillText('AI', colX + 12 * s, sy + slotH / 2 + 14 * s);
          }
        } else {
          // Empty slot
          ctx.fillStyle = hover ? '#ff6600' : '#555';
          ctx.font = Math.round(12 * s) + 'px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(hover ? '+ ADD AI' : 'EMPTY', colX + colW / 2, sy + slotH / 2 + 4 * s);
        }
      }
    }

    // Buttons row at bottom
    var btnW = 150 * s;
    var btnH = 38 * s;
    var btnGap = 14 * s;
    var btnRow1Y = slotStartY + 4 * (slotH + slotGap) + 16 * s;
    var btnRow2Y = btnRow1Y + btnH + 10 * s;

    // --- READY / NOT READY toggle ---
    var rBtnX = cx - btnW - btnGap / 2;
    var isPlayerReady = readyStates[lobbyData.playerId] || false;
    var readyHover = isMouseInRect(rBtnX, btnRow1Y, btnW, btnH);
    ctx.fillStyle = readyHover ? (isPlayerReady ? '#cc4444' : '#44cc44') : (isPlayerReady ? 'rgba(200,60,60,0.3)' : 'rgba(60,200,60,0.3)');
    ctx.fillRect(rBtnX, btnRow1Y, btnW, btnH);
    ctx.strokeStyle = isPlayerReady ? '#cc4444' : '#44cc44';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rBtnX, btnRow1Y, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(13 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(isPlayerReady ? 'NOT READY' : 'READY', rBtnX + btnW / 2, btnRow1Y + btnH / 2 + 5 * s);

    // --- SWITCH TEAM button ---
    var stBtnX = cx + btnGap / 2;
    var stHover = isMouseInRect(stBtnX, btnRow1Y, btnW, btnH);
    ctx.fillStyle = stHover ? 'rgba(255,170,0,0.4)' : 'rgba(255,170,0,0.15)';
    ctx.fillRect(stBtnX, btnRow1Y, btnW, btnH);
    ctx.strokeStyle = '#ffaa00';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(stBtnX, btnRow1Y, btnW, btnH);
    ctx.fillStyle = '#fff';
    ctx.fillText('SWITCH TEAM', stBtnX + btnW / 2, btnRow1Y + btnH / 2 + 5 * s);

    // Row 2 buttons
    if (lobbyData.isHost) {
      // START GAME button (host only)
      var allReady = true;
      for (var pIdx = 0; pIdx < players.length; pIdx++) {
        if (!players[pIdx].isAI && !(readyStates[players[pIdx].id] || players[pIdx].ready)) {
          allReady = false;
          break;
        }
      }

      if (lobbyData.countdown > 0) {
        // CANCEL button during countdown
        var cancelHover = isMouseInRect(cx - btnW / 2, btnRow2Y, btnW, btnH);
        ctx.fillStyle = cancelHover ? '#cc2222' : 'rgba(200,30,30,0.3)';
        ctx.fillRect(cx - btnW / 2, btnRow2Y, btnW, btnH);
        ctx.strokeStyle = '#cc2222';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - btnW / 2, btnRow2Y, btnW, btnH);
        ctx.fillStyle = '#fff';
        ctx.fillText('CANCEL', cx, btnRow2Y + btnH / 2 + 5 * s);
      } else {
        var startHover = isMouseInRect(cx - btnW / 2, btnRow2Y, btnW, btnH) && allReady;
        ctx.fillStyle = !allReady ? 'rgba(100,100,100,0.2)' : (startHover ? '#ff6600' : 'rgba(255,102,0,0.3)');
        ctx.fillRect(cx - btnW / 2, btnRow2Y, btnW, btnH);
        ctx.strokeStyle = allReady ? '#ff6600' : '#555';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - btnW / 2, btnRow2Y, btnW, btnH);
        ctx.fillStyle = allReady ? '#fff' : '#666';
        ctx.fillText('START GAME', cx, btnRow2Y + btnH / 2 + 5 * s);
      }
    }

    // LEAVE ROOM button (bottom right area)
    var leaveW = 130 * s;
    var leaveH = 34 * s;
    var leaveX = screenW - leaveW - 16 * s;
    var leaveY = screenH - leaveH - 16 * s;
    var leaveHover = isMouseInRect(leaveX, leaveY, leaveW, leaveH);
    ctx.fillStyle = leaveHover ? 'rgba(200,30,30,0.4)' : 'rgba(200,30,30,0.15)';
    ctx.fillRect(leaveX, leaveY, leaveW, leaveH);
    ctx.strokeStyle = '#cc4444';
    ctx.lineWidth = 1;
    ctx.strokeRect(leaveX, leaveY, leaveW, leaveH);
    ctx.fillStyle = leaveHover ? '#ff4444' : '#cc6666';
    ctx.font = 'bold ' + Math.round(12 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('LEAVE ROOM', leaveX + leaveW / 2, leaveY + leaveH / 2 + 4 * s);

    // Countdown display
    if (lobbyData.countdown > 0) {
      var countVal = Math.ceil(lobbyData.countdown);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(cx - 80 * s, btnRow2Y + btnH + 10 * s, 160 * s, 60 * s);

      ctx.fillStyle = '#ff6600';
      ctx.font = 'bold ' + Math.round(42 * s) + 'px monospace';
      ctx.textAlign = 'center';
      var countPulse = Math.sin(Date.now() * 0.008) * 0.2 + 0.8;
      ctx.globalAlpha = countPulse;
      ctx.fillText('' + countVal, cx, btnRow2Y + btnH + 52 * s);
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#aaa';
      ctx.font = Math.round(11 * s) + 'px monospace';
      ctx.fillText('Starting...', cx, btnRow2Y + btnH + 68 * s);
    }

    // ESC hint
    ctx.fillStyle = '#4a5a3a';
    ctx.font = Math.round(10 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC for back', cx, screenH - 6 * s);
  }

  /* ========== SETTINGS ========== */
  // Track layout rects for click detection
  var _settingsRects = { usernameField: null, saveBtn: null, backBtn: null };

  function renderSettings() {
    _drawCamoBackground();

    var s = Game.uiScale || 1;
    var cx = screenW / 2;

    // Back button
    _lastBackBtn = _drawBackButton();

    // Title
    ctx.fillStyle = '#ff6600';
    ctx.font = 'bold ' + Math.round(28 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SETTINGS', cx, 60 * s);

    // Separator
    ctx.strokeStyle = '#4a5a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 200 * s, 78 * s);
    ctx.lineTo(cx + 200 * s, 78 * s);
    ctx.stroke();

    // Username label
    var fieldY = 120 * s;
    ctx.fillStyle = '#ccc';
    ctx.font = 'bold ' + Math.round(14 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('USERNAME', cx, fieldY);

    // Username input field
    var fieldW = 280 * s;
    var fieldH = 40 * s;
    var fieldX = cx - fieldW / 2;
    var fieldTop = fieldY + 10 * s;

    var fHover = isMouseInRect(fieldX, fieldTop, fieldW, fieldH);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(fieldX, fieldTop, fieldW, fieldH);
    ctx.strokeStyle = fHover ? '#ff6600' : '#4a5a3a';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(fieldX, fieldTop, fieldW, fieldH);

    // Username text
    ctx.fillStyle = '#fff';
    ctx.font = Math.round(16 * s) + 'px monospace';
    ctx.textAlign = 'center';
    var dispName = _username || '';
    // Cursor blink
    var cursorVisible = Math.floor(Date.now() / 500) % 2 === 0;
    ctx.fillText(dispName + (cursorVisible ? '|' : ''), cx, fieldTop + fieldH / 2 + 6 * s);

    _settingsRects.usernameField = { x: fieldX, y: fieldTop, w: fieldW, h: fieldH };

    // SAVE button
    var saveBtnW = 160 * s;
    var saveBtnH = 42 * s;
    var saveBtnY = fieldTop + fieldH + 30 * s;
    var saveBtnX = cx - saveBtnW / 2;
    var saveHover = isMouseInRect(saveBtnX, saveBtnY, saveBtnW, saveBtnH);

    ctx.fillStyle = saveHover ? '#ff6600' : 'rgba(255,102,0,0.3)';
    ctx.fillRect(saveBtnX, saveBtnY, saveBtnW, saveBtnH);
    ctx.strokeStyle = '#ff6600';
    ctx.lineWidth = 2;
    ctx.strokeRect(saveBtnX, saveBtnY, saveBtnW, saveBtnH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold ' + Math.round(16 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SAVE', cx, saveBtnY + saveBtnH / 2 + 6 * s);

    _settingsRects.saveBtn = { x: saveBtnX, y: saveBtnY, w: saveBtnW, h: saveBtnH };

    // Hint
    ctx.fillStyle = '#4a5a3a';
    ctx.font = Math.round(11 * s) + 'px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Press ESC for back', cx, screenH - 20 * s);
  }

  function getSettingsAction() {
    updateMouse();
    // Check back button
    if (_lastBackBtn && isMouseInRect(_lastBackBtn.x, _lastBackBtn.y, _lastBackBtn.w, _lastBackBtn.h)) {
      return 'back';
    }
    // Check save button
    if (_settingsRects.saveBtn && isMouseInRect(_settingsRects.saveBtn.x, _settingsRects.saveBtn.y, _settingsRects.saveBtn.w, _settingsRects.saveBtn.h)) {
      return 'save';
    }
    // Check username field
    if (_settingsRects.usernameField && isMouseInRect(_settingsRects.usernameField.x, _settingsRects.usernameField.y, _settingsRects.usernameField.w, _settingsRects.usernameField.h)) {
      return 'username_field';
    }
    return null;
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
      { icon: '\uD83C\uDFC1', text: 'Only JEEP can carry the flag!' },
      { icon: '\u26FD', text: 'Vehicles have limited fuel & ammo' },
      { icon: '\uD83D\uDD27', text: 'Return to base or depots to resupply' },
      { icon: '\uD83D\uDCA5', text: 'Destroy walls to create shortcuts' },
      { icon: '\uD83D\uDE81', text: 'UrbanStrike flies over everything' },
      { icon: '\uD83D\uDCF1', text: 'Play in landscape for best experience' }
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
      '\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557',
      '\u2551  OBJECTIVE: Capture the enemy flag and   \u2551',
      '\u2551  return it to your base. First to 3 wins!\u2551',
      '\u2560\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2563',
      '\u2551                                          \u2551',
      '\u2551  CONTROLS:                               \u2551',
      '\u2551  WASD / Arrow Keys ... Move vehicle      \u2551',
      '\u2551  Mouse / Space ....... Shoot             \u2551',
      '\u2551  E ........... Lay mine (StrikeMaster)   \u2551',
      '\u2551  R ................... Swap vehicle       \u2551',
      '\u2551  M ................... Toggle music       \u2551',
      '\u2551  ESC ................. Pause / Menu       \u2551',
      '\u2551                                          \u2551',
      '\u2551  TIPS:                                   \u2551',
      '\u2551  \u2022 Only JEEP can carry the flag!         \u2551',
      '\u2551  \u2022 Vehicles have limited fuel & ammo     \u2551',
      '\u2551  \u2022 Return to base or depots to resupply  \u2551',
      '\u2551  \u2022 Destroy walls to create new paths     \u2551',
      '\u2551  \u2022 UrbanStrike flies over everything     \u2551',
      '\u2551  \u2022 StrikeMaster can lay mines behind it  \u2551',
      '\u2551  \u2022 BushMaster turret auto-aims enemies   \u2551',
      '\u2551  \u2022 Jeep has 3 respawn lives per round    \u2551',
      '\u2551                                          \u2551',
      '\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D',
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
      ctx.fillText('MINES: ' + Math.floor(player.mineAmmo), pad, pad + 72);
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
      for (let i = 0; i < jeepLives; i++) livesStr += '\u2665 ';
      ctx.fillText(livesStr, pad, livesY);
    }

    // Score
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(score.team1 + '  -  ' + score.team2, screenW / 2, 28);

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
      ctx.fillText(mins + ':' + secs.toString().padStart(2, '0'), screenW - pad, 22);
    }

    // Flag status indicator
    if (flags) {
      const fy = 55;
      ctx.font = '11px monospace';

      // Blue flag status
      ctx.fillStyle = '#66aaff';
      ctx.textAlign = 'right';
      const bf = flags[1];
      ctx.fillText(bf.carried ? '\u2691 STOLEN!' : bf.atBase ? '\u2691 Safe' : '\u2691 Dropped', screenW - pad, fy);

      // Red flag status
      ctx.fillStyle = '#ff7777';
      const rf = flags[2];
      ctx.fillText(rf.carried ? '\u2691 STOLEN!' : rf.atBase ? '\u2691 Safe' : '\u2691 Dropped', screenW - pad, fy + 16);
    }

    // Flag carrying indicator
    if (player.hasFlag) {
      ctx.fillStyle = player.flagTeam === 1 ? '#3388ff' : '#ff4444';
      ctx.font = 'bold 16px monospace';
      ctx.textAlign = 'center';
      const pulse = Math.sin(Date.now() * 0.006) * 0.3 + 0.7;
      ctx.globalAlpha = pulse;
      ctx.fillText('\uD83D\uDEA9 CARRYING FLAG! Return to base!', screenW / 2, screenH - 30);
      ctx.globalAlpha = 1;
    }

    // Low fuel/ammo warnings
    if (player.fuel < player.maxFuel * 0.2) {
      ctx.fillStyle = '#f00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const blink = Math.sin(Date.now() * 0.008) > 0;
      if (blink) ctx.fillText('\u26A0 LOW FUEL!', pad, screenH - 50);
    }
    if (player.ammo < 5 && player.ammo > 0) {
      ctx.fillStyle = '#ff0';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('\u26A0 LOW AMMO!', pad, screenH - 35);
    }
    if (player.ammo <= 0) {
      ctx.fillStyle = '#f00';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'left';
      const blink = Math.sin(Date.now() * 0.008) > 0;
      if (blink) ctx.fillText('\u26A0 NO AMMO!', pad, screenH - 35);
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
    ctx.fillText(score.team1 + ' - ' + score.team2, screenW / 2, screenH / 2 + 10);

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
    ctx.fillText('Respawning in ' + Math.ceil(timer) + '...', screenW / 2, screenH / 2 + 50);
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
    ctx.fillText('\u23F8', pX + pW / 2, pY + pH / 2 + 4);

    input.registerTouchButton({ id: 'pause', x: pX, y: pY, w: pW, h: pH, action: 'pause' });
  }

  /* ========== Notification System ========== */
  const notifications = [];

  function notify(text, color, duration) {
    notifications.push({
      text: text,
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

  /* ========== USERNAME LABEL ========== */
  function renderUsernameLabel(c, vehicle, camX, camY, username) {
    if (!vehicle || !vehicle.alive || !username) return;
    var sx = vehicle.x - camX;
    var sy = vehicle.y - camY;

    // Position above the vehicle
    var labelY = sy - 28;
    var name = username.substring(0, 16);

    c.save();
    c.font = 'bold 10px monospace';
    c.textAlign = 'center';
    var tw = c.measureText(name).width;
    var padX = 6;
    var padY = 3;
    var bgW = tw + padX * 2;
    var bgH = 14 + padY * 2;

    // Background
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.fillRect(sx - bgW / 2, labelY - bgH / 2, bgW, bgH);

    // Border (team colored)
    var teamColor = vehicle.team === 1 ? 'rgba(102,170,255,0.5)' : 'rgba(255,119,119,0.5)';
    c.strokeStyle = teamColor;
    c.lineWidth = 1;
    c.strokeRect(sx - bgW / 2, labelY - bgH / 2, bgW, bgH);

    // Text
    c.fillStyle = vehicle.team === 1 ? '#aaccff' : '#ffaaaa';
    c.fillText(name, sx, labelY + 4);
    c.restore();
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
    // Check menu items (4 items now)
    var s = Game.uiScale || 1;
    var startY = 150 * s;
    var itemH = 56 * s;
    var itemGap = 10 * s;
    var itemW = 340 * s;
    var cx = screenW / 2;
    for (var i = 0; i < 4; i++) {
      var y = startY + i * (itemH + itemGap);
      if (isMouseInRect(cx - itemW / 2, y, itemW, itemH)) {
        return i;
      }
    }
    return -1;
  }

  function getVehicleClick() {
    updateMouse();
    // Check back button first
    if (_lastBackBtn && isMouseInRect(_lastBackBtn.x, _lastBackBtn.y, _lastBackBtn.w, _lastBackBtn.h)) {
      return -2; // special: back
    }
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
    var s = Game.uiScale || 1;
    var cx = screenW / 2;

    // Check back button
    if (_lastBackBtn && isMouseInRect(_lastBackBtn.x, _lastBackBtn.y, _lastBackBtn.w, _lastBackBtn.h)) {
      return 'back';
    }

    // In-room lobby
    if (_lobbyData.inRoom) {
      return _getInRoomLobbyAction(s, cx);
    }

    // Room browser
    return _getRoomBrowserAction(s, cx);
  }

  function _getRoomBrowserAction(s, cx) {
    // Create room button
    var btnW = 210 * s;
    var btnH = 40 * s;
    var btnY = screenH - 160 * s;
    if (isMouseInRect(cx - btnW / 2, btnY, btnW, btnH)) return 'create';

    // Refresh button
    var refY = btnY + btnH + 12 * s;
    if (isMouseInRect(cx - btnW / 2, refY, btnW, btnH)) return 'refresh';

    // Room clicks
    var rooms = _lobbyData.rooms && _lobbyData.rooms.length ? _lobbyData.rooms : lobbyRooms;
    var startY = 105 * s;
    var roomH = 38 * s;
    var roomW = 420 * s;
    for (var i = 0; i < rooms.length; i++) {
      var y = startY + i * (roomH + 4);
      if (isMouseInRect(cx - roomW / 2, y, roomW, roomH)) {
        return { action: 'join', index: i };
      }
    }
    return null;
  }

  function _getInRoomLobbyAction(s, cx) {
    var colW = 260 * s;
    var colGap = 40 * s;
    var colLeft = cx - colGap / 2 - colW;
    var colRight = cx + colGap / 2;
    var slotStartY = 120 * s;
    var slotH = 42 * s;
    var slotGap = 6 * s;

    var players = _lobbyData.roomPlayers || [];

    // Check team slot clicks (add AI)
    for (var team = 1; team <= 2; team++) {
      var colX = team === 1 ? colLeft : colRight;
      var teamPlayers = [];
      for (var p = 0; p < players.length; p++) {
        if (players[p].team === team) teamPlayers.push(players[p]);
      }
      for (var slot = 0; slot < 4; slot++) {
        var sy = slotStartY + slot * (slotH + slotGap);
        if (!teamPlayers[slot] && isMouseInRect(colX, sy, colW, slotH)) {
          return { action: 'addAI', team: team, slot: slot };
        }
      }
    }

    // Button row 1
    var btnW = 150 * s;
    var btnH = 38 * s;
    var btnGap = 14 * s;
    var btnRow1Y = slotStartY + 4 * (slotH + slotGap) + 16 * s;
    var btnRow2Y = btnRow1Y + btnH + 10 * s;

    // Ready button
    var rBtnX = cx - btnW - btnGap / 2;
    if (isMouseInRect(rBtnX, btnRow1Y, btnW, btnH)) return 'ready';

    // Switch team button
    var stBtnX = cx + btnGap / 2;
    if (isMouseInRect(stBtnX, btnRow1Y, btnW, btnH)) return 'switchTeam';

    // Start / Cancel button (host only)
    if (_lobbyData.isHost) {
      if (_lobbyData.countdown > 0) {
        if (isMouseInRect(cx - btnW / 2, btnRow2Y, btnW, btnH)) return 'cancelCountdown';
      } else {
        if (isMouseInRect(cx - btnW / 2, btnRow2Y, btnW, btnH)) return 'start';
      }
    }

    // Leave room button
    var leaveW = 130 * s;
    var leaveH = 34 * s;
    var leaveX = screenW - leaveW - 16 * s;
    var leaveY = screenH - leaveH - 16 * s;
    if (isMouseInRect(leaveX, leaveY, leaveW, leaveH)) return 'leave';

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
    init: init,
    resize: resize,
    renderMenu: renderMenu,
    renderVehicleSelect: renderVehicleSelect,
    renderLobby: renderLobby,
    renderHowToPlay: renderHowToPlay,
    renderSettings: renderSettings,
    renderHUD: renderHUD,
    renderGameOver: renderGameOver,
    renderRespawn: renderRespawn,
    renderRoundStats: renderRoundStats,
    renderFinalStats: renderFinalStats,
    renderTouchControls: renderTouchControls,
    renderNotifications: renderNotifications,
    renderPauseOverlay: renderPauseOverlay,
    showPauseOverlay: showPauseOverlay,
    hidePauseOverlay: hidePauseOverlay,
    isPauseOverlayVisible: isPauseOverlayVisible,
    getPauseOverlayClick: getPauseOverlayClick,
    renderUsernameLabel: renderUsernameLabel,
    notify: notify,
    updateNotifications: updateNotifications,
    updateMouse: updateMouse,
    getMenuClick: getMenuClick,
    getVehicleClick: getVehicleClick,
    getLobbyAction: getLobbyAction,
    getSettingsAction: getSettingsAction,
    getBackClick: getBackClick,
    startElevatorDeploy: startElevatorDeploy,
    set lobbyRooms(v) { lobbyRooms = v; if (_lobbyData) _lobbyData.rooms = v; },
    set lobbyStatus(v) { lobbyStatus = v; if (_lobbyData) _lobbyData.status = v; },
    get selectedMenuItem() { return selectedMenuItem; },
    set selectedMenuItem(v) { selectedMenuItem = v; },
    get username() { return _username; },
    set username(v) { _username = v || 'Player'; }
  };
})();