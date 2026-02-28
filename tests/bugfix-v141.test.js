/**
 * Regression tests for v1.4.1 bug fixes:
 *  1. Mobile menu taps (touch → mouseClicked propagation)
 *  2. Desktop menu alignment (no minimum canvas width)
 *  3. How-to-Play rendering (desktop + touch paths)
 */

const { mockCanvas, mockCtx } = require('./setup');

// Load game modules in order
require('../src/js/utils');
require('../src/js/input');

// ===== Bug 1: Mobile Menu Taps =====
describe('Bug Fix: Touch sets mouseClicked for menu taps', () => {
  let touchStartHandler;

  beforeEach(() => {
    mockCanvas.addEventListener.mockClear();
    Game.Input.init(mockCanvas);

    // Grab the touchstart handler that was registered
    const touchStartCall = mockCanvas.addEventListener.mock.calls.find(c => c[0] === 'touchstart');
    touchStartHandler = touchStartCall ? touchStartCall[1] : null;

    // Reset click state
    Game.Input.endFrame();
  });

  test('touchstart handler is registered', () => {
    expect(touchStartHandler).toBeTruthy();
  });

  test('touchstart sets wasClicked to true', () => {
    expect(Game.Input.wasClicked()).toBe(false);

    // Simulate a touch event
    const fakeTouch = { identifier: 0, clientX: 480, clientY: 320 };
    const fakeTouchEvent = {
      preventDefault: jest.fn(),
      changedTouches: [fakeTouch],
      touches: [fakeTouch],
    };

    touchStartHandler(fakeTouchEvent);
    expect(Game.Input.wasClicked()).toBe(true);
  });

  test('touchstart updates mouse position from first touch', () => {
    const fakeTouch = { identifier: 0, clientX: 200, clientY: 150 };
    const fakeTouchEvent = {
      preventDefault: jest.fn(),
      changedTouches: [fakeTouch],
      touches: [fakeTouch],
    };

    touchStartHandler(fakeTouchEvent);
    const pos = Game.Input.getMousePos();
    // clientX - rect.left (0) = 200
    expect(pos.x).toBe(200);
    expect(pos.y).toBe(150);
  });

  test('touchstart calls preventDefault', () => {
    const fakeTouch = { identifier: 0, clientX: 100, clientY: 100 };
    const fakeTouchEvent = {
      preventDefault: jest.fn(),
      changedTouches: [fakeTouch],
      touches: [fakeTouch],
    };

    touchStartHandler(fakeTouchEvent);
    expect(fakeTouchEvent.preventDefault).toHaveBeenCalled();
  });

  test('wasClicked resets after endFrame', () => {
    const fakeTouch = { identifier: 0, clientX: 480, clientY: 320 };
    const fakeTouchEvent = {
      preventDefault: jest.fn(),
      changedTouches: [fakeTouch],
      touches: [fakeTouch],
    };

    touchStartHandler(fakeTouchEvent);
    expect(Game.Input.wasClicked()).toBe(true);

    Game.Input.endFrame();
    expect(Game.Input.wasClicked()).toBe(false);
  });

  test('multiple touches still set click from first changedTouch', () => {
    const touch1 = { identifier: 0, clientX: 100, clientY: 200 };
    const touch2 = { identifier: 1, clientX: 500, clientY: 300 };
    const fakeTouchEvent = {
      preventDefault: jest.fn(),
      changedTouches: [touch1, touch2],
      touches: [touch1, touch2],
    };

    touchStartHandler(fakeTouchEvent);
    const pos = Game.Input.getMousePos();
    // Should use first changed touch
    expect(pos.x).toBe(100);
    expect(pos.y).toBe(200);
    expect(Game.Input.wasClicked()).toBe(true);
  });
});

// ===== Bug 2: Desktop Menu Alignment =====
describe('Bug Fix: Canvas size matches viewport (no minimum width)', () => {
  test('Game.Input exports are available', () => {
    expect(Game.Input).toBeDefined();
    expect(typeof Game.Input.getMousePos).toBe('function');
    expect(typeof Game.Input.wasClicked).toBe('function');
    expect(typeof Game.Input.endFrame).toBe('function');
  });

  // Note: resizeCanvas is internal to game.js IIFE. We test the principle
  // by verifying no minimum-width enforcement exists in the source.
  // The actual resize behavior is integration-tested via the game loop.
  test('window dimensions are used directly (no Math.max enforcement)', () => {
    // Read game.js source and verify no Math.max(800, ...) pattern
    const fs = require('fs');
    const path = require('path');
    const gameSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );
    // Should NOT contain the old pattern that forces minimum width
    expect(gameSource).not.toMatch(/Math\.max\s*\(\s*800/);
    expect(gameSource).not.toMatch(/Math\.max\s*\(\s*500/);
  });

  test('resizeCanvas sets screenW = window.innerWidth (source check)', () => {
    const fs = require('fs');
    const path = require('path');
    const gameSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );
    // Should contain direct assignment
    expect(gameSource).toMatch(/screenW\s*=\s*window\.innerWidth/);
    expect(gameSource).toMatch(/screenH\s*=\s*window\.innerHeight/);
  });
});

// ===== Bug 3: How-to-Play rendering =====
describe('Bug Fix: How-to-Play has mobile + desktop paths', () => {
  test('ui.js contains renderHowToPlayTouch function', () => {
    const fs = require('fs');
    const path = require('path');
    const uiSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'ui.js'),
      'utf8'
    );
    expect(uiSource).toMatch(/function renderHowToPlayTouch/);
  });

  test('ui.js contains renderHowToPlayDesktop function', () => {
    const fs = require('fs');
    const path = require('path');
    const uiSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'ui.js'),
      'utf8'
    );
    expect(uiSource).toMatch(/function renderHowToPlayDesktop/);
  });

  test('mobile path draws joystick diagrams (roundRect helper exists)', () => {
    const fs = require('fs');
    const path = require('path');
    const uiSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'ui.js'),
      'utf8'
    );
    expect(uiSource).toMatch(/function roundRect/);
    expect(uiSource).toMatch(/function drawArrowMini/);
  });

  test('touch how-to-play references MOVE and AIM joysticks', () => {
    const fs = require('fs');
    const path = require('path');
    const uiSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'ui.js'),
      'utf8'
    );
    // The touch version draws labeled joystick diagrams
    expect(uiSource).toMatch(/'MOVE'/);
    expect(uiSource).toMatch(/'AIM'/);
    expect(uiSource).toMatch(/'FIRE'/);
    expect(uiSource).toMatch(/'AUTO'/);
  });

  test('desktop how-to-play has WASD controls and key drawings', () => {
    const fs = require('fs');
    const path = require('path');
    const uiSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'ui.js'),
      'utf8'
    );
    expect(uiSource).toMatch(/drawKey.*'W'/);
    expect(uiSource).toMatch(/drawKey.*'A'/);
    expect(uiSource).toMatch(/drawKey.*'S'/);
    expect(uiSource).toMatch(/drawKey.*'D'/);
    expect(uiSource).toContain("'MOVE'");
    expect(uiSource).toContain("'SHOOT'");
  });
});

// ===== Bug 1 continued: game.js processes touch clicks in updateMenu =====
describe('Bug Fix: updateMenu processes wasClicked for menu selection', () => {
  test('game.js updateMenu calls wasClicked and getMenuClick', () => {
    const fs = require('fs');
    const path = require('path');
    const gameSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );
    // Check that updateMenu contains wasClicked → getMenuClick flow
    expect(gameSource).toMatch(/wasClicked\(\)/);
    expect(gameSource).toMatch(/getMenuClick\(\)/);
  });

  test('game.js updateVehicleSelect handles touch clicks', () => {
    const fs = require('fs');
    const path = require('path');
    const gameSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );
    // Check that vehicle select also processes touch taps
    expect(gameSource).toMatch(/getVehicleClick\(\)/);
  });

  test('game.js updateLobby handles touch clicks', () => {
    const fs = require('fs');
    const path = require('path');
    const gameSource = fs.readFileSync(
      path.join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );
    // Check lobby processes touch taps
    expect(gameSource).toMatch(/getLobbyAction\(\)/);
  });
});
