// apps/mobile/src/screens/FriendRequestsScreen.tsx

import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Alert,
  Pressable,
} from "react-native";
import {
  getCurrentUserFamilyId,
  subscribeFriendRequests,
  FriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
} from "../lib/families";

export default function FriendRequestsScreen() {
  const [fid, setFid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const myFid = await getCurrentUserFamilyId();
        if (!myFid) {
          setLoading(false);
          Alert.alert(
            "Friends",
            "You don't have a family yet. Create or join a family first."
          );
          return;
        }
        setFid(myFid);

        unsub = subscribeFriendRequests(myFid, (items) => {
          setRequests(items);
          setLoading(false);
        });
      } catch (e: any) {
        console.error("FriendRequestsScreen error", e);
        setLoading(false);
        Alert.alert("Friends", e?.message ?? "Failed to load friend requests");
      }
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const incoming = requests.filter(
    (r) => r.direction === "incoming" || r.toFamilyId === fid
  );
  const outgoing = requests.filter(
    (r) => r.direction === "outgoing" || r.fromFamilyId === fid
  );

  async function handleAccept(req: FriendRequest) {
    if (!fid) return;
    try {
      setProcessingId(req.id);
      await acceptFriendRequest(fid, req);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Friends", e?.message ?? "Failed to accept request");
    } finally {
      setProcessingId(null);
    }
  }

  async function handleReject(req: FriendRequest) {
    try {
      setProcessingId(req.id);
      await rejectFriendRequest(req);
    } catch (e: any) {
      console.error(e);
      Alert.alert("Friends", e?.message ?? "Failed to reject request");
    } finally {
      setProcessingId(null);
    }
  }

  function renderStatusText(status: string) {
    if (status === "pending") return "Pending";
    if (status === "accepted") return "Accepted";
    if (status === "rejected") return "Rejected";
    return status;
  }

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
          Loading friend requests…
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: "#020617" }}
      contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
      showsVerticalScrollIndicator={false}
    >
      <Text
        style={{
          color: "#f9fafb",
          fontSize: 22,
          fontWeight: "700",
          marginBottom: 12,
        }}
      >
        Family Friend Requests
      </Text>

      {/* Incoming */}
      <Text
        style={{
          color: "#9ca3af",
          fontSize: 14,
          fontWeight: "600",
          marginBottom: 8,
        }}
      >
        Incoming requests
      </Text>

      {incoming.length === 0 ? (
        <View
          style={{
            backgroundColor: "#0f172a",
            padding: 12,
            borderRadius: 12,
            marginBottom: 16,
          }}
        >
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            No incoming requests yet.
          </Text>
        </View>
      ) : (
        incoming.map((req) => (
          <View
            key={req.id}
            style={{
              backgroundColor: "#0f172a",
              padding: 12,
              borderRadius: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.4)",
            }}
          >
            <Text
              style={{ color: "#f9fafb", fontWeight: "600", marginBottom: 4 }}
            >
              From family: {req.fromFamilyId}
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 12, marginBottom: 8 }}>
              Status: {renderStatusText(req.status)}
            </Text>

            {req.status === "pending" && (
              <View
                style={{
                  flexDirection: "row",
                  gap: 8,
                }}
              >
                <Pressable
                  onPress={() => handleAccept(req)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 999,
                    backgroundColor: "#22c55e",
                    alignItems: "center",
                    opacity: processingId === req.id ? 0.5 : 1,
                  }}
                  disabled={processingId === req.id}
                >
                  <Text
                    style={{
                      color: "#0b1120",
                      fontWeight: "700",
                      fontSize: 14,
                    }}
                  >
                    Accept
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => handleReject(req)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: "#f97316",
                    alignItems: "center",
                    opacity: processingId === req.id ? 0.5 : 1,
                  }}
                  disabled={processingId === req.id}
                >
                  <Text
                    style={{
                      color: "#f97316",
                      fontWeight: "600",
                      fontSize: 14,
                    }}
                  >
                    Reject
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ))
      )}

      {/* Outgoing */}
      <Text
        style={{
          color: "#9ca3af",
          fontSize: 14,
          fontWeight: "600",
          marginTop: 16,
          marginBottom: 8,
        }}
      >
        Outgoing requests
      </Text>

      {outgoing.length === 0 ? (
        <View
          style={{
            backgroundColor: "#0f172a",
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ color: "#9ca3af", fontSize: 13 }}>
            No outgoing requests yet.
          </Text>
        </View>
      ) : (
        outgoing.map((req) => (
          <View
            key={req.id}
            style={{
              backgroundColor: "#0f172a",
              padding: 12,
              borderRadius: 12,
              marginBottom: 8,
              borderWidth: 1,
              borderColor: "rgba(148,163,184,0.4)",
            }}
          >
            <Text
              style={{ color: "#f9fafb", fontWeight: "600", marginBottom: 4 }}
            >
              To family: {req.toFamilyId}
            </Text>
            <Text style={{ color: "#9ca3af", fontSize: 12 }}>
              Status: {renderStatusText(req.status)}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
