import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type ViewStyle,
} from "react-native";
import { colors, fonts, radii } from "@/lib/theme";

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
  variant?: "primary" | "secondary" | "ghost";
  style?: ViewStyle;
  disabled?: boolean;
}) {
  const isPrimary = variant === "primary";
  const isGhost = variant === "ghost";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        isPrimary && styles.primary,
        variant === "secondary" && styles.secondary,
        isGhost && styles.ghost,
        { opacity: pressed || disabled ? 0.7 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.parchment : colors.ink} />
      ) : (
        <Text
          style={[
            styles.label,
            { color: isPrimary ? colors.parchment : isGhost ? colors.textMuted : colors.ink },
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minHeight: 48,
    borderRadius: radii.btn,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 22,
    borderWidth: 2,
  },
  primary: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  secondary: {
    backgroundColor: "transparent",
    borderColor: colors.ink,
  },
  ghost: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  label: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
  },
});
