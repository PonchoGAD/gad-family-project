# StepEngine V2 — Manual Test Checklist

Единый чек-лист для ручного тестирования движка шагов (Step Engine V2) и его интеграции с UI (HomeScreen, StepsScreen).

---

## 0. Базовые параметры и подготовка

- **MIN_STEPS**: 1000 (минимум шагов, чтобы день участвовал в распределении).
- **DAILY_MAX_STEPS**:
  - `free`: 10 000
  - `plus`: 15 000
  - `pro`: 20 000

**Основные коллекции:**

- `dailySteps/{uid}/days/{date}` — сырые шаги за день.
- `rewards/{uid}/days/{date}` — результат StepEngine V2 на день.
- `rewards/{uid}` — агрегаты по пользователю.
- `balances/{uid}` — баланс GAD Points (personal/family/totalEarned).
- `families/{fid}/treasury/ledger/{entryId}` — записи по семейному сейфу.
- `dailyStats/{date}` — общая статистика по дню (агрегаты по всем пользователям).

**Основные поля в `rewards/{uid}/days/{date}` (StepEngineDayResult):**

- `totalSteps`
- `stepsCounted`
- `gadPreview`
- `gadEarned`
- `status` (`ok | limit | skipped | rejected`)
- `limit` (объект `StepEngineLimitInfo`)
- `bonusFlags` (объект `StepEngineBonusFlags`)
- `zoneBonusSteps?`, `zoneBonusGad?`, `missionsCompleted?` (V2.1+)
- `meta.runId`, `meta.dryRun`, `meta.createdAtMs`, `meta.updatedAtMs` (опционально)

---

## 1. Новый пользователь без шагов

**Цель:** убедиться, что при отсутствии шагов движок корректно пропускает день.

### Preconditions

- Создать тестового пользователя `uid` (через Auth/Firestore).
- Убедиться, что НЕТ документа:
  - `dailySteps/{uid}/days/{today}`.

### Шаги

1. Запустить дневной расчёт:
   - либо cron-функцию `stepEngineDailyV2` / `stepEngineCron`,
   - либо ручной запуск `stepEngineRunNow` / `stepEngineRunV2` для всех пользователей/дня.
2. Проверить Firestore:
   - `rewards/{uid}/days/{today}`:
     - либо **отсутствует**,
     - либо существует и имеет:
       - `status = "skipped"`,
       - `totalSteps = 0` или нет данных,
       - `gadEarned = "0"` (или `"0.000000"`),
       - `limit.reason = "zero-steps"`.

### Ожидаемый UI (Home / Steps)

- **HomeScreen**:
  - `Steps` → `0` или `—`, без ошибок.
  - `GAD today` → `0` или `—`.
  - Если статус отображается — текст про отсутствие данных / skipped.
- **StepsScreen**:
  - В Today/Selected day:
    - `steps = 0`.
    - `GAD preview = 0`.
    - `GAD earned = 0`.
    - `Status = skipped` / `no-data`.
  - Никаких ошибок при рендере истории.

---

## 2. Мало шагов (< MIN_STEPS)

**Цель:** проверить поведение, когда шаги есть, но меньше порога участия.

### Preconditions

- Выбран `uid` и `date` (например, `today`).
- Создать документ:
  - `dailySteps/{uid}/days/{date}`:
    - `steps = MIN_STEPS - 1` (например, 999).
    - `platform`, `updatedAt` — опционально.

### Шаги

1. Запустить расчёт для этого дня:
   - через `stepEngineRunV2` / `stepEngineRunNow` (per-user или глобальный).
2. Проверить Firestore:
   - `rewards/{uid}/days/{date}`:
     - `totalSteps ≈ 999` (или то, что записали).
     - `stepsCounted = 0`.
     - `status = "skipped"`.
     - `gadEarned = "0"` (или `"0.000000"`).
     - `limit.applied = true`.
     - `limit.reason = "under-min-steps"`.
     - `limit.stepsBeforeCap ≈ 999`.
     - `limit.stepsAfterCap ≈ 999 или 0` (в зависимости от реализации).
   - `rewards/{uid}`:
     - `lastDate = date` (если это первый день).
     - `totalSteps` не увеличивается или увеличивается с учётом логики агрегатов (по проектному решению).

### Ожидаемый UI

- **HomeScreen**:
  - `Steps` → показывает фактические шаги (например, `999`).
  - `GAD today` → `0` или `—`.
  - `Today status` → `skipped` / текст о том, что мало шагов.
- **StepsScreen**:
  - Selected day:
    - `Steps` → `999`.
    - `GAD preview = 0`.
    - `GAD earned = 0`.
    - `Status = skipped`.
    - Отдельная строка:
      - “Limited by: under-min-steps” или аналогичный текст.
  - В истории за этот день:
    - показывается статус `skipped` и `gad = 0`.

---

## 3. Выше дневного лимита (daily cap)

**Цель:** проверить, что шаги обрезаются до лимита, статус становится `limit`, а награда > 0.

### Preconditions

- Выбрать `subscriptionTier`:
  - `free` / `plus` / `pro`.
- Посчитать лимит:
  - `cap = DAILY_MAX_STEPS[tier]`.
- Создать документ:
  - `dailySteps/{uid}/days/{date}`:
    - `steps = cap + 5000` (например, `free` → 15000 шагов).

### Шаги

1. Запустить `stepEngineRunV2` / `stepEngineRunNow` для этого пользователя и даты.
2. Проверить Firestore:
   - `rewards/{uid}/days/{date}`:
     - `totalSteps ≈ cap + 5000`.
     - `stepsCounted = cap` (10k / 15k / 20k).
     - `status = "limit"`.
     - `gadPreview > 0`, `gadEarned > 0`.
     - `limit.applied = true`.
     - `limit.reason = "cap"`.
     - `limit.stepsBeforeCap ≈ cap + 5000`.
     - `limit.stepsAfterCap = cap`.
   - `balances/{uid}`:
     - `totalEarned` увеличен на `gadEarned`.
     - `personal` и `family` увеличены согласно бизнес-логике (80/20, дети = 100% family, и т.п.).
   - `families/{fid}/treasury/ledger/{entryId}` (если есть familyId и familyShare > 0):
     - присутствует запись `type = "steps_reward"` с корректным `amount`.

### Ожидаемый UI

- **HomeScreen**:
  - `Steps` → может показывать либо `stepsCounted`, либо `totalSteps` (по дизайну, но без ошибок).
  - `GAD today` → показывает рассчитанные GAD (> 0).
  - Статус: `limit` + подпись о том, что достигнут дневной лимит.
- **StepsScreen**:
  - Selected day:
    - `Steps` → `stepsCounted` или `totalSteps` (один из вариантов, главное — консистентно).
    - `GAD preview` и `GAD earned` — ненулевые значения.
    - `Status: limit`.
    - Отдельный текст:
      - `Limit: cap — counted X steps (daily cap Y)` или аналогичный вывод.
  - В истории:
    - видно, что этот день имеет `status = limit` и GAD > 0.

---

## 4. Cron уже отработал (пассивный сценарий)

**Цель:** убедиться, что при уже отработавшем cron-е UI просто читает готовые данные и ничего не пересчитывает на клиенте.

### Preconditions

- Есть пользователь `uid` с заполненным `dailySteps` за вчера (`yesterday`).
- Запустить cron-функцию для вчерашней даты:
  - `stepEngineDailyV2` / `stepEngineCron` за `yesterday`.

### Шаги

1. Убедиться, что в Firestore есть:
   - `rewards/{uid}/days/{yesterday}` с валидным `StepEngineDayResult`.
2. Открыть приложение (на реальном устройстве/эмуляторе) **на следующий день**:
   - HomeScreen / StepsScreen.
3. Проверить Network/Logs (если возможно):
   - нет лишних вызовов `stepEngineRunV2` при обычном открытии Home/Steps.
   - UI просто читает Firestore (через `fetchRewardForDate` / `fetchTodayReward` и т.п.).

### Ожидаемый UI

- **HomeScreen**:
  - для `today` может показывать 0/—, если шагов ещё нет;
  - при переключении на вчера (если реализовано) — считывает готовые данные.
- **StepsScreen**:
  - список History содержит вчерашний день с корректными шагами / GAD / статусом.
  - никаких ошибок/мигания статуса при открытии.

---

## 5. Пользователь вручную триггерит callable `stepEngineRunV2`

**Цель:** проверить цепочку: `dailySteps` → callable → rewards/balances/family ledger/dailyStats.

### Preconditions

- Пользователь `uid` существует, привязан к семье `fid` (для проверки family ledger).
- На сегодня (`today`) есть документ:
  - `dailySteps/{uid}/days/{today}` с разумным количеством шагов (например, 8 000).

### Шаги

1. В клиенте:
   - выполнить `saveToCloud` (чтобы гарантировать, что dailySteps актуален),
   - вызвать callable-функцию `stepEngineRunV2` / `stepEngineRunNow` для этого пользователя.
2. Проверить Firestore:

**2.1. `rewards/{uid}/days/{today}`**

- Поля:
  - `date = today`.
  - `uid = uid`.
  - `totalSteps` ≈ сохранённым шагам.
  - `stepsCounted` с учётом лимитов.
  - `gadPreview` и `gadEarned` > 0 (если шаги выше MIN_STEPS).
  - `status` ∈ {`ok`, `limit`, `skipped`} в зависимости от сценария.
  - `limit` — валидный объект `StepEngineLimitInfo`.
  - `bonusFlags` — содержит как минимум `subscriptionBoostApplied` для Plus/Pro.
  - `zoneBonusSteps`, `zoneBonusGad`, `missionsCompleted` — сейчас нули/пустой массив (V2.1 hook).

**2.2. `rewards/{uid}` (user aggregate)**

- Поля:
  - `uid = uid`.
  - `lastDate` ≥ `today`.
  - `totalDays` увеличился, если день был первый/новый.
  - `totalSteps` увеличился.
  - `totalGadEarned` увеличился на `gadEarned`.
  - `lastUpdatedAt` обновлён.

**2.3. `balances/{uid}`**

- Поля `increments` (после применения batch/transaction):
  - `personal` увеличен на личную долю.
  - `family` увеличен на семейную долю.
  - `totalEarned` увеличен на `gadEarned`.

**2.4. `families/{fid}/treasury/ledger/{entryId}`**

- Найти запись, созданную движком:
  - `type = "steps_reward"`.
  - `fromUser = uid`.
  - `amount = familyShare`.
  - `date = today`.
  - `runId` совпадает с `meta.runId` в `rewards/{uid}/days/{today}`, если используется.

**2.5. `dailyStats/{today}`**

- Содержит агрегированную статистику по дню:
  - суммарное количество шагов по всем пользователям;
  - суммарные GAD;
  - количество активных пользователей/дней и т.п.
- **Важно**: этот документ должен быть read-only с точки зрения клиента (только Cloud Functions пишет).

---

## 6. Проверка UI: HomeScreen

**Цель:** убедиться, что HomeScreen использует V2-клиент (stepEngine.ts) и корректно отображает состояние дня.

### Проверить:

1. При наличии `uid` и в не-demo режиме:
   - `getTodayStepsPreview(uid)` возвращает:
     - `steps = totalSteps или stepsCounted` (по решению в клиенте).
     - `reward = StepEngineDayResult | null`.
   - `subscribeTodayReward(uid, cb)`:
     - при изменении `rewards/{uid}/days/{today}` обновляет `todayRewardGad` и `todayRewardStatus` на экране.
2. **Отображение карточки “Today”:**
   - Steps:
     - `stats.todaySteps ?? "—"` — верно отображает шаги.
   - GAD today:
     - при существующем reward → `stats.todayRewardGad` (из `gadEarned` или `gadPreview`).
     - при отсутствии reward → fallback к `stats.lastRewardGad` или `—`.
   - Today status:
     - `ok` / `limit` / `skipped` / `rejected` / `demo`, если есть.
3. **Demo-режим:**
   - При `isDemo = true`:
     - Steps ≈ 8 200 (фиктивные).
     - GAD today ≈ 65.5 (фиктивные).
     - Status = `demo` или аналогичная строка.
   - Никаких реальных вызовов backend-функций (проверить логами).

---

## 7. Проверка UI: StepsScreen

**Цель:** убедиться, что StepsScreen работает на типах V2, поддерживает выбор даты и показывает лимиты/бонусы.

### Проверить:

1. **Selected day блок:**
   - Использует `currentDate` (формат `YYYY-MM-DD`).
   - Загружает `dayResult` через `fetchRewardForDate(uid, currentDate)`.
   - Отображает:
     - Steps:
       - `formatSteps(dayResult?.totalSteps ?? dayResult?.stepsCounted ?? 0)`.
     - GAD preview:
       - `dayResult?.gadPreview ?? "0"`.
     - GAD earned:
       - `dayResult?.gadEarned ?? "0"`.
     - Status:
       - `dayResult?.status ?? "no-data"`.
   - Если `dayResult.limit?.applied`:
     - текст: `Limited by: ${dayResult.limit.reason}`.
   - Если `dayResult.bonusFlags?.subscriptionBoostApplied`:
     - бейдж/строка “Subscription boost”.

2. **Переключение дат:**
   - Кнопка “Previous day”:
     - уменьшает `currentDate` на 1 день.
     - триггерит повторный вызов `fetchRewardForDate`.
   - Кнопка “Next day”:
     - увеличивает `currentDate` на 1 день (но не уходит в будущее, если есть ограничение).
   - При смене `currentDate` UI не падает, даже если данных по дню нет.

3. **История (history):**
   - Берётся из `rewards/{uid}/days/*` в порядке по `date desc`.
   - Для каждой записи:
     - показывает `steps` (totalSteps/stepsCounted).
     - `gad = gadEarned ?? gadPreview ?? null`.
     - `status = data.status ?? null`.
   - В demo-режиме:
     - использует демо-историю, `status = "demo"` (на уровне UI можно мапить это в текст “demo”).

4. **Fallback логика:**
   - Если для выбранной даты нет `dayResult`, и это **сегодня**:
     - используется локальный `estimateGadPoints(steps)` как чистый UI-превью;
     - при этом статус = `no-data` / `skipped`, но UI не показывает ошибок.
   - Если это **прошлый день** без данных:
     - шаги = 0;
     - GAD preview/earned = 0;
     - статус = `no-data`.

---

## 8. Итоговый проход по чек-листу при релизе

Перед каждым релизом StepEngine V2 проверить:

1. **Новый пользователь без шагов** — статус `skipped`, UI без ошибок.
2. **Порог MIN_STEPS** — шаги чуть ниже порога дают `skipped` + `under-min-steps`.
3. **Cap по подписке** — шаги выше лимита → `limit`, обрезка `stepsCounted`, GAD > 0.
4. **Cron-сценарий** — заранее рассчитанные дни корректно читаются UI без ручного запуска движка.
5. **Callable `stepEngineRunV2`** — цепочка `dailySteps → rewards → balances → family ledger → dailyStats` работает.
6. **HomeScreen** — корректное отображение todaySteps, GAD today, статуса + демо.
7. **StepsScreen** — корректный Selected day, история, лимиты, бонусы, переключение по датам.

Если любой из пунктов падает — фиксируется баг с чёткой ссылкой на шаг чек-листа, чтобы быстро локализовать проблему в будущем.
