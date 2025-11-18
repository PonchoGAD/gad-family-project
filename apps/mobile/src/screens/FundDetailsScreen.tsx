import React, { useEffect, useState } from "react";
import { View, Text, Alert, Button, ActivityIndicator } from "react-native";
import { RouteProp } from "@react-navigation/native";
import { doc, getDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../firebase";

type RouteParams = {
  FundDetails: {
    rid: string;
  };
};

type Props = {
  route: RouteProp<RouteParams, "FundDetails">;
  navigation: any;
};

export default function FundDetailsScreen({ route, navigation }: Props) {
  // FIX: безопасный доступ к параметрам
  const rid = route?.params?.rid ?? "";

  const [loading, setLoading] = useState(true);
  const [item, setItem] = useState<any | null>(null);

  async function load() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("No user");
      if (!rid) throw new Error("Missing request ID");

      const ref = doc(db, "exchangeFund", uid, "items", rid);
      const snap = await getDoc(ref);

      if (!snap.exists()) {
        Alert.alert("Exchange Fund", "Request not found");
        navigation.goBack();
        return;
      }

      setItem({ id: snap.id, ...(snap.data() as any) });
    } catch (e: any) {
      Alert.alert("Exchange Fund", e?.message ?? "Failed to load details");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      if (!rid) return;

      const ref = doc(db, "exchangeFund", uid, "items", rid);
      await deleteDoc(ref);

      Alert.alert("Exchange Fund", "Request deleted");
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Exchange Fund", e?.message ?? "Failed to delete");
    }
  }

  useEffect(() => {
    load();
  }, []);

  if (loading || !item) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0b0f17",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  const canDelete = item.status === "pending";

  return (
    <View style={{ flex: 1, backgroundColor: "#0b0f17", padding: 16 }}>
      <Text
        style={{
          fontSize: 20,
          fontWeight: "700",
          color: "#fff",
          marginBottom: 12,
        }}
      >
        Request Details
      </Text>

      <View
        style={{
          backgroundColor: "#111827",
          padding: 12,
          borderRadius: 12,
          marginBottom: 16,
        }}
      >
        <Text style={{ color: "#e5e7eb" }}>ID: {item.id}</Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Points: {item.points?.toLocaleString("en-US")}
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Status: {item.status}
        </Text>
        <Text style={{ color: "#9ca3af", marginTop: 4 }}>
          Wallet: {item.wallet ?? "—"}
        </Text>
        <Text style={{ color: "#6b7280", marginTop: 4, fontSize: 12 }}>
          {item.ts ? new Date(item.ts.seconds * 1000).toLocaleString() : "—"}
        </Text>
      </View>

      {canDelete && (
        <Button title="Delete request" color="#ef4444" onPress={handleDelete} />
      )}
    </View>
  );
}
