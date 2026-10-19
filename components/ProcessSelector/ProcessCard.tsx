'use client';

import Link from 'next/link';
import { ReactNode } from 'react';
import { IconChevronRight } from '@tabler/icons-react';

interface ProcessCardProps {
  title: string;
  description: string;
  icon?: ReactNode;
  href?: string;
  disabled?: boolean;
  badge?: string;
}

const badgeClass =
  'inline-block px-2 py-0.5 lg:px-3 lg:py-1 rounded-full text-[10px]/4 xs:text-[11px]/4 lg:text-xs/4 3xl:text-sm/5 font-semibold uppercase tracking-wide bg-slate-100 text-slate-600 border border-slate-200 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30';

// Phones/tablets: compact horizontal row (whole card is the tap target).
// Desktop (lg+): vertical card with an explicit "Open" call to action.
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
          : 'bg-white border-slate-200 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_8px_24px_-12px_rgba(15,23,42,0.10)] hover:border-cyan-600/40 hover:shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_40px_-12px_rgba(15,23,42,0.18)] lg:hover:-translate-y-1 dark:shadow-none dark:bg-slate-900/60 dark:border-white/10 dark:hover:border-cyan-500/40 dark:hover:bg-slate-900/80 dark:hover:shadow-cyan-500/10'
      }`}
    >
      {badge && (
        <div className="absolute hidden lg:block top-4 right-4 3xl:top-5 3xl:right-5">
          <span className={badgeClass}>{badge}</span>
        </div>
      )}

      <div className="flex h-full items-center gap-3 p-3.5 xs:gap-4 xs:p-5 phone-short:gap-3 phone-short:p-3.5 sm:gap-5 sm:p-6 lg:flex-col lg:items-stretch lg:gap-0 lg:p-8 2xl:p-9 3xl:p-11">
        {icon && (
          <div className="flex shrink-0 items-center justify-center w-10 h-10 xs:w-12 xs:h-12 phone-short:w-10 phone-short:h-10 sm:w-14 sm:h-14 lg:w-14 lg:h-14 3xl:w-16 3xl:h-16 lg:mb-[3vh] rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-700 dark:bg-cyan-500/10 dark:border-cyan-500/25 dark:text-cyan-400 group-hover:border-cyan-600/30 dark:group-hover:bg-cyan-500/15 dark:group-hover:border-cyan-500/40 transition-colors [&>svg]:w-6 [&>svg]:h-6 sm:[&>svg]:w-7 sm:[&>svg]:h-7 lg:[&>svg]:w-8 lg:[&>svg]:h-8 3xl:[&>svg]:w-9 3xl:[&>svg]:h-9">
            {icon}
          </div>
        )}

        <div className="min-w-0 flex-1 lg:flex lg:flex-col">
          <h3 className="text-[15px] xs:text-lg/snug sm:text-xl/snug 3xl:text-2xl/snug font-semibold leading-snug text-slate-900 dark:text-white lg:mb-2">
            {title}
            {/* Phones/tablets: badge flows inline after the title so it never overlaps text or the chevron */}
            {badge && (
              <span className={`${badgeClass} ml-2 align-middle -translate-y-px lg:hidden`}>{badge}</span>
            )}
          </h3>
          <p className="mt-1 lg:mt-0 text-sm 3xl:text-base leading-relaxed text-slate-600 dark:text-slate-300 line-clamp-1 xs:line-clamp-2 phone-short:line-clamp-1 sm:line-clamp-none lg:mb-[3vh] lg:flex-grow">
            {description}
          </p>

          {!disabled && href && (
            <span className="hidden lg:flex mt-auto w-full justify-center py-2.5 3xl:py-3 px-4 rounded-lg bg-gradient-to-r from-slate-50 to-slate-50 border border-slate-200 text-slate-700 font-medium 3xl:text-lg group-hover:from-cyan-600 group-hover:to-blue-700 group-hover:border-transparent group-hover:text-white dark:from-cyan-500/20 dark:to-blue-500/20 dark:border-cyan-500/30 dark:text-cyan-300 dark:group-hover:from-cyan-500/30 dark:group-hover:to-blue-500/30 dark:group-hover:border-cyan-500/50 dark:group-hover:text-cyan-300 transition-all duration-200">
              Open
            </span>
          )}

          {disabled && (
            <span className="hidden lg:flex mt-auto w-full justify-center py-2.5 3xl:py-3 px-4 rounded-lg bg-slate-200/50 border border-slate-300/30 text-slate-500 font-medium dark:bg-slate-700/20 dark:border-slate-600/30 dark:text-slate-400">
              Coming Soon
            </span>
          )}
        </div>

        {/* Row affordance on phones/tablets */}
        {!disabled && (
          <IconChevronRight
            size={22}
            className="shrink-0 text-slate-400 group-hover:text-cyan-600 dark:group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all lg:hidden"
          />
        )}
      </div>

      {!disabled && (
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-cyan-600/0 to-blue-600/0 dark:from-cyan-500/0 dark:to-blue-500/0 dark:group-hover:from-cyan-500/5 dark:group-hover:to-blue-500/5 pointer-events-none transition-all" />
      )}
    </div>
  );

  if (disabled) {
    return content;
  }

  return (
    <Link href={href || '#'} className="block h-full rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600">
      {content}
    </Link>
  );
}
