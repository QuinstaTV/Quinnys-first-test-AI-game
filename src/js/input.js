/* ============================================================
   input.js - Hybrid keyboard/mouse + touch input manager
   Dual virtual joysticks, tap-to-shoot, haptics, fullscreen
   ============================================================ */
(function () {
  'use strict';

  const keys = {};
  const prevKeys = {};
  let mouseX = 0, mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let canvasRef = null;

  // ===== Device detection =====
  var isTouch = false;
  var isMobile = false;

  function detectDevice() {
    isTouch = ('ontouchstart' in window) ||
              (navigator.maxTouchPoints > 0) ||
              (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
    isMobile = isTouch && (window.innerWidth < 1024 || /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
  }

  // ===== Touch state =====
  var touchActive = false;

  // Left joystick (movement)
  var moveJoystick = {
    active: false,
    touchId: -1,
    startX: 0, startY: 0,
    dx: 0, dy: 0,
    radius: 60,     // max drag range
    deadzone: 12
  };

  // Right joystick (aim)
  var aimJoystick = {
    active: false,
    touchId: -1,
    startX: 0, startY: 0,
    dx: 0, dy: 0,
    radius: 50,
    deadzone: 10
  };

  // Fire button (tap zone)
  var fireTouch = {
    active: false,
    touchId: -1
  };

  // Auto-fire toggle
  var autoFire = false;

  // Pause touch (double-tap tracking)
  var lastTapTime = 0;
  var pauseRequested = false;

  // Special action button (mine lay / swap)
  var specialTouch = {
    active: false,
    touchId: -1
  };

  // Touch action buttons rendered by UI
  var touchButtons = []; // [{id, x, y, w, h, label, action}]

  function init(canvas) {
    canvasRef = canvas;
    detectDevice();

    // ----- Keyboard -----
    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      e.preventDefault();
    });
    window.addEventListener('keyup', function (e) {
      keys[e.code] = false;
      e.preventDefault();
    });

    // ----- Mouse (desktop) -----
    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouseX = e.clientX - r.left;
      mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', function (e) {
      mouseDown = true;
      mouseClicked = true;
    });
    canvas.addEventListener('mouseup', function () {
      mouseDown = false;
    });

    // ----- Touch controls -----
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: false });
    canvas.addEventListener('touchcancel', onTouchEnd, { passive: false });

    // Re-detect on resize (e.g. desktop toggling touch emulation)
    window.addEventListener('resize', detectDevice);
  }

  // ===== Touch zone detection =====
  function getTouchZone(tx, ty, cw, ch) {
    // Check registered UI touch buttons first
    for (var i = 0; i < touchButtons.length; i++) {
      var b = touchButtons[i];
      if (tx >= b.x && tx <= b.x + b.w && ty >= b.y && ty <= b.y + b.h) {
        return { zone: 'button', button: b };
      }
    }

    // Left 40% = movement joystick
    // Right 40% = aim joystick
    // Middle 20% bottom strip = fire/special buttons
    var leftBound = cw * 0.4;
    var rightBound = cw * 0.6;

    if (tx < leftBound) return { zone: 'move' };
    if (tx > rightBound) return { zone: 'aim' };

    // Middle zone - bottom half = fire, top half = ignored (HUD area)
    if (ty > ch * 0.5) return { zone: 'fire' };
    return { zone: 'hud' };
  }

  function onTouchStart(e) {
    e.preventDefault();
    touchActive = true;
    var r = canvasRef.getBoundingClientRect();

    // ---- Always register first touch as a tap/click (menus, overlays, etc.) ----
    // ctx.setTransform(dpr,...) makes drawing coords = CSS pixels, so use CSS offset
    var ft = e.changedTouches[0];
    if (ft) {
      mouseX = ft.clientX - r.left;
      mouseY = ft.clientY - r.top;
      mouseClicked = true;
    }

    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var tx = t.clientX - r.left;
      var ty = t.clientY - r.top;

      var zoneInfo = getTouchZone(tx, ty, r.width, r.height);

      // NOTE: Double-tap pause removed — use the dedicated PAUSE button instead

      if (zoneInfo.zone === 'button') {
        // UI button touch
        handleButtonTouch(zoneInfo.button, t.identifier);
        continue;
      }

      if (zoneInfo.zone === 'move' && !moveJoystick.active) {
        moveJoystick.active = true;
        moveJoystick.touchId = t.identifier;
        moveJoystick.startX = tx;
        moveJoystick.startY = ty;
        moveJoystick.dx = 0;
        moveJoystick.dy = 0;
        continue;
      }

      if (zoneInfo.zone === 'aim' && !aimJoystick.active) {
        aimJoystick.active = true;
        aimJoystick.touchId = t.identifier;
        aimJoystick.startX = tx;
        aimJoystick.startY = ty;
        aimJoystick.dx = 0;
        aimJoystick.dy = 0;
        // Aim touch also fires
        fireTouch.active = true;
        fireTouch.touchId = t.identifier;
        mouseDown = true;
        mouseX = tx;
        mouseY = ty;
        haptic(30);
        continue;
      }

      if (zoneInfo.zone === 'fire') {
        fireTouch.active = true;
        fireTouch.touchId = t.identifier;
        mouseDown = true;
        mouseClicked = true;
        mouseX = tx;
        mouseY = ty;
        haptic(30);
        continue;
      }
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    var r = canvasRef.getBoundingClientRect();

    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];
      var tx = t.clientX - r.left;
      var ty = t.clientY - r.top;

      if (t.identifier === moveJoystick.touchId && moveJoystick.active) {
        moveJoystick.dx = tx - moveJoystick.startX;
        moveJoystick.dy = ty - moveJoystick.startY;
        // Clamp to radius
        var md = Math.sqrt(moveJoystick.dx * moveJoystick.dx + moveJoystick.dy * moveJoystick.dy);
        if (md > moveJoystick.radius) {
          moveJoystick.dx = (moveJoystick.dx / md) * moveJoystick.radius;
          moveJoystick.dy = (moveJoystick.dy / md) * moveJoystick.radius;
        }
      }

      if (t.identifier === aimJoystick.touchId && aimJoystick.active) {
        aimJoystick.dx = tx - aimJoystick.startX;
        aimJoystick.dy = ty - aimJoystick.startY;
        // Clamp
        var ad = Math.sqrt(aimJoystick.dx * aimJoystick.dx + aimJoystick.dy * aimJoystick.dy);
        if (ad > aimJoystick.radius) {
          aimJoystick.dx = (aimJoystick.dx / ad) * aimJoystick.radius;
          aimJoystick.dy = (aimJoystick.dy / ad) * aimJoystick.radius;
        }
        // Update aim position for aiming direction
        mouseX = tx;
        mouseY = ty;
      }

      if (t.identifier === fireTouch.touchId && fireTouch.active) {
        mouseX = tx;
        mouseY = ty;
      }
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();

    for (var i = 0; i < e.changedTouches.length; i++) {
      var t = e.changedTouches[i];

      if (t.identifier === moveJoystick.touchId) {
        moveJoystick.active = false;
        moveJoystick.touchId = -1;
        moveJoystick.dx = 0;
        moveJoystick.dy = 0;
      }

      if (t.identifier === aimJoystick.touchId) {
        aimJoystick.active = false;
        aimJoystick.touchId = -1;
        aimJoystick.dx = 0;
        aimJoystick.dy = 0;
        // If aim joystick also drove fire, release
        if (fireTouch.touchId === t.identifier) {
          fireTouch.active = false;
          fireTouch.touchId = -1;
          mouseDown = false;
        }
      }

      if (t.identifier === fireTouch.touchId) {
        fireTouch.active = false;
        fireTouch.touchId = -1;
        mouseDown = false;
      }

      if (t.identifier === specialTouch.touchId) {
        specialTouch.active = false;
        specialTouch.touchId = -1;
      }

      // Release any button touches
      releaseButtonTouch(t.identifier);
    }

    // Check if all touches are gone
    if (e.touches.length === 0) {
      touchActive = false;
      moveJoystick.active = false;
      moveJoystick.dx = 0;
      moveJoystick.dy = 0;
      aimJoystick.active = false;
      aimJoystick.dx = 0;
      aimJoystick.dy = 0;
      fireTouch.active = false;
      mouseDown = false;
      specialTouch.active = false;
    }
  }

  // ===== UI Touch button system =====
  var buttonCallbacks = {};

  function registerTouchButton(btn) {
    touchButtons.push(btn);
  }

  function clearTouchButtons() {
    touchButtons = [];
    buttonCallbacks = {};
  }

  function handleButtonTouch(btn, touchId) {
    if (btn.action === 'fire') {
      fireTouch.active = true;
      fireTouch.touchId = touchId;
      mouseDown = true;
      mouseClicked = true;
      haptic(30);
    } else if (btn.action === 'special') {
      specialTouch.active = true;
      specialTouch.touchId = touchId;
      haptic(50);
    } else if (btn.action === 'autofire') {
      autoFire = !autoFire;
      haptic(40);
    } else if (btn.action === 'pause') {
      pauseRequested = true;
      haptic(40);
    } else if (btn.action === 'swap') {
      keys['KeyR'] = true;
      setTimeout(function () { keys['KeyR'] = false; }, 100);
      haptic(40);
    } else if (typeof btn.action === 'function') {
      btn.action();
      haptic(30);
    }
    // Also treat as click for menu navigation
    mouseClicked = true;
    mouseX = btn.x + btn.w / 2;
    mouseY = btn.y + btn.h / 2;
  }

  function releaseButtonTouch(touchId) {
    // Check if this was a fire button
    if (fireTouch.touchId === touchId) {
      fireTouch.active = false;
      fireTouch.touchId = -1;
      mouseDown = false;
    }
    if (specialTouch.touchId === touchId) {
      specialTouch.active = false;
      specialTouch.touchId = -1;
    }
  }

  // ===== Haptic feedback =====
  function haptic(ms) {
    if (navigator.vibrate) {
      navigator.vibrate(ms);
    }
  }

  function hapticPattern(pattern) {
    if (navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  }

  // ===== Fullscreen =====
  function toggleFullscreen() {
    var doc = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (doc.requestFullscreen) {
        doc.requestFullscreen().catch(function () {});
      } else if (doc.webkitRequestFullscreen) {
        doc.webkitRequestFullscreen();
      }
      // Try to lock orientation
      try {
        if (screen.orientation && screen.orientation.lock) {
          screen.orientation.lock('landscape').catch(function () {});
        }
      } catch (e) {}
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      } else if (document.webkitExitFullscreen) {
        document.webkitExitFullscreen();
      }
    }
  }

  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  // ===== Public getters =====
  function isDown(code) { return !!keys[code]; }
  function wasPressed(code) { return !!keys[code] && !prevKeys[code]; }

  function getMovement() {
    var dx = 0, dy = 0;

    // Keyboard
    if (isDown('KeyW') || isDown('ArrowUp')) dy -= 1;
    if (isDown('KeyS') || isDown('ArrowDown')) dy += 1;
    if (isDown('KeyA') || isDown('ArrowLeft')) dx -= 1;
    if (isDown('KeyD') || isDown('ArrowRight')) dx += 1;

    // Touch move joystick
    if (moveJoystick.active) {
      if (Math.abs(moveJoystick.dx) > moveJoystick.deadzone) {
        dx = Game.clamp(moveJoystick.dx / moveJoystick.radius, -1, 1);
      }
      if (Math.abs(moveJoystick.dy) > moveJoystick.deadzone) {
        dy = Game.clamp(moveJoystick.dy / moveJoystick.radius, -1, 1);
      }
    }

    return { dx: dx, dy: dy };
  }

  function isShooting() {
    return mouseDown || isDown('Space') || autoFire;
  }

  function getMousePos() {
    return { x: mouseX, y: mouseY };
  }

  function getAimDirection() {
    // Returns normalized aim direction from right joystick, or null
    if (!aimJoystick.active) return null;
    var len = Math.sqrt(aimJoystick.dx * aimJoystick.dx + aimJoystick.dy * aimJoystick.dy);
    if (len < aimJoystick.deadzone) return null;
    return { dx: aimJoystick.dx / len, dy: aimJoystick.dy / len, angle: Math.atan2(aimJoystick.dy, aimJoystick.dx) };
  }

  function isSpecialPressed() {
    return specialTouch.active || wasPressed('KeyE');
  }

  function isPauseRequested() {
    var val = pauseRequested;
    pauseRequested = false;
    return val;
  }

  function endFrame() {
    Object.assign(prevKeys, keys);
    mouseClicked = false;
    pauseRequested = false;
  }

  function wasClicked() { return mouseClicked; }

  // ===== Export =====
  window.Game = window.Game || {};
  window.Game.Input = {
    init: init,
    isDown: isDown,
    wasPressed: wasPressed,
    getMovement: getMovement,
    isShooting: isShooting,
    getMousePos: getMousePos,
    getAimDirection: getAimDirection,
    isSpecialPressed: isSpecialPressed,
    isPauseRequested: isPauseRequested,
    endFrame: endFrame,
    wasClicked: wasClicked,
    toggleFullscreen: toggleFullscreen,
    isFullscreen: isFullscreen,
    haptic: haptic,
    hapticPattern: hapticPattern,
    registerTouchButton: registerTouchButton,
    clearTouchButtons: clearTouchButtons,
    get isTouch() { return isTouch; },
    get isMobile() { return isMobile; },
    get touchActive() { return touchActive; },
    get autoFire() { return autoFire; },
    set autoFire(v) { autoFire = v; },
    get moveJoystick() { return moveJoystick; },
    get aimJoystick() { return aimJoystick; },
    get fireTouch() { return fireTouch; },
    // Legacy compat
    get joystickActive() { return moveJoystick.active; },
    get joystickStartX() { return moveJoystick.startX; },
    get joystickStartY() { return moveJoystick.startY; },
    get joystickDX() { return moveJoystick.dx; },
    get joystickDY() { return moveJoystick.dy; }
  };
})();
