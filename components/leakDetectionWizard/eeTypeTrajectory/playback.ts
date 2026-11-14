import { ALL_TARGETS, JointChain, Quat, RoutineSegment, RoutineTarget, TargetGroups, Vec3 } from './catalog';

export const TARGET_SPACING = 0.2;

// Target-local coordinates are rotated 180 deg about the viewer Y axis (x -> -x, z -> -z) before
// being drawn; Y stays normal to the grid. Targets are only spread along X.
export const toScene = (p: Vec3, ox = 0): Vec3 => [-p[0] + ox, p[1], -p[2]];

// Direction of the tool body in the viewer: opposite to the tool Z axis, rotated like the geometry.
export const toolBodyDir = (z: Vec3): Vec3 => [z[0], -z[1], z[2]];

// Quintic smootherstep used by every step of the routine.
export const smootherstep = (u: number) => {
  const x = Math.min(Math.max(u, 0), 1);
  return x * x * x * (x * (6 * x - 15) + 10);
};

export interface Pose {
  position: Vec3; // tool tip, viewer coordinates
  // The tip frame's x, y, z axes (z = the direction the tip points), viewer coordinates.
  axes: [Vec3, Vec3, Vec3];
  // Tool joint angles [rad], as ee_app's IK would command them at this instant; [] for a rigid tool.
  joints: number[];
  label: string;
}

export interface Playback {
  total: number;
  poseAt: (t: number) => Pose | null;
}

const lerp3 = (a: Vec3, b: Vec3, s: number): Vec3 => [
  a[0] + (b[0] - a[0]) * s,
  a[1] + (b[1] - a[1]) * s,
  a[2] + (b[2] - a[2]) * s,
];

// Interpolates uniformly-spaced samples at parameter s in 0..1.
export function atParam(samples: Vec3[], s: number): Vec3 {
  if (samples.length === 1) return samples[0];
  const f = s * (samples.length - 1);
  const i = Math.min(Math.floor(f), samples.length - 2);
  return lerp3(samples[i], samples[i + 1], f - i);
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

// ---- Target placement (groups of associated targets) ----------------------------------------

type Mat3 = [number, number, number, number, number, number, number, number, number];

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const mulMat = (a: Mat3, b: Mat3): Mat3 => {
  const r = new Array(9).fill(0) as Mat3;
  for (let i = 0; i < 3; i++)
    for (let j = 0; j < 3; j++)
      for (let k = 0; k < 3; k++) r[i * 3 + j] += a[i * 3 + k] * b[k * 3 + j];
  return r;
};

const transpose = (m: Mat3): Mat3 => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];

const mulVec = (m: Mat3, v: Vec3): Vec3 => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];

// tf2 setRPY convention: R = Rz(yaw) * Ry(pitch) * Rx(roll), angles in degrees.
function rpy(rollDeg: number, pitchDeg: number, yawDeg: number): Mat3 {
  const [r, p, y] = [rollDeg, pitchDeg, yawDeg].map((d) => (d * Math.PI) / 180);
  const rx: Mat3 = [1, 0, 0, 0, Math.cos(r), -Math.sin(r), 0, Math.sin(r), Math.cos(r)];
  const ry: Mat3 = [Math.cos(p), 0, Math.sin(p), 0, 1, 0, -Math.sin(p), 0, Math.cos(p)];
  const rz: Mat3 = [Math.cos(y), -Math.sin(y), 0, Math.sin(y), Math.cos(y), 0, 0, 0, 1];
  return mulMat(rz, mulMat(ry, rx));
}

// Where a target is drawn: layout frame -> viewer, plus whether it is the one being played.
export interface Placement {
  target: RoutineTarget;
  ox: number;
  R: Mat3;
  t: Vec3;
  primary: boolean;
}

// Target-local point / direction -> viewer coordinates. The geometry is first turned 180 deg about
// Y (x -> -x, z -> -z) and then moved by the group association (R, t), so the member offsets
// are applied in the display frame, after the rotation.
export const place = (pl: Placement, p: Vec3): Vec3 => {
  const r = mulVec(pl.R, [-p[0], p[1], -p[2]]);
  return [r[0] + pl.t[0] + pl.ox, r[1] + pl.t[1], r[2] + pl.t[2]];
};
export const placeDir = (pl: Placement, d: Vec3): Vec3 => mulVec(pl.R, [-d[0], d[1], -d[2]]);

// Pose of target k (1-based) in its group anchor's frame: anchor_T_member = Translate * R(rpy).
function poseInAnchor(k: number, g: TargetGroups | null): { R: Mat3; t: Vec3 } {
  const anchor = g?.anchor[k - 1] ?? 0;
  if (!g || anchor === 0 || anchor === k) return { R: IDENTITY, t: [0, 0, 0] };
  return {
    R: rpy(g.roll[k - 1] ?? 0, g.pitch[k - 1] ?? 0, g.yaw[k - 1] ?? 0),
    t: [g.x[k - 1] ?? 0, g.y[k - 1] ?? 0, g.z[k - 1] ?? 0],
  };
}

const groupOf = (k: number, g: TargetGroups | null) => {
  const anchor = g?.anchor[k - 1] ?? 0;
  return anchor === 0 ? k : anchor;
};

// One target selected: it is drawn in its own frame with its group's other members around it
// (not played). All targets: each group is drawn in its anchor's frame, groups spread along X.
export function layoutPlacements(
  targets: RoutineTarget[],
  selected: string | null,
  groups: TargetGroups | null
): Placement[] {
  if (selected === ALL_TARGETS) {
    const order: number[] = [];
    targets.forEach((tg) => {
      const gid = groupOf(tg.index, groups);
      if (!order.includes(gid)) order.push(gid);
    });
    return targets.map((target) => {
      const pose = poseInAnchor(target.index, groups);
      const gi = order.indexOf(groupOf(target.index, groups));
      // Only enabled targets are played (disabled ones are usually swept by a composed routine).
      const primary = target.enabled !== false;
      return { target, ox: (gi - (order.length - 1) / 2) * TARGET_SPACING, ...pose, primary };
    });
  }
  const sel = targets.find((tg) => String(tg.index) === selected);
  if (!sel) return [];
  const gid = groupOf(sel.index, groups);
  const ref = poseInAnchor(sel.index, groups);
  const refInv = transpose(ref.R);
  return targets
    .filter((tg) => groupOf(tg.index, groups) === gid)
    .map((target) => {
      const m = poseInAnchor(target.index, groups);
      const d: Vec3 = [m.t[0] - ref.t[0], m.t[1] - ref.t[1], m.t[2] - ref.t[2]];
      return {
        target,
        ox: 0,
        R: mulMat(refInv, m.R),
        t: mulVec(refInv, d),
        primary: target.index === sel.index,
      };
    });
}

interface Entry {
  start: number;
  end: number;
  placement: Placement;
  seg: RoutineSegment;
}

// Orientation samples (uniform in s) at parameter s: normalised lerp between the two neighbours.
function quatAt(samples: Quat[], s: number): Quat {
  if (samples.length === 1) return samples[0];
  const f = s * (samples.length - 1);
  const i = Math.min(Math.floor(f), samples.length - 2);
  const a = samples[i];
  const b = samples[i + 1];
  const sign = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -1 : 1;
  const k = f - i;
  const q = a.map((v, j) => v + (sign * b[j] - v) * k) as Quat;
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

const rotate = (q: Quat, v: Vec3): Vec3 => {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx),
  ];
};

// Step of the joint simulation [s] (ee_app's routine rate).
const JOINT_DT = 0.02;

// The joint angle over the whole timeline, as ee_app's REndEffectorSolver commands it ("follow"
// mode): the part of the commanded tilt that is a turn about the joint axis (swing-twist split of
// the tip orientation relative to the target's own), limited to the usable range, blended in over
// engage_time_s at each routine's start and never faster than max_joint_speed. `quatAt(t)` is the
// commanded tip orientation in the target's frame; `routineAt(t)` tells the routines apart.
function simulateJoint(
  chain: JointChain,
  total: number,
  quatAtTime: (t: number) => Quat,
  routineAt: (t: number) => unknown
): Float64Array {
  const n = Math.max(1, Math.ceil(total / JOINT_DT)) + 1;
  const out = new Float64Array(n);
  const clamp = (q: number) => Math.min(Math.max(q, chain.min), chain.max);
  let q = chain.follow ? chain.home : chain.hold;
  let twist = 0;
  let offset = 0;
  let engageT = 0;
  let routine: unknown;
  for (let i = 0; i < n; i++) {
    const t = Math.min(i * JOINT_DT, total);
    if (chain.follow) {
      const d = quatAtTime(t);
      const current = routineAt(t);
      const starting = i === 0 || current !== routine;
      routine = current;
      if (starting) twist = 0;
      const along = d[0] * chain.axis[0] + d[1] * chain.axis[1] + d[2] * chain.axis[2];
      if (Math.hypot(along, d[3]) > 1e-9) {
        let tw = 2 * Math.atan2(along, d[3]);
        // Same turn, the representative nearest the previous one.
        tw -= 2 * Math.PI * Math.round((tw - twist) / (2 * Math.PI));
        twist = tw;
      }
      const wanted = clamp(chain.home + twist);
      if (starting) {
        offset = q - wanted;
        engageT = 0;
      } else {
        engageT += JOINT_DT;
      }
      const fade = chain.engageTime > 0 ? 1 - smootherstep(engageT / chain.engageTime) : 0;
      const goal = clamp(wanted + offset * fade);
      const step = starting ? 0 : chain.maxSpeed * JOINT_DT;
      q = clamp(q + Math.min(Math.max(goal - q, -step), step));
    }
    out[i] = q;
  }
  return out;
}

// Primary targets run one after the other, in the order they are given. `chain`: the tool's joint
// model when it has one (its angle is then simulated along the routines).
export function buildPlayback(placements: Placement[], chain: JointChain | null = null): Playback {
  const timeline: Entry[] = [];
  let total = 0;
  placements
    .filter((pl) => pl.primary)
    .forEach((placement) => {
      for (const seg of placement.target.segments) {
        timeline.push({ start: total, end: total + seg.duration, placement, seg });
        total += seg.duration;
      }
    });

  // The step running at time t and its eased parameter.
  const at = (t: number) => {
    const clamped = Math.min(Math.max(t, 0), total);
    const entry =
      timeline.find((e) => clamped >= e.start && clamped < e.end) ?? timeline[timeline.length - 1];
    const u = entry.seg.duration > 0 ? (clamped - entry.start) / entry.seg.duration : 1;
    return { entry, s: smootherstep(u) };
  };

  const jointTrack =
    chain && timeline.length > 0
      ? simulateJoint(
          chain,
          total,
          (t) => {
            const { entry, s } = at(t);
            return quatAt(entry.seg.quat, s);
          },
          (t) => at(t).entry.placement
        )
      : null;
  const jointAt = (t: number): number => {
    if (!jointTrack) return 0;
    const f = Math.min(Math.max(t, 0), total) / JOINT_DT;
    const i = Math.min(Math.floor(f), jointTrack.length - 2);
    if (i < 0) return jointTrack[0];
    return jointTrack[i] + (jointTrack[i + 1] - jointTrack[i]) * Math.min(f - i, 1);
  };

  const poseAt = (t: number): Pose | null => {
    if (timeline.length === 0) return null;
    const { entry, s } = at(t);
    const q = quatAt(entry.seg.quat, s);
    const axis = (v: Vec3) => unit(placeDir(entry.placement, rotate(q, v)));
    const part = entry.seg.part;
    // Composed routines: "5 · 1/3 → 4 · arc" (part 1 of 3, sweeping target 4).
    const partLabel = part
      ? ` · ${part.n}/${part.of}${part.target !== null ? ` → ${part.target}` : ''}`
      : '';
    return {
      position: place(entry.placement, atParam(entry.seg.points, s)),
      axes: [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])],
      joints: jointTrack ? [jointAt(t)] : [],
      label: `${entry.placement.target.index}${partLabel} · ${entry.seg.type}`,
    };
  };
  return { total, poseAt };
}
