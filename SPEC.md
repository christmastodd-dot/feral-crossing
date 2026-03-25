# Feral Crossing — Game Design Specification

## Concept

A Frogger-style arcade game where a feral cat must cross a 10-lane highway packed with bald men driving trucks hauling mobile homes. High-res pixel art aesthetic with detailed sprites. The cat must weave through traffic without getting smushed.

---

## Art Direction

- **Resolution target:** 320×180 upscaled to fill screen (high-res pixel art feel — detailed sprites, not chunky NES-style)
- **Sprite detail:** Trucks have visible bald driver silhouettes through the cab windows. Mobile homes trail behind, adding length and hazard area.
- **Palette:** Sun-bleached American highway — hot asphalt grey, faded yellow lane lines, dusty browns, turquoise/white mobile home siding
- **Cat:** Scraggly tabby or grey feral cat, low to the ground, moves in quick dashes with an idle "nervous twitch" animation
- **Background:** Flat desert or suburban sprawl horizon. Heat shimmer effect optional.

---

## Gameplay

### Core Loop
- Player controls the cat from the bottom of the screen to a safe zone at the top
- 10 lanes of traffic between start and finish
- Each lane has trucks moving at different speeds and directions (alternating left/right per lane)
- Each truck has a mobile home attached — the mobile home counts as part of the hazard hitbox
- Cat is killed instantly on collision with any truck or mobile home

### Controls
| Action | Key |
|--------|-----|
| Move Up | W / Up Arrow |
| Move Down | S / Down Arrow |
| Move Left | A / Left Arrow |
| Move Right | D / Right Arrow |
| Pause | Escape |

- Movement is grid-based (one lane per press), snapping to lane positions
- Cat has a short hop animation between tiles

### Lanes (bottom to top)
| Lane | Direction | Speed | Traffic Density |
|------|-----------|-------|-----------------|
| 1 | → | Slow | Low |
| 2 | ← | Medium | Medium |
| 3 | → | Fast | High |
| 4 | ← | Slow | Low |
| 5 | → | Medium | Medium |
| 6 | ← | Fast | High |
| 7 | → | Medium | Low |
| 8 | ← | Slow | Medium |
| 9 | → | Fast | High |
| 10 | ← | Medium | Medium |

- "Fast" trucks with mobile homes create long moving hazard windows (cab + home = ~3 tile length)
- Gaps between convoys are intentional and learnable

### Scoring
- Each successful crossing: +100 points
- Speed bonus: extra points for crossing quickly
- Lives: 3 lives per run (shown as fish icons)
- Timer per crossing attempt: 30 seconds before a car honks and the cat flinches (no penalty, flavor only); at 45 seconds the cat retreats (forced reset of that crossing)

---

## Milestone 1 — Playable Prototype

**Goal:** Core movement and collision working. The game is playable end-to-end with placeholder art.

### Deliverables
- [ ] 10-lane highway renders with lane dividers
- [ ] Cat sprite placed at start position, moves on grid with WASD/arrow keys
- [ ] Trucks (cab + mobile home as one unit) spawn from edges and traverse lanes
- [ ] Collision detection: cat vs. truck cab and mobile home body
- [ ] Death state: cat gets squished, brief death animation, respawn at start
- [ ] Win state: cat reaches the far edge, crossing counter increments
- [ ] 3 lives system; game over screen on 0 lives
- [ ] Placeholder art acceptable (colored rectangles for trucks, simple cat square)
- [ ] Lane speeds and directions match the table above
- [ ] Basic score display (HUD)

**Success criteria:** A human can sit down and play 3+ consecutive crossings. Collision feels fair.

---

## Milestone 2 — Full Art & Polish

**Goal:** All placeholder art replaced with final high-res pixel sprites. Game feels alive.

### Deliverables
- [ ] Final cat sprite sheet: idle, walk up/down/left/right, death (squish), respawn
- [ ] Bald driver visible in truck cab window — static sprite, slight head-bob animation while driving
- [ ] Mobile home sprite: distinct from cab, shows windows, door, wheel skirt detail
- [ ] Multiple truck color variants (at least 3 cab colors, 3 home colors) to reduce visual repetition
- [ ] Lane background: asphalt texture, painted lane markers (solid/dashed per convention)
- [ ] Parallax roadside detail (scrub brush, highway signs, power lines) scrolling at background speed
- [ ] Safe zone art at top and bottom (gravel shoulder, tufts of grass)
- [ ] Squish effect: cat flattens with dust poof particle burst
- [ ] Screen shake on death
- [ ] HUD polish: fish-icon lives, styled score counter, crossing counter
- [ ] Title screen with pixel art scene (cat eyeing highway)
- [ ] Game over screen
- [ ] Win/crossing celebration animation (cat shakes itself off, flicks tail)

**Success criteria:** Screenshots look like a finished indie game. No visible placeholder elements.

---

## Milestone 3 — Progression & Juice

**Goal:** Replayability, difficulty curve, and audio. Game feels complete and worth replaying.

### Deliverables

#### Difficulty Scaling
- [ ] Difficulty increases each successful crossing: trucks get faster, gaps get shorter
- [ ] Every 5 crossings: a new "hard lane" variant spawns (convoy of 2 trucks bumper-to-bumper)
- [ ] Speed cap so the game stays technically winnable

#### Audio
- [ ] Engine rumble (low loop) per lane, volume based on truck proximity to cat
- [ ] Truck horn on near-miss
- [ ] Cat hop sound (light thud)
- [ ] Squish sound on death
- [ ] Crossing success jingle
- [ ] Game over sting
- [ ] Background ambient (wind, distant highway hum)
- [ ] Chiptune or lo-fi soundtrack loop for gameplay

#### Additional Features
- [ ] High score saved to local storage (top 5 scores with initials entry)
- [ ] "Near miss" bonus: +10 points when a truck passes within 1 tile without hitting
- [ ] Rare event (1% chance per truck): bald driver honks and waves at cat — no gameplay effect, flavor only
- [ ] Pause menu with resume / restart / quit options
- [ ] Mobile/touch support: swipe gestures map to movement directions

**Success criteria:** Player wants to beat their high score. Game has a clear sense of escalating challenge and is satisfying to play for 10+ minutes.

---

## Technical Notes

- Recommended stack: HTML5 Canvas + vanilla JS, or a lightweight framework like Phaser 3
- Target 60fps on mid-range hardware
- Truck + mobile home treated as a single rigid entity for movement; hitbox is the full combined length minus a small grace margin (so the cat can squeeze behind a home if timing is perfect)
- Cat hitbox is slightly smaller than the sprite (forgiving collision)
- All timing values (spawn rate, speeds) stored in a single config object for easy tuning

---

## Out of Scope (for now)
- Multiplayer
- Procedurally generated lane layouts
- Power-ups or abilities for the cat
- Story mode or dialogue
