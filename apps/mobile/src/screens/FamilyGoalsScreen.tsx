// ---------------------------------------------------------------
// apps/mobile/src/screens/FamilyGoalsScreen.tsx
// Family Missions / Goals (Demo-aware)
// • unified GAD theme
// • safe Firestore logic
// • demo completion flow (без реальных записей)
// ---------------------------------------------------------------

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
  updateDoc,
  increment,
} from "firebase/firestore";

import { getCurrentUserFamilyId } from "../lib/families";
import { todayKey } from "../lib/steps";
import {
  useActiveUid,
  useActiveFamilyId,
  useIsDemo,
} from "../demo/DemoContext";
import { useTheme } from "../wallet/ui/theme";

// ---------------------------------------------------------------
// Types
// ---------------------------------------------------------------
type FamilyGoal = {
  id: string;
  title: string;
  targetPoints: number;
  currentPoints: number;
  status: "active" | "completed" | "paused";
  createdAt?: any;
  completedAt?: any;
};

// ---------------------------------------------------------------
// Screen
// ---------------------------------------------------------------
export default function FamilyGoalsScreen() {
  const G = useTheme();
  const { uid: ctxUid } = useActiveUid();
  const { fid: ctxFid } = useActiveFamilyId();
  const isDemo = useIsDemo();

  const uid = ctxUid ?? auth.currentUser?.uid ?? null;

  const [fid, setFid] = useState<string | null>(ctxFid ?? null);
  const [goals, setGoals] = useState<FamilyGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const [newTitle, setNewTitle] = useState("");
  const [newTarget, setNewTarget] = useState("");

  // -------------------------------------------------------------
  // Load goals & familyId (demo vs real)
  // -------------------------------------------------------------
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        // DEMO: локальная витрина миссий
        if (isDemo) {
          const demoFid = ctxFid ?? "demo-family";
          setFid(demoFid);

          const demoGoals: FamilyGoal[] = [
            {
              id: "demo-goal-1",
              title: "New bike for kid",
              targetPoints: 50_000,
              currentPoints: 32_000,
              status: "active",
            },
            {
              id: "demo-goal-2",
              title: "Family weekend trip",
              targetPoints: 80_000,
              currentPoints: 80_000,
              status: "completed",
            },
          ];

          setGoals(demoGoals);
          setLoading(false);
          return;
        }

        // REAL: Firestore
        let realFid = ctxFid ?? null;

        if (!realFid) {
          realFid = (await getCurrentUserFamilyId()) ?? null;
        }

        if (!realFid) {
          setLoading(false);
          Alert.alert("Goals", "No family found");
          return;
        }

        setFid(realFid);

        const coll = collection(db, "families", realFid, "goals");
        const qGoals = query(coll, orderBy("createdAt", "desc"));

        unsub = onSnapshot(
          qGoals,
          (snap) => {
            const arr: FamilyGoal[] = snap.docs.map((d) => {
              const v = d.data() as any;
              return {
                id: d.id,
                title: v.title ?? "Goal",
                targetPoints: Number(v.targetPoints ?? 0),
                currentPoints: Number(v.currentPoints ?? 0),
                status: (v.status as any) ?? "active",
                createdAt: v.createdAt,
                completedAt: v.completedAt,
              };
            });

            setGoals(arr);
            setLoading(false);
          },
          () => setLoading(false)
        );
      } catch (e) {
        console.log("Goals init error", e);
        setLoading(false);
      }
    })();

    return () => unsub && unsub();
  }, [ctxFid, isDemo]);

  // -------------------------------------------------------------
  // Create Goal
  // -------------------------------------------------------------
  async function handleCreateGoal() {
    if (!fid) return;

    const t = newTitle.trim();
    const target = Number(newTarget);

    if (!t || !Number.isFinite(target) || target <= 0) {
      return Alert.alert("Goals", "Enter title and positive target points");
    }

    try {
      if (isDemo) {
        // DEMO: создаём только в локальном состоянии
        const newGoal: FamilyGoal = {
          id: `demo-${Date.now()}`,
          title: t,
          targetPoints: target,
          currentPoints: 0,
          status: "active",
        };
        setGoals((prev) => [newGoal, ...prev]);
        setNewTitle("");
        setNewTarget("");
        Alert.alert(
          "Goals (demo)",
          "Mission created locally. In production it will be stored for your family."
        );
        return;
      }

      // REAL: Firestore
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

  // -------------------------------------------------------------
  // Complete Goal (demo-aware)
  // -------------------------------------------------------------
  async function handleCompleteGoal(g: FamilyGoal) {
    try {
      if (!fid) return Alert.alert("Goals", "No family found");
      if (!uid) return Alert.alert("Auth", "No user");

      if (g.status === "completed") {
        return Alert.alert("Goal", "This mission is already completed.");
      }

      const award = Number(g.targetPoints) || 0;
      if (award <= 0) {
        return Alert.alert("Goal", "Target points must be positive.");
      }

      if (isDemo) {
        // DEMO: обновляем только локальное состояние
        setGoals((prev) =>
          prev.map((x) =>
            x.id === g.id
              ? {
                  ...x,
                  status: "completed",
                  currentPoints: award,
                }
              : x
          )
        );

        Alert.alert(
          "Mission completed (demo)",
          `Goal “${g.title}” completed.\n+${award} GAD Points (preview only, no real write).`
        );
        return;
      }

      // REAL: Firestore-поток начисления
      const goalRef = doc(db, "families", fid, "goals", g.id);

      // 1) Update goal
      await updateDoc(goalRef, {
        status: "completed",
        currentPoints: award,
        completedAt: serverTimestamp(),
      });

      const dateId = todayKey();

      // 2) Update balances
      const balanceRef = doc(db, "balances", uid);
      await setDoc(
        balanceRef,
        {
          pointsTotal: increment(award),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 3) Daily record
      const dayRef = doc(db, "rewards", uid, "days", dateId);
      await setDoc(
        dayRef,
        {
          points: increment(award),
          missionContribution: increment(award),
          missionTitle: g.title,
          sourceMission: true,
          updatedAt: serverTimestamp(),
          date: dateId,
        },
        { merge: true }
      );

      // 4) Summary
      const summaryRef = doc(db, "rewards", uid);
      await setDoc(
        summaryRef,
        {
          lastDate: dateId,
          lastGadPreview: String(award),
          lastUpdatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      Alert.alert(
        "Mission completed",
        `Goal “${g.title}” completed.\n+${award} GAD Points.`
      );
    } catch (e: any) {
      console.log("handleCompleteGoal error", e);
      Alert.alert("Goals", e?.message ?? "Failed to complete goal");
    }
  }

  // -------------------------------------------------------------
  // Loading screen
  // -------------------------------------------------------------
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: G.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={G.colors.accent} />
        <Text style={{ color: G.colors.textMuted, marginTop: 8 }}>
          Loading missions…
        </Text>
      </View>
    );
  }

  // -------------------------------------------------------------
  // Main UI
  // -------------------------------------------------------------
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
    >
      <Text
        style={{
          color: G.colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
        }}
      >
        Family Missions{isDemo ? " (demo)" : ""}
      </Text>

      <Text
        style={{ color: G.colors.textMuted, fontSize: 13, marginBottom: 16 }}
      >
        Missions are long-term goals for your family. Completing a mission in
        demo mode shows how points could flow into your GAD balance.
      </Text>

      {/* Goals list */}
      {goals.map((g) => {
        const target = g.targetPoints || 0;
        const current = g.currentPoints || 0;
        const percent =
          target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;
        const isDone = g.status === "completed";

        return (
          <View
            key={g.id}
            style={{
              backgroundColor: G.colors.card,
              padding: 16,
              borderRadius: 16,
              borderColor: G.colors.border,
              borderWidth: 1,
              marginBottom: 12,
            }}
          >
            {/* Header */}
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{
                  color: G.colors.text,
                  fontWeight: "700",
                  fontSize: 16,
                  flex: 1,
                  marginRight: 8,
                }}
              >
                {g.title}
              </Text>
              <Text
                style={{
                  color: isDone ? G.colors.accent : G.colors.warning,
                  fontSize: 12,
                  fontWeight: "600",
                }}
              >
                {isDone ? "Completed" : "Active"}
              </Text>
            </View>

            {/* Stats */}
            <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
              {current.toLocaleString("en-US")} /{" "}
              {target.toLocaleString("en-US")} GAD Points ({percent}%)
            </Text>

            {/* Progress bar */}
            <View
              style={{
                height: 6,
                backgroundColor: G.colors.input,
                borderRadius: 999,
                marginTop: 10,
                overflow: "hidden",
              }}
            >
              <View
                style={{
                  width: `${percent}%`,
                  height: "100%",
                  backgroundColor: isDone ? G.colors.accent : G.colors.primary,
                }}
              />
            </View>

            {/* Complete button */}
            {!isDone && (
              <Pressable
                onPress={() => handleCompleteGoal(g)}
                style={{
                  marginTop: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: G.colors.accent,
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    color: "#052e16",
                    fontWeight: "700",
                    fontSize: 14,
                  }}
                >
                  Complete mission{isDemo ? " (preview)" : ""}
                </Text>
              </Pressable>
            )}

            {isDone && (
              <Text
                style={{
                  color: G.colors.textMuted,
                  fontSize: 12,
                  marginTop: 10,
                }}
              >
                Mission already converted into GAD Points
                {isDemo ? " (demo preview)." : "."}
              </Text>
            )}
          </View>
        );
      })}

      {/* No missions */}
      {goals.length === 0 && (
        <Text style={{ color: G.colors.textMuted, marginBottom: 16 }}>
          No missions yet. Create your first goal below.
        </Text>
      )}

      {/* Create Goal */}
      <View
        style={{
          backgroundColor: G.colors.card,
          padding: 16,
          borderRadius: 16,
          borderColor: G.colors.border,
          borderWidth: 1,
          marginTop: 16,
        }}
      >
        <Text style={{ color: G.colors.textMuted, marginBottom: 6 }}>
          Create new mission
        </Text>

        <TextInput
          placeholder="Mission title"
          placeholderTextColor={G.colors.textMuted}
          value={newTitle}
          onChangeText={setNewTitle}
          style={{
            backgroundColor: G.colors.input,
            color: G.colors.text,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: G.colors.border,
            marginBottom: 8,
          }}
        />

        <TextInput
          placeholder="Target GAD Points"
          placeholderTextColor={G.colors.textMuted}
          keyboardType="numeric"
          value={newTarget}
          onChangeText={setNewTarget}
          style={{
            backgroundColor: G.colors.input,
            color: G.colors.text,
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: G.colors.border,
            marginBottom: 12,
          }}
        />

        <Pressable
          onPress={handleCreateGoal}
          style={{
            paddingVertical: 10,
            borderRadius: 999,
            backgroundColor: G.colors.primary,
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
            Create mission
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}
