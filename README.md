# Zlaqa Team OS

HRM, selfie attendance, breaks, OKRs, performance, team tracker, tasks, leave, announcements and team chat for **Zlaqa AI Labs**.
Next.js 16 (App Router) + TypeScript + Tailwind + Supabase.

> Rebuild / extend prompt: see [`MASTER_PROMPT.md`](./MASTER_PROMPT.md) · What's new: [`docs/V3_CHANGELOG.md`](./docs/V3_CHANGELOG.md) · [`docs/V2_CHANGELOG.md`](./docs/V2_CHANGELOG.md)

**v3 highlights:** per-person tracking switches (KPIs for some, OKRs + daily log for others) · tracking presets · KPIs (manual + auto) · My Day log for unplanned work · feature on/off switches · OKR template on/off · announcements with must-read, reactions and polls · analytics · in-app guides, page tips, onboarding tour and Help center · phone-first layout · **Export my data** + import script to move a live demo team into Supabase

**v2 highlights:** dark mode · animations · mobile tab bar + installable app · Ctrl K command palette · notifications · daily standup & mood pulse · geofence · streaks · smart insights · kudos wall · calendar & holidays · server-side timestamps

---

## 1. Run it in 60 seconds (demo mode, no backend)

```bash
npm install
cp .env.example .env.local     # NEXT_PUBLIC_DATA_MODE=demo is the default
npm run dev                    # http://localhost:3000
```

### Demo credentials (password for all: `Zlaqa@123`)

| Role | Email | What to try |
|---|---|---|
| Super Admin | `superadmin@zlaqa.demo` | Settings, dashboard builder, departments, audit log |
| Manager (Engineering) | `manager@zlaqa.demo` | Attendance records + selfies, apply OKR template to team, approve leave |
| Member (Developer) | `member@zlaqa.demo` | Check in with selfie, tea/lunch breaks, check out, update KRs |

More demo people: `ops.manager@`, `creative.manager@`, `dev2@`, `dev3@`, `research@`, `design@`, `content@`, `ops1@`, `sales@` (all `@zlaqa.demo`).

Demo data lives in your browser's localStorage. Reset it from the login page or **Settings → Data**.

> Camera needs `localhost` or HTTPS. On a phone over plain LAN HTTP the app falls back to photo upload.

---

## 2. Go live on Supabase

1. Create a project at supabase.com.
2. SQL editor → run every file in `supabase/migrations/` in order: `0001`, `0003`, `0004` (`0002` only if you create your own first login).
3. Fill `.env.local`:
   ```
   NEXT_PUBLIC_DATA_MODE=supabase
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
   SUPABASE_SERVICE_ROLE_KEY=...        # server only
   NEXT_PUBLIC_SHOW_DEMO_LOGINS=false
   ```
4. Either
   - **already running demo mode with real people?** Collect everyone's Profile → *Export my data* files, then `npm run import:exports -- ./exports` (dry run) and `--apply`. See section 7. **or**
   - `npm run seed:supabase` → creates the same demo team with real logins, **or**
   - create your own login in Supabase Auth, then run `0002_first_super_admin.sql` with your email.
5. Auth → Providers → Email: **disable public sign-ups** (employees are created from the Employees page).
6. `npm run build && npm start`, or deploy to Vercel / Docker (see `Dockerfile`).

Full details: [`supabase/README.md`](./supabase/README.md) · [`docs/MIGRATION.md`](./docs/MIGRATION.md)

---

## 3. What's inside

| Module | Page | Super Admin | Manager | Member |
|---|---|:-:|:-:|:-:|
| Role-based, customizable dashboard | `/dashboard` | ✅ | ✅ | ✅ |
| Check-in/out with selfie, GPS, tea/lunch/personal breaks | `/attendance` | ✅ | ✅ | ✅ |
| Live team tracker with % | `/team` | all | team | dept (toggle) |
| Attendance records, selfies, corrections, CSV | `/attendance/records` | all | team | – |
| OKRs (company → dept → individual) | `/okrs` | ✅ | team | own |
| OKR templates per department | `/okrs/templates` | ✅ | ✅ | – |
| Performance score & ranking | `/performance` | ✅ | team | own + dept |
| Tasks kanban linked to KRs | `/tasks` | ✅ | ✅ | ✅ |
| Team chat, departments, DMs | `/chat` | ✅ | ✅ | ✅ |
| Announcements | `/announcements` | ✅ | ✅ | read |
| Kudos wall | `/kudos` | ✅ | ✅ | ✅ |
| Calendar, holidays, anniversaries | `/calendar` | ✅ + holidays | team leave | own |
| Notifications, Ctrl K palette, dark mode | top bar | ✅ | ✅ | ✅ |
| Leave + balances + approvals | `/leave` | ✅ | approve team | apply |
| Employees (HRM) | `/employees` | ✅ | own dept | – |
| Departments + per-department dashboards | `/departments` | ✅ | – | – |
| Settings (everything configurable) | `/settings` | ✅ | – | – |
| Audit log | `/audit` | ✅ | – | – |

Every page folder has its own `README.md`.

---

## 4. Project map

```
src/
  app/
    login/                 sign-in + demo logins
    (app)/                 authenticated pages (sidebar shell)
      dashboard/ attendance/ attendance/records/ team/ okrs/ okrs/templates/ kudos/ calendar/
      performance/ tasks/ chat/ leave/ announcements/ employees/ employees/[id]/
      departments/ settings/ audit/ profile/
    api/admin/users/       server route: create logins (Supabase mode)
  components/              ui.tsx (design system), bits.tsx, widgets.tsx, okr.tsx, SelfieCamera.tsx, Shell.tsx
  lib/
    data/                  ⭐ migration boundary: adapter.ts, demo.ts, supabase.ts, seed.ts
    types.ts               domain types (mirror the SQL)
    metrics.ts             all % and score formulas
    permissions.ts         role rules (mirrored in SQL RLS)
    auth.tsx hooks.ts workspace.ts format.ts
supabase/migrations/       schema, RLS, triggers, storage, realtime
scripts/seed-supabase.ts   demo data → Supabase
docs/                      ARCHITECTURE, MIGRATION, ROADMAP
```

## 5. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | TypeScript check |
| `npm run seed:supabase` | Seed Supabase with demo team |
| `npm run import:exports -- <folder> [--apply]` | Merge everyone's demo exports into Supabase |

## 6. Honest limits (read before production)

- **Selfie = evidence, not verification.** It deters proxy attendance; it does not prove identity. Face-match is on the roadmap.
- **GPS is browser-reported** and can be spoofed, so geofencing (Settings → Attendance) raises the bar but is not proof.
- **Demo mode has no security and no shared database.** Each browser keeps its own copy. A manager cannot see a member's check-in made on the member's phone. Use Supabase mode for real people.
- Times use the device clock in demo mode. In Supabase mode, migration 0003 makes the database clock decide check-in/out, break times and late status.
- Selfies are personal data. Tell employees what is captured, why, who can see it and how long it's kept (India DPDP Act 2023). Set a retention policy for the `selfies` bucket.


## 7. Moving a live demo-mode team to Supabase (no data loss)

1. Do **not** clear browser data. Upgrading to v3 keeps the same storage key and upgrades in place (a backup is kept under `zlaqa_os_demo_v2_backup_v2`).
2. Each person, on the device they check in from: **Profile → Export my data**. Collect the `.json` files in one folder. The Super Admin exports too (org settings, OKRs and people come from that file).
3. Create the Supabase project and run the migrations (section 2).
4. `.env.local`: add `IMPORT_TEMP_PASSWORD=<8+ chars>`.
5. `npm run import:exports -- ./exports` → read the report. It lists anyone who has not exported yet.
6. `npm run import:exports -- ./exports --apply`. Sample `*@zlaqa.demo` people are dropped unless you pass `--keep-demo`.
7. Switch `NEXT_PUBLIC_DATA_MODE=supabase`, redeploy, share the temporary password privately, ask everyone to change it in Profile.
