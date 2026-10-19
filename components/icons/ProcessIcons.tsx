import { SVGProps } from 'react';

// Custom process icons drawn on Tabler's 24x24 outline grid, so they mix with @tabler/icons-react
// and accept the same `size` / `stroke` props.
interface ProcessIconProps extends Omit<SVGProps<SVGSVGElement>, 'stroke'> {
  size?: number | string;
  stroke?: number | string;
}

function ProcessIcon({ size = 24, stroke = 1.5, children, ...rest }: ProcessIconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

// Robotic arm with a sniffer probe detecting gas leaking from a piece of equipment
export function IconLeakDetectionArm(props: ProcessIconProps) {
  return (
    <ProcessIcon {...props}>
      {/* Floor and pedestal */}
      <path d="M3 21h7" />
      <path d="M4.5 21v-2a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2" />
      {/* Shoulder, upper arm, elbow, forearm, wrist */}
      <circle cx="6.5" cy="15.5" r="1" />
      <path d="M6.7 14.5l1 -5" />
      <circle cx="8" cy="8" r="1" />
      <path d="M9 8h6.5" />
      <circle cx="16.5" cy="8" r="1" />
      {/* Sniffer probe */}
      <path d="M16.5 9v2" />
      {/* Equipment (unit with fan) */}
      <rect x="12" y="15" width="9" height="6" rx="1" />
      <circle cx="16.5" cy="18" r="1.5" />
      {/* Gas rising towards the probe */}
      <path d="M14.5 13.75c-.5 -.5 .5 -1 0 -1.5" />
      <path d="M18.5 13.75c-.5 -.5 .5 -1 0 -1.5" />
    </ProcessIcon>
  );
}

// Robotic arm plugging a charging coupler into the equipment's port to fill it with fluid
export function IconFluidDoserArm(props: ProcessIconProps) {
  return (
    <ProcessIcon {...props}>
      {/* Floor and pedestal */}
      <path d="M3 21h7" />
      <path d="M4.5 21v-2a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v2" />
      {/* Shoulder, upper arm, elbow, forearm */}
      <circle cx="6.5" cy="15.5" r="1" />
      <path d="M6.7 14.5l1 -5" />
      <circle cx="8" cy="8" r="1" />
      <path d="M9 8h2.5" />
      {/* Charging plug and nozzle */}
      <rect x="11.5" y="6.5" width="2.5" height="3" rx=".5" />
      <path d="M14 8h1.5" />
      {/* Equipment with charging port */}
      <path d="M16.5 4h3.5a1 1 0 0 1 1 1v15a1 1 0 0 1 -1 1h-3.5a1 1 0 0 1 -1 -1v-15a1 1 0 0 1 1 -1z" />
      <path d="M15.5 7v2" />
      {/* Fluid */}
      <path d="M18.25 12.5l-1.3 1.9a1.55 1.55 0 1 0 2.6 0z" />
    </ProcessIcon>
  );
}
