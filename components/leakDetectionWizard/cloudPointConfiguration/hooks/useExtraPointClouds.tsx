'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { LoadedFrameCloud } from '../../pointCloudShared/types';
import { parsePlyFile } from '../../pointCloudShared/plyGeometry';

// A rotating palette distinct from the fixed pipeline-stage colors in
// FRAME_FILE_SPECS, so user-added clouds stay visually distinguishable from
// the pipeline's own frames.
const EXTRA_CLOUD_COLORS = [
  0xf97316, 0xeab308, 0xec4899, 0x8b5cf6, 0x10b981, 0x3b82f6, 0xef4444, 0x14b8a6,
];

let nextColorIndex = 0;

export function useExtraPointClouds() {
  const t = useTranslations();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [pointClouds, setPointClouds] = useState<LoadedFrameCloud[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openFilePicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const addFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.ply')) {
        setError('Only .ply point cloud files are supported.');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const loader = new PLYLoader();
        const { geometry, pointCount } = await parsePlyFile(file, loader);
        const color = EXTRA_CLOUD_COLORS[nextColorIndex % EXTRA_CLOUD_COLORS.length];
        nextColorIndex += 1;

        setPointClouds((prev) => [
          ...prev,
          {
            id: `extra-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            fileName: file.name,
            description: t('leakDetection.cloudPointConfiguration.userAddedPointCloud'),
            color,
            visible: true,
            pointCount,
            geometry,
          },
        ]);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load the selected point cloud.');
      } finally {
        setIsLoading(false);
      }
    },
    [t]
  );

  const toggleVisibility = useCallback((id: string) => {
    setPointClouds((prev) =>
      prev.map((cloud) => (cloud.id === id ? { ...cloud, visible: !cloud.visible } : cloud))
    );
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = '';
      if (file) void addFile(file);
    },
    [addFile]
  );

  return { inputRef, onInputChange, openFilePicker, pointClouds, isLoading, error, toggleVisibility };
}
