import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "@/components/LinearFallback";
import { BrandMark } from "@/components/BrandMark";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/providers/AuthProvider";
import { usePurchases } from "@/providers/PurchasesProvider";
import { apiGet } from "@/lib/api";
import type { TryOnResult, UsageStatus, WardrobeItem } from "@/lib/types";
import { colors } from "@/lib/theme";

export default function HomeScreen() {
  const { user, signOut } = useAuth();
  const { plan, presentPaywall } = usePurchases();
  const router = useRouter();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [tryons, setTryons] = useState<TryOnResult[]>([]);
  const [usage, setUsage] = useState<UsageStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [w, t, u] = await Promise.all([
        apiGet<WardrobeItem[]>("/api/wardrobe"),
        apiGet<TryOnResult[]>("/api/tryon/recent?all=true").catch(() => [] as TryOnResult[]),
        apiGet<UsageStatus>("/api/tryon/usage-status").catch(() => null),
      ]);
      setItems(w);
      setTryons(t.slice(0, 6));
      setUsage(u);
    } catch (e: any) {
      setError(e?.message ?? "Could not load dashboard");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <LinearGradient />
      <SafeAreaView style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8, gap: 20 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accentSoft}
            onRefresh={async () => {
              setRefreshing(true);
              await load();
              setRefreshing(false);
            }}
          />
        }
      >
      <View style={styles.topRow}>
        <BrandMark size="sm" />
        <Pressable onPress={() => signOut()}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Text style={styles.heroTitle}>Your wardrobe,{"\n"}proven on you.</Text>
        <Text style={styles.heroBody}>
          {user?.email ?? "Signed in"} · plan {plan}
        </Text>
        {usage ? (
          <Text style={styles.meter}>
            Try-ons this month: {usage.tryon.used}/{usage.tryon.limit}
          </Text>
        ) : null}
        <View style={styles.actions}>
          <PrimaryButton label="Open Studio" onPress={() => router.push("/(tabs)/studio")} />
          {plan === "free" ? (
            <PrimaryButton
              label="Upgrade with RevenueCat"
              variant="ghost"
              onPress={() => void presentPaywall()}
            />
          ) : null}
        </View>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View>
        <Text style={styles.section}>Closet snapshot</Text>
        <Text style={styles.meta}>{items.length} items</Text>
        <View style={styles.grid}>
          {items.slice(0, 6).map((item) => (
            <View key={item.id} style={styles.tile}>
              <Image source={{ uri: item.cutout_url || item.image_url }} style={styles.thumb} />
              <Text numberOfLines={1} style={styles.tileName}>
                {item.name}
              </Text>
            </View>
          ))}
          {!items.length ? (
            <Text style={styles.empty}>Add pieces in Closet to start trying on.</Text>
          ) : null}
        </View>
      </View>

      <View>
        <Text style={styles.section}>Recent try-ons</Text>
        <View style={styles.row}>
          {tryons.map((t) => (
            <Image key={t.id} source={{ uri: t.result_image_url }} style={styles.tryon} />
          ))}
          {!tryons.length ? <Text style={styles.empty}>No try-ons yet.</Text> : null}
        </View>
      </View>

      </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  signOut: { color: colors.textMuted, fontFamily: "PublicSans_500Medium" },
  hero: {
    backgroundColor: colors.card,
    borderRadius: 22,
    padding: 22,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  heroTitle: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 36,
    color: colors.text,
    lineHeight: 40,
  },
  heroBody: { fontFamily: "PublicSans_400Regular", color: colors.textMuted },
  meter: { fontFamily: "PublicSans_600SemiBold", color: colors.accentSoft },
  actions: { gap: 10, marginTop: 8 },
  section: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 26,
    color: colors.text,
    marginBottom: 4,
  },
  meta: { fontFamily: "PublicSans_400Regular", color: colors.textDim, marginBottom: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { width: "30%", gap: 4 },
  thumb: { width: "100%", aspectRatio: 0.8, borderRadius: 12, backgroundColor: colors.bgSoft },
  tileName: { fontFamily: "PublicSans_400Regular", color: colors.textMuted, fontSize: 12 },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  tryon: { width: 110, height: 150, borderRadius: 14, backgroundColor: colors.bgSoft },
  empty: { fontFamily: "PublicSans_400Regular", color: colors.textDim },
  error: { color: colors.danger, fontFamily: "PublicSans_500Medium" },
});
