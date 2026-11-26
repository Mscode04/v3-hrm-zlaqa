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

export function buildTier4Tests({ baseUrl, getChrome }) {
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
      id: 'T4.1',
      name: 'Scenario 1: Daily Member Workflow (Desktop 1280x800 & Mobile 375x812) — Skip selfie check-in/out + Today + Tasks + Break',
      run: async () => {
        for (const vp of [VIEWPORTS.desktop1280, VIEWPORTS.mobile375]) {
          await withSession(vp, async (s) => {
            await loginAs(s, baseUrl, 'member');
            await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

            // Check-in without image
            await clickButton(s, /^Check in/i);
            await waitForDialog(s, 'Start your day');
            await assertModalLayout(s, { modalTitle: 'Start your day', viewport: vp.name });
            await clickButton(s, 'Great', { insideDialog: true });
            await fillFieldByLabel(s, "What's your main focus today", `T4.1 focus (${vp.name})`);
            await clickButton(s, /^Continue/i, { insideDialog: true });
            await waitForDialog(s, 'Check-in selfie');
            await assertModalLayout(s, { modalTitle: 'Check-in selfie', viewport: vp.name });
            await clickButton(s, /Skip/i, { insideDialog: true });
            await waitForDialogClosed(s, 'Check-in selfie');
            await assertToast(s, /Checked in/i);

            // /today QuickAdd + CommentsSheet
            await navigateRoute(s, baseUrl, '/today');
            await fillSelector(s, 'input[placeholder*="What are you working on"]', `T4.1 quick (${vp.name})`);
            await clickButton(s, '1h', { exact: true });
            await clickSelector(s, 'button[aria-label="Add task"]');
            await assertToast(s, 'Added to your day');
            await clickSelector(s, 'button[aria-label="Comments"]');
            await waitForDialog(s, 'Comments');
            await assertModalLayout(s, { modalTitle: 'Comments', viewport: vp.name });
            await fillSelector(s, '[role="dialog"] input[placeholder="Write a comment"]', 'T4.1 update');
            await clickButton(s, 'Send', { insideDialog: true });
            await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
            await waitForDialogClosed(s, 'Comments');

            // /tasks NewTask
            await navigateRoute(s, baseUrl, '/tasks');
            await clickButton(s, 'New task');
            await waitForDialog(s, 'New task');
            await assertModalLayout(s, { modalTitle: 'New task', viewport: vp.name });
            await fillFieldByLabel(s, 'Title', `T4.1 task (${vp.name})`);
            await clickButton(s, 'Create task', { insideDialog: true });
            await waitForDialogClosed(s, 'New task');
            await assertToast(s, 'Task created');

            // Return to /attendance -> Tea break -> End break -> Check-out skip
            await navigateRoute(s, baseUrl, '/attendance');
            await clickButton(s, /Tea 0\/2/i);
            await s.waitFor(() => (document.body.innerText || '').includes('Tea break in progress'));
            await clickButton(s, /End break/i);
            await clickButton(s, 'Check out');
            await waitForDialog(s, 'Wrap up your day');
            await assertModalLayout(s, { modalTitle: 'Wrap up your day', viewport: vp.name });
            await fillFieldByLabel(s, 'What did you get done', `T4.1 done (${vp.name})`);
            await clickButton(s, /^Continue/i, { insideDialog: true });
            await waitForDialog(s, 'Check-out selfie');
            await assertModalLayout(s, { modalTitle: 'Check-out selfie', viewport: vp.name });
            await clickButton(s, /Skip/i, { insideDialog: true });
            await waitForDialogClosed(s, 'Check-out selfie');
            await assertToast(s, /Checked out/i);
            await assertNoHorizontalOverflow(s, `T4.1 ${vp.name}`);
          });
        }
      },
    },

    {
      id: 'T4.2',
      name: 'Scenario 2: Narrow Mobile (320x568) Sales Workflow — Dashboard LogKpiSheet (.stagger) + Image Check-in + Skip Check-out + Leave Half-day',
      run: () =>
        withSession(VIEWPORTS.mobile320, async (s) => {
          await loginAs(s, baseUrl, 'sales');

          // Dashboard LogKpiSheet inside .stagger
          await clickButton(s, 'Log', { exact: true });
          await waitForDialog(s, /Log ·/i);
          await assertModalLayout(s, { modalTitle: 'Log ·', viewport: '320x568 (Dashboard .stagger)' });
          await fillFieldByLabel(s, /Value/i, '3');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, /Log ·/i);
          await assertToast(s, 'KPI logged');

          // Check-in WITH image, Check-out WITHOUT image
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.sales.email);
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await assertModalLayout(s, { modalTitle: 'Start your day', viewport: VIEWPORTS.mobile320.name });
          await clickButton(s, 'Okay', { insideDialog: true });
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await assertModalLayout(s, { modalTitle: 'Check-in selfie', viewport: VIEWPORTS.mobile320.name });
          await s.uploadFile('[role="dialog"] input[type="file"]', pngPath);
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')));
          await clickButton(s, 'Use this photo', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');

          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await assertModalLayout(s, { modalTitle: 'Wrap up your day', viewport: VIEWPORTS.mobile320.name });
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-out selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');

          // /leave half-day
          await navigateRoute(s, baseUrl, '/leave');
          await clickButton(s, 'Apply for leave');
          await waitForDialog(s, 'Apply for leave');
          await assertModalLayout(s, { modalTitle: 'Apply for leave', viewport: VIEWPORTS.mobile320.name });
          await fillFieldByLabel(s, 'From', '2026-12-07');
          await fillFieldByLabel(s, 'To', '2026-12-07');
          await setCheckboxByLabel(s, 'Half day', true);
          await fillFieldByLabel(s, 'Reason', 'T4.2 half day');
          await clickButton(s, 'Submit', { insideDialog: true });
          await waitForDialogClosed(s, 'Apply for leave');
          await assertToast(s, 'Leave request sent');
          await assertNoHorizontalOverflow(s, 'T4.2 320x568');
        }),
    },

    {
      id: 'T4.3',
      name: 'Scenario 3: End-to-End Admin Org & Comms Workflow (Desktop 1280x800)',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // 1. Add Employee
          await navigateRoute(s, baseUrl, '/employees');
          await clickButton(s, 'Add employee');
          await waitForDialog(s, 'Add employee');
          await assertModalLayout(s, { modalTitle: 'Add employee', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Full name', 'T4.3 Org Member');
          await fillFieldByLabel(s, 'Work email', 't43member@zlaqa.demo');
          await fillFieldByLabel(s, 'Temporary password', DEMO_PASSWORD);
          await clickButton(s, 'Create login', { insideDialog: true });
          await waitForDialogClosed(s, 'Add employee');

          // 2. New Department (23 widgets)
          await navigateRoute(s, baseUrl, '/departments');
          await clickButton(s, 'New department');
          await waitForDialog(s, 'New department');
          await fillFieldByLabel(s, 'Name', 'T4.3 Dept');
          await setSwitchByLabel(s, 'Custom dashboard for this department', true);
          await assertModalLayout(s, { modalTitle: 'New department', viewport: '1280x800 (23 widgets)' });
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'New department');

          // 3. New KPI + Assign
          await navigateRoute(s, baseUrl, '/kpis');
          await clickButton(s, 'New KPI');
          await waitForDialog(s, 'New KPI');
          await assertModalLayout(s, { modalTitle: 'New KPI', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Name', 'T4.3 SLA');
          await fillFieldByLabel(s, 'Default target', '99');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'New KPI');

          await clickButton(s, 'Assign');
          await waitForDialog(s, 'Assign a KPI');
          await assertModalLayout(s, { modalTitle: 'Assign a KPI', viewport: VIEWPORTS.desktop1280.name });
          await selectByLabel(s, 'KPI', 'T4.3 SLA');
          await setCheckboxByLabel(s, 'Ayesha Khan', true);
          await clickButton(s, 'Assign', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'Assign a KPI');

          // 4. OKR Template + Apply
          await navigateRoute(s, baseUrl, '/okrs/templates');
          await clickButton(s, 'New template');
          await waitForDialog(s, 'New template');
          await assertModalLayout(s, { modalTitle: 'New template', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Template name', 'T4.3 Eng Template');
          await fillFieldByLabel(s, 'Title', 'T4.3 Velocity');
          await fillSelector(s, '[role="dialog"] input[placeholder="Key result"]', 'T4.3 Lead time');
          await clickButton(s, 'Save template', { insideDialog: true });
          await waitForDialogClosed(s, 'New template');

          await clickButton(s, 'Use', { exact: true });
          await waitForDialog(s, 'Apply OKR template');
          await assertModalLayout(s, { modalTitle: 'Apply OKR template', viewport: VIEWPORTS.desktop1280.name });
          await setCheckboxByLabel(s, 'Rahul Varma', true);
          await clickButton(s, /Create OKRs for 1/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Apply OKR template');

          // 5. New Announcement (4 poll options) + Readers
          await navigateRoute(s, baseUrl, '/announcements');
          await clickButton(s, 'New announcement');
          await waitForDialog(s, 'New announcement');
          await fillFieldByLabel(s, 'Title', 'T4.3 Policy Update');
          await fillFieldByLabel(s, 'Message', 'Vote on Friday slot');
          await clickButton(s, 'Add a poll', { insideDialog: true });
          await clickButton(s, 'Add option', { insideDialog: true });
          await clickButton(s, 'Add option', { insideDialog: true });
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 1"]', '2 PM');
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 2"]', '3 PM');
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 3"]', '4 PM');
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 4"]', '5 PM');
          await assertModalLayout(s, { modalTitle: 'New announcement', viewport: VIEWPORTS.desktop1280.name });
          await clickButton(s, 'Publish', { insideDialog: true });
          await waitForDialogClosed(s, 'New announcement');

          await clickButton(s, /Read by/i);
          await waitForDialog(s, /Who read/i);
          await assertModalLayout(s, { modalTitle: 'Who read', viewport: VIEWPORTS.desktop1280.name });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, /Who read/i);
        }),
    },

    {
      id: 'T4.4',
      name: 'Scenario 4: End-to-End Admin Mobile Workflow (375x812) — Fab, Dept 23 widgets, EditRecord, Chat Mobile Triggers',
      run: () =>
        withSession(VIEWPORTS.mobile375, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // Mobile Employees Add + Edit
          await navigateRoute(s, baseUrl, '/employees');
          await clickButton(s, 'Add employee');
          await waitForDialog(s, 'Add employee');
          await assertModalLayout(s, { modalTitle: 'Add employee', viewport: VIEWPORTS.mobile375.name });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'Add employee');

          // Mobile Dept 23 widgets
          await navigateRoute(s, baseUrl, '/departments');
          await clickButton(s, 'New department');
          await waitForDialog(s, 'New department');
          await setSwitchByLabel(s, 'Custom dashboard for this department', true);
          await assertModalLayout(s, { modalTitle: 'New department', viewport: '375x812 (23 widgets)' });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New department');

          // Mobile Announcement via <Fab>
          await navigateRoute(s, baseUrl, '/announcements');
          await clickSelector(s, 'button[aria-label="New announcement"]');
          await waitForDialog(s, 'New announcement');
          await assertModalLayout(s, { modalTitle: 'New announcement', viewport: '375x812 (Fab)' });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New announcement');

          // Mobile EditRecord
          await navigateRoute(s, baseUrl, '/attendance/records');
          await clickSelector(s, 'button[aria-label="Correct record"]');
          await waitForDialog(s, /Correct record/i);
          await assertModalLayout(s, { modalTitle: 'Correct record', viewport: VIEWPORTS.mobile375.name });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, /Correct record/i);

          // Mobile Chat triggers (New channel & Direct message)
          await navigateRoute(s, baseUrl, '/chat');
          await clickSelector(s, 'button[title="New channel"], button[aria-label*="New channel" i]');
          await waitForDialog(s, 'New channel');
          await assertModalLayout(s, { modalTitle: 'New channel', viewport: VIEWPORTS.mobile375.name });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New channel');

          await clickSelector(s, 'button[title="Direct message"], button[aria-label*="Direct message" i]');
          await waitForDialog(s, 'Direct message');
          await assertModalLayout(s, { modalTitle: 'Direct message', viewport: VIEWPORTS.mobile375.name });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, 'Direct message');
        }),
    },

    {
      id: 'T4.5',
      name: 'Scenario 5: Multi-role Cross-View Audit, Calendar Holiday/DayDetail & Kudos Persistence',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          // Member checks in WITH image and checks out WITHOUT image
          await loginAs(s, baseUrl, 'member');
          const { userId } = await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await fillFieldByLabel(s, "What's your main focus today", 'T4.5 audit focus');
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await s.uploadFile('[role="dialog"] input[type="file"]', pngPath);
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')));
          await clickButton(s, 'Use this photo', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');

          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await fillFieldByLabel(s, 'What did you get done', 'T4.5 audit summary');
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-out selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');

          // Manager verifies /attendance/records, /employees/[id], /calendar, /kudos?new=1
          await loginAs(s, baseUrl, 'manager');
          await navigateRoute(s, baseUrl, '/attendance/records');
          await s.waitFor(
            () =>
              (document.body.innerText || '').includes('T4.5 audit focus') &&
              (document.body.innerText || '').includes('T4.5 audit summary'),
          );

          await navigateRoute(s, baseUrl, `/employees/${userId}`);
          await s.waitFor(() => (document.body.innerText || '').includes('Attendance log'));

          // Superadmin adds holiday on /calendar & checks DayDetail
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/calendar');
          await clickButton(s, 'Add holiday');
          await waitForDialog(s, 'Add holiday');
          await assertModalLayout(s, { modalTitle: 'Add holiday', viewport: VIEWPORTS.desktop1280.name });
          await fillFieldByLabel(s, 'Date', '2026-12-25');
          await fillFieldByLabel(s, 'Name', 'T4.5 Holiday');
          await clickButton(s, 'Add', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'Add holiday');

          // Kudos ?new=1
          await navigateRoute(s, baseUrl, '/kudos?new=1');
          await waitForDialog(s, 'Send kudos');
          await assertModalLayout(s, { modalTitle: 'Send kudos', viewport: VIEWPORTS.desktop1280.name });
          await selectByLabel(s, 'To', 'Rahul Varma');
          await fillFieldByLabel(s, 'Message', 'T4.5 end-to-end teamwork!');
          await clickButton(s, 'Send kudos', { insideDialog: true });
          await waitForDialogClosed(s, 'Send kudos');

          const state = await readDemoState(s);
          assert(
            state.data.holidays.some((h) => h.name === 'T4.5 Holiday'),
            'Expected T4.5 Holiday persisted in zlaqa_os_demo_v2',
          );
          assert(
            state.data.kudos.some((k) => k.message === 'T4.5 end-to-end teamwork!'),
            'Expected T4.5 kudos persisted in zlaqa_os_demo_v2',
          );
        }),
    },
  ];
}
