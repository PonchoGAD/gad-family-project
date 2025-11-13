// apps/mobile/src/screens/NFTScreen.tsx
import React, { useEffect, useState } from "react";
import { View, Text, FlatList, Image, Button } from "react-native";
import * as Linking from "expo-linking";
import { auth, db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

type UserNft = {
  id: string;
  name?: string;
  collection?: string;
  image?: string;
};

export default function NFTScreen() {
  const [items, setItems] = useState<UserNft[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const current = auth.currentUser;
    if (!current) {
      setUid(null);
      setItems([]);
      return;
    }
    setUid(current.uid);

    const c = collection(db, "users", current.uid, "nfts");
    const unsub = onSnapshot(c, (qs) =>
      setItems(
        qs.docs.map(
          (d) =>
            ({
              id: d.id,
              ...(d.data() as any),
            } as UserNft)
        )
      )
    );
    return () => unsub();
  }, []);

  function openMarket() {
    // placeholder: you can change URL to the exact NFT market route later
    Linking.openURL("https://gad-family.com/nft");
  }

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: "#0b0c0f" }}>
      <Text style={{ fontWeight: "700", fontSize: 18, color: "#ffffff" }}>
        My NFTs
      </Text>
      <Text style={{ color: "#9ca3af", marginTop: 4, marginBottom: 16 }}>
        Badges and collectibles minted in the GAD ecosystem. On-chain ownership
        lives on BNB Chain; this list is a synced view for your account.
      </Text>

      {!uid && (
        <Text style={{ color: "#f97316", marginBottom: 12 }}>
          You are not signed in. Sign in to see your NFTs.
        </Text>
      )}

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        renderItem={({ item }) => (
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              paddingVertical: 8,
              borderBottomWidth: 1,
              borderBottomColor: "#111827",
            }}
          >
            {item.image ? (
              <Image
                source={{ uri: item.image }}
                style={{ width: 56, height: 56, borderRadius: 12 }}
              />
            ) : (
              <View
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 12,
                  backgroundColor: "#111827",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#6b7280", fontSize: 10 }}>NFT</Text>
              </View>
            )}
            <View style={{ flex: 1 }}>
              <Text style={{ color: "#f9fafb", fontWeight: "600" }}>
                {item.name || item.id}
              </Text>
              <Text style={{ color: "#9ca3af", fontSize: 12 }}>
                {item.collection || "GAD Collection"}
              </Text>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={{ color: "#6b7280", marginTop: 8 }}>
            No NFTs yet. Mint on the marketplace and they will appear here.
          </Text>
        }
      />

      <View style={{ marginTop: 24 }}>
        <Button title="Open NFT marketplace" onPress={openMarket} />
      </View>
    </View>
  );
}
