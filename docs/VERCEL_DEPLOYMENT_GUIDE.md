# Vercel Deployment Guide — StyleSense Frontend

## Quick Deploy (One-time Setup)

### 1. Push to GitHub
```bash
git add .
git commit -m "chore: add vercel.json for deployment"
git push origin main
```

### 2. Import in Vercel Dashboard
1. Go to https://vercel.com/new
2. Import your GitHub repo
3. Framework preset: **Next.js** (auto-detected)
4. Root directory: `frontend`
5. Click **Deploy**

### 3. Configure Environment Variables (Vercel Dashboard → Settings → Environment Variables)

| Name | Value | Environment |
|------|-------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://stylesense-api.onrender.com` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxxxxxxxxxxxxxxxxx.supabase.co` | All |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...` | All |
| `RUNWAYML_API_SECRET` | `key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` | All |
| `STYLIST_CHARACTER_ID` | `<UUID from setup_admin_stylist>` | All (server-side for WebRTC session minting) |

> **Note**: Use the `@stylesense-*` references in `vercel.json` only if using Vercel CLI with linked secrets. For dashboard deploy, paste actual values above.

### 4. Update Backend CORS
After first deploy, note your Vercel URL (e.g., `https://stylesense-abc123.vercel.app`).

Update **backend `.env`**:
```env
FRONTEND_URL=https://stylesense-abc123.vercel.app
```

Restart backend.

### 5. Redeploy Frontend (Picks up new API URL)
Trigger a new deployment in Vercel dashboard or push a commit.

---

## Production Checklist

- [ ] GitHub repo connected to Vercel
- [ ] All 4 environment variables set in Vercel dashboard
- [ ] Backend deployed and accessible (Render/Container)
- [ ] `FRONTEND_URL` in backend `.env` matches Vercel production URL
- [ ] Supabase Auth → URL Configuration → Site URL updated to Vercel URL
- [ ] Supabase Auth → Redirect URLs includes `https://your-app.vercel.app/auth/callback`
- [ ] Test full flow: signup → onboarding → wardrobe → studio → try-on → stylist

---

## Vercel CLI Alternative (If Preferred)

```bash
# Install Vercel CLI
npm i -g vercel

# Login
vercel login

# Link project (run from frontend/ directory)
cd frontend
vercel link

# Add secrets (one-time)
vercel env add NEXT_PUBLIC_API_URL production
vercel env add NEXT_PUBLIC_SUPABASE_URL production
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production
vercel env add RUNWAYML_API_SECRET production

# Deploy to production
vercel --prod
```

---

## Troubleshooting

### Build Fails: "Module not found"
- Ensure `package.json` has all dependencies
- Check `npm run build` works locally first

### API Calls Fail: CORS Error
- Verify `FRONTEND_URL` in backend `.env` matches Vercel URL exactly (including `https://`)
- Backend must be restarted after changing `FRONTEND_URL`

### Supabase Auth Redirect Loop
- Check Supabase Dashboard → Authentication → URL Configuration
- Site URL = your Vercel production URL
- Redirect URLs = `https://your-app.vercel.app/auth/callback`

### Runway Avatar Connect Fails
- Verify `RUNWAYML_API_SECRET` is set in Vercel env vars (not `NEXT_PUBLIC_*`)
- Check `/api/avatar/connect` route exists and returns session token

### Images Don't Load
- Confirm `next.config.mjs` has `**.supabase.co` in `remotePatterns`
- Supabase Storage buckets must be **Public**

---

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ | Backend API base URL (e.g., `https://stylesense-api.onrender.com`) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon public key |
| `RUNWAYML_API_SECRET` | ✅ | Runway API secret (server-side only, used by `/api/avatar/connect`) |
| `STYLIST_CHARACTER_ID` | ✅ | Runway character UUID for Aria WebRTC avatar (from `setup_admin_stylist`) |

---

## Custom Domain (Optional)

1. Vercel Dashboard → Settings → Domains
2. Add your domain (e.g., `stylesense.app`)
3. Update DNS records as instructed
4. Update `FRONTEND_URL` in backend `.env` to custom domain
5. Update Supabase Auth URLs to custom domain

---

## Monitoring

- **Vercel Analytics**: Enable in dashboard for Core Web Vitals
- **Function Logs**: Check `/api/avatar/connect` invocations
- **Build Logs**: Monitor for TypeScript/ESLint errors (currently ignored in build)

---

## Rollback

```bash
# List deployments
vercel list

# Promote previous deployment
vercel promote <deployment-url>
```