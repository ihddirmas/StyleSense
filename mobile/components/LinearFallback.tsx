import { StyleSheet, View } from "react-native";
import { colors } from "@/lib/theme";

/** Soft atmospheric wash without an extra native gradient dependency. */
export function LinearGradient() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.top} />
      <View style={styles.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    position: "absolute",
    top: -80,
    left: -40,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(196,92,38,0.18)",
  },
  bottom: {
    position: "absolute",
    bottom: -60,
    right: -50,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(139,115,85,0.16)",
  },
});
