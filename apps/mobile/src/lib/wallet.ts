// apps/mobile/src/lib/wallet.ts
import "react-native-get-random-values"
import * as SecureStore from "expo-secure-store";
import { ethers } from "ethers";
import { getProvider } from "./chains";

const STORE_KEY_MNEMONIC = "gad_wallet_mnemonic_v1";

// We always work with HDNodeWallet to avoid type collisions
export type LocalWallet = ethers.HDNodeWallet;

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
