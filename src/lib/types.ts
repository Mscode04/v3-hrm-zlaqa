// ------------------------------------------------------------------
// Domain types. Mirrors supabase/migrations/0001_schema.sql 1:1.
// If you add a column in SQL, add it here too.
// ------------------------------------------------------------------

export type ID = string;
export type Role = 'super_admin' | 'admin' | 'member';

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: 'Super Admin',
  admin: 'Manager',
  member: 'Member',
};

export type ModuleId =
  | 'okrs' | 'okr_templates' | 'kpis' | 'daily_log' | 'performance' | 'tasks' | 'chat' | 'leave'
  | 'announcements' | 'polls' | 'kudos' | 'calendar' | 'analytics' | 'guides' | 'onboarding_tour' | 'sfx';
export interface ModuleInfo {
  id: ModuleId;
  label: string;
  hint: string;
  group: 'Daily work' | 'Goals & growth' | 'Team' | 'Extras';
}
export const MODULES: ModuleInfo[] = [
  { id: 'daily_log', label: 'My Day · daily log', hint: 'People add their own tasks for the day, including unplanned work', group: 'Daily work' },
  { id: 'tasks', label: 'Tasks board', hint: 'Assigned tasks with a To do → Done board', group: 'Daily work' },
  { id: 'okrs', label: 'OKRs', hint: 'Quarterly objectives and key results', group: 'Goals & growth' },
  { id: 'okr_templates', label: 'OKR templates', hint: 'Ready-made OKR sets managers can apply in one click', group: 'Goals & growth' },
  { id: 'kpis', label: 'KPIs', hint: 'Recurring targets: manual numbers and auto metrics', group: 'Goals & growth' },
  { id: 'performance', label: 'Performance score', hint: 'Weighted score from attendance, OKRs, KPIs and tasks', group: 'Goals & growth' },
  { id: 'chat', label: 'Team chat', hint: 'Channels, departments and direct messages', group: 'Team' },
  { id: 'announcements', label: 'Announcements', hint: 'Company and department news', group: 'Team' },
  { id: 'polls', label: 'Polls, reactions & read receipts', hint: 'Add polls, reactions and “I’ve read this” to announcements', group: 'Team' },
  { id: 'kudos', label: 'Kudos', hint: 'Public thanks tagged with company values', group: 'Team' },
  { id: 'leave', label: 'Leave', hint: 'Apply, approve and track balances', group: 'Team' },
  { id: 'calendar', label: 'Calendar & holidays', hint: 'Holidays, leave and anniversaries', group: 'Team' },
  { id: 'analytics', label: 'Analytics dashboard', hint: 'Company-wide charts for managers and admins', group: 'Extras' },
  { id: 'guides', label: 'In-app guides', hint: 'Help button, page tips and help center', group: 'Extras' },
  { id: 'onboarding_tour', label: 'Welcome tour', hint: 'A short tour the first time someone signs in', group: 'Extras' },
  { id: 'sfx', label: 'Celebration & chime sounds (SFX)', hint: 'Dopamine audio chimes on check-in, check-out, task completion & milestones', group: 'Extras' },
];

export type WidgetId =
  | 'welcome'
  | 'my_shift'
  | 'org_stats'
  | 'team_status'
  | 'attendance_trend'
  | 'okr_progress'
  | 'my_okrs'
  | 'leaderboard'
  | 'dept_breakdown'
  | 'announcements'
  | 'my_tasks'
  | 'leave_pending'
  | 'my_performance'
  | 'insights'
  | 'team_pulse'
  | 'standup'
  | 'kudos'
  | 'celebrations'
  | 'my_day'
  | 'my_kpis'
  | 'team_kpis'
  | 'team_log'
  | 'team_tasks'
  | 'eod_summaries'
  | 'must_read';

export const WIDGETS: { id: WidgetId; label: string; description: string }[] = [
  { id: 'welcome', label: 'Welcome banner', description: 'Greeting, date and tagline' },
  { id: 'my_shift', label: 'My shift', description: 'Today check-in, worked time, break status' },
  { id: 'org_stats', label: 'Team stats', description: 'Headcount, present %, on break, late, OKR avg' },
  { id: 'team_status', label: 'Live team status', description: 'Who is working, on break, out' },
  { id: 'attendance_trend', label: 'Attendance trend', description: 'Last 14 working days, present %' },
  { id: 'okr_progress', label: 'OKR progress', description: 'Company + team objectives this cycle' },
  { id: 'my_okrs', label: 'My OKRs', description: 'My objectives and progress' },
  { id: 'leaderboard', label: 'Leaderboard', description: 'Top performance scores' },
  { id: 'dept_breakdown', label: 'Department breakdown', description: 'Headcount, present %, OKR % by department' },
  { id: 'announcements', label: 'Announcements', description: 'Latest announcements' },
  { id: 'my_tasks', label: 'My tasks', description: 'Open tasks assigned to me' },
  { id: 'leave_pending', label: 'Leave requests', description: 'Pending approvals / my pending requests' },
  { id: 'my_performance', label: 'My performance', description: 'Score with breakdown' },
  { id: 'insights', label: 'Smart insights', description: 'Late patterns, missing check-outs, OKRs at risk, break overuse' },
  { id: 'team_pulse', label: 'Team pulse', description: 'Average mood shared at check-in, last 7 days' },
  { id: 'standup', label: 'Daily standup', description: "Today's focus and wrap-ups from the team" },
  { id: 'kudos', label: 'Kudos', description: 'Latest recognition across the team' },
  { id: 'celebrations', label: 'Celebrations', description: 'Work anniversaries and upcoming holidays' },
  { id: 'my_day', label: 'My day', description: 'Today’s tasks with quick add' },
  { id: 'my_kpis', label: 'My KPIs', description: 'This period’s KPIs vs target' },
  { id: 'team_kpis', label: 'Team KPIs', description: 'KPI achievement across the team' },
  { id: 'team_log', label: 'Team daily log', description: 'What everyone logged today' },
  { id: 'team_tasks', label: 'Team tasks', description: 'Every team member’s daily and overdue tasks' },
  { id: 'eod_summaries', label: 'End of day summaries', description: 'Team checkout summaries and completed tasks' },
  { id: 'must_read', label: 'Must-read updates', description: 'Announcements waiting for your “I’ve read this”' },
];

/** Which feature a widget needs (org switch + the person's tracking). */
export const WIDGET_FEATURE: Partial<Record<WidgetId, Feature>> = {
  my_shift: 'attendance', team_status: 'attendance', attendance_trend: 'attendance', team_pulse: 'attendance', standup: 'attendance',
  okr_progress: 'okrs', my_okrs: 'okrs', leaderboard: 'performance', my_performance: 'performance', my_tasks: 'tasks', team_tasks: 'tasks',
  leave_pending: 'leave', announcements: 'announcements', kudos: 'kudos', celebrations: 'calendar',
  my_day: 'daily_log', team_log: 'daily_log', my_kpis: 'kpis', team_kpis: 'kpis', must_read: 'announcements',
  eod_summaries: 'attendance',
};

/** Per-person switches: what we track for this person. */
export interface Tracking {
  attendance: boolean;
  okrs: boolean;
  kpis: boolean;
  tasks: boolean;
  daily_log: boolean;
}
export const TRACKING_KEYS: { key: keyof Tracking; label: string; hint: string }[] = [
  { key: 'attendance', label: 'Attendance', hint: 'Check-in, breaks, check-out' },
  { key: 'okrs', label: 'OKRs', hint: 'Quarterly objectives' },
  { key: 'kpis', label: 'KPIs', hint: 'Recurring targets' },
  { key: 'tasks', label: 'Tasks board', hint: 'Assigned tasks' },
  { key: 'daily_log', label: 'Daily log', hint: 'Adds own tasks each day' },
];
export const DEFAULT_TRACKING: Tracking = { attendance: true, okrs: true, kpis: false, tasks: true, daily_log: true };
export type Feature = keyof Tracking | Exclude<ModuleId, 'okrs' | 'kpis' | 'tasks' | 'daily_log'>;

export interface TrackingPreset {
  id: ID;
  name: string;
  description: string;
  tracking: Tracking;
  active: boolean;
  created_at: string;
}

export type BreakType = 'tea' | 'lunch' | 'personal';
export const BREAK_LABEL: Record<BreakType, string> = { tea: 'Tea break', lunch: 'Lunch break', personal: 'Personal break' };

export interface OrgSettings {
  id: number;
  company_name: string;
  tagline: string;
  primary_color: string;
  timezone: string;
  work_start: string; // "09:30"
  work_end: string; // "18:30"
  late_after_minutes: number;
  half_day_minutes: number;
  full_day_minutes: number;
  weekly_off: number[]; // 0 = Sunday
  selfie_on_check_in: boolean;
  selfie_on_check_out: boolean;
  capture_location: boolean;
  break_limits: Record<BreakType, number>;
  max_tea_breaks: number;
  daily_plan_prompt: boolean;
  mood_pulse: boolean;
  geofence_mode: 'off' | 'flag' | 'block';
  office_lat: number | null;
  office_lng: number | null;
  office_radius_m: number;
  kudos_values: string[];
  modules: Record<ModuleId, boolean>;
  performance_weights: { attendance: number; punctuality: number; okr: number; tasks: number; kpi: number };
  okr_cycles: string[];
  current_cycle: string;
  members_can_create_okrs: boolean;
  members_see_team: boolean;
  leave_types: string[];
  leave_quota: Record<string, number>;
  dashboard_widgets: Record<Role, WidgetId[]>;
  updated_at: string;
}

export interface Department {
  id: ID;
  name: string;
  description: string;
  color: string;
  head_id: ID | null;
  dashboard_widgets: WidgetId[] | null; // null = use role default
  created_at: string;
  default_preset_id: ID | null;
}

export interface Profile {
  id: ID;
  email: string;
  full_name: string;
  role: Role;
  department_id: ID | null;
  manager_id: ID | null;
  designation: string;
  phone: string;
  employee_code: string;
  join_date: string;
  avatar_url: string | null;
  status: 'active' | 'inactive';
  created_at: string;
  tracking: Tracking;
  preset_id: ID | null;
}

export type AttendanceStatus = 'present' | 'late' | 'half_day' | 'absent' | 'on_leave';

export interface Attendance {
  id: ID;
  user_id: ID;
  date: string; // YYYY-MM-DD (local)
  check_in: string | null;
  check_out: string | null;
  check_in_selfie: string | null;
  check_out_selfie: string | null;
  check_in_location: string | null;
  check_out_location: string | null;
  status: AttendanceStatus;
  work_minutes: number;
  break_minutes: number;
  notes: string;
  plan: string; // today's focus (shared at check-in)
  summary: string; // wrap-up (shared at check-out)
  mood: number | null; // 1-5 pulse, optional
  created_at: string;
}

export interface BreakRow {
  id: ID;
  attendance_id: ID;
  user_id: ID;
  type: BreakType;
  start_at: string;
  end_at: string | null;
  created_at: string;
}

export type OkrLevel = 'company' | 'department' | 'individual';
export type OkrStatus = 'on_track' | 'at_risk' | 'off_track' | 'done';
export type MetricType = 'number' | 'percent' | 'currency' | 'boolean';

export interface Objective {
  id: ID;
  title: string;
  description: string;
  level: OkrLevel;
  owner_id: ID | null;
  department_id: ID | null;
  cycle: string;
  parent_id: ID | null;
  status: OkrStatus;
  due_date: string | null;
  created_by: ID;
  created_at: string;
}

export interface KeyResult {
  id: ID;
  objective_id: ID;
  title: string;
  metric_type: MetricType;
  start_value: number;
  target_value: number;
  current_value: number;
  unit: string;
  weight: number;
  created_at: string;
}

export interface KrUpdate {
  id: ID;
  key_result_id: ID;
  user_id: ID;
  value: number;
  note: string;
  created_at: string;
}

export interface TemplateKr {
  title: string;
  metric_type: MetricType;
  start_value: number;
  target_value: number;
  unit: string;
  weight: number;
}
export interface TemplateObjective {
  title: string;
  description: string;
  key_results: TemplateKr[];
}
export interface OkrTemplate {
  id: ID;
  name: string;
  description: string;
  department_id: ID | null;
  scope: OkrLevel;
  objectives: TemplateObjective[];
  created_by: ID;
  created_at: string;
  active: boolean;
}

export interface Channel {
  id: ID;
  name: string;
  description: string;
  type: 'public' | 'department' | 'private';
  department_id: ID | null;
  member_ids: ID[];
  created_by: ID;
  created_at: string;
}

export interface Message {
  id: ID;
  channel_id: ID;
  user_id: ID;
  body: string;
  created_at: string;
}

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done';
export interface Task {
  id: ID;
  title: string;
  description: string;
  assignee_id: ID | null;
  department_id: ID | null;
  status: TaskStatus;
  priority: 'low' | 'medium' | 'high';
  due_date: string | null;
  key_result_id: ID | null;
  created_by: ID;
  created_at: string;
  self_added: boolean; // added by the person themselves (daily log / unplanned work)
  log_date: string | null; // the day it was logged for
  minutes: number; // time spent
  completed_at: string | null;
}

export interface LeaveRequest {
  id: ID;
  user_id: ID;
  type: string;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  approver_id: ID | null;
  decided_at: string | null;
  created_at: string;
}

export interface Announcement {
  id: ID;
  title: string;
  body: string;
  department_id: ID | null;
  pinned: boolean;
  created_by: ID;
  created_at: string;
  priority: 'normal' | 'important' | 'urgent';
  require_ack: boolean;
  poll_options: string[];
}

export interface AuditLog {
  id: ID;
  actor_id: ID | null;
  action: 'insert' | 'update' | 'delete';
  entity: string;
  entity_id: string;
  summary: string;
  created_at: string;
}

export interface Holiday {
  id: ID;
  date: string;
  name: string;
  created_at: string;
}

export type CalendarEventKind = 'event' | 'reminder';
export type CalendarVisibility = 'private' | 'department' | 'public';
export interface CalendarEvent {
  id: ID;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string | null; // "HH:mm"
  kind: CalendarEventKind;
  visibility: CalendarVisibility;
  department_id: ID | null;
  created_by: ID;
  created_at: string;
}

export interface Kudos {
  id: ID;
  from_id: ID;
  to_id: ID;
  value: string;
  message: string;
  created_at: string;
}

export interface AppNotification {
  id: ID;
  user_id: ID;
  title: string;
  body: string;
  link: string;
  kind: string;
  read_at: string | null;
  created_at: string;
}

export type KpiSource =
  | 'manual' | 'attendance_pct' | 'punctuality_pct' | 'tasks_done' | 'task_completion_pct'
  | 'avg_work_hours' | 'okr_progress' | 'kudos_received' | 'daily_log_entries';
export const KPI_SOURCES: { id: KpiSource; label: string; unit: string }[] = [
  { id: 'manual', label: 'Manual · person logs the number', unit: '' },
  { id: 'attendance_pct', label: 'Auto · attendance %', unit: '%' },
  { id: 'punctuality_pct', label: 'Auto · on-time %', unit: '%' },
  { id: 'tasks_done', label: 'Auto · tasks completed', unit: 'tasks' },
  { id: 'task_completion_pct', label: 'Auto · task completion %', unit: '%' },
  { id: 'avg_work_hours', label: 'Auto · average hours per day', unit: 'h' },
  { id: 'okr_progress', label: 'Auto · OKR progress %', unit: '%' },
  { id: 'kudos_received', label: 'Auto · kudos received', unit: 'kudos' },
  { id: 'daily_log_entries', label: 'Auto · daily log entries', unit: 'entries' },
];
export type KpiPeriod = 'daily' | 'weekly' | 'monthly';

export interface KpiDefinition {
  id: ID;
  name: string;
  description: string;
  unit: string;
  direction: 'up' | 'down'; // up = higher is better
  period: KpiPeriod;
  source: KpiSource;
  aggregate: 'sum' | 'latest';
  default_target: number;
  department_id: ID | null;
  active: boolean;
  created_by: ID;
  created_at: string;
}

export interface KpiAssignment {
  id: ID;
  user_id: ID;
  kpi_id: ID;
  target: number;
  weight: number;
  active: boolean;
  created_by: ID;
  created_at: string;
}

export interface KpiEntry {
  id: ID;
  assignment_id: ID;
  user_id: ID;
  period_start: string;
  value: number;
  note: string;
  created_at: string;
}

export interface TaskComment {
  id: ID;
  task_id: ID;
  user_id: ID;
  body: string;
  created_at: string;
}

export interface AnnouncementRead {
  id: ID;
  announcement_id: ID;
  user_id: ID;
  read_at: string | null;
  reaction: string | null;
  vote: number | null;
  created_at: string;
}

export interface Tables {
  org_settings: OrgSettings;
  departments: Department;
  profiles: Profile;
  attendance: Attendance;
  breaks: BreakRow;
  objectives: Objective;
  key_results: KeyResult;
  kr_updates: KrUpdate;
  okr_templates: OkrTemplate;
  channels: Channel;
  messages: Message;
  tasks: Task;
  leave_requests: LeaveRequest;
  announcements: Announcement;
  audit_log: AuditLog;
  holidays: Holiday;
  kudos: Kudos;
  notifications: AppNotification;
  tracking_presets: TrackingPreset;
  kpi_definitions: KpiDefinition;
  kpi_assignments: KpiAssignment;
  kpi_entries: KpiEntry;
  task_comments: TaskComment;
  announcement_reads: AnnouncementRead;
  calendar_events: CalendarEvent;
}
export type TableName = keyof Tables;
export const TABLES: TableName[] = [
  'org_settings', 'departments', 'profiles', 'attendance', 'breaks', 'objectives', 'key_results',
  'kr_updates', 'okr_templates', 'channels', 'messages', 'tasks', 'leave_requests', 'announcements', 'audit_log', 'holidays', 'kudos', 'notifications',
  'tracking_presets', 'kpi_definitions', 'kpi_assignments', 'kpi_entries', 'task_comments', 'announcement_reads', 'calendar_events',
];
