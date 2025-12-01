// ---------------------------------------------------------------
// apps/mobile/src/services/locationLoop.ts
// Foreground-цикл геолокации (V1)
//  - без TaskManager, только setInterval пока приложение активно
//  - уважает age / shareLocation / permissions / lastPermissionStatus
//  - пишет в Firestore: locations/{uid}/current + (опц.) history
// ---------------------------------------------------------------

import * as Location from "expo-location";

import {
  appendLocationHistoryPoint,
  computeZoneStatus,
  getCurrentPositionSafe,
  makeHistoryDateKey,
  positionToLatLng,
  updateCurrentLocation,
  type FamilyZone,
  type GeolocationSettings,
} from "../lib/geo";

import { getGeolocationSettings } from "../lib/user";
import { getUserAgeInfo } from "../lib/age";

// ---------------------------------------------------------------
// Типы
// ---------------------------------------------------------------

export type LocationLoopStatus = "idle" | "running";

/**
 * Опции запуска foreground-цикла.
 *
 * Важно:
 *  - settings / isAdult можно передавать из UI как кэш,
 *    но внутри цикла мы всё равно стараемся подтянуть свежие
 *    данные из Firestore (getUserAgeInfo / getGeolocationSettings).
 */
export type LocationLoopOptions = {
  /** UID пользователя (обязателен) */
  uid: string;

  /**
   * Safe-зоны семьи — актуальный снимок.
   * При изменении зон можно перезапускать цикл с новыми options.
   */
  familyZones: FamilyZone[];

  /**
   * Настройки геолокации пользователя (geolocationSettings).
   * Используем как базу, но пытаемся обновить из Firestore.
   */
  settings: GeolocationSettings;

  /**
   * true — взрослый (>=18), false — ребёнок (<18).
   * Используется как fallback, если не удалось прочитать возраст.
   */
  isAdult: boolean;

  /**
   * Писать ли историю (locations/{uid}/history/…).
   * Для экономии можно выключить.
   */
  enableHistory?: boolean;

  /**
   * Опциональная функция получения уровня батареи.
   * Если не передана — batteryLevel не пишем.
   */
  getBatteryLevel?: () => Promise<number | null>;

  /**
   * Ошибки одного тика — в этот callback.
   * Если не указан — просто логируем в console.log.
   */
  onTickError?: (err: unknown) => void;
};

// ---------------------------------------------------------------
// Внутреннее состояние singleton-цикла
// ---------------------------------------------------------------

let loopTimer: ReturnType<typeof setInterval> | null = null;
let loopStatus: LocationLoopStatus = "idle";
let lastOptions: LocationLoopOptions | null = null;

// ---------------------------------------------------------------
// Публичные геттеры статуса
// ---------------------------------------------------------------

export function getLocationLoopStatus(): LocationLoopStatus {
  return loopStatus;
}

export function isLocationLoopRunning(): boolean {
  return loopStatus === "running" && loopTimer != null;
}

// ---------------------------------------------------------------
// Основной тик — всё, что происходит раз в intervalMinutes
// ---------------------------------------------------------------

/**
 * Один "тик" обновления геолокации:
 *  - читаем age / geolocationSettings
 *  - проверка age / shareLocation
 *  - проверка permissions / lastPermissionStatus
 *  - получение позиции
 *  - computeZoneStatus
 *  - updateCurrentLocation (+ history по желанию)
 */
export async function runLocationTickOnce(
  options: LocationLoopOptions
): Promise<void> {
  const {
    uid,
    familyZones,
    settings: settingsFromUI,
    isAdult: isAdultFromUI,
    enableHistory,
    getBatteryLevel,
  } = options;

  if (!uid) return;

  // 0) Подтягиваем свежую инфу о возрасте и настройках
  let isAdultEffective: boolean = isAdultFromUI;
  let settingsEffective: GeolocationSettings = settingsFromUI;

  try {
    const ageInfo = await getUserAgeInfo(uid);
    if (ageInfo && ageInfo.isAdult !== null) {
      isAdultEffective = ageInfo.isAdult;
    }
  } catch (e) {
    console.log("[locationLoop] getUserAgeInfo error", e);
  }

  try {
    const freshSettings = await getGeolocationSettings(uid);
    if (freshSettings) {
      settingsEffective = {
        ...settingsEffective,
        ...freshSettings,
      };
    }
  } catch (e) {
    console.log("[locationLoop] getGeolocationSettings error", e);
  }

  const intervalMinutes = settingsEffective.intervalMinutes || 5;

  // 1) Эффективный флаг "делиться локацией"
  // Дети (<18): shareLocation всегда true (управляет родитель).
  const shareLocationEffective =
    isAdultEffective === true ? settingsEffective.shareLocation : true;

  // Правило #1:
  //  - если isAdult === true и shareLocation === false →
  //    не шлём позицию, один раз ставим status = "paused".
  if (isAdultEffective === true && !shareLocationEffective) {
    await updateCurrentLocation(uid, {
      status: "paused",
    });
    return;
  }

  // Правило #2 (оптимизация по lastPermissionStatus):
  //  - если lastPermissionStatus === "denied" → сразу статус no-permission
  //    и не дёргаем SDK лишний раз.
  if (settingsEffective.lastPermissionStatus === "denied") {
    await updateCurrentLocation(uid, {
      status: "no-permission",
    });
    return;
  }

  // 2) Проверяем текущие foreground-permissions у OS.
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== "granted") {
    // Нет разрешения → статус no-permission, координаты не обновляем.
    await updateCurrentLocation(uid, {
      status: "no-permission",
    });
    return;
  }

  // 3) Пытаемся получить текущую позицию (safe-обёртка).
  const position = await getCurrentPositionSafe({
    accuracy: Location.Accuracy.Balanced,
  });

  if (!position) {
    // Не удалось получить позицию (ошибка/timeout) → no-permission / unknown.
    await updateCurrentLocation(uid, {
      status: "no-permission",
    });
    return;
  }

  const latLng = positionToLatLng(position);
  if (!latLng) {
    await updateCurrentLocation(uid, {
      status: "no-permission",
    });
    return;
  }

  // 4) Считаем зону относительно familyZones.
  const { zoneStatus, lastZoneId } = computeZoneStatus(position, familyZones);

  // 5) Пытаемся получить уровень батареи (если передали функцию).
  let batteryLevel: number | undefined;
  if (getBatteryLevel) {
    try {
      const lvl = await getBatteryLevel();
      if (typeof lvl === "number") {
        batteryLevel = lvl;
      }
    } catch (e) {
      console.log("[locationLoop] getBatteryLevel error", e);
    }
  }

  // 6) Пишем current location в Firestore.
  await updateCurrentLocation(uid, {
    lat: latLng.lat,
    lng: latLng.lng,
    accuracy: position.coords?.accuracy ?? 0,
    status: "active",
    zoneStatus,
    lastZoneId,
    batteryLevel,
  });

  // 7) Опционально пишем точку в историю.
  if (enableHistory) {
    const dateKey = makeHistoryDateKey();
    await appendLocationHistoryPoint(uid, dateKey, {
      lat: latLng.lat,
      lng: latLng.lng,
      accuracy: position.coords?.accuracy ?? 0,
    });
  }

  // Для отладки можно включить лог:
  // console.log(
  //   `[locationLoop] tick ok uid=${uid}, every=${intervalMinutes}m, zone=${zoneStatus}, lastZoneId=${lastZoneId}`
  // );
}

// ---------------------------------------------------------------
// Управление циклом (start / stop)
// ---------------------------------------------------------------

/**
 * Запускает foreground-цикл:
 *  - сразу делает первый тик
 *  - дальше раз в intervalMinutes вызывает runLocationTickOnce
 *  - singleton: один цикл на приложение
 *
 * Важно: settings.intervalMinutes берётся из options.settings,
 * но внутри тиков мы всё равно подтягиваем свежие настройки
 * (чтобы не было расхождения политики).
 */
export function startForegroundLocationLoop(options: LocationLoopOptions) {
  lastOptions = options;

  // Без UID цикл не имеет смысла.
  if (!options.uid) {
    console.log("[locationLoop] start: no uid, abort");
    return;
  }

  const intervalMinutes = options.settings.intervalMinutes || 5;
  const intervalMs = Math.max(1, intervalMinutes) * 60_000;

  // Если уже был таймер — очищаем, чтобы не было дублей.
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }

  loopStatus = "running";

  // Первый тик сразу.
  runLocationTickOnce(options).catch((err) => {
    console.log("[locationLoop] first tick error", err);
    options.onTickError?.(err);
  });

  // Дальше — по интервалу.
  loopTimer = setInterval(() => {
    if (!lastOptions) return;
    runLocationTickOnce(lastOptions).catch((err) => {
      console.log("[locationLoop] interval tick error", err);
      lastOptions?.onTickError?.(err);
    });
  }, intervalMs);

  console.log(
    `[locationLoop] started: uid=${options.uid}, every ${intervalMinutes} min`
  );
}

/**
 * Останавливает foreground-цикл.
 */
export function stopForegroundLocationLoop() {
  if (loopTimer) {
    clearInterval(loopTimer);
    loopTimer = null;
  }
  loopStatus = "idle";
  console.log("[locationLoop] stopped");
}

/**
 * Обновление опций без жёсткого stop/start.
 * Под капотом:
 *  - останавливает старый таймер
 *  - запускает новый с новыми опциями
 */
export function restartForegroundLocationLoop(
  options: LocationLoopOptions
): void {
  stopForegroundLocationLoop();
  startForegroundLocationLoop(options);
}
