export interface StreamConfig {
  host: string;
  webrtcPort: number;
  hlsPort: number;
  rtspPort: number;
  streamName: string;
}

export interface StreamStatus {
  state: 'connecting' | 'connected' | 'error' | 'idle';
  latency?: number;
  error?: string;
}

export interface BoundingBoxElement {
  type: 'bounding_box';
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  confidence: number;
}

export interface MaskElement {
  type: 'mask';
  label: string;
  confidence: number;
  points: [number, number][]; // Array of [x, y] pairs in percentage
}

export interface PointCloudElement {
  type: 'point_cloud';
  label: string;
  confidence: number;
  // Implementation details for later
  data: any;
}

export type OverlayElement = BoundingBoxElement | MaskElement | PointCloudElement;

export interface OverlayMetadata {
  // New Python DTO fields
  frameCapturedAtMs: number;    // Wall-clock time at capture
  overlayEmittedAtMs: number;   // Wall-clock time at WebSocket send
  processingTimeMs: number;     // Inference duration
  frameSeq: number;             // Sequence ID
  
  // Legacy/Frontend fields (keep if needed for compatibility or derived state)
  type: string;
  data: OverlayElement[];
}

export interface MetadataMessage {
  overlay?: OverlayMetadata;
  stream?: {
    status: string;
    bitrate?: number;
    framerate?: number;
  };
}

export interface WhepState {
  pc: RTCPeerConnection | null;
  video: HTMLVideoElement | null;
  status: StreamStatus;
  cleanup: () => void;
}
