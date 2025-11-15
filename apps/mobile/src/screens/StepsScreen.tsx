// apps/mobile/src/screens/StepsScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, Button, Platform } from "react-native";
import { Pedometer } from "expo-sensors";
import { auth, db } from "../firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { fn } from "../lib/functionsClient";

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function StepsScreen() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [steps, setSteps] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string>("");

  // uid: auth или demo-режим
  const uid = auth.currentUser?.uid ?? "demo-uid";

  // Читаем шаги с начала суток
  async function refreshSteps() {
    try {
      setLoading(true);
      setSyncMessage("");

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();

      const res = await Pedometer.getStepCountAsync(start, end);
      setSteps(res.steps ?? 0);
    } catch (e) {
      console.log("refreshSteps error", e);
      setSyncMessage("Cannot read steps on this device.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    (async () => {
      const available = await Pedometer.isAvailableAsync();
      setIsAvailable(available);
      if (available) {
        await refreshSteps();
      } else {
        setSyncMessage("Step counting is not available on this device.");
      }
    })();
  }, []);

  // Сохранить шаги в Firestore
  async function saveToCloud() {
    try {
      setLoading(true);
      setSyncMessage("");

      const dateId = todayKey();
      const ref = doc(db, "dailySteps", uid, dateId);

      await setDoc(
        ref,
        {
          steps,
          updatedAt: serverTimestamp(),
          // дополнительные поля по желанию:
          platform: Platform.OS,
        },
        { merge: true }
      );

      setSyncMessage("Steps synced to cloud.");
    } catch (e) {
      console.log("saveToCloud error", e);
      setSyncMessage("Failed to sync steps to cloud.");
    } finally {
      setLoading(false);
    }
  }

  // Сохранить шаги и запустить dry-run конверсии в GAD Points
  async function syncAndPreviewRewards() {
    try {
      setLoading(true);
      setSyncMessage("");

      await saveToCloud();

      const call = fn<unknown, { ok: boolean; processed: number; date: string }>(
        "stepEngineRunNow"
      );
      const res = await call({});
      console.log("stepEngineRunNow", res.data);
      setSyncMessage(
        `Dry-run complete for ${res.data?.date ?? "today"}. Check Rewards tab.`
      );
    } catch (e) {
      console.log("syncAndPreviewRewards error", e);
      setSyncMessage("Error while running rewards dry-run.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#000" }}>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
        Steps tracker
      </Text>

      <Text style={{ color: "#9ca3af", marginTop: 6 }}>
        Today&apos;s steps are read from your device and can be synced to the
        GAD backend. The backend converts steps → GAD Points once per day.
      </Text>

      <View
        style={{
          marginTop: 20,
          padding: 16,
          borderRadius: 12,
          backgroundColor: "#111827",
        }}
      >
        <Text style={{ color: "#e5e7eb", fontSize: 16, fontWeight: "600" }}>
          Today
        </Text>
        <Text
          style={{
            color: "#4ade80",
            fontSize: 32,
            fontWeight: "700",
            marginTop: 8,
          }}
        >
          {isAvailable === false
            ? "Not available"
            : loading
            ? "Loading…"
            : `${steps.toLocaleString("en-US")} steps`}
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4, fontSize: 12 }}>
          Data source: device pedometer
        </Text>
      </View>

      <View style={{ marginTop: 24, gap: 12 }}>
        <Button
          title="Refresh steps"
          onPress={refreshSteps}
          disabled={!isAvailable || loading}
        />
        <View style={{ height: 8 }} />
        <Button
          title="Sync steps to cloud"
          onPress={saveToCloud}
          disabled={!isAvailable || loading}
        />
        <View style={{ height: 8 }} />
        <Button
          title="Sync & preview rewards"
          onPress={syncAndPreviewRewards}
          disabled={!isAvailable || loading}
        />
      </View>

      {!!syncMessage && (
        <Text
          style={{
            color: "#9ca3af",
            marginTop: 16,
            fontSize: 13,
          }}
        >
          {syncMessage}
        </Text>
      )}

      {Platform.OS === "ios" && (
        <Text style={{ color: "#6b7280", marginTop: 16, fontSize: 12 }}>
          On iOS you may need to enable Motion & Fitness access for Expo Go /
          your app in system Settings.
        </Text>
      )}
    </View>
  );
}
