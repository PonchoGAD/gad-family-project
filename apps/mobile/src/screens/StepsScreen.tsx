import { View, Text, Button, Alert } from "react-native";
import { Pedometer } from "expo-sensors";
import { useEffect, useState } from "react";
import { auth, db } from "../firebase";
import { signInAnonymously } from "firebase/auth";
import { doc, setDoc, serverTimestamp, getDoc, increment, addDoc, collection } from "firebase/firestore";
import { getAddress } from "../lib/wallet";
import { getAge, getAgeTier } from "../lib/age";

function ymdUS(d = new Date()) {
  const y = d.getFullYear();
  const m = (d.getMonth() + 1).toString().padStart(2, "0");
  const day = d.getDate().toString().padStart(2, "0");
  return `${m}/${day}/${y}`;
}

export default function StepsScreen() {
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [todaySteps, setTodaySteps] = useState<number>(0);

  useEffect(() => {
    (async () => {
      if (!auth.currentUser) await signInAnonymously(auth);
      const avail = await Pedometer.isAvailableAsync();
      setIsAvailable(avail);
      if (!avail) return;
      const start = new Date(); start.setHours(0,0,0,0);
      const end = new Date();
      const res = await Pedometer.getStepCountAsync(start, end);
      setTodaySteps(res.steps);
    })();
  }, []);

const saveToFirestore = async () => {
  const uid = auth.currentUser?.uid;
  if (!uid) { Alert.alert("Auth", "No user"); return; }

  const addr = await getAddress();
  const dayKey = ymdUS();

  // 1) шаги за день
  await setDoc(
    doc(db, `steps/${uid}/days/${dayKey}`),
    { steps: todaySteps, address: addr, updatedAt: serverTimestamp() },
    { merge: true }
  );

  // 2) очки
  const points = Math.floor(todaySteps / 100);

  // 3) профиль → возраст и семья
  const userRef = doc(db, "users", uid);
  const userSnap = await getDoc(userRef);
  const user = userSnap.data() || {};
  const age = getAge(user.birthDate);
  const tier = getAgeTier(age);
  const fid = user.familyId as string | undefined;

  // 4) начисления
  if (fid) {
    const familyPortion = Math.floor(points * 0.8);
    const personalPortion = points - familyPortion;

    // Общая семейная доля — всегда в family balance + журнал
    await setDoc(
      doc(db, `familyBalances/${fid}`),
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
      // Личная доля ребёнка — в "лок", а не в баланс пользователя
      await setDoc(
        doc(db, "families", fid, "vault", "locked", uid),
        { pointsLocked: increment(personalPortion), updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else {
      // Teen/Adult — в личный баланс
      await setDoc(
        doc(db, `balances/${uid}`),
        { pointsTotal: increment(personalPortion), updatedAt: serverTimestamp() },
        { merge: true }
      );
    }

    // История пользователя
    await setDoc(
      doc(db, `rewards/${uid}/days/${dayKey}`),
      { steps: todaySteps, points, updatedAt: serverTimestamp(), familyId: fid, tier },
      { merge: true }
    );

    const msg =
      tier === "child"
        ? `+${familyPortion} family, +${personalPortion} locked (child)`
        : `+${familyPortion} family, +${personalPortion} personal`;
    Alert.alert("Saved", msg);
  } else {
    // нет семьи → всё в личный (или locked, если child? оставим всё в личный ledger off-chain)
    if (tier === "child") {
      await setDoc(
        doc(db, `lockedBalances/${uid}`),
        { pointsLocked: increment(points), updatedAt: serverTimestamp() },
        { merge: true }
      );
    } else {
      await setDoc(
        doc(db, `balances/${uid}`),
        { pointsTotal: increment(points), updatedAt: serverTimestamp() },
        { merge: true }
      );
    }
    await setDoc(
      doc(db, `rewards/${uid}/days/${dayKey}`),
      { steps: todaySteps, points, updatedAt: serverTimestamp(), familyId: null, tier },
      { merge: true }
    );
    Alert.alert("Saved", tier === "child" ? `+${points} locked (child)` : `+${points} personal`);
  }
};

  return (
    <View style={{ padding: 24, gap: 12 }}>
      <Text style={{ fontWeight: "700", fontSize: 16 }}>Steps</Text>
      <Text>Available: {String(isAvailable)}</Text>
      <Text>Today: {todaySteps.toLocaleString("en-US")} steps</Text>
      <Button title="Save to Firestore" onPress={saveToFirestore} />
    </View>
  );
}
