'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  LeakDetectionSystemStatus,
  LeakDetectionFlowStep,
  SystemCheckStatus,
  ProcessStepState,
} from '@/client/types/leakDetection';

import { useProcessEngine } from '@/client/process/useProcessEngine';
import { useWhepPlayer } from '@/ui/VideoStream/hooks/useWhepPlayer';
import { useMetadataClient } from '@/ui/VideoStream/hooks/useMetadataClient';
import { useSystemStatus, type SystemState } from '@/ui/VideoStream/hooks/useSystemStatus';
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
  systemState: SystemState;
  streamStatus: StreamStatus;
  metadataAvailable: boolean;
}): SystemCheckStatus {
  if (args.systemState === 'RUNNING') {
    if (args.streamStatus.state === 'connected') {
      return args.metadataAvailable ? SystemCheckStatus.OK : SystemCheckStatus.NOT_OK;
    }
    return SystemCheckStatus.OK;
  }

  if (args.metadataAvailable) return SystemCheckStatus.OK;
  if (args.streamStatus.state === 'connected') return SystemCheckStatus.WARN;
  return SystemCheckStatus.OFF;
}

export function useLeakDetectionCommanderHook() {
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
    return runView?.processType || 'LEAK_DETECTION';
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
  const { metadataAvailable, connectionStatus } = useMetadataClient({ streamName: 'leak-detection' });

  const metadataRef = useRef<boolean>(metadataAvailable);
  useEffect(() => {
    metadataRef.current = metadataAvailable;
  }, [metadataAvailable]);

  // 3) Device list (Leak Detection variant)
  const initialDevices = useMemo<LeakDetectionSystemStatus[]>(
    () => [
      { id: 'vision', label: 'Vision', status: SystemCheckStatus.OFF, ready: null },
      { id: 'robot', label: 'Robot', status: SystemCheckStatus.OFF, ready: null },
      { id: 'endeffector', label: 'End-effector', status: SystemCheckStatus.OFF, ready: null },
      { id: 'leakEquipment', label: 'Leak equipment', status: SystemCheckStatus.OFF, ready: null },
    ],
    []
  );

  /**
   * IMPORTANT:
   * We need runner functions to update engine device status.
   * But we can't directly reference `engine` inside the initializer object
   * (TS can complain "used before declaration").
   *
   * So we store engine APIs in refs, and runner uses the refs.
   */
  const setDeviceStatusRef = useRef<(id: string, st: SystemCheckStatus) => void>(() => {});
  const getDevicesRef = useRef<() => LeakDetectionSystemStatus[]>(() => initialDevices);

  // 4) Process Engine
  const engine = useProcessEngine<SystemCheckStatus, ProcessStepState>({
    processKind: 'leak-detection',
    initialDevices,
    steps: [
      { id: 'initialize', label: 'Initialize' },                 // 1
      { id: 'startStream', label: 'Start stream (WebRTC)' },     // 2
      { id: 'checkDevices', label: 'Check devices' },            // 3
      { id: 'navigationStart', label: 'Navigation start' },      // 4
      { id: 'moveToPoints', label: 'Move to inspection point' }, // 5 (loop)
      { id: 'detectLeaks', label: 'Detect leaks' },              // 5 (loop)
      { id: 'confirmReport', label: 'Confirm & report' },        // 6
      { id: 'complete', label: 'Complete' },                     // 7
    ],
    routineStepIds: ['moveToPoints', 'detectLeaks'],
    StepState: ProcessStepState,

    // Gate condition: ONLY vision needed for now
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
            message: last.state === 'error'
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
          systemState,
          streamStatus: statusRef.current,
          metadataAvailable: metadataRef.current,
        });

        setDeviceStatusRef.current('vision', vision);
        await new Promise<void>((r) => setTimeout(r, 80));
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

        await new Promise<void>((r) => setTimeout(r, 180));
      },

      routineStep: async (stepId, iterationIndex) => {
        // future: real robot motion + vision inference gating
        try {
          if (stepId === 'moveToPoints') await new Promise<void>((r) => setTimeout(r, 350));
          if (stepId === 'detectLeaks') await new Promise<void>((r) => setTimeout(r, 450));
        } catch (e) {
          throw {
            code: 'ROUTINE_FAILED',
            message: `Routine failed at ${stepId} (iteration ${iterationIndex + 1})`,
            details: e,
          };
        }
      },

      confirmReport: async () => {
        // future: collect + save report
        await new Promise<void>((r) => setTimeout(r, 150));
      },
    },
  });

  // publish engine APIs to refs (safe for runner closures)
  useEffect(() => {
    setDeviceStatusRef.current = engine.setDeviceStatus;
    getDevicesRef.current = () => engine.systemStatus as LeakDetectionSystemStatus[];
  }, [engine]);

  /**
   * Auto connect on mount (like your page did)
   */
  /* useEffect(() => {
    void connect();
    return () => {
      void cleanup();
    };
  }, [connect, cleanup]); */

  /**
   * Continuous Vision syncing (UI updates instantly; not only at Step 3)
   */
  useEffect(() => {
    const vision = computeVisionStatus({ systemState, streamStatus: status, metadataAvailable });

    // ✅ Only push update when vision status changes
    if (lastVisionRef.current !== vision) {
      lastVisionRef.current = vision;
      engine.setDeviceStatus('vision', vision);
    }
  }, [status.state, status.error, metadataAvailable, engine]);

  // commands
  const startProcess = useCallback(
    (iterations = 1) => engine.start({ iterations, auto: true }),
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
  }, [connect, systemState, currentProcessType]);

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
    systemStatus: engine.systemStatus as LeakDetectionSystemStatus[],
    flowSteps: engine.flowSteps as LeakDetectionFlowStep[],
    latency,

    // Stream UI
    videoRef,
    status,
    metrics,
    metadataAvailable,
    metadataConnectionStatus: connectionStatus,
    systemState,
    onConnect: handleConnect,
    onReconnect: handleReconnect,

    // Process commands
    startProcess,
    stopProcess,
    resetProcess,

    // diagnostics
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
