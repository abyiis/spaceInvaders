export const POWER_UP_DROP_CHANCE = 0.06;

export const POWER_UPS = Object.freeze({
  shield: Object.freeze({
    label: 'ESCUDO',
    symbol: 'S',
    color: '#67f5d5',
    duration: 5,
  }),
  rapidFire: Object.freeze({
    label: 'DISPARO RÁPIDO',
    symbol: 'R',
    color: '#ffca28',
    duration: 7,
  }),
  tripleShot: Object.freeze({
    label: 'DISPARO TRIPLE',
    symbol: '3',
    color: '#b69cff',
    duration: 7,
  }),
  overdrive: Object.freeze({
    label: 'SOBRECARGA',
    symbol: 'O',
    color: '#ff8b4d',
    duration: 6,
    rare: true,
  }),
});

export const POWER_UP_TYPES = Object.freeze(Object.keys(POWER_UPS));
export const STANDARD_POWER_UP_TYPES = Object.freeze(
  POWER_UP_TYPES.filter((type) => !POWER_UPS[type].rare),
);
