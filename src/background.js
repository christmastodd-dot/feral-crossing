import { CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE } from './config.js';

// ─── Parallax layers ────────────────────────────────────────────────────────

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

    // Horizontal wires between consecutive poles — top safe zone
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
      // Top safe zone — pole from top down to road edge
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

class SignLayer {
  constructor() {
    this.speed = 26;
    // Each sign: { x, row: 0=top safe zone / 1=bottom safe zone, label }
    const labels = ['EXIT 42', 'HWY 666', 'REST AREA', 'GAS FOOD', 'NEXT EXIT'];
    this.signs = [];
    for (let i = 0; i < 4; i++) {
      this.signs.push({
        x: i * 220 + Math.random() * 80,
        row: i % 2,
        label: labels[i % labels.length],
      });
    }
  }

  update(dt) {
    for (const s of this.signs) s.x -= this.speed * dt;
    const rightmost = this.signs.reduce((a, b) => a.x > b.x ? a : b);
    const leftmost  = this.signs.reduce((a, b) => a.x < b.x ? a : b);
    if (leftmost.x < -120) {
      leftmost.x = rightmost.x + 200 + Math.random() * 120;
    }
  }

  draw(ctx) {
    for (const s of this.signs) {
      if (s.x < -130 || s.x > CANVAS_WIDTH + 10) continue;
      const y = s.row === 0 ? 4 : 11 * TILE_SIZE + 4;
      const signH = TILE_SIZE - 12;
      const signW = 90;
      const signY = y;

      // Post
      ctx.fillStyle = '#555';
      ctx.fillRect(s.x + signW / 2 - 2, signY, 4, signH + 4);

      // Sign board (green highway sign)
      ctx.fillStyle = '#1a5c2a';
      ctx.fillRect(s.x, signY, signW, signH - 4);
      // Border
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(s.x + 2, signY + 2, signW - 4, signH - 8);

      // Text
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(s.label, s.x + signW / 2, signY + signH / 2 - 2);
    }
    ctx.textAlign = 'left'; // restore default
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
      ? Math.random() * (h * 0.55)          // top safe zone — upper portion
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

// ─── Main Background class ───────────────────────────────────────────────────

export class Background {
  constructor() {
    this._static = this._bakeStatic();
    this._powerLines = new PowerLineLayer();
    this._signs      = new SignLayer();
    this._brush      = new BrushLayer();
  }

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

  // ── Static canvas bake ──────────────────────────────────────────────────

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

// ── Deterministic RNG (mulberry32) so baked textures are reproducible ────────
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
