import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

export function BrandMark({ size = "lg", subtitle }: { size?: "sm" | "lg"; subtitle?: string }) {
  const titleSize = size === "lg" ? 40 : 22;
  return (
    <View>
      <Text style={[styles.title, { fontSize: titleSize }]}>StyleSenseAI</Text>
      {size === "lg" || subtitle ? (
        <Text style={styles.sub}>
          {subtitle ?? "AI wardrobe · try-on · stylist"}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: fonts.display,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  sub: {
    marginTop: 4,
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
