// What the frontend knows about the workcell, as assembled server-side from the ROS graph
// (lib/server/rosbridge.ts) and streamed to the browser by /api/system/state.

// Published by the orchestrator (robot_app, bt_task_manager) on /theia/system_state:
//   BUSY     starting up, homing or running a cycle
//   IDLE     initial states reached, waiting for the external machine to request a cycle
//   STOPPED  stopped by the operator: every activity cancelled, cycle requests ignored
//   TEST     end-effector test mode (cycle locked)
// UNKNOWN: nothing received (stack down, or the orchestrator is not running).
export type SystemState = 'BUSY' | 'IDLE' | 'STOPPED' | 'TEST' | 'UNKNOWN';

export interface WorkcellSnapshot {
  // false: the frontend bridge (rosbridge in the robotics container) cannot be reached.
  bridge: boolean;
  systemState: SystemState;
  config: { mode: string; nTargets: number; nHansen: number } | null;
  // Progress of the cycle in flight; null outside a cycle.
  cycle: { scene: number; nScenes: number; target: number; nTargets: number; hansen: number; nHansen: number } | null;
  // Substate of the motion phase the control node is running right now (e.g. fine_approach).
  phase: string | null;
  vision: { label: string; message: string } | null;
  // From the orchestrator: the goal it currently holds on the vision node ("none" when none),
  // what its behavior tree is doing now, and the last event that made it change state.
  visionCommand: string | null;
  btState: string | null;
  lastEvent: string | null;
  srde: { state: string | null; cycleActive: boolean | null; recipe: string | null; expectedTargets: number | null; lastRead: string | null };
  // Names of the live ROS nodes (no leading slash); null when not known.
  nodes: string[] | null;
}

export type WorkcellCommand = 'start' | 'stop' | 'test';

export interface CommandResult {
  ok: boolean;
  message: string;
}

export const EMPTY_SNAPSHOT: WorkcellSnapshot = {
  bridge: false,
  systemState: 'UNKNOWN',
  config: null,
  cycle: null,
  phase: null,
  vision: null,
  visionCommand: null,
  btState: null,
  lastEvent: null,
  srde: { state: null, cycleActive: null, recipe: null, expectedTargets: null, lastRead: null },
  nodes: null,
};
