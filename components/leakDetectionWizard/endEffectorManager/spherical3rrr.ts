// 3-RRR spherical parallel wrist (ik.solver "spherical_parallel_3rrr").
// Port of the nominal/calibrated geometry builders and the analytical IK of
// FT_Workcell_End_Effector (include/ee_app/ik/spherical_3rrr.hpp, src/ik/spherical_3rrr*.cpp).
// Same frames and signs: base {S} at the spherical centre O, every axis a unit direction through O,
// R maps platform coordinates to {S}.

import { getIn } from './editing';
import { type Dict, type Vec3 } from './geometry';

export const SPM_SOLVER = 'spherical_parallel_3rrr';

// Row-major rotation matrix.
export type Mat3 = [Vec3, Vec3, Vec3];

const RAD = Math.PI / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => add(a, scale(b, -1));
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const clamp1 = (x: number) => Math.max(-1, Math.min(1, x));
const wrapPi = (a: number) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));

export const mulMV = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
export const mulMM = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return a.map((row) => bt.map((col) => dot(row, col))) as Mat3;
};
const rotZ = (a: number): Mat3 => [
  [Math.cos(a), -Math.sin(a), 0],
  [Math.sin(a), Math.cos(a), 0],
  [0, 0, 1],
];
const rotY = (a: number): Mat3 => [
  [Math.cos(a), 0, Math.sin(a)],
  [0, 1, 0],
  [-Math.sin(a), 0, Math.cos(a)],
];
const rotX = (a: number): Mat3 => [
  [1, 0, 0],
  [0, Math.cos(a), -Math.sin(a)],
  [0, Math.sin(a), Math.cos(a)],
];
// Rz(yaw) Ry(pitch) Rx(roll) [rad], the repository's composition.
const rpy = (r: number, p: number, y: number): Mat3 => mulMM(rotZ(y), mulMM(rotY(p), rotX(r)));

export interface SpmLeg {
  u: Vec3; // motor shaft axis, {S}
  v0: Vec3; // intermediate axis at geometric motor angle 0, {S}
  w: Vec3; // platform axis, platform frame
  alpha: number; // angle(u, v) [rad], lower link
  beta: number; // angle(v, c) [rad], upper link
}

export interface SpmModel {
  legs: SpmLeg[];
  Rhome: Mat3;
  branches: number[];
  // Actuator angle = direction * (q - zero); limits [rad] on the actuator angle.
  zero: number[];
  direction: number[];
  gear: number[];
  minAct: number[] | null;
  maxAct: number[] | null;
  servo: { home: number[]; countsPerDeg: number; min: number[]; max: number[] } | null;
  enforceLimits: boolean;
  singularityDetection: boolean;
  ikStop: number;
  parallelStop: number;
  // Home pose: geometric motor angles [rad] and its side of the parallel singularity (sign of det J_w).
  qHome: number[];
  homeSide: number;
  // Placement in tool0 [m]: O, {S} axes, and the tip / ee_link pose in the platform frame.
  center: Vec3;
  Rmount: Mat3;
  datum: Vec3;
  tip: Vec3;
  RtipInPlatform: Mat3;
  offset: Vec3;
  // tool0 -> O -> datum -> tip from mount + tool_chain, when the YAML gives the split (must equal offset).
  chainTip: Vec3 | null;
  // Drawing only: which side of O the joints sit on their axes, and the two sphere radii [m].
  side: number;
  lowerRadius: number;
  upperRadius: number;
  // Design summary [rad].
  eta: number | null;
  kappaHome: number;
  unverified: string[];
}

export type SpmStatus = 'valid' | 'unreachable' | 'degenerate' | 'singular' | 'limits' | 'servo' | 'branch';

export interface SpmSolution {
  status: SpmStatus;
  failedLeg: number;
  q: number[]; // geometric motor angles [rad], NaN when a leg has no solution
  qAct: number[];
  counts: number[] | null;
  ikIndex: number[];
  parallelIndex: number;
  parallelSide: number;
}

export const intermediateAxis = (l: SpmLeg, q: number): Vec3 => {
  const k = dot(l.u, l.v0);
  const perp = sub(l.v0, scale(l.u, k));
  return add(scale(l.u, k), add(scale(perp, Math.cos(q)), scale(cross(l.u, l.v0), Math.sin(q))));
};

// Smallest singular value of a 3x3 matrix given by its rows (closed-form eigenvalues of M M^T).
function sigmaMin(rows: Vec3[]): number {
  const s = rows.map((a) => rows.map((b) => dot(a, b)));
  const p1 = s[0][1] ** 2 + s[0][2] ** 2 + s[1][2] ** 2;
  const q = (s[0][0] + s[1][1] + s[2][2]) / 3;
  const p = Math.sqrt(((s[0][0] - q) ** 2 + (s[1][1] - q) ** 2 + (s[2][2] - q) ** 2 + 2 * p1) / 6);
  if (p < 1e-15) return Math.sqrt(Math.max(q, 0));
  const b = s.map((row, i) => row.map((x, j) => (x - (i === j ? q : 0)) / p));
  const det =
    b[0][0] * (b[1][1] * b[2][2] - b[1][2] * b[2][1]) -
    b[0][1] * (b[1][0] * b[2][2] - b[1][2] * b[2][0]) +
    b[0][2] * (b[1][0] * b[2][1] - b[1][1] * b[2][0]);
  const phi = Math.acos(clamp1(det / 2)) / 3;
  return Math.sqrt(Math.max(q + 2 * p * Math.cos(phi + (2 * Math.PI) / 3), 0));
}

// Analytical IK for platform orientation R (platform -> {S}), each leg on its configured branch.
export function solveIk(m: SpmModel, R: Mat3): SpmSolution {
  const s: SpmSolution = {
    status: 'valid',
    failedLeg: -1,
    q: [NaN, NaN, NaN],
    qAct: [NaN, NaN, NaN],
    counts: null,
    ikIndex: [0, 0, 0],
    parallelIndex: 0,
    parallelSide: 0,
  };
  const fail = (status: SpmStatus, leg: number) => {
    if (s.status === 'valid') {
      s.status = status;
      s.failedLeg = leg;
    }
  };
  const within = (i: number, a: number) => !(m.minAct && a < m.minAct[i]) && !(m.maxAct && a > m.maxAct[i]);
  const jw: Vec3[] = [];
  const measured: number[] = [];

  m.legs.forEach((l, i) => {
    const c = mulMV(R, l.w);
    const uc = dot(l.u, c);
    const uv0 = dot(l.u, l.v0);
    const A = dot(sub(l.v0, scale(l.u, uv0)), c);
    const B = dot(cross(l.u, l.v0), c);
    const D = Math.cos(l.beta) - uv0 * uc;
    const H = Math.hypot(A, B);
    if (!(H > 1e-9)) return fail('degenerate', i);
    if (Math.abs(D / H) > 1 + 1e-9) return fail('unreachable', i);
    const q = Math.atan2(B, A) - m.branches[i] * Math.acos(clamp1(D / H));
    // Actuator angle in (-pi, pi], or the 2*pi copy inside the limits.
    let qa = wrapPi(m.direction[i] * (q - m.zero[i]));
    if (!within(i, qa)) {
      if (within(i, qa + 2 * Math.PI)) qa += 2 * Math.PI;
      else if (within(i, qa - 2 * Math.PI)) qa -= 2 * Math.PI;
    }
    s.qAct[i] = qa;
    s.q[i] = m.zero[i] + m.direction[i] * qa;
    const v = intermediateAxis(l, s.q[i]);
    const det = dot(cross(l.u, v), c);
    s.ikIndex[i] = Math.abs(det) / Math.sin(l.alpha);
    measured[i] = Math.sign(det);
    jw[i] = cross(c, v);
  });
  if (s.status !== 'valid') return s;

  const n = jw.map((r) => scale(r, 1 / (norm(r) || 1)));
  s.parallelIndex = sigmaMin(n);
  s.parallelSide = Math.sign(dot(jw[0], cross(jw[1], jw[2])));
  if (m.singularityDetection) {
    s.ikIndex.forEach((x, i) => x < m.ikStop && fail('singular', i));
    // The other side of a parallel singularity is another assembly mode.
    if (s.parallelIndex < m.parallelStop || (m.homeSide !== 0 && s.parallelSide !== m.homeSide)) fail('singular', -1);
  }
  m.legs.forEach((_, i) => {
    if (s.ikIndex[i] > m.ikStop && measured[i] !== m.branches[i]) fail('branch', i);
    if (m.enforceLimits && !within(i, s.qAct[i])) fail('limits', i);
  });
  if (m.servo) {
    const servo = m.servo;
    s.counts = s.qAct.map((a, i) => servo.home[i] + (servo.countsPerDeg * m.gear[i] * a) / RAD);
    s.counts.forEach((c, i) => m.enforceLimits && !(c >= servo.min[i] && c <= servo.max[i]) && fail('servo', i));
  }
  return s;
}

// Tilt-and-torsion orientation relative to home [rad]: tilt of the platform normal toward
// `azimuth`, then `torsion` about it. R = Rz(az) Ry(tilt) Rz(-az) Rz(torsion) R_home.
export const tiltTorsion = (m: SpmModel, azimuth: number, tilt: number, torsion: number): Mat3 =>
  mulMM(rotZ(azimuth), mulMM(rotY(tilt), mulMM(rotZ(torsion - azimuth), m.Rhome)));

// Tool tip in tool0 [m] with the platform at orientation R.
export const tipInTool0 = (m: SpmModel, R: Mat3): Vec3 => add(m.center, mulMV(m.Rmount, mulMV(R, m.tip)));

// Builds the model from the end-effector parameters. Like the node, nothing is defaulted:
// a missing design number throws with the key that is missing.
export function buildSpm(params: Dict): SpmModel {
  const sp = (getIn(params, 'ik.solver_params') ?? {}) as Dict;
  const bad = (key: string, what: string): never => {
    throw new Error(`ik.solver_params.${key}: ${what}`);
  };
  const opt = (key: string): number | null => {
    const v = getIn(sp, key);
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  const req = (key: string): number => opt(key) ?? bad(key, 'missing (required)');
  const list = (key: string, n: number): number[] | null => {
    const v = getIn(sp, key);
    if (v === undefined || v === null) return null;
    if (!Array.isArray(v) || v.length !== n || !v.every((x) => typeof x === 'number' && Number.isFinite(x))) {
      return bad(key, `needs ${n} numbers`);
    }
    return v as number[];
  };
  const vec = (key: string) => list(key, 3) as Vec3 | null;
  const sign = (key: string): number | null => {
    const v = opt(key);
    return v !== null && v !== 1 && v !== -1 ? bad(key, 'must be +1 or -1') : v;
  };
  const flag = (key: string, fallback: boolean) => {
    const v = getIn(sp, key);
    return typeof v === 'boolean' ? v : fallback;
  };
  const rpyDeg = (d: Vec3) => rpy(d[0] * RAD, d[1] * RAD, d[2] * RAD);
  const unit = (v: Vec3, key: string): Vec3 => (norm(v) > 1e-9 ? scale(v, 1 / norm(v)) : bad(key, 'zero vector'));
  const linkAngle = (deg: number, key: string) => (deg > 0 && deg < 180 ? deg * RAD : bad(key, 'must be in (0, 180) deg'));

  const lowerRadius = req('geometry.lower_radius_mm') / 1000;
  const upperRadius = req('geometry.upper_radius_mm') / 1000;
  const alphaDeg = req('geometry.lower_link.joint_axis_angle_deg');
  const betaDeg = req('geometry.upper_link.joint_axis_angle_deg');
  const alphas = list('calibration.lower_link_joint_axis_angles_deg', 3) ?? [alphaDeg, alphaDeg, alphaDeg];
  const betas = list('calibration.upper_link_joint_axis_angles_deg', 3) ?? [betaDeg, betaDeg, betaDeg];
  const Rhome = rpyDeg(vec('geometry.home_rpy_deg') ?? [0, 0, 0]);
  const side = sign('geometry.motor_layout.motor_joint_side');
  const layout = (key: string) => `geometry.motor_layout.${key}`;

  let legs: SpmLeg[];
  let eta: number | null = null;
  const mode = getIn(sp, 'calibration.geometry_mode');
  if (mode === 'calibrated') {
    const vectors = (key: string) => list(key, 9) ?? bad(key, 'required in calibrated mode (9 numbers)');
    const u = vectors('calibration.motor_axis_vectors');
    const v0 = vectors('calibration.intermediate_axis_reference_vectors');
    const w = vectors('calibration.platform_axis_vectors');
    const row = (a: number[], i: number, key: string) => unit([a[3 * i], a[3 * i + 1], a[3 * i + 2]], key);
    legs = [0, 1, 2].map((i) => ({
      u: row(u, i, 'calibration.motor_axis_vectors'),
      v0: row(v0, i, 'calibration.intermediate_axis_reference_vectors'),
      w: row(w, i, 'calibration.platform_axis_vectors'),
      alpha: linkAngle(alphas[i], 'calibration.lower_link_joint_axis_angles_deg'),
      beta: linkAngle(betas[i], 'calibration.upper_link_joint_axis_angles_deg'),
    }));
  } else if (mode === 'symmetric_nominal') {
    if (req('geometry.symmetry.leg_count') !== 3) bad('geometry.symmetry.leg_count', 'must be 3');
    const separation = req('geometry.symmetry.angular_separation_deg') * RAD;
    const etaDeg = req(layout('shaft_inclination_from_xy_deg'));
    if (!(Math.abs(etaDeg) < 90)) bad(layout('shaft_inclination_from_xy_deg'), 'must be in (-90, 90)');
    eta = etaDeg * RAD;
    const bodyAzimuth = req(layout('first_motor_position_azimuth_deg'));

    // Shaft azimuth: explicit, else the motor body's (opposite when the body sits below O).
    const explicitU = opt(layout('motor_axis_azimuth_deg'));
    const phiU =
      explicitU !== null
        ? explicitU * RAD
        : side !== null
          ? bodyAzimuth * RAD + (side < 0 ? Math.PI : 0)
          : bad(layout('motor_joint_side'), 'motor shaft azimuth undetermined (set it or motor_axis_azimuth_deg)');

    // Platform axis azimuth at home: explicit, else shaft azimuth minus the signed top-view offset.
    const explicitW = opt(layout('platform_axis_azimuth_deg'));
    let psiW: number;
    if (explicitW !== null) {
      psiW = explicitW * RAD;
    } else {
      let delta = opt(layout('top_view_axis_offset_deg'));
      if (delta === null) {
        const hand = sign(layout('handedness')) ?? bad(layout('handedness'), 'platform axis azimuth undetermined');
        let magnitude = opt(layout('top_view_axis_offset_magnitude_deg'));
        if (magnitude === null) {
          const kappa = opt(layout('shaft_to_platform_axis_angle_deg'));
          if (kappa === null) return bad(layout('top_view_axis_offset_magnitude_deg'), 'top-view offset undetermined');
          const ratio = Math.cos(kappa * RAD) / Math.cos(eta);
          if (!(Math.abs(ratio) <= 1)) bad(layout('shaft_to_platform_axis_angle_deg'), 'not achievable with this inclination');
          magnitude = Math.acos(ratio) / RAD;
        }
        delta = hand * magnitude;
      }
      psiW = phiU - delta * RAD;
    }

    const u1: Vec3 = [Math.cos(eta) * Math.cos(phiU), Math.cos(eta) * Math.sin(phiU), Math.sin(eta)];
    const c1: Vec3 = [Math.cos(psiW), Math.sin(psiW), 0];
    const phases = list('calibration.zero_phase_deg', 3) ?? [0, 0, 0];
    legs = [0, 1, 2].map((i) => {
      const Rz = rotZ(i * separation);
      const u = mulMV(Rz, u1);
      const cHome = mulMV(Rz, c1);
      const alpha = linkAngle(alphas[i], 'geometry.lower_link.joint_axis_angle_deg');
      // Mathematical zero of the motor angle: v0 in the plane (u, c_home), turned by the zero phase.
      const e = unit(sub(cHome, scale(u, dot(u, cHome))), layout('top_view_axis_offset_magnitude_deg'));
      const f = cross(u, e);
      const ph = phases[i] * RAD;
      return {
        u,
        v0: add(scale(u, Math.cos(alpha)), scale(add(scale(e, Math.cos(ph)), scale(f, Math.sin(ph))), Math.sin(alpha))),
        w: mulMV(transpose(Rhome), cHome),
        alpha,
        beta: linkAngle(betas[i], 'geometry.upper_link.joint_axis_angle_deg'),
      };
    });
  } else {
    return bad('calibration.geometry_mode', 'must be "symmetric_nominal" or "calibrated"');
  }

  const branches = list('calibration.assembly_branches', 3) ?? bad('calibration.assembly_branches', 'missing');
  const direction = list('calibration.motor_directions', 3) ?? bad('calibration.motor_directions', 'missing');
  const gear = list('calibration.gear_ratios', 3) ?? [1, 1, 1];
  let minAct = list('calibration.motor_limits_min_deg', 3)?.map((d) => d * RAD) ?? null;
  let maxAct = list('calibration.motor_limits_max_deg', 3)?.map((d) => d * RAD) ?? null;

  // Servo counts; the permitted counts are also the actuator travel from home.
  let servo: SpmModel['servo'] = null;
  const servoHome = list('servo.home_counts', 3);
  if (servoHome) {
    const steps = req('servo.steps');
    const countsPerDeg = steps / req('servo.range_deg');
    const min = list('servo.permitted_min_counts', 3);
    const max = list('servo.permitted_max_counts', 3);
    servo = { home: servoHome, countsPerDeg, min: min ?? [0, 0, 0], max: max ?? [steps - 1, steps - 1, steps - 1] };
    if (min && max) {
      const perRad = gear.map((gr) => (countsPerDeg * gr) / RAD);
      const lo = min.map((c, i) => Math.max((c - servoHome[i]) / perRad[i], minAct?.[i] ?? -Infinity));
      const hi = max.map((c, i) => Math.min((c - servoHome[i]) / perRad[i], maxAct?.[i] ?? Infinity));
      minAct = lo;
      maxAct = hi;
    }
  }

  const center = vec('mount.center_in_tool0_m') ?? bad('mount.center_in_tool0_m', 'missing (needed to place the wrist on tool0)');
  const Rmount = rpyDeg(vec('mount.rpy_deg') ?? [0, 0, 0]);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
  const offset: Vec3 = [num(params.offset_x), num(params.offset_y), num(params.offset_z)];
  // The solver derives the platform -> ee_link transform from the home tip (offset_*, roll/pitch/yaw).
  const toPlatform = transpose(mulMM(Rmount, Rhome));
  const toDatum = vec('tool_chain.center_to_platform_datum_m');
  const toTip = vec('tool_chain.platform_datum_to_tip_m');

  const model: SpmModel = {
    legs,
    Rhome,
    branches,
    zero: list('calibration.motor_zero_offsets_deg', 3)?.map((d) => d * RAD) ?? [0, 0, 0],
    direction,
    gear,
    minAct: null,
    maxAct: null,
    servo,
    enforceLimits: false,
    singularityDetection: flag('solver.singularity_detection', true),
    ikStop: opt('solver.ik_singularity_stop') ?? 0.01,
    parallelStop: opt('solver.parallel_singularity_stop') ?? 0.01,
    qHome: [0, 0, 0],
    homeSide: 0,
    center,
    Rmount,
    datum: toDatum ?? [0, 0, 0],
    tip: mulMV(toPlatform, sub(offset, center)),
    RtipInPlatform: mulMM(toPlatform, rpy(num(params.roll), num(params.pitch), num(params.yaw))),
    offset,
    chainTip: toDatum && toTip ? add(center, mulMV(mulMM(Rmount, Rhome), add(toDatum, toTip))) : null,
    side: side ?? -1,
    lowerRadius,
    upperRadius,
    eta,
    kappaHome: Math.acos(clamp1(dot(legs[0].u, mulMV(Rhome, legs[0].w)))),
    unverified: ['motor_shaft_axis', 'handedness', 'assembly_branches', 'motor_directions', 'motor_limits'].filter(
      (k) => !flag(`verification.${k}`, false)
    ),
  };

  // Nominal convention: with no motor_zero_offsets_deg the actuator zero is the angle at home
  // (found with the limits off, as the node does).
  const home = solveIk(model, Rhome);
  if (home.status !== 'valid') {
    throw new Error(`home orientation not solvable: ${home.status}${home.failedLeg >= 0 ? ` (leg ${home.failedLeg + 1})` : ''}`);
  }
  if (!getIn(sp, 'calibration.motor_zero_offsets_deg')) model.zero = home.q;
  model.qHome = home.q;
  model.homeSide = home.parallelSide;
  model.minAct = minAct;
  model.maxAct = maxAct;
  model.enforceLimits = flag('solver.enforce_joint_limits', true);
  return model;
}
