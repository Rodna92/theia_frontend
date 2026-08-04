'use client';

import { RefObject, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { ClipBounds } from '../cadToPointCloud';

export type CadViewMode = 'mesh' | 'points';

interface UseCadViewerOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  meshGeometry: THREE.BufferGeometry | null;
  pointCloudGeometry: THREE.BufferGeometry | null;
  viewMode: CadViewMode;
  clip: ClipBounds | null;
}

const POINT_SIZE = 0.006;

export function useCadViewer({
  containerRef,
  meshGeometry,
  pointCloudGeometry,
  viewMode,
  clip,
}: UseCadViewerOptions) {
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Mesh | null>(null);
  const pointsRef = useRef<THREE.Points | null>(null);
  // Cutting planes parallel to the YZ / XZ / XY main planes — mutating their
  // `.constant` is enough to move them live, no scene rebuild required.
  const clipPlanesRef = useRef<THREE.Plane[]>([]);

  const fitView = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    const target = viewMode === 'points' ? pointsRef.current : meshRef.current;
    if (!camera || !controls || !target) return;

    target.geometry.computeBoundingBox();
    const boundingBox = target.geometry.boundingBox;
    if (!boundingBox) return;

    const center = boundingBox.getCenter(new THREE.Vector3());
    const size = boundingBox.getSize(new THREE.Vector3());
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
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.0);
    keyLight.position.set(2, 3, 2);
    scene.add(keyLight);

    const axes = new THREE.AxesHelper(0.3);
    scene.add(axes);

    // One plane per axis per side: normal pointing "inward" so the kept
    // half-space is where distanceToPoint() >= 0 on both sides at once.
    clipPlanesRef.current = [
      new THREE.Plane(new THREE.Vector3(-1, 0, 0), Infinity), // x <= max
      new THREE.Plane(new THREE.Vector3(1, 0, 0), Infinity), // x >= min
      new THREE.Plane(new THREE.Vector3(0, -1, 0), Infinity), // y <= max
      new THREE.Plane(new THREE.Vector3(0, 1, 0), Infinity), // y >= min
      new THREE.Plane(new THREE.Vector3(0, 0, -1), Infinity), // z <= max
      new THREE.Plane(new THREE.Vector3(0, 0, 1), Infinity), // z >= min
    ];

    sceneRef.current = scene;
    cameraRef.current = camera;
    controlsRef.current = controls;

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
      if (meshRef.current) {
        meshRef.current.geometry.dispose();
        (meshRef.current.material as THREE.Material).dispose();
        meshRef.current = null;
      }
      if (pointsRef.current) {
        pointsRef.current.geometry.dispose();
        (pointsRef.current.material as THREE.Material).dispose();
        pointsRef.current = null;
      }
      clipPlanesRef.current = [];
      sceneRef.current = null;
      cameraRef.current = null;
      controlsRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerRef]);

  // Sync the loaded CAD mesh with the three.js scene graph.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (meshRef.current) {
      scene.remove(meshRef.current);
      meshRef.current.geometry.dispose();
      (meshRef.current.material as THREE.Material).dispose();
      meshRef.current = null;
    }

    if (meshGeometry) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.1,
        roughness: 0.6,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(meshGeometry, material);
      mesh.visible = viewMode === 'mesh';
      meshRef.current = mesh;
      scene.add(mesh);
      requestAnimationFrame(() => fitView());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meshGeometry]);

  // Sync the converted point cloud with the three.js scene graph. The cutting
  // planes are attached here so they clip the cloud live as `clip` changes.
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (pointsRef.current) {
      scene.remove(pointsRef.current);
      pointsRef.current.geometry.dispose();
      (pointsRef.current.material as THREE.Material).dispose();
      pointsRef.current = null;
    }

    if (pointCloudGeometry) {
      const material = new THREE.PointsMaterial({
        color: 0x22d3ee,
        size: POINT_SIZE,
        sizeAttenuation: true,
        clippingPlanes: clipPlanesRef.current,
      });
      const points = new THREE.Points(pointCloudGeometry, material);
      points.visible = viewMode === 'points';
      pointsRef.current = points;
      scene.add(points);
      requestAnimationFrame(() => fitView());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pointCloudGeometry]);

  // Move the cutting planes without touching the scene graph.
  useEffect(() => {
    const planes = clipPlanesRef.current;
    if (planes.length !== 6) return;

    planes[0].constant = clip ? clip.x.max : Infinity;
    planes[1].constant = clip ? -clip.x.min : Infinity;
    planes[2].constant = clip ? clip.y.max : Infinity;
    planes[3].constant = clip ? -clip.y.min : Infinity;
    planes[4].constant = clip ? clip.z.max : Infinity;
    planes[5].constant = clip ? -clip.z.min : Infinity;
  }, [clip]);

  // Toggle visibility between the two representations without re-creating
  // them. The camera is left untouched so switching views preserves whatever
  // orbit/pan/zoom the user already applied.
  useEffect(() => {
    if (meshRef.current) meshRef.current.visible = viewMode === 'mesh';
    if (pointsRef.current) pointsRef.current.visible = viewMode === 'points';
  }, [viewMode]);

  return { fitView };
}
