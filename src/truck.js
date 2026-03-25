import {
  CANVAS_WIDTH, TILE_SIZE,
  CAB_WIDTH, HOME_WIDTH, TRUCK_WIDTH, TRUCK_HEIGHT, TRUCK_GRACE,
} from './config.js';

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

export class Truck {
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

  // ── Right-facing (cab right/leading, home left/trailing) ─────────────

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

  // ── Left-facing (cab left/leading, home right/trailing) ───────────────

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

  // ── Mobile home rendering ─────────────────────────────────────────────

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

    // Two windows — positions chosen per direction to clear the door
    const winXs = dir === 1 ? [x + 8, x + 52] : [x + 8, x + 68];
    for (const wx of winXs) {
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

    // Door drawn last — positioned between the two wheel axles
    const doorX = dir === 1 ? x + 30 : x + 48;
    ctx.fillStyle = pal.door;
    ctx.fillRect(doorX, y + h - 18, 13, 18);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1;
    ctx.strokeRect(doorX, y + h - 18, 13, 18);
    ctx.fillStyle = '#d4a830';
    ctx.fillRect(dir === 1 ? doorX + 2 : doorX + 9, y + h - 11, 3, 3);
  }

  // ── Cab rendering ─────────────────────────────────────────────────────

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
