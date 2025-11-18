// apps/mobile/src/screens/FamilyFriendsScreen.tsx
import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  Button,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker } from "react-native-maps";
import {
  getCurrentUserFamilyId,
  getFamily,
  loadDiscoverableFamiliesAround,
} from "../lib/families";

export default function FamilyFriendsScreen({ navigation }: any) {
  const [fid, setFid] = useState<string | null>(null);
  const [myFamily, setMyFamily] = useState<any>(null);
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const f = await getCurrentUserFamilyId();
      setFid(f);

      if (!f) {
        setLoading(false);
        return;
      }

      const myFam = await getFamily(f);
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
        f
      );

      setFamilies(around);
    } catch (e) {
      console.log("FamilyFriendsScreen load error", e);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

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
          You don&apos;t have a family yet. Create or join a family to discover
          nearby families.
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
          maxHeight: 220,
        }}
      >
        <Text style={{ color: "#fff", fontSize: 16, fontWeight: "600" }}>
          Families Nearby ({families.length})
        </Text>

        {families.length === 0 ? (
          <Text style={{ color: "#6b7280", marginTop: 8 }}>
            No families found in your area yet. Try enabling &quot;Find Friends&quot;
            in family settings and make sure your location is set.
          </Text>
        ) : (
          <FlatList
            data={families}
            keyExtractor={(i) => i.id}
            renderItem={({ item }) => (
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("FamilyChatList", {
                    startChatWithFamilyId: item.id,
                  })
                }
                style={{
                  paddingVertical: 8,
                  borderBottomColor: "#333",
                  borderBottomWidth: 1,
                }}
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
                    style={{ color: "#6B7280", fontSize: 12, marginTop: 2 }}
                  >
                    Interests: {item.interests.join(", ")}
                  </Text>
                )}
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <View style={{ paddingHorizontal: 12, paddingBottom: 16 }}>
        <Button title="Refresh" onPress={load} />
      </View>
    </View>
  );
}
