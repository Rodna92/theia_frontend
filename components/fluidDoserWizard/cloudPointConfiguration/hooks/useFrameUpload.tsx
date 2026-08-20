'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import {
  FRAME_FILE_SPECS,
  TSDF_FRAME_FILE_SPECS,
  TARGET_COLOR_PALETTE,
  TRANSFORMS_FILE_NAME,
  LoadedFrameCloud,
  TargetFrameData,
} from '../../pointCloudShared/types';
import { parsePlyFile } from '../../pointCloudShared/plyGeometry';
import { targetCloudShade } from '../../pointCloudShared/colorGradient';

interface FileWithRelativePath extends File {
  webkitRelativePath: string;
}

// pose_debug/<targetName>/<frameFolder>/<fileName> — the per-target-subfolder
// layout used by the TSDF multi-target pipeline (Tappo_1, target_0, ...).
type MultiTargetFileIndex = Map<string, Map<number, Map<string, FileWithRelativePath>>>;

function extractFrameNumber(folderName: string): number | null {
  const match = folderName.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export type UploadMode = 'single' | 'multi' | null;

export function useFrameUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loaderRef = useRef(new PLYLoader());

  const [mode, setMode] = useState<UploadMode>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);

  // Single-target state — unchanged flat-folder behavior.
  const [frames, setFrames] = useState<LoadedFrameCloud[]>([]);
  const [missingFiles, setMissingFiles] = useState<string[]>([]);
  const [transformsText, setTransformsText] = useState<string | null>(null);

  // Multi-target state — pose_debug/<target>/frame_NNNNNN/... layout.
  const multiIndexRef = useRef<MultiTargetFileIndex>(new Map());
  const [targets, setTargets] = useState<string[]>([]);
  const [frameNumbers, setFrameNumbers] = useState<number[]>([]);
  const [selectedFrameNumber, setSelectedFrameNumber] = useState<number | null>(null);
  const [targetFrames, setTargetFrames] = useState<TargetFrameData[]>([]);
  const [isFrameLoading, setIsFrameLoading] = useState(false);

  const openFolderPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleFilesSelected = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const files = Array.from(fileList) as FileWithRelativePath[];
      const firstRelPath = files[0]?.webkitRelativePath || '';
      setFolderName(firstRelPath.split('/')[0] || null);

      const byBaseName = new Map<string, FileWithRelativePath>();
      files.forEach((file) => {
        const relPath = file.webkitRelativePath || file.name;
        const segments = relPath.split('/');
        if (segments.length === 2) byBaseName.set(segments[1], file);
      });
      const isFlatSingleTarget = FRAME_FILE_SPECS.some((spec) => byBaseName.has(spec.fileName));

      if (isFlatSingleTarget) {
        // ---- Single-target: files directly inside the picked folder ----
        multiIndexRef.current = new Map();
        setTargets([]);
        setFrameNumbers([]);
        setSelectedFrameNumber(null);
        setTargetFrames([]);

        const loadedFrames: LoadedFrameCloud[] = [];
        const missing: string[] = [];

        for (const spec of FRAME_FILE_SPECS) {
          const file = byBaseName.get(spec.fileName);
          if (!file) {
            missing.push(spec.fileName);
            continue;
          }

          const { geometry, pointCount } = await parsePlyFile(file, loaderRef.current);
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
        setMode('single');

        if (loadedFrames.length === 0) {
          setError('No matching point cloud files (.ply) were found in the selected folder.');
        }
        return;
      }

      // ---- Multi-target: pose_debug/<target>/frame_NNNNNN/<file> ----
      // Target discovery (which folders count as a "target") is intentionally
      // decoupled from whether its inner frame_NNNNNN/<file> structure parses
      // cleanly — otherwise a single target with an unexpected layout (an
      // unparseable frame-folder name, missing files, extra nesting) would
      // silently vanish from the list entirely instead of showing up with a
      // "missing" state that can be diagnosed.
      const index: MultiTargetFileIndex = new Map();
      const discoveredTargets = new Set<string>();
      files.forEach((file) => {
        const relPath = file.webkitRelativePath || file.name;
        const segments = relPath.split('/');
        if (segments.length < 3) return;

        const targetName = segments[1];
        discoveredTargets.add(targetName);

        if (segments.length !== 4) return;
        const frameFolder = segments[2];
        const fileName = segments[3];
        const frameNumber = extractFrameNumber(frameFolder);
        if (frameNumber === null) return;

        let byFrame = index.get(targetName);
        if (!byFrame) {
          byFrame = new Map();
          index.set(targetName, byFrame);
        }
        let byFile = byFrame.get(frameNumber);
        if (!byFile) {
          byFile = new Map();
          byFrame.set(frameNumber, byFile);
        }
        byFile.set(fileName, file);
      });

      setFrames([]);
      setMissingFiles([]);
      setTransformsText(null);

      if (discoveredTargets.size === 0) {
        multiIndexRef.current = new Map();
        setMode(null);
        setTargets([]);
        setFrameNumbers([]);
        setSelectedFrameNumber(null);
        setTargetFrames([]);
        setError('No matching point cloud files (.ply) were found in the selected folder.');
        return;
      }

      const sortedTargets = Array.from(discoveredTargets).sort();
      const frameNumberSet = new Set<number>();
      index.forEach((byFrame) => byFrame.forEach((_files, frameNumber) => frameNumberSet.add(frameNumber)));
      const sortedFrameNumbers = Array.from(frameNumberSet).sort((a, b) => a - b);

      multiIndexRef.current = index;
      setTargets(sortedTargets);
      setFrameNumbers(sortedFrameNumbers);
      setSelectedFrameNumber(sortedFrameNumbers[sortedFrameNumbers.length - 1] ?? null);
      setMode('multi');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read the selected folder.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Lazily load (only) the selected frame's data across every detected
  // target whenever the selection or the uploaded folder changes — avoids
  // parsing every frame of every target upfront.
  useEffect(() => {
    if (mode !== 'multi' || selectedFrameNumber === null || targets.length === 0) {
      setTargetFrames([]);
      return;
    }

    let cancelled = false;
    setIsFrameLoading(true);

    (async () => {
      const results: TargetFrameData[] = [];

      for (let i = 0; i < targets.length; i++) {
        const targetName = targets[i];
        const color = TARGET_COLOR_PALETTE[i % TARGET_COLOR_PALETTE.length];
        const fileMap = multiIndexRef.current.get(targetName)?.get(selectedFrameNumber);
        const loadedFrames: LoadedFrameCloud[] = [];
        const missing: string[] = [];

        for (let specIndex = 0; specIndex < TSDF_FRAME_FILE_SPECS.length; specIndex++) {
          const spec = TSDF_FRAME_FILE_SPECS[specIndex];
          const file = fileMap?.get(spec.fileName);
          if (!file) {
            missing.push(spec.fileName);
            continue;
          }

          const { geometry, pointCount } = await parsePlyFile(file, loaderRef.current);
          loadedFrames.push({
            id: `${targetName}:${spec.id}`,
            fileName: spec.fileName,
            description: spec.description,
            color: targetCloudShade(color, specIndex, TSDF_FRAME_FILE_SPECS.length),
            visible: true,
            pointCount,
            geometry,
            targetName,
          });
        }

        const transformsFile = fileMap?.get(TRANSFORMS_FILE_NAME);
        const transformsText = transformsFile ? await transformsFile.text() : null;
        if (!transformsFile) missing.push(TRANSFORMS_FILE_NAME);

        results.push({ targetName, color, visible: true, frames: loadedFrames, transformsText, missingFiles: missing });
      }

      if (!cancelled) {
        setTargetFrames(results);
        setIsFrameLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [mode, selectedFrameNumber, targets]);

  const toggleVisibility = useCallback((id: string) => {
    setFrames((prev) =>
      prev.map((frame) => (frame.id === id ? { ...frame, visible: !frame.visible } : frame))
    );
  }, []);

  // Master per-target toggle — derives the next state from the clouds'
  // actual visibility (rather than trusting a separately-tracked flag) so it
  // stays correct after individual clouds have been toggled independently.
  const toggleTargetVisibility = useCallback((targetName: string) => {
    setTargetFrames((prev) =>
      prev.map((target) => {
        if (target.targetName !== targetName) return target;
        const nextVisible = !(target.frames.length > 0 && target.frames.every((frame) => frame.visible));
        return {
          ...target,
          visible: nextVisible,
          frames: target.frames.map((frame) => ({ ...frame, visible: nextVisible })),
        };
      })
    );
  }, []);

  const toggleTargetCloudVisibility = useCallback((targetName: string, cloudId: string) => {
    setTargetFrames((prev) =>
      prev.map((target) => {
        if (target.targetName !== targetName) return target;
        const frames = target.frames.map((frame) =>
          frame.id === cloudId ? { ...frame, visible: !frame.visible } : frame
        );
        return { ...target, visible: frames.length > 0 && frames.every((frame) => frame.visible), frames };
      })
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
    mode,
    frames,
    missingFiles,
    transformsText,
    isLoading,
    error,
    folderName,
    toggleVisibility,
    targets,
    frameNumbers,
    selectedFrameNumber,
    setSelectedFrameNumber,
    targetFrames,
    isFrameLoading,
    toggleTargetVisibility,
    toggleTargetCloudVisibility,
  };
}
