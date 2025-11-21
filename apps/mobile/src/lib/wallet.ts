// apps/mobile/src/lib/wallet.ts

import "react-native-get-random-values";
import * as SecureStore from "expo-secure-store";
import { ethers } from "ethers";
import { getProvider } from "./chains";

const STORE_KEY_MNEMONIC = "gad_wallet_mnemonic_v1";

// We always work with HDNodeWallet to avoid type collisions
export type LocalWallet = ethers.HDNodeWallet;

export type NativeBalance = {
  wei: bigint;
  formatted: string; // BNB in human-readable form
};

export type WalletBalance = {
  address: string;
  native: NativeBalance;
};

export type SendTxParams = {
  to: string;
  valueWei?: bigint;      // приоритетнее, если указан
  valueEther?: string;    // строка, например "0.01"
  data?: string;          // hex-строка "0x..."
};

/**
 * Check if local wallet mnemonic exists in SecureStore.
 */
export async function hasWallet(): Promise<boolean> {
  try {
    const m = await SecureStore.getItemAsync(STORE_KEY_MNEMONIC);
    return !!m;
  } catch {
    return false;
  }
}

/**
 * Safely get shared JsonRpcProvider (or null if misconfigured).
 */
function safeProvider(): ethers.JsonRpcProvider | null {
  try {
    const p = getProvider();
    return p ?? null;
  } catch {
    return null;
  }
}

/**
 * Load HDNodeWallet from SecureStore if mnemonic is present.
 */
export async function loadWallet(): Promise<LocalWallet | null> {
  const mnemonic = await SecureStore.getItemAsync(STORE_KEY_MNEMONIC);
  if (!mnemonic) return null;

  // Use HDNodeWallet.fromPhrase to keep the type consistent
  const base = ethers.HDNodeWallet.fromPhrase(mnemonic);
  const provider = safeProvider();
  return provider ? (base.connect(provider) as ethers.HDNodeWallet) : base;
}

/**
 * Get or create local HDNodeWallet.
 * If wallet already exists in SecureStore, reuse it.
 */
export async function getOrCreateWallet(): Promise<LocalWallet> {
  const existing = await loadWallet();
  if (existing) return existing;

  // Create random wallet only to get a fresh mnemonic phrase
  const tmp = ethers.Wallet.createRandom();
  const phrase = tmp.mnemonic?.phrase;
  if (!phrase) {
    throw new Error("Failed to generate mnemonic");
  }

  // Re-create as HDNodeWallet from phrase (type-safe)
  const fresh = ethers.HDNodeWallet.fromPhrase(phrase);
  await SecureStore.setItemAsync(STORE_KEY_MNEMONIC, phrase);

  const provider = safeProvider();
  return provider ? (fresh.connect(provider) as ethers.HDNodeWallet) : fresh;
}

/**
 * Ensure wallet exists AND is connected to provider.
 * Бросает ошибку, если RPC не настроен.
 */
export async function ensureConnectedWallet(): Promise<LocalWallet> {
  const base = await getOrCreateWallet();
  const provider = safeProvider();
  if (!provider) {
    throw new Error("RPC provider is not configured for wallet");
  }
  const connected = base.connect(provider) as ethers.HDNodeWallet;
  return connected;
}

/**
 * Remove local wallet from SecureStore (reset).
 */
export async function purgeWallet(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORE_KEY_MNEMONIC);
  } catch {
    // ignore
  }
}

/**
 * Helper: get address of local wallet (creating if needed).
 */
export async function getAddress(): Promise<string> {
  const w = await getOrCreateWallet();
  return w.address;
}

/* -------------------------------------------------------------------------- */
/*                          BALANCE HELPERS                                   */
/* -------------------------------------------------------------------------- */

/**
 * Получить баланс нативного токена (BNB) для конкретного адреса.
 */
export async function getNativeBalanceForAddress(
  address: string
): Promise<NativeBalance> {
  const provider = safeProvider();
  if (!provider) {
    throw new Error("RPC provider is not configured");
  }

  const checksummed = ethers.getAddress(address);
  const raw = await provider.getBalance(checksummed); // bigint

  return {
    wei: raw,
    formatted: ethers.formatEther(raw),
  };
}

/**
 * Получить баланс нативки (BNB) для локального кошелька.
 */
export async function getNativeBalance(): Promise<NativeBalance> {
  const addr = await getAddress();
  return getNativeBalanceForAddress(addr);
}

/**
 * Сводка по локальному кошельку:
 *  - address
 *  - native balance (wei + formatted)
 */
export async function getBalance(): Promise<WalletBalance> {
  const addr = await getAddress();
  const native = await getNativeBalanceForAddress(addr);

  return {
    address: addr,
    native,
  };
}

/* -------------------------------------------------------------------------- */
/*                          TRANSACTIONS & SIGNING                            */
/* -------------------------------------------------------------------------- */

/**
 * Отправка простой нативной транзакции (BNB).
 *
 * Пример использования:
 *   await sendTransaction({
 *     to: "0x...",
 *     valueEther: "0.01",
 *   });
 */
export async function sendTransaction(params: SendTxParams) {
  const wallet = await ensureConnectedWallet();

  if (!params.to) {
    throw new Error("sendTransaction: 'to' is required");
  }

  // Определяем value
  let value: bigint = 0n;
  if (typeof params.valueWei === "bigint") {
    value = params.valueWei;
  } else if (params.valueEther) {
    value = ethers.parseEther(params.valueEther);
  }

  const txRequest: ethers.TransactionRequest = {
    to: ethers.getAddress(params.to),
    value,
  };

  if (params.data) {
    txRequest.data = params.data as `0x${string}`;
  }

  const tx = await wallet.sendTransaction(txRequest);
  // Можно дополнительно дождаться подтверждения: await tx.wait();
  return tx;
}

/**
 * Подписать произвольное сообщение локальным кошельком.
 */
export async function signMessage(message: string): Promise<string> {
  const wallet = await getOrCreateWallet();
  return wallet.signMessage(message);
}
