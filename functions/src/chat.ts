// functions/src/chat.ts

import * as admin from "firebase-admin";
import { onCall } from "firebase-functions/v2/https";

export const notifyNewChatMessage = onCall(async (req) => {
  const { fid, chatId, text } = req.data || {};
  const uid = req.auth?.uid;

  if (!uid) {
    return { ok: false, error: "auth required" };
  }

  console.log("New chat message", { fid, chatId, text });

  // Позже здесь будет:
  // 1. получение expoTokens пользователей чата
  // 2. рассылка через FCM/Expo

  return { ok: true };
});
