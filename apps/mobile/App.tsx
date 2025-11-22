// apps/mobile/App.tsx
import "react-native-get-random-values"; // crypto polyfill для ethers
import "react-native-url-polyfill/auto";
import * as Linking from "expo-linking";

import React, { useEffect } from "react";
import { View, Text } from "react-native";
import {
  NavigationContainer,
  DefaultTheme,
} from "@react-navigation/native";
import {
  createNativeStackNavigator,
} from "@react-navigation/native-stack";
import {
  createBottomTabNavigator,
} from "@react-navigation/bottom-tabs";
import {
  SafeAreaProvider,
  SafeAreaView,
} from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { ensureAuth } from "./src/lib/authClient";
import { ensureUserDoc } from "./src/lib/user";

// --- TAB SCREENS (5 штук) ---
import HomeScreen from "./src/screens/HomeScreen";
import StepsScreen from "./src/screens/StepsScreen";
import FamiliesScreen from "./src/screens/FamiliesScreen";
import WalletScreen from "./src/screens/WalletScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

// --- ОСТАЛЬНЫЕ ЭКРАНЫ (STACK) ---
import AssistantScreen from "./src/screens/AssistantScreen";
import BadgesScreen from "./src/screens/BadgesScreen";
import ExchangeFundScreen from "./src/screens/ExchangeFundScreen";
import ExchangeHistoryScreen from "./src/screens/ExchangeHistoryScreen";
import FamilyChatListScreen from "./src/screens/FamilyChatListScreen";
import FamilyChatScreen from "./src/screens/FamilyChatScreen";
import FamilyChildrenScreen from "./src/screens/FamilyChildrenScreen";
import FamilyFriendsScreen from "./src/screens/FamilyFriendsScreen";
import FamilyFundsScreen from "./src/screens/FamilyFundsScreen";
import FamilyGoalsScreen from "./src/screens/FamilyGoalsScreen";
import FamilyMapScreen from "./src/screens/FamilyMapScreen";
import FamilySettingsScreen from "./src/screens/FamilySettingsScreen";
import FamilyTasksScreen from "./src/screens/FamilyTasksScreen";
import FamilyTreasuryScreen from "./src/screens/FamilyTreasuryScreen";
import FriendRequestsScreen from "./src/screens/FriendRequestsScreen";
import FundDetailsScreen from "./src/screens/FundDetailsScreen";
import GasHistoryScreen from "./src/screens/GasHistoryScreen";
import HistoryScreen from "./src/screens/HistoryScreen";
import MyFundsScreen from "./src/screens/MyFundsScreen";
import NFTDetailScreen from "./src/screens/NFTDetailScreen";
import NFTGalleryScreen from "./src/screens/NFTGalleryScreen";
import NFTScreen from "./src/screens/NFTScreen";
import PlacesScreen from "./src/screens/PlacesScreen";
import PrivacyScreen from "./src/screens/PrivacyScreen";
import ProfileDOBScreen from "./src/screens/ProfileDOBScreen";
import ReferralScreen from "./src/screens/ReferralScreen";
import RewardsScreen from "./src/screens/RewardsScreen";
import StakingScreen from "./src/screens/StakingScreen";
import SubscriptionScreen from "./src/screens/SubscriptionScreen";
import WalletActivityScreen from "./src/screens/WalletActivityScreen";

type TabRoute = { name: string };
type TabIconArgs = {
  focused: boolean;
  size: number;
  color: string;
};

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function iconNameFor(
  routeName: string,
  focused: boolean
): keyof typeof Ionicons.glyphMap {
  const baseMap: Record<string, string> = {
    Home: "home",
    Steps: "walk",
    Family: "people",
    Wallet: "wallet",
    More: "ellipsis-horizontal",
  };

  const base = baseMap[routeName] || "ellipse";
  const outline = `${base}-outline`;
  const hasOutline = (Ionicons as any).glyphMap?.[outline] !== undefined;
  const finalName = focused ? base : hasOutline ? outline : base;

  return finalName as keyof typeof Ionicons.glyphMap;
}

function TabsRoot() {
  return (
    <Tabs.Navigator
      screenOptions={({ route }: { route: TabRoute }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size, color }: TabIconArgs) => (
          <Ionicons
            name={iconNameFor(route.name, focused)}
            size={size}
            color={color}
          />
        ),
        tabBarActiveTintColor: "#f9fafb",
        tabBarInactiveTintColor: "#6B7280",
        tabBarStyle: {
          backgroundColor: "#020617",
          borderTopColor: "#0f172a",
        },
      })}
    >
      {/* 5 основных табов, как мы договорились */}
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Steps" component={StepsScreen} />
      <Tabs.Screen name="Family" component={FamiliesScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="More" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

// Простой плейсхолдер (чтобы переходы на WalletOnboarding не падали)
function WalletOnboardingScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: "700" }}>
        Wallet Onboarding
      </Text>
      <Text
        style={{
          marginTop: 8,
          color: "#555",
          textAlign: "center",
        }}
      >
        Placeholder. Screen is registered to keep navigation stable.
      </Text>
    </View>
  );
}

// Deep linking (можно расширять позже)
const linking: any = {
  prefixes: [Linking.createURL("/")],
  config: {
    screens: {
      Root: {
        screens: {
          Home: "home",
          Steps: "steps",
          Family: "family",
          Wallet: "wallet",
          More: "more",
        },
      },
      Rewards: "rewards",
      NFTs: "nfts",
      FamilyTreasury: "treasury",
      FamilyChildren: "children",
      WalletOnboarding: "wallet-onboarding",
    },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: "#020617",
  },
};

export default function App() {
  useEffect(() => {
    (async () => {
      try {
        const u = await ensureAuth();
        if (u) {
          await ensureUserDoc();
        }
      } catch (e) {
        console.log("Auth init error", e);
      }
    })();
  }, []);

  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking} theme={navTheme}>
        <SafeAreaView style={{ flex: 1 }}>
          <Stack.Navigator
            screenOptions={{
              headerStyle: { backgroundColor: "#020617" },
              headerTintColor: "#f9fafb",
            }}
          >
            {/* Корень — табы */}
            <Stack.Screen
              name="Root"
              component={TabsRoot}
              options={{ headerShown: false }}
            />

            {/* СЕМЕЙНЫЕ ЭКРАНЫ */}
            <Stack.Screen
              name="FamilyTasks"
              component={FamilyTasksScreen}
              options={{ title: "Family Tasks" }}
            />
            <Stack.Screen
              name="FamilyTreasury"
              component={FamilyTreasuryScreen}
              options={{ title: "Family Treasury" }}
            />
            <Stack.Screen
              name="FamilyChildren"
              component={FamilyChildrenScreen}
              options={{ title: "Children" }}
            />
            <Stack.Screen
              name="FamilyMap"
              component={FamilyMapScreen}
              options={{ title: "Family Map" }}
            />
            <Stack.Screen
              name="FamilyFriends"
              component={FamilyFriendsScreen}
              options={{ title: "Family Friends" }}
            />
            <Stack.Screen
              name="FamilyFunds"
              component={FamilyFundsScreen}
              options={{ title: "Family Funds" }}
            />
            <Stack.Screen
              name="FamilyGoals"
              component={FamilyGoalsScreen}
              options={{ title: "Family Goals" }}
            />
            <Stack.Screen
              name="FamilySettings"
              component={FamilySettingsScreen}
              options={{ title: "Family Settings" }}
            />

            {/* ЧАТЫ */}
            <Stack.Screen
              name="FamilyChatList"
              component={FamilyChatListScreen}
              options={{ title: "Family Chats" }}
            />
            {/* ВАЖНО: заменили component={} на render-функцию */}
            <Stack.Screen name="FamilyChat" options={{ title: "Chat" }}>
              {(props) => <FamilyChatScreen {...(props as any)} />}
            </Stack.Screen>

            {/* ИИ-Ассистент */}
            <Stack.Screen
              name="Assistant"
              component={AssistantScreen}
              options={{ title: "AI Assistant" }}
            />

            {/* РЕФЕРАЛЫ / ДРУЗЬЯ / БЕЙДЖИ */}
            <Stack.Screen
              name="Referral"
              component={ReferralScreen}
              options={{ title: "Referral" }}
            />
            <Stack.Screen
              name="FriendRequests"
              component={FriendRequestsScreen}
              options={{ title: "Friend Requests" }}
            />
            <Stack.Screen
              name="Badges"
              component={BadgesScreen}
              options={{ title: "Badges" }}
            />

            {/* ОБМЕН / ГАЗ / ИСТОРИИ */}
            <Stack.Screen
              name="ExchangeFund"
              component={ExchangeFundScreen}
              options={{ title: "Exchange Fund" }}
            />
            <Stack.Screen
              name="ExchangeHistory"
              component={ExchangeHistoryScreen}
              options={{ title: "Exchange History" }}
            />
            <Stack.Screen
              name="GasHistory"
              component={GasHistoryScreen}
              options={{ title: "Gas History" }}
            />
            <Stack.Screen
              name="History"
              component={HistoryScreen}
              options={{ title: "History" }}
            />
            <Stack.Screen
              name="MyFunds"
              component={MyFundsScreen}
              options={{ title: "My Funds" }}
            />

            {/* NFT */}
            <Stack.Screen
              name="NFTs"
              component={NFTScreen}
              options={{ title: "My NFTs" }}
            />
            <Stack.Screen
              name="NFTGallery"
              component={NFTGalleryScreen}
              options={{ headerShown: false }}
            />
            {/* Тоже через render-функцию, чтобы не ругался TS */}
            <Stack.Screen name="NFTDetail" options={{ headerShown: false }}>
              {(props) => <NFTDetailScreen {...(props as any)} />}
            </Stack.Screen>

            {/* ПРОЧЕЕ: МЕСТА, ПРОФИЛЬ, ПРИВАТНОСТЬ */}
            <Stack.Screen
              name="Places"
              component={PlacesScreen}
              options={{ title: "Places" }}
            />
            <Stack.Screen
              name="Privacy"
              component={PrivacyScreen}
              options={{ title: "Privacy" }}
            />
            <Stack.Screen
              name="ProfileDOB"
              component={ProfileDOBScreen}
              options={{ title: "Date of Birth" }}
            />

            {/* НАГРАДЫ / СТЕЙКИНГ / ПОДПИСКА */}
            <Stack.Screen
              name="Rewards"
              component={RewardsScreen}
              options={{ title: "Rewards" }}
            />
            <Stack.Screen
              name="Staking"
              component={StakingScreen}
              options={{ title: "Staking" }}
            />
            <Stack.Screen
              name="Subscription"
              component={SubscriptionScreen}
              options={{ title: "Subscription" }}
            />

            {/* АКТИВНОСТЬ КОШЕЛЬКА */}
            <Stack.Screen
              name="WalletActivity"
              component={WalletActivityScreen}
              options={{ headerShown: false }}
            />

            {/* ONBOARDING КОШЕЛЬКА */}
            <Stack.Screen
              name="WalletOnboarding"
              component={WalletOnboardingScreen}
              options={{ title: "Wallet Onboarding" }}
            />
          </Stack.Navigator>
        </SafeAreaView>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
