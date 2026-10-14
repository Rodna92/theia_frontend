import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const DEFAULT_DIR = 'X:\\dev\\FT-Theia\\FT_Workcell_End_Effector\\config\\end_effectors';

const num = (text: string, key: string): number => {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*(-?[0-9.]+)`, 'm'));
  return m ? parseFloat(m[1]) : 0;
};

const str = (text: string, key: string): string | null => {
  const m = text.match(new RegExp(`^\\s*${key}:\\s*"?([^"\\s#]+)"?`, 'm'));
  return m ? m[1] : null;
};

// The configured directory comes from END_EFFECTORS_DIR so it can be changed per machine.
export async function GET() {
  const dir = process.env.END_EFFECTORS_DIR || DEFAULT_DIR;
  try {
    const files = (await fs.readdir(dir)).filter((f) => /\.ya?ml$/i.test(f)).sort();
    const endEffectors = await Promise.all(
      files.map(async (file) => {
        const text = await fs.readFile(path.join(dir, file), 'utf8');
        const id = path.parse(file).name;
        const jointNames = text.match(/^\s*joint_names:\s*\[(.*)\]/m)?.[1] ?? '';
        return {
          id,
          name: str(text, 'declared_end_effector_type') ?? id,
          offsetZ: num(text, 'offset_z'),
          solver: str(text, 'solver'),
          jointCount: jointNames.split(',').filter((s) => s.trim()).length,
        };
      })
    );
    return NextResponse.json({ dir, endEffectors });
  } catch (e) {
    return NextResponse.json(
      { dir, endEffectors: [], error: e instanceof Error ? e.message : 'Cannot read directory' },
      { status: 500 }
    );
  }
}
