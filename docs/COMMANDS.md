# StyleSense — Quick Commands Reference

## Servers

```powershell
# Backend (port 8000) — open a new terminal
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\backend"
.\venv\Scripts\python.exe -m uvicorn main:app --port 8000 --log-level warning

# Frontend (port 3000) — open a new terminal
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\frontend"
npm run dev
```

FastAPI docs: http://localhost:8000/docs  
App: http://localhost:3000

---

## Smoke Tests

```powershell
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\backend"

.\venv\Scripts\python.exe -m tests.test_runway_smoke       # cheapest (~2cr)
.\venv\Scripts\python.exe -m tests.test_runway_full        # full pipeline (set $env:SKIP_ANIMATE="1" to skip video ~60cr)
.\venv\Scripts\python.exe -m tests.test_auth_flow          # signup → JWT → protected route
.\venv\Scripts\python.exe -m tests.test_supabase_smoke
.\venv\Scripts\python.exe -m tests.test_anthropic_smoke
.\venv\Scripts\python.exe -m tests.test_wardrobe_flow
.\venv\Scripts\python.exe -m tests.test_garment_cleaner
.\venv\Scripts\python.exe -m tests.probe_detect_items      # Claude vision multi-item (~$0.01)
```

---

## Dependencies

```powershell
# Add a backend package
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\backend"
.\venv\Scripts\python.exe -m pip install <pkg>
# Then manually add to requirements.txt

# Frontend
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\frontend"
npm install <pkg>
```

---

## Build / Lint

```powershell
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\frontend"
npm run build    # full production build + type-check
npm run lint     # ESLint only
```

---

## Admin One-Time Scripts

```powershell
Set-Location "c:\Users\samr1\OneDrive\Documents\GitHub\StyleSense\backend"

# Create shared Aria stylist character (run once, paste UUID into both .env files)
.\venv\Scripts\python.exe -m scripts.setup_admin_stylist

# Generate Aria's hero ramp video (~60-100cr)
.\venv\Scripts\python.exe -m scripts.animate_admin_stylist

# One-time Supabase storage bucket setup
.\venv\Scripts\python.exe -m tests.setup_buckets
```

---

## Git

```powershell
# Current branch
git status
git diff

# Switch branches
git checkout feature/ui-refinements
git checkout main

# Push current branch
git push -u origin HEAD
```

---

## Supabase Schema (apply in dashboard SQL editor)

Order matters — run in sequence on a fresh project:
1. `supabase_schema.sql`
2. `supabase_schema_v2_social.sql`
3. `supabase_schema_v2b_fix.sql`
4. `supabase_schema_v2c_fix.sql`
5. `supabase_schema_v2d_selfies.sql`
6. `supabase_schema_v2e_stylized.sql`
7. `supabase_schema_v2f_stylized_video.sql`

---

## Credit Budget Reminder

| Operation | Credits |
|---|---|
| gen4_image_turbo (cleaner/isolate) | 2cr |
| gen4_image (try-on / event scene) | 5cr |
| gen4.5 video 5s | 60cr |
| Total budget | 50,000cr |

Use `gen4_image_turbo` during dev. Switch to `gen4_image` only for demo recording.
