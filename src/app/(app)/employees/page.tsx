'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Download, Pencil, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { db } from '@/lib/data';
import { useTable } from '@/lib/hooks';
import { downloadCSV, errMsg, fmtDate, todayStr } from '@/lib/format';
import { canManage, managedTeam } from '@/lib/permissions';
import { DEFAULT_TRACKING, ROLE_LABEL, TRACKING_KEYS, type Department, type Profile, type Role, type Tracking, type TrackingPreset } from '@/lib/types';
import { trackingOf } from '@/lib/features';
import { useToast } from '@/lib/toast';
import { Avatar, Badge, Button, ErrorNote, Field, Input, Modal, PageHeader, RequireRole, Select, Switch, Table, cn, td } from '@/components/ui';

export default function EmployeesPage() {
  return (
    <RequireRole roles={['super_admin', 'admin']}>
      <Employees />
    </RequireRole>
  );
}

function Employees() {
  const { me } = useMe();
  const profiles = useTable('profiles', { order: ['full_name', 'asc'] });
  const departments = useTable('departments', { order: ['name', 'asc'] });
  const [q, setQ] = useState('');
  const [dept, setDept] = useState('all');
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Partial<Profile> | null>(null);
  const presets = useTable('tracking_presets', { order: ['name', 'asc'] });
  const [sel, setSel] = useState<string[]>([]);
  const [bulkPreset, setBulkPreset] = useState('');
  const toast = useToast();
  const activePresets = presets.rows.filter((p) => p.active);
  async function applyBulk() {
    const pr = presets.rows.find((x) => x.id === bulkPreset);
    if (!pr || !sel.length) return;
    for (const id of sel) await db.update('profiles', id, { tracking: { ...pr.tracking }, preset_id: pr.id });
    toast(`“${pr.name}” applied to ${sel.length} ${sel.length === 1 ? 'person' : 'people'}`, 'success');
    setSel([]);
    setBulkPreset('');
  }
  const chips = (p: Profile) => {
    const t = trackingOf(p);
    return (
      <div className="flex flex-wrap gap-1">
        {TRACKING_KEYS.filter((k) => t[k.key]).map((k) => (
          <span key={k.key} className="rounded-md bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
            {k.label.replace(' board', '')}
          </span>
        ))}
      </div>
    );
  };

  const scope = useMemo(() => (me.role === 'super_admin' ? profiles.rows : profiles.rows.filter((p) => p.id === me.id || canManage(me, p))), [me, profiles.rows]);
  const rows = scope.filter(
    (p) =>
      (showInactive || p.status === 'active') &&
      (dept === 'all' || p.department_id === dept) &&
      (!q || `${p.full_name} ${p.email} ${p.employee_code} ${p.designation}`.toLowerCase().includes(q.toLowerCase())),
  );
  const dName = (id: string | null) => departments.rows.find((d) => d.id === id);
  const pName = (id: string | null) => profiles.rows.find((p) => p.id === id)?.full_name;

  return (
    <div>
      <PageHeader
        title="Employees"
        subtitle={`${rows.length} people`}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() =>
                downloadCSV('employees.csv', [
                  ['Code', 'Name', 'Email', 'Role', 'Department', 'Designation', 'Manager', 'Phone', 'Joined', 'Status'],
                  ...rows.map((p) => [p.employee_code, p.full_name, p.email, ROLE_LABEL[p.role], dName(p.department_id)?.name, p.designation, pName(p.manager_id), p.phone, p.join_date, p.status]),
                ])
              }
            >
              <Download size={16} /> CSV
            </Button>
            <Button onClick={() => setEditing({ role: 'member', department_id: me.role === 'admin' ? me.department_id : null, manager_id: me.role === 'admin' ? me.id : null, join_date: todayStr() })}>
              <Plus size={16} /> Add employee
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-auto">
          <Search size={15} className="absolute left-3 top-3 text-neutral-400 sm:top-2.5" />
          <Input className="w-full pl-9 sm:w-64" placeholder="Search name, email, code" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Select className="w-full sm:w-52" value={dept} onChange={(e) => setDept(e.target.value)}>
          <option value="all">All departments</option>
          {departments.rows.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </Select>
        <label className="flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show inactive
        </label>
      </div>
      {sel.length > 0 && (
        <div className="animate-fade-up sticky top-16 z-10 mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-neutral-200 bg-surface p-3 shadow-lg">
          <SlidersHorizontal size={16} />
          <span className="text-sm font-medium">{sel.length} selected</span>
          <Select className="w-full sm:w-56" value={bulkPreset} onChange={(e) => setBulkPreset(e.target.value)}>
            <option value="">Apply a tracking preset…</option>
            {activePresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
          <Button size="sm" onClick={applyBulk} disabled={!bulkPreset}>
            Apply
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSel([])} aria-label="Clear selection">
            <X size={15} />
          </Button>
        </div>
      )}

      {/* phones: cards */}
      <div className="space-y-2 md:hidden">
        {rows.map((p) => {
          const d = dName(p.department_id);
          const can = me.role === 'super_admin' || canManage(me, p);
          return (
            <div key={p.id} className={cn('rounded-2xl border bg-surface p-3', sel.includes(p.id) ? 'border-brand ring-2 ring-brand/20' : 'border-neutral-200')}>
              <div className="flex items-center gap-3">
                {can && <input type="checkbox" className="h-5 w-5" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} aria-label={`Select ${p.full_name}`} />}
                <Link href={`/employees/${p.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar name={p.full_name} size={40} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{p.full_name}</div>
                    <div className="truncate text-xs text-neutral-500">
                      {p.designation}
                      {d ? ` · ${d.name}` : ''}
                    </div>
                  </div>
                </Link>
                {can && (
                  <button onClick={() => setEditing(p)} className="grid h-10 w-10 place-items-center rounded-xl hover:bg-neutral-100" aria-label="Edit">
                    <Pencil size={16} />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-center justify-between gap-2 pl-1">
                {chips(p)}
                {p.status !== 'active' && <Badge>inactive</Badge>}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hidden md:block">
      <Table head={[<input key="all" type="checkbox" aria-label="Select all" checked={!!rows.length && sel.length === rows.filter((p) => me.role === 'super_admin' || canManage(me, p)).length} onChange={(e) => setSel(e.target.checked ? rows.filter((p) => me.role === 'super_admin' || canManage(me, p)).map((p) => p.id) : [])} />, 'Employee', 'Role', 'Department', 'What we track', 'Manager', 'Status', '']}>
        {rows.map((p) => {
          const d = dName(p.department_id);
          return (
            <tr key={p.id} className={cn('hover:bg-neutral-50', sel.includes(p.id) && 'bg-neutral-50')}>
              <td className={td}>
                {(me.role === 'super_admin' || canManage(me, p)) && (
                  <input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} aria-label={`Select ${p.full_name}`} />
                )}
              </td>
              <td className={td}>
                <Link href={`/employees/${p.id}`} className="flex items-center gap-3 hover:underline">
                  <Avatar name={p.full_name} size={32} />
                  <div>
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs text-neutral-500">
                      {p.designation} · {p.employee_code}
                    </div>
                  </div>
                </Link>
              </td>
              <td className={td}>
                <Badge tone={p.role === 'super_admin' ? 'brand' : p.role === 'admin' ? 'violet' : 'neutral'}>{ROLE_LABEL[p.role]}</Badge>
              </td>
              <td className={td}>
                {d && (
                  <span className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full" style={{ background: d.color }} />
                    {d.name}
                  </span>
                )}
              </td>
              <td className={td}>{chips(p)}</td>
              <td className={td}>{pName(p.manager_id) ?? '—'}</td>
              <td className={td}>
                <Badge tone={p.status === 'active' ? 'green' : 'neutral'}>{p.status}</Badge>
              </td>
              <td className={td}>
                {(me.role === 'super_admin' || canManage(me, p)) && (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(p)} aria-label="Edit">
                    <Pencil size={14} />
                  </Button>
                )}
              </td>
            </tr>
          );
        })}
      </Table>
      </div>
      {editing && <EmployeeForm initial={editing} onClose={() => setEditing(null)} departments={departments.rows} profiles={profiles.rows} presets={presets.rows} />}
    </div>
  );
}

function EmployeeForm({ initial, onClose, departments, profiles, presets }: { initial: Partial<Profile>; onClose: () => void; departments: Department[]; profiles: Profile[]; presets: TrackingPreset[] }) {
  const { me } = useMe();
  const isNew = !initial.id;
  const [f, setF] = useState({
    full_name: initial.full_name ?? '', email: initial.email ?? '', password: '', role: (initial.role ?? 'member') as Role,
    department_id: initial.department_id ?? '', manager_id: initial.manager_id ?? '', designation: initial.designation ?? '',
    phone: initial.phone ?? '', employee_code: initial.employee_code ?? '', join_date: initial.join_date ?? todayStr(), status: initial.status ?? 'active',
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const deptPreset = (deptId: string) => presets.find((p) => p.id === departments.find((d) => d.id === deptId)?.default_preset_id && p.active);
  const startPreset = initial.id ? initial.preset_id ?? '' : deptPreset(initial.department_id ?? '')?.id ?? '';
  const [presetId, setPresetId] = useState<string>(startPreset);
  const [tracking, setTracking] = useState<Tracking>(
    initial.id ? trackingOf(initial as Profile) : { ...DEFAULT_TRACKING, ...(presets.find((p) => p.id === startPreset)?.tracking ?? {}) },
  );
  const set = (k: keyof typeof f, v: string) => {
    setF({ ...f, [k]: v });
    if (k === 'department_id' && isNew) {
      const pr = deptPreset(v);
      if (pr) {
        setPresetId(pr.id);
        setTracking({ ...pr.tracking });
      }
    }
  };
  function pickPreset(id: string) {
    setPresetId(id);
    const pr = presets.find((p) => p.id === id);
    if (pr) setTracking({ ...pr.tracking });
  }
  function flip(k: keyof Tracking, v: boolean) {
    setTracking({ ...tracking, [k]: v });
    setPresetId(''); // custom mix
  }
  const isSuper = me.role === 'super_admin';
  const managers = managedTeam(me, profiles).filter((p) => p.role !== 'member' || p.id === me.id);

  async function save() {
    if (!f.full_name.trim()) return setErr('Name is required');
    setBusy(true);
    setErr('');
    try {
      if (isNew) {
        if (f.password.length < 8) throw new Error('Temporary password must be at least 8 characters');
        await db.createUser({
          email: f.email, password: f.password, full_name: f.full_name, role: isSuper ? f.role : 'member',
          department_id: isSuper ? f.department_id || null : me.department_id, manager_id: f.manager_id || null,
          designation: f.designation, phone: f.phone, employee_code: f.employee_code, join_date: f.join_date,
          tracking, preset_id: presetId || null,
        });
      } else {
        await db.update('profiles', initial.id!, {
          full_name: f.full_name, designation: f.designation, phone: f.phone, employee_code: f.employee_code, join_date: f.join_date,
          manager_id: f.manager_id || null, status: f.status as Profile['status'], tracking, preset_id: presetId || null,
          ...(isSuper ? { role: f.role, department_id: f.department_id || null } : {}),
        });
      }
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
      title={isNew ? 'Add employee' : `Edit · ${initial.full_name}`}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : isNew ? 'Create login' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Full name">
          <Input value={f.full_name} onChange={(e) => set('full_name', e.target.value)} />
        </Field>
        <Field label="Work email">
          <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} disabled={!isNew} />
        </Field>
        {isNew && (
          <Field label="Temporary password" hint="Share privately. They can change it in Profile.">
            <Input type="text" value={f.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
        )}
        <Field label="Employee code">
          <Input value={f.employee_code} onChange={(e) => set('employee_code', e.target.value)} placeholder="ZQ-020" />
        </Field>
        <Field label="Designation">
          <Input value={f.designation} onChange={(e) => set('designation', e.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} />
        </Field>
        <Field label="Role">
          <Select value={f.role} onChange={(e) => set('role', e.target.value)} disabled={!isSuper}>
            <option value="member">Member</option>
            <option value="admin">Manager (Admin)</option>
            <option value="super_admin">Super Admin</option>
          </Select>
        </Field>
        <Field label="Department">
          <Select value={f.department_id} onChange={(e) => set('department_id', e.target.value)} disabled={!isSuper}>
            <option value="">None</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Reports to">
          <Select value={f.manager_id} onChange={(e) => set('manager_id', e.target.value)}>
            <option value="">None</option>
            {managers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Joining date">
          <Input type="date" value={f.join_date} onChange={(e) => set('join_date', e.target.value)} />
        </Field>
        {!isNew && (
          <Field label="Status" hint="Inactive users can't sign in">
            <Select value={f.status} onChange={(e) => set('status', e.target.value)}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        )}
      </div>
      <div className="mt-5 rounded-2xl border border-neutral-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">What we track for this person</div>
            <div className="text-xs text-neutral-500">Anything switched off is hidden for them and left out of their score.</div>
          </div>
          <Select className="w-full sm:w-56" value={presetId} onChange={(e) => pickPreset(e.target.value)}>
            <option value="">Custom mix</option>
            {presets
              .filter((p) => p.active || p.id === presetId)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </Select>
        </div>
        <div className="divide-y divide-neutral-100">
          {TRACKING_KEYS.map((k) => (
            <div key={k.key} className="flex items-center justify-between gap-3 py-2.5">
              <div>
                <div className="text-sm font-medium">{k.label}</div>
                <div className="text-xs text-neutral-500">{k.hint}</div>
              </div>
              <Switch checked={tracking[k.key]} onChange={(v) => flip(k.key, v)} label={k.label} />
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4">
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
