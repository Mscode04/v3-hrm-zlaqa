import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseCliArgs(argv = process.argv.slice(2)) {
  const opts = {
    port: Number(process.env.PORT || 3102),
    cdpPort: Number(process.env.CDP_PORT || 9223),
    baseUrl: process.env.BASE_URL || '',
    tiers: [1, 2, 3, 4],
    verbose: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--port=')) opts.port = Number(arg.slice(7));
    else if (arg.startsWith('--cdp-port=')) opts.cdpPort = Number(arg.slice(11));
    else if (arg.startsWith('--base-url=')) opts.baseUrl = arg.slice(11).replace(/\/+$/, '');
    else if (arg.startsWith('--tier=')) {
      const list = arg
        .slice(7)
        .split(',')
        .map((s) => Number(s.trim()))
        .filter((n) => [1, 2, 3, 4].includes(n));
      if (list.length) opts.tiers = Array.from(new Set(list)).sort((a, b) => a - b);
    } else if (arg === '--verbose' || arg === '-v') opts.verbose = true;
  }
  return opts;
}

export async function isUrlReachable(url, timeoutMs = 2500) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'manual' });
    clearTimeout(t);
    return res.status >= 200 && res.status < 500;
  } catch {
    return false;
  }
}

export function killProcessTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGKILL');
    }
  } catch {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already dead
    }
  }
}

export async function ensureServer({ baseUrl, port, cwd = process.cwd(), log = () => {} }) {
  if (baseUrl) {
    const clean = baseUrl.replace(/\/+$/, '');
    if (await isUrlReachable(`${clean}/login`)) {
      log(`Attached to existing server at ${clean}`);
      return { baseUrl: clean, managed: false, stop: async () => {} };
    }
    throw new Error(`--base-url=${clean} is not reachable (${clean}/login failed).`);
  }

  const targetUrl = `http://127.0.0.1:${port}`;
  const nextBin = path.join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');
  if (!fs.existsSync(nextBin)) {
    throw new Error(`Next.js CLI not found at ${nextBin}`);
  }
  const lockPath = path.join(cwd, '.next', 'dev', 'lock');

  let child = null;
  let lastErr = '';

  for (let attempt = 1; attempt <= 3; attempt++) {
    let lockFailure = false;
    let exited = false;
    let exitCode = null;
    const logs = [];

    child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port), '-H', '127.0.0.1'], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });

    const onChunk = (chunk) => {
      const text = chunk.toString();
      logs.push(text);
      if (logs.length > 80) logs.shift();
      if (/Unable to acquire lock|\.next[\\/]+dev[\\/]+lock/i.test(text)) {
        lockFailure = true;
      }
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    child.on('exit', (code) => {
      exited = true;
      exitCode = code;
    });

    const deadline = Date.now() + 90_000;
    let ready = false;
    while (Date.now() < deadline) {
      if (exited) break;
      if (await isUrlReachable(`${targetUrl}/login`, 2000)) {
        ready = true;
        break;
      }
      await sleep(500);
    }

    if (ready) {
      // Warm up /login route fully to ensure 200 OK
      const r = await fetch(`${targetUrl}/login`).catch(() => null);
      if (r && r.status === 200) {
        log(`Started Next.js dev server at ${targetUrl} (pid ${child.pid})`);
        return {
          baseUrl: targetUrl,
          managed: true,
          pid: child.pid,
          stop: async () => {
            killProcessTree(child.pid);
            await sleep(300);
          },
        };
      }
    }

    killProcessTree(child.pid);
    lastErr = logs.join('').slice(-1500);

    if (lockFailure && fs.existsSync(lockPath)) {
      log(`Next.js hit .next/dev/lock (attempt ${attempt}/3); checking if stale...`);
      await sleep(800);
      try {
        fs.unlinkSync(lockPath);
        log('Removed stale .next/dev/lock; retrying Next.js startup...');
        continue;
      } catch (unlinkErr) {
        throw new Error(
          `Cannot start Next.js on port ${port}: ${lockPath} is actively locked by another running 'next dev' process (${unlinkErr.code || unlinkErr.message}). Pass --base-url=http://127.0.0.1:<activePort> to attach to it.`,
        );
      }
    }

    if (exited) {
      throw new Error(`Next.js dev server exited early (code ${exitCode}):\n${lastErr}`);
    }
    throw new Error(`Timed out waiting for Next.js dev server at ${targetUrl}:\n${lastErr}`);
  }

  throw new Error(`Failed to start Next.js after 3 attempts:\n${lastErr}`);
}

export function findChromeBinary() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : '',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Could not find Google Chrome/Chromium binary. Checked:\n${candidates.join('\n')}`);
}

export class CdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();

    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(`CDP ${p.method} failed: ${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
      } else if (msg.method) {
        const key = `${msg.sessionId || ''}:${msg.method}`;
        const set = this.eventListeners.get(key);
        if (set) {
          for (const fn of set) fn(msg.params || {});
        }
      }
    });

    ws.addEventListener('close', () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(new Error(`CDP WebSocket closed while waiting for ${p.method}`));
      }
      this.pending.clear();
    });
  }

  send(method, params = {}, sessionId = undefined, timeoutMs = 20_000) {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error(`CDP WebSocket is not open (state=${this.ws.readyState})`));
        return;
      }
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout after ${timeoutMs}ms on ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
      this.ws.send(JSON.stringify(payload));
    });
  }

  on(method, fn, sessionId = '') {
    const key = `${sessionId}:${method}`;
    let set = this.eventListeners.get(key);
    if (!set) {
      set = new Set();
      this.eventListeners.set(key, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }
}

export class CdpSession {
  constructor(client, sessionId, targetId, browserContextId, origin = '') {
    this.client = client;
    this.sessionId = sessionId;
    this.targetId = targetId;
    this.browserContextId = browserContextId;
    this.origin = origin;
  }

  send(method, params = {}, timeoutMs = 20_000) {
    return this.client.send(method, params, this.sessionId, timeoutMs);
  }

  async init() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('DOM.enable');
  }

  async eval(fnOrString, ...args) {
    const expression =
      typeof fnOrString === 'function'
        ? `(${fnOrString.toString()})(...${JSON.stringify(args)})`
        : String(fnOrString);
    const res = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        JSON.stringify(res.exceptionDetails);
      throw new Error(`Page evaluation error: ${desc}`);
    }
    return res.result?.value;
  }

  async setViewport(width, height, { mobile = width < 768, deviceScaleFactor = width < 768 ? 2 : 1 } = {}) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor,
      mobile,
    });
    await sleep(80);
  }

  async goto(url, { waitReady = true } = {}) {
    await this.send('Page.navigate', { url });
    if (waitReady) {
      await this.waitFor(
        () => document.readyState === 'complete',
        { timeout: 25_000, label: `document ready at ${url}` },
      );
      await sleep(200);
    }
  }

  async reload() {
    await this.send('Page.reload', { ignoreCache: false });
    await this.waitFor(() => document.readyState === 'complete', { timeout: 20_000, label: 'page reload' });
    await sleep(200);
  }

  async waitFor(fn, { timeout = 15_000, interval = 100, label = 'condition' } = {}, ...args) {
    const deadline = Date.now() + timeout;
    let lastErr = null;
    while (Date.now() < deadline) {
      try {
        const val = await this.eval(fn, ...args);
        if (val) return val;
      } catch (e) {
        lastErr = e;
      }
      await sleep(interval);
    }
    throw new Error(`Timed out after ${timeout}ms waiting for ${label}${lastErr ? ` (last error: ${lastErr.message})` : ''}`);
  }

  async pressKey(key, { code = key, keyCode = 0, modifiers = 0 } = {}) {
    const map = {
      Escape: { key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 },
      Enter: { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 },
      ArrowDown: { key: 'ArrowDown', code: 'ArrowDown', windowsVirtualKeyCode: 40 },
      ArrowUp: { key: 'ArrowUp', code: 'ArrowUp', windowsVirtualKeyCode: 38 },
      k: { key: 'k', code: 'KeyK', windowsVirtualKeyCode: 75 },
    };
    const spec = map[key] || { key, code, windowsVirtualKeyCode: keyCode || key.charCodeAt(0) };
    await this.send('Input.dispatchKeyEvent', {
      type: 'rawKeyDown',
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.windowsVirtualKeyCode,
      modifiers,
    });
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: spec.key,
      code: spec.code,
      windowsVirtualKeyCode: spec.windowsVirtualKeyCode,
      modifiers,
    });
    await sleep(80);
  }

  async uploadFile(selector, filePath) {
    const doc = await this.send('DOM.getDocument', { depth: -1 });
    const node = await this.send('DOM.querySelector', {
      nodeId: doc.root.nodeId,
      selector,
    });
    if (!node || !node.nodeId) {
      throw new Error(`uploadFile: selector not found: ${selector}`);
    }
    await this.send('DOM.setFileInputFiles', {
      nodeId: node.nodeId,
      files: [path.resolve(filePath)],
    });
    await sleep(250);
  }

  async denyCamera(origin) {
    try {
      await this.client.send('Browser.setPermission', {
        origin,
        browserContextId: this.browserContextId,
        permission: { name: 'camera' },
        setting: 'denied',
      });
    } catch {
      // Fallback via script injection below
    }
    await this.send('Page.addScriptToEvaluateOnNewDocument', {
      source: `
        (() => {
          const reject = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
          if (navigator.mediaDevices) {
            try {
              Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { value: reject, configurable: true });
            } catch {
              navigator.mediaDevices.getUserMedia = reject;
            }
          }
        })();
      `,
    });
  }
}

export async function launchChrome({ cdpPort = 9223, fakeCamera = true, log = () => {} } = {}) {
  const chromeBin = findChromeBinary();
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'zlaqa-e2e-'));
  const args = [
    '--headless=new',
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${tmpProfile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-gpu',
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
    '--window-size=1440,900',
    ...(fakeCamera ? ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] : []),
    'about:blank',
  ];

  const proc = spawn(chromeBin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderrLines = [];
  proc.stderr?.on('data', (d) => {
    stderrLines.push(d.toString());
    if (stderrLines.length > 40) stderrLines.shift();
  });

  let versionInfo = null;
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (proc.exitCode !== null) {
      throw new Error(`Chrome exited prematurely (code ${proc.exitCode}):\n${stderrLines.join('')}`);
    }
    try {
      const res = await fetch(`http://127.0.0.1:${cdpPort}/json/version`);
      if (res.ok) {
        versionInfo = await res.json();
        break;
      }
    } catch {
      // wait
    }
    await sleep(200);
  }
  if (!versionInfo?.webSocketDebuggerUrl) {
    killProcessTree(proc.pid);
    throw new Error(`Timed out waiting for Chrome CDP at port ${cdpPort}:\n${stderrLines.join('')}`);
  }

  const ws = new WebSocket(versionInfo.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Timed out connecting CDP WebSocket')), 10_000);
    ws.addEventListener('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.addEventListener('error', (e) => {
      clearTimeout(t);
      reject(new Error(`CDP WebSocket error: ${e.message || 'unknown'}`));
    });
  });

  const client = new CdpClient(ws);
  log(`Launched Chrome (${versionInfo.Browser || 'Chrome'}) on CDP port ${cdpPort}`);

  const activeContexts = new Set();

  return {
    client,
    tmpProfile,
    async createSession(origin = '') {
      const { browserContextId } = await client.send('Target.createBrowserContext');
      activeContexts.add(browserContextId);
      const { targetId } = await client.send('Target.createTarget', {
        url: 'about:blank',
        browserContextId,
      });
      const { sessionId } = await client.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      const session = new CdpSession(client, sessionId, targetId, browserContextId, origin);
      await session.init();
      if (fakeCamera && origin) {
        try {
          await client.send('Browser.grantPermissions', {
            origin,
            browserContextId,
            permissions: ['videoCapture'],
          });
        } catch {
          // fake-ui flag handles this anyway
        }
      }
      return session;
    },
    async closeSession(session) {
      if (!session) return;
      try {
        await client.send('Target.disposeBrowserContext', { browserContextId: session.browserContextId });
      } catch {
        // ignore
      }
      activeContexts.delete(session.browserContextId);
    },
    async close() {
      for (const ctxId of Array.from(activeContexts)) {
        try {
          await client.send('Target.disposeBrowserContext', { browserContextId: ctxId });
        } catch {
          // ignore
        }
      }
      try {
        await client.send('Browser.close');
      } catch {
        // ignore
      }
      try {
        ws.close();
      } catch {
        // ignore
      }
      killProcessTree(proc.pid);
      for (let i = 0; i < 8; i++) {
        try {
          fs.rmSync(tmpProfile, { recursive: true, force: true });
          break;
        } catch {
          await sleep(250);
        }
      }
    },
  };
}
