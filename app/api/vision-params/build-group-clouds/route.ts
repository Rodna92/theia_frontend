import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const YAML_FILE = /\.ya?ml$/i;
const SCRIPT = path.join('tools', 'build_group_reference_cloud.py');
const PYTHON = process.env.VISION_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');

// POST { yaml: <path of the loaded vision_params.yaml> }
// Runs <package>/tools/build_group_reference_cloud.py --preset ariston_a against that yaml,
// where <package> is the folder above the yaml's config/ folder. The script reads the
// group keys from the file on disk and rewrites every anchor's
// ariston_a_group_reference_clouds .ply. Returns the script's output.
export async function POST(req: NextRequest) {
  const { yaml } = ((await req.json().catch(() => ({}))) ?? {}) as { yaml?: string };
  if (!yaml || !YAML_FILE.test(yaml)) {
    return NextResponse.json({ ok: false, output: 'Expected the path of a .yaml file' }, { status: 400 });
  }
  const yamlPath = path.resolve(yaml);
  const script = path.join(path.dirname(path.dirname(yamlPath)), SCRIPT);
  try {
    await fs.access(script);
  } catch {
    return NextResponse.json({ ok: false, output: `Script not found: ${script}` }, { status: 404 });
  }

  return new Promise<NextResponse>((resolve) => {
    execFile(
      PYTHON,
      [script, '--preset', 'ariston_a', '--params-yaml', yamlPath],
      { timeout: 120_000, windowsHide: true },
      (error, stdout, stderr) => {
        const output = [stdout, stderr, error && !stderr ? error.message : ''].filter(Boolean).join('\n').trim();
        resolve(NextResponse.json({ ok: !error, output }, { status: error ? 500 : 200 }));
      }
    );
  });
}
