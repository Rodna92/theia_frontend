import {
  StartLeakDetectionRequestDTO,
  StartLeakDetectionResponseDTO,
  TestLeakDetectionRequestDTO,
  TestLeakDetectionResponseDTO,
  ConfigureLeakDetectionRequestDTO,
  ConfigureLeakDetectionResponseDTO,
} from '../types/leakDetection';

export const leakDetectionService = {
  async start(
    _request: StartLeakDetectionRequestDTO
  ): Promise<StartLeakDetectionResponseDTO> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          message: 'Leak detection started',
          processInstanceId: `process_${Date.now()}`,
        });
      }, 1000);
    });
  },

  async test(
    _request: TestLeakDetectionRequestDTO
  ): Promise<TestLeakDetectionResponseDTO> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          message: 'Test completed successfully',
        });
      }, 1500);
    });
  },

  async configure(
    _request: ConfigureLeakDetectionRequestDTO
  ): Promise<ConfigureLeakDetectionResponseDTO> {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          success: true,
          message: 'Configuration updated',
        });
      }, 800);
    });
  },
};
