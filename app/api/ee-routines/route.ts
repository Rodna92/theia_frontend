import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'yaml';
import { workcellPaths } from '@/lib/server/workcellPaths';

export const dynamic = 'force-dynamic';

const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

type Vec3 = [number, number, number];
type Step = Record<string, unknown> & { type: string };

interface Segment {
  type: string;
  duration: number;
  // Samples uniform in the step's parameter s (0..1); the client applies the quintic easing.
  // `points` and `toolZ` may have different lengths.
  points: Vec3[];
  toolZ: Vec3[];
  // Full tool orientation (target-local), one per toolZ sample: the jointed tools' IK needs more
  // than the tip direction.
  quat: Quat[];
  // Set on `segments:` targets: which part of the composed routine this step belongs to.
  part?: SegmentPart;
}

interface SegmentPart {
  n: number; // 1-based
  of: number;
  target: number | null; // the reused target (`target: N`), null for `use` / `steps` parts
}

// A sub-frame of the target (`frame` step / segment frame_* keys), target-local:
// T_target_sub = Translate(t) * R, with R = Rz(yaw) * Ry(pitch) * Rx(roll).
interface SubFrame {
  t: Vec3;
  R: [Vec3, Vec3, Vec3]; // columns: the sub-frame's x, y, z axes in the target frame
  q: Quat; // the same rotation
}

// Quaternion [x, y, z, w].
type Quat = [number, number, number, number];

type RoutineBody = { use?: string; with?: Record<string, unknown>; steps?: Step[] };
type SegmentDef = RoutineBody & { target?: number; frame_offset_m?: Vec3; frame_rpy_deg?: Vec3 };
type TargetDef = RoutineBody & { segments?: SegmentDef[] };

interface ApproachView {
  offset_m?: Vec3;
  rpy_deg?: Vec3;
  offset_fine_m?: Vec3;
  rpy_fine_deg?: Vec3;
}

const AXES: Record<string, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const IDENTITY_Z: Vec3 = [0, 0, 1];
// Used only when the file has no approach_views entry for a target.
const FALLBACK_START: Vec3 = [0, 0, -0.28];

// "xy", "-z-x": two axes, each optionally negated -> [u (0 deg), v (90 deg)].
function parsePlane(plane: string): [Vec3, Vec3] {
  const m = plane.match(/^(-?)([xyz])(-?)([xyz])$/);
  if (!m) return [AXES.x, AXES.y];
  const axis = (neg: string, a: string): Vec3 => AXES[a].map((c) => (neg ? -c : c)) as Vec3;
  return [axis(m[1], m[2]), axis(m[3], m[4])];
}

// "x", "-y": a signed target-local axis.
function parseAxis(a: unknown): Vec3 {
  const m = String(a ?? '').match(/^(-?)([xyz])$/);
  if (!m) return AXES.x;
  return AXES[m[2]].map((c) => (m[1] ? -c : c)) as Vec3;
}

// Replace "${name}" / "${name:default}" placeholders with the target's `with` values.
function substitute(value: unknown, vars: Record<string, unknown>): unknown {
  if (typeof value === 'string') {
    const m = value.match(/^\$\{(\w+)(?::([^}]*))?\}$/);
    if (m) {
      if (m[1] in vars) return vars[m[1]];
      return m[2] !== undefined ? parseFloat(m[2]) : value;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => substitute(v, vars));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substitute(v, vars)]));
  }
  return value;
}

const rad = (d: number) => (d * Math.PI) / 180;
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

// ---- Quaternions: the tool orientation, composed exactly as ee_app's SequenceRoutine does ----

const Q_ID: Quat = [0, 0, 0, 1];

const qMul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];

// Rotation by `angle` about the unit axis k.
const qAxisAngle = (k: Vec3, angle: number): Quat => {
  const s = Math.sin(angle / 2);
  return [k[0] * s, k[1] * s, k[2] * s, Math.cos(angle / 2)];
};

const qRotate = (q: Quat, v: Vec3): Vec3 => {
  const u: Vec3 = [q[0], q[1], q[2]];
  const t = cross(u, v);
  const tt: Vec3 = [2 * t[0], 2 * t[1], 2 * t[2]];
  const c = cross(u, tt);
  return [v[0] + q[3] * tt[0] + c[0], v[1] + q[3] * tt[1] + c[1], v[2] + q[3] * tt[2] + c[2]];
};

// Rotation matrix given by its columns (the frame's x, y, z axes) -> quaternion.
function qFromAxes(x: Vec3, y: Vec3, z: Vec3): Quat {
  const tr = x[0] + y[1] + z[2];
  let q: Quat;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    q = [(y[2] - z[1]) / s, (z[0] - x[2]) / s, (x[1] - y[0]) / s, s / 4];
  } else if (x[0] > y[1] && x[0] > z[2]) {
    const s = Math.sqrt(1 + x[0] - y[1] - z[2]) * 2;
    q = [s / 4, (y[0] + x[1]) / s, (z[0] + x[2]) / s, (y[2] - z[1]) / s];
  } else if (y[1] > z[2]) {
    const s = Math.sqrt(1 + y[1] - x[0] - z[2]) * 2;
    q = [(y[0] + x[1]) / s, s / 4, (z[1] + y[2]) / s, (z[0] - x[2]) / s];
  } else {
    const s = Math.sqrt(1 + z[2] - x[0] - y[1]) * 2;
    q = [(z[0] + x[2]) / s, (z[1] + y[2]) / s, s / 4, (x[1] - y[0]) / s];
  }
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// Shortest-path spherical interpolation (as Eigen's Quaternion::slerp).
function qSlerp(a: Quat, b: Quat, s: number): Quat {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const sign = d < 0 ? -1 : 1;
  d = Math.min(Math.abs(d), 1);
  let k0 = 1 - s;
  let k1 = s;
  if (d < 1 - 1e-9) {
    const th = Math.acos(d);
    k0 = Math.sin((1 - s) * th) / Math.sin(th);
    k1 = Math.sin(s * th) / Math.sin(th);
  }
  k1 *= sign;
  const q: Quat = [k0 * a[0] + k1 * b[0], k0 * a[1] + k1 * b[1], k0 * a[2] + k1 * b[2], k0 * a[3] + k1 * b[3]];
  const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / n, q[1] / n, q[2] / n, q[3] / n];
}

// Rz(yaw) * Ry(pitch) * Rx(roll), angles in degrees.
const qRpy = (rpyDeg: Vec3): Quat =>
  qMul(qAxisAngle(AXES.z, rad(rpyDeg[2])), qMul(qAxisAngle(AXES.y, rad(rpyDeg[1])), qAxisAngle(AXES.x, rad(rpyDeg[0]))));

const zOf = (q: Quat): Vec3 => normalize(qRotate(q, IDENTITY_Z));

const ID_FRAME: SubFrame = { t: [0, 0, 0], R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], q: Q_ID };

function subFrame(offset: unknown, rpyDeg: unknown): SubFrame {
  const o = Array.isArray(offset) ? offset.map((v) => Number(v) || 0) : [0, 0, 0];
  const rpy = (Array.isArray(rpyDeg) ? rpyDeg : [0, 0, 0]).map((d) => Number(d) || 0);
  const q = qRpy([rpy[0] ?? 0, rpy[1] ?? 0, rpy[2] ?? 0]);
  return {
    t: [o[0] ?? 0, o[1] ?? 0, o[2] ?? 0],
    R: [qRotate(q, AXES.x), qRotate(q, AXES.y), qRotate(q, AXES.z)],
    q,
  };
}

// Sub-frame direction / point -> target frame.
const fDir = (f: SubFrame, v: Vec3): Vec3 => [
  f.R[0][0] * v[0] + f.R[1][0] * v[1] + f.R[2][0] * v[2],
  f.R[0][1] * v[0] + f.R[1][1] * v[1] + f.R[2][1] * v[2],
  f.R[0][2] * v[0] + f.R[1][2] * v[1] + f.R[2][2] * v[2],
];
const fPoint = (f: SubFrame, p: Vec3): Vec3 => {
  const d = fDir(f, p);
  return [d[0] + f.t[0], d[1] + f.t[1], d[2] + f.t[2]];
};

function sampleArc(step: Step): { points: Vec3[]; quat: Quat[] } {
  const r = (Number(step.diameter_m) || 0) / 2;
  const [u, v] = parsePlane(String(step.plane ?? 'xy'));
  const w = cross(u, v); // sweep-plane normal
  const a0 = rad(Number(step.start_angle_deg) || 0);
  const sweep = rad(Number(step.sweep_deg ?? 360) || 0);
  const off = (step.target_offset_m as Vec3 | undefined) ?? [0, 0, 0];
  const lookAt = step.orient_toward_center === true;
  const tilt = rad(Number(step.tilt_toward_center_deg) || 0);
  const tiltOut = rad(Number(step.tilt_out_of_plane_deg) || 0);
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
  const points: Vec3[] = [];
  const quat: Quat[] = [];
  // Turn q about `axis` (when it is not degenerate), on top of what it already is.
  const turned = (q: Quat, axis: Vec3, angle: number): Quat =>
    Math.hypot(axis[0], axis[1], axis[2]) > 1e-9 ? qMul(qAxisAngle(normalize(axis), angle), q) : q;
  for (let i = 0; i <= n; i++) {
    const a = a0 + (sweep * i) / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    points.push([
      off[0] + r * (u[0] * c + v[0] * s),
      off[1] + r * (u[1] * c + v[1] * s),
      off[2] + r * (u[2] * c + v[2] * s),
    ]);
    // Direction from the arc point back to the centre (in the sweep plane).
    const toCenter = normalize([
      -(u[0] * c + v[0] * s),
      -(u[1] * c + v[1] * s),
      -(u[2] * c + v[2] * s),
    ]);
    // Look-at-centre: tool Z points at the centre and the sweep-plane normal completes the frame
    // (it only ever turns about that normal); otherwise the target's own orientation.
    let q: Quat = Q_ID;
    if (lookAt) {
      const x = normalize(cross(w, toCenter));
      q = qFromAxes(x, cross(toCenter, x), toCenter);
    }
    // Constant lean toward the centre, then the progressive lean out of the sweep plane (applied
    // last): 0 at the arc's midpoint, the full value at both ends (sigma^2, sigma = -1..+1); the
    // tip turns toward -w, i.e. the tool body leans toward +w.
    if (tilt !== 0) q = turned(q, cross(zOf(q), toCenter), tilt);
    const sigma = (2 * i) / n - 1;
    if (tiltOut !== 0 && sweep !== 0) q = turned(q, cross(zOf(q), w), -sigma * sigma * tiltOut);
    quat.push(q);
  }
  return { points, quat };
}

// Builds the path polyline and the timed segments of a routine, starting from the approach pose.
// Everything is returned in the target frame: each step's geometry is computed in the sub-frame in
// force (set by `frame` steps; the target's own frame until the first one) and mapped back.
function sample(
  steps: Step[],
  defaults: Record<string, Record<string, unknown>>,
  start: { p: Vec3; q: Quat }
): { points: Vec3[]; startToolZ: Vec3 | null; segments: Segment[] } {
  const merged = steps.map((raw) => ({ ...(defaults[raw.type] ?? {}), ...raw }) as Step);
  const frames: SubFrame[] = [];
  let current = ID_FRAME;
  merged.forEach((step) => {
    if (step.type === 'frame') current = subFrame(step.offset_m, step.rpy_deg);
    frames.push(current);
  });
  // Arc step j sampled in its own sub-frame, in target-frame coordinates.
  const arcAt = (j: number) => {
    const arc = sampleArc(merged[j]);
    return {
      points: arc.points.map((p) => fPoint(frames[j], p)),
      quat: arc.quat.map((q) => qMul(frames[j].q, q)),
    };
  };

  const pts: Vec3[] = [start.p];
  const segments: Segment[] = [];
  let curP: Vec3 = start.p;
  let curQ: Quat = start.q;
  // Moves that turn the tool are sampled this finely (uniform in the step parameter).
  const TURN_SAMPLES = 16;

  merged.forEach((step, idx) => {
    const f = frames[idx];
    const part = step.__part as SegmentPart | undefined;
    const num = (key: string, fallback: number) => {
      const x = Number(step[key]);
      return Number.isFinite(x) ? x : fallback;
    };
    // The tip direction (toolZ) is the Z axis of each orientation sample.
    const push = (seg: Omit<Segment, 'toolZ'>) => {
      const full: Segment = { ...seg, toolZ: seg.quat.map(zOf) };
      segments.push(part ? { ...full, part } : full);
    };
    if (step.type === 'arc') {
      const arc = arcAt(idx);
      pts.push(...arc.points);
      push({ type: 'arc', duration: num('duration_s', 4), ...arc });
      curP = arc.points[arc.points.length - 1];
      curQ = arc.quat[arc.quat.length - 1];
    } else if (step.type === 'line' || step.type === 'retract') {
      let to: Vec3 | null = null;
      if (step.type === 'line' && Array.isArray(step.to_m)) to = step.to_m as Vec3;
      if (step.type === 'retract') {
        const off = (step.target_offset_m as Vec3 | undefined) ?? [0, 0, 0];
        const dist = num('distance_m', 0);
        if (dist > 0) to = [off[0], off[1], off[2] - dist];
      }
      if (!to) return;
      to = fPoint(f, to);
      pts.push(to);
      const keep = step.type === 'line' && step.orient === 'keep';
      const dest = keep ? curQ : f.q;
      const rotDeg = step.type === 'line' ? num('rotate_deg', 0) : 0;
      const axis = fDir(f, parseAxis(step.rotate_axis));
      // `orient` blends the tool to the (sub-)frame orientation (or keeps it); rotate_axis/rotate_deg
      // turns it about a frame-local axis on top, progressively over the move.
      const quat: Quat[] = [];
      const n = rotDeg !== 0 || !keep ? TURN_SAMPLES : 1;
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        quat.push(qMul(qAxisAngle(axis, rad(rotDeg) * s), qSlerp(curQ, dest, s)));
      }
      push({
        type: step.type,
        duration: num('duration_s', 1.5),
        points: [curP, to],
        quat,
      });
      curP = to;
      curQ = quat[quat.length - 1];
    } else if (step.type === 'move_to_start') {
      // Blend from the current pose (the approach pose, or the previous step's end) to the start of
      // the next arc, which may sit in another sub-frame.
      const j = merged.findIndex((s, k) => k > idx && s.type === 'arc');
      if (j < 0) return;
      const arc = arcAt(j);
      const quat: Quat[] = [];
      for (let i = 0; i <= TURN_SAMPLES; i++) quat.push(qSlerp(curQ, arc.quat[0], i / TURN_SAMPLES));
      push({
        type: 'move_to_start',
        duration: num('blend_s', 1.5),
        points: [curP, arc.points[0]],
        quat,
      });
      curP = arc.points[0];
      curQ = arc.quat[0];
    } else if (step.type === 'rotate') {
      // Turn the tool in place about a frame-local axis (right-hand rule).
      const axis = fDir(f, parseAxis(step.axis));
      const angle = rad(num('angle_deg', 0));
      const quat: Quat[] = [];
      for (let i = 0; i <= TURN_SAMPLES; i++) {
        quat.push(qMul(qAxisAngle(axis, (angle * i) / TURN_SAMPLES), curQ));
      }
      push({ type: 'rotate', duration: num('duration_s', 1.5), points: [curP, curP], quat });
      curQ = quat[quat.length - 1];
    } else if (step.type === 'pause' || step.type === 'settle') {
      const duration = step.type === 'pause' ? num('duration_s', 0) : num('timeout_s', 2);
      push({ type: step.type, duration, points: [curP, curP], quat: [curQ, curQ] });
    } else if (step.type === 'handover' || step.type === 'release') {
      // Zero-time markers: the scan is done / the next target's approach may take over.
      push({ type: step.type, duration: 0, points: [curP, curP], quat: [curQ, curQ] });
    }
    // `frame` steps take no time; they only set the sub-frame of the following steps (above).
  });
  return { points: pts, startToolZ: zOf(start.q), segments };
}

// Returns the per-target routines of <ROUTINES_DIR>/<equipment>/<endEffector>.yaml in the
// target-local frame (+Z points into the panel, so outward is -Z). Each routine starts at the
// target's approach view (approach_views: FINE_APPROACH standoff, defaulting to the coarse one).
export async function GET(req: NextRequest) {
  const dir = workcellPaths.eeRoutinesDir();
  const equipment = req.nextUrl.searchParams.get('equipment') ?? '';
  const endEffector = req.nextUrl.searchParams.get('endEffector') ?? '';
  if (!SAFE_NAME.test(equipment) || !SAFE_NAME.test(endEffector)) {
    return NextResponse.json({ error: 'Invalid equipment or end-effector name', targets: [] }, { status: 400 });
  }
  const file = path.join(dir, equipment, `${endEffector}.yaml`);
  try {
    const doc = parse(await fs.readFile(file, 'utf8')) as {
      defaults?: Record<string, Record<string, unknown>>;
      templates?: Record<string, Step[]>;
      targets?: Record<string, TargetDef>;
      approach_views?: Record<string, ApproachView>;
      target_selection?: Record<string, boolean>;
    };
    const defaults = doc.defaults ?? {};
    const defs = doc.targets ?? {};
    // { use (+ with) } or { steps } -> its step list, placeholders filled in.
    const body = (def: RoutineBody): Step[] => {
      const steps = (def.steps ?? (def.use ? doc.templates?.[def.use] : []) ?? []) as Step[];
      return substitute(steps, def.with ?? {}) as Step[];
    };
    // `segments:` targets run several routines back to back, each in a fixed sub-frame of the
    // target (a frame step in front of every part, as ee_app's loader does). `target: N` reuses
    // target N's routine. handover / release markers are kept only from the last part.
    const resolve = (def: TargetDef): Step[] => {
      if (!Array.isArray(def.segments)) return body(def);
      const parts = def.segments;
      return parts.flatMap((seg, n) => {
        const ref = seg.target !== undefined ? defs[String(seg.target)] : undefined;
        const steps = seg.target === undefined ? body(seg) : ref && !ref.segments ? body(ref) : [];
        const part: SegmentPart = { n: n + 1, of: parts.length, target: seg.target ?? null };
        const last = n === parts.length - 1;
        return [
          { type: 'frame', offset_m: seg.frame_offset_m, rpy_deg: seg.frame_rpy_deg },
          ...steps.filter((s) => last || (s.type !== 'handover' && s.type !== 'release')),
        ].map((s) => ({ ...s, __part: part }) as Step);
      });
    };
    const selection = doc.target_selection;
    const targets = Object.entries(defs).map(([index, def]) => {
      const template = def.use ?? null;
      const resolved = resolve(def);
      const view = doc.approach_views?.[index];
      const startP = view?.offset_fine_m ?? view?.offset_m ?? FALLBACK_START;
      const startRpy = view?.rpy_fine_deg ?? view?.rpy_deg ?? [0, 0, 0];
      const { points, startToolZ, segments } = sample(resolved, defaults, {
        p: startP,
        // q_target * Rz(yaw) * Ry(pitch) * Rx(roll), in target-local axes.
        q: qRpy(startRpy),
      });
      return {
        index: Number(index),
        template,
        diameterM: def.with?.diameter_m ?? (resolved.find((s) => s.type === 'arc')?.diameter_m ?? null),
        points,
        startToolZ,
        segments,
        // No target_selection = every target enabled (as in ee_app).
        enabled: selection ? selection[index] === true : true,
        // Composed targets: per part, the target it sweeps (this target for use / steps parts) and
        // its sub-frame (origin + x, y, z axes), target-local.
        parts: Array.isArray(def.segments)
          ? def.segments.map((seg) => {
              const f = subFrame(seg.frame_offset_m, seg.frame_rpy_deg);
              return { target: seg.target ?? Number(index), origin: f.t, axes: f.R };
            })
          : null,
      };
    });
    return NextResponse.json({ file, targets });
  } catch (e) {
    return NextResponse.json(
      { file, targets: [], error: e instanceof Error ? e.message : 'Cannot read routine file' },
      { status: 404 }
    );
  }
}
