// Where the workcell modules keep their configuration, on this machine.
//
// Nothing has to be configured when the frontend is checked out inside the workspace next to
// the modules (the Jetson dev machine and production):
//
//   <root>/theia_frontend   <- process.cwd()
//   <root>/robot_app
//   <root>/vision_app
//   <root>/ee_app
//
// Other layouts set variables in .env.local (see .env.example). From broadest to narrowest:
//   WORKCELL_ROOT                               the folder holding the modules
//   ROBOT_APP_DIR, VISION_APP_DIR, EE_APP_DIR   one module checked out elsewhere or under another name
//   BEHAVIOR_TREE_DIR, ROBOT_PARAMS_DIR, ...    one single folder or file
// The narrowest variable that is set wins.
import path from 'path';

const env = (name: string) => process.env[name]?.trim() || undefined;

// Forward slashes on every platform: these paths are shown in the UI and sent back in URLs.
const posix = (p: string) => p.replace(/\\/g, '/');

export const workcellRoot = () => posix(path.resolve(env('WORKCELL_ROOT') ?? path.join(process.cwd(), '..')));

const moduleDir = (envName: string, folder: string) => env(envName) ?? path.join(workcellRoot(), folder);

const robotApp = () => moduleDir('ROBOT_APP_DIR', 'robot_app');
const visionApp = () => moduleDir('VISION_APP_DIR', 'vision_app');
const eeApp = () => moduleDir('EE_APP_DIR', 'ee_app');

const resolve = (envName: string, base: string, ...sub: string[]) =>
  posix(path.resolve(env(envName) ?? path.join(base, ...sub)));

export const workcellPaths = {
  behaviorTreeDir: () => resolve('BEHAVIOR_TREE_DIR', robotApp(), 'aldm_control', 'config', 'BehaviorTree'),
  robotParamsDir: () => resolve('ROBOT_PARAMS_DIR', robotApp(), 'aldm_control', 'config', 'phases'),
  visionParamsDir: () => resolve('VISION_PARAMS_DIR', visionApp(), 'ev3d_vision', 'config'),
  visionParamsFile: () => resolve('EE_VISION_PARAMS_FILE', workcellPaths.visionParamsDir(), 'vision_params.yaml'),
  eeTargetModelsDir: () => resolve('EE_TARGET_MODELS_DIR', visionApp(), 'ev3d_vision', 'pointclouds'),
  eeRoutinesDir: () => resolve('EE_ROUTINES_DIR', eeApp(), 'config', 'routines', 'aldm'),
  endEffectorsDir: () => resolve('END_EFFECTORS_DIR', eeApp(), 'config', 'end_effectors'),
};

export type WorkcellPathName = keyof typeof workcellPaths;

export const allWorkcellPaths = () =>
  Object.fromEntries(Object.entries(workcellPaths).map(([name, get]) => [name, get()])) as Record<
    WorkcellPathName,
    string
  >;
