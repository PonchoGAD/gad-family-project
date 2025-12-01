// ---------------------------------------------------------------
// apps/mobile/src/screens/FamilyMemberDetailScreen.tsx
// Shows member info: role, DOB, age, wallet state, last seen
// ---------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';
import { useTheme } from '../wallet/ui/theme';

type MemberDetailProps = {
  route: {
    params: {
      fid: string;
      uid: string;
    };
  };
};

export default function FamilyMemberDetailScreen({
  route,
}: MemberDetailProps) {
  const G = useTheme();
  const { fid, uid } = route.params;

  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, 'families', fid, 'members', uid));
      if (snap.exists()) setData(snap.data());
    })();
  }, [fid, uid]);

  if (!data) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: G.colors.bg,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: G.colors.textMuted }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg, padding: 24 }}>
      <Text
        style={{
          color: G.colors.text,
          fontWeight: '700',
          fontSize: 22,
          marginBottom: 10,
        }}
      >
        Member
      </Text>

      <Text style={{ color: G.colors.text, marginTop: 6 }}>
        UID: {uid.slice(0, 10)}…
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
        Role: {data.role ?? '—'}
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
        Birth date: {data.birthDate ?? '—'}
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
        Age: {typeof data.ageYears === 'number' ? data.ageYears : '—'}
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
        Adult: {data.isAdult ? 'Yes' : 'No'}
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
        Wallet mode:{' '}
        {data.noWallet ? 'Child Mode (custodial only)' : 'Full wallet'}
      </Text>

      <Text style={{ color: G.colors.textMuted, marginTop: 6 }}>
        Last seen:{' '}
        {data.lastSeen
          ? new Date(data.lastSeen).toLocaleString()
          : 'Unknown'}
      </Text>
    </View>
  );
}
