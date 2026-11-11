import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { parse } from 'yaml';
import { workcellPaths } from '@/lib/server/workcellPaths';

export const dynamic = 'force-dynamic';

type Dict = Record<string, unknown>;

const isDict = (v: unknown): v is Dict => !!v && typeof v === 'object' && !Array.isArray(v);

// The "# ..." block at the top of the file, without the "#" markers.
function headerOf(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim().startsWith('#')) break;
    lines.push(line.replace(/^\s*#\s?/, ''));
  }
  return lines.join('\n').trim();
}

// Trailing "# comment" of each "key: value" line, by key name.
function inlineComments(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][\w]*):\s*[^#\s][^#]*#\s*(.+)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

// "# TODO..." comments flagging unfinished values, each joined with its continuation lines.
function todosOf(text: string): string[] {
  const todos: string[][] = [];
  let open = false;
  for (const line of text.split(/\r?\n/)) {
    const c = line.match(/^\s*#\s?(.*)$/)?.[1]?.trim();
    if (c && /^TODO\b/.test(c)) {
      todos.push([c]);
      open = true;
    } else if (open && c && !/^\w+:/.test(c)) {
      // Continuation lines of the same comment block, until a blank line or example key.
      todos[todos.length - 1].push(c);
    } else {
      open = false;
    }
  }
  return todos.map((t) => t.join(' '));
}

// ROS parameter files nest everything under "<node or /**>: ros__parameters:".
function rosParams(doc: unknown): Dict {
  if (!isDict(doc)) return {};
  for (const node of Object.values(doc)) {
    if (isDict(node) && isDict(node.ros__parameters)) return node.ros__parameters;
  }
  return doc;
}

// Reads every end-effector YAML of END_EFFECTORS_DIR (or ?dir=) with all of its parameters.
export async function GET(req: Request) {
  const dir = new URL(req.url).searchParams.get('dir') || workcellPaths.endEffectorsDir();
  try {
    const files = (await fs.readdir(dir)).filter((f) => /\.ya?ml$/i.test(f)).sort();
    const endEffectors = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dir, file);
        const id = path.parse(file).name;
        const [raw, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)]);
        const base = {
          id,
          file,
          path: filePath,
          modified: stat.mtime.toISOString(),
          raw,
          header: headerOf(raw),
          comments: inlineComments(raw),
          todos: todosOf(raw),
        };
        try {
          return { ...base, params: rosParams(parse(raw)) };
        } catch (e) {
          return { ...base, params: {}, error: e instanceof Error ? e.message : 'Invalid YAML' };
        }
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
