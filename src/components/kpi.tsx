'use client';
// KPI building blocks: card with progress + trend, log sheet, assign modal, library editor.
import { useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import { db } from '@/lib/data';
import { useToast } from '@/lib/toast';
import { confetti, playSfx } from '@/lib/delight';
import { errMsg } from '@/lib/format';
import { achievement, fmtKpi, kpiActual, kpiTone, periodRange, type KpiData } from '@/lib/kpi';
import { KPI_SOURCES, type Department, type KpiAssignment, type KpiDefinition, type OrgSettings, type Profile } from '@/lib/types';
import { Avatar, Badge, Button, ErrorNote, Field, Input, Modal, Select, Textarea, Toggle, cn } from './ui';

const PERIOD_LABEL = { daily: 'per day', weekly: 'per week', monthly: 'per month' } as const;

export function KpiCard({ a, def, data, settings, onLog }: { a: KpiAssignment; def: KpiDefinition; data: KpiData; settings: OrgSettings; onLog?: () => void }) {
  const r = periodRange(def.period);
  const actual = kpiActual(a, def, data, r, settings);
  const ach = achievement(actual, a.target, def.direction);
  const tone = kpiTone(ach);
  const trend = [5, 4, 3, 2, 1, 0].map((o) => {
    const rr = periodRange(def.period, new Date(), -o);
    return achievement(kpiActual(a, def, data, rr, settings), a.target, def.direction) ?? 0;
  });
  const bar = tone === 'green' ? 'bg-emerald-500' : tone === 'amber' ? 'bg-amber-500' : tone === 'red' ? 'bg-rose-500' : 'bg-neutral-300';
  return (
    <div className="card-hover flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-surface p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-snug">{def.name}</div>
          <div className="text-xs text-neutral-500">
            {r.label} · target {fmtKpi(a.target, def.unit)} {PERIOD_LABEL[def.period]}
            {def.direction === 'down' && ' · lower is better'}
          </div>
        </div>
        {def.source === 'manual' ? <Badge>Manual</Badge> : <Badge tone="teal"><Zap size={10} /> Auto</Badge>}
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">{fmtKpi(actual, def.unit)}</div>
        <div className={cn('text-sm font-semibold tabular-nums', tone === 'green' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : tone === 'red' ? 'text-rose-600' : 'text-neutral-400')}>
          {ach === null ? 'no data yet' : `${Math.round(ach)}%`}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
        <div className={cn('h-full rounded-full transition-[width] duration-700', bar)} style={{ width: `${Math.min(100, ach ?? 0)}%` }} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="flex h-8 items-end gap-1" title="Last 6 periods">
          {trend.map((v, i) => (
            <div key={i} className={cn('w-2.5 rounded-sm', i === 5 ? bar : 'bg-neutral-200')} style={{ height: `${Math.max(8, Math.min(100, v))}%` }} />
          ))}
        </div>
        {onLog && def.source === 'manual' && (
          <Button size="sm" onClick={onLog}>
            <Plus size={14} /> Log
          </Button>
        )}
      </div>
    </div>
  );
}

export function LogKpiSheet({ a, def, me, onClose }: { a: KpiAssignment; def: KpiDefinition; me: Profile; onClose: () => void }) {
  const toast = useToast();
  const r = periodRange(def.period);
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  async function save() {
    const v = Number(value);
    if (value === '' || Number.isNaN(v)) return setErr('Enter a number');
    try {
      await db.insert('kpi_entries', { assignment_id: a.id, user_id: a.user_id, period_start: r.start, value: v, note: note.trim() });
      toast('KPI logged', 'success', `${def.name}: ${fmtKpi(v, def.unit)}`);
      if (v >= a.target && def.direction === 'up') {
        confetti({ count: 70 });
        playSfx('achievement');
      } else {
        playSfx('pop');
      }
      onClose();
    } catch (x) {
      setErr(errMsg(x));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={`Log · ${def.name}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-500">
          {r.label}. {def.aggregate === 'sum' ? 'Each entry adds to this period’s total.' : 'The latest entry is this period’s value.'} Logged {me.id === a.user_id ? 'by you' : 'for this person'}.
        </p>
        <Field label={`Value${def.unit ? ` (${def.unit})` : ''}`}>
          <Input type="number" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="h-14 text-2xl" />
        </Field>
        <Field label="Note (optional)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}

export function AssignKpiModal({ defs, people, me, existing, onClose }: { defs: KpiDefinition[]; people: Profile[]; me: Profile; existing: KpiAssignment[]; onClose: () => void }) {
  const toast = useToast();
  const active = defs.filter((d) => d.active);
  const [kpiId, setKpiId] = useState(active[0]?.id ?? '');
  const def = defs.find((d) => d.id === kpiId);
  const [target, setTarget] = useState<string>(def ? String(def.default_target) : '');
  const [weight, setWeight] = useState('1');
  const [sel, setSel] = useState<string[]>([]);
  const [err, setErr] = useState('');
  const pool = people.filter((p) => p.tracking?.kpis);
  const others = people.filter((p) => !p.tracking?.kpis);

  async function save() {
    if (!def) return setErr('Pick a KPI');
    if (!sel.length) return setErr('Pick at least one person');
    try {
      let n = 0;
      for (const uid of sel) {
        if (existing.some((x) => x.user_id === uid && x.kpi_id === def.id && x.active)) continue;
        await db.insert('kpi_assignments', { user_id: uid, kpi_id: def.id, target: Number(target) || 0, weight: Number(weight) || 1, active: true, created_by: me.id });
        n++;
      }
      toast(n ? `KPI assigned to ${n} ${n === 1 ? 'person' : 'people'}` : 'Already assigned', n ? 'success' : 'info', def.name);
      onClose();
    } catch (x) {
      setErr(errMsg(x));
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Assign a KPI"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Assign</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="KPI" className="sm:col-span-2">
            <Select
              value={kpiId}
              onChange={(e) => {
                setKpiId(e.target.value);
                const d = defs.find((x) => x.id === e.target.value);
                if (d) setTarget(String(d.default_target));
              }}
            >
              {active.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} · {d.source === 'manual' ? 'manual' : 'auto'} · {d.period}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={`Target${def?.unit ? ` (${def.unit})` : ''}`}>
            <Input type="number" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          </Field>
          <Field label="Weight" hint="How much it counts in the KPI score">
            <Input type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-600">
            <span>People with KPIs switched on ({sel.length} selected)</span>
            <button className="underline" onClick={() => setSel(sel.length === pool.length ? [] : pool.map((p) => p.id))}>
              {sel.length === pool.length ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2">
            {pool.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 p-2.5 text-sm hover:bg-neutral-50">
                <input type="checkbox" className="h-4 w-4" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} />
                <Avatar name={p.full_name} size={24} />
                <span className="truncate">{p.full_name}</span>
              </label>
            ))}
          </div>
          {others.length > 0 && <p className="mt-2 text-xs text-neutral-500">{others.length} people have KPIs switched off. Turn KPIs on for them in Employees → Edit → What we track.</p>}
        </div>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}

export function KpiDefModal({ initial, departments, me, onClose }: { initial: Partial<KpiDefinition>; departments: Department[]; me: Profile; onClose: () => void }) {
  const toast = useToast();
  const [f, setF] = useState({
    name: initial.name ?? '', description: initial.description ?? '', unit: initial.unit ?? '', direction: initial.direction ?? 'up',
    period: initial.period ?? 'weekly', source: initial.source ?? 'manual', aggregate: initial.aggregate ?? 'sum',
    default_target: String(initial.default_target ?? ''), department_id: initial.department_id ?? (me.role === 'admin' ? me.department_id ?? '' : ''), active: initial.active ?? true,
  });
  const [err, setErr] = useState('');
  const set = (k: keyof typeof f, v: string | boolean) => setF({ ...f, [k]: v });
  async function save() {
    if (!f.name.trim()) return setErr('Name is required');
    const src = KPI_SOURCES.find((s) => s.id === f.source);
    const row = {
      name: f.name.trim(), description: f.description, unit: f.unit || src?.unit || '', direction: f.direction as 'up' | 'down', period: f.period as KpiDefinition['period'],
      source: f.source as KpiDefinition['source'], aggregate: f.aggregate as 'sum' | 'latest', default_target: Number(f.default_target) || 0,
      department_id: f.department_id || null, active: f.active,
    };
    try {
      if (initial.id) await db.update('kpi_definitions', initial.id, row);
      else await db.insert('kpi_definitions', { ...row, created_by: me.id });
      toast(initial.id ? 'KPI updated' : 'KPI added to the library', 'success', row.name);
      onClose();
    } catch (x) {
      setErr(errMsg(x));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={initial.id ? 'Edit KPI' : 'New KPI'}
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2">
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Clinic calls" />
        </Field>
        <Field label="How it is measured" className="sm:col-span-2">
          <Select value={f.source} onChange={(e) => set('source', e.target.value)}>
            {KPI_SOURCES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Period">
          <Select value={f.period} onChange={(e) => set('period', e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </Select>
        </Field>
        <Field label="Default target">
          <Input type="number" inputMode="decimal" value={f.default_target} onChange={(e) => set('default_target', e.target.value)} />
        </Field>
        <Field label="Unit">
          <Input value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="calls, %, ₹, h…" />
        </Field>
        <Field label="Better when">
          <Select value={f.direction} onChange={(e) => set('direction', e.target.value)}>
            <option value="up">Higher</option>
            <option value="down">Lower</option>
          </Select>
        </Field>
        {f.source === 'manual' && (
          <Field label="Several entries in one period">
            <Select value={f.aggregate} onChange={(e) => set('aggregate', e.target.value)}>
              <option value="sum">Add them up</option>
              <option value="latest">Use the latest</option>
            </Select>
          </Field>
        )}
        <Field label="Department">
          <Select value={f.department_id} onChange={(e) => set('department_id', e.target.value)} disabled={me.role === 'admin'}>
            <option value="">Any department</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Description" className="sm:col-span-2">
          <Textarea rows={2} value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Active" hint="Inactive KPIs stay in history but can’t be assigned" />
        </div>
      </div>
      <div className="mt-4">
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
