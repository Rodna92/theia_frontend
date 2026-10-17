'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconAlertTriangle, IconHammer, IconLoader2, IconMaximize, IconStack2 } from '@tabler/icons-react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { fetchPly, type LoadedPly } from './plyCloud';

// Visualises <scenery>_target_group_anchor / _target_offset_* / _group_extra_member_* the way
// AldmAristonAPipeline::build_ariston_a_target_groups() reads them: every group is drawn in its
// anchor's frame, the anchor's Tappo_N.ply untransformed and each member's cloud placed at
// anchor_T_member = Translate(x,y,z) * Rz(yaw) Ry(pitch) Rx(roll) (tf2 setRPY). The baked
// merged reference cloud (<scenery>_group_reference_clouds[anchor-1]) can be overlaid to check
// it still matches the yaml offsets (tools/build_group_reference_cloud.py must be re-run after
// any change to them).

type Role = 'anchor' | 'member' | 'extra';

interface Offset {
  x: number;
  y: number;
  z: number;
  roll: number;
  pitch: number;
  yaw: number;
}

interface GroupMember {
  target: number;
  role: Role;
  offset: Offset;
  cloud?: string;
}

interface TargetGroup {
  anchor: number;
  members: GroupMember[];
  merged?: string;
}

interface GroupGeometryViewProps {
  yamlPath: string;
  // Current (edited or file) value of every parameter of the node.
  values: Record<string, unknown>;
  // The section has in-memory edits; the build script only reads the file on disk.
  unsaved?: boolean;
  prefix?: string;
}

const COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#34d399', '#fbbf24', '#f87171', '#60a5fa'];
const colorOf = (target: number) => COLORS[(target - 1 + COLORS.length) % COLORS.length];
const DEG = Math.PI / 180;
const POINT_SIZE = 0.0008;
const ZERO: Offset = { x: 0, y: 0, z: 0, roll: 0, pitch: 0, yaw: 0 };

const nums = (v: unknown): number[] => (Array.isArray(v) ? v.map((n) => (typeof n === 'number' ? n : 0)) : []);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((s) => (typeof s === 'string' ? s : '')) : []);

function parseGroups(values: Record<string, unknown>, prefix: string) {
  const get = (k: string) => values[`${prefix}${k}`];
  const anchors = nums(get('target_group_anchor'));
  const refClouds = strs(get('reference_clouds'));
  const mergedClouds = strs(get('group_reference_clouds'));
  const off = (k: string) => nums(get(`target_offset_${k}`));
  const [ox, oy, oz, or, op, ow] = [off('x_m'), off('y_m'), off('z_m'), off('roll_deg'), off('pitch_deg'), off('yaw_deg')];
  const ex = (k: string) => nums(get(`group_extra_member_${k}`));
  const extraAnchor = ex('anchor');
  const extraTarget = ex('target');
  const [ex_, ey, ez, er, ep, ew] = [
    ex('offset_x_m'), ex('offset_y_m'), ex('offset_z_m'), ex('offset_roll_deg'), ex('offset_pitch_deg'), ex('offset_yaw_deg'),
  ];
  const cloudOf = (t: number) => refClouds[t - 1] || undefined;

  const groups: TargetGroup[] = [];
  anchors.forEach((a, i) => {
    if (a !== i + 1) return;
    const members: GroupMember[] = [{ target: a, role: 'anchor', offset: ZERO, cloud: cloudOf(a) }];
    anchors.forEach((b, j) => {
      if (b !== a || j === i) return;
      members.push({
        target: j + 1,
        role: 'member',
        offset: { x: ox[j] ?? 0, y: oy[j] ?? 0, z: oz[j] ?? 0, roll: or[j] ?? 0, pitch: op[j] ?? 0, yaw: ow[j] ?? 0 },
        cloud: cloudOf(j + 1),
      });
    });
    extraAnchor.forEach((ea, k) => {
      if (ea !== a) return;
      members.push({
        target: extraTarget[k],
        role: 'extra',
        offset: { x: ex_[k] ?? 0, y: ey[k] ?? 0, z: ez[k] ?? 0, roll: er[k] ?? 0, pitch: ep[k] ?? 0, yaw: ew[k] ?? 0 },
        cloud: cloudOf(extraTarget[k]),
      });
    });
    groups.push({ anchor: a, members, merged: mergedClouds[i] || undefined });
  });

  const standalone = anchors.flatMap((a, i) => (a === 0 ? [i + 1] : []));
  // Members pointing at a target that is not itself an anchor: the pipeline rejects these.
  const orphans = anchors.flatMap((a, i) => (a !== 0 && a !== i + 1 && anchors[a - 1] !== a ? [i + 1] : []));
  return { groups, standalone, orphans, enabled: anchors.length > 0 };
}

function offsetMatrix(o: Offset) {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.roll * DEG, o.pitch * DEG, o.yaw * DEG, 'ZYX'));
  return new THREE.Matrix4().compose(new THREE.Vector3(o.x, o.y, o.z), q, new THREE.Vector3(1, 1, 1));
}

interface SceneCtx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  root: THREE.Group;
}

// Removes and frees everything under root except the cached cloud geometries.
function clearRoot(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o instanceof CSS2DObject) o.element.remove();
    if (o instanceof THREE.Points || o instanceof THREE.Line) {
      (o.material as THREE.Material).dispose();
      if (o instanceof THREE.Line) o.geometry.dispose();
    }
    if (o instanceof THREE.AxesHelper) o.dispose();
  });
  root.clear();
}

export function GroupGeometryView({ yamlPath, values, unsaved, prefix = 'ariston_a_' }: GroupGeometryViewProps) {
  const t = useTranslations('leakDetection.configure.vision.params.groupView');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const ctxRef = useRef<SceneCtx | null>(null);
  const mergedRef = useRef<THREE.Points | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const cacheRef = useRef(new Map<string, Promise<LoadedPly>>());
  const [selected, setSelected] = useState<number | null>(null);
  const [showMerged, setShowMerged] = useState(false);
  const showMergedRef = useRef(showMerged);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [building, setBuilding] = useState(false);
  const [build, setBuild] = useState<{ ok: boolean; output: string } | null>(null);
  // Bumped after a build so the rebuilt merged clouds are fetched again.
  const [revision, setRevision] = useState(0);

  const parsed = useMemo(() => parseGroups(values, prefix), [values, prefix]);
  const group = parsed.groups.find((g) => g.anchor === selected) ?? parsed.groups[0];
  // Stable key so the scene only rebuilds when the drawn group's values actually change.
  const groupKey = group ? JSON.stringify(group) : '';

  useEffect(() => {
    showMergedRef.current = showMerged;
    if (mergedRef.current) mergedRef.current.visible = showMerged;
  }, [showMerged]);

  // Runs tools/build_group_reference_cloud.py --preset ariston_a on the server, then reloads
  // the merged clouds and shows the overlay so the result can be checked against the members.
  const buildMerged = async () => {
    setBuilding(true);
    setBuild(null);
    try {
      const res = await fetch('/api/vision-params/build-group-clouds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ yaml: yamlPath }),
      });
      const json = (await res.json()) as { ok: boolean; output: string };
      setBuild(json);
      if (json.ok) {
        const cache = cacheRef.current;
        for (const g of parsed.groups) {
          if (!g.merged) continue;
          cache.get(g.merged)?.then((c) => c.geometry.dispose()).catch(() => {});
          cache.delete(g.merged);
        }
        setShowMerged(true);
        setRevision((r) => r + 1);
      }
    } catch (e) {
      setBuild({ ok: false, output: e instanceof Error ? e.message : String(e) });
    } finally {
      setBuilding(false);
    }
  };

  // Cached clouds belong to one yaml; drop them when another file is loaded.
  useEffect(() => {
    const cache = cacheRef.current;
    return () => {
      cache.forEach((p) => p.then((c) => c.geometry.dispose()).catch(() => {}));
      cache.clear();
    };
  }, [yamlPath]);

  // Scene lifecycle — created once per mounted container.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !group) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const labels = new CSS2DRenderer();
    labels.setSize(container.clientWidth, container.clientHeight);
    Object.assign(labels.domElement.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.appendChild(labels.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020617);
    const camera = new THREE.PerspectiveCamera(50, container.clientWidth / container.clientHeight, 0.0005, 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    const root = new THREE.Group();
    scene.add(root);
    ctxRef.current = { scene, camera, controls, root };

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
      labels.render(scene, camera);
    };
    animate();

    const resizeObserver = new ResizeObserver(() => {
      const { clientWidth: w, clientHeight: h } = container;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      labels.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      clearRoot(root);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
      ctxRef.current = null;
    };
    // Only (un)mounts with the canvas, which exists whenever there is a group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!group]);

  // Rebuild the drawn group whenever it or its values change.
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !group) return;
    let cancelled = false;
    const { root, camera, controls } = ctx;
    clearRoot(root);
    mergedRef.current = null;

    const load = (cloud: string) => {
      const cache = cacheRef.current;
      if (!cache.has(cloud)) {
        const p = fetchPly(cloud, yamlPath);
        p.catch(() => cache.delete(cloud));
        cache.set(cloud, p);
      }
      return cache.get(cloud)!;
    };

    fitRef.current = () => {
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      if (box.isEmpty()) return;
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(...box.getSize(new THREE.Vector3()).toArray(), 0.01);
      const distance = maxDim * 0.9;
      camera.near = maxDim / 200;
      camera.far = maxDim * 200;
      camera.position.set(center.x + distance, center.y + distance * 0.6, center.z + distance);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
    };

    const label = (text: string, color: string, dashed: boolean) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.className = 'px-1 rounded font-mono text-[10px] font-bold leading-4';
      Object.assign(el.style, {
        color,
        background: 'rgba(2,6,23,0.75)',
        border: `1px ${dashed ? 'dashed' : 'solid'} ${color}`,
      });
      return new CSS2DObject(el);
    };

    setLoading(true);
    setErrors([]);
    (async () => {
      const problems: string[] = [];
      await Promise.all(
        group.members.map(async (m) => {
          const color = colorOf(m.target);
          const frameObj = new THREE.Group();
          frameObj.matrixAutoUpdate = false;
          frameObj.matrix.copy(offsetMatrix(m.offset));
          frameObj.add(new THREE.AxesHelper(m.role === 'anchor' ? 0.012 : 0.007));
          let labelAt = new THREE.Vector3(0, 0, 0);
          if (m.cloud) {
            try {
              const { geometry } = await load(m.cloud);
              if (cancelled) return;
              frameObj.add(
                new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: POINT_SIZE, sizeAttenuation: true }))
              );
              const box = geometry.boundingBox!;
              labelAt = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
            } catch (e) {
              problems.push(`T${m.target}: ${e instanceof Error ? e.message : String(e)}`);
            }
          } else {
            problems.push(t('noCloud', { target: m.target }));
          }
          if (cancelled) return;
          const tag = label(`T${m.target}`, color, m.role === 'extra');
          tag.position.copy(labelAt);
          tag.center.set(0.5, 1.2);
          frameObj.add(tag);
          root.add(frameObj);

          // Link from the anchor's origin to the member's origin (dashed for extra memberships).
          if (m.role !== 'anchor') {
            const geom = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(0, 0, 0),
              new THREE.Vector3(m.offset.x, m.offset.y, m.offset.z),
            ]);
            const line = new THREE.Line(
              geom,
              m.role === 'extra'
                ? new THREE.LineDashedMaterial({ color, dashSize: 0.003, gapSize: 0.002 })
                : new THREE.LineBasicMaterial({ color })
            );
            line.computeLineDistances();
            root.add(line);
          }
        })
      );

      if (group.merged && !cancelled) {
        try {
          const { geometry } = await load(group.merged);
          if (!cancelled) {
            const merged = new THREE.Points(
              geometry,
              new THREE.PointsMaterial({
                color: 0xffffff,
                size: POINT_SIZE * 1.6,
                sizeAttenuation: true,
                transparent: true,
                opacity: 0.35,
                depthWrite: false,
              })
            );
            merged.visible = showMergedRef.current;
            mergedRef.current = merged;
            root.add(merged);
          }
        } catch (e) {
          problems.push(`${group.merged}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (cancelled) return;
      fitRef.current();
      setErrors(problems);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
    // groupKey captures every value of `group` that is drawn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupKey, yamlPath, revision]);

  const mm = (v: number) => `${v >= 0 ? '+' : ''}${(v * 1000).toFixed(1)}`;
  const deg = (o: Offset) => [o.roll, o.pitch, o.yaw].map((v) => v.toFixed(1)).join(' / ');

  return (
    <div className="px-4 pb-4">
      <div className="rounded-lg border border-slate-200/60 dark:border-white/10 overflow-hidden">
        <div className="px-3 py-2 bg-slate-50/80 dark:bg-slate-800/40 border-b border-slate-200/60 dark:border-white/10">
          <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t('title')}</div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t('description')}</p>
        </div>

        {!parsed.enabled || parsed.groups.length === 0 ? (
          <p className="px-3 py-4 text-xs text-slate-500 dark:text-slate-400">{t('disabled')}</p>
        ) : (
          <>
            {/* Association overview: one card per group, doubles as the selector for the 3D view. */}
            <div className="flex flex-wrap gap-2 p-3">
              {parsed.groups.map((g) => {
                const isActive = g.anchor === group?.anchor;
                return (
                  <button
                    key={g.anchor}
                    onClick={() => setSelected(g.anchor)}
                    aria-pressed={isActive}
                    className={`flex flex-col items-start gap-1.5 px-3 py-2 rounded-lg border text-left transition-colors ${
                      isActive
                        ? 'border-cyan-500/60 bg-cyan-500/10'
                        : 'border-slate-200/70 dark:border-white/10 hover:bg-cyan-500/5'
                    }`}
                  >
                    <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                      {t('group', { anchor: g.anchor })}
                    </span>
                    <span className="flex items-center gap-1">
                      {g.members.map((m, k) => (
                        <span key={`${m.role}-${m.target}`} className="flex items-center gap-1">
                          {k === 1 && <span className="text-slate-400 text-[10px]">←</span>}
                          <span
                            title={t(`role.${m.role}`)}
                            className={`inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded font-mono text-[10px] font-bold ${
                              m.role === 'anchor' ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-slate-900' : ''
                            }`}
                            style={{
                              color: colorOf(m.target),
                              border: `1px ${m.role === 'extra' ? 'dashed' : 'solid'} ${colorOf(m.target)}`,
                              ...(m.role === 'anchor' ? { ['--tw-ring-color' as string]: colorOf(m.target) } : {}),
                            }}
                          >
                            T{m.target}
                          </span>
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
              {parsed.standalone.length > 0 && (
                <div className="flex flex-col items-start gap-1.5 px-3 py-2 rounded-lg border border-dashed border-slate-200/70 dark:border-white/10">
                  <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('standalone')}</span>
                  <span className="flex gap-1">
                    {parsed.standalone.map((s) => (
                      <span
                        key={s}
                        className="inline-flex items-center justify-center min-w-[1.5rem] h-5 px-1 rounded font-mono text-[10px] font-bold text-slate-400 border border-slate-300 dark:border-slate-600"
                      >
                        T{s}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>

            {parsed.orphans.length > 0 && (
              <p className="mx-3 mb-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-red-500/10 text-[11px] text-red-700 dark:text-red-300">
                <IconAlertTriangle size={14} className="shrink-0" />
                {t('orphans', { targets: parsed.orphans.map((o) => `T${o}`).join(', ') })}
              </p>
            )}

            <div className="relative h-[24rem] bg-slate-950">
              <div ref={containerRef} className="absolute inset-0" />
              <div className="absolute top-3 right-3 flex gap-2">
                {group?.merged && (
                  <button
                    onClick={() => setShowMerged((v) => !v)}
                    aria-pressed={showMerged}
                    title={t('showMerged')}
                    aria-label={t('showMerged')}
                    className={`p-1.5 rounded-lg backdrop-blur border transition-colors ${
                      showMerged
                        ? 'bg-white/30 hover:bg-white/40 border-white/40 text-white'
                        : 'bg-white/10 hover:bg-white/20 border-white/10 text-white'
                    }`}
                  >
                    <IconStack2 size={16} />
                  </button>
                )}
                <button
                  onClick={() => fitRef.current()}
                  title={t('fitView')}
                  aria-label={t('fitView')}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur border border-white/10 text-white transition-colors"
                >
                  <IconMaximize size={16} />
                </button>
              </div>
              <button
                onClick={buildMerged}
                disabled={building}
                title={t('buildHint')}
                className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg backdrop-blur border bg-cyan-500/20 hover:bg-cyan-500/30 border-cyan-400/40 text-cyan-100 text-xs font-semibold transition-colors disabled:opacity-50"
              >
                {building ? <IconLoader2 size={14} className="animate-spin" /> : <IconHammer size={14} />}
                {building ? t('building') : t('build')}
              </button>
              {loading && (
                <div className="absolute top-3 left-3 flex items-center gap-2 text-[11px] text-slate-400 pointer-events-none">
                  <IconLoader2 size={14} className="animate-spin" />
                  {t('loading')}
                </div>
              )}
              {showMerged && group?.merged && (
                <div className="absolute bottom-3 right-3 max-w-xs text-right text-[10px] text-slate-400 pointer-events-none">
                  {t('mergedHint', { file: group.merged.split(/[\\/]/).pop() ?? '' })}
                </div>
              )}
            </div>

            {unsaved && parsed.groups.length > 0 && (
              <p className="mx-3 my-3 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-amber-500/10 text-[11px] text-amber-800 dark:text-amber-300">
                <IconAlertTriangle size={14} className="shrink-0" />
                {t('buildUnsaved')}
              </p>
            )}

            {build && (
              <div
                className={`mx-3 my-3 rounded-md border text-[11px] ${
                  build.ok
                    ? 'border-green-500/30 bg-green-500/10 text-green-800 dark:text-green-300'
                    : 'border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                  <span className="font-semibold">{build.ok ? t('buildOk') : t('buildFailed')}</span>
                  <button onClick={() => setBuild(null)} className="hover:underline">
                    {t('dismiss')}
                  </button>
                </div>
                {build.output && (
                  <pre className="max-h-48 overflow-auto px-2.5 pb-2 font-mono text-[10px] whitespace-pre-wrap break-all opacity-80">
                    {build.output}
                  </pre>
                )}
              </div>
            )}

            {errors.length > 0 && (
              <div className="px-3 py-2 border-t border-slate-200/60 dark:border-white/10 space-y-0.5">
                {errors.map((e) => (
                  <p key={e} className="text-[11px] text-red-600 dark:text-red-400 break-all">
                    {e}
                  </p>
                ))}
              </div>
            )}

            {group && (
              <table className="w-full text-[11px] border-t border-slate-200/60 dark:border-white/10">
                <thead className="text-[10px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="px-3 py-1.5 text-left font-semibold">{t('target')}</th>
                    <th className="px-3 py-1.5 text-left font-semibold">{t('roleLabel')}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{t('offset')}</th>
                    <th className="px-3 py-1.5 text-right font-semibold">{t('rotation')}</th>
                  </tr>
                </thead>
                <tbody className="font-mono text-slate-600 dark:text-slate-300">
                  {group.members.map((m) => (
                    <tr key={`${m.role}-${m.target}`} className="border-t border-slate-200/50 dark:border-white/5">
                      <td className="px-3 py-1">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorOf(m.target) }} />T
                          {m.target}
                        </span>
                      </td>
                      <td className="px-3 py-1 font-sans">{t(`role.${m.role}`)}</td>
                      <td className="px-3 py-1 text-right tabular-nums">
                        {m.role === 'anchor' ? '—' : `${mm(m.offset.x)}, ${mm(m.offset.y)}, ${mm(m.offset.z)}`}
                      </td>
                      <td className="px-3 py-1 text-right tabular-nums">{m.role === 'anchor' ? '—' : deg(m.offset)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}
