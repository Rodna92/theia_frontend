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
} from '@tabler/icons-react';
import { PathPickerModal } from '../visionParams/PathPickerModal';
import { getWorkcellPath } from '@/client/services/workcellPaths';

// Holds a folder or a .yaml file path.
const DIR_STORAGE_KEY = 'leakDetection.robotParamsDir';
const ALL = '__all__';
const INDENT_PX = 12;

interface Param {
  key: string;
  value: unknown;
  comment?: string;
  note?: string;
  node?: string;
}

interface FileParams {
  name: string;
  path: string;
  modified?: string;
  raw?: string;
  header?: string;
  params: Param[];
  error?: string;
}

interface RobotParamsResponse {
  path: string;
  files?: FileParams[];
  error?: string;
}

// "control_node_insertion_phase_params.yaml" -> "Insertion phase"; short names like "ptp" -> "PTP".
function prettyName(fileName: string) {
  const base = fileName
    .replace(/\.ya?ml$/i, '')
    .replace(/^control_node_/, '')
    .replace(/_params$/, '')
    .replace(/_/g, ' ')
    .trim();
  if (!base) return fileName;
  return base.length <= 3 ? base.toUpperCase() : base[0].toUpperCase() + base.slice(1);
}

function ValueCell({ value }: { value: unknown }) {
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
    return value === '' ? (
      <span className="text-slate-400 italic">""</span>
    ) : (
      <span className="text-amber-700 dark:text-amber-300 break-all">{value}</span>
    );
  }
  if (Array.isArray(value)) {
    if (value.every((v) => v === null || typeof v !== 'object')) {
      return (
        <span className="inline-flex flex-wrap gap-x-1 gap-y-0.5">
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
    return <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>;
  }
  if (value && typeof value === 'object') {
    return <pre className="text-[11px] whitespace-pre-wrap break-all">{JSON.stringify(value, null, 2)}</pre>;
  }
  return <span className="text-slate-400 italic">null</span>;
}

// Splits "a.b.c" into the group path "a.b" and the leaf name "c".
const splitKey = (key: string) => {
  const i = key.lastIndexOf('.');
  return i < 0 ? { group: '', leaf: key } : { group: key.slice(0, i), leaf: key.slice(i + 1) };
};

function FileSection({ file, params }: { file: FileParams; params: Param[] }) {
  const t = useTranslations('leakDetection.configure.robot.params');
  const [notesOpen, setNotesOpen] = useState(false);

  return (
    <section
      id={`file-${file.name}`}
      className="rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40"
    >
      <div className="px-4 py-3">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">
          {prettyName(file.name)}
          <span className="ml-2 text-[10px] font-bold text-slate-400 tabular-nums">{params.length}</span>
        </h3>
        <p
          className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5"
          title={file.modified ? `${file.path}\n${new Date(file.modified).toLocaleString()}` : file.path}
        >
          <IconFileCode size={13} className="shrink-0" />
          {file.name}
        </p>
        {file.header && (
          <div className="mt-2">
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
                {file.header}
              </pre>
            )}
          </div>
        )}
      </div>

      {file.error ? (
        <div className="mx-4 mb-4 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
          {file.error}
        </div>
      ) : (
        <table className="w-full text-xs font-mono">
          <thead>
            <tr className="border-t border-slate-200/50 dark:border-white/5 text-[10px] font-sans font-bold uppercase tracking-widest text-slate-400">
              <th className="pl-4 pr-4 py-1.5 text-left font-bold w-[34%]">{t('colParam')}</th>
              <th className="px-4 py-1.5 text-left font-bold w-[26%]">{t('colValue')}</th>
              <th className="px-4 py-1.5 text-left font-bold">{t('colNote')}</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p, i) => {
              const { group, leaf } = splitKey(p.key);
              const prev = params[i - 1];
              const prevGroup = prev ? splitKey(prev.key).group : null;
              const depth = group ? group.split('.').length : 0;
              const groupLabel = [p.node, group].filter(Boolean).join(' › ').replace(/\./g, ' › ');
              const showGroup = (groupLabel && group !== prevGroup) || (p.node && p.node !== prev?.node);
              return (
                <Fragment key={`${p.node ?? ''}/${p.key}`}>
                  {showGroup && (
                    <tr className="border-t border-slate-200/50 dark:border-white/5 bg-slate-100/80 dark:bg-slate-800/50 text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      <td colSpan={3} className="pr-4 py-1" style={{ paddingLeft: 16 + Math.max(depth - 1, 0) * INDENT_PX }}>
                        {groupLabel}
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-slate-200/50 dark:border-white/5 align-top hover:bg-cyan-500/5">
                    <td
                      className="pr-4 py-1.5 text-slate-700 dark:text-slate-200 break-all"
                      style={{ paddingLeft: 16 + depth * INDENT_PX }}
                      title={p.key}
                    >
                      <span className="inline-flex items-start gap-1">
                        {leaf}
                        {p.comment && (
                          <span title={p.comment} className="cursor-help text-slate-400 hover:text-cyan-500 mt-px">
                            <IconInfoCircle size={13} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-1.5">
                      <ValueCell value={p.value} />
                    </td>
                    <td className="px-4 py-1.5 font-sans text-[11px] text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                      {p.note}
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

export function RobotParamsPage() {
  const t = useTranslations('leakDetection.configure.robot.params');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [currentPath, setCurrentPath] = useState('');
  // This machine's default folder, from the server; '' until it is known.
  const [defaultDir, setDefaultDir] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [data, setData] = useState<RobotParamsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [view, setView] = useState<'params' | 'raw'>('params');
  const [selected, setSelected] = useState<string>(ALL);

  // Loads a folder or .yaml path and returns its error, if any. With keepOnError the current
  // files stay on screen when the new path fails (used by the picker, which shows the error).
  const load = useCallback(async (target: string, keepOnError = false): Promise<string | null> => {
    setLoading(true);
    try {
      const res = await fetch(`/api/robot-params?path=${encodeURIComponent(target)}`, { cache: 'no-store' });
      const json = (await res.json()) as RobotParamsResponse;
      if (json.error && keepOnError) return json.error;
      setData(json);
      setCurrentPath(target);
      // Only a path that actually loads is remembered: a failing one (e.g. a path from another
      // machine) must not come back on the next visit.
      if (!json.error) {
        try {
          localStorage.setItem(DIR_STORAGE_KEY, target);
        } catch {}
      }
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
    // A remembered path that no longer loads (e.g. the old Windows default) falls back to
    // the default folder, which then replaces it.
    (async () => {
      const def = await getWorkcellPath('robotParamsDir');
      setDefaultDir(def);
      if (saved && saved !== def && !(await load(saved, true))) return;
      load(def);
    })();
  }, [load]);

  const query = filter.trim().toLowerCase();
  const files = useMemo(() => data?.files ?? [], [data]);

  // Each file with the parameters left after filtering; files with no match are hidden.
  const filtered = useMemo(
    () =>
      files
        .map((f) => ({
          file: f,
          params: query
            ? f.params.filter(
                (p) =>
                  p.key.toLowerCase().includes(query) ||
                  JSON.stringify(p.value).toLowerCase().includes(query) ||
                  p.comment?.toLowerCase().includes(query) ||
                  p.note?.toLowerCase().includes(query),
              )
            : f.params,
        }))
        .filter((g) => !query || g.params.length > 0),
    [files, query],
  );

  const total = files.reduce((s, f) => s + f.params.length, 0);
  const shown = selected === ALL ? filtered : filtered.filter((g) => g.file.path === selected);
  // Falls back to all files when the filter hides the selected one.
  const visible = shown.length ? shown : filtered;
  const activeId = shown.length ? selected : ALL;

  const shownPath = data?.path ?? currentPath;
  const isFile = /\.ya?ml$/i.test(shownPath);
  const folder = isFile ? shownPath.replace(/[\\/][^\\/]*$/, '') : shownPath;
  const fileName = isFile ? shownPath.slice(folder.length + 1) : undefined;

  const navItem = (id: string, label: string, count: number, mono?: string) => (
    <button
      key={id}
      onClick={() => setSelected(id)}
      aria-current={activeId === id ? 'true' : undefined}
      title={mono}
      className={`shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-xs transition-colors ${
        activeId === id
          ? 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 font-semibold'
          : 'text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300'
      }`}
    >
      <span className="truncate">{label}</span>
      <span className="text-[10px] tabular-nums text-slate-400">{count}</span>
    </button>
  );

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
            <div className="flex items-center gap-2 min-w-0 text-xs text-slate-700 dark:text-slate-200" title={data?.path}>
              <IconFolder size={16} className="shrink-0 text-amber-500" />
              <span className="font-mono truncate">{folder}</span>
              {fileName && (
                <span className="shrink-0 inline-flex items-center gap-1 font-mono text-slate-500 dark:text-slate-400">
                  <IconFileCode size={14} />
                  {fileName}
                </span>
              )}
              {!data?.error && files.length > 0 && (
                <span className="shrink-0 text-[11px] text-slate-400">· {t('fileCount', { count: files.length })}</span>
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
            defaultPath={defaultDir}
            onApply={(p) => load(p, true)}
            onClose={() => setPickerOpen(false)}
            i18nNamespace="leakDetection.configure.robot.params.picker"
          />
        )}

        {data?.error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
            {data.error}
          </div>
        )}

        {data && !data.error && (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between mb-3">
              <div role="group" aria-label={t('view')} className="flex p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-lg w-fit">
                {(['params', 'raw'] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={view === v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      view === v
                        ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {t(v === 'params' ? 'viewParams' : 'viewRaw')}
                  </button>
                ))}
              </div>
              {view === 'params' && (
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

            {filtered.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-slate-400">{t('noMatches')}</div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-4 items-start">
                <nav
                  aria-label={t('filesTitle')}
                  className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
                >
                  <div className="hidden lg:block px-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('filesTitle')}
                  </div>
                  {navItem(
                    ALL,
                    t('allFiles'),
                    filtered.reduce((s, g) => s + g.params.length, 0),
                  )}
                  {filtered.map((g) => navItem(g.file.path, prettyName(g.file.name), g.params.length, g.file.name))}
                </nav>

                <div className="min-w-0 space-y-4">
                  {view === 'raw'
                    ? (activeId === ALL ? files : files.filter((f) => f.path === activeId)).map((file) => (
                        <div key={file.path}>
                          <div className="flex items-center gap-1 mb-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            <IconFileCode size={13} />
                            {file.name}
                          </div>
                          <pre className="max-h-[calc(100vh-20rem)] min-h-[8rem] overflow-auto p-3 rounded-lg bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200/50 dark:border-white/5 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                            {file.raw ?? file.error}
                          </pre>
                        </div>
                      ))
                    : visible.map((g) => <FileSection key={g.file.path} file={g.file} params={g.params} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
