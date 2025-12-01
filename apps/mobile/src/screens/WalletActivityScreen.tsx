// apps/mobile/src/screens/WalletActivityScreen.tsx
// Wallet Activity
// - GAD UI (useTheme)
// - Поддержка DemoContext (демо-витрина транзакций)
// - Фильтры: All / In / Out
// - Безопасная загрузка on-chain активности

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from "react-native";
import { getAddress } from "../lib/wallet";
import {
  loadWalletActivity,
  WalletActivityItem,
} from "../lib/wallet-activity";
import { useIsDemo } from "../demo/DemoContext";
import { useTheme } from "../wallet/ui/theme";

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

type Filter = "all" | "in" | "out";

export default function WalletActivityScreen(_: Props) {
  const G = useTheme();
  const isDemo = useIsDemo();

  const [address, setAddress] = useState<string | null>(null);
  const [items, setItems] = useState<WalletActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const loadData = useCallback(async () => {
    try {
      if (isDemo) {
        // DEMO: статическая витрина активности
        const demoAddr = "0xDEMO1234DEMO1234DEMO1234DEMO1234DEMO1234";
        setAddress(demoAddr);

        const now = Date.now();
        const demoItems: WalletActivityItem[] = [
          {
            id: "demo-1",
            type: "transfer_in",
            direction: "in",
            amount: "100 000",
            tokenSymbol: "GAD",
            timestamp: now - 1000 * 60 * 5,
            txHash: "0xTXDEMO1",
            counterparty: "0xFAMILYVAULT000000000000000000000001",
          },
          {
            id: "demo-2",
            type: "stake",
            direction: "out",
            amount: "50 000",
            tokenSymbol: "GAD",
            timestamp: now - 1000 * 60 * 60,
            txHash: "0xTXDEMO2",
            counterparty: "0xSTAKINGPOOL00000000000000000000001",
          },
          {
            id: "demo-3",
            type: "nft_mint",
            direction: "out",
            amount: "0.01",
            tokenSymbol: "BNB",
            timestamp: now - 1000 * 60 * 60 * 4,
            txHash: "0xTXDEMO3",
            counterparty: "0xNFTMARKET000000000000000000000001",
          },
          {
            id: "demo-4",
            type: "swap",
            direction: "in",
            amount: "10",
            tokenSymbol: "BNB",
            timestamp: now - 1000 * 60 * 60 * 24,
            txHash: "0xTXDEMO4",
            counterparty: "0xPANCAKESWAP00000000000000000001",
          },
        ];

        setItems(demoItems);
        return;
      }

      const addr = await getAddress();
      setAddress(addr);

      if (!addr) {
        setItems([]);
        return;
      }

      const activity = await loadWalletActivity(addr);
      setItems(activity);
    } catch (e) {
      console.error("WalletActivityScreen load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isDemo]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const filteredItems = items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "in") return item.direction === "in";
    if (filter === "out") return item.direction === "out";
    return true;
  });

  if (loading && !refreshing) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: G.colors.bg,
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator color={G.colors.accent} />
        <Text style={{ color: G.colors.textMuted, marginTop: 8 }}>
          Loading wallet activity…
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: G.colors.bg }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 10,
          borderBottomWidth: 1,
          borderBottomColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontSize: 22,
            fontWeight: "700",
            marginBottom: 4,
          }}
        >
          Wallet Activity{isDemo ? " (demo)" : ""}
        </Text>
        {address ? (
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            {shortenAddress(address)}
          </Text>
        ) : (
          <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
            No wallet address yet.
          </Text>
        )}

        {/* Filters */}
        <View
          style={{
            flexDirection: "row",
            marginTop: 10,
            gap: 8,
          }}
        >
          {(["all", "in", "out"] as Filter[]).map((f) => {
            const isActive = filter === f;
            const label =
              f === "all"
                ? "All"
                : f === "in"
                ? "Incoming"
                : "Outgoing";

            return (
              <TouchableOpacity
                key={f}
                onPress={() => setFilter(f)}
                activeOpacity={0.85}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  backgroundColor: isActive
                    ? G.colors.accent
                    : G.colors.card,
                  borderWidth: 1,
                  borderColor: isActive
                    ? G.colors.accent
                    : G.colors.border,
                }}
              >
                <Text
                  style={{
                    color: isActive ? "#051b0d" : G.colors.textMuted,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  {label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* List */}
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={G.colors.accent}
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
              backgroundColor: G.colors.card,
              borderWidth: 1,
              borderColor: G.colors.border,
            }}
          >
            <Text
              style={{
                color: G.colors.text,
                fontWeight: "500",
                marginBottom: 4,
              }}
            >
              No activity yet
            </Text>
            <Text style={{ color: G.colors.textMuted, fontSize: 13 }}>
              Your wallet history will appear here once you start using GAD
              Wallet: transfers, swaps, staking and NFT actions.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const typeLabel = formatType(item);
          const amountLabel = formatAmount(item);
          const timeLabel = formatTimestamp(item.timestamp as any);

          const isOut = item.direction === "out";
          const accentColor = isOut ? G.colors.warning : G.colors.accent;

          return (
            <View
              style={{
                marginBottom: 10,
                padding: 14,
                borderRadius: 16,
                backgroundColor: G.colors.card,
                borderWidth: 1,
                borderColor: G.colors.border,
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
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text
                    style={{
                      color: G.colors.text,
                      fontSize: 15,
                      fontWeight: "600",
                    }}
                  >
                    {typeLabel}
                  </Text>
                  {timeLabel ? (
                    <Text
                      style={{
                        color: G.colors.textMuted,
                        fontSize: 12,
                        marginTop: 2,
                      }}
                    >
                      {timeLabel}
                    </Text>
                  ) : null}
                </View>

                {!!amountLabel && (
                  <Text
                    style={{
                      color: accentColor,
                      fontSize: 14,
                      fontWeight: "700",
                    }}
                  >
                    {amountLabel}
                  </Text>
                )}
              </View>

              {item.txHash ? (
                <Text
                  style={{
                    color: G.colors.textMuted,
                    fontSize: 11,
                  }}
                  numberOfLines={1}
                >
                  Tx: {item.txHash}
                </Text>
              ) : null}

              {item.counterparty ? (
                <Text
                  style={{
                    color: G.colors.textMuted,
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
