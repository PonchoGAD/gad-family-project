// ---------------------------------------------------------------
// apps/mobile/src/screens/InviteFamilyScreen.tsx
// Screen for showing invite code + sharing link
// ---------------------------------------------------------------

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Share } from 'react-native';
import { getCurrentUserFamilyId, getFamily } from '../lib/families';
import { useTheme } from '../wallet/ui/theme';

export default function InviteFamilyScreen() {
  const G = useTheme();

  const [fid, setFid] = useState<string | null>(null);
  const [invite, setInvite] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const id = await getCurrentUserFamilyId();
      setFid(id);
      if (!id) return;

      const fam = await getFamily(id);
      setInvite(fam?.inviteCode ?? null);
    })();
  }, []);

  async function handleShare() {
    if (!invite) return;

    const msg = `Join my GAD Family\nInvite code: ${invite}`;
    await Share.share({ message: msg });
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: G.colors.bg,
        padding: 24,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        style={{
          color: G.colors.text,
          fontSize: 22,
          fontWeight: '700',
          marginBottom: 6,
        }}
      >
        Invite Family
      </Text>

      {invite ? (
        <>
          <Text
            style={{
              color: G.colors.textMuted,
              marginBottom: 14,
              fontSize: 14,
            }}
          >
            Share your family invite code:
          </Text>

          <Text
            style={{
              color: G.colors.accent,
              fontSize: 30,
              fontWeight: '800',
              marginBottom: 20,
            }}
          >
            {invite}
          </Text>

          <TouchableOpacity
            onPress={handleShare}
            style={{
              backgroundColor: G.colors.accent,
              paddingVertical: 10,
              paddingHorizontal: 30,
              borderRadius: 999,
            }}
          >
            <Text
              style={{
                color: '#000',
                fontWeight: '700',
                fontSize: 15,
              }}
            >
              Share
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <Text style={{ color: G.colors.textMuted }}>
          No invite code available
        </Text>
      )}
    </View>
  );
}
