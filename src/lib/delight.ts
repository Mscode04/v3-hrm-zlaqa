// Small moments of delight: confetti burst, haptic tap, and gentle Web Audio SFX.

const reduced = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const SFX_KEY = 'zlaqa_sfx';
let audioCtx: AudioContext | null = null;
let orgSfxEnabled = true;

export function setOrgSoundEnabled(on: boolean) {
  orgSfxEnabled = on;
}

export function isSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  if (!orgSfxEnabled) return false;
  try {
    return localStorage.getItem(SFX_KEY) !== 'false';
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SFX_KEY, on ? 'true' : 'false');
  } catch {
    /* ignore storage error */
  }
}

export type SfxKind = 'check_in' | 'check_out' | 'task_done' | 'achievement' | 'pop';

function tone(ctx: AudioContext, freq: number, delay: number, dur: number, vol = 0.12, type: OscillatorType = 'triangle') {
  const start = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(vol, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

/** Plays a pleasant synthesized chime for key actions & milestones. */
export function playSfx(kind: SfxKind, force = false) {
  if (typeof window === 'undefined') return;
  if (!force && !isSoundEnabled()) return;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});

    if (kind === 'check_in') {
      // Bright morning start arpeggio: C5 -> E5 -> G5 -> C6
      tone(audioCtx, 523.25, 0, 0.16, 0.11, 'sine');
      tone(audioCtx, 659.25, 0.07, 0.16, 0.11, 'sine');
      tone(audioCtx, 783.99, 0.14, 0.18, 0.12, 'triangle');
      tone(audioCtx, 1046.5, 0.22, 0.34, 0.13, 'sine');
    } else if (kind === 'check_out') {
      // Warm evening resolve: G5 -> E5 -> C5
      tone(audioCtx, 783.99, 0, 0.18, 0.1, 'sine');
      tone(audioCtx, 659.25, 0.09, 0.2, 0.1, 'sine');
      tone(audioCtx, 523.25, 0.18, 0.38, 0.12, 'triangle');
    } else if (kind === 'task_done') {
      // Crisp dopamine completion pop: F5 -> A5 -> C6
      tone(audioCtx, 698.46, 0, 0.11, 0.1, 'triangle');
      tone(audioCtx, 880, 0.06, 0.14, 0.12, 'sine');
      tone(audioCtx, 1046.5, 0.12, 0.24, 0.12, 'sine');
    } else if (kind === 'achievement') {
      // Sparkling milestone fanfare
      tone(audioCtx, 523.25, 0, 0.14, 0.1, 'triangle');
      tone(audioCtx, 659.25, 0.06, 0.14, 0.1, 'triangle');
      tone(audioCtx, 783.99, 0.12, 0.16, 0.11, 'sine');
      tone(audioCtx, 987.77, 0.18, 0.2, 0.11, 'sine');
      tone(audioCtx, 1046.5, 0.25, 0.42, 0.14, 'sine');
    } else {
      // Subtle soft UI pop
      tone(audioCtx, 660, 0, 0.09, 0.08, 'sine');
    }
  } catch {
    /* ignore audio context restrictions */
  }
}

export function confetti(opts: { x?: number; y?: number; count?: number } = {}) {
  if (typeof window === 'undefined' || reduced()) return;
  const dpr = window.devicePixelRatio || 1;
  const c = document.createElement('canvas');
  c.style.cssText = 'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999';
  c.width = innerWidth * dpr;
  c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  if (!ctx) return c.remove();
  ctx.scale(dpr, dpr);
  const colors = ['#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#14b8a6', '#ec4899'];
  const x0 = opts.x ?? innerWidth / 2;
  const y0 = opts.y ?? innerHeight / 3;
  const ps = Array.from({ length: opts.count ?? 130 }, () => ({
    x: x0, y: y0, vx: (Math.random() - 0.5) * 15, vy: Math.random() * -13 - 3, r: Math.random() * 7 + 4,
    c: colors[Math.floor(Math.random() * colors.length)], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.35,
  }));
  let frame = 0;
  const total = 120;
  const tick = () => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    frame++;
    for (const p of ps) {
      p.vy += 0.33;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, 1 - frame / total);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2);
      ctx.restore();
    }
    if (frame < total) requestAnimationFrame(tick);
    else c.remove();
  };
  requestAnimationFrame(tick);
}

export function buzz(ms = 25) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
