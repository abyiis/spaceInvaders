const DURATION_SECONDS = 15;
const SPAWN_INTERVAL = 0.8;
const MIN_SHIP_SPEED = 160;
const SHIP_SPEED_RANGE = 90;
const COMBO_WINDOW = 1.8;

export class BonusStage {
  /**
   * @param {import('./Game.js').Game} game
   * @param {{ random?: () => number }} [options] Flujo de azar de la fase; en coop es el de la
   *   oleada, derivado de la semilla de la sala, para que ambos clientes vean las mismas naves.
   */
  constructor(game, { random = game.random } = {}) {
    this.game = game;
    this.random = random;
    this.remaining = DURATION_SECONDS;
    this.spawnTimer = 0;
    this.ships = [];
    this.nextShipId = 0;
    this.combo = 0;
    this.comboTimer = 0;
  }

  update(dt) {
    this.remaining = Math.max(0, this.remaining - dt);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer === 0) this.combo = 0;

    this.spawnTimer -= dt;
    while (this.spawnTimer <= 0 && this.remaining > 0) {
      this.#spawnShip();
      this.spawnTimer += SPAWN_INTERVAL;
    }

    for (const ship of this.ships) {
      ship.x += ship.vx * dt;
      if (ship.x < -ship.w || ship.x > this.game.width + ship.w) ship.dead = true;
    }
    this.ships = this.ships.filter((ship) => !ship.dead);
  }

  #spawnShip() {
    const direction = this.random() < 0.5 ? 1 : -1;
    const speed = MIN_SHIP_SPEED + this.random() * SHIP_SPEED_RANGE;
    const width = 24;
    this.ships.push({
      id: this.nextShipId,
      x: direction > 0 ? -width : this.game.width + width,
      y: 82 + this.random() * Math.min(180, this.game.height * 0.3),
      w: width,
      h: 16,
      vx: direction * speed,
      dead: false,
    });
    this.nextShipId += 1;
  }

  registerKill() {
    if (this.comboTimer > 0) this.combo += 1;
    else this.combo = 1;
    this.comboTimer = COMBO_WINDOW;
    return Math.min(5, 1 + Math.floor((this.combo - 1) / 3));
  }
}

export const BONUS_STAGE_DURATION = DURATION_SECONDS;
