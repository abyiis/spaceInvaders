const HAZARD_TYPES = Object.freeze(['asteroids', 'magnetic']);
const MIN_EVENT_DELAY = 20;
const EVENT_DELAY_RANGE = 16;
const MIN_EVENT_DURATION = 8;
const EVENT_DURATION_RANGE = 5;
const WARNING_DURATION = 3;

export class Hazards {
  constructor(game, random = Math.random) {
    this.game = game;
    this.random = random;
    this.active = null;
    /** Tipo del próximo evento, anunciado durante la fase de alerta. */
    this.pendingType = null;
    this.asteroids = [];
    this.nextEventIn = this.#nextEventDelay();
    this.asteroidTimer = 0;
  }

  #nextEventDelay() {
    return MIN_EVENT_DELAY + this.random() * EVENT_DELAY_RANGE;
  }

  /** Segundos restantes de la alerta previa al evento, o 0 si no hay. */
  get warningRemaining() {
    if (!this.pendingType) return 0;
    return Math.max(0, this.nextEventIn);
  }

  update(dt) {
    let startedEvent = false;
    if (!this.active) {
      this.nextEventIn -= dt;

      // Cuando queden WARNING_DURATION segundos, elegir el tipo y mostrar alerta
      if (this.pendingType === null && this.nextEventIn <= WARNING_DURATION) {
        const index = Math.min(
          HAZARD_TYPES.length - 1,
          Math.floor(this.random() * HAZARD_TYPES.length),
        );
        this.pendingType = HAZARD_TYPES[index];
      }

      if (this.nextEventIn <= 0) {
        this.#startEvent();
        startedEvent = true;
      }
    }

    if (this.active) {
      if (!startedEvent) {
        this.active.remaining -= dt;
        this.active.age += dt;
      }
      if (this.active.type === 'asteroids') this.#spawnAsteroids(dt);
      if (this.active.remaining <= 0) {
        this.active = null;
        this.asteroidTimer = 0;
        this.nextEventIn = this.#nextEventDelay();
        this.pendingType = null;
      }
    }

    for (const asteroid of this.asteroids) {
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.rotation += asteroid.spin * dt;
      if (asteroid.y - asteroid.radius > this.game.height) {
        asteroid.dead = true;
      }
    }
    this.asteroids = this.asteroids.filter((asteroid) => !asteroid.dead);
  }

  #startEvent() {
    this.active = {
      type: this.pendingType,
      age: 0,
      remaining: MIN_EVENT_DURATION + this.random() * EVENT_DURATION_RANGE,
    };
    this.pendingType = null;
  }

  #spawnAsteroids(dt) {
    this.asteroidTimer -= dt;
    while (this.asteroidTimer <= 0) {
      this.asteroidTimer += 0.55;
      const radius = 8 + this.random() * 8;
      this.asteroids.push({
        x: radius + this.random() * (this.game.width - radius * 2),
        y: -radius,
        radius,
        vx: (this.random() - 0.5) * 70,
        vy: 115 + this.random() * 75,
        rotation: this.random() * Math.PI * 2,
        spin: (this.random() - 0.5) * 3,
        dead: false,
      });
    }
  }

  get magneticCenter() {
    if (this.active?.type !== 'magnetic') return null;
    const travel = Math.max(1, this.game.width * 0.32);
    return this.game.width / 2
      + Math.sin(this.active.age * 0.7) * travel;
  }
}

export function asteroidOverlapsBox(asteroid, box) {
  const nearestX = Math.max(box.x - box.w / 2, Math.min(asteroid.x, box.x + box.w / 2));
  const nearestY = Math.max(box.y - box.h / 2, Math.min(asteroid.y, box.y + box.h / 2));
  const dx = asteroid.x - nearestX;
  const dy = asteroid.y - nearestY;
  return dx * dx + dy * dy <= asteroid.radius * asteroid.radius;
}
