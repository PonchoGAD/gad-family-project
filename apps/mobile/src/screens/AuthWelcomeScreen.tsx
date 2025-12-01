// apps/mobile/src/screens/AuthWelcomeScreen.tsx
// ---------------------------------------------
// Первый экран онбординга:
//  - ensureAuth (анон/существующий)
//  - "Create account" → AuthRole
//  - "Continue as guest" → onboarded=true, role='guest' → MainTabs
// ---------------------------------------------

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ensureAuth } from '../lib/authClient';

type Props = {
  navigation: any;
};

export default function AuthWelcomeScreen({ navigation }: Props) {
  const [loading, setLoading] = useState(false);

  async function handleGuest() {
    try {
      setLoading(true);
      const user = await ensureAuth();
      if (!user) {
        throw new Error('Unable to init auth');
      }

      const ref = doc(db, 'users', user.uid);
      await setDoc(
        ref,
        {
          onboarded: true,
          role: 'guest',
        },
        { merge: true },
      );

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' as never }],
      });
    } catch (e) {
      console.log('[AuthWelcome] guest error', e);
      setLoading(false);
    }
  }

  function handleCreate() {
    navigation.navigate('AuthRole');
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#020617',
        padding: 24,
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: '#facc15',
          fontSize: 28,
          fontWeight: '800',
          marginBottom: 8,
        }}
      >
        GAD Family
      </Text>
      <Text
        style={{
          color: '#e5e7eb',
          fontSize: 18,
          fontWeight: '600',
          marginBottom: 12,
        }}
      >
        Family-first Move-to-Earn & Safety
      </Text>
      <Text
        style={{
          color: '#9ca3af',
          fontSize: 14,
          lineHeight: 20,
          marginBottom: 32,
        }}
      >
        Create a shared family space where every step becomes value,
        and every member stays connected and safe.
      </Text>

      <TouchableOpacity
        onPress={handleCreate}
        activeOpacity={0.9}
        style={{
          backgroundColor: '#facc15',
          paddingVertical: 14,
          borderRadius: 14,
          alignItems: 'center',
          marginBottom: 12,
        }}
      >
        <Text
          style={{
            color: '#020617',
            fontWeight: '700',
            fontSize: 16,
          }}
        >
          Create account
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={loading ? undefined : handleGuest}
        activeOpacity={0.85}
        style={{
          borderRadius: 14,
          paddingVertical: 12,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.6)',
        }}
      >
        {loading ? (
          <ActivityIndicator color="#facc15" />
        ) : (
          <Text
            style={{
              color: '#e5e7eb',
              fontSize: 14,
            }}
          >
            Continue as guest
          </Text>
        )}
      </TouchableOpacity>

      <Text
        style={{
          color: '#6b7280',
          fontSize: 12,
          marginTop: 16,
        }}
      >
        You can upgrade to full family account anytime.
      </Text>
    </View>
  );
}
