import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts } from "@/lib/theme";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        {title ? <Text style={styles.title}>{title}</Text> : null}
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      {action ? <View style={styles.action}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 2.2,
    fontSize: 11,
    marginBottom: 6,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 34,
    color: colors.ink,
    letterSpacing: -0.4,
    lineHeight: 38,
  },
  subtitle: {
    marginTop: 8,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.ink,
    opacity: 0.9,
    lineHeight: 20,
  },
  action: { flexShrink: 0 },
});
