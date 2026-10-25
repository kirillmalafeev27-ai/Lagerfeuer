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

  // 3 темп игрока — для вопросов банка: слово, артикль, форма
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
    /** σ логнормали времени ответа, под которую откалиброваны подсказки и уровни (2.8, 14.2). */
    refSigma: 0.5,
    defaultSigma: 0.5,
    sigmaPriorWeight: 10,
    minSigma: 0.35,
    maxSigma: 0.9,
    /**
     * Поправка на разброс: T_эфф = T_med · e^(k·(σ − refSigma)). Подобрано моделью ответа: так
     * на границах колец опаздывают 5–8% (голубое) и 19–29% (малиновое) при σ от 0.4 до 0.9.
     */
    spreadGain: 1.0,
    allowance: 1,
  },

  /**
   * Темп для заданий генератора (формат Morskoy): предложения читаются дольше и разбросаны
   * сильнее (форматы разной длины), поэтому свой учёт — отдельно для каждого уровня A1–C1.
   */
  paceGenerated: {
    /**
     * Пока ответов меньше пяти: с запасом, чтобы первая ночь не оказалась непосильной. У A1–A2
     * предложения короче, но новичок и читает медленнее — поэтому не меньше, чем у B1.
     */
    defaultTMedByLevel: { A1: 14, A2: 14, B1: 14, B2: 16, C1: 18 } as Record<string, number>,
    defaultTMed: 14,
    minTMed: 4,
    maxTMed: 30,
    defaultP: 0.7,
    defaultSigma: 0.65,
    /**
     * Темп для подсказок честный: что задания генератора трудные, учтено в самих ночах
     * (levels.generated), а не в темпе — иначе ночь стала бы короче (потолок по времени).
     */
    allowance: 1,
  },
  /** С заданиями генератора ночь не длиннее этого (2.6.1): предложения читаются долго. */
  nightMaxSecGenerated: 360,

  /**
   * Помощь после неудач — «сухой мох»: после стольких поражений подряд на уровне угли тлеют
   * дольше (emberMul[0]), после второго порога — ещё дольше (emberMul[1]). Снимается победой.
   */
  assist: {
    afterLosses: 2,
    secondAfterLosses: 4,
    emberMul: [1.5, 2],
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
  /**
   * Показ верного варианта после ошибки в задании генератора: целое предложение за секунду
   * не прочитать, а без этого ошибка ничему не учит. Ночь при этом идёт.
   */
  wrongFeedbackGeneratedMs: 1800,
  questionSwapMs: 300,

  // 12 вопросы от ИИ-генератора (движок Morskoy): блок по теме, как в Morskoy
  ai: {
    batch: 10,
    /** Новый блок запрашивается, когда в очереди темы остаётся столько заданий. */
    refillAt: 5,
    /** Первый вопрос после выбора тем: сколько ночь ждёт генерацию, потом — встроенный банк. */
    firstWaitMs: 45_000,
    /** Очередь пуста посреди ночи: короткое ожидание, затем вопрос из банка. */
    nextWaitMs: 1500,
    requestTimeoutMs: 180_000,
    retryWrongMin: 4,
    retryWrongMax: 6,
  },

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
