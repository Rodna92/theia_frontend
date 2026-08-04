import * as THREE from 'three';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';

const loader = new STLLoader();

export interface ParsedCad {
  geometry: THREE.BufferGeometry;
  triangleCount: number;
}

export async function parseCadFile(file: File): Promise<ParsedCad> {
  const buffer = await file.arrayBuffer();
  const geometry = loader.parse(buffer);

  if (!geometry.getAttribute('normal')) {
    geometry.computeVertexNormals();
  }
  geometry.computeBoundingBox();

  const triangleCount = (geometry.getAttribute('position')?.count ?? 0) / 3;
  return { geometry, triangleCount };
}
