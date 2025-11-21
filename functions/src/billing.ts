// functions/src/billing.ts

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

const db = admin.firestore();

/* -------------------------------------------------------------------------- */
/*                               Helpers                                      */
/* -------------------------------------------------------------------------- */

/**
 * Обновляет подписку пользователя.
 */
async function setUserSubscription(
  uid: string,
  tier: "free" | "basic" | "pro" | "family",
  expiresAt: number | null,
  source: "manual" | "stripe" | "appstore" | "play"
) {
  await db.doc(`users/${uid}`).set(
    {
      subscription: tier,
      subscriptionExpiresAt: expiresAt ? new Date(expiresAt) : null,
      subscriptionSource: source,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Вызывается после успешного платежа → начисление газа (если нужно)
 */
async function applyInitialGasIfNeeded(uid: string, tier: string) {
  // TODO: integrate applyGasStipend() from your subscriptions.ts
  console.log(`[Billing] Gas stipend check for ${uid}, tier=${tier}`);
}

/* -------------------------------------------------------------------------- */
/*                          STRIPE WEBHOOK HANDLER                            */
/* -------------------------------------------------------------------------- */

/**
 * Публичный endpoint для Stripe → https://your-region.cloudfunctions.net/stripeWebhook
 *
 * На этом этапе — только проверка структуры и TODO.
 */
export const stripeWebhook = onRequest(
  { region: "us-central1" },
  async (req, res): Promise<void> => {
    try {
      const event = req.body;

      console.log("Stripe webhook received:", event.type);

      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object;
          const uid = session.client_reference_id;

          if (!uid) {
            console.log("No client_reference_id → ignore");
            break;
          }

          // пример: выбираем тариф из metadata
          const tier = session.metadata?.tier ?? "basic";

          await setUserSubscription(uid, tier, null, "stripe");
          await applyInitialGasIfNeeded(uid, tier);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object;
          const uid = sub.metadata?.uid;

          if (!uid) break;

          await setUserSubscription(uid, "free", null, "stripe");
          break;
        }

        default:
          console.log("Unhandled event:", event.type);
      }

      res.status(200).send("OK");
    } catch (e: any) {
      console.error("Stripe webhook error:", e);
      res.status(500).send("Webhook error");
    }
  }
);

/* -------------------------------------------------------------------------- */
/*                        APP STORE SERVER WEBHOOK                            */
/* -------------------------------------------------------------------------- */

/**
 * Apple App Store Server Notifications V2
 */
export const appStoreWebhook = onRequest(
  { region: "us-central1" },
  async (req, res): Promise<void> => {
    console.log("App Store notification received:", req.body);

    // TODO: Разобрать notificationType, поменять подписку
    // https://developer.apple.com/documentation/appstoreservernotifications

    res.status(200).send("OK");
  }
);

/* -------------------------------------------------------------------------- */
/*                      GOOGLE PLAY REALTIME WEBHOOK                          */
/* -------------------------------------------------------------------------- */

/**
 * Google Play Real-Time Developer Notifications (RTDN)
 */
export const googlePlayWebhook = onRequest(
  { region: "us-central1" },
  async (req, res): Promise<void> => {
    console.log("Google Play RTDN:", req.body);

    // TODO: decode PubSub message → обновить подписку

    res.status(200).send("OK");
  }
);

/* -------------------------------------------------------------------------- */
/*                          Manual Admin Upgrade                              */
/* -------------------------------------------------------------------------- */

/**
 * Админский endpoint — вручную установить подписку пользователю.
 * Будет полезно для тестов.
 */
export const adminSetSubscription = onRequest(
  { region: "us-central1" },
  async (req, res): Promise<void> => {
    const { uid, tier } = req.body ?? {};
    if (!uid || !tier) {
      res.status(400).send("uid & tier are required");
      return;
    }

    await setUserSubscription(uid, tier, null, "manual");
    await applyInitialGasIfNeeded(uid, tier);

    res.status(200).send("OK");
  }
);
