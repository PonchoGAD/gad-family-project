import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { ethers } from "ethers";
import { US_REGIONS, PUBLIC_TREASURY_CONFIG, TreasuryPublic } from "./config.js";

admin.initializeApp();

// ====== Secrets (установи через CLI) ======
const BSC_RPC_URL = defineSecret("BSC_RPC_URL");                  // https RPC
const PAYOUT_PK   = defineSecret("PAYOUT_PK");                    // приватный ключ Hot Payout Wallet
const GAD_TOKEN_ADDRESS = defineSecret("GAD_TOKEN_ADDRESS");      // дублируем для надёжности
const DISTRIBUTION_SAFE  = defineSecret("DISTRIBUTION_SAFE");     // адрес holder'a allowance
const TOKEN_DECIMALS     = defineSecret("TOKEN_DECIMALS");        // "18" (строкой)
const ADMINS             = defineSecret("ADMINS_UID_CSV");        // "uid1,uid2"

// ====== Общие утилиты ======
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)"
];

function isAdmin(uid?: string|null) {
  if (!uid) return false;
  const csv = ADMINS.value() || "";
  return csv.split(",").map(s => s.trim()).filter(Boolean).includes(uid);
}

function trancheDates(startISO: string, count: number, months: number) {
  const dates: string[] = [];
  const start = new Date(startISO + "T00:00:00Z");
  for (let i=1;i<=count;i++){
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + months*i);
    dates.push(d.toISOString().slice(0,10));
  }
  return dates;
}

function nextUnlockInfo(cfg: TreasuryPublic) {
  const dates = trancheDates(cfg.LOCK_START_ISO, cfg.TRANCHES, cfg.MONTHS_BETWEEN);
  const now = new Date().toISOString().slice(0,10);
  const next = dates.find(d => d >= now) || null;
  const index = next ? dates.indexOf(next) : dates.length-1;
  return { dates, next, index };
}

// ====== Публичный эндпоинт для сайта/клиента ======
export const getTreasuryPublic = onCall<TreasuryPublic>({ region: US_REGIONS }, async (_req) => {
  return PUBLIC_TREASURY_CONFIG;
});

// Хелпер: публичная витрина (адреса + график + расчёт следующего анлока)
export const getTreasuryStatus = onCall({ region: US_REGIONS }, async (_req) => {
  const cfg = PUBLIC_TREASURY_CONFIG;
  const schedule = nextUnlockInfo(cfg);
  return { cfg, schedule };
});

// ====== Пользовательская заявка на вывод (points -> GAD): как раньше ======
export const requestPayout = onCall({ region: US_REGIONS, enforceAppCheck: true }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Auth required");
  const { points, toAddress } = req.data as { points:number; toAddress: string };
  if (!points || !toAddress) throw new HttpsError("invalid-argument", "points/toAddress required");

  const db = admin.firestore();
  const rid = db.collection("redemptions").doc(uid).collection("").doc().id;
  await db.collection("redemptions").doc(uid).collection("").doc(rid).set({
    status: "pending", points, toAddress: toAddress.toLowerCase(),
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, rid };
});

// ====== Еженедельная батч-выплата через transferFrom (US-тайм) ======
export const weeklyPayout = onSchedule({
  region: "us-east4",
  schedule: "0 22 * * 5", // Пт 22:00 UTC ≈ Пт 18:00 ET летом
  secrets: [BSC_RPC_URL, PAYOUT_PK, GAD_TOKEN_ADDRESS, DISTRIBUTION_SAFE, TOKEN_DECIMALS]
}, async () => {
  const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
  const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
  const token = new ethers.Contract(GAD_TOKEN_ADDRESS.value(), ERC20_ABI, signer);

  const db = admin.firestore();
  const snap = await db.collectionGroup("redemptions").where("status","==","pending").get();
  if (snap.empty) return;

  const decimals = Number(TOKEN_DECIMALS.value() || PUBLIC_TREASURY_CONFIG.DECIMALS);
  const from = DISTRIBUTION_SAFE.value();

  for (const doc of snap.docs) {
    const d = doc.data() as any;
    try {
      // Пример конверсии points -> токены (настрой через Remote Config)
      const gad = d.points * 1e-6;
      const amount = ethers.parseUnits(String(gad), decimals);
      const tx = await token.transferFrom(from, d.toAddress, amount);
      await tx.wait();
      await doc.ref.update({
        status: "paid",
        txHash: tx.hash,
        paidAt: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e:any) {
      await doc.ref.update({ status: "rejected", error: String(e) });
    }
  }
});

// ====== Генератор calldata для SAFE: approve(spender, amount) ======
export const buildApproveCalldata = onCall(
  { region: US_REGIONS },
  async (req) => {
    // доступен всем: просто конструктор «шаблона транзакции» для SAFE
    const { spender, amountRaw, decimals } = req.data as { spender: string; amountRaw: string; decimals?: number };
    if (!spender || !amountRaw) throw new HttpsError("invalid-argument","spender/amountRaw required");
    const d = decimals ?? PUBLIC_TREASURY_CONFIG.DECIMALS;
    const iface = new ethers.Interface(ERC20_ABI);
    const data = iface.encodeFunctionData("approve", [spender, ethers.parseUnits(amountRaw, d)]);
    return {
      to: PUBLIC_TREASURY_CONFIG.TOKEN_ADDRESS,
      value: "0",
      data,
      operation: 0
    };
  }
);

// ====== Admin-хэлпер (только для uid из секретов) — тестовое прямое approve (если Distribution SAFE не мультисиг) ======
export const adminDoApprove = onCall(
  { region: US_REGIONS, secrets: [BSC_RPC_URL, PAYOUT_PK, GAD_TOKEN_ADDRESS, TOKEN_DECIMALS] },
  async (req) => {
    if (!isAdmin(req.auth?.uid)) throw new HttpsError("permission-denied","Admins only");
    const { spender, amountRaw } = req.data as { spender: string; amountRaw: string };
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
    const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
    const token = new ethers.Contract(GAD_TOKEN_ADDRESS.value(), ERC20_ABI, signer);
    const tx = await token.approve(spender, ethers.parseUnits(amountRaw, Number(TOKEN_DECIMALS.value() || 18)));
    await tx.wait();
    return { ok: true, hash: tx.hash };
  }
);
