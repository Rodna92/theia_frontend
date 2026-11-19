'use client';

import { useTranslations } from 'next-intl';
import { IconActivity } from '@tabler/icons-react';
import type { RunStats } from './liveTest';

// A position this far from the command is not a tracking lag (ee_test_core.WRONG_POSITION_DEG).
const WRONG_POSITION_DEG = 20;
const LAST_FAILURES = 5;

const WARN = 'text-amber-700 dark:text-amber-300';
const BAD = 'text-red-700 dark:text-red-300';
const ms = (value: number | null) => (value === null ? '—' : value.toFixed(1));
const deg = (value: number | null) => (value === null ? '—' : `${value.toFixed(1)}°`);

function Tile({ label, value, tone, title }: { label: string; value: string; tone?: string; title?: string }) {
  return (
    <div className="px-2 py-1.5 rounded-md bg-slate-500/5 dark:bg-white/5" title={title}>
      <div className="text-[10px] leading-tight font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className={`text-sm font-mono font-semibold tabular-nums ${tone ?? 'text-slate-800 dark:text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

// The servo bus over the current (or last) run of routine commands on the tool: the same indicators
// as the bus diagnostic of the End Effector Manager, measured on the routine itself.
export function RunBusStats({ run }: { run: RunStats | null }) {
  const t = useTranslations('leakDetection.eeTrajectory.live.run');
  const tCol = useTranslations('leakDetection.configure.endEffectorManager.test.diag');

  if (!run) {
    return <p className="text-xs text-slate-500 dark:text-slate-400">{t('none')}</p>;
  }
  const faulty = run.read_failures > 0 || run.acks_missing > 0 || run.checksum_mismatches > 0;
  const lagTone = (value: number | null) => (value !== null && value > WRONG_POSITION_DEG ? WARN : undefined);
  const failures = run.failures.slice(-LAST_FAILURES).reverse();

  return (
    <div
      className={`p-2 rounded-lg border text-xs ${
        faulty ? 'border-red-500/40 bg-red-500/5' : 'border-slate-200/60 dark:border-white/10'
      }`}
    >
      <div className="flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-200">
        <IconActivity size={14} className={run.running ? 'text-cyan-600 dark:text-cyan-400 animate-pulse' : ''} />
        <span className="flex-1">{t('title')}</span>
        <span
          className={`px-1.5 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wide ${
            run.running
              ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
              : faulty
                ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {t(run.running ? 'running' : faulty ? 'faults' : 'clean')}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
        {t('when', {
          number: run.number,
          time: new Date(run.started * 1000).toLocaleTimeString(),
          duration: run.duration_s.toFixed(1),
        })}
      </p>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Tile label={tCol('col.reads')} value={String(run.reads)} />
        <Tile
          label={tCol('col.failed')}
          value={`${run.read_failures} (${run.failure_pct.toFixed(2)} %)`}
          tone={run.read_failures > 0 ? BAD : undefined}
        />
        <Tile label={tCol('col.commands')} value={String(run.moves)} />
        <Tile
          label={tCol('col.ackMissing')}
          value={run.acks + run.acks_missing === 0 ? '—' : String(run.acks_missing)}
          tone={run.acks_missing > 0 ? WARN : undefined}
          title={tCol('ackHint')}
        />
        <Tile
          label={tCol('col.ackMs')}
          value={run.acks === 0 ? '—' : `${ms(run.ack_ms_avg)} / ${ms(run.ack_ms_max)}`}
          title={tCol('ackHint')}
        />
        <Tile
          label={tCol('col.checksum')}
          value={String(run.checksum_mismatches)}
          tone={run.checksum_mismatches > 0 ? WARN : undefined}
          title={tCol('checksumHint')}
        />
      </div>

      <div className="mt-2">
        <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {tCol('col.lag')}
        </div>
        <ul className="mt-0.5 space-y-0.5 font-mono tabular-nums">
          {run.joints.map((j) => (
            <li key={j.name} className="flex justify-between gap-2">
              <span className="truncate text-slate-600 dark:text-slate-300" title={j.name}>
                {j.name}
              </span>
              <span className={`font-semibold ${lagTone(j.max_lag_deg) ?? 'text-slate-800 dark:text-slate-100'}`}>
                {deg(j.max_lag_deg)}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-0.5 text-[10px] text-slate-400">{t('lagHint')}</p>
      </div>

      {run.by_servo.length > 1 && (
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t('perServo')}
          </div>
          <ul className="mt-0.5 space-y-0.5 font-mono tabular-nums">
            {run.by_servo.map((s) => (
              <li key={s.servo_id} className={`flex justify-between gap-2 ${s.read_failures > 0 ? BAD : ''}`}>
                <span>{t('servo', { id: s.servo_id })}</span>
                <span>{t('servoReads', { failed: s.read_failures, reads: s.reads })}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {run.read_failures > 0 && (
        <div className="mt-2">
          <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            {t('lastFailures')}
          </div>
          {Object.keys(run.kinds).length > 0 && (
            <p className={`mt-0.5 ${BAD}`}>
              {Object.entries(run.kinds)
                .map(([kind, n]) => `${kind} ×${n}`)
                .join(', ')}
            </p>
          )}
          <ul className="mt-0.5 space-y-0.5 font-mono text-[11px] tabular-nums text-slate-600 dark:text-slate-300">
            {failures.map((f) => (
              <li key={f.n} className="break-all" title={f.raw || undefined}>
                {new Date(f.time * 1000).toLocaleTimeString()} · {t('servo', { id: f.servo_id })} · {f.kind}
                {f.ms_since_move !== null && ` · ${t('afterCommand', { ms: f.ms_since_move })}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
