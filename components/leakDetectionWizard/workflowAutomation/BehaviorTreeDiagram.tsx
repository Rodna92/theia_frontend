'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import {
  IconZoomIn,
  IconZoomOut,
  IconMaximize,
  IconPlus,
  IconMinus,
  IconArrowUpRight,
  IconInfoCircle,
  IconLayoutDistributeHorizontal,
} from '@tabler/icons-react';
import {
  blackboardKey,
  isScriptAttr,
  nodeCategory,
  nodeMatches,
  portTooltip,
  type BehaviorTree,
  type NodeCategory,
  type NodeModel,
  type TreeNode,
} from './btShared';

// Layout constants (px, in diagram space).
// Column-based layout: one column per depth level, read left to right.
const COL_GAP = 72; // horizontal space between columns (connectors run here)
const ROW_GAP = 12; // vertical space between sibling subtrees
const COL_HEAD_H = 30; // pinned level headers above the columns
const HEADER_H = 28;
const ROW_H = 17;
const ROW_PAD = 8;
const CHAR_W = 6.7; // 11px monospace
const TITLE_CHAR_W = 7.6; // 12px semibold
const MAX_VALUE_CHARS = 34;
const MIN_W = 110;
const MAX_W = 380;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
const READABLE_ZOOM = 0.7;

const CATEGORY_STYLE: Record<NodeCategory | 'root', { header: string; border: string; label: string }> = {
  root: { header: 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900', border: 'border-slate-500', label: 'Root' },
  control: { header: 'bg-sky-600 text-white', border: 'border-sky-500/70', label: 'Control' },
  decorator: { header: 'bg-violet-600 text-white', border: 'border-violet-500/70', label: 'Decorator' },
  action: { header: 'bg-emerald-600 text-white', border: 'border-emerald-500/70', label: 'Action' },
  condition: { header: 'bg-amber-500 text-slate-900', border: 'border-amber-500/70', label: 'Condition' },
  subtree: { header: 'bg-orange-600 text-white', border: 'border-orange-500/70', label: 'SubTree' },
  unknown: { header: 'bg-rose-600 text-white', border: 'border-rose-500/70 border-dashed', label: 'Unknown' },
};

interface DNode {
  key: string;
  tag: string;
  // Tree the node is written in (differs from the shown tree inside an expanded SubTree).
  tree: string;
  category: NodeCategory | 'root';
  source?: TreeNode;
  rows: { name: string; value: string }[];
  subTreeId?: string;
  expanded?: boolean;
  // SubTree that refers to itself through its ancestors; cannot be expanded.
  recursive?: boolean;
  children: DNode[];
  depth: number;
  w: number;
  h: number;
  sub: number;
  x: number;
  y: number;
}

const truncate = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// headerExtra: room for the icons in the header (comment info, SubTree buttons).
function sizeOf(title: string, rows: { name: string; value: string }[], headerExtra = 0) {
  const nameCol = Math.max(0, ...rows.map((r) => r.name.length)) * CHAR_W;
  const valueCol = Math.max(0, ...rows.map((r) => Math.min(r.value.length || 2, MAX_VALUE_CHARS))) * CHAR_W;
  const w = Math.max(title.length * TITLE_CHAR_W + 32 + headerExtra, rows.length ? nameCol + valueCol + 34 : 0);
  return {
    w: Math.round(Math.min(MAX_W, Math.max(MIN_W, w))),
    h: HEADER_H + (rows.length ? rows.length * ROW_H + ROW_PAD : 0),
  };
}

function buildTree(
  tree: BehaviorTree,
  treeMap: Map<string, BehaviorTree>,
  models: Map<string, NodeModel>,
  expanded: Set<string>,
) {
  const make = (n: TreeNode, key: string, depth: number, treeId: string, stack: string[]): DNode => {
    const subTreeId = n.tag === 'SubTree' ? n.attrs.find((a) => a.name === 'ID')?.value : undefined;
    const rows = n.attrs.filter((a) => !(subTreeId && a.name === 'ID'));
    const title = subTreeId ?? n.tag;
    const recursive = !!subTreeId && stack.includes(subTreeId);
    const isOpen = !!subTreeId && !recursive && expanded.has(key) && treeMap.has(subTreeId);
    const kids = isOpen
      ? treeMap.get(subTreeId!)!.nodes.map((c, i) => make(c, `${key}>${subTreeId}:${i}`, depth + 1, subTreeId!, [...stack, subTreeId!]))
      : n.children.map((c, i) => make(c, `${key}.${i}`, depth + 1, treeId, stack));
    return {
      key,
      tag: n.tag,
      tree: treeId,
      category: nodeCategory(n.tag, models),
      source: n,
      rows,
      subTreeId,
      expanded: isOpen,
      recursive,
      children: kids,
      depth,
      ...sizeOf(title, rows, (n.comment ? 18 : 0) + (subTreeId ? 40 : 0)),
      sub: 0,
      x: 0,
      y: 0,
    };
  };

  const root: DNode = {
    key: 'root',
    tag: tree.id,
    tree: tree.id,
    category: 'root',
    rows: [],
    children: tree.nodes.map((n, i) => make(n, `${i}`, 1, tree.id, [tree.id])),
    depth: 0,
    ...sizeOf(tree.id, []),
    sub: 0,
    x: 0,
    y: 0,
  };

  // Subtree heights, bottom-up.
  const childrenHeight = (d: DNode) =>
    d.children.reduce((sum, c) => sum + c.sub, 0) + ROW_GAP * Math.max(0, d.children.length - 1);
  const measure = (d: DNode) => {
    d.children.forEach(measure);
    d.sub = Math.max(d.h, childrenHeight(d));
  };
  measure(root);

  // Every node of a column gets the width of the column's widest node.
  const colW: number[] = [];
  const all: DNode[] = [];
  const collect = (d: DNode) => {
    all.push(d);
    colW[d.depth] = Math.max(colW[d.depth] ?? 0, d.w);
    d.children.forEach(collect);
  };
  collect(root);
  const colX: number[] = [];
  colW.forEach((_, i) => (colX[i] = i === 0 ? 0 : colX[i - 1] + colW[i - 1] + COL_GAP));
  all.forEach((d) => (d.w = colW[d.depth]));

  // Children stacked top to bottom in the next column; the parent is centred beside them.
  const place = (d: DNode, top: number) => {
    d.x = colX[d.depth];
    let cy = top + (d.sub - childrenHeight(d)) / 2;
    for (const c of d.children) {
      place(c, cy);
      cy += c.sub + ROW_GAP;
    }
    if (d.children.length) {
      const first = d.children[0];
      const last = d.children[d.children.length - 1];
      const mid = (first.y + first.h / 2 + last.y + last.h / 2) / 2;
      d.y = Math.min(Math.max(mid - d.h / 2, top), top + d.sub - d.h);
    } else {
      d.y = top + (d.sub - d.h) / 2;
    }
  };
  place(root, 0);

  // Elbow connectors: parent's right edge -> middle of the gap -> child's left edge.
  const edges: { key: string; d: string; dashed: boolean }[] = [];
  for (const p of all) {
    for (const c of p.children) {
      const y1 = p.y + p.h / 2;
      const y2 = c.y + c.h / 2;
      const midX = colX[c.depth] - COL_GAP / 2;
      edges.push({ key: c.key, d: `M ${p.x + p.w} ${y1} H ${midX} V ${y2} H ${c.x - 2}`, dashed: !!p.expanded });
    }
  }

  const columns = colW.map((w, depth) => ({ depth, x: colX[depth], w }));
  const last = colW.length - 1;
  return { nodes: all, edges, columns, width: colX[last] + colW[last], height: root.sub };
}

function valueClass(tag: string, name: string, value: string) {
  if (blackboardKey(value)) return 'text-violet-700 dark:text-violet-300';
  if (isScriptAttr(tag, name)) return 'text-emerald-700 dark:text-emerald-300';
  if (value === 'true' || value === 'false') return 'text-green-700 dark:text-green-400';
  if (value !== '' && !Number.isNaN(Number(value))) return 'text-cyan-700 dark:text-cyan-300';
  return 'text-amber-700 dark:text-amber-300';
}

interface Props {
  tree: BehaviorTree;
  trees: BehaviorTree[];
  models: Map<string, NodeModel>;
  // Filter text; matching nodes are highlighted and the rest dimmed.
  query: string;
  onOpenTree: (e: MouseEvent, id: string) => void;
}

export function BehaviorTreeDiagram({ tree, trees, models, query, onOpenTree }: Props) {
  const t = useTranslations('leakDetection.configure.process.automations.page.diagram');
  const treeMap = useMemo(() => new Map(trees.map((tr) => [tr.id, tr])), [trees]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const containerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const arrowId = `bt-arrow-${useId().replace(/:/g, '')}`;

  const layout = useMemo(() => buildTree(tree, treeMap, models, expanded), [tree, treeMap, models, expanded]);

  // Whole tree in view, below the pinned level headers.
  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const W = el.clientWidth;
    const H = el.clientHeight - COL_HEAD_H;
    const k = Math.max(MIN_ZOOM, Math.min((W - 48) / layout.width, (H - 32) / layout.height, 1));
    setView({ k, x: (W - layout.width * k) / 2, y: COL_HEAD_H + (H - layout.height * k) / 2 });
  }, [layout.width, layout.height]);

  // First view of a tree (the page remounts this per tree): fit it, but never below a readable
  // zoom; a larger tree then starts at the root column, vertically centred on the root.
  const fittedFor = useRef<string | null>(null);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || fittedFor.current === tree.id) return;
    fittedFor.current = tree.id;
    const W = el.clientWidth;
    const H = el.clientHeight - COL_HEAD_H;
    const fitK = Math.min((W - 48) / layout.width, (H - 32) / layout.height, 1);
    if (fitK >= READABLE_ZOOM) {
      fit();
      return;
    }
    const root = layout.nodes[0];
    const k = READABLE_ZOOM;
    const y = COL_HEAD_H + H / 2 - (root.y + root.h / 2) * k;
    // Never leave a gap above the tree's top.
    setView({ k, x: 24, y: Math.min(y, COL_HEAD_H + 16) });
  }, [tree.id, fit, layout]);

  // Wheel zoom around the cursor (non-passive so the page does not scroll).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      setView((v) => {
        const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * Math.exp(-e.deltaY * 0.0015)));
        return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (f: number) => {
    const el = containerRef.current;
    if (!el) return;
    const mx = el.clientWidth / 2;
    const my = el.clientHeight / 2;
    setView((v) => {
      const k = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.k * f));
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button,a')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    d.x = e.clientX;
    d.y = e.clientY;
    setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const toggle = (key: string) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Expands every SubTree, level by level, until nothing new opens (recursive ones stay closed).
  const subTreeKeys = layout.nodes.filter((n) => n.subTreeId && !n.recursive).map((n) => n.key);
  const allExpanded = subTreeKeys.length > 0 && subTreeKeys.every((k) => expanded.has(k));
  const expandAll = () => {
    if (allExpanded) {
      setExpanded(new Set());
      return;
    }
    const keys = new Set(expanded);
    for (let i = 0; i < 10; i++) {
      const before = keys.size;
      buildTree(tree, treeMap, models, keys)
        .nodes.filter((n) => n.subTreeId && !n.recursive)
        .forEach((n) => keys.add(n.key));
      if (keys.size === before) break;
    }
    setExpanded(keys);
  };

  const q = query.trim().toLowerCase();
  const toolBtn =
    'p-1.5 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors';

  return (
    <div className="rounded-lg border border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/40 overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2 border-b border-slate-200/50 dark:border-white/5">
        <div className="flex items-center gap-0.5">
          <button type="button" className={toolBtn} onClick={() => zoomBy(1 / 1.25)} title={t('zoomOut')} aria-label={t('zoomOut')}>
            <IconZoomOut size={16} />
          </button>
          <span className="w-11 text-center text-[11px] tabular-nums text-slate-500">{Math.round(view.k * 100)}%</span>
          <button type="button" className={toolBtn} onClick={() => zoomBy(1.25)} title={t('zoomIn')} aria-label={t('zoomIn')}>
            <IconZoomIn size={16} />
          </button>
          <button type="button" className={toolBtn} onClick={fit} title={t('fit')} aria-label={t('fit')}>
            <IconMaximize size={16} />
          </button>
        </div>
        <button
          type="button"
          onClick={expandAll}
          disabled={!subTreeKeys.length}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition-colors"
        >
          <IconLayoutDistributeHorizontal size={14} />
          {allExpanded ? t('collapseAll') : t('expandAll')}
        </button>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-slate-500 dark:text-slate-400">
          {(['control', 'decorator', 'action', 'condition', 'subtree', 'unknown'] as const).map((c) => (
            <span key={c} className="inline-flex items-center gap-1">
              <span className={`w-2.5 h-2.5 rounded-sm ${CATEGORY_STYLE[c].header.split(' ')[0]}`} />
              {t(`category.${c}`)}
            </span>
          ))}
        </div>
        <span className="ml-auto text-[10px] text-slate-400">{t('hint')}</span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative h-[calc(100vh-18rem)] min-h-[480px] overflow-hidden cursor-grab active:cursor-grabbing select-none touch-none"
        style={{
          backgroundImage: 'radial-gradient(circle, rgb(148 163 184 / 0.25) 1px, transparent 1px)',
          backgroundSize: `${20 * view.k}px ${20 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
      >
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: layout.width, height: layout.height }}
        >
          <svg width={layout.width} height={layout.height} className="absolute inset-0 overflow-visible pointer-events-none">
            <defs>
              <marker id={arrowId} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="8" markerHeight="8" orient="auto">
                <path d="M 0 0 L 8 4 L 0 8 z" className="fill-slate-400 dark:fill-slate-500" />
              </marker>
            </defs>
            {/* Column bands, endless vertically so they fill the view while panning. */}
            {layout.columns.map((c) => (
              <rect
                key={c.depth}
                x={c.x - COL_GAP / 2}
                y={-100000}
                width={c.w + COL_GAP}
                height={200000}
                className={c.depth % 2 ? 'fill-slate-400/[0.07]' : 'fill-transparent'}
              />
            ))}
            {layout.edges.map((e) => (
              <path
                key={e.key}
                d={e.d}
                fill="none"
                strokeWidth={1.5}
                strokeDasharray={e.dashed ? '5 4' : undefined}
                markerEnd={`url(#${arrowId})`}
                className="stroke-slate-400 dark:stroke-slate-500"
              />
            ))}
          </svg>

          {layout.nodes.map((n) => {
            const style = CATEGORY_STYLE[n.category];
            const model = models.get(n.tag);
            const dim = q && (!n.source || !nodeMatches(n.source, q));
            const hit = q && n.source && nodeMatches(n.source, q);
            return (
              <div
                key={n.key}
                className={`absolute rounded-md border-2 ${style.border} bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-opacity ${
                  dim ? 'opacity-30' : ''
                } ${hit ? 'ring-2 ring-cyan-400 ring-offset-2 ring-offset-white dark:ring-offset-slate-950' : ''}`}
                style={{ left: n.x, top: n.y, width: n.w, height: n.h }}
              >
                <div
                  className={`flex items-center gap-1 px-2 text-[12px] font-semibold font-mono ${style.header}`}
                  style={{ height: HEADER_H - 2 }}
                  title={n.category === 'root' ? undefined : `${n.tag}${n.tree !== tree.id ? ` (${n.tree})` : ''}`}
                >
                  <span className="truncate flex-1">{n.subTreeId ?? n.tag}</span>
                  {n.source?.comment && (
                    <span title={n.source.comment} className="shrink-0 cursor-help opacity-80 hover:opacity-100">
                      <IconInfoCircle size={13} />
                    </span>
                  )}
                  {n.subTreeId && treeMap.has(n.subTreeId) && (
                    <>
                      {!n.recursive && (
                        <button
                          type="button"
                          onClick={() => toggle(n.key)}
                          title={n.expanded ? t('collapse') : t('expand')}
                          aria-label={n.expanded ? t('collapse') : t('expand')}
                          className="shrink-0 rounded bg-black/15 hover:bg-black/30 p-px"
                        >
                          {n.expanded ? <IconMinus size={12} /> : <IconPlus size={12} />}
                        </button>
                      )}
                      <a
                        href={`#tree-${n.subTreeId}`}
                        onClick={(e) => onOpenTree(e, n.subTreeId!)}
                        title={t('openTree')}
                        aria-label={t('openTree')}
                        className="shrink-0 rounded bg-black/15 hover:bg-black/30 p-px"
                      >
                        <IconArrowUpRight size={12} />
                      </a>
                    </>
                  )}
                </div>
                {n.rows.length > 0 && (
                  <div className="px-2 py-1 font-mono text-[11px] leading-[17px]">
                    {n.rows.map((r) => {
                      const port = model?.ports.find((p) => p.name === r.name);
                      return (
                        <div key={r.name} className="flex gap-2 whitespace-nowrap" title={[portTooltip(port), `${r.name} = ${r.value}`].filter(Boolean).join('\n\n')}>
                          <span className={`shrink-0 ${r.name.startsWith('_') ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}`}>
                            {r.name}
                          </span>
                          <span className={`truncate ml-auto ${valueClass(n.tag, r.name, r.value)}`}>
                            {r.value === '' ? '""' : truncate(r.value, MAX_VALUE_CHARS)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Level headers, pinned to the top and following the columns horizontally. */}
        <div
          className="absolute inset-x-0 top-0 border-b border-slate-200/60 dark:border-white/10 bg-white/85 dark:bg-slate-950/80 backdrop-blur-sm pointer-events-none overflow-hidden"
          style={{ height: COL_HEAD_H }}
        >
          {layout.columns.map((c) => (
            <div
              key={c.depth}
              className="absolute top-0 h-full flex items-center justify-center px-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 truncate"
              style={{ left: view.x + (c.x - COL_GAP / 2) * view.k, width: (c.w + COL_GAP) * view.k }}
            >
              {c.depth === 0 ? t('rootColumn') : t('level', { n: c.depth })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
