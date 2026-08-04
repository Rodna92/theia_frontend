'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FluidDoserSystemStatus,
  FluidDoserFlowStep,
  SystemCheckStatus,
  ProcessStepState,
} from '@/client/types/fluidDoser';

import { useProcessEngine } from '@/client/process/useProcessEngine';
import { useWhepPlayer } from '@/ui/VideoStream/hooks/useWhepPlayer';
import { useMetadataClient } from '@/ui/VideoStream/hooks/useMetadataClient';
import { useSystemStatus } from '@/ui/VideoStream/hooks/useSystemStatus';
import type { StreamStatus } from '@/client/types/media';
import { BACKEND_URL, AUTH_HEADER } from '@/client/config';

// ---- helpers ----
function now() {
  return Date.now();
}

async function waitFor(
  predicate: () => boolean,
  opts?: { timeoutMs?: number; intervalMs?: number }
) {
  const timeoutMs = opts?.timeoutMs ?? 20000;
  const intervalMs = opts?.intervalMs ?? 120;

  const start = now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (predicate()) return;
    if (now() - start > timeoutMs) throw new Error('timeout');
    await new Promise<void>((r) => setTimeout(r, intervalMs));
  }
}

function computeVisionStatus(args: {
  streamStatus: StreamStatus;
  metadataAvailable: boolean;
}): SystemCheckStatus {
  if (args.metadataAvailable) return SystemCheckStatus.OK;
  if (args.streamStatus.state === 'connected') return SystemCheckStatus.WARN;
  return SystemCheckStatus.OFF;
}

export function useFluidDoserCommanderHook() {
  const { systemState, runView } = useSystemStatus();
  const [runId, setRunId] = useState<string | null>(null);

  const runIdRef = useRef<string | null>(null);
  const videoRequestedRef = useRef<boolean>(false);
  const checkRequestedRef = useRef<boolean>(false);

  useEffect(() => {
    runIdRef.current = runId;
  }, [runId]);

  // Derived process type from websocket/runView
  const currentProcessType = useMemo(() => {
    return runView?.processType || 'FLUID_DOSER';
  }, [runView]);

  //TODO: replace with real tenant/user info
  const TENANT_ID = '00000000-0000-0000-0000-000000000000';

  // 1) WebRTC player
  const { videoRef, status, metrics, connect, reconnect } = useWhepPlayer();

  // Keep latest stream status in a ref (so the process runner can read it)
  const statusRef = useRef<StreamStatus>(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const lastVisionRef = useRef<SystemCheckStatus | null>(null);

  // 2) Metadata client → “Vision OK” signal
  // Ensure 'streamName' matches your backend config for this process
  const { metadataAvailable } = useMetadataClient({ streamName: 'fluid-doser' });

  const metadataRef = useRef<boolean>(metadataAvailable);
  useEffect(() => {
    metadataRef.current = metadataAvailable;
  }, [metadataAvailable]);

  // 3) Device list
  const initialDevices = useMemo<FluidDoserSystemStatus[]>(
    () => [
      { id: 'vision', label: 'Vision', status: SystemCheckStatus.OFF }, // start conservative
      { id: 'robot', label: 'Robot', status: SystemCheckStatus.OFF },
      { id: 'endeffector', label: 'End-effector', status: SystemCheckStatus.WARN },
      { id: 'fluiddoser', label: 'Fluid-Doser', status: SystemCheckStatus.OFF },
    ],
    []
  );

  /**
   * Safe access to engine updates inside async runners
   */
  const setDeviceStatusRef = useRef<(id: string, st: SystemCheckStatus) => void>(() => {});
  const getDevicesRef = useRef<() => FluidDoserSystemStatus[]>(() => initialDevices);

  // 4) Process Engine
  const engine = useProcessEngine<SystemCheckStatus, ProcessStepState>({
    processKind: 'fluid-doser',
    initialDevices,
    steps: [
      { id: 'initialize', label: 'Initialize' },
      { id: 'startStream', label: 'Start stream' },
      { id: 'checkDevices', label: 'Check devices' },
      { id: 'navigationStart', label: 'Navigation start' },
      { id: 'moveToPoints', label: 'Move to points' }, // loop
      { id: 'prepareDosing', label: 'Prepare dosing' }, // loop
      { id: 'applyFluid', label: 'Apply dosing' },     // loop
      { id: 'confirmComplete', label: 'Confirm & report' },
      { id: 'complete', label: 'Complete' },
    ],
    routineStepIds: ['moveToPoints', 'prepareDosing', 'applyFluid'],
    StepState: ProcessStepState,

    // Gate: Vision must be OK
    isVisionOk: (devices) =>
      devices.find((d) => d.id === 'vision')?.status === SystemCheckStatus.OK,

    runner: {
      initialize: async () => {
        if (runIdRef.current) return;

        const res = await fetch(`${BACKEND_URL}/api/runs`, {
          method: 'POST',
          headers: AUTH_HEADER,
          body: JSON.stringify({
            processType: currentProcessType,
            edgeId: 'edge-001',
            createdBy: 'user-123',
            contextJson: JSON.stringify({ cameraId: 'main-camera' }),
          }),
        });

        if (!res.ok) {
          const errorData = await res.text();
          console.error('Run creation failed (initialize):', res.status, errorData);
          throw new Error(`Failed to create run: ${res.status} ${errorData}`);
        }
        const newRun = await res.json();
        setRunId(newRun.id);
        runIdRef.current = newRun.id;
      },

      /**
       * Step 2: Start stream
       */
      startStream: async () => {
        const rid = runIdRef.current;
        if (!rid) throw new Error('No run ID available');

        if (!videoRequestedRef.current) {
          await fetch(`${BACKEND_URL}/api/runs/${rid}/trigger/REQUEST_VIDEO`, {
            method: 'POST',
            headers: AUTH_HEADER,
            body: JSON.stringify({ requestedBy: 'user-123' }),
          });
          videoRequestedRef.current = true;
        }

        const s = statusRef.current;
        if (s.state === 'connected') return;

        if (s.state === 'error') {
          await reconnect();
        } else {
          await connect();
        }

        try {
          await waitFor(() => statusRef.current.state === 'connected', {
            timeoutMs: 25000,
            intervalMs: 120,
          });
        } catch {
          const last = statusRef.current;
          throw {
            code: 'STREAM_START_FAILED',
            message:
              last.state === 'error'
                ? `WebRTC error: ${last.error ?? 'unknown'}`
                : 'WebRTC did not reach connected state in time',
            details: { lastStatus: last },
          };
        }
      },

      /**
       * Step 3: Check devices
       */
      checkDevices: async () => {
        const rid = runIdRef.current;
        if (!rid) throw new Error('No run ID available');

        if (!checkRequestedRef.current) {
          await fetch(`${BACKEND_URL}/api/runs/${rid}/trigger/REQUEST_CHECK`, {
            method: 'POST',
            headers: AUTH_HEADER,
            body: JSON.stringify({ 
                requestedBy: 'user-123',
                processType: currentProcessType,
                routine: 'NAVIGATION_HANSEN',
                routineVersion: 1,
            }),
          });
          checkRequestedRef.current = true;
        }

        const vision = computeVisionStatus({
          streamStatus: statusRef.current,
          metadataAvailable: metadataRef.current,
        });

        // Update engine state
        setDeviceStatusRef.current('vision', vision);

        // Simulate other device checks
        await new Promise<void>((res) => setTimeout(res, 250));
      },

      startNavigation: async () => {
        const rid = runIdRef.current;
        if (!rid) throw new Error('No run ID available');

        await fetch(`${BACKEND_URL}/api/runs/${rid}/trigger/START`, {
          method: 'POST',
          headers: AUTH_HEADER,
          body: JSON.stringify({ 
              requestedBy: 'user-123',
              processType: currentProcessType,
              routine: 'NAVIGATION_HANSEN',
              routineVersion: 1,
          }),
        });

        await new Promise<void>((res) => setTimeout(res, 350));
      },

      routineStep: async (stepId, iterationIndex) => {
        try {
            if (stepId === 'moveToPoints') await new Promise<void>((res) => setTimeout(res, 450));
            if (stepId === 'prepareDosing') await new Promise<void>((res) => setTimeout(res, 450));
            if (stepId === 'applyFluid') await new Promise<void>((res) => setTimeout(res, 650));
        } catch (e) {
             throw {
                code: 'ROUTINE_FAILED',
                message: `Routine failed at ${stepId} (iteration ${iterationIndex + 1})`,
                details: e,
             };
        }
      },

      confirmReport: async () => {
        await new Promise<void>((res) => setTimeout(res, 300));
      },
    },
  });

  // Publish engine APIs to refs
  useEffect(() => {
    setDeviceStatusRef.current = engine.setDeviceStatus;
    getDevicesRef.current = () => engine.systemStatus as FluidDoserSystemStatus[];
  }, [engine]);

  // Auto connect on mount
  /* useEffect(() => {
    void connect();
    return () => {
      void cleanup();
    };
  }, [connect, cleanup]); */

  // Continuous Vision syncing (UI updates instantly)
  useEffect(() => {
    const vision = computeVisionStatus({ streamStatus: status, metadataAvailable });

    if (lastVisionRef.current !== vision) {
      lastVisionRef.current = vision;
      engine.setDeviceStatus('vision', vision);
    }
  }, [status.state, status.error, metadataAvailable, engine]);

  const startProcess = useCallback(
    (iterations = 2) => engine.start({ iterations, auto: true }),
    [engine]
  );
  const stopProcess = useCallback(async () => {
    engine.stop();
    const rid = runIdRef.current;
    if (rid) {
      try {
        await fetch(`${BACKEND_URL}/api/runs/${rid}/trigger/STOP`, {
          method: 'POST',
          headers: AUTH_HEADER,
          body: JSON.stringify({ requestedBy: 'user-123' }),
        });
      } catch (err) {
        console.error('Failed to send stop trigger:', err);
      }
    }
  }, [engine, TENANT_ID]);

  const resetProcess = useCallback(() => {
    engine.reset();
    setRunId(null);
    runIdRef.current = null;
    videoRequestedRef.current = false;
    checkRequestedRef.current = false;
  }, [engine]);

  const handleReconnect = useCallback(() => void reconnect(), [reconnect]);

  const handleConnect = useCallback(async () => {
    // If system is already RUNNING, just attempt direct connections without sending commands
    if (systemState === 'RUNNING') {
      console.log('System is RUNNING, skipping backend commands and attempting direct connection');
      void connect();
      return;
    }

    try {
      // Step 1: Create the Process Run
      const createRes = await fetch(`${BACKEND_URL}/api/runs`, {
        method: 'POST',
        headers: AUTH_HEADER,
        body: JSON.stringify({
          processType: currentProcessType,
          edgeId: 'edge-001',
          createdBy: 'user-123',
          contextJson: JSON.stringify({ cameraId: 'main-camera' }),
        }),
      });

      if (!createRes.ok) {
        const errorData = await createRes.text();
        console.error('Run creation failed:', createRes.status, errorData);
        throw new Error(`Failed to create run: ${createRes.status} ${errorData}`);
      }
      const newRun = await createRes.json();
      const newRunId = newRun.id;

      setRunId(newRunId);
      runIdRef.current = newRunId;

      // Step 2: Trigger the Video Request
      await fetch(`${BACKEND_URL}/api/runs/${newRunId}/trigger/REQUEST_VIDEO`, {
        method: 'POST',
        headers: AUTH_HEADER,
        body: JSON.stringify({
          requestedBy: 'user-123',
        }),
      });
      videoRequestedRef.current = true;

      // Continue with original behavior
      void connect();
    } catch (err) {
      console.error('Failed to initialize video flow:', err);
      // Fallback to original behavior
      void connect();
    }
  }, [connect, systemState, currentProcessType, TENANT_ID]);

  // Sync runId from websocket if system is already running
  useEffect(() => {
    if (systemState === 'RUNNING' && runView?.runId && !runId) {
      setRunId(runView.runId);
    }
  }, [systemState, runView?.runId, runId]);

  // Auto-connect if system is RUNNING
  useEffect(() => {
    if (systemState === 'RUNNING' && status.state === 'idle') {
      void handleConnect();
    }
  }, [systemState, status.state, handleConnect]);

  const [latency, setLatency] = useState(0);
  useEffect(() => {
    setLatency(Math.floor(Math.random() * 50) + 20);
  }, []);

  return {
    // Process UI
    systemStatus: engine.systemStatus as FluidDoserSystemStatus[],
    flowSteps: engine.flowSteps as FluidDoserFlowStep[],
    latency,

    // Stream UI
    videoRef,
    status,
    metrics,
    systemState,
    metadataAvailable,
    onConnect: handleConnect,
    onReconnect: handleReconnect,

    // Process Commands
    startProcess,
    stopProcess,
    resetProcess,
    runNext: engine.runNext,

    // Diagnostics
    runId,
    processError: engine.processError,
    commandError: engine.commandError,
    report: engine.report,
    iterationsRequested: engine.iterationsRequested,
    iterationsDone: engine.iterationsDone,
    isRunning: engine.isRunning,
    allowedCommands: engine.allowedCommands,
  };
}