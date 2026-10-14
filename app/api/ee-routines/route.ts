import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'yaml';

export const dynamic = 'force-dynamic';

const DEFAULT_DIR = 'X:/dev/FT-Theia/FT_Workcell_End_Effector/config/routines/aldm';
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

type Vec3 = [number, number, number];
type Step = Record<string, unknown> & { type: string };

interface Segment {
  type: string;
  duration: number;
  // Samples uniform in the step's parameter s (0..1); the client applies the quintic easing.
  points: Vec3[];
  toolZ: Vec3[];
}

const AXES: Record<string, Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
const IDENTITY_Z: Vec3 = [0, 0, 1];
// Every routine starts with the tool 0.28 m outward of the target (target-local -Z), upright.
const START_POSE: Vec3 = [0, 0, -0.28];

// "xy", "-z-x": two axes, each optionally negated -> [u (0 deg), v (90 deg)].
function parsePlane(plane: string): [Vec3, Vec3] {
  const m = plane.match(/^(-?)([xyz])(-?)([xyz])$/);
  if (!m) return [AXES.x, AXES.y];
  const axis = (neg: string, a: string): Vec3 => AXES[a].map((c) => (neg ? -c : c)) as Vec3;
  return [axis(m[1], m[2]), axis(m[3], m[4])];
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

const normalize = (v: Vec3): Vec3 => {
  const n = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / n, v[1] / n, v[2] / n];
};

function sampleArc(step: Step): { points: Vec3[]; toolZ: Vec3[] } {
  const r = (Number(step.diameter_m) || 0) / 2;
  const [u, v] = parsePlane(String(step.plane ?? 'xy'));
  const a0 = ((Number(step.start_angle_deg) || 0) * Math.PI) / 180;
  const sweep = ((Number(step.sweep_deg ?? 360) || 0) * Math.PI) / 180;
  const off = (step.target_offset_m as Vec3 | undefined) ?? [0, 0, 0];
  const lookAt = step.orient_toward_center === true;
  const tilt = ((Number(step.tilt_toward_center_deg) || 0) * Math.PI) / 180;
  const n = Math.max(8, Math.ceil(Math.abs(sweep) / (Math.PI / 24)));
  const points: Vec3[] = [];
  const toolZ: Vec3[] = [];
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
    // Look-at-centre: tool Z points at the centre; otherwise the target's own orientation.
    let z: Vec3 = lookAt ? toCenter : IDENTITY_Z;
    if (tilt !== 0) {
      // tilt_toward_center_deg: lean the tool Z axis toward the centre by a constant angle, about
      // the axis perpendicular to both Z and the direction to the centre.
      const dot = z[0] * toCenter[0] + z[1] * toCenter[1] + z[2] * toCenter[2];
      const perp: Vec3 = [
        toCenter[0] - dot * z[0],
        toCenter[1] - dot * z[1],
        toCenter[2] - dot * z[2],
      ];
      if (Math.hypot(perp[0], perp[1], perp[2]) > 1e-9) {
        const pn = normalize(perp);
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        z = normalize([
          ct * z[0] + st * pn[0],
          ct * z[1] + st * pn[1],
          ct * z[2] + st * pn[2],
        ]);
      }
    }
    toolZ.push(z);
  }
  return { points, toolZ };
}

// Builds the path polyline, the tool Z axis at its start and the timed segments of a routine.
function sample(
  steps: Step[],
  defaults: Record<string, Record<string, unknown>>
): { points: Vec3[]; startToolZ: Vec3 | null; segments: Segment[] } {
  const merged = steps.map((raw) => ({ ...(defaults[raw.type] ?? {}), ...raw }) as Step);
  const pts: Vec3[] = [START_POSE];
  const segments: Segment[] = [];
  let startToolZ: Vec3 | null = null;
  let curP: Vec3 | null = START_POSE;
  let curZ: Vec3 = IDENTITY_Z;

  merged.forEach((step, idx) => {
    const num = (key: string, fallback: number) => {
      const x = Number(step[key]);
      return Number.isFinite(x) ? x : fallback;
    };
    if (step.type === 'arc') {
      const arc = sampleArc(step);
            pts.push(...arc.points);
      segments.push({ type: 'arc', duration: num('duration_s', 4), ...arc });
      curP = arc.points[arc.points.length - 1];
      curZ = arc.toolZ[arc.toolZ.length - 1];
    } else if (step.type === 'line' || step.type === 'retract') {
      let to: Vec3 | null = null;
      if (step.type === 'line' && Array.isArray(step.to_m)) to = step.to_m as Vec3;
      if (step.type === 'retract') {
        const off = (step.target_offset_m as Vec3 | undefined) ?? [0, 0, 0];
        const dist = num('distance_m', 0);
        if (dist > 0) to = [off[0], off[1], off[2] - dist];
      }
      if (!to) return;
      pts.push(to);
      const keep = step.type === 'line' && step.orient === 'keep';
      const nextZ = keep ? curZ : IDENTITY_Z;
      segments.push({
        type: step.type,
        duration: num('duration_s', 1.5),
        points: [curP ?? to, to],
        toolZ: [curZ, nextZ],
      });
      curP = to;
      curZ = nextZ;
    } else if (step.type === 'move_to_start') {
      // Blend from the current pose (the fixed start pose, or the previous step's end) to the arc start.
      const next = merged.slice(idx + 1).find((s) => s.type === 'arc');
      if (!next) return;
      const arc = sampleArc(next);
      segments.push({
        type: 'move_to_start',
        duration: num('blend_s', 1.5),
        points: [curP ?? arc.points[0], arc.points[0]],
        toolZ: [curZ, arc.toolZ[0]],
      });
      curP = arc.points[0];
      curZ = arc.toolZ[0];
    } else if (step.type === 'pause' || step.type === 'settle') {
      if (!curP) return;
      const duration = step.type === 'pause' ? num('duration_s', 0) : num('timeout_s', 2);
      segments.push({ type: step.type, duration, points: [curP, curP], toolZ: [curZ, curZ] });
    }
  });
  return { points: pts, startToolZ, segments };
}

// Returns the per-target routines of <ROUTINES_DIR>/<equipment>/<endEffector>.yaml in the
// target-local frame (+Z points into the panel, so outward is -Z).
export async function GET(req: NextRequest) {
  const dir = process.env.EE_ROUTINES_DIR || DEFAULT_DIR;
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
      targets?: Record<string, { use?: string; with?: Record<string, unknown>; steps?: Step[] }>;
    };
    const defaults = doc.defaults ?? {};
    const targets = Object.entries(doc.targets ?? {}).map(([index, def]) => {
      const template = def.use ?? null;
      const steps = (def.steps ?? (template ? doc.templates?.[template] : []) ?? []) as Step[];
      const resolved = substitute(steps, def.with ?? {}) as Step[];
      const { points, startToolZ, segments } = sample(resolved, defaults);
      return {
        index: Number(index),
        template,
        diameterM: def.with?.diameter_m ?? null,
        points,
        startToolZ,
        segments,
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
