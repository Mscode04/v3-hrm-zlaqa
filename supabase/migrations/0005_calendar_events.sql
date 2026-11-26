-- =====================================================================
-- Zlaqa Team OS: personal & public calendar events and reminders
-- ADDITIVE ONLY: safe to run on a live database after 0004.
-- =====================================================================

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  date date not null,
  time text,
  kind text not null default 'event' check (kind in ('event','reminder')),
  visibility text not null default 'public' check (visibility in ('private','department','public')),
  department_id uuid references public.departments(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists calendar_events_date_idx on public.calendar_events(date, created_by);

alter table public.calendar_events enable row level security;

create policy cal_read on public.calendar_events for select to authenticated using (
  created_by = auth.uid()
  or visibility = 'public'
  or (visibility = 'department' and department_id is not null and department_id = public.my_department())
);
create policy cal_insert on public.calendar_events for insert to authenticated with check (created_by = auth.uid());
create policy cal_update on public.calendar_events for update to authenticated using (created_by = auth.uid() or public.is_super_admin());
create policy cal_delete on public.calendar_events for delete to authenticated using (created_by = auth.uid() or public.is_super_admin());

drop trigger if exists audit_calendar_events on public.calendar_events;
create trigger audit_calendar_events after insert or update or delete on public.calendar_events for each row execute function public.audit_trigger();

do $$ begin
  alter publication supabase_realtime add table public.calendar_events;
exception when others then null; end $$;
