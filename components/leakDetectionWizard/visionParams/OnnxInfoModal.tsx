'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { IconBrain, IconLoader2, IconX } from '@tabler/icons-react';

interface TensorInfo {
  name: string;
  elemType: string;
  shape: (number | string | null)[] | null;
  docString?: string;
}

// Response of /api/vision-params/onnx (see app/api/vision-params/onnx/onnxMeta.ts).
interface OnnxInfo {
  resolvedPath: string;
  fileSize: number;
  modified: string;
  sha256: string;
  irVersion?: number;
  producerName?: string;
  producerVersion?: string;
  domain?: string;
  modelVersion?: number;
  docString?: string;
  opsets: { domain: string; version: number }[];
  metadata: { key: string; value: string }[];
  graph: {
    name?: string;
    docString?: string;
    inputs: TensorInfo[];
    outputs: TensorInfo[];
    nodeCount: number;
    initializerCount: number;
    parameterCount: number;
    weightBytes: number;
    operators: { op: string; count: number }[];
  };
  functionCount: number;
}

interface OnnxInfoModalProps {
  // .onnx path as written in the yaml (relative paths resolve on the server).
  onnxPath: string;
  // Loaded vision_params.yaml, used as the base for relative paths.
  yamlPath: string;
  // Initial view; the modal has its own Full / Focused switch.
  initialView: 'full' | 'focused';
  onClose: () => void;
}

// Ultralytics stores class names as a Python dict string: "{0: 'tre', 1: 'tappo'}".
function parseClassNames(value?: string): { id: number; name: string }[] {
  if (!value) return [];
  return [...value.matchAll(/(\d+)\s*:\s*(['"])(.*?)\2/g)].map((m) => ({ id: Number(m[1]), name: m[3] }));
}

const formatBytes = (n: number) => {
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
};

const formatCount = (n: number, locale: string) =>
  n >= 1e6
    ? `${(n / 1e6).toLocaleString(locale, { maximumFractionDigits: 2 })} M`
    : n.toLocaleString(locale);

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</h3>
      {children}
    </section>
  );
}

// Label/value grid; rows with an empty value are left out.
function Facts({ rows }: { rows: [label: string, value: ReactNode, mono?: boolean][] }) {
  const shown = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!shown.length) return null;
  return (
    <dl className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-x-6 gap-y-1.5 text-xs">
      {shown.map(([label, value, mono]) => (
        <div key={label} className="contents">
          <dt className="text-slate-500 dark:text-slate-400">{label}</dt>
          <dd className={`text-slate-800 dark:text-slate-100 break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function OnnxInfoModal({ onnxPath, yamlPath, initialView, onClose }: OnnxInfoModalProps) {
  const t = useTranslations('leakDetection.configure.vision.params');
  const locale = useLocale();
  const [view, setView] = useState(initialView);
  const [info, setInfo] = useState<OnnxInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const ctrl = new AbortController();
    setInfo(null);
    setError(null);
    fetch(`/api/vision-params/onnx?path=${encodeURIComponent(onnxPath)}&yaml=${encodeURIComponent(yamlPath)}`, {
      cache: 'no-store',
      signal: ctrl.signal,
    })
      .then(async (res) => {
        const body = (await res.json()) as OnnxInfo & { error?: string };
        if (!res.ok || body.error) throw new Error(body.error ?? `HTTP ${res.status}`);
        setInfo(body);
      })
      .catch((e) => {
        if (!ctrl.signal.aborted) setError(e instanceof Error ? e.message : String(e));
      });
    return () => ctrl.abort();
  }, [onnxPath, yamlPath]);

  const fileName = onnxPath.split(/[\\/]/).pop();
  const meta = Object.fromEntries(info?.metadata.map((m) => [m.key, m.value]) ?? []);
  const classes = parseClassNames(meta.names);
  const mainOpset = info?.opsets.find((o) => o.domain === 'ai.onnx')?.version;
  const producer = [info?.producerName, info?.producerVersion].filter(Boolean).join(' ');
  const date = (iso?: string) => {
    if (!iso) return undefined;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString(locale);
  };
  const shapeText = (s: TensorInfo['shape']) =>
    s ? `[${s.map((d) => (d === null ? '?' : d)).join(', ')}]` : t('onnxViewer.unknownShape');

  const tensorTable = (title: string, list: TensorInfo[]) => (
    <Section title={title}>
      <table className="w-full table-fixed text-xs">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
            <th className="w-2/5 font-semibold pr-4 pb-1">{t('onnxViewer.name')}</th>
            <th className="w-1/5 font-semibold pr-4 pb-1">{t('onnxViewer.type')}</th>
            <th className="font-semibold pb-1">{t('onnxViewer.shape')}</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {list.map((x) => (
            <tr key={x.name} className="border-t border-slate-200/50 dark:border-white/5">
              <td className="pr-4 py-1 text-slate-800 dark:text-slate-100 break-all">{x.name}</td>
              <td className="pr-4 py-1 text-slate-600 dark:text-slate-300">{x.elemType}</td>
              <td className="py-1 text-cyan-700 dark:text-cyan-300 tabular-nums">{shapeText(x.shape)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );

  const classChips = classes.length > 0 && (
    <Section title={`${t('onnxViewer.classNames')} (${classes.length})`}>
      <div className="flex flex-wrap gap-1.5">
        {classes.map((c) => (
          <span
            key={c.id}
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/20 text-xs"
          >
            <span className="text-[10px] tabular-nums text-slate-400">{c.id}</span>
            <span className="font-mono text-cyan-800 dark:text-cyan-200">{c.name}</span>
          </span>
        ))}
      </div>
    </Section>
  );

  const focused = info && (
    <>
      <Section title={t('onnxViewer.summary')}>
        <Facts
          rows={[
            [t('onnxViewer.description'), meta.description],
            [t('onnxViewer.task'), meta.task],
            [t('onnxViewer.inputSize'), meta.imgsz, true],
            [t('onnxViewer.classCount'), classes.length || undefined],
            [t('onnxViewer.parameters'), formatCount(info.graph.parameterCount, locale)],
            [t('onnxViewer.opset'), mainOpset],
            [t('onnxViewer.exportedWith'), producer],
            [t('onnxViewer.exportDate'), date(meta.date)],
            [t('onnxViewer.fileSize'), formatBytes(info.fileSize)],
          ]}
        />
      </Section>
      {classChips}
      {tensorTable(t('onnxViewer.inputs'), info.graph.inputs)}
      {tensorTable(t('onnxViewer.outputs'), info.graph.outputs)}
    </>
  );

  const full = info && (
    <>
      <Section title={t('onnxViewer.file')}>
        <Facts
          rows={[
            [t('onnxViewer.path'), info.resolvedPath, true],
            [t('onnxViewer.fileSize'), `${formatBytes(info.fileSize)} (${info.fileSize.toLocaleString(locale)} B)`],
            [t('onnxViewer.modified'), date(info.modified)],
            ['SHA-256', info.sha256, true],
          ]}
        />
      </Section>
      <Section title={t('onnxViewer.model')}>
        <Facts
          rows={[
            [t('onnxViewer.irVersion'), info.irVersion],
            [t('onnxViewer.producer'), producer],
            [t('onnxViewer.domain'), info.domain, true],
            [t('onnxViewer.modelVersion'), info.modelVersion],
            [t('onnxViewer.opsets'), info.opsets.map((o) => `${o.domain} v${o.version}`).join(', '), true],
            [t('onnxViewer.docString'), info.docString && <span className="whitespace-pre-wrap">{info.docString}</span>],
          ]}
        />
      </Section>
      <Section title={t('onnxViewer.graph')}>
        <Facts
          rows={[
            [t('onnxViewer.graphName'), info.graph.name, true],
            [t('onnxViewer.nodes'), info.graph.nodeCount.toLocaleString(locale)],
            [t('onnxViewer.initializers'), info.graph.initializerCount.toLocaleString(locale)],
            [
              t('onnxViewer.parameters'),
              `${formatCount(info.graph.parameterCount, locale)} (${info.graph.parameterCount.toLocaleString(locale)})`,
            ],
            [t('onnxViewer.weightSize'), formatBytes(info.graph.weightBytes)],
            [t('onnxViewer.functions'), info.functionCount || undefined],
            [
              t('onnxViewer.docString'),
              info.graph.docString && <span className="whitespace-pre-wrap">{info.graph.docString}</span>,
            ],
          ]}
        />
      </Section>
      {tensorTable(t('onnxViewer.inputs'), info.graph.inputs)}
      {tensorTable(t('onnxViewer.outputs'), info.graph.outputs)}
      {classChips}
      <Section title={`${t('onnxViewer.metadata')} (${info.metadata.length})`}>
        {info.metadata.length === 0 ? (
          <p className="text-xs text-slate-400 italic">{t('onnxViewer.noMetadata')}</p>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {info.metadata.map((m, i) => (
                <tr key={i} className="border-t first:border-t-0 border-slate-200/50 dark:border-white/5 align-top">
                  <td className="pr-4 py-1 font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">{m.key}</td>
                  <td className="py-1 font-mono text-amber-700 dark:text-amber-300 break-all whitespace-pre-wrap">
                    {m.value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Section title={`${t('onnxViewer.operators')} (${info.graph.operators.length})`}>
        <div className="flex flex-wrap gap-1.5">
          {info.graph.operators.map((o) => (
            <span
              key={o.op}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-xs"
            >
              <span className="font-mono text-slate-700 dark:text-slate-200">{o.op}</span>
              <span className="text-[10px] tabular-nums text-slate-400">×{o.count}</span>
            </span>
          ))}
        </div>
      </Section>
    </>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="vp-onnx-title"
        className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200/70 dark:border-white/10 bg-white dark:bg-slate-950 shadow-2xl overflow-hidden"
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-slate-200/60 dark:border-white/5">
          <div className="flex items-start gap-3 min-w-0">
            <IconBrain size={20} className="shrink-0 mt-0.5 text-cyan-500" />
            <div className="min-w-0">
              <h2 id="vp-onnx-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                {fileName}
              </h2>
              <p
                className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5 truncate"
                title={info?.resolvedPath ?? onnxPath}
              >
                {info?.resolvedPath ?? onnxPath}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div role="group" aria-label={t('infoView')} className="flex p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-lg">
              {(['full', 'focused'] as const).map((v) => (
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
                  {t(v === 'full' ? 'viewFullInfo' : 'viewFocusedInfo')}
                </button>
              ))}
            </div>
            <button
              onClick={onClose}
              aria-label={t('onnxViewer.close')}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <IconX size={18} className="text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {!info && !error && (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
              <IconLoader2 size={16} className="animate-spin" />
              {t('onnxViewer.loading')}
            </div>
          )}
          {error && (
            <p className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap break-all">
              {error}
            </p>
          )}
          {view === 'focused' ? focused : full}
        </div>
      </div>
    </div>
  );
}
