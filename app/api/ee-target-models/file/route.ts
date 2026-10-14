import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Streams a saved target model to the browser; only .stl files are served.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams.get('path') ?? '';
  if (!/\.stl$/i.test(p)) {
    return NextResponse.json({ error: 'Only .stl files can be served' }, { status: 400 });
  }
  try {
    const data = await fs.readFile(p);
    return new NextResponse(new Uint8Array(data), {
      headers: { 'Content-Type': 'model/stl', 'Cache-Control': 'no-store' },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
