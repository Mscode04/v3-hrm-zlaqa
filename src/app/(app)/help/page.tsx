'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, PlayCircle, Search } from 'lucide-react';
import { useMe } from '@/lib/auth';
import { FAQ, GUIDES, TIP_KEY } from '@/lib/guides';
import { Button, Card, Input, PageHeader, cn } from '@/components/ui';
import { Tour } from '@/components/Guides';
import { useToast } from '@/lib/toast';

export default function HelpPage() {
  const { me } = useMe();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [tour, setTour] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const manager = me.role !== 'member';
  const ql = q.toLowerCase();
  const guides = GUIDES.filter((g) => !g.roles || g.roles.includes(me.role)).filter(
    (g) => !q || [g.title, g.tip, ...g.steps, ...(g.managerNotes ?? [])].join(' ').toLowerCase().includes(ql),
  );
  const faq = FAQ.filter((f) => !q || (f.q + f.a).toLowerCase().includes(ql));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Help"
        subtitle="Short guides for every page. Tap ? on any page for its guide."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => { localStorage.removeItem(TIP_KEY); toast('Page tips will show again', 'success'); }}>
              Show tips again
            </Button>
            <Button size="sm" onClick={() => setTour(true)}>
              <PlayCircle size={15} /> Replay the tour
            </Button>
          </div>
        }
      />
      <div className="relative">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help, e.g. KPI, break, poll" className="w-full pl-10" />
      </div>

      {faq.length > 0 && (
        <Card title="Common questions">
          <div className="divide-y divide-neutral-100">
            {faq.map((f, i) => (
              <div key={f.q}>
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-medium">
                  {f.q}
                  <ChevronDown size={16} className={cn('shrink-0 transition', openFaq === i && 'rotate-180')} />
                </button>
                {openFaq === i && <p className="animate-fade-up pb-3 text-sm text-neutral-600">{f.a}</p>}
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="stagger grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guides.map((g) => (
          <Card key={g.route} title={g.title} action={<Link href={g.route} className="text-xs text-neutral-500 underline">Open</Link>}>
            <p className="mb-3 text-sm text-neutral-600">{g.tip}</p>
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {g.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {manager && g.managerNotes && (
              <ul className="mt-3 list-disc space-y-1 rounded-xl bg-violet-50 p-3 pl-7 text-sm dark:bg-violet-500/10">
                {g.managerNotes.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
      {tour && <Tour force onDone={() => setTour(false)} />}
    </div>
  );
}
