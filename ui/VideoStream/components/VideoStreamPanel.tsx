'use client';

import { useMemo, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { SystemChecksRow } from './SystemChecksRow';
import { BackendStateDisplay } from './BackendStateDisplay';
import { useSystemStatus } from '../hooks/useSystemStatus';
import { LeakDetectionSystemStatus, SystemCheckStatus } from '@/client/types/leakDetection';
import { SubsystemStatus } from '@/client/types/run';
import type { StreamStatus } from "@/client/types/media";
import type { WhepMetrics } from "../hooks/useWhepPlayer";
import { VisionOverlay } from './VisionOverlay';
import { BACKEND_URL } from '@/client/config';

const TENANT_ID = '00000000-0000-0000-0000-000000000000';

interface VideoStreamPanelProps {
  runId: string | null;
  checks: LeakDetectionSystemStatus[];
  latency: number;
  streamName?: string;

  videoRef: React.RefObject<HTMLVideoElement | null>;
  status: StreamStatus;
  metrics: WhepMetrics;
  systemState?: string;

  onConnect: () => void;
  onReconnect: () => void;
}

export function VideoStreamPanel({
  runId,
  checks,
  videoRef,
  status,
  metrics,
  systemState: propsSystemState,
  streamName,
  onConnect,
  onReconnect,
}: VideoStreamPanelProps) {
  const t = useTranslations();
  const { systemState: hookSystemState, lastRawMessage: systemRaw, runView, processState } = useSystemStatus();
  const systemState = propsSystemState || hookSystemState;

  const handleStopInference = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs/${runId}/stop-inference`, {
        method: 'POST',
        headers: {
          'X-Tenant-ID': TENANT_ID,
        },
      });
      if (!res.ok) {
        throw new Error(`Failed to stop inference: ${res.statusText}`);
      }
    } catch (err) {
      console.error('Error stopping inference:', err);
      throw err;
    }
  }, [runId]);

  const handleStartNavInference = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs/${runId}/trigger/START_INFERENCE`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TENANT_ID,
        },
        body: JSON.stringify({
          processType: runView?.processType || "LEAK_DETECTION",
          routine: "NAVIGATION_HANSEN",
          routineVersion: 1
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to start Nav inference: ${res.statusText}`);
      }
    } catch (err) {
      console.error('Error starting Nav inference:', err);
      throw err;
    }
  }, [runId, runView?.processType]);

  const handleStartPoseEstimationInference = useCallback(async () => {
    if (!runId) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs/${runId}/trigger/START_INFERENCE`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tenant-ID': TENANT_ID,
        },
        body: JSON.stringify({
          processType: runView?.processType || "LEAK_DETECTION",
          routine: "POSE_ESTIMATION_HANSEN",
          routineVersion: 1
        }),
      });
      if (!res.ok) {
        throw new Error(`Failed to start Pose inference: ${res.statusText}`);
      }
    } catch (err) {
      console.error('Error starting Pose inference:', err);
      throw err;
    }
  }, [runId, runView?.processType]);

  // Merge backend subsystems into checks
  const mergedChecks = useMemo(() => {
    const subsystems = runView?.subsystems;
    if (!subsystems) return checks;

    const backendMapping: Record<string, string> = {
      VISION: 'vision',
      COBOT: 'robot',
      ENDEFFECTOR: 'endeffector',
      LEAK_EQUIPMENT: 'leakEquipment',
    };

    return checks.map((check) => {
      const backendSubsystem = subsystems.find(
        (s: SubsystemStatus) => backendMapping[s.subsystem] === check.id || s.subsystem === check.id
      );

      if (backendSubsystem) {
        return {
          ...check,
          status: (backendSubsystem.status as SystemCheckStatus) || check.status,
          ready: backendSubsystem.ready,
          details: backendSubsystem.details,
        };
      }
      return check;
    });
  }, [checks, runView?.subsystems]);

  // Status Helpers (Colors/Labels)
  const statusColor = {
    idle: 'bg-slate-400',
    connecting: 'bg-yellow-500 animate-pulse',
    connected: 'bg-green-500 animate-pulse',
    error: 'bg-red-500 animate-pulse',
  }[status.state];

  const statusLabel = {
    idle: t('leakDetection.status.idle'),
    connecting: t('leakDetection.status.connecting'),
    connected: t('leakDetection.status.live'),
    error: t('leakDetection.status.error'),
  }[status.state];

  const statusLabelColor = {
    idle: 'text-slate-600 dark:text-slate-400',
    connecting: 'text-yellow-600 dark:text-yellow-400',
    connected: 'text-green-600 dark:text-green-400',
    error: 'text-red-600 dark:text-red-400',
  }[status.state];

  const borderColor = {
    idle: 'border-slate-500/30',
    connecting: 'border-yellow-500/30',
    connected: 'border-green-500/30',
    error: 'border-red-500/30',
  }[status.state];

  const darkBorderColor = {
    idle: 'dark:border-slate-500/40',
    connecting: 'dark:border-yellow-500/40',
    connected: 'dark:border-green-500/40',
    error: 'dark:border-red-500/40',
  }[status.state];

  return (
    <div className="flex flex-col gap-6">
      <div className="relative rounded-2xl overflow-hidden bg-white/70 border border-slate-200/70 shadow-sm dark:bg-slate-900/60 dark:border-white/10">
        <div className="aspect-video flex items-center justify-center relative bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:bg-gradient-to-br dark:from-slate-800 dark:to-slate-900">
          <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(148,163,184,0.10)_0%,rgba(148,163,184,0.10)_25%,rgba(15,23,42,.06)_25%,rgba(15,23,42,.06)_50%,rgba(148,163,184,0.10)_50%,rgba(148,163,184,0.10)_75%,rgba(15,23,42,.06)_75%,rgba(15,23,42,.06)_100%)] dark:bg-[linear-gradient(45deg,transparent_25%,rgba(0,0,0,.1)_25%,rgba(0,0,0,.1)_50%,transparent_50%,transparent_75%,rgba(0,0,0,.1)_75%,rgba(0,0,0,.1))] bg-[length:40px_40px]" />

          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={[
              'absolute inset-0 w-full h-full rounded-xl object-cover transition-opacity duration-200',
              status.state === 'connected' ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          />

          {/* ✅ Always mount overlay when connected. Do not check metadataAvailable. */}
          {status.state === 'connected' && (
            <VisionOverlay 
              videoRef={videoRef}
              currentVideoTimestamp={metrics.timestamp}
              streamName={streamName || "leak-detection"}
              statsWindowSize={40}
            />
          )}

          {/* Connection/Idle States */}
          {(status.state === 'connecting' || status.state === 'idle') && (
            <div className="relative z-10 animate-pulse flex flex-col items-center gap-4">
              <div className="text-slate-600 font-mono text-sm dark:text-slate-400 text-center">
                {systemState === 'CHECKING_CAMERA' ? 'Checking camera health...' :
                 systemState === 'STREAM_REQUESTED' ? 'Opening video stream...' :
                 status.state === 'connecting'
                  ? t('leakDetection.status.connecting')
                  : t('leakDetection.status.overlay')}
              </div>
              {status.state === 'idle' && systemState === 'IDLE' && (
                <button
                  onClick={onConnect}
                  className="relative z-10 px-4 py-2 rounded-lg bg-slate-900/10 hover:bg-slate-900/15 text-slate-700 text-xs font-semibold backdrop-blur dark:bg-white/10 dark:hover:bg-white/15 dark:text-slate-200 transition"
                >
                  Connect
                </button>
              )}
            </div>
          )}      

          {/* Error State */}
          {(status.state === 'error' || systemState === 'ERROR') && (
            <div className="relative z-10 text-center px-4">
              <div className="text-red-600 dark:text-red-400 font-mono text-sm mb-3">
                {systemState === 'ERROR' ? 'Camera not available' : (status.error || t('leakDetection.status.error'))}
              </div>
              <button
                onClick={() => onReconnect()}
                className="px-4 py-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-600 dark:text-red-400 text-xs font-semibold transition-colors"
              >
                {t('leakDetection.actions.retry')}
              </button>
            </div>
          )}
        </div>

        {/* Left Status Pill */}
        <div
          className={`absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border ${borderColor} shadow-sm backdrop-blur-xl ${darkBorderColor}`}
        >
          <div className={`w-2 h-2 rounded-full ${statusColor}`} />
          <span className={`text-xs font-semibold tracking-wide ${statusLabelColor}`}>
            {statusLabel}
          </span>

          {status.state === 'connected' && (
            <span className="text-xs text-slate-400">
              {metrics.freezeMs}ms
            </span>
          )}
          
        </div>

        {/* Right Metrics Pill + Tooltip */}
        {status.state === 'connected' && (
          <div className="absolute top-4 right-4 z-20 group flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-slate-500/70 shadow-sm backdrop-blur-xl dark:border-white/10">
            {typeof metrics.fps === 'number' && (
              <span className="text-xs font-mono text-slate-200">
                {metrics.fps.toFixed(1)} FPS
              </span>
            )}
            {typeof metrics.rttMs === 'number' && (
              <span className="text-xs font-mono text-slate-400">
                RTT {metrics.rttMs}ms
              </span>
            )}
            {typeof metrics.bitrateKbps === 'number' && (
              <span className="text-xs font-mono text-slate-400">
                {metrics.bitrateKbps} kbps
              </span>
            )}

            <span
              className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-200/70 text-slate-300 dark:border-white/10"
              aria-label="Metrics info"
            >
              i
            </span>

            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-150 absolute right-0 top-full mt-2 w-[260px] p-3 rounded-xl bg-white/90 border border-slate-200/70 shadow-lg backdrop-blur text-xs text-slate-700 dark:bg-slate-950/90 dark:border-white/10 dark:text-slate-200 z-50">
              <div className="font-semibold mb-1">About these numbers</div>
              <div className="flex flex-col text-slate-600 dark:text-slate-400 leading-snug">
                <span>- FPS: Browser rendered FPS.</span> 
                <span>- RTT: Network round-trip time.</span>
              </div>
              {typeof metrics.freezeMs === 'number' && (
                <div className="mt-2 text-slate-600 dark:text-slate-400">
                  Last frame: {metrics.freezeMs}ms ago
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {/* {t('leakDetection.status.systemStatus')} */}
          {/* {(metadataConnectionStatus === 'CONNECTING' || metadataConnectionStatus === 'CLOSED') && (<div>{metadataConnectionStatus}</div>)} */}
        </h3>
        <BackendStateDisplay />
        <SystemChecksRow 
          checks={mergedChecks} 
          allowedCommands={runView?.allowedCommands} 
          onStopInference={handleStopInference}
          onStartNavInference={handleStartNavInference}
          onStartPoseEstimationInference={handleStartPoseEstimationInference}
        />

        {/* --- Dev Debug Card --- */}
        <div className="mt-4 p-2 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 font-mono text-[10px] overflow-auto max-h-64">
          <h4 className="font-bold mb-2 uppercase text-slate-500">Dev Debug: Run & Checks Status</h4>
          <div className="space-y-2 text-slate-500">
            <div className='grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-4'>
              <div className="col-span-2">
                <span className="text-blue-500">Run ID:</span> {runId || 'null'}
              </div>
              <div>
                <span className="text-blue-500">System State:</span> {systemState}
              </div>
              <div>
                <span className="text-blue-500">Process State:</span> {processState}
              </div>
              <div>
                <span className="text-blue-500">Process Type:</span> {runView?.processType || 'null'}
              </div>
            </div>
            
            <div>
              <span className="text-blue-500">Allowed Commands:</span> {JSON.stringify(runView?.allowedCommands || [])}
            </div>
            <div>
              <span className="text-blue-500 mb-1 block">Merged Checks:</span>
              <div className="grid grid-cols-4 gap-4">
                {mergedChecks.map((c) => (
                  <div key={c.id} className='grid grid-cols-4'>
                    <div className="text-slate-300 font-bold truncate col-span-2">{c.label}</div>
                    <div className="text-slate-500 uppercase">{c.ready? "Ready" : "Not Ready"}</div>
                    <div className="text-slate-500 uppercase">{c.status}</div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <span className="text-blue-500">System Raw (Unified Topic):</span>
              <pre className="mt-1 whitespace-pre-wrap text-slate-400 p-2 bg-black/5 rounded">
                {systemRaw || 'null (no messages received yet)'}
              </pre>
            </div>
          </div>
        </div>
        {/* --- End Dev Debug Card --- */}
      </div>
    </div>
  );
}