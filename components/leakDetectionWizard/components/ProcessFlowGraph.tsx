'use client';

import { LeakDetectionFlowStep, ProcessStepState } from '@/client/types/leakDetection';
import {
  IconCircleCheck,
  IconLoader2,
  IconCircle,
  IconAlertCircle,
} from '@tabler/icons-react';

interface ProcessFlowGraphProps {
  steps: LeakDetectionFlowStep[];
}

const stateConfig = {
  [ProcessStepState.DONE]: {
    bgColor: 'bg-green-500/10 dark:bg-green-500/10',
    borderColor: 'border-green-600/20 dark:border-green-500/40',
    textColor: 'text-green-700 dark:text-green-400',
    icon: IconCircleCheck,
  },
  [ProcessStepState.RUNNING]: {
    bgColor: 'bg-cyan-500/10 dark:bg-cyan-500/10',
    borderColor: 'border-cyan-400/30 dark:border-cyan-500/40',
    textColor: 'text-cyan-600 dark:text-cyan-400',
    icon: IconLoader2,
  },
  [ProcessStepState.IDLE]: {
    bgColor: 'bg-slate-100/60 dark:bg-slate-800/40',
    borderColor: 'border-slate-200/40 dark:border-slate-600/40',
    textColor: 'text-slate-700 dark:text-slate-400',
    icon: IconCircle,
  },
  [ProcessStepState.ERROR]: {
    bgColor: 'bg-red-500/10 dark:bg-red-500/10',
    borderColor: 'border-red-500/30 dark:border-red-500/40',
    textColor: 'text-red-600 dark:text-red-400',
    icon: IconAlertCircle,
  },
};

export function ProcessFlowGraph({ steps }: ProcessFlowGraphProps) {
  return (
    <div className="space-y-2">
      {steps.map((step, index) => {
        const config = stateConfig[step.state];
        const Icon = config.icon;

        return (
          <div key={step.id} className="space-y-0">
            <div
              className={`rounded-lg p-4 border ${config.bgColor} ${config.borderColor} flex items-center gap-3 transition-all duration-300`}
            >
              <Icon
                size={20}
                className={`${config.textColor} flex-shrink-0 ${
                  step.state === ProcessStepState.RUNNING ? 'animate-spin' : ''
                }`}
              />
              <span className={`text-sm font-medium ${config.textColor}`}>
                {step.label}
              </span>
            </div>

            {index < steps.length - 1 && (
              <div className="flex justify-center py-1">
                <div className="w-0.5 h-2 bg-gradient-to-b from-slate-600/80 to-slate-700/80 dark:from-slate-600/40 dark:to-slate-700/40"></div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
