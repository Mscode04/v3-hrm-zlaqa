'use client';
import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ListChecks } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { useWorkspace } from '@/lib/workspace';
import { has } from '@/lib/features';
import { isAdminOrAbove, managedTeam } from '@/lib/permissions';
import { addDays, fmtDay, fmtMinutes, parseDate, toDateStr, todayStr } from '@/lib/format';
import type { Task } from '@/lib/types';
import { Avatar, Badge, Card, Empty, Input, PageHeader, PageSkeleton, Stat, Tabs } from '@/components/ui';
import { CommentsSheet, QuickAdd, TaskRow, dayItems } from '@/components/daylog';

type Tab = 'me' | 'team';

export default function TodayPage() {
  const { me, settings } = useMe();
  const ws = useWorkspace(14);
  const manager = isAdminOrAbove(me);
  const [tab, setTab] = useState<Tab>('me');
  const [date, setDate] = useState(todayStr());
  const [q, setQ] = useState('');
  const [comments, setComments] = useState<Task | null>(null);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'team' && manager) setTab('team');
  }, [manager]);

  const team = useMemo(() => managedTeam(me, ws.profiles).filter((p) => p.id !== me.id && p.status === 'active'), [me, ws.profiles]);
  const mine = dayItems(ws.tasks, me.id, date);
  const myDone = mine.filter((t) => t.status === 'done').length;
  const myMins = mine.reduce((s, t) => s + (t.minutes || 0), 0);
  const isToday = date === todayStr();
  const shift = (n: number) => setDate(toDateStr(addDays(parseDate(date), n)));
  const canLog = has(me, settings, 'daily_log');

  if (ws.loading) return <PageSkeleton />;

  const dayNav = (
    <div className="flex items-center gap-1 rounded-xl border border-neutral-200 bg-surface p-1">
      <button onClick={() => shift(-1)} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-100" aria-label="Previous day">
        <ChevronLeft size={18} />
      </button>
      <span className="min-w-28 text-center text-sm font-medium">{isToday ? 'Today' : fmtDay(date)}</span>
      <button onClick={() => shift(1)} disabled={isToday} className="grid h-9 w-9 place-items-center rounded-lg hover:bg-neutral-100 disabled:opacity-30" aria-label="Next day">
        <ChevronRight size={18} />
      </button>
    </div>
  );

  return (
    <div className="space-y-5">
      <PageHeader title="My Day" subtitle="Log what you actually work on, planned or unplanned. No approval needed." actions={dayNav} />
      {manager && (
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'me', label: 'My log' },
            { id: 'team', label: `Team log (${team.length})` },
          ]}
        />
      )}

      {tab === 'me' && (
        <div className="grid gap-5 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            {canLog ? (
              <Card>
                <QuickAdd me={me} date={date} />
              </Card>
            ) : (
              <Card>
                <p className="text-sm text-neutral-500">Daily log is switched off for you. Ask your manager if you need it.</p>
              </Card>
            )}
            <div className="space-y-2">
              {mine.map((t) => (
                <TaskRow key={t.id} t={t} me={me} canEdit onComments={setComments} />
              ))}
              {!mine.length && <Empty text={isToday ? 'Nothing logged yet. Add the first thing you are working on.' : 'Nothing was logged this day.'} icon={<ListChecks />} />}
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-1 lg:content-start">
            <Stat label="Done" value={`${myDone}/${mine.length}`} />
            <Stat label="Time logged" value={myMins ? fmtMinutes(myMins) : '–'} />
            <Stat label="Unplanned" value={mine.filter((t) => t.self_added).length} sub="added by you" />
          </div>
        </div>
      )}

      {tab === 'team' && manager && (
        <div className="space-y-4">
          <Input placeholder="Search people or tasks" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:max-w-sm" />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {team
              .map((p) => ({ p, items: dayItems(ws.tasks, p.id, date) }))
              .filter(({ p, items }) => !q || p.full_name.toLowerCase().includes(q.toLowerCase()) || items.some((t) => t.title.toLowerCase().includes(q.toLowerCase())))
              .sort((a, b) => b.items.length - a.items.length)
              .map(({ p, items }) => {
                const done = items.filter((t) => t.status === 'done').length;
                const mins = items.reduce((s, t) => s + (t.minutes || 0), 0);
                return (
                  <Card key={p.id}>
                    <div className="mb-3 flex items-center gap-3">
                      <Avatar name={p.full_name} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{p.full_name}</div>
                        <div className="text-xs text-neutral-500">
                          {done}/{items.length} done{mins ? ` · ${fmtMinutes(mins)}` : ''}
                        </div>
                      </div>
                      {!items.length && <Badge tone="amber">Quiet</Badge>}
                      {p.tracking?.daily_log === false && <Badge>Log off</Badge>}
                    </div>
                    <div className="space-y-2">
                      {items.map((t) => (
                        <TaskRow key={t.id} t={t} me={me} canEdit={false} onComments={setComments} />
                      ))}
                    </div>
                  </Card>
                );
              })}
          </div>
        </div>
      )}

      {comments && <CommentsSheet task={comments} me={me} people={ws.profiles} onClose={() => setComments(null)} />}
    </div>
  );
}
