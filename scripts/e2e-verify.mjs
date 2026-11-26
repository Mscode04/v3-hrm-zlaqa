import { ensureServer, launchChrome, parseCliArgs } from './e2e/cdp.mjs';
import { buildTier1Tests } from './e2e/tiers/tier1.mjs';
import { buildTier2Tests } from './e2e/tiers/tier2.mjs';
import { buildTier3Tests } from './e2e/tiers/tier3.mjs';
import { buildTier4Tests } from './e2e/tiers/tier4.mjs';

function fmtMs(ms) {
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`;
}

async function main() {
  const opts = parseCliArgs();
  const log = (msg) => console.log(`[e2e] ${msg}`);

  log(
    `Starting E2E verification (tiers=${opts.tiers.join(',')}, port=${opts.port}, cdpPort=${opts.cdpPort}${
      opts.baseUrl ? `, baseUrl=${opts.baseUrl}` : ''
    })`,
  );

  let server = null;
  let activeChrome = null;
  let cleaning = false;

  const cleanup = async () => {
    if (cleaning) return;
    cleaning = true;
    if (activeChrome) {
      await activeChrome.close().catch(() => {});
      activeChrome = null;
    }
    if (server) {
      await server.stop().catch(() => {});
      server = null;
    }
  };

  const onSignal = async (sig) => {
    log(`Received ${sig}, cleaning up...`);
    await cleanup();
    process.exit(130);
  };
  process.on('SIGINT', () => void onSignal('SIGINT'));
  process.on('SIGTERM', () => void onSignal('SIGTERM'));

  try {
    server = await ensureServer({ baseUrl: opts.baseUrl, port: opts.port, log });
    const baseUrl = server.baseUrl;

    const results = [];
    const getChrome = () => activeChrome;
    const suiteBuilders = {
      1: () => buildTier1Tests({ baseUrl, getChrome }),
      2: () => buildTier2Tests({ baseUrl, getChrome }),
      3: () => buildTier3Tests({ baseUrl, getChrome }),
      4: () => buildTier4Tests({ baseUrl, getChrome }),
    };

    // Launch Chrome with fake camera stream for standard suites
    activeChrome = await launchChrome({ cdpPort: opts.cdpPort, fakeCamera: true, log });

    for (const tier of opts.tiers) {
      console.log(`\n=== Tier ${tier} ===`);
      const tests = suiteBuilders[tier]();

      for (const tc of tests) {
        // T2.1 requires a camera-denied Chrome instance without --use-fake-ui-for-media-stream
        const needsNoCam = tc.id === 'T2.1';
        if (needsNoCam) {
          await activeChrome.close();
          activeChrome = await launchChrome({ cdpPort: opts.cdpPort, fakeCamera: false, log });
        }

        const start = Date.now();
        try {
          await tc.run();
          const dur = Date.now() - start;
          console.log(`  PASS  ${tc.id} (${fmtMs(dur)}) — ${tc.name}`);
          results.push({ tier, id: tc.id, name: tc.name, status: 'PASS', ms: dur });
        } catch (err) {
          const dur = Date.now() - start;
          console.error(`  FAIL  ${tc.id} (${fmtMs(dur)}) — ${tc.name}`);
          console.error(`        ${err.message.split('\n').join('\n        ')}`);
          results.push({
            tier,
            id: tc.id,
            name: tc.name,
            status: 'FAIL',
            ms: dur,
            error: err.message,
          });
        }

        if (needsNoCam) {
          await activeChrome.close();
          activeChrome = await launchChrome({ cdpPort: opts.cdpPort, fakeCamera: true, log });
        }
      }
    }

    const passed = results.filter((r) => r.status === 'PASS').length;
    const failed = results.filter((r) => r.status === 'FAIL').length;

    console.log('\n=== E2E Summary ===');
    for (const t of opts.tiers) {
      const tr = results.filter((r) => r.tier === t);
      const tp = tr.filter((r) => r.status === 'PASS').length;
      const tf = tr.filter((r) => r.status === 'FAIL').length;
      console.log(`  Tier ${t}: ${tp}/${tr.length} passed${tf ? `, ${tf} failed` : ''}`);
    }
    console.log(`  Total:  ${passed}/${results.length} passed, ${failed} failed`);

    if (failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await cleanup();
  }
}

main().catch((err) => {
  console.error(`[e2e] Fatal error: ${err.stack || err.message}`);
  process.exit(1);
});
