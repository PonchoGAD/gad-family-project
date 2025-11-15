import { setGlobalOptions } from "firebase-functions/v2";
import { familySetOwner, familyGetInfo } from "./family-vault.js";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import * as admin from "firebase-admin";
import { ethers } from "ethers";
export { assistantChat } from "./assistant.js";

import { runDailyDryRun } from "./step-engine.js";
import { US_REGIONS, PUBLIC_TREASURY_CONFIG, TreasuryPublic } from "./config.js";

// ---------- Firebase admin init ----------
if (!admin.apps.length) {
  admin.initializeApp();
}

// ---------- Global options ----------
const REGION = process.env.FUNCTIONS_REGION || "us-east4";
const TZ = process.env.APP_TIMEZONE || "America/New_York"; // US timezone for steps & cron

setGlobalOptions({
  region: REGION,
  maxInstances: 10,
});

// ============================================================================
// GEO PING (имя совпадает с клиентским "geo_ping")
// ============================================================================

export const geo_ping = onCall(async (req) => {
  const uid = req.auth?.uid || "anonymous";

  const { lat, lng, acc } = (req.data || {}) as {
    lat: number;
    lng: number;
    acc: number | null;
  };

  const now = Date.now();
  const db = admin.firestore();

  const lastRef = db.doc(`geo/${uid}/meta/last`);
  const pingRef = db.doc(`geo/${uid}/pings/${now}`);

  await db.runTransaction(async (tx) => {
    tx.set(
      pingRef,
      { lat, lng, acc, ts: now, tz: TZ },
      { merge: true }
    );
    tx.set(
      lastRef,
      { lat, lng, acc, ts: now, tz: TZ },
      { merge: true }
    );
  });

  return { ok: true } as { ok: boolean };
});

// ============================================================================
// STEP ENGINE (daily dry-run of step rewards)
// ============================================================================

// CRON: every day at 23:50 by TZ
export const stepEngineDaily = onSchedule(
  {
    schedule: "50 23 * * *",
    timeZone: TZ,
  },
  async () => {
    const res = await runDailyDryRun(TZ);
    console.log("stepEngineDaily", res);
  }
);

// Manual run via HTTP (GET)
export const stepEngineRunNowHttp = onRequest(async (_req, res) => {
  try {
    const out = await runDailyDryRun(TZ);
    res.setHeader("content-type", "application/json");
    res.status(200).send(JSON.stringify({ ok: true, ...out }));
  } catch (e: any) {
    res.status(500).send({
      ok: false,
      error: e?.message ?? String(e),
    });
  }
});

// Manual run via callable (name matches client "stepEngineRunNow")
export const stepEngineRunNow = onCall(async () => {
  const out = await runDailyDryRun(TZ);
  return { ok: true, ...(out as any) } as {
    ok: boolean;
    processed: number;
    date: string;
  };
});

// ============================================================================
// TREASURY / PAYOUTS / SAFE HELPERS
// (backend only; mobile/web call via callable functions)
// ============================================================================

// Secrets (configure via `firebase functions:secrets:set ...`)
const BSC_RPC_URL = defineSecret("BSC_RPC_URL"); // https RPC
const PAYOUT_PK = defineSecret("PAYOUT_PK"); // private key of Hot Payout Wallet
const GAD_TOKEN_ADDRESS = defineSecret("GAD_TOKEN_ADDRESS"); // token address (dup for safety)
const DISTRIBUTION_SAFE = defineSecret("DISTRIBUTION_SAFE"); // allowance holder (Safe)
const TOKEN_DECIMALS = defineSecret("TOKEN_DECIMALS"); // e.g. "18"
const ADMINS = defineSecret("ADMINS_UID_CSV"); // "uid1,uid2,uid3"

// Common ERC-20 ABI (minimal)
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

function isAdmin(uid?: string | null): boolean {
  if (!uid) return false;
  const csv = ADMINS.value() || "";
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(uid);
}

// Build tranche dates array (YYYY-MM-DD)
function trancheDates(startISO: string, count: number, months: number): string[] {
  const dates: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");

  for (let i = 1; i <= count; i++) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + months * i);
    dates.push(d.toISOString().slice(0, 10));
  }

  return dates;
}

// Calculate next unlock info for UI
function nextUnlockInfo(cfg: TreasuryPublic) {
  const dates = trancheDates(cfg.LOCK_START_ISO, cfg.TRANCHES, cfg.MONTHS_BETWEEN);
  const now = new Date().toISOString().slice(0, 10);
  const next = dates.find((d) => d >= now) || null;
  const index = next ? dates.indexOf(next) : dates.length - 1;
  return { dates, next, index };
}

// ---------- Public endpoint: static treasury config ----------
export const getTreasuryPublic = onCall(
  { region: US_REGIONS },
  async (_req) => {
    return PUBLIC_TREASURY_CONFIG;
  }
);

// ---------- Public endpoint: config + unlock schedule ----------
export const getTreasuryStatus = onCall(
  { region: US_REGIONS },
  async (_req) => {
    const cfg = PUBLIC_TREASURY_CONFIG;
    const schedule = nextUnlockInfo(cfg);
    return { cfg, schedule };
  }
);

// ---------- User payout request: points → GAD ----------
export const requestPayout = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req) => {
    const uid = req.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Auth required");
    }

    const { points, toAddress } = (req.data || {}) as {
      points: number;
      toAddress: string;
    };

    if (!points || !toAddress) {
      throw new HttpsError(
        "invalid-argument",
        "points and toAddress are required"
      );
    }

    const db = admin.firestore();

    const parentRef = db.collection("redemptions").doc(uid);
    const ridRef = parentRef.collection("items").doc();
    const rid = ridRef.id;

    await ridRef.set({
      status: "pending",
      points,
      toAddress: toAddress.toLowerCase(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, rid };
  }
);

// ---------- Weekly batch payout: transferFrom(fromSafe, user, amount) ----------
export const weeklyPayout = onSchedule(
  {
    region: "us-east4",
    schedule: "0 22 * * 5",
    secrets: [BSC_RPC_URL, PAYOUT_PK, GAD_TOKEN_ADDRESS, DISTRIBUTION_SAFE, TOKEN_DECIMALS],
  },
  async () => {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
    const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
    const token = new ethers.Contract(GAD_TOKEN_ADDRESS.value(), ERC20_ABI, signer);

    const db = admin.firestore();

    const snap = await db
      .collectionGroup("items")
      .where("status", "==", "pending")
      .get();

    if (snap.empty) return;

    const decimals =
      Number(TOKEN_DECIMALS.value() || PUBLIC_TREASURY_CONFIG.DECIMALS) || 18;
    const from = DISTRIBUTION_SAFE.value();

    for (const docSnap of snap.docs) {
      const d = docSnap.data() as any;

      try {
        const gad = d.points * 1e-6; // example rate
        const amount = ethers.parseUnits(String(gad), decimals);

        const tx = await token.transferFrom(from, d.toAddress, amount);
        await tx.wait();

        await docSnap.ref.update({
          status: "paid",
          txHash: tx.hash,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e: any) {
        await docSnap.ref.update({
          status: "rejected",
          error: String(e),
        });
      }
    }
  }
);

// ---------- SAFE helper: build approve(spender, amountRaw) calldata ----------
export const buildApproveCalldata = onCall(
  { region: US_REGIONS },
  async (req) => {
    const { spender, amountRaw, decimals } = (req.data || {}) as {
      spender: string;
      amountRaw: string;
      decimals?: number;
    };

    if (!spender || !amountRaw) {
      throw new HttpsError(
        "invalid-argument",
        "spender and amountRaw are required"
      );
    }

    const d = decimals ?? PUBLIC_TREASURY_CONFIG.DECIMALS;
    const iface = new ethers.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData("approve", [
      spender,
      ethers.parseUnits(amountRaw, d),
    ]);

    return {
      to: PUBLIC_TREASURY_CONFIG.TOKEN_ADDRESS,
      value: "0",
      data,
      operation: 0,
    };
  }
);

// ---------- Admin helper: direct approve ----------
export const adminDoApprove = onCall(
  {
    region: US_REGIONS,
    secrets: [BSC_RPC_URL, PAYOUT_PK, GAD_TOKEN_ADDRESS, TOKEN_DECIMALS],
  },
  async (req) => {
    if (!isAdmin(req.auth?.uid)) {
      throw new HttpsError("permission-denied", "Admins only");
    }

    const { spender, amountRaw } = (req.data || {}) as {
      spender: string;
      amountRaw: string;
    };

    if (!spender || !amountRaw) {
      throw new HttpsError(
        "invalid-argument",
        "spender and amountRaw are required"
      );
    }

    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
    const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
    const token = new ethers.Contract(GAD_TOKEN_ADDRESS.value(), ERC20_ABI, signer);

    const dec = Number(TOKEN_DECIMALS.value() || 18);
    const amount = ethers.parseUnits(amountRaw, dec);

    const tx = await token.approve(spender, amount);
    await tx.wait();

    return { ok: true, hash: tx.hash };
  }
);

export { familySetOwner, familyGetInfo };