'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import * as THREE from 'three';
import {
  IconChevronLeft,
  IconUpload,
  IconLoader,
  Icon3dCubeSphere,
  IconGridDots,
} from '@tabler/icons-react';
import { ModalPortal } from '@/ui/ModalPortal';
import { PointCloudViewer } from '../pointCloudShared/components/PointCloudViewer';
import { TransformsPanel } from '../pointCloudShared/components/TransformsPanel';
import { InsertedCadObject, LoadedFrameCloud } from '../pointCloudShared/types';
import { FrameChecklist } from './components/FrameChecklist';
import { CadViewer } from './components/CadViewer';
import { PointCloudConversionModal } from './components/PointCloudConversionModal';
import { PointCloudFusionModal } from './components/PointCloudFusionModal';
import { useFrameUpload } from './hooks/useFrameUpload';
import { useCadUpload } from './hooks/useCadUpload';
import { useCadPointCloud } from './hooks/useCadPointCloud';
import { useExtraPointClouds } from './hooks/useExtraPointClouds';
import { AxisClip, ClipBounds, encodeAsciiPly, filterPointsWithinClip, scaleGeometry } from './cadToPointCloud';

// Distinct from FRAME_FILE_SPECS and EXTRA_CLOUD_COLORS so the CAD-derived
// entry stays visually identifiable wherever it's listed alongside frames.
const CAD_POINT_CLOUD_COLOR = 0x818cf8;

export function CloudPointConfigurationPage() {
  const t = useTranslations();
  const locale = useLocale();

  const {
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
  } = useFrameUpload();

  const {
    inputRef: cadInputRef,
    onInputChange: onCadInputChange,
    openFilePicker: openCadFilePicker,
    model: cadModel,
    isLoading: isCadLoading,
    error: cadError,
  } = useCadUpload();

  const {
    inputRef: extraCloudInputRef,
    onInputChange: onExtraCloudInputChange,
    openFilePicker: openExtraCloudFilePicker,
    pointClouds: extraPointClouds,
    isLoading: isExtraCloudLoading,
    error: extraCloudError,
    toggleVisibility: toggleExtraCloudVisibility,
  } = useExtraPointClouds();

  const {
    geometry: cadPointCloud,
    pointCount: cadPointCount,
    isConverting: isConvertingCad,
    error: cadConvertError,
    convert: convertCadToPointCloud,
    reset: resetCadPointCloud,
  } = useCadPointCloud();

  const [voxelSize, setVoxelSize] = useState(0);
  const [clip, setClip] = useState<ClipBounds | null>(null);
  const [exportScale, setExportScale] = useState(1);
  const [isConversionModalOpen, setIsConversionModalOpen] = useState(false);
  const [isFusionModalOpen, setIsFusionModalOpen] = useState(false);
  const [insertedCad, setInsertedCad] = useState<InsertedCadObject | null>(null);

  useEffect(() => {
    resetCadPointCloud();
    setVoxelSize(cadModel?.suggestedVoxelSize ?? 0);
    setExportScale(1);
    setInsertedCad(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cadModel?.fileName]);

  // The export scale factor is applied here, right as the raw conversion
  // output is prepared for display, so the CAD/point-cloud previews, the
  // clip range sliders, and the final PLY export all agree on the same
  // (scaled) units — not just the exported file.
  const safeExportScale = exportScale > 0 ? exportScale : 1;

  const scaledMeshGeometry = useMemo(
    () => (cadModel ? scaleGeometry(cadModel.geometry, safeExportScale) : null),
    [cadModel, safeExportScale]
  );

  const scaledPointCloud = useMemo(
    () => (cadPointCloud ? scaleGeometry(cadPointCloud, safeExportScale) : null),
    [cadPointCloud, safeExportScale]
  );

  // Reset the cutting planes to the cloud's own (scaled) bounds — fully
  // open, no clipping — whenever a (re-)conversion or a scale change
  // produces a new scaled point cloud.
  useEffect(() => {
    if (scaledPointCloud?.boundingBox) {
      const { min, max } = scaledPointCloud.boundingBox;
      setClip({
        x: { min: min.x, max: max.x },
        y: { min: min.y, max: max.y },
        z: { min: min.z, max: max.z },
      });
    } else {
      setClip(null);
    }
  }, [scaledPointCloud]);

  const clipRanges = scaledPointCloud?.boundingBox
    ? { min: scaledPointCloud.boundingBox.min, max: scaledPointCloud.boundingBox.max }
    : null;

  const clippedPointCount = useMemo(() => {
    if (!scaledPointCloud) return 0;
    return filterPointsWithinClip(scaledPointCloud, clip).length / 3;
  }, [scaledPointCloud, clip]);

  const handleExportCadPointCloud = () => {
    if (!scaledPointCloud) return;

    const baseName = cadModel?.fileName.replace(/\.stl$/i, '') ?? 'point-cloud';
    const clipped = filterPointsWithinClip(scaledPointCloud, clip);
    const plyText = encodeAsciiPly(clipped);
    const blob = new Blob([plyText], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${baseName}.ply`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleClipChange = (axis: 'x' | 'y' | 'z', next: AxisClip) => {
    setClip((prev) => (prev ? { ...prev, [axis]: next } : prev));
  };

  // User-added point clouds render and list alongside the pipeline's own
  // frames, sharing the same viewer and checklist since both are just
  // LoadedFrameCloud entries.
  const allFrames = useMemo(() => [...frames, ...extraPointClouds], [frames, extraPointClouds]);

  // The CAD point cloud only exists as a fusable entry once it's been
  // inserted into the main scene — before that it's just a preview, not
  // something actually present alongside the other clouds.
  const cadPointCloudEntry: LoadedFrameCloud | null = useMemo(() => {
    if (!insertedCad || !cadModel) return null;
    return {
      id: 'inserted-cad',
      fileName: cadModel.fileName,
      description: t('leakDetection.cloudPointConfiguration.cadPointCloud'),
      color: CAD_POINT_CLOUD_COLOR,
      visible: true,
      pointCount: insertedCad.pointCloudGeometry.getAttribute('position').count,
      geometry: insertedCad.pointCloudGeometry,
    };
  }, [insertedCad, cadModel, t]);

  const fusableFrames = useMemo(
    () => (cadPointCloudEntry ? [...allFrames, cadPointCloudEntry] : allFrames),
    [allFrames, cadPointCloudEntry]
  );

  const handleToggleFrameVisibility = (id: string) => {
    if (extraPointClouds.some((cloud) => cloud.id === id)) {
      toggleExtraCloudVisibility(id);
    } else {
      toggleVisibility(id);
    }
  };

  const isInsertedInScene = insertedCad !== null;

  const handleToggleInsertInScene = () => {
    if (insertedCad) {
      setInsertedCad(null);
      return;
    }

    if (!scaledMeshGeometry || !scaledPointCloud) return;

    const clippedPositions = filterPointsWithinClip(scaledPointCloud, clip);
    const clippedGeometry = new THREE.BufferGeometry();
    clippedGeometry.setAttribute('position', new THREE.BufferAttribute(clippedPositions, 3));
    clippedGeometry.computeBoundingBox();

    setInsertedCad({ meshGeometry: scaledMeshGeometry, pointCloudGeometry: clippedGeometry });
  };

  return (
    <div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center gap-4 mb-6">
          <Link
            href={`/${locale}/process/leak-detection`}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label={t('leakDetection.configure.back')}
          >
            <IconChevronLeft size={20} className="text-slate-600 dark:text-slate-400" />
          </Link>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {t('leakDetection.cloudPointConfiguration.title')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-500">
              {folderName ?? t('leakDetection.cloudPointConfiguration.subtitle')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 h-[65vh]">
            <PointCloudViewer
              frames={allFrames}
              emptyMessage={t('leakDetection.cloudPointConfiguration.emptyViewer')}
              transformsText={transformsText}
              insertedCad={insertedCad}
            />
          </div>

          <div className="space-y-4">
            <input
              ref={cadInputRef}
              type="file"
              accept=".stl"
              onChange={onCadInputChange}
              style={{ display: 'none' }}
            />

            <button
              onClick={openCadFilePicker}
              disabled={isCadLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-violet-500/20 to-fuchsia-500/20 border border-violet-500/30 text-violet-700 dark:text-violet-300 hover:bg-violet-500/30 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCadLoading ? (
                <IconLoader className="animate-spin" size={18} />
              ) : (
                <Icon3dCubeSphere size={18} />
              )}
              {t('leakDetection.cloudPointConfiguration.uploadCad')}
            </button>

            {cadError && <p className="text-xs text-red-600 dark:text-red-400">{cadError}</p>}

            <CadViewer
              meshGeometry={scaledMeshGeometry}
              pointCloudGeometry={scaledPointCloud}
              clip={clip}
              emptyMessage={t('leakDetection.cloudPointConfiguration.cadEmptyViewer')}
              isInsertedInScene={isInsertedInScene}
              onToggleInsertInScene={handleToggleInsertInScene}
            />

            {cadModel && (
              <p className="text-xs text-slate-500 dark:text-slate-500 truncate" title={cadModel.fileName}>
                {cadModel.fileName}
              </p>
            )}

            {cadModel && (
              <button
                onClick={() => setIsConversionModalOpen(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors text-xs font-semibold"
              >
                <IconGridDots size={16} />
                {t('leakDetection.cloudPointConfiguration.convertToPointCloud')}
              </button>
            )}

            <input
              ref={inputRef}
              type="file"
              multiple
              onChange={onInputChange}
              style={{ display: 'none' }}
              {...({ webkitdirectory: 'true', directory: 'true' } as Record<string, string>)}
            />

            <button
              onClick={openFolderPicker}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-500/20 to-green-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/30 transition-colors text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <IconLoader className="animate-spin" size={18} />
              ) : (
                <IconUpload size={18} />
              )}
              {t('leakDetection.cloudPointConfiguration.uploadFrame')}
            </button>

            {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

            <TransformsPanel transformsText={transformsText} />
          </div>

          <div className="lg:col-span-3">
            <input
              ref={extraCloudInputRef}
              type="file"
              accept=".ply"
              onChange={onExtraCloudInputChange}
              style={{ display: 'none' }}
            />

            <FrameChecklist
              frames={allFrames}
              missingFiles={missingFiles}
              onToggle={handleToggleFrameVisibility}
              onAddPointCloud={openExtraCloudFilePicker}
              isAddingPointCloud={isExtraCloudLoading}
              onOpenFusion={() => setIsFusionModalOpen(true)}
              isFusionDisabled={fusableFrames.length === 0}
            />

            {extraCloudError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{extraCloudError}</p>
            )}
          </div>
        </div>
      </main>

      <ModalPortal isOpen={isConversionModalOpen} onClose={() => setIsConversionModalOpen(false)}>
        {cadModel && scaledMeshGeometry && (
          <PointCloudConversionModal
            fileName={cadModel.fileName}
            meshGeometry={scaledMeshGeometry}
            pointCloudGeometry={scaledPointCloud}
            pointCount={cadPointCount}
            clippedPointCount={clippedPointCount}
            isConverting={isConvertingCad}
            convertError={cadConvertError}
            voxelSize={voxelSize}
            onVoxelSizeChange={setVoxelSize}
            onConvert={() => convertCadToPointCloud(cadModel.geometry, voxelSize)}
            clip={clip}
            clipRanges={clipRanges}
            onClipChange={handleClipChange}
            exportScale={exportScale}
            onExportScaleChange={setExportScale}
            onExportPly={handleExportCadPointCloud}
            isInsertedInScene={isInsertedInScene}
            onToggleInsertInScene={handleToggleInsertInScene}
            onDone={() => setIsConversionModalOpen(false)}
          />
        )}
      </ModalPortal>

      <ModalPortal isOpen={isFusionModalOpen} onClose={() => setIsFusionModalOpen(false)}>
        <PointCloudFusionModal frames={fusableFrames} onClose={() => setIsFusionModalOpen(false)} />
      </ModalPortal>
    </div>
  );
}
