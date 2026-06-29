# StyleSense — Hackathon Test Credentials & Demo Data

> **FOR JUDGES / DEMO RUNNERS ONLY** — Do not commit real secrets to git. This file documents the *shape* of credentials needed.

---

## 1. Demo User (Pre-created in Supabase Auth + Aurora)

| Field | Value |
|-------|-------|
| **Email** | `judge@stylesense.demo` |
| **Password** | `Demo2026!` |
| **User ID (Aurora)** | `00000000-0000-0000-0000-000000000001` |
| **Supabase Auth UID** | (auto-generated on signup — match in Aurora `users.id`) |

**Pre-loaded in Aurora (run `migrate_to_aurora` after signup):**
- Selfie: uploaded to Supabase Storage `selfies/` bucket
- Runway Character ID: `ch_abc123...` (create once via `scripts.setup_admin_stylist`)
- Wardrobe: 3 items (blazer, dress, shoes) — see Section 3

---

## 2. Environment Variables (Backend `.env`)

```env
# Runway (get from dev.runwayml.com → API Keys)
RUNWAYML_API_SECRET=key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Supabase (get from Supabase Dashboard → Settings → API)
SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Aurora PostgreSQL (IAM auth — free tier cluster)
# Create cluster in AWS Console → RDS → Aurora Serverless v2
# Enable IAM Authentication, note endpoint
AURORA_IAM_AUTH=true
AURORA_HOST=stylesense.cluster-xxxxx.ap-south-1.rds.amazonaws.com
AURORA_PORT=5432
AURORA_DB=postgres
AURORA_USER=postgres
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Anthropic (for fallback stylist chat)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# App
FRONTEND_URL=https://stylesense.vercel.app
DEMO_USER_ID=00000000-0000-0000-0000-000000000001

# Admin Stylist (Aria) — run scripts.setup_admin_stylist once
STYLIST_CHARACTER_ID=ch_xxxxxxxxxxxxxxxx
STYLIST_HERO_VIDEO_URL=https://xxx.supabase.co/storage/v1/object/public/tryons/aria-ramp.mp4
```

---

## 3. Environment Variables (Frontend `.env.local`)

```env
# Backend API (Vercel deployment URL after deploy)
NEXT_PUBLIC_API_URL=https://stylesense-api.onrender.com

# Supabase (public keys — safe for browser)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Runway (server-side only — used by /api/avatar/connect)
RUNWAYML_API_SECRET=key_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Demo user ID (matches Aurora demo user)
NEXT_PUBLIC_DEMO_USER_ID=00000000-0000-0000-0000-000000000001
```

---

## 4. Pre-loaded Wardrobe Items (for instant demo)

Run these once after demo user signup to populate Aurora:

| # | Name | Category | Source URL | Image (Supabase) |
|---|------|----------|------------|------------------|
| 1 | Ivory Linen Blazer | outerwear | https://www.asos.com/... | `wardrobe/demo/blazer.jpg` |
| 2 | Midnight Silk Dress | dresses | https://www.uniqlo.com/... | `wardrobe/demo/dress.jpg` |
| 3 | Nude Leather Loafers | shoes | https://www.everlane.com/... | `wardrobe/demo/loafers.jpg` |

**Insert via SQL (or use Wardrobe page UI):**
```sql
INSERT INTO wardrobe_items (id, user_id, name, category, occasion, color, brand, image_url, source_url)
VALUES
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'Ivory Linen Blazer', 'outerwear', 'formal', 'ivory', 'ASOS', 'https://xxx.supabase.co/storage/v1/object/public/wardrobe/demo/blazer.jpg', 'https://www.asos.com/...'),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000001', 'Midnight Silk Dress', 'dresses', 'evening', 'midnight', 'Uniqlo', 'https://xxx.supabase.co/storage/v1/object/public/wardrobe/demo/dress.jpg', 'https://www.uniqlo.com/...'),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000001', 'Nude Leather Loafers', 'shoes', 'any', 'nude', 'Everlane', 'https://xxx.supabase.co/storage/v1/object/public/wardrobe/demo/loafers.jpg', 'https://www.everlane.com/...')
ON CONFLICT (id) DO NOTHING;
```

---

## 5. Runway Character Setup (One-time)

```powershell
# Backend terminal
cd backend
.\venv\Scripts\python.exe -m scripts.setup_admin_stylist
# Output: STYLIST_CHARACTER_ID=ch_xxxxxxxxxxxxxxxx
# Copy to BOTH backend/.env AND frontend/.env.local
# Restart both servers
```

**Aria Ramp Video (one-time):**
```powershell
.\venv\Scripts\python.exe -m scripts.animate_admin_stylist
# Output: STYLIST_HERO_VIDEO_URL=https://xxx.supabase.co/storage/v1/object/public/tryons/aria-ramp.mp4
# Copy to BOTH .env files, restart servers
```

---

## 6. Aurora Schema Setup (One-time)

```powershell
# Apply schema
.\venv\Scripts\python.exe -m scripts.init_aurora

# Verify
.\venv\Scripts\python.exe -m scripts.check_aurora

# Migrate existing Supabase data (if any)
.\venv\Scripts\python.exe -m scripts.migrate_to_aurora
```

---

## 7. Supabase Storage Buckets (Create Once)

| Bucket | Public | Purpose |
|--------|--------|---------|
| `wardrobe` | ✅ Yes | Clothing item images + cutouts |
| `selfies` | ✅ Yes | User selfies for avatar creation |
| `tryons` | ✅ Yes | Generated try-on images + videos |

Create in Supabase Dashboard → Storage → New Bucket (check "Public bucket").

---

## 8. Demo Flow Checklist (Pre-recording)

- [ ] Deploy frontend to Vercel → note production URL
- [ ] Deploy backend to Render → note API URL  
- [ ] Update `FRONTEND_URL` in backend `.env` and `NEXT_PUBLIC_API_URL` in frontend `.env.local`
- [ ] Create demo user in Supabase Auth (email/password)
- [ ] Run Aurora schema + migrate
- [ ] Run `setup_admin_stylist` + `animate_admin_stylist`
- [ ] Add 3 wardrobe items via UI or SQL
- [ ] Test full flow: selfie → avatar → wardrobe → studio → try-on → event → animate → stylist
- [ ] Open AWS Console → RDS → `stylesense` cluster for screenshot
- [ ] Record demo video (OBS, 1080p, 30fps)

---

## 9. Credit Budget (Runway)

| Operation | Model | Credits | Demo Count | Total |
|-----------|-------|---------|------------|-------|
| Avatar creation | gen4_image | 5 | 1 | 5 |
| Garment cleaner (per item) | gen4_image_turbo | 2 | 3 | 6 |
| Try-on | gen4_image_turbo | 2 | 3 | 6 |
| Event scene | gen4_image | 5 | 1 | 5 |
| **Animate (WOW)** | **gen4.5** | **60** | **1** | **60** |
| Aria setup | gen4_image | 5 | 1 | 5 |
| Aria ramp video | gen4.5 | 60 | 1 | 60 |
| **Buffer (rehearsals)** | — | — | — | **~50** |
| **TOTAL** | | | | **~197** |

**Start with 50,000 credits.** Plenty of headroom.

---

## 10. Quick Commands Reference

```powershell
# Backend
Set-Location backend
.\venv\Scripts\python.exe -m uvicorn main:app --port 8000 --log-level warning

# Frontend
cd frontend
npm run dev

# Tests
.\venv\Scripts\python.exe -m tests.test_runway_smoke        # ~2cr
.\venv\Scripts\python.exe -m tests.test_runway_full        # ~70cr (set $env:SKIP_ANIMATE="1" for ~10cr)
.\venv\Scripts\python.exe -m tests.test_auth_flow

# Aurora
.\venv\Scripts\python.exe -m scripts.init_aurora
.\venv\Scripts\python.exe -m scripts.check_aurora
.\venv\Scripts\python.exe -m scripts.migrate_to_aurora

# Admin stylist
.\venv\Scripts\python.exe -m scripts.setup_admin_stylist
.\venv\Scripts\python.exe -m scripts.animate_admin_stylist
```

---

## 11. Submission Package Checklist

- [ ] Demo video (MP4, <90s, 1080p, <100MB) → YouTube (public)
- [ ] GitHub repo (public or invited) with README
- [ ] Architecture diagram (PNG, 1920x1080)
- [ ] Aurora console screenshot (`aurora-usage-screenshot.png`)
- [ ] Devpost writeup with problem, solution, tech stack, API coverage
- [ ] Pitch deck (3 slides max)