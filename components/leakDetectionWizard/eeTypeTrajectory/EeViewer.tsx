'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { IconFocusCentered } from '@tabler/icons-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { ALL_TARGETS, type EndEffector, type RoutineTarget } from './catalog';
import { TARGET_SPACING, toScene, toolBodyDir, type Pose } from './playback';

interface EeViewerProps {
  endEffector: EndEffector | null;
  targets: RoutineTarget[];
  selected: string | null;
  // Animated tool pose; when null the tool rests at the start of the first displayed routine.
  pose: Pose | null;
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

function buildEndEffector(ee: EndEffector): THREE.Group {
  // Tool geometry comes from the YAML offset_z (metres); drawn 1:1 below the flange.
  const length = Math.max(ee.offsetZ, 0.05);
  const g = new THREE.Group();
  const body = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.6, roughness: 0.4 });
  const accent = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.3, roughness: 0.4 });
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 32), body);
  flange.position.y = length + 0.015;
  g.add(flange);
  // The stem starts where the cone ends (0.04 m above the tip).
  const tipHeight = 0.04;
  const stemLength = Math.max(length - tipHeight, 0.01);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, stemLength, 24), body);
  stem.position.y = tipHeight + stemLength / 2;
  // Conical tip: apex at the group origin (the tool tip), widening toward the stem.
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.015, tipHeight, 24), accent);
  tip.rotation.x = Math.PI;
  tip.position.y = tipHeight / 2;
  g.add(stem, tip);
  if (ee.jointCount > 0) {
    // Mark the revolute joint(s) at mid-length.
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.025, 16, 16), accent);
    joint.position.y = length * 0.55;
    g.add(joint);
  }
  // Drawn at half size; the group origin is the tool tip, so placement is unaffected.
  g.scale.setScalar(0.5);
  return g;
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

export function EeViewer({ endEffector, targets, selected, pose, models }: EeViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<THREE.Group | null>(null);
  const eeRef = useRef<THREE.Group | null>(null);
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
    content.add(ee);

    const shown = targets.filter((tg) => selected === ALL_TARGETS || String(tg.index) === selected);
    const single = shown.length === 1;
    let first: THREE.Vector3 | null = null;
    let firstToolZ: [number, number, number] | null = null;
    shown.forEach((tg, i) => {
      if (tg.points.length === 0) return;
      const ox = single ? 0 : (i - (shown.length - 1) / 2) * TARGET_SPACING;
      const pts = tg.points.map((p) => new THREE.Vector3(...toScene(p, ox)));
      if (!first) {
        first = pts[0];
        firstToolZ = tg.startToolZ;
      }
      content.add(
        new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: 0x06b6d4 })
        )
      );
      content.add(
        new THREE.Points(
          new THREE.BufferGeometry().setFromPoints([pts[0], pts[pts.length - 1]]),
          new THREE.PointsMaterial({ color: 0x06b6d4, size: 0.015 })
        )
      );
      // Orientation arrows: the direction the tool tip points (tool Z axis) along the path.
      const addArrow = (pos: [number, number, number], z: [number, number, number]) => {
        const dir = new THREE.Vector3(...toScene(z, 0)).normalize();
        content.add(
          new THREE.ArrowHelper(dir, new THREE.Vector3(...toScene(pos, ox)), 0.015, 0xf59e0b, 0.005, 0.0025)
        );
      };
      tg.segments.forEach((seg) => {
        if (seg.type === 'pause' || seg.type === 'settle') return; // no motion
        if (seg.type === 'arc') {
          seg.points.forEach((p, k) => {
            if (k % 4 === 0 || k === seg.points.length - 1) addArrow(p, seg.toolZ[k]);
          });
          return;
        }
        // Straight phases (move_to_start, line, retract): an arrow about every 3 cm, ends included.
        const from = new THREE.Vector3(...seg.points[0]);
        const to = new THREE.Vector3(...seg.points[seg.points.length - 1]);
        const count = Math.max(1, Math.ceil(from.distanceTo(to) / 0.03));
        const z0 = new THREE.Vector3(...seg.toolZ[0]);
        const z1 = new THREE.Vector3(...seg.toolZ[seg.toolZ.length - 1]);
        for (let i = 0; i <= count; i++) {
          const s = i / count;
          const pos = from.clone().lerp(to, s);
          const z = z0.clone().lerp(z1, s).normalize();
          addArrow([pos.x, pos.y, pos.z], [z.x, z.y, z.z]);
        }
      });
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
                color: 0x94a3b8,
                metalness: 0.2,
                roughness: 0.6,
                transparent: true,
                opacity: 0.85,
                side: THREE.DoubleSide,
              })
            );
            // STL is in millimetres; its own axes are used as they are.
            mesh.scale.setScalar(0.001);
            mesh.rotation.y = Math.PI; // same 180 deg turn about Y as the trajectories
            mesh.position.x = ox;
            content.add(mesh);
          })
          .catch(() => undefined);
      }
      const label = makeLabel(String(tg.index));
      label.position.set(ox, 0.2, 0);
      content.add(label);
    });
    // The tool tip rests at the start of the first displayed routine.
    if (first) ee.position.copy(first);
    // The tool body extends opposite to the tool Z axis (which points into the panel).
    const bodyDir = toolBodyDir((firstToolZ as [number, number, number] | null) ?? [0, 0, 1]);
    ee.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...bodyDir));
    return () => {
      cancelled = true;
    };
  }, [endEffector, targets, selected, models]);

  // Animated pose (playback) overrides the resting placement.
  useEffect(() => {
    const ee = eeRef.current;
    if (!ee || !pose) return;
    ee.position.set(...pose.position);
    ee.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(...pose.bodyDir)
    );
  }, [pose, endEffector, targets, selected, models]);

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
