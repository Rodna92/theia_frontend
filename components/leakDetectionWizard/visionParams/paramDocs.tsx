import type { ReactNode } from 'react';

// Extended documentation for individual parameters, shown in an expandable panel under the
// row. Keyed by parameter name. Content is English-only for now.

interface ParamDoc {
  summary: string;
  body: ReactNode;
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="px-1 py-px rounded bg-slate-200/70 dark:bg-slate-800 font-mono text-[11px]">{children}</code>
);

export const PARAM_DOCS: Record<string, ParamDoc> = {
  enable_debug_streams: {
    summary: 'Debug image topics for remote viewing',
    body: (
      <>
        <p>This is the main switch for the debug ROS image topics:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            <Code>color_frame_topic</Code> (<Code>/vision/debug/color_frame</Code>)
          </li>
          <li>
            <Code>segmentation_topic</Code> (<Code>/vision/debug/segmentation_mask</Code>)
          </li>
          <li>
            <Code>overlay_topic</Code> (<Code>/vision/debug/segmentation_overlay</Code>)
          </li>
        </ul>
        <p>
          There are two conditions for publishing: this switch must be on, and something must be subscribed (RViz,
          rqt_image_view, etc.). For example, the color frame publishes only under both conditions. With no subscribers
          it costs almost nothing. Setting it to <Code>false</Code> turns the topics off completely, even when someone
          subscribes.
        </p>
      </>
    ),
  },
  visualize: {
    summary: 'Local OpenCV window',
    body: (
      <>
        <p>
          When on, the node opens a <Code>cv::imshow(&quot;aldm_vision overlay&quot;, ...)</Code> window on the machine
          running it. The window shows the segmentation overlay plus a badge with the current mode.
        </p>
        <p className="font-semibold">It has side effects you should know about:</p>
        <ul className="list-disc pl-5 space-y-0.5">
          <li>
            It forces segmentation to run in every mode, not just Idle/Approaching/Tracking/EnteringScene. That means
            continuous inference cost.
          </li>
          <li>
            It forces the overlay to be built even with no topic subscribers, as long as{' '}
            <Code>enable_debug_streams</Code> is also on.
          </li>
          <li>
            It needs a display. In Docker/headless setups it crashes with{' '}
            <Code>Can&apos;t initialize GTK backend</Code>.
          </li>
        </ul>
        <p>
          The launch argument overrides the YAML value:{' '}
          <Code>ros2 launch ev3d_vision vision_node.launch.py visualize:=false</Code>, or{' '}
          <Code>./start_vision_x86win.sh --no-visualize</Code>.
        </p>
      </>
    ),
  },
};
