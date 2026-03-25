import { CANVAS_WIDTH, CANVAS_HEIGHT, GAME_TOP, LIVES_START, HONK_TIME } from './config.js';

// Score pop animation state (module-level, lightweight)
let _prevScore     = 0;
let _scorePopTimer = 0;
const SCORE_POP_DURATION = 0.35;

export function drawHUD(ctx, { score, lives, crossings, timer }) {
  // Advance score pop
  if (score !== _prevScore) { _scorePopTimer = SCORE_POP_DURATION; _prevScore = score; }
  // (timer is advanced externally, just read here)

  // ── Top bar ─────────────────────────────────────────────────────────────
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

  // Timer (right) — color shifts as time runs low
  const timerColor = timer <= 10 ? '#ff3030'
                   : timer <= HONK_TIME ? '#ffaa00'
                   : '#dddddd';
  const timerStr   = Math.ceil(timer).toString().padStart(2, '0') + 's';
  ctx.fillStyle    = timerColor;
  ctx.font         = 'bold 14px monospace';
  ctx.textAlign    = 'right';
  ctx.fillText(timerStr, CANVAS_WIDTH - 10, 19);

  // ── Bottom bar ─────────────────────────────────────────────────────────
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
export function tickHUD(dt) {
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
