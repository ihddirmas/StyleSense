import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/providers/AuthProvider";
import { colors, fonts, radii } from "@/lib/theme";

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit() {
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      Alert.alert("Sign in failed", e?.message ?? "Try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Screen scroll contentStyle={{ justifyContent: "center", flexGrow: 1, gap: 24 }}>
      <View style={{ alignItems: "center" }}>
        <BrandMark subtitle="Sign in to your closet" />
      </View>
      <View style={styles.card}>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.textMuted}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <TextInput
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.textMuted}
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />
        <PrimaryButton label="Sign in" onPress={onSubmit} loading={loading} />
        <Link href="/(auth)/signup" asChild>
          <Pressable>
            <Text style={styles.link}>New here? Create an account</Text>
          </Pressable>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: 24,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  input: {
    backgroundColor: colors.surface2,
    borderRadius: radii.sm,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.ink,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderColor: colors.border,
    fontSize: 15,
  },
  link: {
    textAlign: "center",
    color: colors.textMuted,
    fontFamily: fonts.bodyMedium,
    marginTop: 4,
    fontSize: 13,
  },
});
