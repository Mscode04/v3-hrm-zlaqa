import { sleep } from './cdp.mjs';

export function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export async function assertNoHorizontalOverflow(session, label = '') {
  const res = await session.eval(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    innerWidth: window.innerWidth,
  }));
  assert(
    res.scrollWidth <= res.clientWidth + 1,
    `Horizontal overflow${label ? ` (${label})` : ''}: scrollWidth=${res.scrollWidth} > clientWidth=${res.clientWidth}`,
  );
}

export async function assertToast(session, pattern, timeout = 7000) {
  const regexSrc = pattern instanceof RegExp ? pattern.source : null;
  const regexFlags = pattern instanceof RegExp ? pattern.flags : '';
  const needle = pattern instanceof RegExp ? null : String(pattern).toLowerCase();

  return session.waitFor(
    (src, flags, str) => {
      const region = document.querySelector('[aria-live="polite"]');
      if (!region) return null;
      const text = (region.textContent || '').trim();
      if (!text) return null;
      if (src) {
        const re = new RegExp(src, flags);
        return re.test(text) ? text : null;
      }
      return text.toLowerCase().includes(str) ? text : null;
    },
    { timeout, interval: 100, label: `toast matching ${pattern}` },
    regexSrc,
    regexFlags,
    needle,
  );
}

export async function assertModalLayout(
  session,
  {
    modalTitle = '',
    viewport = '',
    expectFullScreenOnMobile = true,
    checkScrollFooter = true,
    checkControlsHitTest = true,
    allowSmallInputs = false,
  } = {},
) {
  // Let entrance animation settle slightly
  await sleep(180);

  const report = await session.eval(
    async ({ modalTitle, expectFullScreenOnMobile, checkScrollFooter, checkControlsHitTest }) => {
      const dialogs = Array.from(document.querySelectorAll('[role="dialog"]')).filter((d) => {
        const st = getComputedStyle(d);
        const r = d.getBoundingClientRect();
        return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
      });

      if (!dialogs.length) {
        return { ok: false, errors: ['No visible [role="dialog"] found on page'] };
      }

      let dialog = null;
      if (modalTitle) {
        const want = modalTitle.toLowerCase();
        dialog = dialogs.find((d) => {
          const h2 = d.querySelector('h2')?.textContent?.trim().toLowerCase() || '';
          const aria = (d.getAttribute('aria-label') || '').toLowerCase();
          return h2.includes(want) || aria.includes(want);
        });
      }
      if (!dialog) {
        const uiModals = dialogs.filter((d) => d.closest('[data-ui-modal="true"]'));
        dialog = uiModals.length ? uiModals[uiModals.length - 1] : dialogs[dialogs.length - 1];
      }

      const actualTitle =
        dialog.querySelector('h2')?.textContent?.trim() ||
        dialog.getAttribute('aria-label') ||
        '(untitled dialog)';

      const errors = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const backdrop = dialog.parentElement;

      // 1. Portal & Anti-Trapping checks
      if (!backdrop || backdrop.parentElement !== document.body) {
        errors.push(
          `Modal not portaled to document.body (backdrop parent: ${backdrop?.parentElement?.tagName || 'none'})`,
        );
      }
      const trappedIn = dialog.closest('header, main, nav, aside, .stagger');
      if (trappedIn) {
        errors.push(`Modal trapped inside <${trappedIn.tagName.toLowerCase()} class="${trappedIn.className}">`);
      }

      if (backdrop) {
        const bStyle = getComputedStyle(backdrop);
        if (bStyle.position !== 'fixed') {
          errors.push(`Backdrop position is "${bStyle.position}", expected "fixed"`);
        }
        const z = Number(bStyle.zIndex);
        if (Number.isNaN(z) || z < 50) {
          errors.push(`Backdrop z-index is "${bStyle.zIndex}", expected >= 50 (ideally >= 60)`);
        }
        const br = backdrop.getBoundingClientRect();
        if (
          Math.abs(br.left) > 2 ||
          Math.abs(br.top) > 2 ||
          Math.abs(br.right - vw) > 2 ||
          Math.abs(br.bottom - vh) > 2
        ) {
          errors.push(
            `Backdrop does not cover full viewport ${vw}x${vh}: rect=${JSON.stringify({
              left: Math.round(br.left),
              top: Math.round(br.top),
              right: Math.round(br.right),
              bottom: Math.round(br.bottom),
            })}`,
          );
        }
      }

      if (getComputedStyle(document.body).overflow !== 'hidden') {
        errors.push(`document.body overflow is "${getComputedStyle(document.body).overflow}", expected "hidden"`);
      }

      // 2. Framing check
      const dr = dialog.getBoundingClientRect();
      if (dr.left < -1 || dr.top < -1 || dr.right > vw + 1 || dr.bottom > vh + 1) {
        errors.push(
          `Dialog overflows viewport ${vw}x${vh}: rect=${JSON.stringify({
            left: Math.round(dr.left),
            top: Math.round(dr.top),
            right: Math.round(dr.right),
            bottom: Math.round(dr.bottom),
          })}`,
        );
      }

      if (vw < 640 && vh >= 450 && expectFullScreenOnMobile) {
        if (dr.width < vw - 2 || dr.height < vh - 2 || dr.top > 1 || dr.left > 1) {
          errors.push(
            `Mobile dialog not full-screen (${vw}x${vh}): width=${Math.round(dr.width)}, height=${Math.round(
              dr.height,
            )}, top=${Math.round(dr.top)}, left=${Math.round(dr.left)}`,
          );
        }
      }

      // 3. Zero horizontal overflow
      if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
        errors.push(
          `Document horizontal overflow: scrollWidth=${document.documentElement.scrollWidth} > clientWidth=${document.documentElement.clientWidth}`,
        );
      }
      if (dialog.scrollWidth > dialog.clientWidth + 1) {
        errors.push(`Dialog horizontal overflow: scrollWidth=${dialog.scrollWidth} > clientWidth=${dialog.clientWidth}`);
      }

      const bodyEl = Array.from(dialog.children).find((c) => {
        const st = getComputedStyle(c);
        return st.overflowY === 'auto' || st.overflowY === 'scroll' || c.scrollHeight > c.clientHeight + 2;
      });
      if (bodyEl && bodyEl.scrollWidth > bodyEl.clientWidth + 1) {
        errors.push(
          `Modal scroll body horizontal overflow: scrollWidth=${bodyEl.scrollWidth} > clientWidth=${bodyEl.clientWidth}`,
        );
      }

      // Helper for visibility & rect
      const isVisible = (el) => {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.visibility === 'hidden' || parseFloat(st.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0.5 && r.height > 0.5;
      };
      const describe = (el) => {
        const tag = el.tagName.toLowerCase();
        const aria = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || '';
        const txt = (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 32);
        return `${tag}${aria ? `[${aria}]` : ''}${txt ? `("${txt}")` : ''}`;
      };

      // 4. Pairwise bounding-box overlap <= 1px on visible controls & leaf labels
      const rawCandidates = Array.from(
        dialog.querySelectorAll(
          'input:not([type="hidden"]), select, textarea, button, a[href], [role="switch"], h2, label > span:first-child, label',
        ),
      ).filter((el) => {
        if (!isVisible(el)) return false;
        if (el.tagName === 'LABEL') {
          // Only include leaf labels (no interactive descendants)
          if (el.querySelector('input, select, textarea, button, [role="switch"]')) return false;
        }
        return true;
      });

      const items = rawCandidates.map((el) => ({ el, r: el.getBoundingClientRect() }));
      for (let i = 0; i < items.length; i++) {
        const a = items[i];
        if (a.r.left < dr.left - 1.5 || a.r.right > dr.right + 1.5) {
          errors.push(
            `Control/label horizontally clipped outside dialog (${Math.round(dr.left)}..${Math.round(
              dr.right,
            )}): ${describe(a.el)} rect=[${Math.round(a.r.left)}..${Math.round(a.r.right)}]`,
          );
        }
        for (let j = i + 1; j < items.length; j++) {
          const b = items[j];
          if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
          const ix = Math.max(0, Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left));
          const iy = Math.max(0, Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top));
          if (ix > 1 && iy > 1) {
            errors.push(
              `Element overlap (${Math.round(ix)}x${Math.round(iy)}px): ${describe(a.el)} vs ${describe(b.el)}`,
            );
          }
        }
      }

      // 5. Post-scroll sticky header/footer & elementFromPoint hit-testing
      if (checkScrollFooter) {
        const prevScroll = bodyEl ? bodyEl.scrollTop : 0;
        if (bodyEl && bodyEl.scrollHeight > bodyEl.clientHeight) {
          bodyEl.scrollTop = bodyEl.scrollHeight;
          await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        }

        const closeBtn = dialog.querySelector('button[aria-label="Close"]');
        if (closeBtn && isVisible(closeBtn)) {
          const cr = closeBtn.getBoundingClientRect();
          if (cr.top < -1 || cr.bottom > vh + 1 || cr.left < -1 || cr.right > vw + 1) {
            errors.push(`Header Close button out of viewport after scroll: top=${cr.top}, bottom=${cr.bottom}`);
          } else {
            const hit = document.elementFromPoint((cr.left + cr.right) / 2, (cr.top + cr.bottom) / 2);
            if (!hit || (hit !== closeBtn && !closeBtn.contains(hit))) {
              errors.push(`Header Close button obscured at hit-test center (hit: ${hit ? describe(hit) : 'null'})`);
            }
          }
        }

        const h2 = dialog.querySelector('h2');
        if (h2 && isVisible(h2)) {
          const hr = h2.getBoundingClientRect();
          if (hr.top < -1 || hr.bottom > vh + 1) {
            errors.push(`Header title out of viewport after scroll: top=${hr.top}, bottom=${hr.bottom}`);
          }
        }

        // Identify footer/action buttons (inside footer wrapper or matching primary/cancel/skip labels)
        const footerDiv =
          dialog.children.length >= 3 ? dialog.children[dialog.children.length - 1] : null;
        const actionBtnRe =
          /^(cancel|save|save changes|save template|save update|save correction|create|create login|create task|create objective|create okrs|publish|add|send|send kudos|submit|skip|continue|assign|use this photo|retake|capture|upload|done|next|back|send a reminder)/i;
        const actionBtns = Array.from(dialog.querySelectorAll('button')).filter((b) => {
          if (!isVisible(b)) return false;
          if (footerDiv && footerDiv.contains(b) && footerDiv !== bodyEl) return true;
          return actionBtnRe.test((b.textContent || '').trim());
        });

        for (const btn of actionBtns) {
          const br = btn.getBoundingClientRect();
          if (br.top < -1 || br.bottom > vh + 1 || br.left < -1 || br.right > vw + 1) {
            errors.push(
              `Action button ${describe(btn)} clipped out of viewport after scroll (top=${Math.round(
                br.top,
              )}, bottom=${Math.round(br.bottom)}, vh=${vh})`,
            );
            continue;
          }
          const cx = (br.left + br.right) / 2;
          const cy = (br.top + br.bottom) / 2;
          const hit = document.elementFromPoint(cx, cy);
          if (!hit || (hit !== btn && !btn.contains(hit))) {
            errors.push(
              `Action button ${describe(btn)} failed elementFromPoint(${Math.round(cx)},${Math.round(
                cy,
              )}) hit-test (hit: ${hit ? describe(hit) : 'null'})`,
            );
          }
        }

        if (checkControlsHitTest) {
          const fields = Array.from(
            dialog.querySelectorAll('input:not([type="hidden"]), select, textarea, [role="switch"]'),
          ).filter(isVisible);
          for (const el of fields) {
            el.scrollIntoView({ block: 'center', inline: 'nearest' });
            await new Promise((res) => requestAnimationFrame(res));
            const fr = el.getBoundingClientRect();
            if (fr.top < -1 || fr.bottom > vh + 1 || fr.left < -1 || fr.right > vw + 1) {
              errors.push(
                `Field ${describe(el)} outside viewport after scrollIntoView: rect=${JSON.stringify({
                  left: Math.round(fr.left),
                  top: Math.round(fr.top),
                  right: Math.round(fr.right),
                  bottom: Math.round(fr.bottom),
                })}`,
              );
              continue;
            }
            const hit = document.elementFromPoint((fr.left + fr.right) / 2, (fr.top + fr.bottom) / 2);
            const lbl = el.closest('label');
            const okHit = hit && (hit === el || el.contains(hit) || (lbl && (hit === lbl || lbl.contains(hit))));
            if (!okHit) {
              errors.push(
                `Field ${describe(el)} obscured at center hit-test (hit: ${hit ? describe(hit) : 'null'})`,
              );
            }
          }
        }

        if (bodyEl) {
          bodyEl.scrollTop = prevScroll;
        }
      }

      return { ok: errors.length === 0, title: actualTitle, errors };
    },
    { modalTitle, expectFullScreenOnMobile, checkScrollFooter, checkControlsHitTest },
  );

  if (!report.ok) {
    const ctx = [
      viewport ? `viewport=${viewport}` : '',
      `modal="${report.title || modalTitle || 'dialog'}"`,
    ]
      .filter(Boolean)
      .join(' ');
    throw new Error(`Modal layout assertion failed [${ctx}]:\n  - ${report.errors.join('\n  - ')}`);
  }
  return report;
}
