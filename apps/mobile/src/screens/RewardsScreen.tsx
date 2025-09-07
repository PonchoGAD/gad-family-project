import { useEffect, useState } from "react";
import { View, Text, FlatList } from "react-native";
import { auth, db } from "../lib/firebase";
import { doc, onSnapshot, collection, query, orderBy, limit } from "firebase/firestore";

export default function RewardsScreen() {
  const [points, setPoints] = useState<number>(0);
  const [days, setDays] = useState<Array<{id:string, points:number, steps:number}>>([]);

  useEffect(() => {
    if (!auth.currentUser) return;
    const bRef = doc(db, "balances", auth.currentUser.uid);
    const unsub1 = onSnapshot(bRef, (snap) => setPoints((snap.data()?.pointsTotal ?? 0) as number));

    const dRef = collection(db, "rewards", auth.currentUser.uid, "days");
    const unsub2 = onSnapshot(query(dRef, orderBy("updatedAt","desc"), limit(30)), (qs) =>
      setDays(qs.docs.map(d => ({ id: d.id, ...(d.data() as any) })))
    );

    return () => { unsub1(); unsub2(); };
  }, []);

  return (
    <View style={{ padding: 24, gap: 12, flex: 1 }}>
      <Text style={{ fontWeight: "700", fontSize: 18 }}>GAD Points</Text>
      <Text>Total balance: {points.toLocaleString("en-US")} GAD Points</Text>
      <View style={{ height: 1, backgroundColor: "#ddd" }} />
      <Text style={{ fontWeight: "600" }}>Recent days</Text>
      <FlatList
        data={days}
        keyExtractor={(i)=>i.id}
        renderItem={({item}) => (
          <Text>{item.id}: {item.points} pts ({item.steps?.toLocaleString("en-US")} steps)</Text>
        )}
        ListEmptyComponent={<Text style={{ color:"#666" }}>No rewards yet</Text>}
      />
    </View>
  );
}
