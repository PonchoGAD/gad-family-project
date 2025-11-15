// apps/mobile/src/screens/FamilyChatListScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Button,
  TextInput,
  Alert,
} from "react-native";
import { auth, db } from "../firebase";
import { getDoc, doc } from "firebase/firestore";
import { listenFamilyChats, createFamilyChat } from "../lib/chat";

export default function FamilyChatListScreen({ navigation }: any) {
  const [fid, setFid] = useState<string | null>(null);
  const [chats, setChats] = useState<any[]>([]);
  const [newTitle, setNewTitle] = useState("");

  useEffect(() => {
    (async () => {
      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const uSnap = await getDoc(doc(db, "users", uid));
      const fid = (uSnap.data() as any)?.familyId ?? null;
      setFid(fid);

      if (fid) {
        return listenFamilyChats(fid, (arr) => setChats(arr));
      }
    })();
  }, []);

  async function createChat() {
    if (!fid) return;
    if (!newTitle.trim()) return;

    await createFamilyChat(fid, newTitle.trim(), ["all"]);
    setNewTitle("");
    Alert.alert("Chat created");
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: "#0b0f17" }}>
      <Text style={{ color: "#fff", fontSize: 20, fontWeight: "700" }}>
        Family Chats
      </Text>

      {/* Create chat */}
      <View style={{ marginTop: 12 }}>
        <TextInput
          placeholder="New chat name"
          placeholderTextColor="#6B7280"
          value={newTitle}
          onChangeText={setNewTitle}
          style={{
            borderWidth: 1,
            borderColor: "#374151",
            borderRadius: 8,
            padding: 8,
            color: "#fff",
          }}
        />
        <Button title="Create chat" onPress={createChat} />
      </View>

      <FlatList
        style={{ marginTop: 20 }}
        data={chats}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={{
              padding: 12,
              backgroundColor: "#111827",
              borderRadius: 10,
              marginBottom: 10,
            }}
            onPress={() =>
              navigation.navigate("FamilyChat", {
                chatId: item.id,
                title: item.title,
              })
            }
          >
            <Text style={{ color: "#fff", fontSize: 16 }}>{item.title}</Text>
            <Text style={{ color: "#888", marginTop: 4 }}>
              Members: {item.members?.join(", ") ?? "unknown"}
            </Text>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
