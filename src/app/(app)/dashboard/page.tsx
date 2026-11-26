'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { Settings2 } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { useTable } from '@/lib/hooks';
import { useWorkspace } from '@/lib/workspace';
import { managedTeam, visibleTeam } from '@/lib/permissions';
import { ROLE_LABEL, WIDGET_FEATURE, type WidgetId } from '@/lib/types';
import { has, orgHas } from '@/lib/features';

const PERSONAL: WidgetId[] = ['my_shift', 'my_day', 'my_kpis', 'my_okrs', 'my_tasks', 'my_performance'];
import { Button, PageHeader, PageSkeleton } from '@/components/ui';
import { Widget, pickWidgets, type DashCtx } from '@/components/widgets';

export default function DashboardPage() {
  const { me, settings } = useMe();
  const ws = useWorkspace(30, settings.current_cycle);
  const ann = useTable('announcements', { order: ['created_at', 'desc'], limit: 30 });

  const team = useMemo(
    () => (me.role === 'member' ? visibleTeam(me, ws.profiles, settings) : managedTeam(me, ws.profiles)),
    [me, ws.profiles, settings],
  );
  const dept = ws.departments.find((d) => d.id === me.department_id);
  const reads = useTable('announcement_reads', { filter: { user_id: me.id } });
  const widgets = pickWidgets(me, settings, dept?.dashboard_widgets).filter((w) => {
    const f = WIDGET_FEATURE[w];
    if (!f) return true;
    return PERSONAL.includes(w) ? has(me, settings, f) : orgHas(settings, f);
  });
  const announcements = ann.rows
    .filter((a) => !a.department_id || a.department_id === me.department_id || me.role !== 'member')
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));

  const ctx: DashCtx = { me, settings, ws, team, announcements, reads: reads.rows };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle={<>{ROLE_LABEL[me.role]} view{dept ? ' · ' + dept.name : ''}<span className="hidden sm:inline"> · press <kbd className="rounded border border-neutral-300 px-1 text-[10px]">Ctrl K</kbd> to jump anywhere</span></>}
        actions={
          me.role !== 'member' && (
            <div className="flex flex-wrap gap-2">
              <Link href="/settings?tab=modules">
                <Button variant="secondary" size="sm">
                  Features on/off
                </Button>
              </Link>
              <Link href="/settings?tab=dashboards">
                <Button variant="secondary" size="sm">
                  <Settings2 size={15} /> Customize dashboards
                </Button>
              </Link>
            </div>
          )
        }
      />
      {ws.loading ? (
        <PageSkeleton />
      ) : (
        <div className="stagger grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {widgets.map((w) => (
            <Widget key={w} id={w} ctx={ctx} />
          ))}
        </div>
      )}
    </div>
  );
}
