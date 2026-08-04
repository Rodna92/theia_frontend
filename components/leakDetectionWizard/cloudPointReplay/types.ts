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
