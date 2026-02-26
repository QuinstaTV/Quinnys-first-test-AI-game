/* ============================================================
   server.js - Node.js multiplayer game server
   Express for static files, Socket.io for real-time game sync
   Handles: lobbies, rooms, matchmaking, state broadcasting
   ============================================================ */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 10000,
  pingInterval: 5000
});

const PORT = process.env.PORT || 3000;

// Serve static files from src/
app.use(express.static(path.join(__dirname, 'src')));

// Redirect root to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

/* ========== GAME STATE ========== */

const rooms = new Map();      // roomId -> Room
const players = new Map();    // socketId -> Player

class Room {
  constructor(id, name, hostId) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.players = new Map(); // socketId -> { team, vehicleType, ready }
    this.maxPlayers = 4;
    this.state = 'waiting'; // 'waiting', 'playing', 'finished'
    this.scores = { team1: 0, team2: 0 };
    this.mapSeed = Math.floor(Math.random() * 999999);
    this.createdAt = Date.now();
  }

  addPlayer(socketId) {
    if (this.players.size >= this.maxPlayers) return null;
    
    // Assign team (balance teams)
    let team1Count = 0, team2Count = 0;
    this.players.forEach(p => {
      if (p.team === 1) team1Count++;
      else team2Count++;
    });
    const team = team1Count <= team2Count ? 1 : 2;
    
    const playerData = { team, vehicleType: 0, ready: false };
    this.players.set(socketId, playerData);
    return playerData;
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    if (this.hostId === socketId) {
      // Transfer host
      const firstPlayer = this.players.keys().next();
      if (!firstPlayer.done) {
        this.hostId = firstPlayer.value;
      }
    }
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

/* ========== SOCKET HANDLERS ========== */

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);
  players.set(socket.id, { roomId: null });

  /* --- Lobby --- */
  socket.on('getRooms', () => {
    const roomList = [];
    rooms.forEach(room => {
      if (room.state === 'waiting') {
        roomList.push(room.serialize());
      }
    });
    socket.emit('roomList', roomList);
  });

  socket.on('createRoom', (data) => {
    const roomId = 'room_' + Date.now().toString(36);
    const name = (data && data.name) || 'Game Room';
    const room = new Room(roomId, name, socket.id);
    const playerData = room.addPlayer(socket.id);
    rooms.set(roomId, room);
    
    const player = players.get(socket.id);
    player.roomId = roomId;
    
    socket.join(roomId);
    socket.emit('roomJoined', {
      roomId,
      team: playerData.team,
      isHost: true
    });

    console.log(`Room created: ${roomId} by ${socket.id}`);
    broadcastRoomList();
  });

  socket.on('joinRoom', (data) => {
    if (!data || !data.roomId) return;
    const room = rooms.get(data.roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('error', { message: 'Game already in progress' });
      return;
    }
    
    const playerData = room.addPlayer(socket.id);
    if (!playerData) {
      socket.emit('error', { message: 'Room is full' });
      return;
    }

    const player = players.get(socket.id);
    player.roomId = data.roomId;

    socket.join(data.roomId);
    socket.emit('roomJoined', {
      roomId: data.roomId,
      team: playerData.team,
      isHost: room.hostId === socket.id
    });

    // Notify others
    socket.to(data.roomId).emit('roomUpdate', {
      players: Array.from(room.players.entries()).map(([id, p]) => ({
        id, team: p.team, vehicleType: p.vehicleType
      }))
    });

    console.log(`Player ${socket.id} joined room ${data.roomId} as team ${playerData.team}`);
    broadcastRoomList();
  });

  socket.on('leaveRoom', () => {
    leaveCurrentRoom(socket);
  });

  socket.on('selectVehicle', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;
    const roomPlayer = room.players.get(socket.id);
    if (roomPlayer) {
      roomPlayer.vehicleType = data.vehicleType;
    }
  });

  socket.on('startGame', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.size < 2) {
      socket.emit('error', { message: 'Need at least 2 players' });
      return;
    }

    room.state = 'playing';
    
    // Send game start to all players in room
    io.to(player.roomId).emit('gameStart', {
      mapSeed: room.mapSeed,
      players: Array.from(room.players.entries()).map(([id, p]) => ({
        id, team: p.team, vehicleType: p.vehicleType
      }))
    });

    console.log(`Game started in room ${player.roomId}`);
  });

  /* --- In-Game Sync --- */
  socket.on('vehicleState', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    // Broadcast to all other players in the room
    data.playerId = socket.id;
    socket.to(player.roomId).volatile.emit('gameState', data);
  });

  socket.on('action', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    data.playerId = socket.id;
    socket.to(player.roomId).emit('playerAction', data);
  });

  socket.on('flagEvent', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    data.playerId = socket.id;
    io.to(player.roomId).emit('flagEvent', data);
  });

  socket.on('tileDestroyed', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    socket.to(player.roomId).emit('tileDestroyed', data);
  });

  socket.on('chatMessage', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    io.to(player.roomId).emit('chatMessage', {
      playerId: socket.id,
      message: data.message
    });
  });

  /* --- Disconnect --- */
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    leaveCurrentRoom(socket);
    players.delete(socket.id);
  });
});

/* ========== HELPERS ========== */

function leaveCurrentRoom(socket) {
  const player = players.get(socket.id);
  if (!player || !player.roomId) return;

  const room = rooms.get(player.roomId);
  if (room) {
    room.removePlayer(socket.id);
    socket.to(player.roomId).emit('playerLeft', { playerId: socket.id });

    // Remove empty rooms
    if (room.players.size === 0) {
      rooms.delete(player.roomId);
      console.log(`Room ${player.roomId} deleted (empty)`);
    }
  }

  socket.leave(player.roomId);
  player.roomId = null;
  broadcastRoomList();
}

function broadcastRoomList() {
  const roomList = [];
  rooms.forEach(room => {
    if (room.state === 'waiting') {
      roomList.push(room.serialize());
    }
  });
  io.emit('roomList', roomList);
}

// Cleanup stale rooms periodically
setInterval(() => {
  const now = Date.now();
  rooms.forEach((room, id) => {
    // Remove rooms older than 30 minutes with no players
    if (room.players.size === 0 && now - room.createdAt > 30 * 60 * 1000) {
      rooms.delete(id);
    }
  });
}, 60000);

/* ========== START SERVER ========== */

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║     DAMAGED TERRITORY - Game Server       ║');
  console.log('  ╠═══════════════════════════════════════════╣');
  console.log(`  ║  Server running on http://localhost:${PORT}  ║`);
  console.log('  ║                                           ║');
  console.log('  ║  Open in browser to play!                 ║');
  console.log('  ║  Share your IP for multiplayer.           ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
});
