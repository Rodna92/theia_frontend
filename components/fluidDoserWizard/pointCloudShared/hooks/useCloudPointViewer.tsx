'use client';

import { RefObject, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { InsertedCadObject, LoadedFrameCloud } from '../types';

export type InsertedCadViewMode = 'mesh' | 'points';

// One target's origin-axis marker in multi-target mode — positioned at the
// parsed pose, shown only while `cloudId` (e.g.
// "<targetName>:finalPoseRefAlignedCamera") is visible. `pose` is null when
// the target's transforms.txt has no parseable pose section for this frame.
export interface TargetReferencePose {
  targetName: string;
  pose: THREE.Matrix4 | null;
  cloudId: string;
}

interface UseCloudPointViewerOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  frames: LoadedFrameCloud[];
  referencePose?: THREE.Matrix4 | null;
  targetReferencePoses?: TargetReferencePose[];
  insertedCad?: InsertedCadObject | null;
  insertedCadViewMode?: InsertedCadViewMode;
  pointSize?: number;
}

export const DEFAULT_POINT_SIZE = 0.004;
export const MIN_POINT_SIZE = 0.001;
export const MAX_POINT_SIZE = 0.005;

// Playback speed multiplier for replay sequences — 1x is the base cadence;
// the actual interval math lives in useReplayUpload, this is just the shared
// range shown on the slider next to point size.
export const DEFAULT_PLAYBACK_SPEED = 1;
export const MIN_PLAYBACK_SPEED = 0.25;
export const MAX_PLAYBACK_SPEED = 4;

// 05_fine_ref_aligned.ply's own origin — where the reference cloud's local
// frame ended up after the fine ICP transform — shown alongside it, distinct
// from the always-on world axes.
const REFERENCE_POSE_CLOUD_ID = 'fineRefAligned';

export function useCloudPointViewer({
  containerRef,
  frames,
  referencePose,
  targetReferencePoses = [],
  insertedCad,
  insertedCadViewMode = 'points',
  pointSize = DEFAULT_POINT_SIZE,
}: UseCloudPointViewerOptions) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const pointsRef = useRef<Map<string, THREE.Points>>(new Map());
  const referenceAxesRef = useRef<THREE.AxesHelper | null>(null);
  const targetAxesRef = useRef<Map<string, THREE.AxesHelper>>(new Map());
  const insertedMeshRef = useRef<THREE.Mesh | null>(null);
  const insertedPointsRef = useRef<THREE.Points | null>(null);
  const hasAutoFitRef = useRef(false);
  const hadInsertedCadRef = useRef(false);

  const fitView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const box = new THREE.Box3();
    let hasAny = false;
    pointsRef.current.forEach((points) => {
      if (!points.visible) return;
      points.geometry.computeBoundingBox();
      const boundingBox = points.geometry.boundingBox;
      if (boundingBox) {
        box.union(boundingBox);
        hasAny = true;
      }
    });

    [insertedMeshRef.current, insertedPointsRef.current].forEach((object) => {
      if (!object || !object.visible) return;
      object.geometry.computeBoundingBox();
      const boundingBox = object.geometry.boundingBox;
      if (boundingBox) {
        box.union(boundingBox);
        hasAny = true;
      }
    });

    if (!hasAny) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z, 0.001);
    const distance = maxDim * 1.8;

    camera.near = maxDim / 100;
    camera.far = maxDim * 100;
    camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
    camera.updateProjectionMatrix();

    controls.target.copy(center);
    controls.update();
  };

  // Scene lifecycle — created once per mounted container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1120);

    const camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / Math.max(container.clientHeight, 1),
      0.01,
      5000
    );
    camera.position.set(1, 1, 1);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // Points materials are unlit, but the inserted CAD mesh uses
    // MeshStandardMaterial and renders solid black without a light source.
    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const axes = new THREE.AxesHelper(0.3);
    scene.add(axes);

    const referenceAxes = new THREE.AxesHelper(0.15);
    referenceAxes.visible = false;
    scene.add(referenceAxes);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    controlsRef.current = controls;
    referenceAxesRef.current = referenceAxes;

    let frameId: number;
    const animate = () => {
      frameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth, clientHeight } = container;
      if (clientWidth === 0 || clientHeight === 0) return;
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(clientWidth, clientHeight);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement);
      }
      pointsRef.current.forEach((points) => {
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      });
      pointsRef.current.clear();
      targetAxesRef.current.forEach((axes) => {
        scene.remove(axes);
        axes.geometry.dispose();
        (axes.material as THREE.Material).dispose();
      });
      targetAxesRef.current.clear();
      if (insertedMeshRef.current) {
        insertedMeshRef.current.geometry.dispose();
        (insertedMeshRef.current.material as THREE.Material).dispose();
        insertedMeshRef.current = null;
      }
      if (insertedPointsRef.current) {
        insertedPointsRef.current.geometry.dispose();
        (insertedPointsRef.current.material as THREE.Material).dispose();
        insertedPointsRef.current = null;
      }
      hasAutoFitRef.current = false;
      hadInsertedCadRef.current = false;
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      controlsRef.current = null;
      referenceAxesRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // Sync the loaded frames with the three.js scene graph.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentIds = new Set(frames.map((f) => f.id));
    let addedNew = false;

    pointsRef.current.forEach((points, id) => {
      if (!currentIds.has(id)) {
        scene.remove(points);
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
        pointsRef.current.delete(id);
      }
    });

    frames.forEach((frame) => {
      let points = pointsRef.current.get(frame.id);
      if (!points) {
        const material = new THREE.PointsMaterial({
          color: frame.color,
          size: pointSize,
          sizeAttenuation: true,
        });
        points = new THREE.Points(frame.geometry, material);
        pointsRef.current.set(frame.id, points);
        scene.add(points);
        addedNew = true;
      } else if (points.geometry !== frame.geometry) {
        // Same cloud id (e.g. replay stepping to a new frame) but new data — swap
        // the geometry in place instead of recreating the Points/Material objects.
        points.geometry.dispose();
        points.geometry = frame.geometry;
      }
      points.visible = frame.visible;
    });

    const referenceAxes = referenceAxesRef.current;
    if (referenceAxes) {
      const referenceCloud = frames.find((f) => f.id === REFERENCE_POSE_CLOUD_ID);
      if (referencePose && referenceCloud?.visible) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        referencePose.decompose(position, quaternion, scale);
        referenceAxes.position.copy(position);
        referenceAxes.quaternion.copy(quaternion);
        referenceAxes.visible = true;
      } else {
        referenceAxes.visible = false;
      }
    }

    if (addedNew && !hasAutoFitRef.current) {
      hasAutoFitRef.current = true;
      requestAnimationFrame(() => fitView());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, referencePose]);

  // Sync per-target origin-axis markers (multi-target mode) — one AxesHelper
  // per target, positioned at that target's parsed pose and shown only while
  // its "04_final_pose_ref_aligned_camera" cloud is visible.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const currentTargetNames = new Set(targetReferencePoses.map((t) => t.targetName));
    targetAxesRef.current.forEach((axes, targetName) => {
      if (!currentTargetNames.has(targetName)) {
        scene.remove(axes);
        axes.geometry.dispose();
        (axes.material as THREE.Material).dispose();
        targetAxesRef.current.delete(targetName);
      }
    });

    targetReferencePoses.forEach(({ targetName, pose, cloudId }) => {
      let axes = targetAxesRef.current.get(targetName);
      if (!axes) {
        axes = new THREE.AxesHelper(0.12);
        axes.visible = false;
        targetAxesRef.current.set(targetName, axes);
        scene.add(axes);
      }

      const cloud = frames.find((f) => f.id === cloudId);
      if (pose && cloud?.visible) {
        const position = new THREE.Vector3();
        const quaternion = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        pose.decompose(position, quaternion, scale);
        axes.position.copy(position);
        axes.quaternion.copy(quaternion);
        axes.visible = true;
      } else {
        axes.visible = false;
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frames, targetReferencePoses]);

  // Sync the inserted CAD mesh with the scene graph.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (insertedMeshRef.current) {
      scene.remove(insertedMeshRef.current);
      insertedMeshRef.current.geometry.dispose();
      (insertedMeshRef.current.material as THREE.Material).dispose();
      insertedMeshRef.current = null;
    }

    if (insertedCad?.meshGeometry) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(insertedCad.meshGeometry, material);
      mesh.visible = insertedCadViewMode === 'mesh';
      insertedMeshRef.current = mesh;
      scene.add(mesh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertedCad?.meshGeometry]);

  // Sync the inserted CAD point cloud with the scene graph.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (insertedPointsRef.current) {
      scene.remove(insertedPointsRef.current);
      insertedPointsRef.current.geometry.dispose();
      (insertedPointsRef.current.material as THREE.Material).dispose();
      insertedPointsRef.current = null;
    }

    if (insertedCad?.pointCloudGeometry) {
      const material = new THREE.PointsMaterial({
        color: 0x22d3ee,
        size: pointSize,
        sizeAttenuation: true,
      });
      const points = new THREE.Points(insertedCad.pointCloudGeometry, material);
      points.visible = insertedCadViewMode === 'points';
      insertedPointsRef.current = points;
      scene.add(points);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertedCad?.pointCloudGeometry]);

  // Fit the view once when a CAD object is first inserted; leave the camera
  // alone afterwards so mesh/points toggling doesn't reset it.
  useEffect(() => {
    if (insertedCad && !hadInsertedCadRef.current) {
      hadInsertedCadRef.current = true;
      requestAnimationFrame(() => fitView());
    } else if (!insertedCad) {
      hadInsertedCadRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insertedCad]);

  // Live-update the on-screen point size without recreating the
  // points/materials (which would also drop their geometry swap-in-place
  // optimization above).
  useEffect(() => {
    pointsRef.current.forEach((points) => {
      (points.material as THREE.PointsMaterial).size = pointSize;
    });
    if (insertedPointsRef.current) {
      (insertedPointsRef.current.material as THREE.PointsMaterial).size = pointSize;
    }
  }, [pointSize]);

  // Toggle visibility between the inserted mesh and point cloud without
  // touching the camera.
  useEffect(() => {
    if (insertedMeshRef.current) insertedMeshRef.current.visible = insertedCadViewMode === 'mesh';
    if (insertedPointsRef.current) insertedPointsRef.current.visible = insertedCadViewMode === 'points';
  }, [insertedCadViewMode]);

  return { fitView };
}
