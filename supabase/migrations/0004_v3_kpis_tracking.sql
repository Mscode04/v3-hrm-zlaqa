-- =====================================================================
-- Zlaqa Team OS v3: per-person tracking + presets, KPIs, daily log,
-- task comments, announcement priority / read receipts / reactions / polls,
-- template on/off, new feature switches.
-- ADDITIVE ONLY: safe to run on a live database. Run after 0003.
-- =====================================================================

-- ---------- per-person tracking ----------
create table if not exists public.tracking_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  tracking jsonb not null default '{"attendance":true,"okrs":true,"kpis":false,"tasks":true,"daily_log":true}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists tracking jsonb not null default '{"attendance":true,"okrs":true,"kpis":false,"tasks":true,"daily_log":true}',
  add column if not exists preset_id uuid references public.tracking_presets(id) on delete set null;

alter table public.departments
  add column if not exists default_preset_id uuid references public.tracking_presets(id) on delete set null;

insert into public.tracking_presets (name, description, tracking)
select * from (values
  ('KPI role', 'Roles with measurable targets', '{"attendance":true,"okrs":true,"kpis":true,"tasks":true,"daily_log":true}'::jsonb),
  ('OKR + daily log', 'Goals plus a daily log of what they did', '{"attendance":true,"okrs":true,"kpis":false,"tasks":true,"daily_log":true}'::jsonb),
  ('Daily log only', 'Show up and log the day', '{"attendance":true,"okrs":false,"kpis":false,"tasks":true,"daily_log":true}'::jsonb),
  ('Remote · no attendance', 'Goals and log, no check-in', '{"attendance":false,"okrs":true,"kpis":false,"tasks":true,"daily_log":true}'::jsonb),
  ('Attendance only', 'Check-in only', '{"attendance":true,"okrs":false,"kpis":false,"tasks":false,"daily_log":false}'::jsonb)
) v(name, description, tracking)
where not exists (select 1 from public.tracking_presets);

-- members can't change their own tracking or preset
create or replace function public.protect_profile_fields() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_super_admin() then return new; end if;
  new.role := old.role;
  if public.my_role() = 'member' then
    new.department_id := old.department_id;
    new.manager_id := old.manager_id;
    new.status := old.status;
    new.employee_code := old.employee_code;
    new.designation := old.designation;
    new.join_date := old.join_date;
    new.tracking := old.tracking;
    new.preset_id := old.preset_id;
  end if;
  return new;
end $$;

-- ---------- templates on/off ----------
alter table public.okr_templates add column if not exists active boolean not null default true;

-- ---------- daily log on tasks ----------
alter table public.tasks
  add column if not exists self_added boolean not null default false,
  add column if not exists log_date date,
  add column if not exists minutes int not null default 0,
  add column if not exists completed_at timestamptz;
create index if not exists tasks_log_idx on public.tasks(assignee_id, log_date);

create table if not exists public.task_comments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- ---------- KPIs ----------
create table if not exists public.kpi_definitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  unit text not null default '',
  direction text not null default 'up' check (direction in ('up','down')),
  period text not null default 'weekly' check (period in ('daily','weekly','monthly')),
  source text not null default 'manual' check (source in ('manual','attendance_pct','punctuality_pct','tasks_done','task_completion_pct','avg_work_hours','okr_progress','kudos_received','daily_log_entries')),
  aggregate text not null default 'sum' check (aggregate in ('sum','latest')),
  default_target numeric not null default 0,
  department_id uuid references public.departments(id) on delete set null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.kpi_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  kpi_id uuid not null references public.kpi_definitions(id) on delete cascade,
  target numeric not null default 0,
  weight numeric not null default 1,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.kpi_entries (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.kpi_assignments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  period_start date not null,
  value numeric not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index if not exists kpi_entries_idx on public.kpi_entries(assignment_id, period_start);

-- ---------- announcements ----------
alter table public.announcements
  add column if not exists priority text not null default 'normal' check (priority in ('normal','important','urgent')),
  add column if not exists require_ack boolean not null default false,
  add column if not exists poll_options text[] not null default '{}';

create table if not exists public.announcement_reads (
  id uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz,
  reaction text,
  vote int,
  created_at timestamptz not null default now(),
  unique (announcement_id, user_id)
);

-- ---------- settings: new switches, KPI weight ----------
update public.org_settings set
  modules = '{"okr_templates":true,"kpis":true,"daily_log":true,"polls":true,"analytics":true,"guides":true,"onboarding_tour":true}'::jsonb || modules,
  performance_weights = '{"kpi":0}'::jsonb || performance_weights
where id = 1;

-- ---------- helpers ----------
create or replace function public.can_see_task(tid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from tasks t where t.id = tid and (
      t.assignee_id = auth.uid() or t.created_by = auth.uid() or public.is_super_admin()
      or (t.assignee_id is not null and public.can_manage_user(t.assignee_id))
      or (t.department_id is not null and t.department_id = public.my_department())
    )
  )
$$;

-- ---------- RLS ----------
alter table public.tracking_presets enable row level security;
alter table public.kpi_definitions enable row level security;
alter table public.kpi_assignments enable row level security;
alter table public.kpi_entries enable row level security;
alter table public.task_comments enable row level security;
alter table public.announcement_reads enable row level security;

create policy preset_read on public.tracking_presets for select to authenticated using (true);
create policy preset_write on public.tracking_presets for all to authenticated using (public.is_super_admin()) with check (public.is_super_admin());

create policy kdef_read on public.kpi_definitions for select to authenticated using (true);
create policy kdef_insert on public.kpi_definitions for insert to authenticated with check (public.is_admin_or_above());
create policy kdef_update on public.kpi_definitions for update to authenticated using (public.is_super_admin() or created_by = auth.uid());
create policy kdef_delete on public.kpi_definitions for delete to authenticated using (public.is_super_admin() or created_by = auth.uid());

create policy kas_read on public.kpi_assignments for select to authenticated using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy kas_write on public.kpi_assignments for all to authenticated using (public.can_manage_user(user_id)) with check (public.can_manage_user(user_id));

create policy kent_read on public.kpi_entries for select to authenticated using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy kent_insert on public.kpi_entries for insert to authenticated with check (
  (user_id = auth.uid() and exists (select 1 from kpi_assignments a where a.id = assignment_id and a.user_id = auth.uid()))
  or public.can_manage_user(user_id));
create policy kent_change on public.kpi_entries for update to authenticated using (user_id = auth.uid() or public.can_manage_user(user_id));
create policy kent_delete on public.kpi_entries for delete to authenticated using (user_id = auth.uid() or public.can_manage_user(user_id));

create policy tcom_read on public.task_comments for select to authenticated using (public.can_see_task(task_id));
create policy tcom_insert on public.task_comments for insert to authenticated with check (user_id = auth.uid() and public.can_see_task(task_id));
create policy tcom_delete on public.task_comments for delete to authenticated using (user_id = auth.uid() or public.is_super_admin());

create policy aread_read on public.announcement_reads for select to authenticated using (true);
create policy aread_insert on public.announcement_reads for insert to authenticated with check (user_id = auth.uid());
create policy aread_update on public.announcement_reads for update to authenticated using (user_id = auth.uid());

-- ---------- audit + realtime ----------
do $$
declare t text;
begin
  foreach t in array array['tracking_presets','kpi_definitions','kpi_assignments']
  loop
    execute format('drop trigger if exists audit_%1$s on public.%1$s', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_trigger()', t);
  end loop;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.tasks, public.kpi_entries, public.announcement_reads, public.task_comments;
exception when others then null; end $$;
