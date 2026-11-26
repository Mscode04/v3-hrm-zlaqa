'use client';
import Link from 'next/link';
import { has } from '@/lib/features';
import { useMemo, useRef, useState } from 'react';
import { Check, Coffee, Flame, LogIn, LogOut, MapPin, Play, Plus, User, Utensils } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/data';
import { useNow, useTable } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { buzz, confetti, playSfx } from '@/lib/delight';
import {
  MOODS, distanceMeters, errMsg, fmtClock, fmtDay, fmtDistance, fmtMinutes, fmtTime, minutesBetween, startOfToday, timeOnDate, todayStr,
} from '@/lib/format';
import { breakMinutes, liveStatus, onTimeStreak, workedMinutes } from '@/lib/metrics';
import { BREAK_LABEL, type BreakType, type TaskStatus } from '@/lib/types';
import { Badge, Button, Card, ErrorNote, Field, Input, Modal, PageHeader, Select, Table, Textarea, cn, td } from '@/components/ui';
import { AttendanceBadge, LiveBadge, Ring } from '@/components/bits';

const BREAK_ICON: Record<BreakType, typeof Coffee> = { tea: Coffee, lunch: Utensils, personal: User };
const MOOD_LABEL = ['Rough', 'Meh', 'Okay', 'Good', 'Great'];

const STATUS_OPTS: { id: TaskStatus; label: string; color: string }[] = [
  { id: 'todo', label: 'To do', color: 'bg-neutral-400' },
  { id: 'in_progress', label: 'In progress', color: 'bg-amber-400' },
  { id: 'review', label: 'Review', color: 'bg-violet-400' },
  { id: 'done', label: 'Done', color: 'bg-emerald-500' },
];

export default function AttendancePage() {
  const { me, settings } = useMe();
  const toast = useToast();
  const today = todayStr();
  const todayIso = useMemo(() => startOfToday().toISOString(), []);
  const att = useTable('attendance', { filter: { user_id: me.id }, order: ['date', 'desc'], limit: 90 });
  const brk = useTable('breaks', { filter: { user_id: me.id }, gte: ['start_at', todayIso] });
  const holidays = useTable('holidays');
  // Load today's tasks for the checkout task-review modal
  const myTasks = useTable('tasks', { filter: { assignee_id: me.id }, order: ['created_at', 'desc'] });
  const rec = att.rows.find((a) => a.date === today);
  const breaks = brk.rows.filter((b) => rec && b.attendance_id === rec.id).sort((a, b) => a.start_at.localeCompare(b.start_at));
  const live = liveStatus(rec, breaks);
  const now = useNow(1000);
  const streak = onTimeStreak(me.id, att.rows, settings, holidays.rows);
  const holidayToday = holidays.rows.find((h) => h.date === today);

  const [step, setStep] = useState<null | 'start' | 'wrap'>(null);
  const [mood, setMood] = useState<number | null>(null);
  const [plan, setPlan] = useState('');
  // For wrap-up: task statuses keyed by task id + inline quick-add if user forgot a task
  const [taskStatuses, setTaskStatuses] = useState<Record<string, TaskStatus>>({});
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskStatus, setNewTaskStatus] = useState<TaskStatus>('done');
  const [addingTask, setAddingTask] = useState(false);
  const [loc, setLoc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [err, setErr] = useState('');

  const openBreak = breaks.find((b) => !b.end_at);
  const teaUsed = breaks.filter((b) => b.type === 'tea').length;
  const used = (t: BreakType) => breaks.filter((b) => b.type === t).reduce((s, b) => s + minutesBetween(b.start_at, b.end_at), 0);

  // Tasks relevant for today's wrap-up: open tasks assigned to me + tasks finished today + today's self-added logs
  const todayCheckoutTasks = myTasks.rows
    .filter(
      (t) =>
        (!t.self_added && (t.status !== 'done' || t.completed_at?.slice(0, 10) === today)) ||
        (t.self_added && t.log_date === today),
    )
    .slice(0, 30);

  async function location(): Promise<string | null> {
    if (!settings.capture_location && settings.geofence_mode === 'off') return null;
    if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
    return new Promise((res) =>
      navigator.geolocation.getCurrentPosition(
        (p) => res(`${p.coords.latitude.toFixed(5)},${p.coords.longitude.toFixed(5)}`),
        () => res(null),
        { timeout: 7000, maximumAge: 60000, enableHighAccuracy: true },
      ),
    );
  }

  function checkFence(l: string | null): string | null {
    if (settings.geofence_mode === 'off' || settings.office_lat == null) return null;
    const d = distanceMeters(l, settings.office_lat, settings.office_lng);
    if (d === null) {
      if (settings.geofence_mode === 'block') throw new Error('Location is required to check in. Allow location access and try again.');
      return 'Location unavailable';
    }
    if (d > settings.office_radius_m) {
      if (settings.geofence_mode === 'block') throw new Error(`You're ${fmtDistance(d)} from the office. Check-in is only allowed within ${settings.office_radius_m} m.`);
      return `Outside office (${fmtDistance(d)})`;
    }
    return null;
  }

  async function run(fn: () => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setErr('');
    try {
      await fn();
      await Promise.all([att.reload(), brk.reload()]);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const beginCheckIn = () =>
    run(async () => {
      const l = await location();
      const warn = checkFence(l);
      if (warn) toast(warn, 'info', 'Your manager will see this on the record.');
      setLoc(l);
      if (settings.daily_plan_prompt || settings.mood_pulse) setStep('start');
      else await checkIn(l);
    });

  const afterStart = () => {
    if (busy || busyRef.current) return;
    setStep(null);
    run(() => checkIn(loc));
  };

  async function checkIn(l = loc) {
    const t = new Date();
    const lateAt = timeOnDate(today, settings.work_start).getTime() + settings.late_after_minutes * 60000;
    const late = t.getTime() > lateAt;
    await db.insert('attendance', {
      user_id: me.id, date: today, check_in: t.toISOString(), check_out: null, check_in_selfie: null, check_out_selfie: null,
      check_in_location: l, check_out_location: null, status: late ? 'late' : 'present', work_minutes: 0, break_minutes: 0, notes: '',
      plan: plan.trim(), summary: '', mood,
    });
    buzz(40);
    playSfx('check_in');
    if (!late) confetti({ count: 90 });
    toast(late ? 'Checked in · marked late' : 'Checked in on time', late ? 'info' : 'success', late ? `Shift started at ${settings.work_start}` : streak ? `${streak + 1}-day on-time streak 🔥` : 'Have a great day!');
  }

  const beginCheckOut = () => {
    if (busy || busyRef.current) return;
    // Pre-populate task statuses with current status
    const init: Record<string, TaskStatus> = {};
    for (const t of todayCheckoutTasks) init[t.id] = t.status;
    setTaskStatuses(init);
    setStep('wrap');
  };

  const afterWrap = () => {
    if (busy || busyRef.current) return;
    setStep(null);
    run(async () => {
      // Save any task status updates
      for (const [tid, status] of Object.entries(taskStatuses)) {
        const task = myTasks.rows.find((t) => t.id === tid);
        if (task && task.status !== status) {
          await db.update('tasks', tid, {
            status,
            completed_at: status === 'done' ? new Date().toISOString() : null,
          });
        }
      }
      await checkOut(true);
    });
  };

  async function addCheckoutTask() {
    const title = newTaskTitle.trim();
    if (!title || addingTask) return;
    setAddingTask(true);
    setErr('');
    try {
      const inserted = await db.insert('tasks', {
        title,
        description: '',
        assignee_id: me.id,
        department_id: me.department_id,
        status: newTaskStatus,
        priority: 'medium',
        due_date: today,
        key_result_id: null,
        created_by: me.id,
        self_added: false,
        log_date: null,
        minutes: 0,
        completed_at: newTaskStatus === 'done' ? new Date().toISOString() : null,
      });
      setTaskStatuses((prev) => ({ ...prev, [inserted.id]: newTaskStatus }));
      setNewTaskTitle('');
      setNewTaskStatus('done');
      await myTasks.reload();
      toast('Task added to today', 'success', title);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setAddingTask(false);
    }
  }

  const skipWrap = () => {
    if (busy || busyRef.current) return;
    setStep(null);
    run(() => checkOut(false));
  };

  async function checkOut(usePickedStatuses = true) {
    if (!rec) return;
    const t = new Date();
    const iso = t.toISOString();
    if (openBreak) await db.update('breaks', openBreak.id, { end_at: iso });
    const closed = breaks.map((b) => (b.end_at ? b : { ...b, end_at: iso }));
    const brMin = breakMinutes(rec, closed);
    const work = Math.max(0, minutesBetween(rec.check_in!, iso) - brMin);
    const l = await location();
    // Build a summary from done tasks
    const doneTasks = todayCheckoutTasks.filter((task) =>
      usePickedStatuses ? (taskStatuses[task.id] ?? task.status) === 'done' : task.status === 'done',
    );
    const autoSummary = doneTasks.map((task) => task.title).join(', ');
    await db.update('attendance', rec.id, {
      check_out: iso, check_out_selfie: null, check_out_location: l, break_minutes: Math.round(brMin), work_minutes: Math.round(work),
      status: work < settings.half_day_minutes ? 'half_day' : rec.status, summary: autoSummary,
    });
    await myTasks.reload();
    buzz(40);
    playSfx('check_out');
    toast('Checked out', 'success', `You worked ${fmtMinutes(work)} today. Rest well.`);
  }

  const startBreak = (type: BreakType) =>
    run(async () => {
      if (!rec) return;
      if (type === 'tea' && teaUsed >= settings.max_tea_breaks) throw new Error(`Tea break limit reached (${settings.max_tea_breaks} per day).`);
      await db.insert('breaks', { attendance_id: rec.id, user_id: me.id, type, start_at: new Date().toISOString(), end_at: null });
      buzz();
      toast(`${BREAK_LABEL[type]} started`, 'info', `Limit ${settings.break_limits[type]} min`);
    });

  const endBreak = () =>
    run(async () => {
      if (!rec || !openBreak) return;
      const end = new Date().toISOString();
      await db.update('breaks', openBreak.id, { end_at: end });
      const total = breaks.reduce((s, b) => s + minutesBetween(b.start_at, b.id === openBreak.id ? end : b.end_at), 0);
      await db.update('attendance', rec.id, { break_minutes: Math.round(total) });
      buzz();
      playSfx('pop');
      toast('Back to work', 'success', `Break took ${fmtMinutes(minutesBetween(openBreak.start_at, end))}`);
    });

  const workedMin = rec ? workedMinutes(rec, breaks) : 0;
  const dayPct = (workedMin / settings.full_day_minutes) * 100;
  const breakSec = openBreak ? (now - new Date(openBreak.start_at).getTime()) / 1000 : 0;
  const breakLimit = openBreak ? settings.break_limits[openBreak.type] : 0;
  const breakPct = openBreak ? Math.min(100, (breakSec / 60 / breakLimit) * 100) : 0;
  const overLimit = openBreak && breakSec / 60 > breakLimit;

  if (!has(me, settings, 'attendance'))
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-neutral-100 text-3xl">🏡</div>
        <h1 className="text-xl font-semibold">Attendance is not tracked for you</h1>
        <p className="mt-2 text-sm text-neutral-500">No check-in needed. Your manager switched attendance off for your role. Log your work in My Day instead.</p>
        <Link href="/today" className="mt-5 inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand">Open My Day</Link>
      </div>
    );

  return (
    <div>
      <PageHeader
        title="My Attendance"
        subtitle={`Shift ${settings.work_start} – ${settings.work_end} · grace ${settings.late_after_minutes} min`}
        actions={
          streak > 0 && (
            <Badge tone="amber" className="px-3 py-1 text-xs">
              <Flame size={13} /> {streak}-day on-time streak
            </Badge>
          )
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="relative overflow-hidden lg:col-span-2">
          {live.state === 'working' && <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-emerald-400/15 blur-3xl" />}
          {live.state === 'on_break' && <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-amber-400/20 blur-3xl" />}
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs uppercase tracking-widest text-neutral-400">{fmtDay(today)}</div>
              <div className="mt-1 text-5xl font-semibold tabular-nums tracking-tight sm:text-6xl">
                {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                <span className="ml-1 text-2xl text-neutral-300">{String(new Date(now).getSeconds()).padStart(2, '0')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <LiveBadge state={live.state} breakType={live.breakType} />
              {rec && <AttendanceBadge status={rec.status} />}
            </div>
          </div>

          {holidayToday && !rec && <div className="relative mt-4 rounded-xl bg-teal-50 px-4 py-3 text-sm text-teal-700">Today is a holiday: {holidayToday.name}. Enjoy! You can still check in if you&apos;re working.</div>}

          <div className="relative mt-6 grid grid-cols-3 gap-3 rounded-2xl bg-neutral-50 p-4 text-center">
            <div>
              <div className="text-xs text-neutral-500">Checked in</div>
              <div className="text-lg font-semibold">{fmtTime(rec?.check_in)}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Worked</div>
              <div className="text-lg font-semibold tabular-nums">{rec ? fmtClock(workedMin * 60) : '—'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Checked out</div>
              <div className="text-lg font-semibold">{fmtTime(rec?.check_out)}</div>
            </div>
            {rec && (
              <div className="col-span-3 mt-1">
                <div className="h-1.5 overflow-hidden rounded-full bg-neutral-200">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-[width] duration-1000" style={{ width: `${Math.min(100, dayPct)}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-neutral-500">
                  {Math.round(dayPct)}% of a full day ({fmtMinutes(settings.full_day_minutes)})
                </div>
              </div>
            )}
          </div>

          {rec?.plan && (
            <div className="relative mt-3 rounded-xl border border-neutral-100 px-4 py-2.5 text-sm">
              <span className="text-neutral-400">Today&apos;s focus · </span>
              {rec.plan}
              {rec.mood && <span className="ml-2">{MOODS[rec.mood - 1]}</span>}
            </div>
          )}

          {openBreak && (
            <div className={cn('relative mt-4 flex animate-scale-in items-center gap-4 rounded-2xl p-4', overLimit ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-amber-50 ring-1 ring-amber-200')}>
              <Ring value={100 - breakPct} size={58} stroke={6} />
              <div className="flex-1">
                <div className="text-sm font-medium">{BREAK_LABEL[openBreak.type]} in progress</div>
                <div className="text-xs text-neutral-600">
                  Limit {breakLimit} min{overLimit ? ' · over the limit, please wrap up' : ` · ${Math.max(0, Math.ceil(breakLimit - breakSec / 60))} min left`}
                </div>
              </div>
              <div className="text-2xl font-semibold tabular-nums">{fmtClock(breakSec)}</div>
            </div>
          )}

          <div className="relative mt-3">
            <ErrorNote text={err} />
          </div>

          <div className="relative mt-5 flex flex-wrap gap-2">
            {!rec && (
              <Button size="lg" className={cn('w-full sm:w-auto', !busy && 'animate-pulse-ring')} onClick={beginCheckIn} disabled={busy}>
                <LogIn size={18} /> {busy ? 'Getting location…' : 'Check in'}
              </Button>
            )}
            {rec && !rec.check_out && !openBreak && (
              <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto">
                {(['tea', 'lunch', 'personal'] as BreakType[]).map((t) => {
                  const Icon = BREAK_ICON[t];
                  const disabled = busy || (t === 'tea' && teaUsed >= settings.max_tea_breaks);
                  return (
                    <Button key={t} variant="warning" onClick={() => startBreak(t)} disabled={disabled} className="flex-col gap-1 py-3 sm:flex-row sm:py-2">
                      <Icon size={16} />
                      <span>
                        {t === 'tea' ? 'Tea' : t === 'lunch' ? 'Lunch' : 'Personal'}
                        {t === 'tea' && ` ${teaUsed}/${settings.max_tea_breaks}`}
                      </span>
                    </Button>
                  );
                })}
              </div>
            )}
            {openBreak && (
              <Button variant="success" size="lg" className="w-full sm:w-auto" onClick={endBreak} disabled={busy}>
                <Play size={18} /> End break · back to work
              </Button>
            )}
            {rec && !rec.check_out && (
              <Button variant="danger" size={openBreak ? 'lg' : 'md'} className="w-full sm:w-auto" onClick={beginCheckOut} disabled={busy}>
                <LogOut size={16} /> Check out
              </Button>
            )}
            {rec?.check_out && (
              <div className="w-full animate-fade-in rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                Done for today. Worked {fmtMinutes(rec.work_minutes)}, breaks {fmtMinutes(rec.break_minutes)}.{rec.summary && ` Tasks: ${rec.summary}`}
              </div>
            )}
          </div>
        </Card>

        <Card title="Today's timeline">
          {!rec ? (
            <p className="text-sm text-neutral-500">Nothing yet. Check in to start your day.</p>
          ) : (
            <ol className="stagger relative space-y-4 border-l border-neutral-200 pl-5">
              <li>
                <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-emerald-500 ring-4 ring-surface" />
                <div>
                  <div className="text-sm font-medium">Checked in · {fmtTime(rec.check_in)}</div>
                  {rec.check_in_location && (
                    <a className="flex items-center gap-1 text-xs text-neutral-500 hover:underline" target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${rec.check_in_location}`}>
                      <MapPin size={11} /> {rec.check_in_location}
                    </a>
                  )}
                </div>
              </li>
              {breaks.map((b) => (
                <li key={b.id}>
                  <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-amber-400 ring-4 ring-surface" />
                  <div className="text-sm font-medium">{BREAK_LABEL[b.type]}</div>
                  <div className="text-xs text-neutral-500">
                    {fmtTime(b.start_at)} – {b.end_at ? fmtTime(b.end_at) : 'now'} · {fmtMinutes(minutesBetween(b.start_at, b.end_at))}
                    {minutesBetween(b.start_at, b.end_at) > settings.break_limits[b.type] && (
                      <Badge tone="red" className="ml-2">over</Badge>
                    )}
                  </div>
                </li>
              ))}
              {rec.check_out && (
                <li>
                  <span className="absolute -left-1.5 mt-1 h-3 w-3 rounded-full bg-neutral-800 ring-4 ring-surface" />
                  <div className="text-sm font-medium">Checked out · {fmtTime(rec.check_out)}</div>
                </li>
              )}
            </ol>
          )}
          <div className="mt-5 space-y-1 border-t border-neutral-100 pt-4 text-xs text-neutral-500">
            {(['tea', 'lunch', 'personal'] as BreakType[]).map((t) => (
              <div key={t} className="flex justify-between">
                <span>{BREAK_LABEL[t]} (limit {settings.break_limits[t]}m each)</span>
                <span className="tabular-nums">{fmtMinutes(used(t))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold">History</h2>
      <div className="space-y-2 md:hidden">
        {att.rows.slice(0, 30).map((a) => (
          <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-neutral-200 bg-surface p-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-sm font-medium">
                {fmtDay(a.date)} <AttendanceBadge status={a.status} />
              </div>
              <div className="text-xs text-neutral-500">
                {fmtTime(a.check_in)} → {fmtTime(a.check_out)} · breaks {fmtMinutes(a.break_minutes)}
              </div>
            </div>
            <div className="text-right text-sm font-semibold tabular-nums">{a.check_out ? fmtMinutes(a.work_minutes) : '—'}</div>
          </div>
        ))}
      </div>
      <Table className="hidden md:block" head={['Date', 'Status', 'In', 'Out', 'Breaks', 'Worked', 'Mood', 'Tasks done']}>
        {att.rows.map((a) => (
          <tr key={a.id} className="transition hover:bg-neutral-50">
            <td className={td}>{fmtDay(a.date)}</td>
            <td className={td}><AttendanceBadge status={a.status} /></td>
            <td className={td}>{fmtTime(a.check_in)}</td>
            <td className={td}>{fmtTime(a.check_out)}</td>
            <td className={td}>{fmtMinutes(a.break_minutes)}</td>
            <td className={td}>{a.check_out ? fmtMinutes(a.work_minutes) : '—'}</td>
            <td className={td}>{a.mood ? MOODS[a.mood - 1] : '—'}</td>
            <td className={td + ' max-w-xs truncate text-xs text-neutral-500'}>{a.summary || '—'}</td>
          </tr>
        ))}
      </Table>

      {/* Step: start your day */}
      <Modal
        open={step === 'start'}
        onClose={() => setStep(null)}
        title="Start your day"
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={afterStart} disabled={busy}>Skip</Button>
            <Button onClick={afterStart} disabled={busy}>Check in</Button>
          </div>
        }
      >
        <div className="space-y-5">
          {settings.mood_pulse && (
            <div>
              <div className="mb-2 text-xs font-medium text-neutral-600">How are you feeling? (optional, only averages are shown to managers)</div>
              <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
                {MOODS.map((m, i) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMood(mood === i + 1 ? null : i + 1)}
                    className={cn(
                      'flex min-w-0 flex-col items-center gap-1 rounded-2xl border p-1.5 text-xl transition active:scale-90 sm:p-2.5 sm:text-2xl',
                      mood === i + 1
                        ? 'border-neutral-800 bg-neutral-50 shadow-sm ring-2 ring-neutral-800'
                        : 'border-neutral-200 hover:border-neutral-400',
                    )}
                  >
                    <span className={cn(mood === i + 1 && 'animate-pop')}>{m}</span>
                    <span className="max-w-full truncate text-[10px] text-neutral-500">{MOOD_LABEL[i]}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {settings.daily_plan_prompt && (
            <Field label="What's your main focus today?" hint="Shared in the team standup">
              <Textarea rows={2} value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Ship the progress chart and review 2 PRs" maxLength={200} />
            </Field>
          )}
        </div>
      </Modal>

      {/* Step: wrap up — task review at checkout */}
      <Modal
        open={step === 'wrap'}
        onClose={() => setStep(null)}
        title="Wrap up your day"
        wide
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={skipWrap} disabled={busy}>Skip & check out</Button>
            <Button variant="danger" onClick={afterWrap} disabled={busy}>Save tasks & check out</Button>
          </div>
        }
      >
        <div className="space-y-3">
          {rec?.plan && (
            <div className="break-words rounded-xl bg-neutral-50 px-3 py-2 text-sm">
              <span className="text-neutral-400">This morning&apos;s focus: </span>
              {rec.plan}
            </div>
          )}
          <div className="text-xs font-medium text-neutral-600">Select today&apos;s tasks & update their status before checking out</div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
            <div className="mb-2 text-xs font-medium text-neutral-600">Forgot a task? Add it now</div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addCheckoutTask();
                  }
                }}
                placeholder="What did you work on?"
                className="flex-1 bg-surface"
              />
              <Select
                className="w-full bg-surface sm:w-32"
                value={newTaskStatus}
                onChange={(e) => setNewTaskStatus(e.target.value as TaskStatus)}
              >
                {STATUS_OPTS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
              <Button type="button" variant="secondary" onClick={addCheckoutTask} disabled={addingTask || !newTaskTitle.trim()}>
                <Plus size={15} /> {addingTask ? 'Adding…' : 'Add task'}
              </Button>
            </div>
          </div>
          {todayCheckoutTasks.length === 0 && (
            <p className="rounded-xl bg-neutral-50 px-3 py-3 text-sm text-neutral-500">No open tasks assigned to you today.</p>
          )}
          <div className="space-y-2">
            {todayCheckoutTasks.map((t) => {
              const currentStatus = taskStatuses[t.id] ?? t.status;
              const overdue = currentStatus !== 'done' && t.due_date && t.due_date < today;
              return (
                <div
                  key={t.id}
                  className={cn(
                    'flex flex-wrap items-center gap-3 rounded-xl border p-3 transition sm:flex-nowrap',
                    currentStatus === 'done'
                      ? 'border-emerald-200 bg-emerald-50'
                      : overdue
                        ? 'border-rose-300 bg-rose-50'
                        : 'border-neutral-200 bg-surface',
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setTaskStatuses((prev) => ({ ...prev, [t.id]: currentStatus === 'done' ? 'in_progress' : 'done' }))}
                    className={cn(
                      'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90',
                      currentStatus === 'done' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-300 hover:border-emerald-500',
                    )}
                    aria-label={currentStatus === 'done' ? 'Mark not done' : 'Mark done'}
                  >
                    {currentStatus === 'done' && <Check size={14} strokeWidth={3} />}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className={cn('text-sm font-medium', currentStatus === 'done' && 'line-through text-neutral-400')}>{t.title}</div>
                    {overdue && <span className="text-xs font-medium text-rose-600">Overdue · due {t.due_date}</span>}
                  </div>
                  <Select
                    className="w-full py-1.5 text-xs sm:w-36 sm:shrink-0"
                    value={currentStatus}
                    onChange={(e) => setTaskStatuses((prev) => ({ ...prev, [t.id]: e.target.value as TaskStatus }))}
                  >
                    {STATUS_OPTS.map((s) => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </Select>
                </div>
              );
            })}
          </div>
        </div>
      </Modal>
    </div>
  );
}
