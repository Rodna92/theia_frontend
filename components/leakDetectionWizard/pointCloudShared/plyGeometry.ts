import * as THREE from 'three';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';

// PLYLoader preserves the source's numeric precision (e.g. `property double x`,
// common in Open3D exports), but WebGL vertex buffers only accept Float32Array —
// anything else (Float64Array in particular) throws "Unsupported buffer data
// format" at render time. We only need position, so rebuild a minimal geometry
// with just that attribute normalized to Float32Array and drop the rest.
function toPointsGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const position = source.getAttribute('position');
  const positionArray =
    position.array instanceof Float32Array ? position.array : Float32Array.from(position.array);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  source.dispose();
  return geometry;
}

export interface ParsedPly {
  geometry: THREE.BufferGeometry;
  pointCount: number;
}

export async function parsePlyFile(file: File, loader: PLYLoader): Promise<ParsedPly> {
  const buffer = await file.arrayBuffer();
  const geometry = toPointsGeometry(loader.parse(buffer));
  geometry.computeBoundingBox();
  const pointCount = geometry.getAttribute('position')?.count ?? 0;
  return { geometry, pointCount };
}
