// ---------------------------------------------------------------
// apps/mobile/src/services/locationService.ts
// Location permissions + periodic pings for family geo + lastSeen
// ---------------------------------------------------------------

import * as Location from "expo-location";
import { fn } from "../lib/functionsClient";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

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
 * Uses callable function "geo_ping" (Cloud Functions export).
 * Also updates users/{uid}.lastSeenAt + lastLocation.
 */
export function startPinging(intervalMs = 120_000) {
  stopPinging();

  async function sendPing() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      const acc = accuracy ?? null;

      // Callable geo_ping
      const call = fn<
        { lat: number; lng: number; acc: number | null },
        { ok: boolean }
      >("geo_ping");

      await call({ lat, lng, acc });

      // Update user lastSeen + lastLocation (MVP)
      await setDoc(
        doc(db, "users", uid),
        {
          lastSeenAt: serverTimestamp(),
          lastLocation: {
            lat,
            lng,
            acc,
          },
        },
        { merge: true }
      );
    } catch (e) {
      console.log("geo_ping error", e);
    }
  }

  // First ping immediately
  sendPing();

  // Then interval
  _timer = setInterval(() => {
    sendPing();
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
