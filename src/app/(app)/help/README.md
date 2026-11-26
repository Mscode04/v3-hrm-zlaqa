# /help · Help center

**Purpose:** Searchable guides for every page, FAQ, replay the onboarding tour, show page tips again.

**Content:** `src/lib/guides.ts` (one entry per route: tip, steps, manager notes). The same content powers the **?** sheet in the top bar and the first-visit tip strip. UI: `src/components/Guides.tsx`.

**Edit copy:** change `GUIDES` / `FAQ` in `src/lib/guides.ts`. No database.

**Toggles:** Settings → Features → In-app guides, Onboarding tour.
