'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconChevronLeft,
  IconChevronDown,
  IconFileCode,
  IconFolder,
  IconRefresh,
  IconAlertTriangle,
  IconInfoCircle,
  IconRotate,
  IconPencil,
  IconCheck,
  IconArrowBackUp,
} from '@tabler/icons-react';
import { EndEffectorIcon } from '../eeTypeTrajectory/EndEffectorIcon';
import { type LiveJoint, useEeLiveTest } from '../eeTypeTrajectory/liveTest';
import { EeSchematic } from './EeSchematic';
import { EeViewer3D } from './EeViewer3D';
import { EeTestPanel } from './EeTestPanel';
import { SpmSection } from './SpmSection';
import { ValueEditor, applyEditsToYaml, getIn, sameValue, setIn } from './editing';
import { type Dict, type EndEffectorFile, type EndEffectorsResponse, geometryOf, prettyName, mm, deg } from './geometry';
import { SPM_SOLVER, type SpmModel, buildSpm } from './spherical3rrr';

const TAB_STORAGE_KEY = 'leakDetection.endEffectorManagerTab';
const INDENT_PX = 12;

interface Row {
  key: string;
  value: unknown;
}

// { ik: { solver: "x" } } -> [{ key: "ik.solver", value: "x" }]; arrays stay as leaf values.
function flatten(obj: Dict, prefix = ''): Row[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return v && typeof v === 'object' && !Array.isArray(v) ? flatten(v as Dict, key) : [{ key, value: v }];
  });
}

const splitKey = (key: string) => {
  const i = key.lastIndexOf('.');
  return i < 0 ? { group: '', leaf: key } : { group: key.slice(0, i), leaf: key.slice(i + 1) };
};

// Unit conversion shown beside the raw value: metres -> mm, radians -> degrees.
function unitHint(leaf: string, value: unknown): string | null {
  const nums = typeof value === 'number' ? [value] : Array.isArray(value) && value.every((v) => typeof v === 'number') ? (value as number[]) : null;
  if (!nums) return null;
  const list = (f: (n: number) => number, u: string) =>
    nums.length === 1 ? `${f(nums[0])} ${u}` : `[${nums.map(f).join(', ')}] ${u}`;
  if (/^offset_[xyz]$|_m$/.test(leaf)) return list(mm, 'mm');
  if (/^(roll|pitch|yaw)$|^joint_(home|min|max|target)$/.test(leaf)) return list(deg, '°');
  return null;
}

function ValueCell({ value }: { value: unknown }) {
  if (typeof value === 'boolean') {
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${value ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-slate-500/15 text-slate-500'}`}>
        {String(value)}
      </span>
    );
  }
  if (typeof value === 'number') return <span className="text-cyan-700 dark:text-cyan-300 tabular-nums">{value}</span>;
  if (typeof value === 'string') return <span className="text-amber-700 dark:text-amber-300 break-all">{value}</span>;
  if (Array.isArray(value)) {
    return (
      <span className="inline-flex flex-wrap gap-x-1">
        [
        {value.map((v, i) => (
          <span key={i}>
            <ValueCell value={v} />
            {i < value.length - 1 && <span className="text-slate-400">,</span>}
          </span>
        ))}
        ]
      </span>
    );
  }
  return <span className="text-slate-400 italic">null</span>;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40 min-w-0">
      <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{label}</div>
      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100 font-mono truncate" title={value}>
        {value}
      </div>
      {hint && <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{hint}</div>}
    </div>
  );
}

// The real tool behind the displayed one (page connected and this is the mounted tool).
interface ToolLink {
  joints: LiveJoint[];
  // Manual motion is allowed right now.
  canMove: boolean;
  // Joint `index` of the real tool to targetDeg [deg from home]; the latest target wins.
  move: (index: number, targetDeg: number) => void;
}

// How often the measured position is read while connected: the model follows it.
const LIVE_POLL_MS = 250;
// After a slider command the model keeps the commanded angle this long before following again.
const FOLLOW_AFTER_COMMAND_MS = 1000;

interface PanelProps {
  ee: EndEffectorFile;
  link: ToolLink | null;
  // Shown under the sliders while the page is connected (what they do to the real tool).
  linkNote: string | null;
  // Current values: the file's, or the in-page edits of them.
  params: Dict;
  editing: boolean;
  onChange: (params: Dict) => void;
}

function EndEffectorPanel({ ee, params, editing, onChange, link, linkNote }: PanelProps) {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
  const g = useMemo(() => geometryOf(params), [params]);
  const [view, setView] = useState<'params' | 'raw'>('params');
  const [notesOpen, setNotesOpen] = useState(false);
  // The spherical parallel wrist has its own model: its motors are not a serial chain of joints.
  const spm = useMemo((): { model: SpmModel } | { error: string } | null => {
    if (g.solver !== SPM_SOLVER) return null;
    try {
      return { model: buildSpm(params) };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [g.solver, params]);
  const spmModel = spm && 'model' in spm ? spm.model : null;
  // Serial tools with joints (more than one link) get the 3D view and one slider per joint.
  const articulated = !spm && g.joints.length > 0;
  const [shape, setShape] = useState<'3d' | '2d'>('3d');
  // Only a change of the home values (or joint count) moves the sliders back home, not every edit.
  const homesKey = JSON.stringify(g.joints.map((j) => j.home));
  const [angles, setAngles] = useState<number[]>(() => JSON.parse(homesKey));
  useEffect(() => setAngles(JSON.parse(homesKey)), [homesKey]);
  const setAngle = (i: number, value: number) => setAngles((a) => a.map((x, k) => (k === i ? value : x)));

  // Connected to the real tool: a slider commands its joint, and the model follows the measured
  // position (jog buttons, homing and the bus tests move it too).
  const dragging = useRef(false);
  const commandedAt = useRef(0);
  const measuredKey = link ? JSON.stringify(link.joints.map((j) => [j.name, j.position_deg])) : null;
  useEffect(() => {
    if (!link || dragging.current || performance.now() - commandedAt.current < FOLLOW_AFTER_COMMAND_MS) return;
    setAngles((a) =>
      g.joints.map((j, i) => {
        const real = link.joints.find((x) => x.name === j.name);
        return real && real.position_deg !== null ? j.home + (real.position_deg * Math.PI) / 180 : (a[i] ?? j.home);
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new measurement moves the model
  }, [measuredKey]);
  const driveJoint = (i: number, value: number) => {
    setAngle(i, value);
    const real = link?.joints.find((x) => x.name === g.joints[i].name);
    if (!link?.canMove || !real) return;
    commandedAt.current = performance.now();
    const fromHome = ((value - g.joints[i].home) * 180) / Math.PI;
    link.move(real.index, Math.min(real.max_deg, Math.max(real.min_deg, fromHome)));
  };

  const rows = useMemo(() => flatten(params), [params]);
  const changes = useMemo(() => rows.filter((r) => !sameValue(r.value, getIn(ee.params, r.key))), [rows, ee.params]);
  const raw = useMemo(() => applyEditsToYaml(ee.raw, changes), [ee.raw, changes]);
  const chainLength = g.chain ? g.chain.link1 + g.chain.link2 : null;
  // ik_solver rejects goals when the link model and offset_z disagree.
  const mismatch = chainLength !== null && Math.abs(chainLength - g.offset[2]) > 1e-4;
  // The node refuses to start when mount + tool_chain and offset_* disagree by more than 0.5 mm.
  const spmChain = spmModel?.chainTip ?? null;
  const spmMismatch = spmChain !== null && Math.hypot(...spmChain.map((x, i) => x - g.offset[i])) > 5e-4;
  const spmError = spm && 'error' in spm ? spm.error : null;
  const declared = typeof params.declared_end_effector_type === 'string' ? params.declared_end_effector_type : null;
  const nameMismatch = declared !== null && declared !== ee.id;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('schematic')}</h3>
          <div className="flex items-center gap-3 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-0.5 bg-red-500" />X</span>
            {(spmModel || (articulated && shape === '3d')) && (
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-0.5 bg-green-500" />Y</span>
            )}
            <span className="inline-flex items-center gap-1"><span className="w-2.5 h-0.5 bg-blue-500" />Z</span>
            {(spmModel || articulated) && (
              <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full border-2 border-cyan-500" />{t('joint')}</span>
            )}
          </div>
        </div>
        {articulated && (
          <div className="inline-flex self-start rounded-md border border-slate-200/70 dark:border-white/10 p-0.5 text-[11px] font-medium">
            {(['3d', '2d'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setShape(v)}
                aria-pressed={shape === v}
                className={`px-2 py-0.5 rounded ${shape === v ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : 'text-slate-500 hover:text-cyan-600'}`}
              >
                {v === '3d' ? t('view3d') : t('view2d')}
              </button>
            ))}
          </div>
        )}
        {spmModel ? (
          <SpmSection id={ee.id} model={spmModel} jointNames={g.jointNames} />
        ) : spm ? null : articulated && shape === '3d' ? (
          <EeViewer3D geometry={g} angles={angles} viewKey={ee.id} />
        ) : (
          <EeSchematic geometry={g} jointAngle={angles[0] ?? 0} />
        )}
        {articulated && !g.linksFromYaml && (
          <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('linksEstimated')}</p>
        )}
        {articulated &&
          g.joints.map((j, i) => {
            const min = deg(j.min ?? -Math.PI / 2);
            const max = deg(j.max ?? Math.PI / 2);
            return (
              <div key={i} className="flex items-center gap-3">
                <label htmlFor={`ee-joint-${ee.id}-${i}`} className="w-24 truncate text-xs font-mono font-medium text-slate-600 dark:text-slate-300 shrink-0" title={j.name}>
                  {j.name}
                </label>
                <input
                  id={`ee-joint-${ee.id}-${i}`}
                  type="range"
                  min={min}
                  max={max}
                  step={1}
                  value={deg(angles[i] ?? 0)}
                  onChange={(e) => driveJoint(i, (Number(e.target.value) * Math.PI) / 180)}
                  onPointerDown={() => (dragging.current = true)}
                  onPointerUp={() => (dragging.current = false)}
                  onPointerCancel={() => (dragging.current = false)}
                  onBlur={() => (dragging.current = false)}
                  className={`flex-1 ${link?.canMove ? 'accent-amber-500' : 'accent-cyan-500'}`}
                />
                <span className="w-14 text-right text-xs font-mono tabular-nums text-cyan-700 dark:text-cyan-300">{deg(angles[i] ?? 0)}°</span>
                <button
                  type="button"
                  onClick={() => driveJoint(i, j.home)}
                  title={t('resetJoint')}
                  aria-label={t('resetJoint')}
                  className="p-1 rounded-md text-slate-500 hover:text-cyan-600 hover:bg-cyan-500/10"
                >
                  <IconRotate size={16} />
                </button>
              </div>
            );
          })}
        {articulated && linkNote && (
          <p className={`text-[11px] ${link?.canMove ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500 dark:text-slate-400'}`}>
            {linkNote}
          </p>
        )}
        {articulated && g.joints.some((j) => j.min === null && j.max === null) && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('noLimits')}</p>
        )}
      </section>

      <section className="flex flex-col gap-4 min-w-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat
            label={t('tipLength')}
            value={`${mm(g.offset[2])} mm`}
            hint={spmModel ? `tool0→O ${mm(Math.hypot(...spmModel.center))} · O→tip ${mm(Math.hypot(...spmModel.tip))} mm` : 'offset_z'}
          />
          <Stat label={t('solver')} value={g.solver ?? '—'} />
          {spmModel ? (
            <>
              <Stat
                label={t('spmLinkAngles')}
                value={`α ${deg(spmModel.legs[0].alpha)}° · β ${deg(spmModel.legs[0].beta)}°`}
                hint="∠(u, v) · ∠(v, c)"
              />
              <Stat
                label={t('spmMotorShaft')}
                value={spmModel.eta === null ? '—' : `η ${deg(spmModel.eta)}°`}
                hint={`κ = ∠(u, c) ${deg(spmModel.kappaHome)}°`}
              />
            </>
          ) : (
            <>
              <Stat label={t('joints')} value={String(g.jointNames.length)} hint={g.jointNames.join(', ') || t('noJoints')} />
              <Stat label={t('rotation')} value={`${deg(g.rpy[0])}° ${deg(g.rpy[1])}° ${deg(g.rpy[2])}°`} hint="roll · pitch · yaw" />
            </>
          )}
        </div>

        {(mismatch || spmMismatch || spmError || nameMismatch || ee.error || ee.todos.length > 0) && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 space-y-1.5">
            {ee.error && <p className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">{ee.error}</p>}
            {spmError && (
              <p className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
                {t('spmModelError')}: {spmError}
              </p>
            )}
            {spmMismatch && spmChain && (
              <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                <IconAlertTriangle size={14} className="shrink-0 mt-px" />
                {t('spmChainMismatch', { chain: spmChain.map(mm).join(', '), offset: g.offset.map(mm).join(', ') })}
              </p>
            )}
            {mismatch && chainLength !== null && (
              <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                <IconAlertTriangle size={14} className="shrink-0 mt-px" />
                {t('lengthMismatch', { links: mm(chainLength), offset: mm(g.offset[2]) })}
              </p>
            )}
            {nameMismatch && (
              <p className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                <IconAlertTriangle size={14} className="shrink-0 mt-px" />
                {t('nameMismatch', { declared: declared ?? '', file: ee.id })}
              </p>
            )}
            {ee.todos.map((todo, i) => (
              <p key={i} className="flex gap-1.5 text-xs text-amber-800 dark:text-amber-200">
                <IconAlertTriangle size={14} className="shrink-0 mt-px" />
                <span>{todo}</span>
              </p>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
            <p
              className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 min-w-0"
              title={`${ee.path}\n${new Date(ee.modified).toLocaleString()}`}
            >
              <IconFileCode size={13} className="shrink-0" />
              <span className="truncate">{ee.file}</span>
            </p>
            <div className="inline-flex rounded-md border border-slate-200/70 dark:border-white/10 p-0.5 text-[11px] font-medium">
              {(['params', 'raw'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  aria-pressed={view === v}
                  className={`px-2 py-0.5 rounded ${view === v ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300' : 'text-slate-500 hover:text-cyan-600'}`}
                >
                  {v === 'params' ? t('viewParams') : t('viewRaw')}
                </button>
              ))}
            </div>
          </div>

          {ee.header && (
            <div className="px-4 pb-3">
              <button
                type="button"
                onClick={() => setNotesOpen((o) => !o)}
                aria-expanded={notesOpen}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"
              >
                <IconChevronDown size={14} className={`transition-transform ${notesOpen ? '' : '-rotate-90'}`} />
                {t('fileNotes')}
              </button>
              {notesOpen && (
                <pre className="mt-1 max-h-72 overflow-auto p-2.5 rounded-md bg-slate-100/70 dark:bg-slate-950/60 text-[11px] leading-relaxed whitespace-pre-wrap font-sans text-slate-600 dark:text-slate-300">
                  {ee.header}
                </pre>
              )}
            </div>
          )}

          {view === 'raw' && changes.length > 0 && (
            <p className="mx-4 mb-2 text-[11px] text-amber-700 dark:text-amber-300">{t('rawEdited')}</p>
          )}
          {view === 'raw' ? (
            <pre className="mx-4 mb-4 max-h-[560px] overflow-auto p-3 rounded-md bg-slate-100/70 dark:bg-slate-950/60 text-[11px] leading-relaxed font-mono text-slate-700 dark:text-slate-200">
              {raw}
            </pre>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-t border-slate-200/50 dark:border-white/5 text-[10px] font-sans font-bold uppercase tracking-widest text-slate-400">
                    <th className="pl-4 pr-4 py-1.5 text-left font-bold w-[30%]">{t('colParam')}</th>
                    <th className="px-4 py-1.5 text-left font-bold w-[30%]">{t('colValue')}</th>
                    <th className="px-4 py-1.5 text-left font-bold">{t('colNote')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => {
                    const { group, leaf } = splitKey(r.key);
                    const prevGroup = i > 0 ? splitKey(rows[i - 1].key).group : null;
                    const depth = group ? group.split('.').length : 0;
                    const hint = unitHint(leaf, r.value);
                    const comment = ee.comments[leaf];
                    const original = getIn(ee.params, r.key);
                    const changed = !sameValue(r.value, original);
                    return (
                      <Fragment key={r.key}>
                        {group && group !== prevGroup && (
                          <tr className="border-t border-slate-200/50 dark:border-white/5 bg-slate-100/80 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            <td colSpan={3} className="pr-4 py-1" style={{ paddingLeft: 16 + Math.max(depth - 1, 0) * INDENT_PX }}>
                              {group.replace(/\./g, ' › ')}
                            </td>
                          </tr>
                        )}
                        <tr className={`border-t border-slate-200/50 dark:border-white/5 align-top ${changed ? 'bg-amber-500/10' : 'hover:bg-cyan-500/5'}`}>
                          <td className="pr-4 py-1.5 text-slate-700 dark:text-slate-200 break-all" style={{ paddingLeft: 16 + depth * INDENT_PX }} title={r.key}>
                            <span className="inline-flex items-center gap-1">
                              {leaf}
                              {changed && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                            </span>
                          </td>
                          <td className="px-4 py-1.5">
                            {editing ? (
                              <ValueEditor value={r.value} onChange={(v) => onChange(setIn(params, r.key, v))} />
                            ) : (
                              <ValueCell value={r.value} />
                            )}
                            {changed && (
                              <div className="mt-0.5 text-[10px] text-slate-400" title={t('originalValue', { value: JSON.stringify(original) })}>
                                {t('originalValue', { value: JSON.stringify(original) })}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-1.5 font-sans text-[11px] text-slate-500 dark:text-slate-400">
                            {hint && <span className="font-mono text-slate-600 dark:text-slate-300">{hint}</span>}
                            {hint && comment && <span className="mx-1 text-slate-300 dark:text-slate-600">·</span>}
                            {comment}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

export function EndEffectorManagerPage() {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [data, setData] = useState<EndEffectorsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  // In-page edits per end effector id. Never saved: reloading starts again from the files.
  const [edits, setEdits] = useState<Record<string, Dict>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/end-effectors/manager', { cache: 'no-store' });
      setData((await res.json()) as EndEffectorsResponse);
      setEdits({});
    } catch (e) {
      setData({ dir: '', endEffectors: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      setSelected(localStorage.getItem(TAB_STORAGE_KEY));
    } catch {}
    load();
  }, [load]);

  const select = (id: string) => {
    setSelected(id);
    try {
      localStorage.setItem(TAB_STORAGE_KEY, id);
    } catch {}
  };

  const list = data?.endEffectors ?? [];
  const active = list.find((e) => e.id === selected) ?? list[0] ?? null;

  // Real end effector: same rules as on the trajectory page -- a confirmation before connecting,
  // and a second, separate one to bypass the system-state check.
  const [connected, setConnected] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [override, setOverride] = useState(false);
  const [overrideConfirmOpen, setOverrideConfirmOpen] = useState(false);
  const live = useEeLiveTest(connected, LIVE_POLL_MS);
  const liveRef = useRef(live);
  liveRef.current = live;
  const status = live.status;
  const stateBlocked = !!status && (status.blocked !== undefined ? !!status.blocked : !status.test_mode);
  const forceRef = useRef(false);
  forceRef.current = override && stateBlocked;
  const otherRunning = !!status?.dry_run?.running || !!status?.diagnostic?.running;
  const canMove = !!status && !!status.servo.connected && (!stateBlocked || override) && !otherRunning;
  const mounted = status?.end_effector_type ?? '';

  // Slider commands: one request at a time, the latest target of each joint wins.
  const pending = useRef(new Map<number, number>());
  const sending = useRef(false);
  const moveTool = useCallback((index: number, targetDeg: number) => {
    pending.current.set(index, targetDeg);
    if (sending.current) return;
    sending.current = true;
    (async () => {
      try {
        while (pending.current.size > 0) {
          const [joint, target] = pending.current.entries().next().value as [number, number];
          pending.current.delete(joint);
          if (!(await liveRef.current.move(joint, target, forceRef.current))) pending.current.clear();
        }
      } finally {
        sending.current = false;
      }
    })();
  }, []);

  const toggleConnection = () => {
    if (!connected) {
      setConfirmOpen(true);
      return;
    }
    if (status?.diagnostic?.running) live.stopDiagnostic();
    pending.current.clear();
    setConnected(false);
    setOverride(false); // the bypass never outlives the connection it was confirmed for
  };
  const toggleOverride = () => {
    if (override) setOverride(false);
    else setOverrideConfirmOpen(true);
  };

  const linked = connected && !!status && !!active && mounted === active.id && status.servo.available;
  const link: ToolLink | null = linked ? { joints: status.servo.joints, canMove, move: moveTool } : null;
  const linkNote = !connected || !status || !active
    ? null
    : mounted !== active.id
      ? t('test.sliderOtherTool', { mounted: mounted ? prettyName(mounted) : '—' })
      : !status.servo.available
        ? null
        : canMove
          ? t('test.sliderLinked')
          : t('test.sliderFollowOnly');
  const isEdited = (ee: EndEffectorFile) => !!edits[ee.id] && !sameValue(edits[ee.id], ee.params);
  const anyEdited = list.some(isEdited);
  const discard = (id: string) =>
    setEdits((e) => {
      const next = { ...e };
      delete next[id];
      return next;
    });

  return (
    <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Link
          href={`/${locale}/process/leak-detection`}
          className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          aria-label={tRoot('leakDetection.configure.back')}
        >
          <IconChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t('title')}</h1>
          <p className="text-xs text-slate-500 dark:text-slate-500">{t('description')}</p>
        </div>
      </div>

      <EeTestPanel
        live={live}
        connected={connected}
        onToggle={toggleConnection}
        override={override}
        onToggleOverride={toggleOverride}
      />

      <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{t('folder')}</div>
            <div className="flex items-center gap-2 min-w-0 text-xs text-slate-700 dark:text-slate-200" title={data?.dir}>
              <IconFolder size={14} className="shrink-0 text-slate-400" />
              <span className="font-mono truncate">{data?.dir ?? '…'}</span>
              {data && !data.error && (
                <span className="shrink-0 text-[10px] text-slate-400">{t('count', { count: list.length })}</span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setEditing((e) => !e)}
            disabled={!active}
            aria-pressed={editing}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium disabled:opacity-50 ${
              editing
                ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300'
            }`}
          >
            {editing ? <IconCheck size={14} /> : <IconPencil size={14} />}
            {editing ? t('editDone') : t('edit')}
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200/70 dark:border-white/10 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300 disabled:opacity-50"
          >
            <IconRefresh size={14} className={loading ? 'animate-spin' : ''} />
            {t('reload')}
          </button>
        </div>

        {(editing || anyEdited) && (
          <div className="mb-4 flex flex-wrap items-center gap-3 p-3 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-xs text-cyan-800 dark:text-cyan-200">
            <IconInfoCircle size={16} className="shrink-0" />
            <span className="flex-1 min-w-0">{t('editBanner')}</span>
            {active && isEdited(active) && (
              <button
                type="button"
                onClick={() => discard(active.id)}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-cyan-500/40 font-medium hover:bg-cyan-500/15"
              >
                <IconArrowBackUp size={14} />
                {t('discardEdits')}
              </button>
            )}
          </div>
        )}

        {data?.error && (
          <div className="mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
            {t('loadError')}: {data.error}
          </div>
        )}

        {data && !data.error && list.length === 0 && (
          <p className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <IconInfoCircle size={16} />
            {t('empty')}
          </p>
        )}

        {list.length > 0 && active && (
          <>
            <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-slate-200/70 dark:border-white/10 mb-4 -mx-1 px-1">
              {list.map((ee) => {
                const isActive = ee.id === active.id;
                return (
                  <button
                    key={ee.id}
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => select(ee.id)}
                    className={`shrink-0 inline-flex items-center gap-2 px-3 py-2 -mb-px border-b-2 text-sm transition-colors ${
                      isActive
                        ? 'border-cyan-500 text-cyan-700 dark:text-cyan-300 font-semibold'
                        : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-cyan-700 dark:hover:text-cyan-300'
                    }`}
                  >
                    <EndEffectorIcon size={16} />
                    {prettyName(ee.id)}
                    {isEdited(ee) && (
                      <span className="px-1 rounded text-[9px] font-bold uppercase tracking-wide bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
                        {t('editedBadge')}
                      </span>
                    )}
                    {(ee.todos.length > 0 || ee.error) && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title={t('hasTodos')} />
                    )}
                  </button>
                );
              })}
            </div>
            <div role="tabpanel">
              <EndEffectorPanel
                key={active.id}
                ee={active}
                params={edits[active.id] ?? active.params}
                editing={editing}
                link={link}
                linkNote={linkNote}
                onChange={(p) => setEdits((e) => ({ ...e, [active.id]: p }))}
              />
            </div>
          </>
        )}
      </div>

      {overrideConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ee-manager-override-title"
          onClick={() => setOverrideConfirmOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-red-500/60 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="ee-manager-override-title" className="flex items-center gap-2 text-sm font-semibold text-red-700 dark:text-red-300">
              <IconAlertTriangle size={18} />
              {tRoot('leakDetection.eeTrajectory.live.override.confirmTitle')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">{tRoot('leakDetection.eeTrajectory.live.override.confirmBody')}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <li>{tRoot('leakDetection.eeTrajectory.live.override.robotMayMove')}</li>
              <li>{tRoot('leakDetection.eeTrajectory.live.override.cycleNotLocked')}</li>
              <li>{tRoot('leakDetection.eeTrajectory.live.override.responsibility')}</li>
            </ul>
            <div className="flex items-center justify-end gap-3">
              <button
                className="px-3 py-2 rounded-lg border border-slate-200/70 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                onClick={() => setOverrideConfirmOpen(false)}
              >
                {tRoot('leakDetection.eeTrajectory.live.confirm.cancel')}
              </button>
              <button
                className="px-3 py-2 rounded-lg border border-red-500/60 bg-red-500/15 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-500/25"
                onClick={() => {
                  setOverrideConfirmOpen(false);
                  setOverride(true);
                }}
              >
                {tRoot('leakDetection.eeTrajectory.live.override.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ee-manager-connect-title"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 border border-amber-500/50 p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="ee-manager-connect-title" className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-200">
              <IconAlertTriangle size={18} className="text-amber-500" />
              {tRoot('leakDetection.eeTrajectory.live.confirm.title')}
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-300">{t('test.connectBody')}</p>
            <ul className="list-disc pl-5 space-y-1 text-sm text-slate-600 dark:text-slate-300">
              <li>{tRoot('leakDetection.eeTrajectory.live.confirm.robotStill')}</li>
              <li>{tRoot('leakDetection.eeTrajectory.live.confirm.toolClear')}</li>
            </ul>
            <div className="flex items-center justify-end gap-3">
              <button
                className="px-3 py-2 rounded-lg border border-slate-200/70 dark:border-white/10 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-500/10"
                onClick={() => setConfirmOpen(false)}
              >
                {tRoot('leakDetection.eeTrajectory.live.confirm.cancel')}
              </button>
              <button
                className="px-3 py-2 rounded-lg border border-amber-500/60 bg-amber-500/20 text-sm font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-500/30"
                onClick={() => {
                  setConfirmOpen(false);
                  setConnected(true);
                }}
              >
                {tRoot('leakDetection.eeTrajectory.live.confirm.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
