'use client';

import { useTranslations } from 'next-intl';
import { FRAME_FILE_SPECS, LoadedFrameCloud } from '../../pointCloudShared/types';

interface FrameTypeChecklistProps {
  currentEntryFiles: Map<string, File> | null;
  currentClouds: LoadedFrameCloud[];
  visibility: Record<string, boolean>;
  onToggle: (id: string) => void;
  isFrameLoading: boolean;
}

function colorToCss(color: number) {
  return `#${color.toString(16).padStart(6, '0')}`;
}

export function FrameTypeChecklist({
  currentEntryFiles,
  currentClouds,
  visibility,
  onToggle,
  isFrameLoading,
}: FrameTypeChecklistProps) {
  const t = useTranslations();

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
      {FRAME_FILE_SPECS.map((spec) => {
        const available = currentEntryFiles?.has(spec.fileName) ?? false;
        const cloud = currentClouds.find((c) => c.id === spec.id);

        let status: string;
        if (!available) {
          status = t('leakDetection.cloudPointReplay.notAvailableInFrame');
        } else if (cloud) {
          status = `${cloud.pointCount.toLocaleString()} pts`;
        } else if (isFrameLoading) {
          status = '…';
        } else {
          status = '';
        }

        const checked = visibility[spec.id] ?? true;

        return (
          <label
            key={spec.id}
            className={`flex items-start gap-3 p-3 rounded-lg border bg-white/40 dark:bg-slate-900/30 hover:bg-white/60 dark:hover:bg-slate-800/50 cursor-pointer transition-colors ${
              checked
                ? 'border-slate-500/70 dark:border-white/50'
                : 'border-slate-200/50 dark:border-white/5'
            } ${available ? '' : 'opacity-50'}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(spec.id)}
              className="sr-only"
            />
            <span
              className="self-stretch w-1 rounded-full shrink-0"
              style={{ backgroundColor: colorToCss(spec.color) }}
            />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                {spec.fileName}
              </span>
              <span className="block text-xs text-slate-500 dark:text-slate-500">
                {spec.description}
              </span>
              <span className="block text-[10px] text-slate-400 dark:text-slate-600 mt-0.5">
                {status}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
