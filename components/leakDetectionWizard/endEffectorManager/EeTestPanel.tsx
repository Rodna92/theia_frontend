'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconAlertTriangle,
  IconHome,
  IconInfoCircle,
  IconLock,
  IconLockOpen,
  IconMinus,
  IconPlayerStop,
  IconPlus,
} from '@tabler/icons-react';
import { prettyName } from './geometry';

// Mirrors ee_app/nodes/ee_test_gateway.py (GET /status).
interface TestJoint {
  index: number;
  name: string;
  servo_id: number;
  min_deg: number;
  max_deg: number;
  position_deg: number | null;
  position_counts: number | null;
  at_home: boolean | null;
}

interface TestStatus {
  system_state: 'BUSY' | 'IDLE' | 'TEST' | 'UNKNOWN';
  test_mode: boolean;
  can_enter: boolean;
  end_effector_type: string;
  servo: {
    available: boolean;
    reason: string;
    connected: boolean;
    error: string;
    max_jog_step_deg: number;
    max_speed_deg_s: number;
    joints: TestJoint[];
  };
}

interface CommandReply {
  ok: boolean;
  message: string;
  status?: TestStatus;
  unreachable?: boolean;
}

const API = '/api/end-effectors/test';
const STEPS_DEG = [0.5, 1, 2, 5];
const POLL_MS = 1000;
const JOG_REPEAT_MS = 150;

const STATE_STYLE: Record<string, string> = {
  IDLE: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  BUSY: 'border-slate-400/40 bg-slate-500/10 text-slate-600 dark:text-slate-300',
  TEST: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
  UNKNOWN: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
  UNREACHABLE: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300',
};

const BUTTON =
  'inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed';
const BUTTON_NEUTRAL = `${BUTTON} border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300`;

// Where the joint is inside its permitted range, with a tick at home (0 deg).
function RangeBar({ joint }: { joint: TestJoint }) {
  const span = joint.max_deg - joint.min_deg || 1;
  const pct = (deg: number) => `${Math.min(100, Math.max(0, ((deg - joint.min_deg) / span) * 100))}%`;
  return (
    <div className="relative h-1.5 rounded-full bg-slate-200 dark:bg-slate-700/60" aria-hidden>
      <div className="absolute -top-0.5 h-2.5 w-px bg-slate-400" style={{ left: pct(0) }} />
      {joint.position_deg !== null && (
        <div
          className="absolute -top-[3px] h-3 w-3 -ml-1.5 rounded-full bg-cyan-500 ring-2 ring-white dark:ring-slate-900"
          style={{ left: pct(joint.position_deg) }}
        />
      )}
    </div>
  );
}

export function EeTestPanel() {
  const t = useTranslations('leakDetection.configure.endEffectorManager.test');
  const [status, setStatus] = useState<TestStatus | null>(null);
  const [unreachable, setUnreachable] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [exitFailed, setExitFailed] = useState(false);
  const [step, setStep] = useState(1);
  const inFlight = useRef(false);
  const holding = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return; // a command's own reply carries a fresher status
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const body = await res.json();
      if (inFlight.current) return;
      if (res.ok) {
        setStatus(body as TestStatus);
        setUnreachable(null);
      } else {
        setStatus(null);
        setUnreachable(String(body?.message ?? res.status));
      }
    } catch (e) {
      setStatus(null);
      setUnreachable(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => {
      clearInterval(timer);
      holding.current = false;
    };
  }, [refresh]);

  const send = useCallback(async (action: string, body: Record<string, unknown> = {}): Promise<boolean> => {
    inFlight.current = true;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...body }),
      });
      const reply = (await res.json()) as CommandReply;
      if (reply.status) {
        setStatus(reply.status);
        setUnreachable(null);
      } else if (reply.unreachable) {
        setStatus(null);
        setUnreachable(reply.message);
      }
      // Jog replies are only worth showing when they fail (e.g. a limit was reached).
      if (!reply.ok || action !== 'jog') setNote({ ok: reply.ok, text: reply.message });
      return reply.ok;
    } catch (e) {
      setNote({ ok: false, text: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      inFlight.current = false;
    }
  }, []);

  const command = async (action: string, body: Record<string, unknown> = {}) => {
    setBusy(true);
    const ok = await send(action, body);
    setBusy(false);
    return ok;
  };

  const setTestMode = async (enabled: boolean, force = false) => {
    const ok = await command('test-mode', { enabled, force });
    setExitFailed(!enabled && !ok);
  };

  // Hold to jog: one step per reply while the button stays pressed; stops at the first refusal.
  const startJog = async (joint: number, direction: 1 | -1) => {
    if (holding.current) return;
    holding.current = true;
    while (holding.current) {
      if (!(await send('jog', { joint, delta_deg: direction * step }))) break;
      await new Promise((r) => setTimeout(r, JOG_REPEAT_MS));
    }
    holding.current = false;
  };
  const stopJog = () => {
    holding.current = false;
  };

  const stateKey = unreachable ? 'UNREACHABLE' : (status?.system_state ?? 'UNKNOWN');
  const testMode = !!status?.test_mode;
  const servo = status?.servo;
  const canJog = testMode && !!servo?.connected && !busy;
  const steps = STEPS_DEG.filter((s) => !servo || s <= servo.max_jog_step_deg);

  return (
    <section
      className={`mb-6 p-6 rounded-lg border ring-1 ring-inset ${
        testMode
          ? 'border-amber-500/50 bg-amber-500/5 ring-amber-500/20'
          : 'border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-slate-200/20 dark:ring-white/5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[14rem]">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('title')}</h2>
          <p className="text-xs text-slate-500">{t('description')}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATE_STYLE[stateKey]}`}
          title={unreachable ?? undefined}
        >
          {testMode ? <IconLock size={12} /> : null}
          {t(`state.${stateKey}`)}
        </span>
        {testMode ? (
          <button
            type="button"
            onClick={() => setTestMode(false)}
            disabled={busy}
            className={`${BUTTON} border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25`}
          >
            <IconLockOpen size={14} />
            {busy ? t('working') : t('exit')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setTestMode(true)}
            disabled={busy || !status?.can_enter}
            className={`${BUTTON} border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25`}
          >
            <IconLock size={14} />
            {t('enter')}
          </button>
        )}
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
        <IconInfoCircle size={14} className="shrink-0 mt-0.5 text-slate-400" />
        <span>{t(`hint.${stateKey}`)}</span>
      </p>

      {note && (
        <div
          role="status"
          className={`mt-3 flex flex-wrap items-center gap-3 p-2.5 rounded-lg border text-xs ${
            note.ok
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
          }`}
        >
          {!note.ok && <IconAlertTriangle size={14} className="shrink-0" />}
          <span className="flex-1 min-w-0 break-words">{note.text}</span>
          {exitFailed && testMode && (
            <button
              type="button"
              onClick={() => setTestMode(false, true)}
              disabled={busy}
              title={t('exitForceHint')}
              className={`${BUTTON} border-red-500/40 hover:bg-red-500/15`}
            >
              {t('exitForce')}
            </button>
          )}
        </div>
      )}

      {status && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-2">{t('tool')}</span>
              <span className="font-mono">{status.end_effector_type ? prettyName(status.end_effector_type) : '—'}</span>
            </div>
            {servo?.available && (
              <>
                <div className="flex items-center gap-1 ml-auto" role="group" aria-label={t('step')}>
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mr-1">{t('step')}</span>
                  {steps.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStep(s)}
                      aria-pressed={step === s}
                      className={`px-2 py-1 rounded-md border text-xs font-mono ${
                        step === s
                          ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200/70 dark:border-white/10 text-slate-500 hover:text-cyan-700 dark:hover:text-cyan-300'
                      }`}
                    >
                      {s}°
                    </button>
                  ))}
                </div>
                <button type="button" onClick={() => command('home')} disabled={!canJog} className={BUTTON_NEUTRAL}>
                  <IconHome size={14} />
                  {t('home')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopJog();
                    command('stop');
                  }}
                  disabled={!testMode || !servo.connected}
                  className={`${BUTTON} border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-500/15`}
                >
                  <IconPlayerStop size={14} />
                  {t('stop')}
                </button>
              </>
            )}
          </div>

          {!servo?.available && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('noServos')} <span className="font-mono">{servo?.reason}</span>
            </p>
          )}
          {servo?.available && servo.error && (
            <p className="mb-3 flex items-start gap-1.5 text-xs text-red-700 dark:text-red-300">
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {t('busError')} <span className="font-mono break-words">{servo.error}</span>
              </span>
            </p>
          )}

          {servo?.available && (
            <ul className="space-y-2">
              {servo.joints.map((j) => (
                <li
                  key={j.index}
                  className="flex flex-wrap items-center gap-3 p-3 rounded-lg border border-slate-200/60 dark:border-white/5 bg-white/50 dark:bg-slate-900/40"
                >
                  <div className="w-36 shrink-0">
                    <div className="text-xs font-mono font-medium text-slate-700 dark:text-slate-200 truncate" title={j.name}>
                      {j.name}
                    </div>
                    <div className="text-[10px] text-slate-400">{t('servo', { id: j.servo_id })}</div>
                  </div>
                  <div className="flex-1 min-w-[10rem]">
                    <RangeBar joint={j} />
                    <div className="mt-1.5 flex justify-between text-[10px] font-mono text-slate-400">
                      <span>{j.min_deg.toFixed(1)}°</span>
                      <span>{j.max_deg.toFixed(1)}°</span>
                    </div>
                  </div>
                  <div className="w-24 shrink-0 text-right">
                    <div className="text-sm font-mono font-semibold text-slate-800 dark:text-slate-100">
                      {j.position_deg === null ? '—' : `${j.position_deg.toFixed(1)}°`}
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {j.at_home ? t('atHome') : j.position_counts === null ? '' : t('counts', { counts: j.position_counts })}
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {([-1, 1] as const).map((direction) => (
                      <button
                        key={direction}
                        type="button"
                        disabled={!canJog}
                        onPointerDown={(e) => {
                          if (e.button === 0) startJog(j.index, direction);
                        }}
                        onPointerUp={stopJog}
                        onPointerLeave={stopJog}
                        onPointerCancel={stopJog}
                        onKeyDown={(e) => {
                          if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) startJog(j.index, direction);
                        }}
                        onKeyUp={stopJog}
                        onBlur={stopJog}
                        aria-label={t(direction < 0 ? 'jogMinus' : 'jogPlus', { joint: j.name, step })}
                        title={t('jogHint')}
                        className={`${BUTTON_NEUTRAL} w-10 h-9 select-none touch-none`}
                      >
                        {direction < 0 ? <IconMinus size={16} /> : <IconPlus size={16} />}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
