// Valores de balance del juego. Deben coincidir con `.spec/game_loop.md`.

export const C = Object.freeze({
  // Lienzo lógico
  WIDTH: 360,
  HEIGHT: 640,

  // Jugador
  PLAYER_WIDTH: 36,
  PLAYER_HEIGHT: 28,
  PLAYER_FIRE_INTERVAL: 0.35,
  PLAYER_INVULNERABLE_SECONDS: 1.5,
  PLAYER_BOTTOM_MARGIN: 60,
  PLAYER_KEYBOARD_SPEED: 260,
  STARTING_LIVES: 3,

  // Enemigos
  ENEMY_WIDTH: 28,
  ENEMY_HEIGHT: 20,
  ENEMY_SPACING_X: 40,
  ENEMY_SPACING_Y: 32,
  FORMATION_TOP: 70,
  FORMATION_SIDE_MARGIN: 12,
  FORMATION_STEP_DOWN: 14,

  // Balas
  BULLET_WIDTH: 4,
  BULLET_HEIGHT: 12,
  PLAYER_BULLET_SPEED: 420,
  /** Los disparos laterales del triple disparo son un 10 % más lentos en vertical. */
  SIDE_SHOT_SPEED_FACTOR: 0.9,
  ENEMY_BULLET_SPEED: 180,

  // Puntuación
  SCORE_PER_ENEMY: 10,
  WAVE_BONUS_MULTIPLIER: 50,

  // Fondo de estrellas en parallax (de la más lejana a la más cercana)
  STAR_LAYERS: Object.freeze([
    Object.freeze({ count: 30, speed: 12, size: 1, alpha: 0.35 }),
    Object.freeze({ count: 18, speed: 28, size: 1.5, alpha: 0.6 }),
    Object.freeze({ count: 8, speed: 60, size: 2, alpha: 0.9 }),
  ]),
});