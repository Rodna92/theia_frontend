import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { isMap, isPair, isScalar, parseDocument, type Pair, type YAMLMap } from 'yaml';

export const dynamic = 'force-dynamic';

const DEFAULT_DIR = 'X:/dev/FT-Theia/FT_Workcell_Robotics_ALDM_1.0.3/aldm_control/config/phases';
const YAML_FILE = /\.ya?ml$/i;

interface Param {
  // Full dotted path inside ros__parameters, e.g. "insertion_phase.lissajous_static.v".
  key: string;
  value: unknown;
  // Comment block written above the key.
  comment?: string;
  // Comment on the same line as the value (often the unit, e.g. "[m/s] ...").
  note?: string;
  // ROS node the parameter belongs to; omitted for the wildcard "/**".
  node?: string;
}

interface FileParams {
  name: string;
  path: string;
  modified?: string;
  raw?: string;
  // Comment at the top of the file, before the first key.
  header?: string;
  params: Param[];
  error?: string;
}

const cleanComment = (c?: string | null) =>
  c
    ?.split('\n')
    .map((l) => l.trim())
    // Drop pure separator lines like "=====" or "-----".
    .filter((l) => l && !/^[=\-#*\s]+$/.test(l))
    .join('\n') || undefined;

const keyOf = (pair: Pair) => (isScalar(pair.key) ? String(pair.key.value) : String(pair.key));

const joinComments = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join('\n');

// Flattens nested maps into dotted keys. Lists and scalars are leaves. A comment written before
// a nested map's key is handed down to that map's first parameter so it is not lost.
function flatten(map: YAMLMap, prefix: string, node: string | undefined, out: Param[], inherited = '') {
  let pending = joinComments(inherited, map.commentBefore);
  for (const item of map.items) {
    if (!isPair(item)) continue;
    const key = prefix ? `${prefix}.${keyOf(item)}` : keyOf(item);
    const before = joinComments(pending, (item.key as { commentBefore?: string })?.commentBefore);
    pending = '';
    if (isMap(item.value)) {
      flatten(item.value, key, node, out, before);
      continue;
    }
    out.push({
      key,
      value: (item.value as { toJSON?: () => unknown })?.toJSON?.() ?? null,
      comment: cleanComment(before),
      note: cleanComment((item.value as { comment?: string })?.comment),
      ...(node ? { node } : {}),
    });
  }
}

async function readParamsFile(filePath: string): Promise<FileParams> {
  const name = path.basename(filePath);
  let raw: string;
  let modified: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
    modified = (await fs.stat(filePath)).mtime.toISOString();
  } catch {
    return { name, path: filePath, params: [], error: `Cannot read ${filePath}` };
  }

  const doc = parseDocument(raw);
  if (doc.errors.length) {
    return { name, path: filePath, modified, raw, params: [], error: doc.errors.map((e) => e.message).join('\n') };
  }

  // ROS 2 layout: <node>: { ros__parameters: { ... } }, usually with the wildcard node "/**".
  const params: Param[] = [];
  let header = doc.commentBefore ?? '';
  if (isMap(doc.contents)) {
    header = joinComments(header, doc.contents.commentBefore);
    for (const nodePair of doc.contents.items) {
      if (!isPair(nodePair)) continue;
      const nodeName = keyOf(nodePair);
      if (!header) header = (nodePair.key as { commentBefore?: string })?.commentBefore ?? '';
      let map = nodePair.value;
      if (isMap(map)) {
        const rp = map.items.find((p) => isPair(p) && keyOf(p) === 'ros__parameters');
        if (rp && isMap(rp.value)) map = rp.value;
      }
      if (isMap(map)) flatten(map, '', nodeName === '/**' ? undefined : nodeName, params);
    }
  }

  return { name, path: filePath, modified, raw, header: cleanComment(header), params };
}

// GET ?path=<folder | path to a .yaml/.yml file>
// A folder loads every YAML file directly inside it (sorted by name); a file loads only that file.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const target = (q.get('path') ?? q.get('dir'))?.trim() || process.env.ROBOT_PARAMS_DIR || DEFAULT_DIR;
  const resolved = path.resolve(target);

  let filePaths: string[];
  if (YAML_FILE.test(resolved)) {
    filePaths = [resolved];
  } else {
    try {
      const dirents = await fs.readdir(resolved, { withFileTypes: true });
      filePaths = dirents
        .filter((d) => d.isFile() && YAML_FILE.test(d.name))
        .map((d) => path.join(resolved, d.name))
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    } catch {
      return NextResponse.json({ error: `Cannot open ${resolved}`, path: resolved }, { status: 404 });
    }
    if (!filePaths.length) {
      return NextResponse.json({ error: `No .yaml files in ${resolved}`, path: resolved }, { status: 404 });
    }
  }

  const files = await Promise.all(filePaths.map(readParamsFile));
  if (files.length === 1 && files[0].error && !files[0].raw) {
    return NextResponse.json({ error: files[0].error, path: resolved }, { status: 404 });
  }
  return NextResponse.json({ path: resolved, files });
}
