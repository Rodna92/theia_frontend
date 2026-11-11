import { rosbridge } from '@/lib/server/rosbridge';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Live workcell state as Server-Sent Events: one `data:` line with the full WorkcellSnapshot
// each time it changes. The bridge connection is held only while a client is listening.
export async function GET(req: Request) {
  const encoder = new TextEncoder();
  let stop = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const push = (text: string) => {
        try { controller.enqueue(encoder.encode(text)); } catch { stop(); }
      };
      const unwatch = rosbridge.watch((s) => push(`data: ${JSON.stringify(s)}\n\n`));
      // Comment line: keeps proxies and the browser from timing the stream out.
      const keepAlive = setInterval(() => push(': keep-alive\n\n'), 15000);
      stop = () => {
        stop = () => {};
        clearInterval(keepAlive);
        unwatch();
        try { controller.close(); } catch { /* already closed */ }
      };
      req.signal.addEventListener('abort', () => stop());
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
