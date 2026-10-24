// Ключи текстур (раздел 7.3.2). Чтобы заменить процедурный арт рисованным, достаточно
// загрузить PNG под теми же ключами — код сцен не меняется.

export const BOIL = 3;
/** Языки пламени: слои (снаружи внутрь) и формы. */
export const FLAME_LAYERS = 3;
export const FLAME_SHAPES = 2;

/** Ключ варианта кипения. */
export const boil = (base: string, v: number) => `${base}#${v}`;

export const K = {
  bg: 'bg',
  paper: 'paper',
  tree: (i: number) => `tree${i}`,
  fern: (i: number) => `fern${i}`,
  bush: (i: number) => `bush${i}`,
  boulder: (i: number) => `boulder${i}`,
  fallenLog: 'fallenLog',
  windGap: 'windGap',

  logBirch: 'log:birch',
  logOak: 'log:oak',
  logOakCatching: 'log:oakCatch',
  tongue: (layer: number, shape: number) => `tongue:${layer}:${shape}`,
  bloom: 'flameBloom',
  embers: 'embers',
  smoke: 'smoke',
  spark: (i: number) => `spark${i}`,
  leaf: (i: number) => `leaf${i}`,
  dust: 'dust',
  breath: 'breath',
  glow: 'glow',
  glowEmber: 'glowEmber',
  shadow: 'shadow',

  pileBase: 'pile:base',
  pileBirch: 'pile:birch',
  pileOak: 'pile:oak',
  pileStump: 'pile:stump',
  signBirch: 'sign:birch',
  signOak: 'sign:oak',
  pileGlowBirch: 'pile:glow:birch',
  pileGlowOak: 'pile:glow:oak',

  tent: 'tent',
  tentFlap: 'tent:flap',
  lantern: 'lantern',
  sausages: 'sausages',

  heroLegs: 'hero:legs',
  heroLegsHop: 'hero:legsHop',
  heroBody: 'hero:body',
  heroHead: 'hero:head',
  heroHeadYawn: 'hero:headYawn',
  heroPompom: 'hero:pompom',
  heroArm: 'hero:arm',
  heroCarryBirch2: 'hero:birch2',
  heroCarryBirch1: 'hero:birch1',
  heroCarryOak: 'hero:oak',
  heroShadow: 'hero:shadow',

  wolfStand: 'wolf:stand',
  wolfRun: (f: number) => `wolf:run${f}`,
  wolfSit: 'wolf:sit',
  eyes: 'eyes',
  eyeGlow: 'eyeGlow',

  gaugePlate: 'gauge:plate',
  gaugeBirch: 'gauge:birch',
  gaugeOak: 'gauge:oak',
  gaugeHatch: 'gauge:hatch',
  gaugeGhost: 'gauge:ghost',
  gaugeStrip: 'gauge:strip',

  ringCalm: 'ring:calm',
  ringSoon: 'ring:soon',
  ringLate: 'ring:late',
  routeDot: 'route:dot',
  x2: 'x2',
  windIcon: 'windIcon',
  star: 'hintStar',

  brush: (i: number) => `brush${i}`,
  brushSoft: 'brushSoft',
  skyMask: 'skyMask',
  vignette: 'vignette',
  white: 'white',
  skyNight: 'sky:night',
  skyDawn: 'sky:dawn',
  skyHorizon: 'sky:horizon',
  moon: 'moon',
  sun: 'sun',
  starDot: (i: number) => `star${i}`,
  bird: 'bird',
} as const;

/** Ключи с вариантами кипения (по 3 текстуры на ключ). */
export const BOILING: readonly string[] = [
  K.logBirch,
  K.logOak,
  K.logOakCatching,
  K.embers,
  K.pileBirch,
  K.pileOak,
  K.pileStump,
  K.tent,
  K.lantern,
  K.sausages,
  K.heroLegs,
  K.heroLegsHop,
  K.heroBody,
  K.heroHead,
  K.heroHeadYawn,
  K.heroArm,
  K.heroCarryBirch2,
  K.heroCarryBirch1,
  K.heroCarryOak,
  K.wolfStand,
  K.wolfRun(0),
  K.wolfRun(1),
  K.wolfSit,
];

export function wordKey(text: string): string {
  return `word:${text}`;
}
