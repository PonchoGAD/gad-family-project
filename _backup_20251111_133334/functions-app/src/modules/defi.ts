import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { defineSecret } from "firebase-functions/params";
import { ethers } from "ethers";
import { US_REGIONS } from "../config";

/** === secrets === */
const ALLOW_ONCHAIN_EXECUTION = defineSecret("ALLOW_ONCHAIN_EXECUTION");
const PANCAKE_ROUTER_ADDRESS = defineSecret("PANCAKE_ROUTER_ADDRESS");
const WBNB_ADDRESS = defineSecret("WBNB_ADDRESS");
const USDT_ADDRESS = defineSecret("USDT_ADDRESS");
const GT_ADDRESS = defineSecret("GT_ADDRESS");
const NFT_MINT_CONTRACT = defineSecret("NFT_MINT_CONTRACT");
const PRICE_MAP_USD = defineSecret("PRICE_MAP_USD");
const BSC_RPC_URL = defineSecret("BSC_RPC_URL");
const PAYOUT_PK = defineSecret("PAYOUT_PK");
const GAD_TOKEN_ADDRESS = defineSecret("GAD_TOKEN_ADDRESS");
const TOKEN_DECIMALS = defineSecret("TOKEN_DECIMALS");

/** === helpers shared inside defi === */
async function getMember(ctxUid: string) {
  const db = admin.firestore();
  const u = await db.collection("users").doc(ctxUid).get();
  const fid = u.data()?.familyId as string | undefined;
  if (!fid) throw new HttpsError("failed-precondition", "Join family first");
  const mRef = db
    .collection("families")
    .doc(fid)
    .collection("members")
    .doc(ctxUid);
  const mDoc = await mRef.get();
  return { db, fid, mRef, member: mDoc.data() || {} };
}

function parsePriceMap(jsonOrEmpty?: string) {
  try {
    return jsonOrEmpty ? JSON.parse(jsonOrEmpty) : {};
  } catch {
    return {};
  }
}

async function requireApprovalIfMinorOrLimit(
  db: FirebaseFirestore.Firestore,
  fid: string,
  uid: string,
  estUsd: number,
  payload: any,
  type: "NFT" | "SWAP" | "LP" | "STAKE",
) {
  const fam = await db.collection("families").doc(fid).get();
  const ownerUid = fam.data()?.ownerUid as string | undefined;

  const m = await db
    .collection("families")
    .doc(fid)
    .collection("members")
    .doc(uid)
    .get();
  const age = m.data()?.age ?? 0;

  const teen = age >= 14 && age < 18;
  const limit = m.data()?.spendingLimitUSD ?? 0;

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  const ledgerQ = await db
    .collection("users")
    .doc(uid)
    .collection("portfolioLedger")
    .where("at", ">=", start)
    .get();
  let spentToday = 0;
  ledgerQ.forEach((d) => {
    if (d.data().kind === "SPENT_USD") spentToday += d.data().amountUSD || 0;
  });

  const needApproval =
    age < 14 || (teen && limit > 0 && spentToday + estUsd > limit);

  if (needApproval) {
    const aRef = await db
      .collection("families")
      .doc(fid)
      .collection("approvals")
      .add({
        type,
        payload,
        uid,
        status: "pending",
        at: admin.firestore.FieldValue.serverTimestamp(),
      });
    return { needApproval: true, approvalId: aRef.id, ownerUid };
  }
  return { needApproval: false, approvalId: null, ownerUid };
}

async function pushTo(
  tokens: string[],
  title: string,
  body: string,
  data: any = {},
) {
  if (!tokens?.length) return;
  try {
    await admin
      .messaging()
      .sendEachForMulticast({ tokens, notification: { title, body }, data });
  } catch (e) {
    console.error("pushTo error:", e);
  }
}

/** === 1) NFT: requestBuyNft === */
export const requestBuyNft = onCall(
  {
    region: US_REGIONS,
    enforceAppCheck: true,
    secrets: [
      PRICE_MAP_USD,
      ALLOW_ONCHAIN_EXECUTION,
      NFT_MINT_CONTRACT,
      BSC_RPC_URL,
      PAYOUT_PK,
    ],
  },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { collection, tokenURI, priceAmount, priceCurrency } = req.data as {
      collection: string;
      tokenURI: string;
      priceAmount: number;
      priceCurrency: "GAD" | "BNB" | "USDT" | "GT";
    };
    if (!collection || !tokenURI || !priceAmount || !priceCurrency) {
      throw new HttpsError(
        "invalid-argument",
        "collection/tokenURI/price required",
      );
    }

    const { db, fid } = await getMember(uid);
    const priceMap = parsePriceMap(PRICE_MAP_USD.value());
    const usd = (priceMap[priceCurrency] ?? 0) * priceAmount;

    const appr = await requireApprovalIfMinorOrLimit(
      db,
      fid,
      uid,
      usd,
      { collection, tokenURI, priceAmount, priceCurrency },
      "NFT",
    );

    const orderRef = db
      .collection("users")
      .doc(uid)
      .collection("portfolioLedger")
      .doc();
    await orderRef.set({
      kind: "NFT_ORDER",
      status: appr.needApproval ? "awaiting_approval" : "approved",
      collection,
      tokenURI,
      priceAmount,
      priceCurrency,
      amountUSD: usd,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const allow =
      (ALLOW_ONCHAIN_EXECUTION.value() || "false").toLowerCase() === "true";
    const mintAddr = NFT_MINT_CONTRACT.value();
    if (allow && mintAddr && !appr.needApproval) {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
      const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
      const erc721 = new ethers.Contract(
        mintAddr,
        ["function safeMint(address to,string uri)"],
        signer,
      );
      try {
        const tx = await erc721.safeMint(signer.address, tokenURI);
        await tx.wait();
        await db
          .collection("users")
          .doc(uid)
          .collection("nftOwnerships")
          .doc(tx.hash)
          .set({
            collection,
            tokenURI,
            txHash: tx.hash,
            at: admin.firestore.FieldValue.serverTimestamp(),
          });
        await orderRef.set(
          { status: "filled", txHash: tx.hash },
          { merge: true },
        );

        const uDoc = await db.collection("users").doc(uid).get();
        const tokens: string[] =
          uDoc.data()?.fcmTokens ?? uDoc.data()?.expoTokens ?? [];
        await pushTo(tokens, "NFT purchased", collection, {
          kind: "nft_bought",
        });
      } catch (e) {
        await orderRef.set(
          { status: "failed", error: String(e) },
          { merge: true },
        );
        throw new HttpsError("internal", "Mint failed");
      }
    }

    return { ok: true, approvalId: appr.approvalId };
  },
);

/** === 2) SWAP: requestSwap === */
export const requestSwap = onCall(
  {
    region: US_REGIONS,
    enforceAppCheck: true,
    secrets: [
      PRICE_MAP_USD,
      ALLOW_ONCHAIN_EXECUTION,
      PANCAKE_ROUTER_ADDRESS,
      BSC_RPC_URL,
      PAYOUT_PK,
      GAD_TOKEN_ADDRESS,
      USDT_ADDRESS,
      WBNB_ADDRESS,
      GT_ADDRESS,
      TOKEN_DECIMALS,
    ],
  },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { from, to, amount } = req.data as {
      from: "GAD" | "BNB" | "USDT" | "GT";
      to: "GAD" | "BNB" | "USDT" | "GT";
      amount: number;
    };
    if (!from || !to || !amount || from === to)
      throw new HttpsError("invalid-argument", "bad params");

    const { db, fid } = await getMember(uid);
    const priceMap = parsePriceMap(PRICE_MAP_USD.value());
    const usd = (priceMap[from] ?? 0) * amount;

    const appr = await requireApprovalIfMinorOrLimit(
      db,
      fid,
      uid,
      usd,
      { from, to, amount },
      "SWAP",
    );

    const ordRef = db
      .collection("users")
      .doc(uid)
      .collection("swapOrders")
      .doc();
    await ordRef.set({
      status: appr.needApproval ? "awaiting_approval" : "approved",
      from,
      to,
      amount,
      amountUSD: usd,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    const allow =
      (ALLOW_ONCHAIN_EXECUTION.value() || "false").toLowerCase() === "true";
    if (allow && !appr.needApproval) {
      const provider = new ethers.JsonRpcProvider(BSC_RPC_URL.value());
      const signer = new ethers.Wallet(PAYOUT_PK.value(), provider);
      const router = new ethers.Contract(
        PANCAKE_ROUTER_ADDRESS.value(),
        [
          "function swapExactTokensForTokens(uint amountIn,uint amountOutMin,address[] calldata path,address to,uint deadline) returns (uint[] memory amounts)",
        ],
        signer,
      );

      const addr = {
        GAD: GAD_TOKEN_ADDRESS.value(),
        BNB: WBNB_ADDRESS.value(),
        USDT: USDT_ADDRESS.value(),
        GT: GT_ADDRESS.value(),
      } as Record<string, string>;

      const decimals = Number(TOKEN_DECIMALS.value() || 18);
      const amt = ethers.parseUnits(String(amount), decimals);
      const path = [addr[from], addr[to]];
      try {
        const erc20 = new ethers.Contract(
          addr[from],
          ["function approve(address,uint256) returns (bool)"],
          signer,
        );
        await (await erc20.approve(PANCAKE_ROUTER_ADDRESS.value(), amt)).wait();

        const tx = await router.swapExactTokensForTokens(
          amt,
          0 as unknown as bigint,
          path,
          signer.address,
          BigInt(Math.floor(Date.now() / 1000) + 600),
        );
        await tx.wait();

        await ordRef.set(
          { status: "filled", txHash: tx.hash },
          { merge: true },
        );
        await db
          .collection("users")
          .doc(uid)
          .collection("portfolioLedger")
          .add({
            kind: "SWAP_DONE",
            from,
            to,
            amount,
            amountUSD: usd,
            at: admin.firestore.FieldValue.serverTimestamp(),
          });
      } catch (e) {
        await ordRef.set(
          { status: "failed", error: String(e) },
          { merge: true },
        );
        throw new HttpsError("internal", "swap failed");
      }
    }

    return { ok: true, approvalId: appr.approvalId };
  },
);

/** === 3) LP: requestAddLiquidity === */
export const requestAddLiquidity = onCall(
  {
    region: US_REGIONS,
    enforceAppCheck: true,
    secrets: [PRICE_MAP_USD, ALLOW_ONCHAIN_EXECUTION, PANCAKE_ROUTER_ADDRESS, BSC_RPC_URL, PAYOUT_PK],
  },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { tokenA, tokenB, amtA, amtB } = req.data as {
      tokenA: "GAD" | "BNB" | "USDT" | "GT";
      tokenB: "GAD" | "BNB" | "USDT" | "GT";
      amtA: number;
      amtB: number;
    };
    if (!tokenA || !tokenB || !amtA || !amtB)
      throw new HttpsError("invalid-argument", "bad params");

    const { db, fid } = await getMember(uid);
    const priceMap = parsePriceMap(PRICE_MAP_USD.value());
    const usd = (priceMap[tokenA] ?? 0) * amtA + (priceMap[tokenB] ?? 0) * amtB;

    const appr = await requireApprovalIfMinorOrLimit(
      db,
      fid,
      uid,
      usd,
      { tokenA, tokenB, amtA, amtB },
      "LP",
    );

    const ref = db.collection("users").doc(uid).collection("lpOrders").doc();
    await ref.set({
      status: appr.needApproval ? "awaiting_approval" : "approved",
      tokenA,
      tokenB,
      amtA,
      amtB,
      amountUSD: usd,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, approvalId: appr.approvalId };
  },
);

/** === 4) STAKE: v1 === */
const DEFAULT_APR_BPS = 800; // 8%
const PLAN_APR_BONUS_BPS: Record<"BASIC" | "FAMILY" | "PRO", number> = {
  BASIC: 0,
  FAMILY: 100,
  PRO: 200,
};
async function getFamilyPlanQuick(
  db: FirebaseFirestore.Firestore,
  fid: string,
): Promise<"BASIC" | "FAMILY" | "PRO"> {
  const snap = await db
    .collection("families")
    .doc(fid)
    .collection("billing")
    .doc("subscription")
    .get();
  return (snap.data()?.plan as any) || "BASIC";
}

export const requestStake = onCall(
  { region: US_REGIONS, enforceAppCheck: true, secrets: [PRICE_MAP_USD] },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { amount, currency, aprBps } = req.data as {
      amount: number;
      currency: "GAD";
      aprBps?: number;
    };
    if (!amount || currency !== "GAD")
      throw new HttpsError("invalid-argument", "only GAD staking in MVP");

    const { db, fid } = await getMember(uid);
    const priceMap = parsePriceMap(PRICE_MAP_USD.value());
    const usd = (priceMap["GAD"] ?? 0) * amount;

    const appr = await requireApprovalIfMinorOrLimit(
      db,
      fid,
      uid,
      usd,
      { amount, currency },
      "STAKE",
    );

    const plan = await getFamilyPlanQuick(db, fid);
    const finalApr = (aprBps ?? DEFAULT_APR_BPS) + (PLAN_APR_BONUS_BPS[plan] || 0);

    const posRef = db
      .collection("users")
      .doc(uid)
      .collection("stakingPositions")
      .doc();
    await posRef.set({
      status: appr.needApproval ? "awaiting_approval" : "active",
      currency,
      amount,
      aprBps: finalApr,
      accrued: 0,
      since: admin.firestore.FieldValue.serverTimestamp(),
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true, approvalId: appr.approvalId, positionId: posRef.id };
  },
);

export const requestUnstake = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const { positionId } = req.data as { positionId: string };
    if (!positionId) throw new HttpsError("invalid-argument", "positionId");

    const { db } = await getMember(uid);
    const ref = db
      .collection("users")
      .doc(uid)
      .collection("stakingPositions")
      .doc(positionId);
    const cur = await ref.get();
    if (!cur.exists) throw new HttpsError("not-found", "position");
    await ref.set(
      {
        status: "closed",
        closedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await db.collection("users").doc(uid).collection("portfolioLedger").add({
      kind: "UNSTAKE",
      positionId,
      at: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { ok: true };
  },
);

/** === 5) OWNER approvals === */
export const approveOperationByOwner = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const ownerUid = req.auth?.uid;
    if (!ownerUid) throw new HttpsError("unauthenticated", "Auth required");
    const { approvalId, approve } = req.data as {
      approvalId: string;
      approve: boolean;
    };
    const { db, fid } = await getMember(ownerUid);

    const fam = await db.collection("families").doc(fid).get();
    if (fam.data()?.ownerUid !== ownerUid)
      throw new HttpsError("permission-denied", "Only owner");

    const aRef = db
      .collection("families")
      .doc(fid)
      .collection("approvals")
      .doc(approvalId);
    const a = await aRef.get();
    if (!a.exists) throw new HttpsError("not-found", "approval");

    await aRef.set(
      {
        status: approve ? "approved" : "rejected",
        decidedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return { ok: true };
  },
);

/** === 6) hook for approvals (MVP no-op) === */
export const onApprovalUpdated = onDocumentCreated(
  { region: "us-east4", document: "families/{fid}/approvals/{aid}" },
  async () => {
    return;
  },
);

/** === 7) CRON: daily APR accrual === */
const accrueStakingAPR = onSchedule(
  { region: "us-east1", schedule: "15 3 * * *" },
  async () => {
    const db = admin.firestore();
    const users = await db.collection("users").get();
    for (const u of users.docs) {
      const uid = u.id;
      const posSnap = await db
        .collection("users")
        .doc(uid)
        .collection("stakingPositions")
        .where("status", "==", "active")
        .get();
      if (posSnap.empty) continue;

      for (const p of posSnap.docs) {
        const d: any = p.data();
        const apr = (d.aprBps ?? DEFAULT_APR_BPS) / 10000; // e.g., 0.08
        const daily = d.amount * (apr / 365);
        const inc = Math.floor(daily * 1e6) / 1e6; // 6 dp

        await p.ref.set(
          {
            accrued: (d.accrued ?? 0) + inc,
            at: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        await db
          .collection("users")
          .doc(uid)
          .collection("portfolioLedger")
          .add({
            kind: "STAKE_APR",
            positionId: p.id,
            amount: inc,
            currency: "GAD",
            at: admin.firestore.FieldValue.serverTimestamp(),
          });

        const tokens: string[] =
          u.data()?.fcmTokens ?? u.data()?.expoTokens ?? [];
        await pushTo(tokens, "Staking rewards", `+${inc} GAD`, { kind: "apr" });
      }
    }
  },
);

/** === 8) Aggregated portfolio === */
export const getPortfolio = onCall(
  { region: US_REGIONS, enforceAppCheck: true },
  async (req: any) => {
    const uid = req.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Auth required");
    const db = admin.firestore();

    const [nftSnap, swapSnap, lpSnap, stakeSnap, ledgerSnap] =
      await Promise.all([
        db
          .collection("users")
          .doc(uid)
          .collection("nftOwnerships")
          .orderBy("at", "desc")
          .limit(100)
          .get(),
        db
          .collection("users")
          .doc(uid)
          .collection("swapOrders")
          .orderBy("at", "desc")
          .limit(100)
          .get(),
        db
          .collection("users")
          .doc(uid)
          .collection("lpOrders")
          .orderBy("at", "desc")
          .limit(100)
          .get(),
        db
          .collection("users")
          .doc(uid)
          .collection("stakingPositions")
          .orderBy("at", "desc")
          .limit(100)
          .get(),
        db
          .collection("users")
          .doc(uid)
          .collection("portfolioLedger")
          .orderBy("at", "desc")
          .limit(200)
          .get(),
      ]);

    const map = (s: any) => s.docs.map((d: any) => ({ id: d.id, ...d.data() }));
    return {
      ok: true,
      nfts: map(nftSnap),
      swaps: map(swapSnap),
      lps: map(lpSnap),
      stakes: map(stakeSnap),
      ledger: map(ledgerSnap),
    };
  },
);
