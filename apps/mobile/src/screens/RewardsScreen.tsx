import * as React from "react";
import { useEffect, useState } from "react";
import { View, Text, Button, ScrollView, FlatList } from "react-native";
import { auth, db } from "../firebase";
import { collection, doc, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { fn } from "../lib/functionsClient";

type DailyReward = {
  date: string;
  uid: string;
  subscription: "free" | "plus" | "pro";
  stepsCounted: number;
  multiplier: number;
  rateDay: number;
  gadEarned: string;
  dryRun: boolean;
  createdAt: number;
};

export default function RewardsScreen() {
  // Points balance
  const [points, setPoints] = useState<number>(0);

  // Today + recent days
  const [today, setToday] = useState<DailyReward | null>(null);
  const [recent, setRecent] = useState<DailyReward[]>([]);
  const [summary, setSummary] = useState<{ lastDate?: string; lastGadPreview?: string } | null>(null);

  // Compatibility: list sorted by updatedAt (up to 30)
  const [days, setDays] = useState<Array<{ id: string; points?: number; steps?: number }>>([]);

  const uid = auth.currentUser?.uid ?? "demo-uid";

  useEffect(() => {
    // Points balance
    const bRef = doc(db, "balances", uid);
    const unsub1 = onSnapshot(bRef, (snap) => setPoints((snap.data()?.pointsTotal ?? 0) as number));

    // Last 7 days (by date)
    const dRefByDate = collection(db, "rewards", uid, "days");
    const unsub2 = onSnapshot(query(dRefByDate, orderBy("date", "desc"), limit(7)), (qs) => {
      const rows: DailyReward[] = qs.docs.map((d) => d.data() as DailyReward);
      setRecent(rows);
      setToday(rows[0] ?? null);
    });

    // Summary
    const sRef = doc(db, "rewards", uid);
    const unsub3 = onSnapshot(sRef, (d) => {
      setSummary((d.exists() ? (d.data() as any) : null) as any);
    });

    // UpdatedAt list (up to 30)
    const dRefByUpdated = collection(db, "rewards", uid, "days");
    const unsub4 = onSnapshot(query(dRefByUpdated, orderBy("updatedAt", "desc"), limit(30)), (qs) =>
      setDays(qs.docs.map((d) => ({ id: d.id, ...(d.data() as any) })))
    );

    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [uid]);

  async function runDry() {
    try {
      const call = fn<unknown, { ok: boolean; processed: number; date: string }>("stepEngineRunNow");
      const res = await call({});
      console.log("runDry", res.data);
    } catch (e) {
      console.log("runDry error", e);
    }
  }

  return (
    <ScrollView style={{ padding: 16 }}>
      {/* Points balance */}
      <View style={{ marginBottom: 12, padding: 12, borderRadius: 10, backgroundColor: "#121319" }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>GAD Points</Text>
        <Text style={{ color: "#aaa", marginTop: 6 }}>
          Total balance: {points.toLocaleString("en-US")} GAD Points
        </Text>
      </View>

      {/* Today */}
      <View style={{ marginTop: 4, padding: 12, borderRadius: 10, backgroundColor: "#121319" }}>
        <Text style={{ color: "#ccc" }}>Today</Text>
        {today ? (
          <View>
            <Text style={{ color: "#fff", marginTop: 4 }}>
              {today.date} • {today.subscription.toUpperCase()}
            </Text>
            <Text style={{ color: "#aaa", marginTop: 4 }}>
              Steps: {today.stepsCounted} • Multiplier: ×{today.multiplier} • Rate: {today.rateDay}
            </Text>
            <Text style={{ color: "#4ade80", marginTop: 4 }}>
              GAD preview: {today.gadEarned}
            </Text>
          </View>
        ) : (
          <Text style={{ color: "#888", marginTop: 4 }}>No data for today</Text>
        )}
      </View>

      {/* Summary */}
      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#121319" }}>
        <Text style={{ color: "#ccc" }}>Summary</Text>
        <Text style={{ color: "#aaa", marginTop: 4 }}>
          Last date: {summary?.lastDate ?? "—"} • Preview: {summary?.lastGadPreview ?? "—"}
        </Text>
      </View>

      {/* Last days (by date) */}
      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#121319" }}>
        <Text style={{ color: "#ccc" }}>Recent days</Text>
        {recent.map((r) => (
          <View key={r.date} style={{ marginTop: 8 }}>
            <Text style={{ color: "#fff" }}>{r.date}</Text>
            <Text style={{ color: "#aaa" }}>
              {r.stepsCounted} steps • mult {r.multiplier} • rate {r.rateDay} → {r.gadEarned} GAD
            </Text>
          </View>
        ))}
      </View>

      {/* Compatibility list */}
      <View style={{ marginTop: 12, padding: 12, borderRadius: 10, backgroundColor: "#121319" }}>
        <Text style={{ color: "#ccc" }}>Recent days (by updatedAt)</Text>
        {days.length ? (
          <FlatList
            data={days}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <Text style={{ color: "#aaa", marginTop: 6 }}>
                {item.id}: {item.points ?? 0} pts ({(item.steps ?? 0).toLocaleString("en-US")} steps)
              </Text>
            )}
          />
        ) : (
          <Text style={{ color: "#666", marginTop: 6 }}>No rewards yet</Text>
        )}
      </View>

      <View style={{ marginTop: 16 }}>
        <Button title="Run dry-run now" onPress={runDry} />
      </View>
    </ScrollView>
  );
}
