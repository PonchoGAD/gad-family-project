// apps/mobile/src/screens/FamilyChatListScreen.tsx

import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  getCurrentUserFamilyId,
  subscribeFamilyChats,
  createMultiFamilyChat,
  FamilyChat,
} from "../lib/families";

type Props = {
  navigation: any;
  route: {
    params?: {
      startChatWithFamilyId?: string;
    };
  };
};

export default function FamilyChatListScreen({ navigation, route }: Props) {
  const [fid, setFid] = useState<string | null>(null);
  const [chats, setChats] = useState<FamilyChat[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const startChatWithFamilyId = route?.params?.startChatWithFamilyId;

  // Подписка на чаты семьи
  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const myFid = await getCurrentUserFamilyId();
        if (!myFid) {
          setLoading(false);
          Alert.alert(
            "Family Chats",
            "You are not part of any family yet. Create or join a family first."
          );
          return;
        }

        setFid(myFid);

        unsub = subscribeFamilyChats(myFid, (items) => {
          setChats(items);
          setLoading(false);
        });
      } catch (e: any) {
        console.error("FamilyChatListScreen load error", e);
        setLoading(false);
        Alert.alert(
          "Family Chats",
          e?.message ?? "Failed to load family chats"
        );
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Проверка/создание чата с конкретной семьёй (если пришёл startChatWithFamilyId)
  const ensureChatWithFamily = useCallback(
    async (otherFamilyId: string) => {
      if (!fid) return;
      if (!otherFamilyId) return;

      // Есть ли уже чат, где участвуют обе семьи?
      const existing = chats.find(
        (c) =>
          Array.isArray(c.membersFamilies) &&
          c.membersFamilies.includes(fid) &&
          c.membersFamilies.includes(otherFamilyId)
      );

      if (existing) {
        navigation.navigate("FamilyChat", {
          chatId: existing.id,
          title: "Family chat",
          membersFamilies: existing.membersFamilies,
        });
        return;
      }

      try {
        setCreating(true);
        const chatId = await createMultiFamilyChat(fid, otherFamilyId);

        navigation.navigate("FamilyChat", {
          chatId,
          title: "Family chat",
          membersFamilies: [fid, otherFamilyId],
        });
      } catch (e: any) {
        console.error("createMultiFamilyChat error", e);
        Alert.alert(
          "Family Chats",
          e?.message ?? "Failed to start chat with this family"
        );
      } finally {
        setCreating(false);
      }
    },
    [fid, chats, navigation]
  );

  // Если экран открыт с параметром startChatWithFamilyId — запускаем ensureChatWithFamily,
  // когда уже загрузились fid и список чатов.
  useEffect(() => {
    if (!startChatWithFamilyId) return;
    if (!fid) return;
    if (loading) return;

    ensureChatWithFamily(startChatWithFamilyId);
  }, [startChatWithFamilyId, fid, loading, ensureChatWithFamily]);

  if (loading) {
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
          Loading family chats…
        </Text>
      </View>
    );
  }

  if (!fid) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#020617",
          justifyContent: "center",
          alignItems: "center",
          padding: 24,
        }}
      >
        <Text
          style={{
            color: "#e5e7eb",
            fontSize: 16,
            textAlign: "center",
            marginBottom: 8,
          }}
        >
          You are not part of any family yet.
        </Text>
        <Text
          style={{
            color: "#9ca3af",
            fontSize: 13,
            textAlign: "center",
          }}
        >
          Create or join a family to start chatting with other families.
        </Text>
      </View>
    );
  }

  function renderChat(item: FamilyChat) {
    const members = item.membersFamilies || [];
    const otherFamilies = members.filter((m) => m !== fid);
    const subtitle =
      otherFamilies.length > 0
        ? `Chat with: ${otherFamilies.join(", ")}`
        : "Family chat";

    const lastText = item.lastMessageText || "No messages yet";

    return (
      <TouchableOpacity
        onPress={() =>
          navigation.navigate("FamilyChat", {
            chatId: item.id,
            title: "Family chat",
            membersFamilies: item.membersFamilies,
          })
        }
        style={{
          backgroundColor: "#0f172a",
          padding: 14,
          borderRadius: 16,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: "rgba(31,41,55,0.9)",
        }}
      >
        <Text
          style={{
            color: "#f9fafb",
            fontSize: 16,
            fontWeight: "700",
          }}
        >
          {subtitle}
        </Text>
        <Text
          style={{
            color: "#9ca3af",
            fontSize: 13,
            marginTop: 4,
          }}
          numberOfLines={1}
        >
          {lastText}
        </Text>
      </TouchableOpacity>
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
          Family Chats
        </Text>
        <Text style={{ color: "#9ca3af", fontSize: 13 }}>
          Conversations between your family and other families.
        </Text>
        {creating && (
          <Text
            style={{
              color: "#fbbf24",
              fontSize: 12,
              marginTop: 4,
            }}
          >
            Creating chat…
          </Text>
        )}
      </View>

      {/* List of chats */}
      <FlatList
        data={chats}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 24,
        }}
        renderItem={({ item }) => renderChat(item)}
        ListEmptyComponent={
          <View
            style={{
              backgroundColor: "#0f172a",
              padding: 16,
              borderRadius: 16,
              marginTop: 16,
            }}
          >
            <Text
              style={{
                color: "#e5e7eb",
                fontWeight: "500",
                marginBottom: 4,
              }}
            >
              No chats yet
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 13 }}>
              Find nearby families on the map and send them a friend request to
              start chatting.
            </Text>
          </View>
        }
      />
    </View>
  );
}
