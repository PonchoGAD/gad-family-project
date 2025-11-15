// apps/mobile/src/screens/FamilyChatScreen.tsx

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
import { getDoc, doc } from "firebase/firestore";
import { listenFamilyMessages, sendFamilyMessage } from "../lib/chat";

export default function FamilyChatScreen({ route }: any) {
  const { chatId, title } = route.params;

  const [fid, setFid] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<any[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const uSnap = await getDoc(doc(db, "users", uid));
      const f = (uSnap.data() as any)?.familyId ?? null;
      setFid(f);

      if (f) {
        return listenFamilyMessages(f, chatId, (arr) => setMsgs(arr));
      }
    })();
  }, []);

  async function send() {
    if (!fid) return;
    if (!text.trim()) return;

    await sendFamilyMessage(fid, chatId, text.trim());
    setText("");
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#0b0f17" }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: "#fff", fontSize: 20, marginBottom: 10 }}>
          {title}
        </Text>

        <FlatList
          data={msgs}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <View style={{ marginBottom: 10 }}>
              <Text style={{ color: "#60a5fa" }}>
                {item.senderUid.slice(0, 6)}:
              </Text>
              <Text style={{ color: "#fff", marginLeft: 6 }}>{item.text}</Text>
            </View>
          )}
        />
      </View>

      <View
        style={{
          padding: 10,
          borderTopWidth: 1,
          borderColor: "#222",
          flexDirection: "row",
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Message"
          placeholderTextColor="#666"
          style={{
            flex: 1,
            color: "#fff",
            borderWidth: 1,
            borderColor: "#333",
            borderRadius: 8,
            paddingHorizontal: 8,
          }}
        />
        <Button title="Send" onPress={send} />
      </View>
    </KeyboardAvoidingView>
  );
}
