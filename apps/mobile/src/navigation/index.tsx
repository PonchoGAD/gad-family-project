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

// Route types
export type RootStackParamList = {
  Families: undefined;
  Settings: undefined;
  Wallet: undefined;
  FamilyMap: undefined;
  Assistant: undefined;
  FamilyFriends: undefined;
  MyFunds: undefined;
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
        <Stack.Screen
          name="FamilyFriends"
          component={FamilyFriendsScreen}
        />
        <Stack.Screen name="MyFunds" component={MyFundsScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
