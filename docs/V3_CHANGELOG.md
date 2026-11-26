# Team OS v3: what changed

Built on v2. Same storage key, upgraded in place. No reset.

## Track different things for different people
- **What we track** per person: Attendance, OKRs, KPIs, Tasks board, Daily log. Employees → Edit.
- **Tracking presets** (Settings → Tracking presets): KPI role, OKR + daily log, Daily log only, Remote · no attendance, Attendance only. Make your own, switch them on or off.
- **Department default preset**: new people get it automatically.
- **Bulk apply**: tick people in Employees, pick a preset, Apply.
- Anything switched off is hidden for that person and left out of their score (other weights scale up).

## KPIs (`/kpis`)
- Period: daily, weekly or monthly. Direction: higher or lower is better.
- **Manual** (log a number; entries add up or use the latest) or **Auto** from app data: attendance %, on-time %, tasks done, task completion %, average hours, OKR progress, kudos received, daily log entries.
- Library with on/off, team matrix, assign modal with target and weight, 6-period trend bars.
- KPI weight in Settings → Performance (starts at 0 on upgraded data, so existing scores do not move until you change it).

## My Day (`/today`)
- Add unplanned work in one tap, with optional time spent. No approval.
- Managers: Team log by date, “Quiet” badge, comments that notify the person.
- Self-added items also show on the Tasks board with an “Added by …” badge and a filter.

## Switches everywhere
- Settings → **Features**: 15 switches in 4 groups (Daily work, Goals & growth, Team, Extras). Menu, dashboard cards and guides follow them.
- **OKR templates on/off**. Off templates are hidden from Apply.

## Announcements
- Priority: Normal, Important, Urgent. Optional “I have read this”.
- “Read by X of Y”, list of who has not read, one-tap reminder.
- Reactions 👍 ❤️ 🎉 👏 and polls (2 to 6 options, change your vote).
- Must-read strip at the top of the dashboard. Notifications on publish.

## Dashboards
- New cards: Must read, My day, My KPIs, Team KPIs, Today's team log.
- Cards hide automatically when the feature is off or not tracked for that person.

## Guides inside the app
- **?** button on every page: short steps, plus a “For managers” box.
- First-visit tip strip per page (dismiss once).
- Role-aware onboarding tour on first login (only shows steps for what is on for you).
- **Help center** (`/help`): search, FAQ, replay tour, show tips again.
- All controlled by the Guides and Onboarding tour switches.

## Phone first
- Bottom tabs adapt per person: Home, Today, Attend (or My Day for people without attendance), KPIs or Chat, More.
- 16px inputs (no iOS zoom), cleaner top bar, swipeable task columns, card lists for Employees, floating + button.
- People without attendance see a friendly “not tracked for you” screen instead of a check-in button.

## Analytics (`/analytics`)
- Period and department filters, 8 tiles, daily attendance, score by department, tracking coverage, lowest scores. CSV export.

## Data and migration
- `supabase/migrations/0004_v3_kpis_tracking.sql`: additive only. New tables, new columns, RLS, audit, realtime. Members cannot change their own tracking.
- Demo upgrade: `upgradeDemo()` fills new tables and defaults, keeps every row, saves a backup key.
- **Profile → Export my data** (demo mode) incl. own selfies.
- `scripts/import-demo-exports.ts`: merges every export, trusts each person's own rows, one attendance row per person per day, creates logins, uploads selfies, drops sample people.
