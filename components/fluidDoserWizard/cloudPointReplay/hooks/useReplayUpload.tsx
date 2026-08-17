'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import {
  FRAME_FILE_SPECS,
  RANSAC_FRAME_FILE_SPECS,
  TARGET_COLOR_PALETTE,
  TRANSFORMS_FILE_NAME,
} from '../../pointCloudShared/types';
import { parsePlyFile } from '../../pointCloudShared/plyGeometry';
import { targetCloudShade } from '../../pointCloudShared/colorGradient';
import { DEFAULT_PLAYBACK_SPEED } from '../../pointCloudShared/hooks/useCloudPointViewer';
import { ReplayFrameEntry, ReplayFrameData, ReplayTargetFrameData } from '../types';

interface FileWithRelativePath extends File {
  webkitRelativePath: string;
}

// pose_debug/<targetName>/<frameFolder>/<fileName> — the per-target-subfolder
// layout used by the RANSAC multi-target pipeline (Tappo_1, target_0, ...).
type MultiTargetFileIndex = Map<string, Map<number, Map<string, FileWithRelativePath>>>;

// The interval at 1x speed; actual delay is this divided by the current
// playback speed multiplier, so 2x plays twice as fast.
const BASE_PLAYBACK_INTERVAL_MS = 400;

function extractFrameNumber(folderName: string): number | null {
  const match = folderName.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export type ReplayMode = 'single' | 'multi' | null;

export function useReplayUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const loaderRef = useRef(new PLYLoader());

  const [mode, setMode] = useState<ReplayMode>(null);
  const [sequenceName, setSequenceName] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_PLAYBACK_SPEED);

  // Single-target state — unchanged root/frame_NNNNNN/... behavior.
  const [entries, setEntries] = useState<ReplayFrameEntry[]>([]);
  const [currentFrameData, setCurrentFrameData] = useState<ReplayFrameData | null>(null);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FRAME_FILE_SPECS.map((spec) => [spec.id, true]))
  );

  // Multi-target state — pose_debug/<target>/frame_NNNNNN/... layout. Visible
  // clouds are tracked in the same `visibility` record as single-target mode
  // — multi-target cloud ids are namespaced as "<targetName>:<specId>" so
  // they never collide with the plain spec ids used above.
  const multiIndexRef = useRef<MultiTargetFileIndex>(new Map());
  const [targets, setTargets] = useState<string[]>([]);
  const [frameNumbers, setFrameNumbers] = useState<number[]>([]);
  const [targetFrameData, setTargetFrameData] = useState<ReplayTargetFrameData[]>([]);

  const cacheRef = useRef<Map<string, ReplayFrameData>>(new Map());
  const multiCacheRef = useRef<Map<number, ReplayTargetFrameData[]>>(new Map());
  const requestIdRef = useRef(0);

  const totalFrames = mode === 'multi' ? frameNumbers.length : entries.length;
  const currentFrameLabel =
    mode === 'multi' ? (frameNumbers[currentIndex] !== undefined ? String(frameNumbers[currentIndex]) : null) : entries[currentIndex]?.id ?? null;

  const openFolderPicker = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const loadFrame = useCallback(async (entry: ReplayFrameEntry): Promise<ReplayFrameData> => {
    const cached = cacheRef.current.get(entry.id);
    if (cached) return cached;

    const clouds: ReplayFrameData['clouds'] = [];
    for (const spec of FRAME_FILE_SPECS) {
      const file = entry.files.get(spec.fileName);
      if (!file) continue;
      const { geometry, pointCount } = await parsePlyFile(file, loaderRef.current);
      clouds.push({
        id: spec.id,
        fileName: spec.fileName,
        description: spec.description,
        color: spec.color,
        visible: true,
        pointCount,
        geometry,
      });
    }

    const transformsFile = entry.files.get(TRANSFORMS_FILE_NAME);
    const transformsText = transformsFile ? await transformsFile.text() : null;

    const data: ReplayFrameData = { clouds, transformsText };
    cacheRef.current.set(entry.id, data);
    return data;
  }, []);

  const loadMultiFrame = useCallback(
    async (frameNumber: number): Promise<ReplayTargetFrameData[]> => {
      const cached = multiCacheRef.current.get(frameNumber);
      if (cached) return cached;

      const results: ReplayTargetFrameData[] = [];
      for (let i = 0; i < targets.length; i++) {
        const targetName = targets[i];
        const color = TARGET_COLOR_PALETTE[i % TARGET_COLOR_PALETTE.length];
        const fileMap = multiIndexRef.current.get(targetName)?.get(frameNumber);
        const clouds: ReplayTargetFrameData['clouds'] = [];
        const missing: string[] = [];

        for (let specIndex = 0; specIndex < RANSAC_FRAME_FILE_SPECS.length; specIndex++) {
          const spec = RANSAC_FRAME_FILE_SPECS[specIndex];
          const file = fileMap?.get(spec.fileName);
          if (!file) {
            missing.push(spec.fileName);
            continue;
          }
          const { geometry, pointCount } = await parsePlyFile(file, loaderRef.current);
          clouds.push({
            id: `${targetName}:${spec.id}`,
            fileName: spec.fileName,
            description: spec.description,
            color: targetCloudShade(color, specIndex, RANSAC_FRAME_FILE_SPECS.length),
            visible: true,
            pointCount,
            geometry,
            targetName,
          });
        }

        const transformsFile = fileMap?.get(TRANSFORMS_FILE_NAME);
        const transformsText = transformsFile ? await transformsFile.text() : null;
        if (!transformsFile) missing.push(TRANSFORMS_FILE_NAME);

        results.push({ targetName, color, clouds, transformsText, missingFiles: missing });
      }

      multiCacheRef.current.set(frameNumber, results);
      return results;
    },
    [targets]
  );

  const handleFilesSelected = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsScanning(true);
    setScanError(null);
    cacheRef.current = new Map();
    multiCacheRef.current = new Map();

    try {
      const files = Array.from(fileList) as FileWithRelativePath[];
      let rootName: string | null = null;

      // ---- Try single-target: root/<frameFolder>/<file> ----
      const byFrame = new Map<string, ReplayFrameEntry>();
      files.forEach((file) => {
        const relPath = file.webkitRelativePath || file.name;
        const segments = relPath.split('/');
        if (segments.length !== 3) return;
        if (rootName === null) rootName = segments[0];

        const frameFolder = segments[1];
        const fileName = segments[2];
        const frameNumber = extractFrameNumber(frameFolder);
        if (frameNumber === null) return;

        let entry = byFrame.get(frameFolder);
        if (!entry) {
          entry = { id: frameFolder, frameNumber, files: new Map() };
          byFrame.set(frameFolder, entry);
        }
        entry.files.set(fileName, file);
      });

      const isFlatSingleTarget = Array.from(byFrame.values()).some((entry) =>
        FRAME_FILE_SPECS.some((spec) => entry.files.has(spec.fileName))
      );

      if (isFlatSingleTarget) {
        multiIndexRef.current = new Map();
        setTargets([]);
        setFrameNumbers([]);
        setTargetFrameData([]);

        const sortedEntries = Array.from(byFrame.values()).sort((a, b) => a.frameNumber - b.frameNumber);
        setSequenceName(rootName);
        setEntries(sortedEntries);
        setCurrentIndex(0);
        setIsPlaying(false);
        setMode('single');
        return;
      }

      // ---- Try multi-target: root/<target>/<frameFolder>/<file> ----
      // Target discovery (which folders count as a "target") is intentionally
      // decoupled from whether its inner frame_NNNNNN/<file> structure parses
      // cleanly — otherwise a single target with an unexpected layout (an
      // unparseable frame-folder name, missing files, extra nesting) would
      // silently vanish from the list entirely instead of showing up with a
      // "missing" state that can be diagnosed.
      rootName = null;
      const index: MultiTargetFileIndex = new Map();
      const discoveredTargets = new Set<string>();
      files.forEach((file) => {
        const relPath = file.webkitRelativePath || file.name;
        const segments = relPath.split('/');
        if (segments.length < 3) return;
        if (rootName === null) rootName = segments[0];

        const targetName = segments[1];
        discoveredTargets.add(targetName);

        if (segments.length !== 4) return;
        const [, , frameFolder, fileName] = segments;
        const frameNumber = extractFrameNumber(frameFolder);
        if (frameNumber === null) return;

        let byFrameNumber = index.get(targetName);
        if (!byFrameNumber) {
          byFrameNumber = new Map();
          index.set(targetName, byFrameNumber);
        }
        let byFile = byFrameNumber.get(frameNumber);
        if (!byFile) {
          byFile = new Map();
          byFrameNumber.set(frameNumber, byFile);
        }
        byFile.set(fileName, file);
      });

      setEntries([]);
      setCurrentFrameData(null);

      if (discoveredTargets.size === 0) {
        multiIndexRef.current = new Map();
        setMode(null);
        setSequenceName(null);
        setTargets([]);
        setFrameNumbers([]);
        setTargetFrameData([]);
        setScanError(
          'No frame subfolders (e.g. "frame_000123") were found in the selected folder.'
        );
        return;
      }

      const sortedTargets = Array.from(discoveredTargets).sort();
      const frameNumberSet = new Set<number>();
      index.forEach((byFrameNumber) => byFrameNumber.forEach((_files, frameNumber) => frameNumberSet.add(frameNumber)));
      const sortedFrameNumbers = Array.from(frameNumberSet).sort((a, b) => a - b);

      multiIndexRef.current = index;
      setSequenceName(rootName);
      setTargets(sortedTargets);
      setFrameNumbers(sortedFrameNumbers);
      setCurrentIndex(0);
      setIsPlaying(false);
      setMode('multi');
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Failed to read the selected folder.');
    } finally {
      setIsScanning(false);
    }
  }, []);

  const onInputChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFilesSelected(event.target.files);
      event.target.value = '';
    },
    [handleFilesSelected]
  );

  // Load (or fetch from cache) the current single-target frame's geometries
  // whenever the index or the loaded sequence changes; frames are parsed
  // lazily/on-demand rather than all upfront so large sequences stay responsive.
  useEffect(() => {
    if (mode !== 'single') return;

    const entry = entries[currentIndex];
    if (!entry) {
      setCurrentFrameData(null);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsFrameLoading(true);

    loadFrame(entry).then((data) => {
      if (requestIdRef.current !== requestId) return;
      setCurrentFrameData(data);
      setIsFrameLoading(false);

      const nextEntry = entries[currentIndex + 1];
      if (nextEntry && !cacheRef.current.has(nextEntry.id)) {
        void loadFrame(nextEntry);
      }
    });
  }, [mode, entries, currentIndex, loadFrame]);

  // Same lazy-load-plus-prefetch strategy for multi-target frames, except
  // every visible target's clouds are loaded together for the shared frame number.
  useEffect(() => {
    if (mode !== 'multi') return;

    const frameNumber = frameNumbers[currentIndex];
    if (frameNumber === undefined) {
      setTargetFrameData([]);
      return;
    }

    const requestId = ++requestIdRef.current;
    setIsFrameLoading(true);

    loadMultiFrame(frameNumber).then((data) => {
      if (requestIdRef.current !== requestId) return;
      setTargetFrameData(data);
      setIsFrameLoading(false);

      const nextFrameNumber = frameNumbers[currentIndex + 1];
      if (nextFrameNumber !== undefined && !multiCacheRef.current.has(nextFrameNumber)) {
        void loadMultiFrame(nextFrameNumber);
      }
    });
  }, [mode, frameNumbers, currentIndex, loadMultiFrame]);

  // Playback — advance one frame at an interval scaled by playbackSpeed,
  // stopping at the end.
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= totalFrames - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, BASE_PLAYBACK_INTERVAL_MS / playbackSpeed);

    return () => clearInterval(interval);
  }, [isPlaying, totalFrames, playbackSpeed]);

  const play = useCallback(() => {
    if (totalFrames > 1) setIsPlaying(true);
  }, [totalFrames]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const goToIndex = useCallback(
    (index: number) => {
      setIsPlaying(false);
      setCurrentIndex(Math.min(Math.max(index, 0), Math.max(totalFrames - 1, 0)));
    },
    [totalFrames]
  );

  const next = useCallback(() => goToIndex(currentIndex + 1), [currentIndex, goToIndex]);
  const previous = useCallback(() => goToIndex(currentIndex - 1), [currentIndex, goToIndex]);

  const toggleVisibility = useCallback((id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Master per-target toggle — derives the next state from the target's
  // clouds' actual visibility so it stays correct after individual clouds
  // have been toggled independently via toggleVisibility.
  const toggleTargetVisibility = useCallback((targetName: string) => {
    setVisibility((prev) => {
      const allVisible = RANSAC_FRAME_FILE_SPECS.every((spec) => prev[`${targetName}:${spec.id}`] ?? true);
      const next = { ...prev };
      RANSAC_FRAME_FILE_SPECS.forEach((spec) => {
        next[`${targetName}:${spec.id}`] = !allVisible;
      });
      return next;
    });
  }, []);

  return {
    inputRef,
    onInputChange,
    openFolderPicker,
    mode,
    sequenceName,
    entries,
    currentIndex,
    currentEntry: entries[currentIndex] ?? null,
    currentFrameData,
    isScanning,
    isFrameLoading,
    scanError,
    visibility,
    toggleVisibility,
    isPlaying,
    playbackSpeed,
    setPlaybackSpeed,
    play,
    pause,
    goToIndex,
    next,
    previous,
    targets,
    frameNumbers,
    targetFrameData,
    toggleTargetVisibility,
    totalFrames,
    currentFrameLabel,
  };
}
