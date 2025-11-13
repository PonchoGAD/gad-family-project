// apps/mobile/src/screens/PrivacyScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Switch, Alert } from "react-native";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

export default function PrivacyScreen() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState<boolean>(false);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const data = snap.data() as any | undefined;
        if (data && typeof data.geoEnabled === "boolean") {
          setEnabled(data.geoEnabled);
        }
      } catch {
        // ignore, keep default
      }
    })();
  }, [uid]);

  async function toggle(v: boolean) {
    if (!uid) {
      Alert.alert("Auth", "No user");
      return;
    }
    setEnabled(v);
    setLoading(true);
    try {
      await setDoc(
        doc(db, "users", uid),
        { geoEnabled: v, geoUpdatedAt: Date.now() },
        { merge: true }
      );
    } catch (e: any) {
      setEnabled(!v);
      Alert.alert("Error", e?.message ?? "Failed to update preference");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        backgroundColor: "#0b0c0f",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 16 }}>
          Location sharing
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4, fontSize: 13 }}>
          Control whether GAD Family can store your location pings for family
          safety features.
        </Text>
        {!uid && (
          <Text style={{ color: "#f97316", marginTop: 6, fontSize: 12 }}>
            You are not signed in. Preferences will not be saved.
          </Text>
        )}
      </View>

      <Switch
        value={enabled}
        onValueChange={toggle}
        disabled={loading || !uid}
      />
    </View>
  );
}
