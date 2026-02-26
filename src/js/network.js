/* ============================================================
   network.js - Socket.io multiplayer client
   Handles lobby, game sync, disconnection
   ============================================================ */
(function () {
  'use strict';

  let socket = null;
  let connected = false;
  let roomId = null;
  let playerId = null;
  let playerTeam = 0;
  let isHost = false;
  let lobby = { rooms: [], players: [] };
  let callbacks = {};

  function connect(serverUrl) {
    return new Promise((resolve, reject) => {
      if (typeof io === 'undefined') {
        console.warn('Socket.io not loaded - multiplayer unavailable');
        reject(new Error('Socket.io not loaded'));
        return;
      }

      socket = io(serverUrl || window.location.origin, {
        transports: ['websocket', 'polling']
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
        if (callbacks.onDisconnect) callbacks.onDisconnect();
      });

      socket.on('connect_error', (err) => {
        console.warn('Connection error:', err.message);
        reject(err);
      });

      // Lobby events
      socket.on('roomList', (rooms) => {
        lobby.rooms = rooms;
        if (callbacks.onRoomList) callbacks.onRoomList(rooms);
      });

      socket.on('roomJoined', (data) => {
        roomId = data.roomId;
        playerTeam = data.team;
        isHost = data.isHost;
        if (callbacks.onRoomJoined) callbacks.onRoomJoined(data);
      });

      socket.on('roomUpdate', (data) => {
        if (callbacks.onRoomUpdate) callbacks.onRoomUpdate(data);
      });

      socket.on('gameStart', (data) => {
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

      socket.on('chatMessage', (data) => {
        if (callbacks.onChat) callbacks.onChat(data);
      });

      socket.on('error', (data) => {
        console.warn('Server error:', data.message);
        if (callbacks.onError) callbacks.onError(data);
      });

      // Timeout
      setTimeout(() => {
        if (!connected) reject(new Error('Connection timeout'));
      }, 5000);
    });
  }

  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    connected = false;
    roomId = null;
  }

  /* ---------- Lobby actions ---------- */
  function createRoom(name) {
    if (!connected) return;
    socket.emit('createRoom', { name });
  }

  function joinRoom(id) {
    if (!connected) return;
    socket.emit('joinRoom', { roomId: id });
  }

  function leaveRoom() {
    if (!connected || !roomId) return;
    socket.emit('leaveRoom');
    roomId = null;
  }

  function requestRooms() {
    if (!connected) return;
    socket.emit('getRooms');
  }

  function startGame(vehicleType) {
    if (!connected || !roomId) return;
    socket.emit('startGame', { vehicleType });
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
    startGame, selectVehicle,
    sendState, sendAction, sendFlagEvent, sendTileDestroyed, sendChat,
    on,
    get connected() { return connected; },
    get roomId() { return roomId; },
    get playerId() { return playerId; },
    get playerTeam() { return playerTeam; },
    get isHost() { return isHost; },
    get lobby() { return lobby; }
  };
})();
