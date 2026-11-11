'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { IconPlayerPlay, IconSettings, IconPlayerStop } from '@tabler/icons-react';
import { StartButton } from '@/ui/CTAs/startButton';
import { SetButton } from '@/ui/CTAs/setButton';
import { ModalPortal } from '@/ui/ModalPortal';
import { ConfigureSelectModal } from './ConfigureSelectModal';
import { ConfigureDetailsModal } from './ConfigureDetailsModal';
import { LeakDetectionSystemStatus } from '@/client/types/leakDetection';
import type { SystemState, WorkcellCommand } from '@/client/types/workcell';

interface ActionsPanelProps {
  // Subsystems listed in the Configure dialog.
  systemStatus: LeakDetectionSystemStatus[];
  // UNKNOWN (stack not reachable, orchestrator down) disables every command.
  systemState: SystemState;
  // Command being sent right now, if any.
  pending: WorkcellCommand | null;
  onCommand: (command: WorkcellCommand) => void;
}

// Start / Stop / Test follow the orchestrator's state (it has the last word and may still
// refuse); Configure is always available since it does not need the stack.
export function ActionsPanel({ systemStatus, systemState, pending, onCommand }: ActionsPanelProps) {
  const t = useTranslations();

  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedConfigLabel, setSelectedConfigLabel] = useState<string>('');

  const handleCloseModal = () => {
    setIsConfigureOpen(false);
    setSelectedConfigId(null);
  };

  const busy = pending !== null;
  const canStart = systemState === 'STOPPED' && !busy;
  const canStop = (systemState === 'BUSY' || systemState === 'IDLE') && !busy;
  const canTest = systemState === 'IDLE' && !busy;

  return (
    <>
      <div className="flex flex-col gap-3">
        <StartButton onClick={() => onCommand('start')} disabled={!canStart} label={t('leakDetection.actions.start')} />

        <SetButton
          onClick={() => onCommand('stop')}
          disabled={!canStop}
          label={t('leakDetection.actions.stop')}
          icon={<IconPlayerStop size={20} />}
          light={{ text: '#ef4444', border: 'rgba(239, 68, 68, 0.4)', background: '#fef2f2', hoverBackground: '#fee2e2' }}
          dark={{ text: '#f87171', border: 'rgba(248, 113, 113, 0.4)', background: 'rgba(239, 68, 68, 0.1)', hoverBackground: 'rgba(239, 68, 68, 0.2)' }}
        />

        <SetButton
          onClick={() => onCommand('test')}
          disabled={!canTest}
          label={t('leakDetection.actions.test')}
          icon={<IconPlayerPlay size={20} />}
          light={{ text: '#0e7490', border: '#cbd5e1', background: '#ffffff', hoverBackground: '#f1f5f9' }}
          dark={{ text: '#22d3ee', border: 'rgba(34, 211, 238, 0.4)', background: 'rgba(34, 211, 238, 0.1)', hoverBackground: 'rgba(34, 211, 238, 0.2)' }}
        />

        <SetButton
          onClick={() => {
            setIsConfigureOpen(true);
            setSelectedConfigId(null);
          }}
          label={t('leakDetection.actions.configure')}
          icon={<IconSettings size={20} />}
          light={{ text: '#334155', border: '#e2e8f0', background: '#ffffff', hoverBackground: '#f8fafc' }}
          dark={{ text: '#d4d4d8', border: 'rgba(82, 82, 91, 0.4)', background: 'rgba(63, 63, 70, 0.1)', hoverBackground: 'rgba(63, 63, 70, 0.2)' }}
        />

        <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug">
          {systemState === 'STOPPED' && t('leakDetection.monitor.hints.start')}
          {systemState === 'IDLE' && t('leakDetection.monitor.hints.test')}
        </p>
      </div>

      <ModalPortal isOpen={isConfigureOpen} onClose={handleCloseModal}>
        {selectedConfigId ? (
          <ConfigureDetailsModal
            selectedItemId={selectedConfigId}
            selectedItemLabel={selectedConfigLabel}
            onClose={handleCloseModal}
            onBack={() => setSelectedConfigId(null)}
          />
        ) : (
          <ConfigureSelectModal
            systemStatus={systemStatus}
            onSelectItem={(id, label) => {
              setSelectedConfigId(id);
              setSelectedConfigLabel(label);
            }}
            onClose={handleCloseModal}
          />
        )}
      </ModalPortal>
    </>
  );
}
