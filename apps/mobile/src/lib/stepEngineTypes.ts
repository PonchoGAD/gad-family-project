// apps/mobile/src/lib/stepEngineTypes.ts
// ---------------------------------------------
// Общие типы и константы для Step Engine V2.
// Без Firebase / React.
// ---------------------------------------------

/**
 * Подписка пользователя.
 */
export type SubscriptionTier = "free" | "plus" | "pro";

/**
 * Минимальное количество шагов, чтобы день участвовал в распределении.
 * Всё, что ниже — статус 'skipped'.
 */
export const MIN_STEPS = 1000;

/**
 * Возраст, ниже которого профиль считается "ребёнком".
 * Дети < CHILD_AGE_LIMIT → 100% награды в семью (или child-locked).
 */
export const CHILD_AGE_LIMIT = 14;

/* ============================================================
 * V2: ВХОД ДВИЖКА (сырые шаги + периоды)
 * ============================================================
 */

/**
 * Сырой период шагов за день (например, от устройства / HealthKit / Google Fit).
 * Используется для продвинутой аналитики, но не обязателен для UI.
 */
export type RawStepPeriod = {
  /** Начало периода в ms (UTC или локальное — определяется на backend конфигом TZ). */
  startMs: number;
  /** Конец периода в ms. */
  endMs: number;
  /** Количество шагов за этот период. */
  steps: number;
  /** Источник данных, чтобы потом различать ломанные/дубли. */
  source?: "device" | "manual" | "import" | "other";
};

/**
 * Входной контекст для StepEngine V2 на один день.
 * Это уже "собранные" данные: кто, за какой день, сколько шагов и с какой подпиской.
 */
export type StepEngineDayInput = {
  /** UID пользователя */
  uid: string;
  /** Дата в формате 'YYYY-MM-DD' (по бизнес-TZ — например, America/New_York). */
  date: string;
  /** Часовой пояс, в котором считается день (например, 'America/New_York'). */
  timezone: string;
  /** Семья пользователя или null, если ещё не в семье. */
  familyId: string | null;
  /** Возраст в полных годах (для детской логики), либо null, если нет данных. */
  ageYears: number | null;
  /** Тариф подписки на момент расчёта. */
  subscriptionTier: SubscriptionTier;
  /** Суммарные шаги за день (после агрегации из raw источников). */
  totalSteps: number;
  /**
   * Документ в dailySteps/{uid}/days/{date}, из которого взялись шаги.
   * Нужен backend-у, чтобы линковать исходные данные.
   */
  dailyStepsDocPath?: string;
  /** Необязательные сырые периоды шагов (для продвинутой аналитики). */
  periods?: RawStepPeriod[];
};

/* ============================================================
 * V2: ЛИМИТЫ, БОНУСЫ И СТАТУСЫ
 * ============================================================
 */

/**
 * Информация о лимитах на день (daily cap и причины среза).
 */
export type StepEngineLimitInfo = {
  /** Максимальное количество шагов, учитываемых в день. */
  dailyMaxSteps: number;
  /** Был ли вообще применён лимит. */
  applied: boolean;
  /**
   * Причина:
   *  - 'none' — лимит не сработал
   *  - 'cap' — обрезали по дневному потолку
   *  - 'zero-steps' — 0 шагов
   *  - 'under-min-steps' — меньше MIN_STEPS
   *  - 'banned' — пользователь заблокирован для наград и т.п.
   */
  reason: "none" | "cap" | "zero-steps" | "under-min-steps" | "banned";
  /** Шаги до применения лимита. */
  stepsBeforeCap: number;
  /** Шаги после применения лимита (stepsCounted). */
  stepsAfterCap: number;
};

/**
 * Флаги бонусов и дополнительных модификаторов.
 * Ключи могут расширяться в следующих версиях (zone/streak/missions и т.п.).
 */
export type StepEngineBonusFlags = {
  /** Повышенный множитель из-за подписки (Plus/Pro). */
  subscriptionBoostApplied?: boolean;
  /** Бонус за safe-зону (гео-миссии). */
  zoneBonusApplied?: boolean;
  /** Бонус за стрик (несколько дней подряд). */
  streakBonusApplied?: boolean;
  /** Миссии/ивенты — свободный словарь. */
  [key: string]: boolean | number | string | undefined;
};

/**
 * Финальный статус расчёта дня.
 */
export type StepEngineDayStatus =
  | "ok" // обычный успешный день
  | "limit" // всё посчитано, но сработали лимиты
  | "skipped" // слишком мало шагов / нет данных
  | "rejected"; // отклонено правилами (бан, ошибка, некорректные данные)

/* ============================================================
 * V2: ВЫХОД ДВИЖКА НА ДЕНЬ
 * ============================================================
 */

/**
 * Результат работы движка на один день (UI-модель).
 * По сути — то, что будет лежать в rewards/{uid}/days/{date}.
 */
export type StepEngineDayResult = {
  uid: string;
  date: string;
  familyId: string | null;
  subscriptionTier: SubscriptionTier;

  /** Общие шаги за день (до лимитов). */
  totalSteps: number;
  /** Шаги, которые реально пошли в расчёт (после cap/фильтров). */
  stepsCounted: number;

  /** Предварительная оценка награды (до окончательного апрува/пула). */
  gadPreview: string; // decimal строка
  /** Финальная начисленная награда за день (GAD Points или токены), decimal строка. */
  gadEarned: string;

  /** Статус дня по итогам расчёта. */
  status: StepEngineDayStatus;

  /** Детальная информация о лимитах (если были). */
  limit?: StepEngineLimitInfo;

  /** Флаги срабатывания бонусов. */
  bonusFlags?: StepEngineBonusFlags;

  /** Бонусные шаги за нахождение в safe-зонах (V2.1+). */
  zoneBonusSteps?: number;
  /** Бонусные GAD за safe-зоны (V2.1+), decimal строка. */
  zoneBonusGad?: string;

  /** Миссии, выполненные за день (V2.1+). */
  missionsCompleted?: string[];

  /** Техническая мета-информация. */
  meta?: {
    /** ID запуска (cron, ручной run, dry-run). */
    runId?: string;
    /** Признак "dry-run" без настоящих начислений. */
    dryRun?: boolean;
    /** Клиентский timestamp создания/обновления (для UI). */
    createdAtMs?: number;
    updatedAtMs?: number;
  };
};

/* ============================================================
 * V2: Firestore-схема rewards/{uid} и rewards/{uid}/days/{date}
 * ============================================================
 */

/**
 * Агрегаты по пользователю в документе rewards/{uid}.
 * Это то, что фронт может читать для дашборда / прогресса.
 */
export type RewardsUserDoc = {
  /** UID владельца. */
  uid: string;

  /** Последняя дата, за которую есть расчёт (YYYY-MM-DD). */
  lastDate?: string;
  /** Кол-во дней, в которые был хоть какой-то результат. */
  totalDays?: number;
  /** Общие шаги за всё время (totalStepsAcrossDays). */
  totalSteps?: number;
  /** Суммарно заработанные GAD (decimal строка). */
  totalGadEarned?: string;
  /** Сколько GAD уже выведено/redeem (decimal строка). */
  totalGadClaimed?: string;

  /** Вспомогательные поля для UI и сортировок. */
  firstDate?: string;
  /** Последнее обновление агрегатов (serverTimestamp на backend). */
  lastUpdatedAt?: any;
};

/**
 * Документ rewards/{uid}/days/{date}.
 * Это прямое представление StepEngineDayResult + server timestamps.
 */
export type RewardDayDoc = StepEngineDayResult & {
  /** Серверные timestamps для Firestore (ставятся на backend). */
  createdAt?: any;
  updatedAt?: any;
};

/* ============================================================
 * LEGACY / V1 СЛОЙ (СОХРАНЯЕМ БЕЗ ПЕРЕИМЕНОВАНИЙ)
 * ============================================================
 * Эти типы уже использовались ранее. Мы их не трогаем,
 * чтобы не ломать существующий код. В V2 можно постепенно
 * мигрировать на StepEngineDayInput / StepEngineDayResult /
 * RewardsUserDoc / RewardDayDoc.
 * ============================================================
 */

/**
 * Контекст пользователя за день — вход в старый движок.
 * Всё, что нужно, уже собрано (uid, семья, возраст, подписка, шаги).
 */
export type UserDayContext = {
  uid: string;
  date: string; // 'YYYY-MM-DD' (UTC)
  familyId: string | null;
  age: number | null;
  subscriptionTier: SubscriptionTier;
  steps: number;
};

/**
 * Результат расчёта награды для одного пользователя на день (старый формат).
 * НЕ содержит runId / status — это добавляем на уровне записи в БД.
 */
export type UserDayReward = {
  uid: string;
  date: string;
  familyId: string | null;
  steps: number;
  weightedSteps: number;
  subscriptionTier: SubscriptionTier;
  rateDay: number;
  points: number; // общие GAD Points за день
  familyShare: number; // в семью (treasury / child-locked)
  personalShare: number; // в личный баланс (если >=14)
};

/**
 * Структура "плана записи" в Firestore (старый формат).
 * Это НЕ Firestore API, а просто описание того, что нужно записать.
 * Functions уже превратит это в batch.set / update / increment.
 */
export type RewardWriteOps = {
  rewardDoc: {
    path: string; // rewards/{uid}/days/{date}
    data: {
      date: string;
      uid: string;
      steps: number;
      weightedSteps: number;
      subscriptionTier: SubscriptionTier;
      rateDay: number;
      points: number;
      familyShare: number;
      personalShare: number;
      status: "paid" | "skipped";
      runId: string;
      // updatedAt/timeStamp ставим в functions (serverTimestamp),
      // здесь оставляем под caller.
    };
  };

  balanceDoc: {
    path: string; // balances/{uid}
    increments: {
      personal: number;
      family: number;
      totalEarned: number;
    };
  } | null;

  familyLedgerDoc: {
    path: string; // families/{fid}/treasury/ledger/{entryId}
    data: {
      type: "steps_reward";
      date: string;
      amount: number;
      fromUser: string;
      runId: string;
      // createdAt — также ставится в functions.
    };
  } | null;
};
