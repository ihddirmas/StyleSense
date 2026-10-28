import { useMemo, useState } from "react";
import { Alert, StyleSheet, Text, View } from "react-native";
import type { PurchasesPackage } from "react-native-purchases";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { usePurchases } from "@/providers/PurchasesProvider";
import { colors, fonts, radii } from "@/lib/theme";

const FEATURES = [
  "Studio — 40 AI try-ons / month",
  "Unlimited wardrobe items",
  "Pro — 100 AI try-ons / month",
  "Priority generation queue",
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
    <Screen scroll contentStyle={{ gap: 14 }}>
      <PageHeader
        eyebrow="Pricing · RevenueCat"
        title="Unlock your wardrobe"
        subtitle="See yourself in every outfit before you buy."
      />

      <View style={styles.badge}>
        <Text style={styles.badgeText}>Current plan · {plan}</Text>
      </View>

      {FEATURES.map((f) => (
        <Text key={f} style={styles.feature}>
          · {f}
        </Text>
      ))}

      <PrimaryButton
        label={isPremium ? "Refresh entitlement" : "Open RevenueCat Paywall"}
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
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.gold,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  badgeText: { fontFamily: fonts.bodySemi, color: colors.ink, fontSize: 12 },
  feature: { fontFamily: fonts.body, color: colors.ink, fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 8,
  },
  pkgTitle: { fontFamily: fonts.display, fontSize: 28, color: colors.ink },
  pkgPrice: { fontFamily: fonts.bodyBold, color: colors.ink, fontSize: 18 },
  pkgDesc: { fontFamily: fonts.body, color: colors.textMuted, marginBottom: 4 },
  hint: { fontFamily: fonts.body, color: colors.textMuted, lineHeight: 20, fontSize: 13 },
});
