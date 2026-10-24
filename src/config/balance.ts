// Все числа баланса и тайминги игры. Длительности правил — в единицах A (раздел 3),
// тайминги отклика интерфейса и анимаций — в миллисекундах.

export const balance = {
  // 2.2 дрова
  fireSlots: 3,
  birchSize: 1,
  oakSize: 2,
  birchCarry: 2,
  oakCarry: 1,
  oakCatchA: 3.2,

  // 2.3 костры, угли и волки
  emberA: 2.8,
  relightFuel: 1,
  eyesOneBelow: 1,
  eyesThreeBelow: 0.5,
  countdownSec: 3,
  multNormal: 1.0,
  multSheltered: 0.8,
  multOpen: 1.25,

  // 2.4 ветер
  windFirstA: 8,
  windWarnA: 4,
  windGapMin: 0.7,
  windGapMax: 1.3,

  // 2.6 рассвет и итог
  nightMaxSec: 300,
  dawnShare: 0.2,

  // 2.7 пауза и честность времени
  frameMaxMs: 100,
  doubleTapGuardMs: 120,

  // 2.8 подсказки
  riskRed: 0.75,
  riskBlue: [0.4, 0.47, 0.52, 0.56, 0.58, 0.6],
  oakHintRisk: 0.75,

  // 3 темп игрока
  unitOverheadSec: 0.45,
  pace: {
    defaultTMed: 5,
    minTMed: 3,
    maxTMed: 10,
    defaultP: 0.8,
    minP: 0.5,
    maxP: 1,
    timeWindow: 20,
    accWindow: 30,
    minTimeSamples: 5,
    minAccSamples: 10,
  },

  // 5 генерация уровня
  startFuelSpread: 0.6,
  tauFactor: 1.12,
  nominalAttempts: 50,
  nominalWindStretch: 1.2,
  nominalSafetyCapA: 400,

  // 14 модель ответа (симуляция и калибровка подсказок)
  answerSigma: 0.5,
  wrongFeedbackMs: 1000,
  questionSwapMs: 300,

  // 14 планировщик
  planner: { rollouts: 12, horizonA: 22 },
  botIdleStepA: 0.25,
} as const;

/** Тайминги отклика: анимации, интерфейс, свет. Ничто из этого не задерживает правила. */
export const timing = {
  boilFps: 8,
  flameFps: 10,
  stepMs: 200,
  pickupMs: 200,
  throwMs: 250,
  actionAnimMaxMs: 400,
  lightTweenMs: 300,
  flashMs: 300,
  correctGlowMs: 150,
  questionDrawInMs: 150,
  introMaxMs: 2500,
  introLosMs: 700,
  finaleMaxMs: 2000,
  sunriseMs: 1500,
  wordRiseMs: 900,
  wordHoldMs: 450,
  maxWords: 3,
  howlCooldownMs: 20000,
  gahnShare: 0.8,
  eyesBlinkMinMs: 1800,
  eyesBlinkMaxMs: 5200,
  eyesBlinkMs: 140,
  shakeSmallPx: 2,
  shakeBigPx: 6,
  shakeMs: 260,
  maxFlashesPerSec: 3,
  results: { cardStaggerMs: 380, tallyStepMs: 110 },
  fpsSampleMs: 3000,
  fpsLowThreshold: 45,
  tutorialMinMs: 900,
  resizeDebounceMs: 60,
} as const;

/** Параметры света и тьмы (раздел 8), в клетках поляны и долях непрозрачности. */
export const light = {
  nightAlpha: 0.88,
  dawnEndAlpha: 0.25,
  fireRadiusBase: 0.9,
  fireRadiusPerFuel: 0.55,
  fireFlickerBoil: 0.04,
  fireFlickerSmooth: 0.03,
  emberRadius: 0.6,
  emberStrength: 0.35,
  flashExtraRadius: 0.8,
  lanternStrength: 0.75,
  moonStrength: 0.08,
  windLean: 0.22,
  maxErasesPerFrame: 12,
  glowAlphaFire: 0.9,
  glowAlphaEmber: 0.5,
} as const;

/** Частицы и прочая сочность (раздел 9), счётчики. */
export const juice = {
  maxParticles: 200,
  sparksPerFuel: 1.6,
  sparksBurst: 14,
  dustBurst: 7,
  leavesPerSec: 9,
  smokeCatching: 2.5,
  smokeEmbers: 1.6,
  breathEverySec: 2.6,
} as const;

export type RiskBlueTable = typeof balance.riskBlue;

/** Порог «голубого» кольца по длине пути n (шаги плюс одно подкладывание). */
export function riskBlue(n: number): number {
  const table = balance.riskBlue;
  const i = Math.max(1, Math.min(table.length, Math.round(n))) - 1;
  return table[i];
}
