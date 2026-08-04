'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconMaximize, IconBox, IconGridDots, IconArrowRight, IconX } from '@tabler/icons-react';
import * as THREE from 'three';
import { useCadViewer, CadViewMode } from '../hooks/useCadViewer';
import { ClipBounds } from '../cadToPointCloud';

interface CadViewerProps {
  meshGeometry: THREE.BufferGeometry | null;
  pointCloudGeometry: THREE.BufferGeometry | null;
  clip: ClipBounds | null;
  emptyMessage: string;
  isInsertedInScene?: boolean;
  onToggleInsertInScene?: () => void;
}

export function CadViewer({
  meshGeometry,
  pointCloudGeometry,
  clip,
  emptyMessage,
  isInsertedInScene = false,
  onToggleInsertInScene,
}: CadViewerProps) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [viewMode, setViewMode] = useState<CadViewMode>('mesh');
  const { fitView } = useCadViewer({ containerRef, meshGeometry, pointCloudGeometry, viewMode, clip });

  // Jump to the point cloud as soon as a conversion completes; fall back to
  // the mesh whenever there's no cloud to show (e.g. a fresh CAD upload).
  useEffect(() => {
    setViewMode(pointCloudGeometry ? 'points' : 'mesh');
  }, [pointCloudGeometry]);

  return (
    <div className="relative w-full h-56 rounded-2xl overflow-hidden border border-slate-200/60 dark:border-white/10 bg-slate-950">
      <div ref={containerRef} className="w-full h-full" />

      {meshGeometry && pointCloudGeometry && (
        <div className="absolute top-3 left-3 flex rounded-lg overflow-hidden border border-white/10 backdrop-blur">
          <button
            onClick={() => setViewMode('mesh')}
            className={`p-1.5 text-white transition-colors ${
              viewMode === 'mesh' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'
            }`}
            title={t('fluidDoser.cloudPointConfiguration.cadViewMesh')}
            aria-label={t('fluidDoser.cloudPointConfiguration.cadViewMesh')}
          >
            <IconBox size={16} />
          </button>
          <button
            onClick={() => setViewMode('points')}
            className={`p-1.5 text-white transition-colors ${
              viewMode === 'points' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'
            }`}
            title={t('fluidDoser.cloudPointConfiguration.cadViewPoints')}
            aria-label={t('fluidDoser.cloudPointConfiguration.cadViewPoints')}
          >
            <IconGridDots size={16} />
          </button>
        </div>
      )}

      <button
        onClick={fitView}
        className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur border border-white/10 text-white transition-colors"
        title={t('fluidDoser.pointCloud.fitView')}
        aria-label={t('fluidDoser.pointCloud.fitView')}
      >
        <IconMaximize size={16} />
      </button>

      {!meshGeometry && !pointCloudGeometry && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs pointer-events-none px-6 text-center">
          {emptyMessage}
        </div>
      )}

      {pointCloudGeometry && onToggleInsertInScene && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
          <button
            onClick={onToggleInsertInScene}
            className={`flex items-center gap-1.5 py-1.5 px-3 rounded-lg backdrop-blur border text-xs font-semibold transition-colors ${
              isInsertedInScene
                ? 'bg-cyan-500/30 hover:bg-cyan-500/40 border-cyan-400/40 text-cyan-100'
                : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
            }`}
          >
            {isInsertedInScene ? <IconX size={14} /> : <IconArrowRight size={14} />}
            {isInsertedInScene
              ? t('fluidDoser.cloudPointConfiguration.removeFromScene')
              : t('fluidDoser.cloudPointConfiguration.insertInScene')}
          </button>
        </div>
      )}
    </div>
  );
}
