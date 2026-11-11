'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  EMPTY_SNAPSHOT,
  type CommandResult,
  type WorkcellCommand,
  type WorkcellSnapshot,
} from '@/client/types/workcell';

// Live state of the workcell (/api/system/state, Server-Sent Events) and the operator commands
// (/api/system/command). The page only observes: with the stack down or the bridge missing it
// shows "not reachable" and the browser keeps retrying on its own.
export function useWorkcellState() {
  const [snapshot, setSnapshot] = useState<WorkcellSnapshot>(EMPTY_SNAPSHOT);
  const [pending, setPending] = useState<WorkcellCommand | null>(null);
  const [commandError, setCommandError] = useState<string | null>(null);

  useEffect(() => {
    const source = new EventSource('/api/system/state');
    source.onmessage = (ev) => {
      try {
        setSnapshot(JSON.parse(ev.data) as WorkcellSnapshot);
      } catch {
        /* ignore a malformed event */
      }
    };
    // EventSource reconnects by itself; until it does, nothing is known.
    source.onerror = () => setSnapshot(EMPTY_SNAPSHOT);
    return () => source.close();
  }, []);

  const send = useCallback(async (command: WorkcellCommand) => {
    setPending(command);
    setCommandError(null);
    try {
      const res = await fetch('/api/system/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const result = (await res.json()) as CommandResult;
      if (!result.ok) setCommandError(result.message || null);
      return result.ok;
    } catch (e) {
      setCommandError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setPending(null);
    }
  }, []);

  return { snapshot, pending, commandError, send };
}
