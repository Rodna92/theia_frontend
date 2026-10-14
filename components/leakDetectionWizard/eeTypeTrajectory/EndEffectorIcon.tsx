interface EndEffectorIconProps {
  size?: number;
  className?: string;
}

// Robotic end-effector: wrist flange, tool body and two gripper fingers.
export function EndEffectorIcon({ size = 24, className }: EndEffectorIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M12 2v3" />
      <rect x="6" y="5" width="12" height="5" rx="1.5" />
      <path d="M8 10v6l1.5 2.5V21" />
      <path d="M16 10v6l-1.5 2.5V21" />
      <path d="M9.5 21h-2M14.5 21h2" />
    </svg>
  );
}
