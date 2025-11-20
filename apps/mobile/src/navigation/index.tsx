import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

// Screens
import FamiliesScreen from "../screens/FamiliesScreen";
import SettingsScreen from "../screens/SettingsScreen";
import WalletScreen from "../screens/WalletScreen";
import FamilyMapScreen from "../screens/FamilyMapScreen";
import AssistantScreen from "../screens/AssistantScreen";
import FamilyFriendsScreen from "../screens/FamilyFriendsScreen";
import MyFundsScreen from "../screens/MyFundsScreen";
import ReferralScreen from "../screens/ReferralScreen";
import StakingScreen from "~/screens/StakingScreen";
import FamilyGoalsScreen from "~/screens/FamilyGoalsScreen";
import ExchangeHistoryScreen from "~/screens/ExchangeHistoryScreen";
import FriendRequestsScreen from "~/screens/FriendRequestsScreen";
import BadgesScreen from "~/screens/BadgesScreen";

// Route types
export type RootStackParamList = {
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
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Families"
        screenOptions={{
          headerStyle: { backgroundColor: "#020617" },
          headerTintColor: "#f9fafb",
        }}
      >
        <Stack.Screen name="Families" component={FamiliesScreen} />
        <Stack.Screen name="Settings" component={SettingsScreen} />
        <Stack.Screen name="Wallet" component={WalletScreen} />
        <Stack.Screen name="FamilyMap" component={FamilyMapScreen} />
        <Stack.Screen name="Assistant" component={AssistantScreen} />
        <Stack.Screen name="Referral" component={ReferralScreen} />
        <Stack.Screen name="Staking" component={StakingScreen} />
        <Stack.Screen name="FamilyGoals" component={FamilyGoalsScreen} />
        <Stack.Screen name="ExchangeHistory" component={ExchangeHistoryScreen} />
        <Stack.Screen name="FriendRequests" component={FriendRequestsScreen} />
        <Stack.Screen name="Badges" component={BadgesScreen} />
        <Stack.Screen
          name="FamilyFriends"
          component={FamilyFriendsScreen}
        />
        <Stack.Screen name="MyFunds" component={MyFundsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
