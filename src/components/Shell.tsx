'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  BarChart3, Building2, CalendarDays, CircleHelp, Gauge, ListChecks, CalendarRange, ClipboardList, Clock, Heart, Home, LayoutDashboard, LayoutTemplate, ListTodo, LogOut,
  Megaphone, Menu, MessageSquare, Moon, Search, Settings, ShieldCheck, Sun, Target, TrendingUp, UserCog, Users, X,
} from 'lucide-react';
import { useMe } from '@/lib/auth';
import { DATA_MODE } from '@/lib/data';
import { useNow, useTable } from '@/lib/hooks';
import { useTheme } from '@/lib/theme';
import { fmtMinutes, startOfToday, todayStr } from '@/lib/format';
import { liveStatus, workedMinutes } from '@/lib/metrics';
import { ROLE_LABEL, type Feature, type Role } from '@/lib/types';
import { has, orgHas } from '@/lib/features';
import { HelpButton, PageTip, Tour } from './Guides';
import { Avatar, Badge, cn, useBodyScrollLock } from './ui';
import { Wordmark } from './bits';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from './NotificationBell';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof Clock;
  roles?: Role[];
  /** feature gate: members need it switched on for themselves; managers need it on for the org */
  feature?: Feature;
  /** personal page: gate on the person's own switches, whatever the role */
  personal?: boolean;
  section: string;
}

export const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
  { href: '/tasks', label: 'Tasks', icon: ListTodo, feature: 'tasks', section: 'Overview' },
  { href: '/today', label: 'My Day', icon: ListChecks, feature: 'daily_log', section: 'Overview' },
  { href: '/attendance', label: 'My Attendance', icon: Clock, feature: 'attendance', personal: true, section: 'Overview' },
  { href: '/team', label: 'Team Tracker', icon: Users, section: 'Overview' },
  { href: '/attendance/records', label: 'Attendance Records', icon: ClipboardList, roles: ['super_admin', 'admin'], section: 'Overview' },
  { href: '/kpis', label: 'KPIs', icon: Gauge, feature: 'kpis', section: 'Performance' },
  { href: '/okrs', label: 'OKRs', icon: Target, feature: 'okrs', section: 'Performance' },
  { href: '/okrs/templates', label: 'OKR Templates', icon: LayoutTemplate, feature: 'okr_templates', roles: ['super_admin', 'admin'], section: 'Performance' },
  { href: '/performance', label: 'Performance', icon: TrendingUp, feature: 'performance', section: 'Performance' },
  { href: '/analytics', label: 'Analytics', icon: BarChart3, feature: 'analytics', roles: ['super_admin', 'admin'], section: 'Performance' },
  { href: '/announcements', label: 'Announcements', icon: Megaphone, feature: 'announcements', section: 'Team' },
  { href: '/chat', label: 'Team Chat', icon: MessageSquare, feature: 'chat', section: 'Team' },
  { href: '/kudos', label: 'Kudos', icon: Heart, feature: 'kudos', section: 'Team' },
  { href: '/calendar', label: 'Calendar', icon: CalendarRange, feature: 'calendar', section: 'Team' },
  { href: '/leave', label: 'Leave', icon: CalendarDays, feature: 'leave', section: 'Team' },
  { href: '/employees', label: 'Employees', icon: UserCog, roles: ['super_admin', 'admin'], section: 'Admin' },
  { href: '/departments', label: 'Departments', icon: Building2, roles: ['super_admin'], section: 'Admin' },
  { href: '/settings', label: 'Settings', icon: Settings, roles: ['super_admin', 'admin'], section: 'Admin' },
  { href: '/audit', label: 'Audit Log', icon: ShieldCheck, roles: ['super_admin'], section: 'Admin' },
  { href: '/help', label: 'Help', icon: CircleHelp, feature: 'guides', section: 'Admin' },
];

function IconBtn({ children, onClick, label, className }: { children: ReactNode; onClick?: () => void; label: string; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className={cn('relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 hover:text-neutral-900 active:scale-95', className)}>
      {children}
    </button>
  );
}

/** Live "my shift" status in the top bar. */
function ShiftPill() {
  const { me } = useMe();
  useNow(30000);
  const todayIso = useMemo(() => startOfToday().toISOString(), []);
  const att = useTable('attendance', { filter: { user_id: me.id, date: todayStr() } });
  const brk = useTable('breaks', { filter: { user_id: me.id }, gte: ['start_at', todayIso] });
  const rec = att.rows[0];
  const live = liveStatus(rec, brk.rows);
  if (att.loading) return null;
  const base = 'flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-xs font-semibold transition active:scale-95 sm:gap-2 sm:px-3';
  if (live.state === 'not_in')
    return (
      <Link href="/attendance" className={cn(base, 'bg-brand text-on-brand shadow-sm hover:opacity-90')}>
        <Clock size={14} /> <span>Check in</span>
      </Link>
    );
  if (live.state === 'on_break')
    return (
      <Link href="/attendance" className={cn(base, 'bg-amber-50 text-amber-700 ring-1 ring-amber-200')}>
        <span className="h-2 w-2 rounded-full bg-amber-500" /> On break
      </Link>
    );
  if (live.state === 'working' && rec)
    return (
      <Link href="/attendance" className={cn(base, 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200')}>
        <span className="h-2 w-2 animate-pulse-ring rounded-full bg-emerald-500" />
        <span className="tabular-nums">{fmtMinutes(workedMinutes(rec, brk.rows))}</span>
      </Link>
    );
  return (
    <Link href="/attendance" className={cn(base, 'hidden bg-neutral-100 text-neutral-600 sm:flex')}>
      Day done
    </Link>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { me, settings, signOut } = useMe();
  const { dark, toggle } = useTheme();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);
  useEffect(() => {
    setOpen(false);
    setPalette(false);
  }, [pathname]);

  useBodyScrollLock(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !palette && !document.querySelector('[data-ui-modal="true"]')) {
        setOpen(false);
      }
    };
    const mq = window.matchMedia('(min-width: 1024px)');
    const onMq = (e: MediaQueryListEvent) => {
      if (e.matches) setOpen(false);
    };
    if (mq.matches) setOpen(false);
    window.addEventListener('keydown', onKey);
    mq.addEventListener('change', onMq);
    return () => {
      window.removeEventListener('keydown', onKey);
      mq.removeEventListener('change', onMq);
    };
  }, [open, palette]);

  const items = NAV.filter(
    (n) => (!n.roles || n.roles.includes(me.role)) && (!n.feature || (me.role === 'member' || n.personal ? has(me, settings, n.feature) : orgHas(settings, n.feature))),
  ).map((n) => (n.href === '/help' && me.role === 'member' ? { ...n, section: 'Team' } : n));
  const active = items.filter((n) => pathname === n.href || pathname.startsWith(n.href + '/')).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const sections = Array.from(new Set(items.map((i) => i.section)));

  useEffect(() => {
    const extra: Record<string, string> = { '/profile': 'My Profile', '/employees': 'Employees' };
    const label = items.find((n) => n.href === active)?.label ?? (pathname.startsWith('/employees/') ? 'Employee Profile' : extra[pathname]) ?? 'Team OS';
    document.title = `${label} · ${settings.company_name}`;
  }, [active, pathname, items, settings.company_name]);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-4 pt-6">
        <Link href="/dashboard">
          <Wordmark imgClassName="h-10 sm:h-11" />
        </Link>
        <div className="mt-1.5 text-xs text-neutral-500">{settings.company_name} · Team OS</div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-3 pb-4">
        {sections.map((s) => (
          <div key={s}>
            <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">{s}</div>
            {items
              .filter((i) => i.section === s)
              .map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className={cn(
                    'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all duration-150',
                    active === i.href ? 'bg-brand text-on-brand shadow-sm' : 'text-neutral-600 hover:translate-x-0.5 hover:bg-neutral-100 hover:text-neutral-900',
                  )}
                >
                  <i.icon size={17} className="transition-transform group-hover:scale-110" />
                  {i.label}
                </Link>
              ))}
          </div>
        ))}
      </nav>
      <div className="border-t border-neutral-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <Link href="/profile" className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-neutral-100">
          <Avatar name={me.full_name} size={34} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{me.full_name}</div>
            <div className="truncate text-xs text-neutral-500">{ROLE_LABEL[me.role]}</div>
          </div>
        </Link>
        <button onClick={toggle} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 sm:hidden">
          {dark ? <Sun size={16} /> : <Moon size={16} />} {dark ? 'Light mode' : 'Dark mode'}
        </button>
        <button onClick={() => setConfirmSignOut(true)} className="mt-1 flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100">
          <LogOut size={16} /> Sign out
        </button>
        {DATA_MODE === 'demo' && (
          <div className="mt-2 px-3">
            <Badge tone="amber">Demo mode · data stays in this browser</Badge>
          </div>
        )}
      </div>
    </div>
  );

  const tracks = (f: Feature) => has(me, settings, f);
  const center = tracks('attendance')
    ? { href: '/attendance', label: 'Attend', icon: Clock, primary: true }
    : tracks('daily_log')
      ? { href: '/today', label: 'My Day', icon: ListChecks, primary: true }
      : { href: '/dashboard', label: 'Home', icon: Home, primary: true };
  type Tab = { href: string; label: string; icon: typeof Clock; primary?: boolean };
  const pool: Tab[] = [
    { href: '/dashboard', label: 'Home', icon: Home },
    ...(tracks('tasks') ? [{ href: '/tasks', label: 'Tasks', icon: ListTodo }] : []),
    ...(tracks('attendance') && tracks('daily_log') ? [{ href: '/today', label: 'Today', icon: ListChecks }] : []),
    ...(tracks('kpis') ? [{ href: '/kpis', label: 'KPIs', icon: Gauge }] : []),
    ...(orgHas(settings, 'chat') ? [{ href: '/chat', label: 'Chat', icon: MessageSquare }] : []),
    { href: '/team', label: 'Team', icon: Users },
    ...(tracks('okrs') ? [{ href: '/okrs', label: 'OKRs', icon: Target }] : []),
  ].filter((t) => t.href !== center.href);
  const side = pool.slice(0, 3);
  const tabs: Tab[] = [side[0], side[1], center, side[2]].filter(Boolean);

  return (
    <div className="min-h-screen overflow-x-hidden bg-neutral-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-neutral-200 bg-surface lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div className="absolute inset-0 animate-fade-in bg-black/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-[82vw] max-w-xs animate-slide-in-left bg-surface shadow-2xl">
            <button className="absolute right-3 top-5 z-10 rounded-lg p-1 hover:bg-neutral-100" onClick={() => setOpen(false)} aria-label="Close menu">
              <X size={18} />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-40 flex h-14 items-center gap-1.5 border-b border-neutral-200/80 px-2.5 sm:gap-2 sm:px-6">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-surface/80 backdrop-blur-xl" />
          <IconBtn onClick={() => setOpen(true)} label="Open menu" className="lg:hidden">
            <Menu size={20} />
          </IconBtn>
          <Link href="/dashboard" className="shrink-0 whitespace-nowrap lg:hidden">
            <Wordmark imgClassName="h-8 sm:h-9" />
          </Link>
          <button
            onClick={() => setPalette(true)}
            className="ml-1 hidden h-9 w-full max-w-md items-center gap-2 rounded-xl border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-400 transition hover:border-neutral-300 md:flex"
          >
            <Search size={15} /> Search people, pages, actions…
            <kbd className="ml-auto rounded-md border border-neutral-200 bg-surface px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1">
            <ShiftPill />
            <IconBtn onClick={() => setPalette(true)} label="Search" className="md:hidden">
              <Search size={18} />
            </IconBtn>
            <IconBtn onClick={toggle} label={dark ? 'Light mode' : 'Dark mode'} className="hidden sm:grid">
              <span key={String(dark)} className="animate-scale-in">
                {dark ? <Sun size={18} /> : <Moon size={18} />}
              </span>
            </IconBtn>
            <HelpButton className="shrink-0" />
            <NotificationBell />
          </div>
        </header>

        <main className="pb-28 lg:pb-0">
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
            <PageTip />
            {children}
          </div>
        </main>
      </div>

      {/* mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-200 bg-surface/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <div className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 1}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const on = active === t.href;
            if ('primary' in t && t.primary)
              return (
                <Link key={t.href} href={t.href} className="flex flex-col items-center justify-center" aria-label={t.label}>
                  <span className={cn('-mt-6 grid h-14 w-14 place-items-center rounded-2xl bg-brand text-on-brand shadow-lg ring-4 ring-neutral-50 transition active:scale-90', on && 'scale-105')}>
                    <t.icon size={24} />
                  </span>
                  <span className="mt-0.5 text-[10px] font-medium text-neutral-500">{t.label}</span>
                </Link>
              );
            return (
              <Link key={t.href} href={t.href} className={cn('flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium transition active:scale-90', on ? 'text-neutral-900' : 'text-neutral-400')}>
                <t.icon size={21} strokeWidth={on ? 2.4 : 1.8} />
                {t.label}
              </Link>
            );
          })}
          <button onClick={() => setOpen(true)} className="flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-medium text-neutral-400 active:scale-90">
            <Menu size={21} /> More
          </button>
        </div>
      </nav>

      <Tour />
      <CommandPalette open={palette} onClose={() => setPalette(false)} items={items} />
      {confirmSignOut && (
        <div
          className="fixed inset-0 z-[75] flex animate-fade-in items-center justify-center bg-black/50 p-4 backdrop-blur-[2px]"
          onMouseDown={() => setConfirmSignOut(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Confirm sign out"
        >
          <div
            className="w-full max-w-sm animate-scale-in rounded-2xl border border-neutral-200 bg-surface p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-600">
                <LogOut size={18} />
              </span>
              <div>
                <h3 className="text-base font-semibold">Sign out?</h3>
                <p className="text-xs text-neutral-500">Are you sure you want to sign out of {settings.company_name}?</p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmSignOut(false)}
                className="rounded-xl border border-neutral-200 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmSignOut(false);
                  signOut();
                }}
                className="rounded-xl bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700"
              >
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
