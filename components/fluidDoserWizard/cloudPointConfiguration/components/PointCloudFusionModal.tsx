'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as THREE from 'three';
import { IconX, IconGitMerge, IconDownload } from '@tabler/icons-react';
import { ScrollableContainer } from '@/ui/ScrollableContainer';
import { LoadedFrameCloud } from '../../pointCloudShared/types';
import { encodeAsciiPly } from '../cadToPointCloud';
import { CadViewer } from './CadViewer';

interface PointCloudFusionModalProps {
  frames: LoadedFrameCloud[];
  onClose: () => void;
}

function colorToCss(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

// Concatenates the position arrays of the selected clouds into one buffer —
// a plain vertex-count merge, no dedup/registration, since the source clouds
// are assumed to already share a common frame.
function mergePositions(clouds: LoadedFrameCloud[]): Float32Array {
  const arrays = clouds.map((cloud) => {
    const position = cloud.geometry.getAttribute('position');
    return position.array instanceof Float32Array ? position.array : Float32Array.from(position.array);
  });

  const merged = new Float32Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) {
    merged.set(array, offset);
    offset += array.length;
  }
  return merged;
}

export function PointCloudFusionModal({ frames, onClose }: PointCloudFusionModalProps) {
  const t = useTranslations();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set(frames.map((frame) => frame.id)));
  const [fusedPositions, setFusedPositions] = useState<Float32Array | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleSelected = (id: string) => {
    setFusedPositions(null);
    setError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedFrames = useMemo(
    () => frames.filter((frame) => selectedIds.has(frame.id)),
    [frames, selectedIds]
  );

  const handleFusePointClouds = () => {
    if (selectedFrames.length === 0) {
      setError(t('fluidDoser.cloudPointConfiguration.selectAtLeastOnePointCloud'));
      return;
    }
    setError(null);
    setFusedPositions(mergePositions(selectedFrames));
  };

  const handleExport = () => {
    if (!fusedPositions) return;

    const plyText = encodeAsciiPly(fusedPositions);
    const blob = new Blob([plyText], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = 'fused-point-cloud.ply';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const fusedPointCount = fusedPositions ? fusedPositions.length / 3 : null;

  // A fresh BufferGeometry per fusion — CadViewer/useCadViewer disposes the
  // previous one whenever this reference changes, same lifecycle as the CAD
  // conversion preview elsewhere on this page.
  const fusedGeometry = useMemo(() => {
    if (!fusedPositions) return null;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(fusedPositions, 3));
    geometry.computeBoundingBox();
    return geometry;
  }, [fusedPositions]);

  return (
    <div className="w-full max-w-2xl bg-white/70 dark:bg-slate-950/60 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-slate-200/50 dark:border-white/5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('fluidDoser.cloudPointConfiguration.fusionModalTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-500">
            {t('fluidDoser.cloudPointConfiguration.fusionModalDescription')}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          aria-label="Close"
        >
          <IconX size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <div className="p-6 pb-4">
        <CadViewer
          meshGeometry={null}
          pointCloudGeometry={fusedGeometry}
          clip={null}
          emptyMessage={t('fluidDoser.cloudPointConfiguration.fusionPreviewEmpty')}
        />
      </div>

      <ScrollableContainer className="flex-1 px-6 pb-6">
        {frames.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t('fluidDoser.cloudPointConfiguration.noPointCloudsAvailable')}
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {frames.map((frame) => (
              <label
                key={frame.id}
                className={`flex items-start gap-3 p-3 rounded-lg border bg-white/40 dark:bg-slate-900/30 hover:bg-white/60 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
                  selectedIds.has(frame.id)
                    ? 'border-slate-500/70 dark:border-white/50'
                    : 'border-slate-200/50 dark:border-white/5'
                }`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(frame.id)}
                  onChange={() => toggleSelected(frame.id)}
                  className="sr-only"
                />
                <span
                  className="self-stretch w-1 rounded-full shrink-0"
                  style={{ backgroundColor: colorToCss(frame.color) }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {frame.fileName}
                  </span>
                  <span className="block text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
                    {frame.pointCount.toLocaleString()} pts
                  </span>
                </span>
              </label>
            ))}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600 dark:text-red-400">{error}</p>}

        {fusedPointCount !== null && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
            {fusedPointCount.toLocaleString()} {t('fluidDoser.cloudPointConfiguration.fusedPointsSummary')}
          </p>
        )}
      </ScrollableContainer>

      <div className="border-t border-slate-200/50 dark:border-white/5 p-4 bg-white/30 dark:bg-slate-900/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={handleFusePointClouds}
            disabled={frames.length === 0}
            className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconGitMerge size={16} />
            {t('fluidDoser.cloudPointConfiguration.fusePointClouds')}
          </button>

          <button
            onClick={handleExport}
            disabled={!fusedPositions}
            className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconDownload size={16} />
            {t('fluidDoser.cloudPointConfiguration.export')}
          </button>
        </div>

        <button
          onClick={onClose}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/30 transition-colors text-sm font-semibold"
        >
          {t('fluidDoser.cloudPointConfiguration.done')}
        </button>
      </div>
    </div>
  );
}
