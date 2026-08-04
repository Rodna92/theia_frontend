'use client';

import { useCallback, useState } from 'react';
import * as THREE from 'three';
import { convertMeshToPointCloud } from '../cadToPointCloud';

export function useCadPointCloud() {
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [pointCount, setPointCount] = useState(0);
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const convert = useCallback((meshGeometry: THREE.BufferGeometry, voxelSize: number) => {
    setIsConverting(true);
    setError(null);

    try {
      const result = convertMeshToPointCloud(meshGeometry, voxelSize);
      setGeometry((prev) => {
        prev?.dispose();
        return result.geometry;
      });
      setPointCount(result.pointCount);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to convert the CAD model to a point cloud.');
    } finally {
      setIsConverting(false);
    }
  }, []);

  const reset = useCallback(() => {
    setGeometry((prev) => {
      prev?.dispose();
      return null;
    });
    setPointCount(0);
    setError(null);
  }, []);

  return { geometry, pointCount, isConverting, error, convert, reset };
}
