'use client';

import { useTranslations, useLocale } from 'next-intl';
import { IconBolt, IconRobot, IconHierarchy } from '@tabler/icons-react';
import { ProcessCard } from './ProcessCard';

export function ProcessSelectorPage() {
  const t = useTranslations();
  const locale = useLocale();

  return (
    <div className="min-h-[calc(100vh-36px])] ">
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-40px])] px-4 py-20">
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center mb-16">
            <h1 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-cyan-600 to-blue-600 dark:from-cyan-400 dark:to-blue-400 bg-clip-text text-transparent mb-4">
              {t('processes.hero.title')}
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-300">
              {t('processes.hero.subtitle')}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <ProcessCard
              title={t('processes.cards.leakDetection.title')}
              description={t('processes.cards.leakDetection.description')}
              icon={<IconBolt size={32} />}
              href={`/${locale}/process/leak-detection`}
            />

            <ProcessCard
              title={t('processes.cards.fluidDoser.title')}
              description={t('processes.cards.fluidDoser.description')}
              icon={<IconRobot size={32} />}
              href={`/${locale}/process/fluid-doser`}
            />

            <ProcessCard
              title={t('processes.cards.sequenceOfProcess.title')}
              description={t('processes.cards.sequenceOfProcess.description')}
              icon={<IconHierarchy size={32} />}
              href={`/${locale}/process/sequence-of-process`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
