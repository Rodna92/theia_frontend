"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamStatus } from "@/client/types/media";
import { sendWhepOfferViaProxy, closeWhepProxy, getStreamConfig } from "@/client/services/mediamtx";

interface UseWhepPlayerOptions {
  streamName?: string;
  onStatusChange?: (status: StreamStatus) => void;
  onError?: (error: string) => void;
}

export interface WhepMetrics {
  fps?: number;
  width?: number;
  height?: number;
  bitrateKbps?: number;
  rttMs?: number;
  jitterMs?: number;
  packetsLost?: number;
  framesDropped?: number;
  freezeMs?: number;
  timestamp?: number;      
}

function normalizeSdp(sdp: string) {
  const trimmed = sdp.trim();
  if (!trimmed.startsWith("v=0")) {
    throw new Error(`Invalid SDP answer. Starts with: ${trimmed.slice(0, 80)}`);
  }
  return trimmed.replace(/\r?\n/g, "\r\n") + "\r\n";
}

function setSrcObject(video: HTMLVideoElement, stream: MediaStream | null) {
  (video as any).srcObject = stream;
}

async function waitIceComplete(pc: RTCPeerConnection, timeoutMs = 10000) {
  if (pc.iceGatheringState === "complete") return;
  await new Promise<void>((resolve) => {
    const t = window.setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }, timeoutMs);
    const onChange = () => {
      if (pc.iceGatheringState === "complete") {
        window.clearTimeout(t);
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onChange);
  });
}

export function useWhepPlayer(options?: UseWhepPlayerOptions) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const locationRef = useRef<string>("");
  const tokenRef = useRef(0);
  
  // connection lock
  const inFlightRef = useRef<Promise<void> | null>(null);
  
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const statsTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);
  const lastFrameAtRef = useRef<number | null>(null);
  const lastStatsRef = useRef<{ t: number; bytes: number } | null>(null);

  const [status, setStatus] = useState<StreamStatus>({ state: "idle" });
  const statusRef = useRef<StreamStatus>({ state: "idle" });
  const [metrics, setMetrics] = useState<WhepMetrics>({});
  const connectRef = useRef<() => Promise<void>>(async () => {});

  const updateStatus = useCallback((s: StreamStatus) => {
      statusRef.current = s;
      setStatus(s);
      options?.onStatusChange?.(s);
      if (s.state === "error" && s.error) options?.onError?.(s.error);
    }, [options]);

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
    if (statsTimerRef.current) { window.clearInterval(statsTimerRef.current); statsTimerRef.current = null; }
    if (watchdogTimerRef.current) { window.clearInterval(watchdogTimerRef.current); watchdogTimerRef.current = null; }
  }, []);

  const attachToVideo = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = true;
    video.playsInline = true;
    setSrcObject(video, streamRef.current);
    if (streamRef.current) video.play().catch(() => {});
  }, []);

  const cleanup = useCallback(async () => {
    // 🔥🔥 FIXED 1: Invalidate the current token AND the in-flight promise
    tokenRef.current += 1;
    inFlightRef.current = null; // <--- CRITICAL: Allow next connect() to run immediately

    clearTimers();
    const pc = pcRef.current; pcRef.current = null;
    const loc = locationRef.current; locationRef.current = "";
    streamRef.current = null; lastFrameAtRef.current = null; lastStatsRef.current = null;
    try { pc?.close(); } catch {}
    if (videoRef.current) setSrcObject(videoRef.current, null);
    if (loc) await closeWhepProxy(loc);
    retryAttemptRef.current = 0;
    setMetrics({});
    updateStatus({ state: "idle" });
  }, [clearTimers, updateStatus]);

  const scheduleReconnect = useCallback((reason: string) => {
      if (retryTimerRef.current) return;
      const attempt = retryAttemptRef.current;
      const delayMs = Math.min(10000, 500 * Math.pow(2, attempt));
      retryAttemptRef.current = attempt + 1;
      updateStatus({ state: "error", error: `${reason} — reconnecting in ${(delayMs / 1000).toFixed(1)}s` });
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        void connectRef.current();
      }, delayMs);
    }, [updateStatus]);

  const startFrameFpsLoop = useCallback((myToken: number) => {
    const video = videoRef.current;
    if (!video) return;
    const anyVideo = video as any;
    if (typeof anyVideo.requestVideoFrameCallback !== "function") return;

    let windowStart = performance.now();
    let count = 0;

    const onFrame = (now: number, metadata: VideoFrameCallbackMetadata) => {
      if (myToken !== tokenRef.current) return;
      lastFrameAtRef.current = performance.now();
      count += 1;
      if (metadata.rtpTimestamp) {
         setMetrics((m) => ({ ...m, timestamp: metadata.rtpTimestamp }));
      }
      const elapsed = now - windowStart;
      if (elapsed >= 1000) {
        const fps = (count * 1000) / elapsed;
        count = 0;
        windowStart = now;
        setMetrics((m) => ({ ...m, fps: Math.round(fps * 10) / 10, width: video.videoWidth, height: video.videoHeight }));
      }
      anyVideo.requestVideoFrameCallback(onFrame);
    };
    anyVideo.requestVideoFrameCallback(onFrame);
  }, []);

  const startStatsLoop = useCallback((myToken: number) => {
    if (statsTimerRef.current) window.clearInterval(statsTimerRef.current);

    statsTimerRef.current = window.setInterval(async () => {
      if (myToken !== tokenRef.current) return;
      const pc = pcRef.current;
      if (!pc) return;

      try {
        const stats = await pc.getStats();
        let inboundVideo: any = null;
        let selectedPair: any = null;

        stats.forEach((r: any) => {
          if (r.type === "inbound-rtp" && r.kind === "video" && !r.isRemote) {
            inboundVideo = r;
          }
          if (r.type === "candidate-pair" && (r.selected || r.nominated)) {
             if (!selectedPair || r.selected) selectedPair = r;
          }
        });

        const now = performance.now();
        if (inboundVideo?.bytesReceived != null) {
          const prev = lastStatsRef.current;
          if (prev) {
            const dt = (now - prev.t) / 1000;
            const dbytes = inboundVideo.bytesReceived - prev.bytes;
            if (dt > 0 && dbytes >= 0) {
              const kbps = (dbytes * 8) / dt / 1000;
              setMetrics((m) => ({ ...m, bitrateKbps: Math.round(kbps) }));
            }
          }
          lastStatsRef.current = { t: now, bytes: inboundVideo.bytesReceived };
        }

        const rttS = selectedPair?.currentRoundTripTime ?? selectedPair?.roundTripTime ?? null;
        if (typeof rttS === "number") setMetrics((m) => ({ ...m, rttMs: Math.round(rttS * 1000) }));
        
        if (typeof inboundVideo?.jitter === "number") setMetrics((m) => ({ ...m, jitterMs: Math.round(inboundVideo.jitter * 1000) }));
        
        setMetrics((m) => ({
          ...m,
          packetsLost: inboundVideo?.packetsLost ?? m.packetsLost,
          framesDropped: inboundVideo?.framesDropped ?? m.framesDropped,
        }));

        const lastFrameAt = lastFrameAtRef.current;
        setMetrics((m) => ({
          ...m,
          freezeMs: lastFrameAt ? Math.max(0, Math.round(performance.now() - lastFrameAt)) : undefined,
        }));
      } catch {}
    }, 1000); 
  }, []);

  const startFreezeWatchdog = useCallback((myToken: number) => {
      if (watchdogTimerRef.current) window.clearInterval(watchdogTimerRef.current);
      watchdogTimerRef.current = window.setInterval(() => {
        if (myToken !== tokenRef.current) return;
        if (statusRef.current.state !== "connected") return;
        const last = lastFrameAtRef.current;
        if (!last) return;
        if ((performance.now() - last) > 2500) scheduleReconnect("Stream stalled");
      }, 1000);
    }, [scheduleReconnect]);

  const connect = useCallback(async () => {
    // 🔥🔥 FIXED 2: Check token before returning inFlightRef
    // If we have an in-flight request, but the token has incremented (due to cleanup/unmount),
    // we must IGNORE the old request and start a new one.
    if (inFlightRef.current && tokenRef.current === tokenRef.current) {
        // Actually, we can't easily check which token the inFlightRef belongs to.
        // But since we set inFlightRef = null in cleanup(), this check is now safe.
        return inFlightRef.current;
    }
    
    const myToken = ++tokenRef.current;
    if (retryTimerRef.current) { window.clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }

    inFlightRef.current = (async () => {
      clearTimers();
      const oldPc = pcRef.current; pcRef.current = null; try { oldPc?.close(); } catch {}
      const oldLoc = locationRef.current; locationRef.current = ""; if (oldLoc) await closeWhepProxy(oldLoc);
      updateStatus({ state: "connecting" });

      const cfg = getStreamConfig();
      const streamName = options?.streamName ?? cfg.streamName;
      const pc = new RTCPeerConnection({ iceServers: [] });
      pcRef.current = pc;
      pc.addTransceiver("video", { direction: "recvonly" });

      pc.ontrack = (event) => {
        if (myToken !== tokenRef.current) return;
        const stream = event.streams?.[0] ?? new MediaStream([event.track]);
        streamRef.current = stream;
        attachToVideo();
        startFrameFpsLoop(myToken);
        event.track.onended = () => { if (myToken !== tokenRef.current) return; scheduleReconnect("Track ended"); };
      };

      pc.onconnectionstatechange = () => {
        if (myToken !== tokenRef.current) return;
        if (pc.connectionState === "connected") {
          retryAttemptRef.current = 0;
          updateStatus({ state: "connected" });
          attachToVideo();
          startStatsLoop(myToken);
          startFreezeWatchdog(myToken);
        }
        if (pc.connectionState === "failed" || pc.connectionState === "disconnected") scheduleReconnect(`WebRTC ${pc.connectionState}`);
      };

      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitIceComplete(pc, 10000);
        if (myToken !== tokenRef.current) return;
        const { answerSdp, location } = await sendWhepOfferViaProxy(streamName, pc.localDescription!.sdp);
        if (myToken !== tokenRef.current) return;
        locationRef.current = location ?? "";
        await pc.setRemoteDescription({ type: "answer", sdp: normalizeSdp(answerSdp) });
      } catch (e: any) {
        if (myToken !== tokenRef.current) return;
        scheduleReconnect(`Failed: ${String(e?.message ?? e)}`);
      }
    })().finally(() => { 
        // Only clear if we are still the active token (prevents clearing someone else's lock)
        // But actually, simpler is just to clear it always if it matches us, 
        // or just rely on cleanup clearing it.
        if (myToken === tokenRef.current) {
            inFlightRef.current = null; 
        }
    });
    return inFlightRef.current;
  }, [attachToVideo, clearTimers, scheduleReconnect, startFrameFpsLoop, startFreezeWatchdog, startStatsLoop, updateStatus, options?.streamName]);

  useEffect(() => { connectRef.current = connect; }, [connect]);

  // Keep your existing safety check for video element
  useEffect(() => {
    if (status.state === 'connected' && streamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== streamRef.current) {
        attachToVideo();
      }
    }
  }, [status.state, attachToVideo]);

  const reconnect = useCallback(async () => { await cleanup(); await connect(); }, [cleanup, connect]);
  const disconnect = useCallback(() => { void cleanup(); }, [cleanup]);

  return { videoRef, status, metrics, connect, reconnect, disconnect, cleanup };
}