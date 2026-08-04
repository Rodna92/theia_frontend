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

export interface StartLeakDetectionRequestDTO {
  processId?: string;
}

export interface StartLeakDetectionResponseDTO {
  success: boolean;
  message?: string;
  processInstanceId?: string;
}

export interface TestLeakDetectionRequestDTO {
  processId?: string;
}

export interface TestLeakDetectionResponseDTO {
  success: boolean;
  message?: string;
}

export interface ConfigureLeakDetectionRequestDTO {
  config?: Record<string, unknown>;
}

export interface ConfigureLeakDetectionResponseDTO {
  success: boolean;
  message?: string;
}
