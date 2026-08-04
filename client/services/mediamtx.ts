import { StreamConfig } from '../types/media';

export function getStreamConfig(): StreamConfig {
  return {
    host:
      process.env.NEXT_PUBLIC_MEDIAMTX_HOST || '127.0.0.1',
    webrtcPort: parseInt(
      process.env.NEXT_PUBLIC_MEDIAMTX_WEBRTC_PORT || '8889',
      10
    ),
    hlsPort: parseInt(
      process.env.NEXT_PUBLIC_MEDIAMTX_HLS_PORT || '8888',
      10
    ),
    rtspPort: parseInt(
      process.env.NEXT_PUBLIC_MEDIAMTX_RTSP_PORT || '8554',
      10
    ),
    streamName: process.env.NEXT_PUBLIC_STREAM_NAME || 'leak-detection',
  };
}

export function buildWhepUrl(config: StreamConfig): string {
  return `http://${config.host}:${config.webrtcPort}/${config.streamName}/whep`;
}

export function buildHlsUrl(config: StreamConfig): string {
  return `http://${config.host}:${config.hlsPort}/${config.streamName}/index.m3u8`;
}

export async function sendWhepOfferViaProxy(streamName: string, offerSdp: string) {
  const res = await fetch(`/api/mediamtx/whep/${streamName}`, {
    method: "POST",
    headers: { "Content-Type": "application/sdp" },
    body: offerSdp,
  });

  const contentType = res.headers.get("content-type") ?? "";
  const location = res.headers.get("x-whep-location") ?? "";
  const text = await res.text();

  if (!res.ok) {
    throw new Error(`WHEP proxy failed: ${res.status} ${text.slice(0, 200)}`);
  }

  // ✅ If Next returns HTML / RSC / 404 page, fail FAST
  if (!contentType.includes("application/sdp") || !text.startsWith("v=0")) {
    throw new Error(
      `Invalid WHEP answer. content-type=${contentType}. body starts with: ${text.slice(0, 80)}`
    );
  }

  return { answerSdp: text, location };
}



export async function closeWhepProxy(location: string) {
  if (!location) return;
  await fetch(`/api/mediamtx/whep/unused`, {
    method: "DELETE",
    headers: { "x-whep-location": location },
    keepalive: true,
  }).catch(() => {});
}

