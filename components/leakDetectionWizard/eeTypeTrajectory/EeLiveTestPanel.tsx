'use client';

import { useTranslations } from 'next-intl';
import {
  IconAlertTriangle,
  IconHome,
  IconLock,
  IconLockOpen,
  IconPlayerStop,
  IconPlugConnected,
  IconPlugConnectedX,
  IconShieldOff,
} from '@tabler/icons-react';
import { RETURN_HOME, type LiveTest } from './liveTest';

const STATE_STYLE: Record<string, string> = {
  IDLE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  BUSY: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  TEST: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  UNKNOWN: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
  UNREACHABLE: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

const BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed';
const BUTTON_NEUTRAL = `${BUTTON} border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300`;

interface EeLiveTestPanelProps {
  live: LiveTest;
  connected: boolean;
  // Asks to connect (the page shows the confirmation first) or disconnects.
  onToggle: () => void;
  // Why the play button cannot run the routine on the tool right now; null = it can.
  blockReason: string | null;
  // The operator bypassed the system-state check for this connection.
  override: boolean;
  // Asks to bypass it (the page shows the second confirmation first) or re-arms the check.
  onToggleOverride: () => void;
  cardClass: string;
}

// Side card of the trajectory page: connection to the real end effector for a tool-only run of
// the displayed routine.
export function EeLiveTestPanel({
  live,
  connected,
  onToggle,
  blockReason,
  override,
  onToggleOverride,
  cardClass,
}: EeLiveTestPanelProps) {
  const t = useTranslations('leakDetection.eeTrajectory.live');
  const tState = useTranslations('leakDetection.configure.endEffectorManager.test.state');
  const { status, unreachable, note, busy } = live;
  const run = status?.dry_run;
  const stateKey = unreachable ? 'UNREACHABLE' : (status?.system_state ?? 'UNKNOWN');
  const commanded = (name: string) => run?.joints.find((j) => j.name === name)?.commanded_deg;
  // Offered only when the system state is what stands in the way (or the bypass is already on).
  const overrideOffered = override || !!run?.can_force || (!!run?.blocked && !!run?.available);
  const canHome = override ? !!run?.available && !run.running : !!run?.can_start;

  return (
    <div className={`p-4 ${cardClass} ${connected ? '!border-amber-500/50' : ''}`}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
        {connected ? <IconPlugConnected size={18} /> : <IconPlugConnectedX size={18} />}
        {t('title')}
      </h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t('description')}</p>

      <button
        type="button"
        onClick={onToggle}
        aria-pressed={connected}
        className={`${BUTTON} w-full ${
          connected
            ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25'
            : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25'
        }`}
      >
        {connected ? t('disconnect') : t('connect')}
      </button>

      {connected && (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATE_STYLE[stateKey]}`}
              title={unreachable ?? undefined}
            >
              {status?.test_mode ? <IconLock size={12} /> : null}
              {tState(stateKey)}
            </span>
            {status?.end_effector_type && (
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 break-all">
                {status.end_effector_type}
              </span>
            )}
          </div>

          {/* With the bypass on, the state's own hint ("no test is possible now") no longer applies. */}
          {!(override && (stateKey === 'BUSY' || stateKey === 'IDLE')) && (
            <p className="text-xs text-slate-600 dark:text-slate-300">{t(`hint.${stateKey}`)}</p>
          )}

          {status?.system_state === 'IDLE' && (
            <button
              type="button"
              onClick={() => live.setTestMode(true)}
              disabled={busy || !status.can_enter}
              className={`${BUTTON} w-full border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25`}
            >
              <IconLock size={14} />
              {t('enterTestMode')}
            </button>
          )}
          {status?.test_mode && (
            <button
              type="button"
              onClick={() => live.setTestMode(false)}
              disabled={busy}
              className={`${BUTTON} w-full border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25`}
            >
              <IconLockOpen size={14} />
              {t('exitTestMode')}
            </button>
          )}

          {overrideOffered && (
            <div
              className={`p-2 rounded-lg border text-xs ${
                override
                  ? 'border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300'
                  : 'border-slate-200/60 dark:border-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 accent-red-600"
                  checked={override}
                  onChange={onToggleOverride}
                  disabled={!!run?.running}
                />
                <span>
                  <span className="flex items-center gap-1 font-semibold">
                    <IconShieldOff size={13} />
                    {t('override.label')}
                  </span>
                  <span className="block mt-0.5">{t(override ? 'override.active' : 'override.hint')}</span>
                </span>
              </label>
            </div>
          )}

          {blockReason ? (
            <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words">{blockReason}</span>
            </p>
          ) : (
            <p className="text-xs text-emerald-700 dark:text-emerald-300">
              {run?.running ? t('running', { target: run.target ?? '' }) : t('ready')}
            </p>
          )}

          {status?.servo.available && (
            <ul className="space-y-1.5">
              {status.servo.joints.map((j) => (
                <li
                  key={j.index}
                  className="p-2 rounded-lg border border-slate-200/60 dark:border-white/5 bg-white/50 dark:bg-slate-900/40"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate" title={j.name}>
                      {j.name}
                    </span>
                    <span className="text-[10px] text-slate-400">{t('servo', { id: j.servo_id })}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-xs font-mono tabular-nums">
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('commanded')}{' '}
                      <span className="text-slate-800 dark:text-slate-100">
                        {commanded(j.name) === undefined ? '—' : `${commanded(j.name)!.toFixed(1)}°`}
                      </span>
                    </span>
                    <span className="text-slate-500 dark:text-slate-400">
                      {t('measured')}{' '}
                      <span className="text-slate-800 dark:text-slate-100">
                        {j.position_deg === null ? '—' : `${j.position_deg.toFixed(1)}°`}
                      </span>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {status?.servo.available && status.servo.error && (
            <p className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="font-mono break-words">{status.servo.error}</span>
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => live.start(RETURN_HOME, override)}
              disabled={busy || !canHome}
              className={`${BUTTON_NEUTRAL} flex-1`}
            >
              <IconHome size={14} />
              {t('home')}
            </button>
            <button
              type="button"
              onClick={() => live.stop()}
              disabled={!run?.running}
              className={`${BUTTON} flex-1 border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-500/15`}
            >
              <IconPlayerStop size={14} />
              {t('stop')}
            </button>
          </div>

          {note && (
            <p
              role="status"
              className={`p-2 rounded-lg border text-xs break-words ${
                note.ok
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
              }`}
            >
              {note.text}
            </p>
          )}
          {run && !run.running && run.ok !== null && run.message && (
            <p
              className={`text-xs break-words ${
                run.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'
              }`}
            >
              {t('lastResult')} {run.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
