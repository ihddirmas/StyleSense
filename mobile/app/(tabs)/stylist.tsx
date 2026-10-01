import { useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Screen } from "@/components/Screen";
import { PrimaryButton } from "@/components/PrimaryButton";
import { apiPost } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { colors } from "@/lib/theme";

type Msg = ChatMessage & { id: string };

export default function StylistScreen() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I’m Aria — your personal stylist. Ask about color season, Kibbe type, or whether a piece suits you.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<FlatList>(null);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const userMsg: Msg = { id: `u-${Date.now()}`, role: "user", content: text };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const msgs = next
        .filter((m) => m.id !== "welcome")
        .map(({ role, content }) => ({ role, content }));
      const res = await apiPost<{ reply: string }>("/api/stylist/chat", {
        messages: msgs,
      });
      const reply = res.reply ?? "…";
      setMessages((m) => [...m, { id: `a-${Date.now()}`, role: "assistant", content: reply }]);
    } catch (e: any) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          content: e?.message ?? "I couldn’t reply just now.",
        },
      ]);
    } finally {
      setBusy(false);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  return (
    <Screen contentStyle={{ flex: 1, paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Aria</Text>
        <Text style={styles.sub}>Personal AI stylist</Text>
      </View>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={80}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 12, gap: 10 }}
          renderItem={({ item }) => (
            <View style={[styles.bubble, item.role === "user" ? styles.user : styles.assistant]}>
              <Text style={styles.bubbleText}>{item.content}</Text>
            </View>
          )}
        />
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Aria anything about your style…"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            multiline
          />
          <PrimaryButton label={busy ? "…" : "Send"} onPress={send} loading={busy} style={{ minWidth: 96 }} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20, paddingBottom: 8 },
  title: { fontFamily: "CormorantGaramond_500Medium", fontSize: 34, color: colors.text },
  sub: { fontFamily: "PublicSans_400Regular", color: colors.textMuted },
  bubble: {
    maxWidth: "88%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  user: { alignSelf: "flex-end", backgroundColor: colors.accent },
  assistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { fontFamily: "PublicSans_400Regular", color: colors.text, lineHeight: 21 },
  composer: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.bgSoft,
    color: colors.text,
    fontFamily: "PublicSans_400Regular",
  },
});
