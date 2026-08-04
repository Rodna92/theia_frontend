'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { 
  IconPlayerPlay, 
  IconSettings, 
  IconPlayerStop, 
  IconRotateClockwise,
  IconLoader
} from '@tabler/icons-react';
import { StartButton } from '@/ui/CTAs/startButton';
import { SetButton } from '@/ui/CTAs/setButton';
import { ModalPortal } from '@/ui/ModalPortal';
import { ConfigureSelectModal } from './ConfigureSelectModal';
import { ConfigureDetailsModal } from './ConfigureDetailsModal';
import { LeakDetectionSystemStatus } from '@/client/types/leakDetection';

export type ProcessState = 'idle' | 'running' | 'finished';

interface ActionsPanelProps {
  systemStatus?: LeakDetectionSystemStatus[];
  processState: ProcessState; 
  onStart?: () => void;
  onTest?: () => void;
  onStop?: () => void;
  onReset?: () => void;
}

export function ActionsPanel({
  systemStatus = [],
  processState, 
  onStart,
  onTest,
  onStop,
  onReset,
}: ActionsPanelProps) {
  const t = useTranslations();
  
  const [isConfigureOpen, setIsConfigureOpen] = useState(false);
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null);
  const [selectedConfigLabel, setSelectedConfigLabel] = useState<string>('');

  const handleConfigure = () => {
    setIsConfigureOpen(true);
    setSelectedConfigId(null);
  };

  const handleSelectConfigItem = (id: string, label: string) => {
    setSelectedConfigId(id);
    setSelectedConfigLabel(label);
  };

  const handleCloseModal = () => {
    setIsConfigureOpen(false);
    setSelectedConfigId(null);
  };

  // --- RENDER LOGIC ---

  // 1. RUNNING STATE
  // Shows a "Processing..." indicator and a Stop button
  if (processState === 'running') {
    return (
      <div className="flex flex-col gap-3">
        {/* Visual Indicator of running state */}
        <div className="flex items-center justify-center gap-2 p-3 rounded-lg border border-sky-200 bg-sky-50 text-sky-700 dark:bg-sky-900/20 dark:border-sky-800 dark:text-sky-300 font-medium transition-all cursor-default">
          <IconLoader className="animate-spin" size={20} />
          <span>{t('leakDetection.actions.running') || 'Processing...'}</span>
        </div>

        <SetButton
          onClick={onStop}
          label={t('leakDetection.actions.stop') || 'Stop'}
          icon={<IconPlayerStop size={20} />}
          light={{
            text: '#ef4444',
            border: 'rgba(239, 68, 68, 0.4)',
            background: '#fef2f2',
            hoverBackground: '#fee2e2',
          }}
          dark={{
            text: '#f87171',
            border: 'rgba(248, 113, 113, 0.4)',
            background: 'rgba(239, 68, 68, 0.1)',
            hoverBackground: 'rgba(239, 68, 68, 0.2)',
          }}
        />
      </div>
    );
  }

  // 2. FINISHED STATE
  // Shows only the Reset button (appears when process is done or has error)
  if (processState === 'finished') {
    return (
      <div className="flex flex-col gap-3">
        <SetButton
          onClick={onReset}
          label={t('leakDetection.actions.reset') || 'Reset Process'}
          icon={<IconRotateClockwise size={20} />}
          light={{
            text: '#0369a1',
            border: 'rgba(34, 211, 238, 0.4)',
            background: '#f0f9ff',
            hoverBackground: '#e0f2fe',
          }}
          dark={{
            text: '#22d3ee',
            border: 'rgba(34, 211, 238, 0.4)',
            background: 'rgba(34, 211, 238, 0.1)',
            hoverBackground: 'rgba(34, 211, 238, 0.2)',
          }}
        />
      </div>
    );
  }

  // 3. IDLE STATE
  // Shows Start, Test, Configure
  return (
    <>
      <div className="flex flex-col gap-3">
        <StartButton
          onClick={onStart}
          label={t('leakDetection.actions.start')}
        />

        <SetButton
          onClick={onTest}
          label={t('leakDetection.actions.test')}
          icon={<IconPlayerPlay size={20} />}
          light={{
            text: '#0369a1',
            border: 'rgba(34, 211, 238, 0.4)',
            background: '#f0f9ff',
            hoverBackground: '#e0f2fe',
          }}
          dark={{
            text: '#22d3ee',
            border: 'rgba(34, 211, 238, 0.4)',
            background: 'rgba(34, 211, 238, 0.1)',
            hoverBackground: 'rgba(34, 211, 238, 0.2)',
          }}
        />

        <SetButton
          onClick={handleConfigure}
          label={t('leakDetection.actions.configure')}
          icon={<IconSettings size={20} />}
          light={{
            text: '#3f3f46',
            border: '#e4e4e7',
            background: '#ffffff',
            hoverBackground: '#f4f4f5',
          }}
          dark={{
            text: '#d4d4d8',
            border: 'rgba(82, 82, 91, 0.4)',
            background: 'rgba(63, 63, 70, 0.1)',
            hoverBackground: 'rgba(63, 63, 70, 0.2)',
          }}
        />
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
            onSelectItem={handleSelectConfigItem}
            onClose={handleCloseModal}
          />
        )}
      </ModalPortal>
    </>
  );
}