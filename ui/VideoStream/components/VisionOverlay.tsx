'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { MetadataMessage, OverlayMetadata } from '@/client/types/media';
import { createMetadataClient } from '@/client/services/metadata';
import { METADATA_WS_URL } from '@/client/config';

interface VisionOverlayProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  currentVideoTimestamp?: number; 
  streamName: string;
  statsWindowSize?: number; 
}

// Helper type for the history buffer
type MetricHistory = {
  processingTimeMs: number[];
  endToEndLagMs: number[];
  visionDelayMs: number[];
  transportMs: number[];
  currentDelta: number[];
  fps: number[]; // Added FPS buffer
};

// --- Minimalist Graph Component ---
const Sparkline = ({ 
  data, 
  max, 
  height = 24, 
  width = 60, 
  threshold,
  color = "stroke-blue-600 dark:stroke-slate-400"
}: { 
  data: number[], 
  max: number, 
  height?: number, 
  width?: number, 
  threshold?: number,
  color?: string 
}) => {
  if (!data || data.length === 0) return <div style={{ width, height }} />;

  const step = width / (data.length - 1 || 1);
  
  const points = data.map((val, i) => {
    const x = i * step;
    const normalized = Math.min(Math.max(val, 0), max); 
    const y = height - (normalized / max) * height;
    return `${x},${y}`;
  }).join(' ');

  const thresholdY = threshold !== undefined 
    ? height - (Math.min(threshold, max) / max) * height 
    : 0;

  return (
    <svg width={width} height={height} className="overflow-visible">
      {threshold !== undefined && (
        <g>
          <line 
            x1="0" y1={thresholdY} 
            x2={width} y2={thresholdY} 
            className="stroke-black/40 dark:stroke-white/40"
            strokeWidth="1" 
            strokeDasharray="2,2" 
          />
          <text 
            x={width + 4} 
            y={thresholdY + 3} 
            fontSize="8" 
            className="fill-gray-900/60 dark:fill-white/40" 
            fontFamily="monospace"
          >
            {threshold}
          </text>
        </g>
      )}
      
      <polyline 
        points={points} 
        fill="none" 
        className={color} 
        strokeWidth="1" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
      />
    </svg>
  );
};

export function VisionOverlay({ 
  videoRef, 
  currentVideoTimestamp, 
  streamName,
  statsWindowSize = 10,
}: VisionOverlayProps) {
  const t = useTranslations();
  const SYNC_ACCEPTANCE_WINDOW_MS = 100;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentVideoTimestampRef = useRef<number>(0);
  
  // Track previous emission time to calculate FPS delta
  const lastOverlayEmissionRef = useRef<number>(0);

  const statsHistoryRef = useRef<MetricHistory>({
    processingTimeMs: [],
    endToEndLagMs: [],
    visionDelayMs: [],
    transportMs: [],
    currentDelta: [],
    fps: [], // Initialize FPS buffer
  });

  // Metrics State
  const [metrics, setMetrics] = useState({
    processingTimeMs: 0,
    endToEndLagMs: 0,
    visionDelayMs: 0, 
    transportMs: 0,
    currentDelta: 0,
    fps: 0, // Initialize FPS state
    visionHistory: [] as number[],
    transportHistory: [] as number[]
  });
  
  const [hasConnectionError, setHasConnectionError] = useState(false);
  const [isMetadataLive, setIsMetadataLive] = useState(false);
  const lastMsgTimeRef = useRef<number>(0);

  useEffect(() => {
    currentVideoTimestampRef.current = currentVideoTimestamp || 0;
  }, [currentVideoTimestamp]);

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  const drawFrame = useCallback((data: OverlayMetadata) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isDetectionType = [
      'leak_detection', 
      'fluid_doser'
    ].includes(data.type);

    if (isDetectionType && Array.isArray(data.data)) {
      data.data.forEach((element: any) => {
        switch (element.type) {
          case 'bounding_box': {
            const { x, y, w, h, label, confidence } = element;
            const rx = (x / 100) * canvas.width;
            const ry = (y / 100) * canvas.height;
            const rw = (w / 100) * canvas.width;
            const rh = (h / 100) * canvas.height;

            ctx.strokeStyle = '#ef4444'; 
            ctx.lineWidth = 2; 
            ctx.strokeRect(rx, ry, rw, rh);
            
            ctx.fillStyle = '#ef4444';
            const text = `${label} ${(confidence * 100).toFixed(0)}%`;
            ctx.font = '12px monospace';
            const tm = ctx.measureText(text);
            ctx.fillRect(rx, ry - 20, tm.width + 8, 20);
            ctx.fillStyle = '#ffffff'; 
            ctx.fillText(text, rx + 4, ry - 6);
            break;
          }
          case 'mask': {
            const { points, label, confidence } = element;
            if (!Array.isArray(points) || points.length < 2) break;

            ctx.beginPath();
            points.forEach(([x, y], index) => {
              const rx = (x / 100) * canvas.width;
              const ry = (y / 100) * canvas.height;
              if (index === 0) ctx.moveTo(rx, ry);
              else ctx.lineTo(rx, ry);
            });
            ctx.closePath();

            // Fill with semi-transparent red
            ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
            ctx.fill();

            // Stroke with solid red
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw label at the first point
            const [firstX, firstY] = points[0];
            const lx = (firstX / 100) * canvas.width;
            const ly = (firstY / 100) * canvas.height;

            ctx.fillStyle = '#ef4444';
            const text = `${label} ${(confidence * 100).toFixed(0)}%`;
            ctx.font = '12px monospace';
            const tm = ctx.measureText(text);
            ctx.fillRect(lx, ly - 20, tm.width + 8, 20);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(text, lx + 4, ly - 6);
            break;
          }
          case 'point_cloud': {
            // Point cloud implementation will be added here later
            break;
          }
          default:
            // Fallback for legacy data or unknown types
            if (!element.type && element.x !== undefined) {
                const { x, y, w, h, label, confidence } = element;
                const rx = (x / 100) * canvas.width;
                const ry = (y / 100) * canvas.height;
                const rw = (w / 100) * canvas.width;
                const rh = (h / 100) * canvas.height;

                ctx.strokeStyle = '#ef4444'; 
                ctx.lineWidth = 2; 
                ctx.strokeRect(rx, ry, rw, rh);
                
                ctx.fillStyle = '#ef4444';
                const text = `${label} ${(confidence * 100).toFixed(0)}%`;
                ctx.font = '12px monospace';
                const tm = ctx.measureText(text);
                ctx.fillRect(rx, ry - 20, tm.width + 8, 20);
                ctx.fillStyle = '#ffffff'; 
                ctx.fillText(text, rx + 4, ry - 6);
            }
            break;
        }
      });
    }
  }, [videoRef]);

  useEffect(() => {
    // Construct the websocket URL using the base from config and appending the streamName
    // Note: If METADATA_WS_URL already includes a path, this might need more robust parsing
    // but assuming it's a base URL or we replace the end.
    // Given the .env example: ws://127.0.0.1:7070/ws/leak-detection
    // We'll replace the last segment with the current streamName
    const baseUrl = METADATA_WS_URL.endsWith('/') ? METADATA_WS_URL.slice(0, -1) : METADATA_WS_URL;
    const segments = baseUrl.split('/');
    segments[segments.length - 1] = streamName;
    const wsUrl = segments.join('/');
    
    const client = createMetadataClient(wsUrl);
    let isMounted = true;

    // Heartbeat check for internal state
    const hb = setInterval(() => {
      if (lastMsgTimeRef.current > 0 && Date.now() - lastMsgTimeRef.current > 2000) {
        setIsMetadataLive(false);
      }
    }, 1000);

    const calculateMovingAverage = (key: keyof MetricHistory, newValue: number): number => {
      const buffer = statsHistoryRef.current[key];
      buffer.push(newValue);
      if (buffer.length > statsWindowSize) buffer.shift();
      const sum = buffer.reduce((a, b) => a + b, 0);
      return sum / buffer.length;
    };

    client.connect((msg: MetadataMessage) => {
      if (!isMounted) return;
      setHasConnectionError(prev => (prev ? false : prev));

      if (!msg.overlay) return;
      
      // Mark as live when receiving overlay data
      lastMsgTimeRef.current = Date.now();
      setIsMetadataLive(true);

      const meta = msg.overlay;
      const receivedAtMs = Date.now();

      requestAnimationFrame(() => drawFrame(meta));

      const currentVideoTs = currentVideoTimestampRef.current;
      
      // --- Calculate FPS ---
      let instantFps = 0;
      // If we have a previous emission time, calculate delta
      if (lastOverlayEmissionRef.current > 0) {
        const deltaMs = meta.overlayEmittedAtMs - lastOverlayEmissionRef.current;
        // Avoid division by zero
        if (deltaMs > 0) {
          instantFps = 1000 / deltaMs;
        }
      }
      // Update the reference for the next frame
      lastOverlayEmissionRef.current = meta.overlayEmittedAtMs;

      // --- Calculate Other Delays ---
      const rawVisionDelay = meta.overlayEmittedAtMs - meta.frameCapturedAtMs;
      const rawTransportDelay = receivedAtMs - meta.overlayEmittedAtMs;
      const rawEndToEndLag = receivedAtMs - meta.frameCapturedAtMs;
      const rawDelta = Math.abs(currentVideoTs - meta.frameSeq);

      setMetrics({
        processingTimeMs: calculateMovingAverage('processingTimeMs', meta.processingTimeMs),
        endToEndLagMs: calculateMovingAverage('endToEndLagMs', rawEndToEndLag),
        visionDelayMs: calculateMovingAverage('visionDelayMs', rawVisionDelay),
        transportMs: calculateMovingAverage('transportMs', rawTransportDelay),
        currentDelta: calculateMovingAverage('currentDelta', rawDelta),
        fps: calculateMovingAverage('fps', instantFps),
        visionHistory: [...statsHistoryRef.current.visionDelayMs],
        transportHistory: [...statsHistoryRef.current.transportMs],
      });

    }, (err) => {
      if (isMounted) {
        console.warn("Vision WS Error:", err);
        setHasConnectionError(true);
      }
    }).catch(() => {
      if (isMounted) setHasConnectionError(true);
    });

    return () => {
      isMounted = false;
      clearInterval(hb);
      client.disconnect();
      clearCanvas();
      lastOverlayEmissionRef.current = 0;
      statsHistoryRef.current = {
        processingTimeMs: [],
        endToEndLagMs: [],
        visionDelayMs: [],
        transportMs: [],
        currentDelta: [],
        fps: [],
      };
    };
  }, [streamName, drawFrame, statsWindowSize]); 

  const inferenceColor = hasConnectionError ? 'text-slate-500' : 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]';
  const isSyncColor = metrics.endToEndLagMs > SYNC_ACCEPTANCE_WINDOW_MS ? 'text-slate-500' : 'text-blue-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]';
  
  // Translation key helper: "leak-detection" -> "leakDetection"
  const translationPrefix = streamName.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
  
  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 pointer-events-none z-10" />
      {(isMetadataLive) && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 pointer-events-auto">
          <div className="group flex items-center gap-3 px-6 py-2 rounded-full 
                          bg-white/10 hover:bg-white/20 backdrop-blur-xl 
                          border border-white/10 hover:border-white/20 
                          shadow-lg transition-all cursor-help">  
            <span className={`text-[12px] font-bold uppercase ${inferenceColor} min-w-18`}>
              Inference
            </span>
            
            {/* Display FPS with 1 decimal place */}
            <span className="text-slate-200 text-[10px] w-12 text-right tabular-nums">
               {metrics.fps.toFixed(1)} FPS
            </span>

            <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full border border-slate-200/70 text-slate-300 dark:border-white/10 text-[10px]">i</span>
            
            <span className="text-slate-200 w-14 text-[10px]">{metrics.endToEndLagMs.toFixed(0)} ms E2E</span>
            <span className={`text-[10px] px-1 font-bold ${isSyncColor} min-w-18`}>
              SYNC
            </span>

            {/* TOOLTIP: 
              - bottom-full: Places it above the element
              - mb-2: Adds gap
              - left-1/2 -translate-x-1/2: Centers it horizontally relative to the pill
            */}
            <div className="pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity 
                            duration-150 absolute bottom-full mb-3 left-1/2 -translate-x-1/2 w-[360px] p-4 rounded-xl 
                            bg-white/60 border border-slate-200/70 shadow-xl 
                            backdrop-blur-xl text-xs text-slate-900 
                            dark:bg-slate-950/80 dark:border-white/10 dark:text-slate-200 z-50">
              <div className='flex flex row justify-between'>
                <span className="text-slate-900 dark:text-slate-200 w-10 text-[10px]">Avg {statsWindowSize}f</span>
                {/* <span className="text-slate-200 w-10 text-[10px]">{metrics.currentDelta}</span> */}
                <span className="text-slate-900 dark:text-slate-200 w-10 text-[10px]">{currentVideoTimestamp}</span>
              </div>
              {/* GRID LAYOUT for Graphs */}
              <div className="flex flex-row justify-between gap-6">
                 {/* Vision Cell */}
                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                      <span>Vision</span>
                      <span className="text-slate-900 dark:text-slate-200 font-mono">{metrics.visionDelayMs.toFixed(0)}ms</span>
                    </div>
                    <Sparkline 
                       data={metrics.visionHistory} 
                       max={SYNC_ACCEPTANCE_WINDOW_MS * 2} 
                       threshold={SYNC_ACCEPTANCE_WINDOW_MS}
                       width={140}
                    />
                 </div>

                 {/* Transport Cell */}
                 <div className="flex flex-col gap-1">
                    <div className="flex justify-between text-[10px] text-slate-500 font-medium">
                      <span>Network</span>
                      <span className="text-slate-900 dark:text-slate-200 font-mono">{metrics.transportMs.toFixed(0)}ms</span>
                    </div>
                    <Sparkline 
                       data={metrics.transportHistory} 
                       max={20} 
                       threshold={10}
                       width={140}
                    />
                 </div>
              </div>                         
            </div>
          </div>
        </div>
      )}
      {/* Metadata Status Pill */}
        {(!isMetadataLive) && (
          <div className={`absolute bottom-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 
            rounded-full bg-white/10 border shadow-sm backdrop-blur-xl transition-colors duration-300
            border-orange-500/30 dark:border-orange-500/40
          `}>
            <div className={`w-2 h-2 rounded-full bg-orange-500`} />
            <span className={`text-xs font-semibold tracking-wide text-orange-600 dark:text-orange-400`}>
              {t(`${translationPrefix}.status.metadataNotPresent`) || 'No Metadata'}
            </span>
          </div>
        )}
    </>
  );
}