import { createHash } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { parseOnnx } from './onnxMeta';

export const dynamic = 'force-dynamic';

const ONNX_FILE = /\.onnx$/i;

// GET ?path=<.onnx path as written in the yaml>&yaml=<path of the loaded vision_params.yaml>
// Returns the model's metadata (see onnxMeta.ts) plus file size, date and SHA-256. Relative
// paths resolve like the .ply route: the yaml's folder, then its parent. Only .onnx files are read.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const target = q.get('path')?.trim();
  const yaml = q.get('yaml')?.trim();
  if (!target || !ONNX_FILE.test(target)) {
    return NextResponse.json({ error: 'Expected a .onnx path' }, { status: 400 });
  }

  const candidates = path.isAbsolute(target)
    ? [target]
    : yaml
      ? [path.resolve(path.dirname(yaml), target), path.resolve(path.dirname(path.dirname(yaml)), target)]
      : [path.resolve(target)];

  for (const file of candidates) {
    let data: Buffer;
    try {
      data = await fs.readFile(file);
    } catch {
      continue;
    }
    try {
      const stat = await fs.stat(file);
      return NextResponse.json({
        resolvedPath: file,
        fileSize: stat.size,
        modified: stat.mtime.toISOString(),
        sha256: createHash('sha256').update(data).digest('hex'),
        ...parseOnnx(new Uint8Array(data.buffer, data.byteOffset, data.byteLength)),
      });
    } catch (e) {
      return NextResponse.json(
        { error: `Cannot parse ${file}: ${e instanceof Error ? e.message : String(e)}` },
        { status: 422 },
      );
    }
  }
  return NextResponse.json({ error: `Cannot read ${candidates.join(' or ')}` }, { status: 404 });
}
