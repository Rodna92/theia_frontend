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

export interface LiveStatus {
  system_state: 'BUSY' | 'IDLE' | 'TEST' | 'UNKNOWN';
  test_mode: boolean;
  can_enter: boolean;
  end_effector_type: string;
  servo: {
    available: boolean;
    reason: string;
    connected: boolean;
    error: string;
    joints: LiveJoint[];
  };
  // Absent on an ee_test_node older than the routine test.
  dry_run?: LiveDryRun;
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
}

// Polls the test node while `active`, faster while a routine test runs.
export function useEeLiveTest(active: boolean): LiveTest {
  const [status, setStatus] = useState<LiveStatus | null>(null);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [note, setNote] = useState<LiveNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusAt, setStatusAt] = useState(0);
  const inFlight = useRef(false);
  const running = !!status?.dry_run?.running;
  const runningRef = useRef(false);
  runningRef.current = running;

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
    const timer = setInterval(refresh, running ? POLL_RUNNING_MS : POLL_IDLE_MS);
    return () => clearInterval(timer);
  }, [active, running, refresh]);

  // Leaving the page (or disconnecting) must not leave the tool running a routine.
  useEffect(() => {
    if (!active) return;
    return () => {
      if (!runningRef.current) return;
      fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'dry-run-stop' }),
        keepalive: true,
      }).catch(() => undefined);
    };
  }, [active]);

  const send = useCallback(
    async (action: string, body: Record<string, unknown> = {}): Promise<boolean> => {
      inFlight.current = true;
      setBusy(true);
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
        setNote({ ok: reply.ok, text: reply.message });
        return reply.ok;
      } catch (e) {
        setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
        return false;
      } finally {
        inFlight.current = false;
        setBusy(false);
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

  return { status, unreachable, note, busy, statusAt, start, stop, setTestMode };
}
