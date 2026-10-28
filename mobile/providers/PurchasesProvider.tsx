import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";
import RevenueCatUI, { PAYWALL_RESULT } from "react-native-purchases-ui";
import {
  activePlan,
  configureRevenueCat,
  hasPremium,
  purchasePackage,
  restorePurchases,
} from "@/lib/revenuecat";
import { useAuth } from "./AuthProvider";

type PurchasesContextValue = {
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  plan: "pro" | "studio" | "free";
  isPremium: boolean;
  refresh: () => Promise<void>;
  buy: (pkg: PurchasesPackage) => Promise<void>;
  restore: () => Promise<void>;
  presentPaywall: () => Promise<boolean>;
};

const PurchasesContext = createContext<PurchasesContextValue | null>(null);

export function PurchasesProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);

  const refresh = useCallback(async () => {
    try {
      await configureRevenueCat(user?.id);
      const [info, offs] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      setCustomerInfo(info);
      setOfferings(offs);
    } catch (e) {
      console.warn("[RC] refresh failed", e);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
    const listener = (info: CustomerInfo) => setCustomerInfo(info);
    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, [refresh, user?.id]);

  const value = useMemo<PurchasesContextValue>(
    () => ({
      customerInfo,
      offerings,
      plan: activePlan(customerInfo),
      isPremium: hasPremium(customerInfo),
      refresh,
      async buy(pkg) {
        const info = await purchasePackage(pkg);
        setCustomerInfo(info);
      },
      async restore() {
        const info = await restorePurchases();
        setCustomerInfo(info);
      },
      async presentPaywall() {
        try {
          const result = await RevenueCatUI.presentPaywallIfNeeded({
            requiredEntitlementIdentifier: "studio",
          });
          await refresh();
          return (
            result === PAYWALL_RESULT.PURCHASED ||
            result === PAYWALL_RESULT.RESTORED ||
            result === PAYWALL_RESULT.NOT_PRESENTED
          );
        } catch (e) {
          console.warn("[RC] paywall failed, falling back to offerings UI", e);
          return false;
        }
      },
    }),
    [customerInfo, offerings, refresh]
  );

  return <PurchasesContext.Provider value={value}>{children}</PurchasesContext.Provider>;
}

export function usePurchases() {
  const ctx = useContext(PurchasesContext);
  if (!ctx) throw new Error("usePurchases requires PurchasesProvider");
  return ctx;
}
