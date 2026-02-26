/* ============================================================
   input.js - Keyboard, mouse, and touch input manager
   ============================================================ */
(function () {
  'use strict';

  const keys = {};
  const prevKeys = {};
  let mouseX = 0, mouseY = 0;
  let mouseDown = false;
  let mouseClicked = false;
  let canvasRect = null;

  // Touch state
  let touchActive = false;
  let touchX = 0, touchY = 0;
  let touchMoveX = 0, touchMoveY = 0;
  let touchShoot = false;

  // Virtual joystick
  let joystickActive = false;
  let joystickStartX = 0, joystickStartY = 0;
  let joystickDX = 0, joystickDY = 0;

  function init(canvas) {
    canvasRect = canvas.getBoundingClientRect();

    window.addEventListener('keydown', e => {
      keys[e.code] = true;
      e.preventDefault();
    });
    window.addEventListener('keyup', e => {
      keys[e.code] = false;
      e.preventDefault();
    });

    canvas.addEventListener('mousemove', e => {
      const r = canvas.getBoundingClientRect();
      mouseX = e.clientX - r.left;
      mouseY = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', e => {
      mouseDown = true;
      mouseClicked = true;
    });
    canvas.addEventListener('mouseup', e => {
      mouseDown = false;
    });

    // Touch controls
    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const t = e.touches[0];
      const r = canvas.getBoundingClientRect();
      const tx = t.clientX - r.left;
      const ty = t.clientY - r.top;

      // Left half = movement joystick, right half = shoot
      if (tx < r.width / 2) {
        joystickActive = true;
        joystickStartX = tx;
        joystickStartY = ty;
        joystickDX = 0;
        joystickDY = 0;
      } else {
        touchShoot = true;
        mouseX = tx;
        mouseY = ty;
        mouseDown = true;
        mouseClicked = true;
      }
      touchActive = true;
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        const r = canvas.getBoundingClientRect();
        const tx = t.clientX - r.left;
        if (joystickActive && tx < r.width / 2) {
          joystickDX = tx - joystickStartX;
          joystickDY = t.clientY - r.top - joystickStartY;
        } else {
          mouseX = tx;
          mouseY = t.clientY - r.top;
        }
      }
    }, { passive: false });

    canvas.addEventListener('touchend', e => {
      e.preventDefault();
      if (e.touches.length === 0) {
        joystickActive = false;
        joystickDX = 0;
        joystickDY = 0;
        touchShoot = false;
        mouseDown = false;
        touchActive = false;
      }
    }, { passive: false });

    // Resize tracking
    window.addEventListener('resize', () => {
      canvasRect = canvas.getBoundingClientRect();
    });
  }

  function isDown(code) { return !!keys[code]; }
  function wasPressed(code) { return !!keys[code] && !prevKeys[code]; }

  function getMovement() {
    let dx = 0, dy = 0;
    if (isDown('KeyW') || isDown('ArrowUp')) dy -= 1;
    if (isDown('KeyS') || isDown('ArrowDown')) dy += 1;
    if (isDown('KeyA') || isDown('ArrowLeft')) dx -= 1;
    if (isDown('KeyD') || isDown('ArrowRight')) dx += 1;

    // Touch joystick
    if (joystickActive) {
      const deadzone = 15;
      if (Math.abs(joystickDX) > deadzone) dx = Game.clamp(joystickDX / 60, -1, 1);
      if (Math.abs(joystickDY) > deadzone) dy = Game.clamp(joystickDY / 60, -1, 1);
    }

    return { dx, dy };
  }

  function isShooting() {
    return mouseDown || isDown('Space');
  }

  function getMousePos() {
    return { x: mouseX, y: mouseY };
  }

  function endFrame() {
    Object.assign(prevKeys, keys);
    mouseClicked = false;
  }

  function wasClicked() { return mouseClicked; }

  window.Game = window.Game || {};
  window.Game.Input = {
    init, isDown, wasPressed, getMovement, isShooting,
    getMousePos, endFrame, wasClicked,
    get touchActive() { return touchActive; },
    get joystickActive() { return joystickActive; },
    get joystickStartX() { return joystickStartX; },
    get joystickStartY() { return joystickStartY; },
    get joystickDX() { return joystickDX; },
    get joystickDY() { return joystickDY; }
  };
})();
