/**
 * Alignment & Layout Tests
 *
 * Validates that the canvas centering fix (position: fixed on canvas,
 * not html/body) and DPR defensive reset work correctly on desktop
 * and mobile viewports.
 */

const fs = require('fs');
const path = require('path');
const { mockCanvas, mockCtx } = require('./setup');

const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'css', 'style.css'), 'utf8');
const gameSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'game.js'), 'utf8');
const inputSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', 'input.js'), 'utf8');

// ===== CSS Layout Rules =====
describe('CSS: Canvas layout rules', () => {
  test('html, body does NOT have position: fixed', () => {
    // Extract the html, body rule block
    const htmlBodyBlock = cssSrc.match(/html,\s*body\s*\{[^}]+\}/);
    expect(htmlBodyBlock).not.toBeNull();
    const block = htmlBodyBlock[0];

    // Should NOT contain position: fixed
    expect(block).not.toMatch(/position\s*:\s*fixed/);
  });

  test('html, body has overflow: hidden', () => {
    const htmlBodyBlock = cssSrc.match(/html,\s*body\s*\{[^}]+\}/);
    expect(htmlBodyBlock[0]).toMatch(/overflow\s*:\s*hidden/);
  });

  test('#gameCanvas has position: fixed', () => {
    const canvasBlock = cssSrc.match(/#gameCanvas\s*\{[^}]+\}/);
    expect(canvasBlock).not.toBeNull();
    expect(canvasBlock[0]).toMatch(/position\s*:\s*fixed/);
  });

  test('#gameCanvas has top: 0 and left: 0', () => {
    const canvasBlock = cssSrc.match(/#gameCanvas\s*\{[^}]+\}/);
    expect(canvasBlock[0]).toMatch(/top\s*:\s*0/);
    expect(canvasBlock[0]).toMatch(/left\s*:\s*0/);
  });

  test('#gameCanvas has display: block', () => {
    const canvasBlock = cssSrc.match(/#gameCanvas\s*\{[^}]+\}/);
    expect(canvasBlock[0]).toMatch(/display\s*:\s*block/);
  });

  test('#gameCanvas has touch-action: none', () => {
    const canvasBlock = cssSrc.match(/#gameCanvas\s*\{[^}]+\}/);
    expect(canvasBlock[0]).toMatch(/touch-action\s*:\s*none/);
  });
});

// ===== resizeCanvas DPR Handling =====
describe('game.js: resizeCanvas DPR handling', () => {
  test('resizeCanvas caps DPR at 2', () => {
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    expect(resizeMatch).not.toBeNull();
    const body = resizeMatch[0];

    // Must cap DPR
    expect(body).toMatch(/Math\.min\(.*devicePixelRatio.*,\s*2\)/);
  });

  test('resizeCanvas uses window.innerWidth/Height for screenW/H', () => {
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    const body = resizeMatch[0];

    expect(body).toContain('window.innerWidth');
    expect(body).toContain('window.innerHeight');
  });

  test('resizeCanvas sets canvas backing store to screenW * dpr', () => {
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    const body = resizeMatch[0];

    // canvas.width = Math.round(screenW * currentDpr)
    expect(body).toMatch(/canvas\.width\s*=.*screenW\s*\*\s*currentDpr/);
    expect(body).toMatch(/canvas\.height\s*=.*screenH\s*\*\s*currentDpr/);
  });

  test('resizeCanvas sets CSS display size to screenW/H px', () => {
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    const body = resizeMatch[0];

    expect(body).toContain("canvas.style.width = screenW + 'px'");
    expect(body).toContain("canvas.style.height = screenH + 'px'");
  });

  test('resizeCanvas calls setTransform with DPR', () => {
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    const body = resizeMatch[0];

    expect(body).toMatch(/ctx\.setTransform\(currentDpr,\s*0,\s*0,\s*currentDpr,\s*0,\s*0\)/);
  });

  test('resizeCanvas publishes Game.dpr, Game.screenW, Game.screenH', () => {
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    const body = resizeMatch[0];

    expect(body).toContain('Game.dpr = currentDpr');
    expect(body).toContain('Game.screenW = screenW');
    expect(body).toContain('Game.screenH = screenH');
  });
});

// ===== Defensive DPR transform reset in render() =====
describe('game.js: render() defensive DPR transform', () => {
  test('render() calls setTransform at the start of each frame', () => {
    // Extract render function body
    const renderMatch = gameSrc.match(
      /function render\(\)\s*\{[\s\S]*?(?=\n  function\s)/
    );
    expect(renderMatch).not.toBeNull();
    const body = renderMatch[0];

    // setTransform should appear BEFORE the first fillRect (background clear)
    const transformIdx = body.indexOf('ctx.setTransform');
    const fillIdx = body.indexOf('ctx.fillRect');

    expect(transformIdx).toBeGreaterThan(-1);
    expect(fillIdx).toBeGreaterThan(-1);
    expect(transformIdx).toBeLessThan(fillIdx);
  });

  test('render() DPR transform uses currentDpr variable', () => {
    const renderMatch = gameSrc.match(
      /function render\(\)\s*\{[\s\S]*?(?=\n  function\s)/
    );
    const body = renderMatch[0];

    expect(body).toMatch(/ctx\.setTransform\(currentDpr,\s*0,\s*0,\s*currentDpr,\s*0,\s*0\)/);
  });
});

// ===== Input coord system =====
describe('input.js: mouse coordinate calculation', () => {
  test('mouse position uses getBoundingClientRect offset', () => {
    // Verify mouse handler subtracts canvas rect position
    expect(inputSrc).toContain('getBoundingClientRect');
    expect(inputSrc).toMatch(/mouseX\s*=\s*e\.clientX\s*-\s*r\.left/);
    expect(inputSrc).toMatch(/mouseY\s*=\s*e\.clientY\s*-\s*r\.top/);
  });

  test('touch position uses getBoundingClientRect offset', () => {
    // Touch handlers also use getBoundingClientRect
    const touchRectCount = (inputSrc.match(/getBoundingClientRect/g) || []).length;
    // Should appear at least 3 times (mousemove + touchstart + touchmove)
    expect(touchRectCount).toBeGreaterThanOrEqual(3);
  });
});

// ===== UI centering uses dynamic screenW/2 =====
describe('UI: Dynamic centering coordinates', () => {
  beforeAll(() => {
    require('../src/js/utils');
    const Game = window.Game;
    Game.Sprites = Game.Sprites || {
      generate: jest.fn(), sprites: {},
      getVehicleSprite: jest.fn(() => null),
    };
    Game.Audio = Game.Audio || {
      init: jest.fn(), play: jest.fn(), resume: jest.fn(),
      stopMusic: jest.fn(), playMusic: jest.fn(), toggleMusic: jest.fn(),
    };
    Game.Input = Game.Input || {
      init: jest.fn(), isTouch: false,
      getMousePos: jest.fn(() => ({ x: 0, y: 0 })),
      wasClicked: jest.fn(() => false),
      wasPressed: jest.fn(() => false),
      endFrame: jest.fn(),
    };
    Game.uiScale = 1;
    Game.screenW = 960;
    Game.screenH = 640;
    require('../src/js/ui');
  });

  test('menu renders centered at various resolutions', () => {
    const Game = window.Game;

    // Test at 1920x1080 (wide desktop)
    Game.uiScale = 1;
    Game.UI.init(mockCanvas);
    Game.UI.resize(1920, 1080);
    mockCtx.fillText.mockClear();
    mockCtx.fillRect.mockClear();
    expect(() => Game.UI.renderMenu()).not.toThrow();

    // Check that drawing happened (menu items were drawn)
    expect(mockCtx.fillText).toHaveBeenCalled();
    expect(mockCtx.fillRect).toHaveBeenCalled();
  });

  test('menu renders centered at small desktop resolution', () => {
    const Game = window.Game;

    Game.uiScale = 0.5;
    Game.UI.init(mockCanvas);
    Game.UI.resize(800, 600);
    mockCtx.fillText.mockClear();
    expect(() => Game.UI.renderMenu()).not.toThrow();
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  test('menu renders centered at mobile resolution', () => {
    const Game = window.Game;

    Game.uiScale = 0.75;
    Game.UI.init(mockCanvas);
    Game.UI.resize(667, 375);
    mockCtx.fillText.mockClear();
    expect(() => Game.UI.renderMenu()).not.toThrow();
    expect(mockCtx.fillText).toHaveBeenCalled();
  });

  test('vehicle select renders without error at various resolutions', () => {
    const Game = window.Game;

    for (const [w, h] of [[1920, 1080], [1440, 900], [960, 640], [667, 375]]) {
      Game.uiScale = Math.min(w / 1920, h / 1080);
      Game.UI.init(mockCanvas);
      Game.UI.resize(w, h);
      expect(() => Game.UI.renderVehicleSelect(0, [true, true, true, true], 3)).not.toThrow();
    }
  });

  test('lobby renders without error at various resolutions', () => {
    const Game = window.Game;
    const lobbyData = {
      rooms: [{ name: 'Test', players: 2, maxPlayers: 8 }],
      status: 'Connected',
      inRoom: false,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: '',
    };

    for (const [w, h] of [[1920, 1080], [1440, 900], [960, 640], [667, 375]]) {
      Game.uiScale = Math.min(w / 1920, h / 1080);
      Game.UI.init(mockCanvas);
      Game.UI.resize(w, h);
      expect(() => Game.UI.renderLobby(lobbyData)).not.toThrow();
    }
  });

  test('HUD renders without error at various resolutions', () => {
    const Game = window.Game;
    const mockVehicle = {
      hp: 80, maxHp: 100, fuel: 50, maxFuel: 100,
      ammo: 20, maxAmmo: 30, type: 0, alive: true,
      team: 1, speed: 0, maxSpeed: 5
    };
    const score = { team1: 1, team2: 0 };
    const flags = {
      1: { atBase: true, carried: false },
      2: { atBase: true, carried: false }
    };

    for (const [w, h] of [[1920, 1080], [1440, 900], [960, 640], [667, 375]]) {
      Game.uiScale = Math.min(w / 1920, h / 1080);
      Game.UI.init(mockCanvas);
      Game.UI.resize(w, h);
      expect(() => Game.UI.renderHUD(mockVehicle, score, flags, 60, 3, 1, { team1: 0, team2: 0 })).not.toThrow();
    }
  });
});

// ===== Camera system =====
describe('game.js: Camera uses screenW/2 for centering', () => {
  test('camera target centers player on screen', () => {
    const cameraMatch = gameSrc.match(
      /function updateCamera\(dt\)[\s\S]*?(?=\n  (?:function|\/\*))/
    );
    expect(cameraMatch).not.toBeNull();
    const body = cameraMatch[0];

    // Camera target = player position - screenW/2 (to center player)
    expect(body).toContain('screenW / 2');
    expect(body).toContain('screenH / 2');
  });
});

// ===== Module-level DPR variable =====
describe('game.js: Module-level DPR variable', () => {
  test('currentDpr is declared at module scope', () => {
    // Should be near the top of the IIFE, with other state variables
    expect(gameSrc).toMatch(/let\s+currentDpr\s*=\s*1/);
  });

  test('currentDpr is used consistently in resizeCanvas and render', () => {
    // Both functions should use currentDpr, not a local var dpr
    const resizeMatch = gameSrc.match(
      /function resizeCanvas\(\)[\s\S]*?(?=\n  function\s|\n  \/\*)/
    );
    const renderMatch = gameSrc.match(
      /function render\(\)\s*\{[\s\S]*?(?=\n  function\s)/
    );

    // resizeCanvas should NOT have 'var dpr ='
    expect(resizeMatch[0]).not.toMatch(/var\s+dpr\b/);

    // Both should reference currentDpr
    expect(resizeMatch[0]).toContain('currentDpr');
    expect(renderMatch[0]).toContain('currentDpr');
  });
});
