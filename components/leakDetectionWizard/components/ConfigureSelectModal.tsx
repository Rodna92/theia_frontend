'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { LeakDetectionSystemStatus } from '@/client/types/leakDetection';
import { IconX, IconEye, IconRobot, IconGauge, IconAdjustmentsHorizontal, IconSettings } from '@tabler/icons-react';
import { EndEffectorIcon } from '../eeTypeTrajectory/EndEffectorIcon';

interface ConfigureSelectModalProps {
  systemStatus: LeakDetectionSystemStatus[];
  onSelectItem: (id: string, label: string) => void;
  onClose: () => void;
}

const itemIcons: Record<string, ReactNode> = {
  vision: <IconEye size={18} />,
  robot: <IconRobot size={18} />,
  endeffector: <EndEffectorIcon size={18} />,
  leakEquipment: <IconGauge size={18} />,
  process: <IconAdjustmentsHorizontal size={18} />,
};

export function ConfigureSelectModal({
  systemStatus,
  onSelectItem,
  onClose,
}: ConfigureSelectModalProps) {
  const t = useTranslations();

  const items = [
    ...systemStatus.map((item) => ({ id: item.id, label: item.label })),
    { id: 'process', label: t('leakDetection.configure.process.title') },
  ];

  return (
    <div className="w-full max-w-2xl sm:max-w-3xl lg:max-w-5xl 2xl:max-w-6xl 3xl:max-w-7xl bg-white/70 dark:bg-slate-950/60 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-8 border-b border-slate-200/50 dark:border-white/5">
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('leakDetection.configure.selectTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
            {t('leakDetection.configure.selectDescription')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <IconX size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 grid grid-cols-1 sm:grid-cols-2 gap-6 content-start">
        {items.map((item) => (
          <div
            key={item.id}
            className="flex flex-col p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5"
          >
            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
              {item.label}
            </h3>
            {t.has(`leakDetection.configure.items.${item.id}`) && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t(`leakDetection.configure.items.${item.id}`)}
              </p>
            )}
            <button
              type="button"
              onClick={() => onSelectItem(item.id, item.label)}
              className="mt-auto self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
            >
              {itemIcons[item.id] ?? <IconSettings size={18} />}
              {t('leakDetection.actions.configure')}
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-slate-200/50 dark:border-white/5 p-6 bg-white/30 dark:bg-slate-900/20 flex justify-end">
        <button
          onClick={onClose}
          className="py-2 px-4 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          {t('leakDetection.actions.cancel')}
        </button>
      </div>
    </div>
  );
}
