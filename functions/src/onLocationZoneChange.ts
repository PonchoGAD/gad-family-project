// functions/src/onLocationZoneChange.ts

import * as admin from "firebase-admin";
import { onDocumentWritten } from "firebase-functions/v2/firestore";

// Важно: admin.initializeApp() должен быть вызван ОДИН раз в проекте,
// как правило в functions/src/index.ts. Здесь предполагаем, что он уже есть.

const db = admin.firestore();

// Минимальный интервал между алертами для одного uid (5 минут)
const MIN_ALERT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Cloud Function (V2):
 * Реагирует на изменения:
 *   locations/{uid}/current/state
 *
 * Сценарий:
 *  - если zoneStatus меняется с "inside" → "outside"
 *    → находим семью ребёнка, родителей, их pushToken
 *    → шлём FCM-пуш "Child left safe zone"
 *    → ставим пользователю users/{uid}.lastSafeZoneAlertAt = now
 *      (антиспам: не чаще одного раза в 5 минут).
 */
export const onLocationZoneChange = onDocumentWritten(
  "locations/{uid}/current/state",
  async (event) => {
    const uid = event.params.uid as string;

    const beforeSnap = event.data?.before;
    const afterSnap = event.data?.after;

    const before = beforeSnap && beforeSnap.exists ? beforeSnap.data() : null;
    const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;

    // Если документ удалили или ещё нет данных — выходим
    if (!after) {
      return;
    }

    const beforeZone: string | undefined = (before as any)?.zoneStatus;
    const afterZone: string | undefined = (after as any)?.zoneStatus;

    // Нас интересует только переход inside → outside
    if (!(beforeZone === "inside" && afterZone === "outside")) {
      return;
    }

    // ----------------------------------------------------------------------
    // Антиспам: не чаще 1 раза в 5 минут на одного uid
    // ----------------------------------------------------------------------
    try {
      const userRef = db.collection("users").doc(uid);
      const userSnap = await userRef.get();

      if (!userSnap.exists) {
        // Нет юзера — просто выходим без алерта
        console.log(
          "[onLocationZoneChange] user not found, uid=",
          uid
        );
        return;
      }

      const userData = userSnap.data() || {};
      const lastAlertTs = (userData as any).lastSafeZoneAlertAt;

      const now = admin.firestore.Timestamp.now();

      if (lastAlertTs && typeof lastAlertTs.toMillis === "function") {
        const lastMs = lastAlertTs.toMillis();
        const nowMs = now.toMillis();

        if (nowMs - lastMs < MIN_ALERT_INTERVAL_MS) {
          console.log(
            "[onLocationZoneChange] skip (anti-spam), uid=",
            uid
          );
          return;
        }
      }

      // ------------------------------------------------------------------
      // Определяем семью пользователя
      // ------------------------------------------------------------------
      const familyId: string | null =
        typeof (userData as any).familyId === "string"
          ? (userData as any).familyId
          : null;

      if (!familyId) {
        console.log(
          "[onLocationZoneChange] no familyId for uid=",
          uid
        );
        return;
      }

      // ------------------------------------------------------------------
      // Ищем родителей / владельцев семьи
      // families/{fid}/members/{memberUid} с role in ["parent", "owner"]
      // ------------------------------------------------------------------
      const membersRef = db
        .collection("families")
        .doc(familyId)
        .collection("members");

      const parentsSnap = await membersRef
        .where("role", "in", ["parent", "owner"])
        .get();

      if (parentsSnap.empty) {
        console.log(
          "[onLocationZoneChange] no parents/owners found for familyId=",
          familyId
        );
        return;
      }

      const parentUids: string[] = [];
      parentsSnap.forEach((docSnap) => {
        parentUids.push(docSnap.id);
      });

      if (parentUids.length === 0) {
        return;
      }

      // ------------------------------------------------------------------
      // Читаем pushToken каждого родителя
      // Предполагаем: users/{parentUid}.pushToken: string | string[]
      // ------------------------------------------------------------------
      const parentDocs = await db
        .getAll(
          ...parentUids.map((pUid) =>
            db.collection("users").doc(pUid)
          )
        )
        .catch((err) => {
          console.error(
            "[onLocationZoneChange] getAll parents error",
            err
          );
          return [] as FirebaseFirestore.DocumentSnapshot[];
        });

      const tokens: string[] = [];

      parentDocs.forEach((pSnap) => {
        if (!pSnap.exists) return;
        const pdata = pSnap.data() || {};
        const t = (pdata as any).pushToken;

        if (typeof t === "string" && t.trim().length > 0) {
          tokens.push(t.trim());
        } else if (Array.isArray(t)) {
          t.forEach((tok: any) => {
            if (typeof tok === "string" && tok.trim().length > 0) {
              tokens.push(tok.trim());
            }
          });
        }
      });

      if (tokens.length === 0) {
        console.log(
          "[onLocationZoneChange] no pushTokens for parents/owners, familyId=",
          familyId
        );
        return;
      }

      // ------------------------------------------------------------------
      // Формируем и отправляем FCM-уведомление
      // ------------------------------------------------------------------
      const title = "Safe Zone Alert";
      const body = "Your child left the safe zone.";

      const message: admin.messaging.MulticastMessage = {
        tokens,
        notification: {
          title,
          body,
        },
        data: {
          type: "safe-zone-exit",
          childUid: uid,
          familyId,
          zoneStatusBefore: beforeZone || "",
          zoneStatusAfter: afterZone || "",
        },
      };

      const result = await admin.messaging().sendMulticast(message);

      console.log(
        "[onLocationZoneChange] sent Safe Zone alert",
        "uid=",
        uid,
        "familyId=",
        familyId,
        "tokens=",
        tokens.length,
        "success=",
        result.successCount,
        "failure=",
        result.failureCount
      );

      // ------------------------------------------------------------------
      // Обновляем lastSafeZoneAlertAt
      // ------------------------------------------------------------------
      await userRef.set(
        {
          lastSafeZoneAlertAt: now,
        },
        { merge: true }
      );
    } catch (err) {
      console.error("[onLocationZoneChange] error", err);
      return;
    }
  }
);
