// apps/mobile/src/screens/NFTDetailScreen.tsx

import React from "react";
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Alert,
} from "react-native";
import { WalletNftItem } from "../lib/wallet-nft";

type Props = {
  navigation: any;
  route: {
    params: {
      item: WalletNftItem;
    };
  };
};

export default function NFTDetailScreen({ route }: Props) {
  const { item } = route.params;

  const title = item.name || `Token #${item.tokenId}`;
  const imageUri =
    item.imageUrl ||
    "https://via.placeholder.com/600x600.png?text=NFT";

  function handleSend() {
    Alert.alert("NFT", "Send NFT — TODO (integration with wallet).");
  }

  function handleList() {
    Alert.alert("NFT", "List NFT on marketplace — TODO.");
  }

  function handleSell() {
    Alert.alert("NFT", "Sell / Create listing — TODO.");
  }

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
          numberOfLines={1}
        >
          {title}
        </Text>
        {!!item.collectionName && (
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 13,
            }}
            numberOfLines={1}
          >
            {item.collectionName}
          </Text>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 24,
        }}
      >
        {/* Image */}
        <View
          style={{
            borderRadius: 24,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: "rgba(31,41,55,0.9)",
            backgroundColor: "#020617",
            marginBottom: 16,
          }}
        >
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: 320 }}
            resizeMode="cover"
          />
        </View>

        {/* Description */}
        {item.description ? (
          <View style={{ marginBottom: 16 }}>
            <Text
              style={{
                color: "#e5e7eb",
                fontSize: 16,
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              Description
            </Text>
            <Text
              style={{
                color: "#9ca3af",
                fontSize: 14,
              }}
            >
              {item.description}
            </Text>
          </View>
        ) : null}

        {/* Basic info */}
        <View
          style={{
            marginBottom: 16,
            padding: 12,
            borderRadius: 16,
            backgroundColor: "#0b1120",
            borderWidth: 1,
            borderColor: "rgba(31,41,55,0.9)",
          }}
        >
          <Text
            style={{
              color: "#e5e7eb",
              fontSize: 15,
              fontWeight: "600",
              marginBottom: 8,
            }}
          >
            Token Info
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            Contract:{" "}
            <Text style={{ color: "#f9fafb" }}>
              {item.contractAddress}
            </Text>
          </Text>
          <Text style={{ color: "#9ca3af", fontSize: 13, marginTop: 2 }}>
            Token ID:{" "}
            <Text style={{ color: "#f9fafb" }}>{item.tokenId}</Text>
          </Text>
          {!!item.owner && (
            <Text
              style={{ color: "#9ca3af", fontSize: 13, marginTop: 2 }}
            >
              Owner:{" "}
              <Text style={{ color: "#f9fafb" }}>{item.owner}</Text>
            </Text>
          )}
        </View>

        {/* Attributes */}
        {Array.isArray(item.attributes) && item.attributes.length > 0 && (
          <View
            style={{
              marginBottom: 16,
              padding: 12,
              borderRadius: 16,
              backgroundColor: "#0b1120",
              borderWidth: 1,
              borderColor: "rgba(31,41,55,0.9)",
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontSize: 15,
                fontWeight: "600",
                marginBottom: 8,
              }}
            >
              Attributes
            </Text>
            {item.attributes.map((attr, idx) => {
              const a = attr as any;
              const trait = a.trait_type ?? a.trait ?? `Attribute ${idx + 1}`;
              const value = a.value ?? "";
              return (
                <View
                  key={`${trait}-${idx}`}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    marginBottom: 4,
                  }}
                >
                  <Text
                    style={{
                      color: "#9ca3af",
                      fontSize: 13,
                    }}
                  >
                    {trait}
                  </Text>
                  <Text
                    style={{
                      color: "#f9fafb",
                      fontSize: 13,
                      fontWeight: "500",
                    }}
                  >
                    {value}
                  </Text>
                </View>
              );
            })}
          </View>
        )}

        {/* Actions */}
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: 8,
          }}
        >
          <TouchableOpacity
            onPress={handleSend}
            style={{
              flex: 1,
              marginRight: 8,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "#22c55e",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#022c22",
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Send
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleList}
            style={{
              flex: 1,
              marginHorizontal: 4,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "#f97316",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#111827",
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              List
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSell}
            style={{
              flex: 1,
              marginLeft: 8,
              paddingVertical: 10,
              borderRadius: 999,
              backgroundColor: "#0ea5e9",
              alignItems: "center",
            }}
          >
            <Text
              style={{
                color: "#0b1120",
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Sell
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
