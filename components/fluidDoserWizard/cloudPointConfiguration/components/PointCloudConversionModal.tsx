'use client';

import { useTranslations } from 'next-intl';
import { IconX, IconLoader, IconGridDots, IconDownload } from '@tabler/icons-react';
import * as THREE from 'three';
import { ScrollableContainer } from '@/ui/ScrollableContainer';
import { CadViewer } from './CadViewer';
import { ClipAxisControl } from './ClipAxisControl';
import { AxisClip, ClipBounds } from '../cadToPointCloud';

const CLIP_AXES = ['x', 'y', 'z'] as const;

interface PointCloudConversionModalProps {
  fileName: string;
  meshGeometry: THREE.BufferGeometry;
  pointCloudGeometry: THREE.BufferGeometry | null;
  pointCount: number;
  clippedPointCount: number;
  isConverting: boolean;
  convertError: string | null;
  voxelSize: number;
  onVoxelSizeChange: (value: number) => void;
  onConvert: () => void;
  clip: ClipBounds | null;
  clipRanges: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null;
  onClipChange: (axis: 'x' | 'y' | 'z', next: AxisClip) => void;
  exportScale: number;
  onExportScaleChange: (value: number) => void;
  onExportPly: () => void;
  isInsertedInScene: boolean;
  onToggleInsertInScene: () => void;
  onDone: () => void;
}

export function PointCloudConversionModal({
  fileName,
  meshGeometry,
  pointCloudGeometry,
  pointCount,
  clippedPointCount,
  isConverting,
  convertError,
  voxelSize,
  onVoxelSizeChange,
  onConvert,
  clip,
  clipRanges,
  onClipChange,
  exportScale,
  onExportScaleChange,
  onExportPly,
  isInsertedInScene,
  onToggleInsertInScene,
  onDone,
}: PointCloudConversionModalProps) {
  const t = useTranslations();

  return (
    <div className="w-full max-w-2xl bg-white/70 dark:bg-slate-950/60 rounded-2xl border border-slate-200/70 dark:border-white/10 shadow-2xl backdrop-blur-xl overflow-hidden transition-all duration-200 max-h-[90vh] flex flex-col">
      <div className="flex items-center justify-between p-6 border-b border-slate-200/50 dark:border-white/5">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('fluidDoser.cloudPointConfiguration.convertToPointCloud')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-500 truncate" title={fileName}>
            {fileName}
          </p>
        </div>
        <button
          onClick={onDone}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
          aria-label="Close"
        >
          <IconX size={20} className="text-slate-600 dark:text-slate-400" />
        </button>
      </div>

      <div className="p-6 pb-4">
        <CadViewer
          meshGeometry={meshGeometry}
          pointCloudGeometry={pointCloudGeometry}
          clip={clip}
          emptyMessage={t('fluidDoser.cloudPointConfiguration.cadEmptyViewer')}
          isInsertedInScene={isInsertedInScene}
          onToggleInsertInScene={pointCloudGeometry ? onToggleInsertInScene : undefined}
        />
      </div>

      <ScrollableContainer className="flex-1 px-6 pb-6">
        <div className="space-y-4">
          <div className={pointCloudGeometry ? 'grid grid-cols-2 gap-3' : 'grid grid-cols-1'}>
            <div className="space-y-1.5">
              <label
                htmlFor="cad-voxel-size"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400"
              >
                {t('fluidDoser.cloudPointConfiguration.voxelSizeLabel')}
              </label>
              <input
                id="cad-voxel-size"
                type="number"
                min="0.0001"
                step="any"
                value={voxelSize}
                onChange={(e) => onVoxelSizeChange(Number(e.target.value))}
                className="w-full py-1.5 px-3 rounded-lg bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
              />
            </div>

            {pointCloudGeometry && (
              <div className="space-y-1.5">
                <label
                  htmlFor="cad-export-scale"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                >
                  {t('fluidDoser.cloudPointConfiguration.exportScaleLabel')}
                </label>
                <input
                  id="cad-export-scale"
                  type="number"
                  step="any"
                  min="0.000001"
                  value={exportScale}
                  onChange={(e) => onExportScaleChange(Number(e.target.value))}
                  className="w-full py-1.5 px-3 rounded-lg bg-white/60 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
            )}
          </div>

          {convertError && <p className="text-xs text-red-600 dark:text-red-400">{convertError}</p>}

          {pointCloudGeometry && (
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {clippedPointCount.toLocaleString()} / {pointCount.toLocaleString()}{' '}
              {t('fluidDoser.cloudPointConfiguration.pointsGenerated')}
            </p>
          )}

          {pointCloudGeometry && clipRanges && clip && (
            <div className="space-y-3 p-3 rounded-lg border border-slate-200/60 dark:border-white/10 bg-white/40 dark:bg-slate-900/30">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                {t('fluidDoser.cloudPointConfiguration.clipTitle')}
              </p>
              {CLIP_AXES.map((axis) => (
                <ClipAxisControl
                  key={axis}
                  axisLabel={axis}
                  minLabel={t('fluidDoser.cloudPointConfiguration.clipMin')}
                  maxLabel={t('fluidDoser.cloudPointConfiguration.clipMax')}
                  value={clip[axis]}
                  rangeMin={clipRanges.min[axis]}
                  rangeMax={clipRanges.max[axis]}
                  onChange={(next) => onClipChange(axis, next)}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollableContainer>

      <div className="border-t border-slate-200/50 dark:border-white/5 p-4 bg-white/30 dark:bg-slate-900/20 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onConvert}
            disabled={isConverting || !(voxelSize > 0)}
            className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isConverting ? (
              <IconLoader className="animate-spin" size={16} />
            ) : (
              <IconGridDots size={16} />
            )}
            {t('fluidDoser.cloudPointConfiguration.convertToPointCloud')}
          </button>

          {pointCloudGeometry && (
            <button
              onClick={onExportPly}
              disabled={!(exportScale > 0)}
              className="flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <IconDownload size={16} />
              {t('fluidDoser.cloudPointConfiguration.exportPly')}
            </button>
          )}
        </div>

        <button
          onClick={onDone}
          className="px-5 py-2 rounded-lg bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/30 transition-colors text-sm font-semibold"
        >
          {t('fluidDoser.cloudPointConfiguration.done')}
        </button>
      </div>
    </div>
  );
}
