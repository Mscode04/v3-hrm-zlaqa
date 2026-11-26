import { sleep } from '../cdp.mjs';
import { assert, assertModalLayout, assertNoHorizontalOverflow, assertToast } from '../assertions.mjs';
import {
  ACCOUNTS,
  DEMO_PASSWORD,
  VIEWPORTS,
  clickButton,
  clickSelector,
  ensureTestPngFile,
  fillFieldByLabel,
  fillSelector,
  loginAs,
  navigateRoute,
  readDemoState,
  resetTodayAttendance,
  selectByLabel,
  setCheckboxByLabel,
  setSwitchByLabel,
  setViewport,
  waitForDialog,
  waitForDialogClosed,
} from '../helpers.mjs';

export function buildTier1Tests({ baseUrl, getChrome }) {
  const pngPath = ensureTestPngFile();

  async function withSession(vp, fn) {
    const chrome = getChrome();
    const session = await chrome.createSession(baseUrl);
    try {
      await setViewport(session, vp);
      await fn(session);
    } finally {
      await chrome.closeSession(session);
    }
  }

  return [
    {
      id: 'T1.1',
      name: 'Auth redirect, invalid login error, and quick-login persistence',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await s.goto(`${baseUrl}/dashboard`);
          await s.waitFor(() => window.location.pathname === '/login', {
            timeout: 15_000,
            label: 'redirect unauthenticated /dashboard -> /login',
          });

          await fillSelector(s, 'input[type="email"]', ACCOUNTS.member.email);
          await fillSelector(s, 'input[type="password"]', 'WrongPass123');
          await clickSelector(s, 'button[type="submit"]');
          await s.waitFor(
            () => (document.body.innerText || '').includes('Invalid email or password'),
            { timeout: 10_000, label: 'invalid login error banner' },
          );

          await clickButton(s, 'Member · Developer');
          await s.waitFor(() => window.location.pathname === '/dashboard', {
            timeout: 15_000,
            label: 'login redirect to /dashboard',
          });
          const state = await readDemoState(s);
          assert(
            state.session?.email === ACCOUNTS.member.email,
            `Expected session email ${ACCOUNTS.member.email}, got ${state.session?.email}`,
          );
        }),
    },

    {
      id: 'T1.2',
      name: 'Onboarding Tour & PageTip modal layout, dismiss, and localStorage persistence',
      run: () =>
        withSession(VIEWPORTS.mobile375, async (s) => {
          await loginAs(s, baseUrl, 'member', { suppress: false });
          await waitForDialog(s, /Step 1 of/i, 12_000);
          await assertModalLayout(s, { modalTitle: 'Step 1 of', viewport: VIEWPORTS.mobile375.name });
          await clickButton(s, 'Skip', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, /Step 1 of/i);

          const tourKeyWritten = await s.eval(() => {
            const sess = JSON.parse(localStorage.getItem('zlaqa_os_demo_session') || '{}');
            return Boolean(sess.id && localStorage.getItem(`zlaqa_tour_done_${sess.id}`));
          });
          assert(tourKeyWritten, 'Expected zlaqa_tour_done_<uid> in localStorage after skipping Tour');

          // Dismiss PageTip banner
          await clickSelector(s, 'button[aria-label="Dismiss tip"]');
          const tipsSeen = await s.eval(() => JSON.parse(localStorage.getItem('zlaqa_tips_seen') || '[]'));
          assert(tipsSeen.includes('/dashboard'), `Expected zlaqa_tips_seen to include /dashboard, got ${tipsSeen}`);

          await s.reload();
          await sleep(400);
          const tourReopened = await s.eval(() =>
            Array.from(document.querySelectorAll('[role="dialog"]')).some((d) =>
              (d.textContent || '').includes('Step 1 of'),
            ),
          );
          assert(!tourReopened, 'Tour dialog must stay closed after reload');
        }),
    },

    {
      id: 'T1.3',
      name: 'Global overlays & query-opened modals escape header/PageTransition/stagger traps (desktop & mobile)',
      run: () =>
        withSession(VIEWPORTS.mobile375, async (s) => {
          await loginAs(s, baseUrl, 'sales');

          // HelpButton (inside <header>) must portal out to document.body
          await clickSelector(s, 'button[aria-label="Help for this page"]');
          await waitForDialog(s, /How to use/i);
          await assertModalLayout(s, { modalTitle: 'How to use', viewport: '375x812 (HelpButton)' });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, /How to use/i);

          // NotificationBell must not be trapped/clipped by <header>
          await clickSelector(s, 'button[aria-label="Notifications"]');
          const notifCheck = await s.waitFor(() => {
            const heading = Array.from(document.querySelectorAll('span')).find(
              (el) => el.textContent?.trim() === 'Notifications',
            );
            const pop = heading?.parentElement?.parentElement;
            if (!pop) return null;
            const r = pop.getBoundingClientRect();
            return {
              top: r.top,
              left: r.left,
              right: r.right,
              bottom: r.bottom,
              iw: window.innerWidth,
              ih: window.innerHeight,
            };
          });
          assert(
            notifCheck.top >= 0 &&
              notifCheck.left >= 0 &&
              notifCheck.right <= notifCheck.iw + 1 &&
              notifCheck.bottom <= notifCheck.ih + 1,
            `NotificationBell clipped on mobile: ${JSON.stringify(notifCheck)}`,
          );
          await s.pressKey('Escape');

          // Mobile sidebar drawer
          await clickSelector(s, 'button[aria-label="Open menu"]');
          await waitForDialog(s, /Navigation menu/i);
          await s.pressKey('Escape');
          await waitForDialogClosed(s, /Navigation menu/i);

          // Mobile CommandPalette
          await clickSelector(s, 'button[aria-label="Search"]');
          await waitForDialog(s, /Command palette/i);
          await s.pressKey('Escape');
          await waitForDialogClosed(s, /Command palette/i);

          // Dashboard MyKpis LogKpiSheet (inside .stagger)
          await clickButton(s, 'Log', { exact: true });
          await waitForDialog(s, /Log ·/i);
          await assertModalLayout(s, { modalTitle: 'Log ·', viewport: '375x812 (Dashboard .stagger)' });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, /Log ·/i);

          // Query-opened modals (inside PageTransition)
          for (const [route, title] of [
            ['/tasks?new=1', 'New task'],
            ['/leave?new=1', 'Apply for leave'],
            ['/kudos?new=1', 'Send kudos'],
          ]) {
            await navigateRoute(s, baseUrl, route);
            await waitForDialog(s, title);
            await assertModalLayout(s, { modalTitle: title, viewport: `375x812 (${route})` });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, title);
          }
        }),
    },

    {
      id: 'T1.4',
      name: 'Check-in WITHOUT image (Start your day + Skip selfie) on desktop & mobile',
      run: () =>
        withSession(VIEWPORTS.mobile375, async (s) => {
          await loginAs(s, baseUrl, 'member');
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await assertModalLayout(s, { modalTitle: 'Start your day', viewport: VIEWPORTS.mobile375.name });
          await clickButton(s, 'Good', { insideDialog: true });
          await fillFieldByLabel(s, "What's your main focus today", 'T1.4 focus without selfie');
          await clickButton(s, /^Continue/i, { insideDialog: true });

          await waitForDialog(s, 'Check-in selfie');
          await assertModalLayout(s, { modalTitle: 'Check-in selfie', viewport: VIEWPORTS.mobile375.name });
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');
          await assertToast(s, /Checked in/i);

          await s.waitFor(
            () => (document.body.innerText || '').includes('T1.4 focus without selfie'),
            { label: 'today focus banner after check-in' },
          );
          const uiCheck = await s.eval(() => ({
            noSelfieCount: document.querySelectorAll('[title="No selfie"]').length,
            selfieImgCount: document.querySelectorAll('img[alt="selfie"]').length,
          }));
          assert(uiCheck.noSelfieCount >= 1, 'Expected [title="No selfie"] placeholder in timeline');
          assert(uiCheck.selfieImgCount === 0, 'Expected zero img[alt="selfie"] when selfie was skipped');

          const state = await readDemoState(s);
          const today = await s.eval(() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          });
          const row = state.data.attendance.find((a) => a.user_id === state.session.id && a.date === today);
          assert(row && row.check_in, 'Expected persisted today attendance row with check_in');
          assert(row.check_in_selfie === null, `Expected check_in_selfie === null, got ${row.check_in_selfie}`);
          assert(row.mood === 4, `Expected mood === 4, got ${row.mood}`);
        }),
    },

    {
      id: 'T1.5',
      name: 'Check-in WITH image (Upload path + Fake-camera Capture path + Selfie Zoom)',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'member');
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          // Path A: File upload + Retake + Use this photo
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await assertModalLayout(s, { modalTitle: 'Check-in selfie', viewport: VIEWPORTS.desktop1280.name });

          await s.uploadFile('[role="dialog"] input[type="file"]', pngPath);
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')), {
            label: 'selfie upload preview',
          });
          await clickButton(s, 'Retake', { insideDialog: true });
          await s.waitFor(() => !document.querySelector('[role="dialog"] img[alt="selfie preview"]'), {
            label: 'retake clears preview',
          });

          // Path B: Fake camera Capture -> Use this photo
          await s.waitFor(
            () => {
              const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
                /Capture/i.test(b.textContent || ''),
              );
              return Boolean(btn && !btn.disabled);
            },
            { timeout: 10_000, label: 'fake camera Capture button enabled' },
          );
          await clickButton(s, 'Capture', { insideDialog: true });
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')), {
            label: 'captured selfie preview',
          });
          await assertModalLayout(s, { modalTitle: 'Check-in selfie', viewport: VIEWPORTS.desktop1280.name });
          await clickButton(s, 'Use this photo', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');
          await assertToast(s, /Checked in/i);

          // Verify image stored & zoom modal works
          await clickSelector(s, 'img[alt="selfie"]');
          await waitForDialog(s, 'Selfie');
          await assertModalLayout(s, { modalTitle: 'Selfie', viewport: VIEWPORTS.desktop1280.name });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, 'Selfie');

          const state = await readDemoState(s);
          const todayRow = state.data.attendance.find(
            (a) => a.user_id === state.session.id && a.check_in_selfie,
          );
          assert(Boolean(todayRow), 'Expected check_in_selfie populated');
          assert(
            Boolean(state.files[todayRow.check_in_selfie]?.startsWith('data:image/')),
            'Expected uploaded/captured selfie in zlaqa_os_demo_files',
          );
        }),
    },

    {
      id: 'T1.6',
      name: 'Check-out WITHOUT image (Wrap up your day + Skip selfie)',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'member');
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await fillFieldByLabel(s, "What's your main focus today", 'Morning task for checkout');
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');

          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await assertModalLayout(s, { modalTitle: 'Wrap up your day', viewport: VIEWPORTS.desktop1280.name });
          const hasFocus = await s.eval(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('Morning task for checkout'),
          );
          assert(hasFocus, 'Wrap up modal should display morning focus');
          await fillFieldByLabel(s, 'What did you get done', 'Completed T1.6 wrap-up');
          await clickButton(s, /^Continue/i, { insideDialog: true });

          await waitForDialog(s, 'Check-out selfie');
          await assertModalLayout(s, { modalTitle: 'Check-out selfie', viewport: VIEWPORTS.desktop1280.name });
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');
          await assertToast(s, /Checked out/i);

          await s.waitFor(
            () => (document.body.innerText || '').includes('Done for today.') && (document.body.innerText || '').includes('Completed T1.6 wrap-up'),
            { label: 'Done for today banner' },
          );
          const state = await readDemoState(s);
          const row = state.data.attendance.find(
            (a) => a.user_id === state.session.id && a.summary === 'Completed T1.6 wrap-up',
          );
          assert(row && row.check_out && row.check_out_selfie === null, 'Expected check_out set and check_out_selfie === null');
        }),
    },

    {
      id: 'T1.7',
      name: 'Check-out WITH uploaded image',
      run: () =>
        withSession(VIEWPORTS.mobile375, async (s) => {
          await loginAs(s, baseUrl, 'member');
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');

          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-out selfie');
          await assertModalLayout(s, { modalTitle: 'Check-out selfie', viewport: VIEWPORTS.mobile375.name });

          await s.uploadFile('[role="dialog"] input[type="file"]', pngPath);
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')), {
            label: 'check-out upload preview',
          });
          await clickButton(s, 'Use this photo', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');
          await assertToast(s, /Checked out/i);

          const hasImg = await s.eval(() => document.querySelectorAll('img[alt="selfie"]').length >= 1);
          assert(hasImg, 'Expected check-out selfie image rendered');
        }),
    },

    {
      id: 'T1.8',
      name: 'Tasks & Today modals (NewTask, QuickAdd, CommentsSheet) happy path & layout',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // NewTask
          await navigateRoute(s, baseUrl, '/tasks');
          await clickButton(s, 'New task');
          await waitForDialog(s, 'New task');
          await assertModalLayout(s, { modalTitle: 'New task', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Title', 'T1.8 E2E Task');
          await fillFieldByLabel(s, 'Details', 'Testing task modal submission');
          await selectByLabel(s, 'Assignee', 'Rahul Varma');
          await selectByLabel(s, 'Priority', 'high');
          await fillFieldByLabel(s, 'Due date', '2026-12-20');
          await clickButton(s, 'Create task', { insideDialog: true });
          await waitForDialogClosed(s, 'New task');
          await assertToast(s, 'Task created');
          await s.waitFor(() => (document.body.innerText || '').includes('T1.8 E2E Task'), {
            label: 'T1.8 E2E Task visible on board',
          });

          // Switch to member for /today QuickAdd & CommentsSheet (superadmin has daily_log=false)
          await loginAs(s, baseUrl, 'member');
          await navigateRoute(s, baseUrl, '/today');
          await fillSelector(s, 'input[placeholder*="What are you working on"]', 'T1.8 QuickAdd Item');
          await clickButton(s, '30m', { exact: true });
          await clickSelector(s, 'button[aria-label="Add task"]');
          await assertToast(s, 'Added to your day');

          await clickSelector(s, 'button[aria-label="Comments"]');
          await waitForDialog(s, 'Comments');
          await assertModalLayout(s, { modalTitle: 'Comments', viewport: VIEWPORTS.desktop1280.name });
          await fillSelector(s, '[role="dialog"] input[placeholder="Write a comment"]', 'T1.8 comment text');
          await clickButton(s, 'Send', { insideDialog: true });
          await s.waitFor(
            () => (document.querySelector('[role="dialog"]')?.textContent || '').includes('T1.8 comment text'),
            { label: 'sent comment visible in CommentsSheet' },
          );
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, 'Comments');
        }),
    },

    {
      id: 'T1.9',
      name: 'OKRs & Templates modals (ObjectiveModal, KrEditor, KrUpdateModal, TemplateEditor, ApplyTemplateModal)',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/okrs');

          await clickButton(s, 'New objective');
          await waitForDialog(s, 'New objective');
          await assertModalLayout(s, { modalTitle: 'New objective', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Objective', 'T1.9 E2E Objective');
          await fillFieldByLabel(s, 'Why it matters', 'Verify OKR modal');
          await selectByLabel(s, 'Level', 'department');
          await selectByLabel(s, 'Department', 'Engineering');
          await fillFieldByLabel(s, 'Due date', '2026-12-30');
          await fillSelector(s, '[role="dialog"] input[placeholder="Key result"]', 'Ship E2E coverage');
          await clickButton(s, 'Create objective', { insideDialog: true });
          await waitForDialogClosed(s, 'New objective');
          await assertToast(s, 'Objective created');

          // KrUpdateModal
          await clickButton(s, 'Everything');
          await clickButton(s, 'Update', { exact: true });
          await waitForDialog(s, 'Check-in on key result');
          await assertModalLayout(s, { modalTitle: 'Check-in on key result', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Current value', '42');
          await fillFieldByLabel(s, 'What changed', 'Progress update T1.9');
          await clickButton(s, 'Save update', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in on key result');
          await assertToast(s, /Progress updated|Key result achieved/i);

          // TemplateEditor + ApplyTemplateModal
          await navigateRoute(s, baseUrl, '/okrs/templates');
          await clickButton(s, 'New template');
          await waitForDialog(s, 'New template');
          await assertModalLayout(s, { modalTitle: 'New template', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Template name', 'T1.9 QA Template');
          await fillFieldByLabel(s, 'Title', 'Quality Objective');
          await fillSelector(s, '[role="dialog"] input[placeholder="Key result"]', 'Zero regressions');
          await clickButton(s, 'Save template', { insideDialog: true });
          await waitForDialogClosed(s, 'New template');

          await clickButton(s, 'Use', { exact: true });
          await waitForDialog(s, 'Apply OKR template');
          await assertModalLayout(s, { modalTitle: 'Apply OKR template', viewport: VIEWPORTS.desktop1280.name });
          await setCheckboxByLabel(s, 'Rahul Varma', true);
          await clickButton(s, /Create OKRs for 1/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Apply OKR template');
          await assertToast(s, /OKRs created for 1/i);
        }),
    },

    {
      id: 'T1.10',
      name: 'KPI modals (KpiDefModal, AssignKpiModal, LogKpiSheet) happy path & layout',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/kpis');

          await clickButton(s, 'New KPI');
          await waitForDialog(s, 'New KPI');
          await assertModalLayout(s, { modalTitle: 'New KPI', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Name', 'T1.10 Reviews');
          await selectByLabel(s, 'How it is measured', 'manual');
          await selectByLabel(s, 'Period', 'weekly');
          await fillFieldByLabel(s, 'Default target', '10');
          await fillFieldByLabel(s, 'Unit', 'reviews');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'New KPI');

          await clickButton(s, 'Assign');
          await waitForDialog(s, 'Assign a KPI');
          await assertModalLayout(s, { modalTitle: 'Assign a KPI', viewport: VIEWPORTS.desktop1280.name });
          await selectByLabel(s, 'KPI', 'T1.10 Reviews');
          await setCheckboxByLabel(s, 'Ayesha Khan', true);
          await clickButton(s, 'Assign', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'Assign a KPI');
          await assertToast(s, /KPI assigned/i);

          // Team log on /kpis
          await clickButton(s, 'log', { exact: true });
          await waitForDialog(s, /Log ·/i);
          await assertModalLayout(s, { modalTitle: 'Log ·', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, /Value/i, '5');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, /Log ·/i);
          await assertToast(s, 'KPI logged');
        }),
    },

    {
      id: 'T1.11',
      name: 'Leave (Apply) & Attendance Correction (EditRecord) modals happy path & layout',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'member');
          await navigateRoute(s, baseUrl, '/leave');
          await clickButton(s, 'Apply for leave');
          await waitForDialog(s, 'Apply for leave');
          await assertModalLayout(s, { modalTitle: 'Apply for leave', viewport: VIEWPORTS.desktop1280.name });
          await selectByLabel(s, 'Type', 'Casual');
          await fillFieldByLabel(s, 'From', '2026-12-07');
          await fillFieldByLabel(s, 'To', '2026-12-07');
          await fillFieldByLabel(s, 'Reason', 'T1.11 personal errand');
          await clickButton(s, 'Submit', { insideDialog: true });
          await waitForDialogClosed(s, 'Apply for leave');
          await assertToast(s, 'Leave request sent');

          await loginAs(s, baseUrl, 'manager');
          await navigateRoute(s, baseUrl, '/attendance/records');
          await clickSelector(s, 'button[aria-label="Correct record"]');
          await waitForDialog(s, /Correct record/i);
          await assertModalLayout(s, { modalTitle: 'Correct record', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Check-in time', '09:15');
          await fillFieldByLabel(s, 'Check-out time', '18:15');
          await selectByLabel(s, 'Status', 'present');
          await fillFieldByLabel(s, 'Reason / notes', 'T1.11 verified correction');
          await clickButton(s, 'Save correction', { insideDialog: true });
          await waitForDialogClosed(s, /Correct record/i);
          await assertToast(s, 'Record corrected');
        }),
    },

    {
      id: 'T1.12',
      name: 'Admin/Org & Social/Comms modals (Employee, Dept, Preset, Announcement, Readers, Holiday, DayDetail, Kudos, Chat)',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // EmployeeForm
          await navigateRoute(s, baseUrl, '/employees');
          await clickButton(s, 'Add employee');
          await waitForDialog(s, 'Add employee');
          await assertModalLayout(s, { modalTitle: 'Add employee', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Full name', 'T1.12 New Hire');
          await fillFieldByLabel(s, 'Work email', 't112hire@zlaqa.demo');
          await fillFieldByLabel(s, 'Temporary password', DEMO_PASSWORD);
          await setSwitchByLabel(s, 'KPIs', true);
          await clickButton(s, 'Create login', { insideDialog: true });
          await waitForDialogClosed(s, 'Add employee');

          // DeptForm
          await navigateRoute(s, baseUrl, '/departments');
          await clickButton(s, 'New department');
          await waitForDialog(s, 'New department');
          await assertModalLayout(s, { modalTitle: 'New department', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Name', 'T1.12 QA Dept');
          await setSwitchByLabel(s, 'Custom dashboard for this department', true);
          await assertModalLayout(s, { modalTitle: 'New department', viewport: '1280x800 (23 widgets)' });
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'New department');

          // PresetModal
          await navigateRoute(s, baseUrl, '/settings?tab=presets');
          await clickButton(s, 'New preset');
          await waitForDialog(s, 'New preset');
          await assertModalLayout(s, { modalTitle: 'New preset', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Name', 'T1.12 Preset');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'New preset');
          await assertToast(s, 'Preset saved');

          // NewAnnouncement & Readers
          await navigateRoute(s, baseUrl, '/announcements');
          await clickButton(s, 'New announcement');
          await waitForDialog(s, 'New announcement');
          await assertModalLayout(s, { modalTitle: 'New announcement', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Title', 'T1.12 Townhall');
          await fillFieldByLabel(s, 'Message', 'All hands at 4 PM');
          await selectByLabel(s, 'Priority', 'important');
          await clickButton(s, 'Add a poll', { insideDialog: true });
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 1"]', 'Yes');
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 2"]', 'Later');
          await clickButton(s, 'Publish', { insideDialog: true });
          await waitForDialogClosed(s, 'New announcement');

          await clickButton(s, /Read by/i);
          await waitForDialog(s, /Who read/i);
          await assertModalLayout(s, { modalTitle: 'Who read', viewport: VIEWPORTS.desktop1280.name });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, /Who read/i);

          // AddHoliday & DayDetail
          await navigateRoute(s, baseUrl, '/calendar');
          await clickButton(s, 'Add holiday');
          await waitForDialog(s, 'Add holiday');
          await assertModalLayout(s, { modalTitle: 'Add holiday', viewport: VIEWPORTS.desktop1280.name });
          const today = await s.eval(() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          });
          await fillFieldByLabel(s, 'Date', today);
          await fillFieldByLabel(s, 'Name', 'T1.12 Founder Day');
          await clickButton(s, 'Add', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'Add holiday');

          await clickButton(s, 'T1.12 Founder Day');
          await waitForDialog(s);
          await assertModalLayout(s, { viewport: '1280x800 (DayDetail)' });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s);

          // SendKudos
          await navigateRoute(s, baseUrl, '/kudos');
          await clickButton(s, 'Send kudos');
          await waitForDialog(s, 'Send kudos');
          await assertModalLayout(s, { modalTitle: 'Send kudos', viewport: VIEWPORTS.desktop1280.name });
          await selectByLabel(s, 'To', 'Rahul Varma');
          await fillFieldByLabel(s, 'Message', 'T1.12 great reliability!');
          await clickButton(s, 'Send kudos', { insideDialog: true });
          await waitForDialogClosed(s, 'Send kudos');

          // Chat NewChannel & NewDm
          await navigateRoute(s, baseUrl, '/chat');
          await clickSelector(s, 'button[title="New channel"]');
          await waitForDialog(s, 'New channel');
          await assertModalLayout(s, { modalTitle: 'New channel', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Name', 't112-qa');
          await selectByLabel(s, 'Type', 'private');
          await setCheckboxByLabel(s, 'Rahul Varma', true);
          await clickButton(s, 'Create', { insideDialog: true });
          await waitForDialogClosed(s, 'New channel');

          await clickSelector(s, 'button[title="Direct message"]');
          await waitForDialog(s, 'Direct message');
          await assertModalLayout(s, { modalTitle: 'Direct message', viewport: VIEWPORTS.desktop1280.name });
          await clickButton(s, 'Rahul Varma', { insideDialog: true });
          await waitForDialogClosed(s, 'Direct message');
          await assertNoHorizontalOverflow(s, 'chat desktop');
        }),
    },
  ];
}
