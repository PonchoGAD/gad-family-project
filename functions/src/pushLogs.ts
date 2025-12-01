// functions/src/pushLogs.ts
// -------------------------------------------------------------
// PUSH LOGS MODULE (Proof layer)
// -------------------------------------------------------------
// Коллекция: pushLogs/{pushId}
//
// Поля (минимум):
//  - uid        (optional)
//  - fid        (optional)
//  - token
//  - provider   ("expo" | "fcm" | "unknown")
//  - status     ("success" | "error")
//  - message    (человеческое описание)
//  - errorCode  (если есть)
//  - pushType   (safe_zone / sos / low_battery / step_reward / check_in ...)
//  - meta       (любой JSON)
//  - createdAt  (serverTimestamp)
// -------------------------------------------------------------

import * as admin from "firebase-admin";
import { logger } from "firebase-functions/v2";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

export type PushLogStatus = "success" | "error";

export interface PushLogInput {
  uid?: string | null;
  fid?: string | null;
  token?: string | null;
  provider?: "expo" | "fcm" | "unknown" | null;
  status: PushLogStatus;
  message: string;
  errorCode?: string | null;
  pushType?: string | null;
  meta?: Record<string, any>;
}

export async function logPushEvent(input: PushLogInput): Promise<void> {
  const {
    uid = null,
    fid = null,
    token = null,
    provider = null,
    status,
    message,
    errorCode = null,
    pushType = null,
    meta = {},
  } = input;

  const ref = db.collection("pushLogs").doc();

  await ref.set({
    uid,
    fid,
    token,
    provider,
    status,
    message,
    errorCode,
    pushType,
    meta,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  logger.info("[pushLogs] stored", {
    id: ref.id,
    uid,
    fid,
    status,
    pushType,
  });
}
