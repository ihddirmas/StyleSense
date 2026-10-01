import { useState } from "react";
import { Alert, StyleSheet, Text, TextInput, View, Pressable } from "react-native";
import { Link } from "expo-router";
import { Screen } from "@/components/Screen";
import { BrandMark } from "@/components/BrandMark";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAuth } from "@/providers/AuthProvider";
import { colors } from "@/lib/theme";

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
    <Screen scroll contentStyle={{ justifyContent: "center", flexGrow: 1, gap: 28 }}>
      <BrandMark />
      <View style={styles.card}>
        <Text style={styles.heading}>Welcome back</Text>
        <Text style={styles.hint}>Sign in to your wardrobe and Aria.</Text>
        <TextInput
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="Email"
          placeholderTextColor={colors.textDim}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />
        <TextInput
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.textDim}
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
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 12,
  },
  heading: {
    fontFamily: "CormorantGaramond_500Medium",
    fontSize: 32,
    color: colors.text,
  },
  hint: {
    fontFamily: "PublicSans_400Regular",
    color: colors.textMuted,
    marginBottom: 4,
  },
  input: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    color: colors.text,
    fontFamily: "PublicSans_400Regular",
    borderWidth: 1,
    borderColor: colors.border,
  },
  link: {
    textAlign: "center",
    color: colors.accentSoft,
    fontFamily: "PublicSans_500Medium",
    marginTop: 4,
  },
});
