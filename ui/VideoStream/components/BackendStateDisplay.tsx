'use client';

import { useSystemStatus } from '../hooks/useSystemStatus';

type HealthState = 'OK' | 'WARN' | 'OFF' | 'ERROR';

export function BackendStateDisplay() {
  const { systemState, processState } = useSystemStatus();
  
  const getHealth = (state: string): HealthState => {
    if (state === 'IDLE' || state === 'RUNNING' || state === 'VIDEO_STREAMING_ON') return 'OK';

    if (
      state === 'THEIA_CORE_NOT_REACHABLE' ||
      state === 'BUS_NOT_AVAILABLE' ||
      state === 'ERROR'
    )
      return 'ERROR';

    if (
      state === 'INITIALIZING' ||
      state === 'CHECKING_COMMUNICATIONS' ||
      state === 'CHECKING_CAMERA' ||
      state === 'STREAM_REQUESTED'
    )
      return 'WARN';

    return 'OFF';
  };

  const health = getHealth(systemState);

  const getHealthStyles = (h: HealthState) => {
    switch (h) {
      case 'OK': 
        return {
          bg: 'bg-green-50/50 dark:bg-green-950/20',
          border: 'border-green-200 dark:border-green-900/50',
          text: 'text-green-600 dark:text-green-400',
          dot: 'bg-green-500'
        };
      case 'WARN':
        return {
          bg: 'bg-yellow-50/50 dark:bg-yellow-950/20',
          border: 'border-yellow-200 dark:border-yellow-900/50',
          text: 'text-yellow-600 dark:text-yellow-400',
          dot: 'bg-yellow-500'
        };
      case 'ERROR':
        return {
          bg: 'bg-red-50/50 dark:bg-red-950/20',
          border: 'border-red-200 dark:border-red-900/50',
          text: 'text-red-600 dark:text-red-400',
          dot: 'bg-red-500 animate-pulse'
        };
      case 'OFF':
      default:
        return {
          bg: 'bg-slate-50/50 dark:bg-slate-900/40',
          border: 'border-slate-200 dark:border-white/10',
          text: 'text-slate-500 dark:text-slate-400',
          dot: 'bg-slate-400'
        };
    }
  };

  const styles = getHealthStyles(health);

  return (
    <div className="flex flex-col gap-4">
      <div className={`grid grid-cols-1 md:grid-cols-3 gap-0 rounded-xl border shadow-sm transition-all duration-300 backdrop-blur-sm overflow-hidden ${styles.bg} ${styles.border}`}>
        
        {/* 1. System State */}
        <div className="flex flex-col p-4 border-b md:border-b-0 md:border-r border-slate-200/50 dark:border-white/5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">System State</span>
          <span className={`text-sm font-bold font-mono mt-1 truncate ${styles.text}`}>
            {systemState === 'THEIA_CORE_NOT_REACHABLE' ? 'THEIA CORE NOT REACHABLE' : (systemState === 'UNKNOWN' ? 'CONNECTING...' : systemState)}
          </span>
        </div>

        {/* 2. Run Connection */}
        <div className="flex flex-col p-4 border-b md:border-b-0 md:border-r border-slate-200/50 dark:border-white/5">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">Running State</span>
          <span className={`text-sm font-bold font-mono mt-1 truncate ${systemState === 'RUNNING' ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-slate-600'}`}>
            {/* {systemState === 'RUNNING' ? (runView?.state || 'WAITING...') : '---'} */}
            {processState}
          </span>
        </div>

        {/* 3. System Health */}
        <div className="flex flex-col p-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 leading-tight">System Health</span>
          <div className="flex items-center gap-2 mt-1">
             <div className={`w-2 h-2 rounded-full ${styles.dot}`} />
             <span className={`text-sm font-bold font-mono ${styles.text}`}>
                {health}
             </span>
          </div>
        </div>

      </div>
    </div>
  );
}
