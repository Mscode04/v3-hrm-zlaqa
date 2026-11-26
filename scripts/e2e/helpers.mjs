import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { sleep } from './cdp.mjs';
import { assert } from './assertions.mjs';

export const DEMO_PASSWORD = 'Zlaqa@123';

export const ACCOUNTS = {
  superadmin: {
    email: 'superadmin@zlaqa.demo',
    quickLabel: 'Super Admin',
    name: 'Super Admin (Founder)',
    role: 'super_admin',
  },
  manager: {
    email: 'manager@zlaqa.demo',
    quickLabel: 'Manager · Engineering',
    name: 'Arjun Menon',
    role: 'admin',
  },
  member: {
    email: 'member@zlaqa.demo',
    quickLabel: 'Member · Developer',
    name: 'Rahul Varma',
    role: 'member',
  },
  sales: {
    email: 'sales@zlaqa.demo',
    quickLabel: null,
    name: 'Ayesha Khan',
    role: 'member',
  },
};

export const VIEWPORTS = {
  desktop1280: { name: '1280x800', width: 1280, height: 800, mobile: false, deviceScaleFactor: 1 },
  desktop1440: { name: '1440x900', width: 1440, height: 900, mobile: false, deviceScaleFactor: 1 },
  mobile375: { name: '375x812', width: 375, height: 812, mobile: true, deviceScaleFactor: 2 },
  mobile320: { name: '320x568', width: 320, height: 568, mobile: true, deviceScaleFactor: 2 },
  landscape667: { name: '667x375', width: 667, height: 375, mobile: true, deviceScaleFactor: 2 },
};

export const GUIDE_ROUTES = [
  '/dashboard',
  '/today',
  '/kpis',
  '/attendance',
  '/attendance/records',
  '/okrs',
  '/okrs/templates',
  '/tasks',
  '/announcements',
  '/team',
  '/performance',
  '/analytics',
  '/employees',
  '/departments',
  '/calendar',
  '/chat',
  '/kudos',
  '/settings',
  '/leave',
  '/help',
];

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

export function ensureTestPngFile(filename = 'zlaqa-e2e-selfie.png') {
  const filePath = path.join(os.tmpdir(), filename);
  if (fs.existsSync(filePath) && fs.statSync(filePath).size > 50) return filePath;

  const w = 32;
  const h = 32;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const raw = Buffer.alloc((1 + w * 3) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const idx = row + 1 + x * 3;
      raw[idx] = (x * 8) & 0xff;
      raw[idx + 1] = (y * 8) & 0xff;
      raw[idx + 2] = 160;
    }
  }
  const idat = zlib.deflateSync(raw);
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
  return filePath;
}

export async function setViewport(session, vp) {
  await session.setViewport(vp.width, vp.height, {
    mobile: vp.mobile,
    deviceScaleFactor: vp.deviceScaleFactor,
  });
}

export async function suppressGuides(session) {
  await session.eval((routes) => {
    const raw = localStorage.getItem('zlaqa_os_demo_v2');
    const now = new Date().toISOString();
    if (raw) {
      const db = JSON.parse(raw);
      for (const p of db.profiles || []) {
        localStorage.setItem(`zlaqa_tour_done_${p.id}`, now);
      }
    }
    const sessRaw = localStorage.getItem('zlaqa_os_demo_session');
    if (sessRaw) {
      const s = JSON.parse(sessRaw);
      if (s?.id) localStorage.setItem(`zlaqa_tour_done_${s.id}`, now);
    }
    localStorage.setItem('zlaqa_tips_seen', JSON.stringify(routes));
  }, GUIDE_ROUTES);
}

export async function loginAs(session, baseUrl, accountKeyOrEmail, { suppress = true } = {}) {
  const acct = ACCOUNTS[accountKeyOrEmail] || {
    email: accountKeyOrEmail,
    quickLabel: null,
  };

  await session.goto(`${baseUrl}/login`);
  await session.waitFor(
    () => Boolean(document.querySelector('input[type="email"]')),
    { timeout: 20_000, label: 'login email input' },
  );

  if (acct.quickLabel) {
    await clickButton(session, acct.quickLabel, { exact: false });
  } else {
    await fillSelector(session, 'input[type="email"]', acct.email);
    await fillSelector(session, 'input[type="password"]', DEMO_PASSWORD);
    await clickSelector(session, 'button[type="submit"]');
  }

  await session.waitFor(
    () => window.location.pathname === '/dashboard' && Boolean(localStorage.getItem('zlaqa_os_demo_session')),
    { timeout: 20_000, label: `redirect to /dashboard for ${acct.email}` },
  );
  await session.waitFor(
    () => Boolean(document.querySelector('main')),
    { timeout: 15_000, label: 'dashboard shell mount' },
  );

  if (suppress) {
    await suppressGuides(session);
    await session.reload();
    await session.waitFor(
      () => Boolean(document.querySelector('main')),
      { timeout: 15_000, label: 'dashboard reload after guide suppression' },
    );
    await sleep(250);
  }
}

export async function navigateRoute(session, baseUrl, route) {
  await session.goto(`${baseUrl}${route}`);
  await session.waitFor(
    () => Boolean(document.querySelector('main')),
    { timeout: 20_000, label: `route ${route} main mount` },
  );
  await sleep(250);
}

export async function readDemoState(session) {
  return session.eval(() => {
    const data = JSON.parse(localStorage.getItem('zlaqa_os_demo_v2') || '{}');
    const files = JSON.parse(localStorage.getItem('zlaqa_os_demo_files') || '{}');
    const sessionObj = JSON.parse(localStorage.getItem('zlaqa_os_demo_session') || 'null');
    return { data, files, session: sessionObj };
  });
}

export async function resetTodayAttendance(session, baseUrl, email) {
  const res = await session.eval((targetEmail) => {
    const raw = localStorage.getItem('zlaqa_os_demo_v2');
    if (!raw) return { ok: false, reason: 'missing zlaqa_os_demo_v2' };
    const db = JSON.parse(raw);
    const prof = (db.profiles || []).find((p) => p.email.toLowerCase() === targetEmail.toLowerCase());
    if (!prof) return { ok: false, reason: `profile not found for ${targetEmail}` };

    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const today = `${yyyy}-${mm}-${dd}`;
    const midnight = new Date(yyyy, d.getMonth(), d.getDate()).toISOString();

    const removedAttIds = new Set();
    db.attendance = (db.attendance || []).filter((a) => {
      if (a.user_id === prof.id && a.date === today) {
        removedAttIds.add(a.id);
        return false;
      }
      return true;
    });
    db.breaks = (db.breaks || []).filter(
      (b) => !(b.user_id === prof.id && (removedAttIds.has(b.attendance_id) || b.start_at >= midnight)),
    );
    localStorage.setItem('zlaqa_os_demo_v2', JSON.stringify(db));
    return { ok: true, userId: prof.id, today, removedCount: removedAttIds.size };
  }, email);

  assert(res.ok, `resetTodayAttendance failed: ${res.reason}`);
  await navigateRoute(session, baseUrl, '/attendance');
  return res;
}

export async function waitForDialog(session, titlePattern = null, timeout = 10_000) {
  const regexSrc = titlePattern instanceof RegExp ? titlePattern.source : null;
  const regexFlags = titlePattern instanceof RegExp ? titlePattern.flags : '';
  const needle = titlePattern && !(titlePattern instanceof RegExp) ? String(titlePattern).toLowerCase() : null;

  return session.waitFor(
    (src, flags, str) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => {
        const st = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
      if (!dialogs.length) return null;
      if (!src && !str) {
        const d = dialogs[dialogs.length - 1];
        return d.querySelector('h2')?.textContent?.trim() || d.getAttribute('aria-label') || 'dialog';
      }
      for (const d of dialogs) {
        const txt = (
          (d.querySelector('h2')?.textContent || '') +
          ' ' +
          (d.getAttribute('aria-label') || '')
        ).trim();
        if (src) {
          if (new RegExp(src, flags).test(txt)) return txt;
        } else if (txt.toLowerCase().includes(str)) {
          return txt;
        }
      }
      return null;
    },
    { timeout, interval: 100, label: `dialog matching ${titlePattern || 'any'}` },
    regexSrc,
    regexFlags,
    needle,
  );
}

export async function waitForDialogClosed(session, titlePattern = null, timeout = 10_000) {
  const regexSrc = titlePattern instanceof RegExp ? titlePattern.source : null;
  const regexFlags = titlePattern instanceof RegExp ? titlePattern.flags : '';
  const needle = titlePattern && !(titlePattern instanceof RegExp) ? String(titlePattern).toLowerCase() : null;

  return session.waitFor(
    (src, flags, str) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => {
        const st = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
      if (!src && !str) return dialogs.length === 0;
      return !dialogs.some((d) => {
        const txt = (
          (d.querySelector('h2')?.textContent || '') +
          ' ' +
          (d.getAttribute('aria-label') || '')
        ).trim();
        if (src) return new RegExp(src, flags).test(txt);
        return txt.toLowerCase().includes(str);
      });
    },
    { timeout, interval: 100, label: `dialog close (${titlePattern || 'all'})` },
    regexSrc,
    regexFlags,
    needle,
  );
}

export async function clickButton(
  session,
  pattern,
  { insideDialog = false, exact = false, timeout = 10_000, index = 0 } = {},
) {
  const regexSrc = pattern instanceof RegExp ? pattern.source : null;
  const regexFlags = pattern instanceof RegExp ? pattern.flags : '';
  const needle = pattern instanceof RegExp ? null : String(pattern).toLowerCase();

  const clicked = await session.waitFor(
    (src, flags, str, inDlg, isExact, idx) => {
      let scope = document;
      if (inDlg) {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => {
          const r = d.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (!dialogs.length) return null;
        scope = dialogs[dialogs.length - 1];
      }
      const btns = Array.from(scope.querySelectorAll('button, a[role="button"]')).filter((b) => {
        const st = getComputedStyle(b);
        const r = b.getBoundingClientRect();
        if (st.display === 'none' || st.visibility === 'hidden' || r.width <= 0 || r.height <= 0) return false;
        const text = (b.textContent || '').replace(/\s+/g, ' ').trim();
        const aria = (b.getAttribute('aria-label') || '').trim();
        const title = (b.getAttribute('title') || '').trim();
        const candidates = [text, aria, title].filter(Boolean);
        if (src) {
          const re = new RegExp(src, flags);
          return candidates.some((c) => re.test(c));
        }
        return candidates.some((c) => (isExact ? c.toLowerCase() === str : c.toLowerCase().includes(str)));
      });
      const target = btns[idx];
      if (!target || target.disabled) return null;
      target.scrollIntoView({ block: 'center', inline: 'nearest' });
      target.click();
      return (target.textContent || target.getAttribute('aria-label') || 'button').trim();
    },
    { timeout, interval: 100, label: `enabled button "${pattern}"${insideDialog ? ' inside dialog' : ''}` },
    regexSrc,
    regexFlags,
    needle,
    insideDialog,
    exact,
    index,
  );
  await sleep(140);
  return clicked;
}

export async function clickSelector(session, selector, { timeout = 10_000, index = 0 } = {}) {
  await session.waitFor(
    (sel, idx) => {
      const els = Array.from(document.querySelectorAll(sel)).filter((el) => {
        const st = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });
      const el = els[idx];
      if (!el || el.disabled) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      el.click();
      return true;
    },
    { timeout, interval: 100, label: `clickable selector ${selector}` },
    selector,
    index,
  );
  await sleep(140);
}

export async function fillSelector(session, selector, value, { index = 0 } = {}) {
  await session.waitFor(
    (sel, val, idx) => {
      const els = Array.from(document.querySelectorAll(sel)).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(el).display !== 'none';
      });
      const el = els[idx];
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const proto =
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, String(val));
      else el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { timeout: 10_000, interval: 100, label: `fill selector ${selector}` },
    selector,
    value,
    index,
  );
  await sleep(80);
}

export async function fillFieldByLabel(
  session,
  labelPattern,
  value,
  { insideDialog = true, index = 0 } = {},
) {
  const regexSrc = labelPattern instanceof RegExp ? labelPattern.source : null;
  const regexFlags = labelPattern instanceof RegExp ? labelPattern.flags : '';
  const needle = labelPattern instanceof RegExp ? null : String(labelPattern).toLowerCase();

  await session.waitFor(
    (src, flags, str, val, inDlg, idx) => {
      let scope = document;
      if (inDlg) {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
          (d) => d.getBoundingClientRect().width > 0,
        );
        if (!dialogs.length) return false;
        scope = dialogs[dialogs.length - 1];
      }
      const labels = Array.from(scope.querySelectorAll('label')).filter((l) => {
        const span = l.querySelector('span');
        const txt = (span ? span.textContent : l.textContent || '').trim();
        if (src) return new RegExp(src, flags).test(txt);
        return txt.toLowerCase().includes(str);
      });
      const lbl = labels[idx];
      if (!lbl) return false;
      const el = lbl.querySelector('input, textarea');
      if (!el) return false;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const proto =
        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
      if (setter) setter.call(el, String(val));
      else el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { timeout: 10_000, interval: 100, label: `fill field "${labelPattern}"` },
    regexSrc,
    regexFlags,
    needle,
    value,
    insideDialog,
    index,
  );
  await sleep(80);
}

export async function selectByLabel(
  session,
  labelPattern,
  valueOrText,
  { insideDialog = true, index = 0 } = {},
) {
  const regexSrc = labelPattern instanceof RegExp ? labelPattern.source : null;
  const regexFlags = labelPattern instanceof RegExp ? labelPattern.flags : '';
  const needle = labelPattern instanceof RegExp ? null : String(labelPattern).toLowerCase();

  await session.waitFor(
    (src, flags, str, wanted, inDlg, idx) => {
      let scope = document;
      if (inDlg) {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
          (d) => d.getBoundingClientRect().width > 0,
        );
        if (!dialogs.length) return false;
        scope = dialogs[dialogs.length - 1];
      }
      const labels = Array.from(scope.querySelectorAll('label')).filter((l) => {
        const span = l.querySelector('span');
        const txt = (span ? span.textContent : l.textContent || '').trim();
        if (src) return new RegExp(src, flags).test(txt);
        return txt.toLowerCase().includes(str);
      });
      const lbl = labels[idx];
      if (!lbl) return false;
      const sel = lbl.querySelector('select');
      if (!sel) return false;
      const opts = Array.from(sel.options);
      const wantStr = String(wanted);
      const match =
        opts.find((o) => o.value === wantStr) ||
        opts.find((o) => o.textContent.trim().toLowerCase() === wantStr.toLowerCase()) ||
        opts.find((o) => o.textContent.trim().toLowerCase().includes(wantStr.toLowerCase()));
      if (!match) return false;
      sel.scrollIntoView({ block: 'center', inline: 'nearest' });
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
      if (setter) setter.call(sel, match.value);
      else sel.value = match.value;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    },
    { timeout: 10_000, interval: 100, label: `select "${valueOrText}" in "${labelPattern}"` },
    regexSrc,
    regexFlags,
    needle,
    valueOrText,
    insideDialog,
    index,
  );
  await sleep(100);
}

export async function setCheckboxByLabel(session, labelPattern, checked = true, { insideDialog = true } = {}) {
  const needle = String(labelPattern).toLowerCase();
  await session.waitFor(
    (str, want, inDlg) => {
      let scope = document;
      if (inDlg) {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
          (d) => d.getBoundingClientRect().width > 0,
        );
        if (!dialogs.length) return false;
        scope = dialogs[dialogs.length - 1];
      }
      const lbl = Array.from(scope.querySelectorAll('label')).find((l) =>
        (l.textContent || '').toLowerCase().includes(str),
      );
      if (!lbl) return false;
      const cb = lbl.querySelector('input[type="checkbox"]');
      if (!cb) return false;
      cb.scrollIntoView({ block: 'center', inline: 'nearest' });
      if (cb.checked !== want) cb.click();
      return cb.checked === want;
    },
    { timeout: 10_000, interval: 100, label: `checkbox "${labelPattern}" = ${checked}` },
    needle,
    checked,
    insideDialog,
  );
  await sleep(80);
}

export async function setSwitchByLabel(session, labelPattern, checked = true, { insideDialog = true } = {}) {
  const needle = String(labelPattern).toLowerCase();
  await session.waitFor(
    (str, want, inDlg) => {
      let scope = document;
      if (inDlg) {
        const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter(
          (d) => d.getBoundingClientRect().width > 0,
        );
        if (!dialogs.length) return false;
        scope = dialogs[dialogs.length - 1];
      }
      const switches = Array.from(scope.querySelectorAll('[role="switch"]'));
      const sw = switches.find((s) => {
        const aria = (s.getAttribute('aria-label') || '').toLowerCase();
        const lbl = (s.closest('label')?.textContent || '').toLowerCase();
        return aria.includes(str) || lbl.includes(str);
      });
      if (!sw) return false;
      sw.scrollIntoView({ block: 'center', inline: 'nearest' });
      const cur = sw.getAttribute('aria-checked') === 'true';
      if (cur !== want) sw.click();
      return sw.getAttribute('aria-checked') === String(want);
    },
    { timeout: 10_000, interval: 100, label: `switch "${labelPattern}" = ${checked}` },
    needle,
    checked,
    insideDialog,
  );
  await sleep(80);
}
