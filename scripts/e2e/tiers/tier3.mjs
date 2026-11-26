import { sleep } from '../cdp.mjs';
import { assert, assertModalLayout, assertToast } from '../assertions.mjs';
import {
  ACCOUNTS,
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

export function buildTier3Tests({ baseUrl, getChrome }) {
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
      id: 'T3.1',
      name: 'Attendance lifecycle without images: Check-in (skip) -> Tea break -> End break -> Lunch auto-close on Check-out (skip) -> Records & Profile',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'member');
          const { userId } = await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await fillFieldByLabel(s, "What's your main focus today", 'T3.1 break lifecycle');
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');
          await assertToast(s, /Checked in/i);

          // Start & end Tea break
          await clickButton(s, /Tea 0\/2/i);
          await s.waitFor(() => (document.body.innerText || '').includes('Tea break in progress'));
          await clickButton(s, /End break/i);
          await s.waitFor(() => (document.body.innerText || '').includes('Tea 1/2'));

          // Start Lunch break and Check out directly without ending break (auto-closes break)
          await clickButton(s, 'Lunch', { exact: true });
          await s.waitFor(() => (document.body.innerText || '').includes('Lunch break in progress'));
          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await fillFieldByLabel(s, 'What did you get done', 'T3.1 auto-closed lunch');
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-out selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');
          await assertToast(s, /Checked out/i);

          const state = await readDemoState(s);
          const openBreaks = state.data.breaks.filter((b) => b.user_id === userId && !b.end_at);
          assert(openBreaks.length === 0, `Expected open breaks auto-closed on checkout, found ${openBreaks.length}`);

          // Verify cross-page rendering as manager
          await loginAs(s, baseUrl, 'manager');
          await navigateRoute(s, baseUrl, '/attendance/records');
          await s.waitFor(
            () =>
              (document.body.innerText || '').includes('T3.1 break lifecycle') &&
              (document.body.innerText || '').includes('T3.1 auto-closed lunch'),
            { label: 'Rahul today standup/summary visible on /attendance/records' },
          );

          await navigateRoute(s, baseUrl, `/employees/${userId}`);
          await s.waitFor(
            () => (document.body.innerText || '').includes('Attendance log'),
            { label: 'employee detail Attendance log' },
          );
          const noSelfies = await s.eval(() => document.querySelectorAll('[title="No selfie"]').length);
          assert(noSelfies >= 2, `Expected [title="No selfie"] icons on /employees/${userId}, got ${noSelfies}`);
        }),
    },

    {
      id: 'T3.2',
      name: 'Mixed Check-in WITH image + Check-out WITHOUT image -> Manager EditRecord & audit_log',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'member');
          const { userId } = await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await fillFieldByLabel(s, "What's your main focus today", 'T3.2 mixed selfie');
          await clickButton(s, /^Continue/i, { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await s.uploadFile('[role="dialog"] input[type="file"]', pngPath);
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')));
          await clickButton(s, 'Use this photo', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');

          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-out selfie');
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');

          await loginAs(s, baseUrl, 'manager');
          await navigateRoute(s, baseUrl, '/attendance/records');
          await s.waitFor(() => (document.body.innerText || '').includes('T3.2 mixed selfie'));

          const mixedCheck = await s.eval(() => ({
            imgs: document.querySelectorAll('img[alt="selfie"]').length,
            noSelfies: document.querySelectorAll('[title="No selfie"]').length,
          }));
          assert(mixedCheck.imgs >= 1 && mixedCheck.noSelfies >= 1, 'Expected both selfie img and No selfie placeholder');

          // Correct Rahul's row (first row with T3.2 mixed selfie)
          const rowBtnIdx = await s.eval(() => {
            const rows = Array.from(document.querySelectorAll('tbody tr'));
            return rows.findIndex((r) => (r.textContent || '').includes('T3.2 mixed selfie'));
          });
          assert(rowBtnIdx >= 0, 'Could not locate T3.2 mixed selfie row');
          await clickSelector(s, 'button[aria-label="Correct record"]', { index: rowBtnIdx });
          await waitForDialog(s, /Correct record/i);
          await fillFieldByLabel(s, 'Reason / notes', 'T3.2 audit verified');
          await clickButton(s, 'Save correction', { insideDialog: true });
          await waitForDialogClosed(s, /Correct record/i);
          await assertToast(s, 'Record corrected');

          await navigateRoute(s, baseUrl, `/employees/${userId}`);
          await s.waitFor(
            () => (document.body.innerText || '').includes('T3.2 audit verified'),
            { label: 'corrected note on employee detail page' },
          );
        }),
    },

    {
      id: 'T3.3',
      name: 'Settings selfie toggles OFF bypass SelfieCamera on /attendance, then restore',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/settings?tab=attendance');
          await setSwitchByLabel(s, 'Selfie on check-in', false, { insideDialog: false });
          await setSwitchByLabel(s, 'Selfie on check-out', false, { insideDialog: false });
          await clickButton(s, 'Save changes');
          await assertToast(s, /Saved|updated/i);

          await resetTodayAttendance(s, baseUrl, ACCOUNTS.superadmin.email);
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await clickButton(s, /^Check in$/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Start your day');
          await assertToast(s, /Checked in/i);

          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await clickButton(s, /^Check out$/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Wrap up your day');
          await assertToast(s, /Checked out/i);

          // Restore toggles
          await navigateRoute(s, baseUrl, '/settings?tab=attendance');
          await setSwitchByLabel(s, 'Selfie on check-in', true, { insideDialog: false });
          await setSwitchByLabel(s, 'Selfie on check-out', true, { insideDialog: false });
          await clickButton(s, 'Save changes');
        }),
    },

    {
      id: 'T3.4',
      name: 'ObjectiveModal + KrEditor -> NewTask linked to KR -> KrUpdateModal',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/okrs');
          await clickButton(s, 'New objective');
          await waitForDialog(s, 'New objective');
          await fillFieldByLabel(s, 'Objective', 'T3.4 Connected Objective');
          await selectByLabel(s, 'Owner', 'Rahul Varma');
          await fillSelector(s, '[role="dialog"] input[placeholder="Key result"]', 'T3.4 Linked KR');
          await clickButton(s, 'Create objective', { insideDialog: true });
          await waitForDialogClosed(s, 'New objective');
          await assertToast(s, 'Objective created');

          await navigateRoute(s, baseUrl, '/tasks');
          await clickButton(s, 'New task');
          await waitForDialog(s, 'New task');
          await fillFieldByLabel(s, 'Title', 'T3.4 KR Task');
          await selectByLabel(s, 'Assignee', 'Rahul Varma');
          await selectByLabel(s, 'Link to key result', 'T3.4 Linked KR');
          await clickButton(s, 'Create task', { insideDialog: true });
          await waitForDialogClosed(s, 'New task');
          await assertToast(s, 'Task created');
          await s.waitFor(
            () =>
              (document.body.innerText || '').includes('T3.4 KR Task') &&
              (document.body.innerText || '').includes('KR: T3.4 Linked KR'),
            { label: 'task card shows linked KR badge' },
          );

          await navigateRoute(s, baseUrl, '/okrs');
          await clickButton(s, 'Everything');
          const updateIdx = await s.eval(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(
              (b) => (b.textContent || '').trim() === 'Update',
            );
            return btns.findIndex((b) =>
              (b.closest('div.rounded-2xl')?.textContent || '').includes('T3.4 Linked KR'),
            );
          });
          assert(updateIdx >= 0, 'Could not find Update button for T3.4 Linked KR');
          await clickButton(s, 'Update', { exact: true, index: updateIdx });
          await waitForDialog(s, 'Check-in on key result');
          await fillFieldByLabel(s, 'Current value', '80');
          await clickButton(s, 'Save update', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in on key result');
          await assertToast(s, /Progress updated|Key result achieved/i);
        }),
    },

    {
      id: 'T3.5',
      name: 'TemplateEditor (Create + Duplicate) -> /okrs?template= -> ApplyTemplateModal',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/okrs/templates');
          await clickButton(s, 'New template');
          await waitForDialog(s, 'New template');
          await fillFieldByLabel(s, 'Template name', 'T3.5 Base Template');
          await fillFieldByLabel(s, 'Title', 'T3.5 Template Obj');
          await fillSelector(s, '[role="dialog"] input[placeholder="Key result"]', 'T3.5 Template KR');
          await clickButton(s, 'Save template', { insideDialog: true });
          await waitForDialogClosed(s, 'New template');

          await clickSelector(s, 'button[aria-label="Duplicate"]');
          await waitForDialog(s, 'New template');
          await assertModalLayout(s, { modalTitle: 'New template', viewport: '1280x800 (Duplicate)' });
          await clickButton(s, 'Save template', { insideDialog: true });
          await waitForDialogClosed(s, 'New template');

          const useIdx = await s.eval(() => {
            const btns = Array.from(document.querySelectorAll('button, a')).filter(
              (b) => (b.textContent || '').trim() === 'Use',
            );
            return btns.findIndex((b) =>
              (b.closest('div.rounded-2xl')?.textContent || '').includes('T3.5 Base Template'),
            );
          });
          assert(useIdx >= 0, 'Could not find Use button for T3.5 Base Template');
          await clickButton(s, 'Use', { exact: true, index: useIdx });
          await waitForDialog(s, 'Apply OKR template');
          await setCheckboxByLabel(s, 'Ayesha Khan', true);
          await clickButton(s, /Create OKRs for 1/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Apply OKR template');
          await assertToast(s, /OKRs created for 1/i);
        }),
    },

    {
      id: 'T3.6',
      name: 'KpiDefModal -> AssignKpiModal -> Dashboard LogKpiSheet (outside .stagger) -> /kpis actuals',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/kpis');
          await clickButton(s, 'New KPI');
          await waitForDialog(s, 'New KPI');
          await fillFieldByLabel(s, 'Name', 'T3.6 Demo Calls');
          await selectByLabel(s, 'How it is measured', 'manual');
          await fillFieldByLabel(s, 'Default target', '10');
          await fillFieldByLabel(s, 'Unit', 'calls');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'New KPI');

          await clickButton(s, 'Assign');
          await waitForDialog(s, 'Assign a KPI');
          await selectByLabel(s, 'KPI', 'T3.6 Demo Calls');
          await setCheckboxByLabel(s, 'Ayesha Khan', true);
          await clickButton(s, 'Assign', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, 'Assign a KPI');
          await assertToast(s, /KPI assigned/i);

          // Login as sales@zlaqa.demo and log from Dashboard MyKpis (.stagger)
          await loginAs(s, baseUrl, 'sales');
          const logBtnIdx = await s.eval(() => {
            const btns = Array.from(document.querySelectorAll('button')).filter(
              (b) => (b.textContent || '').trim() === 'Log',
            );
            return btns.findIndex((b) =>
              (b.closest('div')?.parentElement?.textContent || '').includes('T3.6 Demo Calls'),
            );
          });
          assert(logBtnIdx >= 0, 'T3.6 Demo Calls Log button not found in Dashboard MyKpis');
          await clickButton(s, 'Log', { exact: true, index: logBtnIdx });
          await waitForDialog(s, /Log · T3.6 Demo Calls/i);
          await assertModalLayout(s, { modalTitle: 'Log · T3.6 Demo Calls', viewport: '1280x800 (.stagger)' });
          await fillFieldByLabel(s, /Value/i, '7');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await waitForDialogClosed(s, /Log · T3.6 Demo Calls/i);
          await assertToast(s, 'KPI logged');

          await navigateRoute(s, baseUrl, '/kpis');
          await s.waitFor(
            () => (document.body.innerText || '').includes('7 calls') || (document.body.innerText || '').includes('70%'),
            { label: 'logged KPI value reflected on /kpis' },
          );
        }),
    },

    {
      id: 'T3.7',
      name: 'CommandPalette quick-jump to ?new=1 (outside PageTransition) & members_can_create_okrs role gate',
      run: () =>
        withSession(VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // CommandPalette Ctrl+K -> New task (/tasks?new=1)
          await s.pressKey('k', { modifiers: 2 }); // Ctrl+K
          await waitForDialog(s, /Command palette/i);
          await fillSelector(s, 'input[placeholder*="Type a page"]', 'New task');
          await s.pressKey('Enter');
          await waitForDialog(s, 'New task');
          await assertModalLayout(s, { modalTitle: 'New task', viewport: '1280x800 (CommandPalette -> ?new=1)' });
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New task');

          // Disable members_can_create_okrs and verify member cannot see New objective
          await navigateRoute(s, baseUrl, '/settings?tab=okrs');
          await setSwitchByLabel(s, 'Members can create their own individual OKRs', false, { insideDialog: false });
          await clickButton(s, 'Save changes');
          await sleep(200);

          await loginAs(s, baseUrl, 'member');
          await navigateRoute(s, baseUrl, '/okrs');
          const hasNewObj = await s.eval(() =>
            Array.from(document.querySelectorAll('button')).some((b) => /New objective/i.test(b.textContent || '')),
          );
          assert(!hasNewObj, 'Expected New objective button hidden when members_can_create_okrs is false');

          // Restore setting
          await loginAs(s, baseUrl, 'superadmin');
          await navigateRoute(s, baseUrl, '/settings?tab=okrs');
          await setSwitchByLabel(s, 'Members can create their own individual OKRs', true, { insideDialog: false });
          await clickButton(s, 'Save changes');
        }),
    },
  ];
}
