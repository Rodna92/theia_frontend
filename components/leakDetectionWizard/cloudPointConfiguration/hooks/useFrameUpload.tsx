'use client';

import { useCallback, useRef, useState } from 'react';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { FRAME_FILE_SPECS, TRANSFORMS_FILE_NAME, LoadedFrameCloud } from '../../pointCloudShared/types';
import { parsePlyFile } from '../../pointCloudShared/plyGeometry';

interface FileWithRelativePath extends File {
  webkitRelativePath: string;
}

export function useFrameUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [frames, setFrames] = useState<LoadedFrameCloud[]>([]);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [transformsText, setTransformsText] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);

  const openFolderPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const files = Array.from(fileList) as FileWithRelativePath[];
      const byBaseName = new Map<string, FileWithRelativePath>();
      files.forEach((file) => {
        const relPath = file.webkitRelativePath || file.name;
        const baseName = relPath.split('/').pop() ?? file.name;
        byBaseName.set(baseName, file);
      });

      const firstRelPath = files[0]?.webkitRelativePath || '';
      setFolderName(firstRelPath.split('/')[0] || null);

      const loader = new PLYLoader();
      const loadedFrames: LoadedFrameCloud[] = [];
      const missing: string[] = [];

      for (const spec of FRAME_FILE_SPECS) {
        const file = byBaseName.get(spec.fileName);
        if (!file) {
          missing.push(spec.fileName);
          continue;
        }

        const { geometry, pointCount } = await parsePlyFile(file, loader);

        loadedFrames.push({
          id: spec.id,
          fileName: spec.fileName,
          description: spec.description,
          color: spec.color,
          visible: true,
          pointCount,
          geometry,
        });
      }

      const transformsFile = byBaseName.get(TRANSFORMS_FILE_NAME);
      if (transformsFile) {
        setTransformsText(await transformsFile.text());
      } else {
        setTransformsText(null);
        missing.push(TRANSFORMS_FILE_NAME);
      }

      setFrames(loadedFrames);
      setMissingFiles(missing);

      if (loadedFrames.length === 0) {
        setError('No matching point cloud files (.ply) were found in the selected folder.');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the selected folder.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const toggleVisibility = useCallback((id: string) => {
    setFrames((prev) =>
      prev.map((frame) => (frame.id === id ? { ...frame, visible: !frame.visible } : frame))
    );
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      void handleFilesSelected(event.target.files);
      event.target.value = '';
    },
    [handleFilesSelected]
  );

  return {
    inputRef,
    onInputChange,
    openFolderPicker,
    frames,
    missingFiles,
    transformsText,
    isLoading,
    error,
    folderName,
    toggleVisibility,
  };
}
