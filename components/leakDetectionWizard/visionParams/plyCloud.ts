import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

const toFloat32 = (a: THREE.TypedArray) => (a instanceof Float32Array ? a : Float32Array.from(a));

// WebGL only takes Float32 vertex buffers (Open3D often writes doubles), so keep position
// and, when present, normalized vertex colors in a fresh geometry.
function toPointsGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(toFloat32(source.getAttribute('position').array), 3));
  const color = source.getAttribute('color');
  if (color) geometry.setAttribute('color', new THREE.BufferAttribute(toFloat32(color.array), color.itemSize));
  source.dispose();
  geometry.computeBoundingBox();
  return geometry;
}

export interface LoadedPly {
  geometry: THREE.BufferGeometry;
  resolvedPath: string;
}

// plyPath is the value as written in the yaml; relative paths resolve on the server against
// the loaded vision_params.yaml (see app/api/vision-params/ply).
export async function fetchPly(plyPath: string, yamlPath: string, signal?: AbortSignal): Promise<LoadedPly> {
  const res = await fetch(
    `/api/vision-params/ply?path=${encodeURIComponent(plyPath)}&yaml=${encodeURIComponent(yamlPath)}`,
    { cache: 'no-store', signal }
  );
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `HTTP ${res.status}`);
  }
  const resolvedPath = decodeURIComponent(res.headers.get('X-Resolved-Path') ?? plyPath);
  return { geometry: toPointsGeometry(new PLYLoader().parse(await res.arrayBuffer())), resolvedPath };
}
