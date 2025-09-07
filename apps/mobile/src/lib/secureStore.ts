import * as SecureStore from "expo-secure-store";

export async function saveSecure(key: string, value: string) {
  await SecureStore.setItemAsync(key, value, { keychainService: "GADFamily" });
}
export async function getSecure(key: string) {
  return SecureStore.getItemAsync(key);
}
