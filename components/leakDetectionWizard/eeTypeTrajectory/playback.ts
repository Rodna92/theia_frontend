import { ALL_TARGETS, RoutineSegment, RoutineTarget, TargetGroups, Vec3 } from './catalog';

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
  position: Vec3; // viewer coordinates
  bodyDir: Vec3; // unit vector, viewer coordinates
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
      return { target, ox: (gi - (order.length - 1) / 2) * TARGET_SPACING, ...pose, primary: true };
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

// Primary targets run one after the other, in the order they are given.
export function buildPlayback(placements: Placement[]): Playback {
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

  const poseAt = (t: number): Pose | null => {
    if (timeline.length === 0) return null;
    const clamped = Math.min(Math.max(t, 0), total);
    const entry =
      timeline.find((e) => clamped >= e.start && clamped < e.end) ?? timeline[timeline.length - 1];
    const u = entry.seg.duration > 0 ? (clamped - entry.start) / entry.seg.duration : 1;
    const s = smootherstep(u);
    const tip = unit(placeDir(entry.placement, unit(atParam(entry.seg.toolZ, s))));
    return {
      position: place(entry.placement, atParam(entry.seg.points, s)),
      bodyDir: [-tip[0], -tip[1], -tip[2]],
      label: `${entry.placement.target.index} · ${entry.seg.type}`,
    };
  };
  return { total, poseAt };
}
