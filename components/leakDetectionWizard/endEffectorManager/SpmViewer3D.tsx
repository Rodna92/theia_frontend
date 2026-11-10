'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { type Vec3 } from './geometry';
import { type Mat3, type SpmModel, intermediateAxis, mulMV } from './spherical3rrr';
import { TIP_LEN, ViewerFrame, Y_UP, cylinderBetween, makeLabel, newToolModel, useViewerScene } from './viewerScene';

interface SpmViewer3DProps {
  model: SpmModel;
  // Platform orientation (platform -> {S}) and the geometric motor angle of each leg [rad].
  // A leg whose angle is NaN (no IK solution) stays where it was.
  R: Mat3;
  q: number[];
  // False when the orientation has no valid IK: the tool is drawn red.
  ok: boolean;
  jointNames: string[];
  viewKey: string;
}

const TOOL_COLOR = 0x94a3b8;
const vec = (v: Vec3) => new THREE.Vector3(...v);
const quatOf = (m: Mat3) =>
  new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().set(m[0][0], m[0][1], m[0][2], 0, m[1][0], m[1][1], m[1][2], 0, m[2][0], m[2][1], m[2][2], 0, 0, 0, 0, 1)
  );

// Orientation of a link that carries joint axis `a` on its local +X and `b` in its local XY plane.
function linkQuat(a: THREE.Vector3, b: THREE.Vector3) {
  const y = b.clone().addScaledVector(a, -a.dot(b)).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(a, y, a.clone().cross(y)));
}

// Line from the centre O to a joint: the joint's axis.
function axisLine(to: THREE.Vector3) {
  return new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), to]),
    new THREE.LineBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.45 })
  );
}

// Spherical link in its own frame: an arc of `angle` on a sphere of `radius`, from the local +X.
function arcLink(radius: number, angle: number, mat: THREE.Material, accent: THREE.Material) {
  const group = new THREE.Group();
  group.add(new THREE.Mesh(new THREE.TorusGeometry(radius, 0.003, 12, 48, angle), mat));
  const end = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
  // Joint housings: a short drum on each joint axis.
  for (const dir of [new THREE.Vector3(1, 0, 0), end]) {
    group.add(cylinderBetween(dir.clone().multiplyScalar(radius - 0.004), dir.clone().multiplyScalar(radius + 0.004), 0.006, accent));
  }
  return { group, end: end.multiplyScalar(radius) };
}

// Platform with the tool, in the platform frame (origin O): one arm per platform joint, the
// datum disc, the tool down to the tip and the ee_link frame.
function buildPlatform(m: SpmModel, ghost: boolean) {
  const mat = (color: number) =>
    ghost
      ? new THREE.MeshBasicMaterial({ color: TOOL_COLOR, transparent: true, opacity: 0.15, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
  const body = mat(0x64748b);
  const tool = mat(TOOL_COLOR);
  const accent = mat(0x06b6d4);
  const group = new THREE.Group();
  const datum = vec(m.datum);
  const tip = vec(m.tip);
  const along = tip.clone().sub(datum).normalize();

  m.legs.forEach((l) => {
    const joint = vec(l.w).multiplyScalar(m.side * m.upperRadius);
    group.add(cylinderBetween(joint, datum, 0.003, body));
    if (!ghost) group.add(axisLine(joint));
  });
  group.add(cylinderBetween(datum.clone().addScaledVector(along, -0.002), datum.clone().addScaledVector(along, 0.002), 0.016, body));
  group.add(cylinderBetween(datum, tip.clone().addScaledVector(along, -TIP_LEN), 0.006, tool));
  // Conical tip, apex exactly at the tool tip.
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.008, TIP_LEN, 24), accent);
  cone.quaternion.setFromUnitVectors(Y_UP, along);
  cone.position.copy(tip).addScaledVector(along, -TIP_LEN / 2);
  group.add(cone);
  if (!ghost) {
    const frame = new THREE.Group();
    frame.position.copy(tip);
    frame.quaternion.copy(quatOf(m.RtipInPlatform));
    const label = makeLabel('ee_link', '#22d3ee');
    label.position.set(0.012, 0, 0.012);
    frame.add(new THREE.AxesHelper(0.04), label);
    group.add(frame);
  }
  return { group, tool };
}

interface Wrist {
  platform: THREE.Group;
  tool: THREE.MeshStandardMaterial;
  lower: THREE.Group[];
  upper: THREE.Group[];
}

function pose(m: SpmModel, w: Wrist | null, R: Mat3, q: number[], ok: boolean) {
  if (!w) return;
  w.platform.quaternion.copy(quatOf(R));
  w.tool.color.set(ok ? TOOL_COLOR : 0xef4444);
  m.legs.forEach((l, i) => {
    if (!Number.isFinite(q[i])) return;
    const u = vec(l.u).multiplyScalar(m.side);
    const v = vec(intermediateAxis(l, q[i])).multiplyScalar(m.side);
    const c = vec(mulMV(R, l.w)).multiplyScalar(m.side);
    w.lower[i].quaternion.copy(linkQuat(u, v));
    w.upper[i].quaternion.copy(linkQuat(v, c));
  });
}

// 3-RRR spherical parallel wrist: three legs (motor -> lower link -> upper link -> platform)
// whose nine joint axes all pass through the centre O. Axis directions, sphere radii, O and the
// tool lengths are the YAML's; the bodies drawn on them are schematic.
export function SpmViewer3D({ model: m, R, q, ok, jointNames, viewKey }: SpmViewer3DProps) {
  const { mountRef, fitView, show } = useViewerScene();
  const wristRef = useRef<Wrist | null>(null);
  const poseRef = useRef({ R, q, ok });
  poseRef.current = { R, q, ok };

  useEffect(() => {
    const scene = newToolModel(m.offset);
    const std = (color: number) => new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
    const dark = std(0x334155);
    const link = std(0x64748b);
    const accent = std(0x06b6d4);

    // Fixed base: mounting plate on the flange and a column that stops short of the link sphere.
    const center = vec(m.center);
    const hub = center.clone().setLength(Math.max(center.length() - m.lowerRadius - 0.004, 0.006));
    scene.add(cylinderBetween(new THREE.Vector3(), center.clone().setLength(0.006), 0.04, dark));
    scene.add(cylinderBetween(new THREE.Vector3(), hub, 0.012, dark));

    // Base frame {S}: origin O.
    const S = new THREE.Group();
    S.position.copy(center);
    S.quaternion.copy(quatOf(m.Rmount));
    scene.add(S);
    const hubInS = hub.clone().sub(center).applyQuaternion(S.quaternion.clone().invert());
    S.add(new THREE.Mesh(new THREE.SphereGeometry(0.004, 16, 12), accent));
    const oLabel = makeLabel('O', '#67e8f9');
    oLabel.position.set(0.008, 0, 0);
    S.add(oLabel);
    // The sphere the lower links run on.
    S.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(m.lowerRadius, 32, 24),
        new THREE.MeshBasicMaterial({ color: 0x06b6d4, transparent: true, opacity: 0.05, depthWrite: false })
      )
    );

    const ghost = buildPlatform(m, true).group;
    ghost.quaternion.copy(quatOf(m.Rhome));
    const platform = buildPlatform(m, false);
    S.add(ghost, platform.group);

    const wrist: Wrist = { platform: platform.group, tool: platform.tool as THREE.MeshStandardMaterial, lower: [], upper: [] };
    m.legs.forEach((l, i) => {
      // Motor on its shaft axis, on the configured side of O; its joint is on the lower sphere.
      const out = vec(l.u).multiplyScalar(m.side);
      const back = out.clone().multiplyScalar(m.lowerRadius + 0.036);
      S.add(cylinderBetween(out.clone().multiplyScalar(m.lowerRadius + 0.006), back, 0.011, dark));
      S.add(cylinderBetween(hubInS, back, 0.004, dark));
      S.add(axisLine(back));
      const label = makeLabel(jointNames[i] ?? `motor ${i + 1}`, '#67e8f9');
      label.position.copy(back).addScaledVector(out, 0.008);
      S.add(label);

      const lower = arcLink(m.lowerRadius, l.alpha, link, accent);
      lower.group.add(axisLine(lower.end));
      const upper = arcLink(m.upperRadius, l.beta, link, accent);
      // Pin of the intermediate joint, from the upper link's sphere out to the lower link's.
      upper.group.add(cylinderBetween(new THREE.Vector3(m.upperRadius, 0, 0), new THREE.Vector3(m.lowerRadius, 0, 0), 0.002, accent));
      S.add(lower.group, upper.group);
      wrist.lower.push(lower.group);
      wrist.upper.push(upper.group);
    });
    // Home first, so a leg with no solution for the current orientation still has a pose.
    pose(m, wrist, m.Rhome, m.qHome, true);
    pose(m, wrist, poseRef.current.R, poseRef.current.q, poseRef.current.ok);
    wristRef.current = wrist;

    const hide = show(scene, Math.hypot(...m.offset) || 0.15, viewKey);
    return () => {
      hide();
      wristRef.current = null;
    };
  }, [m, jointNames, show, viewKey]);

  useEffect(() => pose(m, wristRef.current, R, q, ok), [m, R, q, ok]);

  return <ViewerFrame mountRef={mountRef} onFit={fitView} />;
}
