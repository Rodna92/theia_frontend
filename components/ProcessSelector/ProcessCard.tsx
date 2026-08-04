'use client';

import Link from 'next/link';
import { ReactNode } from 'react';

interface ProcessCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  href?: string;
  disabled?: boolean;
  badge?: string;
}

export function ProcessCard({
  title,
  description,
  icon,
  href,
  disabled = false,
  badge,
}: ProcessCardProps) {
  const content = (
    <div
      className={`relative group h-full rounded-2xl border backdrop-blur transition-all duration-300 ${
        disabled
          ? 'bg-slate-100/50 border-slate-300/30 dark:bg-slate-900/30 dark:border-white/5 cursor-not-allowed opacity-60'
          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50 hover:shadow-lg hover:shadow-cyan-300/10 dark:bg-slate-900/60 dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-slate-900/80 dark:hover:shadow-cyan-500/10'
      }`}
    >
      {badge && (
        <div className="absolute top-4 right-4">
          <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
            {badge}
          </span>
        </div>
      )}

      <div className="p-8 flex flex-col h-full">
        {icon && (
          <div className="mb-6 text-3xl text-cyan-600 dark:text-cyan-400 opacity-80 group-hover:opacity-100 transition-opacity">
            {icon}
          </div>
        )}

        <h3 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">{title}</h3>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 flex-grow">{description}</p>

        {!disabled && href && (
          <button className="mt-auto w-full py-2.5 px-4 rounded-lg bg-gradient-to-r from-cyan-600/20 to-blue-600/20 border border-cyan-600/30 text-cyan-700 font-medium hover:from-cyan-600/30 hover:to-blue-600/30 hover:border-cyan-600/50 dark:from-cyan-500/20 dark:to-blue-500/20 dark:border-cyan-500/30 dark:text-cyan-300 dark:hover:from-cyan-500/30 dark:hover:to-blue-500/30 dark:hover:border-cyan-500/50 transition-all duration-200">
            Open
          </button>
        )}

        {disabled && (
          <button
            disabled
            className="mt-auto w-full py-2.5 px-4 rounded-lg bg-slate-200/50 border border-slate-300/30 text-slate-500 font-medium dark:bg-slate-700/20 dark:border-slate-600/30 dark:text-slate-400 cursor-not-allowed"
          >
            Coming Soon
          </button>
        )}
      </div>

      {!disabled && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-600/0 to-blue-600/0 group-hover:from-cyan-600/5 group-hover:to-blue-600/5 dark:from-cyan-500/0 dark:to-blue-500/0 dark:group-hover:from-cyan-500/5 dark:group-hover:to-blue-500/5 pointer-events-none transition-all" />
      )}
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href || '#'} className="block h-full">
      {content}
    </Link>
  );
}
