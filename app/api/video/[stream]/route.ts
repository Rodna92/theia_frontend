export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// MJPEG of the vision module's debug image topics, proxied from web_video_server (started with
// the frontend bridge, bound to localhost). vision_node renders and publishes these images only
// while somebody is subscribed, so there is no cost when no page shows the video.
const VIDEO_SERVER = (process.env.VIDEO_SERVER_URL || 'http://127.0.0.1:8081').replace(/\/+$/, '');

const STREAMS: Record<string, string> = {
  overlay: '/vision/debug/segmentation_overlay',
  color: '/vision/debug/color_frame',
  mask: '/vision/debug/segmentation_mask',
};

export async function GET(req: Request, ctx: { params: Promise<{ stream: string }> }) {
  const { stream } = await ctx.params;
  const topic = STREAMS[stream];
  if (!topic) return new Response('Unknown stream', { status: 404 });

  // qos_profile=sensor_data: the vision node publishes best-effort. The topic goes in as is:
  // web_video_server does not URL-decode it.
  const url = `${VIDEO_SERVER}/stream?topic=${topic}&type=mjpeg&quality=70&qos_profile=sensor_data`;
  try {
    const upstream = await fetch(url, { cache: 'no-store', signal: req.signal });
    if (!upstream.ok || !upstream.body) {
      return new Response('Video stream not available', { status: 502 });
    }
    return new Response(upstream.body, {
      headers: {
        'Content-Type': upstream.headers.get('content-type') ?? 'multipart/x-mixed-replace',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return new Response('Video server not reachable', { status: 503 });
  }
}
