import * as THREE from 'three';

export interface FrameFileSpec {
  id: string;
  fileName: string;
  description: string;
  color: number;
}

export const FRAME_FILE_SPECS: FrameFileSpec[] = [
  {
    id: 'srcRaw',
    fileName: '01_src_raw.ply',
    description: 'Mask-cropped, z-filtered points — raw density, pre-outlier-removal',
    color: 0x94a3b8,
  },
  {
    id: 'srcAfterOutlierRemoval',
    fileName: '02_src_after_outlier_removal.ply',
    description: 'After RemoveStatisticalOutliers(), before voxel downsampling',
    color: 0xf59e0b,
  },
  {
    id: 'srcDown',
    fileName: '03_src_down.ply',
    description: 'src_down — after VoxelDownSample()',
    color: 0x22d3ee,
  },
  {
    id: 'coarseRefAligned',
    fileName: '04_coarse_ref_aligned.ply',
    description: 'Reference cloud transformed by the coarse ICP result',
    color: 0xa78bfa,
  },
  {
    id: 'coarseSrcDown',
    fileName: '04_coarse_src_down.ply',
    description: 'Source paired with the coarse-aligned reference — coarse-pass match',
    color: 0xfb7185,
  },
  {
    id: 'fineRefAligned',
    fileName: '05_fine_ref_aligned.ply',
    description: 'Reference cloud transformed by the fine ICP result',
    color: 0x34d399,
  },
  {
    id: 'fineSrcDown',
    fileName: '05_fine_src_down.ply',
    description: 'Source paired with the fine-aligned reference — fine-pass match',
    color: 0xf472b6,
  },
];

// The multi-target debug output (one subfolder per target:
// pose_debug/<target>/frame_NNNNNN/...) — the Tracking/TSDF pipeline. Two
// visual checks: srcRaw vs finalPoseRefAlignedCamera (does the final
// published pose match what the camera sees, camera frame) and
// tsdfFusedSurface vs localIcpRefAligned (internal TSDF/local-ICP
// registration quality, object-local frame — won't line up spatially with
// the camera-frame clouds if overlaid without a frame transform).
export const TSDF_FRAME_FILE_SPECS: FrameFileSpec[] = [
  {
    id: 'srcRaw',
    fileName: '01_src_raw.ply',
    description: 'Raw masked point cloud from the current camera frame',
    color: 0x94a3b8,
  },
  {
    id: 'tsdfFusedSurface',
    fileName: '02_tsdf_fused_surface.ply',
    description: 'Accumulated TSDF surface built from multiple frames — object-local frame',
    color: 0x22d3ee,
  },
  {
    id: 'localIcpRefAligned',
    fileName: '03_local_icp_ref_aligned.ply',
    description: 'Reference model aligned to the TSDF surface using local ICP — object-local frame',
    color: 0xfacc15,
  },
  {
    id: 'finalPoseRefAlignedCamera',
    fileName: '04_final_pose_ref_aligned_camera.ply',
    description: 'Reference model transformed with the final accepted pose — camera frame',
    color: 0xf472b6,
  },
];

export const TRANSFORMS_FILE_NAME = 'transforms.txt';

// Assigns each detected target (Tappo_1, target_0, hansen_0, ...) a stable
// color across its whole set of point clouds, so targets stay visually
// distinguishable when overlaid together in the multi-target viewer.
export const TARGET_COLOR_PALETTE = [
  0x38bdf8, 0xf97316, 0x34d399, 0xf472b6, 0xa78bfa, 0xfacc15, 0xfb7185, 0x22d3ee, 0x94a3b8, 0xc084fc,
];

export interface LoadedFrameCloud {
  id: string;
  fileName: string;
  description: string;
  color: number;
  visible: boolean;
  pointCount: number;
  geometry: THREE.BufferGeometry;
  // Present only for clouds loaded as part of a multi-target TSDF upload —
  // identifies which target subfolder (e.g. "Tappo_1") this cloud came from.
  targetName?: string;
}

// One TSDF target's data for the currently selected frame number, in a
// multi-target upload (pose_debug/<targetName>/frame_NNNNNN/...).
export interface TargetFrameData {
  targetName: string;
  color: number;
  visible: boolean;
  frames: LoadedFrameCloud[];
  transformsText: string | null;
  missingFiles: string[];
}

// A CAD model "inserted" into the main scene alongside the captured frames —
// both representations are kept so the viewer can toggle between mesh and
// point cloud without needing to regenerate anything.
export interface InsertedCadObject {
  meshGeometry: THREE.BufferGeometry;
  pointCloudGeometry: THREE.BufferGeometry;
}
