import { Platform } from "react-native";
import Purchases, { LOG_LEVEL, type CustomerInfo, type PurchasesPackage } from "react-native-purchases";
import Constants from "expo-constants";

export const ENTITLEMENT_STUDIO = "studio";
export const ENTITLEMENT_PRO = "pro";

function isExpoGo() {
  return Constants.appOwnership === "expo";
}

export function getRevenueCatApiKey(): string {
  // Expo Go / Test Store key for Shipaton preview; store keys for production builds.
  if (isExpoGo() || Platform.OS === "web") {
    return process.env.EXPO_PUBLIC_REVENUECAT_TEST_API_KEY ?? "";
  }
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY ?? "";
  }
  return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY ?? "";
}

let configured = false;

export async function configureRevenueCat(appUserId?: string | null) {
  // Skip during SSR / missing window — Expo web static render.
  if (Platform.OS === "web" && typeof window === "undefined") return false;
  const apiKey = getRevenueCatApiKey();
  if (!apiKey || apiKey.includes("REPLACE")) {
    console.warn("[RC] Missing API key — purchases disabled");
    return false;
  }
  if (!configured) {
    Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);
    Purchases.configure({
      apiKey,
      appUserID: appUserId ?? undefined,
    });
    configured = true;
  } else if (appUserId) {
    await Purchases.logIn(appUserId);
  }
  return true;
}

export async function logoutRevenueCat() {
  if (!configured) return;
  try {
    await Purchases.logOut();
  } catch {
    /* ignore when anonymous */
  }
}

export function activePlan(info: CustomerInfo | null): "pro" | "studio" | "free" {
  if (!info) return "free";
  if (info.entitlements.active[ENTITLEMENT_PRO]) return "pro";
  if (info.entitlements.active[ENTITLEMENT_STUDIO]) return "studio";
  return "free";
}

export function hasPremium(info: CustomerInfo | null): boolean {
  return activePlan(info) !== "free";
}

export async function purchasePackage(pkg: PurchasesPackage): Promise<CustomerInfo> {
  const { customerInfo } = await Purchases.purchasePackage(pkg);
  return customerInfo;
}

export async function restorePurchases(): Promise<CustomerInfo> {
  return Purchases.restorePurchases();
}
