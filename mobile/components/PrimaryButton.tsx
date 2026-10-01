import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { colors } from "@/lib/theme";

export function PrimaryButton({
  label,
  onPress,
  loading,
  variant = "primary",
  style,
  disabled,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  variant?: "primary" | "ghost" | "danger";
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const bg =
    variant === "primary" ? colors.accent : variant === "danger" ? colors.danger : "transparent";
  const border = variant === "ghost" ? colors.border : "transparent";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, opacity: pressed || disabled ? 0.7 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <Text style={styles.label}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
    borderWidth: 1,
  },
  label: {
    color: colors.text,
    fontFamily: "PublicSans_600SemiBold",
    fontSize: 16,
  },
});
