import { promises as fs } from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { parse } from 'yaml';
import { workcellPaths } from '@/lib/server/workcellPaths';
import { parseUrKinematics, rpyOf, urForwardKinematics } from '@/lib/urKinematics';

export const dynamic = 'force-dynamic';

// The robot's saved HOME waypoint ("ptp.home" in control_node_ptp_params.yaml, written by
// save_home_joints_node.py) and the tool0 pose it gives in base_link, by forward kinematics with
// the robot's kinematics YAML. Read from disk on every request.
const PTP_PARAMS_FILE = 'control_node_ptp_params.yaml';

const isDict = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export async function GET() {
  const paramsFile = path.posix.join(workcellPaths.robotParamsDir(), PTP_PARAMS_FILE);
  const kinematicsFile = workcellPaths.robotKinematicsFile();

  let home: Record<string, unknown>;
  let modified: string;
  try {
    const doc: unknown = parse(await fs.readFile(paramsFile, 'utf8'));
    modified = (await fs.stat(paramsFile)).mtime.toISOString();
    // ROS 2 layout: <node>: { ros__parameters: { ptp: { home: {...} } } }
    const params = isDict(doc)
      ? Object.values(doc).map((n) => (isDict(n) ? n.ros__parameters : null)).find(isDict)
      : null;
    const ptp = params && isDict(params.ptp) ? params.ptp : null;
    if (!ptp || !isDict(ptp.home)) throw new Error(`No ptp.home in ${paramsFile}`);
    home = ptp.home;
  } catch (e) {
    const error = e instanceof Error && e.message.startsWith('No ptp') ? e.message : `Cannot read ${paramsFile}`;
    return NextResponse.json({ error, paramsFile }, { status: 404 });
  }

  const q = home.q_target;
  if (!Array.isArray(q) || q.length !== 6 || !q.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    return NextResponse.json({ error: `ptp.home.q_target missing or invalid in ${paramsFile}`, paramsFile }, { status: 422 });
  }

  const base = {
    q: q as number[],
    targetMode: typeof home.target_mode === 'string' ? home.target_mode : undefined,
    paramsFile,
    modified,
    kinematicsFile,
  };

  // The joints are shown even when the pose cannot be computed.
  try {
    const kin = parseUrKinematics(parse(await fs.readFile(kinematicsFile, 'utf8')));
    const m = urForwardKinematics(kin, base.q);
    return NextResponse.json({
      ...base,
      tool0: {
        frame: 'base_link',
        position: [m[0][3], m[1][3], m[2][3]], // [m]
        rpy: rpyOf(m), // [rad]
      },
    });
  } catch (e) {
    return NextResponse.json({
      ...base,
      tool0Error: `Cannot compute the tool0 pose from ${kinematicsFile}: ${e instanceof Error ? e.message : e}`,
    });
  }
}
