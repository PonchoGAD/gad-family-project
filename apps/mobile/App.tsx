// apps/mobile/App.tsx
import "react-native-get-random-values"; // crypto polyfill для ethers
import "react-native-url-polyfill/auto";
import * as Linking from "expo-linking";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { View, Text } from "react-native";
import React, { useEffect } from "react";
import { ensureAuth } from "./src/lib/authClient";
import { ensureUserDoc } from "./src/lib/user";
import FamilyTasksScreen from "./src/screens/FamilyTasksScreen";
import FamilyChatListScreen from "./src/screens/FamilyChatListScreen";
import FamilyChatScreen from "./src/screens/FamilyChatScreen";
import AssistantScreen from "./src/screens/AssistantScreen";
import HomeScreen from "./src/screens/HomeScreen";
import WalletScreen from "./src/screens/WalletScreen";
import StepsScreen from "./src/screens/StepsScreen";
import FamiliesScreen from "./src/screens/FamiliesScreen";
import RewardsScreen from "./src/screens/RewardsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import FamilyTreasuryScreen from "./src/screens/FamilyTreasuryScreen";
import NFTScreen from "./src/screens/NFTScreen";
import FamilyChildrenScreen from "./src/screens/FamilyChildrenScreen";

type TabRoute = { name: string };
type TabIconArgs = { focused: boolean; size: number; color: string };

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

function iconNameFor(
  routeName: string,
  focused: boolean
): keyof typeof Ionicons.glyphMap {
  const baseMap: Record<string, string> = {
    Home: "home",
    Wallet: "wallet",
    Family: "people",
    Rewards: "ribbon",
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
        tabBarIcon: ({ focused, size }: TabIconArgs) => (
          <Ionicons name={iconNameFor(route.name, focused)} size={size} />
        ),
        tabBarActiveTintColor: "#111827",
        tabBarInactiveTintColor: "#6B7280",
      })}
    >
      <Tabs.Screen name="Home" component={HomeScreen} />
      <Tabs.Screen name="Wallet" component={WalletScreen} />
      <Tabs.Screen name="Family" component={FamiliesScreen} />
      <Tabs.Screen name="Rewards" component={RewardsScreen} />
      <Tabs.Screen name="More" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

// Simple placeholder so navigation("WalletOnboarding") does not crash
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
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Wallet Onboarding</Text>
      <Text style={{ marginTop: 8, color: "#555", textAlign: "center" }}>
        Placeholder. Screen is registered to keep navigation stable.
      </Text>
    </View>
  );
}

const linking: any = {
  prefixes: [Linking.createURL("/")],
  config: {
    screens: {
      Root: {
        screens: {
          Home: "home",
          Wallet: "wallet",
          Family: "family",
          Rewards: "rewards",
          More: "more",
        },
      },
      Steps: "steps",
      NFTs: "nfts",
      FamilyTreasury: "treasury",
      FamilyChildren: "children",
      WalletOnboarding: "wallet-onboarding",
    },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "#ffffff" },
};

export default function App() {
    useEffect(() => {
    (async () => {
      try {
        const u = await ensureAuth();
        if (u) {
          await ensureUserDoc(); // создаём users/{uid}, если нет
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
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Root" component={TabsRoot} />
            <Stack.Screen
              name="Steps"
              component={StepsScreen}
              options={{ headerShown: true, title: "Steps" }}
            />
            <Stack.Screen
              name="NFTs"
              component={NFTScreen}
              options={{ headerShown: true, title: "My NFTs" }}
            />
            <Stack.Screen
  name="FamilyTasks"
  component={FamilyTasksScreen}
  options={{ headerShown: true, title: "Family Tasks" }}
/>

            <Stack.Screen
              name="FamilyTreasury"
              component={FamilyTreasuryScreen}
              options={{ headerShown: true, title: "Treasury" }}
            />
            <Stack.Screen
              name="FamilyChildren"
              component={FamilyChildrenScreen}
              options={{ headerShown: true, title: "Children" }}
            />
            <Stack.Screen 
               name="FamilyChatList"
               component={FamilyChatListScreen} 
            />
            <Stack.Screen 
               name="FamilyChat" 
               component={FamilyChatScreen} 
            />
            <Stack.Screen
               name="Assistant"
               component={AssistantScreen}
               options={{ headerShown: true, title: "AI Assistant" }}
            />
            <Stack.Screen
              name="WalletOnboarding"
              component={WalletOnboardingScreen}
              options={{ headerShown: true, title: "Wallet Onboarding" }}
            />
          </Stack.Navigator>
        </SafeAreaView>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
