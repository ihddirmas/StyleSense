import { createClient } from "@supabase/supabase-js";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppState, Platform } from "react-native";

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/** AsyncStorage is unavailable during Expo web SSR (Node). Use a memory/local fallback. */
const memory = new Map<string, string>();

const webStorage = {
  async getItem(key: string) {
    if (typeof window === "undefined") return memory.get(key) ?? null;
    return window.localStorage.getItem(key);
  },
  async setItem(key: string, value: string) {
    if (typeof window === "undefined") {
      memory.set(key, value);
      return;
    }
    window.localStorage.setItem(key, value);
  },
  async removeItem(key: string) {
    if (typeof window === "undefined") {
      memory.delete(key);
      return;
    }
    window.localStorage.removeItem(key);
  },
};

export const supabase = createClient(url, anon, {
  auth: {
    storage: Platform.OS === "web" ? webStorage : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

if (Platform.OS !== "web") {
  AppState.addEventListener("change", (state) => {
    if (state === "active") {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
