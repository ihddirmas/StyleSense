import { StyleSheet, Text, View } from "react-native";
import { colors } from "@/lib/theme";

export function BrandMark({ size = "lg" }: { size?: "sm" | "lg" }) {
  const titleSize = size === "lg" ? 42 : 22;
  return (
    <View>
      <Text style={[styles.title, { fontSize: titleSize }]}>StyleSense</Text>
      {size === "lg" ? (
        <Text style={styles.sub}>AI wardrobe · try-on · stylist</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: "CormorantGaramond_500Medium",
    color: colors.text,
    letterSpacing: 0.5,
  },
  sub: {
    marginTop: 4,
    fontFamily: "PublicSans_400Regular",
    color: colors.textMuted,
    fontSize: 14,
  },
});
