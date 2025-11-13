import { View, Text, Button, Alert } from "react-native";
import { Pedometer } from "expo-sensors";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import {
  doc,
  setDoc,
  serverTimestamp,
  getDoc,
  increment,
  addDoc,
  collection,
} from "firebase/firestore";
import { getOrCreateWallet } from "../lib/wallet";
import { getAge, getAgeTier } from "../lib/age";

// Date key used across Firestore + step engine: YYYY-MM-DD
function ymd(d = new Date()) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function StepsScreen() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [todaySteps, setTodaySteps] = useState<number>(0);

  useEffect(() => {
    (async () => {
      try {
        // Ensure anonymous auth exists
        if (!auth.currentUser) {
          await signInAnonymously(auth);
        }

        const avail = await Pedometer.isAvailableAsync();
        setIsAvailable(avail);
        if (!avail) return;

        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();

        const res = await Pedometer.getStepCountAsync(start, end);
        setTodaySteps(res.steps);
      } catch (e: any) {
        console.warn("Steps init error", e?.message ?? String(e));
      }
    })();
  }, []);

  const saveToFirestore = async () => {
    try {
      // Ensure user
      let user = auth.currentUser;
      if (!user) {
        const cred = await signInAnonymously(auth);
        user = cred.user;
      }
      const uid = user?.uid;
      if (!uid) {
        Alert.alert("Auth", "No user");
        return;
      }

      // Local wallet address (generated per-device)
      const wallet = await getOrCreateWallet();
      const addr = wallet.address;

      const dayKey = ymd();

      // 1) Daily steps document
      await setDoc(
        doc(db, "steps", uid, "days", dayKey),
        {
          steps: todaySteps,
          address: addr,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2) Points from steps (basic rule: 1 point per 100 steps)
      const points = Math.floor(todaySteps / 100);

      // 3) Profile → age & family
      const userRef = doc(db, "users", uid);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data() || {};

      const age = getAge(userData.birthDate);
      const tier = getAgeTier(age); // "child" | "teen" | "adult"
      const fid = userData.familyId as string | undefined;

      // 4) Distribution logic
      if (fid) {
        const familyPortion = Math.floor(points * 0.8);
        const personalPortion = points - familyPortion;

        // Family balance + ledger entry
        await setDoc(
          doc(db, "familyBalances", fid),
          { pointsTotal: increment(familyPortion), updatedAt: serverTimestamp() },
          { merge: true }
        );

        await addDoc(collection(db, "families", fid, "treasury", "ledger"), {
          type: "EARN_STEPS",
          userId: uid,
          points: familyPortion,
          steps: todaySteps,
          at: serverTimestamp(),
        });

        if (tier === "child") {
          // Child personal part stays locked in family vault
          await setDoc(
            doc(db, "families", fid, "vault", "locked", uid),
            { pointsLocked: increment(personalPortion), updatedAt: serverTimestamp() },
            { merge: true }
          );
        } else {
          // Teen / Adult → personal balance
          await setDoc(
            doc(db, "balances", uid),
            { pointsTotal: increment(personalPortion), updatedAt: serverTimestamp() },
            { merge: true }
          );
        }

        // Per-user rewards history
        await setDoc(
          doc(db, "rewards", uid, "days", dayKey),
          {
            steps: todaySteps,
            points,
            updatedAt: serverTimestamp(),
            familyId: fid,
            tier,
          },
          { merge: true }
        );

        const msg =
          tier === "child"
            ? `+${familyPortion} family, +${personalPortion} locked (child)`
            : `+${familyPortion} family, +${personalPortion} personal`;

        Alert.alert("Saved", msg);
      } else {
        // No family yet → everything in personal / locked depending on age tier
        if (tier === "child") {
          await setDoc(
            doc(db, "lockedBalances", uid),
            { pointsLocked: increment(points), updatedAt: serverTimestamp() },
            { merge: true }
          );
        } else {
          await setDoc(
            doc(db, "balances", uid),
            { pointsTotal: increment(points), updatedAt: serverTimestamp() },
            { merge: true }
          );
        }

        await setDoc(
          doc(db, "rewards", uid, "days", dayKey),
          {
            steps: todaySteps,
            points,
            updatedAt: serverTimestamp(),
            familyId: null,
            tier,
          },
          { merge: true }
        );

        const msg =
          tier === "child"
            ? `+${points} locked (child)`
            : `+${points} personal`;
        Alert.alert("Saved", msg);
      }
    } catch (e: any) {
      console.error("saveToFirestore error", e);
      Alert.alert("Error", e?.message ?? "Failed to save steps");
    }
  };

  return (
    <View style={{ padding: 24, gap: 12, flex: 1, backgroundColor: "#0b0c0f" }}>
      <Text style={{ fontWeight: "700", fontSize: 16, color: "#fff" }}>
        Steps
      </Text>
      <Text style={{ color: "#9ca3af" }}>
        Available: {String(isAvailable)}
      </Text>
      <Text style={{ color: "#e5e7eb" }}>
        Today: {todaySteps.toLocaleString("en-US")} steps
      </Text>

      <View style={{ marginTop: 12 }}>
        <Button title="Save to Firestore" onPress={saveToFirestore} />
      </View>
    </View>
  );
}
