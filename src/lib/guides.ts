// In-app guides. One entry per page. Shown in the "?" sheet, as a first-visit tip,
// and in the Help center. Keep copy short and human.
import type { Role } from './types';

export interface Guide {
  route: string;
  title: string;
  tip: string; // one line, shown the first time someone opens the page
  steps: string[];
  roles?: Role[]; // who the guide is for (all if empty)
  managerNotes?: string[];
}

export const GUIDES: Guide[] = [
  {
    route: '/dashboard',
    title: 'Dashboard',
    tip: 'Your home. Cards here change with your role and what is switched on for you.',
    steps: ['Read anything in the yellow or red “Must read” strip and tap “I have read this”.', 'Use My day to add what you are working on.', 'Tap any card title link to open the full page.'],
    managerNotes: ['Super Admin picks cards per role in Settings → Dashboards, and per department in Departments.'],
  },
  {
    route: '/today',
    title: 'My Day (daily log)',
    tip: 'Add anything you work on today, even unplanned work. No approval needed.',
    steps: ['Type what you are doing and tap +.', 'Optional: pick how long it took (15m, 30m, 1h, 2h).', 'Tap the circle when it is done.', 'Use the arrows to look at earlier days.'],
    managerNotes: ['Open the Team log tab to see everyone’s day.', 'Tap the speech bubble on any item to comment. The person gets a notification.', '“Quiet” means nothing was logged that day.'],
  },
  {
    route: '/kpis',
    title: 'KPIs',
    tip: 'Recurring targets. Manual ones need you to log a number; Auto ones fill themselves.',
    steps: ['Each card shows this period’s number, the target and the % achieved.', 'Tap Log on a Manual KPI to add a number. Several entries in a week add up (unless the KPI uses the latest).', 'The small bars show your last 6 periods.'],
    managerNotes: ['Assign: pick a KPI, set target and weight, select people. Only people with KPIs switched on are listed.', 'Library: create KPIs and switch them on or off. Off KPIs keep their history.', 'Auto sources: attendance %, on-time %, tasks done, task completion, average hours, OKR progress, kudos, daily log entries.'],
  },
  {
    route: '/attendance',
    title: 'Attendance',
    tip: 'Check in at the start of your day, track breaks, and review your tasks on check out.',
    steps: ['Tap Check in to start your shift.', 'Start a Tea or Lunch break and end it when you are back.', 'Tap Check out at the end of the day and update your task statuses.'],
    managerNotes: ['Attendance can be switched off for remote people in Employees → Edit → What we track.'],
  },
  {
    route: '/okrs',
    title: 'OKRs',
    tip: 'Quarterly goals. Update your key results every week.',
    steps: ['Open an objective to see its key results.', 'Tap a key result to update the current value.', 'Progress rolls up automatically.'],
    managerNotes: ['Apply a template to give a person or department a ready set of OKRs.', 'Only active templates show up in the apply list.'],
  },
  {
    route: '/okrs/templates',
    title: 'OKR templates',
    tip: 'Reusable OKR sets. Switch a template off to hide it without deleting it.',
    steps: ['Create a template with objectives and key results.', 'Use the switch to make it active or inactive.', 'Apply it from the OKRs page.'],
    roles: ['super_admin', 'admin'],
  },
  {
    route: '/tasks',
    title: 'Tasks',
    tip: 'The team board. Items you log in My Day show here with an “Added by me” badge.',
    steps: ['Create a task and assign it.', 'Move it across To do → In progress → Review → Done.', 'Filter “Added by me” to see your unplanned work.'],
  },
  {
    route: '/announcements',
    title: 'Announcements',
    tip: 'Company news. Important and urgent posts ask you to confirm you read them.',
    steps: ['Tap “I have read this” on posts that ask for it.', 'React with an emoji.', 'Vote in polls. You can change your vote.'],
    managerNotes: ['Set priority (Normal, Important, Urgent) and turn on “Ask people to confirm”.', 'Add 2 to 6 options to make a poll.', 'See “Read by X of Y” to know who still needs to read it.'],
  },
  {
    route: '/team',
    title: 'Team tracker',
    tip: 'Who is in, on break, or out right now.',
    steps: ['Green = working, amber = on break, grey = not in.', 'Tap a person to see their profile and stats.'],
  },
  {
    route: '/performance',
    title: 'Performance',
    tip: 'Your score mixes attendance, punctuality, OKRs, KPIs and tasks. Only what is tracked for you counts.',
    steps: ['See each part of your score.', 'If something is not tracked for you, it is left out and the rest is re-weighted.'],
    managerNotes: ['Super Admin sets the weights in Settings → Performance. They must add up to 100.'],
  },
  {
    route: '/analytics',
    title: 'Analytics',
    tip: 'Team numbers by period and department. Export to CSV.',
    steps: ['Pick a period and a department.', 'Use “Lowest scores” to see who may need support, then talk to them.'],
    roles: ['super_admin', 'admin'],
  },
  {
    route: '/employees',
    title: 'Employees',
    tip: 'Add people and choose what we track for each one.',
    steps: ['Add a person. The department’s default preset is applied automatically.', 'Edit → What we track: switch Attendance, OKRs, KPIs, Tasks and Daily log on or off.', 'Select several rows and apply a preset in one go.'],
    roles: ['super_admin', 'admin'],
  },
  {
    route: '/settings',
    title: 'Settings',
    tip: 'Switch whole features on or off, manage presets, weights and dashboards.',
    steps: ['Features: one switch per feature for the whole company.', 'Presets: ready-made tracking mixes like “KPI role” or “OKR + daily log”.', 'Dashboards: choose the cards each role sees.'],
    roles: ['super_admin'],
  },
  {
    route: '/leave',
    title: 'Leave',
    tip: 'Apply for leave. Your manager approves it.',
    steps: ['Tap Apply, pick dates and type.', 'Watch the status change to Approved or Rejected.'],
  },
  {
    route: '/chat',
    title: 'Team chat',
    tip: 'Channels for the whole company and each department.',
    steps: ['Pick a channel and type.', 'Use @name to mention someone.'],
  },
];

export const FAQ: { q: string; a: string }[] = [
  { q: 'Why don’t I see KPIs?', a: 'KPIs are switched on per person. If your role works on OKRs and a daily log, you will not see KPIs. Ask your manager if that is wrong.' },
  { q: 'Do I need approval for tasks I add in My Day?', a: 'No. Add anything you work on. Your manager can see it and comment, but does not approve it.' },
  { q: 'Why is attendance not shown for me?', a: 'Attendance may be switched off for your role (for example remote work). It is then left out of your score.' },
  { q: 'How is my score calculated?', a: 'A weighted mix of attendance, punctuality, OKRs, KPIs and tasks. Parts that are not tracked for you are left out and the rest is scaled up.' },
  { q: 'I am in demo mode. Is my data safe?', a: 'Demo mode keeps data in this browser only. Use Profile → Export my data regularly, and do not clear browser data. Moving to the live database fixes this.' },
  { q: 'How do I replay the tour?', a: 'Open Help and tap “Replay the tour”.' },
];

export function guideFor(pathname: string): Guide | undefined {
  return [...GUIDES].sort((a, b) => b.route.length - a.route.length).find((g) => pathname === g.route || pathname.startsWith(g.route + '/'));
}

export const TOUR_KEY = (uid: string) => `zlaqa_tour_done_${uid}`;
export const TIP_KEY = 'zlaqa_tips_seen';
