import { NextResponse } from 'next/server';
import { allWorkcellPaths, workcellRoot } from '@/lib/server/workcellPaths';

export const dynamic = 'force-dynamic';

// The default folders of this machine, so the pages never hardcode them.
export async function GET() {
  return NextResponse.json({ root: workcellRoot(), ...allWorkcellPaths() });
}
