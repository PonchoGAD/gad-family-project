// apps/mobile/src/screens/AuthRoleScreen.tsx
// ---------------------------------------------
// Экран выбора роли: Parent / Kid
//  - сохраняем role в users/{uid}
//  - onboarded=false
//  - дальше → AuthFamilyConnect
// ---------------------------------------------

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { auth, db } from '../firebase';
import { doc, setDoc } from 'firebase/firestore';
import { ensureAuth } from '../lib/authClient';

type Props = {
  navigation: any;
};

type Role = 'parent' | 'kid';

export default function AuthRoleScreen({ navigation }: Props) {
  const [loading, setLoading] = useState<Role | null>(null);

  async function chooseRole(role: Role) {
    try {
      setLoading(role);
      const user = await ensureAuth();
      const uid = user?.uid ?? auth.currentUser?.uid;
      if (!uid) throw new Error('No user');

      await setDoc(
        doc(db, 'users', uid),
        {
          role,
          onboarded: false,
        },
        { merge: true },
      );

      navigation.navigate('AuthFamilyConnect');
    } catch (e) {
      console.log('[AuthRole] error', e);
      setLoading(null);
    }
  }

  function renderBtn(label: string, role: Role, description: string) {
    const isLoading = loading === role;
    return (
      <TouchableOpacity
        onPress={isLoading ? undefined : () => chooseRole(role)}
        activeOpacity={0.9}
        style={{
          paddingVertical: 16,
          paddingHorizontal: 18,
          borderRadius: 16,
          backgroundColor: '#020617',
          borderWidth: 1,
          borderColor: 'rgba(250, 204, 21, 0.6)',
          marginBottom: 14,
        }}
      >
        <Text
          style={{
            color: '#facc15',
            fontWeight: '700',
            fontSize: 16,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: '#9ca3af',
            marginTop: 4,
            fontSize: 13,
          }}
        >
          {description}
        </Text>

        {isLoading && (
          <View style={{ marginTop: 8 }}>
            <ActivityIndicator color="#facc15" />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: '#020617',
        padding: 24,
      }}
    >
      <Text
        style={{
          color: '#e5e7eb',
          fontSize: 22,
          fontWeight: '700',
          marginBottom: 8,
        }}
      >
        Choose your role
      </Text>
      <Text
        style={{
          color: '#9ca3af',
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        Roles define permissions inside your family: who manages treasury,
        who receives missions and how notifications work.
      </Text>

      {renderBtn(
        'Parent',
        'parent',
        'Create and manage family spaces, approve missions and control treasury.',
      )}

      {renderBtn(
        'Kid',
        'kid',
        'Complete missions, earn GAD points and build shared family treasury.',
      )}
    </View>
  );
}
