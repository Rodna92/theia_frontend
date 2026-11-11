import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// End-effector test mode: server-side proxy to ee_app's ee_test_node (HTTP on localhost of the
// machine that runs the robotics stack; see ee_app/nodes/ee_test_gateway.py). The browser never
// talks to that node directly.
const GATEWAY = (process.env.EE_TEST_GATEWAY_URL || 'http://127.0.0.1:8765').replace(/\/+$/, '');
const ACTIONS = new Set(['test-mode', 'jog', 'move', 'home', 'stop']);
// Leaving test mode first drives the tool home at the test speed, so allow for a long answer.
const TIMEOUT_MS = 30000;

async function forward(path: string, init?: RequestInit) {
  try {
    const res = await fetch(`${GATEWAY}${path}`, { ...init, cache: 'no-store', signal: AbortSignal.timeout(TIMEOUT_MS) });
    return NextResponse.json(await res.json(), { status: res.status });
  } catch (e) {
    return NextResponse.json(
      { ok: false, unreachable: true, message: e instanceof Error ? e.message : 'Cannot reach the end-effector test node' },
      { status: 503 }
    );
  }
}

export async function GET() {
  return forward('/status');
}

// Body: { action: 'test-mode' | 'jog' | 'move' | 'home' | 'stop', ...parameters of that action }.
export async function POST(req: Request) {
  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ ok: false, message: 'Body must be JSON' }, { status: 400 });
  }
  const { action, ...body } = payload ?? {};
  if (typeof action !== 'string' || !ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, message: 'Unknown action' }, { status: 400 });
  }
  return forward(`/${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
