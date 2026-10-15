import { StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";

/** Soft parchment atmosphere — matches the web FashionBackground wash. */
export function LinearGradient() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.gold} />
      <View style={styles.ink} />
    </View>
  );
}

const styles = StyleSheet.create({
  gold: {
    position: "absolute",
    top: -100,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(231, 226, 188, 0.55)",
  },
  ink: {
    position: "absolute",
    bottom: -80,
    left: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: "rgba(60, 36, 21, 0.04)",
  },
});
