'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconAlertTriangle,
  IconHome,
  IconInfoCircle,
  IconLock,
  IconLockOpen,
  IconMinus,
  IconPlayerPlay,
  IconPlayerStop,
  IconPlugConnected,
  IconPlugConnectedX,
  IconPlus,
  IconRefresh,
  IconShieldOff,
  IconStethoscope,
} from '@tabler/icons-react';
import {
  type BusFailure,
  type DiagnosticScenario,
  type LiveJoint,
  type LiveTest,
} from '../eeTypeTrajectory/liveTest';
import { prettyName } from './geometry';

const STEPS_DEG = [0.5, 1, 2, 5];
const JOG_REPEAT_MS = 150;
const DURATIONS_S = [10, 20, 60, 120];
const ALL_SCENARIOS: DiagnosticScenario[] = ['idle', 'traffic', 'motion_spaced', 'motion'];
// The scenarios that move the joint.
const MOVING: DiagnosticScenario[] = ['motion_spaced', 'motion'];

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
const LABEL = 'text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest';
const TH = 'px-2 py-1 text-left font-bold';
const TD = 'px-2 py-1 align-top';

// Where the joint is inside its permitted range, with a tick at home (0 deg).
function RangeBar({ joint }: { joint: LiveJoint }) {
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

// The "i" beside a test button: opens what that test does.
function InfoButton({ open, label, onClick }: { open: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-controls="ee-diag-info"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center self-stretch px-1.5 -ml-px rounded-r-lg border text-xs ${
        open
          ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
          : 'border-slate-200/70 dark:border-white/10 text-slate-400 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300'
      }`}
    >
      <IconInfoCircle size={14} />
    </button>
  );
}

function FailureRows({ failures }: { failures: BusFailure[] }) {
  return (
    <>
      {failures.map((f) => (
        <tr key={f.n} className="border-t border-slate-200/50 dark:border-white/5">
          <td className={TD}>{new Date(f.time * 1000).toLocaleTimeString()}</td>
          <td className={TD}>{f.servo_id}</td>
          <td className={TD}>{f.kind}</td>
          <td className={`${TD} text-right`}>{f.bytes}</td>
          <td className={`${TD} break-all`}>{f.raw || '—'}</td>
          <td className={`${TD} text-right`}>{f.duration_ms}</td>
          <td className={`${TD} text-right`}>{f.ms_since_move === null ? '—' : f.ms_since_move}</td>
        </tr>
      ))}
    </>
  );
}

interface EeTestPanelProps {
  live: LiveTest;
  connected: boolean;
  // Asks to connect (the page shows the confirmation first) or disconnects.
  onToggle: () => void;
  // The operator bypassed the system-state check for this connection.
  override: boolean;
  // Asks to bypass it (the page shows the second confirmation first) or re-arms the check.
  onToggleOverride: () => void;
}

// Connection to the real end effector: manual motion of its joints and the servo-bus diagnostic.
export function EeTestPanel({ live, connected, onToggle, override, onToggleOverride }: EeTestPanelProps) {
  const t = useTranslations('leakDetection.configure.endEffectorManager.test');
  const tLive = useTranslations('leakDetection.eeTrajectory.live');
  const { status, unreachable, note, busy } = live;
  const [exitFailed, setExitFailed] = useState(false);
  const [step, setStep] = useState(1);
  const [duration, setDuration] = useState(DURATIONS_S[1]);
  const [diagJoint, setDiagJoint] = useState(0);
  // Which test's explanation is open ('all' = the whole sequence).
  const [info, setInfo] = useState<DiagnosticScenario | 'all' | null>(null);
  const holding = useRef(false);
  useEffect(() => {
    if (!connected) holding.current = false;
    return () => {
      holding.current = false;
    };
  }, [connected]);

  const stateKey = unreachable ? 'UNREACHABLE' : (status?.system_state ?? 'UNKNOWN');
  const testMode = !!status?.test_mode;
  const servo = status?.servo;
  const diagnostic = status?.diagnostic;
  const testRunning = !!status?.dry_run?.running;
  const diagRunning = !!diagnostic?.running;
  // The system state stands in the way of moving the tool (an older node only knows test mode).
  const stateBlocked = !!status && (status.blocked !== undefined ? !!status.blocked : !testMode);
  const force = override && stateBlocked;
  const allowed = !!status && (!stateBlocked || override);
  const canMove = allowed && !!servo?.connected && !testRunning && !diagRunning && !busy;
  const steps = STEPS_DEG.filter((s) => !servo?.max_jog_step_deg || s <= servo.max_jog_step_deg);
  const bus = servo?.bus;

  const setTestMode = async (enabled: boolean, forced = false) => {
    const ok = await live.setTestMode(enabled, forced);
    setExitFailed(!enabled && !ok);
  };

  // Hold to jog: one step per reply while the button stays pressed; stops at the first refusal.
  const startJog = async (joint: number, direction: 1 | -1) => {
    if (holding.current) return;
    holding.current = true;
    while (holding.current) {
      if (!(await live.jog(joint, direction * step, force))) break;
      await new Promise((r) => setTimeout(r, JOG_REPEAT_MS));
    }
    holding.current = false;
  };
  const stopJog = () => {
    holding.current = false;
  };

  const whyNot = !status
    ? null
    : stateBlocked && !override
      ? status.system_state === 'IDLE'
        ? tLive('block.needTestMode')
        : tLive('block.busy')
      : testRunning
        ? t('routineTestRunning')
        : null;

  return (
    <section
      className={`mb-6 p-6 rounded-lg border ring-1 ring-inset ${
        connected
          ? 'border-amber-500/50 bg-amber-500/5 ring-amber-500/20'
          : 'border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-slate-200/20 dark:ring-white/5'
      }`}
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[14rem]">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {connected ? <IconPlugConnected size={18} /> : <IconPlugConnectedX size={18} />}
            {t('title')}
          </h2>
          <p className="text-xs text-slate-500">{t('connectDescription')}</p>
        </div>
        {connected && (
          <span
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-bold uppercase tracking-wide ${STATE_STYLE[stateKey]}`}
            title={unreachable ?? undefined}
          >
            {testMode ? <IconLock size={12} /> : null}
            {t(`state.${stateKey}`)}
          </span>
        )}
        {connected && status?.system_state === 'IDLE' && (
          <button
            type="button"
            onClick={() => setTestMode(true)}
            disabled={busy || !status.can_enter}
            className={`${BUTTON} border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25`}
          >
            <IconLock size={14} />
            {t('enter')}
          </button>
        )}
        {connected && testMode && (
          <button
            type="button"
            onClick={() => setTestMode(false)}
            disabled={busy}
            className={`${BUTTON} border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25`}
          >
            <IconLockOpen size={14} />
            {busy ? t('working') : t('exit')}
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={connected}
          className={`${BUTTON} ${
            connected
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-800 dark:text-amber-200 hover:bg-amber-500/25'
              : 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25'
          }`}
        >
          {connected ? tLive('disconnect') : tLive('connect')}
        </button>
      </div>

      {connected && (
        <>
          {/* With the bypass on, the state's own hint ("no test is possible now") no longer applies. */}
          {!(override && (stateKey === 'BUSY' || stateKey === 'IDLE')) && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
              <IconInfoCircle size={14} className="shrink-0 mt-0.5 text-slate-400" />
              <span>{tLive(`hint.${stateKey}`)}</span>
            </p>
          )}

          {status && (override || stateBlocked) && (
            <div
              className={`mt-3 p-2 rounded-lg border text-xs ${
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
                  disabled={diagRunning || testRunning}
                />
                <span>
                  <span className="flex items-center gap-1 font-semibold">
                    <IconShieldOff size={13} />
                    {tLive('override.label')}
                  </span>
                  <span className="block mt-0.5">{tLive(override ? 'override.active' : 'override.hint')}</span>
                </span>
              </label>
            </div>
          )}

          {whyNot && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-300">
              <IconAlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span className="break-words">{whyNot}</span>
            </p>
          )}

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
        </>
      )}

      {connected && status && (
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className={`${LABEL} mr-2`}>{t('tool')}</span>
              <span className="font-mono">{status.end_effector_type ? prettyName(status.end_effector_type) : '—'}</span>
            </div>
            {servo?.available && (
              <>
                <div className="flex items-center gap-1 ml-auto" role="group" aria-label={t('step')}>
                  <span className={`${LABEL} mr-1`}>{t('step')}</span>
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
                <button type="button" onClick={() => live.home(force)} disabled={!canMove} className={BUTTON_NEUTRAL}>
                  <IconHome size={14} />
                  {t('home')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    stopJog();
                    live.stopAll();
                  }}
                  disabled={!servo.connected && !diagRunning && !testRunning}
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
                        disabled={!canMove}
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

          {servo?.available && bus && diagnostic && (
            <div className="mt-5 pt-4 border-t border-slate-200/60 dark:border-white/10">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
                <IconStethoscope size={16} />
                {t('diag.title')}
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">{t('diag.description')}</p>

              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
                <span className={bus.read_failures > 0 ? 'font-semibold text-red-700 dark:text-red-300' : ''}>
                  {t('diag.counters', {
                    time: new Date(bus.since * 1000).toLocaleTimeString(),
                    reads: bus.reads,
                    failed: bus.read_failures,
                    pct: bus.failure_pct.toFixed(2),
                    moves: bus.moves,
                  })}
                </span>
                <button type="button" onClick={() => live.resetBusStats()} disabled={busy} className={BUTTON_NEUTRAL}>
                  <IconRefresh size={14} />
                  {t('diag.reset')}
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                {servo.joints.length > 1 && (
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span className={LABEL}>{t('diag.joint')}</span>
                    <select
                      value={diagJoint}
                      onChange={(e) => setDiagJoint(Number(e.target.value))}
                      disabled={diagRunning}
                      className="px-2 py-1 rounded-md border border-slate-200/70 dark:border-white/10 bg-transparent text-xs font-mono"
                    >
                      {servo.joints.map((j) => (
                        <option key={j.index} value={j.index}>
                          {j.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                  <span className={LABEL}>{t('diag.duration')}</span>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                    disabled={diagRunning}
                    className="px-2 py-1 rounded-md border border-slate-200/70 dark:border-white/10 bg-transparent text-xs font-mono"
                  >
                    {DURATIONS_S.map((d) => (
                      <option key={d} value={d}>
                        {d} s
                      </option>
                    ))}
                  </select>
                </label>
                {ALL_SCENARIOS.map((s) => (
                  <span key={s} className="inline-flex items-center">
                    <button
                      type="button"
                      onClick={() => live.startDiagnostic([s], duration, diagJoint, force)}
                      disabled={!canMove}
                      title={t(`diag.scenarioHint.${s}`)}
                      className={`${BUTTON_NEUTRAL} rounded-r-none`}
                    >
                      <IconPlayerPlay size={13} />
                      {t(`diag.scenario.${s}`)}
                    </button>
                    <InfoButton
                      open={info === s}
                      label={t('diag.infoLabel', { test: t(`diag.scenario.${s}`) })}
                      onClick={() => setInfo(info === s ? null : s)}
                    />
                  </span>
                ))}
                <span className="inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => live.startDiagnostic(ALL_SCENARIOS, duration, diagJoint, force)}
                    disabled={!canMove}
                    className={`${BUTTON} rounded-r-none border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/25`}
                  >
                    <IconPlayerPlay size={13} />
                    {t('diag.runAll')}
                  </button>
                  <InfoButton
                    open={info === 'all'}
                    label={t('diag.infoLabel', { test: t('diag.runAll') })}
                    onClick={() => setInfo(info === 'all' ? null : 'all')}
                  />
                </span>
                <button
                  type="button"
                  onClick={() => live.stopDiagnostic()}
                  disabled={!diagRunning}
                  className={`${BUTTON} border-red-500/40 text-red-700 dark:text-red-300 hover:bg-red-500/15`}
                >
                  <IconPlayerStop size={13} />
                  {t('diag.stop')}
                </button>
              </div>

              {info && (
                <div
                  id="ee-diag-info"
                  role="note"
                  className="mt-3 p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/5 text-xs text-slate-700 dark:text-slate-200"
                >
                  <div className="flex items-center gap-1.5 font-semibold">
                    <IconInfoCircle size={14} className="text-cyan-600 dark:text-cyan-400" />
                    {info === 'all' ? t('diag.runAll') : t(`diag.scenario.${info}`)}
                  </div>
                  {info === 'all' ? (
                    <p className="mt-1">{t('diag.runAllHint')}</p>
                  ) : (
                    <dl className="mt-1.5 grid gap-x-3 gap-y-1 sm:grid-cols-[max-content_minmax(0,1fr)]">
                      <dt className={LABEL}>{t('diag.infoDoes')}</dt>
                      <dd>{t(`diag.scenarioHint.${info}`)}</dd>
                      <dt className={LABEL}>{t('diag.infoMotion')}</dt>
                      <dd className={MOVING.includes(info) ? 'font-semibold text-amber-700 dark:text-amber-300' : ''}>
                        {t(MOVING.includes(info) ? 'diag.jointMoves' : 'diag.jointStill')}
                      </dd>
                      <dt className={LABEL}>{t('diag.infoFailure')}</dt>
                      <dd>{t(`diag.failureMeans.${info}`)}</dd>
                    </dl>
                  )}
                </div>
              )}

              {diagRunning && (
                <div className="mt-3">
                  <div className="text-xs text-slate-600 dark:text-slate-300">
                    {t('diag.running', { scenario: diagnostic.scenario ? t(`diag.scenario.${diagnostic.scenario}`) : '…' })}
                  </div>
                  <div
                    className="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700/60 overflow-hidden"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(diagnostic.progress * 100)}
                  >
                    <div className="h-full bg-cyan-500" style={{ width: `${diagnostic.progress * 100}%` }} />
                  </div>
                </div>
              )}

              {diagnostic.results.length > 0 && (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-xs font-mono tabular-nums">
                    <thead>
                      <tr className="text-[10px] font-sans uppercase tracking-widest text-slate-400">
                        <th className={TH}>{t('diag.col.test')}</th>
                        <th className={`${TH} text-right`}>{t('diag.col.time')}</th>
                        <th className={`${TH} text-right`}>{t('diag.col.reads')}</th>
                        <th className={`${TH} text-right`}>{t('diag.col.failed')}</th>
                        <th className={`${TH} text-right`}>%</th>
                        <th className={`${TH} text-right`}>{t('diag.col.commands')}</th>
                        <th className={`${TH} text-right`}>{t('diag.col.lag')}</th>
                        <th className={TH}>{t('diag.col.notes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diagnostic.results.map((r, i) => (
                        <tr
                          key={i}
                          className={`border-t border-slate-200/50 dark:border-white/5 ${
                            r.read_failures > 0 || r.error ? 'bg-red-500/10 text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          <td className={`${TD} font-sans`}>{t(`diag.scenario.${r.scenario}`)}</td>
                          <td className={`${TD} text-right`}>{r.duration_s.toFixed(1)} s</td>
                          <td className={`${TD} text-right`}>{r.reads}</td>
                          <td className={`${TD} text-right font-semibold`}>{r.read_failures}</td>
                          <td className={`${TD} text-right`}>{r.failure_pct.toFixed(2)}</td>
                          <td className={`${TD} text-right`}>{r.moves}</td>
                          <td className={`${TD} text-right`}>{r.max_lag_deg === null ? '—' : `${r.max_lag_deg.toFixed(1)}°`}</td>
                          <td className={`${TD} break-words`}>
                            {r.error ||
                              Object.entries(r.kinds)
                                .map(([kind, n]) => `${kind} ×${n}`)
                                .join(', ')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!diagRunning && diagnostic.verdict && (
                <p
                  className={`mt-2 p-2.5 rounded-lg border text-xs ${
                    diagnostic.results.some((r) => r.read_failures > 0 || r.error)
                      ? 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                      : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                  }`}
                >
                  <span className="font-semibold">{t('diag.verdict')}</span> {diagnostic.verdict}
                  {diagnostic.stopped && <span className="block mt-0.5">{t('diag.stopped')}</span>}
                </p>
              )}

              <div className="mt-4">
                <div className={LABEL}>{t('diag.failuresTitle')}</div>
                {bus.failures.length === 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t('diag.noFailures')}</p>
                ) : (
                  <div className="mt-1 max-h-56 overflow-auto">
                    <table className="w-full text-[11px] font-mono tabular-nums text-slate-700 dark:text-slate-200">
                      <thead>
                        <tr className="text-[10px] font-sans uppercase tracking-widest text-slate-400">
                          <th className={TH}>{t('diag.fcol.time')}</th>
                          <th className={TH}>{t('diag.fcol.servo')}</th>
                          <th className={TH}>{t('diag.fcol.kind')}</th>
                          <th className={`${TH} text-right`}>{t('diag.fcol.bytes')}</th>
                          <th className={TH}>{t('diag.fcol.raw')}</th>
                          <th className={`${TH} text-right`}>{t('diag.fcol.duration')}</th>
                          <th className={`${TH} text-right`}>{t('diag.fcol.sinceMove')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        <FailureRows failures={[...bus.failures].reverse()} />
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
