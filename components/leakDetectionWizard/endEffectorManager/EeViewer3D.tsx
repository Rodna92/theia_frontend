'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { type Geometry } from './geometry';
import { TIP_LEN, ViewerFrame, Y_UP, makeLabel, newToolModel, useViewerScene, zCylinder } from './viewerScene';

interface EeViewer3DProps {
  geometry: Geometry;
  // One angle [rad] per joint.
  angles: number[];
  // Which tool is shown: the camera is reframed only when this changes.
  viewKey: string;
}

interface Chain {
  root: THREE.Group;
  pivots: { group: THREE.Group; axis: THREE.Vector3 }[];
}

// Arc traced by the end of the next link over the joint's operational range (±90° when unset).
// Lives in the joint's parent frame, so it stays put while the joint moves.
function sweepArc(g: Geometry, i: number, axis: THREE.Vector3, at: THREE.Vector3) {
  const j = g.joints[i];
  const lo = j.opMin ?? -Math.PI / 2;
  const hi = j.opMax ?? Math.PI / 2;
  const reach = new THREE.Vector3(0, 0, g.links[i + 1]);
  const q = new THREE.Quaternion();
  const pts: THREE.Vector3[] = [new THREE.Vector3()];
  for (let s = 0; s <= 48; s++) {
    q.setFromAxisAngle(axis, lo + ((hi - lo) * s) / 48);
    pts.push(reach.clone().applyQuaternion(q));
  }
  pts.push(new THREE.Vector3());
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(pts),
    new THREE.LineDashedMaterial({ color: 0x06b6d4, dashSize: 0.006, gapSize: 0.004, transparent: true, opacity: 0.7 })
  );
  line.computeLineDistances();
  line.position.copy(at);
  return line;
}

// Revolute chain in the tool0 frame: each link along the local Z, each joint at the end of its link.
function buildChain(g: Geometry, ghost: boolean): Chain {
  const mat = (color: number) =>
    ghost
      ? new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.15, depthWrite: false })
      : new THREE.MeshStandardMaterial({ color, metalness: 0.5, roughness: 0.45 });
  const body = mat(0x64748b);
  const link = mat(0x94a3b8);
  const accent = mat(0x06b6d4);

  const root = new THREE.Group();
  const pivots: Chain['pivots'] = [];
  let parent: THREE.Object3D = root;
  g.links.forEach((len, i) => {
    const last = i === g.links.length - 1;
    const bodyLen = last ? Math.max(len - TIP_LEN, 0.001) : len;
    parent.add(zCylinder(i === 0 ? 0.011 : 0.008, bodyLen, i === 0 ? body : link));
    if (!last) {
      const axis = new THREE.Vector3(...g.joints[i].axis).normalize();
      const pivot = new THREE.Group();
      pivot.position.z = len;
      // Joint housing: a short drum around the rotation axis.
      const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 0.03, 32), accent);
      drum.quaternion.setFromUnitVectors(Y_UP, axis);
      pivot.add(drum);
      parent.add(pivot);
      if (!ghost) parent.add(sweepArc(g, i, axis, pivot.position));
      pivots.push({ group: pivot, axis });
      parent = pivot;
    } else {
      // Conical tip, apex exactly at the end of the last link.
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.011, TIP_LEN, 24), accent);
      tip.rotation.x = Math.PI / 2; // cone apex (+Y) -> +Z
      tip.position.z = len - TIP_LEN / 2;
      parent.add(tip);
      const tipFrame = new THREE.Group();
      tipFrame.name = 'tip';
      tipFrame.position.z = len;
      parent.add(tipFrame);
    }
  });
  return { root, pivots };
}

function setAngles(chain: Chain | null, angles: number[]) {
  chain?.pivots.forEach((p, i) => p.group.quaternion.setFromAxisAngle(p.axis, angles[i] ?? 0));
}

// Serial revolute tool (r_end_effector, rr_end_effector, ...).
export function EeViewer3D({ geometry: g, angles, viewKey }: EeViewer3DProps) {
  const { mountRef, fitView, show } = useViewerScene();
  const chainRef = useRef<Chain | null>(null);
  const anglesRef = useRef(angles);
  anglesRef.current = angles;

  // (Re)build the tool whenever its geometry changes.
  useEffect(() => {
    const model = newToolModel(g.offset);
    const ghost = buildChain(g, true);
    setAngles(ghost, g.joints.map((j) => j.home));
    const chain = buildChain(g, false);
    setAngles(chain, anglesRef.current);
    model.add(ghost.root, chain.root);
    chainRef.current = chain;

    // ee_link axes ride on the chain's tip, rotated by the YAML roll/pitch/yaw.
    const tipAxes = new THREE.AxesHelper(0.04);
    tipAxes.rotation.set(g.rpy[0], g.rpy[1], g.rpy[2], 'ZYX');
    const tipLabel = makeLabel('ee_link', '#22d3ee');
    tipLabel.position.set(0.012, 0, 0.012);
    chain.root.getObjectByName('tip')?.add(tipAxes, tipLabel);

    // Joint names next to each joint (they move with the chain).
    chain.pivots.forEach((p, i) => {
      const label = makeLabel(g.joints[i].name, '#67e8f9');
      label.position.set(0.025, 0, 0);
      p.group.add(label);
    });

    const hide = show(model, g.links.reduce((s, l) => s + l, 0), viewKey);
    return () => {
      hide();
      chainRef.current = null;
    };
  }, [g, show, viewKey]);

  useEffect(() => setAngles(chainRef.current, angles), [angles]);

  return <ViewerFrame mountRef={mountRef} onFit={fitView} />;
}
