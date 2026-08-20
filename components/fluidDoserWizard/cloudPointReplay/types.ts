import { LoadedFrameCloud } from '../pointCloudShared/types';

export interface ReplayFrameEntry {
  id: string;
  frameNumber: number;
  files: Map<string, File>;
}

export interface ReplayFrameData {
  clouds: LoadedFrameCloud[];
  transformsText: string | null;
}

// Multi-target TSDF replay — pose_debug/<target>/frame_NNNNNN/... — frame
// numbers are expected to line up across targets, so playback advances one
// shared frame number at a time while loading every target's data for it.
export interface ReplayTargetFrameData {
  targetName: string;
  color: number;
  clouds: LoadedFrameCloud[];
  transformsText: string | null;
  missingFiles: string[];
}
