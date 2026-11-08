'use client';

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import {
  IconChevronLeft,
  IconChevronDown,
  IconFileCode,
  IconFolder,
  IconRefresh,
  IconSearch,
  IconInfoCircle,
  IconPlayerPlay,
} from '@tabler/icons-react';

const DEFAULT_DIR = 'X:/dev/FT-Theia/FT_Workcell_Robotics_ALDM_1.0.3/aldm_control/config/BehaviorTree';
const INDENT_PX = 16;

interface TreeNode {
  tag: string;
  attrs: { name: string; value: string }[];
  comment?: string;
  children: TreeNode[];
}

interface BehaviorTree {
  id: string;
  comment?: string;
  nodes: TreeNode[];
}

interface Port {
  direction: 'input' | 'output' | 'inout';
  name: string;
  type?: string;
  default?: string;
  description?: string;
}

interface NodeModel {
  kind: string;
  id: string;
  ports: Port[];
}

interface SourceFile {
  name: string;
  path: string;
  modified?: string;
  raw?: string;
  error?: string;
}

interface BehaviorTreeResponse {
  path: string;
  files?: SourceFile[];
  header?: string;
  mainTree?: string;
  trees?: BehaviorTree[];
  models?: NodeModel[];
  error?: string;
}

type Section = 'trees' | 'models' | 'blackboard' | 'raw';

// Nodes that ship with BehaviorTree.CPP and so are not listed in tree_nodes_model.xml.
const BUILTIN = new Set([
  'Sequence', 'SequenceWithMemory', 'ReactiveSequence', 'Fallback', 'ReactiveFallback', 'Parallel', 'ParallelAll',
  'IfThenElse', 'WhileDoElse', 'Switch2', 'Switch3', 'Switch4', 'Switch5', 'Switch6', 'Repeat', 'RetryUntilSuccessful',
  'Inverter', 'ForceSuccess', 'ForceFailure', 'KeepRunningUntilFailure', 'Timeout', 'Delay', 'RunOnce', 'Precondition',
  'Script', 'ScriptCondition', 'SetBlackboard', 'UnsetBlackboard', 'AlwaysSuccess', 'AlwaysFailure', 'Sleep', 'SubTree',
  'WasEntryUpdated', 'SkipUnlessUpdated', 'WaitValueUpdate', 'LoopInt', 'LoopDouble', 'LoopString', 'LoopBool',
]);

// "{current_target}" -> "current_target"
const blackboardKey = (v: string) => v.match(/^\{([^{}]+)\}$/)?.[1];

// Blackboard keys named inside script expressions, e.g. "current_scene := current_scene + 1".
const scriptKeys = (code: string) =>
  Array.from(new Set(code.replace(/'[^']*'/g, '').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])).filter(
    (w) => !['true', 'false', 'and', 'or', 'not'].includes(w),
  );

// Attributes that hold script code rather than a plain value.
const isScriptAttr = (tag: string, name: string) =>
  (tag === 'Script' && name === 'code') || /^_(skipIf|successIf|failureIf|while|onSuccess|onFailure|onHalted|post)$/.test(name);

function nodeMatches(node: TreeNode, q: string) {
  return (
    node.tag.toLowerCase().includes(q) ||
    node.attrs.some((a) => a.name.toLowerCase().includes(q) || a.value.toLowerCase().includes(q)) ||
    !!node.comment?.toLowerCase().includes(q)
  );
}

// Keeps matching nodes with their whole subtree, plus the ancestors that lead to them.
function filterNodes(nodes: TreeNode[], q: string): TreeNode[] {
  if (!q) return nodes;
  return nodes.flatMap((n) => {
    if (nodeMatches(n, q)) return [n];
    const children = filterNodes(n.children, q);
    return children.length ? [{ ...n, children }] : [];
  });
}

const countNodes = (nodes: TreeNode[]): number => nodes.reduce((s, n) => s + 1 + countNodes(n.children), 0);
const countParams = (nodes: TreeNode[]): number =>
  nodes.reduce((s, n) => s + n.attrs.length + countParams(n.children), 0);

function AttrValue({ tag, name, value }: { tag: string; name: string; value: string }) {
  const key = blackboardKey(value);
  if (key) {
    return (
      <span className="px-1 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300 break-all">{`{${key}}`}</span>
    );
  }
  if (isScriptAttr(tag, name)) return <span className="text-emerald-700 dark:text-emerald-300 break-all">{value}</span>;
  if (value === 'true' || value === 'false') {
    return (
      <span
        className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
          value === 'true' ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-slate-500/15 text-slate-500'
        }`}
      >
        {value}
      </span>
    );
  }
  if (value !== '' && !Number.isNaN(Number(value))) {
    return <span className="text-cyan-700 dark:text-cyan-300 tabular-nums">{value}</span>;
  }
  if (value === '') return <span className="text-slate-400 italic">""</span>;
  return <span className="text-amber-700 dark:text-amber-300 break-all">{value}</span>;
}

function portTooltip(port?: Port) {
  if (!port) return undefined;
  return [
    `${port.direction} · ${port.type ?? '?'}${port.default !== undefined ? ` · default ${port.default || '""'}` : ''}`,
    port.description,
  ]
    .filter(Boolean)
    .join('\n');
}

function NodeRows({
  nodes,
  depth,
  models,
}: {
  nodes: TreeNode[];
  depth: number;
  models: Map<string, NodeModel>;
}) {
  const t = useTranslations('leakDetection.configure.process.automations.page');
  return (
    <>
      {nodes.map((n, i) => {
        const model = models.get(n.tag);
        const subTreeId = n.tag === 'SubTree' ? n.attrs.find((a) => a.name === 'ID')?.value : undefined;
        const attrs = subTreeId ? n.attrs.filter((a) => a.name !== 'ID') : n.attrs;
        const kind = model ? 'model' : BUILTIN.has(n.tag) ? 'builtin' : 'unknown';
        return (
          <li key={i}>
            <div
              className="py-1.5 pr-4 border-t border-slate-200/50 dark:border-white/5 hover:bg-cyan-500/5"
              style={{ paddingLeft: 16 + depth * INDENT_PX }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                <span
                  className={`font-semibold ${
                    kind === 'model'
                      ? 'text-cyan-700 dark:text-cyan-300'
                      : kind === 'builtin'
                        ? 'text-slate-500 dark:text-slate-400'
                        : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {n.tag}
                </span>
                {subTreeId && (
                  <a
                    href={`#tree-${subTreeId}`}
                    className="font-mono text-[11px] text-cyan-700 dark:text-cyan-300 underline decoration-dotted underline-offset-2"
                  >
                    {subTreeId}
                  </a>
                )}
                {kind === 'unknown' && (
                  <span
                    className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-700 dark:text-amber-400"
                    title={t('notInModelHint')}
                  >
                    {t('notInModel')}
                  </span>
                )}
                {n.comment && (
                  <span title={n.comment} className="cursor-help text-slate-400 hover:text-cyan-500">
                    <IconInfoCircle size={13} />
                  </span>
                )}
              </div>
              {attrs.length > 0 && (
                <dl className="mt-1 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11px]">
                  {attrs.map((a) => {
                    const port = model?.ports.find((p) => p.name === a.name);
                    const missing = model && !port && !a.name.startsWith('_');
                    return (
                      <div key={a.name} className="contents">
                        <dt
                          title={portTooltip(port) ?? (missing ? t('portNotInModel') : undefined)}
                          className={`${port ? 'cursor-help underline decoration-dotted decoration-slate-300 dark:decoration-slate-600 underline-offset-2' : ''} ${
                            a.name.startsWith('_')
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : missing
                                ? 'text-amber-600 dark:text-amber-400'
                                : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {a.name}
                        </dt>
                        <dd className="min-w-0">
                          <AttrValue tag={n.tag} name={a.name} value={a.value} />
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              )}
            </div>
            {n.children.length > 0 && (
              <ul>
                <NodeRows nodes={n.children} depth={depth + 1} models={models} />
              </ul>
            )}
          </li>
        );
      })}
    </>
  );
}

function Notes({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-cyan-600 dark:hover:text-cyan-400"
      >
        <IconChevronDown size={14} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
        {label}
      </button>
      {open && (
        <pre className="mt-1 max-h-96 overflow-auto p-2.5 rounded-md bg-slate-100/70 dark:bg-slate-950/60 text-[11px] leading-relaxed whitespace-pre-wrap font-mono text-slate-600 dark:text-slate-300">
          {text}
        </pre>
      )}
    </div>
  );
}

function TreeSection({
  tree,
  nodes,
  isMain,
  models,
}: {
  tree: BehaviorTree;
  nodes: TreeNode[];
  isMain: boolean;
  models: Map<string, NodeModel>;
}) {
  const t = useTranslations('leakDetection.configure.process.automations.page');
  return (
    <section
      id={`tree-${tree.id}`}
      className="scroll-mt-4 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40"
    >
      <div className="px-4 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          {tree.id}
          {isMain && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-cyan-500/15 text-cyan-700 dark:text-cyan-300">
              <IconPlayerPlay size={10} />
              {t('mainTree')}
            </span>
          )}
          <span className="text-[10px] font-bold text-slate-400 tabular-nums">
            {t('nodeCount', { count: countNodes(tree.nodes) })}
          </span>
        </h3>
        {tree.comment && <Notes text={tree.comment} label={t('treeNotes')} />}
      </div>
      <ul className="pb-1">
        <NodeRows nodes={nodes} depth={0} models={models} />
      </ul>
    </section>
  );
}

function ModelSection({
  model,
  usedIn,
  onGoToTree,
}: {
  model: NodeModel;
  usedIn: string[];
  onGoToTree: (e: MouseEvent, id: string) => void;
}) {
  const t = useTranslations('leakDetection.configure.process.automations.page');
  return (
    <section
      id={`model-${model.id}`}
      className="scroll-mt-4 rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40"
    >
      <div className="px-4 py-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{model.id}</h3>
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{model.kind}</span>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          {usedIn.length ? (
            <>
              {t('usedIn')}{' '}
              {usedIn.map((id, i) => (
                <span key={id}>
                  <a
                    href={`#tree-${id}`}
                    onClick={(e) => onGoToTree(e, id)}
                    className="font-mono text-cyan-700 dark:text-cyan-300 hover:underline"
                  >
                    {id}
                  </a>
                  {i < usedIn.length - 1 && ', '}
                </span>
              ))}
            </>
          ) : (
            <span className="italic">{t('unused')}</span>
          )}
        </span>
      </div>
      {model.ports.length === 0 ? (
        <p className="px-4 pb-3 text-xs text-slate-400 italic">{t('noPorts')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[44rem] table-fixed text-xs">
            <colgroup>
              <col className="w-[22%]" />
              <col className="w-[9%]" />
              <col className="w-[12%]" />
              <col className="w-[11%]" />
              <col />
            </colgroup>
            <thead>
              <tr className="border-t border-slate-200/50 dark:border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                <th className="pl-4 pr-3 py-1.5 text-left font-bold">{t('colPort')}</th>
                <th className="px-3 py-1.5 text-left font-bold">{t('colDirection')}</th>
                <th className="px-3 py-1.5 text-left font-bold">{t('colType')}</th>
                <th className="px-3 py-1.5 text-left font-bold">{t('colDefault')}</th>
                <th className="px-3 pr-4 py-1.5 text-left font-bold">{t('colDescription')}</th>
              </tr>
            </thead>
            <tbody>
              {model.ports.map((p) => (
                <tr key={p.name} className="border-t border-slate-200/50 dark:border-white/5 align-top hover:bg-cyan-500/5">
                  <td className="pl-4 pr-3 py-1.5 font-mono text-slate-700 dark:text-slate-200 break-all">{p.name}</td>
                  <td className="px-3 py-1.5">
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        p.direction === 'output'
                          ? 'bg-violet-500/15 text-violet-700 dark:text-violet-300'
                          : 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                      }`}
                    >
                      {t(`direction.${p.direction}`)}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px] text-slate-500 dark:text-slate-400 break-all">
                    {p.type}
                  </td>
                  <td className="px-3 py-1.5 font-mono text-[11px]">
                    {p.default !== undefined ? (
                      <AttrValue tag="" name={p.name} value={p.default} />
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 pr-4 py-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                    {p.description}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

interface BlackboardUse {
  tree: string;
  node: string;
  attr: string;
  // "write" when the node's port is an output, "read" when it is an input, else unknown.
  access?: 'read' | 'write';
}

function collectBlackboard(trees: BehaviorTree[], models: Map<string, NodeModel>) {
  const map = new Map<string, BlackboardUse[]>();
  const add = (key: string, use: BlackboardUse) => {
    const list = map.get(key) ?? [];
    list.push(use);
    map.set(key, list);
  };
  const walk = (tree: string, nodes: TreeNode[]) => {
    for (const n of nodes) {
      for (const a of n.attrs) {
        const key = blackboardKey(a.value);
        if (key) {
          const dir = models.get(n.tag)?.ports.find((p) => p.name === a.name)?.direction;
          add(key, { tree, node: n.tag, attr: a.name, access: dir === 'output' ? 'write' : dir === 'input' ? 'read' : undefined });
        } else if (isScriptAttr(n.tag, a.name)) {
          const assigned = a.value.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:?=/)?.[1];
          for (const k of scriptKeys(a.value)) {
            add(k, { tree, node: n.tag, attr: a.name, access: k === assigned && a.name === 'code' ? 'write' : 'read' });
          }
        }
      }
      walk(tree, n.children);
    }
  };
  trees.forEach((tr) => walk(tr.id, tr.nodes));
  return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

export function WorkflowAutomationPage() {
  const t = useTranslations('leakDetection.configure.process.automations.page');
  const tRoot = useTranslations();
  const locale = useLocale();
  const [data, setData] = useState<BehaviorTreeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [section, setSection] = useState<Section>('trees');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/behavior-tree?path=${encodeURIComponent(DEFAULT_DIR)}`, { cache: 'no-store' });
      setData((await res.json()) as BehaviorTreeResponse);
    } catch (e) {
      setData({ path: DEFAULT_DIR, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const q = filter.trim().toLowerCase();
  const trees = useMemo(() => data?.trees ?? [], [data]);
  const models = useMemo(() => data?.models ?? [], [data]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

  // Switches to the trees tab, then scrolls to the tree once it is rendered.
  const goToTree = (e: MouseEvent, id: string) => {
    e.preventDefault();
    setSection('trees');
    setFilter('');
    requestAnimationFrame(() => document.getElementById(`tree-${id}`)?.scrollIntoView({ behavior: 'smooth' }));
  };

  const filteredTrees = useMemo(
    () =>
      trees
        .map((tree) => ({ tree, nodes: tree.id.toLowerCase().includes(q) ? tree.nodes : filterNodes(tree.nodes, q) }))
        .filter((g) => g.nodes.length > 0),
    [trees, q],
  );

  // Which trees use each node model.
  const usage = useMemo(() => {
    const map = new Map<string, Set<string>>();
    const walk = (tree: string, nodes: TreeNode[]) =>
      nodes.forEach((n) => {
        if (!map.has(n.tag)) map.set(n.tag, new Set());
        map.get(n.tag)!.add(tree);
        walk(tree, n.children);
      });
    trees.forEach((tr) => walk(tr.id, tr.nodes));
    return map;
  }, [trees]);

  const filteredModels = useMemo(
    () =>
      models
        .map((m) => {
          if (!q || m.id.toLowerCase().includes(q)) return m;
          const ports = m.ports.filter((p) =>
            [p.name, p.type, p.default, p.description].some((v) => v?.toLowerCase().includes(q)),
          );
          return ports.length ? { ...m, ports } : null;
        })
        .filter((m): m is NodeModel => m !== null),
    [models, q],
  );

  const blackboard = useMemo(() => collectBlackboard(trees, modelMap), [trees, modelMap]);
  const filteredBlackboard = useMemo(
    () =>
      blackboard.filter(
        ([key, uses]) =>
          !q || key.toLowerCase().includes(q) || uses.some((u) => `${u.tree} ${u.node} ${u.attr}`.toLowerCase().includes(q)),
      ),
    [blackboard, q],
  );

  const totalTreeParams = trees.reduce((s, tr) => s + countParams(tr.nodes), 0);
  const totalPorts = models.reduce((s, m) => s + m.ports.length, 0);
  const files = data?.files ?? [];
  const fileErrors = files.filter((f) => f.error);

  const tabs: { id: Section; label: string; count?: number }[] = [
    { id: 'trees', label: t('tabs.trees'), count: trees.length },
    { id: 'models', label: t('tabs.models'), count: models.length },
    { id: 'blackboard', label: t('tabs.blackboard'), count: blackboard.length },
    { id: 'raw', label: t('tabs.raw') },
  ];

  const navLink = (href: string, label: string, count?: number) => (
    <a
      key={href}
      href={href}
      className="shrink-0 flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-left text-xs text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10 hover:text-cyan-700 dark:hover:text-cyan-300 transition-colors"
    >
      <span className="truncate font-mono">{label}</span>
      {count !== undefined && <span className="text-[10px] tabular-nums text-slate-400">{count}</span>}
    </a>
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
              <span className="font-mono truncate">{data?.path ?? DEFAULT_DIR}</span>
            </div>
            {files.length > 0 && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {files.map((f) => (
                  <span
                    key={f.path}
                    className={`inline-flex items-center gap-1 text-[11px] font-mono ${
                      f.error ? 'text-red-600 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'
                    }`}
                    title={f.modified ? `${f.path}\n${new Date(f.modified).toLocaleString()}` : f.path}
                  >
                    <IconFileCode size={13} />
                    {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-medium disabled:opacity-50"
          >
            <IconRefresh size={16} className={loading ? 'animate-spin' : ''} />
            {t('reload')}
          </button>
        </div>

        {data?.error && (
          <div className="p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">
            {data.error}
          </div>
        )}

        {fileErrors.map((f) => (
          <div
            key={f.path}
            className="mb-3 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap"
          >
            <span className="font-mono font-semibold">{f.name}</span>: {f.error}
          </div>
        ))}

        {data && !data.error && (
          <>
            {data.header && <Notes text={data.header} label={t('fileNotes')} />}

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between my-3">
              <div
                role="tablist"
                aria-label={t('tabs.label')}
                className="flex flex-wrap p-1 bg-slate-200/50 dark:bg-slate-900/50 rounded-lg w-fit"
              >
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    role="tab"
                    aria-selected={section === tab.id}
                    onClick={() => setSection(tab.id)}
                    className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                      section === tab.id
                        ? 'bg-white dark:bg-slate-800 text-cyan-600 dark:text-cyan-400 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                  >
                    {tab.label}
                    {tab.count !== undefined && <span className="ml-1.5 text-[10px] tabular-nums opacity-60">{tab.count}</span>}
                  </button>
                ))}
              </div>
              {section !== 'raw' && (
                <div className="relative">
                  <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t('filter', { count: totalTreeParams + totalPorts })}
                    className="w-full sm:w-72 pl-8 pr-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 text-xs focus:ring-2 focus:ring-cyan-500 outline-none text-slate-700 dark:text-slate-200"
                  />
                </div>
              )}
            </div>

            {section === 'trees' &&
              (filteredTrees.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400">{t('noMatches')}</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-4 items-start">
                  <nav
                    aria-label={t('tabs.trees')}
                    className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0"
                  >
                    {filteredTrees.map((g) => navLink(`#tree-${g.tree.id}`, g.tree.id, countNodes(g.nodes)))}
                    <div className="hidden lg:block mt-3 px-2 space-y-1 text-[10px] text-slate-400">
                      <div className="font-bold uppercase tracking-widest">{t('legend.title')}</div>
                      <div><span className="font-semibold text-cyan-700 dark:text-cyan-300">Action</span> — {t('legend.model')}</div>
                      <div><span className="font-semibold text-slate-500">Sequence</span> — {t('legend.builtin')}</div>
                      <div><span className="font-mono px-1 rounded bg-violet-500/10 text-violet-700 dark:text-violet-300">{'{key}'}</span> — {t('legend.blackboard')}</div>
                      <div><span className="font-mono text-emerald-600 dark:text-emerald-400">_skipIf</span> — {t('legend.script')}</div>
                    </div>
                  </nav>
                  <div className="min-w-0 space-y-4">
                    {filteredTrees.map((g) => (
                      <TreeSection
                        key={g.tree.id}
                        tree={g.tree}
                        nodes={g.nodes}
                        isMain={g.tree.id === data.mainTree}
                        models={modelMap}
                      />
                    ))}
                  </div>
                </div>
              ))}

            {section === 'models' &&
              (filteredModels.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400">{t('noMatches')}</div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-[14rem_1fr] gap-4 items-start">
                  <nav
                    aria-label={t('tabs.models')}
                    className="lg:sticky lg:top-4 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
                  >
                    {filteredModels.map((m) => navLink(`#model-${m.id}`, m.id, m.ports.length))}
                  </nav>
                  <div className="min-w-0 space-y-4">
                    {filteredModels.map((m) => (
                      <ModelSection key={m.id} model={m} usedIn={Array.from(usage.get(m.id) ?? [])} onGoToTree={goToTree} />
                    ))}
                  </div>
                </div>
              ))}

            {section === 'blackboard' &&
              (filteredBlackboard.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-slate-400">{t('noMatches')}</div>
              ) : (
                <div className="rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40 overflow-x-auto">
                  <p className="px-4 py-3 text-[11px] text-slate-500 dark:text-slate-400">{t('blackboardHint')}</p>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-t border-slate-200/50 dark:border-white/5 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <th className="pl-4 pr-3 py-1.5 text-left font-bold w-[22%]">{t('colKey')}</th>
                        <th className="px-3 pr-4 py-1.5 text-left font-bold">{t('colUsedBy')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredBlackboard.map(([key, uses]) => (
                        <tr key={key} className="border-t border-slate-200/50 dark:border-white/5 align-top hover:bg-cyan-500/5">
                          <td className="pl-4 pr-3 py-1.5 font-mono text-violet-700 dark:text-violet-300">{key}</td>
                          <td className="px-3 pr-4 py-1.5">
                            <div className="flex flex-wrap gap-1">
                              {uses.map((u, i) => (
                                <a
                                  key={i}
                                  href={`#tree-${u.tree}`}
                                  onClick={(e) => goToTree(e, u.tree)}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800/70 font-mono text-[10px] text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10"
                                  title={u.tree}
                                >
                                  {u.access && (
                                    <span
                                      className={`font-sans font-bold uppercase text-[9px] ${
                                        u.access === 'write' ? 'text-violet-600 dark:text-violet-400' : 'text-cyan-600 dark:text-cyan-400'
                                      }`}
                                    >
                                      {t(`access.${u.access}`)}
                                    </span>
                                  )}
                                  {u.node}.{u.attr}
                                </a>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}

            {section === 'raw' && (
              <div className="space-y-4">
                {files.map((f) => (
                  <div key={f.path}>
                    <div className="flex items-center gap-1 mb-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      <IconFileCode size={13} />
                      {f.name}
                    </div>
                    <pre className="max-h-[calc(100vh-20rem)] min-h-[8rem] overflow-auto p-3 rounded-lg bg-slate-100/70 dark:bg-slate-950/60 border border-slate-200/50 dark:border-white/5 text-[11px] font-mono text-slate-700 dark:text-slate-300">
                      {f.raw ?? f.error}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
