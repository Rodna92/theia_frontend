'use client';

import { SystemCheckStatus } from '@/client/types/leakDetection';
import { IconCircleFilled, IconCheck, IconX, IconPlayerStop, IconPlayerPlay } from '@tabler/icons-react';
import { useState } from 'react';

interface SystemCheckCardProps {
  id?: string;
  label: string;
  status: SystemCheckStatus;
  command?: string;
  commandColor?: string;
  commandColorDark?: string;
  response?: string;
  responseColor?: string;
  responseColorDark?: string;
  ready?: boolean | null;
  allowedCommands?: string[];
  onStopInference?: () => Promise<void>;
  onStartNavInference?: () => Promise<void>;
  onStartPoseEstimationInference?: () => Promise<void>;
}

const statusConfig = {
  [SystemCheckStatus.OK]: {
    dot: 'text-emerald-600 dark:text-emerald-500',
    statusText: 'text-emerald-700 dark:text-emerald-400',
    surface: 'bg-white/40 dark:bg-slate-950/20',
    border: 'border-slate-200/40 dark:border-slate-700/40',
    ring: 'ring-slate-200/20 dark:ring-slate-700/20',
  },

  [SystemCheckStatus.WARN]: {
    dot: 'text-amber-600 dark:text-amber-500',
    statusText: 'text-amber-700 dark:text-amber-400',
    surface: 'bg-white/40 dark:bg-slate-950/20',
    border: 'border-slate-200/40 dark:border-slate-700/40',
    ring: 'ring-slate-200/20 dark:ring-slate-700/20',
  },

  [SystemCheckStatus.NOT_OK]: {
    dot: 'text-rose-600 dark:text-rose-500',
    statusText: 'text-rose-700 dark:text-rose-400',
    surface: 'bg-white/40 dark:bg-slate-950/20',
    border: 'border-slate-200/40 dark:border-slate-700/40',
    ring: 'ring-slate-200/20 dark:ring-slate-700/20',
  },

  [SystemCheckStatus.OFF]: {
    dot: 'text-slate-500 dark:text-slate-400',
    statusText: 'text-slate-700 dark:text-slate-400',
    surface: 'bg-white/40 dark:bg-slate-950/20',
    border: 'border-slate-200/40 dark:border-slate-700/40',
    ring: 'ring-slate-200/20 dark:ring-slate-700/20',
  },
};


export function SystemCheckCard({
  id,
  label,
  status,
  command,
  commandColor = 'text-slate-600 dark:text-slate-400',
  commandColorDark,
  response,
  responseColor = 'text-slate-600 dark:text-slate-400',
  responseColorDark,
  ready,
  allowedCommands,
  onStopInference,
  onStartNavInference,
  onStartPoseEstimationInference,
}: SystemCheckCardProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [isNavStarting, setIsNavStarting] = useState(false);
  const [isPoseStarting, setIsPoseStarting] = useState(false);
  const c = statusConfig[status];
  const cmdColor = commandColorDark ? `${commandColor} dark:${commandColorDark}` : commandColor;
  const respColor = responseColorDark ? `${responseColor} dark:${responseColorDark}` : responseColor;

  const showStopButton = (id?.toLowerCase() === 'vision') && allowedCommands?.includes('STOP_INFERENCE');
  const showStartButtons = (id?.toLowerCase() === 'vision') && allowedCommands?.includes('START_INFERENCE');

  const handleStopInference = async () => {
    if (!onStopInference) return;
    setIsStopping(true);
    try {
      await onStopInference();
    } catch (e) {
      console.error('Stop inference failed', e);
    } finally {
      setIsStopping(false);
    }
  };

  const handleStartNavInference = async () => {
    if (!onStartNavInference) return;
    setIsNavStarting(true);
    try {
      await onStartNavInference();
    } catch (e) {
      console.error('Start Nav inference failed', e);
    } finally {
      setIsNavStarting(false);
    }
  };

  const handleStartPoseInference = async () => {
    if (!onStartPoseEstimationInference) return;
    setIsPoseStarting(true);
    try {
      await onStartPoseEstimationInference();
    } catch (e) {
      console.error('Start Pose inference failed', e);
    } finally {
      setIsPoseStarting(false);
    }
  };

  const renderReadyIcon = () => {
    if (ready === true) return <IconCheck size={14} className="text-emerald-500" />;
    if (ready === false) return <IconX size={14} className="text-rose-500" />;
    return null;
  };

  const renderActions = () => {
    const actions = [];

    if (showStartButtons) {
      actions.push(
        <button
          key="start-nav-inference"
          onClick={handleStartNavInference}
          disabled={isNavStarting || isPoseStarting}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <IconPlayerPlay size={12} />
          {isNavStarting ? 'Starting Nav...' : 'Start Nav Inference'}
        </button>
      );
      actions.push(
        <button
          key="start-pose-inference"
          onClick={handleStartPoseInference}
          disabled={isNavStarting || isPoseStarting}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <IconPlayerPlay size={12} />
          {isPoseStarting ? 'Starting Pose...' : 'Start Pose Estimation Inference'}
        </button>
      );
    }

    if (showStopButton) {
      actions.push(
        <button
          key="stop-inference"
          onClick={handleStopInference}
          disabled={isStopping}
          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <IconPlayerStop size={12} />
          {isStopping ? 'Stopping...' : 'Stop Inference'}
        </button>
      );
    }

    if (actions.length === 0) return null;

    return (
      <div className="absolute bottom-full left-1/2 -translate-x-1/2 pb-3 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none group-hover:pointer-events-auto z-30 translate-y-1 group-hover:translate-y-0">
        <div className="flex flex-col gap-1 p-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/50 dark:border-slate-700/50 shadow-2xl ring-1 ring-black/5 dark:ring-white/5">
          {actions}
        </div>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 bg-white dark:bg-slate-900 border-r border-b border-slate-200/50 dark:border-slate-700/50" />
      </div>
    );
  };

  return (
    
    <div
      className={`
        group relative flex-1 min-w-[180px] rounded-xl p-3
        border ${c.border}
        ring-1 ring-inset ${c.ring}
        ${c.surface}
        backdrop-blur-sm
        transition-all duration-150
        hover:shadow-sm dark:hover:shadow-sm
      `}
    >
      {renderActions()}
      <div className="relative grid grid-cols-4 grid-rows-2 gap-2">
        <div className="col-start-1 col-span-3 row-start-1 flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </span>
          {renderReadyIcon()}
        </div>

        <div className="col-start-4  row-start-1 flex items-center justify-end gap-2">
          <IconCircleFilled size={10} className={`${c.dot}`} />
          <span className={`text-xs font-semibold uppercase tracking-wider ${c.statusText}`}>
            {status}
          </span>
        </div>

        {command && (
          <div className="col-start-1 col-span-2 row-start-2 text-xs font-mono text-right">
            <span className={cmdColor}>{command}</span>
          </div>
        )}

        <div className="col-start-3 col-span-2 row-start-2 text-xs font-mono text-right">
          <span className={response ? respColor : 'text-slate-400 dark:text-slate-600'}>
            {response || '-'}
          </span>
        </div>
      </div>
    </div>
    
  );
}
