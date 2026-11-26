'use client';
// Guide sheet ("?" button), first-visit tip strip and the onboarding tour.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ArrowRight, CircleHelp, Lightbulb, X } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { has, orgOn } from '@/lib/features';
import { TIP_KEY, TOUR_KEY, guideFor } from '@/lib/guides';
import { Button, Modal, cn } from './ui';

function seenTips(): string[] {
  try {
    return JSON.parse(localStorage.getItem(TIP_KEY) || '[]');
  } catch {
    return [];
  }
}

export function HelpButton({ className }: { className?: string }) {
  const { me, settings } = useMe();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (!orgOn(settings, 'guides')) return null;
  const g = guideFor(pathname);
  const manager = me.role !== 'member';
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Help for this page" title="Help for this page" className={cn('grid h-9 w-9 place-items-center rounded-xl text-neutral-600 transition hover:bg-neutral-100 active:scale-95', className)}>
        <CircleHelp size={18} />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={g ? `How to use ${g.title}` : 'Help'}>
        {g ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600">{g.tip}</p>
            <ol className="space-y-2">
              {g.steps.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-on-brand">{i + 1}</span>
                  <span className="pt-0.5">{s}</span>
                </li>
              ))}
            </ol>
            {manager && g.managerNotes && (
              <div className="rounded-2xl bg-violet-50 p-3 dark:bg-violet-500/10">
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-violet-700">For managers</div>
                <ul className="list-disc space-y-1 pl-4 text-sm">
                  {g.managerNotes.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-neutral-600">No guide for this page yet.</p>
        )}
        <Link href="/help" onClick={() => setOpen(false)} className="mt-4 flex items-center gap-1 text-sm font-medium underline">
          Open the Help center <ArrowRight size={14} />
        </Link>
      </Modal>
    </>
  );
}

export function PageTip() {
  const { settings } = useMe();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const g = guideFor(pathname);
  useEffect(() => {
    setShow(!!g && orgOn(settings, 'guides') && !seenTips().includes(g.route));
  }, [g, settings]);
  if (!show || !g) return null;
  function close() {
    localStorage.setItem(TIP_KEY, JSON.stringify([...seenTips(), g!.route]));
    setShow(false);
  }
  return (
    <div className="animate-fade-up mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm dark:border-emerald-500/30 dark:bg-emerald-500/10">
      <Lightbulb size={18} className="mt-0.5 shrink-0 text-emerald-600" />
      <span className="flex-1">{g.tip}</span>
      <button onClick={close} className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 dark:hover:bg-emerald-500/20" aria-label="Dismiss tip">
        <X size={16} />
      </button>
    </div>
  );
}

interface Step {
  title: string;
  body: string;
  href?: string;
}

export function Tour({ force, onDone }: { force?: boolean; onDone?: () => void }) {
  const { me, settings } = useMe();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (force) return setOpen(true);
    if (!orgOn(settings, 'onboarding_tour')) return;
    try {
      if (!localStorage.getItem(TOUR_KEY(me.id))) setOpen(true);
    } catch {
      /* storage blocked */
    }
  }, [me.id, settings, force]);

  const steps: Step[] = [
    { title: `Welcome, ${me.full_name.split(' ')[0]} 👋`, body: 'This is Zlaqa Team OS. A quick tour of what is switched on for you. Takes 30 seconds.' },
    ...(has(me, settings, 'attendance') ? [{ title: 'Check in', body: 'Tap Check in at the bottom (or top right) when you start. Take tea and lunch breaks from the same screen.', href: '/attendance' }] : []),
    ...(has(me, settings, 'daily_log') ? [{ title: 'My Day', body: 'Add anything you work on, even unplanned. No approval needed. Your manager can see it and comment.', href: '/today' }] : []),
    ...(has(me, settings, 'kpis') ? [{ title: 'Your KPIs', body: 'Your recurring targets. Log numbers on Manual KPIs. Auto KPIs fill themselves.', href: '/kpis' }] : []),
    ...(has(me, settings, 'okrs') ? [{ title: 'OKRs', body: 'Your quarterly goals. Update key results every week.', href: '/okrs' }] : []),
    ...(orgOn(settings, 'announcements') ? [{ title: 'Must read', body: 'Important posts show at the top of your dashboard. Tap “I have read this” so your manager knows.' }] : []),
    ...(me.role !== 'member'
      ? [{ title: 'For managers', body: 'Employees → Edit → What we track decides who has KPIs, OKRs, attendance and daily log. Team log and Analytics show how everyone is doing.', href: '/employees' }]
      : []),
    { title: 'Need help?', body: 'Tap the ? at the top of any page for a short guide. The Help center has FAQs and this tour.' },
  ];

  function finish() {
    try {
      localStorage.setItem(TOUR_KEY(me.id), new Date().toISOString());
    } catch {
      /* ignore */
    }
    setOpen(false);
    setI(0);
    onDone?.();
  }
  const s = steps[i];
  if (!open || !s) return null;
  return (
    <Modal open onClose={finish} title={<span className="text-xs font-medium uppercase tracking-wide text-neutral-500">Step {i + 1} of {steps.length}</span>}>
      <div key={i} className="animate-fade-up space-y-3">
        <h3 className="text-xl font-semibold">{s.title}</h3>
        <p className="text-[15px] leading-relaxed text-neutral-600">{s.body}</p>
        {s.href && (
          <Link href={s.href} onClick={finish} className="inline-flex items-center gap-1 text-sm font-medium underline">
            Go there now <ArrowRight size={14} />
          </Link>
        )}
      </div>
      <div className="mt-5 flex items-center gap-1.5">
        {steps.map((_, k) => (
          <span key={k} className={cn('h-1.5 rounded-full transition-all', k === i ? 'w-6 bg-brand' : 'w-1.5 bg-neutral-200')} />
        ))}
      </div>
      <div className="mt-5 flex justify-between gap-2">
        <Button variant="ghost" onClick={finish}>
          Skip
        </Button>
        <div className="flex gap-2">
          {i > 0 && (
            <Button variant="secondary" onClick={() => setI(i - 1)}>
              Back
            </Button>
          )}
          <Button onClick={() => (i === steps.length - 1 ? finish() : setI(i + 1))}>{i === steps.length - 1 ? 'Done' : 'Next'}</Button>
        </div>
      </div>
    </Modal>
  );
}
