const TILE_SIZE   = 48;
const GAME_TOP    = 30; // px above game grid reserved for top HUD bar
const CANVAS_WIDTH  = 800;
const CANVAS_HEIGHT = 12 * TILE_SIZE + 2 * GAME_TOP; // 636

const NUM_LANES = 10;
const END_ROW = 0;    // safe zone top
const START_ROW = 11; // safe zone bottom
const COLS = Math.floor(CANVAS_WIDTH / TILE_SIZE); // 16

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
const LANE_CONFIGS = [
  { direction:  1, speed: SLOW,   spawnInterval: LOW_DENSITY  }, // lane 1  â†’ slow  low
  { direction: -1, speed: MEDIUM, spawnInterval: MED_DENSITY  }, // lane 2  â† med   med
  { direction:  1, speed: FAST,   spawnInterval: HIGH_DENSITY }, // lane 3  â†’ fast  high
  { direction: -1, speed: SLOW,   spawnInterval: LOW_DENSITY  }, // lane 4  â† slow  low
  { direction:  1, speed: MEDIUM, spawnInterval: MED_DENSITY  }, // lane 5  â†’ med   med
  { direction: -1, speed: FAST,   spawnInterval: HIGH_DENSITY }, // lane 6  â† fast  high
  { direction:  1, speed: MEDIUM, spawnInterval: LOW_DENSITY  }, // lane 7  â†’ med   low
  { direction: -1, speed: SLOW,   spawnInterval: MED_DENSITY  }, // lane 8  â† slow  med
  { direction:  1, speed: FAST,   spawnInterval: HIGH_DENSITY }, // lane 9  â†’ fast  high
  { direction: -1, speed: MEDIUM, spawnInterval: MED_DENSITY  }, // lane 10 â† med   med
];

const CAB_WIDTH    = 52;
const HOME_WIDTH   = 92;
const TRUCK_WIDTH  = CAB_WIDTH + HOME_WIDTH; // 144
const TRUCK_HEIGHT = 36;
const TRUCK_GRACE  = 4; // px shrink on each x end of hitbox

const CAT_SIZE          = 34;
const CAT_HITBOX_SHRINK = 4;
const CAT_MOVE_COOLDOWN = 0.10; // seconds between moves

const LIVES_START             = 3;
const DEATH_DURATION          = 0.9;  // seconds
const CELEBRATE_DURATION      = 0.6;  // seconds
const TIME_LIMIT              = 45;   // seconds per crossing attempt
const HONK_TIME               = 30;   // seconds remaining before honk color

// Difficulty scaling
const DIFF_SPEED_RATE  = 0.03;  // speed multiplier gained per crossing
const DIFF_SPEED_CAP   = 2.0;   // maximum speed multiplier
const DIFF_INT_MIN     = 0.45;  // minimum spawn-interval multiplier (shorter = denser)
const CONVOY_PER_5     = 0.14;  // extra convoy probability per 5-crossing tier

// Near-miss detection
const NEAR_MISS_EXPAND = 12;    // px to expand truck hitbox on each x side
const NEAR_MISS_BONUS  = 10;    // score awarded per near-miss

// â”€â”€â”€ Parallax layers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class PowerLineLayer {
  constructor() {
    this.speed   = 18;
    this.spacing = 200;
    // Seed poles across the width (and one off-screen right for seamless wrap)
    this.poles = [];
    for (let x = 20; x < CANVAS_WIDTH + this.spacing; x += this.spacing) {
      this.poles.push({ x: x + Math.random() * 30 });
    }
  }

  update(dt) {
    for (const p of this.poles) p.x -= this.speed * dt;
    const rightmost = this.poles.reduce((a, b) => a.x > b.x ? a : b);
    const leftmost  = this.poles.reduce((a, b) => a.x < b.x ? a : b);
    if (leftmost.x < -60) leftmost.x = rightmost.x + this.spacing + Math.random() * 20;
  }

  draw(ctx) {
    const sorted = [...this.poles].sort((a, b) => a.x - b.x);

    // Horizontal wires between consecutive poles â€” top safe zone
    ctx.save();
    ctx.strokeStyle = 'rgba(30,25,20,0.75)';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    for (let i = 0; i < sorted.length - 1; i++) {
      const ax = sorted[i].x, bx = sorted[i + 1].x;
      const midX = (ax + bx) / 2;
      for (let w = 0; w < 3; w++) {
        const wy = 5 + w * 6;
        ctx.beginPath();
        ctx.moveTo(ax, wy);
        ctx.quadraticCurveTo(midX, wy + 5, bx, wy);
        ctx.stroke();
      }
    }
    ctx.restore();

    // Draw each pole
    for (const p of sorted) {
      if (p.x < -20 || p.x > CANVAS_WIDTH + 20) continue;
      // Top safe zone â€” pole from top down to road edge
      ctx.fillStyle = '#4a3c24';
      ctx.fillRect(p.x - 3, 2, 6, TILE_SIZE - 6);
      // Cross-arm
      ctx.fillRect(p.x - 14, 4, 28, 3);
      // Insulators (small caps)
      ctx.fillStyle = '#8a7050';
      for (let w = 0; w < 3; w++) {
        ctx.fillRect(p.x - 11 + w * 11, 1, 4, 7);
      }
    }
  }
}

// Hawaii highway sign pool â€” each entry is an array of lines
const SIGN_POOL = [
  ['LIHUE', 'NEXT LEFT'],
  ['W KAUAI', 'TRAILER PARK', '5 MILES'],
  ['EVSLIN', 'BIRD PARK', 'CLOSED'],
  ['LIHUE ADU', 'MUSEUM', 'NEXT RIGHT'],
];

class SignLayer {
  constructor() {
    this.speed = 26;
    this.signs = [];
    for (let i = 0; i < 4; i++) {
      this.signs.push({
        x:     i * 220 + Math.random() * 80,
        row:   i % 2,
        lines: SIGN_POOL[i],
      });
    }
  }

  // Call at the start of each crossing to randomise which signs appear
  refresh() {
    const shuffled = [...SIGN_POOL].sort(() => Math.random() - 0.5);
    for (let i = 0; i < this.signs.length; i++) {
      this.signs[i].lines = shuffled[i % shuffled.length];
    }
  }

  update(dt) {
    for (const s of this.signs) s.x -= this.speed * dt;
    const rightmost = this.signs.reduce((a, b) => a.x > b.x ? a : b);
    const leftmost  = this.signs.reduce((a, b) => a.x < b.x ? a : b);
    if (leftmost.x < -120) {
      leftmost.x = rightmost.x + 200 + Math.random() * 120;
      // Assign a fresh random label when a sign wraps back on
      leftmost.lines = SIGN_POOL[Math.floor(Math.random() * SIGN_POOL.length)];
    }
  }

  draw(ctx) {
    for (const s of this.signs) {
      if (s.x < -130 || s.x > CANVAS_WIDTH + 10) continue;
      const lines  = s.lines;
      const signW  = 108;
      const lineH  = 10;
      const signH  = lines.length * lineH + 10; // dynamic height
      const signY  = s.row === 0 ? 4 : 11 * TILE_SIZE + 4;
      const cx     = s.x + signW / 2;

      // Post
      ctx.fillStyle = '#555';
      ctx.fillRect(cx - 2, signY, 4, signH + 4);

      // Sign board â€” royal blue
      ctx.fillStyle = '#1a3a9c';
      ctx.fillRect(s.x, signY, signW, signH);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x + 2, signY + 2, signW - 4, signH - 4);

      // Text lines
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      const textStartY = signY + (signH - lines.length * lineH) / 2 + lineH - 1;
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], cx, textStartY + i * lineH);
      }
    }
    ctx.textAlign = 'left';
  }
}

class BrushLayer {
  constructor() {
    // Two sub-layers: near (fast) and far (slower)
    this.near = this._initBrushes(30, 38, 11); // bottom safe zone
    this.far  = this._initBrushes(20, 28,  0); // top safe zone
  }

  _initBrushes(count, speed, safeRow) {
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push(this._newBrush(
        Math.random() * CANVAS_WIDTH,
        safeRow,
        speed,
        false,
      ));
    }
    return { items, speed, safeRow };
  }

  _newBrush(x, safeRow, speed, fromRight) {
    const h = TILE_SIZE;
    const baseY = safeRow === 0
      ? Math.random() * (h * 0.55)          // top safe zone â€” upper portion
      : safeRow * TILE_SIZE + h * 0.15 + Math.random() * (h * 0.5); // bottom
    return {
      x: fromRight ? CANVAS_WIDTH + Math.random() * 60 : x,
      y: baseY,
      size: 4 + Math.random() * 8,
      type: Math.floor(Math.random() * 3), // 0=tumbleweed, 1=shrub, 2=tall grass
      hue:  Math.floor(90 + Math.random() * 40),
    };
  }

  update(dt) {
    for (const layer of [this.near, this.far]) {
      for (const b of layer.items) b.x -= layer.speed * dt;
      // Rightmost for wrap reference
      const rx = layer.items.reduce((a, c) => a.x > c.x ? a : c).x;
      for (const b of layer.items) {
        if (b.x < -30) {
          Object.assign(b, this._newBrush(rx + 30 + Math.random() * 60, layer.safeRow, layer.speed, true));
        }
      }
    }
  }

  draw(ctx) {
    for (const layer of [this.far, this.near]) {
      for (const b of layer.items) {
        if (b.x < -40 || b.x > CANVAS_WIDTH + 20) continue;
        this._drawBrush(ctx, b);
      }
    }
  }

  _drawBrush(ctx, b) {
    const { x, y, size, type, hue } = b;
    ctx.fillStyle = `hsl(${hue},40%,22%)`;
    if (type === 0) {
      // Tumbleweed: circular cluster
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `hsl(${hue},35%,30%)`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      // Interior cross lines
      ctx.beginPath();
      ctx.moveTo(x - size / 2, y); ctx.lineTo(x + size / 2, y);
      ctx.moveTo(x, y - size / 2); ctx.lineTo(x, y + size / 2);
      ctx.stroke();
    } else if (type === 1) {
      // Low scrub shrub: multiple blobs
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = `hsl(${hue + i * 6},38%,${20 + i * 4}%)`;
        ctx.fillRect(x + i * size * 0.3 - size * 0.2, y - size * 0.3 * (1 + i * 0.2), size * 0.5, size * 0.4);
      }
    } else {
      // Tall dried grass clump
      ctx.strokeStyle = `hsl(${hue},42%,28%)`;
      ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const bx = x + (i - 2) * size * 0.18;
        ctx.beginPath();
        ctx.moveTo(bx, y);
        ctx.lineTo(bx + (Math.random() - 0.5) * size * 0.4, y - size * (0.8 + Math.random() * 0.4));
        ctx.stroke();
      }
    }
  }
}

// â”€â”€â”€ Main Background class â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class Background {
  constructor() {
    this._static = this._bakeStatic();
    this._powerLines = new PowerLineLayer();
    this._signs      = new SignLayer();
    this._brush      = new BrushLayer();
  }

  refreshSigns() { this._signs.refresh(); }

  update(dt) {
    this._powerLines.update(dt);
    this._signs.update(dt);
    this._brush.update(dt);
  }

  draw(ctx) {
    ctx.drawImage(this._static, 0, 0);
    this._brush.draw(ctx);
    this._signs.draw(ctx);
    this._powerLines.draw(ctx);
  }

  // â”€â”€ Static canvas bake â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _bakeStatic() {
    const oc  = document.createElement('canvas');
    oc.width  = CANVAS_WIDTH;
    oc.height = CANVAS_HEIGHT;
    const ctx = oc.getContext('2d');
    this._bakeSafeZone(ctx, 0);
    this._bakeRoad(ctx);
    this._bakeSafeZone(ctx, 11 * TILE_SIZE);
    return oc;
  }

  _bakeSafeZone(ctx, topY) {
    const w = CANVAS_WIDTH;
    const h = TILE_SIZE;
    const isTop = topY === 0;

    // Base grass
    ctx.fillStyle = '#3a5c2a';
    ctx.fillRect(0, topY, w, h);

    // Grass variation patches
    for (let i = 0; i < 60; i++) {
      const px = Math.random() * w;
      const py = topY + Math.random() * h;
      ctx.fillStyle = `hsl(${100 + Math.random() * 25}, ${40 + Math.random() * 20}%, ${20 + Math.random() * 10}%)`;
      ctx.fillRect(px, py, 4 + Math.random() * 8, 3 + Math.random() * 4);
    }

    // Gravel shoulder near road edge
    const gravelY = isTop ? topY + h - 10 : topY;
    ctx.fillStyle = '#4e4232';
    ctx.fillRect(0, gravelY, w, 10);
    // Gravel specks
    for (let i = 0; i < 200; i++) {
      const gx = Math.random() * w;
      const gy = gravelY + Math.random() * 10;
      const v  = 80 + Math.floor(Math.random() * 50);
      ctx.fillStyle = `rgb(${v},${Math.floor(v * 0.85)},${Math.floor(v * 0.6)})`;
      ctx.fillRect(gx, gy, 1 + Math.random(), 1 + Math.random());
    }

    // Painted curb stripe
    const curbY = isTop ? topY + h - 3 : topY + 1;
    // Alternating yellow/white curb
    for (let cx = 0; cx < w; cx += 24) {
      ctx.fillStyle = cx % 48 === 0 ? '#d4aa00' : '#d8d8d8';
      ctx.fillRect(cx, curbY, 24, 2);
    }

    // Static grass tufts (dense)
    const seed = isTop ? 1 : 42; // reproducible layout
    const rng  = mulberry32(seed);
    for (let i = 0; i < 24; i++) {
      const tx = rng() * w;
      const ty = isTop
        ? topY + 2 + rng() * (h - 18)
        : topY + 6 + rng() * (h - 18);
      this._bakeTuft(ctx, tx, ty, rng);
    }
  }

  _bakeTuft(ctx, x, y, rng) {
    const blades = 3 + Math.floor(rng() * 4);
    const height = 5 + rng() * 9;
    for (let i = 0; i < blades; i++) {
      const bx  = x + (i - blades / 2) * 2.5 + (rng() - 0.5) * 2;
      const bh  = height * (0.6 + rng() * 0.4);
      const hue = 100 + Math.floor(rng() * 30);
      const lum = 22 + Math.floor(rng() * 14);
      ctx.strokeStyle = `hsl(${hue},45%,${lum}%)`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx + (rng() - 0.5) * 4, y - bh);
      ctx.stroke();
    }
  }

  _bakeRoad(ctx) {
    const roadY = TILE_SIZE;
    const roadH = 10 * TILE_SIZE;

    // Asphalt base
    ctx.fillStyle = '#252525';
    ctx.fillRect(0, roadY, CANVAS_WIDTH, roadH);

    // Fine pixel grain
    const imgData = ctx.getImageData(0, roadY, CANVAS_WIDTH, roadH);
    const d = imgData.data;
    const rng = mulberry32(7);
    for (let i = 0; i < d.length; i += 4) {
      const noise = (rng() - 0.5) * 28;
      d[i]   = Math.max(0, Math.min(255, d[i]   + noise));
      d[i+1] = Math.max(0, Math.min(255, d[i+1] + noise));
      d[i+2] = Math.max(0, Math.min(255, d[i+2] + noise));
    }
    ctx.putImageData(imgData, 0, roadY);

    // Aggregate rocks
    const rng2 = mulberry32(13);
    for (let i = 0; i < 500; i++) {
      const ax   = rng2() * CANVAS_WIDTH;
      const ay   = roadY + rng2() * roadH;
      const size = 1 + rng2() * 2;
      const v    = 55 + Math.floor(rng2() * 45);
      ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
      ctx.fillRect(ax, ay, size, size);
    }

    // Old road patch marks
    const rng3 = mulberry32(99);
    for (let i = 0; i < 12; i++) {
      const px = rng3() * CANVAS_WIDTH;
      const py = roadY + rng3() * roadH;
      const pw = 18 + rng3() * 50;
      const ph = 5 + rng3() * 12;
      ctx.fillStyle = `rgba(${50 + rng3() * 20},${50 + rng3() * 20},${50 + rng3() * 20},0.4)`;
      ctx.fillRect(px, py, pw, ph);
    }

    // Dashed white lane dividers
    ctx.save();
    ctx.strokeStyle = 'rgba(248,248,248,0.30)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([22, 16]);
    for (let row = 2; row <= 10; row++) {
      if (row === 6) continue;
      const y = row * TILE_SIZE;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }
    ctx.restore();

    // Double yellow center line (between lane 5, row 6 and lane 6, row 5)
    const cy = 6 * TILE_SIZE;
    ctx.strokeStyle = '#cca800';
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(0, cy - 2); ctx.lineTo(CANVAS_WIDTH, cy - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, cy + 2); ctx.lineTo(CANVAS_WIDTH, cy + 2); ctx.stroke();

    // Solid white road edges
    ctx.strokeStyle = 'rgba(235,235,235,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, roadY + 1);       ctx.lineTo(CANVAS_WIDTH, roadY + 1);       ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 11 * TILE_SIZE - 1); ctx.lineTo(CANVAS_WIDTH, 11 * TILE_SIZE - 1); ctx.stroke();

    // Zone labels (subtle)
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('S A F E', CANVAS_WIDTH / 2, TILE_SIZE / 2 + 4);
    ctx.fillText('S T A R T', CANVAS_WIDTH / 2, 11 * TILE_SIZE + TILE_SIZE / 2 + 4);
  }
}

// â”€â”€ Deterministic RNG (mulberry32) so baked textures are reproducible â”€â”€â”€â”€â”€â”€â”€â”€
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  emitSquish(x, y) {
    const dustColors = ['#c8a878', '#b09060', '#d4b890', '#a07848', '#908070'];
    // Outward dust burst
    for (let i = 0; i < 18; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 50 + Math.random() * 130;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 40,
        life: 1,
        maxLife: 0.35 + Math.random() * 0.35,
        size: 2.5 + Math.random() * 4,
        color: dustColors[Math.floor(Math.random() * dustColors.length)],
        gravity: 220,
      });
    }
    // Small flying debris
    for (let i = 0; i < 8; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 70;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.3,
        size: 1 + Math.random() * 2,
        color: '#7a6a52',
        gravity: 120,
      });
    }
    // Star-burst sparks shooting outward mostly sideways
    for (let i = 0; i < 6; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.5;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * (80 + Math.random() * 60),
        vy: Math.sin(angle) * (80 + Math.random() * 60),
        life: 1,
        maxLife: 0.2 + Math.random() * 0.2,
        size: 1.5,
        color: '#fff8d0',
        gravity: 0,
      });
    }
  }

  emitCelebration(x, y) {
    const colors = ['#ffe000', '#ff8800', '#00cfff', '#ff44aa', '#88ff44', '#fff'];
    for (let i = 0; i < 24; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const speed = 80 + Math.random() * 160;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        maxLife: 0.5 + Math.random() * 0.5,
        size: 2 + Math.random() * 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        gravity: 260,
      });
    }
  }

  update(dt) {
    for (const p of this.particles) {
      p.x  += p.vx * dt;
      p.y  += p.vy * dt;
      p.vy += p.gravity * dt;
      p.life -= dt / p.maxLife;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  draw(ctx) {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const s = p.size * Math.sqrt(alpha); // shrink as they fade
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }
}

const BOB_SPEED = 9;    // head-bob oscillation frequency (rad/s)
const BOB_AMP   = 1.8;  // pixels of vertical bob

// Lane index 0 = row 10, index i = row (10 - i)
function rowForLane(i) { return 10 - i; }

const CAB_PALETTES = [
  { body: '#b03030', trim: '#7a1a1a', grill: '#888' },
  { body: '#1e5f9e', trim: '#143e6a', grill: '#7a8a9a' },
  { body: '#1e7848', trim: '#145230', grill: '#5a8060' },
  { body: '#7a5a10', trim: '#503808', grill: '#8a7840' },
];

const HOME_PALETTES = [
  { body: '#e0d4bc', stripe: '#c0aa88', window: '#9ad0e8', door: '#8b6218' },
  { body: '#c8dcc8', stripe: '#98bc98', window: '#a8c8e0', door: '#5a7040' },
  { body: '#dcd4e0', stripe: '#b0a0c0', window: '#b0c8d8', door: '#6a4860' },
  { body: '#e4d8c0', stripe: '#c8b090', window: '#88c0d8', door: '#7a5020' },
];

class Truck {
  constructor(laneIndex, direction, speed) {
    this.laneIndex = laneIndex;
    this.direction = direction;
    this.speed     = speed;
    this.bobTime   = Math.random() * Math.PI * 2; // random phase offset

    const row = rowForLane(laneIndex);
    this.y = row * TILE_SIZE + Math.floor((TILE_SIZE - TRUCK_HEIGHT) / 2);
    this.x = direction === 1 ? -TRUCK_WIDTH : CANVAS_WIDTH;

    this.cab  = CAB_PALETTES [Math.floor(Math.random() * CAB_PALETTES.length)];
    this.home = HOME_PALETTES[Math.floor(Math.random() * HOME_PALETTES.length)];

    // Near-miss tracking (read/written by game.js)
    this.wasNear         = false;
    this.nearMissAwarded = false;

    // Rare honk/wave event (1% per truck)
    this.doHonk          = Math.random() < 0.01;
    this.honkTriggered   = false;
    this.honkJustFired   = false; // consumed by game.js to play audio
    this.honkTimer       = 0;
  }

  get offScreen() {
    return this.direction === 1 ? this.x > CANVAS_WIDTH : this.x + TRUCK_WIDTH < 0;
  }

  get hitbox() {
    return {
      x: this.x + TRUCK_GRACE,
      y: this.y,
      w: TRUCK_WIDTH - TRUCK_GRACE * 2,
      h: TRUCK_HEIGHT,
    };
  }

  update(dt) {
    this.x       += this.direction * this.speed * dt;
    this.bobTime += BOB_SPEED * dt;

    // Trigger honk when truck passes through the middle third of the screen
    if (this.doHonk && !this.honkTriggered) {
      const cx = this.x + TRUCK_WIDTH / 2;
      if (cx > CANVAS_WIDTH * 0.28 && cx < CANVAS_WIDTH * 0.72) {
        this.honkTriggered = true;
        this.honkJustFired = true;
        this.honkTimer     = 1.6;
      }
    }
    if (this.honkTimer > 0) this.honkTimer -= dt;
  }

  draw(ctx) {
    this.direction === 1 ? this._drawRight(ctx) : this._drawLeft(ctx);
    if (this.honkTimer > 0) this._drawHonkBubble(ctx);
  }

  _drawHonkBubble(ctx) {
    const alpha  = Math.min(1, this.honkTimer * 2.5);
    const cabCX  = this.direction === 1
      ? this.x + HOME_WIDTH + CAB_WIDTH / 2   // cab on right for right-moving
      : this.x + CAB_WIDTH / 2;               // cab on left for left-moving
    const bw = 62, bh = 18;
    const bx = cabCX - bw / 2;
    const by = this.y - 26;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Bubble body
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);

    // Bubble tail
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(cabCX - 4, by + bh);
    ctx.lineTo(cabCX,     by + bh + 7);
    ctx.lineTo(cabCX + 4, by + bh);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cabCX - 4, by + bh);
    ctx.lineTo(cabCX,     by + bh + 7);
    ctx.lineTo(cabCX + 4, by + bh);
    ctx.stroke();

    // Text
    ctx.fillStyle = '#111';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HONK!  o/', cabCX, by + bh * 0.68);

    ctx.restore();
  }

  // â”€â”€ Right-facing (cab right/leading, home left/trailing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _drawRight(ctx) {
    const { x, y, cab, home } = this;
    const h  = TRUCK_HEIGHT;
    const cx = x + HOME_WIDTH; // cab origin (right/leading end)

    this._drawHome(ctx, x,  y, h, home, 1);
    this._drawCab(ctx,  cx, y, h, cab,  1);

    // Hitch between home and cab
    ctx.fillStyle = '#666';
    ctx.fillRect(cx - 3, y + h / 2 - 3, 7, 6);
  }

  // â”€â”€ Left-facing (cab left/leading, home right/trailing) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _drawLeft(ctx) {
    const { x, y, cab, home } = this;
    const h  = TRUCK_HEIGHT;
    const hx = x + CAB_WIDTH; // home origin (right/trailing end)

    this._drawHome(ctx, hx, y, h, home, -1);
    this._drawCab(ctx,  x,  y, h, cab,  -1);

    // Hitch between cab and home
    ctx.fillStyle = '#666';
    ctx.fillRect(x + CAB_WIDTH - 3, y + h / 2 - 3, 7, 6);
  }

  // â”€â”€ Mobile home rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _drawHome(ctx, x, y, h, pal, dir) {
    const w = HOME_WIDTH;

    // Body
    ctx.fillStyle = pal.body;
    ctx.fillRect(x, y, w, h);

    // Roof stripe
    ctx.fillStyle = pal.stripe;
    ctx.fillRect(x, y, w, 5);

    // Corrugated siding (subtle vertical lines)
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    for (let i = 6; i < w; i += 8) {
      ctx.fillRect(x + i, y + 5, 1, h - 11);
    }

    // Windows (2 â€” front/cab-side window removed)
    for (let i = 0; i < 2; i++) {
      const wx = x + 8 + i * 27;
      ctx.fillStyle = pal.window;
      ctx.fillRect(wx, y + 7, 18, 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(wx, y + 7, 18, 12);
      ctx.beginPath();
      ctx.moveTo(wx + 9, y + 7);  ctx.lineTo(wx + 9, y + 19);
      ctx.moveTo(wx, y + 13);     ctx.lineTo(wx + 18, y + 13);
      ctx.stroke();
    }

    // Wheel skirt
    ctx.fillStyle = pal.stripe;
    ctx.fillRect(x, y + h - 8, w, 8);
    // Wheels (two axles)
    for (const wx of [x + 10, x + w - 28]) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(wx, y + h - 9, 18, 9);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(wx + 4, y + h - 8, 10, 7);
      ctx.fillStyle = '#888';
      ctx.fillRect(wx + 6, y + h - 7, 6, 5);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(wx + 8, y + h - 6, 2, 3);
    }

    // Door drawn last â€” positioned between the two wheel axles
    const doorX = dir === 1 ? x + 30 : x + 48;
    ctx.fillStyle = pal.door;
    ctx.fillRect(doorX, y + h - 18, 13, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(doorX, y + h - 18, 13, 18);
    ctx.fillStyle = '#d4a830';
    ctx.fillRect(dir === 1 ? doorX + 2 : doorX + 9, y + h - 11, 3, 3);
  }

  // â”€â”€ Cab rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _drawCab(ctx, x, y, h, pal, dir) {
    const w = CAB_WIDTH;

    // Body
    ctx.fillStyle = pal.body;
    ctx.fillRect(x, y, w, h);

    // Hood slope at front end
    const frontX = dir === 1 ? x + w - 4 : x;  // right for dir=1, left for dir=-1
    ctx.fillStyle = pal.trim;
    ctx.fillRect(frontX, y, 4, h);

    // Roof
    ctx.fillStyle = pal.trim;
    ctx.fillRect(x, y, w, 4);

    // Exhaust stack at back end
    const stackX = dir === 1 ? x + 4 : x + w - 8;  // back opposite the front
    ctx.fillStyle = '#333';
    ctx.fillRect(stackX, y - 6, 4, 8);
    // Exhaust cap
    ctx.fillRect(stackX - 2, y - 7, 8, 2);

    // Windshield
    const windX = dir === 1 ? x + 5  : x + 3;
    const windW = w - 10;
    ctx.fillStyle = '#b0ddf8';
    ctx.fillRect(windX, y + 5, windW, h / 2 - 4);
    // Windshield tint band
    ctx.fillStyle = 'rgba(0,60,120,0.18)';
    ctx.fillRect(windX, y + 5, windW, 4);
    // Wipers
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(windX + 3, y + h / 2 - 2);
    ctx.lineTo(windX + 3 + windW * 0.35, y + 7);
    ctx.moveTo(windX + windW - 3, y + h / 2 - 2);
    ctx.lineTo(windX + windW - 3 - windW * 0.35, y + 7);
    ctx.stroke();

    // Bald driver head with bob
    const bob    = Math.sin(this.bobTime) * BOB_AMP;
    const headX  = dir === 1 ? x + w - 13 : x + 13;  // near front of cab
    const headY  = y + 13 + bob;
    // Head
    ctx.fillStyle = '#f0c090';
    ctx.beginPath();
    ctx.arc(headX, headY, 8, 0, Math.PI * 2);
    ctx.fill();
    // Shiny bald crown
    ctx.fillStyle = 'rgba(255,255,255,0.30)';
    ctx.beginPath();
    ctx.arc(headX - 1, headY - 2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // Eyes (tiny)
    ctx.fillStyle = '#222';
    ctx.fillRect(headX - 4, headY,     3, 2);
    ctx.fillRect(headX + 1, headY,     3, 2);
    // Stubble hint
    ctx.fillStyle = 'rgba(60,40,20,0.25)';
    ctx.fillRect(headX - 5, headY + 3, 10, 3);

    // Side mirror
    const mirrorX = dir === 1 ? x - 4 : x + w;
    ctx.fillStyle = pal.trim;
    ctx.fillRect(mirrorX, y + 6, 4, 5);

    // Cab under-panel
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y + h - 6, w, 6);

    // Grille
    ctx.fillStyle = pal.grill;
    ctx.fillRect(dir === 1 ? x + w - 4 : x - 2, y + h * 0.55, 4, h * 0.35);

    // Wheels
    for (const wx of [x + 3, x + w - 17]) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(wx, y + h - 9, 14, 9);
      ctx.fillStyle = '#5a5a5a';
      ctx.fillRect(wx + 3, y + h - 8, 8, 7);
      ctx.fillStyle = '#888';
      ctx.fillRect(wx + 5, y + h - 7, 4, 5);
      ctx.fillStyle = '#aaa';
      ctx.fillRect(wx + 6, y + h - 6, 2, 3);
    }
  }
}

class LaneManager {
  constructor() {
    this.trucks = [];
    this._speedMult   = 1;
    this._intervalMult = 1;
    this._convoyChance = 0;
    this._timers = LANE_CONFIGS.map(c => c.spawnInterval * (0.1 + Math.random() * 0.5));
  }

  // Called after each successful crossing with cumulative crossing count
  setDifficulty(crossings) {
    this._speedMult    = Math.min(DIFF_SPEED_CAP, 1 + crossings * DIFF_SPEED_RATE);
    this._intervalMult = Math.max(DIFF_INT_MIN, 1 - crossings * 0.025);
    this._convoyChance = Math.min(0.55, Math.floor(crossings / 5) * CONVOY_PER_5);
  }

  reset() {
    this.trucks  = [];
    this._timers = LANE_CONFIGS.map(c => c.spawnInterval * (0.5 + Math.random() * 0.5));
  }

  // Pre-fill the road with trucks so the player never sees an empty lane at start
  populate() {
    for (let i = 0; i < NUM_LANES; i++) {
      const cfg   = LANE_CONFIGS[i];
      const speed = cfg.speed * this._speedMult;
      const count = 1 + Math.floor(Math.random() * 2);
      // Divide road into equal slots â€” one truck per slot, guaranteed no overlap
      const slotW = Math.floor(CANVAS_WIDTH / count);
      for (let j = 0; j < count; j++) {
        const truck     = new Truck(i, cfg.direction, speed);
        const slotStart = j * slotW;
        const maxOffset = Math.max(0, slotW - TRUCK_WIDTH - 20); // 20px buffer between slots
        truck.x = slotStart + Math.floor(Math.random() * maxOffset);
        this.trucks.push(truck);
      }
    }
  }

  update(dt) {
    for (const t of this.trucks) t.update(dt);
    this.trucks = this.trucks.filter(t => !t.offScreen);

    for (let i = 0; i < NUM_LANES; i++) {
      this._timers[i] -= dt;
      if (this._timers[i] <= 0) {
        const cfg   = LANE_CONFIGS[i];
        const speed = cfg.speed * this._speedMult;

        const truck = new Truck(i, cfg.direction, speed);
        this.trucks.push(truck);

        // Convoy: spawn a second truck immediately behind (every-5-crossings feature)
        if (this._convoyChance > 0 && Math.random() < this._convoyChance) {
          const buddy = new Truck(i, cfg.direction, speed);
          // Place it directly behind the first, touching bumper
          const gap = 8;
          buddy.x = truck.x + (cfg.direction === 1
            ? -(TRUCK_WIDTH + gap)
            :  (TRUCK_WIDTH + gap));
          this.trucks.push(buddy);
        }

        this._timers[i] = cfg.spawnInterval * this._intervalMult * (0.8 + Math.random() * 0.4);
      }
    }
  }

  draw(ctx) {
    for (const t of this.trucks) t.draw(ctx);
  }

  hitboxes() {
    return this.trucks.map(t => t.hitbox);
  }
}

const HOP_HEIGHT   = 9;
const HOP_DURATION = 0.09;
const LERP_SPEED   = 18;

// Rotation angles per facing direction (head always drawn toward negative-Y in local space)
const FACING_ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

// â”€â”€ Cat colour palettes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const CAT_PALETTES = [
  { name: 'Grey Tabby',   body: '#8a9e7a', head: '#96ae84', ear: '#7a9068', earIn: '#c07878', belly: '#b2ca9c', stripe: 'rgba(76,96,60,0.55)',    tail: '#7a9068', tailTip: '#96ae84'  },
  { name: 'Orange',       body: '#cc7733', head: '#dd8844', ear: '#b86020', earIn: '#e09070', belly: '#f0a855', stripe: 'rgba(140,55,5,0.55)',     tail: '#b86020', tailTip: '#dd8844'  },
  { name: 'Black',        body: '#252525', head: '#303030', ear: '#1a1a1a', earIn: '#a05858', belly: '#3d3d3d', stripe: 'rgba(0,0,0,0.55)',        tail: '#1a1a1a', tailTip: '#383838'  },
  { name: 'White',        body: '#d8d8d8', head: '#ececec', ear: '#c4c4c4', earIn: '#f0a0a8', belly: '#f8f8f8', stripe: 'rgba(160,160,160,0.38)',  tail: '#c4c4c4', tailTip: '#ececec'  },
];

class Cat {
  constructor() {
    this.gridCol      = Math.floor(COLS / 2);
    this.gridRow      = START_ROW;
    this.paletteIndex = 0;
    this._syncVisual();
    this._resetAnim();
  }

  _syncVisual() {
    this.vx = this._targetX();
    this.vy = this._targetY();
  }

  _resetAnim() {
    this.moveCooldown = 0;
    this.alive        = true;
    this.facing       = 'up';
    this.hopPhase     = 0;
    this.isHopping    = false;
    this.idleTime     = 0;
    this.squishPhase  = 0;
  }

  reset() {
    this.gridCol = Math.floor(COLS / 2);
    this.gridRow = START_ROW;
    this._syncVisual();
    this._resetAnim();
  }

  // â”€â”€ Logical position (hitbox) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  _targetX() { return this.gridCol * TILE_SIZE + (TILE_SIZE - CAT_SIZE) / 2; }
  _targetY() { return this.gridRow * TILE_SIZE + (TILE_SIZE - CAT_SIZE) / 2; }

  get x() { return this._targetX(); }
  get y() { return this._targetY(); }

  get hitbox() {
    const s = CAT_HITBOX_SHRINK;
    return { x: this.x + s, y: this.y + s, w: CAT_SIZE - s * 2, h: CAT_SIZE - s * 2 };
  }

  // â”€â”€ Visual (smoothed) position â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  get drawX() { return this.vx; }
  get drawY() {
    const hop  = this.isHopping ? -Math.sin(this.hopPhase * Math.PI) * HOP_HEIGHT : 0;
    const idle = this.alive     ? Math.sin(this.idleTime * 1.8) * 0.7 : 0;
    return this.vy + hop + idle;
  }

  // â”€â”€ Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  tryMove(dx, dy) {
    if (this.moveCooldown > 0 || !this.alive) return false;
    const nc = this.gridCol + dx, nr = this.gridRow + dy;
    if (nc < 0 || nc >= COLS)            return false;
    if (nr < END_ROW || nr > START_ROW)  return false;
    this.gridCol = nc; this.gridRow = nr;
    this.moveCooldown = CAT_MOVE_COOLDOWN;
    this.hopPhase = 0; this.isHopping = true;
    if      (dx > 0) this.facing = 'right';
    else if (dx < 0) this.facing = 'left';
    else if (dy < 0) this.facing = 'up';
    else             this.facing = 'down';
    return true;
  }

  // â”€â”€ Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  update(dt) {
    if (this.moveCooldown > 0) this.moveCooldown = Math.max(0, this.moveCooldown - dt);
    this.vx += (this._targetX() - this.vx) * Math.min(LERP_SPEED * dt, 1);
    this.vy += (this._targetY() - this.vy) * Math.min(LERP_SPEED * dt, 1);
    if (this.isHopping) {
      this.hopPhase += dt / HOP_DURATION;
      if (this.hopPhase >= 1) { this.hopPhase = 1; this.isHopping = false; }
    }
    this.idleTime += dt;
    if (!this.alive && this.squishPhase < 1) this.squishPhase = Math.min(1, this.squishPhase + dt * 4);
  }

  // â”€â”€ Draw â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  draw(ctx, celebrateTime = 0) {
    ctx.save();

    const s  = CAT_SIZE;
    const cx = this.drawX + s / 2;
    const cy = this.drawY + s / 2;
    ctx.translate(cx, cy);

    if (!this.alive) {
      // Squish: sink to tire bottom, then flatten horizontally
      ctx.translate(0, TRUCK_HEIGHT / 2);
      const p = this.squishPhase;
      ctx.scale(1 + p * 0.85, 1 - p * 0.6);
      this._drawSquished(ctx, s);
    } else {
      ctx.rotate(FACING_ANGLE[this.facing] ?? 0);
      if (celebrateTime > 0) {
        ctx.translate(Math.sin(celebrateTime * 14) * 3,
                      -Math.abs(Math.sin(celebrateTime * 8)) * 3);
      }
      this._drawCat(ctx, s, celebrateTime);
    }

    ctx.restore();
  }

  // â”€â”€ Cat sprite (local space, head toward -Y, tail toward +Y) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Centered on (0,0). Bounds roughly Â±17 px.
  _drawCat(ctx, s, celebrateTime) { _catSprite(ctx, s, celebrateTime, CAT_PALETTES[this.paletteIndex]); }

  // â”€â”€ Squished dead state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  _drawSquished(ctx, s) {
    const p = this.squishPhase;
    const h = s / 2;

    // Flat body
    ctx.fillStyle = '#6a7a5a';
    ctx.fillRect(-h + 2, -4, s - 4, 8);
    // Belly
    ctx.fillStyle = '#8a9870';
    ctx.beginPath();
    ctx.ellipse(0, 0, h - 6, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flattened X eyes
    ctx.strokeStyle = '#ff3838';
    ctx.lineWidth = 2;
    for (const ex of [-6, 6]) {
      ctx.beginPath();
      ctx.moveTo(ex - 3, -5); ctx.lineTo(ex + 3, 1);
      ctx.moveTo(ex + 3, -5); ctx.lineTo(ex - 3, 1);
      ctx.stroke();
    }

    // Squish-phase pain stars
    if (p < 0.6) {
      ctx.fillStyle = '#fff8a0';
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + p * 9;
        const r   = 14 + p * 10;
        ctx.fillRect(Math.cos(ang) * r - 1.5, Math.sin(ang) * r - 1.5, 3, 3);
      }
    }
  }
}

// â”€â”€ Standalone cat sprite â€” usable outside the class (e.g. title screen) â”€â”€â”€â”€â”€
// Call after ctx.translate(centerX, centerY). Draws head toward -Y.
function _catSprite(ctx, s, celebrateTime = 0, pal = CAT_PALETTES[0]) {
    const h = s / 2; // 17

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    ctx.ellipse(0, h - 1, h * 0.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // â”€â”€ Body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.fillStyle = pal.body;
    ctx.beginPath();
    ctx.ellipse(0, h / 2 - 1, h - 5, h / 2 + 1, 0, 0, Math.PI * 2);
    ctx.fill();

    // Belly (lighter patch)
    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.ellipse(0, h / 3, h - 10, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tabby stripes â€” clipped to body ellipse so they don't bleed outside
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(0, h / 2 - 1, h - 5, h / 2 + 1, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = pal.stripe;
    ctx.fillRect(-h + 7,  0, 2, h - 2);
    ctx.fillRect(-h + 11, 0, 2, h - 2);
    ctx.fillRect(h - 9,   0, 2, h - 2);
    ctx.restore();

    // â”€â”€ Head â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.fillStyle = pal.head;
    ctx.beginPath();
    ctx.arc(0, -5, 12, 0, Math.PI * 2);
    ctx.fill();

    // â”€â”€ Ears â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Left ear outer
    ctx.fillStyle = pal.ear;
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.lineTo(-5,  -5);
    ctx.lineTo(-14, -19);
    ctx.closePath();
    ctx.fill();
    // Left ear inner
    ctx.fillStyle = pal.earIn;
    ctx.beginPath();
    ctx.moveTo(-9,  -11);
    ctx.lineTo(-6,  -7);
    ctx.lineTo(-12, -17);
    ctx.closePath();
    ctx.fill();

    // Right ear outer
    ctx.fillStyle = pal.ear;
    ctx.beginPath();
    ctx.moveTo(10,  -10);
    ctx.lineTo(5,   -5);
    ctx.lineTo(14,  -19);
    ctx.closePath();
    ctx.fill();
    // Right ear inner
    ctx.fillStyle = pal.earIn;
    ctx.beginPath();
    ctx.moveTo(9,   -11);
    ctx.lineTo(6,   -7);
    ctx.lineTo(12,  -17);
    ctx.closePath();
    ctx.fill();

    // â”€â”€ Eyes (almond shape, vertical-slit pupils) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Iris â€” yellow-green
    ctx.fillStyle = '#c8f040';
    ctx.beginPath(); ctx.ellipse(-5, -7, 4, 3.2, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5, -7, 4, 3.2,  0.2, 0, Math.PI * 2); ctx.fill();
    // Pupil â€” vertical slit
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-5, -7, 1.4, 2.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5, -7, 1.4, 2.9, 0, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-7, -9, 2, 2);
    ctx.fillRect( 3, -9, 2, 2);

    // â”€â”€ Nose â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.fillStyle = '#d07070';
    ctx.beginPath();
    ctx.moveTo( 0, -1);
    ctx.lineTo(-3, -4);
    ctx.lineTo( 3, -4);
    ctx.closePath();
    ctx.fill();

    // â”€â”€ Mouth â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.strokeStyle = '#a05050';
    ctx.lineWidth   = 0.9;
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-5, 2, -2, 3);
    ctx.moveTo( 4, 0); ctx.quadraticCurveTo( 5, 2,  2, 3);
    ctx.stroke();

    // â”€â”€ Whiskers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.strokeStyle = 'rgba(240,240,210,0.88)';
    ctx.lineWidth   = 0.7;
    // Left (3 whiskers)
    ctx.beginPath(); ctx.moveTo(-2, -3); ctx.lineTo(-h - 4, -7);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -2); ctx.lineTo(-h - 4, -2);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -1); ctx.lineTo(-h - 4,  3);  ctx.stroke();
    // Right (3 whiskers)
    ctx.beginPath(); ctx.moveTo( 2, -3); ctx.lineTo( h + 4, -7);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 2, -2); ctx.lineTo( h + 4, -2);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo( 2, -1); ctx.lineTo( h + 4,  3);  ctx.stroke();

    // â”€â”€ Tail (bezier curve) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const curl = celebrateTime > 0 ? Math.sin(celebrateTime * 6) * 5 : 0;
    ctx.strokeStyle = pal.tail;
    ctx.lineWidth   = 3;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(5, h - 4);
    ctx.bezierCurveTo(
      12 + curl, h + 2,
      14 + curl, h + 8,
      6 + curl,  h + 13,
    );
    ctx.stroke();
    // Tail tip (slightly lighter)
    ctx.strokeStyle = pal.tailTip;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(13 + curl, h + 7);
    ctx.bezierCurveTo(15 + curl, h + 10, 8 + curl, h + 14, 6 + curl, h + 13);
    ctx.stroke();
}
// â”€â”€ Chiptune pattern: Phrygian dominant (Ahava Rabbah) in E â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Scale: E F G# A B C D  â€” the F-G# augmented second gives the Israeli/klezmer feel
// Bass uses E2/A2/B2 roots; melody walks the scale with characteristic leaps
const BASS = [
  164.81, 164.81,      0, 164.81,   // E3 E3 _ E3
  220.00,      0, 246.94,      0,   // A3 _  B3 _
  164.81, 164.81,      0, 207.65,   // E3 E3 _  G#3
  220.00,      0, 246.94,      0,   // A3 _  B3 _
];
const MELO = [
  329.63, 349.23, 415.30, 440.00,   // E4 F4 G#4 A4  (augmented 2nd = Middle Eastern feel)
  415.30, 349.23, 329.63,      0,   // G#4 F4 E4 rest
  329.63, 349.23, 415.30, 523.25,   // E4 F4 G#4 C5
  493.88, 415.30, 349.23, 329.63,   // B4 G#4 F4 E4
];
const STEP = 60 / 140 / 4; // seconds per 16th note at 140 BPM

const MUSIC_SRC = 'music.mp3'; // Abe Schwartz & His Klezmer Band â€” "Tantst Yidelekh" (1926, public domain)

class AudioSystem {
  constructor() {
    this._ctx          = null;
    this._master       = null;
    this._engGain      = null;
    this._musicGain    = null;
    this._musicPlaying = false;
    this._nextNote     = 0;
    this._noteIdx      = 0;
    this._schedId      = null;
    this._ready        = false;

    // HTML5 audio element for the klezmer background track
    this._bgAudio         = null;
    this._bgAudioReady    = false;
  }

  // Call on first user interaction so Chrome doesn't complain
  init() {
    if (this._ready) return;
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch { return; }
    this._ready = true;

    // Pre-load the background music file
    this._bgAudio        = new Audio(MUSIC_SRC);
    this._bgAudio.loop   = true;
    this._bgAudio.volume = 0.7;
    this._bgAudio.addEventListener('canplaythrough', () => { this._bgAudioReady = true; }, { once: true });
    this._bgAudio.addEventListener('error', () => { this._bgAudioReady = false; });
    this._bgAudio.load();

    const ctx    = this._ctx;
    this._master = ctx.createGain();
    this._master.gain.value = 0.55;
    this._master.connect(ctx.destination);

    // Engine channel (persistent oscillator, volume driven by proximity)
    this._engGain = ctx.createGain();
    this._engGain.gain.value = 0;
    this._engGain.connect(this._master);
    this._startEngine();

    // Music channel
    this._musicGain = ctx.createGain();
    this._musicGain.gain.value = 0.55;
    this._musicGain.connect(this._master);

    // Background wind/hum
    this._startAmbient();
  }

  resume() {
    if (this._ctx?.state === 'suspended') this._ctx.resume().catch(() => {});
  }

  // â”€â”€ Engine rumble â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _startEngine() {
    const ctx = this._ctx;
    const osc  = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 58;

    // LFO adds diesel-vibration character
    const lfo     = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value   = 13;
    lfoGain.gain.value    = 7;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    const filt = ctx.createBiquadFilter();
    filt.type            = 'lowpass';
    filt.frequency.value = 180;
    filt.Q.value         = 1.8;

    osc.connect(filt);
    filt.connect(this._engGain);
    osc.start();
    lfo.start();
  }

  // nearFraction: 0 = truck touching cat, 1 = truck far away
  updateEngine(nearFraction) {
    if (!this._ready) return;
    const vol = Math.max(0, (1 - nearFraction) * 0.38);
    this._engGain.gain.setTargetAtTime(vol, this._ctx.currentTime, 0.09);
  }

  // â”€â”€ Ambient wind â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _startAmbient() {
    const ctx    = this._ctx;
    const frames = ctx.sampleRate * 3;
    const buf    = ctx.createBuffer(1, frames, ctx.sampleRate);
    const d      = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) d[i] = (Math.random() * 2 - 1) * 0.012;

    const src  = ctx.createBufferSource();
    src.buffer = buf;
    src.loop   = true;

    const filt = ctx.createBiquadFilter();
    filt.type            = 'lowpass';
    filt.frequency.value = 700;

    src.connect(filt);
    filt.connect(this._master);
    src.start();
  }

  // â”€â”€ One-shot event sounds â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  playHop() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const src = this._noise(0.04);
    const flt = ctx.createBiquadFilter();
    flt.type            = 'bandpass';
    flt.frequency.value = 900;
    flt.Q.value         = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.16, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    src.connect(flt); flt.connect(g); g.connect(this._master);
    src.start(t); src.stop(t + 0.05);
  }

  playSquish() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;

    // Descending pitch
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(380, t);
    osc.frequency.exponentialRampToValueAtTime(38, t + 0.32);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.38, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.4);

    // Thud noise burst
    const noise = this._noise(0.12);
    const nflt  = ctx.createBiquadFilter();
    nflt.type            = 'lowpass';
    nflt.frequency.value = 1400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.28, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    noise.connect(nflt); nflt.connect(ng); ng.connect(this._master);
    noise.start(t); noise.stop(t + 0.2);
  }

  playSuccess() {
    if (!this._ready) return;
    const ctx   = this._ctx;
    const notes = [261.63, 329.63, 392.00, 523.25]; // C4-E4-G4-C5
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.068;
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.17, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.16);
    });
  }

  playGameOver() {
    if (!this._ready) return;
    const ctx   = this._ctx;
    const notes = [392.00, 311.13, 261.63, 220.00]; // G4-Eb4-C4-A3
    notes.forEach((f, i) => {
      const t = ctx.currentTime + i * 0.13;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.24, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.26);
    });
  }

  playHorn() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    for (const f of [220, 329.63]) { // A3 + E4 two-tone
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0,    t);
      g.gain.linearRampToValueAtTime(0.22,  t + 0.022);
      g.gain.setValueAtTime(0.22, t + 0.18);
      g.gain.linearRampToValueAtTime(0,     t + 0.22);
      osc.connect(g); g.connect(this._master);
      osc.start(t); osc.stop(t + 0.25);
    }
  }

  // â”€â”€ Cat vocals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  // Soft ambient meow (occasional, during gameplay)
  playMeow() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;

    // Sine tone with rising-then-falling pitch glide
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(580, t);
    osc.frequency.linearRampToValueAtTime(920, t + 0.13);
    osc.frequency.exponentialRampToValueAtTime(660, t + 0.36);

    // Gentle vibrato
    const vib     = ctx.createOscillator();
    const vibGain = ctx.createGain();
    vib.frequency.value  = 5.5;
    vibGain.gain.value   = 14;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.10, t + 0.05);
    g.gain.setValueAtTime(0.10, t + 0.24);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.40);

    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.44);
    vib.start(t); vib.stop(t + 0.44);
  }

  // Screeching meow when the cat gets smushed
  playShriek() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;

    // Sawtooth screech â€” sharp rise then fall
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(700, t);
    osc1.frequency.linearRampToValueAtTime(1550, t + 0.09);
    osc1.frequency.exponentialRampToValueAtTime(380, t + 0.52);

    // Upper harmonic layer (sine) for cat-like timbre
    const osc2 = ctx.createOscillator();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1100, t);
    osc2.frequency.linearRampToValueAtTime(2300, t + 0.09);
    osc2.frequency.exponentialRampToValueAtTime(560, t + 0.52);

    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(0.30, t + 0.04);
    g1.gain.setValueAtTime(0.30, t + 0.14);
    g1.gain.exponentialRampToValueAtTime(0.001, t + 0.58);

    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(0.13, t + 0.04);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.58);

    osc1.connect(g1); g1.connect(this._master);
    osc2.connect(g2); g2.connect(this._master);
    osc1.start(t); osc1.stop(t + 0.62);
    osc2.start(t); osc2.stop(t + 0.62);
  }

  playNearMiss() {
    if (!this._ready) return;
    const ctx = this._ctx;
    const t   = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(900, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(g); g.connect(this._master);
    osc.start(t); osc.stop(t + 0.12);
  }

  // â”€â”€ Chiptune music â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  startMusic() {
    if (!this._ready || this._musicPlaying) return;
    this._musicPlaying = true;

    if (this._bgAudio) {
      this._bgAudio.currentTime = 0;
      this._bgAudio.play().catch(() => {
        // File not found or blocked â€” fall back to chiptune
        this._noteIdx  = 0;
        this._nextNote = this._ctx.currentTime + 0.08;
        this._scheduleBatch();
      });
    } else {
      // No audio element â€” use chiptune
      this._noteIdx  = 0;
      this._nextNote = this._ctx.currentTime + 0.08;
      this._scheduleBatch();
    }
  }

  stopMusic() {
    this._musicPlaying = false;
    if (this._bgAudio) {
      this._bgAudio.pause();
      this._bgAudio.currentTime = 0;
    }
    if (this._schedId !== null) { clearTimeout(this._schedId); this._schedId = null; }
  }

  _scheduleBatch() {
    if (!this._musicPlaying || !this._ready) return;
    const now = this._ctx.currentTime;
    while (this._nextNote < now + 0.45) {
      this._playStep(this._noteIdx, this._nextNote);
      this._noteIdx  = (this._noteIdx + 1) % BASS.length;
      this._nextNote += STEP;
    }
    this._schedId = setTimeout(() => this._scheduleBatch(), 80);
  }

  _playStep(idx, t) {
    const ctx = this._ctx;

    const bf = BASS[idx];
    if (bf > 0) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = bf;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.21, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 1.5);
      osc.connect(g); g.connect(this._musicGain);
      osc.start(t); osc.stop(t + STEP * 1.6);
    }

    const mf = MELO[idx];
    if (mf > 0) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = mf;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.085, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + STEP * 0.82);
      osc.connect(g); g.connect(this._musicGain);
      osc.start(t); osc.stop(t + STEP);
    }
  }

  // â”€â”€ Helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _noise(dur) {
    const ctx = this._ctx;
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d   = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }
}

// Score pop animation state (module-level, lightweight)
let _prevScore     = 0;
let _scorePopTimer = 0;
const SCORE_POP_DURATION = 0.35;

function drawHUD(ctx, { score, lives, crossings, timer }) {
  // Advance score pop
  if (score !== _prevScore) { _scorePopTimer = SCORE_POP_DURATION; _prevScore = score; }
  // (timer is advanced externally, just read here)

  // â”€â”€ Top bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  _roundRect(ctx, 0, 0, CANVAS_WIDTH, GAME_TOP, 0);

  // Score with pop scale
  const popScale = _scorePopTimer > 0
    ? 1 + (_scorePopTimer / SCORE_POP_DURATION) * 0.22
    : 1;
  _scorePopTimer = Math.max(0, _scorePopTimer - 0); // updated by game loop externally

  ctx.save();
  const scoreStr = `SCORE  ${String(score).padStart(6, '0')}`;
  const scoreX   = 12;
  const scoreY   = 19;
  ctx.translate(scoreX + 60, scoreY - 6);
  ctx.scale(popScale, popScale);
  ctx.translate(-(scoreX + 60), -(scoreY - 6));
  ctx.font      = 'bold 14px monospace';
  ctx.fillStyle = _scorePopTimer > 0 ? '#ffe000' : '#ffffff';
  ctx.textAlign = 'left';
  ctx.fillText(scoreStr, scoreX, scoreY);
  ctx.restore();

  // Crossings (center)
  ctx.fillStyle = '#cccccc';
  ctx.font      = '13px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${crossings} crossings`, CANVAS_WIDTH / 2, 19);

  // Timer (right) â€” color shifts as time runs low
  const timerColor = timer <= 10 ? '#ff3030'
                   : timer <= HONK_TIME ? '#ffaa00'
                   : '#dddddd';
  const timerStr   = Math.ceil(timer).toString().padStart(2, '0') + 's';
  ctx.fillStyle    = timerColor;
  ctx.font         = 'bold 14px monospace';
  ctx.textAlign    = 'right';
  ctx.fillText(timerStr, CANVAS_WIDTH - 10, 19);

  // â”€â”€ Bottom bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  ctx.fillStyle = 'rgba(0,0,0,0.65)';
  _roundRect(ctx, 0, CANVAS_HEIGHT - GAME_TOP, CANVAS_WIDTH, GAME_TOP, 0);

  ctx.fillStyle = '#888';
  ctx.font      = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('LIVES', 10, CANVAS_HEIGHT - 9);

  for (let i = 0; i < LIVES_START; i++) {
    _drawFish(ctx, 68 + i * 32, CANVAS_HEIGHT - 13, i < lives);
  }

  // Controls reminder (faint, right side)
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.font      = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('WASD / ARROWS   ESC=pause', CANVAS_WIDTH - 10, CANVAS_HEIGHT - 9);
}

// Called each frame by game loop to decay the pop timer
function tickHUD(dt) {
  _scorePopTimer = Math.max(0, _scorePopTimer - dt);
}

function _drawFish(ctx, cx, cy, alive) {
  ctx.fillStyle = alive ? '#00cfff' : '#2e2e2e';

  // Body
  ctx.beginPath();
  ctx.ellipse(cx, cy, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Tail fin
  ctx.beginPath();
  ctx.moveTo(cx + 8,  cy);
  ctx.lineTo(cx + 16, cy - 6);
  ctx.lineTo(cx + 16, cy + 6);
  ctx.closePath();
  ctx.fill();

  // Dorsal fin
  if (alive) {
    ctx.fillStyle = '#00a8d8';
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 4);
    ctx.lineTo(cx + 3, cy - 8);
    ctx.lineTo(cx + 8, cy - 4);
    ctx.closePath();
    ctx.fill();
  }

  // Eye
  ctx.fillStyle = alive ? '#000' : '#333';
  ctx.beginPath();
  ctx.arc(cx - 4, cy - 1, 1.8, 0, Math.PI * 2);
  ctx.fill();

  if (alive) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(cx - 6, cy - 3, 3, 2);
  }
}

function _roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.fill();
}
const LS_KEY = 'feralCrossing_v2_scores';

function getScores() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// Returns true if score qualifies for top-5
function isHighScore(score) {
  if (score <= 0) return false;
  const scores = getScores();
  return scores.length < 5 || score > scores[scores.length - 1].score;
}

// Inserts score, sorts, trims to 5, persists. Returns updated list.
function saveScore(score, name) {
  const scores = getScores();
  scores.push({
    score,
    name: String(name).slice(0, 12) || 'CAT',
  });
  scores.sort((a, b) => b.score - a.score);
  if (scores.length > 5) scores.length = 5;
  try { localStorage.setItem(LS_KEY, JSON.stringify(scores)); } catch { /* quota */ }
  return scores;
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x
      && a.y < b.y + b.h && a.y + a.h > b.y;
}

// â”€â”€ States â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// enterName | selectCat | title | playing | paused | dying | celebrating | gameover

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');

    this.cat        = new Cat();
    this.lanes      = new LaneManager();
    this.background = new Background();
    this.particles  = new ParticleSystem();
    this.audio      = new AudioSystem();

    this.shakeAmt  = 0;
    this.state     = 'enterName';
    this.lives     = LIVES_START;
    this.score     = 0;
    this.crossings = 0;
    this.timer     = TIME_LIMIT;

    this._deathTimer     = 0;
    this._celebrateTimer = 0;

    // Floating score texts
    this._floats = []; // { text, x, y, color, life }

    // Pause menu option  (0=resume, 1=restart, 2=quit)
    this._pauseOpt = 0;

    // Player name
    this.playerName = '';
    this._nameInput = '';

    // Character selection
    this._selectedCat = 0;

    // Ambient meow timer (seconds until next soft meow)
    this._meowTimer = 10 + Math.random() * 10;

    // Fish +1 life item
    this._fish = null;

    this._bindInput();
  }

  // â”€â”€ Input â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _bindInput() {
    this._held = {};
    window.addEventListener('keydown', e => {
      // Init audio on first interaction
      this.audio.init();
      this.audio.resume();

      if (this._held[e.code]) return;
      this._held[e.code] = true;
      this._onKey(e.code, e.key);
    });
    window.addEventListener('keyup', e => { this._held[e.code] = false; });

    // Touch / swipe support
    let tx = 0, ty = 0;
    const SWIPE_MIN = 22;
    this.canvas.addEventListener('touchstart', e => {
      this.audio.init();
      this.audio.resume();
      tx = e.touches[0].clientX;
      ty = e.touches[0].clientY;
      e.preventDefault();
    }, { passive: false });
    this.canvas.addEventListener('touchend', e => {
      const dx = e.changedTouches[0].clientX - tx;
      const dy = e.changedTouches[0].clientY - ty;
      if (Math.abs(dx) > Math.abs(dy)) {
        if (dx >  SWIPE_MIN) this._onKey('ArrowRight', '');
        if (dx < -SWIPE_MIN) this._onKey('ArrowLeft',  '');
      } else {
        if (dy >  SWIPE_MIN) this._onKey('ArrowDown', '');
        if (dy < -SWIPE_MIN) this._onKey('ArrowUp',   '');
      }
      e.preventDefault();
    }, { passive: false });
  }

  _onKey(code, key = '') {
    switch (this.state) {

      case 'enterName':
        if (key.length === 1 && this._nameInput.length < 12) {
          this._nameInput += key;
        }
        if (code === 'Backspace') {
          this._nameInput = this._nameInput.slice(0, -1);
        }
        if (code === 'Enter') {
          this.playerName = this._nameInput.trim() || 'CAT';
          this.state = 'selectCat';
        }
        break;

      case 'selectCat':
        if (code === 'ArrowLeft'  || code === 'KeyA') this._selectedCat = (this._selectedCat + CAT_PALETTES.length - 1) % CAT_PALETTES.length;
        if (code === 'ArrowRight' || code === 'KeyD') this._selectedCat = (this._selectedCat + 1) % CAT_PALETTES.length;
        if (code === 'Enter' || code === 'Space') this.state = 'title';
        break;

      case 'title':
        if (code === 'Enter' || code === 'Space') this._startGame();
        break;

      case 'playing':
        if (code === 'Escape') { this._pauseOpt = 0; this.state = 'paused'; return; }
        if (code === 'ArrowUp'    || code === 'KeyW') { this.cat.tryMove( 0, -1); this.audio.playHop(); }
        if (code === 'ArrowDown'  || code === 'KeyS') { this.cat.tryMove( 0,  1); this.audio.playHop(); }
        if (code === 'ArrowLeft'  || code === 'KeyA') { this.cat.tryMove(-1,  0); this.audio.playHop(); }
        if (code === 'ArrowRight' || code === 'KeyD') { this.cat.tryMove( 1,  0); this.audio.playHop(); }
        break;

      case 'paused':
        if (code === 'ArrowUp'   || code === 'KeyW') this._pauseOpt = Math.max(0, this._pauseOpt - 1);
        if (code === 'ArrowDown' || code === 'KeyS') this._pauseOpt = Math.min(2, this._pauseOpt + 1);
        if (code === 'Enter' || code === 'Space') {
          if (this._pauseOpt === 0) { this.state = 'playing'; }
          if (this._pauseOpt === 1) { this._startGame(); }
          if (this._pauseOpt === 2) { this.audio.stopMusic(); this.state = 'title'; }
        }
        if (code === 'Escape') this.state = 'playing';
        break;

      case 'dying':
      case 'celebrating':
        break; // ignore input during transitions

      case 'gameover':
        if (code === 'Enter' || code === 'Space') {
          this.audio.stopMusic();
          this.state = 'title';
        }
        break;
    }
  }

  // â”€â”€ Game flow â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _startGame() {
    this.cat.paletteIndex = this._selectedCat;
    this.cat.reset();
    this.lanes.reset();
    this.lanes.setDifficulty(0);
    this.lanes.populate();
    this.particles.particles.length = 0;
    this._floats.length = 0;
    this.lives     = LIVES_START;
    this.score     = 0;
    this.crossings = 0;
    this.timer     = TIME_LIMIT;
    this.shakeAmt  = 0;
    this._fish     = null;
    this.background.refreshSigns();
    this.state     = 'playing';
    this.audio.startMusic();
  }

  _die() {
    this.particles.emitSquish(this.cat.x + CAT_SIZE / 2, this.cat.y + CAT_SIZE / 2);
    this.audio.playSquish();
    this.audio.playShriek();
    this.cat.alive   = false;
    this.shakeAmt    = 7;
    this._deathTimer = DEATH_DURATION;
    this.state       = 'dying';
    this.lives--;
  }

  _celebrate() {
    const elapsed = TIME_LIMIT - this.timer;
    const bonus   = elapsed < 10 ? 100 : elapsed < 20 ? 50 : elapsed < 30 ? 25 : 0;
    this.score += 100 + bonus;
    this.crossings++;
    this.lanes.setDifficulty(this.crossings);
    this.particles.emitCelebration(this.cat.x + CAT_SIZE / 2, this.cat.y + CAT_SIZE / 2);
    this.audio.playSuccess();
    this._celebrateTimer = CELEBRATE_DURATION;
    this.state = 'celebrating';
  }

  _onNearMiss(truck) {
    this.score += NEAR_MISS_BONUS;
    // Floating "+10 CLOSE!" text near the cat
    this._floats.push({
      text:  '+10 CLOSE!',
      x:     this.cat.x + CAT_SIZE / 2,
      y:     this.cat.y,
      color: '#ff8800',
      life:  1.0,
    });
    this.audio.playNearMiss();
    void truck;
  }

  _resetCrossing() {
    this.cat.reset();
    this.lanes.reset();
    this.lanes.populate();
    this.timer = TIME_LIMIT;
    this._fish = (this.crossings > 0 && this.crossings % 4 === 0) ? this._makeFish() : null;
    this.background.refreshSigns();
    this.state = 'playing';
  }

  _makeFish() {
    return {
      gridCol:   Math.floor(Math.random() * COLS),
      gridRow:   1 + Math.floor(Math.random() * 9), // rows 1-9 (inside lanes)
      collected: false,
    };
  }

  // â”€â”€ Engine audio helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  _updateEngineAudio() {
    const catCX = this.cat.x + CAT_SIZE / 2;
    let minDist = CANVAS_WIDTH;
    for (const truck of this.lanes.trucks) {
      const truckRow = 10 - truck.laneIndex;
      if (truckRow === this.cat.gridRow) {
        const truckCX = truck.x + TRUCK_WIDTH / 2;
        const d = Math.abs(truckCX - catCX);
        if (d < minDist) minDist = d;
      }
    }
    // fraction 0 = very close (within 1 tile), 1 = more than 5 tiles away
    const fraction = Math.min(1, minDist / (TILE_SIZE * 5));
    this.audio.updateEngine(fraction);
  }

  // â”€â”€ Update â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  update(dt) {
    if (this.shakeAmt > 0) this.shakeAmt = Math.max(0, this.shakeAmt - dt * 22);
    tickHUD(dt);
    this.background.update(dt);
    this.particles.update(dt);

    // Floating texts
    for (const f of this._floats) {
      f.life -= dt * 1.6;
      f.y    -= dt * 28;
    }
    this._floats = this._floats.filter(f => f.life > 0);

    switch (this.state) {
      case 'playing':     this._updatePlaying(dt);     break;
      case 'dying':       this._updateDying(dt);       break;
      case 'celebrating': this._updateCelebrating(dt); break;
    }
  }

  _updatePlaying(dt) {
    this.cat.update(dt);
    this.lanes.update(dt);
    this._updateEngineAudio();

    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this._resetCrossing(); // timer retreat, no life lost
      return;
    }

    // Ambient meow
    this._meowTimer -= dt;
    if (this._meowTimer <= 0) {
      this.audio.playMeow();
      this._meowTimer = 10 + Math.random() * 14;
    }

    // Win condition
    if (this.cat.gridRow === END_ROW) { this._celebrate(); return; }

    // Fish collection
    if (this._fish && !this._fish.collected &&
        this.cat.gridCol === this._fish.gridCol &&
        this.cat.gridRow === this._fish.gridRow) {
      this._fish.collected = true;
      this.lives++;
      this.audio.playMeow();
      this._floats.push({ text: '+1 LIFE!', x: this.cat.x + CAT_SIZE / 2, y: this.cat.y, color: '#44ff88', life: 1.4 });
    }

    // Collision + near-miss detection (only while in a lane row)
    if (this.cat.gridRow > END_ROW && this.cat.gridRow < START_ROW) {
      const catHB = this.cat.hitbox;

      for (const truck of this.lanes.trucks) {
        // Honk audio trigger
        if (truck.honkJustFired) {
          truck.honkJustFired = false;
          this.audio.playHorn();
        }

        // Collision check
        if (overlaps(catHB, truck.hitbox)) { this._die(); return; }

        // Near-miss tracking
        if (!truck.nearMissAwarded) {
          const truckRow = 10 - truck.laneIndex;
          if (truckRow === this.cat.gridRow) {
            const hb     = truck.hitbox;
            const nearHB = { x: hb.x - NEAR_MISS_EXPAND, y: hb.y, w: hb.w + NEAR_MISS_EXPAND * 2, h: hb.h };
            const isNear = overlaps(catHB, nearHB); // expanded overlaps but actual doesn't (collision already checked above)
            if (isNear) {
              truck.wasNear = true;
            } else if (truck.wasNear) {
              truck.nearMissAwarded = true;
              this._onNearMiss(truck);
            }
          }
        }
      }
    }
  }

  _updateDying(dt) {
    this.cat.update(dt); // drives squishPhase
    this.lanes.update(dt);
    this._deathTimer -= dt;
    if (this._deathTimer <= 0) {
      if (this.lives <= 0) {
        this.audio.stopMusic();
        this.audio.playGameOver();
        if (isHighScore(this.score)) {
          saveScore(this.score, this.playerName);
        }
        this.state = 'gameover';
      } else {
        this._resetCrossing();
      }
    }
  }

  _updateCelebrating(dt) {
    this.cat.update(dt);
    this._celebrateTimer -= dt;
    if (this._celebrateTimer <= 0) this._resetCrossing();
  }

  // â”€â”€ Draw â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  draw() {
    const { ctx } = this;

    if (this.state === 'enterName')      { this._drawEnterName();    return; }
    if (this.state === 'selectCat')      { this._drawSelectCat();    return; }
    if (this.state === 'title')          { this._drawTitle();        return; }
    if (this.state === 'gameover')       { this._drawGameOver();     return; }

    // Screen shake â€” game world sits below the HUD strip (GAME_TOP offset)
    const sx = this.shakeAmt > 0 ? (Math.random() - 0.5) * this.shakeAmt * 2 : 0;
    const sy = this.shakeAmt > 0 ? (Math.random() - 0.5) * this.shakeAmt * 2 : 0;

    // â”€â”€ Game world (road, cat, trucks, fish, particles) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    ctx.save();
    ctx.translate(sx, sy + GAME_TOP);

    this.background.draw(ctx);
    this._drawFishItem(ctx);
    this.lanes.draw(ctx);

    const celebTime = this.state === 'celebrating' ? CELEBRATE_DURATION - this._celebrateTimer : 0;
    this.cat.draw(ctx, celebTime);

    this.particles.draw(ctx);
    this._drawFloats(ctx);

    ctx.restore();

    // â”€â”€ Screen-space overlays (not offset, not shaken) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    if (this.state === 'celebrating') this._drawCelebrateOverlay(ctx);
    if (this.state === 'paused')      this._drawPauseMenu(ctx);

    drawHUD(ctx, { score: this.score, lives: this.lives, crossings: this.crossings, timer: this.timer });
  }

  _drawFishItem(ctx) {
    if (!this._fish || this._fish.collected) return;
    const cx = this._fish.gridCol * TILE_SIZE + TILE_SIZE / 2;
    const cy = this._fish.gridRow * TILE_SIZE + TILE_SIZE / 2;

    ctx.save();
    // Pulse glow
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 280);
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur  = 10 * pulse;

    // Same shape as HUD life fish, scaled ~1.7Ã— and recoloured orange
    const sc = 1.7; // scale factor relative to hud fish (body radii 9,5)

    // Body
    ctx.fillStyle = '#ff8c00';
    ctx.beginPath();
    ctx.ellipse(cx, cy, 9 * sc, 5 * sc, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tail fin (right side, same triangle as HUD)
    ctx.fillStyle = '#e06000';
    ctx.beginPath();
    ctx.moveTo(cx + 8  * sc, cy);
    ctx.lineTo(cx + 16 * sc, cy - 6 * sc);
    ctx.lineTo(cx + 16 * sc, cy + 6 * sc);
    ctx.closePath();
    ctx.fill();

    // Dorsal fin
    ctx.fillStyle = '#cc5500';
    ctx.beginPath();
    ctx.moveTo(cx - 2 * sc, cy - 4 * sc);
    ctx.lineTo(cx + 3 * sc, cy - 8 * sc);
    ctx.lineTo(cx + 8 * sc, cy - 4 * sc);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.arc(cx - 4 * sc, cy - 1 * sc, 1.8 * sc, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(cx - 6 * sc, cy - 3 * sc, 3 * sc, 2 * sc);

    ctx.restore();
  }

  _drawFloats(ctx) {
    for (const f of this._floats) {
      ctx.globalAlpha = Math.max(0, f.life);
      ctx.fillStyle   = f.color;
      ctx.font        = 'bold 13px monospace';
      ctx.textAlign   = 'center';
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  _drawCelebrateOverlay(ctx) {
    const p = 1 - this._celebrateTimer / CELEBRATE_DURATION;
    const a = p < 0.25 ? p / 0.25 : 1 - (p - 0.25) / 0.75;

    ctx.fillStyle = `rgba(255,215,0,${a * 0.12})`;
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.save();
    const scale = 1 + Math.sin(p * Math.PI) * 0.14;
    ctx.translate(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 12);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.fillStyle = `rgba(0,0,0,${a * 0.5})`;
    ctx.font = 'bold 44px monospace';
    ctx.fillText('SAFE!', 3, 3);
    ctx.fillStyle = `rgba(255,225,0,${a})`;
    ctx.fillText('SAFE!', 0, 0);
    const elapsed = TIME_LIMIT - this.timer;
    const bonus   = elapsed < 10 ? 100 : elapsed < 20 ? 50 : elapsed < 30 ? 25 : 0;
    ctx.font = '17px monospace';
    ctx.fillStyle = `rgba(255,255,255,${a * 0.9})`;
    ctx.fillText(`+${100 + bonus} pts`, 0, 34);
    ctx.restore();
  }

  _drawPauseMenu(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.60)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Panel
    const pw = 300, ph = 180;
    const px = (CANVAS_WIDTH - pw) / 2;
    const py = (CANVAS_HEIGHT - ph) / 2 - 10;
    ctx.fillStyle = 'rgba(20,20,20,0.95)';
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, pw, ph);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', CANVAS_WIDTH / 2, py + 38);

    const opts = ['RESUME', 'RESTART', 'QUIT'];
    opts.forEach((label, i) => {
      const oy = py + 72 + i * 38;
      if (i === this._pauseOpt) {
        ctx.fillStyle = '#ffe000';
        ctx.fillRect(px + 10, oy - 16, pw - 20, 28);
        ctx.fillStyle = '#111';
      } else {
        ctx.fillStyle = '#aaa';
      }
      ctx.font = 'bold 16px monospace';
      ctx.fillText(label, CANVAS_WIDTH / 2, oy + 5);
    });

    ctx.fillStyle = '#555';
    ctx.font = '11px monospace';
    ctx.fillText('UP/DOWN  Â·  ENTER to select  Â·  ESC resumes', CANVAS_WIDTH / 2, py + ph - 12);
  }

  _drawEnterName() {
    const c = this.ctx;
    c.fillStyle = '#0a0e1a';
    c.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    c.save();
    c.shadowColor = '#d48000';
    c.shadowBlur  = 24;
    c.fillStyle   = '#ffe000';
    c.font        = 'bold 58px monospace';
    c.textAlign   = 'center';
    c.fillText('FERAL CROSSING', CANVAS_WIDTH / 2, 100);
    c.restore();

    c.fillStyle = '#b0b090';
    c.font      = '17px monospace';
    c.textAlign = 'center';
    c.fillText('Cross 10 lanes of bald-driver traffic.', CANVAS_WIDTH / 2, 140);
    c.fillText("Don't get smushed.", CANVAS_WIDTH / 2, 162);

    c.fillStyle = '#aaa';
    c.font      = '18px monospace';
    c.fillText('Enter your name to begin:', CANVAS_WIDTH / 2, 228);

    // Name input box
    const boxW = 260, boxH = 52;
    const boxX = (CANVAS_WIDTH - boxW) / 2;
    const boxY = 244;
    c.fillStyle = '#1a1a2e';
    c.fillRect(boxX, boxY, boxW, boxH);
    c.strokeStyle = '#ffe000';
    c.lineWidth = 2;
    c.strokeRect(boxX, boxY, boxW, boxH);

    const display = this._nameInput || '';
    const cursor  = Math.floor(performance.now() / 500) % 2 === 0 ? '|' : '';
    c.fillStyle = '#fff';
    c.font      = 'bold 26px monospace';
    c.textAlign = 'center';
    c.fillText(display + cursor, CANVAS_WIDTH / 2, boxY + 36);

    c.fillStyle = '#555';
    c.font      = '13px monospace';
    c.fillText('Type your name   /   ENTER to continue', CANVAS_WIDTH / 2, 330);

    // High score preview
    const scores = getScores();
    if (scores.length > 0) {
      c.fillStyle = '#444';
      c.font = '12px monospace';
      c.fillText('-- top scores --', CANVAS_WIDTH / 2, 374);
      scores.slice(0, 3).forEach((s, i) => {
        c.fillStyle = '#666';
        const nameStr = (s.name || s.initials || '???').padEnd(12, ' ');
        c.fillText(`${i + 1}.  ${nameStr}  ${String(s.score).padStart(6, '0')}`, CANVAS_WIDTH / 2, 394 + i * 22);
      });
    }
  }

  _drawSelectCat() {
    const c = this.ctx;
    c.fillStyle = '#0a0e1a';
    c.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    c.save();
    c.shadowColor = '#d48000';
    c.shadowBlur  = 18;
    c.fillStyle   = '#ffe000';
    c.font        = 'bold 34px monospace';
    c.textAlign   = 'center';
    c.fillText('CHOOSE YOUR FERAL CAT', CANVAS_WIDTH / 2, 72);
    c.restore();

    c.fillStyle = '#666';
    c.font      = '13px monospace';
    c.textAlign = 'center';
    c.fillText('LEFT / RIGHT to browse   ENTER to confirm', CANVAS_WIDTH / 2, 100);

    const CAT_S    = 60;         // sprite size for this screen
    const SPACING  = 90;         // horizontal gap center-to-center
    const startX   = CANVAS_WIDTH / 2 - (CAT_PALETTES.length - 1) * SPACING / 2;
    const catY     = 190;

    for (let i = 0; i < CAT_PALETTES.length; i++) {
      const cx = startX + i * SPACING;
      const selected = i === this._selectedCat;

      // Selection highlight
      if (selected) {
        c.fillStyle = 'rgba(255,224,0,0.12)';
        c.beginPath();
        c.arc(cx, catY, CAT_S * 0.72, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#ffe000';
        c.lineWidth   = 2;
        c.beginPath();
        c.arc(cx, catY, CAT_S * 0.72, 0, Math.PI * 2);
        c.stroke();
      }

      // Draw cat sprite centered at (cx, catY)
      c.save();
      c.translate(cx, catY);
      _catSprite(c, CAT_S, 0, CAT_PALETTES[i]);
      c.restore();

      // Name label below
      c.fillStyle = selected ? '#ffe000' : '#777';
      c.font      = selected ? 'bold 13px monospace' : '12px monospace';
      c.textAlign = 'center';
      c.fillText(CAT_PALETTES[i].name, cx, catY + CAT_S / 2 + 22);
    }

    // Arrow indicators
    c.fillStyle = '#ffe000';
    c.font      = 'bold 24px monospace';
    c.textAlign = 'center';
    c.fillText('<', startX - SPACING * 0.6, catY + 4);
    c.fillText('>', startX + (CAT_PALETTES.length - 1) * SPACING + SPACING * 0.6, catY + 4);

    // Selected name big
    c.fillStyle = '#fff';
    c.font      = 'bold 22px monospace';
    c.textAlign = 'center';
    c.fillText(CAT_PALETTES[this._selectedCat].name, CANVAS_WIDTH / 2, catY + CAT_S / 2 + 62);

    // Press Enter
    c.save();
    c.shadowColor = '#000';
    c.shadowBlur  = 6;
    c.fillStyle   = '#fff';
    c.font        = 'bold 20px monospace';
    c.textAlign   = 'center';
    c.fillText('Press  ENTER  to continue', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 72);
    c.restore();
  }

  _drawTitle() {
    const { ctx } = this;
    ctx.fillStyle = '#182818';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.fillStyle = '#232323';
    ctx.fillRect(0, CANVAS_HEIGHT * 0.42, CANVAS_WIDTH, CANVAS_HEIGHT * 0.28);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1;
    ctx.setLineDash([20, 14]);
    for (let row = 1; row <= 2; row++) {
      const y = CANVAS_HEIGHT * 0.42 + row * (CANVAS_HEIGHT * 0.28 / 3);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.save();
    ctx.shadowColor = '#d48000';
    ctx.shadowBlur  = 24;
    ctx.fillStyle   = '#ffe000';
    ctx.font        = 'bold 58px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('FERAL CROSSING', CANVAS_WIDTH / 2, 94);
    ctx.restore();

    ctx.fillStyle = '#b0b090';
    ctx.font      = '17px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Cross 10 lanes of bald-driver traffic.', CANVAS_WIDTH / 2, 130);
    ctx.fillText("Don't get smushed.", CANVAS_WIDTH / 2, 152);

    _drawTitleCat(ctx, CANVAS_WIDTH / 2 - 17, CANVAS_HEIGHT * 0.54, 34, CAT_PALETTES[this._selectedCat]);
    _drawTitleSign(ctx, CANVAS_WIDTH * 0.72, CANVAS_HEIGHT * 0.46, ['ROUTE 56']);
    _drawTitleSign(ctx, CANVAS_WIDTH * 0.26, CANVAS_HEIGHT * 0.50, ['VOTE NO ON', 'HB1736']);

    // High score display
    const scores = getScores();
    if (scores.length > 0) {
      ctx.fillStyle = '#555';
      ctx.font = '11px monospace';
      ctx.fillText('TOP SCORE', CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.72);
      ctx.fillStyle = '#ffe000';
      ctx.font = 'bold 16px monospace';
      ctx.fillText(`${scores[0].name || scores[0].initials || '???'}  ${String(scores[0].score).padStart(6, '0')}`, CANVAS_WIDTH / 2, CANVAS_HEIGHT * 0.72 + 20);
    }

    if (this.playerName) {
      ctx.fillStyle = '#8aaa70';
      ctx.font      = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(`Welcome, ${this.playerName}!`, CANVAS_WIDTH / 2, CANVAS_HEIGHT - 100);
    }

    ctx.save();
    ctx.shadowColor = '#000';
    ctx.shadowBlur  = 6;
    ctx.fillStyle   = '#fff';
    ctx.font        = 'bold 22px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('Press  ENTER  to start', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 72);
    ctx.restore();

    ctx.fillStyle = '#555';
    ctx.font      = '13px monospace';
    ctx.fillText('WASD / Arrow keys   ESC to pause', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 44);
  }

  _drawGameOver() {
    const { ctx } = this;
    ctx.fillStyle = '#0e0808';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    ctx.strokeStyle = 'rgba(80,20,20,0.35)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([20, 16]);
    for (let y = 80; y < CANVAS_HEIGHT; y += 55) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_WIDTH, y); ctx.stroke();
    }
    ctx.setLineDash([]);

    ctx.save();
    ctx.shadowColor = '#ff1010';
    ctx.shadowBlur  = 28;
    ctx.fillStyle   = '#ff3a3a';
    ctx.font        = 'bold 54px monospace';
    ctx.textAlign   = 'center';
    ctx.fillText('GAME  OVER', CANVAS_WIDTH / 2, 110);
    ctx.restore();

    // Stats
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(CANVAS_WIDTH / 2 - 170, 140, 340, 60);
    ctx.fillStyle = '#fff';
    ctx.font = '22px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`SCORE  ${String(this.score).padStart(6, '0')}   x${this.crossings}`, CANVAS_WIDTH / 2, 178);

    // Leaderboard
    const scores = getScores();
    if (scores.length > 0) {
      ctx.fillStyle = '#555';
      ctx.font      = '12px monospace';
      ctx.fillText('-- HIGH SCORES --', CANVAS_WIDTH / 2, 228);
      scores.forEach((s, i) => {
        const isMe = s.score === this.score && i === scores.findIndex(x => x.score === this.score);
        ctx.fillStyle = isMe ? '#ffe000' : '#888';
        ctx.font = isMe ? 'bold 15px monospace' : '14px monospace';
        ctx.fillText(
          `${i + 1}.  ${(s.name || s.initials || '???').padEnd(12, ' ')}  ${String(s.score).padStart(6, '0')}`,
          CANVAS_WIDTH / 2, 252 + i * 26,
        );
      });
    }

    ctx.fillStyle = '#555';
    ctx.font = '15px monospace';
    ctx.fillText('ENTER  to return to title', CANVAS_WIDTH / 2, CANVAS_HEIGHT - 50);
  }

  // â”€â”€ Main loop â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  run() {
    let last = performance.now();
    const loop = (ts) => {
      const dt = Math.min((ts - last) / 1000, 0.05);
      last = ts;
      this.update(dt);
      this.draw();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

// â”€â”€ Title screen helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function _drawTitleCat(ctx, x, y, s, pal) {
  ctx.save();
  ctx.translate(x + s / 2, y + s / 2);
  _catSprite(ctx, s, 0, pal);
  ctx.restore();
}

function _drawTitleSign(ctx, cx, cy, lines) {
  const w = 90;
  const h = lines.length > 1 ? 42 : 30;
  const x = cx - w / 2;
  ctx.fillStyle = '#666';
  ctx.fillRect(cx - 2, cy, 4, h + 10);
  ctx.fillStyle = '#1a3a9c';
  ctx.fillRect(x, cy - h, w, h);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 2, cy - h + 2, w - 4, h - 4);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  if (lines.length === 1) {
    ctx.font = 'bold 9px monospace';
    ctx.fillText(lines[0], cx, cy - h / 2 + 3);
  } else {
    ctx.font = 'bold 8px monospace';
    const lineH = 11;
    const startY = cy - h / 2 - ((lines.length - 1) * lineH) / 2 + 2;
    lines.forEach((line, i) => ctx.fillText(line, cx, startY + i * lineH));
  }
}
const game = new Game(document.getElementById("game")); game.run();
