import {
  CANVAS_WIDTH, CANVAS_HEIGHT, TILE_SIZE,
  LIVES_START, DEATH_DURATION, CELEBRATE_DURATION,
  TIME_LIMIT, END_ROW, START_ROW, CAT_SIZE, TRUCK_WIDTH,
  NEAR_MISS_EXPAND, NEAR_MISS_BONUS,
} from './config.js';
import { Cat, CAT_PALETTES } from './cat.js';
import { LaneManager }   from './lanes.js';
import { Background }    from './background.js';
import { ParticleSystem } from './particles.js';
import { AudioSystem }   from './audio.js';
import { drawHUD, tickHUD } from './hud.js';
import { getScores, isHighScore, saveScore } from './highscores.js';

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x
      && a.y < b.y + b.h && a.y + a.h > b.y;
}

// ── States ───────────────────────────────────────────────────────────────────
// enterName | selectCat | title | playing | paused | dying | celebrating | gameover

export class Game {
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

    this._bindInput();
  }

  // ── Input ────────────────────────────────────────────────────────────────

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

  // ── Game flow ─────────────────────────────────────────────────────────────

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
    this.state = 'playing';
  }

  // ── Engine audio helper ───────────────────────────────────────────────────

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

  // ── Update ────────────────────────────────────────────────────────────────

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

  // ── Draw ──────────────────────────────────────────────────────────────────

  draw() {
    const { ctx } = this;

    if (this.state === 'enterName')      { this._drawEnterName();    return; }
    if (this.state === 'selectCat')      { this._drawSelectCat();    return; }
    if (this.state === 'title')          { this._drawTitle();        return; }
    if (this.state === 'gameover')       { this._drawGameOver();     return; }

    // Screen shake
    const sx = this.shakeAmt > 0 ? (Math.random() - 0.5) * this.shakeAmt * 2 : 0;
    const sy = this.shakeAmt > 0 ? (Math.random() - 0.5) * this.shakeAmt * 2 : 0;

    ctx.save();
    ctx.translate(sx, sy);

    this.background.draw(ctx);
    this.lanes.draw(ctx);

    const celebTime = this.state === 'celebrating' ? CELEBRATE_DURATION - this._celebrateTimer : 0;
    this.cat.draw(ctx, celebTime);

    this.particles.draw(ctx);
    this._drawFloats(ctx);

    drawHUD(ctx, { score: this.score, lives: this.lives, crossings: this.crossings, timer: this.timer });

    if (this.state === 'celebrating') this._drawCelebrateOverlay(ctx);
    if (this.state === 'paused')      this._drawPauseMenu(ctx);

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
    ctx.fillText('UP/DOWN  ·  ENTER to select  ·  ESC resumes', CANVAS_WIDTH / 2, py + ph - 12);
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
    c.fillText('CHOOSE YOUR CAT', CANVAS_WIDTH / 2, 72);
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
    _drawTitleSign(ctx, CANVAS_WIDTH * 0.72, CANVAS_HEIGHT * 0.46, ['HWY 666']);
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

  // ── Main loop ─────────────────────────────────────────────────────────────

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

// ── Title screen helpers ──────────────────────────────────────────────────────

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
  ctx.fillStyle = '#1a5c2a';
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
