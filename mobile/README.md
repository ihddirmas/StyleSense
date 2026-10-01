# StyleSense Mobile (Expo + RevenueCat)

Shipaton 2026 entry: Expo React Native client for StyleSense with RevenueCat subscriptions.

Dashboard: [StyleSense RC project](https://app.revenuecat.com/projects/e81036ed)

## What’s in the app

- Supabase email/password auth (same users as web)
- Home · Closet · Studio try-on · Aria stylist · Upgrade (RevenueCat)
- Entitlements: `studio` ($9/mo, 40 try-ons) and `pro` ($19/mo, 100 try-ons)
- Test Store key used automatically in Expo Go for purchase demos
- Backend raises try-on caps when `REVENUECAT_SECRET_API_KEY` is set

## Quick start

```bash
cd mobile
cp .env.example .env   # fill Supabase + RC keys (repo agent already has a local .env)
npm install
npx expo start
```

Scan with Expo Go for UI + Test Store Preview API. Real StoreKit / Play Billing needs a **development build**.

## EAS deploy (Android fastest for Shipaton)

```bash
npm i -g eas-cli
cd mobile
eas login
eas init          # replaces REPLACE_WITH_EAS_PROJECT_ID in app.json
eas build --platform android --profile preview
eas submit --platform android --profile production
```

iOS:

```bash
eas build --platform ios --profile production
eas submit --platform ios --profile production
```

Bundle / package IDs (already registered in RevenueCat):

- iOS: `ai.stylesense.app`
- Android: `ai.stylesense.app`

## RevenueCat setup (already created)

| Resource | ID / key |
|----------|----------|
| Project | `proje81036ed` |
| Entitlements | `studio`, `pro` |
| Offering | `default` |
| Packages | `$rc_monthly` (Studio), `$rc_custom_pro_monthly` (Pro) |
| Test products | `stylesense_studio_monthly`, `stylesense_pro_monthly` |
| Paywall draft | `pw8156a4c2f453419a` — publish in dashboard when ready |

Public SDK keys live in `.env` / EAS secrets (`EXPO_PUBLIC_REVENUECAT_*`).

Server secret (optional, for cap enforcement):

```bash
# backend/.env
REVENUECAT_SECRET_API_KEY=sk_xxxxxxxx
```

## Shipaton submission checklist

1. Publish Play / App Store listing during the Shipaton window (new app, not an update).
2. Confirm RevenueCat SDK configures + a purchase or Test Store buy unlocks `studio` / `pro`.
3. Demo video ≤ 2 minutes showing login → wardrobe → try-on → paywall purchase.
4. Provide free trial **or** promo / Test Store path for judges.
5. App icon 1024×1024 + screenshot 1179×2556.
6. Publish the RevenueCat paywall draft when the offering looks right.

## Backend

Points at production by default:

`EXPO_PUBLIC_API_URL=https://styleai-backend-5vk9.onrender.com`
