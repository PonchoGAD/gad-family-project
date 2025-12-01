// apps/mobile/src/screens/AuthFamilyConnectScreen.tsx
// ---------------------------------------------
// Экран создания / присоединения к семье:
//  - Create family → families + users.familyId + onboarded=true
//  - Join by code → поиск families по code, users.familyId + onboarded=true
// ---------------------------------------------

import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { auth, db } from '../firebase';
import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  where,
  serverTimestamp,
} from 'firebase/firestore';
import { ensureAuth } from '../lib/authClient';

type Props = {
  navigation: any;
};

function randomCode(len = 6) {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export default function AuthFamilyConnectScreen({ navigation }: Props) {
  const [familyName, setFamilyName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [loadingCreate, setLoadingCreate] = useState(false);
  const [loadingJoin, setLoadingJoin] = useState(false);

  async function resolveUid() {
    const user = await ensureAuth();
    return user?.uid ?? auth.currentUser?.uid ?? null;
  }

  async function handleCreateFamily() {
    try {
      setLoadingCreate(true);
      const uid = await resolveUid();
      if (!uid) throw new Error('No user');

      const code = randomCode();
      const familiesCol = collection(db, 'families');

      const ref = await addDoc(familiesCol, {
        name: familyName.trim() || 'My GAD Family',
        ownerUid: uid,
        code,
        createdAt: serverTimestamp(),
      });

      await setDoc(
        doc(db, 'users', uid),
        {
          familyId: ref.id,
          familyCode: code,
          onboarded: true,
        },
        { merge: true },
      );

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' as never }],
      });
    } catch (e: any) {
      console.log('[AuthFamilyConnect] create error', e);
      Alert.alert('Error', e?.message ?? 'Failed to create family');
      setLoadingCreate(false);
    }
  }

  async function handleJoinFamily() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      Alert.alert('Error', 'Enter family code');
      return;
    }

    try {
      setLoadingJoin(true);
      const uid = await resolveUid();
      if (!uid) throw new Error('No user');

      const familiesCol = collection(db, 'families');
      const q = query(familiesCol, where('code', '==', code));
      const snap = await getDocs(q);

      if (snap.empty) {
        Alert.alert('Not found', 'Family with this code was not found');
        setLoadingJoin(false);
        return;
      }

      const familyDoc = snap.docs[0];

      await setDoc(
        doc(db, 'users', uid),
        {
          familyId: familyDoc.id,
          familyCode: code,
          onboarded: true,
        },
        { merge: true },
      );

      navigation.reset({
        index: 0,
        routes: [{ name: 'MainTabs' as never }],
      });
    } catch (e: any) {
      console.log('[AuthFamilyConnect] join error', e);
      Alert.alert('Error', e?.message ?? 'Failed to join family');
      setLoadingJoin(false);
    }
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
          fontSize: 20,
          fontWeight: '700',
          marginBottom: 8,
        }}
      >
        Connect your family
      </Text>
      <Text
        style={{
          color: '#9ca3af',
          fontSize: 14,
          marginBottom: 24,
        }}
      >
        Create a new family space or join an existing one using an invite
        code.
      </Text>

      {/* CREATE FAMILY */}
      <Text
        style={{
          color: '#e5e7eb',
          fontWeight: '600',
          marginBottom: 6,
        }}
      >
        Create family
      </Text>
      <TextInput
        value={familyName}
        onChangeText={setFamilyName}
        placeholder="Family name"
        placeholderTextColor="#6b7280"
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#4b5563',
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: '#f9fafb',
          marginBottom: 10,
        }}
      />
      <TouchableOpacity
        onPress={loadingCreate ? undefined : handleCreateFamily}
        activeOpacity={0.9}
        style={{
          backgroundColor: '#facc15',
          paddingVertical: 12,
          borderRadius: 12,
          alignItems: 'center',
          marginBottom: 24,
        }}
      >
        {loadingCreate ? (
          <ActivityIndicator color="#020617" />
        ) : (
          <Text
            style={{
              color: '#020617',
              fontWeight: '700',
              fontSize: 15,
            }}
          >
            Create family
          </Text>
        )}
      </TouchableOpacity>

      {/* JOIN FAMILY */}
      <Text
        style={{
          color: '#e5e7eb',
          fontWeight: '600',
          marginBottom: 6,
        }}
      >
        Join by code
      </Text>
      <TextInput
        value={joinCode}
        onChangeText={(v) => setJoinCode(v.toUpperCase())}
        placeholder="INVITE CODE"
        placeholderTextColor="#6b7280"
        autoCapitalize="characters"
        style={{
          borderRadius: 12,
          borderWidth: 1,
          borderColor: '#4b5563',
          paddingHorizontal: 12,
          paddingVertical: 10,
          color: '#f9fafb',
          marginBottom: 10,
        }}
      />
      <TouchableOpacity
        onPress={loadingJoin ? undefined : handleJoinFamily}
        activeOpacity={0.9}
        style={{
          borderRadius: 12,
          paddingVertical: 12,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(148, 163, 184, 0.8)',
        }}
      >
        {loadingJoin ? (
          <ActivityIndicator color="#facc15" />
        ) : (
          <Text
            style={{
              color: '#e5e7eb',
              fontWeight: '600',
              fontSize: 15,
            }}
          >
            Join family
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
        You can always invite more members later from the Family screen.
      </Text>
    </View>
  );
}
