'use client';
import { useEffect, useState } from 'react';
import { useMe } from '@/lib/auth';
import { DATA_MODE, db } from '@/lib/data';
import { Download, Eye, EyeOff, ShieldAlert, Volume2 } from 'lucide-react';
import { isSoundEnabled, playSfx, setSoundEnabled } from '@/lib/delight';
import { todayStr } from '@/lib/format';
import { useTable } from '@/lib/hooks';
import { errMsg, fmtDate } from '@/lib/format';
import { ROLE_LABEL } from '@/lib/types';
import { Avatar, Badge, Button, Card, ErrorNote, Field, Input, PageHeader, Switch } from '@/components/ui';

export default function ProfilePage() {
  const { me, refresh } = useMe();
  const departments = useTable('departments');
  const profiles = useTable('profiles');
  const [name, setName] = useState(me.full_name);
  const [phone, setPhone] = useState(me.phone);
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [sfxOn, setSfxOn] = useState(true);
  useEffect(() => setSfxOn(isSoundEnabled()), []);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const dept = departments.rows.find((d) => d.id === me.department_id);
  const mgr = profiles.rows.find((p) => p.id === me.manager_id);

  async function saveProfile() {
    setErr('');
    try {
      await db.update('profiles', me.id, { full_name: name, phone });
      await refresh();
      setMsg('Profile saved');
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  async function savePw() {
    setErr('');
    if (pw.length < 8) return setErr('Password must be at least 8 characters');
    if (pw !== pw2) return setErr('Passwords do not match');
    try {
      await db.changePassword(pw);
      setPw('');
      setPw2('');
      setMsg('Password changed');
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="My profile" />
      <Card className="mb-5">
        <div className="flex items-center gap-4">
          <Avatar name={me.full_name} size={60} />
          <div>
            <div className="text-lg font-semibold">{me.full_name}</div>
            <div className="text-sm text-neutral-500">
              {me.designation} · {dept?.name ?? 'No department'}
            </div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-neutral-500">
              <Badge>{ROLE_LABEL[me.role]}</Badge>
              <span>{me.employee_code}</span>
              <span>Joined {fmtDate(me.join_date)}</span>
              {mgr && <span>Reports to {mgr.full_name}</span>}
            </div>
          </div>
        </div>
      </Card>
      {msg && <div className="mb-4 rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{msg}</div>}
      <ErrorNote text={err} />
      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <Card title="Details">
          <div className="space-y-3">
            <Field label="Full name">
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Phone">
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Email" hint="Ask a Super Admin to change your email">
              <Input value={me.email} disabled />
            </Field>
            <Button onClick={saveProfile}>Save</Button>
          </div>
        </Card>
        <Card title="Change password">
          <div className="space-y-3">
            <Field label="New password">
              <div className="relative">
                <Input type={showPw ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} className="pr-10" />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-neutral-400 hover:text-neutral-700"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label="Confirm">
              <div className="relative">
                <Input type={showPw2 ? 'text' : 'password'} value={pw2} onChange={(e) => setPw2(e.target.value)} className="pr-10" />
                <button
                  type="button"
                  onClick={() => setShowPw2((v) => !v)}
                  aria-label={showPw2 ? 'Hide password' : 'Show password'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1 text-neutral-400 hover:text-neutral-700"
                >
                  {showPw2 ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Button onClick={savePw}>Update password</Button>
          </div>
        </Card>
      </div>
      <Card title="Sound effects (SFX)" className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium">Celebration & feedback sounds</div>
            <div className="text-xs text-neutral-500">Gentle chimes on check-in, check-out, task completions, and OKR/KPI wins.</div>
          </div>
          <div className="flex items-center gap-3">
            <Button size="sm" variant="secondary" type="button" onClick={() => playSfx('achievement', true)}>
              <Volume2 size={14} /> Test
            </Button>
            <Switch
              checked={sfxOn}
              onChange={(v) => {
                setSfxOn(v);
                setSoundEnabled(v);
                if (v) playSfx('task_done', true);
              }}
              label="Celebration & feedback sounds"
            />
          </div>
        </div>
      </Card>
      {DATA_MODE === 'demo' && <ExportMine />}
    </div>
  );
}

/** Demo mode keeps data in each browser. This file is how it gets into the live database later. */
function ExportMine() {
  const { me } = useMe();
  const [done, setDone] = useState('');
  async function run() {
    const data = (await db.exportAll?.()) ?? {};
    const own = ['attendance', 'breaks', 'tasks', 'kpi_entries', 'leave_requests', 'announcement_reads', 'task_comments', 'kudos', 'messages'];
    const mine: Record<string, number> = {};
    for (const t of own) {
      const rows = (data[t] ?? []) as { user_id?: string; assignee_id?: string; created_by?: string; from_id?: string; sender_id?: string }[];
      mine[t] = rows.filter((r) => [r.user_id, r.assignee_id, r.created_by, r.from_id, r.sender_id].includes(me.id)).length;
    }
    // selfie photos taken in this browser (only mine; others' stay private)
    let files: Record<string, string> = {};
    try {
      const all = JSON.parse(localStorage.getItem('zlaqa_os_demo_files') || '{}') as Record<string, string>;
      files = Object.fromEntries(Object.entries(all).filter(([k]) => k.startsWith(me.id + '/')));
    } catch {
      /* none */
    }
    const payload = {
      files,
      _meta: { app: 'zlaqa-team-os', format: 1, data_version: 3, exported_at: new Date().toISOString(), exported_by: { id: me.id, email: me.email, name: me.full_name, role: me.role }, my_counts: mine },
      data,
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `zlaqa-export-${me.email.split('@')[0]}-${todayStr()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    setDone(`Saved. ${mine.attendance ?? 0} attendance days and ${mine.tasks ?? 0} tasks of yours are in the file.`);
  }
  return (
    <Card className="mt-5 border-amber-300 bg-amber-50/60 dark:bg-amber-500/10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <ShieldAlert className="shrink-0 text-amber-600" />
        <div className="flex-1">
          <div className="font-semibold">Back up my data</div>
          <p className="text-sm text-neutral-600">
            We are in demo mode, so your check-ins live only in this browser on this device. Download a backup now and then, and send it to the Super Admin when we move to the live system. Never clear this browser&apos;s site data.
          </p>
          {done && <p className="mt-1 text-sm font-medium text-emerald-700">{done}</p>}
        </div>
        <Button onClick={run}>
          <Download size={16} /> Export my data
        </Button>
      </div>
    </Card>
  );
}
