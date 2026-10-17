'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconCube, IconLoader2, IconMaximize, IconX } from '@tabler/icons-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { fetchPly } from './plyCloud';

interface PlyViewerModalProps {
  // .ply path as written in the yaml (relative paths resolve on the server).
  plyPath: string;
  // Loaded vision_params.yaml, used as the base for relative paths.
  yamlPath: string;
  onClose: () => void;
}

interface CloudInfo {
  pointCount: number;
  size: THREE.Vector3;
  resolvedPath: string;
}

export function PlyViewerModal({ plyPath, yamlPath, onClose }: PlyViewerModalProps) {
  const t = useTranslations('leakDetection.configure.vision.params.plyViewer');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const [info, setInfo] = useState<CloudInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showBox, setShowBox] = useState(true);
  const boxRef = useRef<THREE.Box3Helper | null>(null);
  // Read when the helper is created, so a toggle made while loading still applies.
  const showBoxRef = useRef(showBox);

  useEffect(() => {
    showBoxRef.current = showBox;
    if (boxRef.current) boxRef.current.visible = showBox;
  }, [showBox]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.001, 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    let points: THREE.Points | null = null;
    let axes: THREE.AxesHelper | null = null;

    fitRef.current = () => {
      const box = points?.geometry.boundingBox;
      if (!box) return;
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.001);
      const distance = maxDim * 1.8;
      camera.near = maxDim / 100;
      camera.far = maxDim * 100;
      camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = container;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });
    resizeObserver.observe(container);

    (async () => {
      try {
        const { geometry, resolvedPath } = await fetchPly(plyPath, yamlPath);
        if (disposed) return geometry.dispose();

        const size = geometry.boundingBox!.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z, 0.001);
        const hasColor = !!geometry.getAttribute('color');
        points = new THREE.Points(
          geometry,
          new THREE.PointsMaterial({
            size: maxDim / 150,
            sizeAttenuation: true,
            vertexColors: hasColor,
            color: hasColor ? 0xffffff : 0x22d3ee,
          })
        );
        scene.add(points);
        // Cloud's own origin and axes (X red, Y green, Z blue).
        axes = new THREE.AxesHelper(maxDim * 0.5);
        scene.add(axes);
        // Axis-aligned bounding box, the extents the pose_*_bbox_dim bounds are compared to.
        const box = new THREE.Box3Helper(geometry.boundingBox!, 0xfbbf24);
        box.visible = showBoxRef.current;
        boxRef.current = box;
        scene.add(box);
        fitRef.current();
        setInfo({ pointCount: geometry.getAttribute('position').count, size, resolvedPath });
      } catch (e) {
        if (!disposed) setError(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.dispose();
      if (points) {
        points.geometry.dispose();
        (points.material as THREE.Material).dispose();
      }
      axes?.dispose();
      boxRef.current?.dispose();
      boxRef.current = null;
      renderer.dispose();
      renderer.domElement.remove();
      fitRef.current = () => {};
    };
  }, [plyPath, yamlPath]);

  const fit = useCallback(() => fitRef.current(), []);
  const mm = (v: number) => (v * 1000).toFixed(1);
  const fileName = plyPath.split(/[\\/]/).pop();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vp-ply-title"
        className="w-full max-w-4xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200/60 dark:border-white/5">
          <div className="min-w-0">
            <h2 id="vp-ply-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              {fileName}
            </h2>
            <p
              className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate"
              title={info?.resolvedPath ?? plyPath}
            >
              {info?.resolvedPath ?? plyPath}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('close')}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <IconX size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="relative h-[60vh] min-h-[18rem] bg-slate-950">
          <div ref={containerRef} className="absolute inset-0" />
          {info && (
            <div className="absolute top-3 right-3 flex gap-2">
              <button
                onClick={() => setShowBox((v) => !v)}
                aria-pressed={showBox}
                className={`p-1.5 rounded-lg backdrop-blur border transition-colors ${
                  showBox
                    ? 'bg-amber-400/30 hover:bg-amber-400/40 border-amber-300/40 text-amber-100'
                    : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                }`}
                title={t('toggleBbox')}
                aria-label={t('toggleBbox')}
              >
                <IconCube size={16} />
              </button>
              <button
                onClick={fit}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur border border-white/10 text-white transition-colors"
                title={t('fitView')}
                aria-label={t('fitView')}
              >
                <IconMaximize size={16} />
              </button>
            </div>
          )}
          {!info && !error && (
            <div className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-slate-400 pointer-events-none">
              <IconLoader2 size={16} className="animate-spin" />
              {t('loading')}
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="max-w-lg p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-300 whitespace-pre-wrap break-all">
                {error}
              </p>
            </div>
          )}
        </div>

        {info && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 px-6 py-3 border-t border-slate-200/60 dark:border-white/5 text-xs text-slate-600 dark:text-slate-300">
            <span>
              <span className="text-slate-400">{t('points')}</span>{' '}
              <span className="tabular-nums font-semibold">{info.pointCount.toLocaleString()}</span>
            </span>
            <span>
              <span className="text-slate-400">{t('bbox')}</span>{' '}
              <span className="tabular-nums font-mono">
                {mm(info.size.x)} × {mm(info.size.y)} × {mm(info.size.z)} mm
              </span>
            </span>
            <span>
              <span className="text-slate-400">{t('diagonal')}</span>{' '}
              <span className="tabular-nums font-mono">{mm(info.size.length())} mm</span>
            </span>
            <span className="text-slate-400">{t('axesHint')}</span>
          </div>
        )}
      </div>
    </div>
  );
}
