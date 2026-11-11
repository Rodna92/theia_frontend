import { NextResponse } from 'next/server';
import { rosbridge } from '@/lib/server/rosbridge';
import type { CommandResult, WorkcellCommand } from '@/client/types/workcell';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Operator commands, each a std_srvs/Trigger service of the orchestrator (robot_app,
// bt_task_manager) which is the one deciding whether the command is allowed right now:
//   start  leave STOPPED: back to the initial states, waiting for the external machine
//   stop   cancel every activity and hold
//   test   only while IDLE: simulate one cycle request from the external machine
const SERVICES: Record<WorkcellCommand, string> = {
  start: '/theia/start',
  stop: '/theia/stop',
  test: '/theia/test_cycle',
};

export async function POST(req: Request) {
  let command: unknown;
  try {
    command = (await req.json())?.command;
  } catch {
    return NextResponse.json<CommandResult>({ ok: false, message: 'Body must be JSON' }, { status: 400 });
  }
  const service = typeof command === 'string' ? SERVICES[command as WorkcellCommand] : undefined;
  if (!service) {
    return NextResponse.json<CommandResult>({ ok: false, message: 'Unknown command' }, { status: 400 });
  }
  try {
    const res = await rosbridge.callService(service, 'std_srvs/srv/Trigger');
    const ok = res.success === true;
    return NextResponse.json<CommandResult>(
      { ok, message: String(res.message ?? '') },
      { status: ok ? 200 : 409 }
    );
  } catch (e) {
    return NextResponse.json<CommandResult>(
      { ok: false, message: e instanceof Error ? e.message : 'Command failed' },
      { status: 503 }
    );
  }
}
