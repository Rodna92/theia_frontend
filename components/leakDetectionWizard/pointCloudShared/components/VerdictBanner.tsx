'use client';

import { useTranslations } from 'next-intl';
import { ParsedVerdict } from '../transformsParser';

interface VerdictBannerProps {
  verdict: ParsedVerdict | null;
}

function resultColorClasses(result: string): string {
  const normalized = result.toUpperCase();
  if (normalized === 'ACCEPTED') return 'text-emerald-400';
  if (normalized === 'REJECTED') return 'text-rose-400';
  return 'text-amber-400';
}

export function VerdictBanner({ verdict }: VerdictBannerProps) {
  const t = useTranslations();

  if (!verdict) return null;

  return (
    <div className="absolute top-0 left-0 right-0 p-3 bg-gradient-to-b from-black/70 to-transparent flex justify-center pointer-events-none">
      <div className="flex items-center gap-4 px-4 py-1.5 rounded-lg bg-black/40 backdrop-blur border border-white/10 text-xs font-mono">
        <span className="text-white/80">
          {t('leakDetection.pointCloud.verdictMode')}:{' '}
          <span className="text-white font-semibold">{verdict.mode}</span>
        </span>
        <span className="text-white/80">
          {t('leakDetection.pointCloud.verdictFitness')}:{' '}
          <span className="text-white font-semibold">
            {verdict.bestFitness.toFixed(6)} / {verdict.minFitness.toFixed(6)}
          </span>
        </span>
        <span className="text-white/80">
          {t('leakDetection.pointCloud.verdictResult')}:{' '}
          <span className={`font-semibold ${resultColorClasses(verdict.result)}`}>
            {verdict.result}
          </span>
        </span>
      </div>
    </div>
  );
}
