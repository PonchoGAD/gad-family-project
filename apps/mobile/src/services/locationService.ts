// apps/mobile/src/services/locationService.ts
import * as Location from "expo-location";
import { fn } from "../lib/functionsClient";

/**
 * Request foreground + background location permissions.
 */
export async function ensureLocationPermissions() {
  // Foreground permission (required)
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") {
    throw new Error("Location permission denied");
  }

  // Background permission is optional but recommended for continuous tracking
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { fg, bg };
}

// Use loose type here to avoid NodeJS.Timer / Timeout conflicts in React Native
let _timer: any = null;

/**
 * Start periodic location pings to the backend.
 * Uses callable function "geo_ping" (matches Cloud Functions export).
 */
export function startPinging(intervalMs = 120_000) {
  stopPinging();

  _timer = setInterval(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const acc = accuracy ?? null;

      // Callable name must match backend export: geo_ping
      const call = fn<{ lat: number; lng: number; acc: number | null }, { ok: boolean }>(
        "geo_ping"
      );

      await call({ lat, lng, acc });
    } catch (e) {
      console.log("geo_ping error", e);
    }
  }, intervalMs);
}

/**
 * Stop periodic location pings.
 */
export function stopPinging() {
  if (_timer) {
    clearInterval(_timer as any);
    _timer = null;
  }
}
