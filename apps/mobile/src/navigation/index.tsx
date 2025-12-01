// apps/mobile/src/navigation/index.tsx
// ---------------------------------------------
// Root navigation:
//  - Stack: Auth + MainTabs + все существующие экраны
//  - Bottom Tabs внутри MainTabs: Home, Map, Missions, Wallet, Profile
//  - Auth флоу: AuthWelcome → AuthRole → AuthFamilyConnect
// ---------------------------------------------

import React, { useEffect, useState } from "react";
import { Text, View, ActivityIndicator } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";

import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

// 🔹 TAB-экраны (верхний уровень приложения)
import HomeScreen from "../screens/HomeScreen";
import FamilyMapScreen from "../screens/FamilyMapScreen";
import FamilyGoalsScreen from "~/screens/FamilyGoalsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import WalletScreen from "../screens/WalletScreen";

// 🔹 Остальные экраны (все, что есть в src/screens)
import FamiliesScreen from "../screens/FamiliesScreen";
import AssistantScreen from "../screens/AssistantScreen";
import FamilyFriendsScreen from "../screens/FamilyFriendsScreen";
import MyFundsScreen from "../screens/MyFundsScreen";
import ReferralScreen from "../screens/ReferralScreen";
import StakingScreen from "~/screens/StakingScreen";
import ExchangeHistoryScreen from "~/screens/ExchangeHistoryScreen";
import FriendRequestsScreen from "~/screens/FriendRequestsScreen";
import BadgesScreen from "~/screens/BadgesScreen";
import GasHistoryScreen from "~/screens/GasHistoryScreen";
import FamilySettingsScreen from "../screens/FamilySettingsScreen";
import WalletActivityScreen from "../screens/WalletActivityScreen";
import NFTGalleryScreen from "../screens/NFTGalleryScreen";
import NFTDetailScreen from "../screens/NFTDetailScreen";
import StepsScreen from "../screens/StepsScreen";

// Новый Demo Hub
import DemoPreviewScreen from "../screens/DemoPreviewScreen";

// Финансовый слой
import ExchangeFundScreen from "../screens/ExchangeFundScreen";
import FundDetailsScreen from "../screens/FundDetailsScreen";

// Family-экраны
import FamilyGoalsScreenFull from "../screens/FamilyGoalsScreen"; // боевой вариант
import FamilyTasksScreen from "../screens/FamilyTasksScreen";
import FamilyTreasuryScreen from "../screens/FamilyTreasuryScreen";
import FamilyFundsScreen from "../screens/FamilyFundsScreen";
import FamilyChildrenScreen from "../screens/FamilyChildrenScreen";
import FamilyMemberDetailScreen from "../screens/FamilyMemberDetailScreen";
import FamilyChatListScreen from "../screens/FamilyChatListScreen";
import FamilyChatScreen from "../screens/FamilyChatScreen";
import InviteFamilyScreen from "../screens/InviteFamilyScreen";
import FamilyMapScreenFull from "../screens/FamilyMapScreen";

// Профиль / приватность / подписка / награды
import ProfileScreen from "../screens/ProfileScreen";
import ProfileDOBScreen from "../screens/ProfileDOBScreen";
import PrivacyScreen from "../screens/PrivacyScreen";
import SubscriptionScreen from "../screens/SubscriptionScreen";
import RewardsScreen from "../screens/RewardsScreen";

// История / миссии / карта (альтернативные экраны)
import HistoryScreen from "../screens/HistoryScreen";
import MapScreen from "../screens/MapScreen";
import MissionsScreen from "../screens/MissionsScreen";
import PlacesScreen from "../screens/PlacesScreen";

// NFT root-экран (галерея, маркетплейс и т.п.)
import NFTScreen from "../screens/NFTScreen";

// 🔹 Новые экраны онбординга
import AuthWelcomeScreen from "../screens/AuthWelcomeScreen";
import AuthRoleScreen from "../screens/AuthRoleScreen";
import AuthFamilyConnectScreen from "../screens/AuthFamilyConnectScreen";

// 🔹 Новый модуль чата
import ChatsListScreen from "../screens/ChatsListScreen";
import ChatScreen from "../screens/ChatScreen";

// ---------------------------------------------
// Tabs param list
// ---------------------------------------------
export type RootTabParamList = {
  Home: undefined;
  Map: undefined;
  Missions: undefined;
  Wallet: undefined;
  Profile: undefined;
};

// ---------------------------------------------
// Stack param list (включая Auth + MainTabs + все экраны)
// ---------------------------------------------
export type RootStackParamList = {
  // Auth flow
  AuthWelcome: undefined;
  AuthRole: undefined;
  AuthFamilyConnect: undefined;

  // Main app
  MainTabs: undefined;

  // Demo hub
  DemoPreview: undefined;

  // Финансовый слой
  ExchangeFund: undefined;
  FundDetails: { rid: string };

  // Остальные экраны
  Families: undefined;
  Settings: undefined;
  Wallet: undefined;
  FamilyMap: undefined;
  Assistant: undefined;
  FamilyFriends: undefined;
  MyFunds: undefined;
  Referral: undefined;
  Staking: undefined;
  FamilyGoals: undefined;
  ExchangeHistory: undefined;
  FriendRequests: undefined;
  Badges: undefined;
  GasHistory: undefined;
  FamilySettings: undefined;
  WalletActivity: undefined;
  NFTGallery: undefined;
  NFTDetail: { item: any };
  Steps: undefined;

  // Family расширенный слой
  FamilyGoalsFull: undefined;
  FamilyTasks: undefined;
  FamilyTreasury: undefined;
  FamilyFunds: undefined;
  FamilyChildren: undefined;
  FamilyMemberDetail: undefined;
  FamilyChatList: undefined;
  FamilyChat: undefined;
  InviteFamily: undefined;
  FamilyMapFull: undefined;

  // Профиль / приватность / подписка / награды
  ProfileScreen: undefined;
  ProfileDOB: undefined;
  Privacy: undefined;
  Subscription: undefined;
  Rewards: undefined;

  // История / миссии / карта / места
  History: undefined;
  MapScreen: undefined;
  MissionsScreen: undefined;
  Places: undefined;

  // NFT root
  NFT: undefined;

  // Chat module
  ChatsList: undefined;
  ChatScreen: { chatId: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<RootTabParamList>();

// ---------------------------------------------
// Bottom Tabs: Home / Map / Missions / Wallet / Profile
// ---------------------------------------------
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: "#020617",
          borderTopColor: "#111827",
          borderTopWidth: 1,
        },
        tabBarActiveTintColor: "#facc15", // золото
        tabBarInactiveTintColor: "#9ca3af",
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
        },
        tabBarIcon: ({ color }) => (
          <Text style={{ color, fontSize: 12 }}>
            {route.name === "Home"
              ? "🏠"
              : route.name === "Map"
              ? "🗺"
              : route.name === "Missions"
              ? "🎯"
              : route.name === "Wallet"
              ? "👛"
              : "👤"}
          </Text>
        ),
      })}
    >
      {/* Home: боевой экран с Firebase и статистикой */}
      <Tab.Screen name="Home" component={HomeScreen} />

      {/* Map: сейчас боевой FamilyMapScreen */}
      <Tab.Screen name="Map" component={FamilyMapScreen} />

      {/* Missions: сейчас FamilyGoalsScreen (цели/миссии семьи) */}
      <Tab.Screen name="Missions" component={FamilyGoalsScreen} />

      {/* Wallet: основной кошелёк */}
      <Tab.Screen name="Wallet" component={WalletScreen} />

      {/* Profile: центр профиля/настроек (пока SettingsScreen) */}
      <Tab.Screen name="Profile" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

// ---------------------------------------------
// RootNavigator с выбором стартового экрана:
//  - если onboarded → MainTabs
//  - иначе → AuthWelcome
// ---------------------------------------------
export function RootNavigator() {
  const [initialRoute, setInitialRoute] = useState<
    keyof RootStackParamList | null
  >(null);

  useEffect(() => {
    (async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          // нет юзера → точно в онбординг
          setInitialRoute("AuthWelcome");
          return;
        }

        const snap = await getDoc(doc(db, "users", user.uid));
        const data = (snap.exists() ? snap.data() : {}) as any;

        const role = (data.role as string | undefined) ?? null;
        const familyId = (data.familyId as string | undefined) ?? null;
        const flaggedOnboarded = data.onboarded === true;

        const onboarded =
          flaggedOnboarded || (role != null && familyId != null);

        setInitialRoute(onboarded ? "MainTabs" : "AuthWelcome");
      } catch (e) {
        console.log("[RootNavigator] init error", e);
        setInitialRoute("AuthWelcome");
      }
    })();
  }, []);

  if (!initialRoute) {
    // простой лоадер, чтобы не моргала навигация
    return (
      <NavigationContainer>
        <View
          style={{
            flex: 1,
            backgroundColor: "#020617",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <ActivityIndicator size="large" color="#facc15" />
          <Text
            style={{
              marginTop: 12,
              color: "#e5e7eb",
              fontSize: 14,
            }}
          >
            Initializing...
          </Text>
        </View>
      </NavigationContainer>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName={initialRoute}
        screenOptions={{
          headerStyle: { backgroundColor: "#020617" },
          headerTintColor: "#f9fafb",
        }}
      >
        {/* 🔹 Auth flow */}
        <Stack.Screen
          name="AuthWelcome"
          component={AuthWelcomeScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AuthRole"
          component={AuthRoleScreen}
          options={{ title: "Choose Role" }}
        />
        <Stack.Screen
          name="AuthFamilyConnect"
          component={AuthFamilyConnectScreen}
          options={{ title: "Connect Family" }}
        />

        {/* 🔹 Главный экран – табы */}
        <Stack.Screen
          name="MainTabs"
          component={MainTabs}
          options={{ headerShown: false }}
        />

        {/* 🔹 Demo Hub */}
        <Stack.Screen
          name="DemoPreview"
          component={DemoPreviewScreen}
          options={{ title: "Demo Preview" }}
        />

        {/* 🔹 Финансовый слой */}
        <Stack.Screen
          name="ExchangeFund"
          component={ExchangeFundScreen}
          options={{ title: "Exchange Fund" }}
        />
        <Stack.Screen
          name="FundDetails"
          component={FundDetailsScreen}
          options={{ title: "Exchange Request" }}
        />

        {/* 🔹 Базовые экраны */}
        <Stack.Screen name="Families" component={FamiliesScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="FamilyMap" component={FamilyMapScreen} />
        <Stack.Screen name="Assistant" component={AssistantScreen} />

        <Stack.Screen name="Referral" component={ReferralScreen} />
        <Stack.Screen name="Staking" component={StakingScreen} />
        <Stack.Screen name="FamilyGoals" component={FamilyGoalsScreenFull} />
        <Stack.Screen
          name="ExchangeHistory"
          component={ExchangeHistoryScreen}
        />
        <Stack.Screen
          name="FriendRequests"
          component={FriendRequestsScreen}
        />
        <Stack.Screen name="Badges" component={BadgesScreen} />
        <Stack.Screen name="GasHistory" component={GasHistoryScreen} />

        <Stack.Screen
          name="FamilySettings"
          component={FamilySettingsScreen}
        />

        <Stack.Screen
          name="WalletActivity"
          component={WalletActivityScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NFTGallery"
          component={NFTGalleryScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="NFTDetail"
          component={NFTDetailScreen}
          options={{ headerShown: false }}
        />

        <Stack.Screen
          name="FamilyFriends"
          component={FamilyFriendsScreen}
        />
        <Stack.Screen name="MyFunds" component={MyFundsScreen} />

        {/* Steps как отдельный экран (для Quick actions из Home) */}
        <Stack.Screen name="Steps" component={StepsScreen} />

        {/* 🔹 Family расширенный слой */}
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
          name="FamilyFunds"
          component={FamilyFundsScreen}
          options={{ title: "Family Funds" }}
        />
        <Stack.Screen
          name="FamilyChildren"
          component={FamilyChildrenScreen}
          options={{ title: "Children" }}
        />
        <Stack.Screen
          name="FamilyMemberDetail"
          component={FamilyMemberDetailScreen as any}
          options={{ title: "Member" }}
        />
        <Stack.Screen
          name="FamilyChatList"
          component={FamilyChatListScreen}
          options={{ title: "Family Chats" }}
        />
        <Stack.Screen
          name="FamilyChat"
          component={FamilyChatScreen as any}
          options={{ title: "Chat" }}
        />
        <Stack.Screen
          name="InviteFamily"
          component={InviteFamilyScreen}
          options={{ title: "Invite Family" }}
        />
        <Stack.Screen
          name="FamilyMapFull"
          component={FamilyMapScreenFull}
          options={{ title: "Family Map" }}
        />

        {/* 🔹 Профиль / приватность / подписка / награды */}
        <Stack.Screen
          name="ProfileScreen"
          component={ProfileScreen}
          options={{ title: "Profile" }}
        />
        <Stack.Screen
          name="ProfileDOB"
          component={ProfileDOBScreen}
          options={{ title: "Date of Birth" }}
        />
        <Stack.Screen
          name="Privacy"
          component={PrivacyScreen}
          options={{ title: "Privacy" }}
        />
        <Stack.Screen
          name="Subscription"
          component={SubscriptionScreen}
          options={{ title: "Subscription" }}
        />
        <Stack.Screen
          name="Rewards"
          component={RewardsScreen}
          options={{ title: "Rewards" }}
        />

        {/* 🔹 История / миссии / карта / места */}
        <Stack.Screen
          name="History"
          component={HistoryScreen}
          options={{ title: "History" }}
        />
        <Stack.Screen
          name="MapScreen"
          component={MapScreen}
          options={{ title: "Map" }}
        />
        <Stack.Screen
          name="MissionsScreen"
          component={MissionsScreen}
          options={{ title: "Missions" }}
        />
        <Stack.Screen
          name="Places"
          component={PlacesScreen}
          options={{ title: "Places" }}
        />

        {/* 🔹 NFT root */}
        <Stack.Screen
          name="NFT"
          component={NFTScreen}
          options={{ title: "NFT" }}
        />

        {/* 🔹 Chat module */}
        <Stack.Screen
          name="ChatsList"
          component={ChatsListScreen}
          options={{ title: "Chats" }}
        />
        <Stack.Screen
          name="ChatScreen"
          component={ChatScreen}
          options={{ title: "Chat" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
