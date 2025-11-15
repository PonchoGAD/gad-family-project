// apps/mobile/src/screens/AssistantScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  Button,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { auth, db } from "../firebase";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { fn } from "../lib/functionsClient";

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: any;
};

export default function AssistantScreen() {
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const uid = auth.currentUser?.uid;
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
  }, []);

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    try {
      const call = fn<{ message: string }, { ok: boolean; reply: string }>("assistantChat");
      await call({ message: text.trim() });
      setText("");
    } catch (e) {
      console.log("assistantChat error", e);
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0b0f17" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700", marginBottom: 8 }}>
          AI Assistant
        </Text>

        <FlatList
          data={messages}
          keyExtractor={(i) => i.id}
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
                    item.role === "user" ? "#2563eb" : "#111827",
                }}
              >
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 14,
                  }}
                >
                  {item.content}
                </Text>
              </View>
            </View>
          )}
        />
      </View>

      <View
        style={{
          flexDirection: "row",
          padding: 10,
          borderTopWidth: 1,
          borderColor: "#1f2933",
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Ask your assistant…"
          placeholderTextColor="#6B7280"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            paddingHorizontal: 8,
            color: "#fff",
          }}
        />
        <Button title={sending ? "..." : "Send"} onPress={send} disabled={sending} />
      </View>
    </KeyboardAvoidingView>
  );
}
