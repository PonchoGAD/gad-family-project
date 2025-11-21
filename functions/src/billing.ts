3. Billing — что сделано и что нужно на этом этапе
Что уже есть

Логика подписок в Cloud Functions:

setSubscriptionTier (меняет tier для пользователя и семьи).

applyGasStipend (начисляет газ по tier).

Модель планов: basic/family/pro в SUBSCRIPTIONS.

Что нужно сейчас (MVP, без реального Stripe)

Поля в users/{uid}:

subscription: "basic" | "family" | "pro" — уже есть.

Добавить (на будущее):

subscriptionExpiresAt: Timestamp | null

subscriptionSource: "manual" | "stripe" | "appstore" | "play".

Заготовка под биллинг:

Создать functions/src/billing.ts:

пока просто пустые обработчики:

handleStripeWebhook (HTTP endpoint).

handleAppStoreWebhook (на будущее).

внутри — TODO, но структура файлов уже будет.

Логика связи с газом:

В будущем вебхуки будут:

вызывать setSubscriptionTier;

после успешного платежа — applyGasStipend для первого начисления.

⚠️ Сейчас это ничего не блокирует: мобильное приложение считает, что смена подписки происходит “магией” — через Cloud Functions и админку.