export interface SubsystemStatus {
  subsystem: string;
  status: string;
  ready: boolean | null;
  lastSeenAt: string;
  details: string | null;
}

export interface RunView {
  runId: string;
  state: string;
  stateVersion?: number;
  processType?: string;
  edgeId?: string;
  startedAt?: string | null;
  endedAt?: string | null;
  lastError?: { code: string; message: string } | null;
  subsystems?: SubsystemStatus[];
  allowedTriggers: string[];
  allowedCommands: string[];
  [key: string]: any;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';
