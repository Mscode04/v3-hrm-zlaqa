// KPI engine: periods, actual values (manual entries or auto from app data), achievement %.
import type { Attendance, Holiday, KeyResult, KpiAssignment, KpiDefinition, KpiEntry, KpiPeriod, Kudos, Objective, OrgSettings, Task } from './types';
import { addDays, clamp, toDateStr } from './format';
import { krsOf, objectiveProgress, workingDays } from './metrics';

export interface Range {
  start: string; // YYYY-MM-DD inclusive
  end: string; // YYYY-MM-DD inclusive
  label: string;
}

export function periodRange(period: KpiPeriod, ref = new Date(), offset = 0): Range {
  const d = new Date(ref);
  d.setHours(0, 0, 0, 0);
  if (period === 'daily') {
    const x = addDays(d, offset);
    return { start: toDateStr(x), end: toDateStr(x), label: offset === 0 ? 'Today' : x.toLocaleDateString([], { day: 'numeric', month: 'short' }) };
  }
  if (period === 'weekly') {
    const s = addDays(d, -((d.getDay() + 6) % 7) + 7 * offset);
    const e = addDays(s, 6);
    return { start: toDateStr(s), end: toDateStr(e), label: offset === 0 ? 'This week' : `Week of ${s.toLocaleDateString([], { day: 'numeric', month: 'short' })}` };
  }
  const s = new Date(d.getFullYear(), d.getMonth() + offset, 1);
  const e = new Date(d.getFullYear(), d.getMonth() + offset + 1, 0);
  return { start: toDateStr(s), end: toDateStr(e), label: offset === 0 ? 'This month' : s.toLocaleDateString([], { month: 'long' }) };
}

export interface KpiData {
  attendance: Attendance[];
  tasks: Task[];
  objectives: Objective[];
  krs: KeyResult[];
  kudos: Kudos[];
  entries: KpiEntry[];
  holidays: Holiday[];
}

const inRange = (d: string | null | undefined, r: Range) => !!d && d.slice(0, 10) >= r.start && d.slice(0, 10) <= r.end;

/** The measured value of one assignment in one period. null = no data yet. */
export function kpiActual(a: KpiAssignment, def: KpiDefinition, data: KpiData, r: Range, settings: OrgSettings): number | null {
  const uid = a.user_id;
  switch (def.source) {
    case 'manual': {
      const es = data.entries.filter((e) => e.assignment_id === a.id && e.period_start >= r.start && e.period_start <= r.end).sort((x, y) => x.created_at.localeCompare(y.created_at));
      if (!es.length) return null;
      return def.aggregate === 'latest' ? Number(es[es.length - 1].value) : es.reduce((s, e) => s + Number(e.value), 0);
    }
    case 'attendance_pct':
    case 'punctuality_pct': {
      const today = toDateStr(new Date());
      const end = r.end < today ? r.end : today;
      const hol = new Set(data.holidays.map((h) => h.date));
      const days = workingDays(new Date(r.start + 'T00:00:00'), new Date(end + 'T00:00:00'), settings.weekly_off, hol);
      const mine = data.attendance.filter((x) => x.user_id === uid && x.check_in && inRange(x.date, { ...r, end }));
      if (def.source === 'attendance_pct') {
        const counted = days.filter((d) => d !== today || mine.some((m) => m.date === today)).length;
        return counted ? clamp((mine.reduce((s, m) => s + (m.status === 'half_day' ? 0.5 : 1), 0) / counted) * 100) : null;
      }
      return mine.length ? clamp((mine.filter((m) => m.status !== 'late').length / mine.length) * 100) : null;
    }
    case 'tasks_done':
      return data.tasks.filter((t) => t.assignee_id === uid && t.status === 'done' && inRange(t.completed_at ?? t.created_at, r)).length;
    case 'task_completion_pct': {
      const ts = data.tasks.filter((t) => t.assignee_id === uid && (inRange(t.due_date, r) || inRange(t.log_date, r)));
      return ts.length ? (ts.filter((t) => t.status === 'done').length / ts.length) * 100 : null;
    }
    case 'avg_work_hours': {
      const closed = data.attendance.filter((x) => x.user_id === uid && x.check_out && inRange(x.date, r));
      return closed.length ? Math.round((closed.reduce((s, x) => s + x.work_minutes, 0) / closed.length / 60) * 10) / 10 : null;
    }
    case 'okr_progress': {
      const objs = data.objectives.filter((o) => o.owner_id === uid && o.cycle === settings.current_cycle);
      return objs.length ? objs.reduce((s, o) => s + objectiveProgress(krsOf(o.id, data.krs)), 0) / objs.length : null;
    }
    case 'kudos_received':
      return data.kudos.filter((k) => k.to_id === uid && inRange(k.created_at, r)).length;
    case 'daily_log_entries':
      return data.tasks.filter((t) => t.assignee_id === uid && t.self_added && inRange(t.log_date, r)).length;
  }
}

/** % of target reached. Lower-is-better KPIs invert. Not capped (shows over-achievement). */
export function achievement(actual: number | null, target: number, direction: 'up' | 'down'): number | null {
  if (actual === null) return null;
  if (direction === 'down') return actual <= 0 ? 100 : (target / actual) * 100;
  return target > 0 ? (actual / target) * 100 : 100;
}

export function fmtKpi(v: number | null, unit: string) {
  if (v === null) return '—';
  const n = Math.round(v * 10) / 10;
  return unit === '%' ? `${Math.round(n)}%` : `${n.toLocaleString()}${unit ? ' ' + unit : ''}`;
}

/** Weighted KPI score (0-100, each KPI capped at 100) for one person, current periods. null = no KPIs. */
export function kpiScore(uid: string, assignments: KpiAssignment[], defs: KpiDefinition[], data: KpiData, settings: OrgSettings): number | null {
  const mine = assignments.filter((a) => a.user_id === uid && a.active);
  let tw = 0, sum = 0;
  for (const a of mine) {
    const d = defs.find((x) => x.id === a.kpi_id);
    if (!d) continue;
    const ach = achievement(kpiActual(a, d, data, periodRange(d.period), settings), a.target, d.direction);
    if (ach === null) continue;
    const w = a.weight || 1;
    tw += w;
    sum += Math.min(100, ach) * w;
  }
  return tw ? sum / tw : null;
}

export function kpiTone(ach: number | null): 'green' | 'amber' | 'red' | 'neutral' {
  if (ach === null) return 'neutral';
  return ach >= 90 ? 'green' : ach >= 60 ? 'amber' : 'red';
}
