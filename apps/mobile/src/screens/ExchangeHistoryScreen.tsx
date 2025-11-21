// apps/mobile/src/screens/ExchangeHistoryScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  DocumentData,
} from "firebase/firestore";

export default function ExchangeHistoryScreen() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      setLoading(false);
      return;
    }

    const coll = collection(db, "exchangeFund", user.uid, "items");
    const q = query(coll, orderBy("ts", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const arr: any[] = [];
        snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
        setItems(arr);
        setLoading(false);
      },
      (err) => {
        console.error("exchange history error", err);
        setLoading(false);
        Alert.alert("Exchange", "Failed to load exchange history");
      }
    );

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>
          Loading history…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#020617" }}
      contentContainerStyle={{ padding: 16 }}
    >
      <Text
        style={{
          color: "#f9fafb",
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
        }}
      >
        Exchange History
      </Text>

      {items.length === 0 && (
        <View
          style={{
            backgroundColor: "#0f172a",
            padding: 16,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text style={{ color: "#e5e7eb" }}>No exchange history yet.</Text>
        </View>
      )}

      {items.map((it) => (
        <View
          key={it.id}
          style={{
            backgroundColor: "#0f172a",
            padding: 16,
            borderRadius: 16,
            marginBottom: 10,
            borderWidth: 1,
            borderColor: "rgba(148,163,184,0.4)",
          }}
        >
          <Text style={{ color: "#f9fafb", fontWeight: "700" }}>
            {it.points} points → {it.usdt} USDT
          </Text>

          <Text style={{ color: "#9ca3af", marginTop: 4, fontSize: 12 }}>
            Status: {it.status}
          </Text>

          <Text style={{ color: "#6b7280", marginTop: 4, fontSize: 12 }}>
            {it.ts ? new Date(it.ts.seconds * 1000).toLocaleString() : "—"}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}
