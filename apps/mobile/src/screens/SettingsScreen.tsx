// apps/mobile/src/screens/SettingsScreen.tsx

import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Button,
  Alert,
  Switch,
  ScrollView,
} from "react-native";
import { scheduleDailyReminder } from "../lib/notifications";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import {
  ensureLocationPermissions,
  startPinging,
  stopPinging,
} from "../services/locationService";
import {
  updateFamilySettings,
  getFamily,
  ensureCurrentUserFamily,
} from "../lib/families";
import { getReferralLink, shareReferralLink } from "../lib/user";

type Props = {
  navigation: any;
};

export default function SettingsScreen({ navigation }: Props) {
  const [scheduled, setScheduled] = useState(false);

  // age / tracking
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [isAdult, setIsAdult] = useState<boolean | null>(null);
  const [forceTracking, setForceTracking] = useState(false);
  const [trackingEnabled, setTrackingEnabled] = useState(false);

  // family
  const [fid, setFid] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [findFriendsEnabled, setFindFriendsEnabled] = useState(false);

  // referral — MUST BE STRING ONLY
  const [refLink, setRefLink] = useState<string>("");

  const onSchedule = async (h: number, m: number) => {
    await scheduleDailyReminder(h, m);
    setScheduled(true);
    Alert.alert("Done", `Daily reminder set at ${h}:${m}`);
  };

  // Load profile + family
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

        const u = uSnap.data() || {};

        const adultFlag = u.isAdult === true;
        const childFlag = u.isAdult === false;

        const allowTracking =
          typeof u.allowTracking === "boolean"
            ? u.allowTracking
            : childFlag
            ? true
            : false;

        setIsAdult(adultFlag ? true : childFlag ? false : null);
        setForceTracking(childFlag);
        setTrackingEnabled(allowTracking);

        if (allowTracking) {
          try {
            await ensureLocationPermissions();
            startPinging();
          } catch (e) {}
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

  async function handleToggleTracking(value: boolean) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    if (forceTracking || isAdult === false) {
      Alert.alert("Location", "Children cannot disable location tracking.");
      return;
    }

    if (!isAdult) {
      Alert.alert("Location", "Age not approved by family owner.");
      return;
    }

    try {
      if (value) {
        await ensureLocationPermissions();
        startPinging();
      } else {
        stopPinging();
      }

      setTrackingEnabled(value);
      await setDoc(
        doc(db, "users", uid),
        { allowTracking: value },
        { merge: true }
      );
    } catch (e) {
      Alert.alert("Location", String(e));
    }
  }

  async function handleToggleFindFriends(value: boolean) {
    if (!fid || !isOwner) return;

    try {
      await updateFamilySettings(fid, { findFriendsEnabled: value });
      setFindFriendsEnabled(value);
    } catch (e) {
      Alert.alert("Find Friends", String(e));
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 32,
          gap: 16,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={{ fontWeight: "700", fontSize: 20, color: "#fff" }}>
          Settings
        </Text>

        {/* REMINDERS */}
        <View style={{ gap: 8 }}>
          <Text style={{ color: "#9ca3af" }}>
            Daily reminders help stay consistent with walking goals.
          </Text>
          <Button title="Daily 9:00 AM" onPress={() => onSchedule(9, 0)} />
          <Button title="Daily 8:00 PM" onPress={() => onSchedule(20, 0)} />
          <Text style={{ color: "#6b7280" }}>
            {scheduled ? "Reminder scheduled." : "No reminder yet."}
          </Text>
        </View>

        {/* LOCATION */}
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: "#fff" }}>
            Location & Safety
          </Text>

          {loadingProfile ? (
            <Text style={{ color: "#9ca3af" }}>Loading…</Text>
          ) : forceTracking || isAdult === false ? (
            <Text style={{ color: "#9ca3af" }}>
              Location tracking for children is always ON.
            </Text>
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <Text style={{ color: "#e5e7eb" }}>Enable GPS ping</Text>
              <Switch
                value={trackingEnabled}
                onValueChange={handleToggleTracking}
              />
            </View>
          )}
        </View>

        {/* FIND FRIENDS */}
        {isOwner && !!fid && (
          <View style={{ marginTop: 12 }}>
            <Text style={{ fontWeight: "600", fontSize: 16, color: "#fff" }}>
              Family Discovery
            </Text>

            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginTop: 8,
              }}
            >
              <Text style={{ color: "#e5e7eb" }}>
                Enable Find Families Nearby
              </Text>
              <Switch
                value={findFriendsEnabled}
                onValueChange={handleToggleFindFriends}
              />
            </View>

            <Button
              title="Family Friends"
              onPress={() => navigation.navigate("FamilyFriends")}
              disabled={!findFriendsEnabled}
            />
          </View>
        )}

        {/* REFERRAL */}
        <View style={{ marginTop: 20 }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: "#fff" }}>
            Referral Program
          </Text>

          <Text style={{ color: "#9ca3af", marginTop: 4 }}>
            Invite families and earn rewards.
          </Text>

          <Text style={{ color: "#e5e7eb", marginTop: 8 }}>
            Your referral link:
          </Text>

          <Text style={{ color: "#60a5fa", marginTop: 4 }}>
            {refLink || "—"}
          </Text>

          <Button
            title="Share invite link"
            onPress={() => shareReferralLink()}
          />
        </View>

        {/* AI ASSISTANT */}
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: "#fff" }}>
            AI Assistant
          </Text>
          <Button
            title="Open AI Assistant"
            onPress={() => navigation.navigate("Assistant")}
          />
        </View>

        {/* WALLET & NFT SECTION */}
        <View style={{ marginTop: 24 }}>
          <Text style={{ fontWeight: "600", fontSize: 16, color: "#fff" }}>
            Wallet
          </Text>

          <Text style={{ color: "#9ca3af", marginTop: 4 }}>
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
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
