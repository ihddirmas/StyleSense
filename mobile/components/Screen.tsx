import { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "./LinearFallback";
import { colors } from "@/lib/theme";

export function Screen({
  children,
  scroll,
  style,
  contentStyle,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  contentStyle?: ViewStyle;
}) {
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.content, contentStyle, { flex: 1 }]}>{children}</View>
  );

  return (
    <View style={[styles.root, style]}>
      <LinearGradient />
      <SafeAreaView style={styles.safe}>{body}</SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  safe: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 8 },
});
