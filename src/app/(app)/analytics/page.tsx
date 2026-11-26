'use client';
import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { statsOf, useWorkspace } from '@/lib/workspace';
import { managedTeam } from '@/lib/permissions';
import { workingDays } from '@/lib/metrics';
import { addDays, downloadCSV, fmtMinutes, todayStr } from '@/lib/format';
import { TRACKING_KEYS } from '@/lib/types';
import { Button, Card, PageHeader, PageSkeleton, RequireRole, Select, Stat } from '@/components/ui';
import { Bars, HBars } from '@/components/bits';

const avg = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null;
};
const show = (v: number | null) => (v === null ? '–' : `${Math.round(v)}%`);

function Analytics() {
  const { me, settings } = useMe();
  const [days, setDays] = useState(30);
  const [dept, setDept] = useState('');
  const ws = useWorkspace(Math.max(days, 30), settings.current_cycle);

  const people = useMemo(
    () => managedTeam(me, ws.profiles).filter((p) => p.status === 'active' && (!dept || p.department_id === dept)),
    [me, ws.profiles, dept],
  );
  const stats = useMemo(() => people.map((p) => ({ p, s: statsOf(ws, p, settings, days) })), [people, ws, settings, days]);

  if (ws.loading) return <PageSkeleton />;

  const att = stats.filter((x) => x.s.tracks.attendance);
  const tiles = {
    attendance: avg(att.map((x) => x.s.attendancePct)),
    punctuality: avg(att.map((x) => x.s.punctualityPct)),
    hours: avg(att.map((x) => x.s.avgWorkMinutes || null)),
    okrs: avg(stats.filter((x) => x.s.tracks.okrs).map((x) => x.s.okrPct)),
    kpis: avg(stats.filter((x) => x.s.tracks.kpis).map((x) => x.s.kpiPct)),
    tasks: avg(stats.filter((x) => x.s.tracks.tasks).map((x) => x.s.taskPct)),
    score: avg(stats.map((x) => x.s.score)),
  };

  const ids = new Set(att.map((x) => x.p.id));
  const wd = workingDays(addDays(new Date(), -days), new Date(), settings.weekly_off).slice(-Math.min(days, 30));
  const trend = wd.map((d) => ({
    label: d,
    short: d.slice(8),
    value: ids.size ? (ws.attendance.filter((a) => a.date === d && ids.has(a.user_id) && a.check_in).length / ids.size) * 100 : 0,
  }));

  const byDept = ws.departments
    .map((d) => {
      const xs = stats.filter((x) => x.p.department_id === d.id);
      return { label: d.name, value: avg(xs.map((x) => x.s.score)) ?? 0, n: xs.length, color: d.color };
    })
    .filter((d) => d.n);

  const coverage = TRACKING_KEYS.map((k) => ({ label: k.label, value: people.length ? (people.filter((p) => p.tracking?.[k.key]).length / people.length) * 100 : 0 }));

  const since = addDays(new Date(), -days).toISOString().slice(0, 10);
  const log = ws.tasks.filter((t) => t.self_added && t.log_date && t.log_date >= since && people.some((p) => p.id === t.assignee_id));
  const logMins = log.reduce((s, t) => s + (t.minutes || 0), 0);

  function exportCsv() {
    downloadCSV(`zlaqa-analytics-${todayStr()}.csv`, [
      ['Name', 'Attendance %', 'Punctuality %', 'Avg work', 'OKR %', 'KPI %', 'Task %', 'Score'],
      ...stats.map(({ p, s }) => [
        p.full_name,
        s.tracks.attendance ? Math.round(s.attendancePct) : '',
        s.tracks.attendance ? Math.round(s.punctualityPct) : '',
        s.tracks.attendance ? fmtMinutes(s.avgWorkMinutes) : '',
        s.okrPct === null ? '' : Math.round(s.okrPct),
        s.kpiPct === null ? '' : Math.round(s.kpiPct),
        s.taskPct === null ? '' : Math.round(s.taskPct),
        Math.round(s.score),
      ]),
    ]);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        subtitle={`${people.length} people · last ${days} days. Only what is tracked for each person is counted.`}
        actions={
          <Button variant="secondary" size="sm" onClick={exportCsv}>
            <Download size={15} /> CSV
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))} className="w-auto">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </Select>
        <Select value={dept} onChange={(e) => setDept(e.target.value)} className="w-auto">
          <option value="">All departments</option>
          {ws.departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="stagger grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Score" value={show(tiles.score)} tone="brand" />
        <Stat label="Attendance" value={show(tiles.attendance)} sub={`${att.length} tracked`} tone="green" />
        <Stat label="On time" value={show(tiles.punctuality)} />
        <Stat label="Avg day" value={tiles.hours ? fmtMinutes(tiles.hours) : '–'} />
        <Stat label="OKRs" value={show(tiles.okrs)} tone="violet" />
        <Stat label="KPIs" value={show(tiles.kpis)} tone="teal" />
        <Stat label="Tasks" value={show(tiles.tasks)} />
        <Stat label="Self-logged work" value={log.length} sub={logMins ? fmtMinutes(logMins) : 'items'} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Daily attendance" className="lg:col-span-2">
          {trend.length ? <Bars data={trend} /> : <p className="text-sm text-neutral-500">No working days in range.</p>}
        </Card>
        <Card title="Score by department">{byDept.length ? <HBars data={byDept} /> : <p className="text-sm text-neutral-500">No data.</p>}</Card>
        <Card title="What we track (share of people)">
          <HBars data={coverage} />
        </Card>
        <Card title="Lowest scores (who may need support)" className="lg:col-span-2">
          <div className="divide-y divide-neutral-100">
            {[...stats]
              .sort((a, b) => a.s.score - b.s.score)
              .slice(0, 6)
              .map(({ p, s }) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="truncate">{p.full_name}</span>
                  <span className="flex gap-3 text-xs tabular-nums text-neutral-500">
                    {s.tracks.attendance && <span>Att {Math.round(s.attendancePct)}%</span>}
                    {s.okrPct !== null && <span>OKR {Math.round(s.okrPct)}%</span>}
                    {s.kpiPct !== null && <span>KPI {Math.round(s.kpiPct)}%</span>}
                    <span className="font-semibold text-neutral-800">{Math.round(s.score)}</span>
                  </span>
                </div>
              ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  return (
    <RequireRole roles={['super_admin', 'admin']}>
      <Analytics />
    </RequireRole>
  );
}
