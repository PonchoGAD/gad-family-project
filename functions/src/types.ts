export type DailySteps = {
  date: string;        // YYYY-MM-DD
  steps: number;       // сырые шаги за день
  device?: string;
};

export type DailyReward = {
  date: string;
  uid: string;
  subscription: "free" | "plus" | "pro";
  stepsCounted: number;      // с учётом потолка
  multiplier: number;        // 1 / 1.5 / 2
  rateDay: number;           // конверсия шагов в GAD на сегодня
  gadEarned: string;         // строкой (bigint decimal)
  dryRun: boolean;           
  createdAt: number;
};

export type UserProfile = {
  uid: string;
  familyId?: string;
  subscription?: "free" | "plus" | "pro";
};
