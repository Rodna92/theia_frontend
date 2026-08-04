'use client';

import { useTranslations } from 'next-intl';

interface TransformsPanelProps {
  transformsText: string | null;
}

export function TransformsPanel({ transformsText }: TransformsPanelProps) {
  const t = useTranslations();

  if (!transformsText) {
    return null;
  }

  return (
    <div className="p-4 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30">
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
        {t('fluidDoser.pointCloud.transformsTitle')}
      </h3>
      <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words max-h-64 overflow-y-auto font-mono bg-slate-100/50 dark:bg-slate-950/40 rounded-md p-3">
        {transformsText}
      </pre>
    </div>
  );
}
