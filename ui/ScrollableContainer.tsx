'use client';

import { ReactNode } from 'react';

interface ScrollableContainerProps {
  children: ReactNode;
  className?: string;
}

export function ScrollableContainer({
  children,
  className = '',
}: ScrollableContainerProps) {
  return (
    <div
      className={`overflow-y-auto ${className}`}
      style={{
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(148, 163, 184, 0.4) transparent',
      }}
    >
      <style>{`
        [class*="scrollable-container"]::-webkit-scrollbar {
          width: 6px;
        }
        
        [class*="scrollable-container"]::-webkit-scrollbar-track {
          background: transparent;
        }
        
        [class*="scrollable-container"]::-webkit-scrollbar-thumb {
          background: rgba(148, 163, 184, 0.4);
          border-radius: 3px;
          transition: background-color 0.2s ease;
        }
        
        [class*="scrollable-container"]::-webkit-scrollbar-thumb:hover {
          background: rgba(148, 163, 184, 0.6);
        }
        
        [class*="scrollable-container"]::-webkit-scrollbar-thumb:active {
          background: rgba(148, 163, 184, 0.8);
        }
        
        @media (prefers-color-scheme: dark) {
          [class*="scrollable-container"] {
            scrollbar-color: rgba(100, 116, 139, 0.4) transparent;
          }
          
          [class*="scrollable-container"]::-webkit-scrollbar-thumb {
            background: rgba(100, 116, 139, 0.4);
          }
          
          [class*="scrollable-container"]::-webkit-scrollbar-thumb:hover {
            background: rgba(100, 116, 139, 0.6);
          }
          
          [class*="scrollable-container"]::-webkit-scrollbar-thumb:active {
            background: rgba(100, 116, 139, 0.8);
          }
        }
      `}</style>
      <div className="scrollable-container">{children}</div>
    </div>
  );
}
