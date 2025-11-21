// apps/mobile/src/screens/NFTGalleryScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  Dimensions,
  RefreshControl,
} from "react-native";
import { getAddress } from "../lib/wallet";
import {
  loadUserNFTs,
  WalletNftItem,
} from "../lib/wallet-nft";

const NUM_COLUMNS = 2;
const GAP = 12;
const SCREEN_WIDTH = Dimensions.get("window").width;
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

type Props = {
  navigation: any;
};

export default function NFTGalleryScreen({ navigation }: Props) {
  const [address, setAddress] = useState<string | null>(null);
  const [items, setItems] = useState<WalletNftItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const addr = await getAddress();
      setAddress(addr);

      const nfts = await loadUserNFTs(addr);
      setItems(nfts);
    } catch (e) {
      console.error("NFTGalleryScreen load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  if (loading && !refreshing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>
          Loading your NFTs…
        </Text>
      </View>
    );
  }

  const renderItem = ({ item }: { item: WalletNftItem }) => {
    const title = item.name || `#${item.tokenId}`;
    const imageUri =
      item.imageUrl ||
      "https://via.placeholder.com/300x300.png?text=NFT";

    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate("NFTDetail", {
            item,
          })
        }
        style={{
          width: CARD_WIDTH,
          marginBottom: GAP,
          borderRadius: 16,
          backgroundColor: "#0b1120",
          overflow: "hidden",
          borderWidth: 1,
          borderColor: "rgba(31,41,55,0.9)",
        }}
      >
        <Image
          source={{ uri: imageUri }}
          style={{
            width: "100%",
            height: CARD_WIDTH,
            backgroundColor: "#020617",
          }}
          resizeMode="cover"
        />
        <View style={{ padding: 8 }}>
          <Text
            style={{
              color: "#f9fafb",
              fontSize: 13,
              fontWeight: "600",
            }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {!!item.collectionName && (
            <Text
              style={{
                color: "#9ca3af",
                fontSize: 11,
                marginTop: 2,
              }}
              numberOfLines={1}
            >
              {item.collectionName}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#020617" }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 8,
          borderBottomWidth: 1,
          borderBottomColor: "rgba(148,163,184,0.3)",
        }}
      >
        <Text
          style={{
            color: "#f9fafb",
            fontSize: 22,
            fontWeight: "700",
            marginBottom: 4,
          }}
        >
          My NFTs
        </Text>
        {address && (
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            Owned by {address.slice(0, 6)}…{address.slice(-4)}
          </Text>
        )}
      </View>

      {/* Grid */}
      <FlatList
        data={items}
        keyExtractor={(item) =>
          `${item.contractAddress}-${item.tokenId}`
        }
        numColumns={NUM_COLUMNS}
        columnWrapperStyle={{
          justifyContent: "space-between",
          marginBottom: GAP,
        }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f9fafb"
          />
        }
        ListEmptyComponent={
          <View
            style={{
              marginTop: 24,
              padding: 16,
              borderRadius: 16,
              backgroundColor: "#0f172a",
              borderWidth: 1,
              borderColor: "rgba(31,41,55,0.9)",
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontWeight: "500",
                marginBottom: 4,
              }}
            >
              No NFTs yet
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 13 }}>
              Mint or buy NFTs on the GAD Marketplace — they will appear
              here automatically.
            </Text>
          </View>
        }
        renderItem={renderItem}
      />
    </View>
  );
}
