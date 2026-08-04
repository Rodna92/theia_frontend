'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PLYLoader } from 'three/examples/jsm/loaders/PLYLoader.js';
import { FRAME_FILE_SPECS, TRANSFORMS_FILE_NAME } from '../../pointCloudShared/types';
import { parsePlyFile } from '../../pointCloudShared/plyGeometry';
import { ReplayFrameEntry, ReplayFrameData } from '../types';

interface FileWithRelativePath extends File {
  webkitRelativePath: string;
}

const PLAYBACK_INTERVAL_MS = 400;

function extractFrameNumber(folderName: string): number | null {
  const match = folderName.match(/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

export function useReplayUpload() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [sequenceName, setSequenceName] = useState<string | null>(null);
  const [entries, setEntries] = useState<ReplayFrameEntry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [currentFrameData, setCurrentFrameData] = useState<ReplayFrameData | null>(null);
  const [isFrameLoading, setIsFrameLoading] = useState(false);
  const [visibility, setVisibility] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(FRAME_FILE_SPECS.map((spec) => [spec.id, true]))
  );
  const [isPlaying, setIsPlaying] = useState(false);

  const cacheRef = useRef<Map<string, ReplayFrameData>>(new Map());
  const requestIdRef = useRef(0);
  const loaderRef = useRef(new PLYLoader());

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

  const handleFilesSelected = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    setIsScanning(true);
    setScanError(null);
    cacheRef.current = new Map();

    try {
      const files = Array.from(fileList) as FileWithRelativePath[];
      const byFrame = new Map<string, ReplayFrameEntry>();
      let rootName: string | null = null;

      files.forEach((file) => {
        const relPath = file.webkitRelativePath || file.name;
        const segments = relPath.split('/');
        if (segments.length < 3) return;

        if (rootName === null) rootName = segments[0];

        const frameFolder = segments[1];
        const fileName = segments[segments.length - 1];
        const frameNumber = extractFrameNumber(frameFolder);
        if (frameNumber === null) return;

        let entry = byFrame.get(frameFolder);
        if (!entry) {
          entry = { id: frameFolder, frameNumber, files: new Map() };
          byFrame.set(frameFolder, entry);
        }
        entry.files.set(fileName, file);
      });

      const sortedEntries = Array.from(byFrame.values()).sort(
        (a, b) => a.frameNumber - b.frameNumber
      );

      if (sortedEntries.length === 0) {
        setEntries([]);
        setSequenceName(null);
        setCurrentFrameData(null);
        setScanError(
          'No frame subfolders (e.g. "frame_000123") were found in the selected folder.'
        );
        return;
      }

      setSequenceName(rootName);
      setEntries(sortedEntries);
      setCurrentIndex(0);
      setIsPlaying(false);
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

  // Load (or fetch from cache) the current frame's geometries whenever the
  // index or the loaded sequence changes; frames are parsed lazily/on-demand
  // rather than all upfront so large sequences stay responsive.
  useEffect(() => {
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
  }, [entries, currentIndex, loadFrame]);

  // Playback — advance one frame at a fixed interval, stopping at the end.
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= entries.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, PLAYBACK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isPlaying, entries.length]);

  const play = useCallback(() => {
    if (entries.length > 1) setIsPlaying(true);
  }, [entries.length]);

  const pause = useCallback(() => setIsPlaying(false), []);

  const goToIndex = useCallback(
    (index: number) => {
      setIsPlaying(false);
      setCurrentIndex(Math.min(Math.max(index, 0), Math.max(entries.length - 1, 0)));
    },
    [entries.length]
  );

  const next = useCallback(() => goToIndex(currentIndex + 1), [currentIndex, goToIndex]);
  const previous = useCallback(() => goToIndex(currentIndex - 1), [currentIndex, goToIndex]);

  const toggleVisibility = useCallback((id: string) => {
    setVisibility((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  return {
    inputRef,
    onInputChange,
    openFolderPicker,
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
    play,
    pause,
    goToIndex,
    next,
    previous,
  };
}
