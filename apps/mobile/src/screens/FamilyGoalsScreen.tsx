// apps/mobile/src/screens/FamilyGoalsScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Pressable,
  Alert,
} from "react-native";
import { auth, db } from "../firebase";
import {
  doc,
  collection,
  onSnapshot,
  setDoc,
  serverTimestamp,
  orderBy,
  query,
} from "firebase/firestore";
import { getCurrentUserFamilyId } from "../lib/families";

export default function FamilyGoalsScreen() {
  const [fid, setFid] = useState<string | null>(null);
  const [goals, setGoals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState("");

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserFamilyId();
      if (!id) {
        Alert.alert("Goals", "No family found");
        setLoading(false);
        return;
      }

      setFid(id);
      const coll = collection(db, "families", id, "goals");
      const q = query(coll, orderBy("createdAt", "desc"));

      const unsub = onSnapshot(
        q,
        (snap) => {
          const arr: any[] = [];
          snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
          setGoals(arr);
          setLoading(false);
        },
        () => setLoading(false)
      );

      return () => unsub();
    })();
  }, []);

  async function handleCreateGoal() {
    if (!fid) return;
    const t = newTitle.trim();
    const target = Number(newTarget || "0");
    if (!t || target <= 0) {
      Alert.alert("Goals", "Enter title + target");
      return;
    }

    try {
      const ref = doc(collection(db, "families", fid, "goals"));
      await setDoc(ref, {
        title: t,
        targetPoints: target,
        currentPoints: 0,
        status: "active",
        createdAt: serverTimestamp(),
      });
      setNewTitle("");
      setNewTarget("");
    } catch (e: any) {
      Alert.alert("Goals", e?.message ?? "Failed to create goal");
    }
  }

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
          Loading goals…
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
        Family Goals
      </Text>

      {goals.map((g) => {
        const percent =
          g.targetPoints > 0
            ? Math.min(100, Math.round((g.currentPoints / g.targetPoints) * 100))
            : 0;

        return (
          <View
            key={g.id}
            style={{
              backgroundColor: "#0f172a",
              padding: 14,
              borderRadius: 16,
              marginBottom: 12,
            }}
          >
            <Text
              style={{ color: "#f9fafb", fontSize: 16, fontWeight: "700" }}
            >
              {g.title}
            </Text>
            <Text
              style={{ color: "#9ca3af", marginTop: 4, fontSize: 13 }}
            >
              {g.currentPoints?.toLocaleString("en-US")} /{" "}
              {g.targetPoints?.toLocaleString("en-US")} points ({percent}%)
            </Text>

            <View
              style={{
                height: 6,
                backgroundColor: "#1f2937",
                borderRadius: 999,
                marginTop: 8,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  height: "100%",
                  width: `${percent}%`,
                  backgroundColor: "#22c55e",
                }}
              />
            </View>
          </View>
        );
      })}

      {/* CREATE */}
      <View
        style={{
          backgroundColor: "#0f172a",
          padding: 14,
          borderRadius: 16,
          marginTop: 16,
        }}
      >
        <Text style={{ color: "#9ca3af", marginBottom: 6 }}>Create goal</Text>

        <TextInput
          placeholder="Goal title"
          placeholderTextColor="#6b7280"
          value={newTitle}
          onChangeText={setNewTitle}
          style={{
            backgroundColor: "#0b1120",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            color: "#f9fafb",
            marginBottom: 8,
          }}
        />

        <TextInput
          placeholder="Target points"
          placeholderTextColor="#6b7280"
          keyboardType="numeric"
          value={newTarget}
          onChangeText={setNewTarget}
          style={{
            backgroundColor: "#0b1120",
            borderRadius: 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            color: "#f9fafb",
            marginBottom: 12,
          }}
        />

        <Pressable
          onPress={handleCreateGoal}
          style={{
            paddingVertical: 10,
            backgroundColor: "#3b82f6",
            borderRadius: 999,
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: "#fff",
              fontWeight: "700",
              fontSize: 14,
            }}
          >
            Create
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
