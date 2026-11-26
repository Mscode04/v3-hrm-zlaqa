'use client';
import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Download, LocateFixed, Plus, RotateCcw, Save, Volume2, X } from 'lucide-react';
import { useToast } from '@/lib/toast';
import { useMe } from '@/lib/auth';
import { DATA_MODE, db } from '@/lib/data';
import { isSoundEnabled, playSfx, setSoundEnabled } from '@/lib/delight';
import { errMsg } from '@/lib/format';
import { MODULES, ROLE_LABEL, TRACKING_KEYS, WIDGETS, WIDGET_FEATURE, DEFAULT_TRACKING, type BreakType, type OrgSettings, type Role, type TrackingPreset, type WidgetId } from '@/lib/types';
import { orgOn } from '@/lib/features';
import { useTable } from '@/lib/hooks';
import { Modal, Switch, Textarea } from '@/components/ui';
import { Badge, Button, Card, ErrorNote, Field, Input, PageHeader, RequireRole, Select, Tabs, Toggle, cn } from '@/components/ui';

type Tab = 'general' | 'attendance' | 'modules' | 'presets' | 'performance' | 'okrs' | 'leave' | 'dashboards' | 'data';
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function SettingsPage() {
  return (
    <RequireRole roles={['super_admin', 'admin']}>
      <Settings />
    </RequireRole>
  );
}

function Settings() {
  const { me, settings } = useMe();
  const isSuper = me.role === 'super_admin';
  const [s, setS] = useState<OrgSettings>(settings);
  const [tab, setTab] = useState<Tab>(isSuper ? 'general' : 'modules');
  const [mySfx, setMySfx] = useState(true);
  const toast = useToast();
  const [err, setErr] = useState('');

  useEffect(() => setMySfx(isSoundEnabled()), []);
  useEffect(() => setS(settings), [settings]);
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab') as Tab | null;
    if (t && (isSuper || t === 'modules' || t === 'dashboards')) setTab(t);
  }, [isSuper]);

  const set = <K extends keyof OrgSettings>(k: K, v: OrgSettings[K]) => setS((x) => ({ ...x, [k]: v }));
  const wSum = s.performance_weights.attendance + s.performance_weights.punctuality + s.performance_weights.okr + s.performance_weights.tasks + (s.performance_weights.kpi ?? 0);

  async function save() {
    setErr('');
    if (isSuper && wSum !== 100) return setErr(`Performance weights must add up to 100 (now ${wSum}).`);
    try {
      const { id: _id, ...patch } = s;
      await db.update('org_settings', 1, { ...patch, updated_at: new Date().toISOString() });
      toast('Settings saved', 'success', 'Applied for everyone instantly');
    } catch (e) {
      setErr(errMsg(e));
    }
  }

  const tabs: { id: Tab; label: string }[] = isSuper
    ? [
        { id: 'general', label: 'General' },
        { id: 'attendance', label: 'Attendance' },
        { id: 'modules', label: 'Features' },
        { id: 'presets', label: 'Tracking presets' },
        { id: 'performance', label: 'Performance' },
        { id: 'okrs', label: 'OKRs' },
        { id: 'leave', label: 'Leave' },
        { id: 'dashboards', label: 'Dashboards' },
        { id: 'data', label: 'Data' },
      ]
    : [
        { id: 'modules', label: 'Features on/off' },
        { id: 'dashboards', label: 'Dashboards' },
      ];

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle={isSuper ? 'Super Admin controls for the whole organisation' : 'Turn features on/off and arrange dashboards'}
        actions={
          <>
            <Button onClick={save}>
              <Save size={16} /> Save changes
            </Button>
          </>
        }
      />
      <div className="mb-5 overflow-x-auto">
        <Tabs tabs={tabs} value={tab} onChange={setTab} />
      </div>
      <ErrorNote text={err} />

      <div className="mt-4">
        {tab === 'general' && (
          <Card className="grid gap-4 md:grid-cols-2">
            <Field label="Company name">
              <Input value={s.company_name} onChange={(e) => set('company_name', e.target.value)} />
            </Field>
            <Field label="Tagline">
              <Input value={s.tagline} onChange={(e) => set('tagline', e.target.value)} />
            </Field>
            <Field label="Brand colour" hint="Buttons, active nav, charts. Default near-black (white-first brand).">
              <div className="flex gap-2">
                <Input type="color" className="h-10 w-16 p-1" value={s.primary_color} onChange={(e) => set('primary_color', e.target.value)} />
                <Input value={s.primary_color} onChange={(e) => set('primary_color', e.target.value)} />
              </div>
            </Field>
            <Field label="Time zone" hint="IANA name, e.g. Asia/Kolkata">
              <Input value={s.timezone} onChange={(e) => set('timezone', e.target.value)} />
            </Field>
          </Card>
        )}

        {tab === 'attendance' && (
          <div className="space-y-4">
            <Card title="Shift" className="grid gap-4 md:grid-cols-3">
              <Field label="Work starts">
                <Input type="time" value={s.work_start} onChange={(e) => set('work_start', e.target.value)} />
              </Field>
              <Field label="Work ends">
                <Input type="time" value={s.work_end} onChange={(e) => set('work_end', e.target.value)} />
              </Field>
              <Field label="Late after (grace minutes)">
                <Input type="number" value={s.late_after_minutes} onChange={(e) => set('late_after_minutes', Number(e.target.value))} />
              </Field>
              <Field label="Half day if worked less than (min)">
                <Input type="number" value={s.half_day_minutes} onChange={(e) => set('half_day_minutes', Number(e.target.value))} />
              </Field>
              <Field label="Full day (min)">
                <Input type="number" value={s.full_day_minutes} onChange={(e) => set('full_day_minutes', Number(e.target.value))} />
              </Field>
              <Field label="Weekly off">
                <div className="flex flex-wrap gap-1">
                  {DAYS.map((d, i) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => set('weekly_off', s.weekly_off.includes(i) ? s.weekly_off.filter((x) => x !== i) : [...s.weekly_off, i])}
                      className={cn('rounded-lg px-2.5 py-1.5 text-xs font-medium', s.weekly_off.includes(i) ? 'bg-brand text-on-brand' : 'bg-neutral-100 text-neutral-600')}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </Field>
            </Card>
            <Card title="Verification" className="grid gap-3 md:grid-cols-2">
              <Toggle checked={s.capture_location} onChange={(v) => set('capture_location', v)} label="Capture GPS location" hint="Browser asks permission" />
            </Card>
            <Card title="Daily check-in experience" className="grid gap-3 md:grid-cols-2">
              <Toggle checked={s.daily_plan_prompt} onChange={(v) => set('daily_plan_prompt', v)} label="Daily standup prompts" hint="Ask for today's focus at check-in and review tasks at check-out" />
              <Toggle checked={s.mood_pulse} onChange={(v) => set('mood_pulse', v)} label="Mood pulse" hint="Optional 1-5 emoji at check-in. Managers only see averages." />
            </Card>
            <Card title="Geofence (office location)" className="grid gap-4 md:grid-cols-4">
              <Field label="Mode" hint="Flag = allow but mark outside. Block = refuse check-in outside.">
                <Select value={s.geofence_mode} onChange={(e) => set('geofence_mode', e.target.value as OrgSettings['geofence_mode'])}>
                  <option value="off">Off</option>
                  <option value="flag">Flag outside check-ins</option>
                  <option value="block">Block outside check-ins</option>
                </Select>
              </Field>
              <Field label="Office latitude">
                <Input type="number" step="0.00001" value={s.office_lat ?? ''} onChange={(e) => set('office_lat', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Office longitude">
                <Input type="number" step="0.00001" value={s.office_lng ?? ''} onChange={(e) => set('office_lng', e.target.value === '' ? null : Number(e.target.value))} />
              </Field>
              <Field label="Radius (metres)">
                <Input type="number" value={s.office_radius_m} onChange={(e) => set('office_radius_m', Number(e.target.value))} />
              </Field>
              <div className="md:col-span-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigator.geolocation?.getCurrentPosition(
                      (p) => {
                        setS((x) => ({ ...x, office_lat: Number(p.coords.latitude.toFixed(5)), office_lng: Number(p.coords.longitude.toFixed(5)) }));
                        toast('Office location set to where you are now', 'info', 'Remember to save');
                      },
                      () => toast('Could not get your location', 'error'),
                      { enableHighAccuracy: true, timeout: 8000 },
                    )
                  }
                >
                  <LocateFixed size={14} /> Use my current location
                </Button>
              </div>
            </Card>
            <Card title="Breaks" className="grid gap-4 md:grid-cols-4">
              {(['tea', 'lunch', 'personal'] as BreakType[]).map((b) => (
                <Field key={b} label={`${b[0].toUpperCase() + b.slice(1)} break limit (min)`}>
                  <Input type="number" value={s.break_limits[b]} onChange={(e) => set('break_limits', { ...s.break_limits, [b]: Number(e.target.value) })} />
                </Field>
              ))}
              <Field label="Max tea breaks per day">
                <Input type="number" value={s.max_tea_breaks} onChange={(e) => set('max_tea_breaks', Number(e.target.value))} />
              </Field>
            </Card>
          </div>
        )}

        {tab === 'modules' && (
          <div className="space-y-4">
            <p className="text-sm text-neutral-500">Switch a feature off and it disappears for everyone: menu, dashboard cards, guides. Data is kept. Switch it back on any time. Remember to Save.</p>
            {(['Daily work', 'Goals & growth', 'Team', 'Extras'] as const).map((g) => (
              <Card key={g} title={g}>
                <div className="divide-y divide-neutral-100">
                  {MODULES.filter((m) => m.group === g).map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{m.label}</div>
                        <div className="text-xs text-neutral-500">{m.hint}</div>
                      </div>
                      <Switch checked={s.modules[m.id] !== false} onChange={(v) => set('modules', { ...s.modules, [m.id]: v })} label={m.label} />
                    </div>
                  ))}
                </div>
              </Card>
            ))}
            <Card title="Sound effects (this device)" className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Celebration & feedback chimes (SFX)</div>
                <div className="text-xs text-neutral-500">Plays gentle chimes on check-in, check-out, completing tasks, and achievements.</div>
              </div>
              <div className="flex items-center gap-3">
                <Button size="sm" variant="secondary" type="button" onClick={() => playSfx('achievement', true)}>
                  <Volume2 size={14} /> Test sound
                </Button>
                <Switch
                  checked={mySfx}
                  onChange={(v) => {
                    setMySfx(v);
                    setSoundEnabled(v);
                    if (v) playSfx('task_done', true);
                  }}
                  label="My device sound effects"
                />
              </div>
            </Card>
            <Card title="Team visibility & culture" className="space-y-3">
              <Toggle checked={s.members_see_team} onChange={(v) => set('members_see_team', v)} label="Members can see teammates' live status" hint="Department colleagues only." />
              <ListEditor label="Kudos values (your culture words)" items={s.kudos_values} onChange={(v) => set('kudos_values', v)} placeholder="Curiosity" />
            </Card>
          </div>
        )}

        {tab === 'presets' && <PresetsPanel />}

        {tab === 'performance' && (
          <Card title={`Score weights (total ${wSum}/100)`} className="grid gap-4 sm:grid-cols-2 md:grid-cols-5">
            {(['attendance', 'punctuality', 'okr', 'kpi', 'tasks'] as const).map((k) => (
              <Field key={k} label={k === 'okr' ? 'OKR progress' : k === 'kpi' ? 'KPIs' : k[0].toUpperCase() + k.slice(1)}>
                <Input type="number" min={0} max={100} value={s.performance_weights[k] ?? 0} onChange={(e) => set('performance_weights', { ...s.performance_weights, [k]: Number(e.target.value) })} />
              </Field>
            ))}
            <p className="text-xs text-neutral-500 sm:col-span-2 md:col-span-5">If a part is not tracked for a person (for example KPIs for an OKR role), it is left out and the other weights are scaled up for them.</p>
          </Card>
        )}

        {tab === 'okrs' && (
          <Card className="space-y-4">
            <ListEditor label="OKR cycles" items={s.okr_cycles} onChange={(v) => set('okr_cycles', v)} placeholder="Q2 2027" />
            <Field label="Current cycle">
              <select className="rounded-xl border border-neutral-300 px-3 py-2 text-sm" value={s.current_cycle} onChange={(e) => set('current_cycle', e.target.value)}>
                {s.okr_cycles.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Toggle checked={s.members_can_create_okrs} onChange={(v) => set('members_can_create_okrs', v)} label="Members can create their own individual OKRs" />
          </Card>
        )}

        {tab === 'leave' && (
          <Card className="space-y-4">
            <ListEditor label="Leave types" items={s.leave_types} onChange={(v) => set('leave_types', v)} placeholder="Maternity" />
            <div className="grid gap-3 md:grid-cols-4">
              {s.leave_types.map((t) => (
                <Field key={t} label={`${t} · days per year`}>
                  <Input type="number" value={s.leave_quota[t] ?? 0} onChange={(e) => set('leave_quota', { ...s.leave_quota, [t]: Number(e.target.value) })} />
                </Field>
              ))}
            </div>
          </Card>
        )}

        {tab === 'dashboards' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-neutral-200 bg-surface px-4 py-3 text-xs text-neutral-600">
              <span>Disabled modules (from Features on/off) are automatically hidden from dashboards, or click Sync to clean them from the widget lists.</span>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const keep = (id: WidgetId) => {
                    const f = WIDGET_FEATURE[id];
                    return !f || f === 'attendance' || f === 'okrs' || f === 'kpis' || f === 'tasks' || f === 'daily_log' ? (f && f !== 'attendance' ? orgOn(s, f) : true) : orgOn(s, f);
                  };
                  set('dashboard_widgets', {
                    super_admin: s.dashboard_widgets.super_admin.filter(keep),
                    admin: s.dashboard_widgets.admin.filter(keep),
                    member: s.dashboard_widgets.member.filter(keep),
                  });
                }}
              >
                Remove off-feature widgets
              </Button>
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              {(['super_admin', 'admin', 'member'] as Role[]).map((r) => (
                <WidgetPicker
                  key={r}
                  title={`${ROLE_LABEL[r]} dashboard`}
                  value={s.dashboard_widgets[r]}
                  settings={s}
                  onChange={(v) => set('dashboard_widgets', { ...s.dashboard_widgets, [r]: v })}
                />
              ))}
              <p className="text-xs text-neutral-500 lg:col-span-3">Remember to click Save changes above. Need a different layout for one department? Edit it in Departments → Custom dashboard.</p>
            </div>
          </div>
        )}

        {tab === 'data' && (
          <Card className="space-y-4">
            <p className="text-sm">
              Data mode: <Badge tone={DATA_MODE === 'demo' ? 'amber' : 'green'}>{DATA_MODE}</Badge>
            </p>
            {DATA_MODE === 'demo' ? (
              <>
                <p className="text-sm text-neutral-600">Demo data lives in this browser only. Export a JSON backup or reset to the original demo data.</p>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      const data = await db.exportAll?.();
                      const a = document.createElement('a');
                      a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
                      a.download = 'zlaqa-team-os-backup.json';
                      a.click();
                    }}
                  >
                    <Download size={16} /> Export JSON
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      if (confirm('Reset all demo data? You will be signed out.')) {
                        db.resetDemo?.();
                        location.href = '/login';
                      }
                    }}
                  >
                    <RotateCcw size={16} /> Reset demo
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-neutral-600">Connected to Supabase. Use Supabase backups (Database → Backups) or pg_dump for exports.</p>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}

function ListEditor({ label, items, onChange, placeholder }: { label: string; items: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  const [v, setV] = useState('');
  return (
    <Field label={label}>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <Badge key={i} className="py-1 text-xs">
            {i}
            <button type="button" onClick={() => onChange(items.filter((x) => x !== i))} aria-label={`Remove ${i}`}>
              <X size={12} />
            </button>
          </Badge>
        ))}
        <div className="flex gap-1">
          <Input className="w-36 py-1" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (v.trim() && !items.includes(v.trim())) onChange([...items, v.trim()]);
              setV('');
            }}
          >
            <Plus size={14} />
          </Button>
        </div>
      </div>
    </Field>
  );
}

function WidgetPicker({ title, value, settings, onChange }: { title: string; value: WidgetId[]; settings: OrgSettings; onChange: (v: WidgetId[]) => void }) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const isWidgetEnabled = (id: WidgetId) => {
    const f = WIDGET_FEATURE[id];
    if (!f || f === 'attendance') return true;
    return settings.modules?.[f] !== false;
  };
  const unused = WIDGETS.filter((w) => !value.includes(w.id) && isWidgetEnabled(w.id));
  return (
    <Card title={title}>
      <div className="space-y-1.5">
        {value.map((id, i) => {
          const off = !isWidgetEnabled(id);
          return (
            <div key={id} className={cn('flex items-center gap-2 rounded-xl bg-neutral-50 px-3 py-2 text-sm', off && 'opacity-50')}>
              <span className="w-5 text-xs text-neutral-400">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate">{WIDGETS.find((w) => w.id === id)?.label}</span>
              {off && <Badge tone="neutral">Off</Badge>}
              <button onClick={() => move(i, -1)} className="text-neutral-400 hover:text-neutral-800" aria-label="Up"><ArrowUp size={14} /></button>
              <button onClick={() => move(i, 1)} className="text-neutral-400 hover:text-neutral-800" aria-label="Down"><ArrowDown size={14} /></button>
              <button onClick={() => onChange(value.filter((x) => x !== id))} className="text-neutral-400 hover:text-rose-600" aria-label="Remove"><X size={14} /></button>
            </div>
          );
        })}
      </div>
      {unused.length > 0 && (
        <div className="mt-4">
          <div className="mb-1.5 text-xs font-medium text-neutral-500">Add widget</div>
          <div className="flex flex-wrap gap-1.5">
            {unused.map((w) => (
              <button key={w.id} title={w.description} onClick={() => onChange([...value, w.id])} className="rounded-lg border border-dashed border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:border-neutral-500">
                + {w.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

function PresetsPanel() {
  const toast = useToast();
  const presets = useTable('tracking_presets', { order: ['name', 'asc'] });
  const people = useTable('profiles');
  const [edit, setEdit] = useState<Partial<TrackingPreset> | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-neutral-500">A preset is a ready mix of what we track. Pick one when adding a person, set one as a department default, or apply it to many people at once in Employees.</p>
        <Button size="sm" onClick={() => setEdit({ tracking: { ...DEFAULT_TRACKING }, active: true })}>
          <Plus size={15} /> New preset
        </Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {presets.rows.map((p) => {
          const n = people.rows.filter((x) => x.preset_id === p.id).length;
          return (
            <Card key={p.id} className={cn(!p.active && 'opacity-60')}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-neutral-500">{p.description}</div>
                </div>
                <Switch checked={p.active} onChange={(v) => db.update('tracking_presets', p.id, { active: v })} label={p.active ? 'Active' : 'Inactive'} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {TRACKING_KEYS.map((k) => (
                  <Badge key={k.key} tone={p.tracking[k.key] ? 'green' : 'neutral'} className={cn(!p.tracking[k.key] && 'line-through opacity-60')}>
                    {k.label}
                  </Badge>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-neutral-500">
                <span>{n} {n === 1 ? 'person' : 'people'}</span>
                <button className="underline" onClick={() => setEdit(p)}>
                  Edit
                </button>
              </div>
            </Card>
          );
        })}
      </div>
      {edit && <PresetModal initial={edit} onClose={() => setEdit(null)} onSaved={(n) => toast('Preset saved', 'success', n)} />}
    </div>
  );
}

function PresetModal({ initial, onClose, onSaved }: { initial: Partial<TrackingPreset>; onClose: () => void; onSaved: (name: string) => void }) {
  const [name, setName] = useState(initial.name ?? '');
  const [description, setDescription] = useState(initial.description ?? '');
  const [tracking, setTracking] = useState({ ...DEFAULT_TRACKING, ...(initial.tracking ?? {}) });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    if (saving) return;
    if (!name.trim()) return setErr('Name is required');
    setErr('');
    setSaving(true);
    try {
      const row = { name: name.trim(), description, tracking, active: initial.active ?? true };
      if (initial.id) await db.update('tracking_presets', initial.id, row);
      else await db.insert('tracking_presets', row);
      onSaved(row.name);
      onClose();
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setSaving(false);
    }
  }
  return (
    <Modal
      open
      onClose={() => {
        if (!saving) onClose();
      }}
      title={initial.id ? 'Edit preset' : 'New preset'}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Field sales" />
        </Field>
        <Field label="Description">
          <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="space-y-2">
          {TRACKING_KEYS.map((k) => (
            <Toggle key={k.key} checked={tracking[k.key]} onChange={(v) => setTracking({ ...tracking, [k.key]: v })} label={k.label} hint={k.hint} />
          ))}
        </div>
        <p className="text-xs text-neutral-500">Editing a preset does not change people who already use it. Re-apply it in Employees to update them.</p>
        <ErrorNote text={err} />
      </div>
    </Modal>
  );
}
