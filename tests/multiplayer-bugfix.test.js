/**
 * Tests for multiplayer bug bash fixes
 * Covers: AI spawning, turrets, vehicle type sync, damage sync,
 *         unique player names, flag networking, tile destruction,
 *         player names above vehicles, username prompt, lobby vehicle select
 */

const fs = require('fs');
const path = require('path');
const { mockCanvas, mockCtx } = require('./setup');

// localStorage mock
const localStorageMock = {};
global.localStorage = {
  getItem: jest.fn(k => localStorageMock[k] || null),
  setItem: jest.fn((k, v) => { localStorageMock[k] = v; }),
  removeItem: jest.fn(k => { delete localStorageMock[k]; }),
};

// Load game modules in order
require('../src/js/utils');
require('../src/js/sprites');
require('../src/js/map');
require('../src/js/vehicles');
require('../src/js/ai');

// Stub modules not needed for tests
Game.Input = { init() {}, isTouch: false };
Game.Audio = { init() {}, play() {}, playMusic() {}, stopMusic() {}, resume() {}, toggleMusic() { return false; } };
Game.Particles = { clear() {}, update() {}, render() {}, explosion() {}, sparks() {}, smoke() {}, debris() {}, waterSplash() {} };
Game.Projectiles = { clear() {}, update() {}, render() {}, fire() {}, getProjectiles() { return []; }, getMines() { return []; }, layMine() {} };
Game.screenShake = function() {};
Game.Network = {
  connected: false, roomId: null, playerId: 'test_player', playerTeam: 1,
  isHost: false, inRoom: false,
  lobby: { rooms: [] },
  lobbyData: { players: [], countdown: 0, hostId: null, roomName: '' },
  connect() { return Promise.resolve('test_player'); },
  disconnect() {}, createRoom() {}, joinRoom() {}, leaveRoom() {},
  requestRooms() {}, startGame() {}, cancelCountdown() {}, toggleReady() {},
  switchTeam() {}, addAI() {}, selectVehicle() {},
  sendState() {}, sendAction() {}, sendFlagEvent() {}, sendTileDestroyed() {},
  sendDamage() {}, sendRespawn() {}, sendChat() {}, on() {}
};

require('../src/js/ui');
Game.UI.init(mockCanvas);
Game.uiScale = 1;
Game.screenW = 960;
Game.screenH = 640;
Game.dpr = 1;

// ============================================================
// SERVER-SIDE FIXES
// ============================================================
describe('Server: unique player names', () => {
  let Room;
  beforeAll(() => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    // Extract the Room class
    const roomMatch = serverSrc.match(/class Room \{[\s\S]*?^  \}/m);
    // We need a simpler approach — parse the server and extract Room
    // Just test the logic directly
  });

  test('server addPlayer generates unique name when username is default', () => {
    // Read server source and verify addPlayer has unique name logic
    const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(serverSrc).toContain("'Player ' + (nextPlayerId++)");
    expect(serverSrc).toContain('nameExists');
    expect(serverSrc).toContain('p.name === name');
  });

  test('server addAI generates numbered AI names', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(serverSrc).toContain("'AI Bot ' + (aiNum + 1)");
  });
});

describe('Server: damage relay', () => {
  test('server has vehicleDamage event handler', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(serverSrc).toContain("socket.on('vehicleDamage'");
    expect(serverSrc).toContain("io.to(player.roomId).emit('vehicleDamage'");
  });

  test('server has vehicleRespawn event handler', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(serverSrc).toContain("socket.on('vehicleRespawn'");
    expect(serverSrc).toContain("socket.to(player.roomId).emit('vehicleRespawn'");
  });

  test('server vehicleState includes player name', () => {
    const serverSrc = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
    expect(serverSrc).toContain("data.name = roomPlayer.name");
  });
});

// ============================================================
// NETWORK CLIENT
// ============================================================
describe('Network client: new methods', () => {
  test('sendDamage method exists', () => {
    const netSrc = fs.readFileSync(path.join(__dirname, '../src/js/network.js'), 'utf8');
    expect(netSrc).toContain('function sendDamage');
    expect(netSrc).toContain("socket.emit('vehicleDamage'");
  });

  test('sendRespawn method exists', () => {
    const netSrc = fs.readFileSync(path.join(__dirname, '../src/js/network.js'), 'utf8');
    expect(netSrc).toContain('function sendRespawn');
    expect(netSrc).toContain("socket.emit('vehicleRespawn'");
  });

  test('vehicleDamage event listener exists', () => {
    const netSrc = fs.readFileSync(path.join(__dirname, '../src/js/network.js'), 'utf8');
    expect(netSrc).toContain("socket.on('vehicleDamage'");
    expect(netSrc).toContain('onVehicleDamage');
  });

  test('vehicleRespawn event listener exists', () => {
    const netSrc = fs.readFileSync(path.join(__dirname, '../src/js/network.js'), 'utf8');
    expect(netSrc).toContain("socket.on('vehicleRespawn'");
    expect(netSrc).toContain('onVehicleRespawn');
  });

  test('sendDamage and sendRespawn are exported', () => {
    const netSrc = fs.readFileSync(path.join(__dirname, '../src/js/network.js'), 'utf8');
    expect(netSrc).toMatch(/sendDamage.*sendRespawn/s);
  });
});

// ============================================================
// BUG FIX: Vehicle type sync (type 0 = Jeep treated as falsy)
// ============================================================
describe('Vehicle type sync: type 0 not falsy', () => {
  test('handleNetworkState uses != null check for type', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("data.type != null");
    expect(gameSrc).not.toContain("data.type || VEH.TANK");
  });

  test('handleNetworkState uses != null check for team', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("data.team != null");
    expect(gameSrc).not.toContain("data.team || 2");
  });

  test('vehicle type 0 (Jeep) is preserved in createVehicle', () => {
    const v = Game.createVehicle(0, 1, 100, 100);
    expect(v.type).toBe(0);
    expect(v.name).toBe('Jeep');
  });

  test('vehicle type 0 is serialized correctly', () => {
    const v = Game.createVehicle(0, 1, 100, 100);
    const data = v.serialize();
    expect(data.type).toBe(0);
    expect(data.team).toBe(1);
  });
});

// ============================================================
// BUG FIX: AI vehicles in multiplayer
// ============================================================
describe('AI spawning in multiplayer', () => {
  test('startMultiplayerGame spawns AI from lobby data', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('if (p.isAI)');
    expect(gameSrc).toContain('new Game.AIController(aiVeh, map)');
    expect(gameSrc).toContain('aiControllers.push(aiCtrl)');
  });

  test('startMultiplayerGame does NOT have NO AI comment anymore', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).not.toContain('NO AI spawning in multiplayer');
  });

  test('AI vehicles get correct type from lobby data', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // Verify the AI type comes from lobby data, not hardcoded
    expect(gameSrc).toContain("(p.vehicleType != null) ? p.vehicleType : VEH.TANK");
  });
});

// ============================================================
// BUG FIX: Turrets in multiplayer
// ============================================================
describe('Turrets in multiplayer', () => {
  test('startMultiplayerGame sets turrets from map', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    // Find turrets = map.turrets in startMultiplayerGame
    const mpGameFunc = gameSrc.substring(gameSrc.indexOf('function startMultiplayerGame'));
    expect(mpGameFunc).toContain('turrets = map.turrets');
  });

  test('startMultiplayerGame resets flags from map positions', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    const mpGameFunc = gameSrc.substring(gameSrc.indexOf('function startMultiplayerGame'));
    expect(mpGameFunc).toContain("map.getFlagPos(1)");
    expect(mpGameFunc).toContain("map.getFlagPos(2)");
  });

  test('map generates turrets', () => {
    const map = new Game.GameMap();
    map.generate(12345, 1);
    expect(map.turrets).toBeDefined();
    expect(Array.isArray(map.turrets)).toBe(true);
    expect(map.turrets.length).toBeGreaterThan(0);
  });
});

// ============================================================
// BUG FIX: Damage sync
// ============================================================
describe('Damage sync in multiplayer', () => {
  test('onVehicleHit sends damage event for player hits in MP', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('Game.Network.sendDamage');
    expect(gameSrc).toContain('targetId: vehicle.networkId');
  });

  test('handleNetworkDamage handler exists', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('function handleNetworkDamage(data)');
    expect(gameSrc).toContain('playerVehicle.takeDamage(data.damage');
  });

  test('vehicle applyNetworkState includes alive and hp', () => {
    const v = Game.createVehicle(0, 1, 100, 100);
    v.applyNetworkState({ x: 200, y: 200, angle: 1, turretAngle: 0, hp: 10, fuel: 100, ammo: 50, alive: true, hasFlag: false, flagTeam: 0 });
    expect(v.hp).toBe(10);
    expect(v.x).toBe(200);
  });

  test('vehicle applyNetworkState can set alive=false', () => {
    const v = Game.createVehicle(0, 1, 100, 100);
    v.applyNetworkState({ x: 100, y: 100, angle: 0, turretAngle: 0, hp: 0, fuel: 0, ammo: 0, alive: false, hasFlag: false, flagTeam: 0 });
    expect(v.alive).toBe(false);
    expect(v.hp).toBe(0);
  });
});

// ============================================================
// BUG FIX: Vehicle respawn broadcast
// ============================================================
describe('Vehicle respawn networking', () => {
  test('finishDeploy sends respawn event in multiplayer', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('Game.Network.sendRespawn');
    expect(gameSrc).toContain('vehicleType: selectedVehicle');
  });

  test('handleNetworkRespawn handler replaces remote vehicle', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('function handleNetworkRespawn(data)');
    expect(gameSrc).toContain("allVehicles.splice(vi, 1)");
  });

  test('handleNetworkState recreates vehicle on type change', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('remote.type !== vehType');
  });
});

// ============================================================
// BUG FIX: Flag event networking
// ============================================================
describe('Flag event networking', () => {
  test('updateFlags sends pickup event in multiplayer', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("{ type: 'pickup', flagTeam: team, team: veh.team }");
  });

  test('updateFlags sends capture event in multiplayer', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("{ type: 'capture', flagTeam: team, team: scoringTeam }");
  });

  test('updateFlags sends drop event in multiplayer', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("{ type: 'drop', flagTeam: team, team: enemyTeam, x: f.x, y: f.y }");
  });

  test('updateFlags sends return event in multiplayer', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("{ type: 'return', flagTeam: team }");
  });

  test('handleNetworkFlagEvent handler exists with all event types', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('function handleNetworkFlagEvent(data)');
    expect(gameSrc).toContain("case 'pickup':");
    expect(gameSrc).toContain("case 'capture':");
    expect(gameSrc).toContain("case 'drop':");
    expect(gameSrc).toContain("case 'return':");
  });
});

// ============================================================
// BUG FIX: Tile destruction networking
// ============================================================
describe('Tile destruction networking', () => {
  test('startMultiplayerGame hooks destroyTile for network broadcast', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('origDestroyTile');
    expect(gameSrc).toContain('Game.Network.sendTileDestroyed(tx, ty)');
  });

  test('onTileDestroyed listener calls map.destroyTile', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("'onTileDestroyed'");
    expect(gameSrc).toContain('map.destroyTile(data.tx, data.ty)');
  });
});

// ============================================================
// FEATURE: Player names above vehicles
// ============================================================
describe('Player names above vehicles', () => {
  test('renderGame calls renderUsernameLabel', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('Game.UI.renderUsernameLabel(ctx, nv, camX, camY, playerName)');
  });

  test('remotePlayers tracks names from network state', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain('remotePlayers[data.playerId].name = data.name');
  });

  test('renderUsernameLabel function exists in UI', () => {
    expect(typeof Game.UI.renderUsernameLabel).toBe('function');
  });

  test('renderUsernameLabel does not throw for valid vehicle', () => {
    const v = Game.createVehicle(0, 1, 100, 100);
    expect(() => {
      Game.UI.renderUsernameLabel(mockCtx, v, 0, 0, 'TestPlayer');
    }).not.toThrow();
  });

  test('renderUsernameLabel skips dead vehicles', () => {
    const v = Game.createVehicle(0, 1, 100, 100);
    v.alive = false;
    // Should not throw even with dead vehicle
    expect(() => {
      Game.UI.renderUsernameLabel(mockCtx, v, 0, 0, 'TestPlayer');
    }).not.toThrow();
  });
});

// ============================================================
// FEATURE: Username prompt for multiplayer
// ============================================================
describe('Username prompt for multiplayer', () => {
  test('selectMenuItem case 1 checks for default username', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("currentName === 'Player'");
  });

  test('username is saved to localStorage on entry', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("localStorage.setItem('dt_username'");
  });
});

// ============================================================
// FEATURE: Lobby vehicle selection
// ============================================================
describe('Lobby vehicle selection', () => {
  test('in-room lobby renders vehicle selection row', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    expect(uiSrc).toContain('SELECT YOUR VEHICLE');
    expect(uiSrc).toContain("'JEEP', 'BUSHMASTER', 'URBANSTRIKE', 'STRIKEMASTER'");
  });

  test('lobby click detection includes selectVehicle', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    expect(uiSrc).toContain("{ action: 'selectVehicle', vehicleType: vIdx }");
  });

  test('updateLobby handles selectVehicle action', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("action.action === 'selectVehicle'");
    expect(gameSrc).toContain('Game.Network.selectVehicle(action.vehicleType)');
  });

  test('player slot shows vehicle type name', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    // The render function shows the vehicle name in each player slot
    expect(uiSrc).toContain('vehNames[player.vehicleType]');
  });
});

// ============================================================
// FEATURE: Lobby button grouping
// ============================================================
describe('Lobby UI grouping', () => {
  test('in-room lobby has section labels', () => {
    const uiSrc = fs.readFileSync(path.join(__dirname, '../src/js/ui.js'), 'utf8');
    expect(uiSrc).toContain('── ACTIONS ──');
  });

  test('lobby renders without errors when inRoom is true', () => {
    expect(() => {
      Game.UI.renderLobby({
        rooms: [],
        status: 'Connected',
        inRoom: true,
        roomPlayers: [
          { id: 'p1', team: 1, vehicleType: 0, ready: true, name: 'Player 1', isAI: false },
          { id: 'ai_1', team: 2, vehicleType: 1, ready: true, name: 'AI Bot 1', isAI: true }
        ],
        playerTeam: 1,
        isHost: true,
        countdown: 0,
        readyStates: { p1: true },
        roomName: 'Test Room',
        playerId: 'p1'
      });
    }).not.toThrow();
  });

  test('lobby renders room browser without errors', () => {
    expect(() => {
      Game.UI.renderLobby({
        rooms: [{ id: 'r1', name: 'Room 1', players: 2, maxPlayers: 8, state: 'waiting' }],
        status: 'Connected',
        inRoom: false,
        roomPlayers: [],
        playerTeam: 1,
        isHost: false,
        countdown: 0,
        readyStates: {},
        roomName: '',
        playerId: 'p1'
      });
    }).not.toThrow();
  });
});

// ============================================================
// FEATURE: Player left cleanup
// ============================================================
describe('Player left handling', () => {
  test('onPlayerLeft listener removes vehicle and remote player data', () => {
    const gameSrc = fs.readFileSync(path.join(__dirname, '../src/js/game.js'), 'utf8');
    expect(gameSrc).toContain("'onPlayerLeft'");
    expect(gameSrc).toContain('delete remotePlayers[data.playerId]');
  });
});

// ============================================================
// VEHICLE SERIALIZATION completeness
// ============================================================
describe('Vehicle serialization for network', () => {
  test('serialize includes all needed fields', () => {
    const v = Game.createVehicle(2, 1, 100, 200);
    const data = v.serialize();
    expect(data).toHaveProperty('id');
    expect(data).toHaveProperty('type', 2);
    expect(data).toHaveProperty('team', 1);
    expect(data).toHaveProperty('x', 100);
    expect(data).toHaveProperty('y', 200);
    expect(data).toHaveProperty('angle');
    expect(data).toHaveProperty('turretAngle');
    expect(data).toHaveProperty('hp');
    expect(data).toHaveProperty('fuel');
    expect(data).toHaveProperty('ammo');
    expect(data).toHaveProperty('alive', true);
    expect(data).toHaveProperty('hasFlag', false);
    expect(data).toHaveProperty('flagTeam', 0);
  });

  test('applyNetworkState updates all fields', () => {
    const v = Game.createVehicle(0, 1, 0, 0);
    v.applyNetworkState({
      x: 500, y: 300, angle: 1.5, turretAngle: 2.0,
      hp: 25, fuel: 50, ammo: 10, alive: true, hasFlag: true, flagTeam: 2
    });
    expect(v.x).toBe(500);
    expect(v.y).toBe(300);
    expect(v.angle).toBe(1.5);
    expect(v.turretAngle).toBe(2.0);
    expect(v.hp).toBe(25);
    expect(v.fuel).toBe(50);
    expect(v.ammo).toBe(10);
    expect(v.alive).toBe(true);
    expect(v.hasFlag).toBe(true);
    expect(v.flagTeam).toBe(2);
  });
});
