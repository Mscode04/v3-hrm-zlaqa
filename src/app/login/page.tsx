'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Crown, Eye, EyeOff, LogIn, Moon, Sun, User, Users } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { DATA_MODE, SHOW_DEMO_LOGINS, db } from '@/lib/data';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '@/lib/data/seed';
import { errMsg } from '@/lib/format';
import { Button, ErrorNote, Field, Input } from '@/components/ui';
import { Wordmark } from '@/components/bits';

const ROLE_ICON = [Crown, Users, User];

export default function LoginPage() {
  const { user, loading, signIn, settings } = useAuth();
  const { dark, toggle } = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard');
  }, [loading, user, router]);

  async function go(e?: FormEvent, em = email, pw = password) {
    e?.preventDefault();
    setBusy(em);
    setErr('');
    try {
      await signIn(em, pw);
      router.replace('/dashboard');
    } catch (x) {
      setErr(errMsg(x));
      setBusy(null);
    }
  }

  useEffect(() => {
    document.title = `Sign in · ${settings.company_name}`;
  }, [settings.company_name]);

  return (
    <div className="grid h-[100dvh] overflow-y-auto bg-[#000000] text-white lg:grid-cols-[1.05fr_1fr] lg:overflow-hidden">
      <div className="relative hidden h-[100dvh] overflow-hidden bg-[#000000] px-8 pb-0 pt-6 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="relative z-10 flex items-center justify-center">
          <Wordmark variant="light" imgClassName="h-11 xl:h-12" />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col items-center justify-end text-center">
          <h1 className="mt-2 shrink-0 text-2xl font-semibold tracking-tight text-white xl:text-3xl">
            Welcome back to <span className="text-[#6ec000]">TEAM ZLAQA</span>
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/zlaqa-duo.jpg"
            alt="ZLAQA AI Duo"
            className="mt-2 min-h-0 w-full max-w-md flex-1 bg-[#000000] object-contain object-bottom"
          />
        </div>
      </div>

      <div className="relative flex flex-col justify-start bg-[#000000] text-white lg:h-[100dvh] lg:justify-center lg:overflow-hidden lg:px-8 lg:py-4">
        <div className="relative shrink-0 overflow-hidden bg-[#000000] px-5 pt-2.5 text-center text-white lg:hidden">
          <div className="flex items-center justify-between">
            <span className="w-8" />
            <Wordmark variant="light" imgClassName="h-8" />
            <button onClick={toggle} className="grid h-8 w-8 place-items-center rounded-xl text-white/70 hover:bg-white/10" aria-label="Toggle theme">
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <h1 className="mt-1 text-base font-semibold tracking-tight">
            Welcome back to <span className="text-[#6ec000]">TEAM ZLAQA</span>
          </h1>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/zlaqa-duo.jpg"
            alt="ZLAQA AI Duo"
            className="mx-auto mt-0.5 h-32 w-auto bg-[#000000] object-contain object-bottom"
          />
        </div>

        <button onClick={toggle} className="absolute right-4 top-4 hidden h-9 w-9 place-items-center rounded-xl text-white/60 hover:bg-white/10 lg:grid" aria-label="Toggle theme">
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="mx-auto flex w-full max-w-sm flex-col justify-start animate-fade-up bg-[#000000] px-5 pb-4 pt-1 lg:rounded-3xl lg:border lg:border-white/15 lg:bg-[#000000] lg:p-6">
          <div className="hidden lg:block">
            <h2 className="text-xl font-semibold tracking-tight text-white">Sign in</h2>
            <p className="mt-0.5 text-xs text-white/60">Enter your work email and password.</p>
          </div>
          <form onSubmit={go} className="space-y-2.5 lg:mt-4">
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-white/80">Email</span>
              <Input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10 border-white/15 bg-white/[0.06] text-white placeholder:text-white/40 focus:border-[#6ec000]"
              />
            </label>
            <label className="block space-y-1">
              <span className="block text-xs font-medium text-white/80">Password</span>
              <div className="relative">
                <Input
                  type={showPw ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 border-white/15 bg-white/[0.06] pr-10 text-white placeholder:text-white/40 focus:border-[#6ec000]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  aria-label={showPw ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-white/50 hover:text-white"
                >
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>
            <ErrorNote text={err} />
            <Button type="submit" className="h-10 w-full bg-[#6ec000] font-semibold text-black hover:bg-[#7ad400]" disabled={!!busy}>
              <LogIn size={16} /> {busy === email && busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          {SHOW_DEMO_LOGINS && (
            <div className="mt-4">
              <div className="mb-2 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-wider text-white/50">
                <span className="h-px flex-1 bg-white/15" /> Demo roles <span className="h-px flex-1 bg-white/15" />
              </div>
              <div className="space-y-1.5">
                {DEMO_ACCOUNTS.map((a, i) => {
                  const Icon = ROLE_ICON[i] ?? User;
                  return (
                    <button
                      key={a.email}
                      type="button"
                      disabled={!!busy}
                      onClick={() => {
                        setEmail(a.email);
                        setPassword(DEMO_PASSWORD);
                        go(undefined, a.email, DEMO_PASSWORD);
                      }}
                      className="card-hover group flex w-full items-center gap-2.5 rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2 text-left text-white transition hover:border-[#6ec000]/60 hover:bg-white/[0.08] disabled:opacity-60"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition group-hover:bg-[#6ec000] group-hover:text-black">
                        <Icon size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-semibold leading-tight">{a.label}</span>
                        <span className="block truncate text-[11px] text-white/60">{a.hint}</span>
                      </span>
                      {busy === a.email ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-[#6ec000]" />
                      ) : (
                        <ArrowRight size={14} className="text-white/50 transition group-hover:translate-x-1 group-hover:text-[#6ec000]" />
                      )}
                    </button>
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-[11px] text-white/50">
                <span>Pass: {DEMO_PASSWORD}</span>
                {DATA_MODE === 'demo' && (
                  <button
                    type="button"
                    className="underline hover:text-white/80"
                    onClick={() => {
                      db.resetDemo?.();
                      location.reload();
                    }}
                  >
                    Reset demo
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
