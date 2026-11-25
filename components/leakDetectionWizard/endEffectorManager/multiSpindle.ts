// multi_spindle_end_effector: a head with several spindle positions (A, B, C, D), each holding a
// rigid tip with a fixed length and end point. Mirrors ee_app's MultiSpindleSolver
// (FT_Workcell_End_Effector/include/ee_app/ik/multi_spindle_solver.hpp): same keys, same checks,
// same composition. Pure TypeScript, used by the API routes and the pages.
//
//   ik.solver: "multi_spindle"
//   ik.solver_params.spindles.<name>:
//     tip_m:    [x, y, z] [m]        end point of the rigid tip, tool0 frame (required)
//     rpy_deg:  [roll, pitch, yaw]   tip frame orientation [deg], Rz(yaw) Ry(pitch) Rx(roll) (optional)
//     length_m: [m]                  tip length, back from the end point along the tip's -Z (required, > 0)
//
// The routine file names the spindle per target (`spindle: A`); for that routine its end point is
// ee_link: T_base_tool0 = T_base_tip * inverse(T_tool0_spindle).

export const MULTI_SPINDLE_SOLVER = 'multi_spindle';

export type Vec3 = [number, number, number];

export interface Spindle {
  name: string;
  tip: Vec3; // [m], tool0 frame
  rpyDeg: Vec3; // [deg]
  length: number; // [m]
  // Tip frame axes in tool0 (columns of R = Rz(yaw) Ry(pitch) Rx(roll)); z = the way the tip points.
  axes: [Vec3, Vec3, Vec3];
  // Where the rigid tip leaves the head: tip - length * z.
  nose: Vec3;
}

export interface SpindleModel {
  spindles: Spindle[]; // sorted by name, as the solver lists them
  // The problems ee_target_routine_node would stop on (empty = the solver builds).
  errors: string[];
}

type Dict = Record<string, unknown>;
const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);
const FIELDS = ['tip_m', 'rpy_deg', 'length_m'];

// Rz(yaw) * Ry(pitch) * Rx(roll) -> its columns.
function rpyAxes(rpyDeg: Vec3): [Vec3, Vec3, Vec3] {
  const [r, p, y] = rpyDeg.map((d) => (d * Math.PI) / 180);
  const [cr, sr, cp, sp, cy, sy] = [Math.cos(r), Math.sin(r), Math.cos(p), Math.sin(p), Math.cos(y), Math.sin(y)];
  return [
    [cy * cp, sy * cp, -sp],
    [cy * sp * sr - sy * cr, sy * sp * sr + cy * cr, cp * sr],
    [cy * sp * cr + sy * sr, sy * sp * cr - cy * sr, cp * cr],
  ];
}

const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

// From the ros__parameters of a tool file. null when the tool is not a multi-spindle one.
export function spindleModelOf(params: Dict): SpindleModel | null {
  const ik = isDict(params.ik) ? params.ik : null;
  if (!ik || ik.solver !== MULTI_SPINDLE_SOLVER) return null;
  const errors: string[] = [];
  const spindles: Spindle[] = [];
  if (Array.isArray(ik.joint_names) && ik.joint_names.length > 0) {
    errors.push('the spindles are rigid tips: ik.joint_names must be empty');
  }
  const sp = isDict(ik.solver_params) ? ik.solver_params : {};
  for (const key of Object.keys(sp)) {
    if (key !== 'spindles') errors.push(`unknown key 'ik.solver_params.${key}' (expected spindles.<name>.tip_m / rpy_deg / length_m)`);
  }
  const defs = isDict(sp.spindles) ? sp.spindles : {};
  for (const name of Object.keys(defs).sort()) {
    const where = `ik.solver_params.spindles.${name}.`;
    const d = defs[name];
    if (!isDict(d)) {
      errors.push(`unknown key 'ik.solver_params.spindles.${name}' (expected spindles.<name>.tip_m / rpy_deg / length_m)`);
      continue;
    }
    for (const k of Object.keys(d)) if (!FIELDS.includes(k)) errors.push(`unknown key '${where}${k}' (expected tip_m, rpy_deg, length_m)`);
    const vec3 = (key: string, required: boolean): Vec3 | null => {
      const v = d[key];
      if (v === undefined || v === null) {
        if (required) errors.push(`missing ${where}${key}`);
        return required ? null : [0, 0, 0];
      }
      if (!Array.isArray(v) || v.length !== 3 || !v.every(isNumber)) {
        errors.push(`${where}${key} needs 3 values`);
        return null;
      }
      return v as Vec3;
    };
    const tip = vec3('tip_m', true);
    const rpyDeg = vec3('rpy_deg', false);
    let length: number | null = null;
    if (d.length_m === undefined || d.length_m === null) errors.push(`missing ${where}length_m`);
    else if (!isNumber(d.length_m)) errors.push(`${where}length_m needs 1 value`);
    else if (!(d.length_m > 0)) errors.push(`${where}length_m must be > 0`);
    else length = d.length_m;
    if (!tip || !rpyDeg || length === null) continue;
    const axes = rpyAxes(rpyDeg);
    const z = axes[2];
    spindles.push({
      name,
      tip,
      rpyDeg,
      length,
      axes,
      nose: [tip[0] - length * z[0], tip[1] - length * z[1], tip[2] - length * z[2]],
    });
  }
  if (Object.keys(defs).length === 0) errors.push('needs at least one spindle under ik.solver_params.spindles');
  return { spindles, errors };
}

// Spindles that sit exactly on top of each other (same end point and orientation): drawn as one.
export function coincidentGroups(spindles: Spindle[]): string[][] {
  const groups: { ref: Spindle; names: string[] }[] = [];
  const same = (a: Spindle, b: Spindle) =>
    a.tip.every((v, i) => Math.abs(v - b.tip[i]) < 1e-6) && a.rpyDeg.every((v, i) => Math.abs(v - b.rpyDeg[i]) < 1e-6);
  for (const s of spindles) {
    const g = groups.find((x) => same(x.ref, s));
    if (g) g.names.push(s.name);
    else groups.push({ ref: s, names: [s.name] });
  }
  return groups.filter((g) => g.names.length > 1).map((g) => g.names);
}
