import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { isMap, isPair, isScalar, parseDocument, type Pair } from 'yaml';

export const dynamic = 'force-dynamic';

const DEFAULT_DIR = 'X:/dev/FT-Theia/FT_Workcell_Vision_ALDM_1.0.3/ev3d_vision/config';
const FILE_NAME = 'vision_params.yaml';

interface Param {
  key: string;
  value: unknown;
  comment?: string;
}

interface NodeParams {
  node: string;
  params: Param[];
}

const cleanComment = (c?: string | null) =>
  c
    ?.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join('\n') || undefined;

const keyOf = (pair: Pair) => (isScalar(pair.key) ? String(pair.key.value) : String(pair.key));

const YAML_FILE = /\.ya?ml$/i;

// GET ?path=<folder containing vision_params.yaml | path to a .yaml/.yml file>
// A folder resolves to <folder>/vision_params.yaml; only YAML files are ever read.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const target = (q.get('path') ?? q.get('dir'))?.trim() || process.env.VISION_PARAMS_DIR || DEFAULT_DIR;
  const filePath = YAML_FILE.test(target) ? path.resolve(target) : path.join(target, FILE_NAME);

  let raw: string;
  let modified: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
    modified = (await fs.stat(filePath)).mtime.toISOString();
  } catch {
    return NextResponse.json({ error: `Cannot read ${filePath}`, path: filePath }, { status: 404 });
  }

  const doc = parseDocument(raw);
  if (doc.errors.length) {
    return NextResponse.json(
      { error: doc.errors.map((e) => e.message).join('\n'), path: filePath, raw },
      { status: 422 },
    );
  }

  // ROS 2 layout: <node>: { ros__parameters: { ... } }. Comments preceding a key are kept
  // so the UI can show the file's own documentation next to each parameter.
  const nodes: NodeParams[] = [];
  if (isMap(doc.contents)) {
    for (const nodePair of doc.contents.items) {
      if (!isPair(nodePair)) continue;
      let map = nodePair.value;
      if (isMap(map)) {
        const rp = map.items.find((p) => isPair(p) && keyOf(p) === 'ros__parameters');
        if (rp && isMap(rp.value)) map = rp.value;
      }
      const params: Param[] = isMap(map)
        ? map.items.map((p) => ({
            key: keyOf(p),
            value: (p.value as { toJSON?: () => unknown })?.toJSON?.() ?? null,
            comment: cleanComment(
              [(p.key as { commentBefore?: string })?.commentBefore, (p.value as { comment?: string })?.comment]
                .filter(Boolean)
                .join('\n'),
            ),
          }))
        : [];
      nodes.push({ node: keyOf(nodePair), params });
    }
  }

  return NextResponse.json({ path: filePath, modified, raw, nodes });
}
