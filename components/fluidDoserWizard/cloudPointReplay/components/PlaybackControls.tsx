'use client';

import { useTranslations } from 'next-intl';
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconPlayerTrackPrev,
  IconPlayerTrackNext,
  IconLoader,
} from '@tabler/icons-react';

interface PlaybackControlsProps {
  frameId: string | null;
  currentIndex: number;
  totalFrames: number;
  isPlaying: boolean;
  isFrameLoading: boolean;
  onPlay: () => void;
  onPause: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onScrub: (index: number) => void;
}

export function PlaybackControls({
  frameId,
  currentIndex,
  totalFrames,
  isPlaying,
  isFrameLoading,
  onPlay,
  onPause,
  onNext,
  onPrevious,
  onScrub,
}: PlaybackControlsProps) {
  const t = useTranslations();

  if (totalFrames === 0) return null;

  return (
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent flex flex-col gap-2">
      <input
        type="range"
        min={0}
        max={Math.max(totalFrames - 1, 0)}
        value={currentIndex}
        onChange={(e) => onScrub(Number(e.target.value))}
        className="w-full accent-cyan-500"
      />
      <div className="flex items-center gap-3">
        <button
          onClick={onPrevious}
          disabled={currentIndex === 0}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          title={t('fluidDoser.cloudPointReplay.previousFrame')}
          aria-label={t('fluidDoser.cloudPointReplay.previousFrame')}
        >
          <IconPlayerTrackPrev size={16} />
        </button>

        {isPlaying ? (
          <button
            onClick={onPause}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
            title={t('fluidDoser.cloudPointReplay.pause')}
            aria-label={t('fluidDoser.cloudPointReplay.pause')}
          >
            <IconPlayerPause size={16} />
          </button>
        ) : (
          <button
            onClick={onPlay}
            disabled={totalFrames < 2}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
            title={t('fluidDoser.cloudPointReplay.play')}
            aria-label={t('fluidDoser.cloudPointReplay.play')}
          >
            <IconPlayerPlay size={16} />
          </button>
        )}

        <button
          onClick={onNext}
          disabled={currentIndex >= totalFrames - 1}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white transition-colors"
          title={t('fluidDoser.cloudPointReplay.nextFrame')}
          aria-label={t('fluidDoser.cloudPointReplay.nextFrame')}
        >
          <IconPlayerTrackNext size={16} />
        </button>

        <span className="text-xs text-white/80 font-mono">
          {t('fluidDoser.cloudPointReplay.frameLabel', {
            frameId: frameId ?? '',
            current: currentIndex + 1,
            total: totalFrames,
          })}
        </span>

        {isFrameLoading && <IconLoader className="animate-spin text-white/60" size={14} />}
      </div>
    </div>
  );
}
