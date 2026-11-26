// One place that answers: "should this person see / be measured on X?"
// = the organisation switch (Settings > Features) AND, for tracked things,
//   the person's own tracking switches (Employees > Edit > What we track).
import type { Feature, ModuleId, OrgSettings, Profile, Tracking } from './types';
import { DEFAULT_TRACKING } from './types';

const TRACKED = new Set<keyof Tracking>(['attendance', 'okrs', 'kpis', 'tasks', 'daily_log']);

export function trackingOf(p?: Profile | null): Tracking {
  return { ...DEFAULT_TRACKING, ...(p?.tracking ?? {}) };
}

export function orgOn(settings: OrgSettings, m: ModuleId): boolean {
  return settings.modules?.[m] !== false;
}

/** Feature switched on for the organisation (and for this person, when it is a tracked feature). */
export function has(p: Profile | null | undefined, settings: OrgSettings, f: Feature): boolean {
  if (f === 'attendance') return trackingOf(p).attendance;
  const orgSwitch = orgOn(settings, f as ModuleId);
  if (!orgSwitch) return false;
  if (TRACKED.has(f as keyof Tracking)) return trackingOf(p)[f as keyof Tracking];
  return true;
}

/** Organisation-level only (for manager views of the whole team). */
export function orgHas(settings: OrgSettings, f: Feature): boolean {
  return f === 'attendance' ? true : orgOn(settings, f as ModuleId);
}
