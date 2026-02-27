# 🏴 Damaged Territory - Capture the Flag

A top-down vehicular **Capture the Flag** shooter inspired by the classic **Return Fire** (1995). Built entirely in HTML5 Canvas + JavaScript with zero external assets — all graphics and audio are procedurally generated.

**Free to play • Open source (MIT) • Online multiplayer**

![Gameplay](https://img.shields.io/badge/Genre-Top--Down_Shooter-orange) ![License](https://img.shields.io/badge/License-MIT-green) ![Multiplayer](https://img.shields.io/badge/Multiplayer-Online_via_WebSockets-blue)

---

## 🎮 How to Play

### Objective
Steal the enemy team's flag and return it to your base. **First to 3 captures wins the round!** Play **10 rounds** — most round wins takes the game.

### Controls
| Key | Action |
|-----|--------|
| WASD / Arrow Keys | Move vehicle |
| Mouse Click / Space | Shoot |
| E | Lay mine (ASV only) |
| M | Toggle music |
| ESC | Pause / Menu |
| 1-4 | Select vehicle type |

### Vehicles

| Vehicle | Speed | Armor | Weapon | Special |
|---------|-------|-------|--------|---------|
| **Jeep** | ★★★★★ | ★★ | Machine Gun | Only flag carrier! Can cross water briefly |
| **BushMaster** | ★★★ | ★★★★ | 360° Cannon | Balanced fighter, heavy armor |
| **UrbanStrike** | ★★★★ | ★★ | Strafe Guns | Flies over terrain, detects mines |
| **StrikeMaster** | ★★ | ★★★★★ | Rockets | Lays instant-kill mines |

### Tips
- Only the **Jeep** can carry the flag — protect your Jeep!
- Vehicles have **limited fuel and ammo** — return to base or depots to resupply
- **Destroy walls** to create new attack routes
- The **UrbanStrike** can fly over everything and reveals hidden mines
- The **StrikeMaster** lays mines — great for base defense
- Your own flag must be at your base to score

---

## 🚀 Quick Start

### Option 1: Single Player (Instant — No Server Needed)
1. Open `src/index.html` in any modern browser
2. Or use VS Code's **Live Server** extension: right-click `src/index.html` → "Open with Live Server"
3. Click **Single Player** → Pick a vehicle → Play!

### Option 2: Multiplayer (Requires Node.js)
```bash
# 1. Install dependencies
npm install

# 2. Start the game server
npm start

# 3. Open in browser
# → http://localhost:3000

# 4. Share your IP with friends for multiplayer!
#    They connect to http://YOUR_IP:3000
```

### Option 3: Play Online (Render.com)
The game is deployed as a free-tier Web Service on Render:

🌐 **https://your-service-name.onrender.com** *(replace with your actual URL)*

> **Free-tier note:** The server sleeps after ~15 minutes of inactivity. The first connection after idle may take **30–90 seconds** to wake up — you'll see a loading message. Once awake, gameplay is fully responsive. Share the URL with friends — anyone can join!

---

## 📁 Project Structure

```
├── package.json          # Node.js config & dependencies
├── server.js             # Multiplayer server (Express + Socket.io)
├── LICENSE               # MIT License
├── README.md             # This file
├── CHANGELOG.md          # Version history
├── tests/                # Jest unit tests
│   ├── setup.js          # Browser mock setup
│   ├── utils.test.js     # Constants & math helper tests
│   ├── map.test.js       # Map generation tests
│   └── vehicles.test.js  # Vehicle stat & lifecycle tests
└── src/
    ├── index.html        # Game entry point
    ├── css/
    │   └── style.css     # Game styling
    └── js/
        ├── utils.js      # Constants, math helpers, A* pathfinding
        ├── input.js      # Keyboard, mouse, touch input
        ├── sprites.js    # Procedural sprite generation (zero assets!)
        ├── map.js        # Procedural island map generator
        ├── particles.js  # Particle effects (explosions, smoke)
        ├── projectiles.js # Bullets, shells, rockets, mines
        ├── vehicles.js   # 4 vehicle classes with stats/weapons
        ├── ai.js         # Enemy AI with FSM (patrol/attack/defend)
        ├── audio.js      # Procedural audio via Web Audio API
        ├── network.js    # Socket.io multiplayer client
        ├── ui.js         # Menus, HUD, minimap, notifications
        └── game.js       # Main game loop & state management
```

---

## 🧪 Testing

```bash
# Run all unit tests
npm test

# Tests cover:
# - utils.js: constants, math helpers, geometry, tile functions
# - map.js: seeded generation, determinism, escalation, spawn positions
# - vehicles.js: stats, creation, damage, death, respawn, flag carrying
```

---

## 🛠️ Tech Stack

- **Rendering**: HTML5 Canvas 2D
- **Logic**: Vanilla JavaScript (no frameworks)
- **Audio**: Web Audio API (procedural — no audio files)
- **Graphics**: All procedurally generated (no image files)
- **Multiplayer**: Socket.io over WebSockets
- **Server**: Node.js + Express
- **Total size**: < 100KB (excluding node_modules)

---

## 🎵 Music

Each vehicle has a unique classical-inspired music theme generated in real-time using Web Audio oscillators:
- **Jeep**: Fast, energetic chase music
- **BushMaster**: Heavy, driving Mars-like rhythm (Holst)
- **UrbanStrike**: Soaring, triumphant (Valkyries feel)
- **StrikeMaster**: Bombastic, heavy (1812 Overture feel)

---

## 🎯 Game Features

- ✅ 4 unique vehicles with different play styles
- ✅ **10-round game** with per-round and final stats screens
- ✅ **Seed-based procedural maps** — unique terrain each round
- ✅ Round 10 "EPIC" mode with larger maps
- ✅ Procedurally generated island maps
- ✅ Destructible environments (walls, bridges, trees)
- ✅ AI opponents with patrol/attack/defend/capture behaviors
- ✅ Online multiplayer (2-4 players via WebSockets)
- ✅ Lobby system with room creation/joining
- ✅ Fuel/ammo management & resupply depots
- ✅ Screen shake, particles, explosions
- ✅ Minimap with real-time tracking
- ✅ Laughing skull death animation
- ✅ Classical music themes per vehicle
- ✅ Touch controls for mobile
- ✅ **44 unit tests** via Jest (`npm test`)
- ✅ Zero external assets — everything generated in code
- ✅ MIT License — completely free

---

## 📜 Inspired By

- **Return Fire** (Silent Software, 1995) — The original vehicular CTF classic
- **Damaged Territory** — Fan-made remake of Return Fire

---

## 📄 License

MIT License — See [LICENSE](LICENSE) for details. Free to use, modify, and distribute.
Quick test to see if I can create a game using AI from scratch
