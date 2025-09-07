import { useEffect, useState } from "react";
import { View, Text, Button, Alert, FlatList } from "react-native";
import { auth, db } from "../lib/firebase";
import { collection, doc, getDoc, getDocs, setDoc, increment } from "firebase/firestore";

export default function FamilyChildrenScreen(){
  const [fid, setFid] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{uid:string, locked:number}>>([]);

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;
      const u = await getDoc(doc(db, "users", uid));
      const familyId = u.data()?.familyId ?? null;
      setFid(familyId);
      if (!familyId) return;

      const snap = await getDocs(collection(db, "families", familyId, "vault", "locked"));
      const arr = snap.docs.map(d => ({ uid: d.id, locked: (d.data()?.pointsLocked ?? 0) as number }));
      setItems(arr);
    })();
  }, []);

  const releaseToPersonal = async (childUid: string, points: number) => {
    if (!fid) return;
    if (!points || points <= 0) return;

    // списываем из locked, начисляем в balances/{uid}
    await setDoc(doc(db, "families", fid, "vault", "locked", childUid), { pointsLocked: increment(-points) }, { merge: true });
    await setDoc(doc(db, "balances", childUid), { pointsTotal: increment(points) }, { merge: true });
    Alert.alert("Done", `Released ${points} points to personal balance`);
  };

  return (
    <View style={{ padding:24, gap:12, flex:1 }}>
      <Text style={{ fontWeight:"700", fontSize:18 }}>Children & Locked balances</Text>
      <FlatList
        data={items}
        keyExtractor={(i)=>i.uid}
        renderItem={({item}) => (
          <View style={{ paddingVertical:8 }}>
            <Text>- {item.uid.slice(0,6)}… : {item.locked} pts locked</Text>
            <Button title="Release 100 → personal" onPress={() => releaseToPersonal(item.uid, 100)} />
          </View>
        )}
        ListEmptyComponent={<Text style={{ color:"#666" }}>No locked balances</Text>}
      />
    </View>
  );
}
