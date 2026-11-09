'use client';

import { useTranslations } from 'next-intl';
import { type Geometry, mm, deg } from './geometry';

interface EeSchematicProps {
  geometry: Geometry;
  // Revolute joint angle [rad] (only used by jointed tools).
  jointAngle: number;
}

// Fixed scale so every tool is drawn at the same size and lengths compare across tabs.
const PX_PER_M = 1300;
const W = 460;
const CX = 210;
const FLANGE_Y = 92;
const AXIS_LEN = 34;

type P = { x: number; y: number };

// Tool frame (x right, z down) in metres -> SVG pixels.
const toSvg = (x: number, z: number): P => ({ x: CX + x * PX_PER_M, y: FLANGE_Y + z * PX_PER_M });

function Arrow({ from, dir, color, label }: { from: P; dir: P; color: string; label: string }) {
  const to = { x: from.x + dir.x * AXIS_LEN, y: from.y + dir.y * AXIS_LEN };
  const head = 6;
  const nx = -dir.y;
  const ny = dir.x;
  const pts = [
    `${to.x + dir.x * head},${to.y + dir.y * head}`,
    `${to.x + nx * head * 0.55},${to.y + ny * head * 0.55}`,
    `${to.x - nx * head * 0.55},${to.y - ny * head * 0.55}`,
  ].join(' ');
  return (
    <g className={color}>
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke="currentColor" strokeWidth={2} />
      <polygon points={pts} fill="currentColor" />
      <text
        x={to.x + dir.x * 16}
        y={to.y + dir.y * 16 + 4}
        textAnchor="middle"
        fill="currentColor"
        className="text-[11px] font-bold"
      >
        {label}
      </text>
    </g>
  );
}

// Frame axes drawn in the X-Z plane, rotated by `angle` about Y (positive swings Z towards +X).
function Frame({ at, angle, name, labelDx = 10 }: { at: P; angle: number; name: string; labelDx?: number }) {
  const z = { x: Math.sin(angle), y: Math.cos(angle) };
  const x = { x: Math.cos(angle), y: -Math.sin(angle) };
  return (
    <g>
      <Arrow from={at} dir={x} color="text-red-500" label="X" />
      <Arrow from={at} dir={z} color="text-blue-500" label="Z" />
      <circle cx={at.x} cy={at.y} r={4} className="fill-white stroke-slate-700 dark:fill-slate-900 dark:stroke-slate-200" strokeWidth={1.5} />
      <text x={at.x - labelDx} y={at.y - 8} textAnchor="end" className="fill-slate-600 dark:fill-slate-300 text-[11px] font-mono font-semibold">
        {name}
      </text>
    </g>
  );
}

// Vertical dimension line with end ticks and a centered, rotated label.
function DimV({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  if (Math.abs(y2 - y1) < 1) return null;
  const mid = (y1 + y2) / 2;
  return (
    <g className="text-slate-400 dark:text-slate-500">
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="currentColor" strokeWidth={1} />
      <line x1={x - 5} y1={y1} x2={x + 5} y2={y1} stroke="currentColor" strokeWidth={1} />
      <line x1={x - 5} y1={y2} x2={x + 5} y2={y2} stroke="currentColor" strokeWidth={1} />
      <text
        x={x - 7}
        y={mid}
        transform={`rotate(-90 ${x - 7} ${mid})`}
        textAnchor="middle"
        className="fill-slate-600 dark:fill-slate-300 text-[11px] font-mono tabular-nums"
      >
        {label}
      </text>
    </g>
  );
}

// Thin dashed extension line from a feature to its dimension line.
const Ext = ({ x1, x2, y }: { x1: number; x2: number; y: number }) => (
  <line x1={x1} y1={y} x2={x2} y2={y} strokeDasharray="2 3" strokeWidth={1} className="stroke-slate-300 dark:stroke-slate-600" />
);

// Conical tip pointing along `dir` with its apex at `apex`.
function Tip({ apex, dir }: { apex: P; dir: P }) {
  const len = 22;
  const half = 9;
  const base = { x: apex.x - dir.x * len, y: apex.y - dir.y * len };
  const n = { x: -dir.y, y: dir.x };
  const pts = `${apex.x},${apex.y} ${base.x + n.x * half},${base.y + n.y * half} ${base.x - n.x * half},${base.y - n.y * half}`;
  return <polygon points={pts} className="fill-cyan-500 stroke-cyan-700 dark:stroke-cyan-300" strokeWidth={1} strokeLinejoin="round" />;
}

// Side view (tool0 X-Z plane) of the tool: robot flange on top, tool pointing down along tool0 Z.
export function EeSchematic({ geometry: g, jointAngle }: EeSchematicProps) {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
  const [ox, oy, oz] = g.offset;
  const [roll, pitch, yaw] = g.rpy;
  const flange = toSvg(0, 0);

  let tip: P;
  let tipDir: P;
  let body: React.ReactNode;
  const dims: React.ReactNode[] = [];
  const extras: React.ReactNode[] = [];

  if (g.chain) {
    const { link1, link2 } = g.chain;
    const joint = toSvg(0, link1);
    tip = toSvg(link2 * Math.sin(jointAngle), link1 + link2 * Math.cos(jointAngle));
    tipDir = { x: Math.sin(jointAngle), y: Math.cos(jointAngle) };
    const r = link2 * PX_PER_M;
    // Joint travel: the operational limits when given, else ±90° for the sketch.
    const lo = g.joints[0]?.opMin ?? -Math.PI / 2;
    const hi = g.joints[0]?.opMax ?? Math.PI / 2;
    const a = { x: joint.x + r * Math.sin(lo), y: joint.y + r * Math.cos(lo) };
    const b = { x: joint.x + r * Math.sin(hi), y: joint.y + r * Math.cos(hi) };
    extras.push(
      <path
        key="sweep"
        d={`M ${a.x} ${a.y} A ${r} ${r} 0 ${hi - lo > Math.PI ? 1 : 0} 0 ${b.x} ${b.y}`}
        fill="none"
        strokeDasharray="4 4"
        strokeWidth={1.2}
        className="stroke-cyan-500/50"
      />,
      // Home pose (joint_home) as a ghost link.
      <line
        key="home"
        x1={joint.x}
        y1={joint.y}
        x2={joint.x + r * Math.sin(g.jointHome[0] ?? 0)}
        y2={joint.y + r * Math.cos(g.jointHome[0] ?? 0)}
        strokeWidth={8}
        strokeLinecap="round"
        className="stroke-slate-400/25"
      />
    );
    body = (
      <>
        <line x1={flange.x} y1={flange.y} x2={joint.x} y2={joint.y} strokeWidth={12} strokeLinecap="round" className="stroke-slate-500 dark:stroke-slate-400" />
        <line x1={joint.x} y1={joint.y} x2={tip.x} y2={tip.y} strokeWidth={9} strokeLinecap="round" className="stroke-slate-400 dark:stroke-slate-500" />
        <circle cx={joint.x} cy={joint.y} r={11} className="fill-cyan-500/20 stroke-cyan-600 dark:stroke-cyan-400" strokeWidth={2} />
        {/* Axis along Y = into the page. */}
        <circle cx={joint.x} cy={joint.y} r={3} className="fill-cyan-600 dark:fill-cyan-400" />
        <text x={joint.x + 16} y={joint.y + 4} className="fill-cyan-700 dark:fill-cyan-300 text-[11px] font-mono font-semibold">
          {g.jointNames[0] ?? 'joint'} · {deg(jointAngle)}°
        </text>
      </>
    );
    const dimX = 30;
    dims.push(
      <Ext key="e0" x1={flange.x - 40} x2={dimX - 6} y={flange.y} />,
      <Ext key="e1" x1={joint.x - 12} x2={dimX - 6} y={joint.y} />,
      <DimV key="d1" x={dimX} y1={flange.y} y2={joint.y} label={`link1 ${mm(link1)} mm`} />,
      <Ext key="e2" x1={CX - 12} x2={dimX - 6} y={toSvg(0, link1 + link2).y} />,
      <DimV key="d2" x={dimX} y1={joint.y} y2={toSvg(0, link1 + link2).y} label={`link2 ${mm(link2)} mm`} />
    );
  } else {
    // Rigid tool: straight from the flange to the tool tip at the configured offset.
    tip = toSvg(ox, oz);
    const len = Math.hypot(ox, oz) || 1;
    tipDir = { x: ox / len, y: oz / len };
    body = (
      <line x1={flange.x} y1={flange.y} x2={tip.x - tipDir.x * 18} y2={tip.y - tipDir.y * 18} strokeWidth={12} strokeLinecap="round" className="stroke-slate-500 dark:stroke-slate-400" />
    );
    for (let i = 0; i < g.jointNames.length; i++) {
      // Declared joints without a link model: marked evenly along the tool.
      const f = (i + 1) / (g.jointNames.length + 1);
      const p = { x: flange.x + (tip.x - flange.x) * f, y: flange.y + (tip.y - flange.y) * f };
      extras.push(<circle key={`j${i}`} cx={p.x} cy={p.y} r={9} className="fill-cyan-500/20 stroke-cyan-600 dark:stroke-cyan-400" strokeWidth={2} />);
    }
  }

  // Static offset (where ee_frame_node puts ee_link) — always dimensioned on the right.
  const staticTip = toSvg(ox, oz);
  const dimRight = CX + 200;
  dims.push(
    <Ext key="r0" x1={flange.x + 40} x2={dimRight + 6} y={flange.y} />,
    <Ext key="r1" x1={staticTip.x + 10} x2={dimRight + 6} y={staticTip.y} />,
    <DimV key="rz" x={dimRight} y1={flange.y} y2={staticTip.y} label={`offset_z ${mm(oz)} mm`} />
  );

  const bottom = Math.max(tip.y, staticTip.y, g.chain ? toSvg(0, g.chain.link1 + g.chain.link2).y : 0) + 70;
  const H = Math.max(bottom, 300);
  const scaleBar = 0.05 * PX_PER_M; // 50 mm

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto max-h-[560px]" role="img" aria-label={t('schematic')}>
      <defs>
        <pattern id="ee-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" strokeWidth="2" className="stroke-slate-300 dark:stroke-slate-700" />
        </pattern>
        <pattern id="ee-grid" width={0.01 * PX_PER_M} height={0.01 * PX_PER_M} patternUnits="userSpaceOnUse" x={CX} y={FLANGE_Y}>
          <path d={`M ${0.01 * PX_PER_M} 0 L 0 0 0 ${0.01 * PX_PER_M}`} fill="none" strokeWidth={0.5} className="stroke-slate-200 dark:stroke-slate-800" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#ee-grid)" />

      {/* Robot wrist + flange (tool0). */}
      <rect x={CX - 34} y={FLANGE_Y - 62} width={68} height={50} rx={6} fill="url(#ee-hatch)" className="stroke-slate-400 dark:stroke-slate-600" strokeWidth={1} />
      <text x={CX} y={FLANGE_Y - 68} textAnchor="middle" className="fill-slate-400 dark:fill-slate-500 text-[10px] uppercase tracking-widest font-semibold">
        {t('robotWrist')}
      </text>
      <rect x={CX - 48} y={FLANGE_Y - 12} width={96} height={12} rx={2} className="fill-slate-600 dark:fill-slate-500" />

      {extras}
      {body}
      <Tip apex={tip} dir={tipDir} />
      {dims}

      {/* Where ee_frame_node publishes ee_link when a jointed tool is moved away from home. */}
      {g.chain && (Math.abs(staticTip.x - tip.x) > 2 || Math.abs(staticTip.y - tip.y) > 2) && (
        <circle cx={staticTip.x} cy={staticTip.y} r={6} fill="none" strokeDasharray="2 2" strokeWidth={1.5} className="stroke-slate-500" />
      )}

      {/* Label left of the flange plate so it doesn't sit on it. */}
      <Frame at={flange} angle={0} name="tool0" labelDx={54} />
      <Frame at={tip} angle={(g.chain ? jointAngle : 0) + pitch} name="ee_link" />

      {/* Scale bar */}
      <g className="text-slate-500 dark:text-slate-400">
        <line x1={16} y1={H - 18} x2={16 + scaleBar} y2={H - 18} stroke="currentColor" strokeWidth={2} />
        <line x1={16} y1={H - 23} x2={16} y2={H - 13} stroke="currentColor" strokeWidth={1.5} />
        <line x1={16 + scaleBar} y1={H - 23} x2={16 + scaleBar} y2={H - 13} stroke="currentColor" strokeWidth={1.5} />
        <text x={16 + scaleBar / 2} y={H - 26} textAnchor="middle" fill="currentColor" className="text-[10px] font-mono">
          50 mm
        </text>
      </g>
      <text x={W - 12} y={H - 14} textAnchor="end" className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono">
        {t('sideView')}
        {Math.abs(oy) > 1e-6 ? ` · y ${mm(oy)} mm` : ''}
        {Math.abs(roll) > 1e-6 || Math.abs(yaw) > 1e-6 ? ` · r ${deg(roll)}° y ${deg(yaw)}°` : ''}
      </text>
    </svg>
  );
}
