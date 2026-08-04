'use client';

import { CSSProperties, ReactNode } from 'react';

interface SetButtonProps {
  onClick?: () => void;
  label: string;
  icon?: ReactNode;
  light: {
    text: string;
    border: string;
    background: string;
    hoverBackground: string;
  };
  dark: {
    text: string;
    border: string;
    background: string;
    hoverBackground: string;
  };
}

export function SetButton({
  onClick,
  label,
  icon,
  light,
  dark,
}: SetButtonProps) {
  const dynamicStyle = {
    // Light Mode Variables
    '--btn-text': light.text,
    '--btn-border': light.border,
    '--btn-bg': light.background,
    '--btn-hover-bg': light.hoverBackground,
    
    // Dark Mode Variables (scoped automatically via media queries or ancestor classes in Tailwind)
    '--dark-btn-text': dark.text,
    '--dark-btn-border': dark.border,
    '--dark-btn-bg': dark.background,
    '--dark-btn-hover-bg': dark.hoverBackground,
  } as CSSProperties;

  return (
    <button
      onClick={onClick}
      style={dynamicStyle}
      className="
        group relative w-full overflow-hidden rounded-xl border
        transition-all duration-300 ease-out
        
        /* Layout: Grid ensures text doesn't jump when icon appears */
        grid grid-cols-[24px_1fr] items-center gap-3 py-4 px-5
        
        /* Light Mode Colors */
        border-[var(--btn-border)]
        bg-[var(--btn-bg)]
        text-[var(--btn-text)]
        
        /* Dark Mode Colors (using Tailwind's dark modifier correctly with vars) */
        dark:border-[var(--dark-btn-border)]
        dark:bg-[var(--dark-btn-bg)]
        dark:text-[var(--dark-btn-text)]

        /* Hover States - handled via the background pseudo-element and direct color changes */
        hover:border-opacity-80
        dark:hover:border-[var(--dark-btn-hover-bg)]
      "
    >
      {/* Creative Background Hover Effect:
         A subtle gradient sheet that slides in/fades in behind the content 
      */}
      <div className="
        absolute inset-0 z-0 opacity-0 transition-opacity duration-300
        bg-[var(--btn-hover-bg)]
        dark:bg-[var(--dark-btn-hover-bg)]
        group-hover:opacity-100
      " />

      {/* Icon Slot: Anchored firmly to the left */}
      <div className="relative z-10 flex h-6 w-6 items-center justify-center overflow-hidden">
        {/* The Icon slides up and in on hover */}
        <span className="
          translate-y-8 opacity-0 transition-all duration-300 
          group-hover:translate-y-0 group-hover:opacity-100
        ">
          {icon}
        </span>
        
        {/* Optional: A dot or placeholder that exists when icon is hidden (optional aesthetic choice)
            Remove this span if you want the space purely empty until hover.
        */}
        <span className="
          absolute h-1.5 w-1.5 rounded-full bg-current opacity-20
          transition-all duration-300
          group-hover:-translate-y-8 group-hover:opacity-0
        " />
      </div>

      {/* Text Slot: Left aligned for perfect stacking */}
      <span className="
        relative z-10 text-left font-medium tracking-wide
        transition-transform duration-300
        group-hover:translate-x-1
      ">
        {label}
      </span>

      {/* Aesthetic Right Chevron (Optional visual cue that this is clickable) */}
      <div className="absolute right-4 z-10 opacity-0 transition-all duration-300 -translate-x-4 group-hover:translate-x-0 group-hover:opacity-40">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 18l6-6-6-6"/>
        </svg>
      </div>
    </button>
  );
}