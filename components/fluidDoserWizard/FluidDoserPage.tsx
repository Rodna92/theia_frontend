'use client';

import { useMemo } from 'react';
import { ActionsPanel, ProcessState } from './components/ActionsPanel';
import { ProcessFlowGraph } from './components/ProcessFlowGraph';
import { VideoStreamPanel } from '@/ui/VideoStream/components/VideoStreamPanel';
import { ScrollableContainer } from '@/ui/ScrollableContainer';
import { useFluidDoserCommanderHook } from './hooks/useFluidDoserCommanderHook';
import { useTranslations } from 'next-intl';
// Import the Enum for status checks
import { ProcessStepState } from '@/client/types/fluidDoser'; 

export function FluidDoserPage() {
  const t = useTranslations();

  const {
    runId,
    systemStatus,
    flowSteps,
    latency,

    // stream
    videoRef,
    status, // WebRTC Status (idle/connecting/connected/error)
    metrics,
    onConnect,
    onReconnect,

    // process
    startProcess,
    stopProcess,
    resetProcess,
    processError,
  } = useFluidDoserCommanderHook();

  // --- DERIVE PROCESS STATE ---
  const processState: ProcessState = useMemo(() => {
    // Safety check
    if (!flowSteps || flowSteps.length === 0) {
      return 'idle';
    }

    // 1. IDLE: Check if every step is IDLE
    const isAllIdle = flowSteps.every((step) => step.state === ProcessStepState.IDLE);
    if (isAllIdle) {
      return 'idle';
    }

    // 2. FINISHED:
    //    a) If ANY step has ERROR, the process stopped.
    //    b) If ALL steps are DONE, the process finished successfully.
    const hasError = flowSteps.some((step) => step.state === ProcessStepState.ERROR);
    const isAllComplete = flowSteps.every((step) => step.state === ProcessStepState.DONE);

    if (hasError || isAllComplete) {
      return 'finished';
    }

    // 3. RUNNING:
    //    If it's not strictly idle and not finished, it's running.
    return 'running';
  }, [flowSteps]);

  // Only show the graph if we are NOT in idle
  const showProcessGraph = processState !== 'idle';

  return (
    <div className="">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          
          {/* LEFT: Video Panel */}
          <div className="lg:col-span-3">
            <VideoStreamPanel
              runId={runId}
              checks={systemStatus}
              latency={latency}
              videoRef={videoRef}
              status={status}
              metrics={metrics}
              streamName="fluid-doser"
              onConnect={onConnect}
              onReconnect={onReconnect}
            />
          </div>

          {/* RIGHT: Actions & Process Graph */}
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                {t('fluidDoser.headings.actions')}
              </h2>

              <ActionsPanel
                systemStatus={systemStatus}
                processState={processState}
                onStart={() => {
                  onReconnect();
                  // startProcess with 2 iterations (standard for fluid doser demo)
                  void startProcess(2);
                }}
                onTest={() => {
                  onReconnect();
                  // Test run with single iteration
                  void startProcess(1);
                }}
                onStop={stopProcess}
                onReset={resetProcess}
              />

              {processError && (
                <div className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {processError.message}
                </div>
              )}
            </div>

            {/* Conditionally show Graph based on derived process state */}
            {showProcessGraph && (
              <div className="animate-in fade-in slide-in-from-top-4 duration-500">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                  {t('fluidDoser.headings.processFlow')}
                </h2>

                <div className="rounded-xl border border-slate-200/60 bg-white/60 dark:border-slate-800/70 dark:bg-slate-950/40 backdrop-blur p-3">
                  <ScrollableContainer className="max-h-[42vh] pr-2">
                    <ProcessFlowGraph steps={flowSteps} />
                  </ScrollableContainer>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}