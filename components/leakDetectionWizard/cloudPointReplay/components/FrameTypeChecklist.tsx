'use client';

import { useTranslations } from 'next-intl';
import { FRAME_FILE_SPECS, LoadedFrameCloud } from '../../pointCloudShared/types';
import { parseRansacTransform } from '../../pointCloudShared/transformsParser';
import { ReplayTargetFrameData } from '../types';

interface FrameTypeChecklistProps {
  currentEntryFiles: Map<string, File> | null;
  currentClouds: LoadedFrameCloud[];
  visibility: Record<string, boolean>;
  onToggle: (id: string) => void;
  isFrameLoading: boolean;
  // Present only in multi-target mode — rendered as grouped per-target cards
  // (each listing its own clouds individually, keyed into the same
  // `visibility` record as single-target mode) instead of the rows below.
  targetGroups?: ReplayTargetFrameData[];
  onToggleTarget?: (targetName: string) => void;
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
  targetGroups,
  onToggleTarget,
}: FrameTypeChecklistProps) {
  const t = useTranslations();

  if (targetGroups) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
        {targetGroups.map((target) => {
          const transform = parseRansacTransform(target.transformsText);
          const allVisible = target.clouds.length > 0 && target.clouds.every((cloud) => visibility[cloud.id] ?? true);

          return (
            <div
              key={target.targetName}
              className={`flex flex-col gap-2 p-3 rounded-lg border bg-white/40 dark:bg-slate-900/30 transition-colors ${
                allVisible ? 'border-slate-500/70 dark:border-white/50' : 'border-slate-200/50 dark:border-white/5'
              }`}
            >
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={allVisible}
                  onChange={() => onToggleTarget?.(target.targetName)}
                  className="sr-only"
                />
                <span
                  className="self-stretch w-1 rounded-full shrink-0"
                  style={{ backgroundColor: colorToCss(target.color) }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                    {target.targetName}
                  </span>
                  <span className="block text-xs text-slate-500 dark:text-slate-500">
                    {transform
                      ? `${t('leakDetection.pointCloud.fitness')} ${transform.fitness.toFixed(4)} · ${t(
                          'leakDetection.pointCloud.rmse'
                        )} ${transform.rmse.toFixed(4)}`
                      : t('leakDetection.cloudPointConfiguration.noRansacTransform')}
                  </span>
                  {target.missingFiles.length > 0 && (
                    <span className="block text-[10px] text-amber-600 dark:text-amber-500 mt-0.5">
                      {t('leakDetection.cloudPointConfiguration.missingFiles')} {target.missingFiles.join(', ')}
                    </span>
                  )}
                </span>
              </label>

              {target.clouds.length > 0 && (
                <div className="flex flex-col gap-1 pl-4 border-l border-slate-200/60 dark:border-white/10">
                  {target.clouds.map((cloud) => (
                    <label key={cloud.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={visibility[cloud.id] ?? true}
                        onChange={() => onToggle(cloud.id)}
                        className="h-3 w-3 accent-cyan-500 shrink-0"
                      />
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: colorToCss(cloud.color) }}
                      />
                      <span className="flex-1 min-w-0 truncate text-[11px] text-slate-600 dark:text-slate-400">
                        {isFrameLoading ? '…' : cloud.fileName}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-600">
                        {cloud.pointCount.toLocaleString()}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

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
