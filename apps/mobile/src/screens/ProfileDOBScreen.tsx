// apps/mobile/src/screens/ProfileDOBScreen.tsx

import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Alert } from 'react-native';
import { auth, db } from '../firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getAge } from '../lib/age';
import { useTheme } from '../wallet/ui/theme';

export default function ProfileDOBScreen() {
  const G = useTheme();

  const [dob, setDob] = useState('2010-05-12');
  const [loading, setLoading] = useState(false);
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', uid));
        const data = (snap.data() as any) || undefined;
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
      Alert.alert('Auth', 'No user');
      return;
    }

    const trimmed = dob.trim();

    const age = getAge(trimmed);
    if (age === null || age < 0 || age > 120) {
      Alert.alert(
        'Invalid date',
        'Please enter a valid date in format YYYY-MM-DD.',
      );
      return;
    }

    const isAdult = age >= 18;

    try {
      setLoading(true);
      await setDoc(
        doc(db, 'users', uid),
        {
          birthDate: trimmed,
          age,
          isAdult,
          dobUpdatedAt: Date.now(),
        },
        { merge: true },
      );
      Alert.alert(
        'Profile updated',
        `Age: ${age}, adult: ${isAdult ? 'yes' : 'no'}`,
      );
    } catch (e: any) {
      Alert.alert('Error', e?.message ?? 'Failed to save birth date');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View
      style={{
        flex: 1,
        padding: 16,
        backgroundColor: G.colors.bg,
      }}
    >
      <Text
        style={{
          color: G.colors.text,
          fontWeight: '700',
          fontSize: 18,
        }}
      >
        Date of birth
      </Text>
      <Text style={{ color: G.colors.textMuted, marginTop: 4 }}>
        Used to apply age-based wallet rules and child protection limits.
      </Text>

      <Text style={{ color: G.colors.text, marginTop: 16 }}>
        Date (YYYY-MM-DD)
      </Text>
      <TextInput
        value={dob}
        onChangeText={setDob}
        placeholder='YYYY-MM-DD'
        placeholderTextColor={G.colors.textMuted}
        autoCapitalize='none'
        style={{
          borderWidth: 1,
          borderColor: G.colors.border,
          padding: 8,
          borderRadius: 8,
          color: G.colors.text,
          marginTop: 4,
          backgroundColor: G.colors.card,
        }}
      />

      <View style={{ marginTop: 16 }}>
        <Button
          title={loading ? 'Saving...' : 'Save'}
          onPress={save}
          disabled={loading}
        />
      </View>
    </View>
  );
}
