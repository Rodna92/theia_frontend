export enum SystemCheckStatus {
  OK = 'OK',
  WARN = 'WARN',
  NOT_OK = 'NOT_OK',
  OFF = 'OFF',
}

export enum ProcessStepState {
  IDLE = 'idle',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
}

export interface LeakDetectionSystemStatus {
  id: string;
  label: string;
  status: SystemCheckStatus;
  ready?: boolean | null;
  details?: string | null;
}

export interface LeakDetectionFlowStep {
  id: string;
  label: string;
  state: ProcessStepState;
}
