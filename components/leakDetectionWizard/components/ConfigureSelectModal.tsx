'use client';

import { useTranslations } from 'next-intl';
import { LeakDetectionSystemStatus } from '@/client/types/leakDetection';
import { IconX, IconCircleFilled } from '@tabler/icons-react';

interface ConfigureSelectModalProps {
  systemStatus: LeakDetectionSystemStatus[];
  onSelectItem: (id: string, label: string) => void;
  onClose: () => void;
}

export function ConfigureSelectModal({
  systemStatus,
  onSelectItem,
  onClose,
}: ConfigureSelectModalProps) {
  const t = useTranslations();

  return (
    <div className="w-full max-w-md bg-white/70 dark:bg-slate-950/60 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-2xl backdrop-blur-xl p-8 transition-all duration-200">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {t('leakDetection.configure.selectTitle')}
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <IconX size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
        {t('leakDetection.configure.selectDescription')}
      </p>

      <div className="grid grid-cols-2 gap-4">
        {systemStatus.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelectItem(item.id, item.label)}
            className="group relative p-4 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 hover:bg-white/60 dark:hover:bg-slate-800/50 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5 hover:ring-cyan-500/20 dark:hover:ring-cyan-500/30 transition-all duration-200 text-left"
          >
            <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-green-400/20 dark:from-cyan-500/20 dark:to-green-500/20 flex items-center justify-center">
                <IconCircleFilled
                  size={12}
                  className="text-cyan-600 dark:text-cyan-400"
                />
              </div>
              <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
                {item.label}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {t('leakDetection.configure.clickToConfig')}
            </p>
          </button>
        ))}

        {/* Process Configuration Item */}
        <button
          onClick={() => onSelectItem('process', t('leakDetection.configure.process.title'))}
          className="group relative p-4 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 hover:bg-white/60 dark:hover:bg-slate-800/50 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5 hover:ring-cyan-500/20 dark:hover:ring-cyan-500/30 transition-all duration-200 text-left"
        >
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400/20 to-green-400/20 dark:from-cyan-500/20 dark:to-green-500/20 flex items-center justify-center">
              <IconCircleFilled
                size={12}
                className="text-cyan-600 dark:text-cyan-400"
              />
            </div>
            <span className="font-semibold text-slate-700 dark:text-slate-200 text-sm group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
              {t('leakDetection.configure.process.title')}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {t('leakDetection.configure.clickToConfig')}
          </p>
        </button>
      </div>

      <div className="mt-6 pt-4 border-t border-slate-200/50 dark:border-white/5">
        <button
          onClick={onClose}
          className="w-full py-2 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          {t('leakDetection.actions.cancel')}
        </button>
      </div>
    </div>
  );
}
