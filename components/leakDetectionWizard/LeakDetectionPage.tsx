'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { ActionsPanel } from './components/ActionsPanel';
import { ProcessFlowGraph } from './components/ProcessFlowGraph';
import { VideoPanel } from './components/VideoPanel';
import { SystemStatePanel, SUBSYSTEM_IDS } from './components/SystemStatePanel';
import { useWorkcellState } from './hooks/useWorkcellState';
import {
  ProcessStepState,
  SystemCheckStatus,
  type LeakDetectionFlowStep,
  type LeakDetectionSystemStatus,
} from '@/client/types/leakDetection';

// Monitor of the leak-detection workcell. The process itself is run by the modules (robotics
// orchestrator, vision, end effector, leak equipment) and is requested by the external machine;
// this page shows what they are doing and offers Start / Stop / Test on top. It is never needed
// for the workcell to work.
export function LeakDetectionPage() {
  const t = useTranslations('leakDetection');
  const { snapshot, pending, commandError, send } = useWorkcellState();
  const { bridge, systemState, cycle } = snapshot;

  const flowSteps = useMemo<LeakDetectionFlowStep[]>(() => {
    const { IDLE, RUNNING, DONE, ERROR } = ProcessStepState;
    if (systemState === 'STOPPED') {
      return [{ id: 'stopped', label: t('monitor.steps.stopped'), state: ERROR }];
    }
    const inCycle = systemState === 'BUSY' && cycle !== null;
    const steps: LeakDetectionFlowStep[] = [
      {
        id: 'init',
        label: t('monitor.steps.init'),
        state: systemState === 'BUSY' && !cycle ? RUNNING : systemState === 'IDLE' || inCycle ? DONE : IDLE,
      },
      {
        id: 'waiting',
        label: t('monitor.steps.waiting'),
        state: systemState === 'IDLE' ? RUNNING : inCycle ? DONE : IDLE,
      },
      {
        id: 'cycle',
        label: cycle
          ? `${t('monitor.steps.cycle')} · ${t('monitor.steps.target', { current: cycle.target, total: cycle.nTargets })}`
          : t('monitor.steps.cycle'),
        state: inCycle ? RUNNING : IDLE,
      },
    ];
    return steps;
  }, [systemState, cycle, t]);

  // Entries of the Configure dialog (it only uses id and label).
  const configurable = useMemo<LeakDetectionSystemStatus[]>(
    () => SUBSYSTEM_IDS.map((id) => ({ id, label: t(`monitor.checks.${id}`), status: SystemCheckStatus.OFF })),
    [t]
  );

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3 flex flex-col gap-6">
          <VideoPanel available={bridge} />
          <SystemStatePanel snapshot={snapshot} />
        </div>

        <div className="space-y-6">
          <div>
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
              {t('headings.actions')}
            </h2>
            <ActionsPanel
              systemStatus={configurable}
              systemState={bridge ? systemState : 'UNKNOWN'}
              pending={pending}
              onCommand={(command) => void send(command)}
            />
            {commandError && (
              <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                {t('monitor.commandFailed')}: {commandError}
              </div>
            )}
          </div>

          {bridge && systemState !== 'UNKNOWN' && systemState !== 'TEST' && (
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                {t('headings.processFlow')}
              </h2>
              <div className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-slate-800/70 dark:bg-slate-950/40 backdrop-blur p-3">
                <ProcessFlowGraph steps={flowSteps} />
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
