'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconChevronLeft,
  IconChevronDown,
  IconFileCode,
  IconFolder,
  IconRefresh,
  IconUpload,
  IconSearch,
  IconInfoCircle,
  IconInfoCircleFilled,
  IconHelpCircle,
} from '@tabler/icons-react';
import { SECTIONS, sceneryOf, sectionOf, subgroupsOf, type SectionId } from './sections';
import { discardParamEdits, editKey, setParamEdit, useParamEdits } from './editsStore';
import { PARAM_DOCS } from './paramDocs';
import { PathPickerModal } from './PathPickerModal';
import { PlyViewerModal } from './PlyViewerModal';
import { GroupGeometryView } from './GroupGeometryView';
import { CORRECTION_FIELDS, SceneCorrectionView, type CorrectionField, type CorrectionValue } from './SceneCorrectionView';

const DEFAULT_DIR = 'X:/dev/FT-Theia/FT_Workcell_Vision_ALDM_1.0.3/ev3d_vision/config';
const DEFAULT_FILE = 'vision_params.yaml';
// Holds a folder or a .yaml file path (older saves are always folders).
const DIR_STORAGE_KEY = 'leakDetection.visionParamsDir';

interface Param {
  key: string;
  value: unknown;
  comment?: string;
}

interface VisionParamsResponse {
  path: string;
  modified?: string;
  raw?: string;
  nodes?: { node: string; params: Param[] }[];
  error?: string;
}

// Sub-heading row styles by nesting depth inside a section (deepest style repeats).
const INDENT_PX = 12;
const SUBGROUP_ROW = [
  'bg-slate-200/60 dark:bg-slate-800/70 text-xs font-semibold text-slate-700 dark:text-slate-200',
  'bg-slate-100/80 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-600 dark:text-slate-300',
  'bg-slate-50/80 dark:bg-slate-800/30 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400',
];

function SceneryBadge({ active }: { active: boolean }) {
  const t = useTranslations('leakDetection.configure.vision.params.scenery');
  return (
    <span
      className={`shrink-0 px-1.5 py-px rounded text-[9px] font-bold uppercase tracking-wide ${
        active ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-slate-500/15 text-slate-500'
      }`}
    >
      {active ? t('active') : t('inactive')}
    </span>
  );
}

function BoolToggle({
  value,
  original,
  onChange,
}: {
  value: boolean;
  original: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTranslations('leakDetection.configure.vision.params');
  return (
    <span className="inline-flex items-center gap-2">
      <button
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 ${
          value ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
        }`}
      >
        <span
          className={`inline-block h-3 w-3 rounded-full bg-white shadow transition-transform ${
            value ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </button>
      <span
        className={`text-[10px] font-bold uppercase ${value ? 'text-green-700 dark:text-green-400' : 'text-slate-500'}`}
      >
        {String(value)}
      </span>
      {value !== original && (
        <button
          onClick={() => onChange(original)}
          title={t('revertTo', { value: String(original) })}
          className="font-sans text-[10px] text-amber-700 dark:text-amber-400 hover:underline"
        >
          {t('wasValue', { value: String(original) })}
        </button>
      )}
    </span>
  );
}

const PLY_FILE = /\.ply$/i;

// onOpenPly makes .ply paths (e.g. ariston_a_reference_clouds) open the point-cloud viewer.
function ValueCell({ value, onOpenPly }: { value: unknown; onOpenPly?: (path: string) => void }) {
  if (typeof value === 'boolean') {
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
          value ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-slate-500/15 text-slate-500'
        }`}
      >
        {String(value)}
      </span>
    );
  }
  if (typeof value === 'number') {
    return <span className="text-cyan-700 dark:text-cyan-300 tabular-nums">{value}</span>;
  }
  if (typeof value === 'string') {
    if (onOpenPly && PLY_FILE.test(value)) {
      return (
        <button
          type="button"
          onClick={() => onOpenPly(value)}
          className="text-left text-amber-700 dark:text-amber-300 break-all underline decoration-dotted underline-offset-2 hover:text-cyan-600 dark:hover:text-cyan-400"
        >
          {value}
        </button>
      );
    }
    return value === '' ? (
      <span className="text-slate-400 italic">""</span>
    ) : (
      <span className="text-amber-700 dark:text-amber-300 break-all">{value}</span>
    );
  }
  if (Array.isArray(value)) {
    const flat = value.every((v) => v === null || typeof v !== 'object');
    if (flat && value.every((v) => typeof v !== 'string')) {
      return <span className="text-cyan-700 dark:text-cyan-300 tabular-nums">[{value.join(', ')}]</span>;
    }
    return (
      <ol className="space-y-0.5">
        {value.map((v, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-slate-400 tabular-nums w-4 text-right">{i}</span>
            <ValueCell value={v} onOpenPly={onOpenPly} />
          </li>
        ))}
      </ol>
    );
  }
  if (value && typeof value === 'object') {
    return <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span className="text-slate-400 italic">null</span>;
}

export function VisionParamsPage() {
  const t = useTranslations('leakDetection.configure.vision.params');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [currentPath, setCurrentPath] = useState(DEFAULT_DIR);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [plyPath, setPlyPath] = useState<string | null>(null);
  const [data, setData] = useState<VisionParamsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'table' | 'raw'>('table');
  const [infoView, setInfoView] = useState<'full' | 'focused'>('full');
  const [selected, setSelected] = useState<string | null>(null);
  const [openDocs, setOpenDocs] = useState<Set<string>>(new Set());
  // Folded subgroup headings, keyed `<group id><subgroup path>`; ignored while filtering.
  const [foldedSubs, setFoldedSubs] = useState<Set<string>>(new Set());
  const edits = useParamEdits(data?.error ? undefined : data?.path);
  const editCount = Object.keys(edits).length;

  // Current (edited or file) values of <scenery>_scene_entry_correction_* for the 3D view. Uses
  // the node's full parameter list so the view stays complete while the filter is active.
  const correctionValues = (nodeName: string) => {
    const out: Partial<Record<CorrectionField, CorrectionValue>> = {};
    for (const p of data?.nodes?.find((n) => n.node === nodeName)?.params ?? []) {
      const field = CORRECTION_FIELDS.find((f) => p.key.endsWith(`scene_entry_correction_${f}`));
      if (!field || typeof p.value !== 'number') continue;
      const ek = editKey(nodeName, p.key);
      out[field] = { key: p.key, value: ek in edits ? (edits[ek] as number) : p.value, original: p.value };
    }
    return out;
  };

  // Current (edited or file) value of every parameter of a node, for the group geometry view.
  const nodeValues = (nodeName: string) =>
    Object.fromEntries(
      (data?.nodes?.find((n) => n.node === nodeName)?.params ?? []).map((p) => {
        const ek = editKey(nodeName, p.key);
        return [p.key, ek in edits ? edits[ek] : p.value];
      })
    );

  const toggleFold = (id: string) =>
    setFoldedSubs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleDoc = (id: string) =>
    setOpenDocs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Loads a folder or .yaml path and returns its error, if any. With keepOnError the current
  // file stays on screen when the new path fails (used by the picker, which shows the error).
  const load = useCallback(async (target: string, keepOnError = false): Promise<string | null> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/vision-params?path=${encodeURIComponent(target)}`, { cache: 'no-store' });
      const json = (await res.json()) as VisionParamsResponse;
      if (json.error && keepOnError) return json.error;
      setData(json);
      setCurrentPath(target);
      try {
        localStorage.setItem(DIR_STORAGE_KEY, target);
      } catch {}
      return json.error ?? null;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!keepOnError) setData({ path: target, error: message });
      return message;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(DIR_STORAGE_KEY);
    } catch {}
    load(saved || DEFAULT_DIR);
  }, [load]);

  const query = filter.trim().toLowerCase();

  // One entry per (node, section) that has parameters left after filtering, in SECTIONS order.
  const groups = useMemo(() => {
    const multiNode = (data?.nodes?.length ?? 0) > 1;
    return (data?.nodes ?? []).flatMap((n) => {
      const valueOf = (key: string) => n.params.find((p) => p.key === key)?.value;
      const theiaMode = String(valueOf('theia_mode') ?? '');
      const currentScenery = String(valueOf('scenery') ?? '');
      const bySection = new Map<SectionId, Param[]>();
      for (const p of n.params) {
        if (
          query &&
          !p.key.toLowerCase().includes(query) &&
          !JSON.stringify(p.value).toLowerCase().includes(query) &&
          !p.comment?.toLowerCase().includes(query)
        )
          continue;
        const id = sectionOf(p.key);
        bySection.set(id, [...(bySection.get(id) ?? []), p]);
      }
      return SECTIONS.filter((id) => bySection.has(id)).map((id) => {
        const params = bySection.get(id)!;
        const scenery = sceneryOf(params[0].key);
        return {
          id: `${n.node}:${id}`,
          section: id,
          node: multiNode ? n.node : undefined,
          nodeName: n.node,
          params,
          scenery,
          sceneryActive: !!scenery && theiaMode === 'ALDM' && currentScenery === scenery,
          theiaMode,
          currentScenery,
        };
      });
    });
  }, [data, query]);

  const visibleGroups =
    infoView === 'focused' ? groups.filter((g) => g.section === 'groupGeometry' || g.section === 'sceneCorrection') : groups;
  const total = data?.nodes?.reduce((s, n) => s + n.params.length, 0) ?? 0;

  const shownPath = data?.path ?? currentPath;
  const isFile = /\.ya?ml$/i.test(shownPath);
  const folder = isFile ? shownPath.replace(/[\\/][^\\/]*$/, '') : shownPath;
  const fileName = isFile ? shownPath.slice(folder.length + 1) : undefined;

  // Only the selected section is shown. Falls back to the first section when nothing is
  // selected yet or the filter hides the selected one; the choice is kept for when it returns.
  const active = visibleGroups.find((g) => g.id === selected) ?? visibleGroups[0];

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

      <div className="p-6 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-slate-900/30 ring-1 ring-inset ring-slate-200/20 dark:ring-white/5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
              {t('folder')}
            </div>
            <div
              className="flex items-center gap-2 min-w-0 text-xs text-slate-700 dark:text-slate-200"
              title={data?.modified ? `${data.path}\n${new Date(data.modified).toLocaleString()}` : data?.path}
            >
              <IconFolder size={16} className="shrink-0 text-amber-500" />
              <span className="font-mono truncate">{folder}</span>
              {fileName && fileName !== DEFAULT_FILE && (
                <span className="shrink-0 inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400">
                  <IconFileCode size={14} />
                  {fileName}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => load(currentPath)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium disabled:opacity-50"
            >
              <IconRefresh size={16} className={loading ? 'animate-spin' : ''} />
              {t('load')}
            </button>
            <button
              onClick={() => setPickerOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
            >
              <IconUpload size={16} />
              {t('upload')}
            </button>
          </div>
        </div>

        {pickerOpen && (
          <PathPickerModal
            initialPath={data?.path ?? currentPath}
            defaultPath={DEFAULT_DIR}
            onApply={(p) => load(p, true)}
            onClose={() => setPickerOpen(false)}
          />
        )}

        {plyPath && data?.path && (
          <PlyViewerModal plyPath={plyPath} yamlPath={data.path} onClose={() => setPlyPath(null)} />
        )}

        {data?.error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
            {data.error}
          </div>
        )}

        {data && !data.error && editCount > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3 px-3 py-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
            <span>
              <span className="font-semibold">{t('unsavedCount', { count: editCount })}</span> · {t('unsavedHint')}
            </span>
            <button
              onClick={() => discardParamEdits(data.path)}
              className="px-2.5 py-1 rounded-md bg-white/70 dark:bg-slate-900/60 border border-amber-500/30 font-medium hover:bg-white dark:hover:bg-slate-900 transition-colors"
            >
              {t('discard')}
            </button>
          </div>
        )}

        {data && !data.error && (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t('infoView')}</span>
                  <div role="group" aria-label={t('infoView')} className="flex p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-lg w-fit">
                    {(['full', 'focused'] as const).map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={infoView === v}
                        onClick={() => setInfoView(v)}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                          infoView === v
                            ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                      >
                        {t(v === 'full' ? 'viewFullInfo' : 'viewFocusedInfo')}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-lg w-fit">
                  {(['table', 'raw'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setView(v)}
                      className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                        view === v
                          ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {t(v === 'table' ? 'viewTable' : 'viewRaw')}
                    </button>
                  ))}
                </div>
              </div>
              {view === 'table' && (
                <div className="relative">
                  <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t('filter', { count: total })}
                    className="w-full sm:w-72 pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs focus:ring-2 focus:ring-cyan-500 outline-none text-slate-700 dark:text-slate-200"
                  />
                </div>
              )}
            </div>

            {view === 'raw' ? (
              <pre className="max-h-[calc(100vh-20rem)] min-h-[16rem] overflow-auto p-3 rounded-lg bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200/50 dark:border-white/5 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                {data.raw}
              </pre>
            ) : visibleGroups.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">{t('noMatches')}</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-4 items-start">
                <nav
                  aria-label={t('sectionsTitle')}
                  className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
                >
                  <div className="hidden lg:block px-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('sectionsTitle')}
                  </div>
                  {visibleGroups.map((g, i) => {
                    const isActive = g.id === active.id;
                    const sectionEdits = g.params.filter((p) => editKey(g.nodeName, p.key) in edits).length;
                    const prev = visibleGroups[i - 1];
                    const startsScenery = !!g.scenery && (prev?.scenery !== g.scenery || prev?.nodeName !== g.nodeName);
                    return (
                      <Fragment key={g.id}>
                        {startsScenery && (
                          <div className="shrink-0 flex lg:block items-center gap-2 px-2 lg:mt-2 lg:pt-2 lg:border-t border-slate-200/70 dark:border-white/10">
                            <div className="hidden lg:block text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              {t('scenery.label')}
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">
                                {g.scenery}
                              </span>
                              <SceneryBadge active={g.sceneryActive} />
                            </div>
                          </div>
                        )}
                        <button
                          onClick={() => setSelected(g.id)}
                          aria-current={isActive ? 'true' : undefined}
                          className={`shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
                            g.scenery ? 'lg:ml-3 lg:rounded-l-none lg:border-l-2 lg:border-slate-200 dark:lg:border-white/10' : ''
                          } ${
                            isActive
                              ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold lg:border-cyan-500 dark:lg:border-cyan-400'
                              : 'text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300'
                          }`}
                        >
                          <span className="truncate">
                            {g.node && <span className="text-slate-400">{g.node} · </span>}
                            {t(`sections.${g.section}.title`)}
                          </span>
                          <span className="inline-flex items-center gap-1.5">
                            {sectionEdits > 0 && (
                              <span title={t('modified')} className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                            )}
                            <span className="text-[10px] tabular-nums text-slate-400">{g.params.length}</span>
                          </span>
                        </button>
                      </Fragment>
                    );
                  })}
                </nav>

                <div className="min-w-0">
                  {[active].map((g) => {
                    return (
                      <section
                        key={g.id}
                        className="rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40"
                      >
                        <div className="px-4 py-3">
                          <div className="min-w-0">
                            {g.scenery && (
                              <div className="flex flex-wrap items-center gap-2 mb-1 text-[11px] text-slate-500 dark:text-slate-400">
                                <span>
                                  {t('scenery.label')}{' '}
                                  <span className="font-mono font-semibold text-slate-700 dark:text-slate-200">
                                    {g.scenery}
                                  </span>{' '}
                                  ›
                                </span>
                                <SceneryBadge active={g.sceneryActive} />
                              </div>
                            )}
                            <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                              {g.node && <span className="text-slate-400 font-normal">{g.node} · </span>}
                              {t(`sections.${g.section}.title`)}
                              <span className="ml-2 text-[10px] font-bold text-slate-400 tabular-nums">
                                {g.params.length}
                              </span>
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              {t(`sections.${g.section}.description`)}
                            </p>
                            {g.scenery && (
                              <p
                                className={`mt-2 px-2.5 py-1.5 rounded-md text-[11px] ${
                                  g.sceneryActive
                                    ? 'bg-green-500/10 text-green-800 dark:text-green-300'
                                    : 'bg-slate-500/10 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {t('scenery.hint', { name: g.scenery })}{' '}
                                {!g.sceneryActive &&
                                  t('scenery.current', { mode: g.theiaMode || '—', scenery: g.currentScenery || '—' })}
                              </p>
                            )}
                          </div>
                        </div>
                        {g.section === 'sceneCorrection' && data.path && (
                          <SceneCorrectionView
                            values={correctionValues(g.nodeName)}
                            onChange={(key, v, original) =>
                              setParamEdit(data.path, editKey(g.nodeName, key), v, original)
                            }
                          />
                        )}
                        {g.section === 'groupGeometry' && data.path && (
                          <GroupGeometryView
                            yamlPath={data.path}
                            values={nodeValues(g.nodeName)}
                            unsaved={g.params.some((p) => editKey(g.nodeName, p.key) in edits)}
                          />
                        )}
                        <table className="w-full text-xs font-mono">
                          <tbody>
                            {subgroupsOf(g.section, g.params).map((sg) => {
                              const foldKey = `${g.id}${sg.path}`;
                              if (!query && [...foldedSubs].some((f) => foldKey.startsWith(`${f}/`))) return null;
                              const folded = !query && foldedSubs.has(foldKey);
                              const foldedEdits =
                                folded && sg.subtreeKeys.some((k) => editKey(g.nodeName, k) in edits);
                              return (
                                <Fragment key={sg.path}>
                                  {sg.id && (
                                    <tr
                                      className={`border-t border-slate-200/50 dark:border-white/5 ${
                                        SUBGROUP_ROW[Math.min(sg.depth, SUBGROUP_ROW.length - 1)]
                                      }`}
                                    >
                                      <td
                                        colSpan={2}
                                        className="pr-4 py-1 font-sans"
                                        style={{ paddingLeft: 16 + sg.depth * INDENT_PX }}
                                      >
                                        {sg.collapsible ? (
                                          <button
                                            type="button"
                                            onClick={() => toggleFold(foldKey)}
                                            aria-expanded={!folded}
                                            className="inline-flex items-center gap-1 hover:text-cyan-600 dark:hover:text-cyan-400"
                                          >
                                            <IconChevronDown
                                              size={14}
                                              className={`shrink-0 transition-transform ${folded ? '-rotate-90' : ''}`}
                                            />
                                            {t(`subgroups.${sg.id}`)}
                                          </button>
                                        ) : (
                                          t(`subgroups.${sg.id}`)
                                        )}
                                        {sg.info && (
                                          <span className="relative inline-block align-middle ml-1.5 group/info">
                                            <button
                                              type="button"
                                              aria-label={t(`subgroups.${sg.id}`)}
                                              className="text-slate-400 hover:text-cyan-500 focus:text-cyan-500 focus:outline-none"
                                            >
                                              <IconHelpCircle size={14} />
                                            </button>
                                            <span
                                              role="tooltip"
                                              className="hidden group-hover/info:block group-focus-within/info:block absolute left-0 top-full z-30 mt-1 w-80 max-w-[80vw] p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 shadow-xl normal-case tracking-normal font-normal text-xs leading-relaxed text-slate-600 dark:text-slate-300 space-y-2"
                                            >
                                              {(t.raw(`subgroupInfo.${sg.info}`) as string[]).map((para, i) => (
                                                <span key={i} className="block">
                                                  {para}
                                                </span>
                                              ))}
                                            </span>
                                          </span>
                                        )}
                                        <span className="ml-2 text-[10px] font-bold tabular-nums text-slate-400">
                                          {sg.total}
                                        </span>
                                        {foldedEdits && (
                                          <span
                                            title={t('modified')}
                                            className="inline-block align-middle ml-1.5 w-1.5 h-1.5 rounded-full bg-amber-500"
                                          />
                                        )}
                                        {sg.hint && (
                                          <span className="block normal-case tracking-normal font-normal text-[11px] text-slate-500 dark:text-slate-400">
                                            {t(`subgroupHints.${sg.hint}`)}
                                          </span>
                                        )}
                                      </td>
                                    </tr>
                                  )}
                                  {!folded && sg.params.map((p) => {
                                    const ek = editKey(g.nodeName, p.key);
                                    const edited = ek in edits;
                                    const value = edited ? edits[ek] : p.value;
                                    const doc = PARAM_DOCS[p.key];
                                    const docOpen = !!doc && openDocs.has(ek);
                                    // Short translated hint (paramHints.<key>) first, then the file's comment.
                                    const hint = t.has(`paramHints.${p.key}`) ? t(`paramHints.${p.key}`) : undefined;
                                    const tooltip = [hint, p.comment].filter(Boolean).join('\n\n');
                                    return (
                                      <Fragment key={p.key}>
                                        <tr
                                          className={`border-t border-slate-200/50 dark:border-white/5 align-top ${
                                            edited ? 'bg-amber-500/10' : 'hover:bg-cyan-500/5'
                                          }`}
                                        >
                                          <td
                                            className="pr-4 py-1.5 text-slate-700 dark:text-slate-200 w-1/2 break-all"
                                            style={{ paddingLeft: 16 + (sg.id ? sg.depth + 1 : 0) * INDENT_PX }}
                                          >
                                            <span className="inline-flex items-start gap-1">
                                              {edited && (
                                                <span
                                                  title={t('modified')}
                                                  className="mt-1 w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500"
                                                />
                                              )}
                                              {p.key}
                                              {doc ? (
                                                <button
                                                  onClick={() => toggleDoc(ek)}
                                                  title={doc.summary}
                                                  aria-expanded={docOpen}
                                                  className={`mt-px ${
                                                    docOpen ? 'text-cyan-500' : 'text-cyan-600/70 dark:text-cyan-400/70'
                                                  } hover:text-cyan-500`}
                                                >
                                                  <IconInfoCircleFilled size={13} />
                                                </button>
                                              ) : (
                                                tooltip && (
                                                  <span
                                                    title={tooltip}
                                                    className="cursor-help text-slate-400 hover:text-cyan-500 mt-px"
                                                  >
                                                    <IconInfoCircle size={13} />
                                                  </span>
                                                )
                                              )}
                                            </span>
                                            {doc && (
                                              <div className="font-sans text-[11px] text-slate-500 dark:text-slate-400">
                                                {doc.summary}
                                              </div>
                                            )}
                                          </td>
                                          <td className="px-4 py-1.5">
                                            {typeof p.value === 'boolean' ? (
                                              <BoolToggle
                                                value={value as boolean}
                                                original={p.value}
                                                onChange={(v) => data.path && setParamEdit(data.path, ek, v, p.value)}
                                              />
                                            ) : (
                                              <ValueCell value={value} onOpenPly={setPlyPath} />
                                            )}
                                          </td>
                                        </tr>
                                        {docOpen && (
                                          <tr className="bg-cyan-500/5">
                                            <td
                                              colSpan={2}
                                              className="px-4 pb-3 pt-1 font-sans text-xs leading-relaxed text-slate-600 dark:text-slate-300 space-y-2"
                                            >
                                              {doc.body}
                                              {p.comment && (
                                                <p className="text-[11px] text-slate-400 whitespace-pre-wrap">
                                                  <span className="font-semibold">{t('fileComment')}:</span> {p.comment}
                                                </p>
                                              )}
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </section>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
