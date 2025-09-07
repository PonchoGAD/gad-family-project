// apps/mobile/App.tsx
import * as Linking from "expo-linking";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useEffect } from "react";
import { registerForPush } from "./src/services/pushService";

// Screens
import HomeScreen from "./src/screens/HomeScreen";
import WalletScreen from "./src/screens/WalletScreen";
import StepsScreen from "./src/screens/StepsScreen";
import FamiliesScreen from "./src/screens/FamiliesScreen";
import RewardsScreen from "./src/screens/RewardsScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import FamilyTreasuryScreen from "./src/screens/FamilyTreasuryScreen";
import NFTScreen from "./src/screens/NFTScreen";
import FamilyChildrenScreen from "./src/screens/FamilyChildrenScreen";

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

export default function AppRoot(props:any) {
  useEffect(() => {
    registerForPush().catch(console.log);
  }, []);
  // остальной код App из шаблона Expo (оставь как есть)
  return props.children || null;
}

function iconNameFor(routeName: string, focused: boolean): keyof typeof Ionicons.glyphMap {
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
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, size }) => (
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

// ПРОСТО кастуем к any, чтобы не упираться в типы
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
    },
  },
};

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: "#ffffff" },
};

export default function App() {
  return (
    <SafeAreaProvider>
      <NavigationContainer linking={linking} theme={navTheme}>
        <SafeAreaView style={{ flex: 1 }}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {/* Tabs как корень */}
            <Stack.Screen name="Root" component={TabsRoot} />

            {/* Вложенные экраны (вне табов) */}
            <Stack.Screen name="Steps" component={StepsScreen} options={{ headerShown: true, title: "Steps" }} />
            <Stack.Screen name="NFTs" component={NFTScreen} options={{ headerShown: true, title: "My NFTs" }} />
            <Stack.Screen name="FamilyTreasury" component={FamilyTreasuryScreen} options={{ headerShown: true, title: "Treasury" }} />
            <Stack.Screen name="FamilyChildren" component={FamilyChildrenScreen} options={{ headerShown: true, title: "Children" }} />
          </Stack.Navigator>
        </SafeAreaView>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
