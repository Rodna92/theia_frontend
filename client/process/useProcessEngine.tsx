'use client';

import { useCallback, useMemo, useReducer, useRef } from 'react';

/**
 * React-friendly process state machine runner
 *
 * - Enforces command ordering (no jumping to later steps).
 * - Tracks per-step ProcessStepState for ProcessFlowGraph.
 * - Tracks system/device statuses and gates progression (Vision OK required).
 * - Supports cancellation (STOP) and reset.
 * - Can run automatically end-to-end (START) or step-by-step (RUN_NEXT).
 */

export type SleepFn = (ms: number) => Promise<void>;

export type DeviceStatusItem<SystemCheckStatus> = {
  id: string;
  label: string;
  status: SystemCheckStatus;
};

export type FlowStepItem<ProcessStepState> = {
  id: string;
  label: string;
  state: ProcessStepState;
};

export type ProcessRuntimeError = {
  code:
    | 'INITIALIZE_FAILED'
    | 'STREAM_START_FAILED'
    | 'VISION_NOT_OK'
    | 'NAVIGATION_FAILED'
    | 'ROUTINE_FAILED'
    | 'REPORT_FAILED'
    | 'CANCELLED'
    | 'UNKNOWN';
  message: string;
  stepId?: string;
  details?: unknown;
  ts: number;
};

export type ProcessReport = {
  processKind: string;
  startedAt: number;
  finishedAt: number;
  iterationsRequested: number;
  iterationsDone: number;
  deviceSnapshot: Array<{ id: string; label: string; status: string }>;
  stepSnapshot: Array<{ id: string; label: string; state: string }>;
  errors: ProcessRuntimeError[];
};

export type ProcessEngineConfig<SystemCheckStatus, ProcessStepState> = {
  processKind: string;

  // Devices
  initialDevices: Array<DeviceStatusItem<SystemCheckStatus>>;
  isVisionOk: (devices: Array<DeviceStatusItem<SystemCheckStatus>>) => boolean;

  // Steps
  steps: Array<{ id: string; label: string }>; // ordered
  routineStepIds: string[]; // subset used for the repeat-loop

  // Step state enum/object
  StepState: {
    IDLE: ProcessStepState;
    RUNNING: ProcessStepState;
    DONE: ProcessStepState;
    ERROR: ProcessStepState;
  };

  // Async runners (swap with real backend/WebRTC calls later)
  runner?: {
    initialize?: () => Promise<void>;
    startStream?: () => Promise<void>;
    checkDevices?: () => Promise<void>;
    startNavigation?: () => Promise<void>;
    routineStep?: (stepId: string, iterationIndex: number) => Promise<void>;
    confirmReport?: () => Promise<void>;
  };

  sleep?: SleepFn;
};

export type ProcessCommand =
  | { type: 'START'; iterations?: number; auto?: boolean }
  | { type: 'RUN_NEXT' }
  | { type: 'STOP' }
  | { type: 'RESET' }
  | { type: 'SET_DEVICE_STATUS'; deviceId: string; status: string };

type EngineState<SystemCheckStatus, ProcessStepState> = {
  startedAt: number | null;
  finishedAt: number | null;
  isRunning: boolean;
  cursorIndex: number; // next step to run (0..steps.length)
  iterationsRequested: number;
  iterationsDone: number;
  devices: Array<DeviceStatusItem<SystemCheckStatus>>;
  steps: Array<FlowStepItem<ProcessStepState>>;

  processError: ProcessRuntimeError | null;
  commandError: { code: 'INVALID_SEQUENCE' | 'BUSY'; message: string; ts: number } | null;
  errorHistory: ProcessRuntimeError[];
  report: ProcessReport | null;
};

type Action<SystemCheckStatus, ProcessStepState> =
  | { type: 'SET_RUNNING'; value: boolean }
  | { type: 'SET_CURSOR'; index: number }
  | { type: 'SET_STEP_STATE'; stepId: string; state: ProcessStepState }
  | { type: 'SET_ALL_STEPS'; steps: Array<FlowStepItem<ProcessStepState>> }
  | { type: 'SET_DEVICE_STATUS'; deviceId: string; status: SystemCheckStatus }
  | { type: 'SET_PROCESS_ERROR'; err: ProcessRuntimeError | null }
  | { type: 'PUSH_ERROR'; err: ProcessRuntimeError }
  | { type: 'SET_COMMAND_ERROR'; err: EngineState<SystemCheckStatus, ProcessStepState>['commandError'] }
  | { type: 'SET_STARTED_AT'; ts: number | null }
  | { type: 'SET_FINISHED_AT'; ts: number | null }
  | { type: 'SET_ITERATIONS_REQUESTED'; value: number }
  | { type: 'SET_ITERATIONS_DONE'; value: number }
  | { type: 'SET_REPORT'; report: ProcessReport | null };

function reducer<SystemCheckStatus, ProcessStepState>(
  state: EngineState<SystemCheckStatus, ProcessStepState>,
  action: Action<SystemCheckStatus, ProcessStepState>
): EngineState<SystemCheckStatus, ProcessStepState> {
  switch (action.type) {
    case 'SET_RUNNING':
      return { ...state, isRunning: action.value };
    case 'SET_CURSOR':
      return { ...state, cursorIndex: action.index };
    case 'SET_ALL_STEPS':
      return { ...state, steps: action.steps };
    case 'SET_STEP_STATE':
      return {
        ...state,
        steps: state.steps.map((s) => (s.id === action.stepId ? { ...s, state: action.state } : s)),
      };
    case 'SET_DEVICE_STATUS':
      return {
        ...state,
        devices: state.devices.map((d) => (d.id === action.deviceId ? { ...d, status: action.status } : d)),
      };
    case 'SET_PROCESS_ERROR':
      return { ...state, processError: action.err };
    case 'PUSH_ERROR':
      return { ...state, errorHistory: [...state.errorHistory, action.err] };
    case 'SET_COMMAND_ERROR':
      return { ...state, commandError: action.err };
    case 'SET_STARTED_AT':
      return { ...state, startedAt: action.ts };
    case 'SET_FINISHED_AT':
      return { ...state, finishedAt: action.ts };
    case 'SET_ITERATIONS_REQUESTED':
      return { ...state, iterationsRequested: action.value };
    case 'SET_ITERATIONS_DONE':
      return { ...state, iterationsDone: action.value };
    case 'SET_REPORT':
      return { ...state, report: action.report };
    default:
      return state;
  }
}

function now() {
  return Date.now();
}

function defaultSleep(ms: number) {
  return new Promise<void>((res) => setTimeout(res, ms));
}

export function useProcessEngine<SystemCheckStatus, ProcessStepState>(
  config: ProcessEngineConfig<SystemCheckStatus, ProcessStepState>
) {
  const sleep = config.sleep ?? defaultSleep;

  const initialSteps: Array<FlowStepItem<ProcessStepState>> = useMemo(() => {
    return config.steps.map((s) => ({
      id: s.id,
      label: s.label,
      state: config.StepState.IDLE,
    }));
  }, [config.steps, config.StepState.IDLE]);

  const [state, dispatch] = useReducer(
    reducer<SystemCheckStatus, ProcessStepState>,
    {
      startedAt: null,
      finishedAt: null,
      isRunning: false,
      cursorIndex: 0,
      iterationsRequested: 1,
      iterationsDone: 0,
      devices: config.initialDevices,
      steps: initialSteps,
      processError: null,
      commandError: null,
      errorHistory: [],
      report: null,
    } as EngineState<SystemCheckStatus, ProcessStepState>
  );

  // Live snapshot for async (prevents stale closure bugs)
  const stateRef = useRef(state);
  stateRef.current = state;

  // Cancellation token
  const runTokenRef = useRef(0);

  const setStepState = useCallback((stepId: string, stepState: ProcessStepState) => {
    dispatch({ type: 'SET_STEP_STATE', stepId, state: stepState });
  }, []);

  const markAllRemainingIdle = useCallback(() => {
    const snap = stateRef.current;
    dispatch({
      type: 'SET_ALL_STEPS',
      steps: snap.steps.map((s, i) => {
        if (s.state === config.StepState.ERROR) return s;
        if (s.state === config.StepState.DONE) return s;
        if (i < snap.cursorIndex) return s;
        return { ...s, state: config.StepState.IDLE };
      }),
    });
  }, [config.StepState.ERROR, config.StepState.DONE, config.StepState.IDLE]);

  const getAllowedCommands = useCallback(() => {
    const snap = stateRef.current;
    if (snap.processError) return ['RESET'] as const;
    if (snap.isRunning) return ['STOP'] as const;
    if (snap.cursorIndex === 0) return ['START'] as const;
    if (snap.cursorIndex >= config.steps.length) return ['RESET'] as const;
    return ['RUN_NEXT', 'STOP', 'RESET'] as const;
  }, [config.steps.length]);

  const setDeviceStatus = useCallback((deviceId: string, status: SystemCheckStatus) => {
    const snap = stateRef.current;
    const current = snap.devices.find((d) => d.id === deviceId)?.status;

    // ✅ No-op if no change (prevents update loops)
    if (current === status) return;

    dispatch({ type: 'SET_DEVICE_STATUS', deviceId, status });
  }, []);


  const reset = useCallback(() => {
    runTokenRef.current += 1;
    dispatch({ type: 'SET_RUNNING', value: false });
    dispatch({ type: 'SET_CURSOR', index: 0 });
    dispatch({ type: 'SET_PROCESS_ERROR', err: null });
    dispatch({ type: 'SET_COMMAND_ERROR', err: null });
    dispatch({ type: 'SET_STARTED_AT', ts: null });
    dispatch({ type: 'SET_FINISHED_AT', ts: null });
    dispatch({ type: 'SET_ITERATIONS_DONE', value: 0 });
    dispatch({ type: 'SET_REPORT', report: null });
    dispatch({
      type: 'SET_ALL_STEPS',
      steps: config.steps.map((s) => ({ id: s.id, label: s.label, state: config.StepState.IDLE })),
    });
  }, [config.steps, config.StepState.IDLE]);

  const stop = useCallback(() => {
    runTokenRef.current += 1;
    dispatch({ type: 'SET_RUNNING', value: false });
    markAllRemainingIdle();

    const snap = stateRef.current;
    dispatch({
      type: 'PUSH_ERROR',
      err: {
        code: 'CANCELLED',
        message: 'Process was cancelled by user',
        stepId: config.steps[Math.min(snap.cursorIndex, config.steps.length - 1)]?.id,
        ts: now(),
      },
    });
  }, [markAllRemainingIdle, config.steps, config.steps.length]);

  const runStep = useCallback(
    async (stepId: string, stepIndex: number, token: number) => {
      if (runTokenRef.current !== token) return;

      setStepState(stepId, config.StepState.RUNNING);

      try {
        if (stepId === 'initialize') {
          if (!stateRef.current.startedAt) dispatch({ type: 'SET_STARTED_AT', ts: now() });
          await (config.runner?.initialize?.() ?? sleep(250));
        } else if (stepId === 'startStream') {
          await (config.runner?.startStream?.() ?? sleep(500));
        } else if (stepId === 'checkDevices') {
          await (config.runner?.checkDevices?.() ?? sleep(300));
          if (!config.isVisionOk(stateRef.current.devices)) {
            throw { code: 'VISION_NOT_OK', message: 'Vision is not OK; cannot continue' };
          }
        } else if (stepId === 'navigationStart') {
          if (!config.isVisionOk(stateRef.current.devices)) {
            throw { code: 'VISION_NOT_OK', message: 'Vision is not OK; cannot start navigation' };
          }
          await (config.runner?.startNavigation?.() ?? sleep(350));
        } else if (config.routineStepIds.includes(stepId)) {
          const snap = stateRef.current;
          const iter = Math.min(snap.iterationsDone, snap.iterationsRequested - 1);
          await (config.runner?.routineStep?.(stepId, iter) ?? sleep(450));
        } else if (stepId === 'confirmReport' || stepId === 'confirmComplete') {
          await (config.runner?.confirmReport?.() ?? sleep(300));

          const snap = stateRef.current;
          const report: ProcessReport = {
            processKind: config.processKind,
            startedAt: snap.startedAt ?? now(),
            finishedAt: now(),
            iterationsRequested: snap.iterationsRequested,
            iterationsDone: snap.iterationsDone,
            deviceSnapshot: snap.devices.map((d) => ({
              id: d.id,
              label: d.label,
              status: String(d.status),
            })),
            stepSnapshot: snap.steps.map((s) => ({
              id: s.id,
              label: s.label,
              state: String(s.state),
            })),
            errors: snap.errorHistory,
          };
          dispatch({ type: 'SET_REPORT', report });
        } else if (stepId === 'complete') {
          await sleep(50);
          dispatch({ type: 'SET_FINISHED_AT', ts: now() });
        } else {
          await sleep(50);
        }

        if (runTokenRef.current !== token) return;

        setStepState(stepId, config.StepState.DONE);

        // If we completed the LAST routine step, we finish an iteration.
        const isRoutineLast =
          config.routineStepIds.length > 0 &&
          stepId === config.routineStepIds[config.routineStepIds.length - 1];

        if (isRoutineLast) {
          const snap = stateRef.current;
          const newDone = Math.min(snap.iterationsDone + 1, snap.iterationsRequested);
          dispatch({ type: 'SET_ITERATIONS_DONE', value: newDone });

          // Repeat loop if needed
          if (newDone < snap.iterationsRequested) {
            for (const rid of config.routineStepIds) {
              setStepState(rid, config.StepState.IDLE);
            }
            const firstRoutineIndex = config.steps.findIndex((s) => s.id === config.routineStepIds[0]);
            dispatch({ type: 'SET_CURSOR', index: firstRoutineIndex });
            return;
          }
        }

        dispatch({ type: 'SET_CURSOR', index: stepIndex + 1 });
      } catch (e: any) {
        const err: ProcessRuntimeError = {
          code: (e?.code as ProcessRuntimeError['code']) ?? 'UNKNOWN',
          message: e?.message ?? 'Unknown error',
          stepId,
          details: e?.details ?? e,
          ts: now(),
        };
        dispatch({ type: 'PUSH_ERROR', err });
        dispatch({ type: 'SET_PROCESS_ERROR', err });
        setStepState(stepId, config.StepState.ERROR);
        dispatch({ type: 'SET_RUNNING', value: false });
      }
    },
    [
      config.StepState.RUNNING,
      config.StepState.DONE,
      config.StepState.ERROR,
      config.StepState.IDLE,
      config.runner,
      config.isVisionOk,
      config.routineStepIds,
      config.steps,
      config.processKind,
      setStepState,
      sleep,
    ]
  );

  const runNext = useCallback(async () => {
    const snap = stateRef.current;

    if (snap.processError) {
      dispatch({
        type: 'SET_COMMAND_ERROR',
        err: { code: 'INVALID_SEQUENCE', message: 'Process is in ERROR. Reset first.', ts: now() },
      });
      return false;
    }
    if (snap.isRunning) {
      dispatch({
        type: 'SET_COMMAND_ERROR',
        err: { code: 'BUSY', message: 'Process is already running a step.', ts: now() },
      });
      return false;
    }
    if (snap.cursorIndex >= config.steps.length) {
      dispatch({
        type: 'SET_COMMAND_ERROR',
        err: { code: 'INVALID_SEQUENCE', message: 'Process already completed. Reset to run again.', ts: now() },
      });
      return false;
    }

    const token = ++runTokenRef.current;
    dispatch({ type: 'SET_COMMAND_ERROR', err: null });
    dispatch({ type: 'SET_RUNNING', value: true });

    const stepId = config.steps[snap.cursorIndex]?.id;
    if (!stepId) {
      dispatch({ type: 'SET_RUNNING', value: false });
      return false;
    }

    await runStep(stepId, snap.cursorIndex, token);

    if (runTokenRef.current === token) dispatch({ type: 'SET_RUNNING', value: false });
    return true;
  }, [config.steps, runStep]);

  const start = useCallback(
    async (opts?: { iterations?: number; auto?: boolean }) => {
      const snap = stateRef.current;
      if (snap.isRunning) {
        dispatch({
          type: 'SET_COMMAND_ERROR',
          err: { code: 'BUSY', message: 'Process is already running.', ts: now() },
        });
        return false;
      }

      dispatch({ type: 'SET_COMMAND_ERROR', err: null });
      dispatch({ type: 'SET_PROCESS_ERROR', err: null });
      dispatch({ type: 'SET_STARTED_AT', ts: now() });
      dispatch({ type: 'SET_FINISHED_AT', ts: null });
      dispatch({ type: 'SET_ITERATIONS_DONE', value: 0 });
      dispatch({ type: 'SET_ITERATIONS_REQUESTED', value: Math.max(1, opts?.iterations ?? 1) });
      dispatch({ type: 'SET_CURSOR', index: 0 });
      dispatch({
        type: 'SET_ALL_STEPS',
        steps: config.steps.map((s) => ({ id: s.id, label: s.label, state: config.StepState.IDLE })),
      });
      dispatch({ type: 'SET_REPORT', report: null });

      if (opts?.auto ?? true) {
        while (true) {
          const live = stateRef.current;
          if (live.processError) break;
          if (live.cursorIndex >= config.steps.length) break;
          const ok = await runNext();
          if (!ok) break;
          await sleep(0); // allow UI paint between steps
        }
      }

      return true;
    },
    [config.steps, config.StepState.IDLE, runNext, sleep]
  );

  const dispatchCommand = useCallback(
    async (cmd: ProcessCommand) => {
      switch (cmd.type) {
        case 'START':
          return start({ iterations: cmd.iterations, auto: cmd.auto ?? true });
        case 'RUN_NEXT':
          return runNext();
        case 'STOP':
          stop();
          return true;
        case 'RESET':
          reset();
          return true;
        case 'SET_DEVICE_STATUS': {
          const match = stateRef.current.devices.find((d) => d.id === cmd.deviceId);
          if (!match) return false;
          setDeviceStatus(cmd.deviceId, cmd.status as unknown as SystemCheckStatus);
          return true;
        }
        default:
          return false;
      }
    },
    [reset, runNext, setDeviceStatus, start, stop]
  );

  // Add iteration progress to routine step labels
  const flowSteps: Array<FlowStepItem<ProcessStepState>> = useMemo(() => {
    const total = state.iterationsRequested;
    const done = state.iterationsDone;

    return state.steps.map((s) => {
      if (!config.routineStepIds.includes(s.id) || total <= 1) return s;

      const inProgress = state.isRunning && s.state === config.StepState.RUNNING;
      const current = Math.min(done + (inProgress ? 1 : 0), total);

      const baseLabel = config.steps.find((x) => x.id === s.id)?.label ?? s.label;
      return { ...s, label: `${baseLabel} (${current}/${total})` };
    });
  }, [
    state.steps,
    state.iterationsRequested,
    state.iterationsDone,
    state.isRunning,
    config.routineStepIds,
    config.steps,
    config.StepState.RUNNING,
  ]);

  return {
    // UI state
    systemStatus: state.devices,
    flowSteps,
    isRunning: state.isRunning,
    cursorIndex: state.cursorIndex,
    iterationsRequested: state.iterationsRequested,
    iterationsDone: state.iterationsDone,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,

    // errors + report
    processError: state.processError,
    commandError: state.commandError,
    errorHistory: state.errorHistory,
    report: state.report,

    // commands
    allowedCommands: getAllowedCommands(),
    dispatch: dispatchCommand,
    start,
    runNext,
    stop,
    reset,
    setDeviceStatus,
  };
}
