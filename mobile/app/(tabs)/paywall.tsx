import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { usePurchases } from "@/providers/PurchasesProvider";
import { colors } from "@/lib/theme";

const FEATURES = [
  { plan: "studio", label: "Studio — 40 AI try-ons / month" },
  { plan: "studio", label: "Unlimited wardrobe items" },
  { plan: "pro", label: "Pro — 100 AI try-ons / month" },
  { plan: "pro", label: "Priority generation queue" },
];

export default function PaywallScreen() {
  const { offerings, plan, buy, restore, presentPaywall, refresh, isPremium } = usePurchases();
  const [busy, setBusy] = useState<string | null>(null);

  const packages = useMemo(() => {
    const current = offerings?.current;
    if (!current) return [] as PurchasesPackage[];
    return current.availablePackages;
  }, [offerings]);

  async function onBuy(pkg: PurchasesPackage) {
    setBusy(pkg.identifier);
    try {
      await buy(pkg);
      Alert.alert("You’re in", `Unlocked ${pkg.product.title}`);
      await refresh();
    } catch (e: any) {
      if (e?.userCancelled) return;
      Alert.alert("Purchase failed", e?.message ?? "Try restore or Test Store key.");
    } finally {
      setBusy(null);
    }
  }

  async function onRestore() {
    setBusy("restore");
    try {
      await restore();
      Alert.alert("Restored", "Purchases synced from RevenueCat.");
    } catch (e: any) {
      Alert.alert("Restore failed", e?.message ?? "Try again");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Screen scroll contentStyle={{ gap: 18 }}>
      <Text style={styles.kicker}>REVENUECAT · SHIPATON 2026</Text>
      <Text style={styles.title}>Unlock your wardrobe</Text>
      <Text style={styles.sub}>
        See yourself in every outfit before you buy. Powered by RevenueCat subscriptions.
      </Text>

      <View style={styles.badge}>
        <Text style={styles.badgeText}>Current plan: {plan}</Text>
      </View>

      {FEATURES.map((f) => (
        <Text key={f.label} style={styles.feature}>
          · {f.label}
        </Text>
      ))}

      <PrimaryButton
        label={isPremium ? "Manage / refresh entitlement" : "Open RevenueCat Paywall"}
        onPress={() => void presentPaywall()}
      />

      {packages.map((pkg) => (
        <View key={pkg.identifier} style={styles.card}>
          <Text style={styles.pkgTitle}>{pkg.product.title}</Text>
          <Text style={styles.pkgPrice}>
            {pkg.product.priceString}
            {pkg.product.subscriptionPeriod ? ` / ${pkg.product.subscriptionPeriod}` : ""}
          </Text>
          <Text style={styles.pkgDesc}>{pkg.product.description}</Text>
          <PrimaryButton
            label={busy === pkg.identifier ? "Purchasing…" : `Get ${pkg.packageType}`}
            onPress={() => void onBuy(pkg)}
            loading={busy === pkg.identifier}
          />
        </View>
      ))}

      {!packages.length ? (
        <Text style={styles.hint}>
          Offerings load from RevenueCat. In Expo Go, the Test Store API key is used so you can
          demo purchases without App Store / Play Billing.
        </Text>
      ) : null}

      <PrimaryButton
        label="Restore purchases"
        variant="ghost"
        onPress={() => void onRestore()}
        loading={busy === "restore"}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: "PublicSans_600SemiBold",
    color: colors.textDim,
    letterSpacing: 2,
    fontSize: 11,
  },
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 40,
    color: colors.text,
    lineHeight: 44,
  },
  sub: { fontFamily: "PublicSans_400Regular", color: colors.textMuted, lineHeight: 22 },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.bgSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { fontFamily: "PublicSans_600SemiBold", color: colors.accentSoft },
  feature: { fontFamily: "PublicSans_400Regular", color: colors.text, fontSize: 15 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  pkgTitle: { fontFamily: "CormorantGaramond_500Medium", fontSize: 26, color: colors.text },
  pkgPrice: { fontFamily: "PublicSans_700Bold", color: colors.accentSoft, fontSize: 18 },
  pkgDesc: { fontFamily: "PublicSans_400Regular", color: colors.textMuted, marginBottom: 4 },
  hint: { fontFamily: "PublicSans_400Regular", color: colors.textDim, lineHeight: 20 },
});
