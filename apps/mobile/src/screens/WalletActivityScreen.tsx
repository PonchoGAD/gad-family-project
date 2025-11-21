// apps/mobile/src/screens/WalletActivityScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { getAddress } from "../lib/wallet";
import {
  loadWalletActivity,
  WalletActivityItem,
} from "../lib/wallet-activity";

function shortenAddress(addr: string, chars = 4) {
  if (!addr) return "";
  return `${addr.slice(0, 2 + chars)}...${addr.slice(-chars)}`;
}

function formatTimestamp(ts: number | undefined | null): string {
  if (!ts) return "";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString();
}

function formatType(item: WalletActivityItem): string {
  switch (item.type) {
    case "transfer_in":
      return "Incoming transfer";
    case "transfer_out":
      return "Outgoing transfer";
    case "swap":
      return "Swap";
    case "stake":
      return "Stake";
    case "unstake":
      return "Unstake";
    case "nft_mint":
      return "NFT mint";
    case "nft_buy":
      return "NFT buy";
    case "nft_sell":
      return "NFT sell";
    default:
      return "Activity";
  }
}

function formatAmount(item: WalletActivityItem): string {
  if (!item.amount) return "";
  const directionPrefix =
    item.direction === "out" ? "-" : item.direction === "in" ? "+" : "";
  const symbol = item.tokenSymbol ?? "";
  return `${directionPrefix}${item.amount}${symbol ? " " + symbol : ""}`;
}

type Props = {
  navigation: any;
};

export default function WalletActivityScreen(_: Props) {
  const [address, setAddress] = useState<string | null>(null);
  const [items, setItems] = useState<WalletActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const addr = await getAddress();
      setAddress(addr);

      const activity = await loadWalletActivity(addr);
      setItems(activity);
    } catch (e) {
      console.error("WalletActivityScreen load error:", e);
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
          Loading wallet activity…
        </Text>
      </View>
    );
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
        >
          Wallet Activity
        </Text>
        {address && (
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            {shortenAddress(address)}
          </Text>
        )}
      </View>

      {/* List */}
      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#f9fafb"
          />
        }
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingVertical: 12,
          paddingBottom: 24,
        }}
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
              No activity yet
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 13 }}>
              Your wallet history will appear here once you start using GAD
              Wallet: transfers, swaps, staking and NFT actions.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const typeLabel = formatType(item);
          const amountLabel = formatAmount(item);
          const timeLabel = formatTimestamp(item.timestamp);

          const isOut = item.direction === "out";
          const accentColor = isOut ? "#f97316" : "#22c55e";

          return (
            <View
              style={{
                marginBottom: 10,
                padding: 14,
                borderRadius: 16,
                backgroundColor: "#0b1120",
                borderWidth: 1,
                borderColor: "rgba(31,41,55,0.9)",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 4,
                }}
              >
                <Text
                  style={{
                    color: "#f9fafb",
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                >
                  {typeLabel}
                </Text>
                {!!amountLabel && (
                  <Text
                    style={{
                      color: accentColor,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    {amountLabel}
                  </Text>
                )}
              </View>

              {timeLabel ? (
                <Text
                  style={{
                    color: "#9ca3af",
                    fontSize: 12,
                    marginBottom: 2,
                  }}
                >
                  {timeLabel}
                </Text>
              ) : null}

              {item.txHash ? (
                <Text
                  style={{
                    color: "#6b7280",
                    fontSize: 11,
                  }}
                  numberOfLines={1}
                >
                  {item.txHash}
                </Text>
              ) : null}

              {item.counterparty ? (
                <Text
                  style={{
                    color: "#6b7280",
                    fontSize: 11,
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  Counterparty: {shortenAddress(item.counterparty, 4)}
                </Text>
              ) : null}
            </View>
          );
        }}
      />
    </View>
  );
}
