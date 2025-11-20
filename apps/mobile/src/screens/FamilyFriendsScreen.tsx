// apps/mobile/src/screens/FamilyFriendsScreen.tsx
import React, { useEffect, useState, useMemo } from "react";
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import {
  getCurrentUserFamilyId,
  getFamily,
  loadDiscoverableFamiliesAround,
} from "../lib/families";
import {
  collection,
  onSnapshot,
  query,
  DocumentData,
} from "firebase/firestore";
import { db } from "../firebase";

type FriendRequest = {
  id: string;
  fromFamilyId?: string;
  toFamilyId?: string;
  status?: string; // "pending" | "accepted" | "rejected"
};

type Friend = {
  id: string; // otherFamilyId
  since?: any;
  lastChatId?: string;
};

type NearbyFamily = any; // из loadDiscoverableFamiliesAround (id, name, location, city, kidsAges, interests и т.д.)

export default function FamilyFriendsScreen({ navigation }: any) {
  const [fid, setFid] = useState<string | null>(null);
  const [myFamily, setMyFamily] = useState<any>(null);
  const [families, setFamilies] = useState<NearbyFamily[]>([]);
  const [loading, setLoading] = useState(true);

  const [friendRequests, setFriendRequests] = useState<FriendRequest[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [sendingTo, setSendingTo] = useState<string | null>(null);

  async function loadNearby() {
    try {
      const currentFid = await getCurrentUserFamilyId();
      setFid(currentFid);

      if (!currentFid) {
        setLoading(false);
        return;
      }

      const myFam = await getFamily(currentFid);
      setMyFamily(myFam);

      if (!myFam?.location) {
        setLoading(false);
        return;
      }

      // radius 10km
      const around = await loadDiscoverableFamiliesAround(
        myFam.location.lat,
        myFam.location.lng,
        10,
        currentFid
      );

      setFamilies(around);
    } catch (e) {
      console.log("FamilyFriendsScreen load error", e);
    }
    setLoading(false);
  }

  // Первичная загрузка семьей + ближайших
  useEffect(() => {
    loadNearby();
  }, []);

  // Подписка на friendRequests и friends текущей семьи
  useEffect(() => {
    if (!fid) return;

    // friendRequests
    const reqRef = collection(db, "families", fid, "friendRequests");
    const reqQ = query(reqRef);

    const unsubReq = onSnapshot(
      reqQ,
      (snap) => {
        const items: FriendRequest[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;
          items.push({
            id: docSnap.id,
            fromFamilyId: data.fromFamilyId,
            toFamilyId: data.toFamilyId,
            status: data.status,
          });
        });
        setFriendRequests(items);
      },
      (err) => {
        console.error("friendRequests snapshot error", err);
      }
    );

    // friends
    const frRef = collection(db, "families", fid, "friends");
    const frQ = query(frRef);

    const unsubFriends = onSnapshot(
      frQ,
      (snap) => {
        const items: Friend[] = [];
        snap.forEach((docSnap) => {
          const data = docSnap.data() as DocumentData;
          items.push({
            id: docSnap.id,
            since: data.since,
            lastChatId: data.lastChatId,
          });
        });
        setFriends(items);
      },
      (err) => {
        console.error("friends snapshot error", err);
      }
    );

    return () => {
      unsubReq();
      unsubFriends();
    };
  }, [fid]);

  function getFriendStatus(otherFamilyId: string): "none" | "pending" | "accepted" | "incoming" {
    if (!fid) return "none";

    // Уже друзья
    if (friends.some((f) => f.id === otherFamilyId)) {
      return "accepted";
    }

    // Исходящая заявка в pending
    const outgoing = friendRequests.find(
      (r) =>
        r.fromFamilyId === fid &&
        r.toFamilyId === otherFamilyId &&
        r.status === "pending"
    );
    if (outgoing) return "pending";

    // Входящая заявка от этой семьи
    const incoming = friendRequests.find(
      (r) =>
        r.toFamilyId === fid &&
        r.fromFamilyId === otherFamilyId &&
        r.status === "pending"
    );
    if (incoming) return "incoming";

    return "none";
  }

  async function handleSendRequest(targetFamilyId: string) {
    if (!fid) {
      Alert.alert("Friends", "No family id");
      return;
    }

    const status = getFriendStatus(targetFamilyId);
    if (status === "accepted") {
      Alert.alert("Friends", "You are already friends");
      return;
    }
    if (status === "pending") {
      Alert.alert("Friends", "Friend request is already pending");
      return;
    }

    try {
      setSendingTo(targetFamilyId);

      const ref = collection(db, "families", fid, "friendRequests");
      // Док ID пусть сгенерирует Firestore:
      const { doc, setDoc, serverTimestamp } = await import(
        "firebase/firestore"
      );

      const docRef = doc(ref);
      await setDoc(docRef, {
        fromFamilyId: fid,
        toFamilyId: targetFamilyId,
        status: "pending",
        createdAt: serverTimestamp(),
      });

      Alert.alert("Friends", "Friend request sent");
    } catch (e: any) {
      console.error("send friend request error", e);
      Alert.alert(
        "Friends",
        e?.message ?? "Failed to send friend request"
      );
    } finally {
      setSendingTo(null);
    }
  }

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0b0f17",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <ActivityIndicator />
        <Text style={{ color: "#9ca3af", marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  if (!fid) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "#0b0f17",
          padding: 16,
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: "700",
            marginBottom: 8,
          }}
        >
          Families Nearby
        </Text>
        <Text style={{ color: "#9ca3af", marginBottom: 16 }}>
          You don&apos;t have a family yet. Create or join a family to
          discover nearby families.
        </Text>
        <Button
          title="Open Families"
          onPress={() => navigation.navigate("Families")}
        />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0b0f17" }}>
      <Text
        style={{
          color: "#fff",
          fontSize: 20,
          fontWeight: "700",
          padding: 16,
        }}
      >
        Families Nearby
      </Text>

      {myFamily?.location && (
        <MapView
          style={{ flex: 1 }}
          initialRegion={{
            latitude: myFamily.location.lat,
            longitude: myFamily.location.lng,
            latitudeDelta: 0.15,
            longitudeDelta: 0.15,
          }}
        >
          {/* My family marker */}
          <Marker
            coordinate={{
              latitude: myFamily.location.lat,
              longitude: myFamily.location.lng,
            }}
            title="My Family"
            pinColor="dodgerblue"
          />

          {/* Other families */}
          {families.map((f) => (
            <Marker
              key={f.id}
              coordinate={{
                latitude: f.location.lat,
                longitude: f.location.lng,
              }}
              title={f.name}
              pinColor="gold"
            />
          ))}
        </MapView>
      )}

      <View
        style={{
          backgroundColor: "#111827",
          padding: 12,
          borderRadius: 12,
          margin: 12,
          maxHeight: 260,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          Families Nearby ({families.length})
        </Text>

        {families.length === 0 ? (
          <Text style={{ color: "#6b7280", marginTop: 8 }}>
            No families found in your area yet. Try enabling &quot;Find
            Friends&quot; in family settings and make sure your location is
            set.
          </Text>
        ) : (
          <FlatList
            data={families}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => {
              const status = getFriendStatus(item.id);
              const isSending = sendingTo === item.id;

              let statusLabel: string | null = null;
              if (status === "accepted") statusLabel = "Friends";
              else if (status === "pending") statusLabel = "Request pending";
              else if (status === "incoming")
                statusLabel = "Incoming request";

              return (
                <View
                  style={{
                    paddingVertical: 8,
                    borderBottomColor: "#333",
                    borderBottomWidth: 1,
                  }}
                >
                  <TouchableOpacity
                    onPress={() =>
                      navigation.navigate("FamilyChatList", {
                        startChatWithFamilyId: item.id,
                      })
                    }
                  >
                    <Text
                      style={{
                        color: "#E5E7EB",
                        fontWeight: "600",
                      }}
                    >
                      {item.name ?? "Family"}
                    </Text>
                    <Text style={{ color: "#9CA3AF", fontSize: 12 }}>
                      {item.city ?? "Unknown city"} • Kids ages:{" "}
                      {item.kidsAges?.length
                        ? item.kidsAges.join(", ")
                        : "—"}
                    </Text>
                    {item.interests && Array.isArray(item.interests) && (
                      <Text
                        style={{
                          color: "#6B7280",
                          fontSize: 12,
                          marginTop: 2,
                        }}
                      >
                        Interests: {item.interests.join(", ")}
                      </Text>
                    )}
                  </TouchableOpacity>

                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginTop: 6,
                      justifyContent: "space-between",
                    }}
                  >
                    {statusLabel ? (
                      <Text
                        style={{
                          color:
                            status === "accepted"
                              ? "#22c55e"
                              : status === "pending"
                              ? "#fbbf24"
                              : "#60a5fa",
                          fontSize: 12,
                          fontWeight: "600",
                        }}
                      >
                        {statusLabel}
                      </Text>
                    ) : (
                      <View />
                    )}

                    {status === "none" && (
                      <Button
                        title={isSending ? "Sending..." : "Send friend request"}
                        onPress={() => handleSendRequest(item.id)}
                        disabled={isSending}
                        color="#3b82f6"
                      />
                    )}
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 16 }}>
        <Button title="Refresh" onPress={loadNearby} />
      </View>
    </View>
  );
}
