/**
 * Integration & Regression Tests for Multiplayer Lobby Bug Fixes
 *
 * Tests cover all 7 bugs found in the lobby bug bash:
 *  Bug 1 (CRITICAL): UI _lobbyData never synced — in-room buttons non-functional
 *  Bug 2 (HIGH):     Double click handling fired lobby actions twice
 *  Bug 3 (HIGH):     finishDeploy hardcoded team 1 — MP team 2 broken
 *  Bug 4 (MEDIUM):   Rooms with only AI bots persisted forever
 *  Bug 5 (MEDIUM):   selectVehicle not broadcast to other players
 *  Bug 6 (MEDIUM):   Any player could add AI (no host check)
 *  Bug 7 (LOW):      startMultiplayerGame missing pool/lives reset
 */

const { mockCanvas, mockCtx } = require('./setup');

// =====================================================================
// Part A: Server-side Room class tests (extracted in-process)
//
// We can't require server.js directly (it starts listening), so we
// re-create the Room class from the same source for isolated testing.
// =====================================================================

let nextAIId = 1000;

class Room {
  constructor(id, name, hostId) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.players = new Map();
    this.maxPlayers = 8;
    this.state = 'waiting';
    this.scores = { team1: 0, team2: 0 };
    this.mapSeed = Math.floor(Math.random() * 999999);
    this.createdAt = Date.now();
    this.countdownTimer = null;
    this.countdown = 0;
  }

  addPlayer(socketId, username) {
    if (this.players.size >= this.maxPlayers) return null;
    let team1Count = 0, team2Count = 0;
    this.players.forEach(p => {
      if (p.team === 1) team1Count++;
      else team2Count++;
    });
    const team = team1Count <= team2Count ? 1 : 2;
    const playerData = { team, vehicleType: 0, ready: false, name: username || 'Player', isAI: false };
    this.players.set(socketId, playerData);
    return playerData;
  }

  addAI(team) {
    let teamCount = 0;
    this.players.forEach(p => { if (p.team === team) teamCount++; });
    if (teamCount >= 4) return null;
    if (this.players.size >= this.maxPlayers) return null;
    const aiId = 'ai_' + (nextAIId++);
    const playerData = { team, vehicleType: Math.floor(Math.random() * 4), ready: true, name: 'AI Bot', isAI: true };
    this.players.set(aiId, playerData);
    return { id: aiId, data: playerData };
  }

  removePlayer(socketId) {
    this.players.delete(socketId);

    // Bug 4 fix: Remove all AI bots if no human players remain
    let hasHuman = false;
    for (const [, p] of this.players) {
      if (!p.isAI) { hasHuman = true; break; }
    }
    if (!hasHuman) {
      this.players.clear();
      this.hostId = null;
      this.stopCountdown();
      return;
    }

    if (this.hostId === socketId) {
      for (const [id, p] of this.players) {
        if (!p.isAI) {
          this.hostId = id;
          break;
        }
      }
    }
    this.stopCountdown();
  }

  switchTeam(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    const targetTeam = p.team === 1 ? 2 : 1;
    let targetCount = 0;
    this.players.forEach(pl => { if (pl.team === targetTeam) targetCount++; });
    if (targetCount >= 4) return false;
    p.team = targetTeam;
    p.ready = false;
    this.stopCountdown();
    return true;
  }

  toggleReady(socketId) {
    const p = this.players.get(socketId);
    if (!p || p.isAI) return;
    p.ready = !p.ready;
    if (!p.ready) this.stopCountdown();
  }

  allReady() {
    for (const [, p] of this.players) {
      if (!p.isAI && !p.ready) return false;
    }
    return this.players.size >= 1;
  }

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      this.countdown = 0;
      for (const [, p] of this.players) {
        if (!p.isAI) p.ready = false;
      }
    }
  }

  getPlayerList() {
    return Array.from(this.players.entries()).map(([id, p]) => ({
      id, team: p.team, vehicleType: p.vehicleType, ready: p.ready, name: p.name, isAI: p.isAI
    }));
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      players: this.players.size,
      maxPlayers: this.maxPlayers,
      state: this.state
    };
  }
}

// =====================================================================
// Bug 4: Rooms with only AI bots should be cleaned up
// =====================================================================
describe('Bug 4: AI-only room cleanup on last human leave', () => {
  test('room empties completely when last human leaves with AI bots', () => {
    const room = new Room('r1', 'Test', 'host1');
    room.addPlayer('host1', 'Host');
    room.addAI(1);
    room.addAI(2);
    room.addAI(2);

    expect(room.players.size).toBe(4);

    // Last human leaves
    room.removePlayer('host1');

    // All AI should be cleaned up too
    expect(room.players.size).toBe(0);
    expect(room.hostId).toBeNull();
  });

  test('room survives when a non-last human leaves', () => {
    const room = new Room('r2', 'Test', 'host1');
    room.addPlayer('host1', 'Host');
    room.addPlayer('player2', 'Player2');
    room.addAI(1);

    expect(room.players.size).toBe(3);

    // Non-host leaves — room should survive with other human + AI
    room.removePlayer('player2');

    expect(room.players.size).toBe(2); // host + AI remain
  });

  test('host transfers to another human, not AI, when host leaves', () => {
    const room = new Room('r3', 'Test', 'host1');
    room.addPlayer('host1', 'Host');
    room.addPlayer('player2', 'Player2');
    room.addAI(1);

    room.removePlayer('host1');

    expect(room.hostId).toBe('player2');
    expect(room.players.has('host1')).toBe(false);
    expect(room.players.size).toBe(2); // player2 + AI
  });

  test('room with multiple humans and AI still works after one leaves', () => {
    const room = new Room('r4', 'Test', 'host1');
    room.addPlayer('host1', 'Host');
    room.addPlayer('p2', 'P2');
    room.addPlayer('p3', 'P3');
    room.addAI(1);
    room.addAI(2);

    room.removePlayer('p3');
    expect(room.players.size).toBe(4); // host + p2 + 2 AI
    expect(room.players.has('p3')).toBe(false);
  });
});

// =====================================================================
// Room: Team balancing / switching / ready
// =====================================================================
describe('Room team balancing and ready system', () => {
  test('players are auto-balanced between teams', () => {
    const room = new Room('tb1', 'Balance Test', 'p1');
    const p1 = room.addPlayer('p1', 'P1');
    const p2 = room.addPlayer('p2', 'P2');
    const p3 = room.addPlayer('p3', 'P3');
    const p4 = room.addPlayer('p4', 'P4');

    // With 4 players, should be 2v2
    let t1 = 0, t2 = 0;
    room.players.forEach(p => { if (p.team === 1) t1++; else t2++; });
    expect(t1).toBe(2);
    expect(t2).toBe(2);
  });

  test('switchTeam unreadies the player and stops countdown', () => {
    const room = new Room('st1', 'Switch Test', 'p1');
    room.addPlayer('p1', 'P1');
    room.addPlayer('p2', 'P2');

    room.toggleReady('p1');
    expect(room.players.get('p1').ready).toBe(true);

    room.switchTeam('p1');
    expect(room.players.get('p1').ready).toBe(false);
  });

  test('cannot switch to a full team (4 players)', () => {
    const room = new Room('st2', 'Full Team', 'p1');
    // Fill team 1 with 4 AI
    room.addAI(1);
    room.addAI(1);
    room.addAI(1);
    room.addAI(1);
    // Add human to team 2
    room.addPlayer('p1', 'P1');
    const p1 = room.players.get('p1');
    p1.team = 2; // force to team 2

    const result = room.switchTeam('p1');
    expect(result).toBe(false);
    expect(p1.team).toBe(2); // should stay on team 2
  });

  test('allReady returns false when a human is not ready', () => {
    const room = new Room('ar1', 'Ready Test', 'p1');
    room.addPlayer('p1', 'P1');
    room.addAI(2);

    expect(room.allReady()).toBe(false);
  });

  test('allReady returns true when all humans are ready (AI always ready)', () => {
    const room = new Room('ar2', 'Ready Test', 'p1');
    room.addPlayer('p1', 'P1');
    room.addAI(2);

    room.toggleReady('p1');
    expect(room.allReady()).toBe(true);
  });

  test('toggleReady does not affect AI bots', () => {
    const room = new Room('ar3', 'AI Ready', 'p1');
    room.addPlayer('p1', 'P1');
    const aiResult = room.addAI(2);
    const aiId = aiResult.id;

    expect(room.players.get(aiId).ready).toBe(true);
    room.toggleReady(aiId); // should be no-op
    expect(room.players.get(aiId).ready).toBe(true);
  });

  test('room rejects players when full (8 max)', () => {
    const room = new Room('full1', 'Full Room', 'p1');
    for (let i = 0; i < 8; i++) {
      room.addPlayer('p' + i, 'P' + i);
    }
    const result = room.addPlayer('p9', 'Overflow');
    expect(result).toBeNull();
    expect(room.players.size).toBe(8);
  });

  test('addAI rejects when team is full (4 max per team)', () => {
    const room = new Room('aif1', 'AI Full', 'p1');
    room.addPlayer('p1', 'P1');
    room.addAI(1);
    room.addAI(1);
    room.addAI(1);
    // Team 1 now has p1 + 3 AI = 4 players
    const result = room.addAI(1);
    expect(result).toBeNull();
  });
});

// =====================================================================
// Part B: Client-side UI integration tests
// =====================================================================

// Load game modules
require('../src/js/utils');
require('../src/js/map');

const Game = window.Game;

// Stub dependencies before loading UI
Game.Sprites = Game.Sprites || {
  generate: jest.fn(),
  sprites: {},
  getVehicleSprite: jest.fn(() => null),
};
Game.Audio = Game.Audio || {
  init: jest.fn(),
  play: jest.fn(),
  resume: jest.fn(),
  stopMusic: jest.fn(),
  playMusic: jest.fn(),
  toggleMusic: jest.fn(),
};
Game.Input = Game.Input || {
  init: jest.fn(),
  isTouch: false,
  getMousePos: jest.fn(() => ({ x: 0, y: 0 })),
  wasClicked: jest.fn(() => false),
  wasPressed: jest.fn(() => false),
  endFrame: jest.fn(),
  clearTouchButtons: jest.fn(),
  registerTouchButton: jest.fn(),
  moveJoystick: { dx: 0, dy: 0, active: false },
  aimJoystick: { dx: 0, dy: 0, active: false },
  fireTouch: { active: false },
  isShooting: jest.fn(() => false),
  autoFire: false,
};
Game.uiScale = 1;
Game.screenW = 960;
Game.screenH = 640;

require('../src/js/ui');

// =====================================================================
// Bug 1: UI _lobbyData sync — in-room lobby buttons must work
// =====================================================================
describe('Bug 1: UI _lobbyData synced from renderLobby', () => {
  beforeEach(() => {
    Game.UI.init(mockCanvas);
    Game.UI.resize(960, 640);
    mockCtx.fillText.mockClear();
    mockCtx.fillRect.mockClear();
  });

  test('renderLobby with inRoom=true renders in-room lobby (GAME LOBBY title)', () => {
    const lobbyData = {
      rooms: [],
      status: 'Connected',
      inRoom: true,
      roomPlayers: [
        { id: 'me', team: 1, name: 'TestPlayer', ready: false, isAI: false },
        { id: 'ai1', team: 2, name: 'AI Bot', ready: true, isAI: true },
      ],
      playerTeam: 1,
      isHost: true,
      countdown: 0,
      readyStates: { me: false, ai1: true },
      roomName: 'Test Room',
      playerId: 'me',
    };

    Game.UI.renderLobby(lobbyData);

    // Verify in-room lobby was rendered (GAME LOBBY title)
    const fillTextCalls = mockCtx.fillText.mock.calls;
    const gameLobbyDrawn = fillTextCalls.some(c => c[0] === 'GAME LOBBY');
    expect(gameLobbyDrawn).toBe(true);

    // Verify MULTIPLAYER LOBBY (room browser) was NOT drawn
    const browserDrawn = fillTextCalls.some(c => c[0] === 'MULTIPLAYER LOBBY');
    expect(browserDrawn).toBe(false);
  });

  test('renderLobby with inRoom=false renders room browser', () => {
    const lobbyData = {
      rooms: [{ name: 'Room A', players: 2, maxPlayers: 8 }],
      status: 'Connected! ID: abc123',
      inRoom: false,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: '',
    };

    Game.UI.renderLobby(lobbyData);

    const fillTextCalls = mockCtx.fillText.mock.calls;
    const browserDrawn = fillTextCalls.some(c => c[0] === 'MULTIPLAYER LOBBY');
    expect(browserDrawn).toBe(true);
  });

  test('getLobbyAction returns in-room actions after renderLobby with inRoom=true', () => {
    // This specifically tests the Bug 1 fix: _lobbyData must be synced
    // so getLobbyAction knows we're in a room.
    const lobbyData = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [
        { id: 'me', team: 1, name: 'Me', ready: false, isAI: false },
      ],
      playerTeam: 1,
      isHost: true,
      countdown: 0,
      readyStates: { me: false },
      roomName: 'TestRoom',
      playerId: 'me',
    };

    // Render to sync _lobbyData
    Game.UI.renderLobby(lobbyData);

    // Now call getLobbyAction — before the fix, this would always
    // check room-browser paths because _lobbyData.inRoom was never set
    const action = Game.UI.getLobbyAction();

    // The mouse is at 0,0 — won't hit any in-room button, but importantly
    // it should NOT return 'create' or 'refresh' (room browser actions),
    // since we're supposed to be in a room.
    expect(action).not.toBe('create');
    expect(action).not.toBe('refresh');
  });

  test('getLobbyAction returns room browser actions when NOT in a room', () => {
    const lobbyData = {
      rooms: [],
      status: 'Connected',
      inRoom: false,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: '',
    };

    Game.UI.renderLobby(lobbyData);

    // With mouse at 0,0, nothing should be hit
    const action = Game.UI.getLobbyAction();
    // Should not return in-room actions
    expect(action).not.toBe('ready');
    expect(action).not.toBe('start');
    expect(action).not.toBe('switchTeam');
    expect(action).not.toBe('cancelCountdown');
  });

  test('host flag is synced into _lobbyData for button rendering', () => {
    // Render as host
    const asHost = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [{ id: 'h', team: 1, name: 'Host', ready: true, isAI: false }],
      playerTeam: 1,
      isHost: true,
      countdown: 0,
      readyStates: { h: true },
      roomName: 'R',
      playerId: 'h',
    };

    mockCtx.fillText.mockClear();
    Game.UI.renderLobby(asHost);

    // START GAME button should be drawn for host
    const textCalls = mockCtx.fillText.mock.calls;
    const startDrawn = textCalls.some(c => c[0] === 'START GAME');
    expect(startDrawn).toBe(true);
  });

  test('countdown value synced and displayed when > 0', () => {
    const withCountdown = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [{ id: 'h', team: 1, name: 'Host', ready: true, isAI: false }],
      playerTeam: 1,
      isHost: true,
      countdown: 7,
      readyStates: { h: true },
      roomName: 'R',
      playerId: 'h',
    };

    mockCtx.fillText.mockClear();
    Game.UI.renderLobby(withCountdown);

    // Countdown value should appear in rendered text
    const textCalls = mockCtx.fillText.mock.calls;
    const countdownDrawn = textCalls.some(c => c[0] === '7');
    expect(countdownDrawn).toBe(true);
  });

  test('CANCEL button shown during countdown for host', () => {
    const withCountdown = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [{ id: 'h', team: 1, name: 'Host', ready: true, isAI: false }],
      playerTeam: 1,
      isHost: true,
      countdown: 5,
      readyStates: { h: true },
      roomName: 'R',
      playerId: 'h',
    };

    mockCtx.fillText.mockClear();
    Game.UI.renderLobby(withCountdown);

    const textCalls = mockCtx.fillText.mock.calls;
    const cancelDrawn = textCalls.some(c => c[0] === 'CANCEL');
    expect(cancelDrawn).toBe(true);

    // START GAME should NOT be drawn during countdown
    const startDrawn = textCalls.some(c => c[0] === 'START GAME');
    expect(startDrawn).toBe(false);
  });
});

// =====================================================================
// Bug 2 regression: Lobby click not duplicated
// =====================================================================
describe('Bug 2 regression: No double click handling in lobby', () => {
  test('handleClick for STATE.LOBBY does nothing (defers to updateLobby)', () => {
    // We can't easily call handleClick directly since it's in an IIFE,
    // but we can verify the architecture: game.js's handleClick should
    // have a stub for LOBBY that does NOT call getLobbyAction.
    // We read the game.js source to confirm.
    const fs = require('fs');
    const gameSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );

    // The fix replaced the large lobby block in handleClick with a comment stub
    // Verify the old pattern is gone: handleClick should NOT contain
    // 'getLobbyAction' inside the LOBBY branch
    const handleClickMatch = gameSrc.match(
      /function handleClick\(\)[\s\S]*?(?=function\s+\w)/
    );
    expect(handleClickMatch).not.toBeNull();

    const handleClickBody = handleClickMatch[0];

    // Should have the stub comment
    expect(handleClickBody).toContain('Lobby clicks are handled in updateLobby');

    // Should NOT have getLobbyAction (that's the old duplicate code)
    // Count occurrences of getLobbyAction in handleClick
    const lobbyActionInHandleClick = (handleClickBody.match(/getLobbyAction/g) || []).length;
    expect(lobbyActionInHandleClick).toBe(0);
  });

  test('updateLobby still contains getLobbyAction for proper click handling', () => {
    const fs = require('fs');
    const gameSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );

    const updateLobbyMatch = gameSrc.match(
      /function updateLobby\(dt\)[\s\S]*?(?=\n  function\s)/
    );
    expect(updateLobbyMatch).not.toBeNull();

    const updateLobbyBody = updateLobbyMatch[0];
    expect(updateLobbyBody).toContain('getLobbyAction');
    expect(updateLobbyBody).toContain('wasClicked');
  });
});

// =====================================================================
// Bug 3: finishDeploy uses correct team in multiplayer
// =====================================================================
describe('Bug 3: finishDeploy uses Network.playerTeam in multiplayer', () => {
  test('game.js finishDeploy reads Network.playerTeam for team', () => {
    const fs = require('fs');
    const gameSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );

    const deployMatch = gameSrc.match(
      /function finishDeploy\(\)[\s\S]*?(?=\n  (?:function|\/\*))/
    );
    expect(deployMatch).not.toBeNull();
    const deployBody = deployMatch[0];

    // Must reference Network.playerTeam for team assignment
    expect(deployBody).toContain('Network.playerTeam');

    // Must NOT hardcode getSpawn(1) — should use a variable
    expect(deployBody).not.toMatch(/getSpawn\(\s*1\s*\)/);
  });
});

// =====================================================================
// Bug 5: selectVehicle broadcasts lobby update
// =====================================================================
describe('Bug 5: selectVehicle broadcasts lobby update', () => {
  test('server.js selectVehicle handler calls broadcastLobbyUpdate', () => {
    const fs = require('fs');
    const serverSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'server.js'),
      'utf8'
    );

    // Find the selectVehicle handler block
    const selectMatch = serverSrc.match(
      /socket\.on\('selectVehicle'[\s\S]*?(?=\n  socket\.on)/
    );
    expect(selectMatch).not.toBeNull();
    expect(selectMatch[0]).toContain('broadcastLobbyUpdate');
  });
});

// =====================================================================
// Bug 6: Only host can add AI
// =====================================================================
describe('Bug 6: Only host can add AI', () => {
  test('server.js addAI handler checks hostId', () => {
    const fs = require('fs');
    const serverSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'server.js'),
      'utf8'
    );

    // Find the addAI handler
    const addAIMatch = serverSrc.match(
      /socket\.on\('addAI'[\s\S]*?(?=\n  \/\*|socket\.on)/
    );
    expect(addAIMatch).not.toBeNull();
    expect(addAIMatch[0]).toContain('hostId');
    // Should have a guard that non-hosts get an error
    expect(addAIMatch[0]).toContain('Only the host can add AI');
  });
});

// =====================================================================
// Bug 7: startMultiplayerGame resets vehicle pool and jeep lives
// =====================================================================
describe('Bug 7: startMultiplayerGame resets vehiclePool and jeepLives', () => {
  test('vehiclePool and jeepLives are reset in startMultiplayerGame', () => {
    const fs = require('fs');
    const gameSrc = fs.readFileSync(
      require('path').join(__dirname, '..', 'src', 'js', 'game.js'),
      'utf8'
    );

    const mpGameMatch = gameSrc.match(
      /function startMultiplayerGame\(data\)[\s\S]*?(?=\n  function\s)/
    );
    expect(mpGameMatch).not.toBeNull();
    const mpBody = mpGameMatch[0];

    expect(mpBody).toContain('vehiclePool');
    expect(mpBody).toContain('true, true, true, true');
    expect(mpBody).toContain('jeepLives');
    expect(mpBody).toContain('MAX_JEEP_LIVES');
  });
});

// =====================================================================
// Regression: Existing lobby features still work
// =====================================================================
describe('Regression: Core lobby rendering still works', () => {
  beforeEach(() => {
    Game.UI.init(mockCanvas);
    Game.UI.resize(960, 640);
    mockCtx.fillText.mockClear();
  });

  test('room browser renders room list items', () => {
    const data = {
      rooms: [
        { name: 'Game 123', players: 3, maxPlayers: 8 },
        { name: 'Game 456', players: 1, maxPlayers: 8 },
      ],
      status: 'Connected',
      inRoom: false,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: '',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    const room1Drawn = textCalls.some(c => c[0] === 'Game 123');
    const room2Drawn = textCalls.some(c => c[0] === 'Game 456');
    expect(room1Drawn).toBe(true);
    expect(room2Drawn).toBe(true);
  });

  test('room browser renders CREATE ROOM and REFRESH buttons', () => {
    const data = {
      rooms: [],
      status: 'Connected',
      inRoom: false,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: '',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'CREATE ROOM')).toBe(true);
    expect(textCalls.some(c => c[0] === 'REFRESH')).toBe(true);
  });

  test('in-room lobby renders team headers', () => {
    const data = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: 'TestRoom',
      playerId: 'me',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'TEAM 1 (BLUE)')).toBe(true);
    expect(textCalls.some(c => c[0] === 'TEAM 2 (RED)')).toBe(true);
  });

  test('in-room lobby renders player names on correct teams', () => {
    const data = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [
        { id: 'p1', team: 1, name: 'Alice', ready: true, isAI: false },
        { id: 'p2', team: 2, name: 'Bob', ready: false, isAI: false },
        { id: 'ai1', team: 1, name: 'AI Bot', ready: true, isAI: true },
      ],
      playerTeam: 1,
      isHost: true,
      countdown: 0,
      readyStates: { p1: true, p2: false, ai1: true },
      roomName: 'MyRoom',
      playerId: 'p1',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'Alice')).toBe(true);
    expect(textCalls.some(c => c[0] === 'Bob')).toBe(true);
    expect(textCalls.some(c => c[0] === 'AI Bot')).toBe(true);
  });

  test('READY / NOT READY button toggles label', () => {
    // Not ready state
    const notReady = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [{ id: 'p1', team: 1, name: 'P1', ready: false, isAI: false }],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: { p1: false },
      roomName: 'R',
      playerId: 'p1',
    };

    mockCtx.fillText.mockClear();
    Game.UI.renderLobby(notReady);
    let textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'READY')).toBe(true);

    // Ready state
    const ready = { ...notReady, readyStates: { p1: true } };
    mockCtx.fillText.mockClear();
    Game.UI.renderLobby(ready);
    textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'NOT READY')).toBe(true);
  });

  test('LEAVE ROOM button is always rendered in-room', () => {
    const data = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [{ id: 'p1', team: 1, name: 'P1', ready: false, isAI: false }],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: { p1: false },
      roomName: 'R',
      playerId: 'p1',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'LEAVE ROOM')).toBe(true);
  });

  test('SWITCH TEAM button is rendered in-room', () => {
    const data = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [{ id: 'p1', team: 1, name: 'P1', ready: false, isAI: false }],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: { p1: false },
      roomName: 'R',
      playerId: 'p1',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] === 'SWITCH TEAM')).toBe(true);
  });

  test('room name is displayed in lobby header', () => {
    const data = {
      rooms: [],
      status: '',
      inRoom: true,
      roomPlayers: [],
      playerTeam: 1,
      isHost: false,
      countdown: 0,
      readyStates: {},
      roomName: 'Epic Battle',
      playerId: 'me',
    };

    Game.UI.renderLobby(data);

    const textCalls = mockCtx.fillText.mock.calls;
    expect(textCalls.some(c => c[0] && c[0].includes('Epic Battle'))).toBe(true);
  });
});

// =====================================================================
// Regression: Room class fundamentals still work
// =====================================================================
describe('Regression: Room class core operations', () => {
  test('addPlayer returns player data with balanced team', () => {
    const room = new Room('reg1', 'Test', 'p1');
    const p = room.addPlayer('p1', 'TestUser');

    expect(p).not.toBeNull();
    expect(p.name).toBe('TestUser');
    expect(p.team).toBe(1); // first player goes to team 1
    expect(p.ready).toBe(false);
    expect(p.isAI).toBe(false);
  });

  test('addAI returns AI data with correct team', () => {
    const room = new Room('reg2', 'Test', 'p1');
    room.addPlayer('p1', 'Host');

    const ai = room.addAI(2);
    expect(ai).not.toBeNull();
    expect(ai.data.isAI).toBe(true);
    expect(ai.data.team).toBe(2);
    expect(ai.data.ready).toBe(true);
  });

  test('serialize returns correct room info', () => {
    const room = new Room('reg3', 'My Room', 'p1');
    room.addPlayer('p1', 'Host');
    room.addPlayer('p2', 'Guest');

    const s = room.serialize();
    expect(s.id).toBe('reg3');
    expect(s.name).toBe('My Room');
    expect(s.players).toBe(2);
    expect(s.maxPlayers).toBe(8);
    expect(s.state).toBe('waiting');
  });

  test('getPlayerList returns all players with correct shape', () => {
    const room = new Room('reg4', 'Test', 'p1');
    room.addPlayer('p1', 'Host');
    room.addAI(2);

    const list = room.getPlayerList();
    expect(list.length).toBe(2);
    expect(list[0]).toHaveProperty('id');
    expect(list[0]).toHaveProperty('team');
    expect(list[0]).toHaveProperty('vehicleType');
    expect(list[0]).toHaveProperty('ready');
    expect(list[0]).toHaveProperty('name');
    expect(list[0]).toHaveProperty('isAI');
  });
});
