'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconX,
  IconFolder,
  IconFolderOpen,
  IconFileCode,
  IconArrowUp,
  IconDeviceFloppy,
  IconLoader,
} from '@tabler/icons-react';

interface Entry {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

interface Listing {
  dir: string;
  parent: string | null;
  entries: Entry[];
  error?: string;
}

const YAML_FILE = /\.ya?ml$/i;

// Folder part of a folder-or-file path, used as the browser's starting point.
const folderOf = (p: string) => (YAML_FILE.test(p) ? p.replace(/[\\/][^\\/]*$/, '') : p);

interface PathPickerModalProps {
  initialPath: string;
  defaultPath: string;
  // Resolves to an error message when the path cannot be loaded, or null on success.
  onApply: (path: string) => Promise<string | null>;
  onClose: () => void;
}

export function PathPickerModal({ initialPath, defaultPath, onApply, onClose }: PathPickerModalProps) {
  const t = useTranslations('leakDetection.configure.vision.params.picker');
  const [value, setValue] = useState(initialPath);
  const [listing, setListing] = useState<Listing | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const browse = useCallback(async (dir: string) => {
    setListLoading(true);
    try {
      const res = await fetch(`/api/vision-params/browse?dir=${encodeURIComponent(dir)}`, { cache: 'no-store' });
      setListing((await res.json()) as Listing);
    } catch (e) {
      setListing({ dir, parent: null, entries: [], error: e instanceof Error ? e.message : String(e) });
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const openBrowser = () => {
    setBrowsing(true);
    browse(folderOf(value.trim()));
  };

  const apply = async (path = value) => {
    const target = path.trim();
    if (!target) return;
    setApplying(true);
    setError(null);
    const err = await onApply(target);
    setApplying(false);
    if (err) setError(err);
    else onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vp-picker-title"
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200/60 dark:border-white/5">
          <div>
            <h2 id="vp-picker-title" className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t('title')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t('description')}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('cancel')}
            className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <IconX size={18} className="text-slate-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              apply();
            }}
          >
            <label
              htmlFor="vp-picker-path"
              className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest"
            >
              {t('pathLabel')}
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="vp-picker-path"
                autoFocus
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                spellCheck={false}
                placeholder={defaultPath}
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs font-mono focus:ring-2 focus:ring-cyan-500 outline-none text-slate-700 dark:text-slate-200"
              />
              <button
                type="button"
                onClick={openBrowser}
                className="inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-xs font-medium"
              >
                <IconFolderOpen size={16} />
                {t('browse')}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{t('pathHint')}</p>
          </form>

          {error && (
            <div className="p-2.5 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
              {error}
            </div>
          )}

          {browsing && (
            <div className="rounded-lg border border-slate-200/70 dark:border-white/10 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-100/80 dark:bg-slate-900/80 border-b border-slate-200/70 dark:border-white/10">
                <button
                  type="button"
                  disabled={!listing || listing.parent === null || listLoading}
                  onClick={() => listing && listing.parent !== null && browse(listing.parent)}
                  title={t('up')}
                  aria-label={t('up')}
                  className="p-1 rounded-md text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <IconArrowUp size={16} />
                </button>
                <span className="flex-1 min-w-0 truncate font-mono text-[11px] text-slate-600 dark:text-slate-300">
                  {listing?.dir || t('drives')}
                </span>
                {listLoading && <IconLoader size={14} className="animate-spin text-slate-400" />}
                {listing?.dir && !listing.error && (
                  <button
                    type="button"
                    onClick={() => {
                      setValue(listing.dir);
                      setError(null);
                    }}
                    className="shrink-0 px-2 py-0.5 rounded-md text-[11px] font-medium text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/10"
                  >
                    {t('useFolder')}
                  </button>
                )}
              </div>
              <div className="max-h-72 overflow-y-auto">
                {listing?.error ? (
                  <div className="px-3 py-3 text-xs text-red-600 dark:text-red-400">{listing.error}</div>
                ) : listing && listing.entries.length === 0 ? (
                  <div className="px-3 py-3 text-xs text-slate-400">{t('emptyFolder')}</div>
                ) : (
                  <ul>
                    {listing?.entries.map((e) => {
                      const selected = e.type === 'file' && value.trim() === e.path;
                      return (
                        <li key={e.path}>
                          <button
                            type="button"
                            onClick={() => {
                              if (e.type === 'dir') browse(e.path);
                              else {
                                setValue(e.path);
                                setError(null);
                              }
                            }}
                            onDoubleClick={() => e.type === 'file' && apply(e.path)}
                            className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                              selected
                                ? 'bg-cyan-500/15 text-cyan-800 dark:text-cyan-200'
                                : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                            }`}
                          >
                            {e.type === 'dir' ? (
                              <IconFolder size={15} className="shrink-0 text-amber-500" />
                            ) : (
                              <IconFileCode size={15} className="shrink-0 text-cyan-600 dark:text-cyan-400" />
                            )}
                            <span className={`truncate ${e.type === 'file' ? 'font-mono' : ''}`}>{e.name}</span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 px-6 py-4 border-t border-slate-200/60 dark:border-white/5 bg-slate-50/60 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={() => {
              setValue(defaultPath);
              setError(null);
            }}
            className="text-xs font-medium text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"
          >
            {t('useDefault')}
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={() => apply()}
              disabled={applying || !value.trim()}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {applying ? <IconLoader size={16} className="animate-spin" /> : <IconDeviceFloppy size={16} />}
              {t('apply')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
