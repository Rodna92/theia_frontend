export enum SystemCheckStatus {
  OK = 'OK',
  WARN = 'WARN',
  OFF = 'OFF',
}

export enum ProcessStepState {
  IDLE = 'idle',
  RUNNING = 'running',
  DONE = 'done',
  ERROR = 'error',
}

export interface FluidDoserSystemStatus {
  id: string;
  label: string;
  status: SystemCheckStatus;
}

export interface FluidDoserFlowStep {
  id: string;
  label: string;
  state: ProcessStepState;
}

export interface StartFluidDoserRequestDTO {
  processId?: string;
}

export interface StartFluidDoserResponseDTO {
  success: boolean;
  message?: string;
  processInstanceId?: string;
}

export interface TestFluidDoserRequestDTO {
  processId?: string;
}

export interface TestFluidDoserResponseDTO {
  success: boolean;
  message?: string;
}

export interface ConfigureFluidDoserRequestDTO {
  config?: Record<string, unknown>;
}

export interface ConfigureFluidDoserResponseDTO {
  success: boolean;
  message?: string;
}
