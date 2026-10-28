import { useCallback, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect } from "expo-router";
import { Screen } from "@/components/Screen";
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { apiGet, apiUpload } from "@/lib/api";
import type { WardrobeItem } from "@/lib/types";
import { colors, fonts, radii } from "@/lib/theme";

export default function WardrobeScreen() {
  const [items, setItems] = useState<WardrobeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems(await apiGet<WardrobeItem[]>("/api/wardrobe"));
    } catch (e: any) {
      Alert.alert("Wardrobe", e?.message ?? "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function addPhoto() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission needed", "Allow photo library access to add garments.");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", {
        uri: asset.uri,
        name: "garment.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as any);
      form.append("name", "Closet item");
      form.append("category", "tops");
      form.append("clean", "runway");
      await apiUpload("/api/wardrobe/upload", form);
      await load();
    } catch (e: any) {
      Alert.alert("Upload failed", e?.message ?? "Try again");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Screen wash={false} contentStyle={{ flex: 1, paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <PageHeader
          eyebrow="Wardrobe"
          title="Your closet"
          subtitle={`${items.length} pieces`}
          action={
            <PrimaryButton
              label={uploading ? "…" : "Add"}
              onPress={addPhoto}
              loading={uploading}
              style={{ minWidth: 88, minHeight: 40, paddingHorizontal: 14 }}
            />
          }
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        numColumns={2}
        refreshing={loading}
        onRefresh={load}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40, gap: 12 }}
        columnWrapperStyle={{ gap: 12 }}
        ListEmptyComponent={
          <Text style={styles.empty}>Your closet is empty. Add a garment photo.</Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.card}>
            <Image source={{ uri: item.cutout_url || item.image_url }} style={styles.image} />
            <Text numberOfLines={2} style={styles.name}>
              {item.name}
            </Text>
            <Text style={styles.cat}>{item.category}</Text>
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20 },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 4,
  },
  image: { width: "100%", aspectRatio: 0.85, backgroundColor: colors.surface2 },
  name: {
    fontFamily: fonts.bodyMedium,
    color: colors.ink,
    paddingHorizontal: 10,
    paddingTop: 8,
    fontSize: 13,
  },
  cat: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    paddingHorizontal: 10,
    paddingBottom: 10,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  empty: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    padding: 20,
    textAlign: "center",
  },
});
