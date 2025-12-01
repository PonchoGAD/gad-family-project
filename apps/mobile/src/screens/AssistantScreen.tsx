// apps/mobile/src/screens/AssistantScreen.tsx
// -----------------------------------------------------
// AI Assistant screen:
//
//  - chat history from messages_private/{uid}/assistant
//  - Cloud Function "assistantChat" for replies
//  - investor-friendly intro + GAD flow hints in demo-mode
// -----------------------------------------------------

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableOpacity,
} from "react-native";
import { auth, db } from "../firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { fn } from "../lib/functionsClient";
import { useTheme } from "../wallet/ui/theme";
import { useActiveUid, useIsDemo } from "../demo/DemoContext";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: any;
};

export default function AssistantScreen() {
  const G = useTheme();
  const isDemo = useIsDemo();
  const { uid: ctxUid } = useActiveUid();

  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  // uid с учётом демо-режима
  const uid = ctxUid ?? auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) return;

    const ref = query(
      collection(db, "messages_private", uid, "assistant"),
      orderBy("createdAt", "asc")
    );

    const unsub = onSnapshot(ref, (snap) => {
      const arr: AssistantMessage[] = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setMessages(arr);
    });

    return () => unsub();
  }, [uid]);

  async function send() {
    if (!text.trim() || !uid) return;
    setSending(true);
    try {
      const call = fn<{ message: string }, { ok: boolean; reply: string }>(
        "assistantChat"
      );
      await call({ message: text.trim() });
      setText("");
    } catch (e) {
      console.log("assistantChat error", e);
    } finally {
      setSending(false);
    }
  }

  function handleQuickPrompt(prompt: string) {
    setText(prompt);
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: G.colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 16 }}>
        <Text
          style={{
            color: G.colors.text,
            fontSize: 20,
            fontWeight: "700",
            marginBottom: 8,
          }}
        >
          AI Assistant
        </Text>

        {isDemo && (
          <View
            style={{
              borderRadius: 12,
              padding: 12,
              marginBottom: 10,
              backgroundColor: G.colors.card,
              borderWidth: 1,
              borderColor: G.colors.demoBorder,
            }}
          >
            <Text
              style={{
                color: G.colors.demoAccent,
                fontSize: 12,
                fontWeight: "600",
                marginBottom: 4,
              }}
            >
              Demo mode: GAD Family guide
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 13,
              }}
            >
              Use this assistant as a guide through the GAD ecosystem: steps →
              missions → GAD Points → wallet → NFTs & DAO.
            </Text>
          </View>
        )}

        {/* Quick suggestions (особенно полезно в инвест-демо) */}
        <View
          style={{
            marginBottom: 8,
          }}
        >
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 12,
              marginBottom: 4,
            }}
          >
            Try asking:
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
            }}
          >
            <QuickChip
              label="Explain GAD Move-to-Earn flow"
              onPress={() =>
                handleQuickPrompt(
                  "Explain how GAD converts my daily steps into GAD Points and then into on-chain GAD tokens."
                )
              }
            />
            <QuickChip
              label="Family treasury demo"
              onPress={() =>
                handleQuickPrompt(
                  "Describe how the family treasury and missions work in the GAD Family app."
                )
              }
            />
            <QuickChip
              label="Investor overview"
              onPress={() =>
                handleQuickPrompt(
                  "Give me a concise investor overview of the GAD ecosystem."
                )
              }
            />
          </View>
        </View>

        <FlatList
          data={messages}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingVertical: 4, paddingBottom: 8 }}
          renderItem={({ item }) => (
            <View
              style={{
                marginVertical: 4,
                alignSelf: item.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "80%",
              }}
            >
              <View
                style={{
                  borderRadius: 10,
                  padding: 8,
                  backgroundColor:
                    item.role === "user"
                      ? G.colors.accent
                      : G.colors.cardStrong,
                }}
              >
                <Text
                  style={{
                    color: item.role === "user" ? "#0B1120" : G.colors.text,
                    fontSize: 14,
                  }}
                >
                  {item.content}
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View
              style={{
                marginTop: 12,
                borderRadius: 12,
                padding: 12,
                backgroundColor: G.colors.cardStrong,
                borderWidth: 1,
                borderColor: G.colors.border,
              }}
            >
              <Text
                style={{
                  color: G.colors.text,
                  fontWeight: "600",
                  marginBottom: 4,
                }}
              >
                Welcome to your GAD Assistant
              </Text>
              <Text
                style={{
                  color: G.colors.textMuted,
                  fontSize: 13,
                }}
              >
                Ask anything about the GAD Family app, Move-to-Earn logic,
                family treasury, wallet, NFTs or DAO. The assistant knows the
                ecosystem structure and can help you navigate the demo.
              </Text>
            </View>
          }
        />
      </View>

      {/* input bar */}
      <View
        style={{
          flexDirection: "row",
          padding: 10,
          borderTopWidth: 1,
          borderColor: G.colors.border,
          backgroundColor: G.colors.card,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask your assistant…"
          placeholderTextColor={G.colors.textMuted}
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: G.colors.border,
            borderRadius: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            color: G.colors.text,
            marginRight: 8,
            backgroundColor: G.colors.inputBg,
          }}
        />
        <TouchableOpacity
          onPress={send}
          disabled={sending || !text.trim() || !uid}
          activeOpacity={0.85}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 10,
            backgroundColor:
              sending || !text.trim() || !uid
                ? G.colors.buttonDisabled
                : G.colors.accent,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text
            style={{
              color:
                sending || !text.trim() || !uid
                  ? G.colors.textMuted
                  : "#0B1120",
              fontWeight: "600",
            }}
          >
            {sending ? "…" : "Send"}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

type QuickChipProps = {
  label: string;
  onPress: () => void;
};

function QuickChip({ label, onPress }: QuickChipProps) {
  const G = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: G.colors.chipBg,
        borderWidth: 1,
        borderColor: G.colors.borderSoft,
      }}
      activeOpacity={0.85}
    >
      <Text
        style={{
          color: G.colors.textSoft,
          fontSize: 11,
          fontWeight: "500",
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}
