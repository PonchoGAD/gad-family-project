// functions/src/types.ts

/* ============================================================
 * Общие типы Step Engine / Users / Families для backend.
 * Этот файл используют Cloud Functions.
 * ============================================================
 */

/**
 * Суточные сырые шаги для dailySteps/{uid}/days/{date}.
 */
export type DailySteps = {
  /** Дата в формате YYYY-MM-DD (по выбранному TZ). */
  date: string;
  /** Сырые шаги за день (до лимитов/фильтров). */
  steps: number;
  /** Опционально — устройство/источник. */
  device?: string;
};

/**
 * Старый формат дневной награды (dry-run/preview).
 * Сохраняем как есть для совместимости.
 */
export type DailyReward = {
  date: string;
  uid: string;
  subscription: "free" | "plus" | "pro";
  stepsCounted: number; // с учётом потолка
  multiplier: number; // 1 / 1.5 / 2
  rateDay: number; // конверсия шагов в GAD на сегодня
  gadEarned: string; // строкой (bigint decimal)
  dryRun: boolean;
  createdAt: number;
};

/**
 * Профиль пользователя для backend логики.
 */
export type UserProfile = {
  uid: string;
  familyId?: string;
  subscription?: "free" | "plus" | "pro";

  // Возраст / ограничения
  birthDate?: string; // "YYYY-MM-DD"
  isAdult?: boolean; // вычисляется на backend (>= 18)
  noWallet?: boolean; // true для детей < 14 (только кастодиальные операции)
};

// ---------- Family / Vault types ----------

/**
 * Базовый документ семьи в Firestore: families/{fid}
 */
export type FamilyDoc = {
  name: string;
  inviteCode: string;
  ownerUid?: string | null;
  createdAt?: any;
};

/**
 * Агрегированный семейный сейф: families/{fid}/vault
 */
export type FamilyVaultEntry = {
  totalLockedPoints?: number;
  totalReleasedPoints?: number;
  lastUpdatedAt?: any;
};

/* ============================================================
 * Step Engine V2 — единая схема типов (backend)
 * Согласована с apps/mobile/src/lib/stepEngineTypes.ts
 * ============================================================
 */

export type SubscriptionTier = "free" | "plus" | "pro";

/**
 * Сырой период шагов за день (backend-версия).
 */
export type RawStepPeriod = {
  startMs: number;
  endMs: number;
  steps: number;
  source?: "device" | "manual" | "import" | "other";
};

/**
 * Входной контекст для StepEngine V2 на один день.
 * Используется внутри Cloud Functions.
 */
export type StepEngineDayInput = {
  uid: string;
  date: string; // YYYY-MM-DD (по бизнес-TZ)
  timezone: string;
  familyId: string | null;
  ageYears: number | null;
  subscriptionTier: SubscriptionTier;
  totalSteps: number;
  dailyStepsDocPath?: string;
  periods?: RawStepPeriod[];
};

/**
 * Информация о лимитах на день.
 * Полностью синхронизирована с фронтовой версией.
 */
export type StepEngineLimitInfo = {
  dailyMaxSteps: number;
  applied: boolean;
  reason: "none" | "cap" | "zero-steps" | "under-min-steps" | "banned";
  stepsBeforeCap: number;
  stepsAfterCap: number;
};

/**
 * Флаги бонусов.
 */
export type StepEngineBonusFlags = {
  subscriptionBoostApplied?: boolean;
  zoneBonusApplied?: boolean;
  streakBonusApplied?: boolean;
  [key: string]: boolean | number | string | undefined;
};

/**
 * Финальный статус расчёта дня (backend).
 */
export type StepEngineDayStatus =
  | "ok"
  | "limit"
  | "skipped"
  | "rejected";

/**
 * Результат работы StepEngine V2 на один день (backend-модель).
 * На его основе заполняются документы в rewards/{uid} и rewards/{uid}/days/{date}.
 */
export type StepEngineDayResult = {
  uid: string;
  date: string;
  familyId: string | null;
  subscriptionTier: SubscriptionTier;

  totalSteps: number;
  stepsCounted: number;

  gadPreview: string; // decimal
  gadEarned: string; // decimal

  status: StepEngineDayStatus;
  limit?: StepEngineLimitInfo;
  bonusFlags?: StepEngineBonusFlags;

  // V2.1+: гео-бонусы
  zoneBonusSteps?: number;
  zoneBonusGad?: string;

  // V2.1+: миссии (идентификаторы миссий за день)
  missionsCompleted?: string[];

  meta?: {
    runId?: string;
    dryRun?: boolean;
    createdAtMs?: number;
    updatedAtMs?: number;
  };
};

/**
 * Агрегаты по пользователю в rewards/{uid}.
 * Backend-версия, безопасная для Firestore.
 */
export type RewardsUserDoc = {
  uid: string;
  lastDate?: string;
  totalDays?: number;
  totalSteps?: number;
  totalGadEarned?: string;
  totalGadClaimed?: string;
  firstDate?: string;
  lastUpdatedAt?: FirebaseFirestore.FieldValue | any;
};

/**
 * Документ rewards/{uid}/days/{date}.
 * На backend здесь обычно будут serverTimestamp в createdAt/updatedAt.
 */
export type RewardDayDoc = StepEngineDayResult & {
  createdAt?: FirebaseFirestore.FieldValue | any;
  updatedAt?: FirebaseFirestore.FieldValue | any;
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
