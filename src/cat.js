import {
  TILE_SIZE, START_ROW, END_ROW, COLS,
  CAT_SIZE, CAT_HITBOX_SHRINK, CAT_MOVE_COOLDOWN,
  TRUCK_HEIGHT,
} from './config.js';

const HOP_HEIGHT   = 9;
const HOP_DURATION = 0.09;
const LERP_SPEED   = 18;

// Rotation angles per facing direction (head always drawn toward negative-Y in local space)
const FACING_ANGLE = { up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 };

// ── Cat colour palettes ───────────────────────────────────────────────────────
export const CAT_PALETTES = [
  { name: 'Grey Tabby',   body: '#8a9e7a', head: '#96ae84', ear: '#7a9068', earIn: '#c07878', belly: '#b2ca9c', stripe: 'rgba(76,96,60,0.55)',    tail: '#7a9068', tailTip: '#96ae84'  },
  { name: 'Orange',       body: '#cc7733', head: '#dd8844', ear: '#b86020', earIn: '#e09070', belly: '#f0a855', stripe: 'rgba(140,55,5,0.55)',     tail: '#b86020', tailTip: '#dd8844'  },
  { name: 'Black',        body: '#252525', head: '#303030', ear: '#1a1a1a', earIn: '#a05858', belly: '#3d3d3d', stripe: 'rgba(0,0,0,0.55)',        tail: '#1a1a1a', tailTip: '#383838'  },
  { name: 'White',        body: '#d8d8d8', head: '#ececec', ear: '#c4c4c4', earIn: '#f0a0a8', belly: '#f8f8f8', stripe: 'rgba(160,160,160,0.38)',  tail: '#c4c4c4', tailTip: '#ececec'  },
  { name: 'Dark Stripe',  body: '#888888', head: '#999999', ear: '#686868', earIn: '#c07878', belly: '#b8b8b8', stripe: 'rgba(20,20,20,0.72)',     tail: '#686868', tailTip: '#999999'  },
];

export class Cat {
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

  // ── Logical position (hitbox) ─────────────────────────────────────────────
  _targetX() { return this.gridCol * TILE_SIZE + (TILE_SIZE - CAT_SIZE) / 2; }
  _targetY() { return this.gridRow * TILE_SIZE + (TILE_SIZE - CAT_SIZE) / 2; }

  get x() { return this._targetX(); }
  get y() { return this._targetY(); }

  get hitbox() {
    const s = CAT_HITBOX_SHRINK;
    return { x: this.x + s, y: this.y + s, w: CAT_SIZE - s * 2, h: CAT_SIZE - s * 2 };
  }

  // ── Visual (smoothed) position ────────────────────────────────────────────
  get drawX() { return this.vx; }
  get drawY() {
    const hop  = this.isHopping ? -Math.sin(this.hopPhase * Math.PI) * HOP_HEIGHT : 0;
    const idle = this.alive     ? Math.sin(this.idleTime * 1.8) * 0.7 : 0;
    return this.vy + hop + idle;
  }

  // ── Input ────────────────────────────────────────────────────────────────
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

  // ── Update ───────────────────────────────────────────────────────────────
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

  // ── Draw ─────────────────────────────────────────────────────────────────
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

  // ── Cat sprite (local space, head toward -Y, tail toward +Y) ─────────────
  // Centered on (0,0). Bounds roughly ±17 px.
  _drawCat(ctx, s, celebrateTime) { _catSprite(ctx, s, celebrateTime, CAT_PALETTES[this.paletteIndex]); }

  // ── Squished dead state ───────────────────────────────────────────────────
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

// ── Standalone cat sprite — usable outside the class (e.g. title screen) ─────
// Call after ctx.translate(centerX, centerY). Draws head toward -Y.
function _catSprite(ctx, s, celebrateTime = 0, pal = CAT_PALETTES[0]) {
    const h = s / 2; // 17

    // Ground shadow
    ctx.fillStyle = 'rgba(0,0,0,0.13)';
    ctx.beginPath();
    ctx.ellipse(0, h - 1, h * 0.6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Body ──────────────────────────────────────────────────────────────
    ctx.fillStyle = pal.body;
    ctx.fillRect(-h + 5, -2, s - 10, h + 2);

    // Belly (lighter patch)
    ctx.fillStyle = pal.belly;
    ctx.beginPath();
    ctx.ellipse(0, h / 3, h - 10, h / 2 - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tabby stripes
    ctx.fillStyle = pal.stripe;
    ctx.fillRect(-h + 7,  0, 2, h - 2);
    ctx.fillRect(-h + 11, 0, 2, h - 2);
    ctx.fillRect(h - 9,   0, 2, h - 2);

    // ── Head ──────────────────────────────────────────────────────────────
    ctx.fillStyle = pal.head;
    ctx.beginPath();
    ctx.arc(0, -5, 12, 0, Math.PI * 2);
    ctx.fill();

    // ── Ears ──────────────────────────────────────────────────────────────
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

    // ── Eyes (almond shape, vertical-slit pupils) ─────────────────────────
    // Iris — yellow-green
    ctx.fillStyle = '#c8f040';
    ctx.beginPath(); ctx.ellipse(-5, -7, 4, 3.2, -0.2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5, -7, 4, 3.2,  0.2, 0, Math.PI * 2); ctx.fill();
    // Pupil — vertical slit
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.ellipse(-5, -7, 1.4, 2.9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse( 5, -7, 1.4, 2.9, 0, 0, Math.PI * 2); ctx.fill();
    // Eye shine
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(-7, -9, 2, 2);
    ctx.fillRect( 3, -9, 2, 2);

    // ── Nose ──────────────────────────────────────────────────────────────
    ctx.fillStyle = '#d07070';
    ctx.beginPath();
    ctx.moveTo( 0, -1);
    ctx.lineTo(-3, -4);
    ctx.lineTo( 3, -4);
    ctx.closePath();
    ctx.fill();

    // ── Mouth ─────────────────────────────────────────────────────────────
    ctx.strokeStyle = '#a05050';
    ctx.lineWidth   = 0.9;
    ctx.beginPath();
    ctx.moveTo(-4, 0); ctx.quadraticCurveTo(-5, 2, -2, 3);
    ctx.moveTo( 4, 0); ctx.quadraticCurveTo( 5, 2,  2, 3);
    ctx.stroke();

    // ── Whiskers ──────────────────────────────────────────────────────────
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

    // ── Tail (bezier curve) ───────────────────────────────────────────────
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
