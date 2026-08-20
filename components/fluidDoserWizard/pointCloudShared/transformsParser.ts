import * as THREE from 'three';

interface TransformSection {
  name: string;
  lines: string[];
}

function splitSections(text: string): TransformSection[] {
  const lines = text.split(/\r\n|\r|\n/);
  const sections: TransformSection[] = [];
  let current: TransformSection | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const headerMatch = line.match(/^==\s*(.+?)\s*==$/);
    if (headerMatch) {
      current = { name: headerMatch[1], lines: [] };
      sections.push(current);
    } else if (current && line.length > 0) {
      current.lines.push(line);
    }
  }

  return sections;
}

function parseMatrixFromLines(lines: string[]): THREE.Matrix4 | null {
  const matrixLines = lines[0]?.startsWith('fitness=') ? lines.slice(1) : lines;
  if (matrixLines.length < 4) return null;

  const rows: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const values = matrixLines[i].split(/\s+/).filter(Boolean).map(Number);
    if (values.length !== 4 || values.some((v) => Number.isNaN(v))) return null;
    rows.push(values);
  }

  const matrix = new THREE.Matrix4();
  // Matrix4.set takes arguments in row-major order, matching the [R|t; 0 0 0 1]
  // homogeneous transform rows as they appear in the file.
  matrix.set(
    rows[0][0], rows[0][1], rows[0][2], rows[0][3],
    rows[1][0], rows[1][1], rows[1][2], rows[1][3],
    rows[2][0], rows[2][1], rows[2][2], rows[2][3],
    rows[3][0], rows[3][1], rows[3][2], rows[3][3]
  );
  return matrix;
}

/**
 * Parses the pose that produced 05_fine_ref_aligned.ply — the reference cloud's
 * own origin, distinct from the scene's world axes — out of transforms.txt.
 * Uses the mirrored fine-ICP matrix instead if the mirror check was chosen.
 * Returns null if the file doesn't match the expected structure rather than
 * guessing at a placement.
 */
export function parseFineAlignedPose(transformsText: string | null): THREE.Matrix4 | null {
  if (!transformsText) return null;

  try {
    const sections = splitSections(transformsText);

    const chosenMatch = transformsText.match(/chosen=(\S+)/);
    const useMirror = chosenMatch?.[1]?.trim().toLowerCase() === 'mirror';

    const target = useMirror
      ? sections.find((s) => s.name.startsWith('fine ICP_mirror'))
      : sections.find((s) => s.name.startsWith('fine ICP') && !s.name.startsWith('fine ICP_mirror'));

    if (!target) return null;

    return parseMatrixFromLines(target.lines);
  } catch {
    return null;
  }
}

export interface ParsedTransform {
  fitness: number;
  rmse: number;
  matrix: THREE.Matrix4;
}

/**
 * Parses the "== final accepted pose (camera_T_object) ==" section — the
 * TSDF/local-ICP multi-target pipeline's (pose_debug/<target>/frame_NNNNNN/...)
 * published pose for the frame, in the camera frame. This is what
 * 04_final_pose_ref_aligned_camera.ply was transformed by.
 *
 * transforms.txt for this pipeline also carries "TSDF integration extrinsic
 * (camera_T_object)" (no fitness/rmse — the object-local-to-camera extrinsic
 * used when integrating into the TSDF) and "local ICP (TSDF surface)" (the
 * pose 03_local_icp_ref_aligned.ply was transformed by, in the object-local
 * frame) — neither is parsed here since nothing currently needs them.
 */
export function parseTsdfTransform(transformsText: string | null): ParsedTransform | null {
  if (!transformsText) return null;

  try {
    const section = splitSections(transformsText).find((s) =>
      s.name.toLowerCase().includes('final accepted pose')
    );
    if (!section) return null;

    const matrix = parseMatrixFromLines(section.lines);
    if (!matrix) return null;

    const header = section.lines[0] ?? '';
    const fitness = Number(header.match(/fitness=(\S+)/)?.[1]);
    const rmse = Number(header.match(/rmse=(\S+)/)?.[1]);
    if (Number.isNaN(fitness) || Number.isNaN(rmse)) return null;

    return { fitness, rmse, matrix };
  } catch {
    return null;
  }
}

export interface ParsedVerdict {
  mode: string;
  bestFitness: number;
  minFitness: number;
  result: string;
}

/**
 * Parses the "== verdict ==" section written at the end of transforms.txt,
 * e.g. "mode=APPROACHING best_fitness=0.839149 min_fitness=0.4 result=ACCEPTED".
 */
export function parseVerdict(transformsText: string | null): ParsedVerdict | null {
  if (!transformsText) return null;

  try {
    const section = splitSections(transformsText).find((s) => s.name === 'verdict');
    const line = section?.lines.join(' ') ?? transformsText;

    const mode = line.match(/mode=(\S+)/)?.[1];
    const bestFitness = line.match(/best_fitness=(\S+)/)?.[1];
    const minFitness = line.match(/min_fitness=(\S+)/)?.[1];
    const result = line.match(/result=(\S+)/)?.[1];

    if (!mode || !bestFitness || !minFitness || !result) return null;

    const bestFitnessNum = Number(bestFitness);
    const minFitnessNum = Number(minFitness);
    if (Number.isNaN(bestFitnessNum) || Number.isNaN(minFitnessNum)) return null;

    return { mode, bestFitness: bestFitnessNum, minFitness: minFitnessNum, result };
  } catch {
    return null;
  }
}
