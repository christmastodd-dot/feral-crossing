export const TILE_SIZE = 48;
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 12 * TILE_SIZE; // 576

export const NUM_LANES = 10;
export const END_ROW = 0;    // safe zone top
export const START_ROW = 11; // safe zone bottom
export const COLS = Math.floor(CANVAS_WIDTH / TILE_SIZE); // 16

// Speeds in px/s
const SLOW   = 55;
const MEDIUM = 95;
const FAST   = 145;

// Spawn intervals in seconds
const LOW_DENSITY    = 5.5;
const MED_DENSITY    = 4.0;
const HIGH_DENSITY   = 2.8;

// Index 0 = lane 1 (row 10, nearest start), index 9 = lane 10 (row 1, nearest end)
// Row for lane index i: 10 - i
export const LANE_CONFIGS = [
  { direction:  1, speed: SLOW,   spawnInterval: LOW_DENSITY  }, // lane 1  → slow  low
  { direction: -1, speed: MEDIUM, spawnInterval: MED_DENSITY  }, // lane 2  ← med   med
  { direction:  1, speed: FAST,   spawnInterval: HIGH_DENSITY }, // lane 3  → fast  high
  { direction: -1, speed: SLOW,   spawnInterval: LOW_DENSITY  }, // lane 4  ← slow  low
  { direction:  1, speed: MEDIUM, spawnInterval: MED_DENSITY  }, // lane 5  → med   med
  { direction: -1, speed: FAST,   spawnInterval: HIGH_DENSITY }, // lane 6  ← fast  high
  { direction:  1, speed: MEDIUM, spawnInterval: LOW_DENSITY  }, // lane 7  → med   low
  { direction: -1, speed: SLOW,   spawnInterval: MED_DENSITY  }, // lane 8  ← slow  med
  { direction:  1, speed: FAST,   spawnInterval: HIGH_DENSITY }, // lane 9  → fast  high
  { direction: -1, speed: MEDIUM, spawnInterval: MED_DENSITY  }, // lane 10 ← med   med
];

export const CAB_WIDTH    = 52;
export const HOME_WIDTH   = 92;
export const TRUCK_WIDTH  = CAB_WIDTH + HOME_WIDTH; // 144
export const TRUCK_HEIGHT = 36;
export const TRUCK_GRACE  = 4; // px shrink on each x end of hitbox

export const CAT_SIZE          = 34;
export const CAT_HITBOX_SHRINK = 4;
export const CAT_MOVE_COOLDOWN = 0.10; // seconds between moves

export const LIVES_START             = 3;
export const DEATH_DURATION          = 0.9;  // seconds
export const CELEBRATE_DURATION      = 0.6;  // seconds
export const TIME_LIMIT              = 45;   // seconds per crossing attempt
export const HONK_TIME               = 30;   // seconds remaining before honk color

// Difficulty scaling
export const DIFF_SPEED_RATE  = 0.03;  // speed multiplier gained per crossing
export const DIFF_SPEED_CAP   = 2.0;   // maximum speed multiplier
export const DIFF_INT_MIN     = 0.45;  // minimum spawn-interval multiplier (shorter = denser)
export const CONVOY_PER_5     = 0.14;  // extra convoy probability per 5-crossing tier

// Near-miss detection
export const NEAR_MISS_EXPAND = 12;    // px to expand truck hitbox on each x side
export const NEAR_MISS_BONUS  = 10;    // score awarded per near-miss
