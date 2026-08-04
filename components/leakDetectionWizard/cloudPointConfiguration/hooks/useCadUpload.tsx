'use client';

import { useCallback, useRef, useState } from 'react';
import * as THREE from 'three';
import { parseCadFile } from '../../pointCloudShared/cadGeometry';

export interface LoadedCadModel {
  fileName: string;
  geometry: THREE.BufferGeometry;
  triangleCount: number;
  suggestedVoxelSize: number;
}

// A voxel size around 1/50th of the model's largest dimension gives a
// reasonably dense starting point cloud without being a guessing game for
// files at arbitrary CAD scales (millimeters, meters, inches, ...).
// parseCadFile() already calls computeBoundingBox(), so this is always set.
function estimateVoxelSize(geometry: THREE.BufferGeometry): number {
  const size = geometry.boundingBox!.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z, 1e-6);
  return Number((maxDim / 50).toPrecision(3));
}

export function useCadUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [model, setModel] = useState<LoadedCadModel | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const onInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.stl')) {
      setError('Only .stl CAD files are supported.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { geometry, triangleCount } = await parseCadFile(file);
      setModel((prev) => {
        prev?.geometry.dispose();
        return { fileName: file.name, geometry, triangleCount, suggestedVoxelSize: estimateVoxelSize(geometry) };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the selected CAD file.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { inputRef, onInputChange, openFilePicker, model, isLoading, error };
}
