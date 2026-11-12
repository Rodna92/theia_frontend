'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { IconAlertTriangle, IconChevronDown, IconChevronLeft, IconFileSettings, IconPlayerPause, IconPlayerPlay, IconPlayerSkipBack, IconPlayerStop, IconRoute, IconX } from '@tabler/icons-react';
import { ALL_TARGETS, EQUIPMENT_ID, MODALITY, EndEffector, RoutineTarget, TargetGroups } from './catalog';
import { EeLiveTestPanel } from './EeLiveTestPanel';
import { EeViewer } from './EeViewer';
import { EndEffectorIcon } from './EndEffectorIcon';
import { useEeLiveTest } from './liveTest';
import { buildPlayback, layoutPlacements } from './playback';

const card =
  'rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5';

const optionClass = (active: boolean) =>
  `w-full text-left px-3 py-2 rounded-lg border text-sm transition-colors ${
    active
      ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
      : 'border-slate-200/50 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
  }`;

export function EeTypeTrajectoryPage() {
  const t = useTranslations();
  const locale = useLocale();
  const [eeId, setEeId] = useState<string | null>(null);
  const [trajId, setTrajId] = useState<string | null>(null);
  const [targets, setTargets] = useState<RoutineTarget[]>([]);
  const [routineError, setRoutineError] = useState<string | null>(null);
  const [routineFile, setRoutineFile] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const [endEffectors, setEndEffectors] = useState<EndEffector[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/end-effectors')
      .then((r) => r.json())
      .then((data) => {
        setEndEffectors(data.endEffectors ?? []);
        setLoadError(data.error ?? null);
      })
      .catch((e) => setLoadError(String(e)));
  }, []);

  const ee = endEffectors.find((e) => e.id === eeId) ?? null;

  const [models, setModels] = useState<Record<string, string>>({});
  const [modelFiles, setModelFiles] = useState<string[]>([]);
  const [modelsDir, setModelsDir] = useState('');
  const [modelInput, setModelInput] = useState('');
  const [modelMessage, setModelMessage] = useState<string | null>(null);

  const modelQuery = useMemo(
    () => targets.map((tg) => tg.index).join(','),
    [targets]
  );
  const modelParams = `modality=${MODALITY}&scenery=${EQUIPMENT_ID}&endEffector=${encodeURIComponent(eeId ?? '')}`;

  useEffect(() => {
    setModels({});
    if (!eeId || !modelQuery) return;
    let cancelled = false;
    fetch(`/api/ee-target-models?${modelParams}&targets=${modelQuery}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setModels(data.assignments ?? {});
        setModelFiles(data.files ?? []);
        setModelsDir(data.dir ?? '');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [eeId, modelQuery, modelParams]);

  const [modalTarget, setModalTarget] = useState<string | null>(null);
  const selectedModelTarget = modalTarget;

  useEffect(() => {
    setModelInput(selectedModelTarget ? models[selectedModelTarget] ?? '' : '');
    setModelMessage(null);
  }, [selectedModelTarget]);

  const modelName = (index: number) => models[String(index)]?.split(/[\/]/).pop();

  const saveModel = async () => {
    if (!selectedModelTarget || !eeId) return;
    const typed = modelInput.trim();
    // A bare file name is resolved against the models folder.
    const full = typed && !/[\/]/.test(typed) ? `${modelsDir}/${typed}` : typed;
    const res = await fetch('/api/ee-target-models', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        modality: MODALITY,
        scenery: EQUIPMENT_ID,
        endEffector: eeId,
        target: selectedModelTarget,
        path: full,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setModelMessage(data.error ?? 'Error');
      return;
    }
    setModels((prev) => {
      const next = { ...prev };
      if (data.path) next[selectedModelTarget] = data.path;
      else delete next[selectedModelTarget];
      return next;
    });
    setModelMessage(t('leakDetection.eeTrajectory.modelSaved'));
  };

  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);

  const [groups, setGroups] = useState<TargetGroups | null>(null);
  useEffect(() => {
    fetch('/api/ee-target-groups')
      .then((r) => r.json())
      .then((data) => setGroups(data.anchor?.length ? (data as TargetGroups) : null))
      .catch(() => setGroups(null));
  }, []);

  const placements = useMemo(
    () => layoutPlacements(targets, trajId, groups),
    [targets, trajId, groups]
  );
  const playback = useMemo(() => buildPlayback(placements), [placements]);

  // Real end effector: when connected, play runs the displayed routine on the tool itself (tool
  // only, no robot -- ee_app's routine test) and the view follows that run's clock.
  const [connected, setConnected] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const live = useEeLiveTest(connected);
  const run = live.status?.dry_run;
  const selectedTarget = trajId && trajId !== ALL_TARGETS ? Number(trajId) : null;
  const liveRunning = connected && !!run?.running;
  // The running test is the routine on screen (not a "home" move, not another target).
  const liveFollowing = liveRunning && run?.target === selectedTarget && selectedTarget !== null;

  // Why play cannot run the routine on the tool; null = it can.
  const liveBlock = ((): string | null => {
    if (!connected) return null;
    if (live.unreachable) return t('leakDetection.eeTrajectory.live.block.unreachable');
    if (!live.status) return t('leakDetection.eeTrajectory.live.block.connecting');
    if (!eeId) return t('leakDetection.eeTrajectory.selectEeFirst');
    if (live.status.end_effector_type !== eeId) {
      return t('leakDetection.eeTrajectory.live.block.toolMismatch', {
        mounted: live.status.end_effector_type || '—',
      });
    }
    if (!run) return t('leakDetection.eeTrajectory.live.block.oldNode');
    if (!run.available) return run.reason;
    if (run.blocked) {
      return live.status.system_state === 'IDLE'
        ? t('leakDetection.eeTrajectory.live.block.needTestMode')
        : run.blocked;
    }
    if (live.status.servo.error) return live.status.servo.error;
    if (selectedTarget === null) return t('leakDetection.eeTrajectory.live.block.selectTarget');
    return null;
  })();

  const liveRef = useRef(live);
  liveRef.current = live;
  const liveRunningRef = useRef(liveRunning);
  liveRunningRef.current = liveRunning;

  // Restart whenever the displayed routine changes (a test of the previous one is stopped).
  useEffect(() => {
    setTime(0);
    setPlaying(false);
    if (liveRunningRef.current) liveRef.current.stop();
  }, [playback]);

  // Connected: the simulation is driven by the real run, extrapolated between status polls.
  const runElapsed = run?.elapsed_s ?? 0;
  useEffect(() => {
    if (!liveFollowing) return;
    let raf = 0;
    const tick = () => {
      const elapsed = runElapsed + (performance.now() - live.statusAt) / 1000;
      setTime(Math.min(Math.max(elapsed, 0), playback.total));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [liveFollowing, runElapsed, live.statusAt, playback.total]);

  const toggleConnection = () => {
    if (!connected) {
      setConfirmOpen(true);
      return;
    }
    if (liveRunning) live.stop();
    setConnected(false);
  };

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      let finished = false;
      setTime((prev) => {
        const next = prev + dt;
        if (next >= playback.total) {
          finished = true;
          return playback.total;
        }
        return next;
      });
      if (finished) setPlaying(false);
      else raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, playback]);

  const pose = time > 0 ? playback.poseAt(time) : null;
  const togglePlay = () => {
    if (connected) {
      // The tool itself runs the routine; nothing is simulated on its own.
      if (liveRunning) live.stop();
      else if (!liveBlock && selectedTarget !== null) {
        setTime(0);
        live.start(selectedTarget);
      }
      return;
    }
    if (!playing && time >= playback.total) setTime(0);
    setPlaying((p) => !p);
  };

  useEffect(() => {
    setTargets([]);
    setRoutineError(null);
    setRoutineFile(null);
    if (!eeId) return;
    let cancelled = false;
    fetch(`/api/ee-routines?equipment=${EQUIPMENT_ID}&endEffector=${encodeURIComponent(eeId)}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setTargets(data.targets ?? []);
        setRoutineFile(typeof data.file === 'string' ? data.file.split(/[\/]/).pop() ?? null : null);
        setRoutineError(data.error ?? null);
      })
      .catch((e) => !cancelled && setRoutineError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [eeId]);

  return (
    <div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/${locale}/process/leak-detection`}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t('leakDetection.configure.back')}
          >
            <IconChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('leakDetection.configure.endEffectorTitle')}
            </h1>
            <p className="text-xs text-slate-500">{t('leakDetection.configure.endEffectorSubtitle')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3">
            <div className={`h-[65vh] overflow-hidden ${card}`}>
              <EeViewer endEffector={ee} placements={placements} pose={pose} models={models} />
            </div>
            {targets.length > 0 && playback.total > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <button
                  className={`p-2 rounded-lg border hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed ${
                    connected
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-800 dark:text-amber-200'
                      : 'border-slate-200/50 dark:border-white/10 text-slate-700 dark:text-slate-300'
                  }`}
                  onClick={togglePlay}
                  disabled={connected && !liveRunning && (!!liveBlock || live.busy)}
                  title={
                    connected
                      ? liveBlock ?? t(liveRunning ? 'leakDetection.eeTrajectory.live.stopOnTool' : 'leakDetection.eeTrajectory.live.playOnTool')
                      : undefined
                  }
                  aria-label={
                    connected
                      ? t(liveRunning ? 'leakDetection.eeTrajectory.live.stopOnTool' : 'leakDetection.eeTrajectory.live.playOnTool')
                      : t(playing ? 'leakDetection.eeTrajectory.pause' : 'leakDetection.eeTrajectory.play')
                  }
                >
                  {connected ? (
                    liveRunning ? <IconPlayerStop size={18} /> : <IconPlayerPlay size={18} />
                  ) : playing ? (
                    <IconPlayerPause size={18} />
                  ) : (
                    <IconPlayerPlay size={18} />
                  )}
                </button>
                <button
                  className="p-2 rounded-lg border border-slate-200/50 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed"
                  onClick={() => {
                    setPlaying(false);
                    setTime(0);
                  }}
                  disabled={liveRunning}
                  aria-label={t('leakDetection.eeTrajectory.reset')}
                >
                  <IconPlayerSkipBack size={18} />
                </button>
                <input
                  type="range"
                  className="flex-1"
                  min={0}
                  max={playback.total}
                  step={0.05}
                  value={time}
                  disabled={liveRunning}
                  onChange={(e) => {
                    setPlaying(false);
                    setTime(parseFloat(e.target.value));
                  }}
                />
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                  {time.toFixed(1)} / {playback.total.toFixed(1)} s
                  {pose ? ` · ${pose.label}` : ''}
                </span>
              </div>
            )}
            {targets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className={`${optionClass(trajId === ALL_TARGETS)} !w-auto`}
                  onClick={() => setTrajId(ALL_TARGETS)}
                >
                  {t('leakDetection.eeTrajectory.allTargets')}
                </button>
                {targets.map((tg) => (
                  <div
                    key={tg.index}
                    className={`flex items-stretch rounded-lg border text-sm transition-colors ${
                      trajId === String(tg.index)
                        ? 'border-cyan-500/50 bg-cyan-500/20 text-cyan-700 dark:text-cyan-300'
                        : 'border-slate-200/50 dark:border-white/10 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <button
                      className="px-3 py-2 text-left hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-l-lg"
                      onClick={() => setTrajId(String(tg.index))}
                    >
                      <span className={`block ${tg.enabled === false ? 'opacity-60' : ''}`}>
                        {t('leakDetection.eeTrajectory.target')} {tg.index}
                        {tg.parts && (
                          <span className="ml-1 text-xs opacity-80">
                            ({tg.parts.map((p) => p.target).join(' + ')})
                          </span>
                        )}
                        {tg.enabled === false && (
                          <span className="ml-1 text-xs italic">
                            · {t('leakDetection.eeTrajectory.disabled')}
                          </span>
                        )}
                      </span>
                      <span className="block text-xs opacity-70">{modelName(tg.index) ?? '—'}</span>
                    </button>
                    <button
                      className="px-2 border-l border-slate-200/50 dark:border-white/10 hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-r-lg"
                      onClick={() => setModalTarget(String(tg.index))}
                      aria-label={`${t('leakDetection.eeTrajectory.model')} · ${t('leakDetection.eeTrajectory.target')} ${tg.index}`}
                    >
                      <IconFileSettings size={18} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-4">
            <h2 className="text-base font-normal text-left text-slate-500 dark:text-slate-400 mb-3">
              {t('leakDetection.eeTrajectory.productionEquipment')}:{' '}
              <span className="font-bold text-slate-900 dark:text-white">Ariston A</span>
            </h2>
            <div className={`p-4 ${card}`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                <EndEffectorIcon size={18} />
                {t('leakDetection.eeTrajectory.endEffectors')}
              </h3>
              {loadError && <p className="text-sm text-red-500 mb-2">{loadError}</p>}
              <button
                className={`${optionClass(false)} flex items-center justify-between gap-2`}
                aria-expanded={listOpen}
                onClick={() => setListOpen((o) => !o)}
              >
                <span className={ee ? 'font-medium' : 'italic text-slate-500 dark:text-slate-400'}>
                  {ee ? ee.name : t('leakDetection.eeTrajectory.notSelected')}
                </span>
                <IconChevronDown
                  size={18}
                  className={`shrink-0 transition-transform ${listOpen ? 'rotate-180' : ''}`}
                />
              </button>
              {listOpen && (
                <div className="mt-2 space-y-2" role="listbox">
                  {endEffectors.map((e) => (
                    <button
                      key={e.id}
                      role="option"
                      aria-selected={e.id === eeId}
                      className={optionClass(e.id === eeId)}
                      onClick={() => {
                        setEeId(e.id);
                        setTrajId(ALL_TARGETS);
                        setListOpen(false);
                      }}
                    >
                      {e.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={`p-4 ${card}`}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                <IconRoute size={18} />
                {t('leakDetection.eeTrajectory.trajectories')}
              </h3>
              {ee ? (
                <>
                  {routineError && <p className="text-sm text-red-500 mb-2">{routineError}</p>}
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 break-all">
                    {routineFile ?? `${ee.id}.yaml`}
                  </p>
                </>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {t('leakDetection.eeTrajectory.selectEeFirst')}
                </p>
              )}
            </div>

            <EeLiveTestPanel
              live={live}
              connected={connected}
              onToggle={toggleConnection}
              blockReason={liveBlock}
              cardClass={card}
            />
          </div>
        </div>
      </main>
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ee-live-confirm-title"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-amber-500/50 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="ee-live-confirm-title"
              className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200"
            >
              <IconAlertTriangle size={18} className="text-amber-500" />
              {t('leakDetection.eeTrajectory.live.confirm.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {t('leakDetection.eeTrajectory.live.confirm.body')}
            </p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <li>{t('leakDetection.eeTrajectory.live.confirm.robotStill')}</li>
              <li>{t('leakDetection.eeTrajectory.live.confirm.toolClear')}</li>
              <li>{t('leakDetection.eeTrajectory.live.confirm.noCompensation')}</li>
            </ul>
            <div className="flex items-center justify-end gap-3">
              <button className={`${optionClass(false)} !w-auto`} onClick={() => setConfirmOpen(false)}>
                {t('leakDetection.eeTrajectory.live.confirm.cancel')}
              </button>
              <button
                className="px-3 py-2 rounded-lg border border-amber-500/60 bg-amber-500/20 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-500/30"
                onClick={() => {
                  setConfirmOpen(false);
                  setPlaying(false);
                  setConnected(true);
                }}
              >
                {t('leakDetection.eeTrajectory.live.confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {modalTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setModalTarget(null)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-white/10 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {t('leakDetection.eeTrajectory.model')} · {t('leakDetection.eeTrajectory.target')} {modalTarget}
              </h3>
              <button
                onClick={() => setModalTarget(null)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label={t('leakDetection.configure.back')}
              >
                <IconX size={18} className="text-slate-600 dark:text-slate-400" />
              </button>
            </div>
            <input
              list="ee-model-files"
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              placeholder="Tappo_1.stl"
              className="w-full px-3 py-2 rounded-lg border border-slate-200/50 dark:border-white/10 bg-transparent text-sm text-slate-700 dark:text-slate-300"
            />
            <datalist id="ee-model-files">
              {modelFiles.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
            <div className="flex items-center justify-end gap-3">
              {modelMessage && (
                <span className="text-xs text-slate-500 dark:text-slate-400">{modelMessage}</span>
              )}
              <button className={`${optionClass(false)} !w-auto`} onClick={saveModel}>
                {t('leakDetection.configure.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
