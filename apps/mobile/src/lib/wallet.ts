import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";

type Wallet = { address: string, priv?: string }; // упрощённый MVP

const KEY = "gad_wallet";

export async function getOrCreateWallet(): Promise<Wallet> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw) return JSON.parse(raw);
  // MVP: генерируем псевдо-адрес (позже заменим на реальный EVM)
  const addr = "0x" + randomUUID().replace(/-/g, "").slice(0, 40);
  const w = { address: addr };
  await SecureStore.setItemAsync(KEY, JSON.stringify(w));
  return w;
}

export async function getAddress(): Promise<string> {
  return (await getOrCreateWallet()).address;
}
