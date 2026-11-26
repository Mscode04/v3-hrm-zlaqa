'use client';
// Daily log building blocks: quick add, task rows with one-tap done, comments.
import { useState, type FormEvent } from 'react';
import { Check, Clock3, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/data';
import { useTable } from '@/lib/hooks';
import { useToast } from '@/lib/toast';
import { buzz, playSfx } from '@/lib/delight';
import { errMsg, fmtDate, fmtMinutes, timeAgo, todayStr } from '@/lib/format';
import { firstName, notify } from '@/lib/notify';
import type { Profile, Task } from '@/lib/types';
import { Avatar, Badge, Button, ErrorNote, Input, Modal, cn } from './ui';

const MIN_CHOICES = [15, 30, 60, 120];

export function QuickAdd({ me, date = todayStr(), compact }: { me: Profile; date?: string; compact?: boolean }) {
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [minutes, setMinutes] = useState(0);
  const [busy, setBusy] = useState(false);

  async function add(e?: FormEvent) {
    e?.preventDefault();
    const t = title.trim();
    if (!t) return;
    setBusy(true);
    try {
      await db.insert('tasks', {
        title: t, description: '', assignee_id: me.id, department_id: me.department_id, status: 'in_progress', priority: 'medium',
        due_date: null, key_result_id: null, created_by: me.id, self_added: true, log_date: date, minutes, completed_at: null,
      });
      setTitle('');
      setMinutes(0);
      buzz();
      toast('Added to your day', 'success', t);
    } catch (x) {
      toast(errMsg(x), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={add} className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What are you working on? (planned or unplanned)"
          maxLength={160}
          className="h-12 flex-1"
        />
        <Button type="submit" size="lg" disabled={busy || !title.trim()} aria-label="Add task" className="h-12 px-4">
          <Plus size={20} />
        </Button>
      </div>
      {!compact && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          <Clock3 size={13} /> Time spent (optional):
          {MIN_CHOICES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMinutes(minutes === m ? 0 : m)}
              className={cn('rounded-full border px-2.5 py-1 transition', minutes === m ? 'border-transparent bg-brand text-on-brand' : 'border-neutral-300 hover:border-neutral-500')}
            >
              {m < 60 ? `${m}m` : `${m / 60}h`}
            </button>
          ))}
        </div>
      )}
    </form>
  );
}

export function TaskRow({ t, me, canEdit, showWho, who, onComments }: { t: Task; me: Profile; canEdit: boolean; showWho?: boolean; who?: string; onComments?: (t: Task) => void }) {
  const done = t.status === 'done';
  const overdue = !done && t.due_date && t.due_date < todayStr();
  async function toggle() {
    if (!canEdit) return;
    buzz();
    if (!done) playSfx('task_done');
    await db.update('tasks', t.id, done ? { status: 'in_progress', completed_at: null } : { status: 'done', completed_at: new Date().toISOString() });
  }
  async function setMinutes() {
    const v = prompt('Time spent (minutes)', String(t.minutes || ''));
    if (v === null) return;
    const n = Math.max(0, Math.round(Number(v) || 0));
    await db.update('tasks', t.id, { minutes: n });
  }
  return (
    <div className={cn('group flex items-start gap-3 rounded-2xl border border-neutral-200 bg-surface p-3 transition', done && 'opacity-70')}>
      <button
        onClick={toggle}
        disabled={!canEdit}
        aria-label={done ? 'Mark not done' : 'Mark done'}
        className={cn('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 transition active:scale-90', done ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-neutral-300 hover:border-emerald-500')}
      >
        {done && <Check size={16} strokeWidth={3} />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn('text-[15px] leading-snug', done && 'line-through')}>{t.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
          {showWho && who && (
            <span className="flex items-center gap-1">
              <Avatar name={who} size={16} /> {firstName(who)}
            </span>
          )}
          <Badge tone={t.self_added ? 'violet' : 'neutral'}>{t.self_added ? 'Added by me' : 'Assigned'}</Badge>
          {t.due_date && <span className={cn(overdue && 'font-medium text-rose-600')}>due {fmtDate(t.due_date)}</span>}
          <button onClick={setMinutes} disabled={!canEdit} className="flex items-center gap-1 rounded-full px-1.5 py-0.5 hover:bg-neutral-100">
            <Clock3 size={12} /> {t.minutes ? fmtMinutes(t.minutes) : 'add time'}
          </button>
        </div>
      </div>
      <div className="flex items-center gap-1">
        {onComments && (
          <button onClick={() => onComments(t)} className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700" aria-label="Comments">
            <MessageCircle size={16} />
          </button>
        )}
        {t.self_added && t.created_by === me.id && (
          <button onClick={() => confirm('Remove this item?') && db.remove('tasks', t.id)} className="rounded-lg p-1.5 text-neutral-300 hover:bg-rose-50 hover:text-rose-600" aria-label="Remove">
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

export function CommentsSheet({ task, me, people, onClose }: { task: Task; me: Profile; people: Profile[]; onClose: () => void }) {
  const comments = useTable('task_comments', { filter: { task_id: task.id }, order: ['created_at', 'asc'] });
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const name = (id: string) => people.find((p) => p.id === id)?.full_name ?? 'Someone';
  async function send(e: FormEvent) {
    e.preventDefault();
    const b = body.trim();
    if (!b) return;
    try {
      await db.insert('task_comments', { task_id: task.id, user_id: me.id, body: b });
      setBody('');
      const to = [task.assignee_id, task.created_by].filter((x) => x && x !== me.id);
      notify(to, { title: `${firstName(me.full_name)} commented on “${task.title.slice(0, 40)}”`, body: b.slice(0, 100), link: '/today', kind: 'task' });
    } catch (x) {
      setErr(errMsg(x));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Comments"
      footer={
        <form onSubmit={send} className="flex gap-2">
          <Input value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write a comment" maxLength={1000} />
          <Button type="submit" disabled={!body.trim()}>
            Send
          </Button>
        </form>
      }
    >
      <p className="mb-3 rounded-xl bg-neutral-50 px-3 py-2 text-sm">{task.title}</p>
      <div className="space-y-3">
        {comments.rows.map((c) => (
          <div key={c.id} className="flex gap-2">
            <Avatar name={name(c.user_id)} size={28} />
            <div className="min-w-0 flex-1 rounded-2xl bg-neutral-50 px-3 py-2">
              <div className="text-xs font-medium">
                {name(c.user_id)} <span className="font-normal text-neutral-400">· {timeAgo(c.created_at)}</span>
              </div>
              <div className="text-sm">{c.body}</div>
            </div>
          </div>
        ))}
        {!comments.rows.length && <p className="py-4 text-center text-sm text-neutral-500">No comments yet.</p>}
      </div>
      <ErrorNote text={err} />
    </Modal>
  );
}

/** Items that belong to a person's day: assigned tasks due that day or overdue (prioritized), plus self-added logs for that date. */
export function dayItems(tasks: Task[], uid: string, date: string): Task[] {
  return tasks
    .filter(
      (t) =>
        t.assignee_id === uid &&
        ((t.self_added && t.log_date === date) ||
          (!t.self_added && t.due_date && ((t.due_date === date) || (t.due_date < date && t.status !== 'done'))) ||
          (!t.self_added && t.status === 'done' && t.completed_at?.slice(0, 10) === date)),
    )
    .sort(
      (a, b) =>
        Number(a.status === 'done') - Number(b.status === 'done') ||
        Number(a.self_added) - Number(b.self_added) ||
        a.created_at.localeCompare(b.created_at),
    );
}
