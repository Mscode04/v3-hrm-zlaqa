'use client';
import { useEffect, useMemo, useState } from 'react';
import { Gauge, Pencil, Plus, Trash2, Zap } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/data';
import { useWorkspace, kpiDataOf } from '@/lib/workspace';
import { has } from '@/lib/features';
import { isAdminOrAbove, isSuper, managedTeam } from '@/lib/permissions';
import { achievement, fmtKpi, kpiActual, kpiScore, kpiTone, periodRange } from '@/lib/kpi';
import type { KpiAssignment, KpiDefinition } from '@/lib/types';
import { Avatar, Badge, Button, Card, Empty, Input, PageHeader, PageSkeleton, Switch, Tabs, cn } from '@/components/ui';
import { AssignKpiModal, KpiCard, KpiDefModal, LogKpiSheet } from '@/components/kpi';

type Tab = 'mine' | 'team' | 'library';

const toneText = { green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15', amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15', red: 'bg-rose-50 text-rose-700 dark:bg-rose-500/15', neutral: 'bg-neutral-50 text-neutral-400' };

export default function KpisPage() {
  const { me, settings } = useMe();
  const ws = useWorkspace(100);
  const manager = isAdminOrAbove(me);
  const mineOn = has(me, settings, 'kpis');
  const [tab, setTab] = useState<Tab>(mineOn ? 'mine' : 'team');
  const [log, setLog] = useState<KpiAssignment | null>(null);
  const [assign, setAssign] = useState(false);
  const [edit, setEdit] = useState<Partial<KpiDefinition> | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && (t === 'mine' || manager)) setTab(t);
  }, [manager]);

  const data = kpiDataOf(ws);
  const team = useMemo(() => managedTeam(me, ws.profiles).filter((p) => p.status === 'active'), [me, ws.profiles]);
  const defOf = (id: string) => ws.kpiDefs.find((d) => d.id === id);
  const mine = ws.kpiAssignments.filter((a) => a.user_id === me.id && a.active);
  const myScore = kpiScore(me.id, ws.kpiAssignments, ws.kpiDefs, data, settings);

  if (ws.loading) return <PageSkeleton />;

  const tabs: { id: Tab; label: string }[] = [
    ...(mineOn ? [{ id: 'mine' as Tab, label: 'My KPIs' }] : []),
    ...(manager ? [{ id: 'team' as Tab, label: 'Team' }, { id: 'library' as Tab, label: `Library (${ws.kpiDefs.length})` }] : []),
  ];

  const canEditDef = (d: KpiDefinition) => isSuper(me) || (me.role === 'admin' && (d.department_id === me.department_id || d.created_by === me.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="KPIs"
        subtitle="Recurring targets per day, week or month. Manual numbers or auto from the app."
        actions={
          manager && (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setEdit({})}>
                <Plus size={15} /> New KPI
              </Button>
              <Button size="sm" onClick={() => setAssign(true)}>
                <Gauge size={15} /> Assign
              </Button>
            </div>
          )
        }
      />
      {tabs.length > 1 && <Tabs<Tab> value={tab} onChange={setTab} tabs={tabs} />}

      {tab === 'mine' && (
        <>
          {!mineOn ? (
            <Empty text="KPIs are not switched on for you." />
          ) : mine.length ? (
            <>
              <Card>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                  <div>
                    <div className="whitespace-nowrap text-sm text-neutral-500">KPI score this period</div>
                    <div className="text-3xl font-semibold tabular-nums">{myScore === null ? '–' : `${Math.round(myScore)}%`}</div>
                  </div>
                  <p className="max-w-xs text-xs text-neutral-500 sm:text-right">Weighted average of your KPIs. Each KPI counts up to 100%. Tap Log on a manual KPI to add a number.</p>
                </div>
              </Card>
              <div className="stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {mine.map((a) => {
                  const d = defOf(a.kpi_id);
                  return d ? <KpiCard key={a.id} a={a} def={d} data={data} settings={settings} onLog={() => setLog(a)} /> : null;
                })}
              </div>
            </>
          ) : (
            <Empty text="No KPIs assigned to you yet. Your manager will add them." icon={<Gauge />} />
          )}
        </>
      )}

      {tab === 'team' && manager && (
        <div className="space-y-4">
          <Input placeholder="Search people" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:max-w-sm" />
          <div className="grid gap-4 md:grid-cols-2">
            {team
              .filter((p) => p.tracking?.kpis)
              .filter((p) => !q || p.full_name.toLowerCase().includes(q.toLowerCase()))
              .map((p) => {
                const as = ws.kpiAssignments.filter((a) => a.user_id === p.id && a.active);
                const score = kpiScore(p.id, ws.kpiAssignments, ws.kpiDefs, data, settings);
                return (
                  <Card key={p.id}>
                    <div className="mb-3 flex items-center gap-3">
                      <Avatar name={p.full_name} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.full_name}</div>
                        <div className="text-xs text-neutral-500">{as.length} KPIs</div>
                      </div>
                      <span className={cn('rounded-full px-2.5 py-1 text-sm font-semibold tabular-nums', toneText[kpiTone(score)])}>{score === null ? '–' : `${Math.round(score)}%`}</span>
                    </div>
                    <div className="space-y-1.5">
                      {as.map((a) => {
                        const d = defOf(a.kpi_id);
                        if (!d) return null;
                        const actual = kpiActual(a, d, data, periodRange(d.period), settings);
                        const ach = achievement(actual, a.target, d.direction);
                        return (
                          <div key={a.id} className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm hover:bg-neutral-50">
                            <span className="min-w-0 flex-1 truncate">
                              {d.name} {d.source !== 'manual' && <Zap size={11} className="inline text-teal-600" />}
                            </span>
                            <span className="text-xs tabular-nums text-neutral-500">
                              {fmtKpi(actual, d.unit)} / {fmtKpi(a.target, d.unit)}
                            </span>
                            <span className={cn('w-12 rounded-md px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums', toneText[kpiTone(ach)])}>{ach === null ? '–' : `${Math.round(ach)}%`}</span>
                            {d.source === 'manual' && (
                              <button onClick={() => setLog(a)} className="rounded-md px-1.5 text-xs text-neutral-500 underline">
                                log
                              </button>
                            )}
                            <button
                              onClick={() => confirm(`Remove “${d.name}” from ${p.full_name}?`) && db.update('kpi_assignments', a.id, { active: false })}
                              className="rounded-md p-1 text-neutral-300 hover:text-rose-600"
                              aria-label="Remove KPI"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        );
                      })}
                      {!as.length && <p className="py-2 text-sm text-neutral-500">No KPIs assigned yet.</p>}
                    </div>
                  </Card>
                );
              })}
          </div>
          {team.filter((p) => !p.tracking?.kpis).length > 0 && (
            <p className="text-xs text-neutral-500">
              Not on KPIs: {team.filter((p) => !p.tracking?.kpis).map((p) => p.full_name.split(' ')[0]).join(', ')}. Switch KPIs on per person in Employees.
            </p>
          )}
        </div>
      )}

      {tab === 'library' && manager && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {ws.kpiDefs.map((d) => {
            const used = ws.kpiAssignments.filter((a) => a.kpi_id === d.id && a.active).length;
            const dept = ws.departments.find((x) => x.id === d.department_id);
            return (
              <Card key={d.id} className={cn(!d.active && 'opacity-60')}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">{d.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {d.source === 'manual' ? <Badge>Manual</Badge> : <Badge tone="teal">Auto</Badge>}
                      <Badge>{d.period}</Badge>
                      <Badge tone="violet">{dept?.name ?? 'Any dept'}</Badge>
                    </div>
                  </div>
                  {canEditDef(d) && (
                    <button onClick={() => setEdit(d)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100" aria-label="Edit">
                      <Pencil size={15} />
                    </button>
                  )}
                </div>
                {d.description && <p className="mt-2 line-clamp-2 text-sm text-neutral-500">{d.description}</p>}
                <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                  <span>
                    Target {fmtKpi(d.default_target, d.unit)} · {used} using
                  </span>
                  {canEditDef(d) && <Switch checked={d.active} onChange={(v) => db.update('kpi_definitions', d.id, { active: v })} label={d.active ? 'Active' : 'Inactive'} />}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {log && defOf(log.kpi_id) && <LogKpiSheet a={log} def={defOf(log.kpi_id)!} me={me} onClose={() => { setLog(null); ws.reload.kpi(); }} />}
      {assign && <AssignKpiModal defs={ws.kpiDefs} people={team} me={me} existing={ws.kpiAssignments} onClose={() => setAssign(false)} />}
      {edit && <KpiDefModal initial={edit} departments={ws.departments} me={me} onClose={() => setEdit(null)} />}
    </div>
  );
}
