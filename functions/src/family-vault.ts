// functions/src/family-vault.ts
import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { FamilyDoc, FamilyVaultEntry } from "./types.js";

const db = admin.firestore();
const REGION = process.env.FUNCTIONS_REGION || "us-east4";

/**
 * familySetOwner
 * Устанавливает / подтверждает владельца семьи.
 *
 * data: { familyId: string }
 */
export const familySetOwner = onCall(
  { region: REGION },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const familyId = (req.data?.familyId as string | undefined) || null;
    if (!familyId) {
      throw new HttpsError("invalid-argument", "familyId is required");
    }

    const famRef = db.doc(`families/${familyId}`);
    const famSnap = await famRef.get();
    if (!famSnap.exists) {
      throw new HttpsError("not-found", "Family not found");
    }

    const fam = famSnap.data() as FamilyDoc;

    // Проверяем, что пользователь — член семьи
    const memberSnap = await db
      .doc(`families/${familyId}/members/${uid}`)
      .get();

    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this family"
      );
    }

    // Если ownerUid ещё не установлен → любой член семьи может забрать владение
    if (!fam.ownerUid) {
      await famRef.set({ ownerUid: uid }, { merge: true });
      return { ok: true, ownerUid: uid, mode: "claimedEmptyOwner" };
    }

    // Если ownerUid уже есть → менять может только текущий владелец
    if (fam.ownerUid !== uid) {
      throw new HttpsError(
        "permission-denied",
        "Only current owner can change ownerUid"
      );
    }

    // Пока просто подтверждаем, что этот пользователь — владелец
    await famRef.set({ ownerUid: uid }, { merge: true });

    return { ok: true, ownerUid: uid, mode: "confirmedOwner" };
  }
);

/**
 * familyGetInfo
 * Возвращает агрегированную информацию по семье:
 * - families/{fid}
 * - families/{fid}/vault
 * - summary по families/{fid}/ledger
 *
 * data: { familyId?: string }
 * если familyId не передан → берём из users/{uid}.familyId
 */
export const familyGetInfo = onCall(
  { region: REGION },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    let familyId = req.data?.familyId as string | undefined;

    if (!familyId) {
      const userSnap = await db.doc(`users/${uid}`).get();
      familyId = (userSnap.data() as any)?.familyId ?? null;
    }

    if (!familyId) {
      throw new HttpsError(
        "failed-precondition",
        "User is not linked to a family"
      );
    }

    // Проверяем, что пользователь — член семьи
    const memberSnap = await db
      .doc(`families/${familyId}/members/${uid}`)
      .get();

    if (!memberSnap.exists) {
      throw new HttpsError(
        "permission-denied",
        "You are not a member of this family"
      );
    }

    const famRef = db.doc(`families/${familyId}`);
    const famSnap = await famRef.get();
    if (!famSnap.exists) {
      throw new HttpsError("not-found", "Family not found");
    }

    const family = famSnap.data() as FamilyDoc;

    // Vault
    const vaultRef = db.doc(`families/${familyId}/vault`);
    const vaultSnap = await vaultRef.get();
    const vault = (vaultSnap.exists
      ? (vaultSnap.data() as FamilyVaultEntry)
      : null) as FamilyVaultEntry | null;

    // Простейший summary по ledger
    const ledgerColl = db.collection(`families/${familyId}/ledger`);
    const ledgerSnap = await ledgerColl.limit(50).get();

    let totalEntries = 0;
    let totalPoints = 0;

    ledgerSnap.forEach((d) => {
      totalEntries += 1;
      const pts = (d.data()?.points ?? 0) as number;
      totalPoints += pts;
    });

    const ledgerSummary = {
      totalEntries,
      totalPoints,
      sampled: ledgerSnap.size,
    };

    return {
      ok: true,
      familyId,
      family,
      vault,
      ledgerSummary,
    };
  }
);
