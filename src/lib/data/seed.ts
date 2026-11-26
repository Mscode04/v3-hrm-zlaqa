// Demo data. Used by the demo adapter (browser) and by scripts/seed-supabase.ts.
// Relative imports only, so the seed script can run with tsx outside Next.
import type {
  Announcement, AnnouncementRead, AppNotification, Attendance, BreakRow, BreakType, Holiday, KpiAssignment, KpiDefinition, KpiEntry, Kudos, TaskComment, Tracking, TrackingPreset, Channel, Department, KeyResult, LeaveRequest, Message,
  MetricType, Objective, OkrTemplate, OrgSettings, Profile, Role, TableName, Tables, Task,
} from '../types';
import { DEFAULT_TRACKING } from '../types';
import { addDays, toDateStr, uuid } from '../format';

export const DEMO_PASSWORD = 'Zlaqa@123';

export const DEMO_ACCOUNTS: { email: string; label: string; hint: string }[] = [
  { email: 'superadmin@zlaqa.demo', label: 'Super Admin', hint: 'Full control, settings, all data' },
  { email: 'manager@zlaqa.demo', label: 'Manager · Engineering', hint: 'Team attendance, OKRs, approvals' },
  { email: 'member@zlaqa.demo', label: 'Member · Developer', hint: 'Check-in, breaks, own OKRs' },
];

export function defaultSettings(): OrgSettings {
  return {
    id: 1,
    company_name: 'Zlaqa AI Labs',
    tagline: 'Let every voice be heard.',
    primary_color: '#111111',
    timezone: 'Asia/Kolkata',
    work_start: '09:30',
    work_end: '18:30',
    late_after_minutes: 15,
    half_day_minutes: 240,
    full_day_minutes: 480,
    weekly_off: [0],
    selfie_on_check_in: false,
    selfie_on_check_out: false,
    capture_location: true,
    break_limits: { tea: 15, lunch: 45, personal: 15 },
    max_tea_breaks: 2,
    daily_plan_prompt: true,
    mood_pulse: true,
    geofence_mode: 'off',
    office_lat: 11.2588,
    office_lng: 75.7804,
    office_radius_m: 250,
    kudos_values: ['Ownership', 'Teamwork', 'Courage', 'Craft', 'Customer love', 'Kindness'],
    modules: {
      okrs: true, okr_templates: true, kpis: true, daily_log: true, performance: true, tasks: true, chat: true, leave: true,
      announcements: true, polls: true, kudos: false, calendar: true, analytics: true, guides: true, onboarding_tour: true, sfx: true,
    },
    performance_weights: { attendance: 25, punctuality: 15, okr: 30, tasks: 10, kpi: 20 },
    okr_cycles: ['Q3 2026', 'Q4 2026', 'Q1 2027'],
    current_cycle: 'Q4 2026',
    members_can_create_okrs: true,
    members_see_team: true,
    leave_types: ['Casual', 'Sick', 'Earned', 'Work From Home'],
    leave_quota: { Casual: 12, Sick: 12, Earned: 15, 'Work From Home': 24 },
    dashboard_widgets: {
      super_admin: ['welcome', 'must_read', 'org_stats', 'team_tasks', 'eod_summaries', 'insights', 'team_kpis', 'team_pulse', 'attendance_trend', 'leaderboard', 'dept_breakdown', 'okr_progress', 'standup', 'kudos', 'celebrations', 'leave_pending', 'team_log'],
      admin: ['welcome', 'must_read', 'my_shift', 'my_tasks', 'team_tasks', 'eod_summaries', 'org_stats', 'insights', 'team_kpis', 'team_status', 'standup', 'team_pulse', 'okr_progress', 'leaderboard', 'leave_pending', 'kudos', 'team_log'],
      member: ['welcome', 'must_read', 'my_shift', 'my_tasks', 'my_day', 'my_kpis', 'my_performance', 'my_okrs', 'kudos', 'celebrations', 'announcements', 'standup'],
    },
    updated_at: new Date().toISOString(),
  };
}

export type SeedData = { [K in TableName]: Tables[K][] } & {
  credentials: Record<string, { password: string; user_id: string }>;
};

function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type KrSpec = [string, MetricType, number, number, number, string]; // title, type, start, target, current, unit

export function buildSeed(): SeedData {
  const rnd = mulberry32(2026);
  const r = (min: number, max: number) => min + rnd() * (max - min);
  const now = new Date();
  const nowIso = now.toISOString();
  const settings = defaultSettings();

  // ---------- departments ----------
  const mkDept = (name: string, color: string, description: string): Department => ({
    id: uuid(), name, color, description, head_id: null, dashboard_widgets: null, default_preset_id: null, created_at: nowIso,
  });
  const D = {
    lead: mkDept('Leadership', '#111111', 'Founders and strategy'),
    eng: mkDept('Engineering', '#059669', 'Platform, AI models and apps'),
    research: mkDept('Research & Documentation', '#7c3aed', 'Clinical research, validation, docs'),
    creative: mkDept('Creative & Content', '#db2777', 'Brand, reels, design and copy'),
    ops: mkDept('Operations', '#d97706', 'Admin, finance, people ops'),
    sales: mkDept('Sales & Partnerships', '#0d9488', 'Clinics, schools and B2B partners'),
  };
  type DK = keyof typeof D;

  // ---------- people ----------
  const people: [string, string, Role, DK, string, string | null, string][] = [
    ['superadmin@zlaqa.demo', 'Super Admin (Founder)', 'super_admin', 'lead', 'Founder', null, 'ZQ-001'],
    ['manager@zlaqa.demo', 'Arjun Menon', 'admin', 'eng', 'Engineering Manager', 'superadmin@zlaqa.demo', 'ZQ-002'],
    ['ops.manager@zlaqa.demo', 'Fathima Rahman', 'admin', 'ops', 'Operations Manager', 'superadmin@zlaqa.demo', 'ZQ-003'],
    ['creative.manager@zlaqa.demo', 'Nikhil Das', 'admin', 'creative', 'Creative Lead', 'superadmin@zlaqa.demo', 'ZQ-004'],
    ['member@zlaqa.demo', 'Rahul Varma', 'member', 'eng', 'Frontend Developer', 'manager@zlaqa.demo', 'ZQ-010'],
    ['dev2@zlaqa.demo', 'Sneha Pillai', 'member', 'eng', 'Backend Developer', 'manager@zlaqa.demo', 'ZQ-011'],
    ['dev3@zlaqa.demo', 'Irfan Ali', 'member', 'eng', 'ML Engineer', 'manager@zlaqa.demo', 'ZQ-012'],
    ['research@zlaqa.demo', 'Meera Nair', 'member', 'research', 'Research Associate', 'superadmin@zlaqa.demo', 'ZQ-013'],
    ['design@zlaqa.demo', 'Aditya Kumar', 'member', 'creative', 'Visual Designer', 'creative.manager@zlaqa.demo', 'ZQ-014'],
    ['content@zlaqa.demo', 'Hiba Salim', 'member', 'creative', 'Content Writer', 'creative.manager@zlaqa.demo', 'ZQ-015'],
    ['ops1@zlaqa.demo', 'Joel Thomas', 'member', 'ops', 'Operations Executive', 'ops.manager@zlaqa.demo', 'ZQ-016'],
    ['sales@zlaqa.demo', 'Ayesha Khan', 'member', 'sales', 'Partnerships Executive', 'superadmin@zlaqa.demo', 'ZQ-017'],
  ];
  const byEmail: Record<string, Profile> = {};
  for (const [email, full_name, role, dk, designation, , employee_code] of people) {
    byEmail[email] = {
      id: uuid(), email, full_name, role, department_id: D[dk].id, manager_id: null, designation,
      phone: '+91 9' + Math.floor(r(100000000, 999999999)), employee_code, join_date: toDateStr(addDays(now, -Math.round(r(120, 900)))),
      avatar_url: null, status: 'active', tracking: { ...DEFAULT_TRACKING }, preset_id: null, created_at: nowIso,
    };
  }
  for (const p of people) if (p[5]) byEmail[p[0]].manager_id = byEmail[p[5]].id;
  // a couple of upcoming work anniversaries for the Celebrations widget
  const anniv = (email: string, inDays: number, years: number) => {
    const d = addDays(now, inDays);
    d.setFullYear(d.getFullYear() - years);
    byEmail[email].join_date = toDateStr(d);
  };
  anniv('manager@zlaqa.demo', 4, 2);
  anniv('research@zlaqa.demo', 11, 1);
  anniv('superadmin@zlaqa.demo', 23, 3);
  const id = (email: string) => byEmail[email].id;
  D.lead.head_id = id('superadmin@zlaqa.demo');
  D.eng.head_id = id('manager@zlaqa.demo');
  D.ops.head_id = id('ops.manager@zlaqa.demo');
  D.creative.head_id = id('creative.manager@zlaqa.demo');
  D.research.head_id = id('research@zlaqa.demo');
  D.sales.head_id = id('sales@zlaqa.demo');
  const profiles = Object.values(byEmail);
  const sa = id('superadmin@zlaqa.demo');

  // ---------- holidays ----------
  const holidays: Holiday[] = [
    ['2026-10-02', 'Gandhi Jayanti'], ['2026-12-25', 'Christmas'], ['2027-01-01', "New Year's Day"], ['2027-01-26', 'Republic Day'],
    [toDateStr(addDays(now, 9)), 'Team offsite (demo)'],
  ].map(([date, name]) => ({ id: uuid(), date, name, created_at: nowIso }));
  const holidaySet = new Set(holidays.map((h) => h.date));

  // ---------- attendance + breaks (last 30 days + today) ----------
  const plans = ['Finish dashboard charts', 'Clinic demo prep', 'Write API tests', 'Reel edit + captions', 'Interview 3 users', 'Vendor follow-ups', 'Fix login bug', 'Partner calls', 'Label audio samples', 'Sprint planning'];
  const wraps = ['Shipped charts to review', 'Demo deck done', 'Tests at 70%', 'Reel scheduled', '2 interviews done', 'All vendors paid', 'Bug fixed + deployed', '3 calls, 1 pilot', '250 samples labelled', 'Sprint board ready'];
  const attendance: Attendance[] = [];
  const breaks: BreakRow[] = [];
  const at = (date: string, minutes: number) => {
    const d = new Date(date + 'T00:00:00');
    d.setMinutes(minutes);
    return d;
  };
  const lateCut = 9 * 60 + 30 + settings.late_after_minutes;
  for (const p of profiles) {
    for (let i = 30; i >= 0; i--) {
      const day = addDays(now, -i);
      const date = toDateStr(day);
      if (settings.weekly_off.includes(day.getDay()) || holidaySet.has(date)) continue;
      const isToday = i === 0;
      if (!isToday && rnd() < 0.06) continue; // absent
      const inMin = Math.round(r(9 * 60 + 5, 9 * 60 + 55));
      const inAt = at(date, inMin);
      if (isToday && (inAt > now || rnd() < 0.2)) continue; // not in yet
      const attId = uuid();
      const rec: Attendance = {
        id: attId, user_id: p.id, date, check_in: inAt.toISOString(), check_out: null,
        check_in_selfie: null, check_out_selfie: null, check_in_location: '11.25880,75.78040', check_out_location: null,
        status: inMin > lateCut ? 'late' : 'present', work_minutes: 0, break_minutes: 0, notes: '',
        plan: i < 6 ? plans[Math.floor(rnd() * plans.length)] : '', summary: '', mood: rnd() < 0.85 ? Math.min(5, Math.max(2, Math.round(r(2.6, 5.4)))) : null, created_at: inAt.toISOString(),
      };
      const halfDay = rnd() < 0.04;
      const outAt = at(date, halfDay ? Math.round(r(12 * 60 + 30, 13 * 60)) : Math.round(r(18 * 60, 19 * 60 + 15)));
      const plan: [BreakType, number, number][] = [
        ['tea', 11 * 60, r(8, 20)],
        ['lunch', 13 * 60 + 10, r(30, 55)],
        ['tea', 16 * 60, r(8, 20)],
      ];
      let breakTotal = 0;
      for (const [type, startMin, dur] of plan) {
        const s = at(date, startMin + Math.round(r(-10, 15)));
        if (s <= inAt || s >= outAt) continue;
        if (isToday && s > now) break;
        const e = new Date(s.getTime() + dur * 60000);
        const open = isToday && e > now;
        breaks.push({ id: uuid(), attendance_id: attId, user_id: p.id, type, start_at: s.toISOString(), end_at: open ? null : e.toISOString(), created_at: s.toISOString() });
        if (open) break;
        breakTotal += dur;
      }
      rec.break_minutes = Math.round(breakTotal);
      const hasOpenBreak = breaks.some((b) => b.attendance_id === attId && !b.end_at);
      if (!isToday || (outAt < now && !hasOpenBreak)) {
        rec.check_out = outAt.toISOString();
        rec.check_out_location = rec.check_in_location;
        if (rec.plan) rec.summary = wraps[plans.indexOf(rec.plan)] ?? '';
        rec.work_minutes = Math.max(0, Math.round((outAt.getTime() - inAt.getTime()) / 60000 - breakTotal));
        if (rec.work_minutes < settings.half_day_minutes) rec.status = 'half_day';
      }
      attendance.push(rec);
    }
  }

  // ---------- OKRs ----------
  const objectives: Objective[] = [];
  const key_results: KeyResult[] = [];
  const cyc = settings.current_cycle;
  const addObj = (o: Partial<Objective> & { title: string }, krs: KrSpec[]) => {
    const oid = uuid();
    objectives.push({
      id: oid, description: '', level: 'individual', owner_id: null, department_id: null, cycle: cyc, parent_id: null,
      status: 'on_track', due_date: '2026-12-31', created_by: sa, created_at: nowIso, ...o,
    });
    for (const [title, metric_type, start_value, target_value, current_value, unit] of krs) {
      key_results.push({ id: uuid(), objective_id: oid, title, metric_type, start_value, target_value, current_value, unit, weight: 1, created_at: nowIso });
    }
    return oid;
  };
  const company = addObj(
    { title: 'Launch Zlaqa 2.0 to first paying clinics', level: 'company', owner_id: sa, department_id: D.lead.id, description: 'North star for the quarter' },
    [['Sign paying clinic partners', 'number', 0, 5, 2, 'clinics'], ['Reach active users', 'number', 0, 1000, 430, 'users'], ['Platform uptime', 'percent', 95, 99.5, 98.9, '']],
  );
  addObj({ title: 'Ship a reliable speech-analysis engine', level: 'department', owner_id: id('manager@zlaqa.demo'), department_id: D.eng.id, parent_id: company, created_by: id('manager@zlaqa.demo') },
    [['Model latency (ms, lower is better)', 'number', 900, 300, 520, 'ms'], ['Close bugs from backlog', 'number', 0, 40, 26, 'bugs']]);
  addObj({ title: 'Grow brand reach', level: 'department', owner_id: id('creative.manager@zlaqa.demo'), department_id: D.creative.id, parent_id: company, created_by: id('creative.manager@zlaqa.demo') },
    [['Instagram followers', 'number', 1200, 5000, 2600, ''], ['Publish reels', 'number', 0, 24, 11, 'reels']]);
  addObj({ title: 'Streamline operations', level: 'department', owner_id: id('ops.manager@zlaqa.demo'), department_id: D.ops.id, created_by: id('ops.manager@zlaqa.demo') },
    [['Onboarding time (days)', 'number', 7, 2, 4, 'days'], ['Vendor payments on time', 'percent', 80, 100, 92, '']]);
  addObj({ title: 'Build a qualified partner pipeline', level: 'department', owner_id: id('sales@zlaqa.demo'), department_id: D.sales.id, parent_id: company },
    [['Qualified leads', 'number', 0, 60, 22, 'leads'], ['Pilot agreements signed', 'number', 0, 6, 2, '']]);
  addObj({ title: 'Publish clinical validation evidence', level: 'department', owner_id: id('research@zlaqa.demo'), department_id: D.research.id },
    [['User interviews completed', 'number', 0, 30, 18, ''], ['Whitepaper published', 'boolean', 0, 1, 0, '']]);
  const indiv: Record<string, [string, KrSpec[]]> = {
    'member@zlaqa.demo': ['Deliver the new therapy dashboard UI', [['Screens shipped', 'number', 0, 12, 8, ''], ['Lighthouse score', 'number', 60, 95, 84, '']]],
    'dev2@zlaqa.demo': ['Harden the API layer', [['Endpoints with tests', 'percent', 20, 90, 55, ''], ['P95 API latency (ms)', 'number', 600, 200, 340, 'ms']]],
    'dev3@zlaqa.demo': ['Improve stammer detection accuracy', [['F1 score', 'percent', 71, 88, 79, ''], ['New labelled samples', 'number', 0, 2000, 900, '']]],
    'design@zlaqa.demo': ['Refresh the brand kit', [['Templates delivered', 'number', 0, 15, 9, ''], ['Arabic brand kit done', 'boolean', 0, 1, 0, '']]],
    'content@zlaqa.demo': ['Tell 12 real stories', [['Stories published', 'number', 0, 12, 7, ''], ['Avg reel watch-through', 'percent', 25, 45, 31, '']]],
    'ops1@zlaqa.demo': ['Zero-friction office ops', [['SOPs documented', 'number', 0, 10, 6, ''], ['Ticket resolution < 24h', 'percent', 60, 95, 82, '']]],
  };
  for (const [email, [title, krs]] of Object.entries(indiv)) {
    addObj({ title, level: 'individual', owner_id: id(email), department_id: byEmail[email].department_id, created_by: byEmail[email].manager_id ?? sa }, krs);
  }

  // ---------- OKR templates ----------
  const tkr = (title: string, metric_type: MetricType, start_value: number, target_value: number, unit = '') => ({ title, metric_type, start_value, target_value, unit, weight: 1 });
  const tpl = (name: string, description: string, department_id: string | null, scope: OkrTemplate['scope'], objectives: OkrTemplate['objectives']): OkrTemplate => ({
    id: uuid(), name, description, department_id, scope, objectives, active: true, created_by: sa, created_at: nowIso,
  });
  const okr_templates: OkrTemplate[] = [
    tpl('Developer · Quarterly', 'Standard OKRs for individual engineers', D.eng.id, 'individual', [
      { title: 'Deliver high-quality features', description: '', key_results: [tkr('Features shipped to production', 'number', 0, 6), tkr('Code review turnaround (hours)', 'number', 48, 24, 'h'), tkr('Unit test coverage', 'percent', 40, 80)] },
      { title: 'Grow technical depth', description: '', key_results: [tkr('Tech talks / docs written', 'number', 0, 2), tkr('Certification completed', 'boolean', 0, 1)] },
    ]),
    tpl('Engineering Manager · Quarterly', 'Team health and delivery', D.eng.id, 'department', [
      { title: 'Run a fast, healthy team', description: '', key_results: [tkr('Sprint completion rate', 'percent', 60, 85), tkr('Platform uptime', 'percent', 98, 99.5), tkr('1:1s held with every report', 'number', 0, 12)] },
    ]),
    tpl('Sales · Pipeline', 'Revenue pipeline for partnership roles', D.sales.id, 'individual', [
      { title: 'Grow revenue pipeline', description: '', key_results: [tkr('Qualified leads', 'number', 0, 50), tkr('Demos delivered', 'number', 0, 20), tkr('Deals closed', 'number', 0, 5), tkr('New revenue', 'currency', 0, 500000, '₹')] },
    ]),
    tpl('Creative · Audience growth', 'Content and brand OKRs', D.creative.id, 'individual', [
      { title: 'Grow our audience', description: '', key_results: [tkr('New followers', 'number', 0, 2000), tkr('Reels published', 'number', 0, 20), tkr('Engagement rate', 'percent', 2, 6)] },
    ]),
    tpl('Operations · Excellence', 'Process and service levels', D.ops.id, 'individual', [
      { title: 'Operational excellence', description: '', key_results: [tkr('SOPs documented', 'number', 0, 10), tkr('Requests resolved within SLA', 'percent', 70, 95)] },
    ]),
    tpl('Research · Evidence', 'Research and documentation output', D.research.id, 'individual', [
      { title: 'Generate evidence and insights', description: '', key_results: [tkr('User interviews', 'number', 0, 25), tkr('Reports published', 'number', 0, 3)] },
    ]),
    tpl('Company · North Star', 'Quarterly company objective skeleton', null, 'company', [
      { title: 'Hit the quarterly north star', description: '', key_results: [tkr('Revenue', 'currency', 0, 1000000, '₹'), tkr('Active users', 'number', 0, 1000), tkr('NPS', 'number', 0, 50)] },
    ]),
    tpl('Personal growth (any role)', 'Self-development OKR for every member', null, 'individual', [
      { title: 'Grow as a professional', description: '', key_results: [tkr('Courses completed', 'number', 0, 2), tkr('Mentor sessions', 'number', 0, 6), tkr('On-time check-ins', 'percent', 80, 95)] },
    ]),
  ];

  // ---------- chat ----------
  const ch = (name: string, description: string, type: Channel['type'], department_id: string | null = null): Channel => ({
    id: uuid(), name, description, type, department_id, member_ids: [], created_by: sa, created_at: nowIso,
  });
  const general = ch('general', 'Company-wide conversation', 'public');
  const channels: Channel[] = [
    general,
    ch('wins', 'Celebrate progress, big and small', 'public'),
    ...Object.values(D).map((d) => ch(d.name.toLowerCase().replace(/[^a-z]+/g, '-'), `${d.name} team`, 'department', d.id)),
  ];
  const msgs: [string, string, number][] = [
    ['superadmin@zlaqa.demo', 'Good morning team! Q4 OKRs are live. Please review yours by Friday.', 180],
    ['manager@zlaqa.demo', 'Engineering OKRs updated. Latency is trending well 🚀', 150],
    ['member@zlaqa.demo', 'Therapy dashboard screens 7 and 8 are in review.', 120],
    ['creative.manager@zlaqa.demo', 'New reel goes out at 6pm. Share it on your stories!', 90],
    ['ops.manager@zlaqa.demo', 'Reminder: apply for December leave before the 20th.', 45],
    ['research@zlaqa.demo', '18 of 30 interviews done. Insights doc shared in #research-documentation.', 20],
  ];
  const messages: Message[] = msgs.map(([e, body, minsAgo]) => ({
    id: uuid(), channel_id: general.id, user_id: id(e), body, created_at: new Date(now.getTime() - minsAgo * 60000).toISOString(),
  }));

  // ---------- tasks ----------
  const tk = (title: string, email: string, status: Task['status'], priority: Task['priority'], dueIn: number): Task => ({
    id: uuid(), title, description: '', assignee_id: id(email), department_id: byEmail[email].department_id, status, priority,
    due_date: toDateStr(addDays(now, dueIn)), key_result_id: null, created_by: byEmail[email].manager_id ?? sa, created_at: nowIso,
    self_added: false, log_date: null, minutes: 0, completed_at: status === 'done' ? nowIso : null,
  });
  const tasks: Task[] = [
    tk('Build progress chart component', 'member@zlaqa.demo', 'in_progress', 'high', 0),
    tk('Review dashboard chart PR', 'member@zlaqa.demo', 'todo', 'high', -1),
    tk('Fix login redirect bug', 'member@zlaqa.demo', 'todo', 'medium', 2),
    tk('Write API tests for sessions', 'dev2@zlaqa.demo', 'review', 'high', 0),
    tk('Deploy auth middleware hotfix', 'dev2@zlaqa.demo', 'in_progress', 'high', -1),
    tk('Label 300 new audio samples', 'dev3@zlaqa.demo', 'in_progress', 'medium', 0),
    tk('Design December campaign posters', 'design@zlaqa.demo', 'todo', 'high', 0),
    tk('Finalize brand colour tokens', 'design@zlaqa.demo', 'todo', 'medium', -1),
    tk('Script for founder story reel', 'content@zlaqa.demo', 'done', 'medium', 0),
    tk('Draft clinic case study', 'content@zlaqa.demo', 'in_progress', 'medium', 0),
    tk('Vendor payment run', 'ops1@zlaqa.demo', 'done', 'high', -1),
    tk('Office supplies restock', 'ops1@zlaqa.demo', 'todo', 'medium', 0),
    tk('Prepare clinic pitch deck', 'sales@zlaqa.demo', 'in_progress', 'high', 0),
    tk('Follow up with 5 pilot clinics', 'sales@zlaqa.demo', 'todo', 'high', -1),
    tk('Synthesize interview insights', 'research@zlaqa.demo', 'todo', 'medium', 0),
    tk('Quarterly hiring plan', 'manager@zlaqa.demo', 'in_progress', 'medium', 0),
  ];

  // ---------- leave ----------
  const lv = (email: string, type: string, from: number, to: number, status: LeaveRequest['status'], reason: string): LeaveRequest => ({
    id: uuid(), user_id: id(email), type, start_date: toDateStr(addDays(now, from)), end_date: toDateStr(addDays(now, to)),
    days: to - from + 1, reason, status, approver_id: status === 'pending' ? null : byEmail[email].manager_id, decided_at: status === 'pending' ? null : nowIso, created_at: nowIso,
  });
  const leave_requests: LeaveRequest[] = [
    lv('member@zlaqa.demo', 'Casual', 5, 6, 'pending', 'Family function'),
    lv('design@zlaqa.demo', 'Sick', 1, 1, 'pending', 'Not feeling well'),
    lv('dev2@zlaqa.demo', 'Earned', -12, -10, 'approved', 'Trip home'),
    lv('ops1@zlaqa.demo', 'Work From Home', -3, -3, 'approved', 'Plumber visit'),
  ];

  const announcements: Announcement[] = [
    { id: uuid(), title: 'Welcome to Zlaqa Team OS', body: 'Check in every morning, log your breaks, update your tasks daily and keep your OKRs updated weekly. Let every voice be heard.', department_id: null, pinned: true, priority: 'important', require_ack: true, poll_options: [], created_by: sa, created_at: nowIso },
    { id: uuid(), title: 'Sprint demo on Friday 4pm', body: 'Engineering will demo the new therapy dashboard. Everyone welcome.', department_id: D.eng.id, pinned: false, priority: 'normal', require_ack: false, poll_options: [], created_by: id('manager@zlaqa.demo'), created_at: new Date(now.getTime() - 86400000).toISOString() },
  ];

  const kd = (f: string, t: string, value: string, message: string, hoursAgo: number): Kudos => ({
    id: uuid(), from_id: id(f), to_id: id(t), value, message, created_at: new Date(now.getTime() - hoursAgo * 3600000).toISOString(),
  });
  const kudos: Kudos[] = [
    kd('manager@zlaqa.demo', 'member@zlaqa.demo', 'Craft', 'The new progress charts are beautiful and fast. Clinics will love them.', 3),
    kd('creative.manager@zlaqa.demo', 'content@zlaqa.demo', 'Courage', 'Your founder-story script made the whole team emotional. Real storytelling.', 20),
    kd('superadmin@zlaqa.demo', 'research@zlaqa.demo', 'Ownership', '18 interviews in two weeks. You are carrying our evidence base.', 30),
    kd('dev2@zlaqa.demo', 'dev3@zlaqa.demo', 'Teamwork', 'Thanks for pairing on the latency bug till late.', 52),
    kd('ops.manager@zlaqa.demo', 'ops1@zlaqa.demo', 'Kindness', 'Helped the new joiner set up everything on day one.', 70),
    kd('sales@zlaqa.demo', 'design@zlaqa.demo', 'Customer love', 'The clinic pitch posters got a "wow" in the meeting.', 96),
  ];
  const nt = (email: string, title: string, body: string, link: string, kind: string, minsAgo: number): AppNotification => ({
    id: uuid(), user_id: id(email), title, body, link, kind, read_at: null, created_at: new Date(now.getTime() - minsAgo * 60000).toISOString(),
  });
  const notifications: AppNotification[] = [
    nt('member@zlaqa.demo', 'Arjun sent you kudos', 'Craft · The new progress charts are beautiful…', '/kudos', 'kudos', 180),
    nt('member@zlaqa.demo', 'New task: Fix login redirect bug', 'Due in 4 days', '/tasks', 'task', 400),
    nt('manager@zlaqa.demo', 'Rahul Varma requested leave', 'Casual · 2 days', '/leave', 'leave', 60),
    nt('superadmin@zlaqa.demo', 'OKR check-in due', 'Update your Q4 key results before Friday', '/okrs', 'okr', 240),
  ];


  // ---------- v3: tracking presets ----------
  const preset = (name: string, description: string, t: Partial<Tracking>): TrackingPreset => ({
    id: uuid(), name, description, tracking: { attendance: false, okrs: false, kpis: false, tasks: false, daily_log: false, ...t }, active: true, created_at: nowIso,
  });
  const tracking_presets: TrackingPreset[] = [
    preset('KPI role', 'Sales, ops and other roles with measurable targets', { attendance: true, okrs: true, kpis: true, tasks: true, daily_log: true }),
    preset('OKR + daily log', 'Builders and creators: goals plus a daily log of what they did', { attendance: true, okrs: true, tasks: true, daily_log: true }),
    preset('Daily log only', 'Interns and new joiners: show up and log the day', { attendance: true, tasks: true, daily_log: true }),
    preset('Remote · no attendance', 'Remote or part-time: goals and log, no check-in', { okrs: true, tasks: true, daily_log: true }),
    preset('Attendance only', 'Support staff who only need check-in', { attendance: true }),
  ];
  const kpiRole = tracking_presets[0], okrLog = tracking_presets[1];
  for (const email of ['manager@zlaqa.demo', 'ops.manager@zlaqa.demo', 'ops1@zlaqa.demo', 'sales@zlaqa.demo', 'creative.manager@zlaqa.demo', 'content@zlaqa.demo']) {
    byEmail[email].tracking = { ...kpiRole.tracking }; byEmail[email].preset_id = kpiRole.id;
  }
  for (const email of ['member@zlaqa.demo', 'dev2@zlaqa.demo', 'dev3@zlaqa.demo', 'design@zlaqa.demo', 'research@zlaqa.demo']) {
    byEmail[email].tracking = { ...okrLog.tracking }; byEmail[email].preset_id = okrLog.id;
  }
  byEmail['superadmin@zlaqa.demo'].tracking = { attendance: true, okrs: true, kpis: false, tasks: true, daily_log: false };
  D.sales.default_preset_id = kpiRole.id; D.ops.default_preset_id = kpiRole.id;
  D.eng.default_preset_id = okrLog.id; D.research.default_preset_id = okrLog.id;

  // ---------- v3: KPI library ----------
  const kdef = (name: string, unit: string, period: KpiDefinition['period'], source: KpiDefinition['source'], default_target: number, department_id: string | null, description: string, direction: 'up' | 'down' = 'up'): KpiDefinition => ({
    id: uuid(), name, description, unit, direction, period, source, aggregate: 'sum', default_target, department_id, active: true, created_by: sa, created_at: nowIso,
  });
  const K = {
    calls: kdef('Clinic & school calls', 'calls', 'weekly', 'manual', 20, D.sales.id, 'Outbound calls to clinics, schools and partners'),
    demos: kdef('Demos delivered', 'demos', 'weekly', 'manual', 4, D.sales.id, 'Live product demos'),
    posts: kdef('Posts published', 'posts', 'weekly', 'manual', 5, D.creative.id, 'Reels, carousels and stories published'),
    reach: kdef('Instagram reach', 'people', 'weekly', 'manual', 8000, D.creative.id, 'Accounts reached this week'),
    tickets: kdef('Requests resolved', 'requests', 'weekly', 'manual', 15, D.ops.id, 'Internal requests closed'),
    turnaround: kdef('Avg response time', 'h', 'weekly', 'manual', 4, D.ops.id, 'Average hours to first response', 'down'),
    bugs: kdef('Bugs closed', 'bugs', 'weekly', 'manual', 6, D.eng.id, 'Bugs closed from the backlog'),
    att: kdef('Attendance', '%', 'monthly', 'attendance_pct', 95, null, 'Auto: days present ÷ working days'),
    punct: kdef('On-time check-ins', '%', 'monthly', 'punctuality_pct', 90, null, 'Auto: on-time days ÷ days present'),
    done: kdef('Tasks completed', 'tasks', 'weekly', 'tasks_done', 8, null, 'Auto: tasks marked done this week'),
    log: kdef('Daily log entries', 'entries', 'weekly', 'daily_log_entries', 10, null, 'Auto: items added to My Day'),
    hours: kdef('Average hours per day', 'h', 'weekly', 'avg_work_hours', 8, null, 'Auto: from check-in and check-out'),
  };
  const kpi_definitions = Object.values(K);
  const kpi_assignments: KpiAssignment[] = [];
  const kpi_entries: KpiEntry[] = [];
  const assign = (email: string, k: KpiDefinition, target = k.default_target) => {
    const a: KpiAssignment = { id: uuid(), user_id: id(email), kpi_id: k.id, target, weight: 1, active: true, created_by: sa, created_at: nowIso };
    kpi_assignments.push(a);
    return a;
  };
  const weekStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const logWeeks = (a: KpiAssignment, perWeek: number[]) => {
    perWeek.forEach((v, w) => {
      const ws = weekStart(addDays(now, -7 * (perWeek.length - 1 - w)));
      kpi_entries.push({ id: uuid(), assignment_id: a.id, user_id: a.user_id, period_start: toDateStr(ws), value: v, note: '', created_at: nowIso });
    });
  };
  logWeeks(assign('sales@zlaqa.demo', K.calls), [18, 22, 17, 12]);
  logWeeks(assign('sales@zlaqa.demo', K.demos), [3, 5, 4, 2]);
  assign('sales@zlaqa.demo', K.att);
  logWeeks(assign('content@zlaqa.demo', K.posts), [5, 6, 4, 3]);
  logWeeks(assign('creative.manager@zlaqa.demo', K.reach), [6200, 9100, 7800, 5400]);
  logWeeks(assign('ops1@zlaqa.demo', K.tickets), [14, 17, 16, 9]);
  logWeeks(assign('ops1@zlaqa.demo', K.turnaround), [5, 3.5, 4, 3]);
  logWeeks(assign('ops.manager@zlaqa.demo', K.tickets, 25), [22, 27, 24, 13]);
  logWeeks(assign('manager@zlaqa.demo', K.bugs, 10), [8, 11, 9, 6]);
  assign('manager@zlaqa.demo', K.punct);
  for (const e of ['ops1@zlaqa.demo', 'content@zlaqa.demo']) { assign(e, K.punct); assign(e, K.done, 6); }

  // ---------- v3: daily log (self-added tasks) ----------
  const logItems: [string, string, number, number, boolean][] = [
    ['member@zlaqa.demo', 'Fixed chart tooltip overflow on mobile', 0, 45, true],
    ['member@zlaqa.demo', 'Helped Sneha debug login redirect', 0, 30, true],
    ['member@zlaqa.demo', 'Reviewed 2 PRs', -1, 40, true],
    ['dev2@zlaqa.demo', 'Unplanned: hotfix for session timeout', 0, 60, true],
    ['dev2@zlaqa.demo', 'Wrote tests for /sessions endpoint', -1, 90, true],
    ['dev3@zlaqa.demo', 'Labelled 120 audio samples', 0, 120, false],
    ['design@zlaqa.demo', 'Poster variations for clinic outreach', 0, 75, true],
    ['research@zlaqa.demo', 'Interview notes: 2 parents', 0, 60, true],
    ['research@zlaqa.demo', 'Call with SLP about pilot group', -1, 45, true],
    ['ops1@zlaqa.demo', 'Unplanned: courier for brochures', 0, 20, true],
  ];
  const logTasks: Task[] = logItems.map(([email, title, dayOff, minutes, done]) => ({
    id: uuid(), title, description: '', assignee_id: id(email), department_id: byEmail[email].department_id, status: done ? 'done' : 'in_progress',
    priority: 'medium', due_date: null, key_result_id: null, created_by: id(email), created_at: addDays(now, dayOff).toISOString(),
    self_added: true, log_date: toDateStr(addDays(now, dayOff)), minutes, completed_at: done ? addDays(now, dayOff).toISOString() : null,
  }));
  tasks.push(...logTasks);
  const task_comments: TaskComment[] = [
    { id: uuid(), task_id: logTasks[3].id, user_id: id('manager@zlaqa.demo'), body: 'Good catch. Add it to the sprint notes please.', created_at: nowIso },
  ];

  // ---------- v3: announcement with a poll ----------
  announcements.push({
    id: uuid(), title: 'Team lunch this Friday: pick a place', body: 'Vote below. Most votes by Thursday 5pm wins.', department_id: null, pinned: false,
    priority: 'normal', require_ack: false, poll_options: ['Paragon', 'Rahmath Hotel', 'Beach café'], created_by: id('ops.manager@zlaqa.demo'),
    created_at: new Date(now.getTime() - 3 * 3600000).toISOString(),
  });
  const announcement_reads: AnnouncementRead[] = [
    ...['manager@zlaqa.demo', 'dev2@zlaqa.demo', 'sales@zlaqa.demo', 'ops1@zlaqa.demo', 'design@zlaqa.demo', 'research@zlaqa.demo', 'content@zlaqa.demo'].map((e, i) => ({
      id: uuid(), announcement_id: announcements[0].id, user_id: id(e), read_at: nowIso, reaction: i % 2 ? '👍' : '❤️', vote: null, created_at: nowIso,
    })),
    ...['manager@zlaqa.demo', 'dev2@zlaqa.demo', 'sales@zlaqa.demo', 'ops1@zlaqa.demo', 'design@zlaqa.demo'].map((e, i) => ({
      id: uuid(), announcement_id: announcements[2].id, user_id: id(e), read_at: nowIso, reaction: null, vote: [0, 0, 2, 1, 0][i], created_at: nowIso,
    })),
  ];

  const credentials: SeedData['credentials'] = {};
  for (const p of profiles) credentials[p.email] = { password: DEMO_PASSWORD, user_id: p.id };

  return {
    org_settings: [settings],
    departments: Object.values(D),
    profiles,
    attendance,
    breaks,
    objectives,
    key_results,
    kr_updates: [],
    okr_templates,
    channels,
    messages,
    tasks,
    leave_requests,
    announcements,
    audit_log: [],
    holidays,
    kudos,
    notifications,
    tracking_presets,
    kpi_definitions,
    kpi_assignments,
    kpi_entries,
    task_comments,
    announcement_reads,
    calendar_events: [
      { id: uuid(), title: 'All-hands Sprint Demo', description: 'Weekly team showcase & updates', date: toDateStr(addDays(now, 2)), time: '16:00', kind: 'event', visibility: 'public', department_id: null, created_by: sa, created_at: nowIso },
      { id: uuid(), title: 'Check Q4 KPI progress', description: 'Personal reminder before weekly sync', date: toDateStr(addDays(now, 1)), time: '10:30', kind: 'reminder', visibility: 'private', department_id: null, created_by: id('member@zlaqa.demo'), created_at: nowIso },
    ],
    credentials,
  };
}
