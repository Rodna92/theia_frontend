'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import * as THREE from 'three';
import { EQUIPMENT_ID } from '../eeTypeTrajectory/catalog';
import { mm } from './geometry';
import { type Spindle, type SpindleModel, coincidentGroups } from './multiSpindle';
import { TIP_LEN, ViewerFrame, cylinderBetween, makeLabel, newToolModel, useViewerScene, zCylinder } from './viewerScene';

interface RoutineUse {
  index: number;
  enabled: boolean;
  spindle: string | null;
  // Spindles switched to mid-routine (`spindle` steps).
  spindleSwitches: string[];
}

// 3D view of the multi-spindle head in the tool0 frame: each spindle a rigid tip from its nose to
// its end point; the selected one highlighted with its tip frame (that tip is ee_link while it runs).
function SpindleViewer3D({ spindles, selected, offset, viewKey }: { spindles: Spindle[]; selected: string | null; offset: [number, number, number]; viewKey: string }) {
  const { mountRef, fitView, show } = useViewerScene();

  useEffect(() => {
    const model = newToolModel(offset);
    const body = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.5, roughness: 0.45 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x06b6d4, metalness: 0.4, roughness: 0.4 });
    const idle = new THREE.MeshBasicMaterial({ color: 0x94a3b8, transparent: true, opacity: 0.3, depthWrite: false });
    const reach = Math.max(...spindles.map((s) => Math.hypot(s.nose[0], s.nose[1])), 0.02);
    const plate = zCylinder(reach + 0.02, 0.012, body);
    plate.position.z = -0.012;
    model.add(plate);

    const labels = new Map<string, string[]>(); // spindles on the same spot share one label
    coincidentGroups(spindles).forEach((names) => names.forEach((n) => labels.set(n, names)));
    spindles.forEach((s) => {
      const active = s.name === selected;
      const z = new THREE.Vector3(...s.axes[2]);
      const tip = new THREE.Vector3(...s.tip);
      const coneBase = tip.clone().addScaledVector(z, -TIP_LEN);
      // Idle spindles thinner, so the active one shows on a shared spot.
      model.add(cylinderBetween(new THREE.Vector3(...s.nose), coneBase, active ? 0.009 : 0.006, active ? body : idle));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(active ? 0.009 : 0.006, TIP_LEN, 24), active ? accent : idle);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), z);
      cone.position.copy(tip).addScaledVector(z, -TIP_LEN / 2);
      model.add(cone);
      // One label per spot (its first spindle draws it), naming every spindle there.
      const group = labels.get(s.name) ?? [s.name];
      if (group[0] === s.name) {
        const label = makeLabel(group.join('·'), group.includes(selected ?? '') ? '#22d3ee' : '#94a3b8');
        label.position.copy(tip).add(new THREE.Vector3(0.014, 0, 0));
        model.add(label);
      }
      if (active) {
        // Tip frame of the active spindle: rotated by its rpy_deg.
        const axes = new THREE.AxesHelper(0.035);
        axes.matrixAutoUpdate = false;
        axes.matrix.makeBasis(new THREE.Vector3(...s.axes[0]), new THREE.Vector3(...s.axes[1]), z).setPosition(tip);
        model.add(axes);
      }
    });
    const depth = Math.max(...spindles.map((s) => s.tip[2]), offset[2], 0.05);
    return show(model, depth, viewKey);
  }, [spindles, selected, offset, show, viewKey]);

  return <ViewerFrame mountRef={mountRef} onFit={fitView} />;
}

export function SpindleSection({ id, model, offset }: { id: string; model: SpindleModel; offset: [number, number, number] }) {
  const t = useTranslations('leakDetection.configure.endEffectorManager');
  const { spindles } = model;
  const [selected, setSelected] = useState<string | null>(spindles[0]?.name ?? null);
  useEffect(() => {
    if (!spindles.some((s) => s.name === selected)) setSelected(spindles[0]?.name ?? null);
  }, [spindles, selected]);

  // Which targets of the routine file use each spindle (the routine file of this tool, Ariston A).
  const [uses, setUses] = useState<RoutineUse[] | null>(null);
  const [usesError, setUsesError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setUses(null);
    setUsesError(null);
    fetch(`/api/ee-routines?equipment=${EQUIPMENT_ID}&endEffector=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) setUsesError(data.error);
        setUses(
          (data.targets ?? []).map((tg: RoutineUse) => ({
            index: tg.index,
            enabled: tg.enabled !== false,
            spindle: tg.spindle ?? null,
            spindleSwitches: tg.spindleSwitches ?? [],
          }))
        );
      })
      .catch((e) => !cancelled && setUsesError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const coincident = useMemo(() => coincidentGroups(spindles), [spindles]);
  const names = spindles.map((s) => s.name);
  const problems = (uses ?? []).flatMap((u) =>
    u.spindle === null
      ? u.enabled
        ? [t('spindleMissing', { target: u.index })]
        : []
      : [u.spindle, ...u.spindleSwitches]
          .filter((sp) => !names.includes(sp))
          .map((sp) => t('spindleUnknown', { target: u.index, spindle: sp, known: names.join(', ') }))
  );
  const vec = (v: number[], f: (n: number) => number) => v.map(f).join(', ');

  return (
    <>
      {spindles.length > 0 ? (
        <SpindleViewer3D spindles={spindles} selected={selected} offset={offset} viewKey={id} />
      ) : (
        <p className="text-xs text-slate-500 dark:text-slate-400">{t('spindleNone')}</p>
      )}
      <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('spindleHint')}</p>

      {spindles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('spindles')}>
          {spindles.map((s) => (
            <button
              key={s.name}
              type="button"
              role="radio"
              aria-checked={s.name === selected}
              onClick={() => setSelected(s.name)}
              className={`px-2.5 py-1 rounded-md border text-xs font-bold ${
                s.name === selected
                  ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-700 dark:text-cyan-300'
                  : 'border-slate-200/70 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-cyan-500/10'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {spindles.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px] font-mono">
            <thead>
              <tr className="text-[10px] font-sans font-bold uppercase tracking-widest text-slate-400 text-left">
                <th className="py-1 pr-2">{t('spindle')}</th>
                <th className="py-1 pr-2">{t('spindleTip')}</th>
                <th className="py-1 pr-2">{t('spindleRpy')}</th>
                <th className="py-1 pr-2">{t('spindleLength')}</th>
                <th className="py-1 pr-2">{t('spindleNose')}</th>
                <th className="py-1">{t('spindleTargets')}</th>
              </tr>
            </thead>
            <tbody>
              {spindles.map((s) => {
                const used = (uses ?? []).filter((u) => u.spindle === s.name || u.spindleSwitches.includes(s.name));
                return (
                  <tr
                    key={s.name}
                    onClick={() => setSelected(s.name)}
                    className={`border-t border-slate-200/50 dark:border-white/5 cursor-pointer ${s.name === selected ? 'bg-cyan-500/10' : 'hover:bg-cyan-500/5'}`}
                  >
                    <td className="py-1 pr-2 font-bold text-slate-800 dark:text-slate-100">{s.name}</td>
                    <td className="py-1 pr-2 text-cyan-700 dark:text-cyan-300 whitespace-nowrap">[{vec(s.tip, mm)}]</td>
                    <td className="py-1 pr-2 text-cyan-700 dark:text-cyan-300 whitespace-nowrap">[{vec(s.rpyDeg, (d) => Math.round(d * 10) / 10)}]</td>
                    <td className="py-1 pr-2 text-cyan-700 dark:text-cyan-300">{mm(s.length)}</td>
                    <td className="py-1 pr-2 text-slate-500 dark:text-slate-400 whitespace-nowrap">[{vec(s.nose, mm)}]</td>
                    <td className="py-1 font-sans text-slate-600 dark:text-slate-300">
                      {uses === null
                        ? '…'
                        : used.length
                          ? used.map((u) => (
                              <span key={u.index} className={`mr-1.5 ${u.enabled ? '' : 'opacity-60 italic'}`}>
                                {u.index}
                                {u.spindle !== s.name && <span className="text-[10px] text-slate-400"> ({t('spindleSwitchedTo')})</span>}
                              </span>
                            ))
                          : <span className="text-slate-400 italic">{t('spindleUnused')}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-1 text-[10px] text-slate-400">{t('spindleUnits', { equipment: 'Ariston A' })}</p>
        </div>
      )}

      {coincident.length > 0 && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">
          {t('spindleCoincident', { names: coincident.map((g) => g.join(', ')).join(' / ') })}
        </p>
      )}
      {usesError && <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('spindleRoutineError', { error: usesError })}</p>}
      {problems.map((p) => (
        <p key={p} className="text-[11px] text-amber-700 dark:text-amber-300">
          {p}
        </p>
      ))}
    </>
  );
}
