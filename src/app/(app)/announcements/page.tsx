'use client';
import { useState } from 'react';
import { BookOpenCheck, CheckCircle2, Pin, Plus, Trash2, Users, X } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/data';
import { useTable } from '@/lib/hooks';
import { buzz } from '@/lib/delight';
import { errMsg, fmtDateTime } from '@/lib/format';
import { notify } from '@/lib/notify';
import { orgOn } from '@/lib/features';
import { isAdminOrAbove } from '@/lib/permissions';
import type { Announcement, AnnouncementRead, Profile } from '@/lib/types';
import { Avatar, Badge, Button, Card, Empty, ErrorNote, Fab, Field, Input, Modal, PageHeader, Select, Tabs, Textarea, Toggle, cn } from '@/components/ui';

const REACTIONS = ['👍', '❤️', '🎉', '👏'];
type Filter = 'all' | 'unread' | 'polls';

export default function AnnouncementsPage() {
  const { me, settings } = useMe();
  const ann = useTable('announcements', { order: ['created_at', 'desc'] });
  const reads = useTable('announcement_reads');
  const profiles = useTable('profiles');
  const departments = useTable('departments', { order: ['name', 'asc'] });
  const [creating, setCreating] = useState(false);
  const [readers, setReaders] = useState<Announcement | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const admin = isAdminOrAbove(me);
  const polls = orgOn(settings, 'polls');

  const mineRead = (id: string) => reads.rows.find((r) => r.announcement_id === id && r.user_id === me.id);
  const list = ann.rows
    .filter((a) => !a.department_id || a.department_id === me.department_id || admin)
    .filter((a) => filter === 'all' || (filter === 'unread' ? !mineRead(a.id)?.read_at : a.poll_options?.length))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));

  async function upsert(a: Announcement, patch: Partial<AnnouncementRead>) {
    buzz();
    const r = mineRead(a.id);
    if (r) await db.update('announcement_reads', r.id, patch);
    else await db.insert('announcement_reads', { announcement_id: a.id, user_id: me.id, read_at: null, reaction: null, vote: null, ...patch });
  }

  const audienceOf = (a: Announcement) => profiles.rows.filter((p) => p.status === 'active' && (!a.department_id || p.department_id === a.department_id));

  return (
    <div>
      <PageHeader
        title="Announcements"
        subtitle="Company and department news. Important posts ask you to confirm you read them."
        actions={
          admin && (
            <Button onClick={() => setCreating(true)} className="hidden md:inline-flex">
              <Plus size={16} /> New announcement
            </Button>
          )
        }
      />
      <div className="mb-4">
        <Tabs<Filter>
          value={filter}
          onChange={setFilter}
          tabs={[
            { id: 'all', label: 'All' },
            { id: 'unread', label: `Unread (${ann.rows.filter((a) => (!a.department_id || a.department_id === me.department_id || admin) && !mineRead(a.id)?.read_at).length})` },
            ...(polls ? [{ id: 'polls' as Filter, label: 'Polls' }] : []),
          ]}
        />
      </div>
      {list.length ? (
        <div className="stagger space-y-4">
          {list.map((a) => {
            const d = departments.rows.find((x) => x.id === a.department_id);
            const author = profiles.rows.find((p) => p.id === a.created_by)?.full_name;
            const rs = reads.rows.filter((r) => r.announcement_id === a.id);
            const mine = mineRead(a.id);
            const audience = audienceOf(a);
            const readN = rs.filter((r) => r.read_at && audience.some((p) => p.id === r.user_id)).length;
            const votes = rs.filter((r) => r.vote !== null && r.vote !== undefined);
            const isPoll = polls && (a.poll_options?.length ?? 0) > 1;
            return (
              <Card
                key={a.id}
                className={cn(a.priority === 'urgent' ? 'ring-2 ring-rose-300' : a.priority === 'important' ? 'ring-2 ring-amber-200' : a.pinned ? 'ring-1 ring-amber-200' : '')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {a.priority === 'urgent' && <Badge tone="red">Urgent</Badge>}
                      {a.priority === 'important' && <Badge tone="amber">Important</Badge>}
                      {a.pinned && <Badge tone="amber">Pinned</Badge>}
                      {isPoll && <Badge tone="violet">Poll</Badge>}
                      <Badge tone={d ? 'violet' : 'brand'}>{d ? d.name : 'Everyone'}</Badge>
                      {!mine?.read_at && <span className="h-2 w-2 rounded-full bg-emerald-500" title="Unread" />}
                    </div>
                    <h3 className="mt-2 text-lg font-semibold leading-snug">{a.title}</h3>
                  </div>
                  {admin && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => db.update('announcements', a.id, { pinned: !a.pinned })} aria-label="Pin">
                        <Pin size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => confirm('Delete announcement?') && db.remove('announcements', a.id)} aria-label="Delete">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-neutral-700">{a.body}</p>

                {isPoll && (
                  <div className="mt-4 space-y-2">
                    {a.poll_options.map((o, i) => {
                      const n = votes.filter((v) => v.vote === i).length;
                      const pct = votes.length ? (n / votes.length) * 100 : 0;
                      const mineV = mine?.vote === i;
                      return (
                        <button
                          key={i}
                          onClick={() => upsert(a, { vote: mineV ? null : i, read_at: mine?.read_at ?? new Date().toISOString() })}
                          className={cn('relative w-full overflow-hidden rounded-xl border px-3 py-3 text-left text-sm transition active:scale-[.99]', mineV ? 'border-brand' : 'border-neutral-200 hover:border-neutral-400')}
                        >
                          <span className="absolute inset-y-0 left-0 bg-brand/10 transition-[width] duration-500" style={{ width: `${pct}%` }} />
                          <span className="relative flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 font-medium">
                              {mineV && <CheckCircle2 size={16} className="text-emerald-600" />}
                              {o}
                            </span>
                            <span className="tabular-nums text-neutral-500">
                              {n} · {Math.round(pct)}%
                            </span>
                          </span>
                        </button>
                      );
                    })}
                    <div className="text-xs text-neutral-500">
                      {votes.length} vote{votes.length === 1 ? '' : 's'} · tap again to remove your vote
                    </div>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {REACTIONS.map((e) => {
                    const n = rs.filter((r) => r.reaction === e).length;
                    const on = mine?.reaction === e;
                    return (
                      <button
                        key={e}
                        onClick={() => upsert(a, { reaction: on ? null : e })}
                        className={cn('flex h-9 items-center gap-1 rounded-full border px-3 text-sm transition active:scale-90', on ? 'border-brand bg-brand/10' : 'border-neutral-200 hover:border-neutral-400')}
                        aria-label={`React ${e}`}
                      >
                        {e} {n > 0 && <span className="text-xs tabular-nums text-neutral-600">{n}</span>}
                      </button>
                    );
                  })}
                  <div className="ml-auto flex items-center gap-2">
                    {admin && (
                      <button onClick={() => setReaders(a)} className="flex items-center gap-1 rounded-full px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100">
                        <Users size={13} /> Read by {readN}/{audience.length}
                      </button>
                    )}
                    {mine?.read_at ? (
                      <span className="flex items-center gap-1 text-xs text-emerald-600">
                        <CheckCircle2 size={14} /> Read
                      </span>
                    ) : (
                      <Button size="sm" variant={a.require_ack ? 'primary' : 'secondary'} onClick={() => upsert(a, { read_at: new Date().toISOString() })}>
                        <BookOpenCheck size={14} /> {a.require_ack ? 'I have read this' : 'Mark read'}
                      </Button>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
                  <Avatar name={author} size={20} /> {author} · {fmtDateTime(a.created_at)}
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Empty text={filter === 'unread' ? 'You are all caught up.' : 'No announcements yet.'} />
      )}
      {admin && (
        <Fab onClick={() => setCreating(true)} label="New announcement">
          <Plus size={24} />
        </Fab>
      )}
      {creating && <NewAnnouncement onClose={() => setCreating(false)} departments={departments.rows} people={profiles.rows} />}
      {readers && <Readers a={readers} reads={reads.rows} audience={audienceOf(readers)} onClose={() => setReaders(null)} />}
    </div>
  );
}

function Readers({ a, reads, audience, onClose }: { a: Announcement; reads: AnnouncementRead[]; audience: Profile[]; onClose: () => void }) {
  const readIds = new Set(reads.filter((r) => r.announcement_id === a.id && r.read_at).map((r) => r.user_id));
  const yes = audience.filter((p) => readIds.has(p.id));
  const no = audience.filter((p) => !readIds.has(p.id));
  const { me } = useMe();
  return (
    <Modal open onClose={onClose} title={`Who read “${a.title}”`}>
      <div className="space-y-4">
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Not yet ({no.length})</div>
          <div className="flex flex-wrap gap-2">
            {no.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-amber-50 py-1 pl-1 pr-2.5 text-sm dark:bg-amber-500/10">
                <Avatar name={p.full_name} size={22} /> {p.full_name.split(' ')[0]}
              </span>
            ))}
            {!no.length && <span className="text-sm text-emerald-600">Everyone has read it 🎉</span>}
          </div>
          {no.length > 0 && (
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={() => {
                notify(no.map((p) => p.id).filter((id) => id !== me.id), { title: `Reminder: please read “${a.title}”`, link: '/announcements', kind: 'announcement' });
                onClose();
              }}
            >
              Send a reminder
            </Button>
          )}
        </div>
        <div>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">Read ({yes.length})</div>
          <div className="flex flex-wrap gap-2">
            {yes.map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-emerald-50 py-1 pl-1 pr-2.5 text-sm dark:bg-emerald-500/10">
                <Avatar name={p.full_name} size={22} /> {p.full_name.split(' ')[0]}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function NewAnnouncement({ onClose, departments, people }: { onClose: () => void; departments: { id: string; name: string }[]; people: Profile[] }) {
  const { me, settings } = useMe();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dept, setDept] = useState(me.role === 'admin' ? me.department_id ?? '' : '');
  const [pinned, setPinned] = useState(false);
  const [priority, setPriority] = useState<Announcement['priority']>('normal');
  const [ack, setAck] = useState(false);
  const [options, setOptions] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const polls = orgOn(settings, 'polls');
  async function save() {
    if (!title.trim()) return setErr('Title is required');
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (options.length && opts.length < 2) return setErr('A poll needs at least 2 options');
    try {
      await db.insert('announcements', { title, body, department_id: dept || null, pinned, priority, require_ack: ack, poll_options: opts, created_by: me.id });
      const to = people.filter((p) => p.status === 'active' && p.id !== me.id && (!dept || p.department_id === dept)).map((p) => p.id);
      notify(to, { title: `${priority === 'urgent' ? '🚨 ' : priority === 'important' ? '📌 ' : ''}${title}`, body: body.slice(0, 100), link: '/announcements', kind: 'announcement' });
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="New announcement"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Publish</Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Message">
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Audience">
            <Select value={dept} onChange={(e) => setDept(e.target.value)} disabled={me.role === 'admin'}>
              <option value="">Everyone</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select
              value={priority}
              onChange={(e) => {
                const v = e.target.value as Announcement['priority'];
                setPriority(v);
                if (v !== 'normal') setAck(true);
              }}
            >
              <option value="normal">Normal</option>
              <option value="important">Important (yellow, top of dashboard)</option>
              <option value="urgent">Urgent (red, top of dashboard)</option>
            </Select>
          </Field>
        </div>
        <Toggle checked={ack} onChange={setAck} label="Ask people to confirm they read it" hint="Shows “I have read this” and tracks who has not" />
        <Toggle checked={pinned} onChange={setPinned} label="Pin to top" />
        {polls && (
          <div className="rounded-2xl border border-neutral-200 p-3">
            <div className="mb-2 flex items-center justify-between text-sm font-medium">
              Poll {options.length ? `(${options.length} options)` : '(optional)'}
              {options.length < 6 && (
                <button className="text-xs underline" onClick={() => setOptions(options.length ? [...options, ''] : ['', ''])}>
                  {options.length ? 'Add option' : 'Add a poll'}
                </button>
              )}
            </div>
            <div className="space-y-2">
              {options.map((o, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={o} onChange={(e) => setOptions(options.map((x, k) => (k === i ? e.target.value : x)))} placeholder={`Option ${i + 1}`} />
                  <button onClick={() => setOptions(options.filter((_, k) => k !== i))} className="rounded-lg px-2 text-neutral-400 hover:text-rose-600" aria-label="Remove option">
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
