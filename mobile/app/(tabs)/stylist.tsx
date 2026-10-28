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
import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import { apiPost } from "@/lib/api";
import type { ChatMessage } from "@/lib/types";
import { colors, fonts, radii } from "@/lib/theme";

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
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: "assistant", content: res.reply ?? "…" },
      ]);
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
    <Screen wash={false} contentStyle={{ flex: 1, paddingHorizontal: 0 }}>
      <View style={styles.header}>
        <PageHeader eyebrow="Stylist" title="Aria" subtitle="Personal AI stylist" />
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
              <Text
                style={[
                  styles.bubbleText,
                  { color: item.role === "user" ? colors.parchment : colors.ink },
                ]}
              >
                {item.content}
              </Text>
            </View>
          )}
        />
        <View style={styles.composer}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Ask Aria anything about your style…"
            placeholderTextColor={colors.textMuted}
            style={styles.input}
            multiline
          />
          <PrimaryButton
            label={busy ? "…" : "Send"}
            onPress={send}
            loading={busy}
            style={{ minWidth: 88 }}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 20 },
  bubble: {
    maxWidth: "88%",
    borderRadius: radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  user: { alignSelf: "flex-end", backgroundColor: colors.ink },
  assistant: {
    alignSelf: "flex-start",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { fontFamily: fonts.body, lineHeight: 21, fontSize: 14 },
  composer: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "flex-end",
  },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    borderRadius: radii.sm,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface2,
    color: colors.ink,
    fontFamily: fonts.body,
    borderWidth: 1,
    borderColor: colors.border,
  },
});
