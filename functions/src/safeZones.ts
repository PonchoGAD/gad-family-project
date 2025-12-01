// functions/src/safeZones.ts
// -------------------------------------------------------------
// SAFE ZONES PUSH MODULE
// -------------------------------------------------------------
// Ловим события из families/{fid}/geoEvents/{eventId}
// и отправляем пуши семье: вход, выход, предупреждение.
//
// Стандартные pushType для alertPreferences / логов:
//  - "safe_zone_enter"
//  - "safe_zone_exit"
//  - "safe_zone_warning"
// -------------------------------------------------------------

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { sendPushToFamily } from "./notifications.js";

export const onSafeZoneEvent = onDocumentCreated(
  "families/{fid}/geoEvents/{eventId}",
  async (event) => {
    const { fid } = event.params;
    const ev = event.data?.data();

    if (!ev) return;

    const type = ev.type;
    const zoneName = ev.zoneName ?? "Safe Zone";
    const uid = ev.uid ?? null;

    logger.info(`[safeZones] Event in family ${fid}:`, ev);

    // ---------------------------
    // Типы событий
    // ---------------------------
    switch (type) {
      case "enter":
        await sendEnterZoneAlert(fid, uid, zoneName);
        break;

      case "exit":
        await sendExitZoneAlert(fid, uid, zoneName);
        break;

      case "warning":
        await sendZoneWarning(
          fid,
          uid,
          ev.reason ?? "Zone warning"
        );
        break;

      default:
        logger.warn("[safeZones] Unknown event type:", type);
    }
  }
);

// -------------------------------------------------------------
// PUSH HELPERS
// -------------------------------------------------------------
export async function sendEnterZoneAlert(
  fid: string,
  uid: string | null,
  zone: string
) {
  await sendPushToFamily(fid, {
    title: "Safe Zone: Entered",
    body: `${uid ?? "A family member"} entered ${zone}`,
    data: {
      type: "safe_zone_enter",
      pushType: "safe_zone_enter",
      zone,
      uid,
    },
  });
}

export async function sendExitZoneAlert(
  fid: string,
  uid: string | null,
  zone: string
) {
  await sendPushToFamily(fid, {
    title: "Safe Zone: Exited",
    body: `${uid ?? "A family member"} left ${zone}`,
    data: {
      type: "safe_zone_exit",
      pushType: "safe_zone_exit",
      zone,
      uid,
    },
  });
}

export async function sendZoneWarning(
  fid: string,
  uid: string | null,
  reason: string
) {
  await sendPushToFamily(fid, {
    title: "Safety Warning",
    body: reason,
    data: {
      type: "safe_zone_warning",
      pushType: "safe_zone_warning",
      uid,
      reason,
    },
  });
}
