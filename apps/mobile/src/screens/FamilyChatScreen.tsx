// apps/mobile/src/screens/FamilyChatScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import {
  getCurrentUserFamilyId,
  subscribeFamilyMessages,
  sendFamilyChatMessage,
  FamilyChatMessage,
} from "../lib/families";

type Props = {
  route: {
    params: {
      chatId: string;
      title?: string;
      membersFamilies?: string[];
    };
  };
};

export default function FamilyChatScreen({ route }: Props) {
  const { chatId, title, membersFamilies } = route.params;

  const [myFamilyId, setMyFamilyId] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<FamilyChatMessage[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const fid = await getCurrentUserFamilyId();
        if (!fid) {
          setLoading(false);
          Alert.alert(
            "Family Chat",
            "You are not part of any family yet. Chat is unavailable."
          );
          return;
        }
        setMyFamilyId(fid);

        unsub = subscribeFamilyMessages(fid, chatId, (arr) => {
          setMsgs(arr);
          setLoading(false);
        });
      } catch (e: any) {
        console.error("FamilyChatScreen error", e);
        setLoading(false);
        Alert.alert(
          "Family Chat",
          e?.message ?? "Failed to load chat messages"
        );
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, [chatId]);

  async function handleSend() {
    if (!myFamilyId) return;
    const t = text.trim();
    if (!t) return;

    try {
      setSending(true);
      await sendFamilyChatMessage(myFamilyId, chatId, t);
      setText("");
    } catch (e: any) {
      console.error("sendFamilyChatMessage error", e);
      Alert.alert("Family Chat", e?.message ?? "Failed to send message");
    } finally {
      setSending(false);
    }
  }

  function renderMessage(item: FamilyChatMessage) {
    const isMine = item.senderFamilyId === myFamilyId;
    const align = isMine ? "flex-end" : "flex-start";
    const bubbleColor = isMine ? "#3b82f6" : "#111827";
    const textColor = "#f9fafb";

    return (
      <View
        style={{
          marginBottom: 8,
          flexDirection: "row",
          justifyContent: align,
        }}
      >
        <View
          style={{
            maxWidth: "80%",
            borderRadius: 16,
            paddingHorizontal: 12,
            paddingVertical: 8,
            backgroundColor: bubbleColor,
          }}
        >
          <Text
            style={{
              color: textColor,
              fontSize: 13,
              opacity: 0.8,
              marginBottom: 2,
            }}
          >
            {item.senderFamilyId?.slice(0, 8) ?? "family"}
          </Text>
          <Text
            style={{
              color: textColor,
              fontSize: 15,
            }}
          >
            {item.text}
          </Text>
        </View>
      </View>
    );
  }

  const headerSubtitle =
    membersFamilies && membersFamilies.length > 0
      ? `Families: ${membersFamilies.join(" · ")}`
      : undefined;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#020617" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
    >
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
            fontSize: 20,
            fontWeight: "700",
          }}
        >
          {title ?? "Family chat"}
        </Text>
        {headerSubtitle && (
          <Text
            style={{
              color: "#9ca3af",
              fontSize: 12,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {headerSubtitle}
          </Text>
        )}
      </View>

      {/* Messages */}
      <View style={{ flex: 1 }}>
        {loading ? (
          <View
            style={{
              flex: 1,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <ActivityIndicator />
            <Text style={{ color: "#9ca3af", marginTop: 8 }}>
              Loading messages…
            </Text>
          </View>
        ) : (
          <FlatList
            data={msgs}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 12,
            }}
            renderItem={({ item }) => renderMessage(item)}
          />
        )}
      </View>

      {/* Input */}
      <View
        style={{
          paddingHorizontal: 10,
          paddingVertical: 8,
          borderTopWidth: 1,
          borderTopColor: "rgba(31,41,55,0.9)",
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: "#020617",
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor="#6b7280"
          style={{
            flex: 1,
            color: "#f9fafb",
            borderWidth: 1,
            borderColor: "#1f2937",
            borderRadius: 999,
            paddingHorizontal: 12,
            paddingVertical: 8,
            marginRight: 8,
            backgroundColor: "#0b1120",
          }}
        />
        <Pressable
          onPress={handleSend}
          disabled={sending || !text.trim()}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: sending || !text.trim() ? "#374151" : "#22c55e",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {sending ? (
            <ActivityIndicator color="#0b1120" />
          ) : (
            <Text
              style={{
                color: "#0b1120",
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Send
            </Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}
