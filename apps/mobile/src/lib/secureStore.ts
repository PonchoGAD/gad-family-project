// apps/mobile/src/lib/secureStore.ts
import * as SecureStore from "expo-secure-store";

/**
 * Save a value into SecureStore under a namespaced keychain service.
 */
export async function saveSecure(key: string, value: string) {
  await SecureStore.setItemAsync(key, value, {
    keychainService: "GADFamily",
  });
}

/**
 * Read a value from SecureStore.
 */
export async function getSecure(key: string) {
  return SecureStore.getItemAsync(key);
}

/**
 * Delete a value from SecureStore (optional helper).
 */
export async function deleteSecure(key: string) {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // ignore
  }
}
