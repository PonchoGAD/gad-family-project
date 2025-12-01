// apps/mobile/src/screens/ChatScreen.tsx

import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
  MutableRefObject,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { RouteProp } from "@react-navigation/native";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection } from "firebase/firestore";
import * as ImagePicker from "expo-image-picker";

import { auth, db } from "../firebase";
import { Chat, ChatMessage } from "../lib/chatTypes";
import {
  subscribeToMessages,
  sendTextMessage,
  sendMediaMessage,
  markMessageRead,
  markMessageDelivered,
  MediaPayload,
} from "../lib/chat";
import { uploadChatImage } from "../lib/chatMedia";

// Подправишь под свой навстек
type ChatScreenRouteParams = {
  ChatScreen: {
    chatId: string;
  };
};

type ChatScreenProps = {
  navigation: any;
  route: RouteProp<ChatScreenRouteParams, "ChatScreen">;
};

const DEFAULT_PAGE_SIZE = 50;

const ChatScreen: React.FC<ChatScreenProps> = ({ navigation, route }) => {
  const { chatId } = route.params;
  const [currentUid, setCurrentUid] = useState<string | null>(null);

  const [chat, setChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [inputText, setInputText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<FlatList<ChatMessage> | null>(null);

  // --- Auth ---

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) setCurrentUid(user.uid);
      else setCurrentUid(null);
    });

    return () => unsub();
  }, []);

  // --- Load chat meta ---

  useEffect(() => {
    let mounted = true;

    const loadChat = async () => {
      try {
        const chatRef = doc(db, "chats", chatId);
        const snap = await getDoc(chatRef);
        if (!snap.exists()) {
          if (mounted) {
            setError("Chat not found.");
            setLoading(false);
          }
          return;
        }
        const data = snap.data() as any;
        const chatData: Chat = {
          id: snap.id,
          ...data,
        };
        if (mounted) {
          setChat(chatData);
          setLoading(false);
          navigation.setOptions({
            title: chatData.title || "Chat",
          });
        }
      } catch (err: any) {
        console.log("[ChatScreen] loadChat error:", err);
        if (mounted) {
          setError(err.message ?? "Failed to load chat.");
          setLoading(false);
        }
      }
    };

    loadChat();

    return () => {
      mounted = false;
    };
  }, [chatId, navigation]);

  // --- Subscribe to messages ---

  useEffect(() => {
    if (!chatId) return;

    const unsub = subscribeToMessages(chatId, DEFAULT_PAGE_SIZE, (msgs) => {
      setMessages(msgs);

      // Отмечаем как доставлено/прочитано последнюю входящую
      if (!currentUid || msgs.length === 0) return;
      const last = msgs[msgs.length - 1];

      if (last.senderId !== currentUid) {
        markMessageDelivered(chatId, last.id, currentUid);
        markMessageRead(chatId, last.id, currentUid);
      }
    });

    return () => unsub();
  }, [chatId, currentUid]);

  // --- Scroll to bottom on new messages ---

  useEffect(() => {
    if (messages.length === 0) return;
    setTimeout(() => {
      if (listRef.current) {
        listRef.current.scrollToEnd({ animated: true });
      }
    }, 100);
  }, [messages]);

  // --- Handlers ---

  const handleSendText = useCallback(async () => {
    if (!currentUid) return;
    const trimmed = inputText.trim();
    if (!trimmed) return;

    setSending(true);
    try {
      await sendTextMessage(chatId, currentUid, trimmed);
      setInputText("");
    } catch (err: any) {
      console.log("[ChatScreen] handleSendText error:", err);
      setError(err.message ?? "Failed to send message.");
    } finally {
      setSending(false);
    }
  }, [chatId, currentUid, inputText]);

  const handleSendMedia = useCallback(async () => {
    if (!currentUid) return;

    try {
      // Запрос разрешения к галерее (один раз — потом OS сам помнит)
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") {
        setError("Permission to access gallery was denied.");
        return;
      }

      // Открываем галерею
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      const localUri = asset.uri;
      const mimeType = asset.mimeType || "image/jpeg";

      // Создаём временный messageId только для Storage-пути
      const messagesCol = collection(db, "chats", chatId, "messages");
      const tempMsgRef = doc(messagesCol); // только ради id
      const messageId = tempMsgRef.id;

      // Загружаем изображение в Storage
      const { mediaUrl, thumbnailUrl } = await uploadChatImage(
        chatId,
        messageId,
        localUri
      );

      const payload: MediaPayload = {
        mediaUrl,
        mediaType: mimeType,
        mediaSize: undefined, // можно взять из blob.size, если нужно
        thumbnailUrl,
      };

      // Отправляем сообщение в чат
      await sendMediaMessage(chatId, currentUid, payload, "image");
    } catch (err: any) {
      console.log("[ChatScreen] handleSendMedia error:", err);
      setError(err.message ?? "Failed to send media.");
    }
  }, [chatId, currentUid]);

  const renderMessageItem = useCallback(
    ({ item }: { item: ChatMessage }) => {
      const isMine = item.senderId === currentUid;

      if (item.deletedForEveryone) {
        return (
          <View style={styles.systemMessageContainer}>
            <Text style={styles.systemMessageText}>Message deleted</Text>
          </View>
        );
      }

      const bubbleStyles = [
        styles.messageBubble,
        isMine ? styles.messageBubbleMine : styles.messageBubbleTheirs,
      ];

      const containerStyles = [
        styles.messageRow,
        isMine ? styles.messageRowMine : styles.messageRowTheirs,
      ];

      const textColor = isMine ? "#05070c" : "#fff";

      const timeLabel = formatMessageTime(item.createdAt);

      const previewLabel =
        item.type === "image"
          ? "📷 Photo"
          : item.type === "file"
          ? "📎 File"
          : item.type === "voice"
          ? "🎤 Voice message"
          : null;

      return (
        <View style={containerStyles}>
          <View style={bubbleStyles}>
            {previewLabel && (
              <Text style={[styles.messageText, { color: textColor }]}>
                {previewLabel}
              </Text>
            )}
            {item.text ? (
              <Text style={[styles.messageText, { color: textColor }]}>
                {item.text}
              </Text>
            ) : null}

            {/* TODO: media preview (image thumbnail / file icon) */}

            <View style={styles.messageMetaRow}>
              <Text style={styles.messageTime}>{timeLabel}</Text>
              {/* TODO: delivered/read indicators using deliveredTo/readBy */}
            </View>
          </View>
        </View>
      );
    },
    [currentUid]
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.infoText}>Loading chat...</Text>
      </SafeAreaView>
    );
  }

  if (error && !chat) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.errorText}>{error}</Text>
      </SafeAreaView>
    );
  }

  const content = (
    <View style={styles.chatContainer}>
      {/* Messages list */}
      <FlatList
        ref={(ref) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (listRef as MutableRefObject<any>).current = ref;
        }}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={renderMessageItem}
        contentContainerStyle={styles.messagesListContent}
      />

      {/* Error banner */}
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{error}</Text>
        </View>
      ) : null}

      {/* Input */}
      <View style={styles.inputContainer}>
        <TouchableOpacity
          style={styles.attachButton}
          onPress={handleSendMedia}
        >
          <Text style={styles.attachButtonText}>+</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#888"
          value={inputText}
          onChangeText={setInputText}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.sendButton,
            !inputText.trim() || sending ? styles.sendButtonDisabled : null,
          ]}
          onPress={handleSendText}
          disabled={!inputText.trim() || sending}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#05070c" />
          ) : (
            <Text style={styles.sendButtonText}>Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {Platform.OS === "ios" ? (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior="padding"
          keyboardVerticalOffset={90}
        >
          {content}
        </KeyboardAvoidingView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
};

function formatMessageTime(ts: any): string {
  if (!ts) return "";
  try {
    const millis =
      typeof ts.toMillis === "function" ? ts.toMillis() : Number(ts) || 0;
    if (!millis) return "";
    const date = new Date(millis);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: "#05070c",
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#05070c",
  },
  infoText: {
    color: "#ccc",
    marginTop: 8,
  },
  errorText: {
    color: "#ff6b6b",
    paddingHorizontal: 16,
    textAlign: "center",
  },
  chatContainer: {
    flex: 1,
  },
  messagesListContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageRow: {
    flexDirection: "row",
    marginVertical: 4,
  },
  messageRowMine: {
    justifyContent: "flex-end",
  },
  messageRowTheirs: {
    justifyContent: "flex-start",
  },
  messageBubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  messageBubbleMine: {
    backgroundColor: "#ffd166",
    borderBottomRightRadius: 4,
  },
  messageBubbleTheirs: {
    backgroundColor: "#111522",
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 15,
  },
  messageMetaRow: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 4,
  },
  messageTime: {
    fontSize: 11,
    color: "#888",
  },
  systemMessageContainer: {
    alignItems: "center",
    marginVertical: 4,
  },
  systemMessageText: {
    fontSize: 12,
    color: "#777",
  },
  errorBanner: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: "#3d0e15",
  },
  errorBannerText: {
    color: "#ff9e9e",
    fontSize: 12,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#111522",
    backgroundColor: "#05070c",
  },
  attachButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#111522",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 6,
  },
  attachButtonText: {
    color: "#ffd166",
    fontSize: 18,
    fontWeight: "600",
  },
  input: {
    flex: 1,
    maxHeight: 110,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#0f1420",
    color: "#fff",
    fontSize: 15,
  },
  sendButton: {
    marginLeft: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: "#ffd166",
    alignItems: "center",
    justifyContent: "center",
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
  sendButtonText: {
    color: "#05070c",
    fontWeight: "600",
  },
});

export default ChatScreen;
