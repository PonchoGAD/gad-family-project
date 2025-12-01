// functions/src/cleanupLocations.ts

import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

// Сколько дней хранить историю
const MAX_AGE_DAYS = 30;

export const cleanupLocations = onSchedule(
  {
    schedule: "every 24 hours", // можно изменить при необходимости
    timeZone: "UTC",
  },
  async (event) => {
    const now = new Date();
    const cutoffDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() - MAX_AGE_DAYS
    );

    const cutoffTs = admin.firestore.Timestamp.fromDate(cutoffDate);

    const batchSize = 300;
    let totalDeleted = 0;

    logger.info(
      `[cleanupLocations] Start cleanup. Cutoff = ${cutoffDate.toISOString()}`
    );

    // Цикл батчевого удаления старых точек локаций
    while (true) {
      const snap = await db
        .collectionGroup("points")
        .where("createdAt", "<", cutoffTs)
        .limit(batchSize)
        .get();

      if (snap.empty) {
        break;
      }

      const batch = db.batch();
      snap.docs.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });

      await batch.commit();
      totalDeleted += snap.size;

      logger.info(
        `[cleanupLocations] Deleted batch: ${snap.size}, total: ${totalDeleted}`
      );

      // небольшая пауза, чтобы не душить Firestore (опционально)
      await new Promise((r) => setTimeout(r, 200));
    }

    logger.info(
      `[cleanupLocations] Completed. Total deleted: ${totalDeleted}`
    );
    // ничего не возвращаем → Promise<void>, всё ок для onSchedule
  }
);
