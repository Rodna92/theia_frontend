'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import {
  IconCpu,
  IconActivity,
  IconShieldCheck,
  IconArrowRight,
  IconListNumbers,
} from '@tabler/icons-react';
import { IconLeakDetectionArm, IconFluidDoserArm } from '@/components/icons/ProcessIcons';

// Module cards shown in the right column on QHD+ (3xl) screens
const MODULES = [
  { key: 'leakDetection', Icon: IconLeakDetectionArm },
  { key: 'fluidDoser', Icon: IconFluidDoserArm },
  { key: 'sequenceOfProcess', Icon: IconListNumbers },
] as const;

export function Hero() {
  const t = useTranslations('landing');
  const tp = useTranslations('processes');
  const locale = useLocale();

  return (
    // Desktop (lg+) spacing and title size scale with viewport height (vh) so the
    // hero stays compact on short windows and never scrolls on a FHD screen.
    <div className="relative min-h-[calc(100svh-4rem)] flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 py-10 xs:py-12 sm:py-16 lg:py-[6vh]">
      {/* Background Video & Grid */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="hidden dark:block w-full h-full object-cover opacity-30 mix-blend-overlay"
        >
          <source src="/video/FUTURE-TECNOLOGIES_PRODUCTS.mp4" type="video/mp4" />
        </video>

        {/* Futuristic Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 via-slate-50/30 to-slate-50 dark:from-slate-950 dark:via-slate-950/40 dark:to-slate-950 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/[0.07] dark:from-cyan-500/15 via-transparent to-transparent z-10" />

        {/* Tech Grid */}
        <div className="absolute inset-0 z-10 opacity-[0.06] dark:opacity-20 [mask-image:radial-gradient(ellipse_at_center,black_40%,transparent_85%)] dark:[mask-image:none]"
          style={{
            backgroundImage: `linear-gradient(to right, #0891b2 1px, transparent 1px), linear-gradient(to bottom, #0891b2 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }}
        />

        {/* Animated Scanning Line */}
        <div className="absolute inset-0 z-15 pointer-events-none overflow-hidden">
          <div className="w-full h-[2px] bg-cyan-600/15 dark:bg-cyan-500/30 blur-sm animate-scan dark:shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
        </div>
      </div>

      {/* HUD Corner Decorations */}
      <div className="absolute top-8 left-8 xl:top-10 xl:left-10 3xl:top-12 3xl:left-12 z-20 w-24 h-24 xl:w-32 xl:h-32 3xl:w-40 3xl:h-40 border-t-2 border-l-2 border-cyan-600/20 dark:border-cyan-500/30 rounded-tl-3xl pointer-events-none hidden lg:block animate-pulse-slow" />
      <div className="absolute top-8 right-8 xl:top-10 xl:right-10 3xl:top-12 3xl:right-12 z-20 w-24 h-24 xl:w-32 xl:h-32 3xl:w-40 3xl:h-40 border-t-2 border-r-2 border-cyan-600/20 dark:border-cyan-500/30 rounded-tr-3xl pointer-events-none hidden lg:block animate-pulse-slow" />
      <div className="absolute bottom-8 left-8 xl:bottom-10 xl:left-10 3xl:bottom-12 3xl:left-12 z-20 w-24 h-24 xl:w-32 xl:h-32 3xl:w-40 3xl:h-40 border-b-2 border-l-2 border-cyan-600/20 dark:border-cyan-500/30 rounded-bl-3xl pointer-events-none hidden lg:block animate-pulse-slow" />
      <div className="absolute bottom-8 right-8 xl:bottom-10 xl:right-10 3xl:bottom-12 3xl:right-12 z-20 w-24 h-24 xl:w-32 xl:h-32 3xl:w-40 3xl:h-40 border-b-2 border-r-2 border-cyan-600/20 dark:border-cyan-500/30 rounded-br-3xl pointer-events-none hidden lg:block animate-pulse-slow" />

      {/* Floating Elements (hidden on 3xl, where the split layout fills that space) */}
      <div className="absolute top-1/4 left-1/4 z-10 animate-float opacity-20 hidden lg:block 3xl:hidden">
        <IconCpu size={48} className="text-cyan-400" />
      </div>
      <div className="absolute bottom-1/4 right-1/4 z-10 animate-float opacity-20 [animation-delay:2s] hidden lg:block 3xl:hidden">
        <IconActivity size={48} className="text-blue-400" />
      </div>
      <div className="absolute top-1/3 right-1/5 z-10 animate-float opacity-20 [animation-delay:4s] hidden lg:block 3xl:hidden">
        <IconShieldCheck size={48} className="text-indigo-400" />
      </div>

      {/* Content: centered column up to 2xl, two-column split on 3xl */}
      <div className="relative z-30 mx-auto w-full max-w-7xl 3xl:max-w-[1840px] px-4 xs:px-5 sm:px-6 lg:px-8 3xl:px-16 3xl:grid 3xl:grid-cols-[1.1fr_1fr] 3xl:items-center 3xl:gap-24">
        <div className="mx-auto max-w-3xl xl:max-w-4xl text-center 3xl:mx-0 3xl:max-w-none 3xl:text-left">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 text-[10px] tracking-[0.12em] xs:text-[11px] xs:tracking-[0.15em] xs:mb-6 sm:px-4 sm:py-1.5 sm:mb-8 sm:text-xs sm:tracking-[0.2em] lg:mb-[2.8vh] 3xl:text-sm font-bold uppercase bg-white border border-slate-200 shadow-sm text-cyan-700 dark:shadow-none dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:text-cyan-400 rounded-full backdrop-blur-xl dark:animate-glow">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 dark:bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 dark:bg-cyan-500"></span>
            </span>
            SYSTEM STATUS: OPERATIONAL
          </div>

          <h1 className="font-black tracking-tighter text-slate-900 dark:text-white mb-5 xs:mb-6 sm:mb-8 lg:mb-[2.5vh]">
            <span className="block text-slate-500 dark:text-slate-400 mb-2 xs:mb-3 sm:mb-4 lg:mb-[1.2vh] text-sm xs:text-base sm:text-xl md:text-2xl 3xl:text-3xl font-mono tracking-[0.2em] xs:tracking-[0.25em] sm:tracking-[0.3em] uppercase">
              {t('hero.title1')}
            </span>
            <div className='flex flex-row items-end justify-center 3xl:justify-start gap-2 xs:gap-3 sm:gap-4'>
              <span className="block leading-none pb-1 text-[2.75rem] xs:text-6xl sm:text-7xl md:text-8xl lg:text-[clamp(4.5rem,11vh,7.5rem)] 3xl:text-[clamp(6rem,13vh,11rem)]
              bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-700 dark:from-cyan-400 dark:via-blue-400 dark:to-indigo-500
              bg-clip-text text-transparent filter dark:drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                {t('hero.title2')}
              </span>
              <span className="block text-slate-500 dark:text-slate-400 mb-1 text-xs xs:text-sm sm:text-xl md:text-2xl 3xl:text-3xl font-mono tracking-[0.2em] sm:tracking-[0.3em] uppercase">
                v1.0
              </span>
            </div>
          </h1>

          <p className="mt-4 sm:mt-6 lg:mt-0 text-[0.9375rem] xs:text-base sm:text-lg md:text-xl 3xl:text-2xl leading-relaxed lg:text-balance text-slate-600 dark:text-slate-300 max-w-2xl xl:max-w-3xl 2xl:max-w-4xl 3xl:max-w-none mx-auto 3xl:mx-0 backdrop-blur-md p-4 xs:p-5 sm:p-6 lg:px-8 lg:py-5 3xl:px-10 3xl:py-8 rounded-xl sm:rounded-2xl bg-white/80 border border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] dark:bg-white/5 dark:border-white/10 dark:shadow-2xl">
            {t('hero.subtitle')}
          </p>

          <div className="mt-8 sm:mt-10 lg:mt-[4.5vh] mx-auto 3xl:mx-0 w-full max-w-sm sm:max-w-none flex flex-col sm:flex-row items-stretch sm:items-center justify-center 3xl:justify-start gap-3 xs:gap-4 sm:gap-6">
            <Link
              href={`/${locale}/login`}
              className="group relative flex justify-center px-6 py-3.5 xs:py-4 sm:px-10 sm:py-5 lg:py-4 3xl:px-14 3xl:py-6 text-base sm:text-lg 3xl:text-xl font-black text-white transition-all duration-500 ease-out rounded-xl overflow-hidden shadow-[0_8px_20px_-6px_rgba(29,78,216,0.45)] hover:shadow-[0_12px_28px_-6px_rgba(29,78,216,0.55)] dark:shadow-[0_0_20px_rgba(8,145,178,0.3)] dark:hover:shadow-[0_0_40px_rgba(8,145,178,0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-700 group-hover:from-cyan-500 group-hover:to-blue-600 transition-all duration-500" />
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
              <span className="relative z-10 flex items-center gap-2 sm:w-44 lg:w-48 3xl:w-56 justify-center">
                Start
                <IconArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <button className="group relative flex justify-center px-6 py-3.5 xs:py-4 sm:px-10 sm:py-5 lg:py-4 3xl:px-14 3xl:py-6 text-base sm:text-lg 3xl:text-xl font-bold text-slate-800 border border-slate-300 bg-white shadow-sm hover:border-cyan-600/50 hover:text-cyan-700 dark:shadow-none dark:text-cyan-400 dark:border-cyan-500/30 rounded-xl backdrop-blur-xl dark:bg-white/5 dark:hover:bg-cyan-500/10 transition-all duration-500 dark:hover:border-cyan-400/60 sm:hover:scale-105 active:scale-95">
              <span className="flex items-center gap-2 sm:w-44 lg:w-48 3xl:w-56 justify-center">
                Explore Ecosystem
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              </span>
            </button>
          </div>
        </div>

        {/* Module panel (3xl only) */}
        <div className="hidden 3xl:flex flex-col gap-[2.2vh]">
          {MODULES.map(({ key, Icon }) => (
            <div
              key={key}
              className="group relative flex items-start gap-7 px-9 py-[3vh] rounded-2xl border border-slate-200 bg-white/85 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.12)] hover:border-cyan-600/40 dark:border-cyan-500/20 dark:bg-slate-900/40 backdrop-blur-xl dark:shadow-2xl transition-all duration-500 dark:hover:border-cyan-400/50 dark:hover:bg-cyan-500/5"
            >
              <div className="absolute left-0 top-6 bottom-6 w-[3px] rounded-full bg-gradient-to-b from-cyan-400 to-blue-600 opacity-60 group-hover:opacity-100 transition-opacity" />
              <div className="flex shrink-0 items-center justify-center w-16 h-16 rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:border-cyan-500/30 dark:text-cyan-400">
                <Icon size={32} stroke={1.5} />
              </div>
              <div className="min-w-0">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {tp(`cards.${key}.title`)}
                </h3>
                <p className="mt-2 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                  {tp(`cards.${key}.description`)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Decorative scan lines / grid effect */}
      <div className="absolute inset-0 z-20 pointer-events-none opacity-0 dark:opacity-30 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%]" />

      {/* Dynamic Data Stream (Mock) */}
      <div className="absolute right-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 opacity-20 pointer-events-none hidden xl:flex">
        {[72, 51, 30, 24, 53].map((width, i) => (
          <div key={i} className="h-1 w-20 bg-cyan-500/40 rounded-full overflow-hidden">
            <div className={`h-full bg-cyan-400 animate-[scan_2s_linear_infinite] [animation-delay:${i * 0.4}s]`} style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>

      {/* Bottom Glow */}
      <div className="absolute -bottom-48 left-1/2 -translate-x-1/2 w-[600px] h-[300px] sm:w-[800px] sm:h-[400px] lg:w-[1000px] lg:h-[500px] 3xl:w-[1400px] 3xl:h-[600px] bg-cyan-500/10 dark:bg-cyan-500/20 blur-[150px] rounded-full z-10 pointer-events-none" />
    </div>
  );
}
