# CHANGELOG — Damaged Territory

## v1.1.0 — Phase 5 Overhaul

### Vehicle Renames
- **Jeep** (was BushMaster) — VEH.JEEP, the fast flag-carrier
- **BushMaster** (was Tank) — VEH.TANK, heavy 360° auto-aim cannon
- **Helicopter** (was UrbanStrike) — VEH.HELI, flies over everything
- **StrikeMaster** — VEH.ASV, rockets + mine layer (unchanged)

### Fuel System
- **3× fuel capacity** on all vehicles (Jeep: 300, BushMaster: 240, Helicopter: 180, StrikeMaster: 270)
- **All vehicles now explode on fuel=0** — ground vehicles stall for 2s then explode, helicopter crashes over 3s
- **Fuel warning SFX** — urgent double-beep plays every 2s when fuel drops below 20%
- Blinking `⚠ LOW FUEL!` HUD warning already in place

### Base Turrets
- Turrets now show **HP bars** when damaged (green/yellow/red color coding)
- Turrets are **destructible by projectiles** — explosive projectiles deal 30 dmg, bullets deal normal damage
- Destroyed turrets render as rubble circles
- **Team indicator dots** on turrets (blue/red glow)
- "Turret destroyed!" notification on kill

### Jeep Lives System
- Jeep gets **3 respawn lives per round** (♥ ♥ ♥ displayed in HUD)
- Each Jeep death costs one life; only marked unavailable when all 3 lives spent
- Lives reset when vehicle pool resets (all vehicles lost → enemy scores)
- Notification shows remaining lives on each death

### BushMaster Auto-Aim Turret
- BushMaster (Tank) turret now **auto-tracks nearest enemy** within 400px range
- Falls back to mouse-aim when no enemies in range
- AI tanks also benefit from improved turret logic

### Movement Overhaul
- **True directional WASD** — vehicle moves immediately in pressed direction
- Body sprite rotates smoothly to match movement direction
- Eliminates the old "turn-then-move" sluggishness
- Helicopter and all ground vehicles benefit

### Vehicle Select Garage
- **WASD/Arrow Keys** now navigate vehicle selection (A/D = left/right)
- Updated deploy prompt: "Press ENTER/CLICK to deploy | A/D or ←/→ to browse"
- **Animated warning strip** at top of bunker (moving chevron hazard pattern)
- Vehicle descriptions updated for new names and auto-aim

### Round Reset & Map Cycling
- Game Over → Enter now generates a **fresh new map** for next round
- Vehicle pool and Jeep lives fully reset on new round
- Escape from Game Over returns to main menu (map cleared)

### Bug Fixes
- **A* pathfinding**: Helicopter no longer blocked by walls (was incorrectly checking `T.WALL`)
- **Turret serialization**: Team data now preserved in network serialize/deserialize
- **Mine friendly trigger**: Mines still trigger on friendly proximity but blast damage skips friendlies (documented, by design)

### UI Updates
- How-to-Play screen updated with new vehicle names and tips
- Added "BushMaster turret auto-aims enemies" tip
- Added "Jeep has 3 respawn lives per round" tip
- Sprite card names updated: JEEP, BUSHMASTER, HELICOPTER, STRIKEMASTER
- Audio theme comments updated to match new names

---

## v1.0.0 — Initial Release + Phase 4

### Core Game
- HTML5 Canvas 2D CTF game inspired by Return Fire (1995)
- Procedural island map generation (80×50 tiles)
- 4 vehicle types with unique stats, weapons, and abilities
- FSM-based AI with patrol, attack, capture, defend, resupply behaviors
- Procedural rock/army chiptune music per vehicle
- Web Audio API SFX (shoot, cannon, explosion, pickup, score)
- Touch controls with virtual joystick
- Multiplayer via Socket.io (lobby, rooms, state sync)

### Phase 4 Additions
- Underground bunker vehicle select with elevator animation
- Team-assigned base turrets with friendly fire prevention
- Helicopter crash mechanic (fuel loss → speed reduction → 3s crash)
- One vehicle per type per round tracking
- Return-to-base vehicle swap (R key at own base)
- Spawn-in-water bug fix (spiral scan)
- Rock/army 16-bit music themes with drums
