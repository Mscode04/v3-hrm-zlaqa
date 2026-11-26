'use client';
// One hook that loads the data most overview pages need.
import { useMemo } from 'react';
import { useTable } from './hooks';
import { addDays, startOfToday, toDateStr } from './format';
import { userStats } from './metrics';
import { kpiScore, type KpiData } from './kpi';
import type { OrgSettings, Profile } from './types';

export function useWorkspace(days = 30, cycle?: string) {
  const since = useMemo(() => toDateStr(addDays(new Date(), -days)), [days]);
  const todayIso = useMemo(() => startOfToday().toISOString(), []);
  const profiles = useTable('profiles', { order: ['full_name', 'asc'] });
  const departments = useTable('departments', { order: ['name', 'asc'] });
  const attendance = useTable('attendance', { gte: ['date', since] });
  const breaks = useTable('breaks', { gte: ['start_at', todayIso] });
  const objectives = useTable('objectives', cycle ? { filter: { cycle } } : undefined);
  const krs = useTable('key_results');
  const tasks = useTable('tasks');
  const leaves = useTable('leave_requests', { order: ['created_at', 'desc'] });
  const holidays = useTable('holidays', { order: ['date', 'asc'] });
  const kudos = useTable('kudos', { order: ['created_at', 'desc'], limit: 200 });
  const kpiDefs = useTable('kpi_definitions', { order: ['name', 'asc'] });
  const kpiAssignments = useTable('kpi_assignments');
  const kpiSince = useMemo(() => toDateStr(addDays(new Date(), -100)), []);
  const kpiEntries = useTable('kpi_entries', { gte: ['period_start', kpiSince] });
  const loading = profiles.loading || attendance.loading;
  return {
    loading,
    profiles: profiles.rows,
    departments: departments.rows,
    attendance: attendance.rows,
    breaks: breaks.rows,
    objectives: objectives.rows,
    krs: krs.rows,
    tasks: tasks.rows,
    leaves: leaves.rows,
    holidays: holidays.rows,
    kudos: kudos.rows,
    kpiDefs: kpiDefs.rows,
    kpiAssignments: kpiAssignments.rows,
    kpiEntries: kpiEntries.rows,
    reload: { attendance: attendance.reload, breaks: breaks.reload, leaves: leaves.reload, tasks: tasks.reload, kpi: kpiEntries.reload },
  };
}
export type Workspace = ReturnType<typeof useWorkspace>;

export function kpiDataOf(ws: Workspace): KpiData {
  return { attendance: ws.attendance, tasks: ws.tasks, objectives: ws.objectives, krs: ws.krs, kudos: ws.kudos, entries: ws.kpiEntries, holidays: ws.holidays };
}

/** Full stats for one person, including KPI achievement and their tracking switches. */
export function statsOf(ws: Workspace, p: Profile, settings: OrgSettings, days = 30) {
  const kpiPct = kpiScore(p.id, ws.kpiAssignments, ws.kpiDefs, kpiDataOf(ws), settings);
  return userStats(p, { attendance: ws.attendance, objectives: ws.objectives, krs: ws.krs, tasks: ws.tasks, leaves: ws.leaves, holidays: ws.holidays, kpiPct }, settings, days);
}
