// apps/mobile/src/screens/ProfileDOBScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, TextInput, Button, Alert } from "react-native";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";

function calculateAge(dob: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1; // JS months 0-11
  const day = Number(m[3]);
  const birth = new Date(year, month, day);
  if (Number.isNaN(birth.getTime())) return null;

  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const mDiff = today.getMonth() - birth.getMonth();
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export default function ProfileDOBScreen() {
  const [dob, setDob] = useState("2010-05-12");
  const [loading, setLoading] = useState(false);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", uid));
        const data = snap.data() as any | undefined;
        if (data?.birthDate) {
          setDob(data.birthDate);
        }
      } catch {
        // ignore
      }
    })();
  }, [uid]);

  async function save() {
    if (!uid) {
      Alert.alert("Auth", "No user");
      return;
    }

    const age = calculateAge(dob.trim());
    if (age === null || age < 0 || age > 120) {
      Alert.alert(
        "Invalid date",
        "Please enter a valid date in format YYYY-MM-DD."
      );
      return;
    }

    const isAdult = age >= 18;

    try {
      setLoading(true);
      await setDoc(
        doc(db, "users", uid),
        {
          birthDate: dob.trim(),
          age,
          isAdult,
          dobUpdatedAt: Date.now(),
        },
        { merge: true }
      );
      Alert.alert(
        "Profile updated",
        `Age: ${age}, adult: ${isAdult ? "yes" : "no"}`
      );
    } catch (e: any) {
      Alert.alert("Error", e?.message ?? "Failed to save birth date");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0b0c0f" }}>
      <Text style={{ color: "#ffffff", fontWeight: "700", fontSize: 18 }}>
        Date of birth
      </Text>
      <Text style={{ color: "#9ca3af", marginTop: 4 }}>
        Used to apply age-based wallet rules and child protection limits.
      </Text>

      <Text style={{ color: "#e5e7eb", marginTop: 16 }}>
        Date (YYYY-MM-DD)
      </Text>
      <TextInput
        value={dob}
        onChangeText={setDob}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        style={{
          borderWidth: 1,
          borderColor: "#374151",
          padding: 8,
          borderRadius: 8,
          color: "#f9fafb",
          marginTop: 4,
        }}
      />

      <View style={{ marginTop: 16 }}>
        <Button title={loading ? "Saving..." : "Save"} onPress={save} />
      </View>
    </View>
  );
}
