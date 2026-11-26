'use client';
import { useEffect, useMemo, useState } from 'react';
import { firstName, notify } from '@/lib/notify';
import { useToast } from '@/lib/toast';
import { confetti, playSfx } from '@/lib/delight';
import { Check, ChevronDown, ChevronLeft, ChevronRight, History, Pencil, Plus, Trash2 } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/data';
import { useTable } from '@/lib/hooks';
import { addDays, errMsg, fmtDate, fmtDay, parseDate, toDateStr, todayStr } from '@/lib/format';
import { canManage, managedTeam } from '@/lib/permissions';
import type { Task, TaskStatus } from '@/lib/types';
import { Avatar, Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, Progress, Select, Tabs, Textarea, cn } from '@/components/ui';

const STATUS_COLS: { id: TaskStatus; label: string; tone: 'neutral' | 'amber' | 'violet' | 'green' }[] = [
  { id: 'todo', label: 'To do', tone: 'neutral' },
  { id: 'in_progress', label: 'In progress', tone: 'amber' },
  { id: 'review', label: 'Review', tone: 'violet' },
  { id: 'done', label: 'Done', tone: 'green' },
];

export default function TasksPage() {
  const { me } = useMe();
  const isMember = me.role === 'member';
  const tasks = useTable('tasks', { order: ['due_date', 'asc'] });
  const profiles = useTable('profiles', { order: ['full_name', 'asc'] });
  const today = todayStr();
  const [date, setDate] = useState(today);
  const [view, setView] = useState<'day' | 'all' | 'history'>('day');
  const [who, setWho] = useState(isMember ? me.id : 'all');
  const [historyDate, setHistoryDate] = useState('');
  const [showDone, setShowDone] = useState(false);
  const [editing, setEditing] = useState<Partial<Task> | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('new')) setEditing({ due_date: today });
  }, [today]);

  const team = useMemo(() => managedTeam(me, profiles.rows), [me, profiles.rows]);
  const ids = new Set(team.map((p) => p.id));

  // Non-managers ONLY see their own tasks; admins/managers see managed team tasks
  const allVisible = tasks.rows.filter((t) => {
    if (t.self_added) return false;
    if (isMember) return t.assignee_id === me.id || t.created_by === me.id;
    const allowed = me.role === 'super_admin' || (t.assignee_id && ids.has(t.assignee_id)) || t.created_by === me.id;
    return allowed && (who === 'all' || t.assignee_id === who);
  });

  // Scope by view mode:
  // - day: incomplete tasks due on `date` or overdue from earlier days (`due_date < date`), undated open tasks (when viewing today/future), plus completed on `date`
  // - all: every task regardless of due date
  // - history: completed tasks & past-due tasks sorted newest first
  const scoped = useMemo(() => {
    if (view === 'all') return allVisible;
    if (view === 'history') {
      return allVisible
        .filter((t) => {
          const isHist = t.status === 'done' || (!!t.due_date && t.due_date < today);
          if (!isHist) return false;
          if (!historyDate) return true;
          return t.completed_at?.slice(0, 10) === historyDate || t.due_date === historyDate;
        })
        .sort((a, b) => (b.completed_at ?? b.due_date ?? b.created_at).localeCompare(a.completed_at ?? a.due_date ?? a.created_at));
    }
    return allVisible.filter((t) => {
      if (t.status === 'done') return t.completed_at?.slice(0, 10) === date || t.due_date === date;
      if (!t.due_date) return date >= today;
      return t.due_date <= date;
    });
  }, [allVisible, view, date, today, historyDate]);

  const active = scoped
    .filter((t) => t.status !== 'done')
    .sort((a, b) => {
      const aOver = a.due_date && a.due_date < date ? 0 : 1;
      const bOver = b.due_date && b.due_date < date ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      return (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999');
    });
  const done = scoped.filter((t) => t.status === 'done');

  const totalCount = scoped.length;
  const donePct = totalCount ? (done.length / totalCount) * 100 : 0;

  const pName = (id: string | null) => profiles.rows.find((p) => p.id === id)?.full_name;
  const shift = (n: number) => setDate(toDateStr(addDays(parseDate(date), n)));

  function canEdit(t: Task) {
    if (t.assignee_id === me.id || t.created_by === me.id || me.role === 'super_admin') return true;
    if (isMember) return false;
    const a = profiles.rows.find((p) => p.id === t.assignee_id);
    return !!a && canManage(me, a);
  }

  async function markDone(t: Task) {
    const newStatus: TaskStatus = t.status === 'done' ? 'in_progress' : 'done';
    await db.update('tasks', t.id, { status: newStatus, completed_at: newStatus === 'done' ? new Date().toISOString() : null });
    if (newStatus === 'done') {
      confetti({ count: 60 });
      playSfx('task_done');
      toast('Task done! 🎉', 'success', t.title);
    }
  }

  async function changeStatus(t: Task, status: TaskStatus) {
    await db.update('tasks', t.id, { status, completed_at: status === 'done' ? new Date().toISOString() : null });
    if (status === 'done') {
      confetti({ count: 60 });
      playSfx('task_done');
      toast('Task done! 🎉', 'success', t.title);
    }
  }

  const showTeamGrouping = !isMember && who === 'all';
  const renderList = (list: Task[], includeDone = showDone || view === 'history') => (includeDone ? list : list.filter((t) => t.status !== 'done'));

  return (
    <div>
      <PageHeader
        title="Tasks"
        subtitle={
          view === 'history'
            ? `${scoped.length} historical task${scoped.length === 1 ? '' : 's'}`
            : `${active.length} open · ${done.length} done${view === 'day' ? ` · ${date === today ? 'Today' : fmtDay(date)}` : ''}`
        }
        actions={
          <>
            {!isMember && (
              <Select className="w-full sm:w-52" value={who} onChange={(e) => setWho(e.target.value)}>
                <option value="all">All team members</option>
                {team.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name}</option>
                ))}
              </Select>
            )}
            <Button onClick={() => setEditing({ due_date: date })}>
              <Plus size={16} /> New task{view === 'day' && date !== today ? ` (${fmtDate(date)})` : ''}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Tabs<'day' | 'all' | 'history'>
          value={view}
          onChange={setView}
          tabs={[
            { id: 'day', label: 'Daily tasks' },
            { id: 'all', label: `All open (${allVisible.filter((t) => t.status !== 'done').length})` },
            { id: 'history', label: 'History' },
          ]}
        />
        {view === 'day' && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-neutral-200 bg-surface p-1">
            <button onClick={() => shift(-1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-neutral-100" aria-label="Previous day">
              <ChevronLeft size={16} />
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              aria-label="Select task date"
              className="rounded-lg bg-transparent px-2 py-1 text-sm font-medium text-neutral-900 outline-none hover:bg-neutral-50"
            />
            <button onClick={() => shift(1)} className="grid h-8 w-8 place-items-center rounded-lg hover:bg-neutral-100" aria-label="Next day">
              <ChevronRight size={16} />
            </button>
            {date !== today && (
              <Button size="sm" variant="secondary" onClick={() => setDate(today)}>
                Today
              </Button>
            )}
          </div>
        )}
        {view === 'history' && (
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={historyDate}
              onChange={(e) => setHistoryDate(e.target.value)}
              className="w-44"
              aria-label="Filter history by date"
            />
            {historyDate && (
              <Button size="sm" variant="ghost" onClick={() => setHistoryDate('')}>
                Clear date
              </Button>
            )}
          </div>
        )}
      </div>

      {view !== 'history' && <Progress value={donePct} className="mb-5" showLabel />}

      {/* Task list */}
      {showTeamGrouping ? (
        <div className="space-y-6">
          {team.map((p) => {
            const personAll = scoped.filter((t) => t.assignee_id === p.id);
            const personShown = renderList(personAll);
            const openCount = personAll.filter((t) => t.status !== 'done').length;
            const overdueCount = personAll.filter((t) => t.status !== 'done' && t.due_date && t.due_date < (view === 'day' ? date : today)).length;
            if (!personShown.length) return null;
            return (
              <div key={p.id}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <Avatar name={p.full_name} size={24} />
                  <span className="text-sm font-semibold">{p.full_name}</span>
                  {overdueCount > 0 && <Badge tone="red">{overdueCount} overdue</Badge>}
                  {view !== 'history' && <Badge>{openCount} open</Badge>}
                </div>
                <TaskList tasks={personShown} refDate={view === 'day' ? date : today} canEdit={canEdit} onDone={markDone} onStatus={changeStatus} onEdit={(t) => setEditing(t)} onDelete={(t) => confirm('Delete task?') && db.remove('tasks', t.id)} me={me} />
              </div>
            );
          })}
          {renderList(scoped.filter((t) => !t.assignee_id || !ids.has(t.assignee_id))).length > 0 && (
            <div>
              <div className="mb-2 text-sm font-semibold text-neutral-500">Unassigned</div>
              <TaskList tasks={renderList(scoped.filter((t) => !t.assignee_id || !ids.has(t.assignee_id)))} refDate={view === 'day' ? date : today} canEdit={canEdit} onDone={markDone} onStatus={changeStatus} onEdit={(t) => setEditing(t)} onDelete={(t) => confirm('Delete task?') && db.remove('tasks', t.id)} me={me} />
            </div>
          )}
        </div>
      ) : (
        <TaskList tasks={view === 'history' ? scoped : renderList([...active, ...done])} refDate={view === 'day' ? date : today} canEdit={canEdit} onDone={markDone} onStatus={changeStatus} onEdit={(t) => setEditing(t)} onDelete={(t) => confirm('Delete task?') && db.remove('tasks', t.id)} me={me} pName={isMember ? undefined : pName} />
      )}

      {/* Show done tasks toggle */}
      {view !== 'history' && done.length > 0 && (
        <button
          className="mt-5 flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-800"
          onClick={() => setShowDone(!showDone)}
        >
          <ChevronDown size={16} className={cn('transition-transform', showDone && 'rotate-180')} />
          {showDone ? 'Hide' : `Show ${done.length} completed`} task{done.length !== 1 ? 's' : ''}
        </button>
      )}

      {view === 'history' && scoped.length === 0 && (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-500">
          <History size={22} className="mx-auto mb-2 text-neutral-400" />
          No task history found{historyDate ? ` for ${fmtDate(historyDate)}` : ''}.
        </div>
      )}

      {view !== 'history' && active.length === 0 && (!showDone || done.length === 0) && (
        <div className="mt-6 rounded-2xl border border-dashed border-neutral-300 py-10 text-center text-sm text-neutral-500">
          {done.length > 0 ? 'All tasks for this view are completed! 🎉' : `No tasks scheduled for ${date === today ? 'today' : fmtDay(date)}.`}
          <div className="mt-3">
            <Button onClick={() => setEditing({ due_date: date })}><Plus size={15} /> Create task</Button>
          </div>
        </div>
      )}

      {editing && <TaskModal initial={editing} onClose={() => setEditing(null)} team={isMember ? [me] : team} defaultDue={date} />}
    </div>
  );
}

function TaskList({
  tasks, refDate, canEdit, onDone, onStatus, onEdit, onDelete, me, pName,
}: {
  tasks: Task[];
  refDate: string;
  canEdit: (t: Task) => boolean;
  onDone: (t: Task) => void;
  onStatus: (t: Task, s: TaskStatus) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  me: import('@/lib/types').Profile;
  pName?: (id: string | null) => string | undefined;
}) {
  if (!tasks.length) return null;

  return (
    <div className="space-y-2">
      {tasks.map((t) => {
        const done = t.status === 'done';
        const overdue = !done && t.due_date && t.due_date < refDate;
        const dueToday = !done && t.due_date === refDate;
        const edit = canEdit(t);

        return (
          <div
            key={t.id}
            className={cn(
              'flex flex-wrap items-center gap-3 rounded-2xl border p-3 transition sm:flex-nowrap',
              done ? 'border-neutral-100 bg-neutral-50 opacity-75' : overdue ? 'border-rose-300 bg-rose-50' : 'border-neutral-200 bg-surface',
            )}
          >
            {/* Done toggle */}
            <button
              onClick={() => edit && onDone(t)}
              disabled={!edit}
              aria-label={done ? 'Mark not done' : 'Mark done'}
              className={cn(
                'grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90',
                done ? 'border-emerald-500 bg-emerald-500 text-white' : overdue ? 'border-rose-400 hover:border-emerald-500' : 'border-neutral-300 hover:border-emerald-500 disabled:cursor-default',
              )}
            >
              {done && <Check size={14} strokeWidth={3} />}
            </button>

            {/* Title + meta */}
            <div className="min-w-0 flex-1">
              <div className={cn('text-sm font-medium leading-snug', done && 'line-through', overdue && 'text-rose-800')}>{t.title}</div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {pName && t.assignee_id && <span className="text-xs text-neutral-500">{pName(t.assignee_id)?.split(' ')[0]}</span>}
                <Badge tone={t.priority === 'high' ? 'red' : t.priority === 'medium' ? 'amber' : 'neutral'}>{t.priority}</Badge>
                {overdue && <Badge tone="red">Overdue · {fmtDate(t.due_date)}</Badge>}
                {dueToday && <Badge tone="amber">Due {refDate === todayStr() ? 'today' : fmtDate(refDate)}</Badge>}
                {!overdue && !dueToday && t.due_date && !done && <span className="text-xs text-neutral-400">{fmtDate(t.due_date)}</span>}
                {done && t.completed_at && <span className="text-xs text-neutral-400">Done {fmtDate(t.completed_at)}</span>}
              </div>
            </div>

            {/* Status select */}
            {edit && (
              <Select
                className="w-28 shrink-0 py-1 text-xs"
                value={t.status}
                onChange={(e) => onStatus(t, e.target.value as TaskStatus)}
              >
                {STATUS_COLS.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}</option>
                ))}
              </Select>
            )}

            {/* Edit / reschedule date */}
            {edit && (
              <button
                className="shrink-0 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                onClick={() => onEdit(t)}
                aria-label="Edit task"
                title="Edit task or change date"
              >
                <Pencil size={14} />
              </button>
            )}

            {/* Delete */}
            {(t.created_by === me.id || me.role === 'super_admin') && (
              <button
                className="shrink-0 rounded-lg p-1.5 text-neutral-300 hover:bg-rose-50 hover:text-rose-600"
                onClick={() => onDelete(t)}
                aria-label="Delete"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TaskModal({ initial, onClose, team, defaultDue }: { initial: Partial<Task>; onClose: () => void; team: import('@/lib/types').Profile[]; defaultDue: string }) {
  const { me } = useMe();
  const isEdit = !!initial.id;
  const objectives = useTable('objectives');
  const krs = useTable('key_results');
  const [title, setTitle] = useState(initial.title ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [assignee, setAssignee] = useState(initial.assignee_id ?? me.id);
  const [priority, setPriority] = useState<Task['priority']>(initial.priority ?? 'medium');
  const [status, setStatus] = useState<TaskStatus>(initial.status ?? 'todo');
  const [due, setDue] = useState(initial.due_date ?? defaultDue);
  const [kr, setKr] = useState(initial.key_result_id ?? '');
  const [err, setErr] = useState('');
  const toast = useToast();

  const ownerKrs = krs.rows.filter((k) => objectives.rows.find((o) => o.id === k.objective_id)?.owner_id === assignee);

  async function save() {
    if (!title.trim()) return setErr('Title is required');
    try {
      const a = team.find((p) => p.id === assignee);
      if (isEdit && initial.id) {
        await db.update('tasks', initial.id, {
          title: title.trim(),
          description,
          assignee_id: assignee,
          department_id: a?.department_id ?? initial.department_id ?? null,
          priority,
          status,
          due_date: due || null,
          key_result_id: kr || null,
          completed_at: status === 'done' ? (initial.completed_at ?? new Date().toISOString()) : null,
        });
        toast('Task updated', 'success', title);
      } else {
        await db.insert('tasks', {
          title: title.trim(), description, assignee_id: assignee, department_id: a?.department_id ?? null,
          status, priority, due_date: due || null, key_result_id: kr || null,
          created_by: me.id, self_added: false, log_date: null, minutes: 0,
          completed_at: status === 'done' ? new Date().toISOString() : null,
        });
        if (assignee !== me.id) await notify([assignee], { title: `New task from ${firstName(me.full_name)}`, body: title, link: '/tasks', kind: 'task' });
        toast('Task created', 'success', title);
      }
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? 'Edit task' : 'New task'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save}>{isEdit ? 'Save changes' : 'Create task'}</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus placeholder="What needs to be done?" />
        </Field>
        <Field label="Details (optional)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Assignee">
            <Select value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={me.role === 'member'}>
              {team.map((p) => (
                <option key={p.id} value={p.id}>{p.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
              {STATUS_COLS.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as Task['priority'])}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </Select>
          </Field>
          <Field label="Due date">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
          <Field label="Link to key result" className="sm:col-span-2">
            <Select value={kr} onChange={(e) => setKr(e.target.value)}>
              <option value="">None</option>
              {ownerKrs.map((k) => (
                <option key={k.id} value={k.id}>{k.title}</option>
              ))}
            </Select>
          </Field>
        </div>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
