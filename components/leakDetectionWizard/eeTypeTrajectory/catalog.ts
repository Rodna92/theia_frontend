export type Vec3 = [number, number, number];

// Parsed from the end-effector YAML files by /api/end-effectors.
export interface EndEffector {
  id: string;
  name: string;
  offsetZ: number;
  solver: string | null;
  jointCount: number;
  // Set for the one-joint tool (solver "r_end_effector"); null = drawn as a rigid tool.
  chain: JointChain | null;
}

// Quaternion [x, y, z, w].
export type Quat = [number, number, number, number];

// tool0 --link1 along Z--> revolute joint (axis, tool0 frame) --link2--> tip, and how ee_app's
// solver uses the joint (angles in rad).
export interface JointChain {
  link1: number;
  link2: number;
  axis: Vec3;
  home: number;
  // Usable range (operational limits and permitted servo counts).
  min: number;
  max: number;
  maxSpeed: number; // rad/s
  engageTime: number; // s
  // true: the joint does the tilt about its own axis; false: it stays at `hold` (hold mode, or
  // joint commands disabled = nominal mode).
  follow: boolean;
  hold: number;
}

// One timed step of a routine; samples are uniform in the step parameter (0..1).
export interface RoutineSegment {
  type: string;
  duration: number;
  points: Vec3[];
  toolZ: Vec3[];
  // Full tool orientation (target-local), sampled like toolZ.
  quat: Quat[];
  // Composed (`segments:`) targets: the part this step belongs to; target = the reused target.
  part?: { n: number; of: number; target: number | null };
}

// One part of a composed routine: the target it sweeps and its fixed sub-frame (target-local).
export interface RoutinePart {
  target: number;
  origin: Vec3;
  axes: [Vec3, Vec3, Vec3]; // sub-frame x, y, z axes
}

// One target of a routine file (/api/ee-routines); points are in the target-local frame.
export interface RoutineTarget {
  index: number;
  template: string | null;
  diameterM: number | null;
  points: Vec3[];
  // Tool Z axis (target-local) at the start of the path; null = target's own orientation.
  startToolZ: Vec3 | null;
  segments: RoutineSegment[];
  // target_selection of the routine file: disabled targets are not visited by the robot.
  enabled: boolean;
  // Set when the routine is composed of other routines (`segments:`), in run order.
  parts: RoutinePart[] | null;
}

export const ALL_TARGETS = 'all';
export const EQUIPMENT_ID = 'ariston_a';
export const MODALITY = 'aldm';

// Target-group associations of the vision node (/api/ee-target-groups), indexed by target - 1.
export interface TargetGroups {
  anchor: number[];
  x: number[];
  y: number[];
  z: number[];
  roll: number[];
  pitch: number[];
  yaw: number[];
}
