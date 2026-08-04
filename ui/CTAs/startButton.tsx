'use client';

import { IconPlayerPlay } from '@tabler/icons-react';

interface StartButtonProps {
  onClick?: () => void;
  label: string;
}

export function StartButton({ onClick, label }: StartButtonProps) {
  return (
    <button
      onClick={onClick}
      className="
        group relative isolate w-full overflow-hidden rounded-xl
        transition-all duration-300 ease-out
        
        /* Layout: Matches SetButton Grid exactly for perfect alignment */
        grid grid-cols-[24px_1fr] items-center gap-3 py-4 px-5
        
        /* Base Borders & Rings */
        border border-blue-200/50 
        ring-1 ring-blue-500/10
        hover:ring-blue-500/30 hover:border-blue-300/80
        
        /* Text Styling */
        text-left font-bold tracking-wide
        text-slate-800 dark:text-white
        
        /* Active State */
        active:scale-[0.98]
      "
    >
      {/* LAYER 1: Base Gradient 
        Using slightly higher opacity to make it feel 'heavier' than the SetButton 
      */}
      <div
        className="
          absolute inset-0 -z-20
          bg-gradient-to-r from-blue-500/10 via-cyan-400/10 to-green-400/10
          dark:from-blue-600/20 dark:via-cyan-500/20 dark:to-green-500/20
          transition-opacity duration-300
        "
      />

      {/* LAYER 2: Hover Gradient 'Rush'
        Slides in opacity on hover to energize the button
      */}
      <div
        className="
          absolute inset-0 -z-10 opacity-0 transition-opacity duration-500
          bg-gradient-to-r from-blue-500/20 via-cyan-400/20 to-green-400/20
          dark:from-blue-600/40 dark:via-cyan-500/40 dark:to-green-500/40
          group-hover:opacity-100
        "
      />

      {/* LAYER 3: The 'Glow' Shadow 
        A backdrop blur glow that intensifies on hover
      */}
      <div 
        className="
            absolute inset-0 -z-30 opacity-0 transition-opacity duration-300
            shadow-[0_0_40px_-10px_rgba(6,182,212,0.5)]
            group-hover:opacity-100
        " 
      />

      {/* COLUMN 1: The Kinetic Icon 
         Unlike SetButton, this is always visible, but reacts to hover
      */}
      <div className="relative z-10 flex h-6 w-6 items-center justify-center">
        <IconPlayerPlay 
          size={20} 
          className="
            transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
            /* On hover: fill the icon, scale it up, and nudge it right */
            fill-transparent stroke-[2.5px]
            group-hover:fill-current group-hover:scale-110 group-hover:translate-x-1
          "
        />
      </div>

      {/* COLUMN 2: Text 
         Matches SetButton placement exactly
      */}
      <span className="
        relative z-10 
        transition-transform duration-300
        group-hover:translate-x-1
      ">
        {label}
      </span>
      
      {/* Optional: 'Shine' effect that wipes across on hover */}
      <div className="
        absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent
        transition-transform duration-700 ease-in-out
        group-hover:translate-x-full z-20 pointer-events-none
      " />
    </button>
  );
}