// apps/mobile/src/screens/WalletScreen.tsx

import { useEffect, useState } from "react";
import {
  View,
  Text,
  Alert,
  ScrollView,
  TouchableOpacity,
} from "react-native";
import { getOrCreateWallet } from "../lib/wallet";
import { getGadBalance } from "../lib/gadToken";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { getAge, getAgeTier } from "../lib/age";
import { useIsDemo } from "../demo/DemoContext";
import { useTheme } from "../wallet/ui/theme";

type Tier = "child" | "teen" | "adult";

type Props = {
  navigation: any;
};

export default function WalletScreen({ navigation }: Props) {
  const G = useTheme();
  const isDemo = useIsDemo();

  const [addr, setAddr] = useState<string>("—");
  const [bal, setBal] = useState<string>("—");
  const [tier, setTier] = useState<Tier>("teen");
  const [locked, setLocked] = useState<number>(0);
  const [fid, setFid] = useState<string | null>(null);
  const [subscription, setSubscription] = useState<string>("free");
  const [gasCredit, setGasCredit] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  async function load() {
    try {
      setLoading(true);

      if (isDemo) {
        // DEMO: полностью фейковый, но правдоподобный кошелёк
        setTier("adult");
        setSubscription("pro");
        setFid("demo-family");
        setLocked(125_000);
        setGasCredit(10_000_000_000_000_000); // 0.01 BNB (wei-like)

        const demoAddr = "0xDEMO1234DEMO1234DEMO1234DEMO1234DEMO1234";
        setAddr(demoAddr);
        setBal("123,456.78 GAD");

        return;
      }

      const uid = auth.currentUser?.uid;
      if (!uid) return;

      const snap = await getDoc(doc(db, "users", uid));
      const data = snap.data() || {};

      // age tier
      const age = getAge(data.birthDate);
      const currentTier = getAgeTier(age);
      setTier(currentTier);

      // subscription
      setSubscription(data.subscription ?? "free");

      // gas credit
      setGasCredit(data.gasCreditWei ?? 0);

      const familyId = data.familyId ?? null;
      setFid(familyId);

      // ✅ читаем lock из families/{fid}/vault/main/locked/{uid}
      if (familyId) {
        const lockedSnap = await getDoc(
          doc(db, "families", familyId, "vault", "main", "locked", uid)
        );
        setLocked(
          lockedSnap.exists()
            ? (lockedSnap.data()?.pointsLocked as number) ?? 0
            : 0
        );
      } else {
        setLocked(0);
      }

      // child-tier → без кошелька
      if (currentTier === "child") {
        setAddr("—");
        setBal("—");
      } else {
        const w = await getOrCreateWallet();
        setAddr(w.address);

        try {
          const b = await getGadBalance(w.address as `0x${string}`);
          setBal(b.pretty);
        } catch (e) {
          console.log("getGadBalance error", e);
          setBal("—");
        }
      }
    } catch (e) {
      console.log("Wallet load error", e);
      Alert.alert(
        "Wallet",
        e instanceof Error ? e.message : String(e)
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [isDemo]);

  function renderPrimaryButton(
    label: string,
    onPress: () => void,
    opts?: { disabled?: boolean }
  ) {
    const disabled = opts?.disabled;
    return (
      <TouchableOpacity
        onPress={onPress}
        disabled={disabled}
        activeOpacity={0.85}
        style={{
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          backgroundColor: disabled
            ? G.colors.buttonDisabled
            : G.colors.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text
          style={{
            color: disabled ? G.colors.textMuted : "#0B1120",
            fontWeight: "600",
            fontSize: 14,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  }

  function navigateOrDemo(route: string) {
    if (isDemo) {
      Alert.alert(
        "Demo",
        "This action is disabled in demo mode, but will be fully available in the live app."
      );
      return;
    }
    navigation.navigate(route);
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: G.colors.bg,
      }}
    >
      <ScrollView
        contentContainerStyle={{
          padding: 24,
          paddingBottom: 40,
        }}
      >
        <Text
          style={{
            fontWeight: "700",
            fontSize: 20,
            color: G.colors.text,
            marginBottom: 8,
          }}
        >
          Wallet {isDemo ? "(demo)" : ""}
        </Text>

        {/* Subscription + tier */}
        <View
          style={{
            borderRadius: 16,
            padding: 16,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: G.colors.textMuted,
              marginBottom: 4,
              fontSize: 13,
            }}
          >
            Subscription
          </Text>
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "700",
              fontSize: 16,
            }}
          >
            {subscription.toUpperCase()}
          </Text>

          <Text
            style={{
              color: G.colors.textMuted,
              marginTop: 12,
              fontSize: 13,
            }}
          >
            Age tier
          </Text>
          <Text
            style={{
              color: G.colors.text,
              fontSize: 15,
              fontWeight: "600",
            }}
          >
            {tier}
          </Text>

          {fid && (
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              Family ID: {fid}
            </Text>
          )}

          {isDemo && (
            <Text
              style={{
                color: G.colors.demoAccent,
                fontSize: 11,
                marginTop: 8,
              }}
            >
              Demo mode: wallet data is simulated for investor preview.
            </Text>
          )}
        </View>

        {/* Main wallet info */}
        {tier === "child" && !isDemo ? (
          <View
            style={{
              borderRadius: 16,
              padding: 16,
              backgroundColor: G.colors.cardStrong,
              borderWidth: 1,
              borderColor: G.colors.demoBorder,
              marginBottom: 16,
            }}
          >
            <Text
              style={{
                color: G.colors.demoAccent,
                fontWeight: "700",
                fontSize: 16,
                marginBottom: 8,
              }}
            >
              Child profile
            </Text>
            <Text
              style={{
                color: G.colors.textMuted,
                marginBottom: 8,
              }}
            >
              Children under 14 don’t create on-chain wallets. Their rewards are
              kept as locked GAD Points in the family vault.
            </Text>
            <Text
              style={{
                color: G.colors.text,
                marginTop: 4,
                fontWeight: "600",
              }}
            >
              Locked balance: {locked.toLocaleString("en-US")} GAD Points
            </Text>
          </View>
        ) : (
          <View
            style={{
              borderRadius: 16,
              padding: 16,
              backgroundColor: G.colors.card,
              borderWidth: 1,
              borderColor: G.colors.border,
              marginBottom: 16,
              gap: 6,
            }}
          >
            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 13,
              }}
            >
              Address
            </Text>
            <Text
              selectable
              style={{
                color: G.colors.text,
                fontSize: 13,
              }}
            >
              {addr}
            </Text>

            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 13,
                marginTop: 10,
              }}
            >
              GAD Balance
            </Text>
            <Text
              style={{
                color: G.colors.accent,
                fontSize: 18,
                fontWeight: "700",
              }}
            >
              {bal}
            </Text>

            <Text
              style={{
                color: G.colors.textMuted,
                fontSize: 12,
                marginTop: 6,
              }}
            >
              Locked in family vault:{" "}
              {locked.toLocaleString("en-US")} GAD Points
            </Text>
          </View>
        )}

        {/* Gas stipend */}
        <View
          style={{
            borderRadius: 16,
            padding: 16,
            backgroundColor: G.colors.card,
            borderWidth: 1,
            borderColor: G.colors.border,
            marginBottom: 16,
          }}
        >
          <Text
            style={{
              color: G.colors.text,
              fontWeight: "600",
              fontSize: 16,
            }}
          >
            Gas Stipend (BNB)
          </Text>
          <Text
            style={{
              color: G.colors.textMuted,
              marginTop: 4,
            }}
          >
            Available gas credit: {gasCredit} WEI
          </Text>

          <View style={{ marginTop: 10, maxWidth: 200 }}>
            {renderPrimaryButton("View gas history", () =>
              navigateOrDemo("GasHistory")
            )}
          </View>
        </View>

        {/* Actions (для teen/adult) */}
        {tier !== "child" && (
          <View style={{ marginTop: 4, gap: 8 }}>
            {renderPrimaryButton("Refresh", load, { disabled: loading })}

            {renderPrimaryButton("Set up / Backup wallet", () =>
              navigateOrDemo("WalletOnboarding")
            )}

            {renderPrimaryButton("History", () =>
              navigateOrDemo("WalletActivity")
            )}

            {renderPrimaryButton("My NFTs", () =>
              navigateOrDemo("NFTGallery")
            )}
          </View>
        )}

        <View style={{ marginTop: 12, maxWidth: 220 }}>
          {renderPrimaryButton("Upgrade Subscription", () =>
            navigateOrDemo("Subscription")
          )}
        </View>

        {/* Future: интеграция full GAD Wallet */}
        <View style={{ marginTop: 24 }}>
          <Text
            style={{
              color: G.colors.textMuted,
              fontSize: 12,
              marginBottom: 6,
            }}
          >
            GAD Wallet integration
          </Text>
          <Text
            style={{
              color: G.colors.textSoft,
              fontSize: 12,
              marginBottom: 8,
            }}
          >
            Later this screen can open the full GAD Wallet module with on-chain
            swaps, NFT minting and DAO tools.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
