import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { apiGet, apiPost, ApiError } from "@/lib/api";
import type { WardrobeItem } from "@/lib/types";
import { usePurchases } from "@/providers/PurchasesProvider";
import { colors, fonts, radii } from "@/lib/theme";

type TryOnOut = { result_image_url: string; result_id?: string };

export default function StudioScreen() {
  const { presentPaywall, plan } = usePurchases();
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [selfieUrl, setSelfieUrl] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<TryOnOut | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [wardrobe, me] = await Promise.all([
        apiGet<WardrobeItem[]>("/api/wardrobe"),
        apiGet<{ selfie_url?: string | null }>("/api/avatar/me"),
      ]);
      setItems(wardrobe);
      setSelfieUrl(me.selfie_url ?? null);
    } catch (e: any) {
      Alert.alert("Studio", e?.message ?? "Failed to load wardrobe");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const selectedItems = useMemo(
    () => items.filter((i) => selected.includes(i.id)),
    [items, selected]
  );

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) return prev;
      return [...prev, id];
    });
  }

  async function generate() {
    if (!selected.length) {
      Alert.alert("Pick items", "Select 1–3 wardrobe pieces first.");
      return;
    }
    if (!selfieUrl) {
      Alert.alert("Selfie required", "Upload a selfie on the web app first, then return here.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const picks = selectedItems;
      const out =
        picks.length === 1
          ? await apiPost<TryOnOut>("/api/tryon/generate", {
              wardrobe_item_id: picks[0].id,
              item_image_url: picks[0].cutout_url || picks[0].image_url,
              avatar_selfie_url: selfieUrl,
              item_name: picks[0].name,
              item_category: picks[0].category,
              model: "gen4_image_turbo",
            })
          : await apiPost<TryOnOut>("/api/tryon/generate-multi", {
              avatar_selfie_url: selfieUrl,
              items: picks.map((i) => ({
                image_url: i.cutout_url || i.image_url,
                name: i.name,
                category: i.category,
              })),
              model: "gen4_image_turbo",
            });
      setResult(out);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 402) {
        Alert.alert("Free try-ons used", e.message, [
          { text: "Not now", style: "cancel" },
          { text: "Upgrade", onPress: () => void presentPaywall() },
        ]);
      } else {
        Alert.alert("Try-on failed", e?.message ?? "Try again");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen wash={false} contentStyle={{ flex: 1, gap: 10 }}>
      <PageHeader
        eyebrow="Studio"
        title="Try it on"
        subtitle={`Select up to 3 pieces · plan ${plan}`}
      />

      <View style={styles.canvas}>
        {busy ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.ink} size="large" />
            <Text style={styles.busy}>Generating look…</Text>
          </View>
        ) : result?.result_image_url ? (
          <Image source={{ uri: result.result_image_url }} style={styles.result} contentFit="cover" />
        ) : (
          <View style={styles.center}>
            <Text style={styles.placeholder}>Your try-on appears here</Text>
            {selectedItems.length ? (
              <Text style={styles.selectedHint}>
                {selectedItems.map((i) => i.name).join(" · ")}
              </Text>
            ) : null}
          </View>
        )}
      </View>

      <PrimaryButton label="Generate try-on" onPress={generate} loading={busy} />

      <FlatList
        horizontal
        data={items}
        keyExtractor={(i) => i.id}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingVertical: 8 }}
        ListEmptyComponent={<Text style={styles.empty}>Add wardrobe items first.</Text>}
        renderItem={({ item }) => {
          const on = selected.includes(item.id);
          return (
            <Pressable onPress={() => toggle(item.id)} style={[styles.chip, on && styles.chipOn]}>
              <Image source={{ uri: item.cutout_url || item.image_url }} style={styles.chipImg} />
              <Text numberOfLines={1} style={styles.chipText}>
                {item.name}
              </Text>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    minHeight: 320,
    borderRadius: radii.lg,
    overflow: "hidden",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  result: { width: "100%", height: "100%" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20, gap: 8 },
  placeholder: {
    fontFamily: fonts.display,
    fontSize: 26,
    color: colors.textMuted,
    textAlign: "center",
  },
  selectedHint: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: "center",
    fontSize: 13,
  },
  busy: { fontFamily: fonts.bodyMedium, color: colors.textMuted },
  chip: {
    width: 108,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  chipOn: { borderColor: colors.ink, borderWidth: 2 },
  chipImg: { width: "100%", height: 96, backgroundColor: colors.surface2 },
  chipText: {
    fontFamily: fonts.body,
    color: colors.ink,
    fontSize: 11,
    padding: 8,
  },
  empty: { fontFamily: fonts.body, color: colors.textMuted },
});
