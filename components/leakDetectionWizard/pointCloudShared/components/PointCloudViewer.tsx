'use client';

import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconMaximize, IconBox, IconGridDots, IconAdjustmentsHorizontal, IconGauge } from '@tabler/icons-react';
import {
  useCloudPointViewer,
  InsertedCadViewMode,
  DEFAULT_POINT_SIZE,
  MIN_POINT_SIZE,
  MAX_POINT_SIZE,
  MIN_PLAYBACK_SPEED,
  MAX_PLAYBACK_SPEED,
} from '../hooks/useCloudPointViewer';
import { parseFineAlignedPose, parseTsdfTransform, parseVerdict } from '../transformsParser';
import { InsertedCadObject, LoadedFrameCloud } from '../types';
import { VerdictBanner } from './VerdictBanner';

// A target's raw transforms.txt, keyed by target name — used in multi-target
// mode to derive each target's own final-pose origin-axis marker.
export interface TargetTransformsEntry {
  targetName: string;
  transformsText: string | null;
}

interface PointCloudViewerProps {
  frames: LoadedFrameCloud[];
  emptyMessage: string;
  overlay?: ReactNode;
  transformsText?: string | null;
  targetTransforms?: TargetTransformsEntry[];
  insertedCad?: InsertedCadObject | null;
  // Present only on the replay page — renders a second slider next to point
  // size to control how fast playback advances through frames.
  playbackSpeed?: number;
  onPlaybackSpeedChange?: (speed: number) => void;
}

export function PointCloudViewer({
  frames,
  emptyMessage,
  overlay,
  transformsText,
  targetTransforms,
  insertedCad,
  playbackSpeed,
  onPlaybackSpeedChange,
}: PointCloudViewerProps) {
  const t = useTranslations();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const referencePose = useMemo(
    () => parseFineAlignedPose(transformsText ?? null),
    [transformsText]
  );
  const targetReferencePoses = useMemo(
    () =>
      (targetTransforms ?? []).map(({ targetName, transformsText: targetText }) => ({
        targetName,
        pose: parseTsdfTransform(targetText)?.matrix ?? null,
        cloudId: `${targetName}:finalPoseRefAlignedCamera`,
      })),
    [targetTransforms]
  );
  const verdict = useMemo(() => parseVerdict(transformsText ?? null), [transformsText]);
  const [insertedCadViewMode, setInsertedCadViewMode] = useState<InsertedCadViewMode>('points');
  const [pointSize, setPointSize] = useState(DEFAULT_POINT_SIZE);
  const { fitView } = useCloudPointViewer({
    containerRef,
    frames,
    referencePose,
    targetReferencePoses,
    insertedCad,
    insertedCadViewMode,
    pointSize,
  });

  // Default to the point cloud representation each time a new CAD object is
  // inserted (or the viewer is cleared out).
  useEffect(() => {
    setInsertedCadViewMode('points');
  }, [insertedCad]);

  return (
    <div className="relative w-full h-full rounded-2xl overflow-hidden border border-slate-200/60 dark:border-white/10 bg-slate-950">
      <div ref={containerRef} className="w-full h-full" />

      <VerdictBanner verdict={verdict} />

      {insertedCad && (
        <div className="absolute top-4 left-4 flex rounded-lg overflow-hidden border border-white/10 backdrop-blur">
          <button
            onClick={() => setInsertedCadViewMode('mesh')}
            className={`p-2 text-white transition-colors ${
              insertedCadViewMode === 'mesh' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'
            }`}
            title={t('leakDetection.cloudPointConfiguration.cadViewMesh')}
            aria-label={t('leakDetection.cloudPointConfiguration.cadViewMesh')}
          >
            <IconBox size={18} />
          </button>
          <button
            onClick={() => setInsertedCadViewMode('points')}
            className={`p-2 text-white transition-colors ${
              insertedCadViewMode === 'points' ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'
            }`}
            title={t('leakDetection.cloudPointConfiguration.cadViewPoints')}
            aria-label={t('leakDetection.cloudPointConfiguration.cadViewPoints')}
          >
            <IconGridDots size={18} />
          </button>
        </div>
      )}

      <button
        onClick={fitView}
        className="absolute top-4 right-4 p-2 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur border border-white/10 text-white transition-colors"
        title={t('leakDetection.pointCloud.fitView')}
        aria-label={t('leakDetection.pointCloud.fitView')}
      >
        <IconMaximize size={18} />
      </button>

      <div className="absolute bottom-4 right-4 z-10 flex items-center gap-3 px-3 py-2 rounded-lg bg-white/10 backdrop-blur border border-white/10 text-white">
        {onPlaybackSpeedChange && (
          <>
            <div className="flex items-center gap-2">
              <IconGauge size={16} />
              <input
                type="range"
                min={MIN_PLAYBACK_SPEED}
                max={MAX_PLAYBACK_SPEED}
                step={0.25}
                value={playbackSpeed}
                onChange={(e) => onPlaybackSpeedChange(parseFloat(e.target.value))}
                className="w-20 accent-cyan-400"
                title={t('leakDetection.pointCloud.playbackSpeed')}
                aria-label={t('leakDetection.pointCloud.playbackSpeed')}
              />
              <span className="text-[10px] tabular-nums w-8 text-right">
                {(playbackSpeed ?? 1).toFixed(2)}x
              </span>
            </div>
            <div className="w-px h-4 bg-white/20" />
          </>
        )}

        <IconAdjustmentsHorizontal size={16} />
        <input
          type="range"
          min={MIN_POINT_SIZE}
          max={MAX_POINT_SIZE}
          step={0.001}
          value={pointSize}
          onChange={(e) => setPointSize(parseFloat(e.target.value))}
          className="w-20 accent-cyan-400"
          title={t('leakDetection.pointCloud.pointSize')}
          aria-label={t('leakDetection.pointCloud.pointSize')}
        />
        <span className="text-[10px] tabular-nums w-8 text-right">{pointSize.toFixed(3)}</span>
      </div>

      {frames.length === 0 && !insertedCad && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm pointer-events-none px-8 text-center">
          {emptyMessage}
        </div>
      )}

      {overlay}
    </div>
  );
}
