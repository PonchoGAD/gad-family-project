// apps/mobile/src/services/locationService.ts
import * as Location from "expo-location";
import { fn } from "../firebase";

export async function ensureLocationPermissions() {
  const fg = await Location.requestForegroundPermissionsAsync();
  if (fg.status !== "granted") throw new Error("Location permission denied");
  // опционально: background для детей
  const bg = await Location.requestBackgroundPermissionsAsync();
  return { fg, bg };
}

// простой интервал-пинг (минимум для старта)
let _timer: any = null;

export function startPinging(intervalMs = 120000) {
  stopPinging();
  _timer = setInterval(async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude: lat, longitude: lng } = pos.coords;
      const acc = pos.coords.accuracy ?? null;
      await fn.locationPing({ lat, lng, acc });
    } catch (e) {
      console.log("ping error", e);
    }
  }, intervalMs);
}

export function stopPinging() {
  if (_timer) { clearInterval(_timer); _timer = null; }
}
