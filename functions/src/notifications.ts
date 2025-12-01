// functions/src/notifications.ts
import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";
import { onCall } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logPushEvent } from "./pushLogs.js";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

/* -------------------------------------------------------------
   UTIL: Нормализация пуш-токенов
------------------------------------------------------------- */
function normalizeToken(token: string): "expo" | "fcm" | null {
  if (!token) return null;

  if (token.startsWith("ExponentPushToken[")) return "expo";
  if (token.length > 100) return "fcm";

  return null;
}

type PushContext = {
  uid?: string | null;
  fid?: string | null;
  pushType?: string | null;
};

/* -------------------------------------------------------------
   SEND: Отправить пуш на один конкретный токен
------------------------------------------------------------- */
async function sendPushToToken(
  token: string,
  payload: any,
  ctx?: PushContext
) {
  const providerNorm = normalizeToken(token);
  const provider: "expo" | "fcm" | "unknown" =
    providerNorm === "expo" || providerNorm === "fcm"
      ? providerNorm
      : "unknown";

  const pushType: string | null =
    ctx?.pushType ?? (payload?.data?.pushType ?? null);

  try {
    // 🔹 Expo token
    if (provider === "expo") {
      logger.info("[push] Expo token detected:", token);

      const res = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: token,
          sound: "default",
          title: payload.title,
          body: payload.body,
          data: payload.data ?? {},
        }),
      });

      const json = await res.json();
      logger.info("[push] Expo response:", json);

      await logPushEvent({
        uid: ctx?.uid ?? null,
        fid: ctx?.fid ?? null,
        token,
        provider: "expo",
        status: "success",
        message: payload?.title ?? "Expo push",
        errorCode: null,
        pushType,
        meta: {
          providerResponse: json,
          data: payload?.data ?? null,
        },
      });

      return { ok: true };
    }

    // 🔹 FCM token
    if (provider === "fcm") {
      logger.info("[push] FCM token detected:", token);

      await admin.messaging().send({
        token,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data ?? {},
      });

      await logPushEvent({
        uid: ctx?.uid ?? null,
        fid: ctx?.fid ?? null,
        token,
        provider: "fcm",
        status: "success",
        message: payload?.title ?? "FCM push",
        errorCode: null,
        pushType,
        meta: {
          data: payload?.data ?? null,
        },
      });

      return { ok: true };
    }

    // Неизвестный формат токена
    logger.warn("[push] Unknown token format:", token);

    await logPushEvent({
      uid: ctx?.uid ?? null,
      fid: ctx?.fid ?? null,
      token,
      provider: "unknown",
      status: "error",
      message: "Unknown token format",
      errorCode: "unknown-format",
      pushType,
      meta: {
        data: payload?.data ?? null,
      },
    });

    return { ok: false, error: "unknown-format" };
  } catch (err: any) {
    logger.error("[push] send error:", err);

    const msg = err?.errorInfo?.message || err?.message || String(err);

    const mustDelete =
      msg.includes("InvalidRegistration") ||
      msg.includes("NotRegistered") ||
      (msg.includes("expo") && msg.includes("DeviceNotRegistered"));

    await logPushEvent({
      uid: ctx?.uid ?? null,
      fid: ctx?.fid ?? null,
      token,
      provider,
      status: "error",
      message: payload?.title ?? "Push send error",
      errorCode: msg,
      pushType,
      meta: {
        errorRaw: msg,
      },
    });

    return { ok: false, error: msg, delete: mustDelete };
  }
}

/* -------------------------------------------------------------
   CORE: Отправить пуш пользователю по uid
------------------------------------------------------------- */
export async function sendPushToUser(
  uid: string,
  payload: {
    title: string;
    body: string;
    data?: any;
  }
) {
  const uRef = db.collection("users").doc(uid);
  const snap = await uRef.get();

  // user не найден
  if (!snap.exists) {
    logger.warn("[push] user not found:", uid);

    await logPushEvent({
      uid,
      fid: null,
      token: null,
      provider: "unknown",
      status: "error",
      message: "User not found for push",
      errorCode: "user_not_found",
      pushType: payload?.data?.pushType ?? null,
      meta: {},
    });

    return;
  }

  const user = snap.data() as any;

  const token = user.pushToken;
  const fid = (user.familyId as string | undefined) ?? null;

  // нет токена
  if (!token) {
    logger.warn("[push] no pushToken for uid:", uid);

    await logPushEvent({
      uid,
      fid,
      token: null,
      provider: "unknown",
      status: "error",
      message: "No pushToken for user",
      errorCode: "no_push_token",
      pushType: payload?.data?.pushType ?? null,
      meta: {},
    });

    return;
  }

  const res = await sendPushToToken(token, payload, {
    uid,
    fid,
    pushType: payload?.data?.pushType ?? null,
  });

  if ((res as any).delete) {
    logger.warn("[push] deleting invalid token for uid:", uid);
    await uRef.update({ pushToken: admin.firestore.FieldValue.delete() });
  }
}

/* -------------------------------------------------------------
   ALERT FILTER: решаем, слать ли пуш члену семьи
------------------------------------------------------------- */

type MemberAlertPreferences = Record<string, any> | undefined;

function shouldSendAlertToMember(options: {
  role?: string | null;
  alertPreferences?: MemberAlertPreferences;
  pushType?: string | null;
}): boolean {
  const role = (options.role ?? "").toLowerCase();
  const prefs = options.alertPreferences;
  const pushType = options.pushType ?? null;

  // Нет типа и нет настроек — стандартное поведение: шлём как раньше
  if (!pushType && !prefs) return true;

  // SOS и low_battery — только родителям / владельцу по умолчанию
  if (pushType === "sos" || pushType === "low_battery") {
    const isParentOrOwner = role === "parent" || role === "owner";

    // если явно отключено в prefs → не слать даже родителям
    if (prefs && Object.prototype.hasOwnProperty.call(prefs, pushType)) {
      const val = prefs[pushType];
      if (val === false) return false;
    }

    return isParentOrOwner;
  }

  // Для остальных типов: если есть prefs и конкретный тип отключён → не слать
  if (pushType && prefs) {
    if (Object.prototype.hasOwnProperty.call(prefs, pushType)) {
      const val = prefs[pushType];
      if (val === false) return false;
    }
  }

  // По умолчанию — слать
  return true;
}

/* -------------------------------------------------------------
   FAMILY: Отправить пуш ВСЕЙ семье (с фильтрацией по роли/настройкам)
------------------------------------------------------------- */
export async function sendPushToFamily(
  fid: string,
  payload: {
    title: string;
    body: string;
    data?: any;
  }
) {
  const membersRef = db.collection("families").doc(fid).collection("members");
  const members = await membersRef.get();

  const pushType: string | null = payload?.data?.pushType ?? null;

  logger.info(
    `[push] Sending to family ${fid}, members ${members.size}, pushType=${pushType}`
  );

  // Логируем сам факт family-push (агрегированный уровень)
  await logPushEvent({
    uid: null,
    fid,
    token: null,
    provider: "unknown",
    status: "success",
    message: "Family push started",
    errorCode: null,
    pushType,
    meta: {
      membersCount: members.size,
    },
  });

  for (const docSnap of members.docs) {
    const uid = docSnap.id;
    const m = docSnap.data() as any;
    const role = (m.role as string | undefined) ?? null;
    const alertPreferences =
      (m.alertPreferences as Record<string, any> | undefined) ?? undefined;

    const allowed = shouldSendAlertToMember({
      role,
      alertPreferences,
      pushType,
    });

    if (!allowed) {
      // Логируем факт фильтрации этого участника
      await logPushEvent({
        uid,
        fid,
        token: null,
        provider: "unknown",
        status: "success",
        message: "Family push skipped by filter",
        errorCode: null,
        pushType,
        meta: {
          role,
          reason: "filtered_by_role_or_prefs",
        },
      });
      continue;
    }

    await sendPushToUser(uid, {
      ...payload,
      data: {
        ...(payload.data ?? {}),
        // подсветим, что пуш семейный
        familyId: fid,
      },
    });
  }
}

/* -------------------------------------------------------------
   Firestore Trigger (пример):
   safe zones → пуш родителям
------------------------------------------------------------- */
export const onSafeZoneEvent = onDocumentCreated(
  "families/{fid}/geoEvents/{eventId}",
  async (event) => {
    const { fid } = event.params;
    const ev = event.data?.data();

    if (!ev) return;

    await sendPushToFamily(fid, {
      title: "Safe Zone Update",
      body: ev.message ?? "Location update",
      data: {
        type: "geo_event",
        pushType: "safe_zone",
        ...ev,
      },
    });
  }
);

/* -------------------------------------------------------------
   Callable API (по запросу клиента)
------------------------------------------------------------- */
export const pushToUser = onCall(async (req) => {
  const { uid, title, body, data } = req.data;
  await sendPushToUser(uid, { title, body, data });
  return { ok: true };
});

export const pushToFamily = onCall(async (req) => {
  const { fid, title, body, data } = req.data;
  await sendPushToFamily(fid, { title, body, data });
  return { ok: true };
});
