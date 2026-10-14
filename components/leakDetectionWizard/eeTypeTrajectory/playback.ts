import { RoutineSegment, RoutineTarget, Vec3 } from './catalog';

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
function atParam(samples: Vec3[], s: number): Vec3 {
  if (samples.length === 1) return samples[0];
  const f = s * (samples.length - 1);
  const i = Math.min(Math.floor(f), samples.length - 2);
  return lerp3(samples[i], samples[i + 1], f - i);
}

const unit = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

interface Entry {
  start: number;
  end: number;
  target: RoutineTarget;
  ox: number;
  seg: RoutineSegment;
}

// Targets run one after the other, in the order they are displayed.
export function buildPlayback(shown: RoutineTarget[], single: boolean): Playback {
  const timeline: Entry[] = [];
  let total = 0;
  shown.forEach((target, i) => {
    const ox = single ? 0 : (i - (shown.length - 1) / 2) * TARGET_SPACING;
    for (const seg of target.segments) {
      timeline.push({ start: total, end: total + seg.duration, target, ox, seg });
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
    return {
      position: toScene(atParam(entry.seg.points, s), entry.ox),
      bodyDir: unit(toolBodyDir(unit(atParam(entry.seg.toolZ, s)))),
      label: `${entry.target.index} · ${entry.seg.type}`,
    };
  };
  return { total, poseAt };
}
