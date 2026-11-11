'use client';

import { useTranslations } from 'next-intl';
import { SystemCheckStatus } from '@/client/types/leakDetection';
import type { WorkcellSnapshot } from '@/client/types/workcell';

// ROS nodes behind each subsystem card. A group with alternatives is satisfied by any of them
// (the machine driver differs between ALDM and ARCM deployments).
const SUBSYSTEM_NODES: Record<string, string[][]> = {
  vision: [['vision_node']],
  robot: [['controller_manager'], ['insert_control_node'], ['bt_task_manager']],
  endeffector: [['ee_frame_node']],
  leakEquipment: [['srde_driver', 'ft_machine_driver']],
};

export const SUBSYSTEM_IDS = Object.keys(SUBSYSTEM_NODES);

function nodeHealth(id: string, nodes: string[] | null): SystemCheckStatus {
  if (!nodes) return SystemCheckStatus.OFF;
  const groups = SUBSYSTEM_NODES[id];
  const up = groups.filter((alternatives) => alternatives.some((n) => nodes.includes(n))).length;
  if (up === groups.length) return SystemCheckStatus.OK;
  return up === 0 ? SystemCheckStatus.NOT_OK : SystemCheckStatus.WARN;
}

const STATUS_TEXT: Record<SystemCheckStatus, string> = {
  [SystemCheckStatus.OK]: 'text-emerald-600 dark:text-emerald-400',
  [SystemCheckStatus.WARN]: 'text-amber-600 dark:text-amber-400',
  [SystemCheckStatus.NOT_OK]: 'text-rose-600 dark:text-rose-400',
  [SystemCheckStatus.OFF]: 'text-slate-500 dark:text-slate-400',
};

const STATE_STYLE: Record<string, string> = {
  IDLE: 'border-green-200 bg-green-50/60 text-green-700 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-400',
  BUSY: 'border-sky-200 bg-sky-50/60 text-sky-700 dark:border-sky-900/50 dark:bg-sky-950/20 dark:text-sky-300',
  STOPPED: 'border-red-200 bg-red-50/60 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400',
  TEST: 'border-yellow-200 bg-yellow-50/60 text-yellow-700 dark:border-yellow-900/50 dark:bg-yellow-950/20 dark:text-yellow-400',
  UNKNOWN: 'border-slate-200 bg-slate-50/60 text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-400',
};

export function SystemStatePanel({ snapshot }: { snapshot: WorkcellSnapshot }) {
  const t = useTranslations('leakDetection.monitor');
  const { bridge, systemState, cycle, phase, vision, visionCommand, btState, lastEvent, srde, nodes } = snapshot;

  // Per card: [state, command]. Vision: its current mode / the goal the orchestrator holds on
  // it. Robot: what the behavior tree is doing / the last event that made it change state.
  const details: Record<string, [string | undefined, string | undefined]> = {
    vision: [vision?.label, visionCommand ?? undefined],
    robot: [btState ?? (bridge ? systemState : undefined), lastEvent ?? undefined],
    endeffector: [undefined, undefined],
    leakEquipment: [srde.state ?? undefined, undefined],
  };

  const facts: [string, string][] = [];
  if (cycle) {
    const target = t('steps.target', { current: cycle.target, total: cycle.nTargets });
    facts.push([
      t('progress'),
      cycle.nScenes > 1 ? `${target} · ${t('steps.scene', { current: cycle.scene, total: cycle.nScenes })}` : target,
    ]);
  }
  if (phase) facts.push([t('phase'), phase]);
  if (srde.recipe) facts.push([t('recipe'), srde.recipe]);

  return (
    <div className="space-y-3">
      <div className={`rounded-xl border p-4 ${STATE_STYLE[bridge ? systemState : 'UNKNOWN']}`}>
        <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">{t('systemState')}</div>
        <div className="text-sm font-bold font-mono mt-1">
          {bridge ? t(`states.${systemState}`) : t('states.OFFLINE')}
        </div>
        {!bridge && <div className="text-xs mt-1 opacity-80">{t('hints.offline')}</div>}
        {facts.length > 0 && (
          <dl className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt className="opacity-70">{label}</dt>
                <dd className="font-mono font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className="grid grid-cols-1 xs:grid-cols-2 md:grid-cols-4 gap-1 xs:gap-2 md:gap-3 w-full">
        {SUBSYSTEM_IDS.map((id) => {
          const status = nodeHealth(id, nodes);
          const fallback =
            status === SystemCheckStatus.NOT_OK ? t('checks.nodeDown')
            : status === SystemCheckStatus.WARN ? t('checks.partial')
            : undefined;
          const [state, command] = status === SystemCheckStatus.OK ? details[id] : [fallback, undefined];
          return (
            <div
              key={id}
              className="rounded-xl p-3 border border-slate-200/40 dark:border-slate-700/40 bg-white/40 dark:bg-slate-950/20 backdrop-blur-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t(`checks.${id}`)}</span>
                <span className={`flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider ${STATUS_TEXT[status]}`}>
                  <span className="w-2 h-2 rounded-full bg-current" />
                  {status}
                </span>
              </div>
              {/* Always a 2x2 grid: titles on top, values below; Command left, State right. */}
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs">
                <div className="text-slate-500">{t('checks.command')}</div>
                <div className="text-slate-500">{t('checks.state')}</div>
                <div className="font-mono text-slate-700 dark:text-slate-300 break-words min-w-0">{command || '-'}</div>
                <div className="font-mono text-slate-700 dark:text-slate-300 break-words min-w-0">{state || '-'}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
