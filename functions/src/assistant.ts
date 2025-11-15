// functions/src/assistant.ts
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";

const GAD_AI_ENDPOINT = process.env.GAD_AI_ENDPOINT || "";

type Role = "user" | "assistant";

export const assistantChat = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) {
    throw new HttpsError("unauthenticated", "Auth required");
  }

  const { message } = (req.data || {}) as { message?: string };
  if (!message || typeof message !== "string") {
    throw new HttpsError("invalid-argument", "message is required");
  }

  const db = admin.firestore();
  const now = Date.now();

  // 1) Save user message
  const userMsgRef = db
    .collection("messages_private")
    .doc(uid)
    .collection("assistant")
    .doc();

  await userMsgRef.set({
    role: "user" as Role,
    content: message,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ts: now,
  });

  // 2) Call GAD-AI / OpenAI (stub for now)
  let replyText =
    "Hi! I'm your GAD assistant. AI backend is not configured yet.";

  if (GAD_AI_ENDPOINT) {
    try {
      const res = await fetch(GAD_AI_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          uid,
          message,
          // optionally: history
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as any;
        if (typeof data.reply === "string" && data.reply.trim()) {
          replyText = data.reply.trim();
        }
      } else {
        console.error("GAD_AI_ENDPOINT error", await res.text());
      }
    } catch (e) {
      console.error("GAD_AI_ENDPOINT fetch error", e);
    }
  }

  // 3) Save assistant reply
  const botMsgRef = db
    .collection("messages_private")
    .doc(uid)
    .collection("assistant")
    .doc();

  await botMsgRef.set({
    role: "assistant" as Role,
    content: replyText,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    ts: now + 1,
  });

  // 4) USAGE SCORE + bonuses
  const usageRef = db
    .collection("users")
    .doc(uid)
    .collection("usage")
    .doc("assistant");

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(usageRef);

    // гарантируем, что у нас всегда есть объект с score
    const cur = (snap.exists ? (snap.data() as any) : { score: 0 }) as {
      score?: number;
    };

    const score = (cur.score ?? 0) + 1;

    tx.set(
      usageRef,
      {
        score,
        lastBonusAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    // ---- BONUSES ----
    if (score === 10) {
      // +1000 GAD Points
      tx.set(
        db.collection("balances").doc(uid),
        { pointsTotal: admin.firestore.FieldValue.increment(1000) },
        { merge: true }
      );
    }

    if (score === 50) {
      // NFT badge
      tx.set(
        db.collection("users").doc(uid).collection("nftBadges").doc("ai_explorer"),
        { earnedAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true }
      );
    }

    if (score === 200) {
      // Boost
      tx.set(
        db.collection("boosts").doc(uid),
        {
          type: "ai_master",
          multiplier: 2.0,
          expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        },
        { merge: true }
      );
    }
  });

  return { ok: true, reply: replyText };
});
