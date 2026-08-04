'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { IconChevronLeft, IconUpload, IconLoader } from '@tabler/icons-react';
import { PointCloudViewer } from '../pointCloudShared/components/PointCloudViewer';
import { TransformsPanel } from '../pointCloudShared/components/TransformsPanel';
import { FrameTypeChecklist } from './components/FrameTypeChecklist';
import { PlaybackControls } from './components/PlaybackControls';
import { useReplayUpload } from './hooks/useReplayUpload';

export function CloudPointReplayPage() {
  const t = useTranslations();
  const locale = useLocale();

  const {
    inputRef,
    onInputChange,
    openFolderPicker,
    sequenceName,
    entries,
    currentIndex,
    currentEntry,
    currentFrameData,
    isScanning,
    isFrameLoading,
    scanError,
    visibility,
    toggleVisibility,
    isPlaying,
    play,
    pause,
    goToIndex,
    next,
    previous,
  } = useReplayUpload();

  const viewerFrames = useMemo(() => {
    if (!currentFrameData) return [];
    return currentFrameData.clouds.map((cloud) => ({
      ...cloud,
      visible: visibility[cloud.id] ?? true,
    }));
  }, [currentFrameData, visibility]);

  return (
    <div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/${locale}/process/fluid-doser`}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t('fluidDoser.configure.back')}
          >
            <IconChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('fluidDoser.cloudPointReplay.title')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {sequenceName ?? t('fluidDoser.cloudPointReplay.subtitle')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 h-[65vh]">
            <PointCloudViewer
              frames={viewerFrames}
              emptyMessage={t('fluidDoser.cloudPointReplay.emptyViewer')}
              transformsText={currentFrameData?.transformsText ?? null}
              overlay={
                <PlaybackControls
                  frameId={currentEntry?.id ?? null}
                  currentIndex={currentIndex}
                  totalFrames={entries.length}
                  isPlaying={isPlaying}
                  isFrameLoading={isFrameLoading}
                  onPlay={play}
                  onPause={pause}
                  onNext={next}
                  onPrevious={previous}
                  onScrub={goToIndex}
                />
              }
            />
          </div>

          <div className="space-y-4">
            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={onInputChange}
              style={{ display: 'none' }}
              {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
            />

            <button
              onClick={openFolderPicker}
              disabled={isScanning}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isScanning ? (
                <IconLoader className="animate-spin" size={18} />
              ) : (
                <IconUpload size={18} />
              )}
              {t('fluidDoser.cloudPointReplay.uploadSequence')}
            </button>

            {scanError && <p className="text-xs text-red-600 dark:text-red-400">{scanError}</p>}

            {entries.length === 0 && !scanError && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t('fluidDoser.cloudPointReplay.noSequenceLoaded')}
              </p>
            )}

            {entries.length > 0 && (
              <TransformsPanel transformsText={currentFrameData?.transformsText ?? null} />
            )}
          </div>

          {entries.length > 0 && (
            <div className="lg:col-span-3">
              <FrameTypeChecklist
                currentEntryFiles={currentEntry?.files ?? null}
                currentClouds={currentFrameData?.clouds ?? []}
                visibility={visibility}
                onToggle={toggleVisibility}
                isFrameLoading={isFrameLoading}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
