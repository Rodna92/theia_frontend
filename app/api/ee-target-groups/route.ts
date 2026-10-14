import { promises as fs } from 'fs';
import { NextResponse } from 'next/server';
import { parse } from 'yaml';

export const dynamic = 'force-dynamic';

const DEFAULT_FILE =
  'X:/dev/FT-Theia/FT_Workcell_Vision_ALDM_1.0.3/ev3d_vision/config/vision_params.yaml';

const KEYS = {
  anchor: 'ariston_a_target_group_anchor',
  x: 'ariston_a_target_offset_x_m',
  y: 'ariston_a_target_offset_y_m',
  z: 'ariston_a_target_offset_z_m',
  roll: 'ariston_a_target_offset_roll_deg',
  pitch: 'ariston_a_target_offset_pitch_deg',
  yaw: 'ariston_a_target_offset_yaw_deg',
} as const;

// Finds the first object that holds the group-anchor key (vision_node.ros__parameters).
function findParams(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  const obj = node as Record<string, unknown>;
  if (KEYS.anchor in obj) return obj;
  for (const v of Object.values(obj)) {
    const found = findParams(v);
    if (found) return found;
  }
  return null;
}

const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.map((n) => Number(n) || 0) : [];

// Returns the target-group associations of the vision node, indexed by target_index - 1.
// An empty anchor list means grouping is disabled.
export async function GET() {
  const file = process.env.EE_VISION_PARAMS_FILE || DEFAULT_FILE;
  try {
    const params = findParams(parse(await fs.readFile(file, 'utf8')));
    if (!params) {
      return NextResponse.json({ file, anchor: [], error: `${KEYS.anchor} not found` });
    }
    return NextResponse.json({
      file,
      anchor: nums(params[KEYS.anchor]),
      x: nums(params[KEYS.x]),
      y: nums(params[KEYS.y]),
      z: nums(params[KEYS.z]),
      roll: nums(params[KEYS.roll]),
      pitch: nums(params[KEYS.pitch]),
      yaw: nums(params[KEYS.yaw]),
    });
  } catch (e) {
    return NextResponse.json(
      { file, anchor: [], error: e instanceof Error ? e.message : 'Cannot read vision params' },
      { status: 404 }
    );
  }
}
