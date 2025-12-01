// apps/mobile/src/screens/SettingsScreen.tsx

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Button,
  Alert,
  Switch,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import {
  scheduleDailyReminder,
  registerPushTokenIfNeeded,
} from "../lib/notifications";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  updateFamilySettings,
  getFamily,
  ensureCurrentUserFamily,
} from "../lib/families";
import {
  getReferralLink,
  shareReferralLink,
  getGeolocationSettings,
  updateGeolocationSettings,
  type GeolocationSettings,
} from "../lib/user";
import { requestLocationPermissions } from "../lib/geo";
import { useTheme } from "../wallet/ui/theme";
import { useDemo } from "../demo/DemoContext";

type Props = {
  navigation: any;
};

export default function SettingsScreen({ navigation }: Props) {
  const G = useTheme();
  const { isDemo, setDemo } = useDemo();

  const [scheduled, setScheduled] = useState(false);

  // age / tracking
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isAdult, setIsAdult] = useState<boolean | null>(null);
  const [ageYears, setAgeYears] = useState<number | null>(null);
  const [forceTracking, setForceTracking] = useState(false); // ребёнок → всегда ON
  const [trackingEnabled, setTrackingEnabled] = useState(false); // локальный стейт для тумблера shareLocation (18+)

  // geo settings
  const [geoSettings, setGeoSettings] = useState<GeolocationSettings | null>(
    null
  );
  const [intervalMinutes, setIntervalMinutes] = useState<number>(5);

  // family
  const [fid, setFid] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [findFriendsEnabled, setFindFriendsEnabled] = useState(false);

  // referral
  const [refLink, setRefLink] = useState<string>("");

  // privacy
  const [shareAnonStats, setShareAnonStats] = useState<boolean>(false);

  // notifications (mock + family alerts с пушами)
  const [notifGeneral, setNotifGeneral] = useState<boolean>(true);
  const [notifFamilyAlerts, setNotifFamilyAlerts] =
    useState<boolean>(true);

  const onSchedule = async (h: number, m: number) => {
    await scheduleDailyReminder(h, m);
    setScheduled(true);
    Alert.alert("Done", `Daily reminder set at ${h}:${m}`);
  };

  // Load profile + family + geolocation settings
  useEffect(() => {
    (async () => {
      try {
        const uid = auth.currentUser?.uid;
        if (!uid) return;

        // Load user profile
        const uRef = doc(db, "users", uid);
        const uSnap = await getDoc(uRef);

        if (!uSnap.exists()) {
          await setDoc(uRef, { createdAt: Date.now() }, { merge: true });
        }

        const u = (uSnap.data() || {}) as any;

        const adultFlag = u.isAdult === true;
        const childFlag = u.isAdult === false;

        const age = typeof u.ageYears === "number" ? u.ageYears : null;

        setIsAdult(adultFlag ? true : childFlag ? false : null);
        setForceTracking(childFlag);
        setAgeYears(age);

        // для детей по умолчанию трекинг всегда включён
        if (childFlag) {
          setTrackingEnabled(true);
        }

        // privacy
        if (typeof u.shareAnonStats === "boolean") {
          setShareAnonStats(u.shareAnonStats);
        }

        // GeolocationSettings (новая централизованная настройка)
        try {
          const geo = await getGeolocationSettings(uid);
          if (geo) {
            setGeoSettings(geo);
            setTrackingEnabled(geo.shareLocation);
            setIntervalMinutes(geo.intervalMinutes);
          } else {
            // пока настроек нет — ждём первого явного включения пользователем
            setGeoSettings(null);
          }
        } catch (e) {
          console.log("[Settings] getGeolocationSettings error", e);
        }

        // Load / ensure family
        const { fid: myFid, created } = await ensureCurrentUserFamily();
        setFid(myFid);

        if (created) {
          console.log("[Settings] Created default family for user:", myFid);
        }

        if (myFid) {
          const fam = await getFamily(myFid);

          setIsOwner(fam?.ownerUid === uid);
          setFindFriendsEnabled(fam?.findFriendsEnabled ?? false);
        }

        // Referral link
        const link = await getReferralLink();
        setRefLink(link.url);
      } catch (e) {
        console.log("settings load error", e);
      } finally {
        setLoadingProfile(false);
      }
    })();
  }, []);

  // -----------------------------------------------------------
  // Location sharing toggle (18+ only, через GeolocationSettings)
  // -----------------------------------------------------------
  async function handleToggleTracking(value: boolean) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    // дети не могут выключать трекинг
    if (forceTracking || isAdult === false) {
      Alert.alert("Location", "Children cannot disable location tracking.");
      return;
    }

    // возраст не подтверждён
    if (!isAdult) {
      Alert.alert("Location", "Age not approved by family owner yet.");
      return;
    }

    try {
      if (value) {
        // Включаем sharing → запрашиваем разрешения
        const perm = await requestLocationPermissions({
          askBackground: false,
        });

        const granted = perm === "granted";

        await updateGeolocationSettings(uid, {
          shareLocation: granted,
          lastPermissionStatus: perm,
          mode: "foreground",
        });

        setTrackingEnabled(granted);
        setGeoSettings((prev) => ({
          shareLocation: granted,
          mode: "foreground",
          intervalMinutes: prev?.intervalMinutes ?? intervalMinutes ?? 5,
          lastPermissionStatus: perm,
        }));

        if (!granted) {
          Alert.alert(
            "Location",
            "Location permission is denied. Please enable it in system settings."
          );
        }
      } else {
        // Выключаем sharing
        await updateGeolocationSettings(uid, {
          shareLocation: false,
          mode: "foreground",
        });

        setTrackingEnabled(false);
        setGeoSettings((prev) =>
          prev
            ? { ...prev, shareLocation: false }
            : {
                shareLocation: false,
                mode: "foreground",
                intervalMinutes: intervalMinutes ?? 5,
                lastPermissionStatus: "undetermined",
              }
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Location", msg);
    }
  }

  // -----------------------------------------------------------
  // Interval selector (5 / 10 / 15 минут)
  // -----------------------------------------------------------
  async function handleChangeInterval(newInterval: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    setIntervalMinutes(newInterval);

    try {
      await updateGeolocationSettings(uid, {
        intervalMinutes: newInterval,
        mode: "foreground",
      });

      setGeoSettings((prev) =>
        prev
          ? { ...prev, intervalMinutes: newInterval }
          : {
              shareLocation: trackingEnabled,
              mode: "foreground",
              intervalMinutes: newInterval,
              lastPermissionStatus:
                geoSettings?.lastPermissionStatus ?? "undetermined",
            }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Location", msg);
    }
  }

  // -----------------------------------------------------------
  // FAMILY DISCOVERY / PRIVACY / OTHER HANDLERS
  // -----------------------------------------------------------
  async function handleToggleFindFriends(value: boolean) {
    // В демо: только локальное переключение + мягкое сообщение
    if (isDemo) {
      setFindFriendsEnabled(value);
      Alert.alert(
        "Family Discovery (demo)",
        "In the demo build this switch only illustrates the feature and does not update live family settings."
      );
      return;
    }

    if (!fid || !isOwner) {
      Alert.alert(
        "Family Discovery",
        "Only the Family Owner can change discovery settings."
      );
      return;
    }

    try {
      await updateFamilySettings(fid, { findFriendsEnabled: value });
      setFindFriendsEnabled(value);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("permission-denied")) {
        Alert.alert(
          "Family Discovery",
          "This feature is currently not available for this account (missing or insufficient permissions)."
        );
      } else {
        Alert.alert("Family Discovery", msg);
      }
    }
  }

  async function handleToggleShareAnonStats(value: boolean) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      setShareAnonStats(value);
      await setDoc(
        doc(db, "users", uid),
        { shareAnonStats: value },
        { merge: true }
      );
    } catch (e) {
      Alert.alert("Privacy", String(e));
    }
  }

  async function handleResetOnboarding() {
    const uid = auth.currentUser?.uid;
    if (!uid) {
      Alert.alert("Auth", "No user");
      return;
    }

    try {
      await setDoc(
        doc(db, "users", uid),
        {
          onboarded: false,
          // familyId не чистим, чтобы не ломать данные,
          // флоу онбординга всё равно запустится заново
        },
        { merge: true }
      );

      navigation.reset({
        index: 0,
        routes: [{ name: "AuthWelcome" }],
      });
    } catch (e) {
      Alert.alert("Error", String(e));
    }
  }

  function handleExportSeedStub() {
    Alert.alert(
      "Export wallet seed (coming soon)",
      [
        "In the full version you will be able to export your wallet seed phrase.",
        "",
        "Never share your seed with anyone.",
        "Treat it like the master key to all your funds.",
      ].join("\n")
    );
  }

  // -----------------------------------------------------------
  // Push: включение Family alerts => регистрация токена
  // -----------------------------------------------------------
  async function handleToggleFamilyAlerts(value: boolean) {
    // локально сразу обновим (UI отзывчивый)
    setNotifFamilyAlerts(value);

    // интересует только кейс "включили" (false -> true)
    if (!value) return;

    try {
      const token = await registerPushTokenIfNeeded();

      // Если токена нет → скорее всего, разрешения нет / система заблокировала
      if (!token) {
        Alert.alert(
          "Notifications",
          "Push notifications may be disabled in system settings. Please enable them to receive family alerts."
        );
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      Alert.alert("Notifications", msg);
    }
  }

  // -----------------------------------------------------------
  // UI
  // -----------------------------------------------------------
  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 32,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text
          style={{
            fontWeight: "700",
            fontSize: 20,
            color: G.colors.text,
            marginBottom: 4,
          }}
        >
          Settings
        </Text>
        <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
          Control demo mode, notifications, safety, referrals and wallet tools.
        </Text>

        {/* DEMO MODE */}
        <View
          style={{
            marginTop: 16,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Investor demo
          </Text>
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Toggle sample family data for investor demo. When enabled, the app
            shows a pre-filled family with steps, missions and GAD Points.
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <Text style={{ color: G.colors.text }}>Use sample family</Text>
            <Switch value={isDemo} onValueChange={setDemo} />
          </View>

          {isDemo && (
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              Demo mode is ON — data comes from a sample family.
            </Text>
          )}
        </View>

        {/* APP NOTIFICATIONS (MOCK + push hook for family alerts) */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            App notifications
          </Text>
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            Prototype switches for push / in-app notifications. Real settings
            will be wired later.
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <Text style={{ color: G.colors.text, flex: 1 }}>
              General updates
            </Text>
            <Switch
              value={notifGeneral}
              onValueChange={setNotifGeneral}
            />
          </View>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <Text style={{ color: G.colors.text, flex: 1 }}>
              Family alerts (check-ins, safe zones)
            </Text>
            <Switch
              value={notifFamilyAlerts}
              onValueChange={handleToggleFamilyAlerts}
            />
          </View>
        </View>

        {/* REMINDERS */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
            gap: 8,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Daily reminders
          </Text>
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            Stay consistent with walking and missions.
          </Text>
          <Button title="Daily 9:00 AM" onPress={() => onSchedule(9, 0)} />
          <Button title="Daily 8:00 PM" onPress={() => onSchedule(20, 0)} />
          <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
            {scheduled ? "Reminder scheduled." : "No reminder yet."}
          </Text>
        </View>

        {/* LOCATION & SAFETY */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Location & Safety
          </Text>

          {!loadingProfile && (
            <Text
              style={{
                color: G.colors.textMuted,
                marginTop: 4,
                fontSize: 12,
              }}
            >
              Age status:{" "}
              {isAdult === true
                ? "Adult"
                : isAdult === false
                ? "Child"
                : "Not approved yet"}
              {ageYears != null ? ` (${ageYears} years)` : ""}
            </Text>
          )}

          {loadingProfile ? (
            <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
              Loading…
            </Text>
          ) : forceTracking || isAdult === false ? (
            <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
              Location tracking for children is always ON (controlled by parent).
            </Text>
          ) : (
            <>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 10,
                  alignItems: "center",
                }}
              >
                <Text style={{ color: G.colors.text }}>
                  Share my location with family
                </Text>
                <Switch
                  value={trackingEnabled}
                  onValueChange={handleToggleTracking}
                />
              </View>

              {/* Interval selector доступен только взрослым */}
              {isAdult && (
                <View style={{ marginTop: 12 }}>
                  <Text
                    style={{
                      color: G.colors.textMuted,
                      fontSize: 12,
                      marginBottom: 6,
                    }}
                  >
                    Update location every:
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                    }}
                  >
                    {[5, 10, 15].map((v) => {
                      const active = intervalMinutes === v;
                      return (
                        <TouchableOpacity
                          key={v}
                          onPress={() => handleChangeInterval(v)}
                          activeOpacity={0.9}
                          style={{
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: active
                              ? G.colors.accent
                              : G.colors.border,
                            marginRight: 8,
                            backgroundColor: active
                              ? G.colors.accent + "22"
                              : G.colors.card,
                          }}
                        >
                          <Text
                            style={{
                              color: active
                                ? G.colors.accent
                                : G.colors.textSoft,
                              fontSize: 12,
                              fontWeight: active ? "700" : "500",
                            }}
                          >
                            {v} min
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}

              {/* Инфо-текст, если системные права на гео отключены */}
              {geoSettings?.lastPermissionStatus === "denied" && (
                <Text
                  style={{
                    color: "#f97373",
                    fontSize: 11,
                    marginTop: 8,
                  }}
                >
                  Location permissions are disabled in system settings. Please
                  enable them to share your location with family.
                </Text>
              )}
            </>
          )}

          <TouchableOpacity
            onPress={() => navigation.navigate("FamilyMap")}
            style={{ marginTop: 12 }}
          >
            <Text style={{ color: G.colors.accent, fontSize: 13 }}>
              Open family map
            </Text>
          </TouchableOpacity>
        </View>

        {/* FAMILY DISCOVERY */}
        {isOwner && !!fid && (
          <View
            style={{
              marginTop: 8,
              padding: 14,
              borderRadius: 14,
              backgroundColor: G.colors.card,
              borderWidth: 1,
              borderColor: G.colors.border,
            }}
          >
            <Text
              style={{
                color: G.colors.text,
                fontWeight: "600",
                fontSize: 16,
              }}
            >
              Family Discovery
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: G.colors.text }}>
                Enable Find Families Nearby
              </Text>
              <Switch
                value={findFriendsEnabled}
                onValueChange={handleToggleFindFriends}
              />
            </View>

            <View style={{ marginTop: 10 }}>
              <Button
                title="Family Friends"
                onPress={() => navigation.navigate("FamilyFriends")}
                disabled={!findFriendsEnabled}
              />
            </View>
          </View>
        )}

        {/* REFERRAL */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Referral Program
          </Text>

          <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
            Invite families and earn rewards.
          </Text>

          <Text
            style={{ color: G.colors.text, marginTop: 8, fontSize: 13 }}
          >
            Your referral link:
          </Text>

          <Text
            style={{
              color: G.colors.accent,
              marginTop: 4,
              fontSize: 13,
            }}
          >
            {refLink || "—"}
          </Text>

          <View style={{ marginTop: 8 }}>
            <Button
              title="Share invite link"
              onPress={() => shareReferralLink()}
            />
          </View>
        </View>

        {/* PRIVACY */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Privacy & data
          </Text>

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginTop: 10,
            }}
          >
            <Text style={{ color: G.colors.text, flex: 1 }}>
              Share anonymous usage statistics
            </Text>
            <Switch
              value={shareAnonStats}
              onValueChange={handleToggleShareAnonStats}
            />
          </View>

          <TouchableOpacity
            onPress={() => navigation.navigate("Privacy")}
            style={{ marginTop: 10 }}
          >
            <Text style={{ color: G.colors.accent, fontSize: 13 }}>
              Open privacy policy
            </Text>
          </TouchableOpacity>
        </View>

        {/* AI ASSISTANT */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            AI Assistant
          </Text>
          <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
            Ask questions and get guidance inside the app.
          </Text>
          <View style={{ marginTop: 8 }}>
            <Button
              title="Open AI Assistant"
              onPress={() => navigation.navigate("Assistant")}
            />
          </View>
        </View>

        {/* WALLET & NFT SECTION */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Wallet
          </Text>

          <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
            View your on-chain activity and NFT collection.
          </Text>

          <View style={{ marginTop: 8, gap: 8 }}>
            <Button
              title="View Activity"
              onPress={() => navigation.navigate("WalletActivity")}
            />
            <Button
              title="My NFTs"
              onPress={() => navigation.navigate("NFTGallery")}
            />
            <Button
              title="Export wallet seed (stub)"
              onPress={handleExportSeedStub}
            />
          </View>
        </View>

        {/* PROFILE / DOB / FAMILY SETTINGS / RE-ONBOARD */}
        <View
          style={{
            marginTop: 8,
            padding: 14,
            borderRadius: 14,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
          }}
        >
          <Text
            style={{ color: G.colors.text, fontWeight: "600", fontSize: 16 }}
          >
            Profile & family
          </Text>

          <View style={{ marginTop: 8, gap: 8 }}>
            <Button
              title="Set date of birth"
              onPress={() => navigation.navigate("ProfileDOB")}
            />
            <Button
              title="Family settings"
              onPress={() => navigation.navigate("FamilySettings")}
            />
          </View>

          <TouchableOpacity
            onPress={handleResetOnboarding}
            style={{ marginTop: 12 }}
          >
            <Text
              style={{
                color: "#f97373",
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              Restart onboarding / change family
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
