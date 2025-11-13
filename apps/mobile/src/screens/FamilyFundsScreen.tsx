// apps/mobile/src/screens/FamilyFundsScreen.tsx
import React from "react";
import { View, SafeAreaView, ScrollView, Text, Button, Alert } from "react-native";

export default function FamilyFundsScreen() {
  const onStubPress = () => {
    Alert.alert(
      "Coming soon",
      "Family Funds will allow you to create shared saving goals and fund them with GAD Points."
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#0b0c0f" }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: "#fff", fontWeight: "700", fontSize: 18 }}>
          Family Funds (Soon)
        </Text>

        <View style={{ marginTop: 8, gap: 8 }}>
          <Text style={{ color: "#9ca3af" }}>
            Here you will be able to create shared family funds: vacation, gadgets,
            kids&apos; education and more.
          </Text>
          <Text style={{ color: "#9ca3af" }}>
            Each member will contribute GAD Points, and the app will show
            progress, cycles and unlock rules controlled by parents.
          </Text>
        </View>

        <View style={{ marginTop: 16 }}>
          <Button title="Preview concept" onPress={onStubPress} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
