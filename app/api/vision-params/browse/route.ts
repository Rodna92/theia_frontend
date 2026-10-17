import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const YAML_FILE = /\.ya?ml$/i;

interface Entry {
  name: string;
  path: string;
  type: 'dir' | 'file';
}

// Windows drive roots that currently exist (C:\, X:\, ...).
async function listDrives(): Promise<Entry[]> {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const found = await Promise.all(
    letters.map(async (l): Promise<Entry | null> => {
      const root = `${l}:\\`;
      try {
        await fs.access(root);
        return { name: `${l}:`, path: root, type: 'dir' };
      } catch {
        return null;
      }
    }),
  );
  return found.filter((e): e is Entry => e !== null);
}

// GET ?dir=<folder>
// Lists sub-folders and YAML files of a folder on the machine running this server, so the
// UI can pick a vision_params file by its real path. No `dir` (Windows) lists the drives.
export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get('dir')?.trim();

  if (!raw) {
    if (process.platform === 'win32') return NextResponse.json({ dir: '', parent: null, entries: await listDrives() });
  }

  const dir = path.resolve(raw || '/');
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return NextResponse.json({ error: `Cannot open ${dir}`, dir }, { status: 404 });
  }

  const entries: Entry[] = dirents
    .filter((d) => (d.isDirectory() && !d.name.startsWith('$')) || (d.isFile() && YAML_FILE.test(d.name)))
    .map((d) => ({ name: d.name, path: path.join(dir, d.name), type: d.isDirectory() ? ('dir' as const) : ('file' as const) }))
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) : a.type === 'dir' ? -1 : 1));

  const up = path.dirname(dir);
  // At a drive root, "up" goes to the drive list on Windows.
  const parent = up !== dir ? up : process.platform === 'win32' ? '' : null;
  return NextResponse.json({ dir, parent, entries });
}
