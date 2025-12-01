// apps/mobile/src/navigation/ChatStack.tsx

import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import ChatsListScreen from "../screens/ChatsListScreen";
import ChatScreen from "../screens/ChatScreen";

export type ChatStackParamList = {
  ChatsList: undefined;
  ChatScreen: { chatId: string };
};

const Stack = createNativeStackNavigator<ChatStackParamList>();

export function ChatStackNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="ChatsList"
      screenOptions={{
        headerStyle: { backgroundColor: "#05070c" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "600" },
      }}
    >
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
  );
}
