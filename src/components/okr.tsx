'use client';
import { useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { db } from '@/lib/data';
import { errMsg } from '@/lib/format';
import { krProgress } from '@/lib/metrics';
import { useToast } from '@/lib/toast';
import { confetti, playSfx } from '@/lib/delight';
import type { Department, KeyResult, MetricType, Objective, OkrLevel, OkrTemplate, OrgSettings, Profile, TemplateKr } from '@/lib/types';
import { Avatar, Button, ErrorNote, Field, Input, Modal, Select, Textarea } from './ui';

export const emptyKr = (): TemplateKr => ({ title: '', metric_type: 'number', start_value: 0, target_value: 100, unit: '', weight: 1 });

export function KrEditor({ value, onChange }: { value: TemplateKr[]; onChange: (v: TemplateKr[]) => void }) {
  const set = (i: number, patch: Partial<TemplateKr>) => onChange(value.map((k, j) => (j === i ? { ...k, ...patch } : k)));
  return (
    <div className="space-y-3">
      {value.map((k, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Key result #{i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label="Remove KR"
              className="text-neutral-400 hover:text-rose-600"
            >
              <Trash2 size={14} /> Remove
            </Button>
          </div>
          <Field label="Title">
            <Input
              placeholder="e.g. Ship therapy dashboard to 50 clinics"
              value={k.title}
              onChange={(e) => set(i, { title: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Metric type" className="col-span-2 sm:col-span-1">
              <Select
                value={k.metric_type}
                onChange={(e) => set(i, { metric_type: e.target.value as MetricType, ...(e.target.value === 'boolean' ? { start_value: 0, target_value: 1 } : {}) })}
              >
                <option value="number">Number</option>
                <option value="percent">Percent (%)</option>
                <option value="currency">Currency</option>
                <option value="boolean">Yes / No</option>
              </Select>
            </Field>
            <Field label="Start">
              <Input
                type="number"
                value={k.start_value}
                onChange={(e) => set(i, { start_value: Number(e.target.value) })}
                disabled={k.metric_type === 'boolean'}
              />
            </Field>
            <Field label="Target">
              <Input
                type="number"
                value={k.target_value}
                onChange={(e) => set(i, { target_value: Number(e.target.value) })}
                disabled={k.metric_type === 'boolean'}
              />
            </Field>
            <Field label="Unit">
              <Input
                placeholder="clinics, %, ₹…"
                value={k.unit}
                onChange={(e) => set(i, { unit: e.target.value })}
              />
            </Field>
            <Field label="Weight">
              <Input
                type="number"
                min={1}
                value={k.weight}
                onChange={(e) => set(i, { weight: Number(e.target.value) || 1 })}
              />
            </Field>
          </div>
        </div>
      ))}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...value, emptyKr()])}>
          <Plus size={14} /> Add key result
        </Button>
        <span className="text-xs text-neutral-400">Tip: Target below start means lower is better (e.g. response time 48h → 24h).</span>
      </div>
    </div>
  );
}

async function createObjectiveWithKrs(o: Partial<Objective>, krs: TemplateKr[]) {
  const obj = await db.insert('objectives', o);
  for (const k of krs.filter((k) => k.title.trim())) {
    await db.insert('key_results', { objective_id: obj.id, title: k.title, metric_type: k.metric_type, start_value: k.start_value, target_value: k.target_value, current_value: k.start_value, unit: k.unit, weight: k.weight });
  }
  return obj;
}

export function ObjectiveModal({
  open, onClose, me, people, departments, settings, objectives,
}: { open: boolean; onClose: () => void; me: Profile; people: Profile[]; departments: Department[]; settings: OrgSettings; objectives: Objective[] }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [level, setLevel] = useState<OkrLevel>('individual');
  const [owner, setOwner] = useState(me.id);
  const [dept, setDept] = useState(me.department_id ?? '');
  const [cycle, setCycle] = useState(settings.current_cycle);
  const [parent, setParent] = useState('');
  const [due, setDue] = useState('');
  const [krs, setKrs] = useState<TemplateKr[]>([emptyKr()]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const levels: OkrLevel[] = me.role === 'super_admin' ? ['company', 'department', 'individual'] : me.role === 'admin' ? ['department', 'individual'] : ['individual'];
  const owners = me.role === 'member' ? people.filter((p) => p.id === me.id) : people;

  async function save() {
    if (!title.trim()) return setErr('Title is required');
    if (!krs.some((k) => k.title.trim())) return setErr('Add at least one key result');
    setBusy(true);
    try {
      const ownerP = people.find((p) => p.id === owner);
      await createObjectiveWithKrs(
        { title, description, level, owner_id: owner, department_id: level === 'company' ? null : dept || ownerP?.department_id || null, cycle, parent_id: parent || null, status: 'on_track', due_date: due || null, created_by: me.id },
        krs,
      );
      setTitle('');
      setDescription('');
      setKrs([emptyKr()]);
      toast('Objective created', 'success', title);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New objective"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Create objective'}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Objective">
          <Input placeholder="e.g. Launch the therapy dashboard to 50 clinics" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </Field>
        <Field label="Why it matters (optional)">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Field label="Level">
            <Select value={level} onChange={(e) => setLevel(e.target.value as OkrLevel)}>
              {levels.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Owner">
            <Select value={owner} onChange={(e) => setOwner(e.target.value)}>
              {owners.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Department">
            <Select value={dept} onChange={(e) => setDept(e.target.value)} disabled={level === 'company'}>
              <option value="">Owner&apos;s department</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cycle">
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {settings.okr_cycles.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Aligns to (parent)" className="sm:col-span-2">
            <Select value={parent} onChange={(e) => setParent(e.target.value)}>
              <option value="">None</option>
              {objectives
                .filter((o) => o.level !== 'individual')
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    [{o.level}] {o.title}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Due date" className="sm:col-span-2">
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-neutral-600">Key results</div>
          <KrEditor value={krs} onChange={setKrs} />
        </div>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}

export function KrDetailModal({ objectiveId, initial, onClose }: { objectiveId: string; initial?: KeyResult; onClose: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [metricType, setMetricType] = useState<MetricType>(initial?.metric_type ?? 'number');
  const [startValue, setStartValue] = useState(String(initial?.start_value ?? 0));
  const [targetValue, setTargetValue] = useState(String(initial?.target_value ?? 100));
  const [currentValue, setCurrentValue] = useState(String(initial?.current_value ?? initial?.start_value ?? 0));
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [weight, setWeight] = useState(String(initial?.weight ?? 1));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!title.trim()) return setErr('Key result title is required');
    setBusy(true);
    setErr('');
    try {
      const start = metricType === 'boolean' ? 0 : Number(startValue) || 0;
      const target = metricType === 'boolean' ? 1 : Number(targetValue) || 0;
      const current = Number(currentValue) || 0;
      const row = {
        objective_id: objectiveId,
        title: title.trim(),
        metric_type: metricType,
        start_value: start,
        target_value: target,
        current_value: initial ? current : start,
        unit: unit.trim(),
        weight: Math.max(1, Number(weight) || 1),
      };
      if (initial) {
        await db.update('key_results', initial.id, row);
        toast('Key result updated', 'success', row.title);
      } else {
        await db.insert('key_results', row);
        toast('Key result added', 'success', row.title);
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
      title={initial ? 'Edit key result' : 'Add key result'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Add key result'}</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Key result title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Ship 6 customer-facing workflows" autoFocus />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Metric type">
            <Select
              value={metricType}
              onChange={(e) => {
                const m = e.target.value as MetricType;
                setMetricType(m);
                if (m === 'boolean') {
                  setStartValue('0');
                  setTargetValue('1');
                }
              }}
            >
              <option value="number">Number</option>
              <option value="percent">Percent (%)</option>
              <option value="currency">Currency</option>
              <option value="boolean">Yes / No</option>
            </Select>
          </Field>
          <Field label="Unit (optional)">
            <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="clinics, %, ₹, h…" />
          </Field>
          <Field label="Start value">
            <Input type="number" value={startValue} onChange={(e) => setStartValue(e.target.value)} disabled={metricType === 'boolean'} />
          </Field>
          <Field label="Target value">
            <Input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} disabled={metricType === 'boolean'} />
          </Field>
          {initial && (
            <Field label="Current value">
              {metricType === 'boolean' ? (
                <Select value={currentValue} onChange={(e) => setCurrentValue(e.target.value)}>
                  <option value="0">Not done</option>
                  <option value="1">Done</option>
                </Select>
              ) : (
                <Input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
              )}
            </Field>
          )}
          <Field label="Weight" hint="Higher weight counts more in objective progress">
            <Input type="number" min={1} value={weight} onChange={(e) => setWeight(e.target.value)} />
          </Field>
        </div>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}

export function KrUpdateModal({ kr, me, onClose }: { kr: KeyResult; me: Profile; onClose: () => void }) {
  const toast = useToast();
  const [value, setValue] = useState(kr.current_value);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  async function save() {
    try {
      await db.update('key_results', kr.id, { current_value: value });
      await db.insert('kr_updates', { key_result_id: kr.id, user_id: me.id, value, note });
      const hit = krProgress({ ...kr, current_value: value }) >= 100;
      if (hit) {
        confetti();
        playSfx('achievement');
      } else {
        playSfx('pop');
      }
      toast(hit ? 'Key result achieved! 🎯' : 'Progress updated', 'success', kr.title);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Check-in on key result"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save update</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-base font-medium">{kr.title}</p>
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-neutral-50 p-3 text-center text-xs">
          <div>
            <div className="text-neutral-500">Start</div>
            <div className="font-semibold">{kr.start_value} {kr.unit}</div>
          </div>
          <div>
            <div className="text-neutral-500">Current</div>
            <div className="font-semibold">{value} {kr.unit}</div>
          </div>
          <div>
            <div className="text-neutral-500">Target</div>
            <div className="font-semibold">{kr.target_value} {kr.unit}</div>
          </div>
        </div>
        {kr.metric_type === 'boolean' ? (
          <Field label="Status">
            <Select value={value} onChange={(e) => setValue(Number(e.target.value))}>
              <option value={0}>Not done</option>
              <option value={1}>Done</option>
            </Select>
          </Field>
        ) : (
          <Field label={`Current value${kr.unit ? ` (${kr.unit})` : ''}`}>
            <Input type="number" value={value} onChange={(e) => setValue(Number(e.target.value))} autoFocus />
          </Field>
        )}
        <Field label="What changed? (optional)">
          <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}

export function ApplyTemplateModal({
  open, onClose, templates, initialId, people, departments, settings, me,
}: { open: boolean; onClose: () => void; templates: OkrTemplate[]; initialId?: string; people: Profile[]; departments: Department[]; settings: OrgSettings; me: Profile }) {
  templates = templates.filter((x) => x.active !== false || x.id === initialId);
  const [tid, setTid] = useState(initialId ?? templates[0]?.id ?? '');
  const [selected, setSelected] = useState<string[]>([]);
  const [cycle, setCycle] = useState(settings.current_cycle);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const toast = useToast();
  const t = templates.find((x) => x.id === (tid || initialId));
  const pool = t?.department_id ? people.filter((p) => p.department_id === t.department_id) : people;

  async function apply() {
    if (!t) return;
    if (!selected.length) return setErr('Pick at least one person');
    setBusy(true);
    setErr('');
    try {
      for (const uid of selected) {
        const p = people.find((x) => x.id === uid);
        for (const o of t.objectives) {
          await createObjectiveWithKrs(
            { title: o.title, description: o.description, level: t.scope, owner_id: uid, department_id: p?.department_id ?? t.department_id, cycle, parent_id: null, status: 'on_track', due_date: null, created_by: me.id },
            o.key_results,
          );
        }
        setDone((d) => d + 1);
      }
      toast(`OKRs created for ${selected.length} people`, 'success', t.name);
      setSelected([]);
      setDone(0);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Apply OKR template"
      wide
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={apply} disabled={busy || !t}>
            {busy ? `Creating… ${done}/${selected.length}` : `Create OKRs for ${selected.length} people`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Template">
            <Select value={tid || initialId || ''} onChange={(e) => { setTid(e.target.value); setSelected([]); }}>
              {templates.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name} {x.department_id ? `· ${departments.find((d) => d.id === x.department_id)?.name ?? ''}` : '· any department'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Cycle">
            <Select value={cycle} onChange={(e) => setCycle(e.target.value)}>
              {settings.okr_cycles.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
        </div>
        {t && (
          <div className="rounded-xl bg-neutral-50 p-3 text-sm">
            {t.objectives.map((o, i) => (
              <div key={i} className="mb-2 last:mb-0">
                <div className="font-medium">{o.title}</div>
                <ul className="ml-4 list-disc text-xs text-neutral-600">
                  {o.key_results.map((k, j) => (
                    <li key={j}>
                      {k.title} ({k.start_value} → {k.target_value} {k.unit})
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <div>
          <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-600">
            <span>Assign to ({selected.length} selected)</span>
            <button className="underline" onClick={() => setSelected(selected.length === pool.length ? [] : pool.map((p) => p.id))}>
              {selected.length === pool.length ? 'Clear' : 'Select all'}
            </button>
          </div>
          <div className="grid max-h-60 gap-2 overflow-y-auto sm:grid-cols-2">
            {pool.map((p) => (
              <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-neutral-200 p-2 text-sm hover:bg-neutral-50">
                <input type="checkbox" checked={selected.includes(p.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, p.id] : selected.filter((x) => x !== p.id))} />
                <Avatar name={p.full_name} size={24} />
                <span className="truncate">{p.full_name}</span>
              </label>
            ))}
          </div>
        </div>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
