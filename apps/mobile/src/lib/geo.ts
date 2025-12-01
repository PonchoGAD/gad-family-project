// ---------------------------------------------------------------
// apps/mobile/src/lib/geo.ts
// Family geolocation utilities (V1):
//  - expo-location обёртки (permissions + current position)
//  - Firestore: locations/{uid}/current + history/{date}/points
//  - Family safe zones (тип FamilyZone)
//  - geofence checks + zoneStatus
//  - helpers для Family Map / safe zones
//
//  ⚠️ Старые функции (GeoPoint / FamilyPlace / loadGeoPoints / writeGeoState)
//  сохранены как V0-логика, чтобы не ломать существующий код.
// ---------------------------------------------------------------

import { auth, db } from "../firebase";
import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type DocumentData,
  type FirestoreError,
} from "firebase/firestore";

import * as Location from "expo-location";

// ---------------------------------------------------------------
// Типы для V1 геолокации
// ---------------------------------------------------------------

/**
 * Статус нахождения в зоне безопасности.
 */
export type ZoneStatus = "inside" | "outside" | "unknown";

/**
 * Текущий документ с местоположением:
 * locations/{uid}/current/state
 */
export type CurrentLocationDoc = {
  lat: number;
  lng: number;
  accuracy: number; // meters
  updatedAt: any; // Firestore Timestamp
  batteryLevel?: number;
  status: "active" | "paused" | "no-permission";
  zoneStatus?: ZoneStatus;
  lastZoneId?: string | null;
};

/**
 * Точка истории:
 * locations/{uid}/history/{date}/points/{pointId}
 */
export type LocationHistoryPoint = {
  lat: number;
  lng: number;
  accuracy: number;
  createdAt: any; // Firestore Timestamp
};

/**
 * Безопасная зона семьи (safe zone):
 * families/{fid}/zones/{zoneId}
 *
 * Здесь определяем только форму типа,
 * сами CRUD-функции по зонам будут в lib/families.ts.
 */
export type FamilyZone = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // meters
  color?: string;
  active: boolean;
  createdAt?: any;
};

/**
 * Настройки геолокации пользователя:
 * users/{uid}/geolocationSettings
 */
export type PermissionStatus = "undetermined" | "denied" | "granted";

export type GeolocationSettings = {
  shareLocation: boolean;
  mode: "foreground" | "background";
  intervalMinutes: number; // 5 / 10 / 15
  lastPermissionStatus: PermissionStatus;
};

// Удобный тип для обновлений current-дока
export type CurrentLocationUpdate = Partial<
  Omit<CurrentLocationDoc, "updatedAt">
> & {
  updatedAt?: any;
};

// ---------------------------------------------------------------
// Expo Location helpers
// ---------------------------------------------------------------

/**
 * Запрос разрешений на геолокацию.
 * Можно опционально запросить background-права.
 */
export async function requestLocationPermissions(options?: {
  askBackground?: boolean;
}): Promise<PermissionStatus> {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    let status: PermissionStatus = fg.status as PermissionStatus;

    if (status === "granted" && options?.askBackground) {
      const bg = await Location.requestBackgroundPermissionsAsync();
      status = bg.status as PermissionStatus;
    }

    return status;
  } catch (e) {
    console.log("[geo] requestLocationPermissions error", e);
    return "denied";
  }
}

/**
 * Безопасное получение текущей позиции:
 *  - проверяем foreground-permission
 *  - пытаемся взять lastKnownPosition
 *  - если нет — берём currentPosition
 *  - в случае ошибки возвращаем null
 */
export async function getCurrentPositionSafe(
  options?: Location.LocationOptions
): Promise<Location.LocationObject | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") {
      return null;
    }

    const last = await Location.getLastKnownPositionAsync();
    if (last) return last;

    const current = await Location.getCurrentPositionAsync(
      options ?? {
        accuracy: Location.Accuracy.Balanced,
      }
    );
    return current;
  } catch (e) {
    console.log("[geo] getCurrentPositionSafe error", e);
    return null;
  }
}

// ---------------------------------------------------------------
// Математика: расстояние / зона
// ---------------------------------------------------------------

/**
 * Расстояние между двумя точками (Haversine), метры.
 */
export function distanceM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Вытаскиваем lat/lng из LocationObject или примитива.
 * Удобно для переиспользования в Foreground-цикле.
 */
export function positionToLatLng(
  position:
    | { latitude: number; longitude: number }
    | Location.LocationObject
    | null
): { lat: number; lng: number } | null {
  if (!position) return null;

  if ("coords" in position) {
    return {
      lat: position.coords.latitude,
      lng: position.coords.longitude,
    };
  }

  return {
    lat: position.latitude,
    lng: position.longitude,
  };
}

/**
 * Вычисление статуса зоны для позиции и списка зон.
 * Возвращает:
 *  - zoneStatus: inside / outside / unknown
 *  - lastZoneId: id зоны или null
 */
export function computeZoneStatus(
  position:
    | { latitude: number; longitude: number }
    | Location.LocationObject
    | null,
  zones: FamilyZone[]
): { zoneStatus: ZoneStatus; lastZoneId: string | null } {
  if (!position || !zones || zones.length === 0) {
    return { zoneStatus: "unknown", lastZoneId: null };
  }

  const latLng = positionToLatLng(position);
  if (!latLng) {
    return { zoneStatus: "unknown", lastZoneId: null };
  }

  let insideZoneId: string | null = null;

  for (const z of zones) {
    if (z.active === false) continue;
    const dist = distanceM(latLng.lat, latLng.lng, z.lat, z.lng);
    if (dist <= z.radius) {
      insideZoneId = z.id;
      break;
    }
  }

  if (insideZoneId) {
    return { zoneStatus: "inside", lastZoneId: insideZoneId };
  }

  return { zoneStatus: "outside", lastZoneId: null };
}

/**
 * Утилита для ключа истории: 'YYYY-MM-DD'
 * Используем в Foreground-цикле, чтобы не дублировать форматирование.
 */
export function makeHistoryDateKey(d: Date = new Date()): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// ---------------------------------------------------------------
/**
 * Обновление текущего местоположения в Firestore:
 * locations/{uid}/current/state
 *
 * data:
 *  - lat / lng / accuracy
 *  - status (active / paused / no-permission)
 *  - zoneStatus / lastZoneId (опционально)
 *  - batteryLevel (опционально)
 */
export async function updateCurrentLocation(
  uid: string,
  data: CurrentLocationUpdate
): Promise<void> {
  if (!uid) return;

  const ref = doc(db, "locations", uid, "current", "state");

  const payload: CurrentLocationUpdate = {
    ...data,
    updatedAt: serverTimestamp(),
  };

  await setDoc(ref, payload as DocumentData, { merge: true });
}

/**
 * Добавление точки в историю:
 * locations/{uid}/history/{date}/points/{pointId}
 *
 * dateKey: 'YYYY-MM-DD'
 */
export async function appendLocationHistoryPoint(
  uid: string,
  dateKey: string,
  data: Partial<LocationHistoryPoint>
): Promise<void> {
  if (!uid || !dateKey) return;

  const pointsColl = collection(
    db,
    "locations",
    uid,
    "history",
    dateKey,
    "points"
  );
  const pointRef = doc(pointsColl);

  const payload: Partial<LocationHistoryPoint> = {
    lat: data.lat ?? 0,
    lng: data.lng ?? 0,
    accuracy: data.accuracy ?? 0,
    createdAt: serverTimestamp(),
  };

  await setDoc(pointRef, payload as DocumentData);
}

/**
 * Подписка на текущую локацию пользователя:
 *  - читает locations/{uid}/current/state
 *  - возвращает CurrentLocationDoc или null
 */
export function subscribeToUserLocation(
  uid: string,
  cb: (loc: CurrentLocationDoc | null) => void
): () => void {
  if (!uid) {
    cb(null);
    return () => {};
  }

  const ref = doc(db, "locations", uid, "current", "state");

  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        cb(null);
        return;
      }
      const v = snap.data() as any;

      const loc: CurrentLocationDoc = {
        lat: Number(v.lat ?? 0),
        lng: Number(v.lng ?? 0),
        accuracy: Number(v.accuracy ?? 0),
        updatedAt: v.updatedAt,
        batteryLevel:
          typeof v.batteryLevel === "number" ? v.batteryLevel : undefined,
        status: (v.status as any) ?? "active",
        zoneStatus: (v.zoneStatus as ZoneStatus | undefined) ?? "unknown",
        lastZoneId:
          typeof v.lastZoneId === "string" || v.lastZoneId === null
            ? v.lastZoneId
            : null,
      };

      cb(loc);
    },
    (err: FirestoreError) => {
      console.log("[geo] subscribeToUserLocation error", err);
      cb(null);
    }
  );
}

// ---------------------------------------------------------------
// V0-совместимость: старые типы и функции (GeoPoint / FamilyPlace)
// Оставляем, чтобы не ломать существующий код, который их использует.
// ---------------------------------------------------------------

export type GeoPoint = {
  uid: string;
  lat: number;
  lng: number;
  ts?: number;
};

/**
 * Старый тип FamilyPlace (используется в v0-коде).
 * В новой логике FamilyZone — расширение этого типа.
 */
export type FamilyPlace = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number; // meters
};

/**
 * Получение familyId текущего пользователя.
 */
export async function getFamilyId(): Promise<string | null> {
  const uid = auth.currentUser?.uid;
  if (!uid) return null;

  const snap = await getDoc(doc(db, "users", uid));
  if (!snap.exists()) return null;
  return (snap.data()?.familyId as string) ?? null;
}

/**
 * Загружает ВСЕ последние гео-точки (v0-логика):
 * geo/{uid}/meta/last
 */
export async function loadGeoPoints(): Promise<GeoPoint[]> {
  const snap = await getDocs(collectionGroup(db, "meta"));
  const arr: GeoPoint[] = [];

  snap.forEach((d) => {
    if (d.id !== "last") return;
    const v = d.data() as any;
    if (typeof v.lat !== "number" || typeof v.lng !== "number") return;

    const parts = d.ref.path.split("/");
    // path: geo/{uid}/meta/last
    const uid = parts[1];

    arr.push({
      uid,
      lat: v.lat,
      lng: v.lng,
      ts: v.ts,
    });
  });

  return arr;
}

/**
 * Загружает "старые" family places:
 * families/{fid}/places
 */
export async function loadFamilyPlaces(fid: string): Promise<FamilyPlace[]> {
  const placesColl = collection(db, "families", fid, "places");
  const snap = await getDocs(placesColl);

  const res: FamilyPlace[] = snap.docs.map((d) => {
    const v = d.data() as any;
    return {
      id: d.id,
      name: v.name,
      lat: v.lat,
      lng: v.lng,
      radius: v.radius ?? 150,
    };
  });
  return res;
}

/**
 * Проверка "внутри геозоны" для старых типов.
 */
export function insideGeofence(point: GeoPoint, place: FamilyPlace): boolean {
  const dist = distanceM(point.lat, point.lng, place.lat, place.lng);
  return dist <= place.radius;
}

/**
 * Запись geoState (v0-логика):
 * families/{fid}/geoState/{uid}
 */
export async function writeGeoState(
  fid: string,
  uid: string,
  state: "home" | "away",
  placeId?: string
) {
  await setDoc(
    doc(db, "families", fid, "geoState", uid),
    {
      state,
      placeId: placeId ?? null,
      changedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
