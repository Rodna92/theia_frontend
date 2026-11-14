'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { IconFocusCentered } from '@tabler/icons-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { type EndEffector } from './catalog';
import { atParam, place, placeDir, type Pose, type Placement } from './playback';
interface EeViewerProps {
  endEffector: EndEffector | null;
  placements: Placement[];
  // Tool pose (tip frame and simulated joint angles); null = nothing to play.
  pose: Pose | null;
  // Joint angles [rad] of the real tool (connected page): drawn instead of the simulated ones.
  liveJoints?: number[] | null;
  // Saved STL path per target index.
  models: Record<string, string>;
}

function makeLabel(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#e2e8f0';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 64, 32);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false })
  );
  sprite.scale.set(0.1, 0.05, 1);
  return sprite;
}

// The drawn tool. `root` is the tip frame (origin = the tool tip, +Z = the direction the tip
// points); the flange (tool0) hangs from it through the tool's own kinematics, so a jointed tool
// bends at its joint while its tip stays on the path.
interface EeModel {
  root: THREE.Group;
  // Joint angle currently drawn [rad] (always 0 for a rigid tool).
  angle: number;
  setJoint: (q: number) => void;
}

const Z_AXIS = new THREE.Vector3(0, 0, 1);

function buildEndEffector(ee: EndEffector): EeModel {
  const chain = ee.chain;
  // Tool geometry comes from the YAML (metres): the link lengths of a jointed tool, else offset_z.
  const length = chain ? chain.link1 + chain.link2 : Math.max(ee.offsetZ, 0.05);
  const root = new THREE.Group();
  const tool0 = new THREE.Group(); // flange frame; the tool extends along its +Z
  root.add(tool0);
  const body = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.3, roughness: 0.4 });
  // Cylinder of the given radius along Z, from z0 to z1.
  const rod = (radius: number, z0: number, z1: number, material: THREE.Material) => {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(z1 - z0, 0.001), 24), material);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = (z0 + z1) / 2;
    return mesh;
  };
  // Conical tip with its apex at z = end, widening back toward the stem.
  const tipHeight = 0.04;
  const cone = (end: number) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(0.015, tipHeight, 24), accent);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.z = end - tipHeight / 2;
    return mesh;
  };
  tool0.add(rod(0.06, -0.03, 0, body));

  const model: EeModel = { root, angle: 0, setJoint: () => undefined };
  if (chain) {
    // tool0 --link 1--> revolute joint --link 2--> tip: T_tool0_tip(q) = Trans(0, 0, link1) *
    // Rot(axis, q) * Trans(0, 0, link2), as ee_app's solver.
    const axis = new THREE.Vector3(...chain.axis).normalize();
    const pivot = new THREE.Group();
    pivot.position.z = chain.link1;
    pivot.add(rod(0.012, 0, Math.max(chain.link2 - tipHeight, 0.01), body), cone(chain.link2));
    // The joint: a hub with a pin along its axis of rotation.
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.07, 16), accent);
    pin.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    pin.position.z = chain.link1;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.022, 16, 16), accent);
    hub.position.z = chain.link1;
    tool0.add(rod(0.012, 0, chain.link1, body), pivot, pin, hub);
    const forward = new THREE.Matrix4();
    const turn = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    model.setJoint = (q: number) => {
      model.angle = q;
      pivot.quaternion.setFromAxisAngle(axis, q);
      // Flange in the tip frame = inverse of the tool's forward kinematics.
      forward
        .makeTranslation(0, 0, chain.link1)
        .multiply(turn.makeRotationAxis(axis, q))
        .multiply(turn.makeTranslation(0, 0, chain.link2))
        .invert()
        .decompose(tool0.position, tool0.quaternion, scale);
    };
    model.setJoint(chain.follow ? chain.home : chain.hold);
  } else {
    // Rigid tool: a straight stem from the flange to the tip.
    tool0.position.z = -length;
    tool0.add(rod(0.012, 0, Math.max(length - tipHeight, 0.01), body), cone(length));
    if (ee.jointCount > 0) {
      // Declared joints without a link model: marked at mid-length.
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), accent);
      joint.position.z = length * 0.45;
      tool0.add(joint);
    }
  }
  // Drawn at half size; the group origin is the tool tip, so placement is unaffected.
  root.scale.setScalar(0.5);
  // Until a pose is given: at the origin, tip pointing down at the grid.
  root.quaternion.setFromUnitVectors(Z_AXIS, new THREE.Vector3(0, -1, 0));
  return model;
}

function dispose(obj: THREE.Object3D) {
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
    else mat?.dispose();
  });
}

export function EeViewer({ endEffector, placements, pose, models, liveJoints }: EeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const eeRef = useRef<EeModel | null>(null);
  // Joint angle to draw, and whether to ease toward it (the real tool's values arrive in steps).
  const jointRef = useRef<{ target: number | null; smooth: boolean }>({ target: null, smooth: false });
  const geometryCache = useRef(new Map<string, Promise<THREE.BufferGeometry>>());
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const t = useTranslations();

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    camera.position.set(0.5, 0.4, 0.9);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    mount.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const dir = new THREE.DirectionalLight(0xffffff, 1.2);
    dir.position.set(3, 5, 2);
    scene.add(dir);
    scene.add(new THREE.GridHelper(0.6, 12, 0x475569, 0x334155));
    // Viewer frame: Y+ (green) is normal to the grid plane (up, outward from the target);
    // X+ red and Z+ blue lie in the grid plane (right-handed).
    const origin = new THREE.Vector3(0, 0, 0);
    scene.add(
      new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, 0.1, 0xef4444, 0.015, 0.007),
      new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, 0.1, 0x22c55e, 0.015, 0.007),
      new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, 0.1, 0x3b82f6, 0.015, 0.007)
    );

    const content = new THREE.Group();
    scene.add(content);
    contentRef.current = content;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0.05, 0.1);
    controls.enableDamping = true;
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
    let lastFrame = performance.now();
    const loop = () => {
      const now = performance.now();
      const dt = Math.min((now - lastFrame) / 1000, 0.1);
      lastFrame = now;
      const model = eeRef.current;
      const { target, smooth } = jointRef.current;
      if (model && target !== null && model.angle !== target) {
        const gap = target - model.angle;
        // Eased with a ~0.1 s time constant when following the real tool, else drawn as given.
        model.setJoint(smooth && Math.abs(gap) > 1e-4 ? model.angle + gap * (1 - Math.exp(-dt / 0.1)) : target);
      }
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
      contentRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
  }, []);

  // Centers the CAD models and trajectories and zooms in as far as still shows all of them.
  const fitView = () => {
    const content = contentRef.current;
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!content || !camera || !controls) return;
    const box = new THREE.Box3();
    content.children.forEach((c) => {
      if (c.type === 'Line' || c.type === 'Points' || c.type === 'Mesh') box.expandByObject(c);
    });
    if (box.isEmpty()) return;
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
    const dist = (Math.max(sphere.radius, 0.005) / Math.sin(Math.min(vFov, hFov) / 2)) * 1.05;
    const dir = camera.position.clone().sub(controls.target).normalize();
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(dir, dist);
    controls.update();
  };

  useEffect(() => {
    let cancelled = false;
    const content = contentRef.current;
    if (!content) return;
    content.children.slice().forEach((c) => {
      content.remove(c);
      dispose(c);
    });
    eeRef.current = null;
    if (!endEffector) return;

    const ee = buildEndEffector(endEffector);
    eeRef.current = ee;
    content.add(ee.root);

    placements.forEach((pl) => {
      const tg = pl.target;
      if (tg.points.length === 0) return;
      // Associated (non-played) targets are drawn dimmed.
      const dim = !pl.primary;
      const pts = tg.points.map((p) => new THREE.Vector3(...place(pl, p)));
      content.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: dim ? 0x64748b : 0x06b6d4 })
        )
      );
      content.add(
        new THREE.Points(
          new THREE.BufferGeometry().setFromPoints([pts[0], pts[pts.length - 1]]),
          new THREE.PointsMaterial({ color: dim ? 0x64748b : 0x06b6d4, size: 0.015 })
        )
      );
      // Orientation arrows: the direction the tool tip points (tool Z axis) along the path.
      const addArrow = (pos: [number, number, number], z: [number, number, number]) => {
        const dir = new THREE.Vector3(...placeDir(pl, z)).normalize();
        content.add(
          new THREE.ArrowHelper(dir, new THREE.Vector3(...place(pl, pos)), 0.015, 0xf59e0b, 0.005, 0.0025)
        );
      };
      if (!dim) {
        // Composed routines: a small x/y/z triad (red/green/blue) at each part's sub-frame origin,
        // i.e. where the reused routine's target is assumed to be.
        tg.parts?.forEach((part) => {
          const o = new THREE.Vector3(...place(pl, part.origin));
          [0xef4444, 0x22c55e, 0x3b82f6].forEach((color, k) => {
            const d = new THREE.Vector3(...placeDir(pl, part.axes[k])).normalize();
            content.add(new THREE.ArrowHelper(d, o, 0.012, color, 0.004, 0.002));
          });
        });
        tg.segments.forEach((seg) => {
          if (seg.type === 'pause' || seg.type === 'settle') return; // no motion
          if (seg.type === 'handover' || seg.type === 'release') {
            // Zero-time markers on the path: scan done / next approach may take over.
            content.add(
              new THREE.Points(
                new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...place(pl, seg.points[0]))]),
                new THREE.PointsMaterial({ color: seg.type === 'handover' ? 0xa855f7 : 0xec4899, size: 0.02 })
              )
            );
            return;
          }
          if (seg.type === 'arc') {
            seg.points.forEach((p, k) => {
              if (k % 4 === 0 || k === seg.points.length - 1) addArrow(p, seg.toolZ[k]);
            });
            return;
          }
          // Other phases (move_to_start, line, retract, rotate): an arrow about every 3 cm of
          // travel or every 15 deg of turn, ends included.
          const from = new THREE.Vector3(...seg.points[0]);
          const to = new THREE.Vector3(...seg.points[seg.points.length - 1]);
          let turn = 0;
          for (let k = 1; k < seg.toolZ.length; k++) {
            turn += new THREE.Vector3(...seg.toolZ[k - 1]).angleTo(new THREE.Vector3(...seg.toolZ[k]));
          }
          const count = Math.max(1, Math.ceil(Math.max(from.distanceTo(to) / 0.03, turn / (Math.PI / 12))));
          for (let i = 0; i <= count; i++) {
            const s = i / count;
            addArrow(atParam(seg.points, s), atParam(seg.toolZ, s));
          }
        });
      }
      const modelPath = models[String(tg.index)];
      if (modelPath) {
        let promise = geometryCache.current.get(modelPath);
        if (!promise) {
          promise = new STLLoader().loadAsync(`/api/ee-target-models/file?path=${encodeURIComponent(modelPath)}`);
          geometryCache.current.set(modelPath, promise);
          promise.catch(() => geometryCache.current.delete(modelPath));
        }
        promise
          .then((geometry) => {
            if (cancelled) return;
            const mesh = new THREE.Mesh(
              geometry,
              new THREE.MeshStandardMaterial({
                color: dim ? 0x64748b : 0x94a3b8,
                metalness: 0.2,
                roughness: 0.6,
                transparent: true,
                opacity: dim ? 0.45 : 0.85,
                side: THREE.DoubleSide,
              })
            );
            // STL is in millimetres, in the target's own axes: scale, then place like the path.
            const o = place(pl, [0, 0, 0]);
            const ex = placeDir(pl, [1, 0, 0]);
            const ey = placeDir(pl, [0, 1, 0]);
            const ez = placeDir(pl, [0, 0, 1]);
            mesh.matrixAutoUpdate = false;
            mesh.matrix.set(
              ex[0] * 0.001, ey[0] * 0.001, ez[0] * 0.001, o[0],
              ex[1] * 0.001, ey[1] * 0.001, ez[1] * 0.001, o[1],
              ex[2] * 0.001, ey[2] * 0.001, ez[2] * 0.001, o[2],
              0, 0, 0, 1
            );
            content.add(mesh);
          })
          .catch(() => undefined);
      }
      const label = makeLabel(String(tg.index));
      const o = place(pl, [0, 0, 0]);
      label.position.set(o[0], 0.2, o[2]);
      content.add(label);
    });
    return () => {
      cancelled = true;
    };
  }, [endEffector, placements, models]);

  // The tool's pose: its tip on the path, oriented as the routine commands it (at rest: the start
  // of the first played routine), and its joint at the simulated -- or the real tool's -- angle.
  const liveJoint = liveJoints?.[0] ?? null;
  useEffect(() => {
    const ee = eeRef.current;
    if (!ee) return;
    if (pose) {
      ee.root.position.set(...pose.position);
      ee.root.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(
          new THREE.Vector3(...pose.axes[0]),
          new THREE.Vector3(...pose.axes[1]),
          new THREE.Vector3(...pose.axes[2])
        )
      );
    }
    jointRef.current = { target: liveJoint ?? pose?.joints[0] ?? null, smooth: liveJoint !== null };
  }, [pose, liveJoint, endEffector, placements, models]);

  return (
    <div className="relative w-full h-full">
      <div ref={mountRef} className="w-full h-full" />
      <button
        onClick={fitView}
        className="absolute top-3 right-3 p-2 rounded-lg border border-slate-200/50 dark:border-white/10 bg-white/70 dark:bg-slate-900/70 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
        title={t('leakDetection.eeTrajectory.fitView')}
        aria-label={t('leakDetection.eeTrajectory.fitView')}
      >
        <IconFocusCentered size={18} />
      </button>
    </div>
  );
}
