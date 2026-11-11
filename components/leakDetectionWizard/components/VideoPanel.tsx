'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

const STREAMS = ['overlay', 'color', 'mask'] as const;
type Stream = (typeof STREAMS)[number];

interface VideoPanelProps {
  // False while the workcell cannot be reached: no stream is requested at all.
  available: boolean;
}

// Debug image streams of the vision module (MJPEG through /api/video/<stream>). The vision node
// only produces them while they are being watched.
export function VideoPanel({ available }: VideoPanelProps) {
  const t = useTranslations('leakDetection.monitor.video');
  const [stream, setStream] = useState<Stream>('overlay');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A failed stream (vision not up yet, bridge restarting) is retried every few seconds.
  useEffect(() => {
    if (!available || !failed) return;
    const timer = setTimeout(() => {
      setFailed(false);
      setAttempt((n) => n + 1);
    }, 4000);
    return () => clearTimeout(timer);
  }, [available, failed]);

  const show = available && !failed;

  return (
    <div className="relative rounded-2xl overflow-hidden bg-white/70 border border-slate-200/70 shadow-sm dark:bg-slate-900/60 dark:border-white/10">
      <div className="aspect-video flex items-center justify-center bg-slate-100 dark:bg-slate-900">
        {show ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${stream}-${attempt}`}
            src={`/api/video/${stream}?n=${attempt}`}
            alt={t(stream)}
            className="w-full h-full object-contain"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="text-slate-500 dark:text-slate-400 font-mono text-sm">{t('unavailable')}</span>
        )}
      </div>

      <div className="absolute top-3 left-3 flex gap-1 p-1 rounded-full bg-white/70 border border-slate-200/70 backdrop-blur dark:bg-slate-950/60 dark:border-white/10">
        {STREAMS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setStream(s);
              setFailed(false);
            }}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors ${
              s === stream
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'text-slate-600 hover:bg-slate-900/10 dark:text-slate-300 dark:hover:bg-white/10'
            }`}
          >
            {t(s)}
          </button>
        ))}
      </div>
    </div>
  );
}
