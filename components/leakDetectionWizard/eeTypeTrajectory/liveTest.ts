'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// Routine test on the real end effector (tool only, no robot): client side of
// /api/end-effectors/test, which proxies ee_app's ee_test_node (nodes/ee_test_gateway.py).

export interface LiveJoint {
  index: number;
  name: string;
  servo_id: number;
  min_deg: number;
  max_deg: number;
  position_deg: number | null;
  position_counts: number | null;
  at_home: boolean | null;
}

export interface LiveDryRun {
  // The mounted tool's joint commands are enabled and ee_target_routine_node answers.
  available: boolean;
  reason: string;
  running: boolean;
  target: number | null;
  elapsed_s: number;
  joints: { name: string; commanded_deg: number }[];
  // Outcome of the last test (ok = null while none has finished).
  message: string;
  ok: boolean | null;
  // Why the system state forbids a test right now ('' = it does not).
  blocked: string;
  can_start: boolean;
  // The state check (only) can be bypassed by the operator; absent on an older ee_test_node.
  can_force?: boolean;
  // The running test was started with the state check bypassed.
  forced?: boolean;
}

// One failed position read, with the raw bytes that did arrive.
export interface BusFailure {
  n: number;
  time: number; // unix seconds
  servo_id: number;
  kind: string; // incomplete / bad_header / wrong_id / servo_error / port
  bytes: number;
  raw: string; // hex
  duration_ms: number;
  // How long after the last move command the read was sent (null = no command before).
  ms_since_move: number | null;
}

export interface BusStats {
  since: number; // unix seconds
  reads: number;
  read_failures: number;
  failure_pct: number;
  moves: number;
  kinds: Record<string, number>;
  last_ack: string;
  failures: BusFailure[];
}

export type DiagnosticScenario = 'idle' | 'traffic' | 'motion_spaced' | 'motion';

export interface DiagnosticResult {
  scenario: DiagnosticScenario;
  duration_s: number;
  error: string;
  reads: number;
  read_failures: number;
  failure_pct: number;
  moves: number;
  max_lag_deg: number | null;
  kinds: Record<string, number>;
  failures: BusFailure[];
}

export interface LiveDiagnostic {
  available: boolean;
  running: boolean;
  scenario: DiagnosticScenario | null;
  progress: number; // 0..1 over the whole run
  results: DiagnosticResult[];
  verdict: string;
  stopped: boolean;
  scenarios: DiagnosticScenario[];
}

export interface LiveStatus {
  system_state: 'BUSY' | 'IDLE' | 'TEST' | 'UNKNOWN';
  test_mode: boolean;
  can_enter: boolean;
  // Why this state forbids moving the tool from the page ('' = it does not); the operator can
  // bypass it. Absent on an older ee_test_node (manual motion then needs test mode).
  blocked?: string;
  end_effector_type: string;
  servo: {
    available: boolean;
    reason: string;
    connected: boolean;
    error: string;
    max_jog_step_deg?: number;
    max_speed_deg_s?: number;
    joints: LiveJoint[];
    // Absent on an ee_test_node older than the bus diagnostic.
    bus?: BusStats;
  };
  // Absent on an ee_test_node older than the routine test.
  dry_run?: LiveDryRun;
  diagnostic?: LiveDiagnostic;
}

interface CommandReply {
  ok: boolean;
  message: string;
  status?: LiveStatus;
  unreachable?: boolean;
}

export interface LiveNote {
  ok: boolean;
  text: string;
}

const API = '/api/end-effectors/test';
const POLL_IDLE_MS = 1000;
const POLL_RUNNING_MS = 200;

// Target index that only brings the tool's joints back to home (RunToolDryRun.RETURN_HOME).
export const RETURN_HOME = 0;

export interface LiveTest {
  status: LiveStatus | null;
  // Set when the test node cannot be reached at all.
  unreachable: string | null;
  note: LiveNote | null;
  busy: boolean;
  // When the last status arrived (performance.now()), to extrapolate elapsed_s between polls.
  statusAt: number;
  // force: bypass the system-state check (the operator's own responsibility).
  start: (target: number, force?: boolean) => Promise<boolean>;
  stop: () => Promise<boolean>;
  setTestMode: (enabled: boolean, force?: boolean) => Promise<boolean>;
  // Manual motion [joint deg from home]; `force` as for start(). Jog and move report only failures.
  jog: (joint: number, deltaDeg: number, force?: boolean) => Promise<boolean>;
  move: (joint: number, targetDeg: number, force?: boolean) => Promise<boolean>;
  home: (force?: boolean) => Promise<boolean>;
  // Stops everything on the tool: manual motion, routine test, bus diagnostic.
  stopAll: () => Promise<boolean>;
  startDiagnostic: (scenarios: DiagnosticScenario[], durationS: number, joint: number, force?: boolean) => Promise<boolean>;
  stopDiagnostic: () => Promise<boolean>;
  resetBusStats: () => Promise<boolean>;
}

// Polls the test node while `active`, faster while a routine test or a bus diagnostic runs.
// idlePollMs: the period otherwise (a page that mirrors the measured position wants it short).
export function useEeLiveTest(active: boolean, idlePollMs = POLL_IDLE_MS): LiveTest {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [note, setNote] = useState<LiveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusAt, setStatusAt] = useState(0);
  const inFlight = useRef(false);
  const testRunning = !!status?.dry_run?.running;
  const diagnosticRunning = !!status?.diagnostic?.running;
  const running = testRunning || diagnosticRunning;
  // What must be stopped when the page goes away.
  const runningRef = useRef<'dry-run-stop' | 'diagnostic-stop' | null>(null);
  runningRef.current = testRunning ? 'dry-run-stop' : diagnosticRunning ? 'diagnostic-stop' : null;

  const accept = useCallback((next: LiveStatus) => {
    setStatus(next);
    setStatusAt(performance.now());
    setUnreachable(null);
  }, []);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // a command's own reply carries a fresher status
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const body = await res.json();
      if (inFlight.current) return;
      if (res.ok) accept(body as LiveStatus);
      else {
        setStatus(null);
        setUnreachable(String(body?.message ?? res.status));
      }
    } catch (e) {
      setStatus(null);
      setUnreachable(e instanceof Error ? e.message : String(e));
    }
  }, [accept]);

  useEffect(() => {
    if (!active) {
      setStatus(null);
      setUnreachable(null);
      setNote(null);
      return;
    }
    refresh();
    const timer = setInterval(refresh, running ? POLL_RUNNING_MS : idlePollMs);
    return () => clearInterval(timer);
  }, [active, running, refresh, idlePollMs]);

  // Leaving the page (or disconnecting) must not leave the tool running a routine or a diagnostic.
  useEffect(() => {
    if (!active) return;
    return () => {
      if (!runningRef.current) return;
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: runningRef.current }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [active]);

  const send = useCallback(
    // quiet: a repeated command (jog, slider move) -- no busy flag, and only a failure is shown.
    async (action: string, body: Record<string, unknown> = {}, quiet = false): Promise<boolean> => {
      inFlight.current = true;
      if (!quiet) setBusy(true);
      try {
        const res = await fetch(API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, ...body }),
        });
        const reply = (await res.json()) as CommandReply;
        if (reply.status) accept(reply.status);
        else if (reply.unreachable) {
          setStatus(null);
          setUnreachable(reply.message);
        }
        if (!quiet || !reply.ok) setNote({ ok: reply.ok, text: reply.message });
        return reply.ok;
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        inFlight.current = false;
        if (!quiet) setBusy(false);
      }
    },
    [accept]
  );

  const start = useCallback(
    (target: number, force = false) => send('dry-run', force ? { target, force: true } : { target }),
    [send]
  );
  const stop = useCallback(() => send('dry-run-stop'), [send]);
  const setTestMode = useCallback(
    (enabled: boolean, force = false) => send('test-mode', { enabled, force }),
    [send]
  );

  const forceOf = (force: boolean) => (force ? { force: true } : {});
  const jog = useCallback(
    (joint: number, deltaDeg: number, force = false) => send('jog', { joint, delta_deg: deltaDeg, ...forceOf(force) }, true),
    [send]
  );
  const move = useCallback(
    (joint: number, targetDeg: number, force = false) => send('move', { joint, target_deg: targetDeg, ...forceOf(force) }, true),
    [send]
  );
  const home = useCallback((force = false) => send('home', forceOf(force)), [send]);
  const stopAll = useCallback(() => send('stop'), [send]);
  const startDiagnostic = useCallback(
    (scenarios: DiagnosticScenario[], durationS: number, joint: number, force = false) =>
      send('diagnostic', { scenarios, duration_s: durationS, joint, ...forceOf(force) }),
    [send]
  );
  const stopDiagnostic = useCallback(() => send('diagnostic-stop'), [send]);
  const resetBusStats = useCallback(() => send('bus-stats-reset'), [send]);

  return {
    status, unreachable, note, busy, statusAt, start, stop, setTestMode,
    jog, move, home, stopAll, startDiagnostic, stopDiagnostic, resetBusStats,
  };
}
