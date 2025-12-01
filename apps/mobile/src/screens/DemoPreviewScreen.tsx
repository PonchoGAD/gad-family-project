// ---------------------------------------------------------------
// apps/mobile/src/screens/DemoPreviewScreen.tsx
// Demo Hub for GAD Family App
// - Быстрый вход во все ключевые демо-экраны
// - Ничего не ломает в реальной навигации, только маршруты
// ---------------------------------------------------------------

import React from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
} from "react-native";
import { useTheme } from "../wallet/ui/theme";
import { useIsDemo } from "../demo/DemoContext";

type Props = {
  navigation: any;
};

type DemoRoute = {
  id: string;
  label: string;
  description: string;
  routeName: string;
};

const MOVE_ROUTES: DemoRoute[] = [
  {
    id: "steps",
    label: "Steps Tracker",
    description: "Move-to-Earn: today’s steps + history + GAD preview.",
    routeName: "Steps",
  },
  {
    id: "rewards",
    label: "GAD Points Rewards",
    description: "Step Engine V2: daily points & balances.",
    routeName: "Rewards",
  },
  {
    id: "subscription",
    label: "Subscriptions & Gas Stipend",
    description: "Plans, multipliers and monthly gas support.",
    routeName: "Subscription",
  },
];

const FINANCE_ROUTES: DemoRoute[] = [
  {
    id: "exchangeFund",
    label: "Exchange Fund",
    description: "GAD Points → USDT requests & monthly limits.",
    routeName: "ExchangeFund",
  },
  {
    id: "exchangeHistory",
    label: "Exchange History",
    description: "History of exchanges and payouts.",
    routeName: "ExchangeHistory",
  },
  {
    id: "walletActivity",
    label: "Wallet Activity",
    description: "On-chain transfers, swaps, staking, NFT actions.",
    routeName: "WalletActivity",
  },
  {
    id: "staking",
    label: "Staking",
    description: "Stake GAD and preview rewards.",
    routeName: "Staking",
  },
];

const FAMILY_ROUTES: DemoRoute[] = [
  {
    id: "familyTasks",
    label: "Family Tasks",
    description: "Daily tasks for kids & parents.",
    routeName: "FamilyTasks",
  },
  {
    id: "familyGoals",
    label: "Family Missions",
    description: "Long-term goals funded by GAD Points.",
    routeName: "FamilyGoals",
  },
  {
    id: "badges",
    label: "Badges",
    description: "Steps, tasks, geo and AI achievements.",
    routeName: "Badges",
  },
];

export default function DemoPreviewScreen({ navigation }: Props) {
  const G = useTheme();
  const isDemo = useIsDemo();

  function renderCard(route: DemoRoute) {
    return (
      <Pressable
        key={route.id}
        onPress={() => navigation.navigate(route.routeName)}
        style={{
          backgroundColor: G.colors.card,
          borderRadius: 16,
          padding: 14,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: G.colors.border,
        }}
      >
        <Text
          style={{
            color: G.colors.text,
            fontWeight: "700",
            fontSize: 15,
            marginBottom: 4,
          }}
        >
          {route.label}
        </Text>
        <Text style={{ color: G.colors.textMuted, fontSize: 12 }}>
          {route.description}
        </Text>
        <Text
          style={{
            color: G.colors.accent,
            fontSize: 11,
            marginTop: 6,
          }}
        >
          Open demo
        </Text>
      </Pressable>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
    >
      <Text
        style={{
          color: G.colors.text,
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 4,
        }}
      >
        Demo Preview
      </Text>
      <Text
        style={{
          color: G.colors.textMuted,
          fontSize: 13,
          marginBottom: 16,
        }}
      >
        Walk through the main GAD flows in demo mode: steps, rewards, finance,
        family and badges — everything in one place.
      </Text>

      <View
        style={{
          padding: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: G.colors.border,
          backgroundColor: G.colors.card,
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 12,
            marginBottom: 4,
          }}
        >
          Demo status
        </Text>
        <Text
          style={{
            color: isDemo ? G.colors.accent : G.colors.warning,
            fontWeight: "700",
            fontSize: 14,
          }}
        >
          {isDemo ? "Demo mode is ON" : "Demo mode is OFF"}
        </Text>
        <Text
          style={{
            color: G.colors.textMuted,
            fontSize: 11,
            marginTop: 4,
          }}
        >
          Demo mode should be enabled globally in settings or via DemoContext.
        </Text>
      </View>

      {/* Move-to-Earn */}
      <Text
        style={{
          color: G.colors.text,
          fontWeight: "700",
          fontSize: 16,
          marginBottom: 8,
        }}
      >
        Move-to-Earn
      </Text>
      {MOVE_ROUTES.map(renderCard)}

      {/* Finance */}
      <Text
        style={{
          color: G.colors.text,
          fontWeight: "700",
          fontSize: 16,
          marginVertical: 8,
        }}
      >
        Financial layer
      </Text>
      {FINANCE_ROUTES.map(renderCard)}

      {/* Family */}
      <Text
        style={{
          color: G.colors.text,
          fontWeight: "700",
          fontSize: 16,
          marginVertical: 8,
        }}
      >
        Family layer
      </Text>
      {FAMILY_ROUTES.map(renderCard)}
    </ScrollView>
  );
}
