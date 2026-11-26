// Upgrades data saved by an older version (v1/v2) to the v3 shape, IN PLACE.
// Nothing is deleted or reset: missing fields get safe defaults, new tables start
// with a starter library. Used by the demo adapter on every load (cheap, idempotent).
import type { KpiDefinition, OrgSettings, Tracking, TrackingPreset, WidgetId } from '../types';
import { DEFAULT_TRACKING } from '../types';
import { defaultSettings } from './seed';
import { uuid } from '../format';

export const DATA_VERSION = 3;

type Row = Record<string, unknown>;
type DB = Record<string, unknown> & { _v?: number };

/** Deep-merge saved settings over today's defaults, so new switches exist without overwriting choices. */
export function normalizeSettings(st: Partial<OrgSettings> | null | undefined): OrgSettings {
  const def = defaultSettings();
  if (!st) return def;
  const weights = st.performance_weights ? Object.assign({ kpi: 0 }, st.performance_weights) : def.performance_weights;
  return {
    ...def,
    ...st,
    modules: { ...def.modules, ...(st.modules ?? {}) },
    break_limits: { ...def.break_limits, ...(st.break_limits ?? {}) },
    performance_weights: weights as OrgSettings['performance_weights'],
    dashboard_widgets: { ...def.dashboard_widgets, ...(st.dashboard_widgets ?? {}) },
    leave_quota: { ...def.leave_quota, ...(st.leave_quota ?? {}) },
  } as OrgSettings;
}

export function starterPresets(now: string): TrackingPreset[] {
  const p = (name: string, description: string, t: Partial<Tracking>): TrackingPreset => ({
    id: uuid(), name, description, tracking: { attendance: false, okrs: false, kpis: false, tasks: false, daily_log: false, ...t }, active: true, created_at: now,
  });
  return [
    p('KPI role', 'Roles with measurable targets', { attendance: true, okrs: true, kpis: true, tasks: true, daily_log: true }),
    p('OKR + daily log', 'Goals plus a daily log of what they did', { attendance: true, okrs: true, tasks: true, daily_log: true }),
    p('Daily log only', 'Show up and log the day', { attendance: true, tasks: true, daily_log: true }),
    p('Remote · no attendance', 'Goals and log, no check-in', { okrs: true, tasks: true, daily_log: true }),
    p('Attendance only', 'Check-in only', { attendance: true }),
  ];
}

export function starterKpis(now: string, by: string): KpiDefinition[] {
  const k = (name: string, unit: string, period: KpiDefinition['period'], source: KpiDefinition['source'], default_target: number, description: string): KpiDefinition => ({
    id: uuid(), name, description, unit, direction: 'up', period, source, aggregate: 'sum', default_target, department_id: null, active: true, created_by: by, created_at: now,
  });
  return [
    k('Attendance', '%', 'monthly', 'attendance_pct', 95, 'Auto: days present ÷ working days'),
    k('On-time check-ins', '%', 'monthly', 'punctuality_pct', 90, 'Auto: on-time days ÷ days present'),
    k('Tasks completed', 'tasks', 'weekly', 'tasks_done', 8, 'Auto: tasks marked done this week'),
    k('Daily log entries', 'entries', 'weekly', 'daily_log_entries', 10, 'Auto: items added to My Day'),
    k('Average hours per day', 'h', 'weekly', 'avg_work_hours', 8, 'Auto: from check-in and check-out'),
    k('Calls made', 'calls', 'weekly', 'manual', 20, 'Logged by the person'),
    k('Posts published', 'posts', 'weekly', 'manual', 5, 'Logged by the person'),
  ];
}

const fill = (rows: unknown, defaults: (r: Row) => Row) => {
  if (!Array.isArray(rows)) return;
  for (const r of rows as Row[]) {
    const d = defaults(r);
    for (const [k, v] of Object.entries(d)) if (r[k] === undefined) r[k] = v;
  }
};

/** Returns true when anything changed (so the caller can save). */
export function upgradeDemo(db: DB): boolean {
  if ((db._v ?? 2) >= DATA_VERSION) return false;
  const now = new Date().toISOString();
  const tables = ['tracking_presets', 'kpi_definitions', 'kpi_assignments', 'kpi_entries', 'task_comments', 'announcement_reads', 'holidays', 'kudos', 'notifications', 'calendar_events'];
  const fresh = new Set(tables.filter((t) => !Array.isArray(db[t])));
  for (const t of tables) if (!Array.isArray(db[t])) db[t] = [];

  const superAdmin = ((db.profiles as Row[]) ?? []).find((p) => p.role === 'super_admin');
  if (fresh.has('tracking_presets')) db.tracking_presets = starterPresets(now);
  if (fresh.has('kpi_definitions')) db.kpi_definitions = starterKpis(now, String(superAdmin?.id ?? ''));

  fill(db.profiles, () => ({ tracking: { ...DEFAULT_TRACKING }, preset_id: null }));
  fill(db.departments, () => ({ default_preset_id: null }));
  fill(db.okr_templates, () => ({ active: true }));
  fill(db.tasks, (r) => ({ self_added: false, log_date: null, minutes: 0, completed_at: r.status === 'done' ? r.created_at : null }));
  fill(db.announcements, () => ({ priority: 'normal', require_ack: false, poll_options: [] }));
  fill(db.attendance, () => ({ plan: '', summary: '', mood: null }));

  const settings = (db.org_settings as Row[] | undefined)?.[0] as Partial<OrgSettings> | undefined;
  if (settings) {
    const n = normalizeSettings(settings);
    // one-time: surface the new widgets on dashboards that were saved before v3
    const add = (role: keyof OrgSettings['dashboard_widgets'], ids: WidgetId[], at = 1) => {
      const list = n.dashboard_widgets[role] ?? [];
      const missing = ids.filter((w) => !list.includes(w));
      n.dashboard_widgets[role] = [...list.slice(0, at), ...missing, ...list.slice(at)];
    };
    add('super_admin', ['must_read', 'team_kpis', 'team_log']);
    add('admin', ['must_read', 'team_kpis', 'team_log']);
    add('member', ['must_read', 'my_day', 'my_kpis']);
    (db.org_settings as Row[])[0] = n as unknown as Row;
  }
  db._v = DATA_VERSION;
  return true;
}
