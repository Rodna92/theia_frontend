'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { IconFocusCentered } from '@tabler/icons-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Geometry } from './geometry';

interface EeViewer3DProps {
  geometry: Geometry;
  // One angle [rad] per joint.
  angles: number[];
  // Which tool is shown: the camera is reframed only when this changes.
  viewKey: string;
}

// tool0 frame -> viewer world: tool X -> +X, tool Y -> +Z, tool Z (along the tool) -> -Y (down).
// The default camera then looks along tool -Y, the same side the 2D view shows.
const TOOL_TO_WORLD = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, -1, 0)
);
const Y_UP = new THREE.Vector3(0, 1, 0);
const TIP_LEN = 0.03;

function makeLabel(text: string, color = '#94a3b8'): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.font = 'bold 30px monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 4, 32);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true })
  );
  sprite.scale.set(0.08, 0.02, 1);
  sprite.center.set(0, 0.5);
  sprite.renderOrder = 10;
  return sprite;
}

// Cylinder along the local +Z, from z = 0 to z = length.
function zCylinder(radius: number, length: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), mat);
  m.rotation.x = Math.PI / 2;
  m.position.z = length / 2;
  return m;
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

function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
      (x as THREE.SpriteMaterial).map?.dispose();
      x.dispose();
    });
  });
}

export function EeViewer3D({ geometry: g, angles, viewKey }: EeViewer3DProps) {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Group | null>(null);
  const chainRef = useRef<Chain | null>(null);
  const framedKeyRef = useRef<string | null>(null);
  const anglesRef = useRef(angles);
  anglesRef.current = angles;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.005, 20);
    // A new camera has never been framed (dev mode mounts this effect twice).
    framedKeyRef.current = null;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.3);
    sun.position.set(1, 2, 1.5);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0xffffff, 0.4);
    fill.position.set(-1, -0.5, -1);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = mount;
      renderer.setSize(w, h);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    let raf = 0;
    const loop = () => {
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(loop);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      dispose(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // Frames the whole tool (wrist to tip) from the current viewing direction.
  const fitView = useCallback(() => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const model = modelRef.current;
    if (!camera || !controls || !model) return;
    const box = new THREE.Box3().setFromObject(model);
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = (sphere.radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    controls.update();
  }, []);

  // (Re)build the tool whenever its geometry changes.
  useEffect(() => {
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!scene || !camera || !controls) return;

    const model = new THREE.Group();
    model.applyMatrix4(TOOL_TO_WORLD);

    // Robot wrist and flange above tool0.
    const dark = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.6 });
    const flange = zCylinder(0.045, 0.01, new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 }));
    flange.position.z = -0.005;
    const wrist = zCylinder(0.035, 0.06, dark);
    wrist.position.z = -0.04;
    model.add(flange, wrist);

    const ghost = buildChain(g, true);
    setAngles(ghost, g.joints.map((j) => j.home));
    const chain = buildChain(g, false);
    setAngles(chain, anglesRef.current);
    model.add(ghost.root, chain.root);
    chainRef.current = chain;

    const tool0Axes = new THREE.AxesHelper(0.08);
    const tool0Label = makeLabel('tool0');
    tool0Label.position.set(-0.075, 0, -0.012);
    model.add(tool0Axes, tool0Label);
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

    // Where ee_frame_node publishes ee_link (static offset): wire marker.
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.006, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true })
    );
    marker.position.set(...g.offset);
    model.add(marker);

    // Reach sphere slice: floor grid just under the longest stretch of the tool.
    const reach = g.links.reduce((s, l) => s + l, 0);
    const grid = new THREE.GridHelper(Math.max(0.4, reach * 2.2), 20, 0x475569, 0x1e293b);
    grid.position.y = -reach - 0.01;
    scene.add(grid);
    scene.add(model);
    modelRef.current = model;

    // Frame the tool only for a new tool; while values are edited the camera stays put.
    if (framedKeyRef.current !== viewKey) {
      framedKeyRef.current = viewKey;
      camera.position.set(0.22, -reach * 0.35, 0.38);
      controls.target.set(0, -reach / 2, 0);
      controls.update();
      fitView();
    }

    return () => {
      scene.remove(model, grid);
      dispose(model);
      dispose(grid);
      modelRef.current = null;
      chainRef.current = null;
    };
  }, [g, fitView, viewKey]);

  useEffect(() => setAngles(chainRef.current, angles), [angles]);

  return (
    <div className="relative">
      <div
        ref={mountRef}
        className="h-[460px] w-full rounded-md overflow-hidden bg-slate-100/50 dark:bg-slate-950/50 cursor-grab active:cursor-grabbing"
        aria-label={t('view3d')}
        role="img"
      />
      <button
        type="button"
        onClick={fitView}
        title={t('fitView')}
        aria-label={t('fitView')}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white/80 dark:bg-slate-900/80 border border-slate-200/70 dark:border-white/10 text-slate-500 hover:text-cyan-600"
      >
        <IconFocusCentered size={16} />
      </button>
      <p className="absolute bottom-2 left-2 text-[10px] text-slate-500 dark:text-slate-400 pointer-events-none">
        {t('orbitHint')}
      </p>
    </div>
  );
}
