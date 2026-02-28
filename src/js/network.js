/* ============================================================
   network.js - Socket.io multiplayer client
   Handles lobby, game sync, disconnection
   Enhanced: ready/unready, team switching, AI slots, countdown
   ============================================================ */
(function () {
  'use strict';

  let socket = null;
  let connected = false;
  let roomId = null;
  let playerId = null;
  let playerTeam = 0;
  let isHost = false;
  let inRoom = false;
  let lobby = { rooms: [], players: [] };
  let lobbyData = {
    players: [],
    countdown: 0,
    hostId: null,
    roomName: ''
  };
  let callbacks = {};

  function connect(serverUrl) {
    return new Promise((resolve, reject) => {
      if (typeof io === 'undefined') {
        console.warn('Socket.io not loaded - multiplayer unavailable');
        reject(new Error('Socket.io not loaded'));
        return;
      }

      socket = io(serverUrl || window.location.origin, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000
      });

      socket.on('connect', () => {
        connected = true;
        playerId = socket.id;
        console.log('Connected to server:', playerId);
        resolve(playerId);
      });

      socket.on('disconnect', () => {
        connected = false;
        roomId = null;
        inRoom = false;
        if (callbacks.onDisconnect) callbacks.onDisconnect();
      });

      socket.on('connect_error', (err) => {
        console.warn('Connection error:', err.message);
        reject(err);
      });

      // Lobby events
      socket.on('roomList', (rooms_) => {
        lobby.rooms = rooms_;
        if (callbacks.onRoomList) callbacks.onRoomList(rooms_);
      });

      socket.on('roomJoined', (data) => {
        roomId = data.roomId;
        playerTeam = data.team;
        isHost = data.isHost;
        inRoom = true;
        lobbyData.roomName = data.roomName || '';
        if (callbacks.onRoomJoined) callbacks.onRoomJoined(data);
      });

      socket.on('lobbyUpdate', (data) => {
        lobbyData.players = data.players || [];
        lobbyData.countdown = data.countdown || 0;
        lobbyData.hostId = data.hostId;
        lobbyData.roomName = data.roomName || lobbyData.roomName;
        isHost = (data.hostId === playerId);
        // Update our team from player list
        for (let i = 0; i < lobbyData.players.length; i++) {
          if (lobbyData.players[i].id === playerId) {
            playerTeam = lobbyData.players[i].team;
            break;
          }
        }
        if (callbacks.onLobbyUpdate) callbacks.onLobbyUpdate(data);
      });

      socket.on('countdown', (data) => {
        lobbyData.countdown = data.value;
        if (callbacks.onCountdown) callbacks.onCountdown(data);
      });

      socket.on('roomUpdate', (data) => {
        if (callbacks.onRoomUpdate) callbacks.onRoomUpdate(data);
      });

      socket.on('gameStart', (data) => {
        inRoom = false;
        if (callbacks.onGameStart) callbacks.onGameStart(data);
      });

      // In-game events
      socket.on('gameState', (data) => {
        if (callbacks.onGameState) callbacks.onGameState(data);
      });

      socket.on('playerAction', (data) => {
        if (callbacks.onPlayerAction) callbacks.onPlayerAction(data);
      });

      socket.on('flagEvent', (data) => {
        if (callbacks.onFlagEvent) callbacks.onFlagEvent(data);
      });

      socket.on('tileDestroyed', (data) => {
        if (callbacks.onTileDestroyed) callbacks.onTileDestroyed(data);
      });

      socket.on('playerLeft', (data) => {
        if (callbacks.onPlayerLeft) callbacks.onPlayerLeft(data);
      });

      socket.on('vehicleDamage', (data) => {
        if (callbacks.onVehicleDamage) callbacks.onVehicleDamage(data);
      });

      socket.on('vehicleRespawn', (data) => {
        if (callbacks.onVehicleRespawn) callbacks.onVehicleRespawn(data);
      });

      socket.on('chatMessage', (data) => {
        if (callbacks.onChat) callbacks.onChat(data);
      });

      socket.on('error', (data) => {
        console.warn('Server error:', data.message);
        if (callbacks.onError) callbacks.onError(data);
      });

      // Timeout - generous for Render cold starts (~30-90s)
      setTimeout(() => {
        if (!connected) reject(new Error('Connection timeout'));
      }, 15000);
    });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    connected = false;
    roomId = null;
    inRoom = false;
  }

  /* ---------- Lobby actions ---------- */
  function createRoom(name, username) {
    if (!connected) return;
    socket.emit('createRoom', { name, username: username || 'Player' });
  }

  function joinRoom(id, username) {
    if (!connected) return;
    socket.emit('joinRoom', { roomId: id, username: username || 'Player' });
  }

  function leaveRoom() {
    if (!connected || !roomId) return;
    socket.emit('leaveRoom');
    roomId = null;
    inRoom = false;
    lobbyData = { players: [], countdown: 0, hostId: null, roomName: '' };
  }

  function requestRooms() {
    if (!connected) return;
    socket.emit('getRooms');
  }

  function startGame(vehicleType) {
    if (!connected || !roomId) return;
    socket.emit('startGame', { vehicleType });
  }

  function cancelCountdown() {
    if (!connected || !roomId) return;
    socket.emit('cancelCountdown');
  }

  function toggleReady() {
    if (!connected || !roomId) return;
    socket.emit('toggleReady');
  }

  function switchTeam() {
    if (!connected || !roomId) return;
    socket.emit('switchTeam');
  }

  function addAI(team) {
    if (!connected || !roomId) return;
    socket.emit('addAI', { team });
  }

  function selectVehicle(vehicleType) {
    if (!connected) return;
    socket.emit('selectVehicle', { vehicleType });
  }

  /* ---------- In-game sync ---------- */
  function sendState(vehicleState) {
    if (!connected || !roomId) return;
    socket.volatile.emit('vehicleState', vehicleState); // volatile = ok to drop
  }

  function sendAction(action) {
    if (!connected || !roomId) return;
    socket.emit('action', action);
  }

  function sendFlagEvent(event) {
    if (!connected || !roomId) return;
    socket.emit('flagEvent', event);
  }

  function sendTileDestroyed(tx, ty) {
    if (!connected || !roomId) return;
    socket.emit('tileDestroyed', { tx, ty });
  }

  function sendDamage(data) {
    if (!connected || !roomId) return;
    socket.emit('vehicleDamage', data);
  }

  function sendRespawn(data) {
    if (!connected || !roomId) return;
    socket.emit('vehicleRespawn', data);
  }

  function sendChat(message) {
    if (!connected) return;
    socket.emit('chatMessage', { message });
  }

  /* ---------- Callbacks ---------- */
  function on(event, cb) {
    callbacks[event] = cb;
  }

  window.Game.Network = {
    connect, disconnect,
    createRoom, joinRoom, leaveRoom, requestRooms,
    startGame, cancelCountdown, toggleReady, switchTeam, addAI,
    selectVehicle,
    sendState, sendAction, sendFlagEvent, sendTileDestroyed, sendDamage, sendRespawn, sendChat,
    on,
    get connected() { return connected; },
    get roomId() { return roomId; },
    get playerId() { return playerId; },
    get playerTeam() { return playerTeam; },
    get isHost() { return isHost; },
    get inRoom() { return inRoom; },
    get lobby() { return lobby; },
    get lobbyData() { return lobbyData; }
  };
})();
