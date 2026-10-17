'use client';

import { useId, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { IconRotate360 } from '@tabler/icons-react';

// Visualises <scenery>_scene_entry_correction_* the way ev3d_vision applies it
// (AldmAristonAPipeline::apply_scene_entry_correction): in the plane-aligned frame (origin at
// the plane centroid, +X right, +Y up, +Z = panel normal toward the camera), the position moves
// by the local offset (x, y, z) and the orientation becomes R_plane * Rz(yaw) Ry(pitch) Rx(roll).
// The published approach direction is the corrected +Z axis.

export const CORRECTION_FIELDS = ['x_m', 'y_m', 'z_m', 'roll_deg', 'pitch_deg', 'yaw_deg'] as const;
export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export interface CorrectionValue {
  key: string;
  value: number;
  original: number;
}

interface SceneCorrectionViewProps {
  values: Partial<Record<CorrectionField, CorrectionValue>>;
  onChange: (key: string, value: number, original: number) => void;
}

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3]; // row-major

const DEG = Math.PI / 180;
// Drawing unit: the normal arrow is 10 cm long; offsets are drawn to the same scale.
const NORMAL_LEN = 0.1;
const PLANE_HALF = 0.12;
const VIEW_W = 420;
const VIEW_H = 300;
// Viewed from the left so the normal (toward -x on screen) and a typical corrected approach
// (positive pitch tilts it toward +X) separate instead of overlapping.
const DEFAULT_VIEW = { az: -40 * DEG, el: 22 * DEG };

const mul = (a: Mat3, b: Mat3): Mat3 =>
  a.map((row) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j])) as Mat3;
const col = (m: Mat3, j: number): Vec3 => [m[0][j], m[1][j], m[2][j]];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

function rotX(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [[1, 0, 0], [0, c, -s], [0, s, c]];
}
function rotY(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
}
function rotZ(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
}

function Arrow({
  from,
  to,
  className,
  width = 1.5,
  dashed,
  head = true,
  glow,
}: {
  from: [number, number];
  to: [number, number];
  className: string;
  width?: number;
  dashed?: boolean;
  // id of an SVG filter to apply (the neon glow).
  glow?: string;
  head?: boolean;
}) {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy);
  const ux = len ? dx / len : 0;
  const uy = len ? dy / len : 0;
  const h = 6 + width * 2;
  const wing = (sign: number): [number, number] => [
    to[0] - h * (ux * Math.cos(0.45) - sign * uy * Math.sin(0.45)),
    to[1] - h * (uy * Math.cos(0.45) + sign * ux * Math.sin(0.45)),
  ];
  const [l, r] = [wing(1), wing(-1)];
  return (
    <g className={className} filter={glow ? `url(#${glow})` : undefined}>
      <line
        x1={from[0]}
        y1={from[1]}
        x2={to[0]}
        y2={to[1]}
        stroke="currentColor"
        strokeWidth={width}
        strokeDasharray={dashed ? '4 3' : undefined}
        strokeLinecap="round"
      />
      {head && len > h && (
        <polygon points={`${to[0]},${to[1]} ${l[0]},${l[1]} ${r[0]},${r[1]}`} fill="currentColor" />
      )}
    </g>
  );
}

export function SceneCorrectionView({ values, onChange }: SceneCorrectionViewProps) {
  const t = useTranslations('leakDetection.configure.vision.params.sceneCorrection');
  const [view, setView] = useState(DEFAULT_VIEW);
  // Unique per instance so several views on a page don't share a filter id.
  const glowId = `neon-${useId().replace(/:/g, '')}`;
  const drag = useRef<{ x: number; y: number; az: number; el: number } | null>(null);

  const v = (f: CorrectionField) => values[f]?.value ?? 0;
  const offset: Vec3 = [v('x_m'), v('y_m'), v('z_m')];
  const R = mul(mul(rotZ(v('yaw_deg') * DEG), rotY(v('pitch_deg') * DEG)), rotX(v('roll_deg') * DEG));
  const [xc, yc, zc] = [col(R, 0), col(R, 1), col(R, 2)];
  const angle = Math.acos(Math.max(-1, Math.min(1, zc[2]))) / DEG;

  // Orthographic view: orbit about Y (azimuth) then tilt about X (elevation).
  const extent = Math.max(PLANE_HALF * 1.25, norm(offset) + NORMAL_LEN * 1.1);
  const px = (VIEW_H / 2 - 24) / extent;
  const O: Vec3 = [0, 0, 0];
  const P = offset;
  const project = (p: Vec3): [number, number] => {
    const ca = Math.cos(view.az), sa = Math.sin(view.az);
    const ce = Math.cos(view.el), se = Math.sin(view.el);
    const x1 = p[0] * ca + p[2] * sa;
    const z1 = -p[0] * sa + p[2] * ca;
    const y2 = p[1] * ce - z1 * se;
    return [VIEW_W / 2 + x1 * px, VIEW_H / 2 - y2 * px];
  };


  const corners: Vec3[] = [
    [-PLANE_HALF, -PLANE_HALF, 0],
    [PLANE_HALF, -PLANE_HALF, 0],
    [PLANE_HALF, PLANE_HALF, 0],
    [-PLANE_HALF, PLANE_HALF, 0],
  ];
  const grid = [-PLANE_HALF / 2, 0, PLANE_HALF / 2];
  // Ends just short of the corrected approach so its arrowhead isn't hidden under the cyan arrow.
  const arcPts = Array.from({ length: 17 }, (_, i) => {
    const s = (i / 16) * 0.9;
    const d: Vec3 = [zc[0] * s, zc[1] * s, 1 - s + zc[2] * s];
    return project(add(P, scale(d, (NORMAL_LEN * 0.6) / (norm(d) || 1))));
  });
  // Arrowhead at the arc's end (normal -> corrected approach), along its on-screen tangent.
  const arcHead = (() => {
    if (angle < 2) return null;
    const tip = arcPts[arcPts.length - 1];
    const back = arcPts[arcPts.length - 4];
    const dx = tip[0] - back[0];
    const dy = tip[1] - back[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return null;
    const [ux, uy] = [dx / len, dy / len];
    const h = 5.5;
    const wing = (sign: number) => [
      tip[0] - h * (ux * Math.cos(0.5) - sign * uy * Math.sin(0.5)),
      tip[1] - h * (uy * Math.cos(0.5) + sign * ux * Math.sin(0.5)),
    ];
    return [tip, wing(1), wing(-1)].map((p) => p.join(',')).join(' ');
  })();
  const hasOffset = norm(P) > 1e-9;
  const foot: Vec3 = [P[0], P[1], 0];

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, az: view.az, el: view.el };
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    setView({
      az: d.az + (e.clientX - d.x) * 0.01,
      el: Math.max(-85 * DEG, Math.min(85 * DEG, d.el + (e.clientY - d.y) * 0.01)),
    });
  };
  const endDrag = () => (drag.current = null);

  // Places the label just past the arrow tip (direction from `from` to `p` on screen), so it
  // never sits on the arrow itself.
  const label = (p: Vec3, text: string, className: string, from: Vec3 = O) => {
    const [x, y] = project(p);
    const [fx, fy] = project(from);
    const len = Math.hypot(x - fx, y - fy) || 1;
    const [ux, uy] = [(x - fx) / len, (y - fy) / len];
    return (
      <text
        x={x + ux * 10}
        y={y + uy * 10}
        textAnchor={ux > 0.3 ? 'start' : ux < -0.3 ? 'end' : 'middle'}
        dominantBaseline={uy > 0.3 ? 'hanging' : uy < -0.3 ? 'auto' : 'middle'}
        className={`${className} text-[9px] font-semibold`}
        fill="currentColor"
      >
        {text}
      </text>
    );
  };

  const field = (f: CorrectionField, step: number) => {
    const item = values[f];
    if (!item) return null;
    const edited = item.value !== item.original;
    return (
      <label key={f} className="flex flex-col gap-1">
        <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          {t(`fields.${f}`)}
        </span>
        <input
          type="number"
          step={step}
          value={item.value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (Number.isFinite(n)) onChange(item.key, n, item.original);
          }}
          className={`w-full px-2 py-1 rounded-md border text-xs font-mono tabular-nums outline-none focus:ring-1 focus:ring-cyan-500 text-slate-700 dark:text-slate-200 ${
            edited
              ? 'bg-amber-500/10 border-amber-500/50'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-white/10'
          }`}
        />
        {edited && (
          <button
            type="button"
            onClick={() => onChange(item.key, item.original, item.original)}
            className="self-start text-[10px] text-amber-700 dark:text-amber-400 hover:underline"
          >
            {t('was', { value: item.original })}
          </button>
        )}
      </label>
    );
  };

  return (
    <div className="mx-4 mb-4 rounded-lg border border-slate-200/60 dark:border-white/10 bg-slate-50/60 dark:bg-slate-950/40 overflow-hidden">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_15rem]">
        <div className="relative">
          <svg
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            role="img"
            aria-label={t('title')}
            className="w-full h-auto touch-none cursor-grab active:cursor-grabbing select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <defs>
              <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="1.6" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Panel plane */}
            <polygon
              points={corners.map((c) => project(c).join(',')).join(' ')}
              className="text-slate-400/20 dark:text-slate-500/20 stroke-slate-400 dark:stroke-slate-500"
              fill="currentColor"
              strokeWidth={1}
            />
            {grid.map((g) => (
              <g key={g} className="stroke-slate-400/40 dark:stroke-slate-500/40" strokeWidth={0.75}>
                <line
                  x1={project([g, -PLANE_HALF, 0])[0]}
                  y1={project([g, -PLANE_HALF, 0])[1]}
                  x2={project([g, PLANE_HALF, 0])[0]}
                  y2={project([g, PLANE_HALF, 0])[1]}
                />
                <line
                  x1={project([-PLANE_HALF, g, 0])[0]}
                  y1={project([-PLANE_HALF, g, 0])[1]}
                  x2={project([PLANE_HALF, g, 0])[0]}
                  y2={project([PLANE_HALF, g, 0])[1]}
                />
              </g>
            ))}
            {label([PLANE_HALF, PLANE_HALF, 0], t('plane'), 'text-slate-500 dark:text-slate-400')}

            {/* Plane frame at the centroid */}
            <Arrow from={project(O)} to={project([NORMAL_LEN, 0, 0])} className="text-red-500" width={1} />
            <Arrow
              from={project(O)}
              to={project([0, NORMAL_LEN, 0])}
              className="text-green-600 dark:text-green-500"
              width={1}
            />
            <Arrow from={project(O)} to={project([0, 0, NORMAL_LEN])} className="text-blue-500" width={1} />
            {label([NORMAL_LEN, 0, 0], 'X', 'text-red-500')}
            {label([0, NORMAL_LEN, 0], 'Y', 'text-green-600 dark:text-green-500')}
            {label([0, 0, NORMAL_LEN], t('normal'), 'text-blue-500')}
            <circle cx={project(O)[0]} cy={project(O)[1]} r={2.5} className="fill-slate-600 dark:fill-slate-300" />

            {/* Translation part of the correction */}
            {hasOffset && (
              <>
                <line
                  x1={project(foot)[0]}
                  y1={project(foot)[1]}
                  x2={project(P)[0]}
                  y2={project(P)[1]}
                  className="stroke-slate-400"
                  strokeDasharray="2 3"
                />
                <Arrow from={project(O)} to={project(P)} className="text-amber-500" dashed />
              </>
            )}

            {/* Rotation part: raw normal vs corrected approach (+Z after correction) at P */}
            {hasOffset && (
              <Arrow
                from={project(P)}
                to={project(add(P, [0, 0, NORMAL_LEN]))}
                className="text-blue-500/60"
                width={1}
                dashed
              />
            )}
            <polyline
              points={arcPts.map((p) => p.join(',')).join(' ')}
              fill="none"
              className="stroke-amber-500"
              strokeWidth={0.75}
            />
            {arcHead && <polygon points={arcHead} className="fill-amber-500" />}
            {/* Corrected frame: X/Y as long as the approach (Z) arrow, neon so they read as "after correction" */}
            <Arrow
              from={project(P)}
              to={project(add(P, scale(xc, NORMAL_LEN * 1.15)))}
              className="text-[#ff1f5a]"
              width={1.5}
              glow={glowId}
            />
            <Arrow
              from={project(P)}
              to={project(add(P, scale(yc, NORMAL_LEN * 1.15)))}
              className="text-[#12c80a] dark:text-[#39ff14]"
              width={1.5}
              glow={glowId}
            />
            <Arrow
              from={project(P)}
              to={project(add(P, scale(zc, NORMAL_LEN * 1.15)))}
              className="text-[#00b8d4] dark:text-[#00f0ff]"
              width={3}
              glow={glowId}
            />
            {label(add(P, scale(zc, NORMAL_LEN * 1.15)), t('corrected'), 'text-[#00b8d4] dark:text-[#00f0ff]', P)}
            <circle cx={project(P)[0]} cy={project(P)[1]} r={3.5} className="fill-amber-500 stroke-white dark:stroke-slate-900" strokeWidth={1} />
          </svg>

          <div className="absolute left-2 bottom-2 flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => setView(DEFAULT_VIEW)}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-white/10 hover:text-cyan-600"
            >
              <IconRotate360 size={12} />
              {t('resetView')}
            </button>
            <span>{t('dragHint')}</span>
          </div>
        </div>

        <div className="p-3 space-y-3 border-t md:border-t-0 md:border-l border-slate-200/60 dark:border-white/10">
          <div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('translation')}</div>
            <div className="grid grid-cols-3 gap-2">{(['x_m', 'y_m', 'z_m'] as const).map((f) => field(f, 0.001))}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-1.5">{t('rotation')}</div>
            <div className="grid grid-cols-3 gap-2">
              {(['roll_deg', 'pitch_deg', 'yaw_deg'] as const).map((f) => field(f, 1))}
            </div>
          </div>
          <dl className="text-[11px] space-y-1 pt-2 border-t border-slate-200/60 dark:border-white/10">
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">{t('angleFromNormal')}</dt>
              <dd className="font-mono tabular-nums text-amber-600 dark:text-amber-400">{angle.toFixed(1)}°</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">{t('approachDir')}</dt>
              <dd className="font-mono tabular-nums text-cyan-700 dark:text-cyan-300">
                [{zc.map((c) => c.toFixed(3)).join(', ')}]
              </dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-slate-500 dark:text-slate-400">{t('offsetLen')}</dt>
              <dd className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {(norm(P) * 1000).toFixed(1)} mm
              </dd>
            </div>
          </dl>
          <p className="text-[10px] leading-snug text-slate-400">{t('legend')}</p>
        </div>
      </div>
    </div>
  );
}
