// Groups vision_params.yaml keys into related sections. Matching is first-match-wins in
// MATCH_ORDER (so more specific prefixes come first); display follows SECTIONS order.
// Keys that match nothing land in 'other', so new parameters are never hidden.

export type SectionId =
  | 'frames'
  | 'camera'
  | 'mode'
  | 'segmentation'
  | 'aristonDetection'
  | 'aristonPose'
  | 'aristonTsdf'
  | 'aristonTracking'
  | 'groupGeometry'
  | 'groupRegistration'
  | 'scenePlane'
  | 'sceneCorrection'
  | 'approachEkf'
  | 'trackingEkf'
  | 'poseEstimation'
  | 'other';

type Rule = [SectionId, RegExp];

const MATCH_ORDER: Rule[] = [
  ['frames', /^(base_frame|camera_frame|target_frame|target_name|target_pose_topic|status_topic|publish_debug_tf)$/],
  ['camera', /^(enable_debug_streams|visualize|camera_.*|color_frame_topic|segmentation_topic|overlay_topic)$/],
  ['mode', /^(theia_mode|n_hansen|n_targets|scenery|initial_mode)$/],
  ['segmentation', /^(nn_|yolo_|unet_|fpn_)/],
  ['trackingEkf', /^ariston_a_tracking_ekf_/],
  ['approachEkf', /^ariston_a_ekf_/],
  ['sceneCorrection', /^ariston_a_scene_entry_correction_/],
  ['scenePlane', /^ariston_a_(scene_plane_|.*composition_refresh)/],
  ['groupGeometry', /^ariston_a_(target_group_anchor|target_offset_|group_extra_member_)/],
  ['groupRegistration', /^ariston_a_(group_|estimator_reseed|reference_icp_|approach_pose_on_target)/],
  ['aristonTsdf', /^ariston_a_tsdf_/],
  ['aristonTracking', /^ariston_a_(tracking_|track_)/],
  ['aristonPose', /^ariston_a_(pose_|reference_clouds$)/],
  ['aristonDetection', /^ariston_a_/],
  ['poseEstimation', /^(hansen_pose_|pose_)/],
];

export const SECTIONS: SectionId[] = [
  'mode',
  'frames',
  'camera',
  'segmentation',
  'poseEstimation',
  'aristonDetection',
  'aristonPose',
  'aristonTsdf',
  'aristonTracking',
  'groupGeometry',
  'groupRegistration',
  'scenePlane',
  'sceneCorrection',
  'approachEkf',
  'trackingEkf',
  'other',
];

export const sectionOf = (key: string): SectionId => MATCH_ORDER.find(([, re]) => re.test(key))?.[0] ?? 'other';

// ALDM sceneries whose parameters share a key prefix. Their sections are listed under the
// scenery name, since vision_node only reads them when theia_mode=ALDM and `scenery` matches.
// Scenery sections must stay contiguous in SECTIONS.
const SCENERIES: { name: string; prefix: RegExp }[] = [{ name: 'ariston_A', prefix: /^ariston_a_/ }];

export const sceneryOf = (key: string): string | undefined => SCENERIES.find((s) => s.prefix.test(key))?.name;

// Optional nested sub-headings inside a section, in display order. A node lists the params
// its `match` selects, then its children. A param may appear under several nodes when more
// than one pipeline reads it (e.g. YOLO in both Hansen modes); ones matching no node are
// listed first without a heading. Parameters keep their file order within a node.
export type SubgroupId = 'common' | 'hansen' | 'hansenSingle' | 'hansenMulti' | 'yolo' | 'unet' | 'fpn';
export type SubgroupHint = 'hansenSingle' | 'hansenMulti' | 'yoloShared' | 'poseCommon' | 'hansenPose';
// Longer background text shown in a hover card from a ? icon on the heading.
export type SubgroupInfo = 'hansen';

interface SubgroupNode {
  id: SubgroupId;
  match?: RegExp;
  hint?: SubgroupHint;
  info?: SubgroupInfo;
  // Heading can be folded to hide everything under it.
  collapsible?: boolean;
  children?: SubgroupNode[];
}

// Mirrors ev3d_vision's pipelines: ArcmMonoHansenPipeline picks UNet/FPN/YOLO via nn_model;
// ArcmMultiHansenPipeline and AldmMultiTargetPipeline (multihansen) are YOLO-only and also
// read yolo_nms_threshold. nn_max_fps throttles every pipeline.
const SUBGROUPS: Partial<Record<SectionId, SubgroupNode[]>> = {
  segmentation: [
    { id: 'common', match: /^nn_max_fps$/ },
    {
      id: 'hansen',
      info: 'hansen',
      children: [
        {
          id: 'hansenSingle',
          match: /^nn_model$/,
          hint: 'hansenSingle',
          collapsible: true,
          children: [
            { id: 'unet', match: /^unet_/, collapsible: true },
            { id: 'fpn', match: /^fpn_/, collapsible: true },
            { id: 'yolo', match: /^yolo_(?!nms_)/, hint: 'yoloShared', collapsible: true },
          ],
        },
        {
          id: 'hansenMulti',
          hint: 'hansenMulti',
          collapsible: true,
          children: [{ id: 'yolo', match: /^yolo_/, hint: 'yoloShared', collapsible: true }],
        },
      ],
    },
  ],
  // hansen_pose_* feed the Hansen PoseEstimator in every Hansen pipeline (single, multiple and
  // ALDM multihansen); pose_* are read by every pipeline, ariston_A included.
  poseEstimation: [
    { id: 'common', match: /^pose_/, hint: 'poseCommon' },
    { id: 'hansen', match: /^hansen_pose_/, hint: 'hansenPose', info: 'hansen' },
  ],
};

export interface SubgroupBlock<T> {
  path: string;
  id?: SubgroupId;
  hint?: SubgroupHint;
  info?: SubgroupInfo;
  collapsible?: boolean;
  depth: number;
  // Distinct params in this node and its descendants.
  total: number;
  subtreeKeys: string[];
  params: T[];
}

export function subgroupsOf<T extends { key: string }>(section: SectionId, params: T[]): SubgroupBlock<T>[] {
  const roots = SUBGROUPS[section];
  if (!roots) return [{ path: '_', depth: 0, total: params.length, subtreeKeys: params.map((p) => p.key), params }];

  const blocks: SubgroupBlock<T>[] = [];
  const matched = new Set<string>();
  const walk = (node: SubgroupNode, depth: number, parent: string): Set<string> => {
    const path = `${parent}/${node.id}`;
    const own = node.match ? params.filter((p) => node.match!.test(p.key)) : [];
    const block: SubgroupBlock<T> = { path, id: node.id, hint: node.hint, info: node.info, collapsible: node.collapsible, depth, total: 0, subtreeKeys: [], params: own };
    blocks.push(block);
    const keys = new Set(own.map((p) => p.key));
    for (const child of node.children ?? []) walk(child, depth + 1, path).forEach((k) => keys.add(k));
    keys.forEach((k) => matched.add(k));
    block.total = keys.size;
    block.subtreeKeys = [...keys];
    return keys;
  };
  roots.forEach((r) => walk(r, 0, ''));

  const rest = params.filter((p) => !matched.has(p.key));
  return [
    ...(rest.length ? [{ path: '_', depth: 0, total: rest.length, subtreeKeys: rest.map((p) => p.key), params: rest }] : []),
    ...blocks.filter((b) => b.total > 0),
  ];
}
