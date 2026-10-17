import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const PLY_FILE = /\.ply$/i;

// GET ?path=<.ply path as written in the yaml>&yaml=<path of the loaded vision_params.yaml>
// Returns the raw .ply bytes. Relative paths (e.g. "pointclouds/Tappo_1.ply") are tried
// against the yaml's folder and then its parent, the package share root that
// vision_node.launch.py resolves them against. Only .ply files are ever read.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const target = q.get('path')?.trim();
  const yaml = q.get('yaml')?.trim();
  if (!target || !PLY_FILE.test(target)) {
    return NextResponse.json({ error: 'Expected a .ply path' }, { status: 400 });
  }

  const candidates = path.isAbsolute(target)
    ? [target]
    : yaml
      ? [path.resolve(path.dirname(yaml), target), path.resolve(path.dirname(path.dirname(yaml)), target)]
      : [path.resolve(target)];

  for (const file of candidates) {
    try {
      const data = await fs.readFile(file);
      return new NextResponse(new Uint8Array(data), {
        headers: {
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'no-store',
          'X-Resolved-Path': encodeURIComponent(file),
        },
      });
    } catch {}
  }
  return NextResponse.json({ error: `Cannot read ${candidates.join(' or ')}` }, { status: 404 });
}
