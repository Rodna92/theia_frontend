import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { workcellPaths } from '@/lib/server/workcellPaths';

export const dynamic = 'force-dynamic';

const STORE_FILE = path.join(process.cwd(), 'data', 'ee-target-models.json');
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

type Store = Record<string, string>;

// Keys follow <modality>/<scenery>/<end_effector_type>/<target_index>.
const keyOf = (modality: string, scenery: string, endEffector: string, target: string | number) =>
  `${modality}/${scenery}/${endEffector}/${target}`;

async function readStore(): Promise<Store> {
  try {
    return JSON.parse(await fs.readFile(STORE_FILE, 'utf8')) as Store;
  } catch {
    return {};
  }
}

async function writeStore(store: Store) {
  await fs.mkdir(path.dirname(STORE_FILE), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2) + '\n', 'utf8');
}

// The store keeps a model inside the models folder relative to it, so the file is valid on
// every machine; a model anywhere else is kept as the absolute path that was typed.
const posix = (p: string) => p.replace(/\\/g, '/');

const toStored = (dir: string, p: string) => {
  const rel = path.relative(dir, p);
  return rel && !rel.startsWith('..') && !path.isAbsolute(rel) ? posix(rel) : posix(p);
};

const fromStored = (dir: string, p: string) => posix(path.isAbsolute(p) ? p : path.join(dir, p));

const exists = (p: string) =>
  fs.stat(p).then((s) => s.isFile(), () => false);

// GET ?modality&scenery&endEffector&targets=1,2,3
// Returns the saved STL path of each target. A target with nothing saved is seeded with
// <dir>/Tappo_<index>.stl when that file exists, and the seed is persisted.
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const modality = q.get('modality') ?? '';
  const scenery = q.get('scenery') ?? '';
  const endEffector = q.get('endEffector') ?? '';
  const targets = (q.get('targets') ?? '').split(',').filter(Boolean);
  if (![modality, scenery, endEffector, ...targets].every((v) => SAFE_NAME.test(v))) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }
  const dir = workcellPaths.eeTargetModelsDir();
  const store = await readStore();
  let changed = false;
  const assignments: Record<string, string> = {};
  for (const target of targets) {
    const key = keyOf(modality, scenery, endEffector, target);
    if (!store[key]) {
      const seed = `Tappo_${target}.stl`;
      if (await exists(path.join(dir, seed))) {
        store[key] = seed;
        changed = true;
      }
    }
    if (store[key]) assignments[target] = fromStored(dir, store[key]);
  }
  if (changed) await writeStore(store);

  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => /\.stl$/i.test(f)).sort();
  } catch {
    // Directory unavailable: the user can still type a path.
  }
  return NextResponse.json({ dir, files, assignments });
}

// PUT { modality, scenery, endEffector, target, path } saves (or clears, with an empty path).
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { modality, scenery, endEffector, target, path: modelPath } = body ?? {};
  if (![modality, scenery, endEffector, String(target)].every((v) => SAFE_NAME.test(String(v)))) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }
  const value = String(modelPath ?? '').trim().replace(/\\/g, '/');
  if (value && !/\.stl$/i.test(value)) {
    return NextResponse.json({ error: 'The model must be an .stl file' }, { status: 400 });
  }
  if (value && !(await exists(value))) {
    return NextResponse.json({ error: `File not found: ${value}` }, { status: 404 });
  }
  const store = await readStore();
  const key = keyOf(modality, scenery, endEffector, target);
  if (value) store[key] = toStored(workcellPaths.eeTargetModelsDir(), path.resolve(value));
  else delete store[key];
  await writeStore(store);
  return NextResponse.json({ key, path: value });
}
