// apps/mobile/src/lib/wallet-activity.ts

import { functions } from "../firebase";
import { httpsCallable } from "firebase/functions";

/* -------------------------------------------------------------------------- */
/*                                   TYPES                                    */
/* -------------------------------------------------------------------------- */

// Те же типы, что и в functions/src/wallet.ts, но дублируем локально,
// чтобы не тянуть серверный код в клиент.

export type WalletActivityType =
  | "transfer_in"
  | "transfer_out"
  | "swap"
  | "stake"
  | "unstake"
  | "nft_mint"
  | "nft_buy"
  | "nft_sell"
  | "other";

export type WalletActivityItem = {
  id: string;
  txHash: string;
  timestamp: number; // unix (sec или ms — зависит от индексера)
  type: WalletActivityType;
  tokenSymbol?: string;
  amount?: string;
  direction?: "in" | "out";
  counterparty?: string;
  meta?: Record<string, unknown>;
};

export type WalletActivityResponse = {
  address: string;
  items: WalletActivityItem[];
};

// То, что удобно сразу рендерить в UI.
export type FormattedWalletActivityItem = WalletActivityItem & {
  title: string;
  subtitle: string;
  icon: WalletActivityIcon;
};

export type WalletActivityIcon =
  | "transfer"
  | "swap"
  | "stake"
  | "nft"
  | "other";

/* -------------------------------------------------------------------------- */
/*                            CORE LOADER: HISTORY                            */
/* -------------------------------------------------------------------------- */

/**
 * Единая точка входа: загрузить историю кошелька.
 *
 * Сейчас:
 *  - дергаем Cloud Function walletGetActivity (заглушка на backend)
 *  - дополнительно оставлены хелперы loadTransfers / loadNftActions / etc,
 *    чтобы позже можно было склеить историю из разных источников (цепочка,
 *    маркетплейс, staking backend и т.д.).
 */
export async function loadWalletActivity(
  address: string
): Promise<FormattedWalletActivityItem[]> {
  const trimmed = address.trim();
  if (!trimmed) return [];

  // 1) Основной источник — Cloud Function walletGetActivity
  const fn = httpsCallable<{ address: string }, WalletActivityResponse>(
    functions,
    "walletGetActivity"
  );

  let fromBackend: WalletActivityItem[] = [];
  try {
    const res = await fn({ address: trimmed });
    fromBackend = res.data?.items ?? [];
  } catch (e) {
    console.warn("[wallet-activity] walletGetActivity failed:", e);
    fromBackend = [];
  }

  // 2) Дополнительные источники (заглушки, чтобы архитектура была готова):
  const [transfers, nftActions, swapActions, stakeActions] =
    await Promise.all([
      loadTransfers(trimmed),
      loadNftActions(trimmed),
      loadSwapActions(trimmed),
      loadStakeActions(trimmed),
    ]);

  // 3) Мержим все списки и сортируем по времени убыванию
  const merged: WalletActivityItem[] = [
    ...fromBackend,
    ...transfers,
    ...nftActions,
    ...swapActions,
    ...stakeActions,
  ];

  const uniqueByIdMap = new Map<string, WalletActivityItem>();
  for (const item of merged) {
    // если из разных источников приходят одинаковые id — переопределяем
    uniqueByIdMap.set(item.id, item);
  }

  const deduped = Array.from(uniqueByIdMap.values()).sort(
    (a, b) => b.timestamp - a.timestamp
  );

  // 4) Приводим к UI-формату
  return deduped.map(formatActivityItem);
}

/* -------------------------------------------------------------------------- */
/*                     PLACEHOLDERS: TRANSFERS / NFT / SWAP / STAKE          */
/* -------------------------------------------------------------------------- */

/**
 * Загрузка "сырых" трансферов (in/out).
 *
 * Позже можно дергать:
 *  - BscScan / собственный индексер
 *  - Firestore-лог для off-chain операций
 */
export async function loadTransfers(
  address: string
): Promise<WalletActivityItem[]> {
  // TODO: подключить реальный источник (BscScan / indexer / Firestore).
  // Сейчас — заглушка.
  const _addr = address; // чтобы TS не ругался
  return [];
}

/**
 * Загрузка NFT-действий: mint, buy, sell.
 *
 * Источники:
 *  - NFT marketplace API (gad-family.com/...)
 *  - on-chain события контрактов
 */
export async function loadNftActions(
  address: string
): Promise<WalletActivityItem[]> {
  // TODO: подключить marketplace API / chain events.
  const _addr = address;
  return [];
}

/**
 * Загрузка swap-действий (PancakeSwap / твой swap-контракт).
 */
export async function loadSwapActions(
  address: string
): Promise<WalletActivityItem[]> {
  // TODO: подключить swap-лог: либо own DEX-контракт, либо on-chain scanner.
  const _addr = address;
  return [];
}

/**
 * Загрузка staking-действий: stake / unstake / rewards.
 */
export async function loadStakeActions(
  address: string
): Promise<WalletActivityItem[]> {
  // TODO: читать staking-контракты / Firestore-лог.
  const _addr = address;
  return [];
}

/* -------------------------------------------------------------------------- */
/*                             FORMATTER FOR UI                               */
/* -------------------------------------------------------------------------- */

/**
 * Переводит "сырое" событие в удобный UI-формат:
 *  - title (что произошло)
 *  - subtitle (детали)
 *  - icon (тип операции)
 */
export function formatActivityItem(
  item: WalletActivityItem
): FormattedWalletActivityItem {
  const symbol = item.tokenSymbol ?? "GAD";
  const amt = item.amount ?? "";
  const shortTx = item.txHash
    ? `${item.txHash.slice(0, 6)}…${item.txHash.slice(-4)}`
    : "";
  const shortCounterparty = item.counterparty
    ? `${item.counterparty.slice(0, 6)}…${item.counterparty.slice(-4)}`
    : "";

  let title = "Activity";
  let subtitle = "";
  let icon: WalletActivityIcon = "other";

  switch (item.type) {
    case "transfer_in":
      title = `Received ${amt} ${symbol}`;
      subtitle = shortCounterparty
        ? `From ${shortCounterparty} · ${shortTx}`
        : shortTx;
      icon = "transfer";
      break;

    case "transfer_out":
      title = `Sent ${amt} ${symbol}`;
      subtitle = shortCounterparty
        ? `To ${shortCounterparty} · ${shortTx}`
        : shortTx;
      icon = "transfer";
      break;

    case "swap":
      title = "Swap";
      subtitle = `${amt} ${symbol} · ${shortTx}`;
      icon = "swap";
      break;

    case "stake":
      title = `Staked ${amt} ${symbol}`;
      subtitle = shortTx;
      icon = "stake";
      break;

    case "unstake":
      title = `Unstaked ${amt} ${symbol}`;
      subtitle = shortTx;
      icon = "stake";
      break;

    case "nft_mint":
      title = "NFT Minted";
      subtitle = shortTx;
      icon = "nft";
      break;

    case "nft_buy":
      title = "NFT Purchased";
      subtitle = shortTx;
      icon = "nft";
      break;

    case "nft_sell":
      title = "NFT Sold";
      subtitle = shortTx;
      icon = "nft";
      break;

    case "other":
    default:
      title = "Activity";
      subtitle = shortTx;
      icon = "other";
      break;
  }

  return {
    ...item,
    title,
    subtitle,
    icon,
  };
}
