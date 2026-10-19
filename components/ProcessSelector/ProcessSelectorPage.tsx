'use client';

import { useTranslations, useLocale } from 'next-intl';
import { IconListNumbers } from '@tabler/icons-react';
import { IconLeakDetectionArm, IconFluidDoserArm } from '@/components/icons/ProcessIcons';
import { ProcessCard } from './ProcessCard';

export function ProcessSelectorPage() {
  const t = useTranslations();
  const locale = useLocale();

  return (
    // Fills exactly the viewport below the 64px navbar; desktop spacing scales with viewport height
    <div className="flex min-h-[calc(100svh-4rem)] items-center justify-center px-4 py-3 xs:py-8 phone-short:py-3 sm:px-6 sm:py-10 lg:px-8 lg:py-[5vh]">
      <div className="w-full max-w-md sm:max-w-2xl lg:max-w-6xl 2xl:max-w-7xl 3xl:max-w-[1600px] mx-auto">
        <div className="text-center mb-4 xs:mb-8 phone-short:mb-4 sm:mb-10 lg:mb-[6vh]">
          <h1 className="text-[1.75rem] xs:text-4xl phone-short:text-[1.75rem] md:text-5xl 3xl:text-6xl font-bold tracking-tight leading-tight text-slate-900 dark:bg-gradient-to-r dark:from-cyan-400 dark:to-blue-400 dark:bg-clip-text dark:text-transparent mb-2 sm:mb-3 lg:mb-4">
            {t('processes.hero.title')}
          </h1>
          <p className="text-sm xs:text-base sm:text-lg 3xl:text-xl text-slate-600 dark:text-slate-300">
            {t('processes.hero.subtitle')}
          </p>
          <div className="mx-auto mt-3 xs:mt-4 lg:mt-5 h-1 w-12 rounded-full bg-gradient-to-r from-cyan-500 to-blue-600" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 xs:gap-4 sm:gap-5 lg:gap-6 2xl:gap-8 3xl:gap-10">
          <ProcessCard
            title={t('processes.cards.leakDetection.title')}
            description={t('processes.cards.leakDetection.description')}
            icon={<IconLeakDetectionArm />}
            href={`/${locale}/process/leak-detection`}
            badge={t('common.create')}
          />

          <ProcessCard
            title={t('processes.cards.fluidDoser.title')}
            description={t('processes.cards.fluidDoser.description')}
            icon={<IconFluidDoserArm />}
            href={`/${locale}/process/fluid-doser`}
            badge={t('common.create')}
          />

          <ProcessCard
            title={t('processes.cards.sequenceOfProcess.title')}
            description={t('processes.cards.sequenceOfProcess.description')}
            icon={<IconListNumbers />}
            href={`/${locale}/process/sequence-of-process`}
            badge={t('common.create')}
          />
        </div>
      </div>
    </div>
  );
}
