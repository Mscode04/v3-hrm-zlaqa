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
  setSwitchByLabel,
  setViewport,
  waitForDialog,
  waitForDialogClosed,
} from '../helpers.mjs';

export function buildTier2Tests({ baseUrl, getChrome }) {
  const pngPath = ensureTestPngFile();

  async function withSession(_unused, vp, fn) {
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
      id: 'T2.1',
      name: 'Camera denied/unavailable fallback: Close cancels without row, Skip completes check-in, Upload works',
      run: () =>
        withSession(chromeNoCam, VIEWPORTS.mobile375, async (s) => {
          await s.denyCamera(baseUrl);
          await loginAs(s, baseUrl, 'member');
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.member.email);

          // 1. Close button cancels without creating attendance row
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');

          const camState = await s.waitFor(
            () => {
              const dlg = document.querySelector('[role="dialog"]');
              if (!dlg) return null;
              const txt = dlg.textContent || '';
              if (!txt.includes('Camera not available')) return null;
              const btns = Array.from(dlg.querySelectorAll('button'));
              const capture = btns.find((b) => /Capture/i.test(b.textContent || ''));
              const skip = btns.find((b) => /Skip/i.test(b.textContent || ''));
              const upload = btns.find((b) => /Upload/i.test(b.textContent || ''));
              return {
                hasError: true,
                captureDisabled: Boolean(capture?.disabled),
                skipEnabled: Boolean(skip && !skip.disabled),
                uploadEnabled: Boolean(upload && !upload.disabled),
              };
            },
            { timeout: 10_000, label: 'camera denied error message' },
          );
          assert(camState.captureDisabled, 'Capture must be disabled when camera is denied');
          assert(camState.skipEnabled, 'Skip button must remain enabled when camera is denied');
          assert(camState.uploadEnabled, 'Upload button must remain enabled when camera is denied');

          await assertModalLayout(s, { modalTitle: 'Check-in selfie', viewport: '375x812 (cam denied)' });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, 'Check-in selfie');

          const afterClose = await readDemoState(s);
          const today = await s.eval(() => {
            const d = new Date();
            return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
          });
          const rowAfterClose = afterClose.data.attendance.find(
            (a) => a.user_id === afterClose.session.id && a.date === today,
          );
          assert(!rowAfterClose, 'Closing SelfieCamera must cancel without inserting attendance row');

          // 2. Skip completes check-in when camera is denied
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-in selfie');
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Camera not available'));
          await clickButton(s, /Skip/i, { insideDialog: true });
          await waitForDialogClosed(s, 'Check-in selfie');
          await assertToast(s, /Checked in/i);

          // 3. Check-out Upload works even when camera is denied
          await clickButton(s, 'Check out');
          await waitForDialog(s, 'Wrap up your day');
          await clickButton(s, 'Skip', { insideDialog: true });
          await waitForDialog(s, 'Check-out selfie');
          await s.uploadFile('[role="dialog"] input[type="file"]', pngPath);
          await s.waitFor(() => Boolean(document.querySelector('[role="dialog"] img[alt="selfie preview"]')));
          await clickButton(s, 'Use this photo', { insideDialog: true });
          await waitForDialogClosed(s, 'Check-out selfie');
          await assertToast(s, /Checked out/i);
        }),
    },

    {
      id: 'T2.2',
      name: 'Validation errors, empty/invalid dates, Sunday 0-working-days, and conditional field visibility',
      run: () =>
        withSession(chromeWithCam, VIEWPORTS.desktop1280, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // NewTask empty title
          await navigateRoute(s, baseUrl, '/tasks');
          await clickButton(s, 'New task');
          await waitForDialog(s, 'New task');
          await clickButton(s, 'Create task', { insideDialog: true });
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Title is required'));
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New task');

          // ObjectiveModal empty title + empty KR
          await navigateRoute(s, baseUrl, '/okrs');
          await clickButton(s, 'New objective');
          await waitForDialog(s, 'New objective');
          await clickButton(s, 'Create objective', { insideDialog: true });
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Title is required'));
          await fillFieldByLabel(s, 'Objective', 'Valid Obj');
          await clickButton(s, 'Create objective', { insideDialog: true });
          await s.waitFor(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('Add at least one key result'),
          );
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New objective');

          // TemplateEditor empty name + 0 objectives
          await navigateRoute(s, baseUrl, '/okrs/templates');
          await clickButton(s, 'New template');
          await waitForDialog(s, 'New template');
          await clickButton(s, 'Save template', { insideDialog: true });
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Name is required'));
          await fillFieldByLabel(s, 'Template name', 'T2.2 Template');
          await clickButton(s, 'Remove objective', { insideDialog: true });
          await clickButton(s, 'Save template', { insideDialog: true });
          await s.waitFor(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('Add at least one objective'),
          );
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New template');

          // KpiDefModal empty name & conditional aggregation field
          await navigateRoute(s, baseUrl, '/kpis');
          await clickButton(s, 'New KPI');
          await waitForDialog(s, 'New KPI');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Name is required'));
          await selectByLabel(s, 'How it is measured', 'tasks_done');
          const aggHidden = await s.eval(
            () => !(document.querySelector('[role="dialog"]')?.textContent || '').includes('Several entries in one period'),
          );
          assert(aggHidden, 'Expected "Several entries in one period" to hide for non-manual KPI source');
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New KPI');

          // AssignKpiModal 0 selected
          await clickButton(s, 'Assign');
          await waitForDialog(s, 'Assign a KPI');
          await clickButton(s, 'Assign', { insideDialog: true, exact: true });
          await s.waitFor(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('Pick at least one person'),
          );
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'Assign a KPI');

          // LogKpiSheet empty number
          await clickButton(s, 'log', { exact: true });
          await waitForDialog(s, /Log ·/i);
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Enter a number'));
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, /Log ·/i);

          // Leave Apply: invalid range, Sunday 0-working-days, multi-day hides Half day
          await navigateRoute(s, baseUrl, '/leave');
          await clickButton(s, 'Apply for leave');
          await waitForDialog(s, 'Apply for leave');
          await fillFieldByLabel(s, 'From', '2026-12-10');
          await fillFieldByLabel(s, 'To', '2026-12-09');
          await clickButton(s, 'Submit', { insideDialog: true });
          await s.waitFor(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('Pick a valid date range'),
          );
          await fillFieldByLabel(s, 'From', '2026-12-06'); // Sunday
          await fillFieldByLabel(s, 'To', '2026-12-06');
          await clickButton(s, 'Submit', { insideDialog: true });
          await s.waitFor(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('Selected range has no working days'),
          );
          await fillFieldByLabel(s, 'From', '2026-12-07');
          await fillFieldByLabel(s, 'To', '2026-12-08');
          const halfDayHidden = await s.eval(
            () => !(document.querySelector('[role="dialog"]')?.textContent || '').includes('Half day'),
          );
          assert(halfDayHidden, 'Half day checkbox must be hidden for multi-day leave range');
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'Apply for leave');

          // NewAnnouncement 1-option poll error + PresetModal empty name + AddHoliday empty
          await navigateRoute(s, baseUrl, '/announcements');
          await clickButton(s, 'New announcement');
          await waitForDialog(s, 'New announcement');
          await fillFieldByLabel(s, 'Title', 'Poll Test');
          await clickButton(s, 'Add a poll', { insideDialog: true });
          await fillSelector(s, '[role="dialog"] input[placeholder="Option 1"]', 'Only one');
          await clickButton(s, 'Publish', { insideDialog: true });
          await s.waitFor(() =>
            (document.querySelector('[role="dialog"]')?.textContent || '').includes('A poll needs at least 2 options'),
          );
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New announcement');

          await navigateRoute(s, baseUrl, '/settings?tab=presets');
          await clickButton(s, 'New preset');
          await waitForDialog(s, 'New preset');
          await clickButton(s, 'Save', { insideDialog: true, exact: true });
          await s.waitFor(() => (document.querySelector('[role="dialog"]')?.textContent || '').includes('Name is required'));
          await clickButton(s, 'Cancel', { insideDialog: true });
          await waitForDialogClosed(s, 'New preset');
        }),
    },

    {
      id: 'T2.3',
      name: 'Multi-viewport matrix (320x568, 375x812, 667x375, 1440x900) & KrEditor bounds/boolean disable',
      run: () =>
        withSession(chromeWithCam, VIEWPORTS.mobile320, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          // Start your day 5 mood tiles at 320x568 (catches scale-105 overlap on narrow mobile)
          await resetTodayAttendance(s, baseUrl, ACCOUNTS.superadmin.email);
          await clickButton(s, /^Check in/i);
          await waitForDialog(s, 'Start your day');
          await clickButton(s, 'Good', { insideDialog: true });
          await assertModalLayout(s, { modalTitle: 'Start your day', viewport: VIEWPORTS.mobile320.name });
          await clickSelector(s, '[role="dialog"] button[aria-label="Close"]');
          await waitForDialogClosed(s, 'Start your day');

          // KrEditor numeric/unit input width >= 40px, boolean disable, Add key result wrap across viewports
          const vps = [VIEWPORTS.mobile320, VIEWPORTS.mobile375, VIEWPORTS.landscape667, VIEWPORTS.desktop1440];
          for (const vp of vps) {
            await setViewport(s, vp);
            await navigateRoute(s, baseUrl, '/okrs');
            await clickButton(s, 'New objective');
            await waitForDialog(s, 'New objective');
            await assertModalLayout(s, { modalTitle: 'New objective', viewport: vp.name });

            // Check KrEditor input widths & boolean disable behavior
            const krCheck = await s.eval(() => {
              const dlg = document.querySelector('[role="dialog"]');
              const numInputs = Array.from(dlg.querySelectorAll('input[type="number"]'));
              const unitInput = dlg.querySelector('input[placeholder="unit"], input[placeholder*="unit" i]');
              const widths = [...numInputs, unitInput].filter(Boolean).map((el) => ({
                hint: el.title || el.placeholder || el.type,
                width: Math.round(el.getBoundingClientRect().width),
              }));
              return { widths };
            });
            for (const w of krCheck.widths) {
              assert(w.width >= 40, `KrEditor input "${w.hint}" too narrow (${w.width}px < 40px) at ${vp.name}`);
            }

            // Switch KR type to boolean -> Start & Target must become disabled
            await s.eval(() => {
              const dlg = document.querySelector('[role="dialog"]');
              const selects = Array.from(dlg.querySelectorAll('select'));
              const typeSel = selects.find((sel) =>
                Array.from(sel.options).some((o) => o.value === 'boolean'),
              );
              if (!typeSel) throw new Error('KR type select not found');
              const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
              setter.call(typeSel, 'boolean');
              typeSel.dispatchEvent(new Event('change', { bubbles: true }));
            });
            const boolDisabled = await s.eval(() => {
              const dlg = document.querySelector('[role="dialog"]');
              const startInput = dlg.querySelector('input[title="Start"]') || dlg.querySelectorAll('input[type="number"]')[0];
              const targetInput = dlg.querySelector('input[title="Target"]') || dlg.querySelectorAll('input[type="number"]')[1];
              return Boolean(startInput?.disabled && targetInput?.disabled);
            });
            assert(boolDisabled, `Expected KR Start and Target to be disabled when type=boolean at ${vp.name}`);

            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New objective');

            // Test NewTask, Apply Leave, EditRecord, NewAnnouncement on this viewport
            await navigateRoute(s, baseUrl, '/tasks?new=1');
            await waitForDialog(s, 'New task');
            await assertModalLayout(s, { modalTitle: 'New task', viewport: vp.name });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New task');

            await navigateRoute(s, baseUrl, '/leave?new=1');
            await waitForDialog(s, 'Apply for leave');
            await assertModalLayout(s, { modalTitle: 'Apply for leave', viewport: vp.name });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'Apply for leave');

            await navigateRoute(s, baseUrl, '/attendance/records');
            await clickSelector(s, 'button[aria-label="Correct record"]');
            await waitForDialog(s, /Correct record/i);
            await assertModalLayout(s, { modalTitle: 'Correct record', viewport: vp.name });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, /Correct record/i);
          }
        }),
    },

    {
      id: 'T2.4',
      name: 'Tall-content scrolling, long strings & sticky header/footer hit-test on mobile 375x812 & desktop 1280x800',
      run: () =>
        withSession(chromeWithCam, VIEWPORTS.mobile375, async (s) => {
          await loginAs(s, baseUrl, 'superadmin');

          for (const vp of [VIEWPORTS.mobile375, VIEWPORTS.desktop1280]) {
            await setViewport(s, vp);

            // DeptForm with 23 widgets expanded
            await navigateRoute(s, baseUrl, '/departments');
            await clickButton(s, 'New department');
            await waitForDialog(s, 'New department');
            await setSwitchByLabel(s, 'Custom dashboard for this department', true);
            await assertModalLayout(s, { modalTitle: 'New department', viewport: `${vp.name} (23 widgets)` });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New department');

            // EmployeeForm tall form
            await navigateRoute(s, baseUrl, '/employees');
            await clickButton(s, 'Add employee');
            await waitForDialog(s, 'Add employee');
            await fillFieldByLabel(s, 'Full name', 'Very Long Employee Name Testing Wrapping And Overflow Boundaries');
            await assertModalLayout(s, { modalTitle: 'Add employee', viewport: vp.name });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'Add employee');

            // ObjectiveModal with 3 KRs
            await navigateRoute(s, baseUrl, '/okrs');
            await clickButton(s, 'New objective');
            await waitForDialog(s, 'New objective');
            await fillFieldByLabel(
              s,
              'Objective',
              'Long objective title to verify wrapping without overflowing header or grid columns on narrow screens',
            );
            await clickButton(s, /Add key result/i, { insideDialog: true });
            await clickButton(s, /Add key result/i, { insideDialog: true });
            await assertModalLayout(s, { modalTitle: 'New objective', viewport: `${vp.name} (3 KRs)` });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New objective');

            // TemplateEditor multi-objective
            await navigateRoute(s, baseUrl, '/okrs/templates');
            await clickButton(s, 'New template');
            await waitForDialog(s, 'New template');
            await clickButton(s, /Add objective/i, { insideDialog: true });
            await assertModalLayout(s, { modalTitle: 'New template', viewport: `${vp.name} (2 objs)` });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New template');

            // NewAnnouncement with 6 poll options
            await navigateRoute(s, baseUrl, '/announcements');
            if (vp.width < 768) await clickSelector(s, 'button[aria-label="New announcement"]');
            else await clickButton(s, 'New announcement');
            await waitForDialog(s, 'New announcement');
            await clickButton(s, 'Add a poll', { insideDialog: true });
            for (let k = 0; k < 4; k++) {
              await clickButton(s, 'Add option', { insideDialog: true });
            }
            await assertModalLayout(s, { modalTitle: 'New announcement', viewport: `${vp.name} (6 poll opts)` });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New announcement');

            // PresetModal
            await navigateRoute(s, baseUrl, '/settings?tab=presets');
            await clickButton(s, 'New preset');
            await waitForDialog(s, 'New preset');
            await assertModalLayout(s, { modalTitle: 'New preset', viewport: vp.name });
            await clickButton(s, 'Cancel', { insideDialog: true });
            await waitForDialogClosed(s, 'New preset');
          }
        }),
    },
  ];
}
