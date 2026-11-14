import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { parse } from 'yaml';
import { workcellPaths } from '@/lib/server/workcellPaths';

export const dynamic = 'force-dynamic';

const num = (text: string, key: string): number => {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*(-?[0-9.]+)`, 'm'));
  return m ? parseFloat(m[1]) : 0;
};

const str = (text: string, key: string): string | null => {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*"?([^"\\s#]+)"?`, 'm'));
  return m ? m[1] : null;
};

const RAD = Math.PI / 180;
const isDict = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const first = (v: unknown): number | null => finite(Array.isArray(v) ? v[0] : v);

// One-joint tool (ik.solver "r_end_effector"): its link / joint model and how the solver uses the
// joint, as ee_app's REndEffectorSolver reads them. null for every other tool.
function chainOf(text: string) {
  let doc: unknown;
  try {
    doc = parse(text);
  } catch {
    return null;
  }
  const params = isDict(doc)
    ? Object.values(doc).map((n) => (isDict(n) ? n.ros__parameters : null)).find(isDict)
    : null;
  const ik = params && isDict(params.ik) ? params.ik : null;
  const sp = ik && isDict(ik.solver_params) ? ik.solver_params : null;
  if (!ik || !sp || ik.solver !== 'r_end_effector') return null;
  const link1 = finite(sp.link1_length_m);
  const link2 = finite(sp.link2_length_m);
  if (link1 === null || link2 === null) return null;
  const a = Array.isArray(sp.joint_axis) && sp.joint_axis.length === 3 ? sp.joint_axis.map(Number) : [0, 1, 0];
  const n = Math.hypot(a[0], a[1], a[2]) || 1;
  const home = first(ik.joint_home) ?? 0;
  const deg = (key: string, fallback: number) => {
    const v = finite(sp[key]);
    return v === null ? fallback : v * RAD;
  };
  const physMin = deg('joint_physical_min_deg', -Infinity);
  const physMax = deg('joint_physical_max_deg', Infinity);
  let min = deg('joint_operational_min_deg', physMin);
  let max = deg('joint_operational_max_deg', physMax);
  // The permitted servo counts narrow the usable range further.
  const servo = isDict(sp.servo) ? sp.servo : null;
  const cal = isDict(sp.calibration) ? sp.calibration : {};
  const steps = servo ? finite(servo.steps) : null;
  const range = servo ? finite(servo.range_deg) : null;
  const homeCounts = servo ? first(servo.home_counts) : null;
  if (servo && steps !== null && range !== null && homeCounts !== null) {
    const countsPerRad = ((first(cal.motor_directions) ?? 1) * (first(cal.gear_ratios) ?? 1) * (steps / range)) / RAD;
    const lo = home + ((first(servo.permitted_min_counts) ?? 0) - homeCounts) / countsPerRad;
    const hi = home + ((first(servo.permitted_max_counts) ?? steps - 1) - homeCounts) / countsPerRad;
    min = Math.max(min, Math.min(lo, hi));
    max = Math.min(max, Math.max(lo, hi));
  }
  // Joint commands need the servo map and every verification flag (servo_connected: false =
  // nominal mode, the joint is held and the robot does every angle).
  const ver = isDict(sp.verification) ? sp.verification : {};
  const enabled =
    !!servo && ['motor_directions', 'servo_home', 'motor_limits', 'servo_connected'].every((k) => ver[k] === true);
  return {
    link1,
    link2,
    axis: [a[0] / n, a[1] / n, a[2] / n],
    home,
    min: Number.isFinite(min) ? min : -Math.PI,
    max: Number.isFinite(max) ? max : Math.PI,
    maxSpeed: (finite(sp.max_joint_speed_deg_s) ?? 30) * RAD,
    engageTime: finite(sp.engage_time_s) ?? 2,
    follow: sp.joint_mode === 'follow' && enabled,
    hold: finite(sp.joint_target) ?? home,
  };
}

export async function GET() {
  const dir = workcellPaths.endEffectorsDir();
  try {
    const files = (await fs.readdir(dir)).filter((f) => /\.ya?ml$/i.test(f)).sort();
    const endEffectors = await Promise.all(
      files.map(async (file) => {
        const text = await fs.readFile(path.join(dir, file), 'utf8');
        const id = path.parse(file).name;
        const jointNames = text.match(/^\s*joint_names:\s*\[(.*)\]/m)?.[1] ?? '';
        return {
          id,
          name: str(text, 'declared_end_effector_type') ?? id,
          offsetZ: num(text, 'offset_z'),
          solver: str(text, 'solver'),
          jointCount: jointNames.split(',').filter((s) => s.trim()).length,
          chain: chainOf(text),
        };
      })
    );
    return NextResponse.json({ dir, endEffectors });
  } catch (e) {
    return NextResponse.json(
      { dir, endEffectors: [], error: e instanceof Error ? e.message : 'Cannot read directory' },
      { status: 500 }
    );
  }
}
