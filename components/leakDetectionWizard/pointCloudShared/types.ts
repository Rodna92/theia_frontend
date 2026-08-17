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
// pose_debug/<target>/frame_NNNNNN/...) writes this file set — RANSAC global
// registration plus an ICP refinement pass on top of it.
export const RANSAC_FRAME_FILE_SPECS: FrameFileSpec[] = [
  {
    id: 'srcRaw',
    fileName: '01_src_raw.ply',
    description: 'Mask-cropped, z-filtered points — raw density',
    color: 0x94a3b8,
  },
  {
    id: 'srcFused',
    fileName: '02_src_fused.ply',
    description: 'Source points fused across captures, before RANSAC',
    color: 0xf59e0b,
  },
  {
    id: 'ransacRefAligned',
    fileName: '04_ransac_ref_aligned.ply',
    description: 'Reference cloud transformed by the RANSAC global registration result',
    color: 0xa78bfa,
  },
  {
    id: 'ransacSrc',
    fileName: '04_ransac_src.ply',
    description: 'Source points used for RANSAC global registration',
    color: 0xfb7185,
  },
  {
    id: 'icpRefAligned',
    fileName: '05_icp_ref_aligned.ply',
    description: 'Reference cloud further refined by ICP after RANSAC alignment',
    color: 0x34d399,
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
  // Present only for clouds loaded as part of a multi-target RANSAC upload —
  // identifies which target subfolder (e.g. "Tappo_1") this cloud came from.
  targetName?: string;
}

// One RANSAC target's data for the currently selected frame number, in a
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
