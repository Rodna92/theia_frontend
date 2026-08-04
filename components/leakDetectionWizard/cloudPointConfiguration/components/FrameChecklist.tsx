'use client';

import { useTranslations } from 'next-intl';
import { IconPlus, IconLoader, IconLayersUnion } from '@tabler/icons-react';
import { LoadedFrameCloud } from '../../pointCloudShared/types';

interface FrameChecklistProps {
  frames: LoadedFrameCloud[];
  missingFiles: string[];
  onToggle: (id: string) => void;
  onAddPointCloud: () => void;
  isAddingPointCloud?: boolean;
  onOpenFusion: () => void;
  isFusionDisabled?: boolean;
}

function colorToCss(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function FrameChecklist({
  frames,
  missingFiles,
  onToggle,
  onAddPointCloud,
  isAddingPointCloud = false,
  onOpenFusion,
  isFusionDisabled = frames.length === 0,
}: FrameChecklistProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
      {frames.length === 0 && missingFiles.length === 0 && (
        <p className="col-span-full text-sm text-slate-500 dark:text-slate-400">
          {t('leakDetection.cloudPointConfiguration.noFrameLoaded')}
        </p>
      )}

      {frames.map((frame) => (
        <label
          key={frame.id}
          className={`flex items-start gap-3 p-3 rounded-lg border bg-white/40 dark:bg-slate-900/30 hover:bg-white/60 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
            frame.visible
              ? 'border-slate-500/70 dark:border-white/50'
              : 'border-slate-200/50 dark:border-white/5'
          }`}
        >
          <input
            type="checkbox"
            checked={frame.visible}
            onChange={() => onToggle(frame.id)}
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
            <span className="block text-xs text-slate-500 dark:text-slate-500">
              {frame.description}
            </span>
            <span className="block text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
              {frame.pointCount.toLocaleString()} pts
            </span>
          </span>
        </label>
      ))}

      <button
        type="button"
        onClick={onAddPointCloud}
        disabled={isAddingPointCloud}
        className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300/70 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isAddingPointCloud ? (
          <IconLoader className="animate-spin" size={16} />
        ) : (
          <IconPlus size={16} />
        )}
        {t('leakDetection.cloudPointConfiguration.addPointCloud')}
      </button>

      <button
        type="button"
        onClick={onOpenFusion}
        disabled={isFusionDisabled}
        className="flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed border-slate-300/70 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:border-cyan-500/50 hover:text-cyan-600 dark:hover:text-cyan-400 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <IconLayersUnion size={16} />
        {t('leakDetection.cloudPointConfiguration.pointCloudFusion')}
      </button>

      {missingFiles.length > 0 && (
        <div className="col-span-full mt-1 p-3 rounded-lg border border-amber-300/50 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
            {t('leakDetection.cloudPointConfiguration.missingFiles')}
          </p>
          <ul className="text-xs text-amber-600 dark:text-amber-500 space-y-0.5">
            {missingFiles.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
