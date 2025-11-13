// apps/mobile/src/screens/HistoryScreen.tsx
import React, { useState } from "react";
import { View, Text, TextInput, Button, Alert, FlatList } from "react-native";
import { fn } from "../firebase";

type HistoryItem = {
  at: string;
  lat: number;
  lng: number;
  acc?: number | null;
};

export default function HistoryScreen() {
  const [targetUid, setTargetUid] = useState("");
  const [fromISO, setFromISO] = useState("2025-09-01T00:00:00.000Z");
  const [toISO, setToISO] = useState("2025-09-04T23:59:59.000Z");
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function load() {
    try {
      setLoading(true);
      const res: any = await fn.getLocationHistory({
        targetUid: targetUid.trim() || undefined,
        fromISO,
        toISO,
      });
      setItems((res?.data?.items ?? []) as HistoryItem[]);
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0b0c0f" }}>
      <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18 }}>
        Location history (debug)
      </Text>
      <Text style={{ color: "#9ca3af", marginTop: 4, marginBottom: 12 }}>
        Internal tool to inspect stored pings. In production this will be
        replaced with a family-friendly timeline view.
      </Text>

      <Text style={{ color: "#e5e7eb", marginTop: 8 }}>UID (optional)</Text>
      <TextInput
        value={targetUid}
        onChangeText={setTargetUid}
        placeholder="Leave empty to use current user"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#f9fafb",
          marginTop: 4,
        }}
      />

      <Text style={{ color: "#e5e7eb", marginTop: 12 }}>From (ISO)</Text>
      <TextInput
        value={fromISO}
        onChangeText={setFromISO}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#f9fafb",
          marginTop: 4,
        }}
      />

      <Text style={{ color: "#e5e7eb", marginTop: 12 }}>To (ISO)</Text>
      <TextInput
        value={toISO}
        onChangeText={setToISO}
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#f9fafb",
          marginTop: 4,
        }}
      />

      <View style={{ marginTop: 16 }}>
        <Button title={loading ? "Loading..." : "Load"} onPress={load} />
      </View>

      <FlatList
        style={{ marginTop: 16 }}
        data={items}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View
            style={{
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: "#111827",
            }}
          >
            <Text style={{ color: "#e5e7eb" }}>{item.at}</Text>
            <Text style={{ color: "#9ca3af", fontSize: 12 }}>
              {item.lat}, {item.lng} (±{item.acc ?? "?"} m)
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#6b7280", marginTop: 8 }}>
            No records for this range yet
          </Text>
        }
      />
    </View>
  );
}
