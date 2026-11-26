'use client';
import { useMemo, useState } from 'react';
import { Bell, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Globe, Lock, Plus, Trash2, Users } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/data';
import { useTable } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { errMsg, fmtDate, parseDate, toDateStr, todayStr } from '@/lib/format';
import { managedTeam } from '@/lib/permissions';
import type { Attendance, CalendarEvent, CalendarEventKind, CalendarVisibility, Holiday, LeaveRequest } from '@/lib/types';
import { Avatar, Badge, Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, cn } from '@/components/ui';
import { AttendanceBadge } from '@/components/bits';

const WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOT: Record<string, string> = { present: 'bg-emerald-500', late: 'bg-amber-500', half_day: 'bg-violet-500', absent: 'bg-rose-500', on_leave: 'bg-teal-500' };

const VIS_LABEL: Record<CalendarVisibility, { label: string; tone: 'neutral' | 'violet' | 'green' }> = {
  private: { label: 'Only me', tone: 'neutral' },
  department: { label: 'Team / dept', tone: 'violet' },
  public: { label: 'Public', tone: 'green' },
};

export default function CalendarPage() {
  const { me, settings } = useMe();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [picked, setPicked] = useState<string | null>(null);
  const [addingHoliday, setAddingHoliday] = useState(false);
  const [addingEvent, setAddingEvent] = useState<string | null>(null);
  const [visFilter, setVisFilter] = useState<'all' | 'private' | 'public'>('all');

  const first = cursor;
  const last = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - first.getDay());
  const cells = Array.from({ length: Math.ceil((first.getDay() + last.getDate()) / 7) * 7 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const from = toDateStr(cells[0]);
  const to = toDateStr(cells[cells.length - 1]);

  const holidays = useTable('holidays', { order: ['date', 'asc'] });
  const events = useTable('calendar_events', { order: ['date', 'asc'] });
  const leaves = useTable('leave_requests', { lte: ['start_date', to] });
  const att = useTable('attendance', { filter: { user_id: me.id }, gte: ['date', from], lte: ['date', to] });
  const profiles = useTable('profiles');

  const team = useMemo(() => new Set(managedTeam(me, profiles.rows).map((p) => p.id)), [me, profiles.rows]);
  const name = (id: string) => profiles.rows.find((p) => p.id === id)?.full_name;
  const today = todayStr();

  const visibleEvents = useMemo(
    () =>
      events.rows.filter((ev) => {
        const canSee =
          ev.created_by === me.id ||
          ev.visibility === 'public' ||
          (ev.visibility === 'department' && !!ev.department_id && ev.department_id === me.department_id);
        if (!canSee) return false;
        if (visFilter === 'private') return ev.visibility === 'private' && ev.created_by === me.id;
        if (visFilter === 'public') return ev.visibility === 'public' || ev.visibility === 'department';
        return true;
      }),
    [events.rows, me.id, me.department_id, visFilter],
  );

  const dayInfo = (ds: string) => {
    const hol = visFilter === 'private' ? undefined : holidays.rows.find((h) => h.date === ds);
    const evs = visibleEvents
      .filter((e) => e.date === ds)
      .sort((a, b) => (a.time ?? '99:99').localeCompare(b.time ?? '99:99'));
    const lv =
      visFilter === 'private'
        ? []
        : leaves.rows.filter((l) => l.start_date <= ds && l.end_date >= ds && (l.status === 'approved' || l.user_id === me.id) && (team.has(l.user_id) || l.user_id === me.id));
    const a = att.rows.find((x) => x.date === ds);
    const anniv =
      visFilter === 'private'
        ? []
        : profiles.rows.filter((p) => p.status === 'active' && p.join_date && p.join_date.slice(5) === ds.slice(5) && p.join_date.slice(0, 4) < ds.slice(0, 4));
    const off = settings.weekly_off.includes(parseDate(ds).getDay());
    return { hol, evs, lv, a, anniv, off };
  };

  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const upcomingHolidays = holidays.rows.filter((h) => h.date >= today).slice(0, 5);
  const upcomingEvents = visibleEvents
    .filter((e) => e.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '99:99').localeCompare(b.time ?? '99:99'))
    .slice(0, 8);

  return (
    <div>
      <PageHeader
        title="Calendar"
        subtitle="Events, reminders, holidays, leave and team milestones"
        actions={
          <>
            {me.role === 'super_admin' && (
              <Button variant="secondary" onClick={() => setAddingHoliday(true)}>
                <Plus size={16} /> Add holiday
              </Button>
            )}
            <Button onClick={() => setAddingEvent(today)}>
              <Plus size={16} /> Add event / reminder
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<'all' | 'private' | 'public'>
          value={visFilter}
          onChange={setVisFilter}
          tabs={[
            { id: 'all', label: 'All visible' },
            { id: 'private', label: 'Only me (private)' },
            { id: 'public', label: 'Public & team' },
          ]}
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        <Card className="lg:col-span-3">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">{cursor.toLocaleDateString([], { month: 'long', year: 'numeric' })}</h2>
            <div className="flex gap-1">
              <Button variant="secondary" size="sm" onClick={() => move(-1)} aria-label="Previous month">
                <ChevronLeft size={16} />
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>
                Today
              </Button>
              <Button variant="secondary" size="sm" onClick={() => move(1)} aria-label="Next month">
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
            {WEEK.map((w) => (
              <div key={w} className="py-1">
                <span className="sm:hidden">{w[0]}</span>
                <span className="hidden sm:inline">{w}</span>
              </div>
            ))}
          </div>
          <div key={from} className="grid animate-fade-in grid-cols-7 gap-1">
            {cells.map((d) => {
              const ds = toDateStr(d);
              const inMonth = d.getMonth() === cursor.getMonth();
              const { hol, evs, lv, a, anniv, off } = dayInfo(ds);
              return (
                <button
                  key={ds}
                  onClick={() => setPicked(ds)}
                  className={cn(
                    'group relative flex min-h-[64px] flex-col rounded-xl border p-1.5 text-left transition hover:border-neutral-400 sm:min-h-[96px] sm:p-2',
                    inMonth ? 'border-neutral-200' : 'border-transparent opacity-40',
                    off && 'bg-neutral-50',
                    hol && 'bg-teal-50',
                    ds === today && 'ring-2 ring-brand',
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn('text-xs font-semibold sm:text-sm', ds === today && 'grid h-6 w-6 place-items-center rounded-full bg-brand text-on-brand')}>{d.getDate()}</span>
                    {a && <span className={cn('h-2 w-2 rounded-full', DOT[a.status])} title={a.status} />}
                  </div>
                  <div className="mt-1 hidden space-y-0.5 sm:block">
                    {hol && <div className="truncate rounded-md bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-medium text-teal-700">{hol.name}</div>}
                    {evs.slice(0, 2).map((ev) => (
                      <div
                        key={ev.id}
                        className={cn(
                          'truncate rounded-md px-1.5 py-0.5 text-[10px] font-medium',
                          ev.kind === 'reminder' ? 'bg-amber-50 text-amber-700' : 'bg-brand/10 text-neutral-800',
                        )}
                      >
                        {ev.visibility === 'private' ? '🔒 ' : ''}{ev.time ? `${ev.time} ` : ''}{ev.title}
                      </div>
                    ))}
                    {evs.length > 2 && <div className="text-[10px] text-neutral-400">+{evs.length - 2} more</div>}
                    {lv.slice(0, evs.length ? 1 : 2).map((l) => (
                      <div key={l.id} className={cn('truncate rounded-md px-1.5 py-0.5 text-[10px]', l.status === 'approved' ? 'bg-violet-50 text-violet-700' : 'bg-amber-50 text-amber-700')}>
                        {name(l.user_id)?.split(' ')[0]} · {l.type}
                      </div>
                    ))}
                    {anniv.length > 0 && <div className="truncate text-[10px]">🎉 {anniv[0].full_name.split(' ')[0]}</div>}
                  </div>
                  <div className="mt-auto flex gap-0.5 sm:hidden">
                    {hol && <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />}
                    {evs.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}
                    {lv.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />}
                    {anniv.length > 0 && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-neutral-500">
            {[['bg-emerald-500', 'Present'], ['bg-amber-500', 'Late / Reminder'], ['bg-violet-500', 'Leave'], ['bg-teal-500', 'Holiday'], ['bg-brand', 'Event']].map(([c, l]) => (
              <span key={l} className="flex items-center gap-1.5">
                <span className={cn('h-2 w-2 rounded-full', c)} /> {l}
              </span>
            ))}
          </div>
        </Card>

        <div className="space-y-5">
          <Card title="Events & reminders" className="h-fit">
            <div className="space-y-2">
              {upcomingEvents.map((ev) => (
                <div key={ev.id} className="flex items-start gap-2.5 rounded-xl bg-neutral-50 p-2.5">
                  <div className={cn('grid h-8 w-8 shrink-0 place-items-center rounded-lg', ev.kind === 'reminder' ? 'bg-amber-100 text-amber-700' : 'bg-brand/10 text-neutral-800')}>
                    {ev.kind === 'reminder' ? <Bell size={14} /> : <CalendarIcon size={14} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{ev.title}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500">
                      <span>{fmtDate(ev.date)}{ev.time ? ` · ${ev.time}` : ''}</span>
                      <Badge tone={VIS_LABEL[ev.visibility].tone}>{VIS_LABEL[ev.visibility].label}</Badge>
                    </div>
                  </div>
                  {(ev.created_by === me.id || me.role === 'super_admin') && (
                    <button
                      onClick={() => confirm('Delete this item?') && db.remove('calendar_events', ev.id)}
                      className="rounded-lg p-1 text-neutral-300 hover:bg-rose-50 hover:text-rose-600"
                      aria-label="Delete"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              ))}
              {!upcomingEvents.length && <p className="text-sm text-neutral-500">No upcoming events or reminders.</p>}
            </div>
          </Card>

          <Card title="Upcoming holidays" className="h-fit">
            <div className="space-y-2">
              {upcomingHolidays.map((h) => (
                <div key={h.id} className="flex items-center gap-3 rounded-xl bg-neutral-50 p-2.5">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-center leading-none text-teal-700">
                    <div>
                      <div className="text-[9px] font-semibold uppercase">{parseDate(h.date).toLocaleDateString([], { month: 'short' })}</div>
                      <div className="text-sm font-bold">{parseDate(h.date).getDate()}</div>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{h.name}</div>
                    <div className="text-xs text-neutral-500">{parseDate(h.date).toLocaleDateString([], { weekday: 'long' })}</div>
                  </div>
                </div>
              ))}
              {!upcomingHolidays.length && <p className="text-sm text-neutral-500">None scheduled.</p>}
            </div>
          </Card>
        </div>
      </div>

      {picked && (
        <DayDetail
          ds={picked}
          info={dayInfo(picked)}
          name={name}
          meId={me.id}
          canEditHoliday={me.role === 'super_admin'}
          isSuper={me.role === 'super_admin'}
          onAdd={() => {
            const target = picked;
            setPicked(null);
            setAddingEvent(target);
          }}
          onClose={() => setPicked(null)}
        />
      )}
      {addingHoliday && <AddHoliday onClose={() => setAddingHoliday(false)} />}
      {addingEvent !== null && <AddEventModal defaultDate={addingEvent || today} onClose={() => setAddingEvent(null)} />}
    </div>
  );
}

function DayDetail({
  ds, info, name, meId, canEditHoliday, isSuper, onAdd, onClose,
}: {
  ds: string;
  info: { hol?: Holiday; evs: CalendarEvent[]; lv: LeaveRequest[]; a?: Attendance; anniv: { id: string; full_name: string; join_date: string }[]; off: boolean };
  name: (id: string) => string | undefined;
  meId: string;
  canEditHoliday: boolean;
  isSuper: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      title={parseDate(ds).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Close</Button>
          <Button onClick={onAdd}><Plus size={15} /> Add event / reminder</Button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        {info.off && <Badge>Weekly off</Badge>}
        {info.hol && (
          <div className="flex items-center justify-between rounded-xl bg-teal-50 px-3 py-2 text-teal-700">
            🏖️ {info.hol.name}
            {canEditHoliday && (
              <button onClick={() => db.remove('holidays', info.hol!.id).then(onClose)} className="text-teal-700/70 hover:text-rose-600" aria-label="Delete holiday">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        )}
        {info.evs.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500">Events & reminders</div>
            {info.evs.map((ev) => (
              <div key={ev.id} className="flex items-start justify-between gap-3 rounded-xl border border-neutral-200 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge tone={ev.kind === 'reminder' ? 'amber' : 'brand'}>{ev.kind === 'reminder' ? 'Reminder' : 'Event'}</Badge>
                    <Badge tone={VIS_LABEL[ev.visibility].tone}>
                      {ev.visibility === 'private' ? <Lock size={10} /> : ev.visibility === 'department' ? <Users size={10} /> : <Globe size={10} />}
                      {VIS_LABEL[ev.visibility].label}
                    </Badge>
                    {ev.time && <span className="text-xs text-neutral-500">{ev.time}</span>}
                  </div>
                  <div className="mt-1 font-medium">{ev.title}</div>
                  {ev.description && <p className="mt-0.5 text-xs text-neutral-600">{ev.description}</p>}
                  <div className="mt-1 text-[11px] text-neutral-400">Added by {name(ev.created_by) ?? 'Someone'}</div>
                </div>
                {(ev.created_by === meId || isSuper) && (
                  <button
                    onClick={() => db.remove('calendar_events', ev.id)}
                    className="rounded-lg p-1.5 text-neutral-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label="Delete event"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
        {info.a && (
          <div className="flex items-center gap-2">
            Your day: <AttendanceBadge status={info.a.status} />
          </div>
        )}
        {info.lv.length > 0 && (
          <div>
            <div className="mb-1 text-xs font-medium text-neutral-500">On leave</div>
            {info.lv.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-1">
                <Avatar name={name(l.user_id)} size={24} /> {name(l.user_id)} · {l.type}
                {l.status !== 'approved' && <Badge tone="amber">{l.status}</Badge>}
              </div>
            ))}
          </div>
        )}
        {info.anniv.map((p) => (
          <div key={p.id}>
            🎉 {p.full_name}: {Number(ds.slice(0, 4)) - Number(p.join_date.slice(0, 4))} year work anniversary
          </div>
        ))}
        {!info.hol && !info.evs.length && !info.a && !info.lv.length && !info.anniv.length && !info.off && (
          <p className="text-neutral-500">Nothing scheduled on this day yet.</p>
        )}
      </div>
    </Modal>
  );
}

function AddEventModal({ defaultDate, onClose }: { defaultDate: string; onClose: () => void }) {
  const { me } = useMe();
  const toast = useToast();
  const [kind, setKind] = useState<CalendarEventKind>('reminder');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [time, setTime] = useState('');
  const [visibility, setVisibility] = useState<CalendarVisibility>('private');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!date || !title.trim()) return setErr('Title and date are required');
    setBusy(true);
    setErr('');
    try {
      await db.insert('calendar_events', {
        title: title.trim(),
        description: description.trim(),
        date,
        time: time.trim() || null,
        kind,
        visibility,
        department_id: visibility === 'department' ? me.department_id : null,
        created_by: me.id,
      });
      toast(kind === 'reminder' ? 'Reminder added' : 'Event created', 'success', title);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="New calendar event or reminder"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Type">
          <div className="grid grid-cols-2 gap-2">
            {([
              ['reminder', 'Reminder', Bell],
              ['event', 'Event', CalendarIcon],
            ] as const).map(([val, label, Icon]) => (
              <button
                key={val}
                type="button"
                onClick={() => setKind(val)}
                className={cn(
                  'flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition',
                  kind === val ? 'border-transparent bg-brand text-on-brand' : 'border-neutral-200 hover:bg-neutral-50',
                )}
              >
                <Icon size={15} /> {label}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={kind === 'reminder' ? 'e.g. Call clinic partner at 3pm' : 'e.g. Q4 Demo Day'} autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Time (optional)">
            <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
        </div>
        <Field label="Who can see this?">
          <Select value={visibility} onChange={(e) => setVisibility(e.target.value as CalendarVisibility)}>
            <option value="private">Only me (Private)</option>
            {me.department_id && <option value="department">My department / team</option>}
            <option value="public">Public (Everyone in company)</option>
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}

function AddHoliday({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  async function save() {
    if (!date || !name.trim()) return setErr('Date and name are required');
    try {
      await db.insert('holidays', { date, name: name.trim() });
      toast('Holiday added', 'success', 'It is excluded from working days everywhere.');
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Add holiday"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Add</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Onam" />
        </Field>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
