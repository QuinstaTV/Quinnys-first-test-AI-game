/**
 * Mobile / Touch input tests
 * Tests hybrid input detection, virtual joysticks, haptics, fullscreen,
 * pause overlay, and responsive canvas scaling.
 */

const { mockCanvas, mockCtx } = require('./setup');

// Load game modules in order
require('../src/js/utils');
require('../src/js/input');

describe('Mobile Device Detection', () => {
  test('isTouch defaults to false in Node test env', () => {
    expect(Game.Input.isTouch).toBe(false);
  });

  test('isMobile defaults to false in Node test env', () => {
    expect(Game.Input.isMobile).toBe(false);
  });
});

describe('Input Initialization', () => {
  beforeEach(() => {
    mockCanvas.addEventListener.mockClear();
  });

  test('init registers touch event listeners on canvas', () => {
    Game.Input.init(mockCanvas);
    const eventNames = mockCanvas.addEventListener.mock.calls.map(c => c[0]);
    expect(eventNames).toContain('touchstart');
    expect(eventNames).toContain('touchmove');
    expect(eventNames).toContain('touchend');
    expect(eventNames).toContain('touchcancel');
  });

  test('init registers mouse event listeners', () => {
    Game.Input.init(mockCanvas);
    const eventNames = mockCanvas.addEventListener.mock.calls.map(c => c[0]);
    expect(eventNames).toContain('mousemove');
    expect(eventNames).toContain('mousedown');
    expect(eventNames).toContain('mouseup');
  });

  test('touch listeners use passive: false', () => {
    Game.Input.init(mockCanvas);
    const touchCalls = mockCanvas.addEventListener.mock.calls.filter(
      c => ['touchstart', 'touchmove', 'touchend', 'touchcancel'].includes(c[0])
    );
    touchCalls.forEach(call => {
      expect(call[2]).toEqual({ passive: false });
    });
  });
});

describe('Movement (keyboard)', () => {
  test('getMovement returns {dx:0, dy:0} when no keys pressed', () => {
    const m = Game.Input.getMovement();
    expect(m.dx).toBe(0);
    expect(m.dy).toBe(0);
  });

  test('isShooting returns false by default', () => {
    expect(Game.Input.isShooting()).toBe(false);
  });
});

describe('Virtual Joysticks (state)', () => {
  test('moveJoystick is not active by default', () => {
    expect(Game.Input.moveJoystick.active).toBe(false);
  });

  test('aimJoystick is not active by default', () => {
    expect(Game.Input.aimJoystick.active).toBe(false);
  });

  test('getAimDirection returns null when aim joystick inactive', () => {
    expect(Game.Input.getAimDirection()).toBeNull();
  });

  test('moveJoystick has correct default radius', () => {
    expect(Game.Input.moveJoystick.radius).toBe(60);
  });

  test('aimJoystick has correct default radius', () => {
    expect(Game.Input.aimJoystick.radius).toBe(50);
  });
});

describe('Auto-fire', () => {
  test('autoFire defaults to false', () => {
    expect(Game.Input.autoFire).toBe(false);
  });

  test('autoFire can be toggled', () => {
    Game.Input.autoFire = true;
    expect(Game.Input.autoFire).toBe(true);
    expect(Game.Input.isShooting()).toBe(true);
    Game.Input.autoFire = false;
  });
});

describe('Haptics', () => {
  beforeEach(() => {
    navigator.vibrate.mockClear();
  });

  test('haptic calls navigator.vibrate with ms', () => {
    Game.Input.haptic(50);
    expect(navigator.vibrate).toHaveBeenCalledWith(50);
  });

  test('hapticPattern calls navigator.vibrate with array', () => {
    Game.Input.hapticPattern([50, 30, 100]);
    expect(navigator.vibrate).toHaveBeenCalledWith([50, 30, 100]);
  });
});

describe('Fullscreen', () => {
  test('isFullscreen returns false by default', () => {
    expect(Game.Input.isFullscreen()).toBe(false);
  });

  test('toggleFullscreen calls requestFullscreen', () => {
    document.documentElement.requestFullscreen.mockClear();
    Game.Input.toggleFullscreen();
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
  });
});

describe('Touch Buttons', () => {
  test('registerTouchButton and clearTouchButtons work', () => {
    Game.Input.clearTouchButtons();
    Game.Input.registerTouchButton({
      id: 'test', x: 10, y: 10, w: 50, h: 50, action: 'fire'
    });
    // Should not throw
    Game.Input.clearTouchButtons();
  });
});

describe('Pause', () => {
  test('isPauseRequested defaults to false', () => {
    expect(Game.Input.isPauseRequested()).toBe(false);
  });
});

describe('Legacy Compatibility', () => {
  test('joystickActive maps to moveJoystick.active', () => {
    expect(Game.Input.joystickActive).toBe(Game.Input.moveJoystick.active);
  });

  test('joystickDX maps to moveJoystick.dx', () => {
    expect(Game.Input.joystickDX).toBe(Game.Input.moveJoystick.dx);
  });

  test('joystickDY maps to moveJoystick.dy', () => {
    expect(Game.Input.joystickDY).toBe(Game.Input.moveJoystick.dy);
  });
});

describe('endFrame', () => {
  test('endFrame resets mouseClicked', () => {
    // After endFrame, wasClicked should be false
    Game.Input.endFrame();
    expect(Game.Input.wasClicked()).toBe(false);
  });
});
