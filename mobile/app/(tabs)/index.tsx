import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "@/components/LinearFallback";
import { BrandMark } from "@/components/BrandMark";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/providers/AuthProvider";
import { usePurchases } from "@/providers/PurchasesProvider";
import { apiGet } from "@/lib/api";
import type { TryOnResult, UsageStatus, WardrobeItem } from "@/lib/types";
import { colors, fonts, radii } from "@/lib/theme";

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
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.ink}
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

          <PageHeader
            eyebrow="Dashboard"
            title="Your wardrobe, proven on you."
            subtitle={`${user?.email ?? "Signed in"} · plan ${plan}`}
          />

          <View style={styles.card}>
            {usage ? (
              <Text style={styles.meter}>
                Try-ons this month · {usage.tryon.used}/{usage.tryon.limit}
              </Text>
            ) : null}
            <View style={styles.actions}>
              <PrimaryButton label="Open Studio" onPress={() => router.push("/(tabs)/studio")} />
              {plan === "free" ? (
                <PrimaryButton
                  label="Upgrade"
                  variant="secondary"
                  onPress={() => void presentPaywall()}
                />
              ) : null}
            </View>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Text style={styles.sectionEyebrow}>Closet snapshot</Text>
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
              <Text style={styles.empty}>Add pieces in Wardrobe to start trying on.</Text>
            ) : null}
          </View>

          <Text style={[styles.sectionEyebrow, { marginTop: 20 }]}>Recent try-ons</Text>
          <View style={styles.row}>
            {tryons.map((t) => (
              <Image key={t.id} source={{ uri: t.result_image_url }} style={styles.tryon} />
            ))}
            {!tryons.length ? <Text style={styles.empty}>No try-ons yet.</Text> : null}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8, gap: 8 },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  signOut: { color: colors.textMuted, fontFamily: fonts.bodyMedium, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
    marginBottom: 12,
  },
  meter: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 14 },
  actions: { gap: 10 },
  sectionEyebrow: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    fontSize: 11,
    marginTop: 8,
  },
  meta: { fontFamily: fonts.body, color: colors.textMuted, marginBottom: 10, fontSize: 13 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: {
    width: "30%",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  thumb: { width: "100%", aspectRatio: 0.8, backgroundColor: colors.surface2 },
  tileName: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 11,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  row: { flexDirection: "row", gap: 10, flexWrap: "wrap", marginTop: 8 },
  tryon: {
    width: 110,
    height: 150,
    borderRadius: radii.md,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  empty: { fontFamily: fonts.body, color: colors.textMuted, fontSize: 13 },
  error: { color: colors.red, fontFamily: fonts.bodyMedium, marginBottom: 8 },
});
