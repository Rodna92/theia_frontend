import { promises as fs } from 'fs';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';
import { workcellPaths } from '@/lib/server/workcellPaths';

export const dynamic = 'force-dynamic';

const TREE_FILE = 'aldm_target_loop.xml';
const MODEL_FILE = 'tree_nodes_model.xml';

// ---------------------------------------------------------------------------
// Minimal XML reader. BehaviorTree.CPP files only use elements, attributes and
// comments, so this is enough and avoids pulling in an XML dependency.
// ---------------------------------------------------------------------------

interface XmlElement {
  tag: string;
  attrs: { name: string; value: string }[];
  children: XmlElement[];
  text: string;
  // Comments written right before this element.
  comment?: string;
}

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');

// Removes the common indentation and separator lines like "=====" from a comment.
function cleanComment(c: string): string | undefined {
  const lines = c.replace(/\r/g, '').split('\n');
  const rest = lines.slice(1).filter((l) => l.trim());
  const indent = rest.length ? Math.min(...rest.map((l) => l.match(/^\s*/)![0].length)) : 0;
  const out = [lines[0].trim(), ...lines.slice(1).map((l) => l.slice(indent).trimEnd())]
    .filter((l) => !/^[=\-#*\s]+$/.test(l) || !l.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return out || undefined;
}

const joinComments = (parts: string[]) => {
  const cleaned = parts.map(cleanComment).filter(Boolean);
  return cleaned.length ? cleaned.join('\n\n') : undefined;
};

function parseXml(src: string): { root: XmlElement; header?: string } {
  const root: XmlElement = { tag: '#document', attrs: [], children: [], text: '' };
  const stack: XmlElement[] = [root];
  let pending: string[] = [];
  let header: string | undefined;
  let i = 0;

  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (lt > i) stack[stack.length - 1].text += decode(src.slice(i, lt));

    if (src.startsWith('<!--', lt)) {
      const end = src.indexOf('-->', lt + 4);
      if (end < 0) throw new Error('Unclosed comment');
      pending.push(src.slice(lt + 4, end));
      i = end + 3;
    } else if (src.startsWith('<?', lt) || src.startsWith('<!', lt)) {
      const end = src.indexOf('>', lt);
      if (end < 0) throw new Error('Unclosed declaration');
      i = end + 1;
    } else if (src.startsWith('</', lt)) {
      const end = src.indexOf('>', lt);
      if (end < 0) throw new Error('Unclosed closing tag');
      const tag = src.slice(lt + 2, end).trim();
      const open = stack.pop();
      if (!open || open.tag !== tag) {
        const line = src.slice(0, lt).split('\n').length;
        throw new Error(`Line ${line}: </${tag}> does not match <${open?.tag ?? '?'}>`);
      }
      pending = [];
      i = end + 1;
    } else {
      // Find the end of the tag while skipping ">" inside quoted attribute values.
      let j = lt + 1;
      let quote: string | null = null;
      for (; j < src.length; j++) {
        const ch = src[j];
        if (quote) {
          if (ch === quote) quote = null;
        } else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
      }
      if (j >= src.length) throw new Error('Unclosed tag');
      const body = src.slice(lt + 1, j);
      const selfClosing = body.endsWith('/');
      const inner = selfClosing ? body.slice(0, -1) : body;
      const tag = inner.match(/^[^\s/>]+/)?.[0] ?? '';
      const attrs: XmlElement['attrs'] = [];
      const re = /([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(inner.slice(tag.length)))) attrs.push({ name: m[1], value: decode(m[2] ?? m[3] ?? '') });

      // The first comment of the document (before the root element) is the file header.
      if (stack.length === 1 && header === undefined && pending.length) header = joinComments(pending);
      const el: XmlElement = {
        tag,
        attrs,
        children: [],
        text: '',
        comment: stack.length > 1 ? joinComments(pending) : undefined,
      };
      pending = [];
      stack[stack.length - 1].children.push(el);
      if (!selfClosing) stack.push(el);
      i = j + 1;
    }
  }
  if (stack.length > 1) throw new Error(`<${stack[stack.length - 1].tag}> is never closed`);
  return { root, header };
}

// ---------------------------------------------------------------------------
// Response shape
// ---------------------------------------------------------------------------

interface TreeNode {
  tag: string;
  attrs: { name: string; value: string }[];
  comment?: string;
  children: TreeNode[];
}

interface BehaviorTree {
  id: string;
  comment?: string;
  nodes: TreeNode[];
}

interface Port {
  direction: 'input' | 'output' | 'inout';
  name: string;
  type?: string;
  default?: string;
  description?: string;
}

interface NodeModel {
  // Action, Condition, Control, Decorator or SubTree.
  kind: string;
  id: string;
  ports: Port[];
}

interface SourceFile {
  name: string;
  path: string;
  modified?: string;
  raw?: string;
  error?: string;
}

const attr = (el: XmlElement, name: string) => el.attrs.find((a) => a.name === name)?.value;

const toNode = (el: XmlElement): TreeNode => ({
  tag: el.tag,
  attrs: el.attrs,
  comment: el.comment,
  children: el.children.map(toNode),
});

async function readSource(filePath: string): Promise<SourceFile> {
  const name = path.basename(filePath);
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const modified = (await fs.stat(filePath)).mtime.toISOString();
    return { name, path: filePath, modified, raw };
  } catch {
    return { name, path: filePath, error: `Cannot read ${filePath}` };
  }
}

// GET ?path=<folder holding aldm_target_loop.xml and tree_nodes_model.xml>
export async function GET(req: NextRequest) {
  const target = req.nextUrl.searchParams.get('path')?.trim() || workcellPaths.behaviorTreeDir();
  const dir = path.resolve(target);

  const [treeFile, modelFile] = await Promise.all([
    readSource(path.join(dir, TREE_FILE)),
    readSource(path.join(dir, MODEL_FILE)),
  ]);
  if (treeFile.error && modelFile.error) {
    return NextResponse.json({ error: `Cannot read ${TREE_FILE} or ${MODEL_FILE} in ${dir}`, path: dir }, { status: 404 });
  }

  let header: string | undefined;
  let mainTree: string | undefined;
  let trees: BehaviorTree[] = [];
  if (treeFile.raw) {
    try {
      const parsed = parseXml(treeFile.raw);
      const rootEl = parsed.root.children.find((c) => c.tag === 'root');
      header = parsed.header;
      mainTree = rootEl ? attr(rootEl, 'main_tree_to_execute') : undefined;
      trees = (rootEl?.children ?? [])
        .filter((c) => c.tag === 'BehaviorTree')
        .map((c) => ({ id: attr(c, 'ID') ?? '?', comment: c.comment, nodes: c.children.map(toNode) }));
    } catch (e) {
      treeFile.error = e instanceof Error ? e.message : String(e);
    }
  }

  let models: NodeModel[] = [];
  if (modelFile.raw) {
    try {
      const parsed = parseXml(modelFile.raw);
      const modelEl = parsed.root.children.find((c) => c.tag === 'root')?.children.find((c) => c.tag === 'TreeNodesModel');
      models = (modelEl?.children ?? []).map((n) => ({
        kind: n.tag,
        id: attr(n, 'ID') ?? '?',
        ports: n.children
          .filter((p) => /^(input|output|inout)_port$/.test(p.tag))
          .map((p) => ({
            direction: p.tag.replace('_port', '') as Port['direction'],
            name: attr(p, 'name') ?? '?',
            type: attr(p, 'type'),
            default: attr(p, 'default'),
            description: p.text.trim() || undefined,
          })),
      }));
    } catch (e) {
      modelFile.error = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({ path: dir, files: [treeFile, modelFile], header, mainTree, trees, models });
}
