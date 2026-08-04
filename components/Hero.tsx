'use client';

import { useTranslations, useLocale } from 'next-intl';
import Link from 'next/link';
import { IconCpu, IconActivity, IconShieldCheck, IconArrowRight } from '@tabler/icons-react';

export function Hero() {
  const t = useTranslations('landing');
  const locale = useLocale();

  return (
    <div className="relative h-[calc(100vh-100px)] flex items-center justify-center overflow-hidden bg-slate-950">
      {/* Background Video & Grid */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="w-full h-full object-cover opacity-40 dark:opacity-30 mix-blend-overlay"
        >
          <source src="/video/FUTURE-TECNOLOGIES_PRODUCTS.mp4" type="video/mp4" />
        </video>
        
        {/* Futuristic Overlays */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950 via-slate-950/40 to-slate-950 z-10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/15 via-transparent to-transparent z-10" />
        
        {/* Tech Grid */}
        <div className="absolute inset-0 z-10 opacity-20" 
          style={{ 
            backgroundImage: `linear-gradient(to right, #0891b2 1px, transparent 1px), linear-gradient(to bottom, #0891b2 1px, transparent 1px)`,
            backgroundSize: '40px 40px'
          }} 
        />
        
        {/* Animated Scanning Line */}
        <div className="absolute inset-0 z-15 pointer-events-none overflow-hidden">
          <div className="w-full h-[2px] bg-cyan-500/30 blur-sm animate-scan shadow-[0_0_15px_rgba(6,182,212,0.5)]" />
        </div>
      </div>

      {/* HUD Corner Decorations */}
      <div className="absolute top-10 left-10 z-20 w-32 h-32 border-t-2 border-l-2 border-cyan-500/30 rounded-tl-3xl pointer-events-none hidden lg:block animate-pulse-slow" />
      <div className="absolute top-10 right-10 z-20 w-32 h-32 border-t-2 border-r-2 border-cyan-500/30 rounded-tr-3xl pointer-events-none hidden lg:block animate-pulse-slow" />
      <div className="absolute bottom-10 left-10 z-20 w-32 h-32 border-b-2 border-l-2 border-cyan-500/30 rounded-bl-3xl pointer-events-none hidden lg:block animate-pulse-slow" />
      <div className="absolute bottom-10 right-10 z-20 w-32 h-32 border-b-2 border-r-2 border-cyan-500/30 rounded-br-3xl pointer-events-none hidden lg:block animate-pulse-slow" />

      {/* Floating Elements */}
      <div className="absolute top-1/4 left-1/4 z-10 animate-float opacity-20 hidden lg:block">
        <IconCpu size={48} className="text-cyan-400" />
      </div>
      <div className="absolute bottom-1/4 right-1/4 z-10 animate-float opacity-20 [animation-delay:2s] hidden lg:block">
        <IconActivity size={48} className="text-blue-400" />
      </div>
      <div className="absolute top-1/3 right-1/5 z-10 animate-float opacity-20 [animation-delay:4s] hidden lg:block">
        <IconShieldCheck size={48} className="text-indigo-400" />
      </div>

      <div className="relative z-30 mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 text-xs font-bold tracking-[0.2em] uppercase bg-cyan-500/10 border border-cyan-500/30 rounded-full text-cyan-400 backdrop-blur-xl animate-glow">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
            </span>
            SYSTEM STATUS: OPERATIONAL
          </div>

          <h1 className="font-black tracking-tighter text-white mb-8">
            <span className="block text-slate-400 mb-4 text-lg sm:text-2xl font-mono tracking-[0.3em] uppercase">
              {t('hero.title1')}
            </span>
            <div className='flex flex-row items-end justify-center gap-4'>
              <span className="block text-5xl sm:text-8xl
              bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 
              bg-clip-text text-transparent filter drop-shadow-[0_0_30px_rgba(34,211,238,0.3)]">
                {t('hero.title2')}
              </span>
              <span className="block text-slate-400 mb-1 text-lg sm:text-2xl font-mono tracking-[0.3em] uppercase">
                v1.0
              </span>
            </div>            
          </h1>

          <p className="mt-6 text-xl leading-relaxed text-slate-300 max-w-2xl mx-auto backdrop-blur-md p-6 rounded-2xl bg-white/5 border border-white/10 shadow-2xl">
            {t('hero.subtitle')}
          </p>

          <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link
              href={`/${locale}/login`}
              className="group relative px-12 py-5 text-lg font-black text-white transition-all duration-500 ease-out rounded-xl overflow-hidden shadow-[0_0_20px_rgba(8,145,178,0.3)] hover:shadow-[0_0_40px_rgba(8,145,178,0.6)]"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-600 to-blue-700 group-hover:from-cyan-500 group-hover:to-blue-600 transition-all duration-500" />
              <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.2)_50%,transparent_75%)] bg-[length:250%_250%] group-hover:animate-[shimmer_2s_infinite] pointer-events-none" />
              <span className="relative z-10 flex items-center gap-2 w-48 justify-center">
                Start
                <IconArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </span>
            </Link>

            <button className="group relative px-12 py-5 text-lg font-bold text-cyan-400 border border-cyan-500/30 rounded-xl backdrop-blur-xl bg-white/5 hover:bg-cyan-500/10 transition-all duration-500 hover:border-cyan-400/60 hover:scale-105 active:scale-95">
              <span className="flex items-center gap-2 w-48 justify-center">
                Explore Ecosystem
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Decorative scan lines / grid effect */}
      <div className="absolute inset-0 z-20 pointer-events-none opacity-30 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.1)_50%),linear-gradient(90deg,rgba(255,0,0,0.03),rgba(0,255,0,0.01),rgba(0,0,255,0.03))] bg-[length:100%_4px,3px_100%]" />
      
      {/* Dynamic Data Stream (Mock) */}
      <div className="absolute right-10 top-1/2 -translate-y-1/2 flex flex-col gap-4 opacity-20 pointer-events-none hidden xl:flex">
        {[72, 51, 30, 24, 53].map((width, i) => (
          <div key={i} className="h-1 w-20 bg-cyan-500/40 rounded-full overflow-hidden">
            <div className={`h-full bg-cyan-400 animate-[scan_2s_linear_infinite] [animation-delay:${i * 0.4}s]`} style={{ width: `${width}%` }} />
          </div>
        ))}
      </div>
      
      {/* Bottom Glow */}
      <div className="absolute -bottom-48 left-1/2 -translate-x-1/2 w-[1000px] h-[500px] bg-cyan-500/20 blur-[150px] rounded-full z-10 pointer-events-none" />
    </div>
  );
}
