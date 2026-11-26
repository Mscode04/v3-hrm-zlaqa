/**
 * Move a live demo-mode team into Supabase.
 *
 * Demo mode keeps data in each person's browser, so nobody holds the full picture.
 * Everyone downloads Profile → "Export my data". You put all the files in one folder
 * and run this script. It merges them and writes one clean dataset to Supabase.
 *
 *   1. Run every SQL file in supabase/migrations (0001 → 0004) on an EMPTY project.
 *   2. .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, IMPORT_TEMP_PASSWORD
 *   3. npx tsx scripts/import-demo-exports.ts ./exports            (dry run, prints a report)
 *   4. npx tsx scripts/import-demo-exports.ts ./exports --apply    (writes)
 *
 * Flags
 *   --apply           write to Supabase (default is a dry run)
 *   --keep-demo       keep the *@zlaqa.demo sample people and their rows (default: drop them)
 *   --no-selfies      skip uploading selfie photos
 *
 * Merge rules
 *   - Org data (settings, departments, presets, people, OKRs, templates, KPI library and
 *     assignments, announcements, holidays, channels) comes from the newest Super Admin export.
 *     If there is none, from the newest export of anyone.
 *   - Personal rows (attendance, breaks, tasks, KPI entries, leave, read receipts, comments,
 *     kudos, messages) are trusted from the person's OWN export first, then filled from others.
 *   - Attendance is unique per person + date. When two copies exist we keep the person's own,
 *     else the one with a check-out, else the newest.
 *   - Everyone gets a Supabase login with IMPORT_TEMP_PASSWORD. Ask them to change it in Profile.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

try {
  process.loadEnvFile('.env.local');
} catch {
  /* env may come from the shell */
}

type Row = Record<string, unknown> & { id: string };
interface ExportFile {
  _meta: { app: string; exported_at: string; exported_by: { id: string; email: string; role: string } };
  data: Record<string, Row[]>;
  files?: Record<string, string>;
}

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--'));
const APPLY = args.includes('--apply');
const KEEP_DEMO = args.includes('--keep-demo');
const SELFIES = !args.includes('--no-selfies');
if (!dir) {
  console.error('Usage: npx tsx scripts/import-demo-exports.ts <folder-with-json-exports> [--apply] [--keep-demo] [--no-selfies]');
  process.exit(1);
}

const ORG_TABLES = ['org_settings', 'tracking_presets', 'departments', 'profiles', 'okr_templates', 'objectives', 'key_results', 'kr_updates', 'kpi_definitions', 'kpi_assignments', 'channels', 'announcements', 'holidays'];
/** personal table → which columns say "this row belongs to that person" */
const OWNED: Record<string, string[]> = {
  attendance: ['user_id'],
  breaks: ['user_id'],
  tasks: ['assignee_id', 'created_by'],
  kpi_entries: ['user_id'],
  leave_requests: ['user_id'],
  announcement_reads: ['user_id'],
  task_comments: ['user_id'],
  kudos: ['from_id'],
  messages: ['user_id'],
};

function load(): ExportFile[] {
  const out: ExportFile[] = [];
  for (const f of readdirSync(dir!).filter((x) => x.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(join(dir!, f), 'utf8')) as ExportFile;
    if (j?._meta?.app !== 'zlaqa-team-os' || !j.data) {
      console.warn(`skip ${f}: not a Team OS export`);
      continue;
    }
    out.push(j);
    console.log(`read ${f} · ${j._meta.exported_by.email} · ${j._meta.exported_at}`);
  }
  return out.sort((a, b) => b._meta.exported_at.localeCompare(a._meta.exported_at)); // newest first
}

function merge(exports: ExportFile[]) {
  const base = exports.find((e) => e._meta.exported_by.role === 'super_admin') ?? exports[0];
  const out: Record<string, Row[]> = {};
  for (const t of ORG_TABLES) out[t] = [...(base.data[t] ?? [])];

  // people who appear only in someone else's export (added later on another browser)
  const ids = new Set(out.profiles.map((p) => p.id));
  for (const e of exports) for (const p of e.data.profiles ?? []) if (!ids.has(p.id)) (out.profiles.push(p), ids.add(p.id));

  const owners = (t: string, r: Row) => OWNED[t].map((c) => r[c] as string | undefined);
  for (const t of Object.keys(OWNED)) {
    const byId = new Map<string, Row>();
    // pass 1: each person's own rows from their own export
    for (const e of exports) for (const r of e.data[t] ?? []) if (owners(t, r).includes(e._meta.exported_by.id) && !byId.has(r.id)) byId.set(r.id, r);
    // pass 2: anything else we only know from someone else's browser
    for (const e of exports) for (const r of e.data[t] ?? []) if (!byId.has(r.id)) byId.set(r.id, r);
    out[t] = [...byId.values()];
  }

  // attendance: one row per person per day
  const own = new Map(exports.map((e) => [e._meta.exported_by.id, e]));
  const day = new Map<string, Row>();
  for (const r of out.attendance) {
    const k = `${r.user_id}|${r.date}`;
    const cur = day.get(k);
    if (!cur) day.set(k, r);
    else {
      const mineHas = (x: Row) => (own.get(x.user_id as string)?.data.attendance ?? []).some((y) => y.id === x.id);
      const better = mineHas(r) !== mineHas(cur) ? mineHas(r) : !!r.check_out !== !!cur.check_out ? !!r.check_out : String(r.updated_at ?? r.created_at) > String(cur.updated_at ?? cur.created_at);
      if (better) day.set(k, r);
    }
  }
  const dropped = out.attendance.length - day.size;
  out.attendance = [...day.values()];
  const keptIds = new Set(out.attendance.map((a) => a.id));
  out.breaks = out.breaks.filter((b) => !b.attendance_id || keptIds.has(b.attendance_id as string));

  const files: Record<string, string> = {};
  for (const e of exports) Object.assign(files, e.files ?? {});
  return { base, out, files, droppedDupes: dropped };
}

function dropDemo(out: Record<string, Row[]>) {
  const demo = new Set(out.profiles.filter((p) => String(p.email).endsWith('@zlaqa.demo')).map((p) => p.id));
  if (!demo.size) return 0;
  const refs = ['user_id', 'assignee_id', 'from_id', 'to_id', 'owner_id'];
  for (const t of Object.keys(out)) {
    if (t === 'profiles') out[t] = out[t].filter((p) => !demo.has(p.id));
    else out[t] = out[t].filter((r) => !refs.some((c) => demo.has(r[c] as string)));
  }
  // clear dangling pointers instead of dropping org rows
  const nullIf = (r: Row, c: string) => demo.has(r[c] as string) && (r[c] = null);
  for (const r of out.profiles) nullIf(r, 'manager_id');
  for (const r of out.departments) nullIf(r, 'head_id');
  for (const t of Object.keys(out)) for (const r of out[t]) nullIf(r, 'created_by');
  // drop children whose parent row is gone
  const keep = (t: string, col: string, parent: string) => {
    const ids = new Set(out[parent].map((r) => r.id));
    out[t] = out[t].filter((r) => !r[col] || ids.has(r[col] as string));
  };
  keep('objectives', 'parent_id', 'objectives');
  keep('key_results', 'objective_id', 'objectives');
  keep('kr_updates', 'key_result_id', 'key_results');
  keep('breaks', 'attendance_id', 'attendance');
  keep('kpi_entries', 'assignment_id', 'kpi_assignments');
  keep('task_comments', 'task_id', 'tasks');
  keep('announcement_reads', 'announcement_id', 'announcements');
  keep('tasks', 'key_result_id', 'key_results');
  return demo.size;
}

async function main() {
  const exports = load();
  if (!exports.length) throw new Error('No exports found in ' + dir);
  const { base, out, files, droppedDupes } = merge(exports);
  const demoDropped = KEEP_DEMO ? 0 : dropDemo(out);

  const exporters = new Set(exports.map((e) => e._meta.exported_by.id));
  const missing = out.profiles.filter((p) => p.status === 'active' && !exporters.has(p.id));
  console.log(`\nOrg data from: ${base._meta.exported_by.email} (${base._meta.exported_by.role})`);
  console.log(`People: ${out.profiles.length}${demoDropped ? ` (dropped ${demoDropped} demo people)` : ''}`);
  for (const t of Object.keys(out)) console.log(`  ${t.padEnd(20)} ${out[t].length}`);
  console.log(`Attendance duplicates resolved: ${droppedDupes}`);
  console.log(`Selfie photos: ${Object.keys(files).length}`);
  if (missing.length) console.log(`\n⚠  No export from: ${missing.map((p) => p.email).join(', ')}\n   Their check-ins made on their own device are NOT included. Ask them to export.`);

  if (!APPLY) return console.log('\nDry run only. Add --apply to write to Supabase.');

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const temp = process.env.IMPORT_TEMP_PASSWORD;
  if (!url || !key || !temp || temp.length < 8) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and IMPORT_TEMP_PASSWORD (8+ chars)');
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  // 1. logins: demo id → auth id
  const idMap = new Map<string, string>();
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const p of out.profiles) {
    const email = String(p.email).toLowerCase();
    let id = existing?.users.find((u) => u.email?.toLowerCase() === email)?.id;
    if (!id) {
      const { data, error } = await admin.auth.admin.createUser({ email, password: temp, email_confirm: true, user_metadata: { full_name: p.full_name } });
      if (error) throw new Error(`auth ${email}: ${error.message}`);
      id = data.user.id;
    }
    idMap.set(p.id, id);
  }
  let json = JSON.stringify(out);
  for (const [from, to] of idMap) json = json.split(from).join(to);
  const s = JSON.parse(json) as Record<string, Row[]>;

  // 2. selfies: data URLs → storage
  if (SELFIES) {
    for (const t of ['attendance']) {
      for (const r of s[t]) {
        for (const c of ['check_in_selfie', 'check_out_selfie']) {
          const ref = r[c] as string | null;
          const dataUrl = ref?.startsWith('data:') ? ref : ref ? files[ref] : undefined;
          if (!ref || !dataUrl) {
            if (ref && !ref.startsWith('data:') && !files[ref]) r[c] = null; // photo lived only in another browser
            continue;
          }
          let path = ref.startsWith('data:') ? `${r.user_id}/${r.date}-${c}.jpg` : ref;
          for (const [from, to] of idMap) path = path.split(from).join(to);
          const buf = Buffer.from(dataUrl.split(',')[1], 'base64');
          const { error } = await admin.storage.from('selfies').upload(path, buf, { upsert: true, contentType: 'image/jpeg' });
          r[c] = error ? null : path;
        }
      }
    }
  } else for (const r of s.attendance) (r.check_in_selfie = null), (r.check_out_selfie = null);

  // 3. write in dependency order
  const up = async (table: string, rows: Row[]) => {
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from(table).upsert(rows.slice(i, i + 500));
      if (error) throw new Error(`${table}: ${error.message}`);
    }
    console.log(`wrote ${table}: ${rows.length}`);
  };
  await up('org_settings', s.org_settings);
  await up('tracking_presets', s.tracking_presets);
  await up('departments', s.departments.map((d) => ({ ...d, head_id: null })));
  await up('profiles', s.profiles.map((p) => ({ ...p, manager_id: null })));
  for (const p of s.profiles) if (p.manager_id) await admin.from('profiles').update({ manager_id: p.manager_id }).eq('id', p.id);
  for (const d of s.departments) if (d.head_id) await admin.from('departments').update({ head_id: d.head_id }).eq('id', d.id);
  await up('attendance', s.attendance);
  await up('breaks', s.breaks);
  await up('okr_templates', s.okr_templates);
  await up('objectives', s.objectives.filter((o) => !o.parent_id));
  await up('objectives', s.objectives.filter((o) => o.parent_id));
  await up('key_results', s.key_results);
  await up('kr_updates', s.kr_updates);
  await up('channels', s.channels);
  await up('messages', s.messages);
  await up('tasks', s.tasks);
  await up('task_comments', s.task_comments);
  await up('kpi_definitions', s.kpi_definitions);
  await up('kpi_assignments', s.kpi_assignments);
  await up('kpi_entries', s.kpi_entries);
  await up('leave_requests', s.leave_requests);
  await up('announcements', s.announcements);
  await up('announcement_reads', s.announcement_reads);
  await up('holidays', s.holidays);
  await up('kudos', s.kudos);

  console.log(`\nDone. Everyone signs in with their email and the temporary password, then changes it in Profile.`);
  console.log('Next: set NEXT_PUBLIC_DATA_MODE=supabase and redeploy.');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
