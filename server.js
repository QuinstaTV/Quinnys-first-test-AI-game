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
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 10000,
  pingInterval: 5000
});

const PORT = process.env.PORT || 3000;

// Health check endpoint (before static — Render keep-alive / monitoring)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', uptime: process.uptime(), rooms: rooms.size, players: players.size });
});

// Serve static files from src/
app.use(express.static(path.join(__dirname, 'src')));

// Redirect root to index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'src', 'index.html'));
});

/* ========== GAME STATE ========== */

const rooms = new Map();      // roomId -> Room
const players = new Map();    // socketId -> Player

let nextAIId = 1;
let nextPlayerId = 1;  // For unique default player names

class Room {
  constructor(id, name, hostId) {
    this.id = id;
    this.name = name;
    this.hostId = hostId;
    this.players = new Map(); // socketId -> { team, vehicleType, ready, name, isAI }
    this.maxPlayers = 8; // 4v4
    this.state = 'waiting'; // 'waiting', 'playing', 'finished'
    this.scores = { team1: 0, team2: 0 };
    this.mapSeed = Math.floor(Math.random() * 999999);
    this.createdAt = Date.now();
    this.countdownTimer = null;
    this.countdown = 0;
  }

  addPlayer(socketId, username) {
    if (this.players.size >= this.maxPlayers) return null;
    
    // Assign team (balance teams)
    let team1Count = 0, team2Count = 0;
    this.players.forEach(p => {
      if (p.team === 1) team1Count++;
      else team2Count++;
    });
    const team = team1Count <= team2Count ? 1 : 2;
    
    // Ensure unique player name
    let name = (username && username.trim() && username.trim() !== 'Player') ? username.trim() : 'Player ' + (nextPlayerId++);
    // Check for duplicate names in this room
    let baseName = name;
    let suffix = 2;
    let nameExists = true;
    while (nameExists) {
      nameExists = false;
      for (const [, p] of this.players) {
        if (p.name === name) { nameExists = true; break; }
      }
      if (nameExists) { name = baseName + ' (' + suffix + ')'; suffix++; }
    }
    
    const playerData = { team, vehicleType: 0, ready: false, name, isAI: false };
    this.players.set(socketId, playerData);
    return playerData;
  }

  addAI(team) {
    // Count players on this team
    let teamCount = 0;
    this.players.forEach(p => { if (p.team === team) teamCount++; });
    if (teamCount >= 4) return null; // max 4 per team
    if (this.players.size >= this.maxPlayers) return null;

    const aiId = 'ai_' + (nextAIId++);
    // Give AI bots unique names
    let aiNum = 0;
    for (const [, p] of this.players) { if (p.isAI) aiNum++; }
    const aiName = 'AI Bot ' + (aiNum + 1);
    const playerData = { team, vehicleType: Math.floor(Math.random() * 4), ready: true, name: aiName, isAI: true };
    this.players.set(aiId, playerData);
    return { id: aiId, data: playerData };
  }

  removePlayer(socketId) {
    this.players.delete(socketId);

    // Remove all AI bots if no human players remain
    let hasHuman = false;
    for (const [, p] of this.players) {
      if (!p.isAI) { hasHuman = true; break; }
    }
    if (!hasHuman) {
      // Clear all AI — room will be deleted as empty by caller
      this.players.clear();
      this.hostId = null;
      this.stopCountdown();
      return;
    }

    if (this.hostId === socketId) {
      // Transfer host to first non-AI player
      for (const [id, p] of this.players) {
        if (!p.isAI) {
          this.hostId = id;
          break;
        }
      }
    }
    // Stop countdown if running
    this.stopCountdown();
  }

  switchTeam(socketId) {
    const p = this.players.get(socketId);
    if (!p) return;
    const targetTeam = p.team === 1 ? 2 : 1;
    // Check if target team has room (max 4)
    let targetCount = 0;
    this.players.forEach(pl => { if (pl.team === targetTeam) targetCount++; });
    if (targetCount >= 4) return false;
    p.team = targetTeam;
    p.ready = false; // switching unreadies
    this.stopCountdown();
    return true;
  }

  toggleReady(socketId) {
    const p = this.players.get(socketId);
    if (!p || p.isAI) return;
    p.ready = !p.ready;
    // If anyone unreadies, stop countdown
    if (!p.ready) this.stopCountdown();
  }

  allReady() {
    for (const [, p] of this.players) {
      if (!p.isAI && !p.ready) return false;
    }
    return this.players.size >= 1; // at least 1 player
  }

  startCountdown(io) {
    if (this.countdownTimer) return;
    this.countdown = 10;
    this.broadcastLobbyUpdate(io);
    this.countdownTimer = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownTimer);
        this.countdownTimer = null;
        // Start the game
        this.state = 'playing';
        io.to(this.id).emit('gameStart', {
          mapSeed: this.mapSeed,
          players: this.getPlayerList()
        });
      } else {
        io.to(this.id).emit('countdown', { value: this.countdown });
      }
    }, 1000);
  }

  stopCountdown() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
      this.countdown = 0;
      // Unready all non-AI players
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

  broadcastLobbyUpdate(io) {
    io.to(this.id).emit('lobbyUpdate', {
      players: this.getPlayerList(),
      countdown: this.countdown,
      hostId: this.hostId,
      roomName: this.name
    });
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
    const username = (data && data.username) || 'Player';
    const room = new Room(roomId, name, socket.id);
    const playerData = room.addPlayer(socket.id, username);
    rooms.set(roomId, room);
    
    const player = players.get(socket.id);
    player.roomId = roomId;
    
    socket.join(roomId);
    socket.emit('roomJoined', {
      roomId,
      team: playerData.team,
      isHost: true,
      roomName: name
    });
    room.broadcastLobbyUpdate(io);

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
    
    const username = (data && data.username) || 'Player';
    const playerData = room.addPlayer(socket.id, username);
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
      isHost: room.hostId === socket.id,
      roomName: room.name
    });

    // Broadcast updated lobby to all in room
    room.broadcastLobbyUpdate(io);

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
      // Broadcast so other players see the vehicle selection
      room.broadcastLobbyUpdate(io);
    }
  });

  socket.on('startGame', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || room.hostId !== socket.id) return;
    if (!room.allReady()) {
      socket.emit('error', { message: 'Not all players are ready' });
      return;
    }

    // Start 10 second countdown
    room.startCountdown(io);
    console.log(`Countdown started in room ${player.roomId}`);
  });

  socket.on('cancelCountdown', () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room || room.hostId !== socket.id) return;
    room.stopCountdown();
    room.broadcastLobbyUpdate(io);
    console.log(`Countdown cancelled in room ${player.roomId}`);
  });

  socket.on('toggleReady', () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;
    room.toggleReady(socket.id);
    room.broadcastLobbyUpdate(io);
  });

  socket.on('switchTeam', () => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;
    if (room.switchTeam(socket.id)) {
      room.broadcastLobbyUpdate(io);
    } else {
      socket.emit('error', { message: 'Target team is full (max 4)' });
    }
  });

  socket.on('addAI', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    const room = rooms.get(player.roomId);
    if (!room) return;
    // Only the host can add AI bots
    if (room.hostId !== socket.id) {
      socket.emit('error', { message: 'Only the host can add AI' });
      return;
    }
    const team = data && data.team ? data.team : 1;
    const result = room.addAI(team);
    if (result) {
      room.broadcastLobbyUpdate(io);
    } else {
      socket.emit('error', { message: 'Cannot add AI (team full or room full)' });
    }
  });

  /* --- In-Game Sync --- */
  socket.on('vehicleState', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    
    // Broadcast to all other players in the room
    data.playerId = socket.id;
    // Include player name for nametag rendering
    const room = rooms.get(player.roomId);
    if (room) {
      const roomPlayer = room.players.get(socket.id);
      if (roomPlayer) data.name = roomPlayer.name;
    }
    socket.to(player.roomId).volatile.emit('gameState', data);
  });

  // Vehicle damage relay — authoritative hit notification
  socket.on('vehicleDamage', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    // Broadcast to all players including the target so they take damage
    data.attackerId = socket.id;
    io.to(player.roomId).emit('vehicleDamage', data);
  });

  // Vehicle respawn/type change relay
  socket.on('vehicleRespawn', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.roomId) return;
    data.playerId = socket.id;
    socket.to(player.roomId).emit('vehicleRespawn', data);
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
  const roomId = player.roomId;
  if (room) {
    room.removePlayer(socket.id);
    socket.to(roomId).emit('playerLeft', { playerId: socket.id });

    // Remove empty rooms
    if (room.players.size === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      // Broadcast updated lobby to remaining players
      room.broadcastLobbyUpdate(io);
    }
  }

  socket.leave(roomId);
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
  console.log(`  ║  Port: ${PORT}                                ║`);
  console.log('  ║  Open in browser to play!                 ║');
  console.log('  ║  Share your URL for multiplayer.          ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
});

/* ========== GRACEFUL SHUTDOWN (Render sends SIGTERM on deploy/scale) ========== */

process.on('SIGTERM', () => {
  console.log('SIGTERM received - shutting down gracefully');
  io.close(() => {
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
  // Force exit after 10s if graceful close stalls
  setTimeout(() => process.exit(0), 10000);
});
