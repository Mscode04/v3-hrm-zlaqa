# /kpis · KPIs

**Purpose:** Recurring targets per day, week or month. Manual numbers or auto from app data.

**Tabs:** My KPIs (cards, Log sheet, 6-period trend) · Team (matrix per person, remove) · Library (create, edit, on/off).

**Access:** Members see My KPIs only if *KPIs* is switched on for them. Managers assign to their team; Super Admin everywhere. Managers can only edit KPIs of their department.

**Maths:** `src/lib/kpi.ts`. Achievement = actual/target (or target/actual when lower is better), capped at 100% per KPI in the score. KPI score = weighted average. Weekly periods start Monday.

**Data:** `kpi_definitions`, `kpi_assignments`, `kpi_entries`.

**Toggle:** Settings → Features → KPIs. Weight: Settings → Performance.
