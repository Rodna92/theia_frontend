'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconRotate } from '@tabler/icons-react';
import { deg, mm } from './geometry';
import { SpmViewer3D } from './SpmViewer3D';
import { type SpmModel, solveIk, tiltTorsion, tipInTool0 } from './spherical3rrr';

const RAD = Math.PI / 180;
const HOME = { tilt: 0, azimuth: 0, torsion: 0 };
// Platform orientation from home [deg], the solver's tilt-and-torsion parameters.
const SLIDERS: { key: keyof typeof HOME; min: number; max: number }[] = [
  { key: 'tilt', min: 0, max: 90 },
  { key: 'azimuth', min: 0, max: 360 },
  { key: 'torsion', min: -90, max: 90 },
];

// 3D view of the spherical parallel wrist. The platform orientation is the input; the three
// motor angles and servo counts are what the solver's IK gives for it.
export function SpmSection({ id, model, jointNames }: { id: string; model: SpmModel; jointNames: string[] }) {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
  const [pose, setPose] = useState(HOME);
  const R = useMemo(() => tiltTorsion(model, pose.azimuth * RAD, pose.tilt * RAD, pose.torsion * RAD), [model, pose]);
  const sol = useMemo(() => solveIk(model, R), [model, R]);
  const ok = sol.status === 'valid';
  const tip = tipInTool0(model, R);

  return (
    <>
      <SpmViewer3D model={model} R={R} q={sol.q} ok={ok} jointNames={jointNames} viewKey={id} />
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('spmHint')}</p>

      {SLIDERS.map(({ key, min, max }) => (
        <div key={key} className="flex items-center gap-3">
          <label htmlFor={`ee-spm-${id}-${key}`} className="w-24 truncate text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
            {t(`spmPose.${key}`)}
          </label>
          <input
            id={`ee-spm-${id}-${key}`}
            type="range"
            min={min}
            max={max}
            step={1}
            value={pose[key]}
            onChange={(e) => setPose((p) => ({ ...p, [key]: Number(e.target.value) }))}
            className="flex-1 accent-cyan-500"
          />
          <span className="w-14 text-right text-xs font-mono tabular-nums text-cyan-700 dark:text-cyan-300">{pose[key]}°</span>
          <button
            type="button"
            onClick={() => setPose((p) => ({ ...p, [key]: 0 }))}
            title={t('spmHome')}
            aria-label={t('spmHome')}
            className="p-1 rounded-md text-slate-500 hover:text-cyan-600 hover:bg-cyan-500/10"
          >
            <IconRotate size={16} />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
        <span
          className={`px-1.5 py-0.5 rounded font-bold uppercase text-[10px] ${
            ok ? 'bg-green-500/15 text-green-700 dark:text-green-400' : 'bg-red-500/15 text-red-700 dark:text-red-300'
          }`}
        >
          {t(`spmStatus.${sol.status}`)}
          {sol.failedLeg >= 0 && ` · ${jointNames[sol.failedLeg] ?? sol.failedLeg + 1}`}
        </span>
        <span>
          {t('spmTip')} <span className="font-mono text-slate-700 dark:text-slate-200">[{tip.map(mm).join(', ')}] mm</span>
        </span>
        {sol.parallelSide !== 0 && (
          <span>
            {t('spmParallelIndex')} <span className="font-mono text-slate-700 dark:text-slate-200">{sol.parallelIndex.toFixed(2)}</span>
          </span>
        )}
      </div>

      <table className="w-full text-xs font-mono">
        <thead>
          <tr className="text-[10px] font-sans font-bold uppercase tracking-widest text-slate-400 text-left">
            <th className="py-1 pr-2 font-bold">{t('spmMotor')}</th>
            <th className="py-1 px-2 font-bold text-right">{t('spmAngle')}</th>
            {model.servo && <th className="py-1 px-2 font-bold text-right">{t('spmCounts')}</th>}
            {model.minAct && model.maxAct && <th className="py-1 pl-2 font-bold w-[35%]">{t('spmTravel')}</th>}
          </tr>
        </thead>
        <tbody>
          {model.legs.map((_, i) => {
            const solved = Number.isFinite(sol.qAct[i]);
            const failed = sol.failedLeg === i;
            const lo = model.minAct?.[i];
            const hi = model.maxAct?.[i];
            const at = (a: number) => `${Math.max(0, Math.min(1, (a - lo!) / (hi! - lo!))) * 100}%`;
            return (
              <tr key={i} className={`border-t border-slate-200/50 dark:border-white/5 ${failed ? 'text-red-700 dark:text-red-300' : 'text-slate-700 dark:text-slate-200'}`}>
                <td className="py-1.5 pr-2 truncate">{jointNames[i] ?? i + 1}</td>
                <td className="py-1.5 px-2 text-right tabular-nums">{solved ? `${deg(sol.qAct[i])}°` : '—'}</td>
                {model.servo && <td className="py-1.5 px-2 text-right tabular-nums">{sol.counts ? Math.round(sol.counts[i]) : '—'}</td>}
                {lo !== undefined && hi !== undefined && (
                  <td className="py-1.5 pl-2" title={`${deg(lo)}° … ${deg(hi)}°`}>
                    <div className="relative h-1.5 rounded-full bg-slate-300/60 dark:bg-slate-700/60">
                      {/* Home (actuator angle 0) and the current angle inside the permitted travel. */}
                      <span className="absolute top-[-2px] h-2.5 w-px bg-slate-500" style={{ left: at(0) }} />
                      {solved && (
                        <span
                          className={`absolute top-[-3px] h-3 w-1.5 -ml-[3px] rounded-sm ${failed ? 'bg-red-500' : 'bg-cyan-500'}`}
                          style={{ left: at(sol.qAct[i]) }}
                        />
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {model.unverified.length > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">{t('spmUnverified', { items: model.unverified.join(', ') })}</p>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('spmSchematicNote')}</p>
    </>
  );
}
