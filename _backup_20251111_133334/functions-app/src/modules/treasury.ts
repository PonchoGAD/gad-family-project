import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { ethers } from "ethers";
import { US_REGIONS, PUBLIC_TREASURY_CONFIG, TreasuryPublic } from "../config";

/** Secrets */
const BSC_RPC_URL = defineSecret("BSC_RPC_URL");
const PAYOUT_PK = defineSecret("PAYOUT_PK");
const GAD_TOKEN_ADDRESS = defineSecret("GAD_TOKEN_ADDRESS");
const DISTRIBUTION_SAFE = defineSecret("DISTRIBUTION_SAFE");
const TOKEN_DECIMALS = defineSecret("TOKEN_DECIMALS");

/** Minimal ERC20 ABI */
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) returns (bool)",
];

/** 1) Публичная конфигурация трежери */
export const getTreasuryPublic = onCall<TreasuryPublic>(
  { region: US_REGIONS },
  async () => {
    return PUBLIC_TREASURY_CONFIG;
  },
);

/** 2) Запрос на выплату (создание заявки) */
export const requestPayout = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    const { points, toAddress } = req.data as { points: number; toAddress: string };
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    if (!points || !toAddress)
      throw new HttpsError("invalid-argument", "points/toAddress required");

    const db = admin.firestore();
    const rid = db.collection("redemptions").doc(uid).collection("").doc().id;
    await db.collection("redemptions").doc(uid).collection("").doc(rid).set({
      status: "pending",
      points,
      toAddress: toAddress.toLowerCase(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { ok: true, rid };
  },
);

/** 3) Еженедельная обработка выплат (пятница 22:00 UTC) */
export const weeklyPayout = onSchedule(
  {
    region: "us-east1",
    schedule: "0 22 * * 5",
    secrets: [BSC_RPC_URL, PAYOUT_PK, GAD_TOKEN_ADDRESS, DISTRIBUTION_SAFE, TOKEN_DECIMALS],
  },
  async () => {
    const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
    const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
    const token = new ethers.Contract(GAD_TOKEN_ADDRESS.value(), ERC20_ABI, signer);

    const decimals = Number(TOKEN_DECIMALS.value() || PUBLIC_TREASURY_CONFIG.DECIMALS);
    const from = DISTRIBUTION_SAFE.value();

    const db = admin.firestore();
    const q = await db.collectionGroup("redemptions").where("status", "==", "pending").get();
    if (q.empty) return;

    for (const doc of q.docs) {
      const d = doc.data() as any;
      try {
        const gad = d.points * 1e-6; // points -> GAD (как в исходнике)
        const amount = ethers.parseUnits(String(gad), decimals);
        const tx = await token.transferFrom(from, d.toAddress, amount);
        await tx.wait();
        await doc.ref.update({
          status: "paid",
          txHash: tx.hash,
          paidAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      } catch (e) {
        await doc.ref.update({ status: "rejected", error: String(e) });
      }
    }
  },
);

/** 4) Кодировка calldata approve(spender, amount) */
export const buildApproveCalldata = onCall(
  { region: US_REGIONS },
  async (req: any) => {
    const { spender, amountRaw, decimals } = req.data as {
      spender: string;
      amountRaw: string;
      decimals?: number;
    };
    if (!spender || !amountRaw)
      throw new HttpsError("invalid-argument", "spender/amountRaw required");

    const d = decimals ?? PUBLIC_TREASURY_CONFIG.DECIMALS;
    const iface = new ethers.Interface(["function approve(address spender, uint256 amount)"]);
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
  },
);
