'use client';

import { useTranslations, useLocale } from 'next-intl';
import { IconX, IconChevronLeft, IconCube3dSphere, IconPlayerPlay, IconAdjustments, IconSearch, IconBolt, IconAlertTriangle, IconSettings, IconTarget } from '@tabler/icons-react';
import Link from 'next/link';
import { EndEffectorIcon } from '../eeTypeTrajectory/EndEffectorIcon';

interface ConfigureDetailsModalProps {
  selectedItemId: string | null;
  selectedItemLabel: string;
  onClose: () => void;
  onBack: () => void;
}

export function ConfigureDetailsModal({
  selectedItemId,
  selectedItemLabel,
  onClose,
  onBack,
}: ConfigureDetailsModalProps) {
  const t = useTranslations();
  const locale = useLocale();
  const isProcess = selectedItemId === 'process';
  const isVision = selectedItemId === 'vision';

  return (
    <div className="w-full max-w-2xl bg-white/70 dark:bg-slate-950/60 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-8 border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Go back"
          >
            <IconChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {selectedItemLabel}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {t('leakDetection.configure.configurationTitle')}
            </p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label="Close"
        >
          <IconX size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        {isProcess ? (
          <>
            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.process.searchingSetup.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.process.searchingSetup.description')}
              </p>
              <Link
                href={`/${locale}/process/leak-detection/search-configuration`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                <IconSearch size={18} />
                {t('leakDetection.configure.process.searchingSetup.open')}
              </Link>
            </div>

            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.process.automations.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.process.automations.description')}
              </p>
              <button type="button" disabled className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 dark:text-slate-500 text-sm font-medium cursor-not-allowed">
                <IconBolt size={18} />
                {t('leakDetection.configure.comingSoon')}
              </button>
            </div>

            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.process.errorHandling.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.process.errorHandling.description')}
              </p>
              <button type="button" disabled className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 dark:text-slate-500 text-sm font-medium cursor-not-allowed">
                <IconAlertTriangle size={18} />
                {t('leakDetection.configure.comingSoon')}
              </button>
            </div>
          </>
        ) : isVision ? (
          <>
            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.vision.params.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.vision.params.description')}
              </p>
              <Link
                href={`/${locale}/process/leak-detection/vision-params`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                <IconAdjustments size={18} />
                {t('leakDetection.configure.vision.params.open')}
              </Link>
            </div>

            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.vision.configuration.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.vision.configuration.description')}
              </p>
              <Link
                href={`/${locale}/process/leak-detection/cloud-point-configuration`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                <IconCube3dSphere size={18} />
                {t('leakDetection.configure.vision.configuration.openViewer')}
              </Link>
            </div>

            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.vision.replay.title')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.vision.replay.description')}
              </p>
              <Link
                href={`/${locale}/process/leak-detection/cloud-point-replay`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                <IconPlayerPlay size={18} />
                {t('leakDetection.configure.vision.replay.openReplay')}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">
                {t('leakDetection.configure.endEffectorTitle')}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                {t('leakDetection.configure.endEffectorSubtitle')}
              </p>
              <Link
                href={`/${locale}/process/leak-detection/ee-type-trajectory`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium"
              >
                <EndEffectorIcon size={18} />
                {t('leakDetection.configure.endEffectorOpen')}
              </Link>
            </div>

            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                {t('leakDetection.configure.advancedSettings')}
              </h3>
              <button type="button" disabled className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 dark:text-slate-500 text-sm font-medium cursor-not-allowed">
                <IconSettings size={18} />
                {t('leakDetection.configure.comingSoon')}
              </button>
            </div>

            <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4">
                {t('leakDetection.configure.calibration')}
              </h3>
              <button type="button" disabled className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200/70 dark:border-white/10 text-slate-400 dark:text-slate-500 text-sm font-medium cursor-not-allowed">
                <IconTarget size={18} />
                {t('leakDetection.configure.comingSoon')}
              </button>
            </div>
          </>
        )}
      </div>

      <div className="border-t border-slate-200/50 dark:border-white/5 p-6 bg-white/30 dark:bg-slate-900/20 flex gap-3 justify-end">
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
        >
          {t('leakDetection.configure.back')}
        </button>
        <button
          onClick={onClose}
          className="px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 dark:from-cyan-500/20 dark:to-green-500/20 border border-cyan-500/30 dark:border-cyan-500/40 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 dark:hover:bg-cyan-500/30 transition-colors text-sm font-medium"
        >
          {t('leakDetection.configure.save')}
        </button>
      </div>
    </div>
  );
}
