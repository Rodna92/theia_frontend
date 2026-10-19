'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const inputClass =
  'relative block w-full border-0 px-3 sm:px-4 py-2.5 sm:py-3 3xl:py-3.5 text-base lg:text-sm 2xl:text-base 3xl:text-lg text-slate-900 ring-1 ring-inset ring-slate-300 placeholder:text-slate-400 focus:z-10 focus:ring-2 focus:ring-inset focus:ring-cyan-600 dark:bg-slate-800 dark:text-white dark:ring-slate-700';

export default function LoginPage() {
  const t = useTranslations('login');
  const tl = useTranslations('landing');
  const locale = useLocale();
  const router = useRouter();
  const [tenant, setTenant] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // In a real application, you would validate credentials here
    // For now, we redirect to the process page as requested
    router.push(`/${locale}/process`);
  };

  return (
    // Fills exactly the viewport below the 64px navbar; only scrolls if the window is shorter than the card
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-6 xs:py-8 sm:px-6 sm:py-10 lg:px-8 lg:py-[5vh]">
      <div className="w-full max-w-sm sm:max-w-md lg:max-w-4xl 2xl:max-w-5xl 3xl:max-w-6xl overflow-hidden rounded-2xl lg:rounded-3xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/70 backdrop-blur-xl shadow-[0_1px_2px_rgba(15,23,42,0.04),0_24px_64px_-24px_rgba(15,23,42,0.25)] dark:shadow-xl dark:lg:shadow-2xl lg:grid lg:grid-cols-[1fr_1.05fr]">
        {/* Brand panel (desktop only) */}
        <div className="relative hidden lg:flex flex-col justify-center overflow-hidden bg-[#0b1220] dark:bg-slate-950 px-10 py-[6vh] 2xl:px-14 3xl:px-16">
          <div
            className="absolute inset-0 opacity-20"
            style={{
              backgroundImage: `linear-gradient(to right, #0891b2 1px, transparent 1px), linear-gradient(to bottom, #0891b2 1px, transparent 1px)`,
              backgroundSize: '40px 40px',
            }}
          />
          <div className="absolute -bottom-32 -left-24 w-[480px] h-[480px] bg-cyan-500/20 blur-[120px] rounded-full pointer-events-none" />
          <div className="absolute top-6 left-6 w-16 h-16 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-2xl pointer-events-none" />
          <div className="absolute bottom-6 right-6 w-16 h-16 border-b-2 border-r-2 border-cyan-500/30 rounded-br-2xl pointer-events-none" />

          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 mb-[3vh] text-[11px] 3xl:text-xs font-bold tracking-[0.2em] uppercase bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
              </span>
              SYSTEM STATUS: OPERATIONAL
            </div>
            <span className="block mb-2 text-base 2xl:text-lg 3xl:text-xl font-mono font-black tracking-[0.3em] uppercase text-slate-400">
              {tl('hero.title1')}
            </span>
            <span className="block leading-none pb-1 text-6xl 2xl:text-7xl 3xl:text-8xl font-black tracking-tighter bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
              {tl('hero.title2')}
            </span>
            <p className="mt-[3vh] text-sm 2xl:text-base 3xl:text-lg leading-relaxed text-slate-300">
              {tl('hero.subtitle')}
            </p>
          </div>
        </div>

        {/* Form panel */}
        <div className="flex flex-col justify-center px-5 py-7 xs:px-6 xs:py-8 sm:px-10 sm:py-10 lg:px-12 lg:py-[6vh] 2xl:px-16 3xl:px-20">
          <h2 className="text-center lg:text-left text-2xl xs:text-3xl 3xl:text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
            {t('title')}
          </h2>
          <div className="mx-auto lg:mx-0 mt-3 h-1 w-12 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" />

          <form className="mt-6 xs:mt-8 lg:mt-[4vh] space-y-5 xs:space-y-6 lg:space-y-[3vh]" onSubmit={handleSubmit}>
            <div className="-space-y-px rounded-lg shadow-sm [&>div:first-child>input]:rounded-t-lg [&>div:last-child>input]:rounded-b-lg">
              <div>
                <label htmlFor="tenant-id" className="sr-only">
                  {t('tenant')}
                </label>
                <input
                  id="tenant-id"
                  name="tenant"
                  type="text"
                  required
                  className={inputClass}
                  placeholder={t('tenant')}
                  value={tenant}
                  onChange={(e) => setTenant(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="username" className="sr-only">
                  {t('username')}
                </label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  required
                  className={inputClass}
                  placeholder={t('username')}
                />
              </div>
              <div>
                <label htmlFor="password" className="sr-only">
                  {t('password')}
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className={inputClass}
                  placeholder={t('password')}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                className="group relative flex w-full justify-center rounded-lg bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-500 hover:to-blue-600 py-3 sm:py-3.5 3xl:py-4 px-3 text-base lg:text-sm 2xl:text-base 3xl:text-lg font-semibold text-white shadow-[0_8px_20px_-8px_rgba(29,78,216,0.5)] dark:shadow-[0_0_20px_rgba(8,145,178,0.25)] dark:hover:shadow-[0_0_30px_rgba(8,145,178,0.45)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 transition-all"
              >
                {t('submit')}
              </button>
            </div>

            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => router.push(`/${locale}/process`)}
                className="text-sm 3xl:text-base font-medium text-slate-500 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300"
              >
                Temporal Bypass (Dev Only)
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
