# CHANGELOG — Damaged Territory

## v1.4.1 — Mobile & Layout Bug Fixes

### Bug Fixes
- **Mobile menu taps now work**: `onTouchStart` always sets `mouseX`/`mouseY`/`mouseClicked` from the first touch, so Canvas-drawn menus, vehicle select, and lobby buttons respond to taps. Previously `e.preventDefault()` blocked the browser's synthesized `click` event, leaving `handleClick` unreachable on touch devices.
- **Desktop menu no longer right-shifted**: Removed `Math.max(800, ...)` minimum in `resizeCanvas()` — canvas now always matches the actual viewport width. Menus center correctly at all window sizes.
- **How-to-Play: procedural mobile diagrams**: Touch devices now see Canvas-drawn joystick/button diagrams with labeled MOVE, AIM, FIRE, AUTO, SPEC zones instead of box-drawing-character text that overflowed small screens. Desktop version unchanged.

### Touch → Game-Loop Click Propagation
- `updateMenu()` now checks `wasClicked()` → `getMenuClick()` (was keyboard-only)
- `updateVehicleSelect()` now checks `wasClicked()` → `getVehicleClick()`
- `updateLobby()` now checks `wasClicked()` → `getLobbyAction()`
- Audio unlock (`Game.Audio.init()/resume()`) triggers on first touch tap

### Tests
- 17 new regression tests in `tests/bugfix-v141.test.js` (85 total, 5 suites)
  - Touch-to-click propagation (6 tests)
  - Canvas resize source validation (3 tests)
  - How-to-Play mobile/desktop split (5 tests)
  - Game-loop click processing (3 tests)

---

## v1.4.0 — Mobile Touch Optimization

### Hybrid Input System (input.js rewrite)
- **Device detection**: Auto-detects touch/coarse-pointer devices via `ontouchstart`, `maxTouchPoints`, and `matchMedia('pointer:coarse')`
- **Dual virtual joysticks**: Left joystick (movement, 60px radius) + right joystick (aim & fire, 50px radius)
- **Multi-touch**: Each finger tracked by `touch.identifier` — move, aim, and fire simultaneously
- **Tap-to-shoot**: Tap right side or dedicated fire button to shoot
- **Auto-fire toggle**: Persistent auto-fire mode for sustained combat
- **Touch button system**: Registrable UI buttons (fire, special/mine, swap vehicle, pause) with zones
- **Legacy compatibility**: `joystickActive`, `joystickDX/DY` still work from old API

### Haptic Feedback
- `navigator.vibrate()` on shoot (30ms), mine lay (60ms), hit taken (40ms)
- Kill feedback pattern: [50, 30, 100]ms
- Death feedback pattern: [100, 50, 200]ms
- Flag capture celebration pattern: [50, 30, 50, 30, 150]ms

### Fullscreen & Orientation
- Fullscreen toggle button (⛶) shown only on touch devices via `@media (pointer: coarse)`
- `document.requestFullscreen()` with webkit fallback
- `screen.orientation.lock('landscape')` on fullscreen entry
- Portrait orientation prompt overlay with rotate animation
- CSS `@media (pointer: coarse) and (orientation: portrait)` detection

### Responsive Canvas Scaling
- `devicePixelRatio`-aware rendering (capped at 2× for performance)
- `ctx.setTransform(dpr, ...)` — draw in CSS pixels, render at native resolution
- `imageSmoothingEnabled = false` for crisp pixel art
- Debounced resize (100ms) + `orientationchange` handler (200ms delay)
- Mobile screens use actual dimensions (no 800×500 minimum)

### Pause Overlay (Mobile)
- ⏸ button in HUD (top-right) opens pause overlay
- Double-tap detection also triggers pause
- Overlay: Resume / Quit to Menu / Toggle Music buttons
- Game input frozen while paused

### Touch-Friendly UI
- Menu: "Tap to select" prompt on touch devices
- Vehicle select: "Tap a vehicle bay to deploy" prompt
- How To Play: Separate touch controls reference on mobile
- Stats screens: "Tap to continue/skip" prompts
- Vehicle swap: SWAP button in HUD (replaces [R] key)
- All touch targets ≥ 48px minimum

### CSS & HTML
- Viewport: `maximum-scale=1.0, viewport-fit=cover`
- Apple/Android web-app-capable meta tags
- `touch-action: none` on canvas and body
- `-webkit-tap-highlight-color: transparent`
- `overscroll-behavior: none`, `position: fixed` on body
- `env(safe-area-inset-*)` padding on loading screen
- Theme color meta: `#0a0a1a`

### Tests
- **24 new mobile tests** in `tests/mobile.test.js` (68 total)
- Tests cover: device detection, touch listeners, joystick state, auto-fire, haptics, fullscreen, touch buttons, pause, legacy compat
- Test setup updated: `devicePixelRatio`, `matchMedia`, `navigator.vibrate`, `fullscreenElement`, `setTransform` mocks

---

## v1.3.0 — Render.com Deployment (Online Multiplayer)

### Render Free-Tier Deployment
- Server uses `process.env.PORT` for Render's dynamic port assignment
- Added **SIGTERM graceful shutdown** handler for clean redeploys
- Added `/health` endpoint returning uptime, room & player counts
- Socket.io CORS updated with explicit `methods: ['GET', 'POST']`

### Client Connection Hardening
- Socket.io client now served from own server (`/socket.io/socket.io.js`) with CDN fallback
- Added reconnection config: 5 attempts with 1s backoff
- Connection timeout bumped to 15s (accommodates Render cold starts)
- Dynamic origin detection (`io()`) — auto wss:// on HTTPS hosts

### Cold-Start UX
- Loading screen shows "free server waking up" hint after 3 seconds
- Styled `.loader-hint` with orange pulsing text

### Infra
- `package.json`: added `engines.node >= 20.x` for Render compatibility
- Server listen banner updated for dynamic port display

---

## v1.2.0 — 10-Round System, Stats & Procedural Maps

### 10-Round Game Flow
- Game now plays **10 rounds** (best-of-10 series)
- Each round: first to **3 flag captures** wins the round
- After 10 rounds (or when one team clinches majority), final stats are shown
- Round indicator in HUD: "ROUND 3/10" with series score display

### Per-Round Stats Tally
- After each round win, a **5-second stats screen** displays:
  - Kills, Deaths, Flags captured, Turrets destroyed
  - Breakdown by team (Blue / Red) and personal ("YOU") column
  - Series score so far; press ENTER to skip

### Final Game Stats
- End-of-game screen with **aggregated stats** across all rounds
- Per-round mini results (which team won each round, flag score)
- Personal K/D ratio, total flags, turrets destroyed
- Skulls decoration; ENTER to replay, ESC for menu

### Seed-Based Procedural Maps
- Every round generates a **unique map** from a deterministic seed
- Mulberry32 PRNG + value noise for terrain variation
- Same seed always produces the same map (MP-syncable)
- Round escalation: later rounds have more turrets, walls, trees
- **Round 10 = EPIC mode**: larger map (100×62), max turrets & features

### Death → Garage Respawn
- On vehicle destruction, player returns to **vehicle select immediately** (1.5s animation)
- Destroyed vehicle type becomes unavailable (except Jeep with lives)
- If all vehicles lost, enemy scores a point and vehicle pool resets

### SP Vehicle Limits
- Singleplayer: max **2 AI vehicles** per team on the field
- 1 friendly AI + 2 enemy AI (previously 4+3)
- AI respawns respect the limit — won't spawn if team is at cap

### Helicopter → UrbanStrike Rename
- **Helicopter** renamed to **UrbanStrike** across all files
- Updated in vehicle stats, UI cards, vehicle select, How To Play, audio comments

### Test Suite
- Added **Jest** test framework with 44 unit tests
- `tests/utils.test.js` — Constants, math helpers, geometry, A* pathfinding
- `tests/map.test.js` — Map generation, seeded determinism, escalation, spawn/flag positions
- `tests/vehicles.test.js` — Vehicle stats, creation, damage, death, respawn, flag carrying
- Run with `npm test`

---

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
