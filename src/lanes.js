import {
  CANVAS_WIDTH, LANE_CONFIGS, NUM_LANES, TRUCK_WIDTH,
  DIFF_SPEED_RATE, DIFF_SPEED_CAP, DIFF_INT_MIN, CONVOY_PER_5,
} from './config.js';
import { Truck } from './truck.js';

export class LaneManager {
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
      // Divide road into equal slots — one truck per slot, guaranteed no overlap
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
