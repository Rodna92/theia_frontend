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

export const TRANSFORMS_FILE_NAME = 'transforms.txt';

export interface LoadedFrameCloud {
  id: string;
  fileName: string;
  description: string;
  color: number;
  visible: boolean;
  pointCount: number;
  geometry: THREE.BufferGeometry;
}

// A CAD model "inserted" into the main scene alongside the captured frames —
// both representations are kept so the viewer can toggle between mesh and
// point cloud without needing to regenerate anything.
export interface InsertedCadObject {
  meshGeometry: THREE.BufferGeometry;
  pointCloudGeometry: THREE.BufferGeometry;
}
