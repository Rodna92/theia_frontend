// Default folders of the machine the frontend runs on, from /api/workcell-paths.
export type WorkcellPathName =
  | 'behaviorTreeDir'
  | 'robotParamsDir'
  | 'visionParamsDir'
  | 'visionParamsFile'
  | 'eeTargetModelsDir'
  | 'eeRoutinesDir'
  | 'endEffectorsDir';

let cached: Promise<Partial<Record<WorkcellPathName, string>>> | null = null;

// Returns '' when the paths cannot be fetched: the API routes then fall back to the same
// default on their own when called with an empty path.
export async function getWorkcellPath(name: WorkcellPathName): Promise<string> {
  cached ??= fetch('/api/workcell-paths', { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const paths = await cached;
  if (!paths[name]) cached = null;
  return paths[name] ?? '';
}
