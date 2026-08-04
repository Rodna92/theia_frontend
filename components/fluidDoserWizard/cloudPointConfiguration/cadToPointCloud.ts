import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

const loader = new PLYLoader();

// Oversample the surface before voxelizing so most occupied cells get several
// candidate points to average — too few and the voxel grid just reproduces
// the raw (noisy) triangle sampling instead of a clean per-cell centroid.
const SAMPLES_PER_VOXEL_AREA = 6;
const MIN_DENSE_SAMPLES = 2000;
const MAX_DENSE_SAMPLES = 300000;

function computeSurfaceArea(geometry: THREE.BufferGeometry): number {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const getVertexIndex = (triangle: number, corner: number) =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  let totalArea = 0;
  for (let t = 0; t < triangleCount; t++) {
    a.fromBufferAttribute(position, getVertexIndex(t, 0));
    b.fromBufferAttribute(position, getVertexIndex(t, 1));
    c.fromBufferAttribute(position, getVertexIndex(t, 2));
    totalArea += new THREE.Triangle(a, b, c).getArea();
  }
  return totalArea;
}

// Area-weighted random sampling over the mesh surface — larger triangles get
// proportionally more sample points so the resulting cloud density matches
// the underlying geometry instead of just the triangle count.
function sampleSurfacePoints(geometry: THREE.BufferGeometry, count: number): Float32Array {
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;

  const getVertexIndex = (triangle: number, corner: number) =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner;

  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  const cumulativeAreas = new Float32Array(triangleCount);
  let totalArea = 0;
  for (let t = 0; t < triangleCount; t++) {
    a.fromBufferAttribute(position, getVertexIndex(t, 0));
    b.fromBufferAttribute(position, getVertexIndex(t, 1));
    c.fromBufferAttribute(position, getVertexIndex(t, 2));
    totalArea += new THREE.Triangle(a, b, c).getArea();
    cumulativeAreas[t] = totalArea;
  }

  const pickTriangle = (target: number) => {
    let low = 0;
    let high = triangleCount - 1;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (cumulativeAreas[mid] < target) low = mid + 1;
      else high = mid;
    }
    return low;
  };

  const points = new Float32Array(count * 3);
  for (let p = 0; p < count; p++) {
    const t = totalArea > 0 ? pickTriangle(Math.random() * totalArea) : 0;
    a.fromBufferAttribute(position, getVertexIndex(t, 0));
    b.fromBufferAttribute(position, getVertexIndex(t, 1));
    c.fromBufferAttribute(position, getVertexIndex(t, 2));

    let u = Math.random();
    let v = Math.random();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;

    points[p * 3] = a.x * w + b.x * u + c.x * v;
    points[p * 3 + 1] = a.y * w + b.y * u + c.y * v;
    points[p * 3 + 2] = a.z * w + b.z * u + c.z * v;
  }

  return points;
}

// Grid-based downsampling: bucket points into voxelSize cells and collapse
// each occupied cell to the centroid of the points that fell into it —
// the same principle as Open3D's VoxelDownSample() referenced elsewhere in
// this pipeline (see FRAME_FILE_SPECS in pointCloudShared/types.ts).
function voxelDownsample(points: Float32Array, voxelSize: number): Float32Array {
  const cells = new Map<string, { x: number; y: number; z: number; count: number }>();

  for (let i = 0; i < points.length; i += 3) {
    const x = points[i];
    const y = points[i + 1];
    const z = points[i + 2];
    const key = `${Math.floor(x / voxelSize)}_${Math.floor(y / voxelSize)}_${Math.floor(z / voxelSize)}`;

    const cell = cells.get(key);
    if (cell) {
      cell.x += x;
      cell.y += y;
      cell.z += z;
      cell.count += 1;
    } else {
      cells.set(key, { x, y, z, count: 1 });
    }
  }

  const result = new Float32Array(cells.size * 3);
  let i = 0;
  cells.forEach(({ x, y, z, count }) => {
    result[i++] = x / count;
    result[i++] = y / count;
    result[i++] = z / count;
  });
  return result;
}

export function encodeAsciiPly(points: Float32Array): string {
  const vertexCount = points.length / 3;
  const lines = [
    'ply',
    'format ascii 1.0',
    `element vertex ${vertexCount}`,
    'property float x',
    'property float y',
    'property float z',
    'end_header',
  ];
  for (let i = 0; i < vertexCount; i++) {
    lines.push(`${points[i * 3]} ${points[i * 3 + 1]} ${points[i * 3 + 2]}`);
  }
  return lines.join('\n');
}

export interface ConvertedPointCloud {
  geometry: THREE.BufferGeometry;
  pointCount: number;
  plyText: string;
}

// A near/far pair of cutting planes per axis, each parallel to the main
// plane it's perpendicular to (YZ for x, XZ for y, XY for z). Points with a
// coordinate outside [min, max] on that axis are clipped away, so a slab
// like [50, 600] keeps only the middle of a [20, 800]-wide object.
export interface AxisClip {
  min: number;
  max: number;
}

export interface ClipBounds {
  x: AxisClip;
  y: AxisClip;
  z: AxisClip;
}

export function filterPointsWithinClip(geometry: THREE.BufferGeometry, clip: ClipBounds | null): Float32Array {
  const position = geometry.getAttribute('position');
  const array = position.array;
  const positionArray = array instanceof Float32Array ? array : Float32Array.from(array);

  if (!clip) {
    return positionArray;
  }

  const filtered: number[] = [];
  for (let i = 0; i < position.count; i++) {
    const x = positionArray[i * 3];
    const y = positionArray[i * 3 + 1];
    const z = positionArray[i * 3 + 2];
    if (
      x >= clip.x.min &&
      x <= clip.x.max &&
      y >= clip.y.min &&
      y <= clip.y.max &&
      z >= clip.z.min &&
      z <= clip.z.max
    ) {
      filtered.push(x, y, z);
    }
  }
  return Float32Array.from(filtered);
}

// Uniform scale factor applied at export time — e.g. 0.001 to convert a
// millimeter-scale model to meters, or 10 to blow a tiny model up.
export function scalePoints(points: Float32Array, scale: number): Float32Array {
  if (scale === 1) {
    return points;
  }

  const scaled = new Float32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    scaled[i] = points[i] * scale;
  }
  return scaled;
}

// Same uniform scale factor, but applied to a whole geometry (mesh or point
// cloud) instead of a raw position array — used to keep every preview (CAD
// mesh, converted cloud, and the copy handed to the main scene) in the same
// units as the final PLY export.
export function scaleGeometry(geometry: THREE.BufferGeometry, scale: number): THREE.BufferGeometry {
  const scaled = geometry.clone();
  if (scale !== 1) {
    scaled.scale(scale, scale, scale);
  }
  scaled.computeBoundingBox();
  return scaled;
}

export function convertMeshToPointCloud(meshGeometry: THREE.BufferGeometry, voxelSize: number): ConvertedPointCloud {
  if (!Number.isFinite(voxelSize) || voxelSize <= 0) {
    throw new Error('Voxel size must be a positive number.');
  }

  const surfaceArea = computeSurfaceArea(meshGeometry);
  const targetDenseSamples = Math.round((surfaceArea / (voxelSize * voxelSize)) * SAMPLES_PER_VOXEL_AREA);
  const denseSampleCount = Math.min(MAX_DENSE_SAMPLES, Math.max(MIN_DENSE_SAMPLES, targetDenseSamples));

  const denseSamples = sampleSurfacePoints(meshGeometry, denseSampleCount);
  const voxelPoints = voxelDownsample(denseSamples, voxelSize);

  if (voxelPoints.length === 0) {
    throw new Error('Voxel size is too large for this model — no cells were populated.');
  }

  const plyText = encodeAsciiPly(voxelPoints);

  // Round-trip through the real PLY parser so the displayed cloud is backed
  // by the same .ply format used everywhere else in this feature.
  const parsed = loader.parse(plyText);
  const position = parsed.getAttribute('position');
  const positionArray =
    position.array instanceof Float32Array ? position.array : Float32Array.from(position.array);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  geometry.computeBoundingBox();
  parsed.dispose();

  return { geometry, pointCount: positionArray.length / 3, plyText };
}
