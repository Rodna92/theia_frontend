export type Vec3 = [number, number, number];

// Parsed from the end-effector YAML files by /api/end-effectors.
export interface EndEffector {
  id: string;
  name: string;
  offsetZ: number;
  solver: string | null;
  jointCount: number;
}

// One timed step of a routine; samples are uniform in the step parameter (0..1).
export interface RoutineSegment {
  type: string;
  duration: number;
  points: Vec3[];
  toolZ: Vec3[];
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
