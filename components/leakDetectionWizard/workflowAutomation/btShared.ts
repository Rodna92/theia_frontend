// Types and helpers shared by the Workflow Automation page and the behavior tree diagram.

export interface TreeNode {
  tag: string;
  attrs: { name: string; value: string }[];
  comment?: string;
  children: TreeNode[];
}

export interface BehaviorTree {
  id: string;
  comment?: string;
  nodes: TreeNode[];
}

export interface Port {
  direction: 'input' | 'output' | 'inout';
  name: string;
  type?: string;
  default?: string;
  description?: string;
}

export interface NodeModel {
  kind: string;
  id: string;
  ports: Port[];
}

export const CONTROL_NODES = new Set([
  'Sequence', 'SequenceWithMemory', 'ReactiveSequence', 'Fallback', 'ReactiveFallback', 'Parallel', 'ParallelAll',
  'IfThenElse', 'WhileDoElse', 'Switch2', 'Switch3', 'Switch4', 'Switch5', 'Switch6',
]);

export const DECORATOR_NODES = new Set([
  'Repeat', 'RetryUntilSuccessful', 'Inverter', 'ForceSuccess', 'ForceFailure', 'KeepRunningUntilFailure', 'Timeout',
  'Delay', 'RunOnce', 'Precondition', 'SkipUnlessUpdated', 'LoopInt', 'LoopDouble', 'LoopString', 'LoopBool',
]);

// Nodes that ship with BehaviorTree.CPP and so are not listed in tree_nodes_model.xml.
export const BUILTIN = new Set([
  ...CONTROL_NODES,
  ...DECORATOR_NODES,
  'Script', 'ScriptCondition', 'SetBlackboard', 'UnsetBlackboard', 'AlwaysSuccess', 'AlwaysFailure', 'Sleep', 'SubTree',
  'WasEntryUpdated', 'WaitValueUpdate',
]);

export type NodeCategory = 'control' | 'decorator' | 'action' | 'condition' | 'subtree' | 'unknown';

export function nodeCategory(tag: string, models: Map<string, NodeModel>): NodeCategory {
  if (tag === 'SubTree') return 'subtree';
  if (CONTROL_NODES.has(tag)) return 'control';
  if (DECORATOR_NODES.has(tag)) return 'decorator';
  const kind = models.get(tag)?.kind;
  if (kind === 'Condition' || tag === 'ScriptCondition') return 'condition';
  if (kind === 'Control') return 'control';
  if (kind === 'Decorator') return 'decorator';
  if (kind || BUILTIN.has(tag)) return 'action';
  return 'unknown';
}

// "{current_target}" -> "current_target"
export const blackboardKey = (v: string) => v.match(/^\{([^{}]+)\}$/)?.[1];

// Attributes that hold script code rather than a plain value.
export const isScriptAttr = (tag: string, name: string) =>
  (tag === 'Script' && name === 'code') || /^_(skipIf|successIf|failureIf|while|onSuccess|onFailure|onHalted|post)$/.test(name);

export function nodeMatches(node: TreeNode, q: string) {
  return (
    node.tag.toLowerCase().includes(q) ||
    node.attrs.some((a) => a.name.toLowerCase().includes(q) || a.value.toLowerCase().includes(q)) ||
    !!node.comment?.toLowerCase().includes(q)
  );
}

export function portTooltip(port?: Port) {
  if (!port) return undefined;
  return [
    `${port.direction} · ${port.type ?? '?'}${port.default !== undefined ? ` · default ${port.default || '""'}` : ''}`,
    port.description,
  ]
    .filter(Boolean)
    .join('\n');
}
