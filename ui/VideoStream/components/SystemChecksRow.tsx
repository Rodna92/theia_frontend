'use client';

import { LeakDetectionSystemStatus } from '@/client/types/leakDetection';
import { SystemCheckCard } from './SystemCheckCard';

interface SystemChecksRowProps {
  checks: LeakDetectionSystemStatus[];
  allowedCommands?: string[];
  onStopInference?: () => Promise<void>;
  onStartNavInference?: () => Promise<void>;
  onStartPoseEstimationInference?: () => Promise<void>;
}

export function SystemChecksRow({ 
  checks, 
  allowedCommands, 
  onStopInference, 
  onStartNavInference,
  onStartPoseEstimationInference 
}: SystemChecksRowProps) {
  return (
    <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-1 xs:gap-2 md:gap-3 justify-center w-full">
      {checks.map((check) => (
        <SystemCheckCard
          key={check.id}
          id={check.id}
          label={check.label}
          status={check.status}
          ready={check.ready}
          response={check.details ?? undefined}
          allowedCommands={allowedCommands}
          onStopInference={onStopInference}
          onStartNavInference={onStartNavInference}
          onStartPoseEstimationInference={onStartPoseEstimationInference}
        />
      ))}
    </div>
  );
}
