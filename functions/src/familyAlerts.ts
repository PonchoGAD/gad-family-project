// functions/src/familyAlerts.ts
// -------------------------------------------------------------
// FAMILY ALERTS MODULE
// -------------------------------------------------------------
// Типы событий: 
//  - sos
//  - low_battery
//  - check_in
//  - location_lost
//
// Источник событий (мобильный клиент / helpers):
//  - families/{fid}/alerts/{alertId}
//
// Реакция:
//  - отправка push-уведомлений через sendPushToFamily(...)
//  - логирование в pushLogs (на уровне notifications.ts)
// -------------------------------------------------------------

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { sendPushToFamily } from "./notifications.js";

export const onFamilyAlert = onDocumentCreated(
  "families/{fid}/alerts/{alertId}",
  async (event) => {
    const { fid } = event.params;
    const alert = event.data?.data() as any | undefined;
    if (!alert) return;

    const type: string = alert.type;
    const uid: string | null = alert.uid ?? null;

    logger.info(`[familyAlerts] New alert in family ${fid}`, {
      type,
      uid,
      alertId: event.params.alertId,
    });

    try {
      switch (type) {
        case "sos":
          await sendSOSAlert(fid, uid);
          break;

        case "low_battery":
          await sendLowBatteryAlert(fid, uid, alert.level);
          break;

        case "location_lost":
          await sendLocationLostAlert(fid, uid);
          break;

        case "check_in":
          await sendCheckInAlert(
            fid,
            uid,
            alert.placeName ?? alert.label
          );
          break;

        default:
          logger.warn("[familyAlerts] Unknown alert type:", type);
      }
    } catch (e: any) {
      logger.error("[familyAlerts] Handler error:", {
        type,
        fid,
        uid,
        error: e?.message ?? String(e),
      });
    }
  }
);

// -------------------------------------------------------------
// PUSH HELPERS
// -------------------------------------------------------------
//
// ВАЖНО:
//  - data.pushType строго соответствует enum AlertPushType:
//      "sos" | "low_battery" | "location_lost" | "check_in"
//  - notifications.ts использует эти значения для фильтрации
//    и alertPreferences в families/{fid}/members/{uid}.
// -------------------------------------------------------------

export async function sendSOSAlert(fid: string, uid: string | null) {
  await sendPushToFamily(fid, {
    title: "🚨 SOS ACTIVATED",
    body: `${uid ?? "A family member"} triggered SOS!`,
    data: {
      type: "sos_alert",
      pushType: "sos",
      uid,
    },
  });
}

export async function sendLowBatteryAlert(
  fid: string,
  uid: string | null,
  level: number
) {
  const lvl = typeof level === "number" ? level : 0;

  await sendPushToFamily(fid, {
    title: "Low Battery",
    body: `${uid ?? "A device"} has ${lvl}% battery left.`,
    data: {
      type: "low_battery",
      pushType: "low_battery",
      uid,
      level: lvl,
    },
  });
}

export async function sendLocationLostAlert(
  fid: string,
  uid: string | null
) {
  await sendPushToFamily(fid, {
    title: "Location Lost",
    body: `Location for ${uid ?? "a family member"} is temporarily unavailable.`,
    data: {
      type: "location_lost",
      pushType: "location_lost",
      uid,
    },
  });
}

export async function sendCheckInAlert(
  fid: string,
  uid: string | null,
  placeName?: string
) {
  const placeLabel = placeName || "a place";

  await sendPushToFamily(fid, {
    title: "Check-In Completed",
    body: `${uid ?? "A family member"} checked in at ${placeLabel}.`,
    data: {
      type: "check_in",
      pushType: "check_in",
      uid,
      placeName: placeLabel,
    },
  });
}
