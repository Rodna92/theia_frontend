'use client';

// Scene, camera and helpers shared by the 3D tool viewers.

import { type RefObject, useCallback, useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { IconFocusCentered } from '@tabler/icons-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { type Vec3 } from './geometry';

// tool0 frame -> viewer world: tool X -> +X, tool Y -> +Z, tool Z (along the tool) -> -Y (down).
// The default camera then looks along tool -Y, the same side the 2D view shows.
const TOOL_TO_WORLD = new THREE.Matrix4().makeBasis(
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 0, 1),
  new THREE.Vector3(0, -1, 0)
);
export const Y_UP = new THREE.Vector3(0, 1, 0);
export const TIP_LEN = 0.03;

export function makeLabel(text: string, color = '#94a3b8'): THREE.Sprite {
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
export function zCylinder(radius: number, length: number, mat: THREE.Material) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 24), mat);
  m.rotation.x = Math.PI / 2;
  m.position.z = length / 2;
  return m;
}

// Cylinder from point a to point b.
export function cylinderBetween(a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) {
  const d = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, Math.max(d.length(), 1e-6), 24), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  if (d.length() > 1e-9) m.quaternion.setFromUnitVectors(Y_UP, d.normalize());
  return m;
}

export function dispose(obj: THREE.Object3D) {
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

// Group in the tool0 frame with what every tool shares: robot wrist and flange above tool0,
// the tool0 axes, and a wire marker where ee_frame_node publishes ee_link (the static offset).
export function newToolModel(offset: Vec3): THREE.Group {
  const model = new THREE.Group();
  model.applyMatrix4(TOOL_TO_WORLD);
  const flange = zCylinder(0.045, 0.01, new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7, roughness: 0.3 }));
  flange.position.z = -0.005;
  const wrist = zCylinder(0.035, 0.06, new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.4, roughness: 0.6 }));
  wrist.position.z = -0.04;
  const tool0Label = makeLabel('tool0');
  tool0Label.position.set(-0.075, 0, -0.012);
  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(0.006, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0x94a3b8, wireframe: true })
  );
  marker.position.set(...offset);
  model.add(flange, wrist, new THREE.AxesHelper(0.08), tool0Label, marker);
  return model;
}

export function useViewerScene() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const modelRef = useRef<THREE.Object3D | null>(null);
  const framedKeyRef = useRef<string | null>(null);

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

  // Puts a tool model (and a floor grid just under its reach) in the scene; returns the cleanup.
  // The camera is framed only when viewKey changes, so it stays put while values are edited.
  const show = useCallback(
    (model: THREE.Group, reach: number, viewKey: string) => {
      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const controls = controlsRef.current;
      if (!scene || !camera || !controls) {
        dispose(model);
        return () => {};
      }
      const grid = new THREE.GridHelper(Math.max(0.4, reach * 2.2), 20, 0x475569, 0x1e293b);
      grid.position.y = -reach - 0.01;
      scene.add(grid, model);
      modelRef.current = model;
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
      };
    },
    [fitView]
  );

  return { mountRef, fitView, show };
}

export function ViewerFrame({ mountRef, onFit }: { mountRef: RefObject<HTMLDivElement | null>; onFit: () => void }) {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
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
        onClick={onFit}
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
