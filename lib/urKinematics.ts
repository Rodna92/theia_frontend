// Forward kinematics of a UR arm, base_link -> tool0, built exactly like the robot's URDF
// (robot_app ur10e_ft_description/urdf/ur_macro.xacro) from its kinematics YAML
// (config/<ur_type>/default_kinematics.yaml, the file the bringup launch loads).
//
// Note: in this URDF the joint base_link -> base_link_inertia has NO 180 deg yaw (it was set to
// rpy 0 0 0), so base_link coincides with base_link_inertia. aldm_control's KDL chains run from
// "base_link", so the pose returned here is the one the controller uses.

export type Mat4 = number[][];

export const UR_SEGMENTS = ['shoulder', 'upper_arm', 'forearm', 'wrist_1', 'wrist_2', 'wrist_3'] as const;

export interface UrSegment {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

export type UrKinematics = Record<(typeof UR_SEGMENTS)[number], UrSegment>;

const mul = (a: Mat4, b: Mat4): Mat4 =>
  a.map((row, i) => b[0].map((_, j) => row.reduce((s, _v, m) => s + a[i][m] * b[m][j], 0)));

// URDF <origin xyz rpy>: R = Rz(yaw) * Ry(pitch) * Rx(roll).
const origin = (x: number, y: number, z: number, roll: number, pitch: number, yaw: number): Mat4 => {
  const [cr, sr, cp, sp, cy, sy] = [
    Math.cos(roll),
    Math.sin(roll),
    Math.cos(pitch),
    Math.sin(pitch),
    Math.cos(yaw),
    Math.sin(yaw),
  ];
  return [
    [cy * cp, cy * sp * sr - sy * cr, cy * sp * cr + sy * sr, x],
    [sy * cp, sy * sp * sr + cy * cr, sy * sp * cr - cy * sr, y],
    [-sp, cp * sr, cp * cr, z],
    [0, 0, 0, 1],
  ];
};

// Revolute joint about its local z axis.
const rotZ = (q: number) => origin(0, 0, 0, 0, 0, q);

/** Parses the `kinematics:` section of a UR kinematics YAML (already loaded as an object). */
export function parseUrKinematics(doc: unknown): UrKinematics {
  const k = (doc as { kinematics?: Record<string, unknown> } | null)?.kinematics;
  if (!k || typeof k !== 'object') throw new Error('No "kinematics" section');
  const out = {} as UrKinematics;
  for (const name of UR_SEGMENTS) {
    const s = k[name] as Record<string, unknown> | undefined;
    const field = (f: keyof UrSegment) => {
      const v = s?.[f];
      if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`kinematics.${name}.${f} missing`);
      return v;
    };
    out[name] = {
      x: field('x'),
      y: field('y'),
      z: field('z'),
      roll: field('roll'),
      pitch: field('pitch'),
      yaw: field('yaw'),
    };
  }
  return out;
}

/** tool0 pose in base_link for joints q [rad] (shoulder_pan .. wrist_3). */
export function urForwardKinematics(kin: UrKinematics, q: number[]): Mat4 {
  if (q.length !== UR_SEGMENTS.length) throw new Error(`Expected ${UR_SEGMENTS.length} joints, got ${q.length}`);
  let m = origin(0, 0, 0, 0, 0, 0);
  UR_SEGMENTS.forEach((name, i) => {
    const s = kin[name];
    m = mul(mul(m, origin(s.x, s.y, s.z, s.roll, s.pitch, s.yaw)), rotZ(q[i]));
  });
  m = mul(m, origin(0, 0, 0, 0, -Math.PI / 2, -Math.PI / 2)); // wrist_3_link -> flange
  m = mul(m, origin(0, 0, 0, Math.PI / 2, 0, Math.PI / 2)); // flange -> tool0
  return m;
}

/** Roll / pitch / yaw [rad] of a rotation (URDF / tf convention, R = Rz*Ry*Rx). */
export function rpyOf(m: Mat4): [number, number, number] {
  const pitch = Math.asin(Math.max(-1, Math.min(1, -m[2][0])));
  if (Math.abs(Math.cos(pitch)) < 1e-9) {
    return [Math.atan2(-m[1][2], m[1][1]), pitch, 0];
  }
  return [Math.atan2(m[2][1], m[2][2]), pitch, Math.atan2(m[1][0], m[0][0])];
}
