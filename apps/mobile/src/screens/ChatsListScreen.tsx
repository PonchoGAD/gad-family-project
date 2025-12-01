// apps/mobile/src/screens/ChatsListScreen.tsx

import React, {
  useEffect,
  useMemo,
  useState,
  useCallback,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";

import { auth, db } from "../firebase";
import { Chat, UserChatMeta } from "../lib/chatTypes";
import {
  subscribeToUserChats,
  ensureFamilyChat,
  createDmChatWithChecks,
  subscribeToUserChatMeta,
} from "../lib/chat";

type UserProfile = {
  uid: string;
  displayName?: string;
  fullName?: string;
  role?: string;
};

type ChatsListScreenProps = {
  navigation: any;
};

const ChatsListScreen: React.FC<ChatsListScreenProps> = ({ navigation }) => {
  const [currentUid, setCurrentUid] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [loading, setLoading] = useState(true);
  const [subscribing, setSubscribing] = useState(false);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [userCache, setUserCache] = useState<Record<string, UserProfile>>({});
  const [chatMeta, setChatMeta] = useState<Record<string, UserChatMeta>>({});

  // --- Auth ---

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setCurrentUid(user.uid);
      } else {
        setCurrentUid(null);
        setChats([]);
      }
    });

    return () => unsub();
  }, []);

  // --- Chats subscription ---

  useEffect(() => {
    if (!currentUid) {
      setLoading(false);
      return;
    }

    setSubscribing(true);
    const unsub = subscribeToUserChats(currentUid, async (fetchedChats) => {
      setChats(fetchedChats);
      setLoading(false);
      setSubscribing(false);
      preloadDmUsers(currentUid, fetchedChats).catch((err) =>
        console.log("[ChatsListScreen] preloadDmUsers error:", err)
      );
    });

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUid]);

  // --- Chat meta subscription (unread support) ---

  useEffect(() => {
    if (!currentUid) return;

    const unsub = subscribeToUserChatMeta(currentUid, (metaList) => {
      const map: Record<string, UserChatMeta> = {};
      metaList.forEach((m) => {
        map[m.chatId] = m;
      });
      setChatMeta(map);
    });

    return () => unsub();
  }, [currentUid]);

  // --- Preload profiles for DM titles ---

  const preloadDmUsers = useCallback(
    async (uid: string, allChats: Chat[]) => {
      const dmChats = allChats.filter((c) => c.type === "dm");

      const memberIds = new Set<string>();
      dmChats.forEach((chat) => {
        chat.memberIds.forEach((m) => {
          if (m !== uid) memberIds.add(m);
        });
      });

      const missingIds = Array.from(memberIds).filter(
        (id) => !userCache[id]
      );
      if (missingIds.length === 0) return;

      const newCache: Record<string, UserProfile> = {};

      for (const userId of missingIds) {
        try {
          const userRef = doc(db, "users", userId);
          const snap = await getDoc(userRef);
          if (snap.exists()) {
            const data = snap.data() as any;
            newCache[userId] = {
              uid: userId,
              displayName: data.displayName ?? data.name ?? undefined,
              fullName: data.fullName ?? undefined,
              role: data.role ?? undefined,
            };
          } else {
            newCache[userId] = { uid: userId };
          }
        } catch (err) {
          console.log("[preloadDmUsers] Error loading user", userId, err);
        }
      }

      if (Object.keys(newCache).length > 0) {
        setUserCache((prev) => ({ ...prev, ...newCache }));
      }
    },
    [userCache]
  );

  // --- Pull to refresh (визуальное) ---

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  // --- Helpers ---

  const filteredChats = useMemo(() => {
    const q = search.trim().toLowerCase();

    const sorted = [...chats].sort((a, b) => {
      const aTime = (a.lastMessageAt as any)?.toMillis?.() ?? 0;
      const bTime = (b.lastMessageAt as any)?.toMillis?.() ?? 0;
      return bTime - aTime;
    });

    if (!q) return sorted;

    return sorted.filter((chat) => {
      const title = buildChatTitle(chat, currentUid, userCache).toLowerCase();
      const preview = (chat.lastMessagePreview ?? "").toLowerCase();

      return title.includes(q) || preview.includes(q);
    });
  }, [chats, search, currentUid, userCache]);

  function buildChatTitle(
    chat: Chat,
    uid: string | null,
    users: Record<string, UserProfile>
  ): string {
    if (chat.title) return chat.title;

    switch (chat.type) {
      case "family":
        return "Family Chat";
      case "assistant":
        return "Assistant";
      case "interfamily":
        return "Family Friends";
      case "group":
        return "Group Chat";
      case "dm": {
        if (!uid) return "Direct Message";
        const otherId = chat.memberIds.find((id) => id !== uid);
        if (!otherId) return "Direct Message";
        const profile = users[otherId];
        return (
          profile?.displayName ||
          profile?.fullName ||
          `Direct with ${otherId.slice(0, 6)}...`
        );
      }
      default:
        return "Chat";
    }
  }

  function isChatUnread(chat: Chat, meta?: UserChatMeta): boolean {
    if (!meta) return false;
    if (!chat.lastMessageAt) return false;

    const lastReadAt = meta.lastReadAt as any;
    if (!lastReadAt) return true;

    try {
      const lastMsgMillis =
        typeof (chat.lastMessageAt as any).toMillis === "function"
          ? (chat.lastMessageAt as any).toMillis()
          : Number(chat.lastMessageAt) || 0;

      const lastReadMillis =
        typeof lastReadAt.toMillis === "function"
          ? lastReadAt.toMillis()
          : Number(lastReadAt) || 0;

      return lastMsgMillis > lastReadMillis;
    } catch {
      return false;
    }
  }

  const handleOpenChat = useCallback(
    (chat: Chat) => {
      navigation.navigate("ChatScreen", { chatId: chat.id });
    },
    [navigation]
  );

  const handleOpenFamilyChat = useCallback(async () => {
    if (!currentUid) return;

    try {
      const userRef = doc(db, "users", currentUid);
      const snap = await getDoc(userRef);
      const data = snap.data() as any;
      const familyId = data?.familyId;
      if (!familyId) {
        setError("Family not found for current user.");
        return;
      }

      const chat = await ensureFamilyChat(familyId, currentUid);
      navigation.navigate("ChatScreen", { chatId: chat.id });
    } catch (err: any) {
      console.log("[handleOpenFamilyChat] Error:", err);
      setError(err.message ?? "Failed to open family chat.");
    }
  }, [currentUid, navigation]);

  const handleStartNewDm = useCallback(
    async (targetUid: string) => {
      if (!currentUid) return;
      try {
        const chat = await createDmChatWithChecks(currentUid, targetUid);
        navigation.navigate("ChatScreen", { chatId: chat.id });
      } catch (err: any) {
        console.log("[handleStartNewDm] Error:", err);
        setError(err.message ?? "Failed to create DM chat.");
      }
    },
    [currentUid, navigation]
  );

  // TODO: экран/модалка для выбора targetUid, оттуда вызывать handleStartNewDm.

  // --- Render ---

  if (!currentUid) {
    return (
      <SafeAreaView style={styles.centered}>
        <Text style={styles.infoText}>Please sign in to view your chats.</Text>
      </SafeAreaView>
    );
  }

  if (loading && !subscribing) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator />
        <Text style={styles.infoText}>Loading chats...</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Chats</Text>

        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleOpenFamilyChat}
          >
            <Text style={styles.headerButtonText}>Family</Text>
          </TouchableOpacity>

          {/* Пример: New DM (экран выбора пользователя) */}
          {/* <TouchableOpacity
            style={[styles.headerButton, { marginLeft: 8 }]}
            onPress={() => navigation.navigate("NewChatScreen")}
          >
            <Text style={styles.headerButtonText}>New</Text>
          </TouchableOpacity> */}
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          placeholder="Search chats..."
          placeholderTextColor="#888"
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
      </View>

      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <FlatList
        data={filteredChats}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const title = buildChatTitle(item, currentUid, userCache);
          const preview = item.lastMessagePreview || "No messages yet";
          const timeLabel = formatTime(item.lastMessageAt);

          const meta = chatMeta[item.id];
          const hasUnread = isChatUnread(item, meta);

          return (
            <TouchableOpacity
              style={styles.chatItem}
              onPress={() => handleOpenChat(item)}
            >
              <View style={styles.chatAvatar}>
                <Text style={styles.chatAvatarText}>
                  {title.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.chatContent}>
                <View style={styles.chatTopRow}>
                  <Text style={styles.chatTitle} numberOfLines={1}>
                    {title}
                  </Text>
                  <Text style={styles.chatTime}>{timeLabel}</Text>
                </View>
                <View style={styles.chatBottomRow}>
                  <Text style={styles.chatPreview} numberOfLines={1}>
                    {preview}
                  </Text>
                  {hasUnread && <View style={styles.unreadDot} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.infoText}>No chats yet.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
};

function formatTime(ts: any): string {
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
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: "#fff",
  },
  headerButtons: {
    flexDirection: "row",
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#1b1f2b",
  },
  headerButtonText: {
    color: "#ffd166",
    fontWeight: "500",
  },
  searchContainer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#0f1420",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    color: "#fff",
  },
  errorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  errorText: {
    color: "#ff6b6b",
  },
  chatItem: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#111522",
  },
  chatAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#111522",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  chatAvatarText: {
    color: "#ffd166",
    fontWeight: "700",
    fontSize: 18,
  },
  chatContent: {
    flex: 1,
    justifyContent: "center",
  },
  chatTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  chatTitle: {
    flex: 1,
    color: "#fff",
    fontWeight: "600",
    marginRight: 8,
  },
  chatTime: {
    color: "#888",
    fontSize: 12,
  },
  chatBottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatPreview: {
    flex: 1,
    color: "#aaa",
    fontSize: 13,
    marginRight: 8,
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#ffd166",
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
});

export default ChatsListScreen;
