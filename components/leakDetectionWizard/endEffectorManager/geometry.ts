// Tool geometry read from an end-effector YAML (ros__parameters of ee_frame_node).

export type Dict = Record<string, unknown>;
export type Vec3 = [number, number, number];

export interface EndEffectorFile {
  id: string;
  file: string;
  path: string;
  modified: string;
  raw: string;
  header: string;
  comments: Record<string, string>;
  todos: string[];
  params: Dict;
  error?: string;
}

export interface EndEffectorsResponse {
  dir: string;
  endEffectors: EndEffectorFile[];
  error?: string;
}

export interface Joint {
  name: string;
  // Rotation axis in the frame of the link before the joint (tool0 axes at home).
  axis: Vec3;
  home: number;
  // Physical travel [rad]: slider range.
  min: number | null;
  max: number | null;
  // Operational travel [rad]: range the routine is allowed to use.
  opMin: number | null;
  opMax: number | null;
}

export interface Geometry {
  // tool0 -> ee_link translation [m] and rotation [rad].
  offset: Vec3;
  rpy: Vec3;
  solver: string | null;
  jointNames: string[];
  jointHome: number[];
  // Revolute chain: links[i] runs along the local Z, joints[i] sits at the end of links[i].
  // Always joints.length + 1 links (the last one ends at the tool tip).
  joints: Joint[];
  links: number[];
  // False when the YAML gives no link lengths and offset_z was split evenly between the links.
  linksFromYaml: boolean;
  // Two-link chain as declared by the single-joint solver (used by the 2D side view).
  chain: { link1: number; link2: number; axis: Vec3 } | null;
  jointMin: number | null;
  jointMax: number | null;
}

const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const numOrNull = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number');

// A per-joint value given either as a scalar (joint 0 only) or as a list.
const perJoint = (v: unknown, i: number): number | null =>
  Array.isArray(v) ? numOrNull(v[i]) : i === 0 ? numOrNull(v) : null;

// Default axes when the YAML does not give one: Y, X, Z, Y, ... (wrist-like).
const DEFAULT_AXES: Vec3[] = [
  [0, 1, 0],
  [1, 0, 0],
  [0, 0, 1],
];

export function geometryOf(p: Dict): Geometry {
  const ik = isDict(p.ik) ? p.ik : {};
  const sp = isDict(ik.solver_params) ? ik.solver_params : {};
  const offset: Vec3 = [num(p.offset_x), num(p.offset_y), num(p.offset_z)];
  const jointNames = Array.isArray(ik.joint_names) ? ik.joint_names.map(String) : [];
  const jointHome = Array.isArray(ik.joint_home) ? ik.joint_home.map((x) => num(x)) : [];
  const rad = (key: string, i: number) => perJoint(sp[key], i) ?? perJoint(ik[key], i);
  const fromDeg = (key: string, i: number) => {
    const d = rad(key, i);
    return d === null ? null : (d * Math.PI) / 180;
  };
  // joint_physical_{min,max}_deg, else joint_{min,max} [rad].
  const physical = (side: 'min' | 'max', i: number) => fromDeg(`joint_physical_${side}_deg`, i) ?? rad(`joint_${side}`, i);
  const operational = (side: 'min' | 'max', i: number) => fromDeg(`joint_operational_${side}_deg`, i) ?? physical(side, i);

  const joints: Joint[] = jointNames.map((name, i) => {
    const listed = Array.isArray(sp.joint_axes) ? sp.joint_axes[i] : undefined;
    const axis = isVec3(listed)
      ? listed
      : isVec3(sp[`joint${i + 1}_axis`])
        ? (sp[`joint${i + 1}_axis`] as Vec3)
        : i === 0 && isVec3(sp.joint_axis)
          ? sp.joint_axis
          : DEFAULT_AXES[i % DEFAULT_AXES.length];
    return {
      name,
      axis,
      home: jointHome[i] ?? 0,
      min: physical('min', i),
      max: physical('max', i),
      opMin: operational('min', i),
      opMax: operational('max', i),
    };
  });

  // link1_length_m, link2_length_m, ... in order.
  const declared: number[] = [];
  for (let n = 1; numOrNull(sp[`link${n}_length_m`]) !== null; n++) declared.push(sp[`link${n}_length_m`] as number);
  const linksFromYaml = declared.length === joints.length + 1;
  const total = offset[2] > 0 ? offset[2] : 0.15;
  // Lengths are clamped to 1 mm so a zero or negative value typed in edit mode still draws.
  const links = (linksFromYaml ? declared : Array.from({ length: joints.length + 1 }, () => total / (joints.length + 1))).map(
    (l) => Math.max(l, 0.001)
  );

  const link1 = numOrNull(sp.link1_length_m);
  const link2 = numOrNull(sp.link2_length_m);
  return {
    offset,
    rpy: [num(p.roll), num(p.pitch), num(p.yaw)],
    solver: typeof ik.solver === 'string' ? ik.solver : null,
    jointNames,
    jointHome,
    joints,
    links,
    linksFromYaml,
    chain:
      joints.length === 1 && link1 !== null && link2 !== null
        ? { link1, link2, axis: joints[0].axis }
        : null,
    jointMin: joints[0]?.min ?? null,
    jointMax: joints[0]?.max ?? null,
  };
}

// "spherical_end_effector" -> "Spherical end effector"; "rr_end_effector" -> "RR end effector".
export function prettyName(id: string) {
  const words = id.replace(/_/g, ' ').trim().split(/\s+/);
  return words
    .map((w, i) => (w.length <= 2 ? w.toUpperCase() : i === 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

export const mm = (m: number) => Math.round(m * 10000) / 10; // 0.1 mm precision
export const deg = (rad: number) => Math.round(((rad * 180) / Math.PI) * 10) / 10;
