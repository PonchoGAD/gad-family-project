// ---------------------------------------------------------------
// apps/mobile/src/screens/FamilyMapScreen.tsx – GAD Family Map
//  - Family members list (top)
//  - Live locations from Firestore (locations/{uid}/current)
//  - Safe zones (families/{fid}/zones)
//  - Zone status: inside / outside / unknown
//  - Demo-friendly, unified theme
//  - Foreground geolocation loop (V1) for current user
//  - SafeZone events → geoEvents (enter/exit/warning) через emit*
// ---------------------------------------------------------------

import React, { useEffect, useState, useRef, memo } from "react";
import MapView, { Marker, Circle, Region } from "react-native-maps";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from "react-native";

import { useTheme } from "../wallet/ui/theme";
import { useIsDemo, useActiveUid } from "../demo/DemoContext";

import {
  getCurrentUserFamilyId,
  listenFamilyMembers,
  listenFamilyZones,
  FamilyZone,
  FamilyMember,
} from "../lib/families";

import {
  subscribeToUserLocation,
  CurrentLocationDoc,
  type GeolocationSettings,
} from "../lib/geo";

import { getGeolocationSettings } from "../lib/user";

import {
  startForegroundLocationLoop,
  stopForegroundLocationLoop,
} from "../services/locationLoop";

// ⚠️ Новый импорт: эмитеры Safe Zone событий → families/{fid}/geoEvents/...
import {
  emitSafeZoneEnter,
  emitSafeZoneExit,
  emitSafeZoneWarning,
} from "../lib/safeZones";

// ---------------------------------------------------------------
// Local types
// ---------------------------------------------------------------

type MemberWithLocation = FamilyMember & {
  location?: CurrentLocationDoc | null;
};

type LocationsByUid = Record<string, CurrentLocationDoc | null>;

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------

function formatTimeAgo(ts: any | undefined): string {
  if (!ts) return "No updates yet";

  let d: Date;
  try {
    d = ts.toDate ? ts.toDate() : new Date(ts);
  } catch {
    d = new Date(ts);
  }
  const now = Date.now();
  const diffMs = now - d.getTime();
  if (diffMs < 0) return "Just now";

  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin === 1) return "1 min ago";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffH = Math.floor(diffMin / 60);
  if (diffH === 1) return "1 hour ago";
  if (diffH < 24) return `${diffH} hours ago`;

  const diffD = Math.floor(diffH / 24);
  if (diffD === 1) return "1 day ago";
  return `${diffD} days ago`;
}

function getMemberStatusLabel(loc: CurrentLocationDoc | null | undefined) {
  if (!loc) return "No location";

  if (loc.status === "no-permission") return "No permission for location";
  if (loc.status === "paused") return "Location sharing disabled";
  if (loc.status === "active") {
    const ago = formatTimeAgo(loc.updatedAt);
    return `Online · ${ago}`;
  }
  const ago = formatTimeAgo(loc.updatedAt);
  return `Unknown · ${ago}`;
}

function zoneStatusText(
  zoneStatus: CurrentLocationDoc["zoneStatus"] | undefined
): string {
  if (!zoneStatus || zoneStatus === "unknown") return "Zone: unknown";
  if (zoneStatus === "inside") return "Inside safe zone";
  if (zoneStatus === "outside") return "Outside safe zones";
  return "Zone: unknown";
}

// Ночной режим: простое правило по локальному времени устройства
function isNightNow(): boolean {
  const h = new Date().getHours();
  // 22:00–06:00 считаем "ночью"
  return h >= 22 || h < 6;
}

function resolveInitialRegion(
  loc: CurrentLocationDoc | null | undefined
): Region {
  if (loc && typeof loc.lat === "number" && typeof loc.lng === "number") {
    return {
      latitude: loc.lat,
      longitude: loc.lng,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };
  }

  // fallback: США, Нью-Йорк (а не Бишкек)
  return {
    latitude: 40.7128,
    longitude: -74.006,
    latitudeDelta: 0.2,
    longitudeDelta: 0.2,
  };
}

// ---------------------------------------------------------------
// Main component
// ---------------------------------------------------------------

export default function FamilyMapScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();
  const { uid: activeUid } = useActiveUid();

  const [familyId, setFamilyId] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberWithLocation[]>([]);
  const [zones, setZones] = useState<FamilyZone[]>([]);
  const [locationsByUid, setLocationsByUid] = useState<LocationsByUid>({});
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [geoSettings, setGeoSettings] = useState<GeolocationSettings | null>(
    null
  );

  const mapRef = useRef<MapView | null>(null);
  const locationUnsubsRef = useRef<Record<string, () => void>>({});

  // -------------------------------------------------------------
  // DEMO: simple fake data (чтобы карта жила даже без реального юзера)
  // -------------------------------------------------------------
  useEffect(() => {
    if (!isDemo) return;

    const demoFamilyId = "demo-family";
    setFamilyId(demoFamilyId);

    const demoMembers: MemberWithLocation[] = [
      {
        id: "demo-parent",
        joinedAt: null,
        isAdult: true,
        displayName: "Parent (demo)" as any,
        age: 35 as any,
        role: "parent" as any,
        location: {
          lat: 40.7128,
          lng: -74.006,
          accuracy: 10,
          updatedAt: new Date(),
          status: "active",
          zoneStatus: "inside",
          lastZoneId: "home",
        } as any,
      } as MemberWithLocation,
      {
        id: "demo-kid",
        joinedAt: null,
        isAdult: false,
        displayName: "Kid (demo)" as any,
        age: 12 as any,
        role: "child" as any,
        location: {
          lat: 40.716,
          lng: -74.0,
          accuracy: 15,
          updatedAt: new Date(),
          status: "active",
          zoneStatus: "outside",
          lastZoneId: null,
        } as any,
      } as MemberWithLocation,
    ];

    const demoZones: FamilyZone[] = [
      {
        id: "home",
        name: "Home (demo)",
        lat: 40.7128,
        lng: -74.006,
        radius: 300,
        color: "#22c55e",
        active: true,
        createdAt: new Date(),
      },
    ];

    const demoLocByUid: LocationsByUid = {};
    demoMembers.forEach((m) => {
      demoLocByUid[m.id] = m.location ?? null;
    });

    setMembers(demoMembers);
    setZones(demoZones);
    setLocationsByUid(demoLocByUid);
    setSelectedUid(demoMembers[0]?.id ?? null);
    setLoading(false);
  }, [isDemo]);

  // -------------------------------------------------------------
  // REAL: load familyId once
  // -------------------------------------------------------------
  useEffect(() => {
    if (isDemo) return;

    (async () => {
      try {
        setLoading(true);
        const fid = await getCurrentUserFamilyId();
        setFamilyId(fid ?? null);
      } catch (e) {
        console.log("[FamilyMapScreen] getCurrentUserFamilyId error", e);
        setFamilyId(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [isDemo]);

  // -------------------------------------------------------------
  // REAL: subscribe members & zones when we have familyId
  // -------------------------------------------------------------
  useEffect(() => {
    if (isDemo) return;
    if (!familyId) return;

    setLoading(true);

    const unsubMembers = listenFamilyMembers(familyId, (items) => {
      setMembers((prev) => {
        // сохраним предыдущие location, если были
        const prevById: Record<string, MemberWithLocation> = {};
        prev.forEach((m) => {
          prevById[m.id] = m;
        });

        const merged = items.map((it) => ({
          ...it,
          location: prevById[it.id]?.location,
        })) as MemberWithLocation[];

        // если нет выбранного – выберем первого
        if (!selectedUid && merged.length > 0) {
          setSelectedUid(merged[0].id);
        }
        return merged;
      });
    });

    const unsubZones = listenFamilyZones(familyId, (z) => {
      setZones(z);
    });

    setLoading(false);

    return () => {
      unsubMembers();
      unsubZones();
    };
  }, [familyId, isDemo, selectedUid]);

  // -------------------------------------------------------------
  // REAL: subscribe to locations for each member
  //  + SafeZone события (enter / exit / warning) через emitSafeZone*
// -------------------------------------------------------------
  useEffect(() => {
    if (isDemo) return;

    const currentUnsubs = locationUnsubsRef.current;

    // 1) отписываемся от членов, которых больше нет
    Object.keys(currentUnsubs).forEach((uid) => {
      const stillExists = members.some((m) => m.id === uid);
      if (!stillExists) {
        currentUnsubs[uid]();
        delete currentUnsubs[uid];
      }
    });

    // 2) подписываемся на новых членов
    members.forEach((m) => {
      const uid = m.id;
      if (!uid) return;
      if (currentUnsubs[uid]) return;

      const unsub = subscribeToUserLocation(uid, (loc) => {
        // Обновляем map<Location> с учётом предыдущего значения
        setLocationsByUid((prev) => {
          const prevLoc = prev[uid] ?? null;
          const nextLoc = loc ?? null;

          // Детект переходов зон: только в "боевом" режиме и при наличии familyId
          if (!isDemo && familyId && nextLoc) {
            const prevStatus = (prevLoc?.zoneStatus ?? "unknown") as
              | "inside"
              | "outside"
              | "unknown";
            const newStatus = (nextLoc.zoneStatus ?? "unknown") as
              | "inside"
              | "outside"
              | "unknown";

            if (prevStatus !== newStatus) {
              const zoneId = nextLoc.lastZoneId ?? null;
              const zoneName =
                zoneId != null
                  ? zones.find((z) => z.id === zoneId)?.name ?? null
                  : null;

              // Вход в безопасную зону
              if (newStatus === "inside") {
                emitSafeZoneEnter({
                  fid: familyId,
                  uid,
                  zoneId: zoneId ?? "unknown",
                  zoneName: zoneName ?? undefined,
                }).catch((e) =>
                  console.log("[FamilyMapScreen] emitSafeZoneEnter error", e)
                );
              }

              // Выход из безопасной зоны
              if (prevStatus === "inside" && newStatus === "outside") {
                emitSafeZoneExit({
                  fid: familyId,
                  uid,
                  zoneId: zoneId ?? "unknown",
                  zoneName: zoneName ?? undefined,
                }).catch((e) =>
                  console.log("[FamilyMapScreen] emitSafeZoneExit error", e)
                );
              }

              // Ночной warning: ребёнок/взрослый вне зоны ночью
              if (newStatus === "outside" && isNightNow()) {
                emitSafeZoneWarning({
                  fid: familyId,
                  uid,
                  zoneId: zoneId ?? "unknown",
                  zoneName: zoneName ?? undefined,
                  reason: "night_outside_safe_zone",
                }).catch((e) =>
                  console.log("[FamilyMapScreen] emitSafeZoneWarning error", e)
                );
              }
            }
          }

          return {
            ...prev,
            [uid]: nextLoc,
          };
        });

        // обновим в members локальную копию
        setMembers((prevMembers) =>
          prevMembers.map((mm) =>
            mm.id === uid ? { ...mm, location: loc ?? null } : mm
          )
        );
      });

      currentUnsubs[uid] = unsub;
    });

    // очистка при размонтировании компонента
    return () => {
      Object.values(currentUnsubs).forEach((fn) => {
        try {
          fn && fn();
        } catch {}
      });
      locationUnsubsRef.current = {};
    };
    // зависим от members / zones / familyId / isDemo, чтобы иметь актуальные зоны и fid
  }, [members, zones, familyId, isDemo]);

  // -------------------------------------------------------------
  // REAL: load geolocationSettings for current user (activeUid)
  // -------------------------------------------------------------
  useEffect(() => {
    if (isDemo) return;
    if (!activeUid) return;

    (async () => {
      try {
        const s = await getGeolocationSettings(activeUid);
        if (s) {
          setGeoSettings(s);
        } else {
          // дефолт, если настроек ещё нет
          setGeoSettings({
            shareLocation: true,
            mode: "foreground",
            intervalMinutes: 5,
            lastPermissionStatus: "undetermined",
          });
        }
      } catch (e) {
        console.log("[FamilyMapScreen] getGeolocationSettings error", e);
      }
    })();
  }, [activeUid, isDemo]);

  // -------------------------------------------------------------
  // REAL: start / stop foreground location loop (для текущего uid)
  // -------------------------------------------------------------
  useEffect(() => {
    if (isDemo) return;
    if (!activeUid) return;
    if (!familyId) return;
    if (!geoSettings) return;

    // определяем, взрослый ли текущий пользователь, по member.isAdult
    const myMember = members.find((m) => m.id === activeUid);
    const isAdult = myMember?.isAdult ?? true;

    startForegroundLocationLoop({
      uid: activeUid,
      familyZones: zones,
      settings: geoSettings,
      isAdult,
      enableHistory: true,
      // батарею можно подключить позже, сейчас просто null
      getBatteryLevel: async () => null,
    });

    return () => {
      stopForegroundLocationLoop();
    };
  }, [activeUid, familyId, geoSettings, zones, members, isDemo]);

  // -------------------------------------------------------------
  // Derived values
  // -------------------------------------------------------------
  const selectedMember = members.find((m) => m.id === selectedUid) ?? null;
  const selectedLocation: CurrentLocationDoc | null | undefined =
    selectedMember?.location ??
    (selectedUid ? locationsByUid[selectedUid] : null);

  const selectedZoneName =
    selectedLocation?.lastZoneId &&
    zones.find((z) => z.id === selectedLocation.lastZoneId)?.name;

  const initialRegion = resolveInitialRegion(selectedLocation);

  // когда переключаем участника – мягко двигаем карту
  useEffect(() => {
    if (!selectedLocation || !mapRef.current) return;

    const { lat, lng } = selectedLocation;
    if (typeof lat !== "number" || typeof lng !== "number") return;

    mapRef.current.animateToRegion(
      {
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      500
    );
  }, [selectedLocation]);

  const selectedIsAdult = selectedMember?.isAdult === true;

  // -------------------------------------------------------------
  // UI
  // -------------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      {/* Top panel: title + members list */}
      <View
        style={{
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 8,
          backgroundColor: G.colors.bg,
          borderBottomWidth: 1,
          borderBottomColor: G.colors.borderMuted,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontSize: 18,
            fontWeight: "700",
          }}
        >
          Family Map
        </Text>

        {loading && !isDemo ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginTop: 8,
              gap: 8,
            }}
          >
            <ActivityIndicator size="small" color={G.colors.accent} />
            <Text style={{ color: G.colors.textMuted, fontSize: 12 }}>
              Loading family & locations…
            </Text>
          </View>
        ) : null}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ marginTop: 10 }}
        >
          {members.map((m) => {
            const loc = m.location ?? locationsByUid[m.id] ?? null;
            const active = selectedUid === m.id;
            return (
              <MemberChip
                key={m.id}
                member={m}
                location={loc}
                active={!!active}
                onPress={() => setSelectedUid(m.id)}
                colors={{
                  bg: G.colors.card,
                  bgActive: G.colors.demoAccent,
                  border: G.colors.borderSoft,
                  text: G.colors.text,
                  textSoft: G.colors.textSoft,
                }}
              />
            );
          })}

          {members.length === 0 && !loading && (
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              No family members yet. Add family in Families tab.
            </Text>
          )}
        </ScrollView>
      </View>

      {/* Map */}
      <MapView
        ref={(ref) => {
          mapRef.current = ref;
        }}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
      >
        {/* Member locations */}
        {members.map((m) => {
          const loc = m.location ?? locationsByUid[m.id];
          if (!loc) return null;

          const isAdult = m.isAdult === true;

          // Взрослые:
          //  - paused / no-permission → точку не показываем.
          if (
            isAdult &&
            (loc.status === "paused" || loc.status === "no-permission")
          ) {
            return null;
          }

          // Дети:
          //  - при no-permission тоже не рисуем точку (жёсткий обрыв прав).
          if (!isAdult && loc.status === "no-permission") {
            return null;
          }

          if (typeof loc.lat !== "number" || typeof loc.lng !== "number") {
            return null;
          }

          const isSelected = m.id === selectedUid;

          return (
            <Marker
              key={m.id}
              coordinate={{
                latitude: loc.lat,
                longitude: loc.lng,
              }}
              title={
                (m as any).displayName ||
                (m as any).name ||
                m.id
              }
              description={getMemberStatusLabel(loc)}
              pinColor={isSelected ? "#facc15" : "#38bdf8"}
            />
          );
        })}

        {/* Safe zones */}
        {zones
          .filter((z) => z.active !== false)
          .map((zone) => (
            <React.Fragment key={zone.id}>
              <Marker
                coordinate={{
                  latitude: zone.lat,
                  longitude: zone.lng,
                }}
                title={zone.name}
                pinColor={zone.color ?? "#22c55e"}
              />
              {zone.radius && (
                <Circle
                  center={{
                    latitude: zone.lat,
                    longitude: zone.lng,
                  }}
                  radius={zone.radius}
                  strokeColor={(zone.color ?? "#22c55e") + "aa"}
                  fillColor={(zone.color ?? "#22c55e") + "22"}
                />
              )}
            </React.Fragment>
          ))}
      </MapView>

      {/* Bottom status card */}
      <View
        style={{
          position: "absolute",
          bottom: 20,
          left: 16,
          right: 16,
          backgroundColor: G.colors.cardStrong,
          borderColor: G.colors.demoBorder,
          borderWidth: 1,
          borderRadius: 16,
          padding: 14,
        }}
      >
        {familyId && (
          <Text style={{ color: G.colors.textSoft, fontSize: 11 }}>
            Family ID: {familyId}
            {isDemo ? " (demo)" : ""}
          </Text>
        )}

        <Text
          style={{
            color: G.colors.text,
            fontSize: 14,
            fontWeight: "700",
            marginTop: 4,
          }}
        >
          {(selectedMember as any)?.displayName ||
            (selectedMember as any)?.name ||
            "Select a family member"}
        </Text>

        {selectedLocation ? (
          <>
            <Text
              style={{
                color: G.colors.textSoft,
                fontSize: 12,
                marginTop: 4,
              }}
            >
              {/* Спец-случай для ребёнка: no-permission */}
              {!selectedIsAdult &&
              selectedLocation.status === "no-permission"
                ? "Child location unavailable (no permission on device)."
                : getMemberStatusLabel(selectedLocation)}
            </Text>

            <Text
              style={{
                color:
                  selectedLocation.zoneStatus === "inside"
                    ? G.colors.demoAccent
                    : selectedLocation.zoneStatus === "outside"
                    ? "#f97373"
                    : G.colors.textSoft,
                fontSize: 13,
                fontWeight: "600",
                marginTop: 6,
              }}
            >
              {zoneStatusText(selectedLocation.zoneStatus)}
              {selectedZoneName ? ` · ${selectedZoneName}` : ""}
            </Text>
          </>
        ) : (
          <Text
            style={{
              color: G.colors.textSoft,
              fontSize: 12,
              marginTop: 6,
            }}
          >
            No location data for this member yet.
          </Text>
        )}

        {isDemo && (
          <Text
            style={{
              color: G.colors.textSoft,
              fontSize: 11,
              marginTop: 6,
            }}
          >
            Demo mode: using simulated locations & safe zones.
          </Text>
        )}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------
// Member chip (top list)
// ---------------------------------------------------------------

const MemberChip = memo(function MemberChip({
  member,
  location,
  active,
  onPress,
  colors,
}: {
  member: FamilyMember;
  location?: CurrentLocationDoc | null;
  active: boolean;
  onPress: () => void;
  colors: {
    bg: string;
    bgActive: string;
    border: string;
    text: string;
    textSoft: string;
  };
}) {
  const name =
    (member as any).displayName ||
    (member as any).name ||
    member.id.slice(0, 6);

  const age = (member as any).age as number | undefined;
  const role = (member as any).role as string | undefined;

  const statusLabel = getMemberStatusLabel(location ?? null);

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.9}
      style={{
        minWidth: 120,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 12,
        marginRight: 8,
        backgroundColor: active ? colors.bgActive : colors.bg,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: 13,
          fontWeight: "700",
        }}
        numberOfLines={1}
      >
        {name}
      </Text>
      <Text
        style={{
          color: colors.textSoft,
          fontSize: 11,
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {age ? `${age} y.o.` : role || "Member"}
      </Text>
      <Text
        style={{
          color: colors.textSoft,
          fontSize: 10,
          marginTop: 2,
        }}
        numberOfLines={1}
      >
        {statusLabel}
      </Text>
    </TouchableOpacity>
  );
});
