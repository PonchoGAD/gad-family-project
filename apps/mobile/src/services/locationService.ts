
// apps/mobile/src/services/locationService.ts
import * as Location from "expo-location";
import { fn } from "../lib/functionsClient";

export async function ensureLocationPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") throw new Error("Location permission denied");
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { fg, bg };
}

let _timer: any = null;

export function startPinging(intervalMs = 120000) {
  stopPinging();
  _timer = setInterval(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const acc = pos.coords.accuracy ?? null;
      await fn.geo.ping({ lat, lng, acc }); // <= поправил namespace
    } catch (e) {
      console.log("ping error", e);
    }
  }, intervalMs);
}

export function stopPinging() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
