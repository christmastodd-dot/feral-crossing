export class ParticleSystem {
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
