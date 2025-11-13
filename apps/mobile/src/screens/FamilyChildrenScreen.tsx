// apps/mobile/src/screens/FamilyChildrenScreen.tsx
import { useEffect, useState } from "react";
import { View, Text, Button, Alert, FlatList } from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  increment,
} from "firebase/firestore";
import { signInAnonymously } from "firebase/auth";

type LockedItem = {
  uid: string;
  locked: number;
};

export default function FamilyChildrenScreen() {
  const [fid, setFid] = useState<string | null>(null);
  const [items, setItems] = useState<LockedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        let user = auth.currentUser;
        if (!user) {
          const res = await signInAnonymously(auth);
          user = res.user;
        }
        const uid = user.uid;

        const uSnap = await getDoc(doc(db, "users", uid));
        const familyId = (uSnap.data() as any)?.familyId ?? null;
        setFid(familyId);

        if (!familyId) {
          setItems([]);
          return;
        }

        const snap = await getDocs(
          collection(db, "families", familyId, "vault", "locked")
        );
        const arr: LockedItem[] = snap.docs.map((d) => ({
          uid: d.id,
          locked: (d.data()?.pointsLocked ?? 0) as number,
        }));
        setItems(arr);
      } catch (e: any) {
        console.log("FamilyChildren init error", e);
        Alert.alert("Error", e?.message ?? "Failed to load locked balances");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const releaseToPersonal = async (childUid: string, points: number) => {
    try {
      if (!fid) return;
      if (!points || points <= 0) return;

      await setDoc(
        doc(db, "families", fid, "vault", "locked", childUid),
        { pointsLocked: increment(-points) },
        { merge: true }
      );
      await setDoc(
        doc(db, "balances", childUid),
        { pointsTotal: increment(points) },
        { merge: true }
      );
      Alert.alert("Done", `Released ${points} points to personal balance`);
    } catch (e: any) {
      console.log("releaseToPersonal error", e);
      Alert.alert("Error", e?.message ?? "Failed to release points");
    }
  };

  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        backgroundColor: "#0b0f17",
      }}
    >
      <Text
        style={{
          fontWeight: "700",
          fontSize: 20,
          color: "#ffffff",
          marginBottom: 12,
        }}
      >
        Children & Locked balances
      </Text>

      {!fid && !loading && (
        <Text style={{ color: "#9CA3AF", marginBottom: 8 }}>
          You are not in a family yet. Create or join a family first.
        </Text>
      )}

      <View
        style={{
          flex: 1,
          borderRadius: 12,
          padding: 12,
          backgroundColor: "#111827",
        }}
      >
        {loading ? (
          <Text style={{ color: "#6B7280" }}>Loading…</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.uid}
            renderItem={({ item }) => (
              <View style={{ paddingVertical: 8 }}>
                <Text style={{ color: "#E5E7EB" }}>
                  • {item.uid.slice(0, 6)}… — {item.locked} pts locked
                </Text>
                <View style={{ marginTop: 4 }}>
                  <Button
                    title="Release 100 → personal"
                    onPress={() => releaseToPersonal(item.uid, 100)}
                  />
                </View>
              </View>
            )}
            ListEmptyComponent={
              <Text style={{ color: "#6B7280" }}>
                No locked balances for children
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}
